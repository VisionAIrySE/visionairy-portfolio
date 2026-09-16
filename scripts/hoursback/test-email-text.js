const assert = require('node:assert/strict');
const { emailFields } = require('../../src/hoursback/crm/emailText.js');
const { draftFirstContact, draftFollowUpTouch } = require('../../src/hoursback/crm/firstContact.js');
const { addressedSubject } = require('./write-the-whole-sequence.cjs');
const { planChange } = require('./repair-unsent-email-addressing.cjs');
const { presentationProblem } = require('../../src/hoursback/crm/signature.js');

const clean = emailFields({
  subject: 'Robin — one question',
  body: 'One thought — and another\nA range – with context',
});
assert.equal(clean.subject, 'Robin: one question');
assert.equal(clean.body, 'One thought, and another\nA range, with context');

assert.equal(addressedSubject('which handoff is hardest to keep visible?', 'Hi Robin,'),
  'which handoff is hardest to keep visible?');

const prospect = {
  name: 'Example Co', trade: 'trades', contactName: 'Robin Owner', contactRole: 'Owner',
  noticing: 'Their intake process moves from the office — then to the field.',
};
const first = draftFirstContact(prospect, [{ signal: 'fax_listed' }]);
const followUp = draftFollowUpTouch(prospect, first.openedWith, 2);
for (const message of [first, followUp]) {
  assert.ok(message);
  assert.doesNotMatch(`${message.subject}\n${message.body}`, /[—–]/);
}
assert.doesNotMatch(first.subject, /^Robin\b/i);

const repairedInbox = planChange({
  subject: 'Kristi — a scheduling question',
  body: 'Hi Kristi,\n\nOne thing — another.',
  sentTo: 'office@example.test',
  prospect: {
    email: 'office@example.test', emailManualValue: null, emailInboxSelected: true, contacts: [],
  },
});
assert.equal(repairedInbox.subject, 'a scheduling question');
assert.equal(repairedInbox.body, 'Hello,\n\nOne thing, another.');

const repairedPerson = planChange({
  subject: 'Alice — one question', body: 'Hi Alice,\n\nOne — two.', sentTo: 'alice@example.test',
  prospect: { email: 'office@example.test', emailManualValue: null, emailInboxSelected: false,
    contacts: [{ name: 'Alice Smith', email: 'alice@example.test' }] },
});
assert.equal(repairedPerson.subject, 'one question');
assert.match(repairedPerson.body, /^Hi Alice,/);
assert.doesNotMatch(repairedPerson.body, /[—–]/);
assert.equal(presentationProblem({ subject: 'One — two', html: '<p>Clean</p>', text: 'Clean' }),
  'a long dash remains in the customer email');
assert.equal(presentationProblem({ subject: 'One: two', html: '<p>Clean</p>', text: 'Clean' }), null);

console.log('PASS: email subjects omit names and generated email text contains no long dashes');
