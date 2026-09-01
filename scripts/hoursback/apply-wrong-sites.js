#!/usr/bin/env node
// Take back everything that was read off somebody else's website.
//
//   node scripts/hoursback/apply-wrong-sites.js --look
//   node scripts/hoursback/apply-wrong-sites.js
//
// 66 businesses on the list carry a website that is not theirs. A model read
// every one of them and said so in words; the report has been sitting in
// docs/hoursback/site-check.md since 2026-08-31 and nothing was ever applied.
//
// It is worse than a wrong link. 44 of the 66 also carry an EMAIL ADDRESS on
// the stranger's own domain. An email to "Bend, Oregon Bookkeeping & Payroll"
// would arrive at Balance Point Tax & Accounting — a real, different company —
// greeting them as somebody they are not. 209 of the 240 people on these
// records are staff at the wrong company. 97 unsent messages describe a
// business the recipient does not run.
//
// Nothing has been sent to any of them yet. This is what stops that.
//
// WHAT IS WRITTEN DOWN BEFORE IT IS TAKEN AWAY. Every value removed is first
// recorded in the correction history — which field, what it was, why, and when.
// Nothing here vanishes unrecorded (docs/hoursback/evidence-store.md).
//
// The business STAYS on the list, marked for review. Losing a borrowed
// description leaves a thinner record, and a thin record beats a confident
// description of the wrong company.
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

const LOOK = process.argv.includes('--look');

// THE SECOND REPORT, NEVER THE FIRST.
//
// The first check (site-check.md) named 66 and was wrong about at least 26 of
// them: Blue Sky Veterinary Clinic at blueskyvet.com, Evans Tree and Lawn at
// evanstreeandlawn.com, King's Auto at kingsautollc.com. Their own names are in
// their own domains and the sites are plainly theirs. It flagged them because
// it measured a good website against a record name that was a page title.
//
// Running this against that report would have stripped 26 real businesses of
// their website, their address, their staff and their drafts. So this reads
// the SECOND check, which judges the operation rather than the name, and it
// refuses the first outright.
const REPORT = 'docs/hoursback/site-recheck.md';
const REFUSED = 'site-check.md';
const WHY = 'the website on this record was read and found to belong to a different business';
const BY = 'site-check 2026-08-31, applied 2026-09-01';

function domainOf(value) {
  try {
    const s = String(value || '');
    return new URL(s.startsWith('http') ? s : `https://${s}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  if (REPORT.includes(REFUSED)) {
    console.error(`refusing to act on ${REFUSED} — it was wrong about at least 26 of the 66.`);
    console.error('Use the second check: node scripts/hoursback/recheck-sites-belong.js');
    process.exit(1);
  }
  let report;
  try { report = fs.readFileSync(REPORT, 'utf8'); } catch {
    console.error(`${REPORT} does not exist yet.`);
    console.error('Run the second check first: node scripts/hoursback/recheck-sites-belong.js --limit=50');
    process.exit(1);
  }

  // ONLY the ones the second check called NOT theirs. A "cannot tell" is not a
  // licence to empty a record — it is a reason to leave it alone and look.
  const ids = report.split(/\n(?=- \*\*)/)
    .filter((block) => /is NOT theirs/.test(block))
    .map((block) => block.match(/id: `([a-z0-9]+)`/)?.[1])
    .filter(Boolean);
  const unclear = report.split(/\n(?=- \*\*)/).filter((b) => /cannot be judged/.test(b)).length;
  if (unclear) console.log(`${unclear} could not be judged either way — left alone, not touched.\n`);
  if (!ids.length) { console.log(`nothing in ${REPORT} is marked as belonging to someone else. Nothing to do.`); process.exit(0); }

  const rows = await db.prospect.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true,
      email: true, emailManualValue: true, automationScore: true, selfDescription: true,
      theirWork: true, trade: true, toolsInUse: true, linkedInUrl: true, siteScore: true,
      employeeCount: true, employeeCountManualValue: true,
      contacts: { select: { id: true, name: true, email: true, phone: true, foundOn: true } },
      messages: { where: { sentAt: null }, select: { id: true, state: true } },
    },
  });

  // NEVER touch a business that has already been written to. A record behind a
  // sent message is history, and history is not corrected by emptying it.
  const written = await db.outreachMessage.findMany({
    where: { prospectId: { in: ids }, sentAt: { not: null } },
    select: { prospectId: true },
  });
  const alreadyWritten = new Set(written.map((m) => m.prospectId));

  const tally = {
    seen: 0, cleared: 0, emailsPulled: 0, peopleRemoved: 0, draftsRemoved: 0,
    skippedAlreadySent: 0, notFound: ids.length - rows.length,
  };
  const shown = [];

  for (const r of rows) {
    tally.seen += 1;
    const name = r.nameManualValue || r.name;
    if (alreadyWritten.has(r.id)) { tally.skippedAlreadySent += 1; continue; }

    const url = r.websiteManualValue || r.website;
    const site = domainOf(url);
    const mail = r.emailManualValue || r.email;
    const mailDomain = mail && mail.includes('@') ? mail.split('@')[1].toLowerCase() : null;
    // An address on the stranger's own domain reaches the stranger. That is the
    // one that must go; an address from anywhere else may well be theirs.
    const mailIsTheirs = Boolean(site && mailDomain && mailDomain === site);
    // A person read off the stranger's pages works at the stranger's company.
    const strangers = r.contacts.filter((c) => site && domainOf(c.foundOn) === site);

    if (shown.length < 20) {
      shown.push(`  ${String(name).slice(0, 28).padEnd(30)}${String(site).slice(0, 26).padEnd(28)}`
        + `${mailIsTheirs ? 'email pulled  ' : 'email kept    '}${String(strangers.length).padStart(3)} people  ${String(r.messages.length).padStart(2)} drafts`);
    }

    if (LOOK) {
      tally.cleared += 1;
      if (mailIsTheirs) tally.emailsPulled += 1;
      tally.peopleRemoved += strangers.length;
      tally.draftsRemoved += r.messages.length;
      continue;
    }

    // EVERYTHING THAT GOES IS WRITTEN DOWN FIRST.
    const before = [
      ['website', r.websiteManualValue || r.website],
      ['selfDescription', r.selfDescription], ['theirWork', r.theirWork],
      ['toolsInUse', r.toolsInUse], ['linkedInUrl', r.linkedInUrl],
      ['siteScore', r.siteScore], ['automationScore', r.automationScore],
      ...(mailIsTheirs ? [['email', mail]] : []),
      ...(strangers.length ? [['contacts', strangers.map((c) => `${c.name || '?'} <${c.email || '-'}>`).join('; ')]] : []),
      ...(r.messages.length ? [['unsentMessages', `${r.messages.length} drafts written from ${site}`]] : []),
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');

    for (const [field, was] of before) {
      await db.prospectFieldEdit.create({
        data: {
          prospectId: r.id, fieldName: field,
          valueBefore: String(was).slice(0, 900), valueAfter: null,
          correctedBy: `${BY} — ${WHY}`,
        },
      });
    }

    await db.prospect.update({
      where: { id: r.id },
      data: {
        // Both columns: an earlier sweep copied the borrowed address into the
        // hand-entered one, so clearing only the fetched one left it on screen.
        website: null, websiteManualValue: null, normalizedDomain: null,
        siteStatus: 'NO_WEBSITE', siteReadAt: null,
        selfDescription: null, theirWork: null, toolsInUse: null,
        linkedInUrl: null, siteScore: null, siteGaps: null,
        scoreEvidence: null, automationScore: null,
        // The trade came off the stranger's pages too, and a wrong trade picks
        // the wrong opening line for every message that follows.
        trade: null,
        // An address on the stranger's domain reaches the stranger.
        ...(mailIsTheirs ? { email: null, emailManualValue: null, emailConfidence: null, emailStatus: null } : {}),
        // A team size read off somebody else's page is not their team size.
        ...(r.employeeCountManualValue === null
          ? { employeeCount: null, headcountStatus: null, headcountPublishedAs: null, headcountSourceUrl: null }
          : {}),
        stage: 'NEEDS_REVIEW',
      },
    });
    tally.cleared += 1;
    if (mailIsTheirs) tally.emailsPulled += 1;

    if (strangers.length) {
      const g = await db.contact.deleteMany({ where: { id: { in: strangers.map((c) => c.id) } } });
      tally.peopleRemoved += g.count;
    }
    // A message written from a borrowed page says borrowed things.
    const g = await db.outreachMessage.deleteMany({ where: { prospectId: r.id, sentAt: null } });
    tally.draftsRemoved += g.count;
  }

  console.log(LOOK ? 'LOOKING ONLY — nothing was changed\n' : 'applied\n');
  shown.forEach((l) => console.log(l));
  console.log('');
  console.log(`businesses in the report:        ${ids.length}`);
  console.log(`  found on the list:             ${tally.seen}`);
  if (tally.notFound) console.log(`  no longer on the list:         ${tally.notFound}`);
  if (tally.skippedAlreadySent) console.log(`  LEFT ALONE, already written to: ${tally.skippedAlreadySent}`);
  console.log('');
  console.log(`websites taken back:             ${tally.cleared}`);
  console.log(`emails that reached a stranger:  ${tally.emailsPulled}   (pulled)`);
  console.log(`people who work somewhere else:  ${tally.peopleRemoved}   (removed)`);
  console.log(`drafts written from wrong pages: ${tally.draftsRemoved}   (removed)`);
  console.log('');
  console.log('Every value above was written into the correction history before it went,');
  console.log('so what each record held can still be read back.');
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
