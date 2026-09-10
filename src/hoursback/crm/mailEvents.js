// What the sending service tells us, and what to do about it.
//
// This replaces reading Russ's own inbox. Replies are addressed to a private
// receiving subdomain in Resend. Resend reports them here, and the CRM forwards
// the original message to Russ's normal business inbox after matching it to a
// recent email the CRM actually sent.
//
// It reports four things worth acting on:
//
//   email.bounced     the address is wrong. Stop email, keep the phone, and
//                     put the business back in the list of addresses to find.
//   email.complained  they marked it as spam. Worse than a bounce: never
//                     contact again, on any channel.
//   email.received    somebody replied. Stop everything, everywhere.
//   email.delivered   it arrived. Worth recording, nothing to act on.
//
// I built inbox-reading for bounces first, which was wrong — the sender
// already knew (Russ asked why, 2026-08-27).

const crypto = require('crypto');

const ACTED_ON = ['email.bounced', 'email.complained', 'email.received'];

// The service signs everything it sends us. Without checking that signature,
// anybody who learns the address could mark businesses as replied and quietly
// empty the sending queue.
function signatureIsValid(rawBody, headers, secret) {
  if (!secret) return false;
  const id = headers['svix-id'] || headers['webhook-id'];
  const timestamp = headers['svix-timestamp'] || headers['webhook-timestamp'];
  const signature = headers['svix-signature'] || headers['webhook-signature'];
  if (!id || !timestamp || !signature) return false;

  // Anything older than five minutes is a replay of a message we already saw.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`).digest('base64');

  // The header carries one or more signatures, space separated, each prefixed
  // with its version. Any match counts.
  return String(signature).split(' ').some((part) => {
    const value = part.includes(',') ? part.split(',')[1] : part;
    if (!value || value.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  });
}

// The address an event is about. A bounce names who it failed to reach; a
// reply names who wrote.
function addressFrom(event) {
  const d = (event && event.data) || {};
  if (event.type === 'email.received') {
    const from = d.from || (d.envelope && d.envelope.from);
    if (!from) return null;
    const m = String(from).match(/<?([\w.+-]+@[\w.-]+\.\w+)>?/);
    return m ? m[1].toLowerCase() : null;
  }
  const to = Array.isArray(d.to) ? d.to[0] : d.to;
  return to ? String(to).toLowerCase() : null;
}

// An automatic response is not a reply. A holiday responder must never stop a
// sequence — they have not read it and they will be back.
const AUTOMATIC = [
  /\bout of (?:the )?office\b/i,
  /\bauto(?:matic)?[- ]?repl(?:y|ies)\b/i,
  /\bon (?:annual |maternity |paternity )?leave\b/i,
  /\bvacation (?:responder|reply)\b/i,
  /\bI am currently away\b/i,
  /\bthis is an automated\b/i,
];
function looksAutomatic(subject) {
  return AUTOMATIC.some((re) => re.test(String(subject || '')));
}

// What this event means for a business, decided once.
function meaning(event) {
  switch (event && event.type) {
    case 'email.bounced':
      return { act: 'bounced', why: 'the address is wrong' };
    case 'email.complained':
      return { act: 'complained', why: 'they marked it as spam' };
    case 'email.received': {
      const subject = (event.data && event.data.subject) || '';
      if (looksAutomatic(subject)) return { act: 'ignore', why: 'a holiday responder' };
      return { act: 'replied', why: 'a person answered' };
    }
    default:
      return { act: 'ignore', why: 'nothing to act on' };
  }
}

module.exports = { ACTED_ON, AUTOMATIC, signatureIsValid, addressFrom, looksAutomatic, meaning };
