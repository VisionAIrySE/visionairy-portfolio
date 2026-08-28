#!/usr/bin/env node
// Rewrite every unsent message to the wording as it stands now.
//
//   node scripts/hoursback/rewrite-all.js --output <path>
//
// A message Russ has edited by hand is never touched, and neither is one
// already sent. Everything else is rebuilt from the current sentences, so a
// change to the offer reaches every draft rather than only the ones somebody
// remembers to regenerate.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const o = process.argv.indexOf('--output');
const OUT = o > -1 ? process.argv[o + 1] : null;
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const L = require('../../src/hoursback/crm/lanes.js');
  const { BODY, SUBJECTS } = require('../../src/hoursback/crm/firstContact.js');
  const db = new PrismaClient();

  // The template Russ approves is the SHAPE plus the sentences. Saving it here
  // is what makes the approve button come back after a rewrite.
  const t = await L.upsertTemplate(db, { subject: SUBJECTS.default, body: BODY });
  say(`wording is now version ${t.version}, ${t.approvedAt ? 'still approved' : 'needs approving again'}`);

  const rows = await db.outreachMessage.findMany({
    where: { state: 'DRAFT', editedAt: null },
    select: { prospectId: true, lane: true },
  });
  say(`${rows.length} unsent, untouched messages to rewrite`);

  let done = 0;
  let gone = 0;
  for (const r of rows) {
    try {
      if (await L.draftFor(db, r.prospectId, r.lane)) done += 1;
      else gone += 1;
    } catch { gone += 1; }
    if (done % 200 === 0 && done) say(`  ${done}`);
  }
  say(`rewritten: ${done}`);
  say(`nothing honest to say, so left unwritten: ${gone}`);
  say(`emails ready: ${await db.outreachMessage.count({ where: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } } })}`);
  say(`linkedin ready: ${await db.outreachMessage.count({ where: { lane: 'LINKEDIN', state: { in: ['DRAFT', 'QUEUED'] } } })}`);
  if (OUT) fs.writeFileSync(OUT, lines.join('\n'));
  await db.$disconnect();
})().catch((e) => { console.error('rewrite failed:', e.message); process.exit(1); });
