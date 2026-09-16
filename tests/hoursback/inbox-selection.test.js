const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../../src/hoursback/crm/inboxSelection.js');

test('a saved business inbox is only selected when the inbox choice is saved', () => {
  const prospect = { email: 'Office@Example.test', emailInboxSelected: false,
    contacts: [] };
  assert.equal(I.businessInboxAddress(prospect), 'office@example.test');
  assert.equal(I.selectedInboxAddress(prospect), '');
  prospect.emailInboxSelected = true;
  assert.equal(I.selectedInboxAddress(prospect), 'office@example.test');
});

test('the same address cannot be selected twice as a person and business inbox', () => {
  const prospect = { email: 'office@example.test', emailInboxSelected: true,
    contacts: [{ email: 'OFFICE@example.test', isPrimary: true,
      bouncedAt: null, setAsideAt: null }] };
  assert.deepEqual(I.selectedPersonAddresses(prospect), ['office@example.test']);
  assert.equal(I.selectedInboxAddress(prospect), '');
});
