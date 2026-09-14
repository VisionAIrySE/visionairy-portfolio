const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.resolve(__dirname, 'crm-app.js'), 'utf8');
const writer = fs.readFileSync(path.resolve(__dirname, 'write-the-whole-sequence.cjs'), 'utf8');
const checker = fs.readFileSync(path.resolve(__dirname, 'check-the-letters.cjs'), 'utf8');
const noticingWriter = fs.readFileSync(path.resolve(__dirname, 'write-noticings.js'), 'utf8');
const readinessAudit = fs.readFileSync(path.resolve(__dirname, 'audit-email-readiness.cjs'), 'utf8');
const scheduler = fs.readFileSync(path.resolve(__dirname, '../../src/hoursback/crm/scheduler.js'), 'utf8');
const refresh = fs.readFileSync(path.resolve(__dirname, '../../src/hoursback/refresh.js'), 'utf8');
const lanesSource = fs.readFileSync(path.resolve(__dirname, '../../src/hoursback/crm/lanes.js'), 'utf8');
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
assert.match(app, /visibleCompanies\.map\(companyAccordion\)/,
  'the Email page must group recipient campaigns under their company');
assert.match(app, /Selected contacts and their email sequences/,
  'opening a company must show its selected contacts before their email sequences');
assert.match(app, /one\(message, \{ nested: true \}\)/,
  'opening a selected contact must show that person\'s campaign as a nested accordion');
assert.match(app, /selectedCount = intendedEmailRecipients\(prospect\)\.length/,
  'the company heading must count selected recipients rather than already-written campaigns');
assert.match(app, /message\.state === 'QUEUED' && isComplete\(message\)/,
  'the ready count must include only queued campaigns whose full sequence is complete');
assert.match(app, /recipientChoicesChanged==='true'/,
  'closing a company must save changed recipient choices automatically');
assert.match(app, /Save selected contacts now/,
  'recipient choices must also have a clear save action above the contact list');
assert.match(app, /what === 'recipients'/);
assert.doesNotMatch(app, /Choose at least one contact with a working email\. Nothing was changed\./,
  'saving no checked contacts must not silently restore the default recipient');
assert.match(app, /Company excluded from email sending/,
  'saving no checked contacts must confirm that the company was removed from sending');
assert.match(lanesSource, /suppressedReason: 'no recipients selected'/,
  'an empty recipient selection must persist as a reversible campaign exclusion');
assert.match(lanesSource, /state: 'DRAFT', suppressedReason: null/,
  'selecting a contact later must restore only campaigns paused by an empty selection');
assert.match(app, /What follows if they do not reply/);
assert.match(app, /Incomplete — cannot send/);
assert.match(app, /incomplete campaign/);
assert.doesNotMatch(app, /Promise\.all\(ready\.map/,
  'opening the Email page must not rebuild every visible draft and delay a simple save');
assert.match(app, /includeFirst: false, sentTo: m\.sentTo \|\| null/,
  'each Email row must show follow-ups for that same recipient');
assert.match(app, /currentCampaignMessages\(prospect, messages\)/,
  'the Email and business pages must hide campaigns for recipients who are no longer selected');
assert.match(app, /p\.messages = currentCampaignMessages\(p, p\.messages\)/,
  'the business page must use the same active-recipient rule as the Email page');
assert.match(app, /r\.fourth.*Day 14/,
  'the follow-up action must report the final follow-up instead of counting it as a first email');
assert.match(app, /Open full company record/);
assert.doesNotMatch(app, /class="thewholerecord"/);
assert.doesNotMatch(app, /document\.createElement\('iframe'\)/);
assert.doesNotMatch(app, /opens on:/);
assert.match(app, /Plain description of this business/,
  'the company page must label the research description in ordinary language');
assert.doesNotMatch(app, /<b>Not being used:<\/b>/,
  'the company page must not call useful research background unused');

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
assert.match(writer, /contacts: \{ some: \{ email: \{ not: null \}, setAsideAt: null, bouncedAt: null \} \}/,
  'the sequence writer must include businesses reached through a selected contact');
assert.match(writer, /L\.canonicalFirstMessages\(recipientAddress/,
  'follow-ups must be based on the current first email for that exact recipient');
assert.match(writer, /recipients\.map\(\(recipient\)/,
  'every selected contact must receive a separate role-aware campaign');
assert.match(writer, /const ALL_CONTACTS = process\.argv\.includes\('--all-contacts'\)/,
  'the preparation run must support writing ahead for every deliverable contact');
assert.match(writer, /ALL_CONTACTS\s*\? usable/,
  'the all-contacts run must expand every deliverable person into a separate campaign');
assert.doesNotMatch(writer, /\.\.\.\(MISSING_ONLY \? \{\s*messages:/,
  'missing-only repair must include a business whose entire campaign is missing');
assert.match(writer, /INCOMPLETE:/,
  'a partial sequence-writing run must report failure instead of appearing complete');
assert.match(writer, /if \(MISSING_ONLY && have\) \{ already \+= 1; continue; \}/,
  'a completeness repair must leave every existing message unchanged');
assert.match(checker, /selected recipients at researched, reachable businesses are missing part of their four-message sequence/,
  'the permanent letter audit must report each recipient whose sequence has missing messages');
assert.match(checker, /\.\.\.L\.emailReachableWhere\(\)/,
  'the audit must include businesses reached through a selected contact');
assert.match(noticingWriter, /NO_REVIEW_FILE/,
  'a focused production repair must not depend on rewriting a local review document');
assert.match(noticingWriter, /MISSING_SEQUENCES/,
  'a completeness repair must select missing sequences without a hand-copied id list');
assert.match(noticingWriter, /Object\.assign\(where, L\.emailReachableWhere\(\)\)/,
  'noticing research must include businesses reached through a selected contact');
assert.match(readinessAudit, /selected recipients have all four saved messages/,
  'the permanent readiness audit must verify each selected person, not just each company');
assert.match(readinessAudit, /marked ready while its campaign is incomplete/,
  'the permanent readiness audit must expose unsafe queue state');
assert.match(readinessAudit, /Preparation path for active companies/,
  'the permanent readiness audit must show where companies are waiting in research');
assert.match(refresh, /full website research is still waiting/,
  'the quick contact scan must not create a campaign before the whole-site evidence is stored');
assert.match(app, /contact details scanned; full research waiting/,
  'the company page must distinguish a quick scan from full website research');
assert.match(scheduler, /'first', 'second', 'third', 'fourth'/,
  'the scheduled run report must include the Day 14 follow-up');
assert.match(lanesSource, /nothing unresearched was sent/,
  'delivery must refuse a website-based campaign until the deep research is on file');
assert.equal(C.FOLLOWUP_CONTEXT.length, 4);

const L = require('../../src/hoursback/crm/lanes.js');
assert.deepEqual(L.emailReachableWhere().OR.some((choice) => choice.emailManualValue), true,
  'an address corrected by Russ must remain reachable');
const campaignMessage = (openedWith, state = 'DRAFT') => ({ lane: 'EMAIL', openedWith, state, deliveryState: null });
const firstWith = (messages) => ({ ...campaignMessage('tailored_first'), prospect: { messages } });
assert.equal(L.campaignHasCompleteSequence(firstWith([
  campaignMessage('tailored_first'), campaignMessage('touch_2'), campaignMessage('touch_3'),
])), false, 'a campaign missing Day 14 must be blocked');
assert.equal(L.campaignHasCompleteSequence(firstWith([
  campaignMessage('tailored_first'), campaignMessage('touch_2'), campaignMessage('touch_3'), campaignMessage('touch_4'),
])), true, 'a complete four-message campaign may proceed');
assert.equal(L.campaignHasCompleteSequence({
  ...campaignMessage('tailored_first'), sentTo: 'alice@example.test',
  prospect: { messages: [
    { ...campaignMessage('tailored_first'), sentTo: 'alice@example.test' },
    { ...campaignMessage('tailored_first'), sentTo: 'bob@example.test' },
    { ...campaignMessage('touch_2'), sentTo: 'bob@example.test' },
    { ...campaignMessage('touch_3'), sentTo: 'bob@example.test' },
    { ...campaignMessage('touch_4'), sentTo: 'bob@example.test' },
  ] },
}), false, 'one recipient cannot borrow another recipient\'s follow-ups');

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
