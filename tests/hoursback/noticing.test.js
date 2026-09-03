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
//  10. WHOSE WORK IT IS (2026-09-02, third amendment): work belonging to the
//      business stands even when a named person appears beside it, the
//      passage never names that person, and a genuine refusal records its
//      reason against the area and tries the next-ranked area before silence
//  11. WHAT IS NEVER A JOB (third amendment): a language offered, an
//      accreditation, a licence or registration number, a slogan, an award,
//      a years-in-business claim or a payment method accepted is never the
//      job named — a thin site gets silence, not a grab at what stands out

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
// The reader's whole result, not just the answer inside it — so a test can
// stage a reply that could not be read, or a reader that is out of allowance.
const UNREADABLE = { answer: null, why: 'the reader answered with no JSON' };
function rawReader(results) {
  const prompts = [];
  const ask = async (prompt) => {
    prompts.push(prompt);
    return results[Math.min(prompts.length - 1, results.length - 1)];
  };
  ask.prompts = prompts;
  return ask;
}

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

// GROUNDING IS ABOUT THEIR SITE, NOT THEIR WORDING (Russ, 2026-09-02).
//
// This once demanded the quoted words appear character for character on a
// stored page, and threw away six good businesses in one run — "answering
// incoming phone calls", "processing rental applications" — all plainly true,
// none said in those words. Almost everything here is inferred. What must
// still hold is that the passage rests on a page of THEIRS that we actually
// read, so nothing is written about a business we have not seen.
test('an area pointing at no page of theirs is rejected', async () => {
  const nowhere = {
    areas: [{
      job: 'shredding organizers', type: 'document_collection',
      quote: 'zzz qqq xxx vvv', restsOn: 'https://somebody-else.example/nope',
    }],
  };
  const ask = stubReader([nowhere, nowhere]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.match(res.couldNotTell, /points at no page of theirs/);
  assert.equal(ask.prompts.length, 2);
});

test('an inferred job standing on a page of theirs is kept, even in different words', () => {
  const pages = [{ url: 'https://smithcpa.example/contact', text: 'Call the office and we will book you a time to come in.' }];
  // Not their wording. It is what a business like this plainly does, and it
  // names a page we hold — that is footing enough.
  const g = N.groundingPage('you take booking calls all week', pages, 'https://smithcpa.example/contact');
  assert.ok(g, 'a job read from a page of theirs stands');
  assert.equal(g.footing, 'read from', 'and the record says how firm the footing was');
});

// THEIR WEEK COMES FIRST (Russ, 2026-09-03). The letter used to introduce
// Russ and only then say anything about the reader. Their own week now opens
// it — the paragraph straight after the greeting — and the introduction comes
// second, having earned itself.
test('with no noticing the letter opens on the trade week, straight after the greeting', () => {
  const p = { name: 'Smith & Co CPA', trade: 'accounting', email: 'info@smithcpa.example' };
  const built = draftFirstContact(p, []);
  const parts = built.body.split('\n\n');
  assert.match(parts[0], /^(Hi .+,|Hello,)$/, 'the greeting is still first');
  assert.ok(parts[1].startsWith(C.TRADES.accounting.week), `opened with: ${parts[1].slice(0, 60)}`);
  // and who Russ is comes next, not before them
  assert.match(parts[2], /Central Oregon/);
});

// THE NOTE GETS THE SAME SENTENCE AS THE EMAIL (Russ, 2026-09-03). It always
// used the trade's generic week, even where the business's own site had been
// read. Russ sends both to the same person by hand, so a personal email and a
// generic note is worse than either on its own.
test('the LinkedIn note carries the business\'s own sentence, not the trade line', () => {
  const { draftLinkedIn } = require('../../src/hoursback/crm/firstContact.js');
  const p = { name: 'Smith & Co CPA', trade: 'accounting', email: 'info@smithcpa.example' };
  const generic = draftLinkedIn(p, []);
  assert.ok(generic.body.includes(C.TRADES.accounting.week), 'with no sentence, the trade line stands');

  const theirs = draftLinkedIn({ ...p, noticing: GOOD_SENTENCE }, []);
  assert.ok(theirs.body.includes(GOOD_SENTENCE), 'their own sentence reached the note');
  assert.ok(!theirs.body.includes(C.TRADES.accounting.week), 'and it replaced the trade line');
  // the concession that follows it is untouched, exactly as in the email
  assert.match(theirs.body, /solved already|handled|covered by now/);
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
  // It must REASON about the business, not hunt for a stated frequency. The
  // rule it once carried — "an advertised service is never on its own evidence
  // of recurrence" — became "only accept what the page states outright", which
  // is keyword matching in a different coat and threw away four of six good
  // businesses in one run (Russ, 2026-09-02).
  assert.match(recurPrompt, /JUDGE THE WORK, NOT THE WORDING/);
  assert.match(recurPrompt, /never state a number|never states a number/i);
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
  assert.match(prompt, /Never promise or count hours/);
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
  // OFFERING WHAT THEY HAVE IS THE WRONG WORK, NOT WRONG WORDING (2026-09-02).
  //
  // It used to rewrite the same work a second time, burn both attempts and
  // leave the business with nothing — three good businesses lost their
  // passage that way in one batch. It moves to the next-ranked work instead,
  // so there is no second attempt at this one. Here the business had only the
  // one area, so the trade sentence rightly stands.
  // Four asks: find, recur, write, and then one asking whether the portal
  // GENUINELY does that job (2026-09-03). Here it does — tenants submit
  // maintenance requests through it — so the work is rightly turned away, and
  // the same covered work is never written a second time.
  assert.equal(stubborn.prompts.length, 4, 'the same covered work is not written twice');
  assert.match(stubborn.prompts[3], /Does the tool they already have ACTUALLY do that job/);
  assert.match(res.couldNotTell, /already|refus|did not stand/i, 'and the reason names why');
});

// A TOOL DOES NOT GET TO VETO WORK IT DOES NOT DO (Russ, 2026-09-03).
//
// Team Wieche have a portal for routine requests and payments, and three good
// areas in a row were thrown out as "already handled" — including ANSWERING
// THE PHONE. A portal does not answer phones. The word-match cannot tell the
// difference and should never have been the one deciding.
test('a tool that does not really do the job never blocks it', async () => {
  const onThePhone = {
    sentence: 'The calls still come in all day and somebody there picks up every one.',
    sure: 0.9,
  };
  const better = {
    sentence: 'Routine requests go through the portal. It is the calls that still land on somebody all day.',
    sure: 0.9,
  };
  const phoneWork = {
    areas: [{
      job: 'answering tenant calls about rent and repairs',
      type: 'client_communication',
      quote: 'Tenants can pay rent and submit maintenance requests',
    }],
  };
  const ask = stubReader([
    phoneWork, RECUR_PM,
    onThePhone,                             // write
    { alreadyDoes: false, why: 'a portal does not answer the telephone' },
    { passes: true },                       // the stranger reading it cold
  ]);
  const res = await N.askForNoticing({ evidence: PM_EVIDENCE, ask });

  assert.equal(res.sentence, onThePhone.sentence, 'the sentence stood, unchanged');
  // it was ASKED, plainly, about the real world
  assert.match(ask.prompts[3], /ACTUALLY do that job/);
  assert.ok(ask.prompts[3].includes('answering tenant calls about rent and repairs'));
  // A TOOL THAT DOES NOT DO THE JOB IS NOT A REASON TO CHANGE A WORD
  // (2026-09-03). This used to send the sentence back to be written again,
  // spending both of the business's attempts on a sentence with nothing
  // wrong with it — Obsidian Real Estate lost a passage it had passed with
  // hours earlier, exactly that way.
  assert.equal(ask.prompts.length, 5, 'find, recur, write, the tool question, the cold reader');
  assert.ok(!ask.prompts.some((p) => /does not cover this work/.test(p)),
    'nothing was sent back to be rewritten');
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

  // Part 1 is `${week} ${concession}` — their week opens the letter now
  // (2026-09-03). The week is replaced; the concession that follows it —
  // Russ's line, seeded by the business name — stands.
  const week = C.TRADES.accounting.week;
  assert.ok(a[1].startsWith(week));
  const concession = a[1].slice(week.length);
  assert.equal(b[1], `${GOOD_SENTENCE}${concession}`);

  // Every other part: greeting, who Russ is and why him, THE_OFFER, ASK_DAY0
  // and the sign-off, byte for byte.
  for (let i = 0; i < a.length; i++) {
    if (i === 1) continue;
    assert.equal(b[i], a[i], `part ${i} of the letter moved`);
  }
});

// ---------------------------------------------------------------------------
// 10. WHOSE WORK IT IS (2026-09-02, third amendment, after Obsidian Real
//     Estate). Work that plainly belongs to the business qualifies even when
//     a named person appears beside it on their pages; the passage is written
//     about the business and never names that person. A genuine refusal —
//     work personal to somebody who is not the recipient — records its reason
//     against that area and the next-ranked area is tried before silence.

const OBSIDIAN_PAGES = [
  {
    url: 'https://obsidianre.example/',
    title: 'Obsidian Real Estate Group',
    text: 'Obsidian Real Estate Group handles residential sales, property '
      + 'management, rentals and business sales across Central Oregon. Call '
      + 'our office about any listing and we will get back to you the same '
      + 'day. Cole Conroy heads our rental desk. Every enquiry about a rental '
      + 'or a managed property comes through the office line, and our team '
      + 'follows up on each one. Our office keeps every showing on the '
      + 'calendar, walks each applicant through the paperwork, and owners '
      + 'receive a monthly statement for every property we manage.',
  },
];

const OBSIDIAN_EVIDENCE = {
  name: 'Obsidian Real Estate Group',
  trade: 'real estate',
  theirWork: 'residential sales, property management, rentals and business sales',
  selfDescription: null,
  toolsInUse: null,
  teamSize: 9,
  yearsInBusiness: 8,
  people: [
    { name: 'Ann Alder', role: 'Principal Broker' },
    { name: 'Cole Conroy', role: 'Broker' },
  ],
  theyRun: [],
  pages: OBSIDIAN_PAGES,
};

const FIND_LEADS = {
  areas: [{
    job: 'following up on rental and property enquiries',
    type: 'lead_follow_up',
    quote: 'Every enquiry about a rental or a managed property comes through the office line',
  }],
};
const RECUR_LEADS = { verdicts: [{ recurs: 'yes', why: 'enquiries come through the office line every day', plainly: 0.85 }] };

test('work belonging to the business stands beside a named person, and the passage never names them', async () => {
  const namesCole = { sentence: 'Cole Conroy chases every rental enquiry that comes through your office line.', sure: 0.9 };
  const aboutTheBusiness = { sentence: 'Every rental enquiry comes through the office line, and somebody there has to get back to each one the same day.', sure: 0.85 };
  const ask = stubReader([FIND_LEADS, RECUR_LEADS, namesCole, aboutTheBusiness]);
  const res = await N.askForNoticing({ evidence: OBSIDIAN_EVIDENCE, roleTitle: 'Principal Broker', ask });
  assert.equal(res.sentence, aboutTheBusiness.sentence);
  assert.ok(!/cole|conroy/i.test(res.sentence));
  assert.equal(res.jobs[0].type, 'lead_follow_up');
  assert.equal(res.areas[0].refused, null);                 // qualified work was never refused
  // the write prompt carried the rule in plain words
  assert.match(ask.prompts[2], /WHOSE WORK IT IS/);
  assert.match(ask.prompts[2], /never name that person/);
  // the passage naming Cole was rejected in code, reason in the reader's face
  assert.match(ask.prompts[3], /names Cole Conroy/);
});

test('a genuine refusal records its reason and the next-ranked area is tried before silence', async () => {
  const twoRanks = {
    areas: [
      { job: 'chasing clients for the organizers they never sent', type: 'document_collection', quote: GOOD_QUOTE },
      { job: 'staying in front of past clients between seasons', type: 'email_and_newsletter', quote: 'serving individuals and small businesses' },
    ],
  };
  const strongAndWeak = {
    verdicts: [
      { recurs: 'yes', why: 'every client, every season', plainly: 0.9 },
      { recurs: 'yes', why: 'past clients pile up year on year', plainly: 0.3 },
    ],
  };
  const refusal = { cannotTell: "chasing organizers is Dale Smith's own licensed casework, not something the office handles" };
  const nextArea = {
    sentence: 'Clients hear from you at tax time and then not again until the next one, and staying in front of them in between falls to whoever has a spare hour.',
    sure: 0.8,
  };
  const ask = stubReader([twoRanks, strongAndWeak, refusal, nextArea]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.equal(res.sentence, nextArea.sentence);
  assert.equal(res.jobs.length, 1);
  assert.equal(res.jobs[0].type, 'email_and_newsletter');
  assert.equal(ask.prompts.length, 5);            // find, recur, refused write, next write, the judge
  assert.ok(ask.prompts[3].includes('staying in front of past clients'));
  // the refusal landed on the area it refused, kept with it forever
  const doc = res.areas.find((a) => a.type === 'document_collection');
  assert.equal(doc.refused, true);
  assert.match(doc.refusedWhy, /licensed casework/);
  assert.equal(doc.chosen, false);
  const news = res.areas.find((a) => a.type === 'email_and_newsletter');
  assert.equal(news.chosen, true);
  assert.equal(news.refused, null);
  // and the choice explains the road taken
  assert.match(res.chosenWhy, /did not stand/);
  assert.ok(res.chosenWhy.includes('chasing clients for the organizers'));
});

// A REJECTION IS NOT A DEAD END EITHER (2026-09-02). A refusal already moved
// on to the next-ranked area; a rejection — the writer's WORDING failing the
// checks twice — still ended the whole attempt, so a business lost its
// passage over a form of words rather than over its work. Both endings now
// walk on.
// A STUMBLE IS NOT AN ANSWER (2026-09-02). A reply that could not be read —
// prose where JSON was asked for — used to end the whole attempt on the spot
// and the business kept its generic trade sentence. Three in one batch of
// nineteen, two of them holding thirty pages of their own words. The reader
// tripped; the business had plenty to say. So it is asked again, and the
// stumble does not spend one of the tries the business gets to be understood.
// THE JUDGE (Russ, 2026-09-03).
//
// Every other check is a BAN. A sentence can pass all twelve of them and
// still be worthless: "the intake repeats, but nothing else does" broke no
// rule and landed nothing. So one check asks whether the sentence did its
// job, reading it the way the recipient reads — cold, with no context.
test('a sentence that would not make the reader stop is sent back, and the work is kept', async () => {
  const flat = { sentence: 'The intake repeats, but nothing else does.', sure: 0.9 };
  const fails = { passes: false, why: 'that describes a process, nobody is in it and nothing is being lost' };
  const lands = { sentence: 'Somebody there is typing the same handful of details in all day.', sure: 0.9 };
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, flat, fails, lands, { passes: true }]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });

  assert.equal(res.sentence, lands.sentence);
  // the judge was given the sentence, and NOT the instructions or the evidence
  const judgePrompt = ask.prompts[3];
  assert.ok(judgePrompt.includes(flat.sentence), 'the judge saw the sentence');
  assert.ok(!judgePrompt.includes(GOOD_QUOTE), 'the judge never saw the pages');
  assert.ok(!/HOW IT SOUNDS|WHAT THIS SENTENCE IS FOR/.test(judgePrompt),
    'the judge never saw the instructions it was written under');
  assert.match(judgePrompt, /sat in my chair|sat in a\s+place like yours/);
  // the rewrite carried the reader's OWN reason back, in their words
  assert.match(ask.prompts[4], /nobody is in it/);
  // and the work was never blamed: the same job was said again, not dropped
  assert.equal(res.jobs[0].type, 'document_collection');
  assert.equal(res.areas[0].refused, null);
});

// AND THE PAIN HAS TO BE LIFTABLE (Russ, 2026-09-03: "is the pain still tied
// to the automation and/or AI solution?"). The work is CHOSEN from the tool
// library, so it always could be — but nothing checked the finished sentence,
// which could drift onto real pain nothing can help with. True and useless.
test('the cold reader also asks whether anything could take the work off them', () => {
  const p = N.promptToJudge('You are the one deciding which carrier fits each package.', 'shipping');
  assert.match(p, /could actually be taken off you/);
  assert.match(p, /judgement, the/);
  assert.match(p, /true and/);
  assert.match(p, /it is useless/);
});

// MAKE IT THEIRS (Russ, 2026-09-03). Four businesses in a row came back with
// nothing, and the reason was always the same: "could describe any sales
// business in America", "generic to every HVAC company you have ever heard
// of". The reader was right to bin them. The fault was upstream — the writer
// was never told to reach into their pages and use something only they have.
// THE STANDARD BELONGS WHERE THE WORK IS CHOSEN (Russ, 2026-09-03). Every
// fix went into the writing step, and the failures kept coming from the
// finding step: Postal Connections was offered "choosing the right carrier"
// (the skilled part Russ ruled out weeks ago) and Obsidian "following up with
// clients" (true of every broker alive). No sentence could have saved either.
test('the finding prompt states the bar before a single area is named', () => {
  const p = N.promptToFind(EVIDENCE);
  // the whole brief: why the email exists, before any rule about the work
  assert.match(p, /WHAT THIS IS FOR, BEFORE ANYTHING ELSE/);
  assert.match(p, /sat in my chair/);
  assert.match(p, /fifteen minutes/);
  assert.match(p, /sells nothing and names no price/);
  // all four bars, stated
  assert.match(p, /WHAT MAKES WORK WORTH NAMING/);
  assert.match(p, /SOFTWARE COULD ACTUALLY TAKE IT/);
  assert.match(p, /IT COSTS SOMEBODY SOMETHING YOU CAN NAME/);
  assert.match(p, /IT IS THEIRS, NOT THEIR TRADE/);
  assert.match(p, /IT RESTS ON THEIR OWN PAGES/);
  // and the pain is DEFINED, not left abstract
  assert.match(p, /the same thing typed twice/);
  assert.match(p, /evenings and weekends/);
  assert.match(p, /waiting while this gets done/);
  assert.match(p, /one person it always lands on/);
  // the real rejections are in it as examples, in Russ's own terms
  assert.match(p, /choosing the right carrier/);
  assert.match(p, /every broker in the country/);
  // and silence is offered as the honest alternative to a generic pick
  assert.match(p, /SILENCE IS A REAL ANSWER/);
  // the whole brief comes BEFORE the menu of work types, not after
  assert.ok(p.indexOf('WHAT THIS IS FOR') < p.indexOf('THE MENU'));
});

// RUSS'S OWN DIRECTION, SPOKEN 2026-08-26 AND NEVER PUT IN UNTIL NOW.
//
// "Only thing might be too much insight from a cold caller might be creepy...
// I might be a little suspect if someone knew what software platforms I was
// running if I didn't make it a point of broadcasting my business. It has to
// be relevant, appropriate, and tasteful." He drew the line by asking how HE
// would feel receiving it.
test('the taste line is in the instructions, at every stage that needs it', () => {
  const find = N.promptToFind(EVIDENCE);
  assert.match(find, /RELEVANT, APPROPRIATE AND TASTEFUL/);
  assert.match(find, /what they chose to publish/);
  assert.match(find, /reads as having been dug up/);
  assert.match(find, /glad someone looked, or unsettled/);
  // and the stranger reading it cold turns down anything that oversteps
  const judge = N.promptToJudge('A sentence.', 'trades');
  assert.match(judge, /knows something you never published/);
  assert.match(judge, /looking INTO you/);
});

// "Mirror and match my voice with the target... peer to peer... I'm not going
// to talk conversion and ROI to a Tire Shop, and not going to talk mundane
// accounting to a consulting firm." (Russ, spoken 2026-08-26.)
test('the writer is told to meet the reader where they work, and never to pitch', () => {
  const p = N.promptToWrite(EVIDENCE, CHOSEN_ONE, null, []);
  assert.match(p, /WHO YOU ARE TALKING TO/);
  assert.match(p, /conversion rates and/);
  assert.match(p, /tyre shop/);
  assert.match(p, /Peer to peer/);
  // "Talk to the pain without making it a sales pitch" — his words
  assert.match(p, /WITHOUT MAKING IT A PITCH/);
  assert.match(p, /reads as the opening of a sales call, it is wrong/);
});

test('the write prompt demands something only this business has', () => {
  const p = N.promptToWrite(EVIDENCE, CHOSEN_ONE, null, []);
  assert.match(p, /MAKE IT THEIRS/);
  assert.match(p, /competitor down the road/);
  // and the cost is DEFINED here too, the same list, so both stages work
  // from one statement of what the pain is (2026-09-03)
  assert.match(p, /WHAT COUNTS AS A COST/);
  assert.match(p, /the same thing typed twice/);
  assert.match(p, /evenings and weekends/);
  assert.match(p, /towns they name/);
  assert.match(p, /wrong for anybody else/);
});

// EVERY REJECTION RUSS MADE IS TEACHING MATERIAL, AND NONE OF IT WAS WRITTEN
// DOWN (2026-09-03). Each of these was written by a good reader, passed every
// mechanical check, and was thrown out by a person in that trade reading it
// cold. They belong in front of the writer, in the words they failed in.
test('the write prompt carries the real sentences that failed, and why', () => {
  const p = N.promptToWrite(EVIDENCE, CHOSEN_ONE, null, []);
  assert.match(p, /SENTENCES THAT FAILED/);
  assert.match(p, /The intake repeats, but nothing else does/);
  assert.match(p, /talks the first half back down/);
  assert.match(p, /which carrier fits each package/);
  assert.match(p, /skilled part they are paid for/);
  assert.match(p, /Following up with clients/);
  assert.match(p, /every broker in the country/);
});

test('the judge is asked about every sentence that reaches the letter', async () => {
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, WRITE_GOOD, { passes: true }]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.equal(res.sentence, GOOD_SENTENCE);
  assert.equal(ask.prompts.length, 4, 'find, recur, write, judge');
  assert.match(ask.prompts[3], /Answer with JSON only/);
});

// A judge that keeps refusing does not hold a business hostage: the work
// moves on like any other refusal, and silence is honest about why.
test('a sentence the reader keeps turning away ends in the trade sentence, saying so', async () => {
  const flat = { sentence: 'The intake repeats, but nothing else does.', sure: 0.9 };
  const fails = { passes: false, why: 'it would not make me stop reading' };
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, flat, fails, flat, fails, flat, fails]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.match(res.couldNotTell, /read it cold/);
});

test('a reply that could not be read is asked again, and does not cost the business its line', async () => {
  const ask = rawReader([UNREADABLE, { answer: FIND_CHASE }, { answer: RECUR_ONE_YES }, { answer: WRITE_GOOD }]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.equal(res.sentence, GOOD_SENTENCE);
  assert.equal(ask.prompts.length, 5, 'the stumble was retried and cost the business nothing');
  // the second ask told the reader plainly what went wrong
  assert.match(ask.prompts[1], /JSON on its own/);
});

test('a reader that will not answer readably at all ends in silence, not a crash', async () => {
  const ask = rawReader([UNREADABLE, UNREADABLE, UNREADABLE, UNREADABLE, UNREADABLE, UNREADABLE]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.match(res.couldNotTell, /no JSON/);
  assert.ok(ask.prompts.length <= 4, `it stopped asking — ${ask.prompts.length} tries`);
});

// A reader that is OUT OF ALLOWANCE is not a stumble and must never be retried
// into the ground — it is the one failure that has to stop everything.
test('a reader out of allowance stops at once and says so', async () => {
  const ask = rawReader([{ answer: null, why: 'THE READER IS OUT OF ALLOWANCE — this is not a thin website', readerExhausted: true }]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.equal(res.readerExhausted, true);
  assert.match(res.couldNotTell, /OUT OF ALLOWANCE/);
  assert.equal(ask.prompts.length, 1, 'it did not ask again');
});

test('wording rejected twice drops that area too, and the next-ranked gets its turn', async () => {
  const twoRanks = {
    areas: [
      { job: 'chasing clients for the organizers they never sent', type: 'document_collection', quote: GOOD_QUOTE },
      { job: 'staying in front of past clients between seasons', type: 'email_and_newsletter', quote: 'serving individuals and small businesses' },
    ],
  };
  const bothRecur = {
    verdicts: [
      { recurs: 'yes', why: 'every client, every season', plainly: 0.9 },
      { recurs: 'yes', why: 'past clients pile up year on year', plainly: 0.3 },
    ],
  };
  // Both goes at the first area promise time back, which the code refuses.
  const promisesHours = { sentence: 'Automating that chase would save you 5 hours a week.', sure: 0.9 };
  const promisesAgain = { sentence: 'That chase gets you back 6 hours a week.', sure: 0.9 };
  const nextArea = {
    sentence: 'Clients hear from you at tax time and then not again until the next one, and staying in front of them in between falls to whoever has a spare hour.',
    sure: 0.8,
  };
  const ask = stubReader([twoRanks, bothRecur, promisesHours, promisesAgain, nextArea]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.equal(res.sentence, nextArea.sentence);
  assert.equal(res.jobs[0].type, 'email_and_newsletter');
  assert.equal(ask.prompts.length, 6);   // find, recur, two rejected goes, the next area, the judge
  // the rejection landed on the area it belonged to, kept with it forever
  const doc = res.areas.find((a) => a.type === 'document_collection');
  assert.equal(doc.refused, true);
  assert.match(doc.refusedWhy, /no passage for it stood/);
  assert.equal(doc.chosen, false);
  assert.equal(res.areas.find((a) => a.type === 'email_and_newsletter').chosen, true);
});

test('when every qualifying area is refused, silence — with each refusal recorded against its area', async () => {
  const refusal = { cannotTell: "this is one person's own licensed work, wrong said to the recipient" };
  const ask = stubReader([FIND_CHASE, RECUR_ONE_YES, refusal]);
  const res = await N.askForNoticing({ evidence: EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.match(res.couldNotTell, /the one area that qualified did not stand/);
  assert.equal(ask.prompts.length, 3);                      // one refusal, no areas left, no retry
  assert.equal(res.areas[0].refused, true);
  assert.match(res.areas[0].refusedWhy, /own licensed work/);
  assert.equal(res.areas[0].chosen, false);
});

test('a refused area travels into the record with its reason', async () => {
  const created = [];
  const db = {
    reading: {
      create: async ({ data }) => ({ id: 'r1', ...data }),
      update: async (args) => args,
    },
    finding: { create: async ({ data }) => { created.push(data); return data; } },
  };
  await N.recordNoticing(db, 'p1', {
    couldNotTell: 'refused at the writing step for every qualifying area',
    areas: [{
      job: 'following up on enquiries', type: 'lead_follow_up', department: 'sales',
      label: 'Following up on enquiries',
      quote: 'Every enquiry comes through the office line', url: OBSIDIAN_PAGES[0].url,
      recurs: 'yes', recursWhy: 'every day', plainly: 0.85,
      tier: 1, hours: null, hoursVerified: null, rank: 1, rankWhy: 'tier 1',
      chosen: false, refused: true, refusedWhy: "one person's own caseload",
    }],
  });
  assert.deepEqual(created.map((f) => f.field), ['noticing', 'noticingArea']);
  const area = JSON.parse(created[1].value);
  assert.equal(area.refused, true);
  assert.match(area.refusedWhy, /caseload/);
});

// ---------------------------------------------------------------------------
// 11. WHAT IS NEVER A JOB (2026-09-02, third amendment, after Oscar's Auto
//     Repair — four near-identical pages, and the reader offered "Se Habla
//     Español" as the work task). A badge is never the job named, and a thin
//     site gets silence.

test('a badge is never the job: language, accreditation, licence number, slogan, award, years, payment method', () => {
  const badges = [
    { job: 'offering service in Spanish', quote: 'Se Habla Español' },
    { job: 'being ASE certified', quote: 'ASE Certified technicians' },
    { job: 'holding their contractor licence', quote: 'CCB #204158' },
    { job: 'living up to the slogan', quote: 'Fast, Fair and Friendly is our motto' },
    { job: 'winning best of Bend', quote: 'Voted Best Auto Shop 2024' },
    { job: 'being in business a long time', quote: 'over 30 years serving Central Oregon' },
    { job: 'taking cards', quote: 'We accept Visa, Mastercard and Discover' },
  ];
  for (const b of badges) assert.ok(N.notAJob(b), `"${b.quote}" should never be the job named`);
  // and real work is untouched
  assert.equal(N.notAJob({ job: 'chasing clients for the organizers they never sent', quote: GOOD_QUOTE }), null);
  assert.equal(N.notAJob(FIND_PM.areas[0]), null);
  assert.equal(N.notAJob(FIND_LEADS.areas[0]), null);
});

// THE WORD IS SOMETIMES THE PRODUCT (2026-09-02). AAA Contracting's entire
// business is issuing engineered foundation certifications. Four times over,
// a passage describing that work was thrown out as a boast about the
// business, and they kept the generic trade sentence with four good pages on
// file. A badge is a claim a business makes ABOUT itself; the same word
// naming what they sell is work.
test('a word that is their product is work, not a badge', () => {
  const theirWork = [
    { job: 'issuing engineered foundation certifications', quote: 'FHA/VA/HUD Engineered Foundation Certifications' },
    { job: 'taking certification orders through the form', quote: 'Get a manufactured home engineer foundation certification within a 2-3 day turnaround. Get Started.' },
    { job: 'booking installs across the service area', quote: 'AAA Contracting serves the I5 - Hwy 97 Corridor in Oregon from north border to south border. Please call us at 541-504-0799 if you are in outlying areas.' },
    { job: 'translating quotes into Spanish for customers', quote: 'Quotes can be sent in English or Spanish, whichever the customer asks for.' },
  ];
  for (const w of theirWork) {
    assert.equal(N.notAJob(w), null, `"${w.job}" is work, not a badge`);
  }
  // and the badge shapes still fail, because a claim about themselves reads
  // as a claim however the sentence is arranged
  assert.equal(N.notAJob({ job: 'being an ASE certified shop', quote: 'ASE Certified technicians on staff' }), 'an accreditation');
  assert.equal(N.notAJob({ job: 'being BBB accredited', quote: 'A+ rating with the Better Business Bureau' }), 'an accreditation');
});

// A long passage off a services page is allowed to mention a licence, an
// award or a card in passing. Only a SHORT quote is the reader holding up
// the badge itself as its evidence.
test('a badge in passing does not disqualify real work described around it', () => {
  const inPassing = {
    job: 'scheduling technicians across the service area',
    quote: 'Licensed and bonded, CCB #204158, and voted Best of Bend in 2024. We accept Visa and '
      + 'Mastercard. Our crews cover the whole corridor and most jobs are booked the same week, '
      + 'with the office ringing round to fit people in when a slot opens up.',
  };
  assert.equal(N.notAJob(inPassing), null);
  // the same badge offered ON ITS OWN is still refused
  assert.equal(N.notAJob({ job: 'holding their licence', quote: 'CCB #204158' }), 'a licence or registration number');
});

const OSCAR_TEXT = "Oscar's Auto Repair. Brake service and repair, oil changes, engine "
  + 'diagnostics, transmission service, tune ups, heating and cooling. Call '
  + '541 555 0100 for an appointment. Se Habla Español.';
const OSCAR_EVIDENCE = {
  name: "Oscar's Auto Repair",
  trade: 'auto',
  theirWork: 'auto repair',
  selfDescription: null,
  toolsInUse: null,
  teamSize: null,
  yearsInBusiness: null,
  people: [],
  theyRun: [],
  pages: [
    { url: 'https://oscarsauto.example/', title: "Oscar's Auto Repair", text: OSCAR_TEXT },
    { url: 'https://oscarsauto.example/services', title: 'Services', text: OSCAR_TEXT },
    { url: 'https://oscarsauto.example/contact', title: 'Contact', text: OSCAR_TEXT },
  ],
};

test('a thin site: grabbing the language badge is rejected in code, and the honest answer is silence', async () => {
  const grabs = {
    areas: [{
      job: 'serving Spanish-speaking customers',
      type: 'translation_and_accessibility',
      quote: 'Se Habla Español',
    }],
  };
  const ask = stubReader([grabs, grabs]);
  const res = await N.askForNoticing({ evidence: OSCAR_EVIDENCE, ask });
  assert.ok(res.couldNotTell);
  assert.equal(res.sentence, undefined);
  assert.match(res.couldNotTell, /not a work task/);
  assert.equal(ask.prompts.length, 2);
  // the retry named the badge so the reader could drop it or fall silent
  assert.match(ask.prompts[1], /a language offered/);
});

test('the find prompt says plainly what is never a job, and that a thin site gets silence', () => {
  const prompt = N.promptToFind(OSCAR_EVIDENCE);
  assert.match(prompt, /WHAT IS NEVER A JOB/);
  assert.match(prompt, /Se Habla Espa/);
  assert.match(prompt, /payment method accepted/);
  assert.match(prompt, /When a site is thin, the honest answer is cannotTell/);
});
