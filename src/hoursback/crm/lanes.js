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

const { draftFirstContact, draftLinkedIn } = require('./firstContact.js');

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
    data: { approvedAt: new Date(), approvedBy },
  });
}

async function templateIsApproved(db, name = FIRST_CONTACT) {
  const t = await db.messageTemplate.findUnique({ where: { name } });
  return Boolean(t && t.approvedAt);
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
  const existing = await db.outreachMessage.findFirst({ where: { prospectId, lane } });
  if (existing) return existing;

  const built = lane === 'EMAIL' ? draftFirstContact(p, signalsOf(p)) : draftLinkedIn(p, signalsOf(p));
  if (!built) return null;
  if (lane === 'EMAIL' && !p.email && !p.emailManualValue) return null;

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
  sendQueuedEmails,
  draftFollowUp, queueFollowUp, pendingBatch, approveBatch,
  dailyEmailCap, upsertTemplate, approveTemplate, templateIsApproved,
  signalsOf, draftFor, queueEmail, emailsLeftToday, markEmailSent,
  markLinkedInSent, linkedInQueue, markReplied, markBounced, reachableOn,
};
