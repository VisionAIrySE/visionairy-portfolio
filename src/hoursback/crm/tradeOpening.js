// The opening line when nothing was verified on their own page.
//
// Two thirds of the list used to open with "there's no way to book with you
// online" — a sentence produced by the website reader FAILING to find booking
// words on the handful of pages it read. Not finding is not the same as not having,
// and it was going to 62 construction companies, 21 manufacturers and 32 freight
// outfits, none of whom take appointments (Russ, 2026-08-26).
//
// This replaces it with the one thing that is true of every business in a
// trade and cannot be wrong: their own week. The shape is three sentences —
//
//   1. their week, stated flat, no claim attached
//   2. where it is true ("that's most law firms around here")
//   3. a GUESS about them, never a statement
//
// Sentence 3 is the only place this can overstep, so it is always hedged and
// never asserts anything about their particular office. Russ's condition when
// he approved the shape: "relevant if they don't overstep in assumption."

const { painFor } = require('./painPoints.js');

// The subject line comes from their week, not from their name. Three wordings
// each so the biggest trade group (124 real estate offices) does not send one
// subject line 124 times. Never the business name — a third of the list has a
// name that is really a web page heading, and those made unreadable subjects.
// Subject lines.
//
// These used to be headline-cased noun phrases — "Quote, Work Order, Packing
// Slip", "Ordering And The Schedule" — which read like chapter titles in a
// report rather than like something a person typed before a meeting. Russ read
// them and called them horrible, and he was right: a stranger's inbox is full
// of campaigns, and anything that looks like one is deleted unread
// (2026-08-27).
//
// What replaces them:
//   · lower case, because that is how people write to each other
//   · two to five words
//   · about THEM, not about what Russ does
//   · never a colon, never a comma-list, never a promise
//
// Three per trade so no two neighbours get the same one.
const TRADE_SUBJECT = {
  construction: ['chasing change orders', 'the signatures nobody has back yet', 'submittals and the typing after'],
  trades: ['when the schedule is in one head', 'the callbacks after dispatch', 'who knows where the trucks are'],
  'real estate': ['the deals that went quiet', 'typing the same client in twice', 'follow-up nobody had time for'],
  medical: ['on hold with insurers again', 'records requests piling up', 'the front desk and the phone'],
  dental: ['claims back over one field', 'phoning patients to rebook', 'the recall list'],
  legal: ['intake before anybody bills', 'the same details, three times', 'getting the file open'],
  accounting: ['chasing clients for documents', 'documents they said they sent', 'what clients finally send'],
  insurance: ['certificates typed twice', 'renewals that arrive as a deadline', 'the portal and your system'],
  auto: ['estimates nobody chased', 'on hold with parts again', 'the estimates that never came back'],
  landscaping: ['when weather moves the week', 'three calls for every change', 'the season in a paper diary'],
  'storage & logistics': ['the same ticket, re-typed', 'dispatch to driver to customer', 'what gets typed at each handoff'],
  staffing: ['applications and timesheets', 'moving both into payroll', 'between the application and the placement'],
  'retail & food': ['ordering off what usually sells', 'invoices entered twice', 'when one person calls in'],
  manufacturing: ['quote to work order', 'typed fresh every time', 'the same numbers, three documents'],
  'personal care': ['the gaps in the day', 'no-shows and rebooking', 'everything through the front desk'],
  'fitness & recreation': ['members nobody had time to chase', 'memberships and waivers', 'the admin behind the floor'],
  'lodging & hospitality': ['bookings from three places', 'copied into one calendar by hand', 'when every change is a call'],
  'education & childcare': ['one family, three systems', 'enrollment and the paperwork', 'forms instead of families'],
  'cleaning & facilities': ['one cancellation, an hour of calls', 'crews, keys and route changes', 'routing before the day starts'],
  'professional services': ['proposals that went quiet', 'the same details in three places', 'follow-up on proposals'],
  agriculture: ['load tickets typed twice', 'the office side, after dark', 'compliance and seasonal payroll'],
  'nonprofit & community': ['the donor thank-you that slips', 'donors, volunteers, grants', 'reporting nobody has time for'],
  'funeral & memorial': ['the same details on a dozen forms', 'families waiting on paperwork', 'written out by hand each time'],
  veterinary: ['the reminder calls', 'shots nobody has chased', 'booking, payment and charts at one counter'],
};
const GENERAL_SUBJECT = ['the same thing, typed twice', 'where the hours actually go', 'typed into two or three places'];

// What to call a group of them. Reads as somebody who knows the trade rather
// than somebody reading off a category list.
const TRADE_PLURAL = {
  dental: 'dental practices', medical: 'medical offices', legal: 'law firms',
  accounting: 'accounting firms', insurance: 'insurance agencies',
  'real estate': 'real estate offices', staffing: 'staffing offices',
  construction: 'construction offices', trades: 'trade shops', auto: 'repair shops',
  landscaping: 'landscaping outfits', 'storage & logistics': 'logistics offices',
  'retail & food': 'shops and kitchens', manufacturing: 'manufacturing offices',
  'professional services': 'firms like yours', 'cleaning & facilities': 'cleaning companies',
  'lodging & hospitality': 'places like yours', 'personal care': 'salons and studios',
  'fitness & recreation': 'gyms and studios', 'nonprofit & community': 'nonprofits',
  agriculture: 'farm offices', 'education & childcare': 'preschools and daycares',
  veterinary: 'veterinary clinics',
  'funeral & memorial': 'funeral homes',
};

// Sentence two: where the thing is true. Never "at your office".
const WHERE_TRUE = [
  "That's most {plural} around here.",
  "That's true of most {plural} in Central Oregon.",
  "That's how most {plural} around here run.",
];
const WHERE_TRUE_GENERAL = [
  "That's most small offices around here.",
  "That's true of most small businesses in Central Oregon.",
  "That's how most offices around here run.",
];

// Sentence three, when their own words told us what they actually do.
//
// The clause is theirs — read off what they published, written to complete
// "You ___", never inferred and never flattering. Reflecting it back is what
// separates a message written for them from a message written for their
// category. The hedge is unchanged: it still guesses, it never claims.
// "that" has to point at the week in sentence one and nothing else. An
// earlier wording — "and my guess is a version of that is sitting on somebody
// there" — wobbled the moment the clause was a list rather than an action:
// "You treat dogs, cats, horses, cattle, sheep and alpacas, and my guess is a
// version of that..." reads as a guess about the animals (2026-08-26).
const THEIR_WORK_GUESS = [
  "You {work}, so I'd guess a fair bit of the above lands on whoever runs your office.",
  'You {work}, and my guess is somebody there is carrying a good part of it.',
  "You {work} — I'd guess some of the above comes with it.",
  'You {work}, so odds are some of it is familiar.',
];

// Sentence three, when we only know their trade. A GUESS, and it has to stay
// one. Every wording below is hedged, because the whole message is honest
// right up until this sentence claims to know something about their office.
const SOFT_GUESS = [
  "I'd guess some of it is true at {business}.",
  'Some of that probably lands at {business} as well.',
  'My guess is a version of it runs at {business}.',
  'Odds are some of that is familiar at {business}.',
];
// The same, when their name is unusable in a sentence.
const SOFT_GUESS_NO_NAME = [
  "I'd guess some of it is true for you.",
  'Some of that probably lands with you as well.',
  'My guess is a version of it runs there.',
  'Odds are some of that is familiar.',
];

// A business name fit to sit inside a sentence.
//
// A third of the list carries a web page heading rather than a name —
// "Hanson & Co PC | CPA Bend Oregon | Accountant Bend Oregon" — and a few
// carry a run-together domain like "thomaspediatricdentistry". The first can
// be trimmed. The second cannot be split back into words reliably, so it is
// dropped and the sentence uses "you" instead.
function shortName(raw) {
  let n = String(raw || '').trim();
  if (!n) return null;
  n = n.split('|')[0].trim();                              // heading, not a name
  n = n.split(/\s+[-–—]\s+/)[0].trim();                    // "Adair Homes - Redmond, Oregon"
  n = n.replace(/,?\s*(Bend|Redmond|Sisters|Prineville|Madras|La Pine|Central Oregon|Oregon|OR)\.?$/i, '').trim();
  n = n.replace(/,?\s*(LLC|L\.L\.C\.|Inc|Inc\.|Ltd|Ltd\.|PC|P\.C\.|LLP|L\.L\.P\.|Co|Co\.|Corp|Corp\.)$/i, '').trim();
  n = n.replace(/[,\s]+$/, '');
  if (!n) return null;
  if (!/\s/.test(n) && n === n.toLowerCase()) return null; // "willowpediatrics"
  if (n.length > 42) return null;                          // still a heading
  if (!/[a-z]/i.test(n)) return null;
  // A registered name is often shouted — "VERNAM CRANE SERVICE, INC." — and
  // reads as anger in the middle of a sentence. Said aloud it is just a name
  // (2026-08-27).
  if (n === n.toUpperCase() && n.length > 4) {
    n = n.toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\b(Llc|Inc|Pc|Llp|Cpa|Dds|Dmd|Hvac|Rv|Us|Usa|Nw|Or|Ii|Iii)\b/g, (m) => m.toUpperCase());
  }
  return n;
}

// Same business, same wording, every time — and different across the list.
// Lifted from variants.js so the two stay consistent.
function pick(list, key, salt = '') {
  const s = `${salt}|${String(key || '')}`;
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) { n ^= s.charCodeAt(i); n = Math.imul(n, 16777619) >>> 0; }
  n ^= n >>> 16; n = Math.imul(n, 2246822507) >>> 0;
  n ^= n >>> 13; n = Math.imul(n, 3266489909) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return list[n % list.length];
}

// Can this be dropped straight into "You ___"?
//
// The field holds a short clause somebody wrote by hand: "do windshield work
// both mobile and in the shop". Russ pasted a company's whole About paragraph
// into it instead, and the message would have read "You Founded in 2004, we
// are Central Oregon's premier crane and rigging company. With over 50 years
// of experience... , so I'd guess a fair bit of the above lands on whoever
// runs your office." Broken grammar wrapped around their own brochure
// (2026-08-27).
//
// Five ways it fails, and every one of the 505 clauses already written passes
// all five:
//   - it starts with a capital, so it was written as a sentence, not a clause
//   - it says "we" or "our", so it is their voice, not a description of them
//   - it runs to more than one sentence
//   - it is longer than a clause can be and still read as one
//   - it is marketing: "premier", "dedicated to", "we take great pride"
//
// Failing does not lose anything. The message falls back to the opening built
// from their name, which is true of them either way.
const MARKETING = /(\bpassionate\b|\bdedicated to\b|\bcommitted to\b|\btrusted\b|\bpremier\b|\bexcellence\b|\bintegrity\b|\bproud to\b|\bstrives?\b|\bexpectations\b|\bdeserve\b|\bworld-?class\b|\bunparalleled\b|\bcraftsmanship\b|relationships first|building relationships|['\u2019]s vision)/i;
const WORK_CLAUSE_MAX = 120;

function whyWorkClauseIsUnusable(text) {
  const w = String(text || '').trim();
  if (!w) return null;
  if (/^[A-Z]/.test(w)) return 'it starts as a sentence — it has to finish "You ___", so start it lowercase with a verb, like "do windshield work in Redmond"';
  if (/\b(we|our|us)\b/i.test(w)) return 'it is written in their voice ("we", "our") — write what they DO, as if finishing "You ___"';
  if (/[.!?]\s+\S/.test(w)) return 'it is more than one sentence — one short clause only';
  if (w.length > WORK_CLAUSE_MAX) return `it is ${w.length} characters — keep it under ${WORK_CLAUSE_MAX} so it reads as one clause`;
  if (MARKETING.test(w)) return 'it reads their own marketing back at them — say what they do, not how they describe themselves';
  return null;
}

function usableWorkClause(text) {
  const w = String(text || '').trim();
  if (!w) return null;
  return whyWorkClauseIsUnusable(w) ? null : w;
}

// The whole opening paragraph. Three sentences, in order: their week, where it
// is true, and a guess about them.
function openingFor(trade, businessName, seed, theirWork) {
  const week = painFor(trade || 'other').recognition;
  const plural = TRADE_PLURAL[trade];
  const where = plural
    ? pick(WHERE_TRUE, seed, 'where').replace('{plural}', plural)
    : pick(WHERE_TRUE_GENERAL, seed, 'where');
  const name = shortName(businessName);
  // Their own work beats their name every time — it is the difference between
  // "I'd guess some of it is true at Reinhardt Homes" and "You design and build
  // custom homes in Redmond, so I'd guess a fair bit of that lands on whoever
  // runs your office." Only ever used where somebody read their words and wrote
  // the clause by hand (Russ approved this on the condition it stays a guess
  // and comes solely from their own site, 2026-08-26).
  const work = usableWorkClause(theirWork);
  const guess = work
    ? pick(THEIR_WORK_GUESS, seed, 'guess').replace('{work}', work)
    : name
      ? pick(SOFT_GUESS, seed, 'guess').replace('{business}', name)
      : pick(SOFT_GUESS_NO_NAME, seed, 'guess');
  return `${week} ${where} ${guess}`;
}

function subjectFor(trade, seed) {
  return pick(TRADE_SUBJECT[trade] || GENERAL_SUBJECT, seed, 'subject');
}

module.exports = {
  WORK_CLAUSE_MAX, whyWorkClauseIsUnusable, usableWorkClause,
  TRADE_SUBJECT, GENERAL_SUBJECT, TRADE_PLURAL,
  WHERE_TRUE, WHERE_TRUE_GENERAL, SOFT_GUESS, SOFT_GUESS_NO_NAME, THEIR_WORK_GUESS,
  shortName, openingFor, subjectFor, pick,
};
