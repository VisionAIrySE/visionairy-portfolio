#!/usr/bin/env node
// Hold every score under what it actually takes to reach the business.
//
//   node scripts/hoursback/apply-reachability.js --look
//   node scripts/hoursback/apply-reachability.js
//
// Russ, 2026-08-28, looking at Kernutt Stokes sitting at the top of his list:
// "you also need to rescore appropriately. No way to contact except phone is
// not a 100."
//
// The 100 was not wrong about the business. Kernutt Stokes is a fifteen-person
// accounting firm with something like sixty-six hours a week of repetitive
// office work in it — genuinely one of the best prospects on the list. What
// the 100 never said is that there is no website on file, no address and no
// phone number. There is no way in at all.
//
// One number was answering two questions that pull in opposite directions:
// how much could we save them, and can we get to them. This holds the first
// under a ceiling set by the second, and writes down both, so the card can say
// "great fit, but the only way in is the phone" — which is the truth, and is
// something a person can act on.
//
// Reads nothing and costs nothing. Every fact it needs is already on file.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const { howToReachThem, callOrderScore } = require('../../src/hoursback/reachable.js');
const { SHARED_MAILBOX } = require('../../src/hoursback/understand.js');

const LOOK = process.argv.includes('--look');
const BATCH = 500;

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const total = await db.prospect.count({ where: { doNotContact: false } });
  console.log(`${total} businesses on the list`);
  console.log(LOOK ? 'LOOKING ONLY — nothing will be written\n' : 'holding scores under what it takes to reach them\n');

  const tally = { seen: 0, held: 0, unchanged: 0, byRoute: {} };
  const biggestFalls = [];
  let cursor = null;

  for (;;) {
    const page = await db.prospect.findMany({
      where: { doNotContact: false },
      select: {
        id: true, name: true, nameManualValue: true, phone: true, phoneManualValue: true,
        website: true, websiteManualValue: true, email: true, emailManualValue: true,
        automationScore: true, scoreEvidence: true,
        contacts: { select: { email: true, phone: true, linkedIn: true, name: true } },
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!page.length) break;
    cursor = page[page.length - 1].id;

    for (const r of page) {
      tally.seen += 1;
      const businessEmail = r.emailManualValue || r.email;
      // A person's own address is the thing that makes a business workable.
      // A general inbox on the business record is a way in, but a weaker one,
      // so it must not be counted as though somebody named will read it.
      // BOTH. A row carrying an address and no name is not a named person you
      // can write to — it is a mailbox. Counting it as a person put businesses
      // at the top of the list that nobody could actually address (2026-08-28).
      const peopleWithEmail = r.contacts
        .filter((c) => c.name && c.email && !SHARED_MAILBOX.test(c.email)).length;
      const found = {
        peopleWithEmail,
        peopleNamed: r.contacts.filter((c) => c.name).length,
        peopleWithPhone: r.contacts.filter((c) => c.phone).length,
        peopleWithProfile: r.contacts.filter((c) => c.linkedIn).length,
        sharedEmail: businessEmail || null,
        // Never read on this pass, so never claimed. A business whose only way
        // in is a form it has not been checked for is treated as having no
        // written route, which is the cautious reading and the honest one.
        contactForm: false,
        website: Boolean(r.websiteManualValue || r.website),
        phone: Boolean(r.phoneManualValue || r.phone),
      };
      const reach = howToReachThem(found);
      tally.byRoute[reach.route] = (tally.byRoute[reach.route] || 0) + 1;

      if (r.automationScore == null) { tally.unchanged += 1; continue; }
      const ranked = callOrderScore(r.automationScore, reach);
      if (ranked === r.automationScore) { tally.unchanged += 1; continue; }
      tally.held += 1;

      const fall = r.automationScore - ranked;
      if (biggestFalls.length < 20 || fall > biggestFalls[biggestFalls.length - 1].fall) {
        biggestFalls.push({
          fall, name: r.nameManualValue || r.name, was: r.automationScore, now: ranked, why: reach.inWords,
        });
        biggestFalls.sort((a, b) => b.fall - a.fall);
        biggestFalls.length = Math.min(biggestFalls.length, 20);
      }

      if (!LOOK) {
        // The opportunity figure is kept whole inside the evidence, so nothing
        // is lost and the card can show both numbers.
        let evidence = [];
        try { evidence = JSON.parse(r.scoreEvidence || '[]'); } catch { evidence = []; }
        const kept = Array.isArray(evidence) ? evidence.filter((e) => e && e.signal !== 'held_by_reach') : [];
        kept.push({
          signal: 'held_by_reach',
          label: `Held at ${ranked} — ${reach.inWords.toLowerCase()}`,
          weight: -(fall),
          url: null,
          quote: `the fit is ${r.automationScore}; getting to them is what holds it down`,
        });
        await db.prospect.update({
          where: { id: r.id },
          data: { automationScore: ranked, scoreEvidence: JSON.stringify(kept) },
        });
      }
    }
    process.stdout.write(`\r  ${tally.seen} of ${total}   held down: ${tally.held}   `);
  }

  console.log('\n');
  console.log('how the list can be reached:');
  for (const [route, n] of Object.entries(tally.byRoute).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${route.replace(/_/g, ' ').padEnd(22)}${n}`);
  }
  console.log('');
  console.log(`scores held down:  ${tally.held}`);
  console.log(`left as they were: ${tally.unchanged}`);
  console.log('\nthe biggest falls — good businesses you cannot reach:');
  for (const b of biggestFalls) {
    console.log(`  ${String(b.was).padStart(3)} -> ${String(b.now).padStart(3)}   ${String(b.name).slice(0, 34).padEnd(36)}${b.why}`);
  }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
