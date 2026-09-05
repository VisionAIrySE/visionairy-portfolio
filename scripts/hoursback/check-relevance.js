#!/usr/bin/env node
// IS THE JOB WE NAMED THE RIGHT JOB FOR THIS BUSINESS?
//
// Russ, 2026-09-04: "THE IDEA IS TO FIND OFFERINGS THAT FIT THE BUSINESS, NOT
// FIND BUSINESSES THAT FIT THE OFFERING."
//
// The sentence writer picks a repetitive job off their pages. It never asks
// whether that job is the RIGHT one to name to a business of this kind and this
// size. So a 1,400-person grocery chain was told about tracking catering
// bookings, work they have had software for since before we existed, and a
// no-kill animal shelter was told it was losing revenue.
//
// This asks that question, business by business, and nothing else. It writes no
// letters and changes no records. It reads their own pages, the sentence we
// wrote, and how many people work there, and comes back with hold or send, plus
// the better job where there is one.
//
//   node scripts/hoursback/check-relevance.js --limit=60

const { PrismaClient } = require('@prisma/client');
const { makeReaderPool } = require('../../src/hoursback/readerPool.js');
const fs = require('fs');

const db = new PrismaClient();
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const LIMIT = Math.min(Number(arg('limit', 60)) || 60, 60);
const OUT = arg('out', 'docs/hoursback/relevance-check.md');

function question(p, named, pages) {
  return `A one-person consultancy offers small businesses fifteen free minutes to find
which repetitive office work is eating their week, then recommends a tool to take
it off them. EVERY business qualifies for that offer, whatever its size. The only
question is WHICH repetitive jobs are worth naming to THIS business.

The letter is meant to name TWO of them. Two different kinds of work, not one job
said twice.

THE BUSINESS
Name: ${p.name}
Trade: ${p.trade || 'not known'}
People who work there: ${p.employeeCount ?? 'not known'}

FROM THEIR OWN PAGES
${pages}

WHAT THE LETTER SAYS NOW
"${named}"

Answer three things.

1. HOW MANY JOBS does that passage actually name? One, or two genuinely
   different kinds of work?

2. FOR EACH ONE, does it hold for THIS business? A job is WRONG when:
   - a business this size has plainly had software for it for years (a grocery
     chain does not hand-track stock; a 70-broker firm does not hand-route leads)
   - the cost named is wrong for what they are (a charity does not lose "sales")
   - their pages do not actually show them doing it
   - it is too small to be worth a stranger's letter
   It is RIGHT when a person there plainly still does it by hand, often, and it
   costs them something real.

3. NAME THE TWO BEST JOBS from their pages — the repetitive work a business of
   this exact kind and size really does still do by hand, strongest first. These
   may be the ones already named, or better ones. If their pages only support
   one, say so and give one. Never invent a second to fill the slot.

Reply with JSON only:
{"jobsNamed": 1 or 2,
 "verdict": "send" | "hold",
 "why": "one plain sentence saying why it holds or does not",
 "bestTwo": ["the strongest job, in plain words", "the second, or null"]}`;
}

(async () => {
  const reachable = {
    doNotContact: false, repliedAt: null, emailBouncedAt: null,
    OR: [{ email: { not: null } }, { emailManualValue: { not: null } }],
  };
  const ms = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] },
      openedWith: { not: 'after_the_call' }, prospect: reachable,
    },
    select: {
      id: true, body: true,
      prospect: {
        select: {
          id: true, name: true, trade: true, employeeCount: true, website: true, websiteManualValue: true,
          // EVERY READ, NOT THE NEWEST ONE (2026-09-04). Taking only the most
          // recent successful read handed the reader an empty page for all 58
          // businesses, because a later read can finish with no pages while an
          // earlier one holds eight. The run then reported "cannot access their
          // website" 39 times and I nearly passed that off as a judgement.
          readings: {
            where: { source: 'website', outcome: 'read' },
            select: { pages: { select: { text: true }, take: 8 } },
            orderBy: { startedAt: 'desc' },
          },
        },
      },
    },
    take: LIMIT,
  });

  const pool = makeReaderPool({ size: 4, hardKillMs: 120000 });
  const rows = [];
  let done = 0;
  for (const m of ms) {
    const p = m.prospect;
    const named = (m.body.split(/\n\s*\n/)[1] || '').trim();
    const best = (p.readings || []).find((r) => (r.pages || []).some((pg) => String(pg.text || '').trim().length > 200));
    const pages = (best?.pages || [])
      .map((pg) => String(pg.text || '').slice(0, 1400)).filter((t) => t.trim()).join('\n---\n').slice(0, 7000)
      || '(their pages are not on file)';
    // NOTHING IS ASKED ABOUT A BUSINESS WHOSE PAGES WE DO NOT HOLD. Asking
    // anyway is how a run of 58 came back as 39 "cannot tell" dressed as a
    // verdict.
    if (pages.startsWith('(their pages')) {
      rows.push({
        name: p.name, size: p.employeeCount, trade: p.trade, verdict: 'no pages on file',
        why: 'their website has never been read right through, so there is nothing to judge against',
        better: null, named,
      });
      done += 1;
      console.log(`${done}/${ms.length}  NO PAGES      ${p.name}`);
      continue;
    }
    const got = await pool.ask(question(p, named, pages));
    const a = got && got.answer ? got.answer : null;
    // AN ANSWER IN AN UNEXPECTED SHAPE IS STILL AN ANSWER, and it must never
    // stop the run. The first version read a.verdict straight and died on the
    // tenth business when one came back without that word in it.
    const v = a && typeof a.verdict === 'string' ? a.verdict.toLowerCase().trim() : null;
    const verdict = v === 'send' || v === 'hold' ? v : 'could not tell';
    const twoBest = Array.isArray(a && a.bestTwo) ? a.bestTwo.filter(Boolean) : [];
    rows.push({
      name: p.name, size: p.employeeCount, trade: p.trade,
      verdict,
      jobsNamed: (a && a.jobsNamed) || null,
      why: (a && (a.why || a.reason)) || (got && got.why) || 'the reader gave no usable answer',
      best: twoBest,
      named,
    });
    done += 1;
    console.log(`${done}/${ms.length}  ${verdict.toUpperCase().padEnd(13)} ${p.name}`);
  }
  pool.close();

  const hold = rows.filter((r) => r.verdict === 'hold');
  const send = rows.filter((r) => r.verdict === 'send');
  const unsure = rows.filter((r) => r.verdict === 'could not tell');
  const lines = ['# Is the job we named the right job for this business?', '',
    `Asked of ${rows.length} businesses. **${send.length} hold up. ${hold.length} do not.**`,
    '', 'Nothing has been changed. This only asks the question.', '',
    '## The ones to hold', ''];
  for (const r of hold) {
    lines.push(`### ${r.name}${r.size ? ` — ${r.size} people` : ''}`);
    lines.push(`- **Why:** ${r.why}`);
    lines.push(`- **Jobs the letter names:** ${r.jobsNamed ?? 'unclear'}`);
    lines.push(`- **We named:** ${r.named.slice(0, 220)}`);
    lines.push(`- **The two worth naming:** ${r.best.length ? r.best.map((b, i) => `\n    ${i + 1}. ${b}`).join('') : 'their pages do not show two'}`, '');
  }
  lines.push('## The ones that hold up', '');
  for (const r of send) {
    lines.push(`- **${r.name}** (names ${r.jobsNamed ?? '?'}) — ${r.why}`);
    if (r.best.length) lines.push(`  - worth naming: ${r.best.join(' / ')}`);
  }
  if (unsure.length) {
    lines.push('', '## Could not tell — these need your eye', '');
    for (const r of unsure) lines.push(`- **${r.name}** — ${r.why}`);
  }
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`\n${send.length} hold up, ${hold.length} to hold. Written to ${OUT}`);
  await db.$disconnect();
})();
