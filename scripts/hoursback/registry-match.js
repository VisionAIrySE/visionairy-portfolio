#!/usr/bin/env node
// Fill in who is registered behind each business, from Oregon's own open data.
//
//   node scripts/hoursback/registry-match.js            fill only what is missing
//   node scripts/hoursback/registry-match.js --dry-run  show what it would do
//
// Free: one request to the state's public file, no key, no account. Nothing
// Russ typed is ever overwritten.

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
  const R = require('../../src/hoursback/registryFile.js');
  const dry = process.argv.includes('--dry-run');
  const db = new PrismaClient();

  const cached = process.argv.find((a) => a.startsWith('--file='));
  const rows = cached
    ? R.parseCsv(fs.readFileSync(cached.split('=')[1], 'utf8'))
    : await R.fetchRegistry();
  console.log(`${rows.length} Central Oregon registrations naming a person`);
  const byName = R.indexByName(rows);
  console.log(`${byName.size} distinct businesses in the register`);

  const ours = await db.prospect.findMany({
    where: { doNotContact: false, ownerName: null },
    select: { id: true, name: true },
  });
  console.log(`${ours.length} of our businesses have no owner name`);

  const found = [];
  for (const b of ours) {
    const hit = R.ownerOf(b.name, byName);
    if (hit) found.push({ id: b.id, name: b.name, owner: hit.name, filedAs: hit.filedAs });
  }
  console.log(`matched: ${found.length}`);
  found.slice(0, 20).forEach((f) => console.log(`   ${f.owner.padEnd(24)} <- ${f.name}`));

  if (dry) { console.log('\ndry run — nothing written'); await db.$disconnect(); return; }

  let written = 0;
  const CHUNK = 25;
  for (let i = 0; i < found.length; i += CHUNK) {
    await Promise.all(found.slice(i, i + CHUNK).map((f) =>
      db.prospect.update({ where: { id: f.id }, data: { ownerName: f.owner } })));
    written += Math.min(CHUNK, found.length - i);
  }
  console.log(`\nowner names written: ${written}`);
  // An owner's name is a scored tell — "the same person runs several of these"
  // — so the records just touched are re-scored. No website is read.
  const { rescoreMany } = require('../../src/hoursback/refresh.js');
  const r = await rescoreMany(db, found.map((f) => f.id));
  console.log(`scores moved: ${r.moved} of ${r.scored}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
