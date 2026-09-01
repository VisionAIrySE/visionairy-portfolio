#!/usr/bin/env node
// Ask again whether a website belongs to the business — this time without
// leaning on a name we know is unreliable.
//
//   node scripts/hoursback/recheck-sites-belong.js --look --limit=50
//   node scripts/hoursback/recheck-sites-belong.js --limit=50
//
// WHY THIS EXISTS. The first check (check-sites-belong.js, 2026-08-31) asked
// one question: does this site describe a business this NAME could belong to?
// It named 66. Reading them on 2026-09-01, at least 26 were wrong:
//
//   Blue Sky Veterinary Clinic     blueskyvet.com
//   Evans Tree and Lawn Service    evanstreeandlawn.com
//   King's Auto                    kingsautollc.com
//
// Their own names are in their own domains. The sites are plainly theirs. They
// were flagged because the page brands itself a little differently from the
// record — and because 194 records carry a name that is not a business name at
// all, but a page title or a search phrase: "Home", "HOME", "House Buyers",
// "Top Subaru Auto Repair Near Me", "Bend Oregon Real Estate".
//
// So the check measured a good website against a bad name and blamed the
// website. Applying it would have cleared 26 real sites, their addresses,
// their staff and their drafts.
//
// WHAT CHANGES. The name is no longer the test. The test is whether the site
// describes the same OPERATION — same trade, same town, same work — and the
// question says outright that the record's name may be rubbish, so a name that
// does not match is not evidence of anything.
//
// It answers three ways, not two. "I cannot tell" is a real answer and is not
// quietly rounded to either side (docs/hoursback/evidence-store.md).
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
const LOOK = process.argv.includes('--look');
const LIMIT = Math.min(Number(arg('limit', 50)), 50);   // standing order: fifty
const FROM = arg('from', 'docs/hoursback/site-check.md');
const OUT = arg('output', 'docs/hoursback/site-recheck.md');
const SEEN = 'docs/hoursback/site-recheck-done.json';
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

function questionFor({ name, domain, trade, town, words, siteName }) {
  return `A customer record points at a website. Decide whether that website belongs to that business.

READ THIS FIRST. The NAME on the record is often not the business's name. Many of these records were built from search listings and page titles, so the name may be "Home", "HOME", "House Buyers", "Top Subaru Auto Repair Near Me" or "Bend Oregon Real Estate". A name like that tells you nothing, and a website whose branding differs from it is NOT evidence of anything. Judge the OPERATION, not the wording.

What the record says:
  name on the record: ${name}
  trade on the record: ${trade || '(not recorded)'}
  where they are: ${town || '(not recorded)'}
  website on the record: ${domain}

What that website says about itself:
  ${words}
  the site calls itself: ${siteName || '(does not say)'}

Answer with JSON only:
{
  "verdict": "theirs" or "not_theirs" or "cannot_tell",
  "why": one short sentence,
  "recordNameIsJunk": true if the name on the record is a page title, a search phrase or a generic label rather than a business name
}

Say "theirs" when the site describes the same operation the record describes — the same kind of work, in the same area — even if it is branded under a different or fuller name. A trading name, a parent company, a rebrand and a personal name are all normal. If the domain contains the business's own words, that is strong evidence it is theirs.

Say "not_theirs" ONLY when the site is plainly a DIFFERENT operation: a directory or listing site that carries many businesses, a licence lookup, a marketplace, a parked domain, a national brand that happens to own the phrase, or a company doing genuinely different work in a different place. Shamrock Building Materials is not Trading Bend. FedEx Freight is not a local shipping broker.

Say "cannot_tell" when the site is too thin to judge, or when it could honestly go either way. Do not guess. A wrong "not_theirs" strips a real business of its website, its address, its people and its drafts — that has already nearly happened once, which is why this second check exists.`;
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  const flagged = [...fs.readFileSync(FROM, 'utf8').matchAll(/id: `([a-z0-9]+)`/g)].map((m) => m[1]);
  let done = [];
  try { done = JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch { done = []; }
  const todo = flagged.filter((id) => !done.includes(id));

  const rows = await db.prospect.findMany({
    where: { id: { in: todo.slice(0, LIMIT) } },
    select: {
      id: true, name: true, nameManualValue: true, website: true, websiteManualValue: true,
      trade: true, address: true, addressManualValue: true,
      theirWork: true, selfDescription: true,
    },
  });

  console.log(`${flagged.length} were flagged by the first check`);
  console.log(`${todo.length} still to look at again, doing ${rows.length} now (local ${MODEL})\n`);

  const lines = [];
  const tally = { theirs: 0, not_theirs: 0, cannot_tell: 0, junkName: 0, noAnswer: 0 };
  const gap = Math.ceil(60000 / READS_PER_MINUTE);

  for (const r of rows) {
    const name = r.nameManualValue || r.name || '';
    const site = r.websiteManualValue || r.website || '';
    if (!site) { done.push(r.id); continue; }
    const words = [r.theirWork, r.selfDescription].filter(Boolean).join(' — ').slice(0, 900);
    const siteName = (r.selfDescription || '').match(/calls itself:\s*(.+)$/)?.[1] || null;

    const said = await ask(questionFor({
      name, domain: site, trade: r.trade, town: r.addressManualValue || r.address, words, siteName,
    }));

    if (!said || !['theirs', 'not_theirs', 'cannot_tell'].includes(said.verdict)) {
      tally.noAnswer += 1;
      await new Promise((s) => setTimeout(s, gap));
      continue;
    }

    tally[said.verdict] += 1;
    if (said.recordNameIsJunk === true) tally.junkName += 1;
    done.push(r.id);

    if (said.verdict !== 'theirs') {
      lines.push(`- **${name}** — ${said.verdict === 'not_theirs' ? 'is NOT theirs' : 'cannot be judged'}: ${said.why}`);
      lines.push(`  - id: \`${r.id}\``);
      lines.push(`  - the site on file: ${site}`);
      lines.push(`  - the name on the record ${said.recordNameIsJunk ? 'is NOT a real business name' : 'looks like a real name'}`);
      lines.push(`  - what the site says: ${words.slice(0, 220)}`);
    }
    process.stdout.write(`\r  looked at ${tally.theirs + tally.not_theirs + tally.cannot_tell}   theirs ${tally.theirs}   not theirs ${tally.not_theirs}   cannot tell ${tally.cannot_tell}   `);
    await new Promise((s) => setTimeout(s, gap));
  }

  console.log('\n');
  console.log(`theirs after all:      ${tally.theirs}   <- the first check was wrong about these`);
  console.log(`genuinely not theirs:  ${tally.not_theirs}`);
  console.log(`cannot tell:           ${tally.cannot_tell}`);
  console.log(`reader gave no answer: ${tally.noAnswer}`);
  console.log('');
  console.log(`records whose NAME is the real problem: ${tally.junkName}`);

  if (!LOOK) {
    const head = `# Looking again at the websites the first check called wrong\n\n`
      + `${flagged.length} were flagged. This asks whether the site describes the same OPERATION,\n`
      + `not whether it matches a name — because the names on these records are often\n`
      + `page titles and search phrases rather than business names.\n\n`
      + `Of ${tally.theirs + tally.not_theirs + tally.cannot_tell} looked at so far: `
      + `**${tally.theirs} are theirs after all**, ${tally.not_theirs} genuinely are not, `
      + `${tally.cannot_tell} cannot be judged.\n\nNothing has been written to the record.\n\n`;
    fs.writeFileSync(OUT, head + lines.join('\n') + '\n');
    fs.writeFileSync(SEEN, JSON.stringify(done, null, 0));
    console.log(`\nwritten to ${OUT} — nothing was changed on any record`);
  } else {
    console.log('\nLOOKING ONLY — no report written, nothing changed');
  }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
