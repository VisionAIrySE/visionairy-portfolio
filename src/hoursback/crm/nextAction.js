// The after-call flow: three answers, everything else automatic. And the
// invariant that keeps the pipeline honest — every live prospect carries a
// next action and a date, or it appears in the leak report by name.
const { CALL_OUTCOMES, LADDER } = require('./stages.js');
const { writeCallback } = require('./calendar.js');

const LIVE_STAGES = ['INITIAL_CONTACT', 'ACTIVE', 'IN_PROCESS'];

// logCall(db, prospectId, {outcome, nextWhat, nextWhen}, callKey?)
// One call writes: the call log row (append-only, idempotent by callKey),
// the outcome, the next action and date, the attempt count, a promised
// callback's calendar file — and advances the stage ONLY when the outcome
// warrants it (INTERESTED from the bottom rungs).
async function logCall(db, prospectId, answers, callKey) {
  const { outcome, nextWhat, nextWhen } = answers || {};
  if (!outcome || !CALL_OUTCOMES.includes(outcome)) throw new Error(`the first answer must be one of: ${CALL_OUTCOMES.join(', ')}`);
  if (!nextWhat || !String(nextWhat).trim()) throw new Error('the second answer (what happens next) is required');
  if (!nextWhen) throw new Error('the third answer (when) is required');

  if (callKey) {
    const dup = await db.callLog.findUnique({ where: { callKey } });
    if (dup) return { alreadyLogged: true, callLog: dup };
  }
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  const when = new Date(nextWhen);

  const log = await db.callLog.create({
    data: { prospectId, callKey: callKey || null, outcome, wentHow: answers.wentHow || null, nextWhat, nextWhen: when },
  });

  const data = { attemptCount: p.attemptCount + 1, nextAction: nextWhat, nextActionDate: when };
  // stage advances only when the answer warrants it — a favourable response
  // moves NO_CONTACT/INITIAL_CONTACT forward; nothing else moves anything.
  if (outcome === 'INTERESTED') {
    if (p.stage === 'NO_CONTACT') data.stage = 'INITIAL_CONTACT';
    else if (p.stage === 'INITIAL_CONTACT') data.stage = 'ACTIVE';
  }
  if (outcome === 'NOT_INTERESTED') data.lostReason = answers.wentHow || 'not_interested';
  if (p.stage === 'NO_CONTACT' && outcome !== 'INTERESTED' && !data.stage) data.stage = 'INITIAL_CONTACT'; // first touch made

  const updated = await db.prospect.update({ where: { id: prospectId }, data });

  // a specific promised time goes on the calendar; a vague "next week" does not
  let calendarFile = null;
  const hasTime = /T\d{2}:\d{2}/.test(String(nextWhen)) || (when.getHours() + when.getMinutes() > 0);
  if (hasTime) calendarFile = writeCallback(updated, when);

  return { callLog: log, prospect: updated, calendarFile };
}

// Every live prospect with no next action or date, by name. Empty = healthy.
async function leakReport(db) {
  const leaks = await db.prospect.findMany({
    where: {
      stage: { in: LIVE_STAGES }, doNotContact: false,
      OR: [{ nextAction: null }, { nextActionDate: null }],
    },
    select: { id: true, name: true, stage: true },
  });
  return leaks;
}

exports.LIVE_STAGES = LIVE_STAGES;
exports.logCall = logCall;
exports.leakReport = leakReport;
