#!/usr/bin/env node
// Read-only accounting for the current OpenRouter whole-site batch.
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const versionArg = process.argv.find((value) => value.startsWith('--reader-version='));
const READER_VERSION = versionArg ? versionArg.slice('--reader-version='.length) : '2026-09-14-whole-site-openrouter';
(async () => {
  const rows = await db.reading.findMany({
    where: { reader: 'understand-businesses', readerVersion: READER_VERSION },
    select: {
      prospectId: true, outcome: true, note: true, startedAt: true, finishedAt: true,
      prospect: { select: { name: true, nameManualValue: true } },
      _count: { select: { pages: true, findings: true } },
    },
    orderBy: { startedAt: 'asc' },
  });
  const latest = new Map();
  for (const row of rows) latest.set(row.prospectId, row);
  for (const row of latest.values()) {
    console.log(`${row.prospect.nameManualValue || row.prospect.name} | ${row.prospectId} | ${row.outcome} | ${row._count.pages} pages | ${row._count.findings} findings | ${row.note || ''}`);
  }
  const meaningful = [...latest.values()].filter((row) => !/reader is out of allowance|could not get a single answer|reader answered none/i.test(row.note || ''));
  const pointerOnly = await db.reading.findMany({
    where: {
      reader: 'understand-businesses', readerVersion: READER_VERSION, outcome: 'read',
      pages: { some: { sameAs: { not: null } }, none: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
    },
    select: { prospectId: true, prospect: { select: { name: true, nameManualValue: true } } },
  });
  for (const row of pointerOnly) console.log(`POINTER-ONLY ${row.prospect.nameManualValue || row.prospect.name} | ${row.prospectId}`);
  console.log(`EVENTS ${rows.length}`);
  console.log(`UNIQUE ${latest.size}`);
  console.log(`MEANINGFUL ${meaningful.length}`);
})().finally(() => db.$disconnect());
