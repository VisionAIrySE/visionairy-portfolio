#!/usr/bin/env node
// Write the LinkedIn note for every business where a person is actually known.
//
// LinkedIn needs a name — you message a person, not an inbox — so this only
// covers businesses where somebody's name is on the record. Nothing is ever
// sent by the engine; each one waits in the hand-send queue for Russ to paste.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const L = require('../../src/hoursback/crm/lanes.js');
  const { greetingFor } = require('../../src/hoursback/crm/firstContact.js');
  const db = new PrismaClient();

  // Only businesses that have actually been looked at. The state register
  // added 31,669 with an owner's name and nothing else — no website, no
  // verification, nothing read. Left unguarded this wrote notes for 30,407
  // businesses instead of 1,283, filling the hand-send queue with prospects
  // nobody has confirmed exist as going concerns (2026-08-27).
  const rows = await db.prospect.findMany({
    where: {
      doNotContact: false, repliedAt: null,
      NOT: { fieldSource: 'oregon-business-register' },
    },
    select: { id: true, name: true, ownerName: true, contactName: true, email: true, emailManualValue: true },
    orderBy: { automationScore: 'desc' },
  });
  const withPerson = rows.filter((p) => greetingFor(p));
  console.log(`${rows.length} businesses, ${withPerson.length} where a person is actually known`);

  let written = 0, rewritten = 0, kept = 0, nothing = 0;
  for (const p of withPerson) {
    const before = await db.outreachMessage.findFirst({ where: { prospectId: p.id, lane: 'LINKEDIN' } });
    const after = await L.draftFor(db, p.id, 'LINKEDIN');
    if (!after) { nothing += 1; continue; }
    if (!before) written += 1;
    else if (before.body !== after.body) rewritten += 1;
    else kept += 1;
  }
  console.log(`written fresh: ${written}`);
  console.log(`brought up to date: ${rewritten}`);
  console.log(`already current: ${kept}`);
  console.log(`nothing honest to say: ${nothing}`);
  const total = await db.outreachMessage.count({ where: { lane: 'LINKEDIN' } });
  const sent = await db.outreachMessage.count({ where: { lane: 'LINKEDIN', state: 'SENT' } });
  console.log(`\nLinkedIn notes on file: ${total} (${sent} already sent by hand)`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
