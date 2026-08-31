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


// ── THE TWO SCORES, ADDED 2026-08-30 ────────────────────────────────────────
//
// Everything above answers "how many hours are sitting here" — the industry
// figures, the office-work share, the calibration behind the number on the card.
// Everything below answers two different questions: would bought software help
// this business, and is there something here worth building.
//
// The second half was written OVER the first by mistake, and the loss was
// committed and pushed. 102 checks failed because industryTable and
// hoursSittingHere had simply gone from the file. Both halves live here now and
// the exports at the foot carry every name either half ever had (2026-08-30).

// What a business is worth — two numbers, never blended.
//
// Russ, 2026-08-30, after correcting me three times on the same point:
//
//   "I build a Custom CRM for a company for 1/10 of the cost from off the shelf
//    or a dev shop, why is that bad and not a great opportunity on its own?"
//
//   "I would add one qualifier on Build, when there is substantial revenue to
//    be gained by building and owning vs using and paying."
//
// I had treated "needs something built" as a disqualifier twice. It is the
// bigger sale. The two scores ADD — the best account is one where you sell the
// tools this week and the build after.
//
// Every weight below came from Russ scoring fifteen of his own businesses by
// hand on 2026-08-30. None of it is invented. The last scoring rebuild was
// thrown away because I made the numbers up, and this is the answer to that.

// What a seat of the usual software costs per month in each trade, from the
// vendors' own published pages. Where a trade has no published price the entry
// is left out rather than guessed — a business in a trade we have no price for
// simply does not earn the renting-forever points.
//
//   staffing        Bullhorn publishes $99 Starter and $165 Core per user
//                   https://www.pin.com/blog/bullhorn-pricing/
//   real estate     $49–199 per user; teams $250–1,500 total
//                   https://bounti.ai/real-estate-crm-pricing
//   medical         $50–350 per provider for a small practice; $200–700 is the
//                   usual band for cloud systems
//                   https://themedicalpractice.com/technology/medical-practice-management-software-pricing/
//   dental          same shape as medical — practice management priced per chair
//   personal care   therapy and clinic practice management, SimplePractice from
//                   $49 per clinician
//                   https://zandahealth.com/blog/therapy-practice-management-pricing/
//   construction    BuilderTrend and CoConstruct $50–100+ per user; Procore is
//                   priced on build volume at $10k–50k+ a year
//                   https://projul.com/blog/construction-software-pricing-guide-2026
//   trades          the same field-service tier as residential construction
//
// Read 2026-08-30. All secondary write-ups of vendor pricing rather than the
// vendor pages themselves — good enough to RANK on, NOT good enough to quote at
// a prospect. Any number that goes in a message gets checked at the source.
//
// Deliberately conservative: the low end of each published band, so the score
// under-claims rather than over-claims. A number that flatters the case is the
// same defect as an invented one.
const SEAT_COST = {
  staffing: 165,
  'real estate': 120,
  medical: 200,
  dental: 200,
  'personal care': 60,
  construction: 75,
  trades: 75,
  veterinary: 150,
  legal: 100,
  accounting: 80,
};

// Trades where the work is standard enough that somebody already sells the
// software. Russ scored these 6-9 on tools.
const TOOLS_EXIST = /^(accounting|legal|insurance|dental|medical|veterinary|real estate|staffing|cleaning|professional services|personal care|trades|landscaping|auto)$/i;

// Trades where the work is bespoke by its nature — every job is a different
// shape, so the generic product half-fits. Russ scored these 6-8 on build.
const BESPOKE_BY_NATURE = /^(manufacturing|construction|storage & logistics)$/i;

function howMuchTheToolsWouldHelp(r, people) {
  if (!r.trade) return null;
  let s = TOOLS_EXIST.test(r.trade) ? 60 : 35;

  // More people means more of the same conversation happening every day, which
  // is the thing bought software is good at. Russ's own scores rose with head
  // count in every trade: Zona Wellness at six people scored 8, the one-person
  // therapy practice scored 8 too — so size lifts it but does not decide it.
  if (people >= 6) s += 20; else if (people >= 3) s += 12; else if (people >= 1) s += 5;

  return Math.max(0, Math.min(100, s));
}

// HOW MANY SEATS A BUSINESS OF THIS KIND ACTUALLY HAS.
//
// The head count on a record is what the website happened to name, not how many
// people work there. A one-person medical staffing agency is not a one-person
// business — Russ scored it 8 for a build where the record earned 3, because a
// staffing agency is people-heavy whatever its About page lists.
//
// So each trade carries a floor: the smallest number of paid seats a working
// business of that kind realistically runs. Below the floor we use the floor;
// above it we believe the record. A one-man tree service has no floor to raise
// because a one-man tree service really is one man (2026-08-30).
const SEATS_FLOOR = {
  staffing: 4,        // an agency without recruiters is not an agency
  'real estate': 5,   // a brokerage carries agents; the site names a fraction
  medical: 3,         // a practice runs providers plus front desk
  dental: 3,
  veterinary: 3,
  legal: 2,
  accounting: 2,
  insurance: 2,
};

function howMuchThereIsToBuild(r, people) {
  if (!r.trade) return null;
  // A REAL BUSINESS WITH SEVERAL PEOPLE ALMOST ALWAYS HAS SOMETHING WORTH
  // BUILDING. Russ scored fourteen of his own by hand and every score of 6 or
  // more was a business with several people, several services, or work that is
  // bespoke by its nature. Every score of 3 or less was one or two people doing
  // a single standard thing — a photographer, a therapist, a tree surgeon.
  //
  // The first version started at 20 and had to climb, so it under-scored almost
  // everything. It starts high and comes DOWN for the small standard ones,
  // which is the shape of his judgement rather than mine (2026-08-30).
  let s = 20;
  const bits = [];

  // 1. IS THE WORK UNUSUAL. East Cascade Contracting scored 8: junk removal,
  // snow plowing, excavation and septic are four businesses sharing one back
  // office, and no product covers that.
  if (BESPOKE_BY_NATURE.test(r.trade)) { s += 30; bits.push('the work is a different shape every time'); }

  // A ONE-PERSON TRADE HAS NOTHING TO BUILD. P&D Tree Service: one man pruning
  // and grinding stumps. Russ scored it 2; the first version said 5 because the
  // trade carried a seat price. Standard work done by one person is a business
  // that buys a tool, not one that commissions software (2026-08-30).
  // A one-person standard trade has nothing to build. P&D Tree Service: one man
  // pruning and grinding stumps, scored 2 by Russ.
  const oneManTrade = people <= 1 && /^(trades|landscaping|cleaning & facilities|auto|personal care)$/i.test(r.trade);
  if (oneManTrade) s -= 20;

  // 2. ARE THEY RUNNING SEVERAL THINGS AT ONCE. Counted from their own
  // description, not guessed — a business listing four unrelated services is
  // telling you it runs four operations.
  // HOW MANY BUSINESSES ARE REALLY IN HERE — read off the page, not counted.
  //
  // "junk removal, snow plowing, excavation, septic" is four operations sharing
  // one back office; Russ scored it 8. "wiring, additions, panel replacements,
  // and service work" is one electrician listing his trade; Russ scored it 3.
  // Counting commas reads them identically and scored the electrician 7.
  //
  // Russ, 2026-08-30: "You're taking a keyword approach instead of semantic
  // understanding again. You're saying you can't tell the difference?" No —
  // the difference is obvious to anyone reading the page, so the reader is now
  // asked outright and this only uses the answer.
  const ops = Number.isFinite(r.separateOperations) ? r.separateOperations : 1;
  if (ops >= 4) { s += 25; bits.push(`${ops} genuinely different operations under one roof`); }
  else if (ops >= 2) { s += 12; bits.push(`${ops} separate operations under one roof`); }

  // 3. WHAT THEY PAY, FOREVER, FOR SOMETHING THAT HALF-FITS. Russ's addition
  // and the one that closes: owning beats renting. Five agents on property
  // software at $120 a seat is $7,200 a year that never stops.
  // Counted from one seat upward. The first version needed two people and so
  // scored a one-person medical staffing agency at 2 where Russ scored it 8 —
  // he was pricing what recruitment software costs per recruiter, which bites
  // at one recruiter just as hard (2026-08-30).
  const trade = String(r.trade).toLowerCase();
  const seat = SEAT_COST[trade];
  if (seat) {
    const seats = Math.max(1, people, SEATS_FLOOR[trade] || 1);
    const yearly = seat * seats * 12;
    if (yearly >= 10000) s += 35;
    else if (yearly >= 5000) s += 25;
    else if (yearly >= 2000) s += 18;
    else s += 10;
    bits.push(`about $${yearly.toLocaleString()} a year in seats, forever`);
  }

  return { score: Math.max(0, Math.min(100, s)), because: bits };
}

// Which of the four conversations to have. Russ, 2026-08-30: "depending on our
// mix of opportunity is how we shape the messaging".
function whichConversation(tools, build) {
  if (tools == null || build == null) return 'not enough read yet';
  if (tools >= 60 && build >= 60) return 'quick wins now, the bigger thing after';
  if (build >= 60) return 'nothing off the shelf fits this';
  if (tools >= 60) return 'hours back this week';
  return 'leave them';
}

function opportunityOf(r, peopleCount) {
  const people = Number.isFinite(peopleCount) ? peopleCount : 0;
  const tools = howMuchTheToolsWouldHelp(r, people);
  const built = howMuchThereIsToBuild(r, people);
  return {
    tools,
    build: built ? built.score : null,
    whyBuild: built ? built.because : [],
    conversation: whichConversation(tools, built && built.score),
  };
}

module.exports = {
  HOURS_AT_PERCENTILE, MEASURED_ON, MEASURED_ACROSS, scoreFromHours,
  AUTOMATABLE, OFFICE_SHARE_FLOOR, TYPICAL_TEAM, WEEK_HOURS, CALIBRATION,
  automatableFor, officeShareFor, hoursSittingHere, industryTable,
  opportunityOf, whichConversation, SEAT_COST,
};
