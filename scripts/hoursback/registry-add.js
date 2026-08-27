#!/usr/bin/env node
// Add Central Oregon businesses from the state register that are not on the
// list yet.
//
//   node scripts/hoursback/registry-add.js --dry-run     see what it would add
//   node scripts/hoursback/registry-add.js --limit=500   add the first 500
//   node scripts/hoursback/registry-add.js               add everything
//
// Free. The register is a file already on disk — no key, no account, nothing
// that can be metered. Nothing here touches Google.
//
// What gets thrown out, and only this: entities with no operation to fix —
// holding companies, trusts, churches, cemeteries, and shells named after a
// street address. NOT sole traders. A one-person shop has nobody to hand the
// admin to, which makes it the strongest case for the offer rather than the
// weakest (Russ overruled an earlier filter that removed 2,735 of them,
// 2026-08-26).
//
// Businesses arrive with a name, a city and the person registered behind them.
// No website, no email, no phone — those come later, from reading their site.

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

const REGISTRY_FILE = 'data/hoursback/oregon-central-registry.csv.gz';

// No operation behind these, so nothing to give hours back to.
const NO_OPERATION = [
  /\b(holdings?|investments?|ventures?|capital|equities)\b/i,
  /\b(trust|revocable|credit shelter|estate of|family (llc|trust|partnership))\b/i,
  /\b(church|chapel|parish|ministr(y|ies)|congregation|cemetery|fellowship hall)\b/i,
  /^\d+\s+[NSEW]{1,2}\s/i,                       // "3808 SE 33RD PL LLC"
  /\b(homeowners? association|owners association|road maintenance)\b/i,
  // Fraternal orders, veterans' posts and service clubs: run by volunteers,
  // no payroll and no office. They led the list because the register is
  // ordered oldest first and these were chartered in the 1900s (2026-08-27).
  /\b(lodge no|post no|american legion|odd fellows|elks|moose lodge|eagles aerie|grange|rotary club|kiwanis|lions club|shrine|masonic|knights of columbus|vfw|veterans of foreign)\b/i,
  // Public bodies and mutual companies: not businesses anybody sells to.
  /\b(school district|fire district|water district|irrigation district|ditch (co|company)|port of|county of|city of|special road district|fair association|cemetery district)\b/i,
];

function hasNoOperation(name) {
  return NO_OPERATION.some((re) => re.test(name));
}

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const R = require('../../src/hoursback/registryFile.js');
  const { tradeOf } = require('../../src/hoursback/crm/queues.js');
  const db = new PrismaClient();
  const dry = process.argv.includes('--dry-run');
  const limit = Number(arg('limit', 0)) || Infinity;

  const raw = zlib.gunzipSync(fs.readFileSync(REGISTRY_FILE)).toString('utf8');
  const rows = R.parseCsv(raw);
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.business_name)) seen.set(r.business_name, r);
  // Newest first. The file is ordered oldest first, so a run with a limit was
  // adding businesses chartered in the 1900s before anything registered this
  // decade — exactly backwards for finding a trading business (2026-08-27).
  const ordered = [...seen.entries()].sort((a, b) =>
    String(b[1].registry_date || '').localeCompare(String(a[1].registry_date || '')));
  console.log(`${seen.size} businesses in the Central Oregon register`);

  // What is already on the list, by name and by the person behind it.
  const ours = await db.prospect.findMany({ select: { id: true, name: true, ownerName: true } });
  const byName = new Map(ours.map((p) => [R.normalizeName(p.name), p]));
  const ownerCount = new Map();
  for (const p of ours) if (p.ownerName) ownerCount.set(p.ownerName, (ownerCount.get(p.ownerName) || 0) + 1);
  console.log(`${ours.length} already on the list`);

  // Names on more than eight businesses are filing agents, not owners.
  const appearances = new Map();
  for (const r of rows) {
    const who = R.fullName(r);
    if (who) appearances.set(who, (appearances.get(who) || 0) + 1);
  }

  const toAdd = [];
  let already = 0, noOperation = 0, alsoRunsAnother = 0;
  for (const [name, row] of ordered) {
    if (byName.has(R.normalizeName(name))) { already += 1; continue; }
    if (hasNoOperation(name)) { noOperation += 1; continue; }
    const owner = R.fullName(row);
    const isAgent = owner && (appearances.get(owner) || 0) > R.AGENT_THRESHOLD;
    // The owner of a business already on the list, running another one. That
    // is a signal nothing currently finds and Russ asked for it by name.
    if (owner && !isAgent && ownerCount.has(owner)) alsoRunsAnother += 1;
    toAdd.push({
      name,
      city: row.city,
      owner: isAgent ? null : owner,
      registeredIn: String(row.registry_date || '').slice(0, 4),
      alsoRuns: Boolean(owner && !isAgent && ownerCount.has(owner)),
    });
    if (toAdd.length >= limit) break;
  }

  console.log(`  already on the list:                 ${already}`);
  console.log(`  no operation to fix:                 ${noOperation}`);
  console.log(`  TO ADD:                              ${toAdd.length}`);
  console.log(`    of those, the owner already runs`);
  console.log(`    something else on your list:       ${alsoRunsAnother}`);

  const byTrade = {};
  for (const b of toAdd) { const t = tradeOf(b.name); byTrade[t] = (byTrade[t] || 0) + 1; }
  console.log('');
  Object.entries(byTrade).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([t, n]) => console.log(`  ${String(n).padStart(6)}  ${t}`));

  if (dry) {
    console.log('\nfirst 12 that would be added:');
    toAdd.slice(0, 12).forEach((b) => console.log(`   ${b.name}  (${b.city}${b.owner ? ', ' + b.owner : ''})${b.alsoRuns ? '  ** already runs another **' : ''}`));
    console.log('\ndry run — nothing written');
    await db.$disconnect();
    return;
  }

  let written = 0;
  const CHUNK = 50;
  for (let i = 0; i < toAdd.length; i += CHUNK) {
    await Promise.all(toAdd.slice(i, i + CHUNK).map((b) => db.prospect.create({
      data: {
        // The register has no Google identifier and never will. A stable id of
        // our own keeps the unique constraint honest without inventing one
        // that looks like Google's.
        placeId: `orsos:${R.normalizeName(b.name).replace(/\s+/g, '-').toLowerCase()}`.slice(0, 190),
        name: b.name,
        address: b.city ? `${b.city}, OR` : null,
        ownerName: b.owner || null,
        trade: tradeOf(b.name) === 'other' ? null : tradeOf(b.name),
        stage: 'NEEDS_REVIEW',       // no phone and no website until a site is read
        fieldSource: 'oregon-business-register',
        fetchedAt: new Date(),
      },
    }).catch((e) => { if (!String(e.message).includes('Unique constraint')) throw e; })));
    written += Math.min(CHUNK, toAdd.length - i);
    if (written % 1000 === 0) console.log(`  ${written} added`);
  }
  console.log(`\nadded: ${written}`);
  const total = await db.prospect.count();
  console.log(`businesses on the list now: ${total}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
