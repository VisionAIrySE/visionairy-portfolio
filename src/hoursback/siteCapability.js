// What a website in this trade ought to do, and what theirs actually does.
//
// "No contact form" is one missing feature, not an evaluation. A site is worth
// rebuilding when it does little of what a site in its trade could do, and
// that bar is different for every trade: a dentist whose site cannot book an
// appointment is failing at the whole job, while a manufacturer's site is a
// catalogue and nobody expects to book anything on it (Russ, 2026-08-27: "an
// objective evaluation of the impact of their website vs the available tools
// that could expand its capabilities").
//
// So each trade gets its own list of capabilities, each weighted by how much
// it matters IN THAT TRADE. The score is what they have out of what they could
// have, and every gap names what would close it: a tool, a plugin, or a build.
//
// Nothing here guesses. A capability is only marked missing when the reader
// looked properly and did not find it; a reading that could not tell leaves it
// unknown, and unknown never counts against anybody.

const { FOUND, ABSENT, UNKNOWN } = require('./siteRead.js');

// Everything a small business website can do, in plain words. `fills` is what
// closes the gap when it is missing, cheapest first.
const CAPABILITIES = {
  enquiry: {
    label: 'A visitor can ask a question without phoning',
    fills: ['a contact form on the existing site', 'a form plugin', 'a rebuild'],
  },
  booking: {
    label: 'A visitor can book or schedule themselves',
    fills: ['a booking service embedded in the existing site', 'a rebuild with booking built in'],
  },
  quote_request: {
    label: 'A visitor can ask for a price or an estimate',
    fills: ['a quote form', 'a quote builder', 'a rebuild'],
  },
  login: {
    label: 'A customer can log in and see their own records',
    fills: ['a portal from their existing software', 'a customer portal', 'a rebuild'],
  },
  online_payment: {
    label: 'A customer can pay online',
    fills: ['a payment link', 'a payment page', 'a rebuild with payments'],
  },
  pricing_shown: {
    label: 'Prices or ranges are published',
    fills: ['a pricing page'],
  },
  work_shown: {
    label: 'Finished work is shown, not just described',
    fills: ['a gallery', 'a rebuild with a portfolio'],
  },
  reviews_shown: {
    label: 'Reviews from real customers appear on the site',
    fills: ['a reviews widget', 'a reviews service'],
  },
  intake_forms: {
    label: 'New customer forms can be filled in before arriving',
    fills: ['digital intake forms', 'forms built into their software', 'a rebuild'],
  },
  live_chat: {
    label: 'Somebody can get an answer without waiting for a reply',
    fills: ['a chat widget', 'an AI answering assistant'],
  },
  mobile_ready: {
    label: 'The site works properly on a phone',
    fills: ['a rebuild'],
  },
  newsletter_capture: {
    label: 'A visitor can leave their email for later',
    fills: ['an email capture form', 'an email service'],
  },
  catalogue: {
    label: 'What they sell or make is listed properly',
    fills: ['a product listing', 'a rebuild with a catalogue'],
  },
  careers: {
    label: 'Somebody can apply for a job',
    fills: ['an application form', 'a hiring page'],
  },
};

// What matters in each trade, and how much. Weights add to 100 per trade so a
// score is comparable across industries. A dentist who cannot be booked online
// loses 25 points; a manufacturer loses nothing for the same gap, because
// nobody books a fabrication shop through a web page.
const BY_TRADE = {
  dental: { booking: 25, intake_forms: 20, enquiry: 15, reviews_shown: 15, pricing_shown: 10, online_payment: 10, mobile_ready: 5 },
  medical: { booking: 25, intake_forms: 20, login: 15, enquiry: 15, reviews_shown: 10, online_payment: 10, mobile_ready: 5 },
  veterinary: { booking: 25, enquiry: 20, intake_forms: 15, reviews_shown: 15, pricing_shown: 10, online_payment: 10, mobile_ready: 5 },
  legal: { enquiry: 30, intake_forms: 20, reviews_shown: 15, pricing_shown: 15, booking: 10, mobile_ready: 10 },
  accounting: { enquiry: 25, login: 20, intake_forms: 20, booking: 15, pricing_shown: 10, mobile_ready: 10 },
  insurance: { quote_request: 30, enquiry: 20, login: 20, reviews_shown: 15, mobile_ready: 15 },
  'real estate': { enquiry: 25, work_shown: 25, booking: 15, reviews_shown: 15, newsletter_capture: 10, mobile_ready: 10 },
  construction: { quote_request: 30, work_shown: 25, enquiry: 20, reviews_shown: 15, mobile_ready: 10 },
  trades: { quote_request: 25, booking: 20, enquiry: 20, reviews_shown: 20, mobile_ready: 15 },
  landscaping: { quote_request: 25, work_shown: 25, enquiry: 20, reviews_shown: 20, mobile_ready: 10 },
  auto: { booking: 25, quote_request: 20, enquiry: 20, reviews_shown: 20, pricing_shown: 10, mobile_ready: 5 },
  'personal care': { booking: 35, pricing_shown: 20, reviews_shown: 20, work_shown: 15, mobile_ready: 10 },
  'fitness & recreation': { booking: 30, pricing_shown: 25, online_payment: 15, reviews_shown: 15, mobile_ready: 15 },
  'retail & food': { catalogue: 25, online_payment: 20, pricing_shown: 20, reviews_shown: 20, mobile_ready: 15 },
  'lodging & hospitality': { booking: 35, pricing_shown: 20, work_shown: 15, reviews_shown: 20, mobile_ready: 10 },
  'cleaning & facilities': { quote_request: 30, booking: 20, enquiry: 20, reviews_shown: 20, mobile_ready: 10 },
  manufacturing: { catalogue: 30, quote_request: 25, enquiry: 25, work_shown: 10, mobile_ready: 10 },
  'storage & logistics': { quote_request: 25, enquiry: 25, login: 20, pricing_shown: 20, mobile_ready: 10 },
  'professional services': { enquiry: 30, booking: 20, work_shown: 20, newsletter_capture: 15, mobile_ready: 15 },
  staffing: { careers: 30, enquiry: 25, intake_forms: 20, work_shown: 15, mobile_ready: 10 },
  agriculture: { catalogue: 25, enquiry: 30, quote_request: 20, work_shown: 15, mobile_ready: 10 },
  'nonprofit & community': { newsletter_capture: 25, online_payment: 25, enquiry: 20, work_shown: 20, mobile_ready: 10 },
  'education & childcare': { enquiry: 25, intake_forms: 25, booking: 15, pricing_shown: 20, mobile_ready: 15 },
  'funeral & memorial': { enquiry: 35, pricing_shown: 25, work_shown: 20, mobile_ready: 20 },
  other: { enquiry: 30, quote_request: 20, booking: 15, reviews_shown: 20, mobile_ready: 15 },
};

function expectedFor(trade) {
  const k = String(trade || 'other').toLowerCase();
  return BY_TRADE[k] || BY_TRADE.other;
}

// Score one site against what its trade's site could do.
//
// found: { capability: 'FOUND' | 'ABSENT' | 'UNKNOWN' }
//
// Anything the reader could not tell is left OUT of the sum entirely, top and
// bottom. A business is never marked down for something nobody checked.
function scoreSite({ trade, found } = {}) {
  const expected = expectedFor(trade);
  const have = [];
  const missing = [];
  const untested = [];
  let earned = 0;
  let possible = 0;

  for (const [cap, weight] of Object.entries(expected)) {
    const state = (found && found[cap]) || UNKNOWN;
    if (state === UNKNOWN) { untested.push({ cap, weight, label: CAPABILITIES[cap].label }); continue; }
    possible += weight;
    if (state === FOUND) { earned += weight; have.push({ cap, weight, label: CAPABILITIES[cap].label }); }
    else missing.push({ cap, weight, label: CAPABILITIES[cap].label, fills: CAPABILITIES[cap].fills });
  }

  missing.sort((a, b) => b.weight - a.weight);
  // A score is only reported when enough of the list was actually checked.
  // Two sites came back "100%" beside a verdict of "not enough of their site
  // could be checked to judge it", because one capability out of one checked
  // is a perfect score and a meaningless one (2026-08-27).
  const confident = possible >= 50;
  const score = (possible > 0 && confident) ? Math.round((earned / possible) * 100) : null;
  return {
    score,                                  // null unless enough was checked to mean anything
    earned, possible,
    have, missing, untested,
    confident,
    verdict: verdictFor(score, missing, possible),
  };
}

// What to do about it, in the words you would say on a call.
function verdictFor(score, missing, possible) {
  if (score === null || possible < 50) {
    return { level: 'unknown', say: 'not enough of their site could be checked to judge it' };
  }
  if (score >= 80) {
    return { level: 'good', say: 'their site already does most of what it could' };
  }
  if (score >= 50) {
    const top = missing[0];
    return {
      level: 'add_to_it',
      say: `their site works, and ${top ? top.label.replace(/^A /, 'a ').toLowerCase() : 'a piece'} is missing`,
      fill: top ? top.fills[0] : null,
    };
  }
  return {
    level: 'rebuild',
    say: `their site does ${score}% of what a site in their trade could do`,
    fill: 'a rebuild',
  };
}

module.exports = { CAPABILITIES, BY_TRADE, expectedFor, scoreSite, verdictFor };
