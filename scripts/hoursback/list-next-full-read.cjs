#!/usr/bin/env node
// Read-only preview of the exact next whole-site research batch.
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const readerFailureNotes = [
  'THE READER IS OUT OF ALLOWANCE — the run stops here; this business was cut off, not read',
  'the run could not get a single answer from the reader in its first tries — stopped as broken, not as thousands of thin websites',
  'the reader answered none of the group reads',
];
(async () => {
  const rows = await db.prospect.findMany({
    where: {
      doNotContact: false,
      AND: [{ OR: [{ website: { not: null } }, { websiteManualValue: { not: null } }] }],
      NOT: [
        { AND: [{ website: null }, { websiteManualValue: null }] },
        { stage: 'NEEDS_REVIEW' },
      ],
      OR: [
        { email: { not: null } },
        { emailManualValue: { not: null } },
        { contacts: { some: { email: { not: null }, setAsideAt: null, bouncedAt: null } } },
      ],
      readings: {
        none: {
          source: 'WEBSITE', reader: 'understand-businesses',
          OR: [
            { outcome: { in: ['READ', 'NO_WEBSITE', 'UNREACHABLE'] } },
            { AND: [{ finishedAt: { not: null } }, { NOT: { note: { in: readerFailureNotes } } }] },
          ],
        },
      },
    },
    select: { id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true },
    orderBy: [
      { theirWork: { sort: 'asc', nulls: 'first' } },
      { email: { sort: 'desc', nulls: 'last' } },
      { automationScore: { sort: 'desc', nulls: 'last' } },
    ],
    take: 50,
  });
  rows.forEach((row, index) => console.log(`${index + 1}. ${row.nameManualValue || row.name} | ${row.websiteManualValue || row.website}`));
  console.log(`TOTAL ${rows.length}`);
})().finally(() => db.$disconnect());
