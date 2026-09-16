const test = require('node:test');
const assert = require('node:assert/strict');
const EP = require('../../src/hoursback/crm/emailProgress.js');

test('a delivered first email removes its older draft from the waiting screen', () => {
  const business = { id: 'business-1', messages: [
    { lane: 'EMAIL', state: 'SENT', openedWith: 'tailored_first',
      sentTo: 'person@example.test', sentAt: new Date('2026-09-15T17:00:00Z'),
      providerMessageId: 'provider-1', deliveryState: 'DELIVERED' },
  ] };
  const chosen = [
    { id: 'old-draft', lane: 'EMAIL', state: 'DRAFT', openedWith: 'trade_week',
      sentTo: 'person@example.test' },
    { id: 'other-draft', lane: 'EMAIL', state: 'DRAFT', openedWith: 'tailored_first',
      sentTo: 'other@example.test' },
  ];
  const delivered = EP.deliveredFirstKeys([business]);
  assert.deepEqual(EP.pendingFirsts(business, chosen, delivered).map((m) => m.id),
    ['other-draft']);
});

test('an unconfirmed send cannot hide a pending email from the waiting screen', () => {
  const business = { id: 'business-1', messages: [
    { lane: 'EMAIL', state: 'SENT', openedWith: 'tailored_first',
      sentTo: 'person@example.test', sentAt: new Date('2026-09-15T17:00:00Z'),
      providerMessageId: null, deliveryState: 'UNCONFIRMED' },
  ] };
  const pending = { id: 'pending', lane: 'EMAIL', state: 'DRAFT',
    openedWith: 'tailored_first', sentTo: 'person@example.test' };
  assert.deepEqual(EP.pendingFirsts(business, [pending],
    EP.deliveredFirstKeys([business])).map((m) => m.id), ['pending']);
});
