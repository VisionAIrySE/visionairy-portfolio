// Hours Back — qualification: who gets on the call list at all.
//
// Each filter is transcribed from the locked definition, in the order the
// documents state them. The FIRST unsatisfied filter names the reason; a
// record that clears them all is qualified with an empty reason string.
//
// PRECEDENCE: docs/hoursback/locked-decisions.md wins on conflict — the
// business model's own §10 rule.

const QUALIFICATION_FILTERS = [
  {
    // Headcount is the pivot field: it sets the band, the fee and the promised
    // hours, and nothing proceeds without it.
    // source: business-model.md — §7 Target-list sourcing, "Headcount is the pivot field"
    reason: 'headcount_unresolved',
    fails: (r) => !Number.isFinite(Number(r && r.employeeCount)),
  },
  {
    // source: business-model.md — §7 numeric filter 1, "Drop anything under 5 employees"
    reason: 'below_minimum_headcount',
    fails: (r) => Number(r.employeeCount) < 5,
  },
  {
    // source: business-model.md — §7 numeric filter 3, "Drop anything above 150 employees"
    reason: 'above_maximum_headcount',
    fails: (r) => Number(r.employeeCount) > 150,
  },
  {
    // The phone lane is the one that produces revenue this month.
    // source: business-model.md — §7 numeric filter 5, "Drop businesses with no phone number"
    reason: 'no_phone_number',
    fails: (r) => !(r.phone && String(r.phone).trim().length > 0),
  },
  {
    // source: business-model.md — §7 numeric filter 4, "Drop the competitors named in §6"
    // source: locked-decisions.md — Competitive position (researched 2026-08-24)
    reason: 'named_competitor',
    fails: (r) => r.isCompetitor === true,
  },
  {
    // source: business-model.md — §7 numeric filter 4, "any business whose website
    // already advertises an AI automation partnership"
    reason: 'advertises_ai_partnership',
    fails: (r) => r.advertisesAiPartnership === true,
  },
];

function isQualified(record) {
  const r = record && typeof record === 'object' ? record : {};
  for (const f of QUALIFICATION_FILTERS) {
    let failed;
    try { failed = f.fails(r); } catch (e) { failed = true; }
    if (failed) return { qualified: false, reason: f.reason };
  }
  return { qualified: true, reason: '' };
}

exports.QUALIFICATION_FILTERS = QUALIFICATION_FILTERS;
exports.isQualified = isQualified;
