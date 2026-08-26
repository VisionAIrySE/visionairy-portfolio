// The calling day: who to call now, who to follow up with, and whether the
// dials are turning into paid audits. Recomputed from raw rows every time —
// no stored totals to drift out of truth.
const QUEUE_SIZE = Math.min(30, Math.max(20, Number(process.env.HOURSBACK_QUEUE_SIZE || 25)));

// A stand-in from before the real automation-fit score existed: paperwork-heavy
// words in the name. Still used, but ONLY for a business whose website has not
// been read yet and so carries no real score. Headcount never affects ordering.
const HOT_WORDS = ['account', 'law', 'attorney', 'insur', 'property management', 'staffing',
  'clinic', 'dental', 'construction', 'real estate', 'veterinar', 'logistic', 'wholesale', 'manufactur'];
function interimScore(p) {
  let s = 0;
  const hay = `${p.name || ''} ${p.website || ''}`.toLowerCase();
  for (const w of HOT_WORDS) if (hay.includes(w)) s += 2;
  if (!p.website) s += 1; // no site = more manual = better prospect
  return s;
}

// The real score when the website has been read, the stand-in when it has not.
// An unread business sorts below every read one, because a guess should never
// outrank a reading.
function orderingScore(p) {
  return p.automationScore === null || p.automationScore === undefined
    ? interimScore(p) / 100
    : p.automationScore;
}

// Six insurance agents from the same franchise scored identically and filled
// the whole top of the list — the same conversation six times before lunch.
// Businesses sharing a brand are capped per day so the list stays worth
// working. A name written "Ryan Walker - State Farm Insurance Agent" brands on
// what follows the dash; everything else brands on its first three words.
const MAX_PER_BRAND_PER_DAY = 2;
function brandKey(name) {
  const n = String(name || '').trim();
  const dash = n.lastIndexOf(' - ');
  const base = dash > 0 ? n.slice(dash + 3) : n;
  return base.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 3).join(' ');
}
function capPerBrand(rows, cap = MAX_PER_BRAND_PER_DAY) {
  const seen = new Map();
  const kept = [];
  for (const r of rows) {
    const k = brandKey(r.name);
    const n = seen.get(k) || 0;
    if (n >= cap) continue;
    seen.set(k, n + 1);
    kept.push(r);
  }
  return kept;
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
  // Pull a deep enough slice that the brand cap still leaves a full day's work,
  // ordered by the real score in the database rather than by loading every
  // business into memory first.
  const cold = await db.prospect.findMany({
    where: {
      doNotContact: false, NOT: { phone: null }, id: { notIn: calledToday.concat(callbacks.map((c) => c.id)) },
      stage: 'NO_CONTACT',
    },
    orderBy: [{ automationScore: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    take: QUEUE_SIZE * 20,
  });
  // Same order, now with the stand-in filling in for anything unread, and the
  // tie broken by name so the same data always produces the same day.
  cold.sort((a, b) => orderingScore(b) - orderingScore(a) || String(a.name).localeCompare(String(b.name)));
  return callbacks.concat(capPerBrand(cold)).slice(0, QUEUE_SIZE)
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
exports.orderingScore = orderingScore;
exports.brandKey = brandKey;
exports.capPerBrand = capPerBrand;
exports.MAX_PER_BRAND_PER_DAY = MAX_PER_BRAND_PER_DAY;
