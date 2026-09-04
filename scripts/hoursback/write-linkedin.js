#!/usr/bin/env node
// Write the LinkedIn note for every business that can take one.
//
//   node scripts/hoursback/write-linkedin.js --look
//   node scripts/hoursback/write-linkedin.js
//
// The email rewriter next door does emails and only emails. On 2026-09-03 every
// message was wiped and rewritten, and 1,059 LinkedIn notes were deleted and
// never written back, because nothing wrote them. This is that missing half.
//
// Same rules as the email: a note Russ has edited by hand or already sent is
// never touched, a business marked never-contact gets nothing, and the note is
// built through the ONE existing path — lanes.draftFor — so there is no second
// way of writing a message.

const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
const { PrismaClient } = require('@prisma/client');
const L = require('../../src/hoursback/crm/lanes.js');
const C = require('../../src/hoursback/crm/campaign.js');

const LOOK = process.argv.includes('--look');
const arg = (n, d) => {
  const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : d;
};
const LIMIT = Number(arg('limit', 0)) || 0;

async function main() {
  const db = new PrismaClient();
  try {
    await C.loadHisWordings(db);
    // ONLY THE ONES A NOTE CAN ACTUALLY REACH. The first run walked all 32,739
    // businesses off the state register, almost none of which have anybody
    // named, and spent fourteen minutes to write 418. A LinkedIn note is
    // addressed to a PERSON, so the list is businesses where somebody is
    // named — by Russ, by their own site, or among the people we found.
    const people = await db.prospect.findMany({
      where: {
        doNotContact: false,
        repliedAt: null,
        // THE WORKED LIST, not the state register. 31,318 of the 32,739
        // records were screened out into NEEDS_REVIEW: no email, no phone,
        // mostly no website, and Russ is not working them. Nearly all of them
        // DO carry an owner's name off the register, which is why filtering on
        // "somebody is named" changed nothing.
        NOT: { stage: 'NEEDS_REVIEW' },
        OR: [
          { contactName: { not: null } },
          { ownerName: { not: null } },
          { contacts: { some: { setAsideAt: null, name: { not: null } } } },
        ],
      },
      select: { id: true, name: true, nameManualValue: true },
      ...(LIMIT ? { take: LIMIT } : {}),
    });
    console.log(`${people.length} businesses${LOOK ? ' — LOOKING ONLY, nothing will be written' : ''}`);

    let written = 0; let already = 0; let needsAPerson = 0; let nothing = 0;
    for (const p of people) {
      try {
        if (LOOK) { written += 1; continue; }
        const made = await L.draftFor(db, p.id, 'LINKEDIN');
        if (made) written += 1; else nothing += 1;
      } catch (e) {
        // A LinkedIn note is addressed to a PERSON. A business where nobody is
        // named cannot have one, and that is an answer, not a failure.
        if (e && e.code === 'LINKEDIN_NEEDS_A_PERSON') needsAPerson += 1;
        else nothing += 1;
      }
      if ((written + nothing + needsAPerson) % 200 === 0) {
        console.log(`  ${written} written so far`);
      }
    }
    console.log(`\nwritten:                       ${written}`);
    console.log(`nobody named to write to:      ${needsAPerson}`);
    console.log(`nothing honest to open with:   ${nothing}`);
    console.log(`already current, left alone:   ${already}`);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
