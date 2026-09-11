const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.resolve(__dirname, 'crm-app.js'), 'utf8');
const writer = fs.readFileSync(path.resolve(__dirname, 'write-the-whole-sequence.cjs'), 'utf8');
const C = require('../../src/hoursback/crm/campaign.js');

assert.match(app, /<h1>Email workspace<\/h1>/);
assert.match(app, /1\. Review/);
assert.match(app, /2\. Select/);
assert.match(app, /3\. Send/);
assert.match(app, /Recipient:/);
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
assert.match(writer, /const parts = \[greeting, say\('followContext'\)\]/);

console.log('PASS: email workspace has one clear review flow, no embedded company page, and self-contained follow-ups');
