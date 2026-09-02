#!/usr/bin/env node
// Read the sites a plain fetch cannot read — through a real browser.
//
//   node scripts/hoursback/read-blocked-sites.js --look --limit=5
//   node scripts/hoursback/read-blocked-sites.js --limit=50
//   node scripts/hoursback/read-blocked-sites.js --ids=abc123,def456
//
// --look crawls and reports and writes nothing.
//
// WHO THIS VISITS. Established 2026-09-01: about one site in five returns zero
// readable words to an ordinary fetch — not script-rendered sites, but hosts
// serving a bot-challenge page (SiteGround sgcaptcha and similar) in place of
// the site. A plain fetch can never pass it; a real browser can (proven:
// deschutesheating.com, 0 characters -> 2,963 under Playwright chromium).
//
// The list comes from the EVIDENCE STORE, not from a guess: a business whose
// most recent website reading either ended UNREACHABLE saying the site
// published no readable words, or kept pages that are all empty. Nothing else
// is touched — a browser is slow and heavy, and it never runs for a site an
// ordinary fetch can read (each candidate is probed once, first, to be sure).
//
// HOW A VISIT WORKS: exactly like understand-businesses.js, with the browser
// standing in for fetch. Same crawl bounds (they ARE peopleSweep's — imported,
// not copied), same group read through the same LOCAL reader, same
// recordGroupedRead, same writeItDown. There is deliberately NO second way of
// writing to the record: this script only opens the door differently.
//
// COST. Every model call leaves through askTheReader() — the local claude
// login, Haiku. No OpenRouter, no paid call. Fifty businesses a batch, the
// standing order of 2026-08-29, held in code below.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

// The main reader's own pieces — required, never re-implemented. Importing it
// is safe: it carries a require.main guard, so no second pass starts here.
const {
  askTheReader, writeItDown, hasContactForm, opportunityFromTheRead, MODEL,
} = require('./understand-businesses.js');
const {
  crawlWithBrowser, ordinaryFetchCanRead, closeSharedBrowser, MAX_BROWSER_PAGES_OPEN,
} = require('../../src/hoursback/browserRead.js');
const {
  keepOnlyWhatWasRead, readSiteInGroups, makeFlightController, mergedUnderstood, PURPOSES,
} = require('../../src/hoursback/understand.js');
const { whyNotTheirs } = require('../../src/hoursback/notTheirSite.js');
const { howToReachThem, callOrderScore } = require('../../src/hoursback/reachable.js');
const { recordGroupedRead } = require('../../src/hoursback/recordTheRead.js');
const R = require('../../src/hoursback/readings.js');
const { detectedTools } = require('../../src/hoursback/siteRead.js');

// Its own name and version on every reading, so a bad browser batch can be
// found and retired by the reader that made it — never by guessing at dates,
// and never mistaken for the ordinary reader's work.
const READER = 'read-blocked-sites';
const READER_VERSION = '2026-09-01-browser';

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const LOOK = process.argv.includes('--look');
const LIMIT = Number(arg('limit', 0));
const IDS = String(arg('ids', '')).split(',').map((s) => s.trim()).filter(Boolean);

// --- the ceilings, in code, before anything runs ----------------------------
//
// FIFTY SITES A BATCH. The standing order (Russ, 2026-08-29, reaffirmed
// 2026-09-01). However many qualify or are asked for, no run touches more.
const BATCH_OF_SITES = 50;

// How long one business's model reads may take in total, after the crawl's
// own two-minute limit inside crawlWholeSite. A visit that runs out is KEPT
// and marked partial.
const VISIT_READ_BUDGET_MS = 12 * 60000;

// ---------------------------------------------------------------------------
// Which businesses the browser is for — from the evidence store, not a guess.
//
// The most recent website reading per business, and it qualifies when EITHER
// it ended UNREACHABLE saying the site published no readable words, OR every
// page it kept has empty text (text '' means "opened, published nothing";
// text null is a pointer at real words already held and does NOT count).
async function businessesWhoseSiteGaveNoWords(db) {
  const latest = await db.reading.findMany({
    where: { source: R.WEBSITE },
    orderBy: [{ prospectId: 'asc' }, { startedAt: 'desc' }],
    distinct: ['prospectId'],
    select: {
      id: true, prospectId: true, outcome: true, note: true,
      _count: { select: { pages: true } },
      pages: { where: { NOT: { text: '' } }, select: { id: true }, take: 1 },
    },
  });
  const ids = [];
  for (const reading of latest) {
    const saidNoWords = reading.outcome === R.UNREACHABLE
      && /no readable words/i.test(reading.note || '');
    const allPagesEmpty = reading._count.pages > 0 && reading.pages.length === 0;
    if (saidNoWords || allPagesEmpty) ids.push(reading.prospectId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// ONE VISIT to one blocked business — visitOneBusiness's flow with the
// browser opening the pages. One startReading(), one keepPage() per fetched
// page (skipped and challenge-stuck pages INCLUDED), record() through
// recordGroupedRead, writeItDown for the record, one finishReading() on EVERY
// path. No skip-if-unchanged guard, no early return that would keep a page
// from being stored or a finding from being recorded.
async function visitWithBrowser(db, r, deps = {}) {
  const askReader = deps.askTheReader || askTheReader;
  const controller = deps.controller || makeFlightController();
  const look = deps.look === undefined ? LOOK : deps.look;
  const crawlImpl = deps.crawlWithBrowser || crawlWithBrowser;
  const probeImpl = deps.ordinaryFetchCanRead || ordinaryFetchCanRead;
  const name = r.nameManualValue || r.name || '';
  const url = r.websiteManualValue || r.website;

  const visit = {
    name, url, outcome: null, fetched: 0, failures: 0, skipped: 0,
    byPurpose: {}, modelCalls: 0, partial: false, concurrency: null,
    understood: null, reach: null, ranked: null, found: null, opportunity: null,
    error: null, wordsRecovered: 0, challengesStuck: 0,
  };

  if (whyNotTheirs(url, name)) { visit.outcome = 'not_their_site'; return visit; }

  // THE GUARD, before anything heavy and before a reading is opened: a site
  // an ordinary fetch can read belongs to the ordinary reader, not to a
  // browser. Same class of pre-visit check as whyNotTheirs above.
  const probe = await probeImpl(url);
  if (probe.canRead) {
    visit.outcome = 'ordinary_fetch_reads_it';
    visit.wordsRecovered = probe.chars;
    return visit;
  }

  // ONE reading per visit, opened as FAILED so a crash mid-visit leaves a
  // reading that says so.
  const reading = look ? null : await R.startReading(db, {
    prospectId: r.id, source: R.WEBSITE, sourceUrl: url,
    reader: READER, readerVersion: READER_VERSION, model: MODEL,
  });

  try {
    let crawl;
    try {
      crawl = await crawlImpl(url, {
        probe: false,   // probed above; the browser is justified
        browser: deps.browser,
        delayMs: deps.delayMs,
        timeLimitMs: deps.crawlTimeLimitMs,
      });
    } catch (e) {
      crawl = { pages: [], failures: [], partial: false, stoppedShapes: [], challengesNeverCleared: [], error: e.message };
    }
    visit.fetched = crawl.pages.length;
    visit.failures = crawl.failures.length;
    visit.challengesStuck = (crawl.challengesNeverCleared || []).length;
    visit.wordsRecovered = crawl.pages.reduce((n, p) => n + String(p.text || '').trim().length, 0);

    if (!crawl.pages.length) {
      if (reading) await R.finishReading(db, reading.id, R.UNREACHABLE, crawl.error || 'no page could be opened, even in a real browser');
      visit.outcome = 'unreachable';
      return visit;
    }

    const read = await readSiteInGroups({
      businessName: name,
      pages: crawl.pages,
      askTheReader: askReader,
      controller,
      deadline: Date.now() + (deps.visitReadBudgetMs || VISIT_READ_BUDGET_MS),
    });
    visit.modelCalls = read.modelCalls;
    visit.partial = crawl.partial || read.partial;
    visit.concurrency = read.concurrencySettledAt;
    visit.skipped = read.skipped.length;
    for (const purpose of PURPOSES) visit.byPurpose[purpose] = read.groups[purpose].length;

    // Every fetched page is KEPT — skipped ones and never-cleared challenge
    // pages included, each marked with whether its words were handed to the
    // model — before anything is decided about what the answers mean.
    if (reading) {
      for (const page of crawl.pages) {
        await R.keepPage(db, reading.id, {
          url: page.url,
          title: page.title || null,
          text: page.text,
          sentToModel: read.sentUrls.has(page.url),
        });
      }
    }

    const understoodByGroup = {};
    for (const purpose of PURPOSES) {
      if (!read.answers[purpose]) continue;
      const doc = (read.documents[purpose] || []).map((b) => b.document).join('\n\n');
      understoodByGroup[purpose] = keepOnlyWhatWasRead(read.answers[purpose], doc, name);
    }
    const understood = mergedUnderstood(understoodByGroup, read.reconciliation);
    visit.understood = understood;

    const groupsWithPages = PURPOSES.filter((g) => read.groups[g].length);
    const groupsAnswered = PURPOSES.filter((g) => read.answers[g]);
    if (groupsWithPages.length && !groupsAnswered.length) {
      // NOT ASKED IS NOT THE SAME AS ASKED AND FAILED — and a browser that
      // ALSO got no words is its own real answer, recorded as itself.
      const anyWords = crawl.pages.some((pg) => (pg.text || '').trim().length > 0);
      if (!anyWords) {
        if (reading) await R.finishReading(db, reading.id, R.UNREACHABLE, 'the site opened in a real browser and still published no readable words — the challenge never cleared, or the pages publish nothing');
        visit.outcome = 'no_readable_words';
        return visit;
      }
      if (reading) await R.finishReading(db, reading.id, R.FAILED, 'the reader answered none of the group reads');
      visit.outcome = 'reader_failed';
      return visit;
    }

    const tools = detectedTools(crawl.pages, understood.toolsInUse || []);

    const partialNote = [
      'read through a real browser — an ordinary fetch got no words from this site',
      visit.partial ? 'partial — stopped before everything was read; every answer that arrived is kept' : null,
      crawl.partial ? 'the crawl hit its two-minute limit' : null,
      crawl.stoppedShapes.length ? `stopped after ten pages of: ${crawl.stoppedShapes.join(', ')}` : null,
      visit.challengesStuck ? `the challenge never cleared on ${visit.challengesStuck} page(s); each kept with the words it showed` : null,
      read.cut.length ? `shortened for the reader (full text kept): ${[...new Set(read.cut)].join(', ')}`.slice(0, 400) : null,
      `concurrency settled at ${read.concurrencySettledAt}`,
    ].filter(Boolean).join('; ');

    if (reading) {
      await recordGroupedRead(db, {
        readingId: reading.id, prospectId: r.id, url,
        saidByGroup: read.answers, understoodByGroup,
        couldNotTell: read.couldNotTell,
        reconciliation: read.reconciliation,
        tools,
      });
    }

    // The pages turned out to belong to somebody else — same handling as the
    // ordinary reader: the website comes off the record, the reading, its
    // pages and its findings all STAY. The visit happened; the verdict is a fact.
    if (understood.notTheirSite) {
      if (!look) {
        await db.prospect.update({
          where: { id: r.id },
          data: {
            website: null, websiteManualValue: null, normalizedDomain: null,
            siteStatus: 'NO_WEBSITE', siteReadAt: new Date(),
            siteGaps: JSON.stringify([understood.cannotTell]),
          },
        });
      }
      if (reading) await R.finishReading(db, reading.id, R.READ, `not their site; ${partialNote}`);
      visit.outcome = 'not_their_site';
      return visit;
    }

    const found = {
      peopleWithEmail: understood.people.filter((p) => p.name && p.email).length,
      peopleNamed: understood.people.length,
      peopleWithPhone: understood.people.filter((p) => p.phone).length,
      peopleWithProfile: understood.people.filter((p) => p.linkedIn).length,
      sharedEmail: understood.sharedEmail,
      contactForm: hasContactForm(crawl.pages),
      website: true,
      phone: Boolean(r.phone),
    };
    const reach = howToReachThem(found);
    const opportunity = opportunityFromTheRead(understood, found, r);
    const ranked = callOrderScore(opportunity.score, reach);
    visit.found = found;
    visit.reach = reach;
    visit.opportunity = opportunity;
    visit.ranked = ranked;

    if (!look) {
      await writeItDown(db, r, understood, reach, ranked, found, opportunity, url);
    }
    if (reading) await R.finishReading(db, reading.id, R.READ, partialNote || null);
    visit.outcome = 'read';
    return visit;
  } catch (e) {
    // However a visit breaks, its reading is CLOSED as failed — never left
    // dangling, and nothing already stored is touched.
    visit.error = String((e && e.message) || e);
    if (reading) {
      await R.finishReading(db, reading.id, R.FAILED, visit.error.slice(0, 300)).catch(() => {});
    }
    visit.outcome = 'failed';
    return visit;
  }
}

// ---------------------------------------------------------------------------
if (require.main === module) (async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  // The batch ceiling holds whatever was asked for. Standing order.
  const takeAtMost = Math.min(LIMIT || BATCH_OF_SITES, BATCH_OF_SITES);

  let rows;
  const select = {
    id: true, name: true, nameManualValue: true, trade: true, phone: true,
    website: true, websiteManualValue: true, email: true, emailManualValue: true,
    automationScore: true, scoreEvidence: true, stage: true,
    // The hand-typed columns MUST be loaded, or the guards that protect them
    // compare against undefined, read as "empty", and overwrite the very
    // values they exist to defend.
    addressManualValue: true, employeeCountManualValue: true, ownerName: true,
    phoneManualValue: true,
  };
  if (IDS.length) {
    rows = await db.prospect.findMany({ where: { id: { in: IDS } }, select, take: takeAtMost });
  } else {
    const noWordIds = await businessesWhoseSiteGaveNoWords(db);
    rows = await db.prospect.findMany({
      where: {
        id: { in: noWordIds },
        doNotContact: false,
        NOT: [{ AND: [{ website: null }, { websiteManualValue: null }] }],
      },
      select,
      orderBy: [
        { email: { sort: 'desc', nulls: 'last' } },
        { automationScore: { sort: 'desc', nulls: 'last' } },
      ],
      take: takeAtMost,
    });
  }

  console.log(`${rows.length} businesses whose site gave an ordinary fetch no words  (batch ceiling ${BATCH_OF_SITES})`);
  console.log(LOOK
    ? 'LOOKING ONLY — nothing will be written\n'
    : `reading through a real browser, one site at a time (at most ${MAX_BROWSER_PAGES_OPEN} browser pages open)\n`);

  const tally = {
    read: 0, notTheirSite: 0, siteDown: 0, readerFailed: 0, noReadableWords: 0,
    ordinaryFetchReadsIt: 0, partial: 0,
    people: 0, emails: 0, directLines: 0, profiles: 0,
    modelCalls: 0, pagesFetched: 0, wordsRecovered: 0, challengesStuck: 0,
    brokeOnThisOne: 0,
  };
  const notes = [];
  const broke = [];
  const started = Date.now();

  // ONE flight controller for the whole run, exactly as the main reader runs.
  const controller = makeFlightController();

  // If the reader stops answering, a run of failures stops the pass — with
  // everything read so far already written and every visit's reading closed.
  let inARow = 0;
  const GIVE_UP_AFTER = 15;

  // ONE SITE AT A TIME. A browser page is a rendering engine, this machine is
  // usually also running the ordinary read, and fifty sites fit an evening.
  for (const r of rows) {
    try {
      const visit = await visitWithBrowser(db, r, { controller });

      const byP = PURPOSES.map((g) => `${g} ${visit.byPurpose[g] ?? 0}`).join('  ');
      console.log(`  ${String(visit.name).slice(0, 34).padEnd(36)} ${String(visit.fetched).padStart(3)} pages  (${byP})  ${visit.modelCalls} calls  ${visit.partial ? 'PARTIAL' : visit.outcome}  ${visit.wordsRecovered} chars`);

      tally.modelCalls += visit.modelCalls;
      tally.pagesFetched += visit.fetched;
      tally.wordsRecovered += visit.wordsRecovered;
      tally.challengesStuck += visit.challengesStuck;
      if (visit.partial) tally.partial += 1;

      if (visit.outcome === 'ordinary_fetch_reads_it') { tally.ordinaryFetchReadsIt += 1; inARow = 0; continue; }
      if (visit.outcome === 'not_their_site') { tally.notTheirSite += 1; continue; }
      if (visit.outcome === 'unreachable') { tally.siteDown += 1; continue; }
      if (visit.outcome === 'failed') {
        tally.brokeOnThisOne += 1;
        if (broke.length < 25) broke.push(`  ${String(visit.name || '(no name)').slice(0, 30).padEnd(32)}${String(visit.error).slice(0, 90)}`);
        continue;
      }
      // Even the browser got no words. A real answer, recorded as itself —
      // and never the reader's fault, so it must not trip the give-up counter.
      if (visit.outcome === 'no_readable_words') { tally.noReadableWords += 1; inARow = 0; continue; }
      if (visit.outcome === 'reader_failed') {
        tally.readerFailed += 1;
        inARow += 1;
        if (inARow >= GIVE_UP_AFTER) {
          console.log(`\n\nSTOPPED — the reader failed ${GIVE_UP_AFTER} times in a row.`);
          console.log('Everything read up to this point is already saved. Run again to carry on.\n');
          break;
        }
        continue;
      }
      inARow = 0;
      tally.read += 1;

      const { understood, found } = visit;
      tally.people += understood.people.length;
      tally.emails += found.peopleWithEmail;
      tally.directLines += found.peopleWithPhone;
      tally.profiles += found.peopleWithProfile;

      if (LOOK && notes.length < 40) {
        const lines = [];
        lines.push(`\n${'='.repeat(74)}\n${visit.name}   ${visit.url}`);
        lines.push(`  recovered       ${visit.wordsRecovered} chars across ${visit.fetched} pages — an ordinary fetch got none`);
        lines.push(`  what they are   ${understood.trade || '(could not tell)'}${understood.trade && understood.trade !== r.trade ? `   was: ${r.trade || 'none'}` : ''}`);
        if (understood.whatTheyDo) lines.push(`  what they do    ${understood.whatTheyDo}`);
        if (understood.realName) lines.push(`  real name       ${understood.realName}`);
        lines.push(`  score           ${r.automationScore ?? '-'} -> ${visit.ranked}    ${visit.reach.inWords}`);
        if (understood.sharedEmail) lines.push(`  general inbox   ${understood.sharedEmail}`);
        if (understood.people.length) {
          lines.push('  who works there');
          for (const person of understood.people.slice(0, 12)) {
            const bits = [person.role ? `${person.role}${person.roleWasPrinted === false ? ' (understood)' : ''}` : 'no title given'];
            if (person.email) bits.push(person.email);
            if (person.phone) bits.push(person.phone);
            if (person.linkedIn) bits.push('LinkedIn');
            lines.push(`      ${person.name.padEnd(26)} ${bits.join('  ·  ')}`);
          }
        } else lines.push('  who works there  nobody named');
        if (understood.cannotTell) lines.push(`  not on the site ${understood.cannotTell}`);
        notes.push(lines.join('\n'));
      }
    } catch (e) {
      tally.brokeOnThisOne += 1;
      if (broke.length < 25) broke.push(`  ${(r.nameManualValue || r.name || '(no name)').slice(0, 30).padEnd(32)}${String((e && e.message) || e).slice(0, 90)}`);
    }
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(notes.join('\n'));
  console.log(`\n${'='.repeat(74)}`);
  console.log(`read properly:            ${tally.read}   in ${mins} minutes   (${tally.partial} partial, kept and marked)`);
  console.log(`website was not theirs:   ${tally.notTheirSite}`);
  console.log(`site would not answer:    ${tally.siteDown}   (even to the browser)`);
  console.log(`reader gave no answer:    ${tally.readerFailed}`);
  console.log(`still no readable words:  ${tally.noReadableWords}   (the challenge never cleared even for a real browser)`);
  console.log(`ordinary fetch reads it:  ${tally.ordinaryFetchReadsIt}   (the browser was not used — the ordinary reader can take these)`);
  if (tally.brokeOnThisOne) {
    console.log(`something broke on:       ${tally.brokeOnThisOne}   (the pass carried on; each reading closed as failed)`);
    console.log(broke.join('\n'));
  }
  console.log('');
  console.log(`pages fetched:            ${tally.pagesFetched}`);
  console.log(`words recovered:          ${tally.wordsRecovered} chars that an ordinary fetch could not see`);
  console.log(`challenge never cleared:  ${tally.challengesStuck} page(s), kept with what they showed`);
  console.log(`model calls:              ${tally.modelCalls}   every one via the local claude reader (${MODEL}) — no OpenRouter, no paid call`);
  console.log(`concurrency settled at:   ${controller.settledAt} in flight`);
  console.log('');
  console.log(`people found:             ${tally.people}`);
  console.log(`  with their own address: ${tally.emails}`);
  console.log(`  with a direct line:     ${tally.directLines}`);
  console.log(`  with a profile:         ${tally.profiles}`);

  await closeSharedBrowser();
  await db.$disconnect();
})().catch(async (e) => {
  console.error('failed:', e.message);
  try { await closeSharedBrowser(); } catch { /* nothing left to close */ }
  process.exit(1);
});

module.exports = {
  visitWithBrowser, businessesWhoseSiteGaveNoWords,
  BATCH_OF_SITES, READER, READER_VERSION, VISIT_READ_BUDGET_MS,
};
