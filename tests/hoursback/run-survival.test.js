// Surviving the night: the three failures that each used to ruin a long run.
//
//   node --test tests/hoursback/run-survival.test.js
//
// NO network, NO model calls, NO database. The reader is a fake, the fetch is
// a fake serving an in-memory site, the db is a fake that records exactly
// what it was asked to write — because the behaviours proved here are about
// what does NOT get written once the reader dies.
//
//   1. The reader running out of allowance STOPS the run at once — not one
//      more business, nothing further written, a distinct exit code.
//   2. --fresh=N resumes from the DATABASE: the already-done are skipped and
//      the rest are processed, with the numbers printed legible.
//   3. Every ending — finished, reader exhausted, crash — writes one plain
//      line to the status board, last.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const U = require('../../scripts/hoursback/understand-businesses.js');
const W = require('../../scripts/hoursback/write-noticings.js');

const {
  makeReaderGuard, writeLastRun, runUnderstand,
  READER_OUT_MSG, BROKEN_START_MSG, FIRST_CALLS_MUST_ANSWER,
  EXIT_READER_EXHAUSTED, EXIT_BROKEN_START,
} = U;
const { walkTrades, main: noticingMain } = W;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'run-survival-'));
const aBoard = (name) => path.join(scratch, `${name}-last-run.md`);
const aPage = (name) => path.join(scratch, `${name}-review.md`);

// --- fake readers -----------------------------------------------------------

const EXHAUSTED = { answer: null, why: 'THE READER IS OUT OF ALLOWANCE — this is not a thin website', readerExhausted: true };
const NO_ANSWER = { answer: null, why: 'the reader answered with no JSON' };

function fakeReader(script) {
  // script: (callNumber) => result. Counts every call it actually receives.
  const calls = [];
  const fn = async (question) => {
    calls.push(question);
    return script(calls.length);
  };
  fn.calls = calls;
  return fn;
}

// --- fake site + fetch (the shape crawlWholeSite expects) -------------------

function makeFetch(siteMap) {
  const fetched = [];
  const impl = async (url) => {
    const u = new URL(url);
    fetched.push(u.pathname);
    const html = siteMap[u.pathname];
    if (html === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => html };
  };
  impl.fetched = fetched;
  return impl;
}

const A_HOMEPAGE = '<html><head><title>Blue Widget Co</title></head><body>'
  + '<p>Blue Widget Co is a family business making and repairing fine widgets '
  + 'for the whole county. We schedule every job by phone, invoice at the end '
  + 'of each month, and keep our own books week after week, year after year.</p>'
  + '</body></html>';

// --- the guard itself -------------------------------------------------------

test('a healthy answer passes through the guard untouched', async () => {
  const raw = fakeReader(() => ({ answer: { fine: true }, why: null }));
  const guard = makeReaderGuard(raw);
  const res = await guard.ask('q');
  assert.deepEqual(res, { answer: { fine: true }, why: null });
  assert.equal(guard.state.readerOut, false);
  assert.equal(guard.state.brokenStart, false);
});

test('an exhausted reader stops the run at the very call that finds it', async () => {
  const raw = fakeReader(() => EXHAUSTED);
  const guard = makeReaderGuard(raw);
  await assert.rejects(() => guard.ask('q'), (e) => e.readerExhausted && e.stopTheRun);
  assert.equal(guard.state.readerOut, true);
});

test('after exhaustion the guard never calls the reader again', async () => {
  const raw = fakeReader(() => EXHAUSTED);
  const guard = makeReaderGuard(raw);
  await assert.rejects(() => guard.ask('q1'));
  await assert.rejects(() => guard.ask('q2'), (e) => e.readerExhausted);
  await assert.rejects(() => guard.ask('q3'), (e) => e.readerExhausted);
  assert.equal(raw.calls.length, 1, 'one call found the exhaustion; none followed it');
});

test('exhaustion mid-run, after real answers, still stops the run', async () => {
  const raw = fakeReader((n) => (n <= 3 ? { answer: { ok: n }, why: null } : EXHAUSTED));
  const guard = makeReaderGuard(raw);
  for (let i = 0; i < 3; i++) assert.ok((await guard.ask('q')).answer);
  await assert.rejects(() => guard.ask('q'), (e) => e.readerExhausted);
  assert.equal(guard.state.readerOut, true);
});

test(`a run whose first ${FIRST_CALLS_MUST_ANSWER} calls all fail stops as broken`, async () => {
  const raw = fakeReader(() => NO_ANSWER);
  const guard = makeReaderGuard(raw);
  for (let i = 0; i < FIRST_CALLS_MUST_ANSWER - 1; i++) {
    const res = await guard.ask('q');           // failures are still handed back...
    assert.equal(res.answer, null);
  }
  await assert.rejects(() => guard.ask('q'), (e) => e.brokenStart && e.stopTheRun);
  assert.equal(guard.state.brokenStart, true);
  await assert.rejects(() => guard.ask('again'), (e) => e.brokenStart);
  assert.equal(raw.calls.length, FIRST_CALLS_MUST_ANSWER, 'no call after the verdict');
});

test('one answered call, ever, retires the broken-start check for the whole run', async () => {
  const raw = fakeReader((n) => (n === 4 ? { answer: { ok: true }, why: null } : NO_ANSWER));
  const guard = makeReaderGuard(raw);
  for (let i = 0; i < 30; i++) await guard.ask('q');   // 3 fail, 1 answers, 26 fail
  assert.equal(guard.state.brokenStart, false);
  assert.equal(raw.calls.length, 30);
});

// --- the walk (write-noticings) --------------------------------------------

test('a stopTheRun error stops the walk before the next business', async () => {
  const seen = [];
  const doOne = async (p) => {
    seen.push(p.id);
    if (p.id === 'b3') { const e = new Error('stop'); e.stopTheRun = true; e.readerExhausted = true; throw e; }
  };
  const stop = await walkTrades({
    queues: [[{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'b4' }, { id: 'b5' }]],
    atOnce: 3, doOne, onBusinessError: () => assert.fail('a stop is not a business error'),
  });
  assert.deepEqual(seen, ['b1', 'b2', 'b3'], 'b4 and b5 were never started');
  assert.equal(stop.stop, true);
  assert.ok(stop.error.readerExhausted);
});

test('a stop in one trade queue keeps every other queue from continuing', async () => {
  const seen = [];
  const doOne = async (p) => {
    seen.push(p.id);
    if (p.id === 'a2') { const e = new Error('stop'); e.stopTheRun = true; throw e; }
  };
  // ONE worker walks both queues in turn: the stop in queue A must leave
  // queue B untouched.
  const stop = await walkTrades({
    queues: [[{ id: 'a1' }, { id: 'a2' }], [{ id: 'b1' }, { id: 'b2' }]],
    atOnce: 1, doOne, onBusinessError: () => assert.fail('no ordinary errors here'),
  });
  assert.deepEqual(seen, ['a1', 'a2'], 'queue B was never started');
  assert.equal(stop.stop, true);
});

test('an ordinary error on one business never stops the walk', async () => {
  const seen = []; const errors = [];
  const doOne = async (p) => { seen.push(p.id); if (p.id === 'b2') throw new Error('one bad site'); };
  const stop = await walkTrades({
    queues: [[{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }]],
    atOnce: 1, doOne, onBusinessError: (p, e) => errors.push([p.id, e.message]),
  });
  assert.deepEqual(seen, ['b1', 'b2', 'b3']);
  assert.deepEqual(errors, [['b2', 'one bad site']]);
  assert.equal(stop.stop, false);
});

// --- a fake database for the noticing run -----------------------------------

function noticingProspect(id, trade, lastNoticingAt = null) {
  return {
    id, name: `${id} Co`, nameManualValue: null, trade,
    website: 'https://biz.example', websiteManualValue: null,
    email: 'office@biz.example', emailManualValue: null,
    siteStatus: 'READ', repliedAt: null, emailBouncedAt: null, doNotContact: false,
    lastNoticingAt,   // the fake db's own shorthand for "latest noticing finding at"
  };
}

function fakeNoticingDb(prospects) {
  const writes = { readings: [], readingUpdates: [], findings: [] };
  const touched = new Set();   // businesses any per-business work actually reached
  let n = 0;
  const id = (p) => `${p}_${(n += 1)}`;
  const noticedSince = (p, cond) => Boolean(
    p.lastNoticingAt && cond && cond.createdAt && cond.createdAt.gte
    && p.lastNoticingAt >= cond.createdAt.gte,
  );
  const sift = (where = {}) => {
    let rows = prospects;
    if (where.id && where.id.in) rows = rows.filter((p) => where.id.in.includes(p.id));
    if (where.findings && where.findings.none) rows = rows.filter((p) => !noticedSince(p, where.findings.none));
    if (where.findings && where.findings.some) rows = rows.filter((p) => noticedSince(p, where.findings.some));
    return rows;
  };
  return {
    writes, touched,
    prospect: {
      findMany: async ({ where = {}, take } = {}) => (take ? sift(where).slice(0, take) : sift(where)),
      count: async ({ where = {} } = {}) => sift(where).length,
      findUnique: async ({ where }) => prospects.find((p) => p.id === where.id) || null,
    },
    finding: {
      findMany: async () => [],
      create: async ({ data }) => { writes.findings.push(data); return { id: id('f'), createdAt: new Date(), ...data }; },
    },
    reading: {
      create: async ({ data }) => { const row = { id: id('r'), ...data }; writes.readings.push(row); return row; },
      update: async ({ where, data }) => { writes.readingUpdates.push({ id: where.id, ...data }); return { id: where.id, ...data }; },
    },
    readingPage: {
      findMany: async ({ where = {} } = {}) => {
        if (where.reading && where.reading.prospectId) touched.add(where.reading.prospectId);
        return [{
          url: 'https://biz.example/', title: 'Home', sameAs: null, fetchedAt: new Date(),
          text: 'We schedule every job by phone and invoice at the end of each month. '.repeat(12),
        }];
      },
      findFirst: async () => null,
    },
    contact: {
      findFirst: async ({ where = {} } = {}) => { if (where.prospectId) touched.add(where.prospectId); return null; },
      findMany: async ({ where = {} } = {}) => { if (where.prospectId) touched.add(where.prospectId); return []; },
    },
    outreachMessage: { findFirst: async () => null, findMany: async () => [], count: async () => 0 },
    messageTemplate: { findUnique: async () => null },
    $disconnect: async () => {},
  };
}

// --- write-noticings: the whole run, stopped and resumed --------------------

test('write-noticings stops at once when the reader is out, writes nothing, exits 75', async () => {
  const db = fakeNoticingDb([
    noticingProspect('p1', 'plumbing'), noticingProspect('p2', 'plumbing'),
    noticingProspect('p3', 'roofing'), noticingProspect('p4', 'roofing'),
  ]);
  const ask = fakeReader(() => EXHAUSTED);
  const out = await noticingMain({
    db, ask, atOnce: 2, look: false,
    lastRunPath: aBoard('wn-exhausted'), reviewPage: aPage('wn-exhausted'),
  });

  assert.equal(out.code, EXIT_READER_EXHAUSTED);
  assert.equal(out.ending, 'reader_exhausted');
  assert.equal(out.done, 0);
  assert.equal(out.remaining, 4);
  // NOTHING was written to any record — no reading, no finding, for anybody.
  assert.equal(db.writes.readings.length, 0);
  assert.equal(db.writes.findings.length, 0);
  // The businesses behind the stop were never even started.
  assert.ok(!db.touched.has('p2'), 'p2 was never started');
  assert.ok(!db.touched.has('p4'), 'p4 was never started');
  // At most one call per worker found the dead reader; none followed.
  assert.ok(ask.calls.length <= 2, `expected at most 2 calls, saw ${ask.calls.length}`);
  // The run said so where the owner will look.
  const board = fs.readFileSync(aBoard('wn-exhausted'), 'utf8');
  assert.match(board, /write-noticings\.js/);
  assert.match(board, /allowance/);
  assert.match(board, /0 done, 4 left/);
  const page = fs.readFileSync(aPage('wn-exhausted'), 'utf8');
  assert.match(page, /THE RUN STOPPED EARLY/);
});

test('write-noticings stops as broken when its first calls all fail, exits 74', async () => {
  const db = fakeNoticingDb(
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => noticingProspect(id, 'plumbing')),
  );
  const ask = fakeReader(() => NO_ANSWER);
  const out = await noticingMain({
    db, ask, atOnce: 1, look: false,
    lastRunPath: aBoard('wn-broken'), reviewPage: aPage('wn-broken'),
  });

  assert.equal(out.code, EXIT_BROKEN_START);
  assert.equal(out.ending, 'broken_start');
  assert.equal(ask.calls.length, FIRST_CALLS_MUST_ANSWER, 'stopped at the verdict, not after');
  // The businesses before the verdict were recorded honestly as could-not-tell.
  assert.equal(out.done, FIRST_CALLS_MUST_ANSWER - 1);
  assert.equal(db.writes.readings.length, FIRST_CALLS_MUST_ANSWER - 1);
  // The business the verdict landed on, and everything behind it, got nothing.
  assert.ok(!db.touched.has('p6'), 'p6 was never started');
  const forP5 = db.writes.readings.filter((r) => r.prospectId === 'p5');
  assert.equal(forP5.length, 0, 'the cut-off business has no record');
  const board = fs.readFileSync(aBoard('wn-broken'), 'utf8');
  assert.match(board, /first calls all failed/);
});

test('write-noticings --fresh skips the already-noticed and processes the rest', async () => {
  const anHourAgo = new Date(Date.now() - 3600000);
  const db = fakeNoticingDb([
    noticingProspect('done1', 'plumbing', anHourAgo),
    noticingProspect('done2', 'plumbing', anHourAgo),
    noticingProspect('done3', 'plumbing', anHourAgo),
    noticingProspect('todo1', 'plumbing'),
    noticingProspect('todo2', 'plumbing'),
    noticingProspect('todo3', 'plumbing'),
  ]);
  // The reader answers nothing useful — three honest could-not-tells, well
  // under the broken-start threshold, so the run finishes.
  const ask = fakeReader(() => NO_ANSWER);
  const out = await noticingMain({
    db, ask, atOnce: 1, look: false, fresh: 12,
    lastRunPath: aBoard('wn-resume'), reviewPage: aPage('wn-resume'),
  });

  assert.equal(out.ending, 'finished');
  assert.equal(out.skippedAsDone, 3, 'the three noticed an hour ago were skipped');
  assert.equal(out.done, 3, 'the three never noticed were processed');
  assert.equal(out.remaining, 0);
  const workedOn = new Set(db.writes.readings.map((r) => r.prospectId));
  assert.deepEqual([...workedOn].sort(), ['todo1', 'todo2', 'todo3']);
  for (const id of ['done1', 'done2', 'done3']) {
    assert.ok(!db.touched.has(id), `${id} was already done and was left alone`);
  }
  const board = fs.readFileSync(aBoard('wn-resume'), 'utf8');
  assert.match(board, /finished/);
  assert.match(board, /3 done, 0 left/);
});

test('write-noticings writes the status board even when it crashes', async () => {
  const db = {
    prospect: { findMany: async () => { throw new Error('the database fell over'); }, count: async () => 0 },
    finding: { findMany: async () => [] },
    $disconnect: async () => {},
  };
  await assert.rejects(
    () => noticingMain({ db, ask: fakeReader(() => NO_ANSWER), lastRunPath: aBoard('wn-crash'), reviewPage: aPage('wn-crash') }),
    /the database fell over/,
  );
  const board = fs.readFileSync(aBoard('wn-crash'), 'utf8');
  assert.match(board, /write-noticings\.js/);
  assert.match(board, /crashed/);
  assert.match(board, /needs a person/);
});

// --- a fake database for the understanding run ------------------------------

function understandProspect(id, siteReadAt = null) {
  return {
    id, name: `${id} Co`, nameManualValue: null, trade: 'plumbing', phone: null,
    website: 'https://biz.example', websiteManualValue: null,
    email: null, emailManualValue: null, automationScore: null, scoreEvidence: null,
    stage: 'NO_CONTACT', addressManualValue: null, employeeCountManualValue: null,
    ownerName: null, phoneManualValue: null, siteReadAt,
  };
}

function fakeUnderstandDb(prospects) {
  const writes = { readings: [], readingUpdates: [], pages: [], findings: [], prospectUpdates: [] };
  let n = 0;
  const id = (p) => `${p}_${(n += 1)}`;
  const passesDate = (p, cond) => {
    if (cond === null) return !p.siteReadAt;
    if (cond && cond.lt !== undefined) return Boolean(p.siteReadAt) && p.siteReadAt < cond.lt;
    if (cond && cond.gte !== undefined) return Boolean(p.siteReadAt) && p.siteReadAt >= cond.gte;
    return true;
  };
  const sift = (where = {}) => prospects.filter((p) => {
    if (where.OR && !where.OR.some((c) => ('siteReadAt' in c ? passesDate(p, c.siteReadAt) : true))) return false;
    if (!where.OR && 'siteReadAt' in where && !passesDate(p, where.siteReadAt)) return false;
    return true;
  });
  return {
    writes,
    prospect: {
      findMany: async ({ where = {}, take } = {}) => (take ? sift(where).slice(0, take) : sift(where)),
      count: async ({ where = {} } = {}) => sift(where).length,
      update: async (a) => { writes.prospectUpdates.push(a); return {}; },
    },
    reading: {
      create: async ({ data }) => { const row = { id: id('r'), ...data }; writes.readings.push(row); return row; },
      update: async ({ where, data }) => { writes.readingUpdates.push({ id: where.id, ...data }); return {}; },
    },
    readingPage: {
      create: async ({ data }) => { writes.pages.push(data); return { id: id('p'), ...data }; },
      findFirst: async () => null,
    },
    finding: {
      create: async ({ data }) => { writes.findings.push(data); return { id: id('f'), ...data }; },
      findMany: async () => [],
    },
    contact: { findMany: async () => [], create: async () => ({}), update: async () => ({}) },
    $disconnect: async () => {},
  };
}

// --- understand-businesses: the whole run, stopped and resumed --------------

test('understand-businesses stops at once when the reader is out, exits 75, cut-off visit says why', async () => {
  const db = fakeUnderstandDb([understandProspect('u1'), understandProspect('u2'), understandProspect('u3')]);
  const ask = fakeReader(() => EXHAUSTED);
  const fetch = makeFetch({ '/': A_HOMEPAGE });
  const out = await runUnderstand({
    db, ask, fetch, lanes: 1, look: false, fresh: 0, limit: 3,
    lastRunPath: aBoard('ub-exhausted'),
  });

  assert.equal(out.code, EXIT_READER_EXHAUSTED);
  assert.equal(out.ending, 'reader_exhausted');
  assert.equal(out.done, 0);
  assert.equal(out.remaining, 3);
  assert.equal(ask.calls.length, 1, 'one call found the exhaustion; none followed');
  // The business in flight: its one reading is closed naming the TRUE reason
  // — never a plausible per-business failure — and nothing landed on the
  // prospect, so it stays eligible.
  assert.equal(db.writes.readings.length, 1);
  assert.equal(db.writes.readings[0].prospectId, 'u1');
  const closed = db.writes.readingUpdates.find((u) => u.id === db.writes.readings[0].id);
  assert.ok(closed, 'the in-flight reading was closed, not left dangling');
  assert.match(String(closed.note), /OUT OF ALLOWANCE/);
  assert.equal(db.writes.prospectUpdates.length, 0, 'no prospect was marked read');
  assert.equal(db.writes.findings.length, 0);
  // The businesses behind the stop were never visited at all.
  assert.ok(!db.writes.readings.some((r) => r.prospectId === 'u2'));
  assert.ok(!db.writes.readings.some((r) => r.prospectId === 'u3'));
  const board = fs.readFileSync(aBoard('ub-exhausted'), 'utf8');
  assert.match(board, /understand-businesses\.js/);
  assert.match(board, /allowance/);
  assert.match(board, /0 done, 3 left/);
});

test('understand-businesses --fresh skips the recently read and visits the rest', async () => {
  const now = Date.now();
  const db = fakeUnderstandDb([
    understandProspect('fresh1', new Date(now - 1 * 3600000)),
    understandProspect('fresh2', new Date(now - 2 * 3600000)),
    understandProspect('stale1', new Date(now - 30 * 3600000)),
    understandProspect('stale2', new Date(now - 40 * 3600000)),
    understandProspect('never1', null),
  ]);
  // Every site refuses to open, so each visit ends quickly as unreachable —
  // the reader is never needed and must never be called.
  const ask = fakeReader(() => { throw new Error('no visit should reach the reader'); });
  const fetch = makeFetch({});   // 404 for everything
  const out = await runUnderstand({
    db, ask, fetch, lanes: 2, look: false, fresh: 6, limit: 50,
    lastRunPath: aBoard('ub-resume'),
  });

  assert.equal(out.ending, 'finished');
  assert.equal(out.done, 3, 'the two read within 6 hours were skipped; three were visited');
  const visited = new Set(db.writes.readings.map((r) => r.prospectId));
  assert.deepEqual([...visited].sort(), ['never1', 'stale1', 'stale2']);
  assert.ok(!visited.has('fresh1') && !visited.has('fresh2'), 'the already-done were left alone');
  assert.equal(ask.calls.length, 0);
  const board = fs.readFileSync(aBoard('ub-resume'), 'utf8');
  assert.match(board, /finished the batch/);
  assert.match(board, /3 done, 0 left/);
});

test('understand-businesses writes the status board even when it crashes', async () => {
  const db = {
    prospect: {
      findMany: async () => { throw new Error('the database fell over'); },
      count: async () => 0,
    },
    $disconnect: async () => {},
  };
  await assert.rejects(
    () => runUnderstand({ db, ask: fakeReader(() => NO_ANSWER), fresh: 0, lastRunPath: aBoard('ub-crash') }),
    /the database fell over/,
  );
  const board = fs.readFileSync(aBoard('ub-crash'), 'utf8');
  assert.match(board, /understand-businesses\.js/);
  assert.match(board, /crashed/);
});

// --- the status board itself ------------------------------------------------

test('the status board is one plain line, and a new run overwrites the old line', () => {
  const at = aBoard('board');
  writeLastRun({ script: 'write-noticings.js', why: 'finished', done: 12, remaining: 0, at });
  writeLastRun({
    script: 'understand-businesses.js', why: 'the reader is out of allowance and the run stopped',
    done: 212, remaining: 2788, needsPerson: 'rerun with --fresh=12 once the allowance resets', at,
  });
  const board = fs.readFileSync(at, 'utf8').trim();
  assert.equal(board.split('\n').length, 1, 'one line — a status board, not a log');
  assert.match(board, /understand-businesses\.js/);
  assert.match(board, /212 done, 2788 left/);
  assert.match(board, /needs a person: rerun with --fresh=12/);
  assert.ok(!board.includes('write-noticings'), 'the old line is gone — overwrite is the point');
});

test('the stop messages are fixed strings a lane can recognise', () => {
  assert.match(READER_OUT_MSG, /OUT OF ALLOWANCE/);
  assert.match(BROKEN_START_MSG, /first tries/);
  assert.notEqual(EXIT_READER_EXHAUSTED, EXIT_BROKEN_START);
  assert.ok(EXIT_READER_EXHAUSTED !== 0 && EXIT_READER_EXHAUSTED !== 1);
  assert.ok(EXIT_BROKEN_START !== 0 && EXIT_BROKEN_START !== 1);
});
