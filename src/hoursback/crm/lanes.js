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
  const C = require('./campaign.js');
  const { CREDIBILITY, SUBJECTS, OPENERS, TRADE_FOLLOW_ONS } = require('./firstContact.js');
  const everything = JSON.stringify([
    BODY, V.OPENINGS, V.WHAT_I_DO, V.GUARANTEE, V.YEAR_FRAMING, V.CLOSES,
    V.TELL_WORDINGS, V.PRICE_FRAMING, CREDIBILITY, SUBJECTS, OPENERS, TRADE_FOLLOW_ONS,
    C.WHO_I_AM, C.WHY_ME, C.THE_OFFER, C.ALREADY_HANDLED, C.TRADES,
  ]);
  return crypto.createHash('sha256').update(everything).digest('hex').slice(0, 16);
}

const LANES = ['PHONE', 'EMAIL', 'LINKEDIN'];
const MESSAGE_STATES = ['DRAFT', 'QUEUED', 'SENDING', 'SENT', 'REPLIED', 'SUPPRESSED'];
const FIRST_CONTACT = 'first_contact';

// THE DAILY CAP IS OFF (Russ, 2026-09-06).
//
// It existed because a brand new sending address that suddenly sends hundreds
// of messages gets treated as a spammer, so it climbed week by week: 50, 60,
// 120, 200. The first version crawled at 10 a day, which was 69 days to reach
// 691 businesses once — by which time the follow-ups had crowded out every new
// message. Russ raised week one to 30 on 2026-08-26 and to 50 on 2026-09-04.
//
// He has now said to remove it: this is not a new mailbox. It is his own work
// address sending through Resend, which already has a sending history and its
// own reputation, so the warm-up the ramp was protecting does not apply.
//
// The ramp is kept in the code, unused, because it is the thing to put back if
// a domain ever does get filtered. Nothing else in the letters changed.
const EMAIL_RAMP = [50, 60, 120, 200];   // kept for reference; no longer applied
const NO_DAILY_CAP = Number.MAX_SAFE_INTEGER;
function dailyEmailCap() {
  return NO_DAILY_CAP;
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

// Who a message actually goes to.
//
// It used to be the address on the business record, which is the info@ or
// office@ found on their site — so 7,601 people found on those same sites,
// 1,610 of them with their own addresses, never received anything. Russ found
// that (2026-08-26). Order: the person he marked, then a named person with an
// address, then the general inbox last.
async function addressFor(db, prospectId, prospect, exclude = []) {
  const chosen = await db.contact.findFirst({
    where: { prospectId, isPrimary: true, email: { not: null, notIn: exclude }, bouncedAt: null, setAsideAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (chosen) return chosen.email;
  const named = await db.contact.findFirst({
    where: { prospectId, name: { not: null }, email: { not: null, notIn: exclude }, bouncedAt: null, setAsideAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (named) return named.email;
  if (exclude.length) return null;   // everyone marked has already had one
  const p = prospect || await db.prospect.findUnique({ where: { id: prospectId } });
  return p && !p.emailBouncedAt ? p.email : null;
}

// A business can be reached through its shared inbox or through a person at
// that business. These are separate facts and stay in their separate tables.
function emailReachableWhere() {
  return {
    OR: [
      { email: { not: null }, emailBouncedAt: null },
      { contacts: { some: { email: { not: null }, bouncedAt: null, setAsideAt: null } } },
    ],
  };
}

// Everyone Russ marked at one business. He can mark the owner and the office
// manager both — reaching two people at one firm is ordinary practice — and
// each gets their own message rather than sharing one (2026-08-26).
async function everyoneMarked(db, prospectId) {
  return db.contact.findMany({
    where: { prospectId, isPrimary: true, email: { not: null }, bouncedAt: null, setAsideAt: null },
    orderBy: { createdAt: 'asc' },
  });
}

// Save exactly the ticks that were visible in the submitted form. Limiting the
// update to those rows matters on the paged People screen: saving one page must
// not clear a choice that happens to be on another page. On a business page all
// of that business's contacts are present, so "select all" remains selected
// after the page reloads.
async function saveContactSelections(db, visibleContactIds, selectedContactIds) {
  const visible = [...new Set([].concat(visibleContactIds || []).filter(Boolean))];
  const visibleSet = new Set(visible);
  const selected = [...new Set([].concat(selectedContactIds || []).filter((id) => visibleSet.has(id)))];
  if (!visible.length) return { visible: 0, selected: 0 };

  await db.$transaction([
    db.contact.updateMany({ where: { id: { in: visible } }, data: { isPrimary: false } }),
    ...(selected.length
      ? [db.contact.updateMany({ where: { id: { in: selected } }, data: { isPrimary: true } })]
      : []),
  ]);
  return { visible: visible.length, selected: selected.length };
}

function isFirstContactMessage(message) {
  const opening = String(message && message.openedWith || '');
  return message && message.lane === 'EMAIL'
    && opening !== 'after_the_call' && !opening.startsWith('touch_');
}

// A tailored rewrite replaces the older first draft; it does not become a
// second first email. A hand edit still wins over an automated rewrite. The
// sequence advances through additional marked contacts one at a time, so only
// one current first email per business belongs in the review/send queue.
function canonicalFirstMessages(messages) {
  const byBusiness = new Map();
  for (const message of messages || []) {
    if (!isFirstContactMessage(message)) continue;
    const rows = byBusiness.get(message.prospectId) || [];
    rows.push(message);
    byBusiness.set(message.prospectId, rows);
  }

  const keep = [];
  for (const rows of byBusiness.values()) {
    const rank = (m) => (m.editedAt ? 8 : 0) + (m.openedWith === 'tailored_first' ? 4 : 0)
      + (m.state === 'QUEUED' ? 2 : 0);
    keep.push(rows.reduce((best, message) => rank(message) > rank(best) ? message : best));
  }
  const ids = new Set(keep.map((m) => m.id));
  return (messages || []).filter((m) => ids.has(m.id));
}

// Keep follow-ups and LinkedIn notes, but show only the first email that can
// actually move forward. Historical first-email rows remain in the database;
// they simply cannot masquerade as a second live message on another screen.
function activeUnsentMessages(messages) {
  const activeFirstIds = new Set(canonicalFirstMessages(messages).map((m) => m.id));
  return (messages || []).filter((m) => !isFirstContactMessage(m) || activeFirstIds.has(m.id));
}

// The person that address belongs to, for the greeting and the screen.
//
// These two used to be joined by `||` with no await between them. A database
// query returns a promise, and a promise is always truthy, so the first branch
// won every time and the fallback was dead code — which is why 328 of 691
// drafts opened "Hello," while a name sat on the record (2026-08-26). Anyone
// whose first-found person was marked primary without an email, or was never
// marked primary at all, fell straight through to nobody.
async function personFor(db, prospectId) {
  const marked = await db.contact.findFirst({
    where: { prospectId, isPrimary: true, email: { not: null }, bouncedAt: null, setAsideAt: null },
  });
  if (marked) return marked;
  return db.contact.findFirst({
    where: { prospectId, name: { not: null }, email: { not: null }, bouncedAt: null, setAsideAt: null },
    orderBy: { createdAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// writing the drafts

function signalsOf(prospect) {
  try { return JSON.parse(prospect.scoreEvidence || '[]').filter((e) => e.signal !== 'category_tilt'); }
  catch { return []; }
}

// One draft per business per lane, never a second. Returns the row, or null
// when there is nothing specific to open with.
// WHEN WE CAN NO LONGER WRITE TO SOMEBODY, WHAT THEY WERE SENT LAST TIME MUST
// NOT KEEP STANDING.
//
// Every path below that gives up used to just return null, and the message
// already in the row stayed exactly as it was — old wording, DRAFT or QUEUED,
// showing on the list as though it were current. Fourteen of them survived
// tonight's rewrite that way: five businesses since marked do-not-contact,
// six whose address had been taken off the record, three on LinkedIn. None
// could actually be sent, because the sending queries screen for all of that,
// but six of them were still on the screen Russ reads. That is exactly how 32
// messages carrying the McKinsey line stayed visible after it was thrown out
// (2026-08-30).
//
// So a business that can no longer be written to has its unsent, untouched
// messages suppressed with the reason recorded, rather than left looking live.
async function standDownStaleDrafts(db, prospectId, lane, why) {
  await db.outreachMessage.updateMany({
    where: { prospectId, lane, state: { in: ['DRAFT', 'QUEUED'] }, sentAt: null, editedAt: null },
    data: { state: 'SUPPRESSED', suppressedReason: why },
  });
  return null;
}

// Write to whoever it is actually going to, not to whoever owns the place.
// The greeting used to name the owner while the message went to info@.
// WHOEVER IT IS ACTUALLY GOING TO, ON BOTH CHANNELS.
//
// This asked for the person on the email lane only, so ticking Trever
// Campbell as the one to write to changed the email and left the LinkedIn
// note still greeting the owner (Russ, 2026-08-31). The note is the one he
// pastes by hand, so the wrong name goes out under his own fingers.
//
// Pulled out of draftFor (2026-09-01) so the noticing pass answers "who is
// this letter addressed to, and what is their job" with the SAME rules the
// draft itself uses — a second copy of these rules is how two channels ended
// up greeting two different people.
async function whoTheLetterGoesTo(db, prospectId, p) {
  const person = await personFor(db, prospectId);
  // A person Russ marked wins over the owner on the record, and a single given
  // name counts — the ordinary rule wants two words and threw away every team
  // page that lists only "Kevin".
  const { firstNameOfMarked } = require('./names.js');
  const marked = person && person.name && firstNameOfMarked(person.name) ? person.name : null;
  // Keep the selected person's role with their name. Otherwise a message can
  // greet the right person while aiming its examples at somebody else's job.
  let writeTo = marked
    ? { ...p, contactName: marked, contactRole: person.role || null, ownerName: null }
    : p;
  // At a small shop the "general" inbox is the owner's inbox. 404 businesses
  // had a person's name on file and only a general address, and every one of
  // them was greeted "Hello,". Where three or fewer people are named on the
  // whole site, that address almost certainly reaches one of them, so the
  // greeting uses their name. Above that there is a real front desk and it
  // does not. The name still has to pass the person test, which is what stops
  // "Hi Vaccination," (2026-08-26).
  if (!writeTo.contactName && !writeTo.ownerName) {
    const named = await db.contact.findMany({
      where: { prospectId, name: { not: null } },
      select: { name: true }, orderBy: { createdAt: 'asc' },
    });
    if (named.length && named.length <= 3) {
      const { firstNameOf } = require('./names.js');
      const usable = named.find((c) => firstNameOf(c.name));
      if (usable) writeTo = { ...writeTo, contactName: usable.name };
    }
  }
  return { writeTo, person };
}

async function draftFor(db, prospectId, lane) {
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.doNotContact) return standDownStaleDrafts(db, prospectId, lane, 'marked do not contact');
  const recipient = lane === 'EMAIL' ? await addressFor(db, prospectId, p) : null;
  if (lane === 'EMAIL' && !recipient) {
    return standDownStaleDrafts(db, prospectId, lane, 'no deliverable address is available');
  }
  let { writeTo } = await whoTheLetterGoesTo(db, prospectId, p);
  // THE NOTICING — one sentence read off THIS business's own site, recorded
  // through the append-only reading store. Where one stands, it takes the
  // place of the trade's week sentence in the first email and nothing else in
  // Russ's letter moves. Where the site could not support one, noticingFor
  // returns null and the letter keeps his trade sentence unchanged — silence
  // beats a wrong guess (Russ, 2026-09-01). Email only: the LinkedIn note is
  // pasted by hand and stays as approved.
  if (lane === 'EMAIL') {
    const { noticingFor } = require('./noticing.js');
    const noticed = await noticingFor(db, prospectId, { roleTitle: writeTo.contactRole, trade: p.trade });
    if (noticed) writeTo = { ...writeTo, noticing: noticed };
  }
  // BOTH LANES GET THE PERSON IT IS ACTUALLY GOING TO.
  //
  // The note was handed the raw record while the email was handed the corrected
  // one, so ticking Trever Campbell changed the email and left the note
  // greeting the owner. Making the person available to both lanes was not
  // enough on its own — this line still passed the wrong object (2026-08-31).
  const built = lane === 'EMAIL' ? draftFirstContact(writeTo, signalsOf(p)) : draftLinkedIn(writeTo, signalsOf(p));
  if (!built) return standDownStaleDrafts(db, prospectId, lane, 'nothing honest left to open with');
  // A draft already written is kept. The one exception: it is still sitting
  // unsent, Russ has never touched it, and the wording has moved on
  // underneath it — then it is rewritten rather than left stale. Twenty-five
  // drafts from 3am survived a whole night of rewrites because this returned
  // the existing row before it ever looked at the new words, 2026-08-26.
  const existing = await db.outreachMessage.findFirst({ where: { prospectId, lane } });
  if (existing) {
    // Lined up to send is NOT sent. A message sitting in the queue with old
    // wording is the DANGEROUS one — it is the closest to somebody's inbox.
    // Only rewriting drafts froze 32 messages with the McKinsey line and the
    // "running more than one of these" subject that Russ had already thrown
    // out, and no amount of rewriting could reach them. He opened the first
    // account he tried and there it was (2026-08-28).
    //
    // Sent is untouchable. Hand-written is untouchable. Everything else tracks
    // the current wording.
    // A complete sequence rewrite can store a first email whose subject and
    // opening were composed together from the two verified website jobs. Page
    // refreshes still call draftFor; preserve that tailored copy when it is
    // addressed to the same inbox instead of replacing it with the generic
    // deterministic fallback. A changed recipient deliberately invalidates it.
    if (lane === 'EMAIL' && existing.openedWith === 'tailored_first'
        && !existing.sentAt && !existing.editedAt && !existing.deliveryState
        && existing.sentTo === recipient) return existing;
    const rewritable = !existing.sentAt && !existing.editedAt && !existing.deliveryState
      && (existing.body !== built.body
        || (built.inviteBody && existing.inviteBody !== built.inviteBody)
        || (lane === 'EMAIL' && existing.sentTo !== recipient));
    if (!rewritable) return existing;
    return db.outreachMessage.update({
      where: { id: existing.id },
      data: {
        subject: built.subject, body: built.body, openedWith: built.openedWith,
        ...(lane === 'EMAIL' ? { sentTo: recipient } : {}),
        ...(built.inviteBody ? { inviteBody: built.inviteBody } : {}),
      },
    });
  }

  const template = await db.messageTemplate.findUnique({ where: { name: FIRST_CONTACT } });
  return db.outreachMessage.create({
    data: {
      prospectId, lane, state: 'DRAFT',
      subject: built.subject, body: built.body, openedWith: built.openedWith,
      inviteBody: built.inviteBody || null,
      templateId: template ? template.id : null,
      ...(lane === 'EMAIL' ? { sentTo: recipient } : {}),
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
  if (p.doNotContact || p.repliedAt) return null;
  const msg = await draftFor(db, prospectId, 'EMAIL');
  if (!msg || msg.state !== 'DRAFT') return msg;
  return db.outreachMessage.update({ where: { id: msg.id }, data: { state: 'QUEUED', queuedAt: new Date() } });
}

// How many more may go out today. Sending stops at the cap and picks up
// tomorrow; it never spills over.
async function emailsLeftToday(db, weeksSending = 0, now = new Date()) {
  const cap = dailyEmailCap(weeksSending);
  // MAX_SAFE_INTEGER is the sentinel for "the daily cap is off." Subtracting
  // today's sent count from it turned that sentinel into a giant number on
  // the Email screen after the first real send.
  if (cap >= NO_DAILY_CAP) return NO_DAILY_CAP;
  const sentToday = await db.outreachMessage.count({
    where: { lane: 'EMAIL', state: 'SENT', sentAt: { gte: startOfDay(now), lte: endOfDay(now) } },
  });
  return Math.max(0, cap - sentToday);
}

// The next person Russ marked who has not heard from him yet. He can mark as
// many as he likes at one business and they all get their own message, same
// day if that is how the queue falls — two different people at one company on
// one day is ordinary outreach (Russ, 2026-08-26). The only thing forbidden is
// writing to the same address twice.
async function nextUnwrittenPerson(db, prospectId) {
  const marked = await everyoneMarked(db, prospectId);
  if (!marked.length) return null;
  const already = await db.outreachMessage.findMany({
    where: { prospectId, lane: 'EMAIL', sentTo: { not: null } },
    select: { sentTo: true },
  });
  const written = new Set(already.map((x) => x.sentTo));
  return marked.find((c) => !written.has(c.email)) || null;
}

async function markEmailSent(db, messageId, now = new Date(), sentTo = null) {
  return db.outreachMessage.updateMany({
    where: { id: messageId, state: { in: ['DRAFT', 'QUEUED'] }, deliveryState: null },
    data: { state: 'SENT', sentAt: now, sentBy: 'engine', ...(sentTo ? { sentTo } : {}) },
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

// A bounce closes only the address that failed. A person and a business inbox
// are separate recipients; one bad address must not silence the other.
async function markBounced(db, prospectId, address = null, now = new Date()) {
  // Keep the old markBounced(db, id, date) call form for local/manual actions
  // that mean the whole business address failed.
  if (address instanceof Date) { now = address; address = null; }
  const prospect = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  const failed = address ? String(address).toLowerCase() : null;
  const businessFailed = !failed || (prospect.email && prospect.email.toLowerCase() === failed);
  if (businessFailed) {
    await db.prospect.update({ where: { id: prospectId }, data: { emailBouncedAt: now } });
  }
  if (failed) {
    await db.contact.updateMany({
      where: { prospectId, email: { equals: failed, mode: 'insensitive' }, bouncedAt: null },
      data: { bouncedAt: now },
    });
  }
  const recipient = failed
    ? { OR: [
      { sentTo: { equals: failed, mode: 'insensitive' } },
      ...(businessFailed ? [{ sentTo: null }] : []),
    ] }
    : {};
  await db.outreachMessage.updateMany({
    where: { prospectId, lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, ...recipient },
    data: { state: 'SUPPRESSED', suppressedReason: 'the address bounced' },
  });
  return db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
}

// Everyone the engine may still reach on a given lane. Suppression is applied
// here, in the query, so no caller can forget it.
async function reachableOn(db, lane, limit = 100) {
  const where = { doNotContact: false, repliedAt: null };
  if (lane === 'EMAIL') Object.assign(where, emailReachableWhere());
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
  if (p.doNotContact || p.repliedAt) return null;
  const recipient = await addressFor(db, prospectId, p);
  if (!recipient) return null;
  const built = draftFollowUp(p, call);
  if (!built) return null;
  return db.outreachMessage.create({
    data: {
      prospectId, lane: 'EMAIL', state: 'DRAFT',
      subject: built.subject, body: built.body, openedWith: built.openedWith, sentTo: recipient,
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
async function queueNextTouch(db, prospectId, now = new Date(), options = {}) {
  const allowFirstContact = options.allowFirstContact !== false;
  if (!await templateIsApproved(db)) return null;
  const p = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.doNotContact || p.repliedAt) return null;
  const recipient = await addressFor(db, prospectId, p);
  if (!recipient) return null;

  const sent = await db.outreachMessage.findMany({
    where: { prospectId, lane: 'EMAIL', state: { in: ['SENT', 'REPLIED'] }, openedWith: { not: 'after_the_call' } },
    orderBy: { sentAt: 'asc' },
  });
  // Anyone else Russ marked who has not heard from him gets their own first
  // message, before the sequence moves on for the people who have.
  const waiting = allowFirstContact ? await nextUnwrittenPerson(db, prospectId) : null;
  if (waiting) {
    const built = draftFirstContact({ ...p, contactName: waiting.name || p.contactName }, signalsOf(p));
    if (built) {
      const existing = await db.outreachMessage.findFirst({
        where: { prospectId, lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, sentTo: waiting.email },
      });
      if (existing) return existing;
      return db.outreachMessage.create({
        data: {
          prospectId, lane: 'EMAIL', state: 'QUEUED', queuedAt: now, sentTo: waiting.email,
          subject: built.subject, body: built.body, openedWith: built.openedWith,
        },
      });
    }
  }

  const due = touchDue(sent.length, sent[0] ? sent[0].sentAt : null, now);
  if (due === null) return null;
  if (due === 1) return allowFirstContact ? queueEmail(db, prospectId) : null;

  const already = await db.outreachMessage.findFirst({ where: { prospectId, lane: 'EMAIL', openedWith: `touch_${due}` } });
  // Follow-ups may be written ahead of time so the whole sequence can be
  // reviewed. On its due date, move that saved draft into the send queue.
  // Returning it unchanged made the scheduler report progress without making
  // the message eligible to send.
  if (already) {
    if (already.state === 'DRAFT' && !already.sentAt && !already.deliveryState) {
      return db.outreachMessage.update({
        where: { id: already.id },
        data: {
          state: 'QUEUED', queuedAt: now,
          sentTo: already.sentTo || (sent[0] && sent[0].sentTo) || recipient,
        },
      });
    }
    return already;
  }
  const built = draftFollowUpTouch(p, sent[0] ? sent[0].openedWith : null, due);
  if (!built) return null;
  return db.outreachMessage.create({
    data: {
      prospectId, lane: 'EMAIL', state: 'QUEUED', queuedAt: now,
      subject: built.subject, body: built.body, openedWith: built.openedWith,
      sentTo: sent[0] && sent[0].sentTo ? sent[0].sentTo : recipient,
    },
  });
}

// Walk everyone reachable and queue whatever each is due. Bounded, like
// everything else that could run away.
async function queueDueTouches(db, options = {}) {
  const now = options.now || new Date();
  const allowFirstContact = options.allowFirstContact !== false;
  // At the scheduled time, only continue sequences Russ already started.
  // A fresh first-contact draft stays untouched until he reviews and ticks it.
  const rows = allowFirstContact
    ? await reachableOn(db, 'EMAIL', Math.min(Number(options.limit || 200), 500))
    : await db.prospect.findMany({
      where: {
        doNotContact: false, repliedAt: null, ...emailReachableWhere(),
        messages: { some: { lane: 'EMAIL', state: { in: ['SENT', 'REPLIED'] }, openedWith: { not: 'after_the_call' } } },
      },
      orderBy: { automationScore: 'desc' },
    });
  const out = { first: 0, second: 0, third: 0, skipped: 0 };
  for (const p of rows) {
    const m = await queueNextTouch(db, p.id, now, { allowFirstContact });
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
// There is no daily or per-run quota. The queue itself is the safety boundary:
// a first message enters it only after Russ reviews and ticks that recipient.
// Provider failures still stop and remain visible instead of being retried blindly.
const MAX_PER_RUN = NO_DAILY_CAP;

async function sendQueuedEmails(db, options = {}) {
  const D = require('./delivery.js');
  const weeks = Number(options.weeksSending || 0);
  // An explicitly supplied blank key is deliberate: tests and safety checks
  // use it to prove that delivery is refused without provider credentials.
  // Falling back to the process environment in that case could silently turn
  // a no-key check into a live-key check.
  const key = Object.prototype.hasOwnProperty.call(options, 'apiKey')
    ? options.apiKey
    : process.env.RESEND_API_KEY;
  const from = options.from || 'Russ Wright <russ@visionairy.biz>';
  const now = options.now || new Date();
  const messageIds = Array.isArray(options.messageIds)
    ? [...new Set(options.messageIds.map((id) => String(id).trim()).filter(Boolean))]
    : null;
  const result = { attempted: 0, sent: 0, failed: 0, blocked: 0,
    unconfirmed: 0, recovered: 0, stoppedBecause: null };

  if (!await templateIsApproved(db)) { result.stoppedBecause = 'the message has not been approved'; return result; }
  if (!key) { result.stoppedBecause = 'no sending key is set — nothing was sent'; return result; }

  const allowedToday = await emailsLeftToday(db, weeks, now);
  const ceiling = Math.min(allowedToday, Number(options.limit || MAX_PER_RUN), MAX_PER_RUN);
  if (ceiling <= 0) { result.stoppedBecause = "today's ceiling is already spent"; return result; }

  const queuedRows = await db.outreachMessage.findMany({
    where: { lane: 'EMAIL', ...(messageIds ? { id: { in: messageIds } } : {}), OR: [
      { state: 'QUEUED', prospect: { doNotContact: false, repliedAt: null } },
      { state: 'SENDING', deliveryState: { in: ['CLAIMED', 'ATTEMPTING'] },
        deliveryLeaseExpiresAt: { lte: now } },
    ] },
    include: { prospect: { include: { messages: {
      where: {
        lane: 'EMAIL', sentAt: null, state: { in: ['DRAFT', 'QUEUED'] },
        openedWith: { not: 'after_the_call' }, NOT: { openedWith: { startsWith: 'touch_' } },
      },
      select: { id: true, prospectId: true, lane: true, state: true, openedWith: true, sentTo: true, editedAt: true },
    } } } },
    orderBy: { prospect: { automationScore: 'desc' } },
    take: ceiling < MAX_PER_RUN ? ceiling : undefined,
  });
  // Old first drafts can survive a campaign rewrite. If a tailored first
  // email exists, the older copy is neither displayed nor delivered. This is
  // a read-time safety gate; the historical row remains for an explicit,
  // separately approved cleanup.
  const siblingFirsts = [];
  const seenFirst = new Set();
  for (const message of queuedRows) {
    for (const sibling of (message.prospect.messages || [])) {
      if (!seenFirst.has(sibling.id)) { siblingFirsts.push(sibling); seenFirst.add(sibling.id); }
    }
  }
  const allowedFirst = new Set(canonicalFirstMessages(siblingFirsts).map((m) => m.id));
  const queued = queuedRows.filter((m) => !isFirstContactMessage(m) || allowedFirst.has(m.id));

  const { toHtmlEmail, signatureText } = require('./signature.js');
  const send = options.send || defaultSender(key);

  for (const m of queued) {
    if (result.sent >= ceiling) { result.stoppedBecause = `stopped at the ceiling of ${ceiling}`; break; }
    const claimed = await D.claim(db, m.id, async (tx, current) => {
      const to = current.sentTo || await addressFor(tx, current.prospectId, current.prospect);
      if (!to) return null;
      return {
        from, to, subject: current.subject,
        html: toHtmlEmail(current.body),
        text: `${current.body.split(/\n\nRuss Wright\n/)[0]}\n\n${signatureText()}`,
      };
    }, now);
    if (!claimed) continue;
    if (claimed.blocked) { result.blocked += 1; continue; }
    if (claimed.unconfirmed) { result.unconfirmed += 1; continue; }
    if (claimed.recovered) result.recovered += 1;

    const begun = await D.beginAttempt(db, m.id, now);
    if (!begun) continue;
    if (begun.blocked) { result.blocked += 1; continue; }
    result.attempted += 1;
    try {
      const response = await send(begun.payload);
      const providerMessageId = response && (response.providerMessageId || response.id);
      const marked = await D.markDelivered(db, m.id, providerMessageId, now);
      if (!marked || marked.count !== 1) throw new Error('provider accepted the email but its sent state was not recorded');
      result.sent += 1;
    } catch (e) {
      if (e && e.definitelyNotSent) {
        await D.markKnownFailure(db, m.id, e);
        result.failed += 1;
      } else {
        try { await D.markUnconfirmed(db, m.id, e); } catch (_) { /* the next run will recover the lease safely */ }
        result.unconfirmed += 1;
      }
    }
  }
  if (!result.stoppedBecause) result.stoppedBecause = 'the queue ran out';
  return result;
}

// The only place that talks to the outside world.
function senderAddressIsValid(from) {
  const value = String(from || '').trim();
  if (!value || /:\/\//.test(value)) return false;
  const address = (value.match(/<([^<>]+)>\s*$/) || [null, value])[1];
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

function safeProviderReason(body) {
  return String(body || '')
    .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s"']+/gi, '[redacted URL]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function defaultSender(key, options = {}) {
  const configuredReplyTo = options.replyTo || process.env.HOURSBACK_EMAIL_REPLY_TO || null;
  return async ({ from, to, subject, html, text, idempotencyKey, replyTo = configuredReplyTo }) => {
    if (!senderAddressIsValid(from)) {
      const error = new Error('invalid email sender configuration — nothing was sent');
      error.code = 'INVALID_EMAIL_SENDER';
      error.definitelyNotSent = true;
      throw error;
    }
    if (replyTo && !senderAddressIsValid(replyTo)) {
      const error = new Error('invalid reply address configuration — nothing was sent');
      error.code = 'INVALID_EMAIL_REPLY_TO';
      error.definitelyNotSent = true;
      throw error;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = safeProviderReason(await res.text()); } catch (_) { /* status is still useful */ }
      const error = new Error(`send refused: ${res.status}${detail ? ` — ${detail}` : ''}`);
      error.definitelyNotSent = true;
      throw error;
    }
    return res.json();
  };
}


// THE NOTE IS WRITTEN WHEN RUSS ASKS FOR IT, FOR THE PERSON HE PICKED.
//
// Before this, every note for every person was written up front in batches of
// twenty-five — 1,960 of them sitting unread, none ever sent, and each one
// going stale the moment the wording moved on. Russ asked for a button beside
// the person instead: write it now, for them, when I am actually about to
// paste it (2026-09-05).
//
// It is addressed to THAT contact, not to whoever the record happens to call
// primary, because the whole point of the button is that he chose them.
async function noteForOnePerson(db, contactId) {
  const c = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
  const p = await db.prospect.findUniqueOrThrow({ where: { id: c.prospectId } });
  if (p.doNotContact) return null;

  // Their name wins over anything on the business record — he clicked them.
  const { firstNameOf } = require('./names.js');
  const usable = c.name && firstNameOf(c.name) ? c.name : null;
  const { writeTo: fallback } = await whoTheLetterGoesTo(db, c.prospectId, p);
  const writeTo = usable ? { ...p, contactName: usable, ownerName: null } : fallback;

  const built = draftLinkedIn(writeTo, signalsOf(p));
  if (!built) return null;

  // One note per business, as before — he writes it for the person he is
  // about to message, and rewriting it for somebody else is the point.
  // A note already SENT is never touched; that is the record of what went out.
  const existing = await db.outreachMessage.findFirst({ where: { prospectId: c.prospectId, lane: 'LINKEDIN' } });
  if (existing && existing.sentAt) return existing;
  const data = {
    body: built.body,
    inviteBody: built.inviteBody || null,
    openedWith: built.openedWith || null,
    state: 'DRAFT',
    sentTo: c.name || null,
    editedAt: null,
  };
  if (existing) return db.outreachMessage.update({ where: { id: existing.id }, data });
  return db.outreachMessage.create({ data: { ...data, prospectId: c.prospectId, lane: 'LINKEDIN' } });
}

module.exports = {
  LANES, MESSAGE_STATES, EMAIL_RAMP, FIRST_CONTACT, FOLLOW_UP, MAX_PER_RUN,
  FOLLOW_UP_DAYS, touchDue, queueNextTouch, queueDueTouches,
  sendQueuedEmails, defaultSender, senderAddressIsValid,
  draftFollowUp, queueFollowUp, pendingBatch, approveBatch,
  dailyEmailCap, upsertTemplate, approveTemplate, templateIsApproved, wordingFingerprint,
  signalsOf, draftFor, whoTheLetterGoesTo, queueEmail, emailsLeftToday, markEmailSent, addressFor, emailReachableWhere, personFor, everyoneMarked, saveContactSelections, isFirstContactMessage, canonicalFirstMessages, activeUnsentMessages, nextUnwrittenPerson,
  markLinkedInSent, linkedInQueue, noteForOnePerson, markReplied, markBounced, reachableOn,
};
