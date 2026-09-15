#!/usr/bin/env node
// Read-only preview of the exact next whole-site research batch.
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const { PrismaClient } = require('@prisma/client');
const R = require('../../src/hoursback/readings.js');
const db = new PrismaClient();
const readerFailureNotes = [
  'THE READER IS OUT OF ALLOWANCE — the run stops here; this business was cut off, not read',
  'the run could not get a single answer from the reader in its first tries — stopped as broken, not as thousands of thin websites',
  'the reader answered none of the group reads',
];
(async () => {
  const hasWebsite = { AND: [{ OR: [{ website: { not: null } }, { websiteManualValue: { not: null } }] }] };
  const notConcluded = { readings: { none: {
    source: R.WEBSITE, reader: 'understand-businesses',
    OR: [
      { outcome: { in: [R.READ, R.NO_WEBSITE, R.UNREACHABLE] } },
      { AND: [{ finishedAt: { not: null } }, { NOT: { note: { in: readerFailureNotes } } }] },
    ],
  } } };
  const workingBase = {
    doNotContact: false, ...hasWebsite,
    NOT: [
      { AND: [{ website: null }, { websiteManualValue: null }] },
      { stage: 'NEEDS_REVIEW' },
    ],
  };
  const queueWhere = {
    ...workingBase, ...notConcluded,
    OR: [
      { email: { not: null } },
      { emailManualValue: { not: null } },
      { contacts: { some: { email: { not: null }, setAsideAt: null, bouncedAt: null } } },
    ],
  };
  const [remainingWithEmail, remainingWorkingSites, remainingAllSites, rows] = await Promise.all([
    db.prospect.count({ where: queueWhere }),
    db.prospect.count({ where: { ...workingBase, ...notConcluded } }),
    db.prospect.count({ where: { doNotContact: false, ...hasWebsite, ...notConcluded } }),
    db.prospect.findMany({
    where: queueWhere,
    select: { id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true },
    orderBy: [
      { theirWork: { sort: 'asc', nulls: 'first' } },
      { email: { sort: 'desc', nulls: 'last' } },
      { automationScore: { sort: 'desc', nulls: 'last' } },
    ],
    take: 50,
  }),
  ]);
  rows.forEach((row, index) => console.log(`${index + 1}. ${row.nameManualValue || row.name} | ${row.websiteManualValue || row.website}`));
  console.log(`TOTAL ${rows.length}`);
  console.log(`REMAINING WITH EMAIL ${remainingWithEmail}`);
  console.log(`REMAINING IN WORKING LIST ${remainingWorkingSites}`);
  console.log(`REMAINING ACROSS ALL CRM RECORDS ${remainingAllSites}`);
})().finally(() => db.$disconnect());
