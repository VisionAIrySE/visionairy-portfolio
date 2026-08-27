#!/usr/bin/env node
// Look up who is registered behind each business, from Oregon's public
// register. Free: no key, no account, no fee.
//
//   node scripts/hoursback/registry-sweep.js --budget=50   try fifty
//   node scripts/hoursback/registry-sweep.js --budget=2500 the whole list
//
// Ceilings live in the code: never more than HARD_CEILING businesses in a run,
// one at a time with a pause between, and anything it cannot read is skipped
// rather than retried into the ground.

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
  const { lookUp, HARD_CEILING } = require('../../src/hoursback/registry.js');
  const db = new PrismaClient();

  const asked = Number(arg('budget', 25));
  const budget = Math.min(Number.isFinite(asked) ? asked : 25, HARD_CEILING);
  const lanes = Math.min(Number(arg('concurrency', 4)) || 4, 6);
  const force = process.argv.includes('--force');

  const where = { doNotContact: false, ...(force ? {} : { ownerName: null }) };
  const rows = await db.prospect.findMany({
    where, orderBy: [{ automationScore: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }], take: budget,
  });

  const started = Date.now();
  console.log(`looking up ${rows.length} businesses in Oregon's public register, ${lanes} at a time — nothing here costs money`);

  const out = { looked: 0, named: 0, people: 0, nothing: 0 };
  let cursor = 0;
  const touched = [];
  const worker = async () => {
    for (;;) {
      const i = cursor; cursor += 1;
      if (i >= rows.length) return;
      const p = rows[i];
      out.looked += 1;
      const got = await lookUp(p.name);
      if (!got.people.length) { out.nothing += 1; continue; }
      out.named += 1;
      out.people += got.people.length;
      try {
        // The first person named becomes the owner on record, unless Russ has
        // already written one there himself.
        const fresh = await db.prospect.findUnique({ where: { id: p.id } });
        if (fresh && !fresh.ownerName) {
          await db.prospect.update({ where: { id: p.id }, data: { ownerName: got.people[0] } });
          touched.push(p.id);
        }
        // Everyone named goes on the card as a person, kept apart from the
        // people found on their website.
        for (const [n, name] of got.people.entries()) {
          const existing = await db.contact.findFirst({ where: { prospectId: p.id, name } });
          if (existing) continue;
          await db.contact.create({
            data: {
              prospectId: p.id, name,
              role: n === 0 ? 'Registered owner' : 'Registered',
              source: 'REGISTRY', foundOn: got.url,
            },
          });
        }
      } catch { /* one bad write never ends the run */ }
      if (out.looked % 25 === 0) {
        console.log(`  ${out.looked}/${rows.length} looked up · ${out.named} named · ${((Date.now() - started) / 60000).toFixed(1)}m`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, rows.length) }, worker));

  console.log(`\ndone in ${((Date.now() - started) / 60000).toFixed(1)} minutes`);
  console.log(`  businesses looked up   ${out.looked}`);
  console.log(`  owners named           ${out.named}`);
  console.log(`  people found in total  ${out.people}`);
  console.log(`  no record found        ${out.nothing}`);
  console.log(`  owners on file now     ${await db.prospect.count({ where: { ownerName: { not: null } } })}`);
  // An owner's name changes the score, so what was touched is re-scored here.
  const { rescoreMany } = require('../../src/hoursback/refresh.js');
  const rs = await rescoreMany(db, touched);
  console.log(`  scores moved           ${rs.moved} of ${rs.scored}`);
  await db.$disconnect();
})().catch((e) => { console.error('lookup failed:', e.message); process.exit(1); });
