const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.resolve(__dirname, 'crm-app.js'), 'utf8');
const writer = fs.readFileSync(path.resolve(__dirname, 'write-the-whole-sequence.cjs'), 'utf8');
const C = require('../../src/hoursback/crm/campaign.js');
const { addContext, hasContext } = require('./add-followup-context.cjs');
const { addLocalContext, hasLocalContext } = require('./add-local-context.cjs');

assert.match(app, /<h1>Email workspace<\/h1>/);
assert.match(app, /1\. Review/);
assert.match(app, /2\. Select/);
assert.match(app, /3\. Send/);
assert.match(app, /Recipient:/);
assert.match(app, /Who should receive this campaign\?/);
assert.match(app, /Save recipient choices and refresh first email/);
assert.match(app, /what === 'recipients'/);
assert.match(app, /Choose at least one contact with a working email\. Nothing was changed\./);
assert.match(app, /What follows if they do not reply/);
assert.match(app, /Open full company record/);
assert.doesNotMatch(app, /class="thewholerecord"/);
assert.doesNotMatch(app, /document\.createElement\('iframe'\)/);
assert.doesNotMatch(app, /opens on:/);

const trade = C.tradeCopy('legal');
const followUps = [
  C.dayFour('Alli', trade, 'Bryant, Lovlien & Jarvis'),
  C.daySmallAsk('Alli', trade, 'Bryant, Lovlien & Jarvis'),
  C.dayEight('Alli', trade, C.tradeWordFor('legal'), 'Bryant, Lovlien & Jarvis'),
];
for (const message of followUps) {
  assert.ok(C.FOLLOWUP_CONTEXT.some((line) => message.includes(line)),
    'every follow-up should remind the reader who Russ is and what VisionAIry builds');
}
for (const line of [...C.WHO_I_AM, ...C.FOLLOWUP_CONTEXT]) {
  assert.match(line, /based here in Central Oregon/,
    'every campaign identity line should retain the local connection');
}
assert.match(writer, /const parts = \[greeting, say\('followContext'\)\]/);

const oldFollowUp = 'Hi Alli,\n\nThe invoice can:// wait to be noticed.\n\nBest regards,\n\nRuss Wright';
const revisedFollowUp = addContext(oldFollowUp, 'Bryant, Lovlien & Jarvis');
assert.equal(hasContext(oldFollowUp), false);
assert.equal(hasContext(revisedFollowUp), true);
assert.match(revisedFollowUp, /^Hi Alli,\n\nI'm Russ Wright/);
assert.equal(addContext(revisedFollowUp, 'Bryant, Lovlien & Jarvis'), revisedFollowUp,
  'running the backfill twice must not duplicate the reminder');

const oldFirst = "Hi Alli,\n\nI'm Russ Wright, founder of VisionAIry. We build practical AI and automation tools.\n\nCompany-specific passage.";
const localFirst = addLocalContext(oldFirst);
assert.equal(hasLocalContext(oldFirst), false);
assert.equal(hasLocalContext(localFirst), true);
assert.match(localFirst, /founder of VisionAIry, based here in Central Oregon\./);
assert.match(localFirst, /Company-specific passage\.$/);
assert.equal(addLocalContext(localFirst), localFirst,
  'running the local backfill twice must not duplicate the location');

console.log('PASS: email workspace has one clear review flow, no embedded company page, and self-contained follow-ups');
