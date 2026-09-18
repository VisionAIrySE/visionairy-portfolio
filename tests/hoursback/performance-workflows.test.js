const test = require('node:test');
const assert = require('node:assert/strict');
const { measure } = require('../../scripts/hoursback/audit-scheduler-query-cost.cjs');
const { saveChoices } = require('../../src/hoursback/crm/recipientChoiceBatch.js');
const { spendingChoice } = require('../../src/hoursback/spendingChoice.js');
const { makeOpenRouterPool } = require('../../src/hoursback/openRouterPool.js');

test('follow-up reads stay bounded while all 100 due recipients advance', async () => {
  const small = await measure(1);
  const large = await measure(100);
  assert.equal(large.queued, 100);
  assert.equal(large.leftDraft, 0);
  assert.equal(large.reads, small.reads);
});

test('follow-up batching respects timing, deselection, bounces and held messages', async () => {
  const notDue = await measure(5, { now: new Date('2026-09-02') });
  assert.equal(notDue.queued, 0);
  const mixed = await measure(5, { mutate: ({ contacts, follows }) => {
    contacts[0].isPrimary = false;
    contacts[1].bouncedAt = new Date();
    contacts[2].setAsideAt = new Date();
    follows[3].deliveryState = 'UNCONFIRMED';
  } });
  assert.equal(mixed.queued, 1);
  assert.equal(mixed.leftDraft, 4);
});

function choicesFixture({ failPreparation = false, failCommit = false } = {}) {
  const state = { selected: false, inbox: false };
  const tx = {
    contact: { findMany: async () => [{ id: 'c1', email: 'one@example.test' }] },
    prospect: {
      findUnique: async () => ({ id: 'b1', email: 'office@example.test' }),
      update: async ({ data }) => { state.inbox = data.emailInboxSelected; },
    },
    outreachMessage: { updateMany: async () => ({ count: 0 }) },
  };
  const db = { $transaction: async (work) => {
    const before = { ...state };
    try {
      const result = await work(tx);
      if (failCommit) throw new Error('simulated commit failure');
      return result;
    } catch (error) { Object.assign(state, before); throw error; }
  } };
  const lanes = {
    saveContactSelections: async (client, _, selected) => {
      assert.equal(client, tx); state.selected = selected.includes('c1');
    },
    excludeEmailCampaigns: async (client) => assert.equal(client, tx),
    ensureSelectedFirstDrafts: async () => { if (failPreparation) throw new Error('offline'); },
    syncSelectedEmailCampaigns: async () => ({ ready: 1, incomplete: 0, contentBlocked: 0, contentProblems: [] }),
  };
  return { db, lanes, state };
}

test('saved choices remain truthfully saved if later preparation fails', async () => {
  const { db, lanes, state } = choicesFixture({ failPreparation: true });
  const result = await saveChoices(db, 'b1', ['c1'], true, lanes);
  assert.equal(result.saved, true);
  assert.equal(state.selected, true);
  assert.equal(state.inbox, true);
  assert.match(result.preparationError, /Choices saved/);
});

test('choice transaction rolls back both person and inbox on failure', async () => {
  const { db, lanes, state } = choicesFixture({ failCommit: true });
  await assert.rejects(saveChoices(db, 'b1', ['c1'], true, lanes), /commit failure/);
  assert.deepEqual(state, { selected: false, inbox: false });
});

test('a stale or forged recipient selection changes nothing', async () => {
  const { db, lanes, state } = choicesFixture();
  await assert.rejects(saveChoices(db, 'b1', ['unknown'], false, lanes), /recipients changed/);
  assert.deepEqual(state, { selected: false, inbox: false });
});

test('spending choice is explicit and no paid call occurs without it', async () => {
  assert.throws(() => spendingChoice([], 'ceiling'), /approved/);
  assert.equal(spendingChoice(['--ceiling=7'], 'ceiling'), 7);
  assert.equal(spendingChoice(['--no-spending-limit'], 'ceiling'), Infinity);
  let calls = 0;
  const pool = makeOpenRouterPool({ apiKey: 'fake', fetchFn: async () => { calls += 1; } });
  const result = await pool.ask('test');
  assert.equal(result.readerExhausted, true);
  assert.equal(calls, 0);
});
