#!/usr/bin/env node
// Write one true sentence per business — the noticing — and carry it into
// their unsent first email.
//
//   node scripts/hoursback/write-noticings.js --look --limit=5
//   node scripts/hoursback/write-noticings.js --since=2026-09-01
//   node scripts/hoursback/write-noticings.js --ids=<id>,<id>
//   node scripts/hoursback/write-noticings.js --limit=20
//   node scripts/hoursback/write-noticings.js --fresh=12   (resume: skip anyone
//                                       noticed in the last 12 hours, per the DB)
//
// --look: the sentences are generated and the review page is written, but
// NOTHING in the database is touched — no reading, no finding, no draft.
//
// The sentence replaces exactly one thing in Russ's letter: the trade's week
// sentence, the third element of dayZero. Everything else is his, unchanged.
// A business whose own site does not clearly support one specific observation
// keeps his trade sentence — silence beats a wrong guess, and the "could not
// tell" is itself recorded, because absence is data.
//
// The letter is rewritten through the ONE existing draft path — lanes.draftFor
// — the same as scripts/hoursback/rewrite-drafts.js uses. A draft Russ has
// edited by hand (editedAt) or that is already sent is never touched; draftFor
// enforces that and this script adds no second way of writing a message.
//
// COST. Three local model calls per business — find the areas, check they
// recur, write the passage — plus at most one retry where an answer is
// rejected, all through askTheReader() — the same local reader the site reads
// use. No OpenRouter, no paid call, ever. The ceiling below is in code before
// anything runs, because a loop that spends without one has cost real money.
//
// SURVIVING THE NIGHT (2026-09-02). Over ~3,000 businesses three failures are
// certainties, and each used to ruin the run:
//   - the reader running out of allowance mid-run STOPS the run at once —
//     exit EXIT_READER_EXHAUSTED (75) — instead of recording hundreds of
//     honest-looking "kept the trade sentence" fallbacks off one dead reader;
//   - a run whose first calls all fail stops as broken — exit
//     EXIT_BROKEN_START (74) — rather than grinding through thousands;
//   - --fresh=N resumes: a business whose latest noticing finding is newer
//     than N hours is skipped, counted FROM THE DATABASE, same flag and
//     meaning as understand-businesses.js;
//   - however the run ends, one plain line lands on docs/hoursback/last-run.md
//     — the status board, always the last thing written.

const path = require('path');
const fs = require('fs');

// HARD CEILING. However many are asked for, one run writes noticings for at
// most this many businesses.
const CEILING = 50;

// The writer, kept awake like the finder but on the better model. One at a
// time: each business writes once, and a waiting model holds real memory.
let theWriter = null;
function makeWriter() {
  return (prompt) => {
    if (theWriter === null) {
      try {
        const { makeReaderPool } = require('../../src/hoursback/readerPool.js');
        theWriter = makeReaderPool({ size: 1, model: process.env.HOURSBACK_WRITER_MODEL || 'sonnet' });
      } catch { theWriter = false; }
    }
    return theWriter ? theWriter.ask(prompt) : askTheReader(prompt);
  };
}

const {
  askTheReader, makeReaderGuard, writeLastRun, LAST_RUN,
  FIRST_CALLS_MUST_ANSWER, EXIT_READER_EXHAUSTED, EXIT_BROKEN_START,
} = require('./understand-businesses.js');   // safe: exports only; chdirs to the project root and loads .env
const { PrismaClient } = require('@prisma/client');
const N = require('../../src/hoursback/crm/noticing.js');
const L = require('../../src/hoursback/crm/lanes.js');
const { draftFirstContact } = require('../../src/hoursback/crm/firstContact.js');
const { tradeOf } = require('../../src/hoursback/crm/queues.js');

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };

// How many TRADES are walked side by side. Six matches what the website read
// settled on for this machine; --at-once= raises or lowers it for a bigger one.
// Four businesses at a time, not six: with a writer alive per business too,
// six filled a 9 GB machine (2026-09-05).
const AT_ONCE = Math.max(1, Number(arg('at-once', 4)));
// How many readers wait ready. Deliberately fewer than the businesses running,
// because each one holds about 280 MB and they are what fills the machine
// (measured 2026-09-04: eight ready became nineteen alive, 5.3 GB).
// ONE WAITING, NOT FOUR (2026-09-05, measured twice). Each one holds about
// 270 MB, and a replacement starts the moment one is taken, so four waiting
// became twenty-nine alive holding 6.5 GB and the machine ran out of memory.
// Waiting readers are not the bottleneck; memory is.
if (!process.env.HOURSBACK_WARM_READERS) process.env.HOURSBACK_WARM_READERS = '1';
const LOOK = process.argv.includes('--look');
const SINCE = arg('since', null);
const IDS = String(arg('ids', '')).split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Math.min(Number(arg('limit', CEILING)) || CEILING, CEILING);
// --fresh=N: resume. Same flag, same meaning as understand-businesses.js.
const FRESH = Number(arg('fresh', 0));

const REVIEW_PAGE = path.resolve(__dirname, '../../docs/hoursback/messages-to-review.md');

// The second paragraph of the letter: greeting, WHO_I_AM, then this.
function secondParagraphOf(body) {
  return String(body || '').split('\n\n')[2] || '';
}

function asQuote(text) {
  return String(text || '').split('\n').map((l) => `> ${l}`).join('\n');
}

// The walk itself, separable so the stop can be proved by a test: atOnce
// workers, each taking a whole trade and walking it in order. An ordinary
// error on one business goes to onBusinessError and the run carries on — one
// bad site never stops the batch. An error marked stopTheRun (thrown by the
// reader guard) stops EVERY worker before its next business: a run must not
// grind 3,000 businesses into honest-looking failures against a dead reader.
async function walkTrades({ queues, atOnce, doOne, onBusinessError }) {
  const stopState = { stop: false, error: null };
  let nextQueue = 0;
  const worker = async () => {
    while (!stopState.stop) {
      const mine = queues[nextQueue];
      nextQueue += 1;
      if (!mine) return;
      for (const p of mine) {
        if (stopState.stop) return;
        try { await doOne(p); }
        catch (e) {
          if (e && e.stopTheRun) { stopState.stop = true; stopState.error = e; return; }
          onBusinessError(p, e);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(atOnce, queues.length)) }, worker));
  return stopState;
}

// What this run has managed so far, for the crash report alone. A resume
// never reads this — it counts from the database.
const progress = { done: 0, total: 0 };

async function noticingRun(injected = {}) {
  const db = injected.db || new PrismaClient();
  const look = injected.look ?? LOOK;
  const ids = injected.ids ?? IDS;
  const since = injected.since ?? SINCE;
  const limit = Math.min(Number(injected.limit ?? LIMIT) || CEILING, CEILING);
  const fresh = injected.fresh ?? FRESH;
  const atOnce = injected.atOnce ?? AT_ONCE;

  // CLOSE WHAT A STOPPED RUN LEFT OPEN, every time, before anything is counted
  // (Russ, 2026-09-05: "this should happen automatically"). Nothing is deleted;
  // a reading that never finished gets its end time and a note saying why.
  {
    const R2 = require('../../src/hoursback/readings.js');
    const closed = await R2.closeWhatDiedEarlier(db);
    if (closed) console.log(`closed ${closed} reading(s) a stopped run had left open`);
  }
  const ask = injected.ask || askTheReader; // tests hand in a fake; a real run uses the LOCAL reader, nothing else
  // THE SENTENCE IS WRITTEN BY THE BETTER MODEL (Russ, 2026-09-04). Finding
  // facts stays on the cheap fast one; the words a stranger reads do not.
  // Still the Claude logged in on this machine, so still not a paid call.
  const askToWrite = injected.askToWrite || makeWriter();
  const reviewPage = injected.reviewPage || REVIEW_PAGE;
  const lastRunAt = injected.lastRunPath || LAST_RUN;
  progress.done = 0; progress.total = 0;
  let outcome = null;
  try {
    // Who this run looks at. Explicit ids are taken as given; otherwise the
    // most recently read businesses that a letter could actually reach, the
    // same reachability screen rewrite-drafts.js uses. doNotContact stands
    // everywhere — a business Russ said never to contact gets no work done
    // on its letter at all.
    const where = { doNotContact: false };
    if (ids.length) {
      where.id = { in: ids };
    } else {
      // THE STAMP IS NOT THE TEST, THE WORDS ARE (2026-09-03).
      //
      // A nightly run spent fifty reader questions asking what fifty
      // businesses do, and every one came back "their site's words are not on
      // file" — they carry a read stamp from a visit that stored nothing. The
      // same lesson the reading side already learned: a business is read when
      // we HOLD WORDS from their site, never when a stamp says so.
      where.siteStatus = 'READ';
      where.readings = {
        some: {
          source: 'website',
          outcome: 'read',
          pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
        },
      };
      where.repliedAt = null;
      where.emailBouncedAt = null;
      where.OR = [{ email: { not: null } }, { emailManualValue: { not: null } }];
      if (since) {
        const t = new Date(since);
        if (Number.isNaN(t.getTime())) throw new Error(`--since=${since} is not a date`);
        where.siteReadAt = { gte: t };
      }
    }

    // PICKING UP WHERE IT STOPPED. --fresh=N: a business whose latest
    // noticing finding is newer than N hours is already done and is skipped —
    // read from the DATABASE, never from a file a run wrote about itself, and
    // never from a run's own tally. A could-not-tell finding counts as done:
    // we looked, and the look is on record. Explicit --ids are taken as
    // given, exactly as --only is next door.
    let skippedAsDone = 0;
    if (fresh && !ids.length) {
      const cutoff = new Date(Date.now() - fresh * 3600000);
      const noticedLately = { field: 'noticing', createdAt: { gte: cutoff } };
      skippedAsDone = await db.prospect.count({
        where: { ...where, findings: { some: noticedLately } },
      });
      where.findings = { none: noticedLately };
      const remainEligible = await db.prospect.count({ where });
      console.log(`resume: ${skippedAsDone} noticed in the last ${fresh}h — skipped as already done; `
        + `${remainEligible} remain eligible (this run takes at most ${limit})`);
    }

    const rows = await db.prospect.findMany({
      where, orderBy: { siteReadAt: 'desc' }, take: limit,
    });
    progress.total = rows.length;
    console.log(`${rows.length} businesses selected (ceiling ${CEILING})${look ? ' — LOOK ONLY, nothing will be written' : ''}`);

    // Every noticing already on file, latest per business, grouped by trade —
    // so two businesses in one trade can never be handed the same sentence,
    // this run included. A business's own earlier sentence is not a collision
    // with itself.
    const priors = await db.finding.findMany({
      where: { field: 'noticing', retiredAt: null, value: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { value: true, prospectId: true },
    });
    const latestByProspect = new Map();
    for (const f of priors) if (!latestByProspect.has(f.prospectId)) latestByProspect.set(f.prospectId, f.value);
    const priorProspects = latestByProspect.size
      ? await db.prospect.findMany({
        where: { id: { in: [...latestByProspect.keys()] } },
        select: { id: true, name: true, trade: true },
      })
      : [];
    const avoidByTrade = new Map();
    const intoAvoid = (trade, prospectId, sentence) => {
      const key = String(trade || 'other').toLowerCase();
      if (!avoidByTrade.has(key)) avoidByTrade.set(key, []);
      avoidByTrade.get(key).push({ prospectId, sentence });
    };
    for (const pp of priorProspects) {
      intoAvoid(pp.trade || tradeOf(pp.name) || 'other', pp.id, latestByProspect.get(pp.id));
    }

    const noticed = [];     // review entries
    const fallbacks = [];   // kept the trade sentence, and why
    let rewritten = 0; let leftAlone = 0;

    // SEVERAL BUSINESSES AT ONCE (2026-09-02).
    //
    // This walked the list one at a time, so six businesses meant eighteen
    // rounds of thinking in a queue — five minutes for two of them, and at
    // 3,000 businesses the difference between a night and a fortnight.
    //
    // Businesses of the SAME trade stay in order, because the rule that no two
    // businesses in one trade may receive the same sentence works by showing
    // each one what has already been written for that trade. Run them side by
    // side and neither can see the other. So: one worker per trade, and the
    // trades run in parallel.
    const byTrade = new Map();
    for (const p of rows) {
      const k = String(p.trade || tradeOf(p.name) || 'other').toLowerCase();
      if (!byTrade.has(k)) byTrade.set(k, []);
      byTrade.get(k).push(p);
    }
    const queues = [...byTrade.values()];

    // ONE reader guard for the whole run. The moment the reader is out of
    // allowance — or the run's first calls have all failed — it throws an
    // error marked stopTheRun and keeps throwing without calling the reader
    // again: every business in flight aborts BEFORE recording anything, and
    // walkTrades starts no new business. Six honest-looking fallbacks that
    // were really one dead reader (2026-09-02) is the failure this retires.
    const guard = makeReaderGuard(ask);

    const doOne = async (p) => {
      const businessName = p.nameManualValue || p.name || '(no name)';
      const tradeKey = String(p.trade || tradeOf(p.name) || 'other').toLowerCase();

      // Who the letter is addressed to, by the SAME rules the draft uses, and
      // what their job is. The job angles the prompt and never the surface of
      // the sentence; no job on record means the neutral version.
      const { writeTo } = await L.whoTheLetterGoesTo(db, p.id, p);
      let roleTitle = null;
      if (writeTo.contactName) {
        const c = await db.contact.findFirst({ where: { prospectId: p.id, name: writeTo.contactName } });
        roleTitle = c && c.role ? c.role : null;
      } else if (writeTo.ownerName) {
        roleTitle = 'owner';   // the greeting falls to the owner on the record
      }
      const addressedTo = writeTo.contactName || writeTo.ownerName || 'nobody by name';

      const avoid = (avoidByTrade.get(tradeKey) || [])
        .filter((x) => x.prospectId !== p.id)
        .map((x) => x.sentence);

      const res = await N.noticeOneBusiness(db, p.id, {
        ask: guard.ask, askToWrite, avoid, roleTitle, prospect: p,
      });

      if (!res.sentence) {
        // Silence beats a wrong guess: the letter keeps Russ's trade
        // sentence, and the "could not tell" is recorded as itself.
        if (!look) await N.recordNoticing(db, p.id, res, { sourceUrl: p.websiteManualValue || p.website });
        fallbacks.push({
          name: businessName, trade: tradeKey,
          theyRun: res.theyRun || [],
          areas: res.areas || [],
          reason: res.couldNotTell || 'could not tell',
        });
        progress.done += 1;
        console.log(`  · ${businessName}: kept the trade sentence — ${res.couldNotTell}`);
        return;
      }

      intoAvoid(tradeKey, p.id, res.sentence);
      const before = await db.outreachMessage.findFirst({ where: { prospectId: p.id, lane: 'EMAIL' } });

      let after = null; let status;
      if (look) {
        after = { body: draftFirstContact({ ...writeTo, noticing: res.sentence }, L.signalsOf(p)).body };
        status = before && before.sentAt ? 'already sent — a real run would leave the letter alone'
          : before && before.editedAt ? 'edited by Russ — a real run would leave the letter alone'
            : 'what the letter would become (nothing was written)';
      } else {
        await N.recordNoticing(db, p.id, res, { sourceUrl: p.websiteManualValue || p.website });
        after = await L.draftFor(db, p.id, 'EMAIL');
        if (!after) status = 'sentence recorded; no letter stands (no address, or nothing honest to open with)';
        else if (after.sentAt) { status = 'already sent — left exactly as it was; the sentence is on file for the next letter'; leftAlone += 1; }
        else if (after.editedAt) { status = 'edited by Russ — left exactly as it was; the sentence is on file'; leftAlone += 1; }
        else { status = before ? 'draft rewritten to carry the noticing' : 'draft written fresh, carrying the noticing'; rewritten += 1; }
      }

      noticed.push({
        name: businessName,
        trade: tradeKey,
        theirWork: p.theirWork || p.selfDescription || null,
        addressedTo,
        roleTitle: roleTitle || 'not on record',
        angle: res.angle,
        theyRun: res.theyRun || [],
        jobs: res.jobs || [],
        areas: res.areas || [],
        chosenWhy: res.chosenWhy || null,
        restsOn: res.url,
        quote: res.quote,
        oldParagraph: before ? secondParagraphOf(before.body) : secondParagraphOf(draftFirstContact(writeTo, L.signalsOf(p)).body),
        newParagraph: after ? secondParagraphOf(after.body) : res.sentence,
        newBody: after ? after.body : null,
        status,
      });
      progress.done += 1;
      console.log(`  ✓ ${businessName}: ${res.sentence}`);
    };

    // A business that throws for its own reasons is reported and the run
    // carries on — one bad site never stops the batch. A stopTheRun error
    // (the reader guard's) stops every worker; walkTrades tells them apart.
    const onBusinessError = (p, e) => {
      const nm = p.nameManualValue || p.name || '(no name)';
      console.log(`  ! ${nm}: ${String((e && e.message) || e).slice(0, 110)}`);
      fallbacks.push({
        name: nm, trade: String(p.trade || tradeOf(p.name) || 'other').toLowerCase(),
        theyRun: [], areas: [], reason: `the run threw: ${String((e && e.message) || e).slice(0, 160)}`,
      });
      progress.done += 1;
    };
    const stopState = await walkTrades({ queues, atOnce, doOne, onBusinessError });

    // HOW THE RUN ENDED, counted from what actually happened. Every business
    // in `noticed` or `fallbacks` was finished and recorded normally BEFORE
    // any stop; every other business was never started — nothing was written
    // for it, and it stays eligible for the next run.
    const done = noticed.length + fallbacks.length;
    const remaining = rows.length - done;
    const readerOut = Boolean(stopState.error && stopState.error.readerExhausted);
    const stopWhy = !stopState.stop ? null
      : readerOut ? 'the reader is out of allowance and the run stopped'
        : `the run's first calls all failed (${FIRST_CALLS_MUST_ANSWER} before a single answer) — the reader is broken, not the websites`;
    if (stopState.stop) {
      console.log(`\nSTOPPED — ${stopWhy}.`);
      console.log(`${done} of ${rows.length} were done and are recorded normally; ${remaining} were not reached, `
        + 'nothing was written for them, and they stay eligible.');
      console.log('Rerun with --fresh=12 to resume from the database once the reader answers.');
    }

    // ------------------------------------------------------------------ page
    const out = [];
    out.push('# Messages to review — the noticing pass');
    out.push('');
    out.push(`Written ${new Date().toISOString()} by scripts/hoursback/write-noticings.js${look ? ' — **a look only: nothing in the database was touched**' : ''}.`);
    out.push('');
    if (stopState.stop) {
      // The page only ever shows businesses finished BEFORE the stop — each
      // recorded normally — and says so, so a short page reads as a stopped
      // run and never as a quiet night.
      out.push(`**THE RUN STOPPED EARLY — ${stopWhy}.** The ${done} businesses below were done before the stop; `
        + `${remaining} were not reached, nothing was written for them, and they stay eligible.`);
      out.push('');
    }
    out.push("One thing changed in each letter below: the second paragraph, which used to be the trade's week, now names at most the two hardest-hitting jobs read off that business's own site, angled to the job of the person it is addressed to. Every other word is Russ's, unchanged. Beside each is what the business already visibly runs; EVERY area of work that mapped to the tool library, each with its type, department, the words it rests on and its recurrence verdict; how the areas ranked and which reached the email, and why. The card gets everything that fits — the email names two at most. Businesses whose site could not support a specific, true sentence are at the end — they keep the trade sentence, and the reason and any areas that fell short are beside each.");
    out.push('');

    const runsLine = (theyRun) => (theyRun && theyRun.length
      ? theyRun.map((t) => (t.does ? `${t.name} (${t.does})` : t.name)).join('; ')
      : 'nothing visible on their record or their pages');

    // Every area found, ranked ones first — the card in full. Each carries
    // its type, department, the words it rests on, its recurrence verdict,
    // and where it ranked and why.
    const areaLines = (areas, reachedEmail = true) => {
      const lines = [];
      const shown = [...(areas || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
      for (const x of shown) {
        // On a fallback the chosen area never reached any email — the passage
        // was refused after the choice — and the label must not say it did.
        const head = x.chosen
          ? (reachedEmail ? `**#${x.rank} — IN THE EMAIL**` : `**#${x.rank} — chosen, but no passage stood**`)
          : x.rank ? `#${x.rank}` : 'dropped';
        lines.push(`  - ${head}: ${x.label || x.type} (\`${x.type}\`, ${x.department || '?'}) — ${x.job}`);
        if (x.quote) lines.push(`    - their words: "${x.quote}"`);
        lines.push(`    - recurs: ${x.recurs || 'not checked'}${x.recursWhy ? ` — ${x.recursWhy}` : ''}${x.plainly !== null && x.plainly !== undefined ? ` (plainly ${x.plainly})` : ''}`);
        if (x.rankWhy) lines.push(`    - why this rank: ${x.rankWhy}`);
      }
      return lines;
    };

    noticed.forEach((n, i) => {
      out.push(`## ${i + 1}. ${n.name} — ${n.trade}`);
      out.push('');
      if (n.theirWork) out.push(`- **What they do:** ${n.theirWork}`);
      out.push(`- **Addressed to:** ${n.addressedTo} (${n.roleTitle}; angle: ${n.angle})`);
      out.push(`- **They already run:** ${runsLine(n.theyRun)}`);
      if (n.areas && n.areas.length) {
        out.push(`- **Every area that fits (the card, ${n.areas.length} found):**`);
        out.push(...areaLines(n.areas));
      }
      if (n.chosenWhy) out.push(`- **Why these reached the email:** ${n.chosenWhy}`);
      if (n.jobs && n.jobs.length) {
        out.push('- **Named in the email:**');
        for (const j of n.jobs) {
          out.push(`  - ${j.job || '(the reader gave no name for it)'}${j.quote ? ` — their words: "${j.quote}"` : ''}`);
        }
      }
      out.push(`- **Rests on:** ${n.restsOn}`);
      out.push(`- **Their own words behind it:** "${n.quote}"`);
      out.push(`- **Status:** ${n.status}`);
      out.push('');
      out.push('**Second paragraph before:**');
      out.push('');
      out.push(asQuote(n.oldParagraph));
      out.push('');
      out.push('**Second paragraph now:**');
      out.push('');
      out.push(asQuote(n.newParagraph));
      out.push('');
      if (n.newBody) {
        out.push('**The whole letter as it now stands:**');
        out.push('');
        out.push('```');
        out.push(n.newBody);
        out.push('```');
        out.push('');
      }
    });

    out.push('## Kept the trade sentence — nothing specific could honestly be said');
    out.push('');
    if (!fallbacks.length) {
      out.push('None this run.');
    } else {
      out.push('| Business | Trade | Already runs | Why |');
      out.push('|---|---|---|---|');
      for (const f of fallbacks) {
        out.push(`| ${f.name} | ${f.trade} | ${runsLine(f.theyRun).replace(/\|/g, '/')} | ${String(f.reason).replace(/\|/g, '/')} |`);
      }
      // Areas that were found and fell short are findings too — shown here so
      // the verdicts can be judged, never lost inside the reason column.
      for (const f of fallbacks) {
        if (!f.areas || !f.areas.length) continue;
        out.push('');
        out.push(`**${f.name} — areas found before the fallback:**`);
        out.push(...areaLines(f.areas, false));
      }
    }
    out.push('');
    fs.writeFileSync(reviewPage, out.join('\n'));

    console.log('');
    console.log(`noticed: ${noticed.length}   kept the trade sentence: ${fallbacks.length}`);
    if (!look) console.log(`letters rewritten: ${rewritten}   left alone (sent or hand-edited): ${leftAlone}`);
    console.log(`review page: ${reviewPage}`);

    outcome = {
      ending: !stopState.stop ? 'finished' : readerOut ? 'reader_exhausted' : 'broken_start',
      code: !stopState.stop ? 0 : readerOut ? EXIT_READER_EXHAUSTED : EXIT_BROKEN_START,
      done, remaining, skippedAsDone,
      why: stopWhy || `finished${look ? ' (a look only — nothing was written)' : ''}`,
      needsPerson: stopState.stop
        ? (readerOut
          ? 'wait for the reader\'s allowance to reset, then rerun with --fresh=12'
          : 'check the local claude reader and its login, then rerun with --fresh=12')
        : (noticed.length && !look ? `review the ${noticed.length} letters on ${reviewPage}` : null),
    };
  } finally {
    // The readers kept waiting for the next question are closed with the
    // run — a warm reader is a real process and must not outlive it.
    try { require('./understand-businesses.js').closeReaderPool(); } catch { /* nothing to close */ }
    await db.$disconnect();
  }
  // The status board — always the LAST thing written, whatever the ending.
  writeLastRun({
    script: 'write-noticings.js',
    why: outcome.why, done: outcome.done, remaining: outcome.remaining,
    needsPerson: outcome.needsPerson, at: lastRunAt,
  });
  return outcome;
}

// However the run ends — finished, stopped by the guard, or a crash — the
// status board gets its line. On a crash it is written here, then the error
// carries on to whoever called.
async function main(injected = {}) {
  try {
    return await noticingRun(injected);
  } catch (e) {
    writeLastRun({
      script: 'write-noticings.js',
      why: `it crashed: ${String((e && e.message) || e).slice(0, 200)}`,
      done: progress.done,
      remaining: Math.max(0, progress.total - progress.done),
      needsPerson: 'read the crash above, then rerun with --fresh=12 to resume',
      at: injected.lastRunPath || LAST_RUN,
    });
    throw e;
  }
}

if (require.main === module) {
  main().then((out) => {
    // Distinct codes: 75 means "out of allowance, rerun later", 74 means
    // "broken from the first call" — a wrapper can tell both from a crash (1).
    if (out && out.code) process.exit(out.code);
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { CEILING, secondParagraphOf, walkTrades, main };
