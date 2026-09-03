// READERS THAT ARE ALREADY AWAKE (2026-09-03).
//
// Starting a reader from cold was measured at 7.5 seconds for a question with
// nothing in it to think about, and a business asks five to seven questions.
// A couple are kept started and waiting now.
//
// The rule that must survive: every question still gets its OWN reader, and
// that reader is closed afterwards. The steps are deliberately blind to each
// other — the one that finds the work never sees the recurrence check, and
// the stranger who reads the finished sentence must never see the
// instructions it was written under. A shared conversation would destroy
// that, and speed is not worth it.

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { makeReaderPool } = require('../../src/hoursback/readerPool.js');

// A stand-in reader: it records what it was asked and answers when told to.
function fakeReaders() {
  const made = [];
  const spawnReader = () => {
    const child = new EventEmitter();
    child.asked = [];
    child.killed = false;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: (s) => child.asked.push(s), end: () => {} };
    child.kill = () => { child.killed = true; };
    child.answer = (text) => child.stdout.emit('data',
      `${JSON.stringify({ type: 'result', result: text })}\n`);
    made.push(child);
    return child;
  };
  return { spawnReader, made };
}

test('readers are started before a question arrives', () => {
  const { spawnReader, made } = fakeReaders();
  const pool = makeReaderPool({ size: 3, spawnReader });
  assert.equal(made.length, 3, 'three were waiting before anything was asked');
  assert.equal(pool.waiting, 3);
  pool.close();
});

test('each question gets its own reader, and that reader is closed after', async () => {
  const { spawnReader, made } = fakeReaders();
  const pool = makeReaderPool({ size: 2, spawnReader });

  const first = pool.ask('question one');
  const usedFirst = made[0];
  usedFirst.answer('{"a":1}');
  assert.deepEqual((await first).answer, { a: 1 });
  assert.ok(usedFirst.killed, 'the reader was closed once it had answered');

  const second = pool.ask('question two');
  const usedSecond = made.find((c) => c !== usedFirst && c.asked.length);
  assert.ok(usedSecond && usedSecond !== usedFirst, 'a DIFFERENT reader took the second question');
  usedSecond.answer('{"b":2}');
  assert.deepEqual((await second).answer, { b: 2 });

  // and the second reader never saw the first question
  assert.ok(!usedSecond.asked.join(' ').includes('question one'),
    'no reader ever sees a question that was not its own');
  pool.close();
});

test('a reader is replaced the moment one is taken, so the next question waits on nothing', async () => {
  const { spawnReader, made } = fakeReaders();
  const pool = makeReaderPool({ size: 2, spawnReader });
  assert.equal(made.length, 2);
  const p = pool.ask('one');
  assert.equal(made.length, 3, 'a replacement was started at once');
  assert.equal(pool.waiting, 2, 'two are still waiting');
  made[0].answer('{"ok":true}');
  await p;
  pool.close();
});

test('a reader out of allowance stops everything and says so, never looking like a thin site', async () => {
  const { spawnReader, made } = fakeReaders();
  const pool = makeReaderPool({ size: 1, spawnReader });
  const p = pool.ask('anything');
  made[0].answer('I am sorry, you have reached your usage limit. It resets at 4pm.');
  const res = await p;
  assert.equal(res.readerExhausted, true);
  assert.match(res.why, /OUT OF ALLOWANCE/);
  assert.equal(res.answer, null);
  pool.close();
});

test('a reader that never answers is stopped, and says that is what happened', async () => {
  const { spawnReader, made } = fakeReaders();
  const pool = makeReaderPool({ size: 1, spawnReader, hardKillMs: 60 });
  const res = await pool.ask('anything');
  assert.equal(res.answer, null);
  assert.match(res.why, /did not answer inside/);
  assert.ok(made[0].killed, 'it was stopped, not left running');
  pool.close();
});

test('prose in front of the answer is still read properly', async () => {
  const { spawnReader, made } = fakeReaders();
  const pool = makeReaderPool({ size: 1, spawnReader });
  const p = pool.ask('anything');
  made[0].answer('Here you go:\n```json\n{"sentence":"one line"}\n```');
  assert.deepEqual((await p).answer, { sentence: 'one line' });
  pool.close();
});

test('closing the pool stops every reader that was waiting', () => {
  const { spawnReader, made } = fakeReaders();
  const pool = makeReaderPool({ size: 3, spawnReader });
  pool.close();
  assert.ok(made.every((c) => c.killed), 'no reader outlives the run that started it');
  assert.equal(pool.waiting, 0);
});

test('a reader that will not start does not sink the question', async () => {
  let n = 0;
  const spawnReader = () => { n += 1; throw new Error('cannot start'); };
  const pool = makeReaderPool({ size: 2, spawnReader });
  assert.ok(n > 0, 'it tried');
  assert.equal(pool.waiting, 0);
  pool.close();
});
