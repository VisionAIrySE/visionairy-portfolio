#!/usr/bin/env node
// Read each business's own website the way a person would, and understand it.
//
//   node scripts/hoursback/read-for-meaning.js --dry-run --limit=10
//   node scripts/hoursback/read-for-meaning.js --limit=645
//
// Russ, 2026-08-28, having asked more than once: "Stop doing keyword bullshit
// and use your semantic language capabilities to UNDERSTAND what is on the
// pages."
//
// He is right, and every data fault he found tonight came from ignoring that.
// A rule that scans for words put a firm of accountants down as dental because
// "dental insurance" appeared in a benefits list, and a roofing supplier down
// as accountants. Making the rule cleverer only moved the mistake somewhere he
// had not looked yet.
//
// So this does not match words. It hands the page to a language model and asks
// what the business IS, what it DOES, and WHO is named — and takes "I cannot
// tell" for an answer, which no keyword rule can ever say.
//
// COST. It runs on the Claude Code login already on this machine, using Haiku,
// which is the cheapest model able to read a page properly. A CEILING is set
// in code before the first run, because a loop that spends money without one
// has cost Russ real money before (see the standing rule on spend).

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const ps = require('../../src/hoursback/peopleSweep.js');
const { textOf } = require('../../src/hoursback/enrich.js');
const { whyNotTheirs } = require('../../src/hoursback/notTheirSite.js');

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number(arg('limit', 25));

// --- the ceilings, in code, before anything runs ----------------------------
const MOST_BUSINESSES_EVER = 700;      // the whole emailable list and no more
const READS_PER_MINUTE = 40;           // polite, and keeps the bill flat
const PAGE_CHARS = 6000;               // one page's worth of words, no more
const MODEL = 'haiku';

const TRADES = ['dental', 'veterinary', 'medical', 'legal', 'accounting', 'insurance',
  'real estate', 'construction', 'trades', 'auto', 'landscaping', 'manufacturing',
  'storage & logistics', 'retail & food', 'staffing', 'personal care',
  'fitness & recreation', 'lodging & hospitality', 'cleaning & facilities',
  'agriculture', 'education & childcare', 'nonprofit & community',
  'professional services', 'funeral & memorial'];

// Ask, and take "I cannot tell" for an answer.
function ask(prompt) {
  return new Promise((resolve) => {
    execFile('claude', ['-p', prompt, '--model', MODEL], { timeout: 90000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null);
        const m = String(stdout).match(/\{[\s\S]*\}/);
        if (!m) return resolve(null);
        try { resolve(JSON.parse(m[0])); } catch { resolve(null); }
      });
  });
}

function questionFor(name, text) {
  return `You are reading the home page of a small business to fill in a customer record. Read it for MEANING, not keywords.

The business is called: ${name}

Their page says:
"""
${text}
"""

Answer with JSON only, no other words:
{
  "trade": one of ${JSON.stringify(TRADES)} or null,
  "confident": true or false,
  "whatTheyDo": one short sentence in their own terms, or null,
  "why": if trade is null, one plain sentence saying what the page does not make clear
}

Rules that matter more than filling the field:
- Judge what the business IS, not what words appear. A firm of accountants that mentions dental insurance is accounting. A supplier that sells to roofers is not a roofing contractor.
- If the page does not make it clear, return null and say so in "why". A wrong answer is far worse than no answer.
- "confident" is false whenever you are choosing between two.`;
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const take = Math.min(LIMIT, MOST_BUSINESSES_EVER);
  const rows = await db.prospect.findMany({
    where: { doNotContact: false, NOT: [{ AND: [{ email: null }, { emailManualValue: null }] }] },
    select: { id: true, name: true, nameManualValue: true, trade: true, website: true, websiteManualValue: true },
    orderBy: { automationScore: 'desc' },
    take,
  });

  console.log(`${rows.length} businesses to read (ceiling ${MOST_BUSINESSES_EVER})`);
  console.log(DRY ? 'DRY RUN — nothing written\n' : `reading with ${MODEL}\n`);

  const out = { read: 0, confirmed: 0, corrected: 0, couldNotTell: 0, noSite: 0 };
  const shown = [];
  const gap = Math.ceil(60000 / READS_PER_MINUTE);

  for (const r of rows) {
    const name = r.nameManualValue || r.name || '';
    const url = r.websiteManualValue || r.website;
    if (!url || whyNotTheirs(url, name)) { out.noSite += 1; continue; }

    let text = '';
    try {
      const got = await ps.fetchPeoplePages(url, { maxPages: 1 });
      text = got.pages && got.pages[0] ? textOf(got.pages[0].html).slice(0, PAGE_CHARS) : '';
    } catch { /* their site did not answer */ }
    if (text.length < 60) { out.noSite += 1; continue; }

    const said = await ask(questionFor(name, text));
    out.read += 1;
    if (!said || !said.trade || said.confident === false) {
      out.couldNotTell += 1;
      if (shown.length < 30) shown.push(`  ?  ${name.slice(0, 26).padEnd(28)}${(said && said.why) || 'no answer'}`);
    } else if (said.trade === r.trade) {
      out.confirmed += 1;
    } else {
      out.corrected += 1;
      if (shown.length < 30) shown.push(`  ->  ${name.slice(0, 26).padEnd(28)}${String(r.trade || 'none').padEnd(20)}-> ${said.trade}   ${String(said.whatTheyDo || '').slice(0, 46)}`);
    }

    if (!DRY && said && said.trade && said.confident !== false) {
      await db.prospect.update({
        where: { id: r.id },
        data: { trade: said.trade, ...(said.whatTheyDo ? { theirWork: said.whatTheyDo } : {}) },
      });
    }
    await new Promise((s) => setTimeout(s, gap));
  }

  console.log(`read:              ${out.read}`);
  console.log(`trade confirmed:   ${out.confirmed}`);
  console.log(`trade CORRECTED:   ${out.corrected}`);
  console.log(`could not tell:    ${out.couldNotTell}`);
  console.log(`no site of theirs: ${out.noSite}`);
  console.log('');
  shown.forEach((l) => console.log(l));
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
