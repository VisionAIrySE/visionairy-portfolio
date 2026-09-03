#!/usr/bin/env node
// THE FOLLOW-UP RESEARCH LIST (Russ, 2026-09-03).
//
//   node scripts/hoursback/needs-research.js --look     (say what it would mark)
//   node scripts/hoursback/needs-research.js            (mark them)
//
// Businesses we cannot finish on the evidence we have, kept on the list rather
// than quietly dropped. Russ decides what happens to each one; this only says
// what is in the way, and why.
//
// FOUR REASONS, and each is a fact we actually hold:
//
//   acquired            their whole website says the business is now part of
//                       another one. Bisnett Insurance's entire site reads
//                       "Bisnett Insurance is now a part of ... (800) 303-0419".
//   no_working_website  the address answers, and what comes back is a builder's
//                       placeholder or a cookie notice. juniper-insurance.com
//                       says "Go from idea to live site in minutes."
//   page_is_not_theirs  what we found is a directory, a locator or somebody
//                       else's listing. NOT a judgement about chains: a
//                       franchise location is a real business and stays.
//   name_is_a_page_title  they are on file under the title bar of a web page
//                       rather than their name: "HOME", "Best Vet Hospital In
//                       Redmond, OR".
//
// NOTHING IS DELETED AND NOTHING IS OVERWRITTEN. Each reason is written as its
// own finding against its own reading, with the words that prove it. A business
// can carry more than one. Run it twice and it does not double up: a live
// finding for the same reason already on file is left exactly as it is.

const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));

const { PrismaClient } = require('@prisma/client');
const R = require('../../src/hoursback/readings.js');
const { nameLooksLikeAPageTitle } = require('../../src/hoursback/crm/names.js');
// The LOCAL reader, the same one the site reads use. No OpenRouter, no paid
// call. Six questions on the whole list today; the ceiling below is in code
// before it runs anyway.
const { askTheReader } = require('./understand-businesses.js');
const { readAnswer } = require('../../src/hoursback/readAnswer.js');

// MOST QUESTIONS THIS RUN MAY ASK. Structural filtering should leave a
// handful; if it ever leaves hundreds, the run stops rather than spending.
const MOST_QUESTIONS = 60;

const READER = 'needs-research';
const READER_VERSION = '2026-09-03';
const FIELD = 'needsResearch';

const LOOK = process.argv.includes('--look');
const arg = (n, d) => {
  const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : d;
};
const LIMIT = Number(arg('limit', 0)) || 0;

// --- a site with almost nothing on it gets ASKED about, never guessed at ----
//
// The first version of this file matched "is now" and "start building" in the
// page text. It found twelve acquisitions, and eleven of them were sentences
// like "Bend is now the headquarters for the Deschutes National Forest" and
// "the Supper Club menu is now live". Those findings were retired, with the
// reason, rather than deleted.
//
// This is the mistake this repository already knows about: a keyword rule over
// page text is a defect. Hand it to a reader and let it say it cannot tell.
//
// Asking every business would be thousands of calls for nothing. So the filter
// is STRUCTURAL and free: a whole website holding under this many characters
// is not a website anybody built to sell with. Six businesses out of a hundred
// and six qualify. Only those six are asked.
const A_WHOLE_SITE_THIS_SMALL_IS_NOT_A_SITE = 800;

const THE_QUESTION = (name, words) => `Here is EVERY word on the website of a business on file as "${name}".

"""
${words}
"""

That is the whole site. A real business website has more than this, so one of a few things is true. Read what is actually there and say which.

Answer with JSON and nothing else:

{
  "verdict": one of "acquired", "no_working_website", "a_real_small_site", "cannot_tell",
  "quote": the sentence from the words above that proves your answer, copied exactly, or null
}

"acquired" ONLY where the words themselves say this business is now part of, owned by, merged with or trading as another company. A sentence that merely contains "is now" is not an acquisition.
"no_working_website" where what is there is a website builder's placeholder, a parked domain, a cookie notice, a robot check, or a page that was never built.
"a_real_small_site" where this is simply a small business with a small site, and the words are their own.
"cannot_tell" where the words do not settle it. Say that rather than choosing the closest answer, and set quote to null.`;

/// Everything a visit stored, as one string.
function wordsOfVisit(reading) {
  return (reading.pages || []).map((p) => String(p.text || '')).join('\n');
}

/// One question about one tiny site. Never guesses on the reader's behalf: an
/// answer that will not parse is treated as no answer at all.
async function askAboutATinySite(name, words) {
  let reply;
  try {
    reply = await askTheReader(THE_QUESTION(name, words));
  } catch {
    return null;
  }
  const answer = reply && reply.answer ? reply.answer : readAnswer(String(reply || '')).answer;
  if (!answer || typeof answer !== 'object') return null;
  const verdict = String(answer.verdict || '').trim();
  if (!['acquired', 'no_working_website', 'a_real_small_site', 'cannot_tell'].includes(verdict)) return null;
  return { verdict, quote: answer.quote ? String(answer.quote).slice(0, 300) : null };
}

async function alreadyOnTheList(db, prospectId, why) {
  const found = await db.finding.findFirst({
    where: { prospectId, field: FIELD, value: why, retiredAt: null },
    select: { id: true },
  });
  return Boolean(found);
}

async function markIt(db, prospect, reasons) {
  const reading = await R.startReading(db, {
    prospectId: prospect.id,
    source: R.HAND,
    sourceUrl: prospect.websiteManualValue || prospect.website || null,
    reader: READER,
    readerVersion: READER_VERSION,
  });
  for (const { why, quote, status } of reasons) {
    await R.record(db, {
      readingId: reading.id,
      prospectId: prospect.id,
      field: FIELD,
      value: why,
      status,
      url: prospect.websiteManualValue || prospect.website || null,
      quote,
    });
  }
  await R.finishReading(db, reading.id, R.READ, reasons.map((r) => r.why).join(', '));
}

async function main() {
  const db = new PrismaClient();
  const tally = {
    acquired: 0, no_working_website: 0, page_is_not_theirs: 0, name_is_a_page_title: 0,
  };
  const examples = [];
  let asked = 0;

  // TWO PASSES, BECAUSE THEY NEED DIFFERENT THINGS (2026-09-03).
  //
  // Written as one pass this loaded every page of every website for all 32,739
  // businesses and never finished. The name check needs no page text at all,
  // and the site checks are only about businesses we have actually read — 106
  // of them. So the names are swept cheaply across everybody, and the words
  // are loaded only where words exist.
  const put = async (p, reasons) => {
    if (!reasons.length) return;
    const fresh = [];
    for (const r of reasons) {
      if (await alreadyOnTheList(db, p.id, r.why)) continue;
      fresh.push(r);
    }
    if (!fresh.length) return;
    for (const r of fresh) tally[r.why] += 1;
    if (examples.length < 14) {
      examples.push(`  ${String(p.nameManualValue || p.name).slice(0, 34).padEnd(36)} ${fresh.map((r) => r.why).join(', ')}`);
    }
    if (!LOOK) await markIt(db, p, fresh);
  };

  try {
    // --- pass one: the name, for everybody, with no page text loaded --------
    const named = await db.prospect.findMany({
      where: { doNotContact: false, nameManualValue: null },
      select: { id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true },
      ...(LIMIT ? { take: LIMIT } : {}),
    });
    console.log(`${named.length} names looked at${LOOK ? ' — LOOKING ONLY, nothing will be written' : ''}`);
    for (const p of named) {
      if (!nameLooksLikeAPageTitle(p.name)) continue;
      await put(p, [{ why: 'name_is_a_page_title', quote: `on file as: ${p.name}`, status: R.OBSERVED }]);
    }

    // --- pass two: the site, only where we have actually read one -----------
    const visits = await db.reading.findMany({
      where: { source: R.WEBSITE, reader: 'understand-businesses' },
      orderBy: { startedAt: 'asc' },
      select: {
        prospectId: true, outcome: true, note: true,
        pages: { select: { text: true } },
        findings: { where: { field: 'theirOwnSite' }, select: { value: true, quote: true } },
        prospect: {
          select: {
            id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true,
          },
        },
      },
    });
    const latest = new Map();
    for (const v of visits) latest.set(v.prospectId, v);   // ascending, so the last wins
    console.log(`${latest.size} businesses whose website we have visited`);

    for (const visit of latest.values()) {
      const p = visit.prospect;
      const reasons = [];

      const notTheirs = visit.findings.some((f) => String(f.value).toLowerCase() === 'no')
        || /not their site/i.test(String(visit.note || ''));
      if (notTheirs) {
        reasons.push({
          why: 'page_is_not_theirs',
          quote: String((visit.findings[0] && visit.findings[0].quote) || visit.note || '').slice(0, 300)
            || 'the visit judged the page to belong to somebody else',
          status: R.INFERRED,
        });
      }

      const held = visit.pages.map((pg) => String(pg.text || '')).join('\n').trim();
      if (held && held.length < A_WHOLE_SITE_THIS_SMALL_IS_NOT_A_SITE) {
        if (asked >= MOST_QUESTIONS) {
          console.log(`stopping the questions: ${MOST_QUESTIONS} is the ceiling for one run`);
        } else {
          asked += 1;
          const said = await askAboutATinySite(p.nameManualValue || p.name, held);
          if (said && (said.verdict === 'acquired' || said.verdict === 'no_working_website')) {
            reasons.push({
              why: said.verdict,
              quote: said.quote || `their whole website is ${held.length} characters`,
              status: said.quote ? R.OBSERVED : R.INFERRED,
            });
          }
          // "a real small site" and "cannot tell" put nobody on the list.
        }
      }

      await put(p, reasons);
    }

    console.log('\nnewly put on the follow-up list:');
    console.log(`  acquired                 ${tally.acquired}`);
    console.log(`  no working website       ${tally.no_working_website}`);
    console.log(`  the page is not theirs   ${tally.page_is_not_theirs}`);
    console.log(`  name is a page title     ${tally.name_is_a_page_title}`);
    if (examples.length) { console.log('\nfor example:'); console.log(examples.join('\n')); }
    console.log(`\nquestions asked of the reader: ${asked}   (ceiling ${MOST_QUESTIONS}, every one local)`);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { THE_QUESTION, A_WHOLE_SITE_THIS_SMALL_IS_NOT_A_SITE, FIELD, READER };
