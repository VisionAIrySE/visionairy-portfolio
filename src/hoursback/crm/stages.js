// The ladder and the axes beside it. Stage is WHERE a prospect stands; a call
// outcome is WHAT HAPPENED on one dial. Neither ever writes the other.
const LADDER = ['NO_CONTACT', 'INITIAL_CONTACT', 'ACTIVE', 'IN_PROCESS', 'CUSTOMER', 'EXPANDED_CUSTOMER'];
const OFF_LADDER = ['NEEDS_REVIEW', 'DORMANT'];
const CALL_OUTCOMES = ['NO_ANSWER', 'VOICEMAIL', 'GATEKEEPER', 'WRONG_NUMBER', 'NOT_INTERESTED', 'INTERESTED'];
// The give-up threshold's source of truth is business-model.md §8: three
// touches with no reply. Configurable, never hardcoded at the call site.
const GIVE_UP_ATTEMPTS = Number(process.env.HOURSBACK_GIVE_UP_ATTEMPTS || 3);

function assertStage(s) { if (![...LADDER, ...OFF_LADDER].includes(s)) throw new Error(`unknown stage: ${s}`); }

// Advance one rung, never skipping: each ladder stage may only move to its
// immediate successor (EXPANDED_CUSTOMER only from CUSTOMER, and so on).
async function advanceStage(db, prospectId, to) {
  assertStage(to);
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  const from = p.stage;
  const fi = LADDER.indexOf(from), ti = LADDER.indexOf(to);
  if (ti === -1) throw new Error(`cannot advance to off-ladder stage ${to}`);
  if (fi === -1) {
    // off-ladder (NEEDS_REVIEW, DORMANT) may re-enter only at the bottom rungs
    if (ti > 1) throw new Error(`cannot jump from ${from} to ${to}`);
  } else if (ti !== fi + 1) {
    throw new Error(`cannot skip from ${from} to ${to} — the ladder moves one rung at a time`);
  }
  return db.prospect.update({ where: { id: prospectId }, data: { stage: to } });
}

// Permanent suppression: out of every queue and every send list, survives
// every refresh, and reactivation never resurrects it.
async function markDoNotContact(db, prospectId) {
  return db.prospect.update({ where: { id: prospectId }, data: { doNotContact: true } });
}

// A prospect leaving the ladder records why and when to look again.
async function markLost(db, prospectId, lostReason, reactivateAfter) {
  return db.prospect.update({
    where: { id: prospectId },
    data: { stage: 'DORMANT', lostReason, reactivateAfter: reactivateAfter || null },
  });
}

// The dormancy sweep: give-up threshold reached with no reply -> DORMANT;
// dormant prospects whose reactivation date has passed come back to the
// bottom of the ladder — unless suppressed, which nothing overrides.
async function dormancySweep(db, now = new Date()) {
  const tired = await db.prospect.findMany({
    where: { stage: { in: ['NO_CONTACT', 'INITIAL_CONTACT'] }, attemptCount: { gte: GIVE_UP_ATTEMPTS }, doNotContact: false },
    select: { id: true },
  });
  for (const t of tired) {
    await db.prospect.update({ where: { id: t.id }, data: { stage: 'DORMANT', lostReason: 'no_reply_after_give_up', reactivateAfter: new Date(now.getTime() + 180 * 24 * 3600 * 1000) } });
  }
  const waking = await db.prospect.findMany({
    where: { stage: 'DORMANT', doNotContact: false, reactivateAfter: { lte: now } },
    select: { id: true },
  });
  for (const w of waking) {
    await db.prospect.update({ where: { id: w.id }, data: { stage: 'NO_CONTACT', attemptCount: 0, reactivateAfter: null } });
  }
  return { retired: tired.length, reactivated: waking.length };
}

exports.LADDER = LADDER;
exports.OFF_LADDER = OFF_LADDER;
exports.CALL_OUTCOMES = CALL_OUTCOMES;
exports.GIVE_UP_ATTEMPTS = GIVE_UP_ATTEMPTS;
exports.advanceStage = advanceStage;
exports.markDoNotContact = markDoNotContact;
exports.markLost = markLost;
exports.dormancySweep = dormancySweep;
