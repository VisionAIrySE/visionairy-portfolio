const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../src/hoursback/crm/lanes.js');
const { BODY } = require('../../src/hoursback/crm/firstContact.js');

test('sender never attempts an older queued first email for a recipient already delivered', async () => {
  const recipient = 'owner@example.test';
  const sentAt = new Date('2026-09-15T16:00:00Z');
  const siblings = [
    { id: 'old-first', prospectId: 'business-1', lane: 'EMAIL', state: 'QUEUED',
      openedWith: 'tailored_first', sentTo: recipient, sentAt: null,
      providerMessageId: null, deliveryState: null },
    { id: 'delivered-first', prospectId: 'business-1', lane: 'EMAIL', state: 'SENT',
      openedWith: 'tailored_first', sentTo: recipient, sentAt,
      providerMessageId: 'provider-1', deliveryState: 'DELIVERED' },
  ];
  let providerAttempts = 0;
  const db = {
    messageTemplate: { findUnique: async () => ({ approvedAt: sentAt,
      body: BODY, approvedWording: L.wordingFingerprint() }) },
    outreachMessage: { findMany: async ({ include }) => {
      assert.equal(include.prospect.include.messages.select.sentAt, true);
      assert.equal(include.prospect.include.messages.select.providerMessageId, true);
      return [{ ...siblings[0], prospect: { id: 'business-1',
        website: null, websiteManualValue: null, readings: [], messages: siblings } }];
    } },
  };
  const result = await L.sendQueuedEmails(db, { apiKey: 'test-only', limit: 1,
    send: async () => { providerAttempts += 1; throw new Error('duplicate sent'); } });
  assert.equal(result.attempted, 0);
  assert.equal(result.sent, 0);
  assert.equal(providerAttempts, 0);
});
