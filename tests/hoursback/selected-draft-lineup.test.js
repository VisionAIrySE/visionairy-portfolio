const test = require('node:test');
const assert = require('node:assert/strict');
const { syncSelectedEmailCampaigns, selectedDraftGap } = require('../../src/hoursback/crm/lanes.js');

function fixture(selected) {
  const address = 'person@example.test';
  const messages = ['tailored_first', 'touch_2', 'touch_3'].map((openedWith, i) => ({
    id: `message-${i}`, prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith, sentTo: address, sentAt: null,
    queuedAt: null, deliveryState: null,
  }));
  const prospect = {
    id: 'business-1',
    doNotContact: false, repliedAt: null,
    contacts: selected ? [{ email: address }] : [],
    readings: [{ id: 'reading-1' }], messages,
  };
  const db = {
    prospect: { findUnique: async () => prospect, findMany: async () => [prospect] },
    reading: {
      findFirst: async () => ({ findings: [{ value: 'one verified job' }] }),
      findMany: async () => [{
        prospectId: 'business-1', findings: [{ value: 'one verified job' }],
      }],
    },
    outreachMessage: {
      update: async ({ where, data }) => {
        const message = messages.find((row) => row.id === where.id);
        Object.assign(message, data);
        return message;
      },
    },
  };
  return { db, messages, address };
}

test('a contact selected before campaign writing is lined up only after all four messages exist', async () => {
  const { db, messages, address } = fixture(true);
  const options = { judgeStored: () => ({ ok: true }) };
  let result = await syncSelectedEmailCampaigns(db, 'business-1', options);
  assert.deepEqual(result, { ready: 0, incomplete: 1, contentBlocked: 0, contentProblems: [] });
  assert.equal(messages[0].state, 'DRAFT');

  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  result = await syncSelectedEmailCampaigns(db, 'business-1', options);
  assert.deepEqual(result, { ready: 1, incomplete: 0, contentBlocked: 0, contentProblems: [] });
  assert.equal(messages[0].state, 'QUEUED');
  assert.ok(messages[0].queuedAt instanceof Date);
});

test('writing all four messages does not line up an unselected contact', async () => {
  const { db, messages, address } = fixture(false);
  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  const result = await syncSelectedEmailCampaigns(db, 'business-1',
    { judgeStored: () => ({ ok: true }) });
  assert.deepEqual(result, { ready: 0, incomplete: 0, contentBlocked: 0, contentProblems: [] });
  assert.equal(messages[0].state, 'DRAFT');
});

test('four present messages stay out of the send lineup when one fails the writing check', async () => {
  const { db, messages, address } = fixture(true);
  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  const result = await syncSelectedEmailCampaigns(db, 'business-1', {
    judgeStored: (message) => ({
      ok: message.openedWith !== 'touch_4',
      why: message.openedWith === 'touch_4' ? 'too long for this follow-up' : null,
    }),
  });
  assert.deepEqual(result, {
    ready: 0, incomplete: 0, contentBlocked: 1,
    contentProblems: [{
      recipient: address,
      message: 'Day 14 follow-up',
      why: 'too long for this follow-up',
    }],
  });
  assert.equal(messages[0].state, 'DRAFT');
});

test('the read-only gap check finds selected drafts missed by the morning run', async () => {
  const { db, messages, address } = fixture(true);
  const options = { judgeStored: () => ({ ok: true }) };
  assert.deepEqual(await selectedDraftGap(db, options),
    { complete: 0, incomplete: 1, businesses: 0, contentReady: 0, contentFailed: 0 });
  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  assert.deepEqual(await selectedDraftGap(db, options),
    { complete: 1, incomplete: 0, businesses: 1, contentReady: 1, contentFailed: 0 });
  assert.equal(messages[0].state, 'DRAFT', 'the check must not change the send lineup');
});
