#!/usr/bin/env node
// What actually landed on the records — counted from the records themselves.
//
//   node scripts/hoursback/what-landed.js
//   node scripts/hoursback/what-landed.js --since=2      (last 2 hours only)
//
// Russ, 2026-08-29, after a run found 887 people, counted them, reported them
// and wrote none of them down: "your job was to mine the website for content
// and contacts and you threw away the contacts? how is that possible."
//
// It was possible because every check asked the reader how it had gone. This
// asks the RECORDS. Nothing here reads a tally, a log or a return value —
// every number below is a query. A run is only a success when this says so.
//
// Spec: .xf/specs/2026-08-29-website-read.md

const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));

const arg = (n, d) => {
  const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : d;
};
const SINCE_HOURS = Number(arg('since', 0));

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const noSite = { AND: [{ website: null }, { websiteManualValue: null }] };
  const where = {
    doNotContact: false,
    NOT: [{ stage: 'NEEDS_REVIEW' }, noSite],
    ...(SINCE_HOURS ? { siteReadAt: { gte: new Date(Date.now() - SINCE_HOURS * 3600000) } } : {}),
  };

  const rows = await db.prospect.findMany({
    where,
    select: {
      id: true, name: true, nameManualValue: true, trade: true, theirWork: true,
      email: true, emailManualValue: true, phone: true, siteGaps: true, siteStatus: true,
      contacts: { select: { name: true, role: true, email: true, linkedIn: true } },
    },
  });

  const has = (n) => `${String(n).padStart(5)}  ${(n / rows.length * 100).toFixed(0).padStart(3)}%`;
  const named = (r) => r.contacts.filter((c) => c.name);

  console.log(`\nWHAT IS ON THE RECORDS${SINCE_HOURS ? `, read in the last ${SINCE_HOURS} hours` : ''}`);
  console.log(`${rows.length} businesses with a website on your list\n`);

  console.log('  what they are');
  console.log(`    a trade                ${has(rows.filter((r) => r.trade).length)}`);
  console.log(`    a description          ${has(rows.filter((r) => r.theirWork).length)}`);
  console.log('  how to reach them');
  console.log(`    an inbox               ${has(rows.filter((r) => r.email || r.emailManualValue).length)}`);
  console.log(`    a phone                ${has(rows.filter((r) => r.phone).length)}`);
  console.log('  who works there');
  console.log(`    at least one person    ${has(rows.filter((r) => named(r).length).length)}`);
  console.log(`    somebody with a title  ${has(rows.filter((r) => named(r).some((c) => c.role)).length)}`);
  console.log(`    somebody you can write ${has(rows.filter((r) => named(r).some((c) => c.email)).length)}`);
  console.log(`    a profile link         ${has(rows.filter((r) => named(r).some((c) => c.linkedIn)).length)}`);
  console.log('  honesty');
  console.log(`    says what it cannot    ${has(rows.filter((r) => { try { return JSON.parse(r.siteGaps || '[]').length; } catch { return false; } }).length)}`);

  // THE FAILURE, counted. A record that was read, holds nobody, and offers no
  // sentence explaining why. Not "the reader found nothing" — the record is
  // silent about its own emptiness, which is the state nobody can act on.
  const readRows = rows.filter((r) => r.siteStatus === 'READ');
  const emptyAndSilent = readRows.filter((r) => {
    if (named(r).length) return false;
    let g = ''; try { g = JSON.parse(r.siteGaps || '[]')[0] || ''; } catch { g = ''; }
    return !/staff|individual|name|team|personnel|employee|owner/i.test(g);
  });

  console.log(`\n  READ, NOBODY ON FILE, NO EXPLANATION:  ${emptyAndSilent.length}`);
  if (emptyAndSilent.length) {
    for (const r of emptyAndSilent.slice(0, 6)) {
      console.log(`      ${String(r.nameManualValue || r.name || '').slice(0, 44)}`);
    }
    if (emptyAndSilent.length > 6) console.log(`      … and ${emptyAndSilent.length - 6} more`);
  }

  // The 86 addresses emptied as malformed, and whether they came back.
  const blank = await db.prospect.count({
    where: { doNotContact: false, NOT: [{ stage: 'NEEDS_REVIEW' }, noSite],
      AND: [{ email: null }, { emailManualValue: null }], siteStatus: 'READ' },
  });
  console.log(`\n  read but still with no inbox at all:   ${blank}`);

  const verdict = emptyAndSilent.length === 0;
  console.log(`\n  ${verdict ? 'PASS' : 'FAIL'} — ${verdict
    ? 'every business that was read either has people, or says in words why it has none'
    : `${emptyAndSilent.length} businesses were read and can tell you nothing about who works there`}\n`);

  await db.$disconnect();
  process.exit(verdict ? 0 : 1);
})().catch((e) => { console.error('failed:', e.message); process.exit(2); });
