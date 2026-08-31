#!/usr/bin/env node
// Read the rest of the worked list, fifty at a time, without anybody sitting
// there.
//
//   node scripts/hoursback/read-the-rest.js
//   node scripts/hoursback/read-the-rest.js --size=50 --rounds=8 --deadline=3
//
// Russ, 2026-08-30, asked to keep going rather than stop after each fifty. The
// fifty stays — it is the unit of work, and it is what makes a bad round cost
// fifty sites instead of the whole list. What changes is that nobody has to
// press go between rounds.
//
// THE CEILINGS ARE IN CODE, BEFORE THE FIRST ROUND RUNS. A loop that retries
// without a ceiling has cost real money before, so there is a wall-clock
// deadline, a cap on rounds, and a rule that two rounds in a row reading
// nothing ends it. None of them can be argued with at two in the morning.
//
// HOW IT KNOWS A ROUND WORKED. It counts what is left ON THE RECORDS before and
// after every round. It does not ask the reader how it did. Three separate
// nights were reported as successes by a reader that had read everything
// correctly and then thrown the results away, because the check asked the
// reader instead of the database.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');

process.chdir(path.resolve(__dirname, '../..'));

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : d;
};

const SIZE = Number(arg('size', 50));
const MOST_ROUNDS = Number(arg('rounds', 8));
const DEADLINE_HOURS = Number(arg('deadline', 3));
const REVIEW_PILE = process.argv.includes('--review');
const UNREAD_TRADES = process.argv.includes('--unread-trades');

const LOG = 'tmp-read-the-rest.log';
const started = Date.now();

function say(line) {
  const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const text = `${stamp}  ${line}`;
  console.log(text);
  fs.appendFileSync(LOG, `${text}\n`);
}

// WHAT IS LEFT, COUNTED OFF THE RECORDS.
//
// A business counts as still to read when it has an address on the web and
// nothing has ever been written down about what it does. This has to match how
// the reader itself picks businesses or the numbers drift apart and the loop
// either stops early or never stops.
function stillToRead(db) {
  const hasASite = { OR: [{ NOT: { website: null } }, { NOT: { websiteManualValue: null } }] };
  return db.prospect.count({
    where: {
      ...hasASite,
      theirWork: null,
      doNotContact: false,
      ...(REVIEW_PILE || UNREAD_TRADES ? { stage: 'NEEDS_REVIEW' } : { stage: { not: 'NEEDS_REVIEW' } }),
    },
  });
}

function runOneRound() {
  return new Promise((resolve) => {
    const out = 'tmp-understand-run.txt';
    const fd = fs.openSync(out, 'w');
    const extra = [];
    if (REVIEW_PILE) extra.push('--review');
    if (UNREAD_TRADES) extra.push('--unread-trades');
    const child = spawn('node', [
      'scripts/hoursback/understand-businesses.js',
      `--limit=${SIZE}`, '--lanes=4', '--fresh=14', ...extra,
    ], { stdio: ['ignore', fd, fd] });

    // NOTHING RUNS FOREVER. Fifty sites take about eleven minutes at the rate
    // this reader actually manages. Forty is a stall, not slowness — and a
    // stalled round that is never killed is a night lost.
    const killAt = setTimeout(() => {
      say('This round stopped answering. Ending it and moving on.');
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, 40 * 60000);

    child.on('exit', (code) => {
      clearTimeout(killAt);
      fs.closeSync(fd);
      resolve({ code });
    });
  });
}

(async () => {
  fs.writeFileSync(LOG, '');
  const db = new PrismaClient();

  // WAIT FOR ANYTHING ALREADY READING. Two readers at once overloaded the
  // machine one night and both got slower. Only ever one.
  for (let i = 0; i < 120; i += 1) {
    const busy = await new Promise((r) => {
      const c = spawn('pgrep', ['-f', 'understand-businesses.js']);
      let seen = false;
      c.stdout.on('data', () => { seen = true; });
      c.on('exit', () => r(seen));
    });
    if (!busy) break;
    if (i === 0) say('Something is already reading. Waiting for it to finish before starting.');
    await new Promise((r) => setTimeout(r, 30000));
  }

  let before = await stillToRead(db);
  const atTheStart = before;
  say(`${before} businesses still to read. Going ${SIZE} at a time, at most ${MOST_ROUNDS} rounds, `
    + `giving up after ${DEADLINE_HOURS} hours.`);

  let nothingRead = 0;

  for (let round = 1; round <= MOST_ROUNDS; round += 1) {
    if (before === 0) { say('Nothing left to read.'); break; }

    const hoursGone = (Date.now() - started) / 3600000;
    if (hoursGone >= DEADLINE_HOURS) {
      say(`Out of time after ${hoursGone.toFixed(1)} hours. Stopping — everything read is saved.`);
      break;
    }

    say(`Round ${round}: reading the next ${Math.min(SIZE, before)}.`);
    await runOneRound();

    const after = await stillToRead(db);
    const done = before - after;

    if (done > 0) {
      nothingRead = 0;
      say(`Round ${round}: ${done} read and saved. ${after} left.`);
    } else {
      nothingRead += 1;
      say(`Round ${round}: NOTHING was saved. ${after} still left. `
        + `${nothingRead === 1 ? 'Trying once more.' : 'That is twice — stopping.'}`);
      if (nothingRead >= 2) break;
    }

    before = after;
  }

  const left = await stillToRead(db);
  const hours = ((Date.now() - started) / 3600000).toFixed(1);
  say(`Finished. ${atTheStart - left} read in ${hours} hours. ${left} still to read.`);
  say('Everything read is already saved. Nothing is waiting to be written.');
  await db.$disconnect();
})().catch((e) => { say(`failed: ${e.message}`); process.exit(1); });
