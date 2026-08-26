// The offer. One price, one promise, every business.
//
// $999. Five hours a week found, or nothing to pay. Russ, 2026-08-26, after a
// long detour through banded pricing and industry tiers: "Just do 1 price for
// SMBs - $999 - guarantee 5 hours. If I find more, it's a bonus and I get
// access to propose other projects and implement the tools found."
//
// Nothing is computed. There is no per-hour rule, no headcount band, no
// industry multiplier and no arithmetic anyone can reverse-engineer. Two
// numbers, said in one breath, the same for a three-person shop and a
// hundred-person builder.

const THE_OFFER = {
  hours: 5,        // found every week, or there is nothing to pay
  fee: 999,        // the only dollar figure in this business
  yearHours: 260,
  hoursWord: 'five',
  months: 'six weeks',
};

// Why five is safe everywhere, and why finding more is the normal case.
//
// Independent evidence, gathered 2026-08-26:
//   · Contractors: dispatch and invoicing software alone documents 8+ hours a
//     week saved (Housecall Pro).
//   · Real estate: agents lose about 14 hours a week to paperwork; a 12-agent
//     brokerage recovers 25-45.
//   · Dental: a single-doctor practice recovers 15-20 hours a week from
//     front-office automation; claims follow-up alone runs 20 hours a week.
//   · Insurance: the average independent agency loses 34 hours a week to
//     manual data entry, certificates and renewal chasing.
//   · Deloitte: organisations expect automation to cover about 20% of their
//     capacity; those who have actually scaled it believe 52%.
// Five sits below the documented floor of every one of those. And what is
// promised is FINDING the hours and naming the tools — not delivering them,
// which is the harder half and the client's own choice.
const EVIDENCE_FLOOR_HOURS = 8;   // the lowest documented figure found anywhere

// How much of each industry is office work — US Bureau of Labor Statistics
// OEWS, May 2023, occupation group 43-0000, pulled from bls.gov on 2026-08-26.
//
// This PRICES NOTHING. It is reference for Russ before a call: where to look
// first, and how much room sits above the five hours. It counts only people
// whose JOB TITLE is administrative, so it badly understates the owner who
// does the books, the quotes and the scheduling — which is exactly where the
// hours hide in a small field business. Russ caught that understatement
// himself when an earlier version of this file used it to refuse an offer to
// a twelve-person cleaning company.
const ADMIN_SHARE = {
  insurance: 0.3226, dental: 0.2924, accounting: 0.2876, medical: 0.2673, legal: 0.2625,
  'lodging & hospitality': 0.1870, 'real estate': 0.1818, 'professional services': 0.1422,
  staffing: 0.1321, 'personal care': 0.1274, 'storage & logistics': 0.1070,
  'fitness & recreation': 0.1037, auto: 0.1008, other: 0.1000,
  construction: 0.0992, trades: 0.0938, manufacturing: 0.0907, landscaping: 0.0670,
  'cleaning & facilities': 0.0603, 'nonprofit & community': 0.0536,
  'retail & food': 0.0500, agriculture: 0.0480,
};

function adminShareFor(trade) {
  const key = String(trade || 'other').toLowerCase();
  return ADMIN_SHARE[key] === undefined ? ADMIN_SHARE.other : ADMIN_SHARE[key];
}

// The promise for any business, which is the same promise for every business.
function promiseFor() {
  return { ...THE_OFFER };
}

module.exports = { THE_OFFER, EVIDENCE_FLOOR_HOURS, ADMIN_SHARE, adminShareFor, promiseFor };
