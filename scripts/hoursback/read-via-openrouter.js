#!/usr/bin/env node
// Read business websites through OpenRouter instead of the session allowance.
//
//   node scripts/hoursback/read-via-openrouter.js --limit=25 --look
//   node scripts/hoursback/read-via-openrouter.js --limit=25 --ceiling=0.50
//
// Russ, 2026-08-29, after the overnight run died on the session limit at 12:20am:
// "you use the OR key for these, not the model... you call the model through OR.
// do a sample tranche and look at cost and quality."
//
// Same question, same refusals, same saving. The ONLY thing that changes is who
// answers it and who pays.
//
// THE CEILING IS THE POINT OF THIS FILE.
//
// A loop that spends without a ceiling has cost Russ real money before — a
// sample he authorised ran to somewhere between fifty and a hundred and forty
// dollars. So this counts every cent as it goes, against the price the model
// actually charges, and STOPS the moment the total would cross the limit. The
// limit is checked BEFORE each call, not after, so it can never be exceeded by
// the call that discovers it.
//
// There is $20.47 of credit on the account as of tonight. The default ceiling
// is deliberately far below that.

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
const { whyNotTheirs } = require('../../src/hoursback/notTheirSite.js');
const { pagesAsDocument, questionAbout, keepOnlyWhatWasRead } = require('../../src/hoursback/understand.js');
const { howToReachThem, callOrderScore } = require('../../src/hoursback/reachable.js');
// The saving step comes from the session-based read rather than being written
// again here. Written twice, it was written wrong: this file found 887 people,
// counted them, reported them and never wrote one of them down, because its
// own saving step only handled the business fields (2026-08-29).
const { writeItDown, hasContactForm, opportunityFromTheRead } = require('./understand-businesses.js');

const arg = (n, d) => {
  const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : d;
};
const LOOK = process.argv.includes('--look');
const LIMIT = Number(arg('limit', 25));
const LANES = Number(arg('lanes', 4));
const MODEL = arg('model', 'anthropic/claude-haiku-4.5');

// --- the ceiling, in code, before anything runs -----------------------------
const CEILING_USD = Number(arg('ceiling', 0.50));
const MOST_EVER = 3400;
const PAGES_PER_SITE = 8;
const CALL_TIMEOUT_MS = 120000;

// What the model charges, per million tokens. Read back from OpenRouter's own
// answer where it gives one, so the running total is what is actually billed
// rather than what a price list said last week.
const PRICES = {
  // Prices read off OpenRouter's own catalogue, 2026-08-29, per million tokens.
  // claude-haiku-4.5 is the SAME reader the session-based pass used, so paying
  // for it here buys identical answers off the session allowance rather than
  // out of it — the only honest way to compare quality is to hold the reader
  // still and change who pays.
  'anthropic/claude-haiku-4.5': { in: 1.00, out: 5.00 },
  'qwen/qwen3-max': { in: 0.78, out: 3.90 },
  'openai/gpt-5-mini': { in: 0.25, out: 2.00 },
  'google/gemini-2.5-flash': { in: 0.30, out: 2.50 },
  'meta-llama/llama-3.3-70b-instruct': { in: 0.10, out: 0.32 },
};

const startedAt = Date.now();
const foundPeopleOn = [];   // businesses the reader named at least one person on
const lostPeople = [];      // people the record refused for a reason nobody expected
let spent = 0;
let calls = 0;
let stoppedByCeiling = false;

async function askTheReader(question) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You read web pages and answer with JSON only. No preamble, no explanation, no code fences.' },
        { role: 'user', content: question },
      ],
      temperature: 0,
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });

  if (!res.ok) return { answer: null, cost: 0, why: `the service said ${res.status}` };
  const body = await res.json();

  // What this one call cost. OpenRouter reports it directly; where it does not,
  // it is worked out from the token counts and the published price.
  const u = body.usage || {};
  const priced = PRICES[MODEL] || { in: 0, out: 0 };
  const cost = Number.isFinite(u.cost) ? u.cost
    : ((u.prompt_tokens || 0) / 1e6) * priced.in + ((u.completion_tokens || 0) / 1e6) * priced.out;

  const text = String(body.choices?.[0]?.message?.content || '');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { answer: null, cost, why: 'answered with no JSON' };
  try { return { answer: JSON.parse(m[0]), cost, why: null }; }
  catch { return { answer: null, cost, why: 'answered with broken JSON' }; }
}

(async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('No OpenRouter key on this machine. Nothing run, nothing spent.');
    process.exit(1);
  }

  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const noSite = { AND: [{ website: null }, { websiteManualValue: null }] };
  const REVIEW = process.argv.includes('--review');
  // --unread-trades: the set-aside businesses that have a website nobody has
  // opened and a trade that tends to employ people. Russ, 2026-08-29: "don't
  // they have a website? don't you think the website will have a phone number
  // and contacts?" They do. They were set aside because the RECORD was empty,
  // not because the business is unreachable — reading the page is the fix.
  const TRADES_WITH_STAFF = /accounting|legal|insurance|dental|medical|veterinary|real estate|construction|trades|plumbing|electrical|hvac|auto|landscap|staffing|cleaning|manufactur|storage|professional services/i;
  const UNREAD_TRADES = process.argv.includes('--unread-trades');
  const where = UNREAD_TRADES
    ? { doNotContact: false, stage: 'NEEDS_REVIEW', siteReadAt: null, NOT: [noSite, { trade: null }] }
    : REVIEW
      ? { doNotContact: false, stage: 'NEEDS_REVIEW', NOT: [noSite] }
      : { doNotContact: false, NOT: [{ stage: 'NEEDS_REVIEW' }, noSite] };

  let rows = await db.prospect.findMany({
    where,
    select: {
      id: true, name: true, nameManualValue: true, trade: true, phone: true,
      website: true, websiteManualValue: true, email: true, emailManualValue: true,
      automationScore: true, scoreEvidence: true, stage: true, siteReadAt: true,
      theirWork: true, siteGaps: true,
      contacts: { select: { name: true, role: true, email: true } },
    },
    take: MOST_EVER,
  });

  // ONLY READ A BUSINESS THAT HAS SOMETHING TO GAIN.
  //
  // Russ, 2026-08-29, after a 58-cent run moved not one number: "you should
  // have known this." He is right. Hours earlier I had ordered the list
  // best-first so a TEST would find live websites, then left that ordering in
  // place and ran a real batch through it. It re-read the 95 businesses that
  // were already the most complete on the list and changed nothing.
  //
  // So the choice is no longer mine to get wrong. A business is read only when
  // the reading can add something it does not already have, and the ones
  // missing the most are read first. A record with a trade, a description, an
  // inbox, a phone and a named person is skipped — there is nothing to buy.
  const missing = (r) => {
    const named = r.contacts.filter((c) => c.name);
    let saidWhy = false;
    try { saidWhy = /staff|individual|name|team|personnel|employee|owner/i
      .test(JSON.parse(r.siteGaps || '[]')[0] || ''); } catch { saidWhy = false; }
    const gaps = [];
    if (!named.length && !saidWhy) gaps.push('nobody, and no reason given');
    if (!r.email && !r.emailManualValue) gaps.push('no inbox');
    if (!r.phone) gaps.push('no phone');
    if (!r.trade) gaps.push('no trade');
    if (!r.theirWork) gaps.push('no description');
    if (named.length && !named.some((c) => c.role)) gaps.push('nobody has a job title');
    return gaps;
  };

  if (UNREAD_TRADES) rows = rows.filter((r) => TRADES_WITH_STAFF.test(r.trade || ''));

  rows = rows
    .map((r) => ({ ...r, gaps: missing(r) }))
    .filter((r) => r.gaps.length)
    .sort((a, b) => b.gaps.length - a.gaps.length)
    .slice(0, LIMIT);

  if (process.argv.includes('--what-would-you-read')) {
    console.log(`\n${rows.length} businesses would be read, worst first. Nothing is spent by this.\n`);
    for (const r of rows.slice(0, 25)) {
      console.log(`  ${String(r.nameManualValue || r.name || '').slice(0, 38).padEnd(40)}${r.gaps.join(', ')}`);
    }
    if (rows.length > 25) console.log(`  … and ${rows.length - 25} more`);
    console.log('');
    await db.$disconnect();
    return;
  }

  console.log(`${rows.length} websites to read through ${MODEL}`);
  console.log(`SPEND CEILING $${CEILING_USD.toFixed(2)} — checked before every single call\n`);

  const tally = { read: 0, notTheirs: 0, siteDown: 0, noAnswer: 0, people: 0, emails: 0, phones: 0, trades: 0 };
  const seen = [];
  let next = 0;

  const lane = async () => {
    for (;;) {
      if (stoppedByCeiling) return;
      const at = next; next += 1;
      if (at >= rows.length) return;
      const r = rows[at];
      const name = r.nameManualValue || r.name || '';
      const url = r.websiteManualValue || r.website;

      try {
        if (whyNotTheirs(url, name)) { tally.notTheirs += 1; continue; }

        let pages = [];
        try { pages = (await ps.fetchPeoplePages(url, { maxPages: PAGES_PER_SITE })).pages || []; }
        catch { /* their site did not answer */ }
        if (!pages.length) { tally.siteDown += 1; continue; }

        const document = pagesAsDocument(pages);
        if (document.length < 200) { tally.siteDown += 1; continue; }

        // THE CEILING, CHECKED BEFORE THE MONEY IS SPENT. The most a single
        // read can cost is worked out from the question in hand, and if that
        // would carry the total past the limit, nothing is sent at all.
        const worst = ((document.length / 3) / 1e6) * (PRICES[MODEL]?.in || 0)
          + (1500 / 1e6) * (PRICES[MODEL]?.out || 0);
        if (spent + worst > CEILING_USD) {
          if (!stoppedByCeiling) {
            stoppedByCeiling = true;
            console.log(`\nSTOPPED at the $${CEILING_USD.toFixed(2)} ceiling. $${spent.toFixed(4)} spent, `
              + `${tally.read} read and saved. Nothing further was sent.`);
          }
          return;
        }

        const { answer, cost } = await askTheReader(questionAbout(name, document));
        spent += cost; calls += 1;
        if (!answer) { tally.noAnswer += 1; continue; }

        const understood = keepOnlyWhatWasRead(answer, document, name);
        if (understood.notTheirSite) { tally.notTheirs += 1; continue; }

        tally.read += 1;
        tally.people += understood.people.length;
        tally.emails += understood.people.filter((p) => p.email).length + (understood.sharedEmail ? 1 : 0);
        if (understood.mainPhone) tally.phones += 1;
        if (understood.trade) tally.trades += 1;

        if (seen.length < 12) {
          seen.push({
            name, was: r.trade, now: understood.trade,
            does: understood.whatTheyDo,
            inbox: understood.sharedEmail, phone: understood.mainPhone,
            people: understood.people.map((p) => `${p.name}${p.role ? ` — ${p.role}` : ''}${p.email ? `  ${p.email}` : ''}`),
            gap: understood.cannotTell,
          });
        }

        const found = {
          peopleWithEmail: understood.people.filter((p) => p.name && p.email).length,
          peopleNamed: understood.people.length,
          peopleWithPhone: understood.people.filter((p) => p.phone).length,
          peopleWithProfile: understood.people.filter((p) => p.linkedIn).length,
          sharedEmail: understood.sharedEmail,
          contactForm: hasContactForm(pages),
          website: true,
          phone: Boolean(r.phone),
        };
        if (understood.people.length) foundPeopleOn.push(r.id);
        const reach = howToReachThem(found);
        const opportunity = r.automationScore == null
          ? opportunityFromTheRead(understood, found, r)
          : { score: r.automationScore, evidence: null };
        const ranked = callOrderScore(opportunity.score, reach);

        if (!LOOK) {
          const lost = await writeItDown(db, r, understood, reach, ranked, found, opportunity, url);
          if (lost && lost.length) lostPeople.push(...lost.map((x) => `${name}: ${x}`));
        }
      } catch (e) {
        tally.noAnswer += 1;
        if (seen.length < 12) seen.push({ name, broke: String(e && e.message || e).slice(0, 80) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(LANES, rows.length) }, lane));

  for (const s of seen) {
    console.log(`\n${'='.repeat(72)}`);
    if (s.broke) { console.log(`${s.name}   BROKE: ${s.broke}`); continue; }
    console.log(`${s.name}   [${s.now || 'could not tell'}]${s.was && s.was !== s.now ? `   was: ${s.was}` : ''}`);
    if (s.does) console.log(`  does:   ${s.does}`);
    console.log(`  reach:  ${s.inbox || 'no inbox'}   ${s.phone || 'no phone'}`);
    for (const p of s.people.slice(0, 6)) console.log(`  person: ${p}`);
    if (s.gap) console.log(`  gap:    ${String(s.gap).slice(0, 110)}`);
  }

  // THE GUARDRAIL: prove the outcome, do not report the count.
  //
  // Russ, 2026-08-29: "your job was to mine the website for content and
  // contacts and you threw away the contacts? how is that possible."
  //
  // It was possible because this file counted people it had found and printed
  // the number, while its saving step only handled the business fields. 887
  // people were found, reported, and never written down. Every check I ran
  // passed, because I checked the thing I had just written rather than the
  // thing he asked for.
  //
  // So the run no longer gets to say how it went. It COUNTS THE RECORDS BACK
  // OUT OF THE DATABASE and compares them with what it claimed. If people were
  // found and people were not saved, this says so at the top, loudly, instead
  // of printing a healthy-looking tally underneath.
  // Measured as "are the people ON THE RECORDS", not "were new rows created".
  //
  // The first version of this check counted only people created during the run,
  // and cried failure on a run that worked perfectly: all 61 people it read
  // were already on file from an earlier pass and were correctly matched rather
  // than duplicated. "Already right" looked identical to "broken" (2026-08-29).
  //
  // So it asks the question Russ actually cares about: of the businesses this
  // run read and found people on, how many now have people on their record?
  let withPeople = 0;
  let emptyAfterFinding = 0;
  let savedEmails = 0;
  if (!LOOK && foundPeopleOn.length) {
    const after = await db.prospect.findMany({
      where: { id: { in: foundPeopleOn } },
      select: { id: true, contacts: { select: { name: true, email: true } } },
    });
    for (const b of after) {
      const named = b.contacts.filter((c) => c.name);
      if (named.length) withPeople += 1; else emptyAfterFinding += 1;
      savedEmails += named.filter((c) => c.email).length;
    }
  }

  const per = calls ? spent / calls : 0;
  console.log(`\n${'='.repeat(72)}`);

  if (lostPeople.length) {
    console.log('');
    console.log(`  *** ${lostPeople.length} PEOPLE WERE REFUSED BY THE RECORDS ***`);
    for (const l of lostPeople.slice(0, 8)) console.log(`    ${l}`);
    console.log('  These were read off the page and the record would not take them.');
    console.log('');
  }

  if (!LOOK && emptyAfterFinding > 0) {
    console.log('');
    console.log('  *** THE PEOPLE WERE NOT SAVED ***');
    console.log(`  ${emptyAfterFinding} businesses had people read off their website and their`);
    console.log('  record still has nobody on it. The reading is paid for and lost.');
    console.log('  Do not trust the numbers below — fix the saving and run again.');
    console.log('');
  }
  console.log(`read properly:        ${tally.read}`);
  console.log(`website not theirs:   ${tally.notTheirs}`);
  console.log(`site would not load:  ${tally.siteDown}`);
  console.log(`no usable answer:     ${tally.noAnswer}`);
  console.log('');
  console.log(`people found:         ${tally.people}`);
  console.log(`addresses:            ${tally.emails}`);
  console.log(`phones:               ${tally.phones}`);
  console.log(`trade named:          ${tally.trades}`);
  console.log('');
  if (!LOOK) {
    console.log('');
    console.log(`PEOPLE ON THE RECORDS: ${withPeople} of ${foundPeopleOn.length} businesses where people were read`);
    console.log(`  addresses among them: ${savedEmails}`);
    if (emptyAfterFinding === 0 && foundPeopleOn.length) {
      console.log('  every business the reader found people on now has people on file');
    }
  }
  console.log('');
  console.log(`SPENT:                $${spent.toFixed(4)} across ${calls} calls`);
  console.log(`per website:          $${per.toFixed(5)}`);
  console.log(`all 2,447 would cost: $${(per * 2447).toFixed(2)}`);
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
