// The frozen quote. Written ONCE, from the resolved headcount at that moment,
// via the band table in the rules module. Never recomputed afterwards — a
// later headcount change must not alter a promise already made.
const { bandForEmployeeCount } = require('../rules.js');
const { resolveField } = require('../overrides.js');

async function freezeQuote(db, prospectId) {
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.quotedAt) {
    const err = new Error('quote already frozen for this prospect — a promise made is not remade');
    err.code = 'ALREADY_QUOTED';
    throw err;
  }
  const headcount = resolveField(p, 'employeeCount');
  const b = bandForEmployeeCount(headcount);
  if (!b.band) {
    const err = new Error(`cannot quote: headcount ${headcount} is outside every band (${b.reason})`);
    err.code = 'UNQUOTABLE';
    throw err;
  }
  return db.prospect.update({
    where: { id: prospectId },
    data: {
      quotedAt: new Date(), quotedHeadcount: headcount, quotedBand: b.band,
      quotedAuditFee: b.auditFee, quotedGuaranteedHours: b.guaranteedHours,
    },
  });
}

exports.freezeQuote = freezeQuote;
