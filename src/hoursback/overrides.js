// Hours Back — hand corrections. The fetched value and the typed value live
// in separate columns (X and XManualValue); a correction never overwrites
// what the machine fetched, and a later sweep never overwrites the correction.
//
// resolveField: the value the rest of the engine uses — ManualValue when
// present, fetched otherwise.
// setOverride: writes the ManualValue column, records who and when, and
// appends a ProspectFieldEdit history row (field, before, after). If the
// corrected field is employeeCount, the band, auditFee and guaranteedHours
// are recomputed from the resolved count via the rules module — the fee
// follows the hours, never a per-employee figure.

const OVERRIDABLE = [
  'name', 'phone', 'website', 'address', 'employeeCount', 'email',
  // Trade was guessed from the business name or their own words and was never
  // correctable by hand, so a wrong guess stuck forever. Russ asked for it,
  // 2026-08-26. It has no ...ManualValue column of its own — the guess and the
  // correction share one field, because a guess is not a fetched fact.
  'trade',
];

function manualColumn(field) { return `${field}ManualValue`; }

function resolveField(record, field) {
  if (field === 'trade') return record.trade;
  const manual = record[manualColumn(field)];
  return manual !== null && manual !== undefined ? manual : record[field];
}

async function setOverride(db, prospectId, field, value, correctedBy) {
  if (!OVERRIDABLE.includes(field)) {
    throw new Error(`field "${field}" is not overridable (${OVERRIDABLE.join(', ')})`);
  }
  const before = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  // Trade has no fetched/corrected pair — the stored value was only ever a
  // guess from the business name or their own words, so a correction simply
  // replaces it rather than sitting beside it.
  const data = field === 'trade' ? { trade: value } : { [manualColumn(field)]: value };

  // A corrected headcount reprices the record from the resolved count.
  if (field === 'employeeCount') {
    const { bandForEmployeeCount } = require('./rules.js');
    const resolved = value !== null && value !== undefined ? value : before.employeeCount;
    const b = bandForEmployeeCount(resolved);
    data.segment = b.band;
    data.auditFee = b.auditFee;
    data.guaranteedHours = b.guaranteedHours;
  }

  const after = await db.prospect.update({ where: { id: prospectId }, data });
  await db.prospectFieldEdit.create({
    data: {
      prospectId,
      fieldName: field,
      valueBefore: String(resolveField(before, field) ?? ''),
      valueAfter: String(value ?? ''),
      correctedBy,
    },
  });
  return after;
}

exports.OVERRIDABLE = OVERRIDABLE;
exports.resolveField = resolveField;
exports.setOverride = setOverride;
