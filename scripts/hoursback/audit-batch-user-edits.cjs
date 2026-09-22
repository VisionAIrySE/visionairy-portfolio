#!/usr/bin/env node
// Read-only inventory of hand-edited messages and fields for one research batch.
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const { PrismaClient } = require('@prisma/client');
const db = require('../../src/hoursback/crm/productLegacyScope.js').legacyClient(new PrismaClient(),{enabled:process.env.CRM_PRODUCT_PREVIEW==='1'});
const versionArg = process.argv.find((value) => value.startsWith('--reader-version='));
const version = versionArg && versionArg.slice('--reader-version='.length);
if (!version) throw new Error('Specify --reader-version=...');

(async () => {
  const readings = await db.reading.findMany({
    where: { reader: 'understand-businesses', readerVersion: version },
    distinct: ['prospectId'], select: { prospectId: true },
  });
  const ids = readings.map((reading) => reading.prospectId);
  const [allEdited, batchEdited, fieldEdits, batchMessages] = await Promise.all([
    db.outreachMessage.findMany({
      where: { lane: 'EMAIL', editedAt: { not: null } },
      select: { id: true, openedWith: true, editedAt: true,
        prospect: { select: { name: true, nameManualValue: true } } },
      orderBy: { editedAt: 'desc' },
    }),
    db.outreachMessage.findMany({
      where: { prospectId: { in: ids }, lane: 'EMAIL', editedAt: { not: null } },
      select: {
        id: true, prospectId: true, openedWith: true, state: true,
        editedAt: true, createdAt: true, sentAt: true,
        prospect: { select: { name: true, nameManualValue: true } },
      },
      orderBy: { editedAt: 'desc' },
    }),
    db.prospectFieldEdit.findMany({
      where: { prospectId: { in: ids } },
      select: { prospectId: true, fieldName: true, correctedBy: true, correctedAt: true },
      orderBy: { correctedAt: 'desc' },
    }),
    db.outreachMessage.count({ where: { prospectId: { in: ids }, lane: 'EMAIL' } }),
  ]);
  console.log(`BATCH ${ids.length} companies, ${batchMessages} email records`);
  console.log(`HAND-EDITED EMAILS ${batchEdited.length} in batch; ${allEdited.length} across CRM`);
  for (const row of allEdited) {
    console.log(`CRM EDIT ${row.prospect.nameManualValue || row.prospect.name} | ${row.id} | ${row.openedWith || 'first'} | ${row.editedAt.toISOString()}`);
  }
  for (const row of batchEdited) {
    console.log(`EDIT ${row.prospect.nameManualValue || row.prospect.name} | ${row.id} | ${row.openedWith || 'first'} | ${row.state} | ${row.editedAt.toISOString()}`);
  }
  console.log(`HAND-CORRECTED COMPANY FIELDS ${fieldEdits.length} in batch`);
  for (const row of fieldEdits.slice(0, 30)) {
    console.log(`FIELD ${row.prospectId} | ${row.fieldName} | ${row.correctedBy} | ${row.correctedAt.toISOString()}`);
  }
})().finally(() => db.$disconnect());
