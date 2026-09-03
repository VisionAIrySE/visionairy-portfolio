#!/usr/bin/env node
// THE PEOPLE LIST, TIDIED — NOTHING DELETED (Russ, 2026-09-03).
//
//   node scripts/hoursback/tidy-people.js --look    (say what it would do)
//   node scripts/hoursback/tidy-people.js
//
// Pangea Chiropractic had thirty-three "people", of which about twenty were
// page headings: Neck Pain, Schedule Appointment, Spinal Adjustments. And the
// same chiropractor appeared twice, as "Dr. Brent Torchio" and "Brent Torchio
// Dr".
//
// TWO THINGS, AND BOTH ARE REVERSIBLE. Every row stays; a set-aside row simply
// stops showing as a person, and says why.
//
//   merged      the same person filed twice under this one business. The row
//               with the most on it wins; the other points at it. At Pangea
//               that is four doctors read once off the team page as "Dr. Brent
//               Torchio" and again off the hiring page as "Brent Torchio Dr".
//
// NOTHING IS HIDDEN FOR LOOKING ODD. A first attempt at this also set aside
// any row whose name did not pass the person-name test, which would have
// hidden "Chase", "Jo Ann Gould", "Dr Mike Bellinghausen" and "Robyn Lopez,
// DNP" — every one a real person. A single first name is a person whose
// surname was not on the page, and a qualification after a name is still a
// name. The service headings that started this ("Neck Pain", "Spinal
// Adjustments") were already gone by the time it ran.
//
// So this does ONE thing, and only where it is certain.

const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
const { PrismaClient } = require('@prisma/client');
const { plausiblePersonName } = require('../../src/hoursback/crm/names.js');

const LOOK = process.argv.includes('--look');

/// A name with any doctor's title taken off, lowercased, for comparing two
/// spellings of one person: "Dr. Brent Torchio" and "Brent Torchio Dr".
function sameNameKey(name) {
  return String(name || '')
    .replace(/^\s*(dr|doctor|mr|mrs|ms|miss)\.?\s+/i, '')
    .replace(/\s+(dr|doctor|jr|sr|ii|iii|iv|dds|dmd|md|dvm|dc|nd|od|cpa|esq)\.?\s*$/i, '')
    .toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

/// How much a row actually carries. The fullest row is the one kept.
function howMuchIsOnIt(c) {
  return (c.email ? 4 : 0) + (c.phone ? 3 : 0) + (c.linkedIn ? 2 : 0)
    + (c.role ? 2 : 0) + (c.foundOn ? 1 : 0)
    + (/^\s*(dr|doctor)\.?\s/i.test(String(c.name || '')) ? 1 : 0);
}

async function main() {
  const db = new PrismaClient();
  try {
    const all = await db.contact.findMany({
      where: { setAsideAt: null, mergedIntoId: null },
      select: {
        id: true, prospectId: true, name: true, role: true,
        email: true, phone: true, linkedIn: true, foundOn: true,
      },
    });
    console.log(`${all.length} people on file${LOOK ? ' — LOOKING ONLY, nothing will be written' : ''}\n`);

    // --- the same person, filed twice --------------------------------------
    // A SURNAME OR NOTHING. "Dr. Mark E. Gonsky" and "Mark E Gonsky" are one
    // man; "Kevin" and "Kevin" at the same company might be two. Three Kevins
    // showed up in the first run, and merging two real people loses one of
    // them for good. So a single given name is never merged, however likely it
    // looks — the cost of being wrong is not symmetric.
    const byPersonAtBusiness = new Map();
    for (const c of all) {
      const key = `${c.prospectId}|${sameNameKey(c.name)}`;
      if (!sameNameKey(c.name)) continue;
      if (sameNameKey(c.name).split(' ').length < 2) continue;
      if (!byPersonAtBusiness.has(key)) byPersonAtBusiness.set(key, []);
      byPersonAtBusiness.get(key).push(c);
    }
    let merged = 0;
    const examples = [];
    const mergedInto = new Set();
    for (const rows of byPersonAtBusiness.values()) {
      if (rows.length < 2) continue;
      const keep = rows.slice().sort((a, b) => howMuchIsOnIt(b) - howMuchIsOnIt(a))[0];
      mergedInto.add(keep.id);
      for (const other of rows) {
        if (other.id === keep.id) continue;
        // Anything the kept row is missing and the other one has is carried over.
        const carry = {};
        for (const f of ['role', 'email', 'phone', 'linkedIn', 'foundOn']) {
          if (!keep[f] && other[f]) { carry[f] = other[f]; keep[f] = other[f]; }
        }
        if (!LOOK) {
          if (Object.keys(carry).length) await db.contact.update({ where: { id: keep.id }, data: carry });
          await db.contact.update({
            where: { id: other.id },
            data: {
              mergedIntoId: keep.id,
              setAsideAt: new Date(),
              setAsideReason: `the same person as "${keep.name}", filed twice`,
            },
          });
        }
        merged += 1;
        if (examples.length < 12) examples.push(`  "${other.name}" -> "${keep.name}"`);
      }
    }

    console.log(`the same person filed twice, merged: ${merged}`);
    if (examples.length) { console.log('\nfor example:'); console.log(examples.join('\n')); }
    console.log('\nNothing was deleted. Every merged row is still there, pointing at the one kept.');
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { sameNameKey, howMuchIsOnIt };
