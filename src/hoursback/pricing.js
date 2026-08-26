// Hours Back — the one offer.
//
// PRECEDENCE: on any disputed number, docs/hoursback/locked-decisions.md wins
// over docs/hoursback/business-model.md (the business model's own §10 rule).
//
// $999. Five hours a week found, or nothing to pay. The same for every
// business at every size — Russ, 2026-08-26. The nine headcount bands that
// used to live here are retired, along with the per-hour rule behind them.
// Nothing computes a price from the hours or the hours from a price.

const { THE_OFFER } = require('./industryTiers.js');

// Kept as a one-row table so every caller that used to walk bands still works.
const TEAM_SIZE_BANDS = [
  // source: locked-decisions.md — Pricing (settled 2026-08-26)
  // source: business-model.md — §3 The pricing rule, the one-row offer table
  // source: locked-decisions.md — Pricing (settled 2026-08-26)
  { name: 'smb', floor: 1, ceiling: Infinity, auditFee: THE_OFFER.fee, guaranteedHours: THE_OFFER.hours },
];

// Named reason kept so a caller handing us a bad count still gets a reason
// rather than a crash. Nothing is out of range on size any more.
const BELOW_FLOOR = 'below_smallest_floor';
const ABOVE_CEILING = 'above_largest_ceiling';

function bandForEmployeeCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 1) {
    return { band: null, auditFee: null, guaranteedHours: null, reason: BELOW_FLOOR };
  }
  const b = TEAM_SIZE_BANDS[0];
  return { band: b.name, floor: b.floor, ceiling: b.ceiling, auditFee: b.auditFee, guaranteedHours: b.guaranteedHours, reason: null };
}

exports.TEAM_SIZE_BANDS = TEAM_SIZE_BANDS;
exports.bandForEmployeeCount = bandForEmployeeCount;
exports.OUT_OF_RANGE_REASONS = { BELOW_FLOOR, ABOVE_CEILING };
