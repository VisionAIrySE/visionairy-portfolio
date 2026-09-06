// One copy of a model job, ever.
//
//   node --test tests/hoursback/only-one-copy.test.js
//
// NO network, NO model calls, NO database, and nothing here can start a real
// process. Every "running" process below is a made-up number.
//
// What this proves is the thing that cooked the laptop on 2026-09-05: three
// copies of the letter writer, thirteen model processes on a four-core
// machine. The guard must REFUSE, not warn, and it must give the machine back
// when the job ends so the next one is not locked out forever.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

const { claimTheMachine, howManyAtOnce, lockPath } = require('../../src/hoursback/onlyOneCopy.js');

const JOB = 'test-only-one-copy';
const clearLock = () => { try { fs.unlinkSync(lockPath(JOB)); } catch { /* not there */ } };

test('a second copy is refused while the first is alive', () => {
  clearLock();
  const release = claimTheMachine(JOB, { pid: process.pid, label: 'writing letters' });
  try {
    assert.throws(
      () => claimTheMachine(JOB, { pid: process.pid + 1, label: 'reading websites' }),
      (err) => {
        assert.strictEqual(err.code, 'ALREADY_RUNNING');
        // The message must name what is already going and how to stop it,
        // because the person reading it is not going to go digging.
        assert.match(err.message, /writing letters/);
        assert.match(err.message, new RegExp(`kill ${process.pid}`));
        return true;
      },
    );
  } finally { release(); clearLock(); }
});

test('the machine is given back when the job ends, so the next one may start', () => {
  clearLock();
  const release = claimTheMachine(JOB, { pid: process.pid });
  release();
  assert.strictEqual(fs.existsSync(lockPath(JOB)), false);
  // And the next one really can take it.
  const second = claimTheMachine(JOB, { pid: process.pid });
  second(); clearLock();
});

test('a lock left behind by a dead job does not block the next one', () => {
  clearLock();
  // 2**22 is above every real pid on Linux, so nothing is running there.
  fs.writeFileSync(lockPath(JOB), JSON.stringify({ pid: 4194303, job: JOB, startedAt: Date.now() }));
  const release = claimTheMachine(JOB, { pid: process.pid });
  release(); clearLock();
});

test('giving the machine back twice is harmless', () => {
  clearLock();
  const release = claimTheMachine(JOB, { pid: process.pid });
  release();
  assert.doesNotThrow(release);
  clearLock();
});

test('one job never steals the lock another still holds', () => {
  clearLock();
  const first = claimTheMachine(JOB, { pid: process.pid });
  // A stranger tries and fails; the first job then gives it back cleanly and
  // the file really is gone — it was never overwritten underneath it.
  assert.throws(() => claimTheMachine(JOB, { pid: process.pid + 1 }));
  first();
  assert.strictEqual(fs.existsSync(lockPath(JOB)), false);
  clearLock();
});

test('however many are asked for, the core count is the ceiling', () => {
  // Measured on a four-core laptop: one copy running four at a time sits at a
  // load of ~3.2 with 5 GB free. It was three COPIES that cooked it, which is
  // what the refusal above stops — so the ceiling here is the core count.
  assert.strictEqual(howManyAtOnce(4, 4), 4);
  assert.strictEqual(howManyAtOnce(12, 4), 4);   // asking for more never raises it
  assert.strictEqual(howManyAtOnce(2, 4), 2);    // asking for fewer is honoured
  assert.strictEqual(howManyAtOnce(8, 16), 8);
  assert.strictEqual(howManyAtOnce(1, 1), 1);    // never zero
  assert.strictEqual(howManyAtOnce(0, 4), 1);
});
