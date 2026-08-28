#!/usr/bin/env node
// Write the hand-read industries onto the records, and hold back what should
// never have been on the list.
//
//   node scripts/hoursback/apply-trade-corrections.js --dry-run
//   node scripts/hoursback/apply-trade-corrections.js
//
// All 666 emailable businesses were read against their own words on 2026-08-28.
// The recorded industry was right about nineteen times in twenty. This fixes
// the twentieth, and drops the businesses that were never prospects: a county
// health department, a school district, a paediatric clinic in Alabama, and a
// company that sells automation software for electricians.
//
// A business whose industry changes needs its message written again — the
// whole opening is that trade's own week — so this puts them back to draft.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const T = require('../../src/hoursback/tradeCorrections.js');
const DRY = process.argv.includes('--dry-run');

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const L = require('../../src/hoursback/crm/lanes.js');
  const db = new PrismaClient();

  const rows = await db.prospect.findMany({
    where: { doNotContact: false },
    select: { id: true, name: true, nameManualValue: true, trade: true, website: true, websiteManualValue: true },
  });

  const out = { retraded: 0, dropped: 0 };
  const notes = [];

  for (const r of rows) {
    const url = r.websiteManualValue || r.website;
    if (!url) continue;
    const name = (r.nameManualValue || r.name || '').slice(0, 30);

    const why = T.whyNotAProspect(url);
    if (why) {
      out.dropped += 1;
      notes.push(`  DROPPED  ${name.padEnd(32)} ${why}`);
      if (!DRY) {
        await db.prospect.update({ where: { id: r.id }, data: { doNotContact: true, stage: 'NEEDS_REVIEW' } });
        await db.outreachMessage.deleteMany({ where: { prospectId: r.id, sentAt: null } });
      }
      continue;
    }

    const better = T.correctedTrade(url);
    if (!better || better === r.trade) continue;
    out.retraded += 1;
    notes.push(`  ${(r.trade || 'none').padEnd(20)} -> ${better.padEnd(20)} ${name}`);
    if (!DRY) {
      await db.prospect.update({ where: { id: r.id }, data: { trade: better } });
      // The whole opening is the trade's own week, so the message has to be
      // written again rather than left saying somebody else's.
      for (const lane of ['EMAIL', 'LINKEDIN']) {
        try { await L.draftFor(db, r.id, lane); } catch { /* one record never stops the run */ }
      }
    }
  }

  console.log(DRY ? 'DRY RUN — nothing written\n' : 'written\n');
  console.log(`industry corrected:        ${out.retraded}`);
  console.log(`dropped, never a prospect: ${out.dropped}`);
  console.log('');
  notes.forEach((n) => console.log(n));

  const left = await db.prospect.count({
    where: { doNotContact: false, NOT: [{ AND: [{ email: null }, { emailManualValue: null }] }] },
  });
  console.log(`\nbusinesses you can email: ${left}`);
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
