// Hours Back — hand corrections.
//
// One value per field. Editing replaces what is on the record, and a later
// reading of their website can replace it again. Every change is kept in the
// change history, so nothing is lost even though nothing is frozen.
//
// It used to work the other way: a second column per field held "what Russ
// typed" and outranked everything forever. It did not survive contact with the
// data — 1,279 websites and 1,064 names were sitting in those columns without
// him having touched them, while the record of corrections showed eight. Worse,
// the website reader only ever looked at the machine's column, so it silently
// skipped 1,226 businesses including the one he was looking at (2026-08-31).

const OVERRIDABLE = [
  'name', 'phone', 'website', 'address', 'employeeCount', 'email',
  // Trade was guessed from the business name or their own words and was never
  // correctable by hand, so a wrong guess stuck forever. Russ asked for it,
  // 2026-08-26. It has no ...ManualValue column of its own — the guess and the
  // correction share one field, because a guess is not a fetched fact.
  'trade',
];

// THE VALUE ON THE RECORD. ONE COLUMN, NOT TWO.
//
// There used to be a second column per field holding "what Russ typed", which
// outranked everything and was never overwritten. It did not work: 1,279
// websites and 1,064 names ended up in those columns without him touching
// them, the record of corrections showed he had made eight, and the website
// reader — which only ever looked at the machine's column — silently skipped
// 1,226 businesses (2026-08-31).
//
// His words: "REMOVE THE RULE THAT ANYTHING I TYPE GETS SAVED. Just add a
// warning before changing." So there is one value per field, a warning on
// screen before it is replaced, and the history of every change is still kept.
function resolveField(record, field) {
  return record[field];
}

async function setOverride(db, prospectId, field, value, correctedBy) {
  if (!OVERRIDABLE.includes(field)) {
    throw new Error(`field "${field}" is not overridable (${OVERRIDABLE.join(', ')})`);
  }
  const before = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  // Trade has no fetched/corrected pair — the stored value was only ever a
  // guess from the business name or their own words, so a correction simply
  // replaces it rather than sitting beside it.
  // One column. A change writes the value itself; the old value is kept in the
  // change history rather than in a second column beside it.
  const data = { [field]: value };

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
