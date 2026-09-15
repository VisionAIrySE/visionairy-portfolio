const test = require('node:test');
const assert = require('node:assert/strict');
const { syncSelectedEmailCampaigns } = require('../../src/hoursback/crm/lanes.js');

function fixture(selected) {
  const address = 'person@example.test';
  const messages = ['tailored_first', 'touch_2', 'touch_3'].map((openedWith, i) => ({
    id: `message-${i}`, prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith, sentTo: address, sentAt: null,
    queuedAt: null, deliveryState: null,
  }));
  const prospect = {
    doNotContact: false, repliedAt: null,
    contacts: selected ? [{ email: address }] : [],
    readings: [{ id: 'reading-1' }], messages,
  };
  const db = {
    prospect: { findUnique: async () => prospect },
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
  let result = await syncSelectedEmailCampaigns(db, 'business-1');
  assert.deepEqual(result, { ready: 0, incomplete: 1 });
  assert.equal(messages[0].state, 'DRAFT');

  messages.push({
    id: 'message-3', prospectId: 'business-1', lane: 'EMAIL',
    state: 'DRAFT', openedWith: 'touch_4', sentTo: address,
    sentAt: null, queuedAt: null, deliveryState: null,
  });
  result = await syncSelectedEmailCampaigns(db, 'business-1');
  assert.deepEqual(result, { ready: 1, incomplete: 0 });
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
  const result = await syncSelectedEmailCampaigns(db, 'business-1');
  assert.deepEqual(result, { ready: 0, incomplete: 0 });
  assert.equal(messages[0].state, 'DRAFT');
});
