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
  // The wording version's own subject line is a description, not a line that
  // gets sent: every message now takes a concrete noun out of its own trade's
  // week ("chasing change orders", "the recall list"). There is no one default
  // any more, because a single subject across 24 trades is the thing that made
  // them unopenable (2026-08-28).
  const t = await L.upsertTemplate(db, { subject: SUBJECTS.default, body: BODY });
  say(`wording is now version ${t.version}, ${t.approvedAt ? 'still approved' : 'needs approving again'}`);

  const rows = await db.outreachMessage.findMany({
    // Anything not yet sent and not written by hand — including messages
    // already lined up to send, which is where the old wording was hiding
    // (2026-08-28).
    where: { sentAt: null, editedAt: null },
    select: { prospectId: true, lane: true },
  });
  say(`${rows.length} unsent, untouched messages to rewrite`);

  // Many at once, because nothing here is thinking — each message is a read
  // from the database, some sentences assembled, and a write back. Almost all
  // of the time was spent waiting on a round trip to the cloud with nothing
  // else happening, and one at a time meant 1,722 of them took longer than the
  // run's own time limit: it was cut off at 600 and left 906 messages carrying
  // wording Russ had already thrown out (2026-08-28).
  //
  // Each message touches only its own row, so they cannot tread on each other.
  // Twelve is chosen to stay well inside the database's connection pool rather
  // than to go as fast as possible — a rewrite that half-finishes is worse
  // than a slow one.
  const LANES = 12;
  let done = 0;
  let gone = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= rows.length) return;
      const r = rows[i];
      try {
        if (await L.draftFor(db, r.prospectId, r.lane)) done += 1;
        else gone += 1;
      } catch { gone += 1; }
      if ((done + gone) % 200 === 0) say(`  ${done + gone} of ${rows.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, rows.length) }, worker));
  say(`rewritten: ${done}`);
  say(`nothing honest to say, so left unwritten: ${gone}`);
  say(`emails ready: ${await db.outreachMessage.count({ where: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } } })}`);
  say(`linkedin ready: ${await db.outreachMessage.count({ where: { lane: 'LINKEDIN', state: { in: ['DRAFT', 'QUEUED'] } } })}`);
  if (OUT) fs.writeFileSync(OUT, lines.join('\n'));
  await db.$disconnect();
})().catch((e) => { console.error('rewrite failed:', e.message); process.exit(1); });
