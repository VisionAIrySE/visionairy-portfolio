// Hours Back — team-size bands, audit fee and guaranteed hours.
//
// PRECEDENCE: on any disputed number, docs/hoursback/locked-decisions.md wins
// over docs/hoursback/business-model.md (the business model's own §10 rule).
// Both documents carry the same nine-band table as of 2026-08-25; the checks
// in scripts/hoursback/run-spec-checks.js re-derive this table from BOTH
// documents on every run, so a silent edit to either one fails the build.
//
// The fee follows the hours, never the headcount: $100 for every guaranteed
// hour a week, at every band above the entry price. The $999 entry price is
// $1,000 rounded down — the single documented rounding, the only exception.

const TEAM_SIZE_BANDS = [
  // source: business-model.md — §3 The pricing rule, band table row "Up to 10"
  // source: locked-decisions.md — Pricing (settled), band table row "Up to 10"
  { name: 'up-to-10',  floor: 1,   ceiling: 10,  auditFee: 999,   guaranteedHours: 10 },
  // source: business-model.md — §3 The pricing rule, band table row "11–15"
  { name: '11-15',     floor: 11,  ceiling: 15,  auditFee: 1500,  guaranteedHours: 15 },
  // source: business-model.md — §3 The pricing rule, band table row "16–20"
  { name: '16-20',     floor: 16,  ceiling: 20,  auditFee: 2000,  guaranteedHours: 20 },
  // source: business-model.md — §3 The pricing rule, band table row "21–25"
  { name: '21-25',     floor: 21,  ceiling: 25,  auditFee: 2500,  guaranteedHours: 25 },
  // source: business-model.md — §3 The pricing rule, band table row "26–35"
  { name: '26-35',     floor: 26,  ceiling: 35,  auditFee: 3500,  guaranteedHours: 35 },
  // source: business-model.md — §3 The pricing rule, band table row "36–50"
  { name: '36-50',     floor: 36,  ceiling: 50,  auditFee: 5000,  guaranteedHours: 50 },
  // source: business-model.md — §3 The pricing rule, band table row "51–75"
  { name: '51-75',     floor: 51,  ceiling: 75,  auditFee: 7500,  guaranteedHours: 75 },
  // source: business-model.md — §3 The pricing rule, band table row "76–100"
  { name: '76-100',    floor: 76,  ceiling: 100, auditFee: 10000, guaranteedHours: 100 },
  // source: business-model.md — §3 The pricing rule, band table row "101–150"
  { name: '101-150',   floor: 101, ceiling: 150, auditFee: 15000, guaranteedHours: 150 },
];

// Named reasons for counts the table cannot price. Never throw — a caller
// handing us a bad count gets a null band and a reason, not a crash.
const BELOW_FLOOR = 'below_smallest_floor';
const ABOVE_CEILING = 'above_largest_ceiling';

function bandForEmployeeCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < TEAM_SIZE_BANDS[0].floor) {
    return { band: null, auditFee: null, guaranteedHours: null, reason: BELOW_FLOOR };
  }
  const last = TEAM_SIZE_BANDS[TEAM_SIZE_BANDS.length - 1];
  if (n > last.ceiling) {
    return { band: null, auditFee: null, guaranteedHours: null, reason: ABOVE_CEILING };
  }
  const b = TEAM_SIZE_BANDS.find((x) => n >= x.floor && n <= x.ceiling);
  return { band: b.name, floor: b.floor, ceiling: b.ceiling, auditFee: b.auditFee, guaranteedHours: b.guaranteedHours, reason: null };
}

exports.TEAM_SIZE_BANDS = TEAM_SIZE_BANDS;
exports.bandForEmployeeCount = bandForEmployeeCount;
exports.OUT_OF_RANGE_REASONS = { BELOW_FLOOR, ABOVE_CEILING };
