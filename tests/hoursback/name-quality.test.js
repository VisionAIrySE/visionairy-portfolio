const test = require('node:test');
const assert = require('node:assert/strict');
const { nameLooksLikeAPageTitle, nameToSayOutLoud } = require('../../src/hoursback/crm/names.js');

test('an unfilled company-name token cannot enter a customer email', () => {
  assert.equal(nameLooksLikeAPageTitle('{businessName}'), true);
  assert.equal(nameToSayOutLoud({ name: '{businessName}' }), null);
  assert.equal(nameLooksLikeAPageTitle('Sage Veterinary Alternatives'), false);
});
