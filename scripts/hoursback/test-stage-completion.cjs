const assert = require('node:assert/strict');
const { auditBusiness } = require('./audit-stage-completion.cjs');
const D = require('../../src/hoursback/crm/delivery.js');
const S = require('../../src/hoursback/crm/signature.js');

const report = () => ({ counts: { businesses: 0, attemptedSites: 0,
  fullyRead: 0, evidenceReady: 0, expectedCampaigns: 0,
  completeCampaigns: 0, pausedCampaigns: 0 }, examples: [] });
const business = () => ({
  name: 'Test Company', website: 'https://example.test',
  stage: 'NO_CONTACT', doNotContact: false, repliedAt: null,
  contacts: [{ name: 'Alice', email: 'alice@example.test', role: 'Owner',
    isPrimary: true, bouncedAt: null, setAsideAt: null }],
  readings: [], messages: [],
});

const unread = report();
auditBusiness(business(), unread);
assert.equal(unread.counts.needsFullRead, 1,
  'a selected site without saved pages must remain unfinished');

const researched = business();
researched.readings.push({ reader: 'understand-businesses', source: 'website',
  outcome: 'read', pages: [{ text: 'The company handles recurring jobs.' }],
  findings: [], startedAt: new Date() });
const noEvidence = report();
auditBusiness(researched, noEvidence);
assert.equal(noEvidence.counts.missingEvidence, 1,
  'a full read cannot pass without saved message evidence');

researched.readings.push({ reader: 'noticing', source: 'website', outcome: 'read',
  pages: [], findings: [{ field: 'noticingJob', value: 'scheduling work' }],
  startedAt: new Date() });
const noDrafts = report();
auditBusiness(researched, noDrafts);
assert.equal(noDrafts.counts.expectedCampaigns, 1);
assert.equal(noDrafts.counts.missingMessages, 1,
  'research and findings cannot hide an absent four-message campaign');

process.argv.push('--scope=ids', '--ids=chosen-business');
delete require.cache[require.resolve('./audit-stage-completion.cjs')];
const { auditBusiness: auditChosenBusiness } = require('./audit-stage-completion.cjs');
researched.id = 'chosen-business';
const chosen = report();
auditChosenBusiness(researched, chosen);
assert.equal(chosen.counts.missingMessages, 1,
  'an exact cohort audit must check every chosen business');
researched.id = 'different-business';
const excluded = report();
auditChosenBusiness(researched, excluded);
assert.equal(excluded.counts.businesses, 0,
  'an exact cohort audit must not count an unrelated business');

const message = { lane: 'EMAIL', openedWith: 'tailored_first',
  sentTo: 'alice@example.test', prospect: { doNotContact: false,
    repliedAt: null, contacts: [{ email: 'alice@example.test', isPrimary: false }] } };
assert.match(D.blockedReason(message), /no longer selected/,
  'a queued first email must be blocked after the contact is unchecked');
message.openedWith = 'touch_2';
assert.match(D.blockedReason(message), /no longer selected/,
  'a queued follow-up must also be blocked after the contact is unchecked');

const stored = 'Hi Alice,\nHere is the idea.\nBest regards,\nRuss Wright';
const text = `${S.bodyWithoutSignOff(stored)}\n\n${S.signatureText()}`;
assert.equal(S.presentationProblem({ html: S.toHtmlEmail(stored), text }), null,
  'a one-line gap before the stored sign-off must still produce one sign-off');

console.log('PASS: completion audit catches missing stages and prevents unchecked or badly rendered sends');
