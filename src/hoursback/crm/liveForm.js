// The form Russ fills in while he is on the call.
//
// He types fast and the call is fifteen to twenty minutes, so nothing here
// asks for a sentence where a button will do. Every question that CAN be
// multiple choice is multiple choice, and every one of those has a type-in box
// for when the buttons are wrong (Russ, 2026-08-27: "Multiple choice is always
// preferable if it covers MECE solutions").
//
// What appears next depends on what was just answered. The problem they name
// decides the questions that follow, because those are the questions that
// decide which tool fixes it. The industry decides which problems appear as
// choices at all; what they already pay for shortens the whole thing.
//
// It stops when a tool can be named and defended — not at a question count and
// not on a clock. See enoughToRecommend.js.

const { BY_TRADE, TYPES, platformsFor } = require('../toolLibrary.js');
const { LEVERS } = require('./stageOne.js');

// Answers that are the same for every business, so they are buttons.
const HOW_OFTEN = [
  { value: 'every_job', label: 'Every job', perWeek: null },
  { value: 'daily', label: 'Every day', perWeek: 5 },
  { value: 'few_week', label: 'A few times a week', perWeek: 3 },
  { value: 'weekly', label: 'Once a week', perWeek: 1 },
  { value: 'monthly', label: 'Monthly', perWeek: 0.25 },
  { value: 'seasonal', label: 'Only in season', perWeek: null },
];

const ARRIVES_AS = [
  { value: 'email', label: 'Email' },
  { value: 'paper', label: 'Paper or post' },
  { value: 'phone', label: 'Phone call' },
  { value: 'form', label: 'A form on their site' },
  { value: 'text', label: 'Text message' },
  { value: 'in_person', label: 'Somebody walks in' },
  { value: 'system', label: 'Out of another system' },
];

const HOW_LONG = [
  { value: '5m', label: 'Minutes', hours: 0.1 },
  { value: '30m', label: 'Half an hour', hours: 0.5 },
  { value: '1h', label: 'An hour', hours: 1 },
  { value: '2h', label: 'A couple of hours', hours: 2 },
  { value: 'halfday', label: 'Half a day', hours: 4 },
  { value: 'day', label: 'A whole day', hours: 8 },
];

// Knowing they tried and failed is worth far less than knowing WHAT. A tool
// that is already on their scrapheap must never be recommended back to them,
// and the button on its own does not say which one it was — so every answer
// except "never" demands the name (2026-08-27).
const TRIED_BEFORE = [
  { value: 'never', label: 'Never tried anything', needsName: false },
  { value: 'tool_failed', label: 'Bought something, nobody used it', needsName: true },
  { value: 'too_hard', label: 'Tried, too hard to set up', needsName: true },
  { value: 'too_dear', label: 'Looked, too expensive', needsName: true },
  { value: 'works_partly', label: 'Have something, it half works', needsName: true },
];

// Does this answer still owe us the name of the thing?
function stillNeedsTheName(triedBefore, triedWhat) {
  const choice = TRIED_BEFORE.find((t) => t.value === triedBefore);
  if (!choice || !choice.needsName) return false;
  return !String(triedWhat || '').trim();
}

// How many hours a week, worked out from two buttons rather than asked as a
// number. People are far better at "twice a week, about an hour" than at "so
// that's roughly two hours a week".
function hoursFromButtons(howOften, howLong) {
  const f = HOW_OFTEN.find((x) => x.value === howOften);
  const d = HOW_LONG.find((x) => x.value === howLong);
  if (!f || !d || f.perWeek === null) return null;
  return Math.round(f.perWeek * d.hours * 10) / 10;
}

// The problems to offer as buttons, from what is known about this business.
// Their trade's own four first, then anything the lever points at.
function problemChoices(prospect = {}) {
  const trade = String(prospect.trade || 'other').toLowerCase();
  const own = BY_TRADE[trade] || BY_TRADE.other;
  const byLever = ((LEVERS[prospect.stageOneLever] || {}).lookAt) || [];
  const seen = new Set();
  const out = [];
  for (const t of own) if (!seen.has(t)) { seen.add(t); out.push({ value: t, label: TYPES[t].label, why: `usual in ${trade}` }); }
  for (const t of byLever) if (!seen.has(t) && TYPES[t]) { seen.add(t); out.push({ value: t, label: TYPES[t].label, why: 'matches what they said they want' }); }
  return out.slice(0, 8);
}
// The sentence Russ actually says, built from THIS business.
//
// "Which of these is actually eating the time?" is a label on a screen, not
// something anybody says to a person. Every question is assembled from what is
// on the record — who they are, how many of them there are, what their trade's
// week looks like (Russ, 2026-08-27: "IT HAS TO BE SPECIFIC TO THE ACCOUNT AND
// THE INDUSTRY").
//
// Where something is not known the clause drops out and the sentence still
// reads. Nothing is invented to fill a gap, and nothing CLAIMS to know what
// software they run: their website showing a payment button is evidence about
// their website, not about how they keep their books (Russ asked how we could
// possibly know, and we cannot).

// "Dale, with nine of you at Cascade Tax, " — as much as is known, no more.
function addressThem(prospect = {}) {
  const { resolveField } = require('../overrides.js');
  const { firstNameOf } = require('./names.js');
  const { shortName } = require('./tradeOpening.js');
  const person = firstNameOf(prospect.contactName || prospect.ownerName || '');
  // A registered name is often shouted — "VERNAM CRANE SERVICE, INC." — and
  // reads as anger in the middle of a sentence. Said aloud it is just a name.
  let business = shortName(resolveField(prospect, 'name') || '') || null;
  if (business && business === business.toUpperCase() && business.length > 4) {
    business = business.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\b(Llc|Inc|Pc|Llp|Cpa|Dds|Hvac|Rv|Us|Usa|Nw|Or)\b/g, (m) => m.toUpperCase());
  }
  const people = resolveField(prospect, 'employeeCount');
  const bits = [];
  if (person) bits.push(person);
  if (people && business) bits.push(`with ${people === 1 ? 'just you' : `${people} of you`} at ${business}`);
  else if (people) bits.push(`with ${people === 1 ? 'just you' : `${people} of you`}`);
  else if (business) bits.push(`over at ${business}`);
  return bits.length ? `${bits.join(', ')}, ` : '';
}

// How to describe businesses like theirs. Never "most businesses".
function othersLikeThem(prospect = {}) {
  const { TRADE_PLURAL } = require('./tradeOpening.js');
  const { resolveField } = require('../overrides.js');
  const plural = TRADE_PLURAL[String(prospect.trade || '').toLowerCase()];
  const people = resolveField(prospect, 'employeeCount');
  if (plural && people) return `most ${plural} your size`;
  if (plural) return `most ${plural} around here`;
  if (people) return 'most outfits your size';
  return 'most businesses around here';
}

// The two things their trade is likeliest to lose time on, as a spoken clause.
function theirLikelyTwo(prospect = {}) {
  const own = BY_TRADE[String(prospect.trade || 'other').toLowerCase()] || BY_TRADE.other;
  const lower = (t) => (TYPES[t] ? TYPES[t].label.charAt(0).toLowerCase() + TYPES[t].label.slice(1) : null);
  const one = lower(own[0]);
  const two = lower(own[1]);
  if (one && two) return `${one}, or ${two}`;
  return one || 'the repetitive office work';
}

// How a trade counts its work. A builder thinks in jobs, a dentist in
// appointments, an accountant in clients and returns. Asking a dentist whether
// something happens "every job" is asking in somebody else's language.
function theirRhythm(prospect = {}) {
  const t = String(prospect.trade || '').toLowerCase();
  if (['construction', 'trades', 'landscaping', 'cleaning & facilities', 'auto', 'storage & logistics'].includes(t)) return 'every job, or more like every day';
  if (['dental', 'medical', 'veterinary', 'personal care'].includes(t)) return 'every appointment, or more like every day';
  if (['accounting', 'legal', 'insurance', 'professional services'].includes(t)) return 'every client, or more like every day';
  if (['real estate'].includes(t)) return 'every deal, or more like every day';
  if (['manufacturing'].includes(t)) return 'every order, or more like every day';
  if (['retail & food', 'lodging & hospitality'].includes(t)) return 'every day, or a few times a week';
  return 'a few times a week, or more like every day';
}

// What their trade calls the people it serves.
function theirCustomersAre(prospect = {}) {
  const t = String(prospect.trade || '').toLowerCase();
  if (t === 'dental' || t === 'medical') return 'patients';
  if (['legal', 'accounting', 'insurance', 'professional services', 'staffing', 'veterinary'].includes(t)) return 'clients';
  if (t === 'education & childcare') return 'families';
  if (t === 'nonprofit & community') return 'donors and volunteers';
  return 'customers';
}



// What to ask next, given what has been answered so far.
//
// Every question carries WHY it appeared, so a call can be read back and
// understood rather than just followed.
function nextQuestions(prospect = {}, answers = {}) {
  const a = answers || {};
  const asked = new Set(Object.keys(a).filter((k) => a[k] !== null && a[k] !== undefined && a[k] !== ''));
  const q = [];
  const add = (o) => { if (!asked.has(o.key)) q.push(o); };

  // Always first: what do they actually want. It reorders everything after it.
  add({
    key: 'lever',
    say: `${addressThem(prospect)}if I could fix one thing for you in the next month, would you want it to bring more work in, give you and your team hours back, or make things easier for your ${theirCustomersAre(prospect)}?`,
    choices: Object.entries(LEVERS).map(([k, v]) => ({ value: k, label: v.label })),
    why: 'Decides which problems are worth opening at all.',
  });
  if (!a.lever) return q;

  // Then the problem, from their own trade.
  add({
    key: 'type',
    say: `${othersLikeThem(prospect)} tell me the time goes into ${theirLikelyTwo(prospect)}. Is it one of those for you, or somewhere else entirely?`,
    choices: problemChoices({ ...prospect, stageOneLever: a.lever }),
    freeText: 'Something else — what?',
    why: `These are the usual ones in ${prospect.trade || 'a business like theirs'}, ordered by what they just said they want.`,
  });
  if (!a.type) return q;

  // Then how big it is. Two buttons instead of asking for a number.
  add({
    key: 'howOften',
    // "Every job" is how a builder counts and means nothing to a dentist.
    say: `How often does that come round — ${theirRhythm(prospect)}?`,
    choices: HOW_OFTEN,
    why: 'Frequency times minutes is the hours figure. Both halves are needed.',
  });
  add({
    key: 'howLong',
    say: `And when it happens, is that minutes, or is it half somebody's afternoon?`,
    choices: HOW_LONG,
    why: 'People answer this far better than they answer "how many hours a week".',
  });
  add({
    key: 'whoDoesIt',
    say: `Who ends up doing it — you, or somebody else?`,
    choices: [
      { value: 'owner', label: 'You' },
      { value: 'office', label: 'Whoever runs the office' },
      { value: 'admin', label: 'An admin or assistant' },
      { value: 'crew', label: 'The crew or technicians' },
      { value: 'shared', label: 'Whoever is free' },
    ],
    freeText: 'Somebody else — who?',
    why: 'Hours belong to a business, not a person. It also says whether one person is a risk.',
  });
  if (!a.howOften || !a.howLong || !a.whoDoesIt) return q;

  // Then what decides between the tools.
  add({
    key: 'arrivesAs',
    say: `When that comes in, how does it reach you — email, on paper, somebody rings?`,
    choices: ARRIVES_AS,
    freeText: 'Something else',
    why: 'How something arrives decides which tools can even touch it.',
  });
  add({
    key: 'connectsTo',
    say: `And where does it have to end up once it's dealt with?`,
    choices: connectsToChoices(prospect),
    freeText: 'Something else — what?',
    why: 'A tool that will not talk to what they already run is dead on arrival.',
  });
  add({
    key: 'triedBefore',
    say: `Have you had a go at fixing this before?`,
    choices: TRIED_BEFORE,
    freeText: 'What was it?',
    why: 'What failed before tells you what NOT to recommend, and why their guard is up.',
  });
  // The button alone is not enough: without the name, nothing can be kept off
  // the shortlist. Ask straight back for it.
  if (a.triedBefore && stillNeedsTheName(a.triedBefore, a.triedWhat)) {
    q.push({
      key: 'triedWhat',
      say: 'What was it you tried?',
      freeTextOnly: true,
      why: 'Without the name it cannot be kept off the list, and recommending back the thing they already binned is the worst thing you can do.',
      required: true,
    });
  }
  return q;
}

// What it has to work with. Their own software goes to the TOP of the list
// because it is likely — never announced as a fact. A payment button on a
// website says nothing about how a business keeps its books, and telling
// somebody you can see what they run when you cannot is the fastest way to
// look like you guessed (Russ, 2026-08-27).
function connectsToChoices(prospect = {}) {
  const theirs = String(prospect.toolsInUse || '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = theirs.map((t) => ({ value: t, label: t, why: 'we can see this on their site' }));
  for (const t of ['QuickBooks', 'Their scheduling software', 'Email', 'A spreadsheet', 'Nothing — it stops there']) {
    if (!out.some((o) => o.label.toLowerCase() === t.toLowerCase())) out.push({ value: t, label: t });
  }
  return out.slice(0, 8);
}

// Everything typed and clicked, turned into what the recommendation needs.
function settle(answers = {}) {
  const a = answers || {};
  return {
    ...a,
    hoursPerWeek: a.hoursPerWeek || hoursFromButtons(a.howOften, a.howLong),
  };
}

module.exports = {
  HOW_OFTEN, ARRIVES_AS, HOW_LONG, TRIED_BEFORE,
  hoursFromButtons, problemChoices, connectsToChoices, nextQuestions, settle, stillNeedsTheName,
  addressThem, othersLikeThem, theirLikelyTwo, theirCustomersAre, theirRhythm,
};
