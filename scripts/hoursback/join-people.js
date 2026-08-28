#!/usr/bin/env node
// Put split people back together, and make the owner somebody you can pick.
//
//   node scripts/hoursback/join-people.js --dry-run     show what it would do
//   node scripts/hoursback/join-people.js               do it
//
// Two faults, both found by Russ on Insurance Center, 2026-08-28:
//
//   1. Six people were stored twice — once as a name with no address, once as
//      an address with no name. 19 rows for a ten-person office.
//   2. Don Welker was on the record as the owner but was not a person you
//      could select, because the owner's name and the people list are two
//      different places that never talked.
//
// The join is a RULE, so this prints every pair it intends to make. Read them
// before letting it write.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const { joinPeople } = require('../../src/hoursback/peopleJoin.js');
const DRY = process.argv.includes('--dry-run');
const SHOW = Number((process.argv.find((a) => a.startsWith('--show=')) || '--show=60').split('=')[1]);

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  // Only businesses actually being worked. Scoped to everything on file this
  // would have created 30,625 people rows across the whole state register —
  // businesses with no website, no address and nobody being written to
  // (2026-08-28).
  const businesses = await db.prospect.findMany({
    where: {
      doNotContact: false,
      OR: [
        { NOT: [{ AND: [{ email: null }, { emailManualValue: null }] }] },
        { NOT: [{ AND: [{ website: null }, { websiteManualValue: null }] }] },
      ],
    },
    select: {
      id: true, name: true, nameManualValue: true, ownerName: true,
      contacts: { select: { id: true, name: true, email: true, role: true, phone: true, isPrimary: true } },
    },
  });

  const out = { joined: 0, ownersAdded: 0, businessesTouched: 0 };
  const shown = [];

  for (const b of businesses) {
    const bizName = (b.nameManualValue || b.name || '').slice(0, 26);
    let touched = false;

    // --- 1. join the split rows -------------------------------------------
    const joins = joinPeople(b.contacts, b.nameManualValue || b.name);
    for (const j of joins) {
      out.joined += 1; touched = true;
      if (shown.length < SHOW) {
        shown.push(`  ${bizName.padEnd(28)}${String(j.keep.name).padEnd(22)}+ ${String(j.email).padEnd(32)}${j.why}`);
      }
      if (!DRY) {
        // Delete the address-only row FIRST. Two people at one business cannot
        // hold the same address, so setting it on the person while the orphan
        // still holds it is refused (2026-08-28).
        await db.contact.delete({ where: { id: j.absorb.id } });
        await db.contact.update({ where: { id: j.keep.id }, data: { email: j.email } });
      }
    }

    // --- 2. the owner becomes somebody you can pick ------------------------
    // Only when no row already carries that name, so this never doubles up.
    const owner = String(b.ownerName || '').trim();
    if (owner) {
      const already = b.contacts.some((c) => String(c.name || '').trim().toLowerCase() === owner.toLowerCase());
      if (!already) {
        out.ownersAdded += 1; touched = true;
        if (!DRY) {
          await db.contact.create({
            data: { prospectId: b.id, name: owner, role: 'owner', source: 'WEBSITE', isPrimary: false },
          });
        }
      }
    }
    if (touched) out.businessesTouched += 1;
  }

  console.log(DRY ? 'DRY RUN — nothing written\n' : 'written\n');
  console.log(`people put back together:      ${out.joined}`);
  console.log(`owners now selectable:         ${out.ownersAdded}`);
  console.log(`businesses affected:           ${out.businessesTouched}`);
  console.log(`\nfirst ${Math.min(SHOW, shown.length)} joins, to be read:\n`);
  shown.forEach((l) => console.log(l));

  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
