#!/usr/bin/env node
// Take out of the people list everything that is not a person.
//
//   node scripts/hoursback/drop-non-people.js --dry-run
//   node scripts/hoursback/drop-non-people.js
//
// Relaxing the team-page reader so it could see a job title under a photograph
// also let a great deal of a web page in with it. The list went from 7,352 to
// 17,648 and most of the new ones were headings: "Drainage Solutions", "See
// All", "Wire Transfers", "Flea Treatment", "Recovery Gear" (2026-08-28).
//
// The test is evidence, not spelling. A person on a business's own site has
// something attached to them — an address, a job title, a direct line, or a
// profile link. A row that is only two capitalised words lifted out of a run
// of text has nothing behind it and cannot be written to, rung, or looked up.
//
// Anything Russ typed himself is never touched.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const DRY = process.argv.includes('--dry-run');

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = require('../../src/hoursback/crm/productLegacyScope.js').legacyClient(new PrismaClient(),{enabled:process.env.CRM_PRODUCT_PREVIEW==='1'});

  // An empty string is not a job title either. Matching only on null found
  // nothing at all, because the reader writes '' where it saw a blank
  // (2026-08-28).
  const blank = (f) => ({ OR: [{ [f]: null }, { [f]: '' }] });
  // Being marked as the main contact is NOT protection. Historical reader
  // runs marked the first entry on some pages, including headings such as
  // "Drainage Solutions". Only what Russ typed is safe.
  const where = {
    AND: [
      { source: { not: 'RUSS' } },
      blank('email'), blank('role'), blank('phone'), blank('linkedIn'),
    ],
  };

  const going = await db.contact.count({ where });
  const total = await db.contact.count();
  const staying = total - going;

  console.log(DRY ? 'DRY RUN — nothing deleted\n' : 'deleted\n');
  console.log(`nothing behind them, going:  ${going}`);
  console.log(`something behind them, kept: ${staying}`);

  if (!DRY) {
    const r = await db.contact.deleteMany({ where });
    console.log(`\nactually removed: ${r.count}`);
  }

  // Removing a bad row must never choose a replacement recipient. Every
  // remaining person stays available for Russ to select explicitly.

  const left = await db.contact.count({ where: { prospect: { doNotContact: false } } });
  const withEmail = await db.contact.count({ where: { prospect: { doNotContact: false }, email: { not: null } } });
  const withRole = await db.contact.count({ where: { prospect: { doNotContact: false }, role: { not: null } } });
  console.log(`\npeople left:        ${left}`);
  console.log(`  with an address:  ${withEmail}`);
  console.log(`  with a job title: ${withRole}`);
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
