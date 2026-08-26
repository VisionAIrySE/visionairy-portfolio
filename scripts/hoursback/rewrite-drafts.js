#!/usr/bin/env node
// Bring every unsent draft up to the message as it stands now.
//
// Drafts are written once and kept, so a night of rewriting the wording left
// twenty-five messages from 3am still sitting in the screen with the old
// words in them (2026-08-26). This walks every business with an address,
// rewrites any draft Russ has not touched, and writes one for every business
// that never had one. Anything already sent, or that he has edited by hand,
// is left exactly as it is.

const { PrismaClient } = require('@prisma/client');
const L = require('../../src/hoursback/crm/lanes.js');
const { BODY, SUBJECTS } = require('../../src/hoursback/crm/firstContact.js');

async function main() {
  const db = new PrismaClient();
  try {
    // The saved copy follows the code. Changing it un-approves it, which is
    // the point: Russ reads the real words before anything goes out.
    // The editedAt column has silently vanished from the live database twice
    // (2026-08-26) after a push reported success. Fail here, loudly, rather
    // than a hundred businesses into the run.
    const col = await db.$queryRawUnsafe(
      "select column_name from information_schema.columns where table_name='OutreachMessage' and column_name='editedAt'");
    if (!col.length) throw new Error('the editedAt column is missing from the database — run: npx prisma db push');

    const t = await L.upsertTemplate(db, { subject: SUBJECTS.default, body: BODY });
    console.log(`template: version ${t.version}, ${t.approvedAt ? 'still approved' : 'needs approving again'}`);

    const people = await db.prospect.findMany({
      where: {
        doNotContact: false, repliedAt: null, emailBouncedAt: null,
        OR: [{ email: { not: null } }, { emailManualValue: { not: null } }],
      },
      select: { id: true },
      orderBy: { automationScore: 'desc' },
    });
    console.log(`${people.length} businesses reachable by email`);

    let written = 0, rewritten = 0, kept = 0, nothingToSay = 0;
    for (const { id } of people) {
      const before = await db.outreachMessage.findFirst({ where: { prospectId: id, lane: 'EMAIL' } });
      const after = await L.draftFor(db, id, 'EMAIL');
      if (!after) { nothingToSay += 1; continue; }
      if (!before) written += 1;
      else if (after.body !== before.body) rewritten += 1;
      else kept += 1;
    }
    console.log(`written fresh: ${written}`);
    console.log(`rewritten to the current wording: ${rewritten}`);
    console.log(`left alone (sent, hand-edited, or already current): ${kept}`);
    console.log(`no honest opening to use: ${nothingToSay}`);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
