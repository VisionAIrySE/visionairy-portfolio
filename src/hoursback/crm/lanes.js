// The three ways a business gets reached, and the rules that keep them honest.
//
//   PHONE     — Russ dials. Always available, never blocked by anything here.
//   EMAIL     — the engine sends, but only a message Russ approved once, and
//               only within a daily cap that rises week by week.
//   LINKEDIN  — Russ sends by hand, one at a time. The engine may never mark a
//               LinkedIn message sent; a person's name has to be on it.
//
// The rule that matters most: a reply on ANY lane stops every message still
// waiting on EVERY lane. Nobody who has answered gets chased.

const { draftFirstContact, draftLinkedIn, BODY } = require('./firstContact.js');
const crypto = require('crypto');

// Every sentence that can reach a reader, in one fingerprint. Approval is of
// THESE WORDS. Change any of them and the approval stops counting, which is
// what Russ expected all along.
function wordingFingerprint() {
  const V = require('./variants.js');
  const { CREDIBILITY, SUBJECTS, OPENERS, TRADE_FOLLOW_ONS } = require('./firstContact.js');
  const everything = JSON.stringify([
    BODY, V.OPENINGS, V.WHAT_I_DO, V.GUARANTEE, V.YEAR_FRAMING, V.CLOSES,
    V.TELL_WORDINGS, V.PRICE_FRAMING, CREDIBILITY, SUBJECTS, OPENERS, TRADE_FOLLOW_ONS,
  ]);
  return crypto.createHash('sha256').update(everything).digest('hex').slice(0, 16);
}

const LANES = ['PHONE', 'EMAIL', 'LINKEDIN'];
const MESSAGE_STATES = ['DRAFT', 'QUEUED', 'SENT', 'REPLIED', 'SUPPRESSED'];
const FIRST_CONTACT = 'first_contact';

// A brand new sending address that suddenly sends hundreds of messages gets
// treated as a spammer. This rises week by week from the first send.
const EMAIL_RAMP = [10, 20, 30, 40, 50, 75, 100];
function dailyEmailCap(weeksSending = 0) {
  return EMAIL_RAMP[Math.min(Math.max(0, Math.floor(weeksSending)), EMAIL_RAMP.length - 1)];
}

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d = new Date()) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

// ---------------------------------------------------------------------------
// the approved-once message

async function upsertTemplate(db, { subject, body, name = FIRST_CONTACT }) {
  const existing = await db.messageTemplate.findUnique({ where: { name } });
  if (!existing) return db.messageTemplate.create({ data: { name, subject, body } });
  // Changing the wording un-approves it. A message Russ has not read does not
  // send, no matter that an earlier version of it was approved.
  const changed = existing.subject !== subject || existing.body !== body;
  return db.messageTemplate.update({
    where: { name },
    data: changed
      ? { subject, body, version: existing.version + 1, approvedAt: null, approvedBy: null }
      : {},
  });
}

async function approveTemplate(db, name = FIRST_CONTACT, approvedBy = 'russ') {
  return db.messageTemplate.update({
    where: { name },
    data: { approvedAt: new Date(), approvedBy, approvedWording: wordingFingerprint() },
  });
}

// Approval attaches to a WORDING, not to a row. If the message has been
// rewritten since Russ read it, the old approval does not cover what would
// now go out, so it stops counting. Found 2026-08-26: the screen was showing
// an approved copy saved at 3am while the message had been rewritten all
// night, and because it read as approved the approve button was hidden —
// there was no way back to the current words.
async function templateIsApproved(db, name = FIRST_CONTACT) {
  const t = await db.messageTemplate.findUnique({ where: { name } });
  if (!t || !t.approvedAt) return false;
  if (name !== FIRST_CONTACT) return true;
  if (t.body !== BODY) return false;
  // The sentences, not just the shape.
  if (t.approvedWording !== wordingFingerprint()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// writing the drafts

function signalsOf(prospect) {
  try { return JSON.parse(prospect.scoreEvidence || '[]').filter((e) => e.signal !== 'category_tilt'); }
  catch { return []; }
}

// One draft per business per lane, never a second. Returns the row, or null
// when there is nothing specific to open with.
async function draftFor(db, prospectId, lane) {
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.doNotContact) return null;
  const built = lane === 'EMAIL' ? draftFirstContact(p, signalsOf(p)) : draftLinkedIn(p, signalsOf(p));
  if (!built) return null;
  if (lane === 'EMAIL' && !p.email && !p.emailManualValue) return null;

  // A draft already written is kept. The one exception: it is still sitting
  // unsent, Russ has never touched it, and the wording has moved on
  // underneath it — then it is rewritten rather than left stale. Twenty-five
  // drafts from 3am survived a whole night of rewrites because this returned
  // the existing row before it ever looked at the new words, 2026-08-26.
  const existing = await db.outreachMessage.findFirst({ where: { prospectId, lane } });
  if (existing) {
    const rewritable = existing.state === 'DRAFT' && !existing.editedAt && existing.body !== built.body;
    if (!rewritable) return existing;
    return db.outreachMessage.update({
      where: { id: existing.id },
      data: { subject: built.subject, body: built.body, openedWith: built.openedWith },
    });
  }

  const template = await db.messageTemplate.findUnique({ where: { name: FIRST_CONTACT } });
  return db.outreachMessage.create({
    data: {
      prospectId, lane, state: 'DRAFT',
      subject: built.subject, body: built.body, openedWith: built.openedWith,
      templateId: template ? template.id : null,
    },
  });
}

// ---------------------------------------------------------------------------
// sending

// Queue an email. Refuses outright while the wording is unapproved.
async function queueEmail(db, prospectId) {
  if (!await templateIsApproved(db)) {
    const e = new Error('the first-contact message has not been approved yet — nothing sends until it is');
    e.code = 'TEMPLATE_NOT_APPROVED';
    throw e;
  }
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.doNotContact || p.repliedAt || p.emailBouncedAt) return null;
  const msg = await draftFor(db, prospectId, 'EMAIL');
  if (!msg || msg.state !== 'DRAFT') return msg;
  return db.outreachMessage.update({ where: { id: msg.id }, data: { state: 'QUEUED', queuedAt: new Date() } });
}

// How many more may go out today. Sending stops at the cap and picks up
// tomorrow; it never spills over.
async function emailsLeftToday(db, weeksSending = 0, now = new Date()) {
  const sentToday = await db.outreachMessage.count({
    where: { lane: 'EMAIL', state: 'SENT', sentAt: { gte: startOfDay(now), lte: endOfDay(now) } },
  });
  return Math.max(0, dailyEmailCap(weeksSending) - sentToday);
}

async function markEmailSent(db, messageId, now = new Date()) {
  return db.outreachMessage.update({
    where: { id: messageId },
    data: { state: 'SENT', sentAt: now, sentBy: 'engine' },
  });
}

// LinkedIn: only a person may do this, and their name is recorded. Called
// without one, it refuses.
async function markLinkedInSent(db, messageId, sentBy) {
  if (!sentBy || String(sentBy).trim() === '' || String(sentBy).toLowerCase() === 'engine') {
    const e = new Error('a LinkedIn message can only be marked sent by a person, by name');
    e.code = 'LINKEDIN_NEEDS_A_PERSON';
    throw e;
  }
  const msg = await db.outreachMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (msg.lane !== 'LINKEDIN') throw new Error('not a LinkedIn message');
  return db.outreachMessage.update({
    where: { id: messageId },
    data: { state: 'SENT', sentAt: new Date(), sentBy: String(sentBy).trim() },
  });
}

// What Russ sends by hand, one action each.
async function linkedInQueue(db, limit = 20) {
  return db.outreachMessage.findMany({
    where: { lane: 'LINKEDIN', state: { in: ['DRAFT', 'QUEUED'] }, prospect: { doNotContact: false, repliedAt: null } },
    include: { prospect: true },
    orderBy: { prospect: { automationScore: 'desc' } },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// stopping

// A reply anywhere ends the chase everywhere.
async function markReplied(db, prospectId, lane = 'EMAIL', now = new Date()) {
  await db.prospect.update({ where: { id: prospectId }, data: { repliedAt: now } });
  await db.outreachMessage.updateMany({
    where: { prospectId, state: { in: ['DRAFT', 'QUEUED'] } },
    data: { state: 'SUPPRESSED', suppressedReason: `they replied on ${lane}` },
  });
  const answered = await db.outreachMessage.findFirst({ where: { prospectId, lane, state: 'SENT' } });
  if (answered) await db.outreachMessage.update({ where: { id: answered.id }, data: { state: 'REPLIED', repliedAt: now } });
  return db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
}

// A bounced address closes the email lane for that business and touches
// nothing else. They stay on the call list.
async function markBounced(db, prospectId, now = new Date()) {
  await db.prospect.update({ where: { id: prospectId }, data: { emailBouncedAt: now } });
  await db.outreachMessage.updateMany({
    where: { prospectId, lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } },
    data: { state: 'SUPPRESSED', suppressedReason: 'the address bounced' },
  });
  return db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
}

// Everyone the engine may still reach on a given lane. Suppression is applied
// here, in the query, so no caller can forget it.
async function reachableOn(db, lane, limit = 100) {
  const where = { doNotContact: false, repliedAt: null };
  if (lane === 'EMAIL') { where.emailBouncedAt = null; where.OR = [{ email: { not: null } }, { emailManualValue: { not: null } }]; }
  if (lane === 'PHONE') where.NOT = { phone: null };
  return db.prospect.findMany({ where, orderBy: { automationScore: 'desc' }, take: limit });
}

// ---------------------------------------------------------------------------
// the follow-up after a call
//
// Written from the three answers Russ gave after the dial, in the same voice,
// and dropped into a batch. Nothing in the batch sends until he clears it, and
// clearing it is one action for the whole batch, not one per message.

const FOLLOW_UP = 'follow_up';

// Built from what he actually said on the call — never invented.
function draftFollowUp(prospect, call) {
  if (!call || !call.nextWhat) return null;
  const { greetingFor } = require('./firstContact.js');
  const business = String(prospect.name || 'your business').replace(/, (LLC|Inc|Ltd)\.?$/i, '');
  const body = `Hi ${greetingFor(prospect)},

Thanks for taking my call, I appreciated you giving me the time.

As promised, ${String(call.nextWhat).trim().replace(/\.$/, '')}.

If anything comes up in the meantime you'd rather I looked at first, just say the word and I'll work it in.

Russ Wright
Visionairy
russ@visionairy.biz`;
  return { subject: `Following up — ${business}`, body, openedWith: 'after_the_call' };
}

// Put one in the batch. It lands unapproved and stays that way until the
// batch is cleared.
async function queueFollowUp(db, prospectId, call) {
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.doNotContact || p.repliedAt || p.emailBouncedAt) return null;
  if (!p.email && !p.emailManualValue) return null;
  const built = draftFollowUp(p, call);
  if (!built) return null;
  return db.outreachMessage.create({
    data: {
      prospectId, lane: 'EMAIL', state: 'DRAFT',
      subject: built.subject, body: built.body, openedWith: built.openedWith,
    },
  });
}

// Everything waiting on his eye.
async function pendingBatch(db) {
  return db.outreachMessage.findMany({
    where: { state: 'DRAFT', openedWith: 'after_the_call', prospect: { doNotContact: false, repliedAt: null } },
    include: { prospect: true },
    orderBy: { createdAt: 'asc' },
  });
}

// One action clears the whole batch.
async function approveBatch(db, now = new Date()) {
  const batch = await pendingBatch(db);
  if (!batch.length) return { approved: 0 };
  await db.outreachMessage.updateMany({
    where: { id: { in: batch.map((m) => m.id) } },
    data: { state: 'QUEUED', queuedAt: now },
  });
  return { approved: batch.length };
}

// ---------------------------------------------------------------------------
// the sequence
//
// Three messages, four days then a week apart. The later ones are where most
// replies come from, and each says something the last one did not. Every one
// of them stops the instant somebody answers, bounces, or is marked never
// contact again — and that is checked at the moment of queueing, not hoped for.

const { FOLLOW_UP_DAYS, draftFollowUpTouch } = require('./firstContact.js');

// Which touch a business is due, or null when it is not due anything.
function touchDue(sentTouches, firstSentAt, now = new Date()) {
  const next = sentTouches + 1;
  if (next > FOLLOW_UP_DAYS.length) return null;          // the sequence is finished
  if (next === 1) return 1;
  if (!firstSentAt) return null;
  const daysSince = (now - new Date(firstSentAt)) / 86400000;
  return daysSince >= FOLLOW_UP_DAYS[next - 1] ? next : null;
}

// Write and queue whatever a business is due next. Returns null when it is
// due nothing, or when anything at all says stop.
async function queueNextTouch(db, prospectId, now = new Date()) {
  if (!await templateIsApproved(db)) return null;
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.doNotContact || p.repliedAt || p.emailBouncedAt) return null;
  if (!p.email && !p.emailManualValue) return null;

  const sent = await db.outreachMessage.findMany({
    where: { prospectId, lane: 'EMAIL', state: { in: ['SENT', 'REPLIED'] }, openedWith: { not: 'after_the_call' } },
    orderBy: { sentAt: 'asc' },
  });
  const due = touchDue(sent.length, sent[0] ? sent[0].sentAt : null, now);
  if (due === null) return null;
  if (due === 1) return queueEmail(db, prospectId);

  const already = await db.outreachMessage.findFirst({ where: { prospectId, lane: 'EMAIL', openedWith: `touch_${due}` } });
  if (already) return already;
  const built = draftFollowUpTouch(p, sent[0] ? sent[0].openedWith : null, due);
  if (!built) return null;
  return db.outreachMessage.create({
    data: {
      prospectId, lane: 'EMAIL', state: 'QUEUED', queuedAt: now,
      subject: built.subject, body: built.body, openedWith: built.openedWith,
    },
  });
}

// Walk everyone reachable and queue whatever each is due. Bounded, like
// everything else that could run away.
async function queueDueTouches(db, options = {}) {
  const now = options.now || new Date();
  const limit = Math.min(Number(options.limit || 200), 500);
  const rows = await reachableOn(db, 'EMAIL', limit);
  const out = { first: 0, second: 0, third: 0, skipped: 0 };
  for (const p of rows) {
    const m = await queueNextTouch(db, p.id, now);
    if (!m) { out.skipped += 1; continue; }
    if (m.openedWith === 'touch_2') out.second += 1;
    else if (m.openedWith === 'touch_3') out.third += 1;
    else out.first += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// actually sending
//
// Three ceilings, all in the code, none of them optional:
//   · the day's ramp, which no run may exceed
//   · a per-run ceiling, so one click can never empty the queue
//   · a refusal to start at all without a key and an approved message
//
// The one that matters: a run counts what it has already sent and stops. It
// never trusts a loop to end on its own.

const MAX_PER_RUN = 25;          // one click sends at most this many, ever

async function sendQueuedEmails(db, options = {}) {
  const weeks = Number(options.weeksSending || 0);
  const key = options.apiKey || process.env.RESEND_API_KEY;
  const from = options.from || 'Russ Wright <russ@visionairy.biz>';
  const result = { attempted: 0, sent: 0, failed: 0, stoppedBecause: null };

  if (!await templateIsApproved(db)) { result.stoppedBecause = 'the message has not been approved'; return result; }
  if (!key) { result.stoppedBecause = 'no sending key is set — nothing was sent'; return result; }

  const allowedToday = await emailsLeftToday(db, weeks, options.now);
  const ceiling = Math.min(allowedToday, Number(options.limit || MAX_PER_RUN), MAX_PER_RUN);
  if (ceiling <= 0) { result.stoppedBecause = "today's ceiling is already spent"; return result; }

  const queued = await db.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: 'QUEUED', prospect: { doNotContact: false, repliedAt: null, emailBouncedAt: null } },
    include: { prospect: true },
    orderBy: { prospect: { automationScore: 'desc' } },
    take: ceiling,
  });

  const { toHtmlEmail, signatureText } = require('./signature.js');
  const send = options.send || defaultSender(key);

  for (const m of queued) {
    if (result.sent >= ceiling) { result.stoppedBecause = `stopped at the ceiling of ${ceiling}`; break; }
    const to = m.prospect.emailManualValue || m.prospect.email;
    if (!to) continue;
    result.attempted += 1;
    try {
      await send({
        from, to, subject: m.subject,
        html: toHtmlEmail(m.body),
        text: `${m.body.split(/\n\nRuss Wright\n/)[0]}\n\n${signatureText()}`,
      });
      await markEmailSent(db, m.id, options.now);
      result.sent += 1;
    } catch (e) {
      result.failed += 1;   // one refusal never stops the rest
    }
  }
  if (!result.stoppedBecause) result.stoppedBecause = 'the queue ran out';
  return result;
}

// The only place that talks to the outside world.
function defaultSender(key) {
  return async ({ from, to, subject, html, text }) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`send refused: ${res.status}`);
    return res.json();
  };
}

module.exports = {
  LANES, MESSAGE_STATES, EMAIL_RAMP, FIRST_CONTACT, FOLLOW_UP, MAX_PER_RUN,
  FOLLOW_UP_DAYS, touchDue, queueNextTouch, queueDueTouches,
  sendQueuedEmails,
  draftFollowUp, queueFollowUp, pendingBatch, approveBatch,
  dailyEmailCap, upsertTemplate, approveTemplate, templateIsApproved, wordingFingerprint,
  signalsOf, draftFor, queueEmail, emailsLeftToday, markEmailSent,
  markLinkedInSent, linkedInQueue, markReplied, markBounced, reachableOn,
};
