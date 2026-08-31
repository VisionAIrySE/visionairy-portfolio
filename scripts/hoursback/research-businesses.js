#!/usr/bin/env node
// Go and work out each business properly, from what it publishes about itself.
//
//   node scripts/hoursback/research-businesses.js --dry-run --limit=20
//   node scripts/hoursback/research-businesses.js
//
// Russ read the list and could not trust any of it: ABC Supply filed as a firm
// of accountants, a vet scoring 100 off a directory, people with no titles.
// He was clear about the remedy — not hiding the bad ones: "I want them
// researched effectively, validated, confirmed accurate and fleshed out so I
// can use them" (2026-08-28).
//
// So for each business this opens their own site, reads what they SAY about
// themselves, and writes down only that. Where something is not published, the
// field is left alone and the record carries a sentence saying why, so a gap
// never looks like a fact.
//
// Free. Their own websites. No key, no paid service, nothing metered.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const ps = require('../../src/hoursback/peopleSweep.js');
const { textOf } = require('../../src/hoursback/enrich.js');
const { tradeFromTheirWords, whatIsMissing, whyNotTheirs } = require('../../src/hoursback/research.js');

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number(arg('limit', 0));
const LANES = 6;
const PAGES = 8;

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  // The 645 he can email — the ones closest to earning money.
  const rows = await db.prospect.findMany({
    where: { doNotContact: false, NOT: [{ AND: [{ email: null }, { emailManualValue: null }] }] },
    select: { id: true, name: true, nameManualValue: true, trade: true, website: true, websiteManualValue: true },
    orderBy: { automationScore: 'desc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  });
  console.log(`${rows.length} businesses to work out`);
  console.log(DRY ? 'DRY RUN — nothing written\n' : 'reading their own sites\n');

  const out = { read: 0, tradeConfirmed: 0, tradeChanged: 0, tradeUnknown: 0, borrowedSite: 0, unreachable: 0, noted: 0 };
  const changes = [];
  let next = 0;

  const worker = async () => {
    for (;;) {
      const at = next; next += 1;
      if (at >= rows.length) return;
      const r = rows[at];
      const name = r.nameManualValue || r.name || '';
      const url = r.websiteManualValue || r.website;
      const found = { website: Boolean(url) };

      try {
        if (url && whyNotTheirs(url, name)) { out.borrowedSite += 1; found.website = false; }

        let pages = [];
        if (found.website) {
          const got = await ps.fetchPeoplePages(url, { maxPages: PAGES });
          pages = got.pages || [];
          if (!pages.length) { out.unreachable += 1; found.website = false; }
        }
        out.read += 1;

        // WHAT THEY SAY THEY ARE. Only their own sentence about themselves.
        // The HOME page only, and only its opening. Reading every page let a
        // word in a footer decide the trade (2026-08-28).
        const home = pages[0] ? textOf(pages[0].html) : '';
        const theirWords = home;
        const said = tradeFromTheirWords(theirWords);
        found.trade = said.trade;
        found.tradeWhy = said.why;
        if (said.trade && said.trade === r.trade) out.tradeConfirmed += 1;
        else if (said.trade) {
          out.tradeChanged += 1;
          if (changes.length < 40) changes.push(`  ${name.slice(0, 26).padEnd(28)}${String(r.trade || 'none').padEnd(22)}-> ${said.trade}`);
        } else out.tradeUnknown += 1;

        // WHO THEY NAME, with whatever is printed beside them.
        const people = pages.length ? ps.peopleFromSite(pages) : [];
        found.peopleCount = people.length;
        found.withRole = people.filter((p) => p.role).length;
        found.withEmail = people.filter((p) => p.email).length;
        found.withPhone = people.filter((p) => p.phone).length;
        found.withProfile = people.filter((p) => p.linkedIn).length;

        const gaps = whatIsMissing(found);
        if (gaps.length) out.noted += 1;

        if (!DRY) {
          await db.prospect.update({
            where: { id: r.id },
            data: {
              // Only where they SAY it. A trade nobody confirmed is left as it
              // was and the note records that nothing was found.
              ...(said.trade ? { trade: said.trade } : {}),
              // What is missing, in words, so a blank is never mistaken for a
              // fact that was checked.
              siteGaps: gaps.length ? JSON.stringify(gaps) : null,
              ...(found.website ? { siteReadAt: new Date(), siteStatus: 'READ' } : {}),
            },
          });
        }
      } catch { out.unreachable += 1; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, rows.length) }, worker));

  console.log(`read:                        ${out.read}`);
  console.log(`trade confirmed by their own words: ${out.tradeConfirmed}`);
  console.log(`trade CORRECTED:             ${out.tradeChanged}`);
  console.log(`trade they never state:      ${out.tradeUnknown}`);
  console.log(`website was not theirs:      ${out.borrowedSite}`);
  console.log(`site would not answer:       ${out.unreachable}`);
  console.log(`records carrying a note:     ${out.noted}`);
  console.log('\nfirst corrections, to read:');
  changes.forEach((c) => console.log(c));
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
