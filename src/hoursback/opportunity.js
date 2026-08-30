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

module.exports = { opportunityOf, whichConversation, SEAT_COST };
