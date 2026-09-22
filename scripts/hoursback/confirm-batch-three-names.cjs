#!/usr/bin/env node
// Correct only the category-like names confirmed by batch-three website reads.
// Preview is read-only; --do-it keeps the earlier listing name in field history.
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const { PrismaClient } = require('@prisma/client');
const { applyOrHold } = require('../../src/hoursback/overrides.js');
const db = require('../../src/hoursback/crm/productLegacyScope.js').legacyClient(new PrismaClient(),{enabled:process.env.CRM_PRODUCT_PREVIEW==='1'});
const DO_IT = process.argv.includes('--do-it');
const VERSION = '2026-09-14-whole-site-openrouter-batch-3';
const names = [
  ['cmt93a8qr00bqt7lcw7o1173f', 'Central Oregon HOA Management', 'Mile High Community Management'],
  ['cmt9461bg0024t7z43p75ri3y', 'Flooring Installation Services in Central Oregon', 'Mid State Construction Services'],
  ['cmt9461ed002it7z40n1dwnrp', 'Paving Contractor Bend Oregon JAL Paving & Highway Construction', 'JAL Paving & Highway Construction, LLC'],
  ['cmt94636p003yt7z42f9a7l3z', 'Bend Plumbing Services', 'Einstein Pros'],
  ['cmt9463mt006at7z4qbicj7ha', 'Handyman in Bend', 'Handyman Ben'],
  ['cmt94x4fr00uyt7qrgtik8ml1', '9th St Auto Repair and transmission', '9th Street Auto Repair & Transmission'],
  ['cmt94x4ru00xkt7qr53iatp3j', 'AK Service Center', 'Auto Kings'],
  ['cmt94xcen01m0t7qrpjxzp8ge', 'Redmond - Western Title', 'Western Title & Escrow'],
  ['cmt956kqo02dut7s7jh3030i2', 'Veterinary Clinic', 'Rimrock Veterinary Clinic'],
  ['cmt956xj003det7s72qhjdhkc', 'Real Estate', 'Crook County Properties, LLC'],
  ['cmt957k3604q8t7s747tc3iwq', 'Best Property Management Company', 'Pinehurst Management'],
];

(async () => {
  let changed = 0;
  let blocked = 0;
  for (const [id, before, after] of names) {
    const row = await db.prospect.findUnique({
      where: { id },
      select: {
        name: true, nameManualValue: true, selfDescription: true,
        readings: { where: { reader: 'understand-businesses', readerVersion: VERSION, outcome: 'read' }, select: { id: true }, take: 1 },
      },
    });
    if (row && row.name === after) { console.log(`ALREADY ${after}`); continue; }
    if (!row || row.name !== before || row.nameManualValue
      || row.selfDescription !== `calls itself: ${after}` || !row.readings.length) {
      blocked += 1;
      console.log(`BLOCKED ${before}: current record or saved website evidence differs`);
      continue;
    }
    if (!DO_IT) { console.log(`PREVIEW ${before} -> ${after}`); continue; }
    const result = await applyOrHold(db, id, 'name', after, 'confirmed from saved website research, batch 3');
    if (result === 'changed') changed += 1;
    else blocked += 1;
    console.log(`${result.toUpperCase()} ${before} -> ${after}`);
  }
  console.log(`${DO_IT ? 'UPDATED' : 'PREVIEW'} ${changed} names changed; ${blocked} blocked`);
  if (blocked) process.exitCode = 2;
})().finally(() => db.$disconnect());
