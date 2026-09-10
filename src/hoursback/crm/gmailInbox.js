// Read the CRM's private copy mailbox without changing anything in it.
//
// Russ's normal mailbox can copy incoming replies to a dedicated Gmail inbox.
// This reader uses Gmail's read-only IMAP door. It never marks messages read,
// moves them, deletes them, or sends through Gmail.

const I = require('./inbox.js');
const L = require('./lanes.js');

const DEFAULT_SINCE_DAYS = 60;
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'protonmail.com',
  'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'q.com', 'cox.net',
]);

function configuration(env = process.env) {
  const user = String(env.INBOX_USER || '').trim();
  const pass = String(env.INBOX_APP_PASSWORD || env.INBOX_PASSWORD || '').replace(/\s/g, '');
  const replyTo = String(env.HOURSBACK_EMAIL_REPLY_TO || '').trim();
  return {
    configured: Boolean(user && pass && replyTo),
    missing: [
      !user && 'INBOX_USER', !pass && 'INBOX_APP_PASSWORD',
      !replyTo && 'HOURSBACK_EMAIL_REPLY_TO',
    ].filter(Boolean),
    user,
    pass,
    replyTo,
    host: String(env.INBOX_HOST || 'imap.gmail.com').trim(),
  };
}

// A stored address alone does not prove an inbox message answered our email.
// Match the address the CRM actually sent to within the reply window. A reply
// from a colleague at the same company is accepted, except on public services
// such as Gmail where unrelated businesses share one domain.
async function recentProspectFor(db, address, now = new Date()) {
  const addr = String(address || '').trim().toLowerCase();
  if (!addr) return null;
  const cutoff = new Date(now.getTime() - I.REPLY_WINDOW_DAYS * 86400000);
  const exact = await db.outreachMessage.findFirst({
    where: {
      state: { in: ['SENT', 'REPLIED'] }, sentAt: { gte: cutoff },
      sentTo: { equals: addr, mode: 'insensitive' },
    },
    orderBy: { sentAt: 'desc' }, select: { prospectId: true },
  });
  if (exact) return exact.prospectId;
  const domain = addr.split('@')[1];
  if (!domain || PUBLIC_MAIL_DOMAINS.has(domain)) return null;
  const company = await db.outreachMessage.findFirst({
    where: {
      state: { in: ['SENT', 'REPLIED'] }, sentAt: { gte: cutoff },
      sentTo: { endsWith: `@${domain}`, mode: 'insensitive' },
    },
    orderBy: { sentAt: 'desc' }, select: { prospectId: true },
  });
  return company ? company.prospectId : null;
}

async function readMessages(config, options = {}) {
  const sinceDays = Number(options.sinceDays || DEFAULT_SINCE_DAYS);
  const now = options.now || new Date();
  const makeClient = options.makeClient || ((settings) => {
    const { ImapFlow } = require('imapflow');
    return new ImapFlow(settings);
  });
  const parse = options.parse || (async (source) => {
    const { simpleParser } = require('mailparser');
    return simpleParser(source);
  });
  const client = makeClient({
    host: config.host, port: 993, secure: true,
    auth: { user: config.user, pass: config.pass }, logger: false,
  });
  const found = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(now.getTime() - sinceDays * 86400000);
      for await (const message of client.fetch({ since }, { source: true })) {
        const parsed = await parse(message.source);
        found.push({
          receivedAt: parsed.date || now,
          from: (parsed.from && parsed.from.text) || '',
          subject: parsed.subject || '',
          body: parsed.text || parsed.html || '',
        });
      }
    } finally { lock.release(); }
  } finally { await client.logout(); }
  return found;
}

async function syncReplies(db, options = {}) {
  const config = options.config || configuration(options.env);
  if (!config.configured) {
    const error = new Error(`reply-copy inbox is not configured (${config.missing.join(', ')})`);
    error.code = 'REPLY_INBOX_NOT_CONFIGURED';
    throw error;
  }
  const inbox = options.inbox || I;
  const lanes = options.lanes || L;
  const now = options.now || new Date();
  const received = options.messages || await readMessages(config, { ...options, now });
  const result = { read: received.length, replies: 0, automatic: 0, unmatched: 0, alreadyKnown: 0 };

  for (const message of received) {
    const meaning = inbox.classify(message);
    if (meaning.kind === 'auto') { result.automatic += 1; continue; }
    // Resend's signed webhook already handles delivery failures. This mailbox
    // reader acts only on human replies copied from Russ's normal inbox.
    if (meaning.kind !== 'reply' || !meaning.address) { result.unmatched += 1; continue; }
    const prospectId = options.prospectFor
      ? await options.prospectFor(db, meaning.address, now)
      : await recentProspectFor(db, meaning.address, now);
    if (!prospectId) { result.unmatched += 1; continue; }
    const prospect = await db.prospect.findUnique({
      where: { id: prospectId }, select: { repliedAt: true },
    });
    if (!prospect || prospect.repliedAt) { result.alreadyKnown += 1; continue; }
    await lanes.markReplied(db, prospectId, 'EMAIL', new Date(message.receivedAt || now));
    result.replies += 1;
  }
  return result;
}

module.exports = {
  DEFAULT_SINCE_DAYS, PUBLIC_MAIL_DOMAINS,
  configuration, recentProspectFor, readMessages, syncReplies,
};
