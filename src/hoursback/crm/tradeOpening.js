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
const TRADE_SUBJECT = {
  construction: ['The paperwork behind your change orders', 'Chasing signatures', 'Re-keying the same numbers'],
  trades: ['The schedule that lives in one head', 'Dispatch and the callbacks after it', 'When one person is the schedule'],
  'real estate': ['The deals that go quiet', 'Typing the same client details twice', 'The follow-up that never happens'],
  medical: ['Time on the phone with insurers', 'Records requests and prior authorizations', 'Your front office and the phone'],
  dental: ['Filling the schedule by phone', 'Claims that come back over one field', 'Booking the next cleaning'],
  legal: ['The same client details, typed three times', 'Intake before anybody bills an hour', 'Getting the file open faster'],
  accounting: ['Chasing clients for documents', 'Documents they said they already sent', 'Re-keying what clients finally send'],
  insurance: ['Renewals that arrive as a deadline', 'The carrier portal and the agency system', 'Certificates, typed twice'],
  auto: ['Estimates that never get chased', 'On hold with a parts supplier', 'The estimates that never come back'],
  landscaping: ['When weather moves the schedule', 'Three phone calls for every change', 'A season of schedule in a paper diary'],
  'storage & logistics': ['Re-typing the same ticket', 'Dispatch, driver, customer', 'The handoffs between dispatch and the road'],
  staffing: ['Applications in one format, timesheets in another', 'Moving both into payroll', 'Between the application and the placement'],
  'retail & food': ['Ordering and the schedule', 'Invoices entered twice', 'Rebuilding the schedule when one person calls in'],
  manufacturing: ['A quote becoming a work order', 'Typed fresh instead of carried forward', 'Quote, work order, packing slip'],
  'personal care': ['Gaps in the day that were already spoken for', 'Bookings, no-shows and rebooking', 'Everything through whoever is at the desk'],
  'fitness & recreation': ['Lapsed members nobody has time to chase', 'Memberships, bookings and waivers', 'Three piles, one desk'],
  'lodging & hospitality': ['Bookings arriving from three places', 'Copied into one calendar by hand', 'When every change is a phone call'],
  'education & childcare': ['One family, typed into three systems', 'Enrollment, records and billing', 'Staff with families instead of forms'],
  'cleaning & facilities': ['One cancellation, half an hour of calls', 'Crews, keys and route changes', 'Routing crews before the day starts'],
  'professional services': ['Proposals that go quiet', 'The same details in a proposal, an invoice and a project tool', 'The follow-up on proposals'],
  agriculture: ['Load tickets written once and typed again', 'The office side, after dark', 'Compliance records and seasonal payroll'],
  'nonprofit & community': ['The donor follow-up that slips', 'Donors, volunteers and grants in three places', 'Thanking people when everything else is urgent'],
  'funeral & memorial': ['The same details on a dozen forms', 'Families waiting on paperwork', 'Written out by hand every time'],
  veterinary: ['The reminder calls', 'Shots and check-ups nobody has chased', 'Booking, payment and charts at one counter'],
};
const GENERAL_SUBJECT = ['The same information, typed twice', 'Where the hours actually go', 'Typed into two or three places'];

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

// Sentence three: a GUESS, and it has to stay one. Every wording below is
// hedged, because the whole message is honest right up until this sentence
// claims to know something about their particular office.
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

// The whole opening paragraph. Three sentences, in order: their week, where it
// is true, and a guess about them.
function openingFor(trade, businessName, seed) {
  const week = painFor(trade || 'other').recognition;
  const plural = TRADE_PLURAL[trade];
  const where = plural
    ? pick(WHERE_TRUE, seed, 'where').replace('{plural}', plural)
    : pick(WHERE_TRUE_GENERAL, seed, 'where');
  const name = shortName(businessName);
  const guess = name
    ? pick(SOFT_GUESS, seed, 'guess').replace('{business}', name)
    : pick(SOFT_GUESS_NO_NAME, seed, 'guess');
  return `${week} ${where} ${guess}`;
}

function subjectFor(trade, seed) {
  return pick(TRADE_SUBJECT[trade] || GENERAL_SUBJECT, seed, 'subject');
}

module.exports = {
  TRADE_SUBJECT, GENERAL_SUBJECT, TRADE_PLURAL,
  WHERE_TRUE, WHERE_TRUE_GENERAL, SOFT_GUESS, SOFT_GUESS_NO_NAME,
  shortName, openingFor, subjectFor, pick,
};
