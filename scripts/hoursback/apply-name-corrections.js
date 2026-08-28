#!/usr/bin/env node
// Write the hand-read names onto the records, and hold back what can't be sent.
//
//   node scripts/hoursback/apply-name-corrections.js --dry-run
//   node scripts/hoursback/apply-name-corrections.js
//
// 92 names were read one at a time off each business's own home page on
// 2026-08-28. This writes them into the hand-entered column, which no later
// machine sweep overwrites.
//
// Two groups are held back rather than corrected:
//   · 13 whose own page never names them — the only candidate comes off the
//     domain, and guessing at a name is what produced "Northlamontass".
//   · 30 national chains and franchise branches — a note about finding hours
//     in their week goes to a corporate inbox and reads as a mailing list.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const C = require('../../src/hoursback/nameCorrections.js');
const DRY = process.argv.includes('--dry-run');

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const rows = await db.prospect.findMany({
    where: { doNotContact: false },
    select: { id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true, stage: true },
  });

  const out = { renamed: 0, alreadyRight: 0, heldUnknownName: 0, heldNotLocal: 0 };
  const renamedList = [];

  for (const r of rows) {
    const url = r.websiteManualValue || r.website;
    if (!url) continue;

    if (C.isNotLocal(url)) {
      out.heldNotLocal += 1;
      if (!DRY) {
        await db.prospect.update({
          where: { id: r.id },
          data: { doNotContact: true, stage: 'NEEDS_REVIEW' },
        });
      }
      continue;
    }

    const why = C.whyStillUnknown(url);
    if (why) {
      out.heldUnknownName += 1;
      if (!DRY) {
        await db.prospect.update({
          where: { id: r.id },
          data: { stage: 'NEEDS_REVIEW' },
        });
      }
      continue;
    }

    const better = C.correctedName(url);
    if (!better) continue;
    if ((r.nameManualValue || r.name) === better) { out.alreadyRight += 1; continue; }

    out.renamed += 1;
    renamedList.push(`${(r.nameManualValue || r.name).slice(0, 46).padEnd(48)} -> ${better}`);
    if (!DRY) {
      await db.prospect.update({ where: { id: r.id }, data: { nameManualValue: better } });
    }
  }

  console.log(DRY ? 'DRY RUN - nothing written\n' : 'written\n');
  console.log(`renamed from their own page:   ${out.renamed}`);
  console.log(`already correct:               ${out.alreadyRight}`);
  console.log(`held back, name unconfirmed:   ${out.heldUnknownName}`);
  console.log(`held back, national chain:     ${out.heldNotLocal}`);
  console.log('\nfirst 30 renamed:');
  renamedList.slice(0, 30).forEach((l) => console.log('  ' + l));

  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
