#!/usr/bin/env node
// Read the inbox, notice replies and bounces, and act on them.
//
//   node scripts/hoursback/check-inbox.js --dry-run   see what it would do
//   node scripts/hoursback/check-inbox.js             do it
//   node scripts/hoursback/check-inbox.js --since=3   only the last 3 days
//
// A reply stops every remaining message on every channel. A bounce stops the
// email lane only, leaves the phone lane alone, and puts the business in the
// queue of addresses that need finding again. A holiday responder changes
// nothing.
//
// Reads russ@visionairy.biz over IMAP, which is Gmail's own read-only door and
// needs one app password rather than a whole sign-in flow. Set:
//
//   INBOX_USER=russ@visionairy.biz
//   INBOX_PASSWORD=<the 16-character app password from Google>
//
// Nothing here sends. It reads, matches, and marks.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const L = require('../../src/hoursback/crm/lanes.js');
  const I = require('../../src/hoursback/crm/inbox.js');
  const dry = process.argv.includes('--dry-run');
  const sinceDays = Number(arg('since', 7)) || 7;

  const user = process.env.INBOX_USER;
  const pass = process.env.INBOX_PASSWORD;
  if (!user || !pass) {
    console.error('INBOX_USER and INBOX_PASSWORD are not set, so there is no inbox to read.');
    console.error('Add them to .env locally and to the site settings for the live one.');
    process.exit(2);
  }

  let ImapFlow;
  try { ({ ImapFlow } = require('imapflow')); }
  catch { console.error('the imapflow package is not installed — run: npm install imapflow'); process.exit(2); }
  const { simpleParser } = require('mailparser');

  const db = new PrismaClient();
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false,
  });

  const out = { read: 0, replies: 0, bounces: 0, automatic: 0, unmatched: 0 };
  const acted = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - sinceDays * 86400000);
      for await (const msg of client.fetch({ since }, { source: true, envelope: true })) {
        out.read += 1;
        const parsed = await simpleParser(msg.source);
        const from = (parsed.from && parsed.from.text) || '';
        const subject = parsed.subject || '';
        const body = parsed.text || parsed.html || '';
        const { kind, address } = I.classify({ from, subject, body });

        if (kind === 'auto') { out.automatic += 1; continue; }
        if (kind === 'unknown') { out.unmatched += 1; continue; }

        const prospectId = await I.businessFor(db, address);
        if (!prospectId) { out.unmatched += 1; continue; }
        const p = await db.prospect.findUnique({ where: { id: prospectId }, select: { name: true, repliedAt: true, emailBouncedAt: true } });

        if (kind === 'reply') {
          if (p.repliedAt) continue;              // already known
          out.replies += 1;
          acted.push(`REPLY   ${p.name}  <${address}>  "${subject.slice(0, 50)}"`);
          if (!dry) await L.markReplied(db, prospectId, 'EMAIL');
        } else {
          if (p.emailBouncedAt) continue;
          out.bounces += 1;
          acted.push(`BOUNCE  ${p.name}  <${address || 'address not quoted'}>`);
          if (!dry) {
            await L.markBounced(db, prospectId);
            await I.markContactBounced(db, prospectId, address);
          }
        }
      }
    } finally { lock.release(); }
  } finally { await client.logout(); }

  console.log(`read ${out.read} messages from the last ${sinceDays} days`);
  console.log(`  replies:            ${out.replies}`);
  console.log(`  bounces:            ${out.bounces}`);
  console.log(`  holiday responders: ${out.automatic}  (nothing changed)`);
  console.log(`  not ours:           ${out.unmatched}`);
  if (acted.length) { console.log(''); acted.forEach((a) => console.log(`  ${a}`)); }
  if (dry) console.log('\ndry run — nothing written');
  await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
