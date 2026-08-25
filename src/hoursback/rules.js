// Hours Back — the rules module. One import point for every other part of the
// engine: qualification (who gets on the list) and pricing (what band they
// fall in, the auditFee, and the guaranteed hours).
//
// QUALIFICATION_FILTERS and TEAM_SIZE_BANDS live in their own modules with a
// source comment on every constant; this module re-exports them so a caller
// never reaches into two files for one decision.

const { isQualified, QUALIFICATION_FILTERS } = require('./qualification.js');
const { bandForEmployeeCount, TEAM_SIZE_BANDS, OUT_OF_RANGE_REASONS } = require('./pricing.js');

exports.isQualified = isQualified;
exports.QUALIFICATION_FILTERS = QUALIFICATION_FILTERS;
exports.bandForEmployeeCount = bandForEmployeeCount;
exports.TEAM_SIZE_BANDS = TEAM_SIZE_BANDS;
exports.OUT_OF_RANGE_REASONS = OUT_OF_RANGE_REASONS;
