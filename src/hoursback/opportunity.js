// How much a business stands to gain, which is what the score should mean.
//
// The old score answered a different question: how much did we manage to
// scrape off their website. A modern dental practice with a clean site scored
// low; a one-person shop with a fax number on its contact page scored high.
// That is backwards, and Russ named it (2026-08-27): "Shouldn't the score and
// the message be based on the likelihood of them realizing significant
// positive impact from automation and AI based tools and based on their
// industry's general best case applications for those tools? Seems like you're
// trying to force the messaging into the signals we found versus the industry
// best practices."
//
// The industry was also contributing NOTHING. The old table keyed on names
// like "dental office" and "law firm" while every record on file says "dental"
// and "legal", so the lookup missed on all 33,314 businesses except
// landscaping, which matched by accident.
//
// What the score means now: roughly how many hours a week of repetitive office
// work sit in this business, which is the exact thing the offer promises to
// find. Five is what Russ guarantees, so a business estimated at eighteen is a
// strong prospect and one estimated at four is marginal.
//
//   hours = people  x  40  x  office share  x  how automatable that work is
//
// Every term is visible on the account card, so the number is never a black
// box and Russ can argue with any part of it.

const { adminShareFor } = require('./industryTiers.js');

// How much of an industry's office work is rule-based repetition that software
// can do instead: chasing, re-keying, reminding, filing, checking a form for a
// missing field. NOT judgement work, not selling, not the trade itself.
//
// These are set from each trade's own documented pain point (painPoints.js) —
// a trade whose week is described as "the same numbers typed into four places"
// scores high, one whose admin is mostly judgement scores lower. Russ is the
// domain expert here and these are his to correct.
const AUTOMATABLE = {
  // The paperwork IS the job: forms, claims, chasing, filing, re-keying.
  insurance: 0.70,           // certificates, renewals, manual data entry
  accounting: 0.70,          // chasing documents, re-keying what arrives
  dental: 0.65,              // recalls, claims kicked back for one field
  medical: 0.65,             // records requests, referrals, prior auth
  veterinary: 0.65,          // shot and check-up reminders, charting
  'real estate': 0.60,       // same details typed into three systems
  legal: 0.60,               // intake, filing, deadline chasing
  staffing: 0.60,            // candidate chasing, compliance paperwork
  'storage & logistics': 0.60, // the same ticket re-typed at each handoff

  // Heavy repetitive admin, but a real trade to do as well.
  construction: 0.55,        // submittals, change orders, re-keyed numbers
  'professional services': 0.55, // proposals, follow-up, details entered twice
  manufacturing: 0.55,       // quote to work order to packing slip
  'nonprofit & community': 0.55, // donors, volunteers, grant reporting
  auto: 0.50,                // estimate follow-up, parts ordering
  trades: 0.50,              // the schedule living in one person's head
  agriculture: 0.50,         // load tickets and compliance typed twice
  'education & childcare': 0.50, // enrolment, forms, reminders
  'funeral & memorial': 0.50,    // filings, notices, arrangements paperwork

  // Real admin, but more of the week is hands-on or face-to-face.
  'lodging & hospitality': 0.45,
  'cleaning & facilities': 0.45,  // routes, keys, cancellations
  landscaping: 0.45,              // weather-driven rescheduling
  'personal care': 0.40,          // bookings and no-shows
  'fitness & recreation': 0.40,
  'retail & food': 0.35,          // ordering and rota, but mostly the floor
  other: 0.45,
};

// The published office-work share counts only people whose JOB TITLE is
// administrative. It misses the owner of a six-person contractor doing
// submittals and payroll at the kitchen table at nine at night, which is
// exactly where the hours hide in a small business. Russ caught that
// understatement himself, so no industry is allowed below this floor.
const OFFICE_SHARE_FLOOR = 0.15;

// When nobody has told us how big a business is. Most of Central Oregon's
// register is small, and guessing high would flatter every score.
const TYPICAL_TEAM = 5;

const WEEK_HOURS = 40;

// Multiplying the two shares together over-counts, because not all of an
// admin person's day is the repetitive kind and not all repetitive work goes
// away completely. Uncalibrated, the model ran roughly twice the figures
// already documented in industryTiers.js, so it is scaled to land on them:
//
//   dental, single-doctor practice (~6 people)   documented 15-20/wk
//   insurance, average agency (~8 people)        documented 34/wk
//   real estate, 12-agent brokerage              documented 25-45/wk
//   contractors                                  documented 8+/wk (a floor)
//
// At 0.55 the model gives 25, 25, 29 and 9 for those four. Every one lands in
// or beside its documented range, and the contractor figure sits right on the
// lowest number anybody has published. Raise this and the estimates start
// promising more than the evidence supports.
const CALIBRATION = 0.55;

function automatableFor(trade) {
  const k = String(trade || 'other').toLowerCase();
  return AUTOMATABLE[k] === undefined ? AUTOMATABLE.other : AUTOMATABLE[k];
}

function officeShareFor(trade) {
  return Math.max(OFFICE_SHARE_FLOOR, adminShareFor(trade));
}

// Roughly how many hours a week of repetitive office work sit in this
// business. Returns the number and every term behind it, in plain words.
function hoursSittingHere({ trade, people } = {}) {
  const known = Number.isFinite(Number(people)) && Number(people) >= 1;
  const team = known ? Number(people) : TYPICAL_TEAM;
  const share = officeShareFor(trade);
  const automatable = automatableFor(trade);
  const hours = team * WEEK_HOURS * share * automatable * CALIBRATION;
  return {
    hours: Math.round(hours * 10) / 10,
    team, teamKnown: known, share, automatable,
    trade: trade || null,
    // One sentence Russ can read on the card without doing any arithmetic.
    because: `${known ? `${team} people` : `a typical ${team}-person shop`}, `
      + `${Math.round(share * 100)}% of that time on office work, `
      + `${Math.round(automatable * 100)}% of it the repetitive kind software does instead`,
  };
}

// Turning hours into a score out of 100.
//
// There is no sensible fixed ceiling. Measured across the 1,306 businesses on
// the list on 2026-08-27, the estimates run: median 10.9 hours a week, top
// quarter above 19.1, top tenth above 26.8, top twentieth above 41.3, and a
// tail reaching 1,987 for a large employer nobody here is selling to. Any cap
// picked out of the air either flattens the top or flattens the middle.
//
// So the score is a RANK: where this business sits against every other one on
// the list. A score of 90 means nine in ten have fewer hours sitting there.
// Nothing is invented — the breakpoints below are the measured distribution,
// and they should be recomputed whenever the list changes materially.
const HOURS_AT_PERCENTILE = [
  // [percentile, hours a week at that point] — measured, not chosen.
  [10, 5.8], [25, 8.3], [50, 10.9], [75, 19.1], [90, 26.8], [95, 41.3], [99, 222.8],
];
const MEASURED_ON = '2026-08-27';
const MEASURED_ACROSS = 1306;

function scoreFromHours(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  const pts = HOURS_AT_PERCENTILE;
  if (h <= pts[0][1]) return Math.round((h / pts[0][1]) * pts[0][0]);
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [p1, h1] = pts[i];
    const [p2, h2] = pts[i + 1];
    if (h <= h2) return Math.round(p1 + ((h - h1) / (h2 - h1)) * (p2 - p1));
  }
  return 100;
}

// Every industry, ordered by how many hours sit in a typical shop. This is the
// call order Russ asked for, and the table he can argue with.
function industryTable(people = TYPICAL_TEAM) {
  return Object.keys(AUTOMATABLE)
    .filter((t) => t !== 'other')
    .map((t) => ({ trade: t, ...hoursSittingHere({ trade: t, people }) }))
    .sort((a, b) => b.hours - a.hours);
}

module.exports = {
  HOURS_AT_PERCENTILE, MEASURED_ON, MEASURED_ACROSS, scoreFromHours,
  AUTOMATABLE, OFFICE_SHARE_FLOOR, TYPICAL_TEAM, WEEK_HOURS, CALIBRATION,
  automatableFor, officeShareFor, hoursSittingHere, industryTable,
};
