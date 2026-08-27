#!/usr/bin/env node
// Delete everything that came from Google Places, keeping only the Place ID.
//
//   node scripts/hoursback/purge-places-data.js --dry-run
//   node scripts/hoursback/purge-places-data.js
//
// Google's support asked directly whether business names, contact details or
// addresses fetched from their Places API are being stored. They were, for
// 2,043 businesses. Their terms allow the Place ID and coordinates to be kept
// and nothing else (2026-08-27).
//
// Run recollect-from-sites.js FIRST. It reads each business's own website and
// writes what it publishes into the hand-entered columns, which are ours
// rather than Google's. Whatever it recovered survives this; whatever it did
// not is deleted.
//
// A business whose name exists nowhere but Google cannot keep a name, and a
// record with no name is not a business. Those records are removed outright.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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
  const db = new PrismaClient();
  const dry = process.argv.includes('--dry-run');

  // The free public register: a name found here is not Google's.
  const raw = zlib.gunzipSync(fs.readFileSync('data/hoursback/oregon-central-registry.csv.gz')).toString('utf8');
  const register = new Set(R.parseCsv(raw).map((r) => R.normalizeName(r.business_name)));

  const rows = await db.prospect.findMany({ where: { placeId: { startsWith: 'ChI' } } });
  console.log(`${rows.length} records carry data fetched from Places\n`);

  const remove = [];
  const clear = [];
  for (const p of rows) {
    // A name of our own: read off their website, typed by Russ, or listed in
    // the public state register.
    const ourName = p.nameManualValue || (register.has(R.normalizeName(p.name)) ? p.name : null);
    if (!ourName) { remove.push(p); continue; }
    clear.push({ p, ourName });
  }

  console.log(`keep, with Google's copy of their details cleared: ${clear.length}`);
  console.log(`remove entirely, name exists nowhere but Google:   ${remove.length}`);

  const reachable = remove.filter((p) => p.emailManualValue || p.email).length;
  const drafted = await db.outreachMessage.count({ where: { prospectId: { in: remove.map((p) => p.id) } } });
  console.log(`   of those, reachable by email: ${reachable}`);
  console.log(`   of those, with a message already written: ${drafted}`);

  if (dry) {
    console.log('\nfirst 8 that would be removed:');
    remove.slice(0, 8).forEach((p) => console.log(`   ${p.name}`));
    console.log('\ndry run — nothing deleted');
    await db.$disconnect();
    return;
  }

  // Messages, calls, people and edit history go with a removed record.
  let removed = 0;
  for (const p of remove) {
    await db.outreachMessage.deleteMany({ where: { prospectId: p.id } });
    await db.callLog.deleteMany({ where: { prospectId: p.id } });
    await db.contact.deleteMany({ where: { prospectId: p.id } });
    await db.prospectFieldEdit.deleteMany({ where: { prospectId: p.id } });
    await db.prospectDuplicate.deleteMany({ where: { keptProspectId: p.id } });
    await db.prospect.delete({ where: { id: p.id } });
    removed += 1;
    if (removed % 100 === 0) console.log(`  removed ${removed}`);
  }

  // Everything else keeps its Place ID and loses Google's copy of the rest.
  // The hand-entered columns are untouched: those came from the businesses'
  // own websites, from the state register, or from Russ.
  let cleared = 0;
  for (const { p, ourName } of clear) {
    await db.prospect.update({
      where: { id: p.id },
      data: {
        name: ourName,
        phone: null,
        address: null,
        website: p.websiteManualValue ? null : p.website,
        normalizedPhone: null,
        fieldSource: p.nameManualValue ? 'website' : 'oregon-business-register',
      },
    });
    cleared += 1;
    if (cleared % 200 === 0) console.log(`  cleared ${cleared}`);
  }

  console.log('');
  console.log(`removed:  ${removed}`);
  console.log(`cleared:  ${cleared}`);
  console.log(`businesses on the list now: ${await db.prospect.count()}`);
  await db.$disconnect();
})().catch((e) => { console.error('purge failed:', e.message); process.exit(1); });
