#!/usr/bin/env node
// Take the things that are not people off the people list.
//
//   node scripts/hoursback/clean-junk-people.js --look
//   node scripts/hoursback/clean-junk-people.js
//
// The 5,579 people on file were gathered by pattern matching — anything shaped
// like two capitalised words near anything shaped like a job title. So the
// list carries things that were never people:
//
//   · "Advanced Medical", filed as an attorney at Horner Law
//   · rows with no name at all, just an address
//   · the same address twice, one copy with a stray backslash on the end
//   · "your@email", which is the grey placeholder inside a contact form
//
// Every one of those inflates how reachable a business looks, which is the
// number Russ is about to rank his day by. A row that is not a person must not
// count as a person you can write to.
//
// WHAT IS NOT TOUCHED: a real person with a missing field. A gap is a fact
// about the world; only a row that is provably not a person is removed, and a
// bad address is emptied rather than the row deleted, because the name may
// still be worth having.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const { looksLikeAHuman, isARealAddress } = require('../../src/hoursback/understand.js');

const LOOK = process.argv.includes('--look');

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const all = await db.contact.findMany({
    select: { id: true, prospectId: true, name: true, role: true, email: true, phone: true, linkedIn: true },
  });
  console.log(`${all.length} people on file`);
  console.log(LOOK ? 'LOOKING ONLY — nothing will be changed\n' : 'cleaning\n');

  const toDelete = [];
  const toEmpty = [];
  const shown = { notPeople: [], badAddresses: [] };

  // The same address twice under one business is one person entered twice.
  const seen = new Set();

  for (const c of all) {
    const name = String(c.name || '').trim();
    const hasName = name.length > 0;

    // Not a person. A single first name counts as one only when something is
    // attached to it — a job, an address, a number.
    const attached = Boolean(c.role || c.email || c.phone || c.linkedIn);
    if (hasName && !looksLikeAHuman(name, attached)) {
      toDelete.push(c.id);
      if (shown.notPeople.length < 30) {
        shown.notPeople.push(`  ${name.slice(0, 34).padEnd(36)}${(c.role || '').slice(0, 24).padEnd(26)}${c.email || ''}`);
      }
      continue;
    }

    // No name and no way to reach anybody — an empty row.
    if (!hasName && !c.email && !c.phone && !c.linkedIn) { toDelete.push(c.id); continue; }

    // An address that is not an address. Emptied, never deleted — the name is
    // still a real person even when the address turned out to be a placeholder.
    if (c.email && !isARealAddress(c.email)) {
      toEmpty.push(c.id);
      if (shown.badAddresses.length < 25) shown.badAddresses.push(`  ${(name || '(no name)').slice(0, 26).padEnd(28)}${c.email}`);
      continue;
    }

    // The same address under the same business, twice.
    if (c.email) {
      const key = `${c.prospectId}|${c.email.toLowerCase()}`;
      if (seen.has(key)) { if (!hasName) toDelete.push(c.id); else toEmpty.push(c.id); continue; }
      seen.add(key);
    }
  }

  console.log(`not people at all:        ${toDelete.length}`);
  console.log(`addresses that are not:   ${toEmpty.length}`);
  console.log('');
  console.log('things filed as people:');
  shown.notPeople.forEach((l) => console.log(l));
  console.log('\naddresses that would bounce:');
  shown.badAddresses.forEach((l) => console.log(l));

  if (!LOOK) {
    for (let i = 0; i < toDelete.length; i += 200) {
      await db.contact.deleteMany({ where: { id: { in: toDelete.slice(i, i + 200) } } });
    }
    for (let i = 0; i < toEmpty.length; i += 200) {
      await db.contact.updateMany({ where: { id: { in: toEmpty.slice(i, i + 200) } }, data: { email: null } });
    }
    console.log(`\nremoved ${toDelete.length}, emptied the address on ${toEmpty.length}`);
  }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
