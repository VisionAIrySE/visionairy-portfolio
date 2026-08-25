// The calling day: who to call now, who to follow up with, and whether the
// dials are turning into paid audits. Recomputed from raw rows every time —
// no stored totals to drift out of truth.
const QUEUE_SIZE = Math.min(30, Math.max(20, Number(process.env.HOURSBACK_QUEUE_SIZE || 25)));

// Paperwork-heavy name/website signals tilt the interim ordering until the
// full automation-fit score (lb6) lands. Headcount never affects ordering.
const HOT_WORDS = ['account', 'law', 'attorney', 'insur', 'property management', 'staffing',
  'clinic', 'dental', 'construction', 'real estate', 'veterinar', 'logistic', 'wholesale', 'manufactur'];
function interimScore(p) {
  let s = 0;
  const hay = `${p.name || ''} ${p.website || ''}`.toLowerCase();
  for (const w of HOT_WORDS) if (hay.includes(w)) s += 2;
  if (!p.website) s += 1; // no site = more manual = better prospect
  return s;
}

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d = new Date()) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

// Today's call queue: promised callbacks due today FIRST regardless of score,
// then fresh prospects by score. Excludes suppressed, dormant, needs-review,
// phoneless, and anyone already called today. Never exceeds its size.
async function callQueue(db, now = new Date()) {
  const calledToday = (await db.callLog.findMany({
    where: { loggedAt: { gte: startOfDay(now), lte: endOfDay(now) } }, select: { prospectId: true },
  })).map((c) => c.prospectId);

  const callbacks = await db.prospect.findMany({
    where: {
      doNotContact: false, NOT: { phone: null }, id: { notIn: calledToday },
      stage: { notIn: ['DORMANT', 'NEEDS_REVIEW'] },
      nextActionDate: { gte: startOfDay(now), lte: endOfDay(now) },
    },
    orderBy: { nextActionDate: 'asc' },
  });
  const cold = await db.prospect.findMany({
    where: {
      doNotContact: false, NOT: { phone: null }, id: { notIn: calledToday.concat(callbacks.map((c) => c.id)) },
      stage: 'NO_CONTACT',
    },
  });
  cold.sort((a, b) => interimScore(b) - interimScore(a));
  return callbacks.concat(cold).slice(0, QUEUE_SIZE)
    .map((p) => ({ ...p, isCallbackDueToday: !!callbacks.find((c) => c.id === p.id) }));
}

// Everyone whose next action is due today or overdue — and it STAYS here
// until the action is done, not just until midnight.
async function followUpQueue(db, now = new Date()) {
  return db.prospect.findMany({
    where: {
      doNotContact: false, stage: { notIn: ['DORMANT', 'NEEDS_REVIEW'] },
      nextActionDate: { lte: endOfDay(now) },
    },
    orderBy: { nextActionDate: 'asc' },
  });
}

// The readout: paid prospects over logged calls, this week against the
// 2-3 paid audits target, broken down by rough category so a dead vein shows.
async function callToPaidReadout(db, days = 28, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const calls = await db.callLog.findMany({ where: { loggedAt: { gte: since } }, select: { prospectId: true } });
  const paid = await db.prospect.findMany({ where: { paidAt: { gte: since } }, select: { id: true, name: true } });
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const paidThisWeek = await db.prospect.count({ where: { paidAt: { gte: weekStart } } });
  const saidYesUnpaid = await db.prospect.findMany({
    where: { stage: { in: ['CUSTOMER', 'EXPANDED_CUSTOMER'] }, paidAt: null }, select: { name: true },
  });
  return {
    windowDays: days,
    callsLogged: calls.length,
    distinctProspectsCalled: new Set(calls.map((c) => c.prospectId)).size,
    paidInWindow: paid.length,
    callToPaidRate: calls.length ? +(paid.length / calls.length).toFixed(4) : 0,
    paidThisWeek, weeklyTarget: '2-3',
    saidYesButUnpaid: saidYesUnpaid.map((p) => p.name),
  };
}

exports.QUEUE_SIZE = QUEUE_SIZE;
exports.callQueue = callQueue;
exports.followUpQueue = followUpQueue;
exports.callToPaidReadout = callToPaidReadout;
exports.interimScore = interimScore;
