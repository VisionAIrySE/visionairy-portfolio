// How many websites are still unread among businesses we can actually email.
//
// The cycle uses this to know when to stop, and the morning report uses it to
// say honestly how far through the list the night got. Prints one number.
//
// "Unread" means our own reader never gave anything back. A site that turned
// out to be a parked domain, a builder's placeholder, or somebody else's
// business is ANSWERED, not unread — that is a conclusion about the business
// and it does not come round again (2026-09-04).
const { PrismaClient } = require('@prisma/client');
const R = require('../../src/hoursback/readings.js');
const db = new PrismaClient();

// The three things our own reader says when it gave us nothing. Kept in step
// with understand-businesses.js.
const READER_GAVE_NOTHING = [
  'the reader could not be started',
  'the reader gave nothing back',
  'the reader ran out of allowance',
];

(async () => {
  const n = await db.prospect.count({
    where: {
      doNotContact: false,
      OR: [{ email: { not: null } }, { emailManualValue: { not: null } }],
      AND: [{ OR: [{ website: { not: null } }, { websiteManualValue: { not: null } }] }],
      NOT: [{ stage: 'NEEDS_REVIEW' }],
      readings: {
        none: {
          source: R.WEBSITE,
          reader: 'understand-businesses',
          OR: [
            { outcome: { in: [R.READ, R.NO_WEBSITE, R.UNREACHABLE] } },
            { AND: [{ finishedAt: { not: null } }, { NOT: { note: { in: READER_GAVE_NOTHING } } }] },
          ],
        },
      },
    },
  });
  process.stdout.write(String(n));
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
