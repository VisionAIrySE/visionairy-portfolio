const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../src/hoursback/crm/delivery.js');
const { defaultSender } = require('../../src/hoursback/crm/lanes.js');

function matches(row, where) {
  return Object.entries(where || {}).every(([field, expected]) => {
    if (field === 'OR') return expected.some((choice) => matches(row, choice));
    if (field === 'prospect') return matches(row.prospect, expected);
    const actual = row[field] === undefined ? null : row[field];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return expected.in.includes(actual);
      if ('lte' in expected) return actual && actual <= expected.lte;
      if ('gt' in expected) return actual && actual > expected.gt;
    }
    return actual === expected;
  });
}

function memoryDb(overrides = {}) {
  const row = {
    id: 'message-1', prospectId: 'prospect-1', lane: 'EMAIL', state: 'QUEUED',
    subject: 'Original subject', body: 'Original body', sentTo: null,
    deliveryState: null, deliveryKey: null, deliveryClaimedAt: null,
    deliveryLeaseExpiresAt: null, deliveryLastAttemptAt: null,
    deliveryTo: null, deliveryFrom: null, deliverySubject: null,
    deliveryHtml: null, deliveryText: null, providerMessageId: null,
    deliveryError: null, suppressedReason: null,
    prospect: { doNotContact: false, repliedAt: null, emailBouncedAt: null },
    ...overrides,
  };
  const outreachMessage = {
    async findUnique() { return { ...row, prospect: { ...row.prospect } }; },
    async updateMany({ where, data }) {
      if (!matches(row, where)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
  const db = { row, outreachMessage };
  db.$transaction = async (work) => work(db);
  return db;
}

function payload(overrides = {}) {
  return {
    from: 'Russ <russ@visionairy.biz>', to: 'owner@example.com',
    subject: 'Original subject', html: '<p>Original body</p>', text: 'Original body',
    ...overrides,
  };
}

test('only one concurrent worker claims a queued message', async () => {
  const db = memoryDb();
  const now = new Date('2026-09-09T12:00:00Z');
  const claims = await Promise.all([
    D.claim(db, db.row.id, async () => payload(), now),
    D.claim(db, db.row.id, async () => payload(), now),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(db.row.state, 'SENDING');
  assert.equal(db.row.deliveryState, 'CLAIMED');
  assert.equal(db.row.deliveryKey, 'outreach:message-1');
});

test('suppression is checked again immediately before provider delivery', async () => {
  const db = memoryDb();
  const now = new Date('2026-09-09T12:00:00Z');
  await D.claim(db, db.row.id, async () => payload(), now);
  db.row.prospect.repliedAt = new Date('2026-09-09T12:01:00Z');
  const result = await D.beginAttempt(db, db.row.id, new Date('2026-09-09T12:02:00Z'));
  assert.match(result.blocked, /replied/);
  assert.equal(db.row.state, 'SUPPRESSED');
  assert.equal(db.row.deliveryState, 'BLOCKED');
});

test('a known refusal retries the original frozen payload and key', async () => {
  const db = memoryDb();
  const now = new Date('2026-09-09T12:00:00Z');
  const first = await D.claim(db, db.row.id, async () => payload(), now);
  await D.beginAttempt(db, db.row.id, now);
  await D.markKnownFailure(db, db.row.id, new Error('refused'));
  db.row.body = 'Changed after claim';
  db.row.sentTo = 'someone-else@example.com';
  const retried = await D.claim(db, db.row.id, async () => payload({ to: 'wrong@example.com' }), now);
  assert.deepEqual(retried.payload, first.payload);
  assert.equal(retried.payload.to, 'owner@example.com');
  assert.equal(retried.payload.idempotencyKey, 'outreach:message-1');
});

test('a stale in-flight attempt is retried only inside the idempotency window', async () => {
  const started = new Date('2026-09-09T12:00:00Z');
  const withinWindow = memoryDb();
  await D.claim(withinWindow, withinWindow.row.id, async () => payload(), started);
  await D.beginAttempt(withinWindow, withinWindow.row.id, started);
  const recovered = await D.claim(withinWindow, withinWindow.row.id, async () => payload(),
    new Date(started.getTime() + D.CLAIM_LEASE_MS + 1));
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.payload.idempotencyKey, 'outreach:message-1');

  const tooOld = memoryDb();
  await D.claim(tooOld, tooOld.row.id, async () => payload(), started);
  await D.beginAttempt(tooOld, tooOld.row.id, started);
  const held = await D.claim(tooOld, tooOld.row.id, async () => payload(),
    new Date(started.getTime() + D.SAFE_RETRY_MS + 1));
  assert.equal(held.unconfirmed, true);
  assert.equal(tooOld.row.deliveryState, 'UNCONFIRMED');
});

test('an ambiguous result is held and cannot be claimed again', async () => {
  const db = memoryDb();
  const now = new Date('2026-09-09T12:00:00Z');
  await D.claim(db, db.row.id, async () => payload(), now);
  await D.beginAttempt(db, db.row.id, now);
  await D.markUnconfirmed(db, db.row.id, new Error('connection ended before a response'));
  assert.equal(db.row.deliveryState, 'UNCONFIRMED');
  assert.equal(await D.claim(db, db.row.id, async () => payload(), now), null);
});

test('suppression after a provider attempt preserves the unknown outcome', async () => {
  const db = memoryDb();
  const started = new Date('2026-09-09T12:00:00Z');
  await D.claim(db, db.row.id, async () => payload(), started);
  await D.beginAttempt(db, db.row.id, started);
  db.row.prospect.doNotContact = true;
  const held = await D.claim(db, db.row.id, async () => payload(),
    new Date(started.getTime() + D.CLAIM_LEASE_MS + 1));
  assert.equal(held.unconfirmed, true);
  assert.equal(db.row.state, 'SENDING');
  assert.equal(db.row.deliveryState, 'UNCONFIRMED');
  assert.match(db.row.deliveryError, /outcome is unknown/);
});

test('the Resend client sends the durable idempotency key', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (_url, options) => {
    request = options;
    return { ok: true, async json() { return { id: 'provider-1' }; } };
  };
  try {
    const response = await defaultSender('secret')({ ...payload(), idempotencyKey: 'outreach:message-1' });
    assert.equal(request.headers['Idempotency-Key'], 'outreach:message-1');
    assert.equal(response.id, 'provider-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('an explicit provider refusal is marked safe to retry', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 422 });
  try {
    await assert.rejects(
      defaultSender('secret')({ ...payload(), idempotencyKey: 'outreach:message-1' }),
      (error) => error.definitelyNotSent === true,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
