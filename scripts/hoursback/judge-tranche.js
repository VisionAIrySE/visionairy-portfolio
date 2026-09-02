#!/usr/bin/env node
// Show what the last batch of reading actually produced, so it can be judged
// before the next batch runs.
//
//   node scripts/hoursback/judge-tranche.js
//   node scripts/hoursback/judge-tranche.js --since=60      (minutes)
//   node scripts/hoursback/judge-tranche.js --output docs/hoursback/tranche.md
//
// WHY THIS EXISTS. Russ, 2026-09-01: "judging every tranche of 50 for
// correctness and then pushing the results to the CRM." A run's own tally says
// how many businesses it touched. It cannot say whether what it wrote is
// right. Twice a run reported success while the results were wrong or thrown
// away, so the count is read from the DATABASE and the words are shown, never
// summarised (docs/hoursback/evidence-store.md).
//
// Nothing here writes. It only looks.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const SINCE = Number(arg('since', 90));
const SHOW = Number(arg('show', 12));
const o = process.argv.indexOf('--output');
const OUT = o > -1 ? process.argv[o + 1] : null;

const out = [];
const say = (s) => { console.log(s); out.push(s); };

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const cutoff = new Date(Date.now() - SINCE * 60000);

  const rows = await db.prospect.findMany({
    where: { siteReadAt: { gte: cutoff } },
    select: {
      id: true, name: true, trade: true, website: true, websiteManualValue: true,
      theirWork: true, selfDescription: true, address: true, email: true,
      emailStatus: true, phone: true, employeeCount: true, headcountStatus: true,
      toolsInUse: true, openRoles: true, ownerName: true, linkedInUrl: true,
      yearsInBusiness: true, separateOperations: true, automationScore: true,
      scoreEvidence: true, siteStatus: true, siteGaps: true, siteReadAt: true,
      contacts: { select: { name: true, role: true, email: true, phone: true, basedAt: true, linkedIn: true } },
    },
    orderBy: { siteReadAt: 'desc' },
  });

  say(`# What the last ${SINCE} minutes of reading produced\n`);
  say(`**${rows.length} businesses read.** Nothing below was written by this script.\n`);

  if (!rows.length) {
    say('Nothing read in that window. Widen it with --since=<minutes>.');
    if (OUT) fs.writeFileSync(OUT, out.join('\n') + '\n');
    await db.$disconnect();
    return;
  }

  // COUNTED FROM THE RECORD, NEVER FROM A RUN'S OWN TALLY.
  const has = (f) => rows.filter(f).length;
  const pct = (n) => `${n} of ${rows.length} (${Math.round((n / rows.length) * 100)}%)`;

  say('## What landed on the cards\n');
  say(`- described in their own words: ${pct(has((r) => r.theirWork))}`);
  say(`- a postal address: ${pct(has((r) => r.address))}`);
  say(`- an email address: ${pct(has((r) => r.email))}`);
  say(`- a phone number: ${pct(has((r) => r.phone))}`);
  say(`- at least one person named: ${pct(has((r) => r.contacts.length > 0))}`);
  say(`- a person with their own email: ${pct(has((r) => r.contacts.some((c) => c.email)))}`);
  say(`- a person with their own location: ${pct(has((r) => r.contacts.some((c) => c.basedAt)))}`);
  say(`- a team size the site stated: ${pct(has((r) => r.employeeCount))}`);
  say(`- software they run: ${pct(has((r) => r.toolsInUse))}`);
  say(`- who runs it: ${pct(has((r) => r.ownerName))}`);
  say(`- a company profile page: ${pct(has((r) => r.linkedInUrl))}`);
  say(`- years in business: ${pct(has((r) => r.yearsInBusiness))}`);
  say(`- a score with evidence behind it: ${pct(has((r) => r.automationScore != null && r.scoreEvidence))}`);
  say('');
  say(`- people named across the batch: ${rows.reduce((n, r) => n + r.contacts.length, 0)}`);
  say(`- could not read the site at all: ${has((r) => r.siteStatus !== 'READ')}`);
  say(`- reader said outright it could not tell something: ${has((r) => r.siteGaps)}`);
  say('');

  // THE EVIDENCE STORE, counted separately — a card can look full while the
  // words behind it were never kept. That happened on 2026-09-01 and reported
  // as a clean success.
  const ids = rows.map((r) => r.id);
  let readings = 0; let pages = 0; let withText = 0; let findings = 0;
  try {
    readings = await db.reading.count({ where: { prospectId: { in: ids } } });
    pages = await db.readingPage.count({ where: { reading: { prospectId: { in: ids } } } });
    withText = await db.readingPage.count({ where: { reading: { prospectId: { in: ids } }, text: { not: null } } });
    findings = await db.finding.count({ where: { reading: { prospectId: { in: ids } } } });
  } catch (e) { say(`_could not read the evidence store: ${e.message}_\n`); }

  say('## The words behind the facts\n');
  say(`- readings kept: ${readings} (expect about one per business read)`);
  say(`- pages kept: ${pages}`);
  say(`- **pages actually holding their text: ${withText}** — a page with no text is a page we cannot re-read`);
  say(`- findings recorded: ${findings}`);
  if (pages && withText < pages) say(`- ⚠ ${pages - withText} pages were stored WITHOUT their words.`);
  if (rows.length && readings < rows.length) say(`- ⚠ ${rows.length - readings} businesses were read but left no reading.`);
  say('');

  say(`## ${Math.min(SHOW, rows.length)} of them in full, to read rather than count\n`);
  for (const r of rows.slice(0, SHOW)) {
    const site = r.websiteManualValue || r.website || '(none)';
    say(`### ${r.name || '(no name)'} — ${r.trade || 'trade not recorded'}`);
    say(`- ${site}`);
    if (r.theirWork) say(`- what they do: ${r.theirWork}`);
    if (r.selfDescription) say(`- ${r.selfDescription}`);
    if (r.address) say(`- address: ${r.address}`);
    if (r.email) say(`- email: ${r.email} (${r.emailStatus || 'no source recorded'})`);
    if (r.phone) say(`- phone: ${r.phone}`);
    if (r.employeeCount) say(`- team: ${r.employeeCount} (${r.headcountStatus || 'no source recorded'})`);
    if (r.toolsInUse) say(`- software: ${r.toolsInUse}`);
    if (r.openRoles) say(`- office roles open: ${r.openRoles}`);
    if (r.ownerName) say(`- runs it: ${r.ownerName}`);
    if (r.yearsInBusiness) say(`- ${r.yearsInBusiness} years in business`);
    if (r.separateOperations != null) say(`- separate operations: ${r.separateOperations}`);
    say(`- score: ${r.automationScore == null ? 'none' : r.automationScore}`);
    if (r.siteGaps) say(`- could not tell: ${r.siteGaps}`);
    if (r.contacts.length) {
      say(`- ${r.contacts.length} people:`);
      for (const c of r.contacts) {
        const bits = [c.role, c.basedAt, c.email, c.phone, c.linkedIn ? 'has a profile' : null].filter(Boolean);
        say(`  - ${c.name || '(no name)'}${bits.length ? ' — ' + bits.join(' · ') : ''}`);
      }
    } else {
      say('- nobody named');
    }
    say('');
  }

  say('---\n');
  say('Judge it, then either read the next fifty or fix what is wrong first.');

  if (OUT) { fs.writeFileSync(OUT, out.join('\n') + '\n'); console.log(`\nwritten to ${OUT}`); }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
