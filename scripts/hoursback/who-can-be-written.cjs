// Who has a letter waiting to be written, right now, with no website reading
// needed. THREE conditions, all of them required:
//
//   1. their own site pages are on file, so there is something true to say;
//   2. there is an EMAIL ADDRESS, so there is somewhere to send it;
//   3. no letter of theirs already carries the current wording.
//
// Condition 2 is the one that was missing on 2026-09-05. Without it the list
// came to 213, of which 113 had nowhere to send to — an hour of work produced
// five sendable letters and the rest became sentences with no letter to live
// in. Nothing goes back for them later; that code does not exist.
//
// Prints ids, comma-separated, and nothing else.
const { PrismaClient } = require('@prisma/client');
const N = require('../../src/hoursback/crm/noticing.js');
const db = new PrismaClient();
(async () => {
  const readable = (await db.reading.groupBy({ by: ['prospectId'], where: { pages: { some: {} } } }))
    .map((r) => r.prospectId);

  // Somewhere to send it. The hand-typed column counts as much as the found one.
  const canBeSentTo = [];
  for (let i = 0; i < readable.length; i += 200) {
    const part = await db.prospect.findMany({
      where: {
        id: { in: readable.slice(i, i + 200) },
        doNotContact: false,
        OR: [{ email: { not: null } }, { emailManualValue: { not: null } }],
      },
      select: { id: true },
    });
    canBeSentTo.push(...part.map((p) => p.id));
  }

  const current = await db.reading.findMany({
    where: { prospectId: { in: canBeSentTo }, readerVersion: N.READER_VERSION },
    select: { prospectId: true }, distinct: ['prospectId'],
  });
  const done = new Set(current.map((c) => c.prospectId));
  process.stdout.write(canBeSentTo.filter((id) => !done.has(id)).join(','));
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
