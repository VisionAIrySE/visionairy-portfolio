// Who has a letter waiting to be written, right now, with no website reading
// needed: their own site pages are already on file and no letter of theirs
// carries the current wording. Prints ids, comma-separated, nothing else.
const { PrismaClient } = require('@prisma/client');
const N = require('../../src/hoursback/crm/noticing.js');
const db = new PrismaClient();
(async () => {
  const readable = (await db.reading.groupBy({ by: ['prospectId'], where: { pages: { some: {} } } }))
    .map((r) => r.prospectId);
  const current = await db.reading.findMany({
    where: { prospectId: { in: readable }, readerVersion: N.READER_VERSION },
    select: { prospectId: true }, distinct: ['prospectId'],
  });
  const done = new Set(current.map((c) => c.prospectId));
  process.stdout.write(readable.filter((id) => !done.has(id)).join(','));
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
