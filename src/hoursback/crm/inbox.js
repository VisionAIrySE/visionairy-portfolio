// Noticing a reply, and noticing a bounce.
//
// Both were Russ's job by hand: two buttons on the email screen, and a
// sequence that kept going if he did not click. At thirty a day that is
// survivable. At two hundred it costs a customer — somebody writes "call me"
// and the engine sends them the next message in the sequence three days later.
//
// A REPLY is read from his own inbox. It arrives at russ@visionairy.biz
// (his choice, 2026-08-27) and is matched to a business by the address it came
// from. A reply stops every remaining message on every channel, which is the
// rule the lanes already enforce — this only has to notice.
//
// A BOUNCE is different. It is not a refusal, it is a wrong address, and the
// business is still worth talking to. So a bounce stops the email lane, leaves
// the phone lane untouched, and puts the business in a queue of addresses that
// need finding again (Russ, 2026-08-27: "they need to be queued for follow up
// to get accurate info").
//
// Nothing here sends anything. It reads, matches, and marks.

const REPLY_WINDOW_DAYS = 60;   // no point matching a reply to a year-old send

// An automatic response is not a reply. Somebody's holiday responder should
// never stop a sequence — they have not read it, and they will be back.
const AUTOMATIC = [
  /\bout of (?:the )?office\b/i,
  /\bauto(?:matic)?[- ]?repl(?:y|ies)\b/i,
  /\bon (?:annual |maternity |paternity )?leave\b/i,
  /\bvacation (?:responder|reply)\b/i,
  /\bI am currently away\b/i,
  /\bthis is an automated\b/i,
  /\bdo not reply to this\b/i,
  /\bticket (?:number|#)\s*\d/i,
];

// A bounce arrives as a message from a mail system, not from a person.
const BOUNCE_FROM = /\b(mailer-daemon|postmaster|no-?reply|bounces?@|mail-?delivery)\b/i;
const BOUNCE_SUBJECT = /\b(undeliverable|delivery (?:status notification|has failed|failure)|returned mail|mail delivery failed|address not found|recipient not found|message not delivered)\b/i;

function looksAutomatic(subject, body) {
  const text = `${subject || ''}\n${String(body || '').slice(0, 1500)}`;
  return AUTOMATIC.some((re) => re.test(text));
}

function looksLikeABounce(from, subject) {
  return BOUNCE_FROM.test(String(from || '')) || BOUNCE_SUBJECT.test(String(subject || ''));
}

// The address a bounce is complaining about, dug out of the bounce itself.
// A bounce comes FROM the mail system, so the sender tells us nothing — the
// address that failed is quoted in the body.
function addressThatFailed(body) {
  const text = String(body || '');
  const patterns = [
    /(?:to|recipient|address)[:\s]+<?([\w.+-]+@[\w.-]+\.\w+)>?/i,
    /<([\w.+-]+@[\w.-]+\.\w+)>[^\n]{0,40}(?:does not exist|not found|unknown|rejected)/i,
    /^\s*Final-Recipient:\s*rfc822;\s*([\w.+-]+@[\w.-]+\.\w+)/im,
    /^\s*Original-Recipient:\s*rfc822;\s*([\w.+-]+@[\w.-]+\.\w+)/im,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].toLowerCase();
  }
  return null;
}

// Everything a message could be, decided once.
//   reply    — a person answered. Stop everything, everywhere.
//   bounce   — the address is wrong. Stop email, keep the phone, queue it.
//   auto     — a holiday responder. Change nothing.
//   unknown  — not ours, or not matchable.
function classify({ from, subject, body }) {
  if (looksLikeABounce(from, subject)) {
    return { kind: 'bounce', address: addressThatFailed(body) };
  }
  if (looksAutomatic(subject, body)) return { kind: 'auto', address: null };
  const m = String(from || '').match(/<?([\w.+-]+@[\w.-]+\.\w+)>?/);
  if (!m) return { kind: 'unknown', address: null };
  return { kind: 'reply', address: m[1].toLowerCase() };
}

// Which business an address belongs to. A person's own address wins; the
// business inbox is the fallback. Anything sent more than REPLY_WINDOW_DAYS
// ago is too old to be what this is answering.
async function businessFor(db, address, now = new Date()) {
  if (!address) return null;
  const addr = address.toLowerCase();
  const contact = await db.contact.findFirst({
    where: { email: { equals: addr, mode: 'insensitive' } },
    select: { prospectId: true },
  });
  if (contact) return contact.prospectId;
  const p = await db.prospect.findFirst({
    where: {
      OR: [
        { email: { equals: addr, mode: 'insensitive' } },
        { emailManualValue: { equals: addr, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  if (p) return p.id;
  // Nobody at that exact address — try the domain, which catches a reply from
  // a colleague at the same firm.
  const domain = addr.split('@')[1];
  if (!domain) return null;
  const cutoff = new Date(now.getTime() - REPLY_WINDOW_DAYS * 86400000);
  const byDomain = await db.outreachMessage.findFirst({
    where: {
      state: 'SENT', sentAt: { gte: cutoff },
      sentTo: { endsWith: `@${domain}`, mode: 'insensitive' },
    },
    orderBy: { sentAt: 'desc' },
    select: { prospectId: true },
  });
  return byDomain ? byDomain.prospectId : null;
}

// Mark the contact whose address bounced, so nothing writes to them again and
// the screen can show why.
async function markContactBounced(db, prospectId, address, now = new Date()) {
  if (!address) return 0;
  const r = await db.contact.updateMany({
    where: { prospectId, email: { equals: address, mode: 'insensitive' }, bouncedAt: null },
    data: { bouncedAt: now },
  });
  return r.count;
}

module.exports = {
  REPLY_WINDOW_DAYS, AUTOMATIC, BOUNCE_FROM, BOUNCE_SUBJECT,
  looksAutomatic, looksLikeABounce, addressThatFailed, classify,
  businessFor, markContactBounced,
};
