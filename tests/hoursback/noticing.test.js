// The noticing, adjudicated. One named test per promise the feature makes.
//
//   node --test tests/hoursback/noticing.test.js
//
// NO network, NO model calls, NO database: the reader is a stub handed in,
// and the db is a fake that records exactly what it was asked to write.
//
// What is proven here:
//   1. thin evidence returns null and the letter keeps Russ's trade sentence
//   2. the role angles the PROMPT and never puts a clause about the role in
//      the sentence
//   3. two businesses in one trade cannot receive identical sentences
//   4. a hand-edited or sent message is never rewritten
//   5. every other part of Russ's letter is byte-identical before and after
//   6. THE LIBRARY IS THE BENCHMARK (2026-09-02, second amendment): every
//      named job must map to a type in toolLibrary.js — an unmapped job is
//      rejected, and being on the phone is NOT disqualifying
//   7. THE RECURRENCE TEST: a separate second call, blind to the first
//      call's reasoning, drops jobs that do not plainly recur — an
//      advertised service is never on its own evidence of recurrence
//   8. THE CARD GETS EVERYTHING; THE EMAIL NAMES TWO: every qualifying area
//      is ranked on the library's own evidence and recorded append-only;
//      only the two hardest-hitting reach the email, never two of one type,
//      and a weak second is dropped rather than carried
//   9. what a business visibly runs is never offered back to it — the
//      sentence nods to it and steps past, or names different work

const { test } = require('node:test');
const assert = require('node:assert/strict');

const N = require('../../src/hoursback/crm/noticing.js');
const L = require('../../src/hoursback/crm/lanes.js');
const C = require('../../src/hoursback/crm/campaign.js');
const T = require('../../src/hoursback/toolLibrary.js');
const { draftFirstContact } = require('../../src/hoursback/crm/firstContact.js');

// --- the evidence a well-read business carries ------------------------------

const PAGES = [
  {
    url: 'https://smithcpa.example/',
    title: 'Smith & Co CPA',
    text: 'Smith & Co is a two-partner accounting firm in Bend, Oregon serving '
      + 'individuals and small businesses since 1998. We prepare individual and '
      + 'business tax returns, monthly bookkeeping and payroll. To get started, '
      + 'download our client organizer, print it, and mail or fax it to our '
      + 'office with your documents. Our office will call you to confirm we '
      + 'received everything and to schedule your appointment.',
  },
  {
    url: 'https://smithcpa.example/about',
    title: 'About',
    text: 'Founded in 1998 by Dale Smith. Our office manager keeps every engagement moving and answers the phone during tax season.',
  },
];

const EVIDENCE = {
  name: 'Smith & Co CPA',
  trade: 'accounting',
  theirWork: 'prepare tax returns and keep books for small businesses',
  selfDescription: null,
  toolsInUse: 'QuickBooks',
  teamSize: 4,
  yearsInBusiness: 27,
  people: [{ name: 'Dale Smith', role: 'Owner' }, { name: 'Pat Jones', role: 'Office Manager' }],
  pages: PAGES,
};

const GOOD_SENTENCE = 'Every client organizer still arrives on paper, and somebody in your office types it in before the return can start.';
const GOOD_QUOTE = 'download our client organizer, print it, and mail or fax it to our office';

// The three-call script: FIND the areas, check RECURRENCE, WRITE the passage.
const FIND_CHASE = {
  areas: [{
    job: 'chasing clients for the organizers they never sent',
    type: 'document_collection',
    quote: 'mail or fax it to our office with your documents',
  }],
};
const RECUR_ONE_YES = {
  verdicts: [{ recurs: 'yes', why: 'every client, every season, the same chase', plainly: 0.9 }],
};
const WRITE_GOOD = { sentence: GOOD_SENTENCE, sure: 0.9 };

// One chosen area, as the write prompt receives it.
const CHOSEN_ONE = [{
  job: 'chasing clients for the organizers they never sent',
  type: 'document_collection',
  label: 'Collecting documents from clients',
  department: 'admin',
  quote: 'mail or fax it to our office with your documents',
  url: PAGES[0].url,
}];

// A stub reader: hand it a script of answers, it hands them back in order and
// keeps every prompt it was asked.
function stubReader(answers) {
  const prompts = [];
  const ask = async (prompt) => {
    prompts.push(prompt);
    const next = answers[Math.min(prompts.length - 1, answers.length - 1)];
    return { answer: next, why: next ? null : 'the reader did not answer' };
  };
  ask.prompts = prompts;
  return ask;
}

// ---------------------------------------------------------------------------
// 1. Thin evidence returns null, and the letter keeps Russ's trade sentence.

test('no kept pages: could_not_tell without a single model call', async () => {
  const ask = stubReader([]);
  const res = await N.askForNoticing({ evidence: { ...EVIDENCE, pages: [] }, ask });
  assert.ok(res.couldNotTell);
  assert.equal(ask.prompts.length, 0);
});

test('a few words of a site are not evidence: could_not_tell without a call', async () => {
  const ask = stubReader([]);
  const thin = { ...EVIDENCE, pages: [{ url: 'https://smithcpa.example/', text: 'Welcome to our site.' }] };
  const res = await N.askForNoticing({ evidence: thin, ask });
  assert.ok(res.couldNotTell);
  assert.equal(ask.prompts.length, 0);
});

test('the reader saying cannotTell is final — no sentence, no retry', async () => {
  const ask = stubReader([{ cannotTell: 'the pages show nothing specific about how work arrives' }]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.equal(ask.prompts.length, 1);
});

test('an ungrounded area is rejected: the quote must be on a stored page', async () => {
  const ungrounded = {
    areas: [{ job: 'shredding organizers', type: 'document_collection', quote: 'we shred every organizer on arrival' }],
  };
  const ask = stubReader([ungrounded, ungrounded]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.match(res.couldNotTell, /not found on any stored page/);
  assert.equal(ask.prompts.length, 2);
});

test('with no noticing the letter opens its third element with the trade week, unchanged', () => {
  const p = { name: 'Smith & Co CPA', trade: 'accounting', email: 'info@smithcpa.example' };
  const built = draftFirstContact(p, []);
  const parts = built.body.split('\n\n');
  assert.ok(parts[2].startsWith(C.TRADES.accounting.week));
});

test('a latest finding of could_not_tell means no noticing reaches the letter', async () => {
  const db = { finding: { findMany: async () => [{ value: null, status: 'could_not_tell', reading: { source: 'website' } }] } };
  assert.equal(await N.noticingFor(db, 'p1'), null);
});

// ---------------------------------------------------------------------------
// 2. The role angles the write prompt — and never becomes a clause in the
//    sentence.

test('the role changes the write prompt', () => {
  const toOwner = N.promptToWrite(EVIDENCE, CHOSEN_ONE, 'Owner', []);
  const toOffice = N.promptToWrite(EVIDENCE, CHOSEN_ONE, 'Office Manager', []);
  const toNobody = N.promptToWrite(EVIDENCE, CHOSEN_ONE, null, []);
  assert.notEqual(toOwner, toOffice);
  assert.notEqual(toOwner, toNobody);
  assert.match(toOwner, /owner's own evenings/);
  assert.match(toOffice, /never imply this person is slow or the problem/);
  assert.match(toNobody, /Nothing is known about the reader's job/);
  // Every angled prompt forbids naming the title in the sentence itself.
  for (const prompt of [toOwner, toOffice]) assert.match(prompt, /never as a\s+separate clause about the reader/i);
});

test("a sentence naming the reader's job title is rejected", () => {
  const bad = 'Your office manager retypes every client organizer that arrives by fax.';
  assert.equal(N.passable(bad, { roleTitle: 'Office Manager' }).ok, false);
  const alsoBad = 'As the owner you spend evenings retyping client organizers into the file.';
  assert.equal(N.passable(alsoBad, { roleTitle: 'Owner' }).ok, false);
  assert.equal(N.passable(GOOD_SENTENCE, { roleTitle: 'Office Manager' }).ok, true);
});

test('a reader that keeps naming the role ends in could_not_tell, never a sent clause', async () => {
  const naming = { sentence: 'Your office manager retypes every organizer that arrives by fax or mail.', sure: 0.9 };
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, naming, naming]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, roleTitle: 'Office Manager', ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.equal(ask.prompts.length, 4);          // find, recur, write, one rewrite, then silence
  assert.match(ask.prompts[3], /previous answer was rejected/);
});

test('marketing language and exclamation are rejected whatever the role', () => {
  assert.equal(N.passable('We can streamline your client document intake process today.').ok, false);
  assert.equal(N.passable('Your team retypes every organizer that arrives, and that adds up fast!').ok, false);
  assert.equal(N.passable('Have you ever added up the hours your intake really takes every week?').ok, false);
});

// ---------------------------------------------------------------------------
// 3. Two businesses in one trade cannot receive identical sentences.

test('a sentence already written to another firm in the trade is refused', async () => {
  // First business gets it.
  const first = await N.askForNoticing({ evidence: EVIDENCE, ask: stubReader([FIND_CHASE, RECUR_ONE_YES, WRITE_GOOD]) });
  assert.equal(first.sentence, GOOD_SENTENCE);

  // Second business in the same trade: the reader stubbornly repeats itself,
  // so after the rewrite attempt the answer is silence — never a duplicate.
  const stubborn = stubReader([FIND_CHASE, RECUR_ONE_YES, WRITE_GOOD, WRITE_GOOD]);
  const second = await N.askForNoticing({ evidence: EVIDENCE, avoid: [GOOD_SENTENCE], ask: stubborn });
  assert.ok(second.couldNotTell);
  assert.equal(second.sentence, undefined);
  // The collision was named to the reader, with the used sentence in view.
  assert.match(stubborn.prompts[2], /must not repeat any of them/);
  assert.ok(stubborn.prompts[2].includes(GOOD_SENTENCE));
  assert.match(stubborn.prompts[3], /already written to another business in this trade/);
});

test('a rewrite that says something different is accepted', async () => {
  const different = {
    sentence: 'Getting started with you still means printing the organizer and faxing it back, so tax season opens with paper.',
    sure: 0.85,
  };
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, WRITE_GOOD, different]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, avoid: [GOOD_SENTENCE], ask });
  assert.equal(res.sentence, different.sentence);
});

test('punctuation and case differences are still the same sentence', () => {
  const dressedUp = 'Every client organizer STILL arrives on paper — and somebody in your office types it in before the return can start.';
  assert.equal(N.normalise(dressedUp.replace('—', '')), N.normalise(GOOD_SENTENCE.replace(',', '')));
  assert.equal(N.passable(GOOD_SENTENCE, { avoid: [GOOD_SENTENCE.toUpperCase()] }).ok, false);
});

// ---------------------------------------------------------------------------
// 4. A hand-edited or sent message is never rewritten. Through the REAL
//    draft path (lanes.draftFor), against a fake db that counts writes.

function fakeDb({ prospect, contact, findings, existingMessage }) {
  const writes = { updated: 0, created: 0, lastUpdate: null };
  return {
    writes,
    prospect: { findUniqueOrThrow: async () => prospect },
    contact: {
      findFirst: async () => contact || null,
      findMany: async () => (contact ? [contact] : []),
    },
    finding: { findMany: async () => findings || [] },
    outreachMessage: {
      findFirst: async () => existingMessage || null,
      update: async (args) => { writes.updated += 1; writes.lastUpdate = args; return { ...existingMessage, ...args.data }; },
      updateMany: async () => ({ count: 0 }),
      create: async (args) => { writes.created += 1; return { id: 'new', ...args.data }; },
    },
    messageTemplate: { findUnique: async () => null },
  };
}

const PROSPECT = {
  id: 'p1', name: 'Smith & Co CPA', trade: 'accounting',
  email: 'info@smithcpa.example', scoreEvidence: '[]', doNotContact: false,
};
const DALE = { id: 'c1', name: 'Dale Smith', role: 'Owner', email: 'dale@smithcpa.example', isPrimary: true, bouncedAt: null };
const NOTICING_FINDINGS = [{
  value: GOOD_SENTENCE, status: 'inferred', createdAt: new Date(),
  reading: { source: 'website', startedAt: new Date() },
}];

test('a draft Russ edited by hand is returned untouched', async () => {
  const db = fakeDb({
    prospect: PROSPECT, contact: DALE, findings: NOTICING_FINDINGS,
    existingMessage: { id: 'm1', state: 'DRAFT', body: 'HIS OWN WORDS', sentAt: null, editedAt: new Date(), inviteBody: null },
  });
  const out = await L.draftFor(db, 'p1', 'EMAIL');
  assert.equal(out.body, 'HIS OWN WORDS');
  assert.equal(db.writes.updated, 0);
  assert.equal(db.writes.created, 0);
});

test('a sent message is returned untouched', async () => {
  const db = fakeDb({
    prospect: PROSPECT, contact: DALE, findings: NOTICING_FINDINGS,
    existingMessage: { id: 'm1', state: 'SENT', body: 'WHAT WENT OUT', sentAt: new Date(), editedAt: null, inviteBody: null },
  });
  const out = await L.draftFor(db, 'p1', 'EMAIL');
  assert.equal(out.body, 'WHAT WENT OUT');
  assert.equal(db.writes.updated, 0);
  assert.equal(db.writes.created, 0);
});

test('an unsent, untouched draft IS rewritten, and carries the noticing', async () => {
  const db = fakeDb({
    prospect: PROSPECT, contact: DALE, findings: NOTICING_FINDINGS,
    existingMessage: { id: 'm1', state: 'DRAFT', body: 'STALE WORDING', sentAt: null, editedAt: null, inviteBody: null },
  });
  await L.draftFor(db, 'p1', 'EMAIL');
  assert.equal(db.writes.updated, 1);
  assert.ok(db.writes.lastUpdate.data.body.includes(GOOD_SENTENCE));
  assert.ok(!db.writes.lastUpdate.data.body.includes(C.TRADES.accounting.week));
});

test('with no noticing on file the same rewrite keeps the trade sentence', async () => {
  const db = fakeDb({
    prospect: PROSPECT, contact: DALE, findings: [],
    existingMessage: { id: 'm1', state: 'DRAFT', body: 'STALE WORDING', sentAt: null, editedAt: null, inviteBody: null },
  });
  await L.draftFor(db, 'p1', 'EMAIL');
  assert.equal(db.writes.updated, 1);
  assert.ok(db.writes.lastUpdate.data.body.includes(C.TRADES.accounting.week));
});

// ---------------------------------------------------------------------------
// 6. THE LIBRARY IS THE BENCHMARK (2026-09-02, second amendment). Every named
//    job maps to a type in toolLibrary.js or it does not qualify — there is
//    no other test of what software can do. Being on the phone is not
//    disqualifying; a one-off interaction and a hand on an object are.

const SHIPPING_PAGES = [
  {
    url: 'https://packrite.example/',
    title: 'PackRite Shipping',
    text: 'PackRite packs and ships anything from artwork to antiques. We pack '
      + 'every item by hand with custom crating. If a shipment is damaged, we '
      + 'file the carrier claim for you and keep you posted until it is paid. '
      + 'We assist with international shipping customs forms and advise you on '
      + 'the best carrier for every destination. Customers get an emailed '
      + 'update at drop-off, in transit and on delivery, and our front counter '
      + 'answers tracking questions all day long.',
  },
];

const SHIPPING_EVIDENCE = {
  name: 'PackRite Shipping',
  trade: 'shipping',
  theirWork: 'pack and ship parcels and freight',
  selfDescription: null,
  toolsInUse: null,
  teamSize: 3,
  yearsInBusiness: 12,
  people: [],
  theyRun: [],
  pages: SHIPPING_PAGES,
};

test('a job that maps to no type in the library is rejected', async () => {
  const offMenu = {
    areas: [{
      job: 'picking which carrier each package ships with',
      type: 'carrier_selection',
      quote: 'advise you on the best carrier for every destination',
    }],
  };
  const ask = stubReader([offMenu, offMenu]);
  const res = await N.askForNoticing({ evidence: SHIPPING_EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.match(res.couldNotTell, /not in the library/);
  assert.equal(ask.prompts.length, 2);
  // the retry named the bad key so the reader could map or drop the job
  assert.ok(ask.prompts[1].includes('carrier_selection'));
});

test('an off-menu answer mapped properly on the second try goes on', async () => {
  const offMenu = {
    areas: [{ job: 'picking carriers', type: 'carrier_selection', quote: 'advise you on the best carrier for every destination' }],
  };
  const claims = {
    areas: [{
      job: 'filing carrier claims and the updates around them',
      type: 'claims_and_billing_codes',
      quote: 'we file the carrier claim for you and keep you posted until it is paid',
    }],
  };
  const recur = { verdicts: [{ recurs: 'yes', why: 'a claim for every damaged shipment, the same chase each time', plainly: 0.8 }] };
  const write = {
    sentence: 'When a shipment gets damaged, you are the one filing the carrier claim and keeping the customer posted until it settles.',
    sure: 0.85,
  };
  const res = await N.askForNoticing({ evidence: SHIPPING_EVIDENCE, ask: stubReader([offMenu, claims, recur, write]) });
  assert.equal(res.sentence, write.sentence);
  assert.equal(res.jobs.length, 1);
  assert.equal(res.jobs[0].type, 'claims_and_billing_codes');
  assert.equal(res.jobs[0].url, SHIPPING_PAGES[0].url);
});

test('a repeated phone job PASSES: being on the phone with customers is not disqualifying', async () => {
  const phones = {
    areas: [{
      job: 'answering tracking questions at the counter and on the phone all day',
      type: 'phone_answering',
      quote: 'answers tracking questions all day long',
    }],
  };
  const recur = { verdicts: [{ recurs: 'yes', why: 'all day long, the same tracking question', plainly: 0.9 }] };
  const write = {
    sentence: 'The tracking questions come in all day, and somebody at your counter answers every one of them.',
    sure: 0.85,
  };
  const res = await N.askForNoticing({ evidence: SHIPPING_EVIDENCE, ask: stubReader([phones, recur, write]) });
  assert.equal(res.sentence, write.sentence);
  assert.equal(res.jobs[0].type, 'phone_answering');
});

test('the find prompt hands over the whole library menu and its rules', () => {
  const prompt = N.promptToFind(SHIPPING_EVIDENCE);
  for (const [key, t] of Object.entries(T.TYPES)) {
    assert.ok(prompt.includes(`- ${key} (${t.department}): ${t.label}`), `menu is missing ${key}`);
  }
  assert.match(prompt, /maps to one of these type keys/);
  assert.match(prompt, /Repeated calls/);
  assert.match(prompt, /one-off interaction that does not repeat/);
  assert.match(prompt, /physically handling an object/);
  assert.match(prompt, /No software packs a box/);
  assert.match(prompt, /services menu says what they will do/);
});

// ---------------------------------------------------------------------------
// 7. THE RECURRENCE TEST: a separate second call, blind to the first call's
//    reasoning. An advertised service is never on its own evidence of
//    recurrence; a one-off interaction does not recur; a failing job drops.

test('a job resting only on an advertised service is rejected by the second check', async () => {
  const customs = {
    areas: [{
      job: 'preparing international customs paperwork',
      type: 'drafting_and_documents',
      quote: 'We assist with international shipping customs forms',
    }],
  };
  const recurNo = {
    verdicts: [{ recurs: 'no', why: 'a services menu line, no evidence it happens many times a week', plainly: 0.1 }],
  };
  const ask = stubReader([customs, recurNo]);
  const res = await N.askForNoticing({ evidence: SHIPPING_EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.match(res.couldNotTell, /failed the recurrence test/);
  assert.equal(ask.prompts.length, 2);          // no write call was ever made
  // the verdict travels out so it can be recorded and shown
  assert.equal(res.areas.length, 1);
  assert.equal(res.areas[0].recurs, 'no');
  assert.ok(res.areas[0].recursWhy);
});

test('a one-off counter interaction is rejected: it maps, but it does not recur', async () => {
  const advice = {
    areas: [{
      job: 'advising each customer which carrier to use',
      type: 'knowledge_lookup',
      quote: 'advise you on the best carrier for every destination',
    }],
  };
  const recurNo = {
    verdicts: [{ recurs: 'no', why: 'a one-off judgement shaped by each customer, not the same job repeating', plainly: 0.15 }],
  };
  const res = await N.askForNoticing({ evidence: SHIPPING_EVIDENCE, ask: stubReader([advice, recurNo]) });
  assert.ok(res.couldNotTell);
  assert.match(res.couldNotTell, /failed the recurrence test/);
  assert.equal(res.areas[0].recurs, 'no');
});

test("the recurrence check sees the trade and the jobs, never the pages or the first call's reasoning", async () => {
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, WRITE_GOOD]);
  await N.askForNoticing({ evidence: EVIDENCE, ask });
  const recurPrompt = ask.prompts[1];
  assert.match(recurPrompt, /trade: accounting/);
  assert.ok(recurPrompt.includes('chasing clients for the organizers they never sent'));
  assert.ok(recurPrompt.includes('mail or fax it to our office with your documents'));
  assert.match(recurPrompt, /ADVERTISED SERVICE/);
  assert.match(recurPrompt, /many times a week/);
  assert.ok(!recurPrompt.includes('[PAGE'));               // never the pages
  assert.ok(!recurPrompt.includes('Smith & Co CPA'));      // not even the name
});

test('a job failing recurrence is dropped and the rest go on', async () => {
  const two = {
    areas: [
      { job: 'chasing clients for the organizers they never sent', type: 'document_collection', quote: GOOD_QUOTE },
      { job: 'preparing payroll offered on the site', type: 'reporting', quote: 'monthly bookkeeping and payroll' },
    ],
  };
  const verdicts = {
    verdicts: [
      { recurs: 'yes', why: 'every client, every season', plainly: 0.9 },
      { recurs: 'no', why: 'an advertised service with nothing showing volume', plainly: 0.2 },
    ],
  };
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask: stubReader([two, verdicts, WRITE_GOOD]) });
  assert.equal(res.sentence, GOOD_SENTENCE);
  assert.equal(res.jobs.length, 1);
  assert.equal(res.jobs[0].type, 'document_collection');
  assert.equal(res.areas.length, 2);                           // both areas kept for the record
  assert.equal(res.areas.find((a) => a.type === 'reporting').recurs, 'no');
  assert.equal(res.areas.find((a) => a.type === 'reporting').chosen, false);
});

test('a recurrence check that never answers cleanly is silence, with the areas kept', async () => {
  const ask = stubReader([FIND_CHASE, { nonsense: true }, { nonsense: true }]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.match(res.couldNotTell, /recurrence check did not answer cleanly/);
  assert.equal(res.areas.length, 1);
  assert.equal(ask.prompts.length, 3);
});

// ---------------------------------------------------------------------------
// 8. RANKED ON THE LIBRARY'S OWN EVIDENCE (Russ: "The two have to be the
//    HARDEST hitting"). Tier for the trade first; hours and how plainly the
//    pages show recurrence order things inside a tier; only the top two of
//    genuinely different types reach the email; a weak second is dropped.

test('a tier-1 area with strong recurrence beats a tier-2 area found first', () => {
  // BY_TRADE.accounting leads with document_collection and data_entry; a
  // tier-2 area found first must not keep first place on arrival order.
  const areas = [
    { job: 'answering the same questions', type: 'client_communication', department: 'admin', label: T.TYPES.client_communication.label, quote: 'q', url: 'u', plainly: 0.9, recurs: 'yes' },
    { job: 'chasing organizers', type: 'document_collection', department: 'admin', label: T.TYPES.document_collection.label, quote: 'q', url: 'u', plainly: 0.9, recurs: 'yes' },
  ];
  const ranked = N.rankAreas(areas, { trade: 'accounting', angle: 'neutral' });
  assert.equal(ranked[0].type, 'document_collection');
  assert.equal(ranked[0].tier, 1);
  assert.equal(ranked[1].tier, 2);
  assert.match(ranked[0].rankWhy, /tier 1 for accounting/);
});

test('four areas qualify: all are recorded and ranked, and the two highest-ranked reach the email', async () => {
  const four = {
    areas: [
      { job: 'answering the same questions about what to send', type: 'client_communication', quote: 'Our office will call you to confirm we received everything' },
      { job: 'chasing clients for the organizers they never sent', type: 'document_collection', quote: GOOD_QUOTE },
      { job: 'typing every paper organizer into the file', type: 'data_entry', quote: GOOD_QUOTE },
      { job: 'fielding the tax season phone', type: 'phone_answering', quote: 'answers the phone during tax season' },
    ],
  };
  const verdicts = {
    verdicts: [
      { recurs: 'yes', why: 'every engagement', plainly: 0.9 },
      { recurs: 'yes', why: 'every client, every season', plainly: 0.9 },
      { recurs: 'yes', why: 'every organizer that arrives', plainly: 0.6 },
      { recurs: 'yes', why: 'all season long', plainly: 0.95 },
    ],
  };
  const write = {
    sentence: 'Half of tax season opens with chasing the organizers clients swear they already sent. When the paper finally lands, somebody in your office still types it all in before the return can start.',
    sure: 0.85,
  };
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask: stubReader([four, verdicts, write]) });
  assert.equal(res.sentence, write.sentence);
  assert.equal(res.areas.length, 4);                       // everything found is on the card
  assert.equal(res.jobs.length, 2);                        // the email names two
  // the two tier-1 pairings for accounting outrank the tier-2 found first
  // and the tier-3 phone job, however plainly the phone recurs
  assert.equal(res.jobs[0].type, 'document_collection');
  assert.equal(res.jobs[1].type, 'data_entry');
  const byType = Object.fromEntries(res.areas.map((a) => [a.type, a]));
  assert.equal(byType.document_collection.rank, 1);
  assert.equal(byType.data_entry.rank, 2);
  assert.equal(byType.client_communication.rank, 3);       // tier 2, found first, ranked third
  assert.equal(byType.phone_answering.rank, 4);            // tier 3 almost never reaches the email
  assert.equal(byType.phone_answering.chosen, false);
  assert.equal(byType.client_communication.chosen, false);
  assert.ok(res.chosenWhy);
  assert.match(res.chosenWhy, /ranked first/);
  for (const a of res.areas) assert.ok(a.rankWhy, `${a.type} carries no reason for its rank`);
});

test('the two in the email are never the same type', () => {
  const areas = [
    { job: 'reminders before every visit', type: 'client_communication', department: 'admin', label: 'x', quote: 'q', url: 'u', plainly: 0.9, recurs: 'yes' },
    { job: 'answering the same insurance questions', type: 'client_communication', department: 'admin', label: 'x', quote: 'q', url: 'u', plainly: 0.85, recurs: 'yes' },
    { job: 'rebooking the schedule when it moves', type: 'scheduling', department: 'operations', label: 'x', quote: 'q', url: 'u', plainly: 0.7, recurs: 'yes' },
  ];
  const { chosen } = N.chooseForEmail(N.rankAreas(areas, { trade: 'dental', angle: 'neutral' }));
  assert.equal(chosen.length, 2);
  assert.notEqual(chosen[0].type, chosen[1].type);
  assert.equal(chosen[0].type, 'client_communication');
  assert.equal(chosen[1].type, 'scheduling');
});

test('a materially weaker second is dropped: the email names one, and says why', () => {
  const areas = [
    { job: 'chasing organizers', type: 'document_collection', department: 'admin', label: 'x', quote: 'q', url: 'u', plainly: 0.9, recurs: 'yes' },
    { job: 'a newsletter nobody sends', type: 'email_and_newsletter', department: 'marketing', label: 'x', quote: 'q', url: 'u', plainly: 0.3, recurs: 'yes' },
  ];
  const { chosen, why } = N.chooseForEmail(N.rankAreas(areas, { trade: 'accounting', angle: 'neutral' }));
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].type, 'document_collection');
  assert.match(why, /materially weaker/);
});

test('a tier-3 area is recorded but never paired into the email beside a stronger one', () => {
  const areas = [
    { job: 'chasing organizers', type: 'document_collection', department: 'admin', label: 'x', quote: 'q', url: 'u', plainly: 0.9, recurs: 'yes' },
    { job: 'video for the website', type: 'video_content', department: 'marketing', label: 'x', quote: 'q', url: 'u', plainly: 0.9, recurs: 'yes' },
  ];
  const { chosen, why } = N.chooseForEmail(N.rankAreas(areas, { trade: 'accounting', angle: 'neutral' }));
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].type, 'document_collection');
  assert.match(why, /nothing of a genuinely different\s+kind stood on its own/);
});

test("the library's hours figures order areas, and carry whether they are verified", () => {
  const dispatch = N.hoursFor('dispatch_and_routing');
  assert.equal(dispatch.hours, 8);                 // Housecall Pro's published figure
  assert.equal(dispatch.verified, true);           // it has a source, so it may be spoken
  assert.equal(N.hoursFor('document_collection').hours, null);
});

test('a passage promising hours back is rejected: no figure reaches the letter', async () => {
  const promising = {
    sentence: 'Somebody chases every missing organizer, and that alone could save you eight hours a week.',
    sure: 0.9,
  };
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, promising, WRITE_GOOD]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.equal(res.sentence, GOOD_SENTENCE);
  assert.match(ask.prompts[3], /promises time back/);
});

test('the write prompt names exactly the chosen work and forbids figures', () => {
  const prompt = N.promptToWrite(EVIDENCE, CHOSEN_ONE, null, []);
  assert.ok(prompt.includes('chasing clients for the organizers they never sent'));
  assert.ok(prompt.includes(CHOSEN_ONE[0].quote));
  assert.match(prompt, /Exactly this one job/);
  assert.match(prompt, /Never promise or count hours saved/);
  assert.ok(prompt.includes(`"${C.tradeCopy('accounting').week}"`));  // register only
  assert.match(prompt, /do not mention or invent any system/);        // nothing visibly run
});

// ---------------------------------------------------------------------------
// 9. What they already run is never offered back to them (2026-09-02). The
//    sentence nods to it in passing and steps PAST it, or names other work.

const PM_PAGES = [
  {
    url: 'https://rentwise.example/',
    title: 'RentWise Property Management',
    text: 'RentWise manages more than two hundred rentals across the county '
      + 'for owners who want their evenings back. Tenants can pay rent and '
      + 'submit maintenance requests any hour through our tenant portal. '
      + 'Prospective renters call our office to ask what is available and to '
      + 'schedule showings, and our team walks every applicant through the '
      + 'paperwork. Owners receive a monthly statement for every property we '
      + 'manage.',
  },
];

const PM_EVIDENCE = {
  name: 'RentWise Property Management',
  trade: 'property management',
  theirWork: 'manage rental properties for owners',
  selfDescription: null,
  toolsInUse: null,
  teamSize: 8,
  yearsInBusiness: 15,
  people: [],
  theyRun: [{ name: 'tenant portal', does: 'a portal for routine requests and payments', covers: 'enquiries' }],
  pages: PM_PAGES,
};

const FIND_PM = {
  areas: [{
    job: 'fielding calls from renters asking what is open',
    type: 'phone_answering',
    quote: 'Prospective renters call our office to ask what is available',
  }],
};
const RECUR_PM = { verdicts: [{ recurs: 'yes', why: 'two hundred rentals means the phone rings every day', plainly: 0.85 }] };

test('a business with a portal is never pitched portal work: the covered passage is refused', async () => {
  const pitching = {
    sentence: 'Tenant questions about rent and repairs still land on you every single day.',
    sure: 0.9,
  };
  const covered = {
    areas: [{
      job: 'answering tenant questions about rent and repairs',
      type: 'client_communication',
      quote: 'Tenants can pay rent and submit maintenance requests',
    }],
  };
  const stubborn = stubReader([covered, RECUR_PM, pitching, pitching]);
  const res = await N.askForNoticing({ evidence: PM_EVIDENCE, ask: stubborn });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  // the write prompt named what they run and forbade offering it back
  assert.match(stubborn.prompts[2], /tenant portal/);
  assert.match(stubborn.prompts[2], /Never offer them anything on that list/);
  // and the rejection said why, in the reader's face
  assert.match(stubborn.prompts[3], /never\s+offer what they already have/);
});

test('a job that is call-fielding AND something else is still call-fielding: the portal check sees every kind', () => {
  // The first live run let this exact shape past a portal: "availability"
  // matched a different kind of work first, and the calls were never checked.
  const label = 'taking calls about property maintenance, availability, and lease questions';
  assert.ok(N.kindsOf(label).includes('enquiries'));
  const v = N.offersWhatTheyHave(
    'Two hundred properties across six towns means you are taking calls all day about maintenance, availability, and lease questions.',
    [{ job: label, quote: 'x' }],
    PM_EVIDENCE.theyRun,
  );
  assert.equal(v.ok, false);
  assert.match(v.why, /never\s+offer what they already have/);
});

test('the sentence that nods to the portal and steps past it stands', async () => {
  const stepsPast = {
    sentence: 'When a tenant needs something routine, the portal takes it. It is the renters calling to ask what you have open that still land on you.',
    sure: 0.85,
  };
  const res = await N.askForNoticing({ evidence: PM_EVIDENCE, ask: stubReader([FIND_PM, RECUR_PM, stepsPast]) });
  assert.equal(res.sentence, stepsPast.sentence);
});

test('the write prompt lists what they visibly run, and forbids offering it back', () => {
  const chosen = [{ ...FIND_PM.areas[0], label: T.TYPES.phone_answering.label, department: 'operations', url: PM_PAGES[0].url }];
  const prompt = N.promptToWrite(PM_EVIDENCE, chosen, null, []);
  assert.ok(prompt.includes('tenant portal (a portal for routine requests and payments)'));
  assert.match(prompt, /Never offer them anything on that list/);
  assert.match(prompt, /step PAST it/);
});

test('what they already run is read from findings, the record, and their own pages', async () => {
  const db = {
    finding: {
      findMany: async () => [
        { field: 'toolInUse', value: 'Calendly' },
        { field: 'toolInUse', value: 'Mailchimp' },
        { field: 'toolGone', value: 'Podium' },        // newest first: gone wins
        { field: 'toolInUse', value: 'Podium' },       // the older arrival, kept but outvoted
      ],
    },
  };
  const runs = await N.whatTheyAlreadyRun(db, 'p1', { toolsInUse: 'QuickBooks Online' }, PM_PAGES);
  const names = runs.map((r) => r.name);
  assert.ok(names.includes('Calendly'));
  assert.ok(names.includes('QuickBooks Online'));                 // the record's fast copy joins in
  assert.ok(names.some((n) => /tenant portal/i.test(n)));         // read off their own stored words
  assert.ok(!names.includes('Podium'));                           // recorded gone on a later visit
  assert.equal(runs.find((r) => r.name === 'Calendly').covers, 'scheduling');
});

// ---------------------------------------------------------------------------
// 10. Two jobs when both stand, more room but never a paragraph, and every
//     area recorded through the append-only store.

test('two genuinely different jobs stand together, each on its own words', async () => {
  const both = {
    areas: [
      { job: 'chasing clients for the organizers they never sent', type: 'document_collection', quote: 'mail or fax it to our office with your documents' },
      { job: 'typing every paper organizer into the file', type: 'data_entry', quote: GOOD_QUOTE },
    ],
  };
  const verdicts = {
    verdicts: [
      { recurs: 'yes', why: 'every client, every season', plainly: 0.85 },
      { recurs: 'yes', why: 'every organizer that arrives', plainly: 0.8 },
    ],
  };
  const write = {
    sentence: 'Half of tax season opens with chasing the organizers clients swear they already sent. When the paper finally lands, somebody in your office still types it all in before the return can start.',
    sure: 0.85,
  };
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask: stubReader([both, verdicts, write]) });
  assert.equal(res.sentence, write.sentence);
  assert.equal(res.jobs.length, 2);
  assert.equal(res.jobs[0].url, PAGES[0].url);
  assert.equal(res.jobs[1].url, PAGES[0].url);
});

test('two jobs earn a little more room, and never a paragraph', () => {
  const two = [{ job: 'chasing organizers', quote: 'q' }, { job: 'typing them in', quote: 'q' }];
  const threeShort = 'Somebody chases every missing organizer before the day starts. The paper still gets typed in by hand. And the reminder calls happen when there is a spare minute.';
  assert.equal(N.passable(threeShort, { jobs: two }).ok, true);
  assert.equal(N.passable(threeShort).ok, false);              // one job: two sentences at the very most

  const wide = `When the organizers finally arrive by mail or fax, somebody in your office sits down and types every line of them into the file before any return can start moving. ${'And the follow up calls to clients who have not sent theirs yet happen one at a time, whenever there is a spare minute between appointments in the middle of tax season. '.repeat(2)}`.trim();
  assert.ok(wide.length > 400);
  assert.equal(N.passable(wide, { jobs: two }).ok, false);     // even two jobs never a paragraph
});

test('every area is recorded through the append-only store: the card gets everything, the email two', async () => {
  const created = [];
  const db = {
    reading: {
      create: async ({ data }) => ({ id: 'r1', ...data }),
      update: async (args) => args,
    },
    finding: { create: async ({ data }) => { created.push(data); return data; } },
  };
  const areas = [
    { job: 'chasing organizers', type: 'document_collection', department: 'admin', label: 'Collecting documents from clients', quote: GOOD_QUOTE, url: PAGES[0].url, recurs: 'yes', recursWhy: 'every client', plainly: 0.9, tier: 1, hours: null, hoursVerified: null, rank: 1, rankWhy: 'tier 1 for accounting', chosen: true },
    { job: 'typing them in', type: 'data_entry', department: 'admin', label: 'Typing in what arrives', quote: GOOD_QUOTE, url: PAGES[0].url, recurs: 'yes', recursWhy: 'every organizer', plainly: 0.8, tier: 1, hours: null, hoursVerified: null, rank: 2, rankWhy: 'tier 1 for accounting', chosen: true },
    { job: 'confirmation calls', type: 'client_communication', department: 'admin', label: 'Reminders, updates and answering the same questions', quote: 'Our office will call you to confirm', url: PAGES[0].url, recurs: 'yes', recursWhy: 'every engagement', plainly: 0.7, tier: 2, hours: null, hoursVerified: null, rank: 3, rankWhy: 'tier 2 for accounting', chosen: false },
    { job: 'payroll on the menu', type: 'reporting', department: 'finance', label: 'Putting numbers together for somebody', quote: 'monthly bookkeeping and payroll', url: PAGES[0].url, recurs: 'no', recursWhy: 'advertised only', plainly: 0.2, tier: null, hours: null, hoursVerified: null, rank: null, rankWhy: null, chosen: false },
  ];
  await N.recordNoticing(db, 'p1', {
    sentence: GOOD_SENTENCE,
    jobs: [
      { job: 'chasing organizers', quote: GOOD_QUOTE, url: PAGES[0].url, type: 'document_collection' },
      { job: 'typing them in', quote: GOOD_QUOTE, url: PAGES[0].url, type: 'data_entry' },
    ],
    areas,
    chosenWhy: 'the two tier-1 pairings for accounting, each plainly recurring',
    url: PAGES[0].url,
    quote: GOOD_QUOTE,
    confidence: 0.9,
    angle: 'neutral',
  });
  assert.deepEqual(created.map((f) => f.field), [
    'noticing', 'noticingAngle', 'noticingJob', 'noticingJob',
    'noticingArea', 'noticingArea', 'noticingArea', 'noticingArea',
    'noticingChoice',
  ]);
  for (const j of created.filter((f) => f.field === 'noticingJob')) {
    assert.equal(j.status, 'inferred');
    assert.ok(j.quote);                     // no fact without a source
  }
  const recorded = created.filter((f) => f.field === 'noticingArea').map((f) => JSON.parse(f.value));
  assert.equal(recorded.length, 4);                        // everything found, chosen or not
  assert.equal(recorded.filter((a) => a.chosen).length, 2);
  assert.equal(recorded.find((a) => a.type === 'reporting').recurs, 'no');
  assert.equal(recorded.find((a) => a.type === 'reporting').chosen, false);
  for (const f of created.filter((x) => x.field === 'noticingArea')) assert.ok(f.quote);
  assert.equal(created.find((f) => f.field === 'noticingChoice').value,
    'the two tier-1 pairings for accounting, each plainly recurring');
});

test('a fallback still records what was found: the failed areas are findings too', async () => {
  const created = [];
  const db = {
    reading: {
      create: async ({ data }) => ({ id: 'r1', ...data }),
      update: async (args) => args,
    },
    finding: { create: async ({ data }) => { created.push(data); return data; } },
  };
  await N.recordNoticing(db, 'p1', {
    couldNotTell: 'every named job failed the recurrence test',
    areas: [{
      job: 'customs paperwork', type: 'drafting_and_documents', department: 'operations',
      label: 'Producing the documents the work runs on',
      quote: 'We assist with international shipping customs forms', url: SHIPPING_PAGES[0].url,
      recurs: 'no', recursWhy: 'a services menu line', plainly: 0.1,
      tier: null, hours: null, hoursVerified: null, rank: null, rankWhy: null, chosen: false,
    }],
  });
  assert.deepEqual(created.map((f) => f.field), ['noticing', 'noticingArea']);
  assert.equal(created[0].status, 'could_not_tell');
  assert.equal(created[0].value, null);                    // absence recorded as itself
  const area = JSON.parse(created[1].value);
  assert.equal(area.recurs, 'no');
  assert.ok(created[1].quote);
});

// ---------------------------------------------------------------------------
// 5. Russ's other five parts are byte-identical before and after.

test('only the trade-week sentence moves; every other byte of the letter stands', () => {
  const p = { name: 'Smith & Co CPA', trade: 'accounting', email: 'info@smithcpa.example' };
  const before = draftFirstContact(p, []);
  const after = draftFirstContact({ ...p, noticing: GOOD_SENTENCE }, []);

  assert.equal(before.subject, after.subject);

  const a = before.body.split('\n\n');
  const b = after.body.split('\n\n');
  assert.equal(a.length, b.length);

  // Part 2 is `${week} ${concession}`. The week is replaced; the concession
  // that follows it — Russ's line, seeded by the business name — stands.
  const week = C.TRADES.accounting.week;
  assert.ok(a[2].startsWith(week));
  const concession = a[2].slice(week.length);
  assert.equal(b[2], `${GOOD_SENTENCE}${concession}`);

  // Every other part: greeting, WHO_I_AM, WHY_ME, THE_OFFER, ASK_DAY0 and
  // the sign-off, byte for byte.
  for (let i = 0; i < a.length; i++) {
    if (i === 2) continue;
    assert.equal(b[i], a[i], `part ${i} of the letter moved`);
  }
});
