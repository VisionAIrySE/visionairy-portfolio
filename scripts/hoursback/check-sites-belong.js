#!/usr/bin/env node
// Is the website on this record actually THIS business's website?
//
//   node scripts/hoursback/check-sites-belong.js --limit=50
//
// Three different businesses on the list — Smith Rock Bookkeeping, Smith Rock
// Masonry and Smith Rock Climbing — all carry smithrock.com, which is a guide
// to the state park. Happy Dog Real Estate carries happydog.com. Blue Moon
// Designs, which Russ says makes helicopter tooling, carries a property-
// management software site (all found 2026-08-31).
//
// The website hunt kept a page when it "names that business or its town". A
// page about Smith Rock State Park names Smith Rock, so every business with
// Smith Rock in its name matched it. The check could never catch that, because
// the page really does contain the words.
//
// The only test that works is the one a person would use: does the site
// describe a business this name could belong to? A masonry company's website
// is about masonry. So the name and the site's own words go to a model, and it
// answers whether they can be the same business.
//
// Nothing is written to the record. Wrong websites are the reason 88 trades
// came back mismatched, and a correction made on top of a wrong website is
// just a second mistake.
//
// COST. Local Haiku through the Claude Code login. Fifty at a time. No paid
// call, no OpenRouter — standing order, Russ, 2026-08-29.

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

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const DRY = process.argv.includes('--dry-run');
const LIMIT = Math.min(Number(arg('limit', 50)), 50);
const OUT = arg('output', 'docs/hoursback/site-check.md');
const SEEN = 'docs/hoursback/site-check-done.json';
const MODEL = 'haiku';
const READS_PER_MINUTE = 40;

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

function questionFor(name, domain, words) {
  return `A customer record has a business name and a website. Judge whether that website belongs to that business.

Business name on the record: ${name}
Website on the record: ${domain}
What that website says about itself: ${words}

Answer with JSON only:
{
  "theirs": true or false,
  "why": one short sentence
}

The test is whether the website describes a business this NAME could belong to. A masonry company's website is about masonry. A bookkeeper's website is about bookkeeping.

Watch for the trap that produced this check: a website about a PLACE matching a business named after that place. "Smith Rock Masonry" and a guide to Smith Rock State Park share the words "Smith Rock" and are not the same business. Same for a business named after a common phrase and a national brand that owns that phrase as a domain.

Answer theirs:true when the site plainly describes the kind of business the name implies, or when the name is generic enough that you cannot say it is wrong. Answer theirs:false only when the site describes something the named business clearly is not. A wrong accusation costs a real business a message, so when genuinely unsure, answer true.`;
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  let done = [];
  try { done = JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch { done = []; }

  const where = {
    messages: { some: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } } },
    id: { notIn: done },
    OR: [{ theirWork: { not: null } }, { selfDescription: { not: null } }],
  };
  const rows = await db.prospect.findMany({
    where,
    select: { id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true, theirWork: true, selfDescription: true },
    orderBy: { automationScore: 'desc' },
    take: LIMIT,
  });
  const left = await db.prospect.count({ where });

  console.log(`${rows.length} to check now, ${left} unchecked in total (local ${MODEL})`);
  const lines = [];
  const gap = Math.ceil(60000 / READS_PER_MINUTE);
  let wrong = 0;

  for (const r of rows) {
    const name = r.nameManualValue || r.name || '';
    const site = r.websiteManualValue || r.website || '';
    const words = [r.theirWork, r.selfDescription].filter(Boolean).join(' — ').slice(0, 900);
    if (!site) { done.push(r.id); continue; }
    const said = await ask(questionFor(name, site, words));
    await new Promise((s) => setTimeout(s, gap));
    if (!said) continue;
    done.push(r.id);
    if (said.theirs === false) {
      wrong += 1;
      lines.push(`- **${name}** — carries ${site}, which is not theirs. ${said.why || ''}\n  - id: \`${r.id}\`\n  - the site says: ${words.slice(0, 180)}`);
      console.log(`  x ${name} -> ${site}`);
    }
  }

  const before = (() => { try { return fs.readFileSync(OUT, 'utf8'); } catch { return ''; } })();
  const kept = before.split('\n').filter((l) => l.startsWith('- **') || l.startsWith('  '));
  const header = `# Websites that do not belong to the business they are on\n\n`
    + `${done.length} businesses with a live email checked.\n`
    + `${kept.filter((l) => l.startsWith('- **')).length + lines.length} carry somebody else's website. Nothing has been written to the record.\n\n`;
  if (!DRY) {
    fs.writeFileSync(OUT, header + kept.join('\n') + (kept.length ? '\n' : '') + lines.join('\n') + '\n');
    fs.writeFileSync(SEEN, JSON.stringify(done));
  }
  console.log(`\n${wrong} of ${rows.length} wrong this batch. ${done.length} checked, ${left - rows.length} left.`);
  await db.$disconnect();
})().catch((e) => { console.error('site check failed:', e.message); process.exit(1); });
