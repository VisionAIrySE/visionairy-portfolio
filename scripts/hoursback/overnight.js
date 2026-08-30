#!/usr/bin/env node
// Read every website there is to read, overnight, with nobody watching.
//
//   node scripts/hoursback/overnight.js
//   node scripts/hoursback/overnight.js --deadline=8      (give up after 8 hours)
//
// Russ, 2026-08-28, after the fourth stall of the evening: "How do we get
// confident that if we move forward, this is going to execute as planned so we
// have a complete data set in the AM? Still feel like we're moving forward by
// braille."
//
// He is right. Every stall tonight was found and fixed by a person sitting
// there. Left alone, the run would have stopped at whatever it hit at two in
// the morning and he would have woken up to a third of a list.
//
// WHAT ACTUALLY WENT WRONG TONIGHT, and what this does about each:
//
//   A value the saving step needed was never handed to it, and one business
//   killed the whole pass. -> The read now survives any single business, and
//   this restarts it regardless.
//
//   A website carried a character the reader refuses to accept. Same shape:
//   one page, whole pass. -> Same answer.
//
//   The reader got slower as the night went on. Eight questions at once all ran
//   past the waiting limit, every answer was thrown away, and the pass gave up
//   believing the reader was broken. -> When a run gives up that way, this asks
//   FEWER at a time and tries again. Slower is not stopped.
//
//   The machine was overloaded by two passes running at once. -> Only ever one
//   runs here, in order.
//
// WHAT IT WILL NOT DO. It will not run forever and it will not spend forever.
// There is a wall-clock deadline and a cap on attempts, both in the code below
// before anything starts, because a loop that retries without a ceiling has
// cost Russ real money before.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

process.chdir(path.resolve(__dirname, '../..'));

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : d;
};

// --- the ceilings, in code, before anything runs ----------------------------
const DEADLINE_HOURS = Number(arg('deadline', 10));
const MOST_ATTEMPTS = Number(arg('attempts', 40));
// HOW MANY TO ASK AT ONCE, and why asking for more does not help.
//
// Measured, 2026-08-28, rather than guessed. Four questions at once come back
// in 41 to 61 seconds each. EIGHT at once come back in 105 to 159 seconds
// each — the reading service hands out a fixed total rate and simply spreads
// it thinner. Four at a time works out at about 4.6 businesses a minute; eight
// at a time about 4.0. More is slower.
//
// So this only ever moves DOWNWARD, when the reader has genuinely stopped
// keeping up. There is no climb, because climbing costs throughput and buys
// nothing. The way to finish sooner is more hours, not more at once.
const LANES_START = Number(arg('lanes', 5));
const LANES_FLOOR = 2;          // below this it is not worth the wall time
const FRESH_HOURS = 14;         // leave alone anything read in this run's night
const BREATHER_MS = 90000;      // let the reader recover before asking again

const LOG = 'tmp-overnight.log';
const started = Date.now();

// Every line here is meant to be read by Russ in the morning, not by a machine.
function say(line) {
  const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const text = `${stamp}  ${line}`;
  console.log(text);
  fs.appendFileSync(LOG, `${text}\n`);
}

// The two piles, in the order they matter. His worked list first, always —
// the screened-out pile is a bonus and must never delay the list he opens.
const STAGES = [
  { name: 'your list', extra: [] },
  { name: 'the screened-out pile', extra: ['--review'] },
];

function runOnce(stage, lanes) {
  return new Promise((resolve) => {
    const out = `tmp-understand-run.txt`;
    const fd = fs.openSync(out, 'w');
    const child = spawn('node', [
      'scripts/hoursback/understand-businesses.js',
      `--lanes=${lanes}`, `--fresh=${FRESH_HOURS}`, ...stage.extra,
    ], { stdio: ['ignore', fd, fd] });

    child.on('exit', (code) => {
      fs.closeSync(fd);
      const text = fs.readFileSync(out, 'utf8').replace(/\r/g, '\n');
      const toRead = Number((text.match(/^(\d+) businesses with a website to read/m) || [])[1]);
      resolve({
        code,
        toRead: Number.isFinite(toRead) ? toRead : null,
        gaveUp: /STOPPED — the reader failed/.test(text),
        crashed: /^failed:/m.test(text),
        read: Number((text.match(/read properly:\s+(\d+)/) || [])[1] || 0),
        broke: Number((text.match(/something broke on:\s+(\d+)/) || [])[1] || 0),
        why: (text.match(/^failed: (.*)$/m) || [])[1] || null,
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.writeFileSync(LOG, '');
  say(`Starting. Deadline ${DEADLINE_HOURS} hours, at most ${MOST_ATTEMPTS} goes.`);

  let attempts = 0;
  let totalRead = 0;

  for (const stage of STAGES) {
    let lanes = LANES_START;
    let stuck = 0;                       // goes with no progress at all

    for (;;) {
      const hoursGone = (Date.now() - started) / 3600000;
      if (hoursGone >= DEADLINE_HOURS) {
        say(`Out of time after ${hoursGone.toFixed(1)} hours. Stopping here — everything read is saved.`);
        return finish(totalRead);
      }
      if (attempts >= MOST_ATTEMPTS) {
        say(`Reached ${MOST_ATTEMPTS} goes. Stopping — everything read is saved.`);
        return finish(totalRead);
      }

      attempts += 1;
      const r = await runOnce(stage, lanes);

      if (r.toRead === 0) {
        say(`${stage.name}: nothing left to read. Done.`);
        break;
      }

      totalRead += r.read;

      if (r.read > 0) stuck = 0; else stuck += 1;

      if (r.gaveUp) {
        // The reader stopped answering. Almost always it is slow, not broken —
        // so ask fewer at a time rather than concluding anything is wrong.
        const next = Math.max(LANES_FLOOR, lanes - 1);
        say(`${stage.name}: read ${r.read}, then the reader stopped answering. `
          + `Asking ${next} at a time instead of ${lanes}, after a breather.`);
        lanes = next;
        await sleep(BREATHER_MS);
      } else if (r.crashed) {
        say(`${stage.name}: read ${r.read}, then something broke — ${String(r.why).slice(0, 90)}. Carrying on.`);
        await sleep(5000);
      } else if (r.code !== 0) {
        say(`${stage.name}: read ${r.read}, then it ended unexpectedly. Carrying on.`);
        await sleep(5000);
      } else {
        say(`${stage.name}: read ${r.read}${r.broke ? `, ${r.broke} sites had a problem of their own` : ''}. `
          + `That went cleanly. Going again for whatever is left.`);
      }

      if (stuck >= 3) {
        say(`${stage.name}: three goes with nothing read. Leaving this pile and moving on.`);
        break;
      }
    }
  }

  finish(totalRead);
})();

function finish(totalRead) {
  const hours = ((Date.now() - started) / 3600000).toFixed(1);
  say(`Finished. ${totalRead} businesses read across ${hours} hours.`);
  say('Everything read is already saved. Nothing is waiting to be written.');
}
