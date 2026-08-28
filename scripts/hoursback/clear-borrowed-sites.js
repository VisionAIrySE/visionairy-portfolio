#!/usr/bin/env node
// Take away a website that was never theirs.
//
//   node scripts/hoursback/clear-borrowed-sites.js --dry-run
//   node scripts/hoursback/clear-borrowed-sites.js
//
// Animal Eye Specialists scored 100 with a team of 8 and not one address. The
// "website" was allvetnearme.com/animal-eye-specialists-llc/ — a directory.
// Their name, their words and their team size had all been read off a page
// somebody else wrote about them (Russ, 2026-08-28: "The website is an
// aggregator of vet companies. They don't have an actual website").
//
// The website hunt checked that a page NAMES the business. A directory always
// names the business. So it could never catch this.
//
// What this does: clears the borrowed address, and with it the score, the team
// size and the words that were read off it — because every one of those came
// from a page that was not theirs. The business stays on the list and is
// marked for a look.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const { whyNotTheirs } = require('../../src/hoursback/notTheirSite.js');
const DRY = process.argv.includes('--dry-run');

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const rows = await db.prospect.findMany({
    where: { doNotContact: false, NOT: [{ AND: [{ website: null }, { websiteManualValue: null }] }] },
    select: {
      id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true,
      automationScore: true, employeeCount: true, employeeCountManualValue: true,
    },
  });

  let cleared = 0; let messagesGone = 0;
  const shown = [];

  for (const r of rows) {
    const url = r.websiteManualValue || r.website;
    const why = whyNotTheirs(url, r.nameManualValue || r.name);
    if (!why) continue;
    cleared += 1;
    if (shown.length < 25) {
      shown.push(`  ${String(r.nameManualValue || r.name).slice(0, 26).padEnd(28)}score ${String(r.automationScore ?? '–').padEnd(5)}${String(url).slice(0, 42)}`);
    }
    if (!DRY) {
      await db.prospect.update({
        where: { id: r.id },
        data: {
          // Both columns. The borrowed address had been copied into the
          // hand-entered one by an earlier sweep, so clearing only the fetched
          // one left it showing on the card (2026-08-28).
          website: null, websiteManualValue: null, normalizedDomain: null,
          siteStatus: 'NO_WEBSITE', siteReadAt: null,
          selfDescription: null, theirWork: null, toolsInUse: null,
          linkedInUrl: null, siteScore: null, siteGaps: null,
          scoreEvidence: null, automationScore: null,
          // A team size read off somebody else's page is not their team size.
          ...(r.employeeCountManualValue === null ? { employeeCount: null, headcountStatus: null, headcountPublishedAs: null, headcountSourceUrl: null } : {}),
          stage: 'NEEDS_REVIEW',
        },
      });
      // A message written from a borrowed page says borrowed things.
      const g = await db.outreachMessage.deleteMany({ where: { prospectId: r.id, sentAt: null } });
      messagesGone += g.count;
    }
  }

  console.log(DRY ? 'DRY RUN — nothing changed\n' : 'changed\n');
  console.log(`websites that were never theirs:  ${cleared}`);
  console.log(`messages written from them, gone: ${messagesGone}`);
  console.log('');
  shown.forEach((l) => console.log(l));
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
