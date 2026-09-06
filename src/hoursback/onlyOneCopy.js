'use strict';

// ONE COPY OF A MODEL JOB. EVER.
//
// Three separate times this machine has been cooked by model processes, and
// every time Russ noticed before the code did — he felt it in the keyboard.
// On 2026-09-05 the cause was finally clear: THREE copies of the letter
// writer were running at once, thirteen model processes on a four-core
// laptop, load average nineteen. Each copy was started by hand, minutes
// apart, by someone who did not check whether one was already going.
//
// So this refuses to start. Not a warning — a refusal. A warning is something
// you read afterwards; a refusal is something that cannot be ignored.
//
// It also holds the number of jobs run side by side under what the machine
// actually has. The old ceiling was written against memory, which was never
// the limit. Cores were.

const fs = require('fs');
const os = require('os');
const path = require('path');

const lockPath = (job) => path.join(os.tmpdir(), `hoursback-${job}.lock`);

// Is that process still there? Signal 0 asks without sending anything.
function stillRunning(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code === 'EPERM'; }
}

// What the machine can actually carry. MEASURED, not guessed: one copy of the
// letter writer running four businesses at a time on a four-core laptop sits
// at a load of about 3.2 with 5 GB free — comfortable. What cooked the machine
// on 2026-09-05 was THREE COPIES, not the number inside one of them.
//
// So the ceiling is the core count, and the real protection is the refusal
// above. Halving this would double every run and buy nothing.
function howManyAtOnce(asked, cores = os.cpus().length) {
  const room = Math.max(1, cores);
  return Math.max(1, Math.min(Number(asked) || 1, room));
}

// Take the machine for this job, or refuse. Returns a function that gives it
// back. Throws with a sentence a person can act on.
function claimTheMachine(job, { pid = process.pid, now = Date.now, label = job } = {}) {
  const file = lockPath(job);

  let held = null;
  try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { held = null; }

  if (held && held.pid !== pid && stillRunning(held.pid)) {
    const minutes = Math.round((now() - (held.startedAt || now())) / 60000);
    const err = new Error(
      `Already busy: ${held.label || held.job} started ${minutes} minute${minutes === 1 ? '' : 's'} ago.\n` +
      `Only one model job runs on this machine at a time — two of them cook it.\n` +
      `Stop that one first:  kill ${held.pid}\n` +
      `Then check nothing survived it:  pgrep -fa "claude --model"`,
    );
    err.code = 'ALREADY_RUNNING';
    err.heldBy = held.pid;
    throw err;
  }

  fs.writeFileSync(file, JSON.stringify({ pid, job, label, startedAt: now() }));

  let given = false;
  const giveItBack = () => {
    if (given) return;
    given = true;
    try {
      const still = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (still.pid === pid) fs.unlinkSync(file);
    } catch { /* already gone, or someone else's — leave it */ }
  };

  return giveItBack;
}

module.exports = { claimTheMachine, howManyAtOnce, lockPath, stillRunning };
