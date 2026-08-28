#!/usr/bin/env node
// Find the websites of businesses that came from the state register.
//
//   node scripts/hoursback/find-websites.js --sample=100 --output <path>
//   node scripts/hoursback/find-websites.js --limit=31000 --output <path>
//
// 31,532 businesses arrived from the register as a name, a city and an owner.
// Nobody ever went looking for their websites — the 73 on file were matched
// from an older list, and "73 with a website" was reported as though it meant
// the rest have none (Russ caught it, 2026-08-27: "73 out of 31,532 seems
// pretty unlikely doesn't it?").
//
// HOW IT LOOKS: builds the addresses a business of that name would plausibly
// own, tries each, and keeps one only when the page that answers actually
// names that business or its town. A page that loads is not a match — half the
// short domains in the world are parked or for sale.
//
// WHAT STOPS IT: it proves itself on a sample before it is allowed to run
// wide, and it stops on its own if the hit rate collapses. A run that guesses
// wrong for six hours and reports nothing is worse than no run (Russ: "don't
// allow it to just search on a fail script incessantly").
//
// Free. No key, no account, nothing that can be metered. Nothing touches
// Google.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const outIdx = process.argv.indexOf('--output');
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : null;

const PAGE_TIMEOUT_MS = 9000;
const LANES = Number(arg('lanes', 8));
// The floor exists to stop a BROKEN run, not a modest one. It was set at 12%
// out of nothing and stopped a working search after 200 businesses: 7% proved
// correct across 31,459 is around 2,200 real websites, which is a good night's
// work rather than a failure. Measured on three samples the rate sits at 5-7%,
// so anything under 4% means the guessing has actually stopped working
// (2026-08-27).
const MIN_HIT_RATE = 0.04;
const CHECK_EVERY = 200;

const lines = [];
const say = (s) => { console.log(s); lines.push(s); };

// WHICH MARKET THIS IS.
//
// The one place a new market is described. Everything that decides whether a
// website belongs to a local business reads from here, so pointing this at
// another region is a settings change rather than a rewrite — this is meant to
// be sold to other people in other places one day (Russ, 2026-08-27).
//
// `here` is what a business in this market says on its own home page: a town,
// a county, the state, or a local phone code.
const MARKETS = {
  'central-oregon': {
    name: 'Central Oregon',
    towns: ['bend', 'redmond', 'sisters', 'prineville', 'madras', 'la pine', 'sunriver',
      'terrebonne', 'culver', 'tumalo', 'powell butte', 'warm springs'],
    counties: ['deschutes', 'crook county', 'jefferson county'],
    state: 'oregon',
    areaCode: '541',
    postcodes: /\bor\b ?9[78]\d{3}/,
  },
};

function marketFrom(key) {
  const m = MARKETS[key] || MARKETS['central-oregon'];
  const parts = [
    ...m.towns.map((t) => t.replace(/ /g, ' ?')),
    ...m.counties,
    `central ${m.state}`,
    m.state,
    `\\(?${m.areaCode}\\)? ?[-. ]?\\d{3}`,
  ];
  return {
    ...m,
    here: new RegExp(`\\b(${parts.join('|')}|${m.postcodes.source})\\b`, 'i'),
  };
}

// Which market this run is for. One setting, and it is the only thing that
// would change to run this in Boise or Spokane.
const MARKET = marketFrom(process.env.HOURSBACK_MARKET || 'central-oregon');

// Words that are in a legal name and never in a web address.
const DROP = /\b(llc|l\.l\.c\.?|inc|inc\.?|incorporated|corp|corp\.?|corporation|co|co\.?|company|ltd|limited|lp|llp|pc|p\.c\.?|the|and|of|a|an)\b/gi;

// The addresses a business of this name would plausibly own, likeliest first.
function guessesFor(name, city) {
  const clean = String(name || '')
    .replace(/&/g, ' and ')
    .replace(DROP, ' ')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!clean || clean.length < 3) return [];
  const words = clean.split(' ').filter(Boolean);
  if (!words.length) return [];

  const joined = words.join('');
  const hyphened = words.join('-');
  const town = String(city || '').toLowerCase().replace(/[^a-z]/g, '');
  const out = [];
  const push = (host) => { if (host.length >= 5 && host.length <= 63 && !out.includes(host)) out.push(host); };

  push(`${joined}.com`);
  if (words.length > 1) push(`${hyphened}.com`);
  // First two words: "Cascade Peaks Accounting" -> cascadepeaks.com
  if (words.length > 2) push(`${words.slice(0, 2).join('')}.com`);
  // First word plus the town: "Vernam" in Redmond -> vernamredmond.com
  if (town && words.length === 1) push(`${words[0]}${town}.com`);
  push(`${joined}.net`);
  if (words.length > 1) push(`${words[0]}${words[1]}.net`);
  return out.slice(0, 5);
}

// Does the page that answered actually belong to this business?
//
// A page that loads proves nothing: parked domains, for-sale pages and
// registrar holding pages all return 200. It has to NAME them.
function pageIsTheirs(html, name, city) {
  const text = String(html || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (text.length < 200) return { ok: false, why: 'the page is almost empty' };
  if (/\b(domain (is )?for sale|buy this domain|parked (free )?courtesy|godaddy\.com\/domainsearch|this domain may be for sale|under construction)\b/.test(text)) {
    return { ok: false, why: 'a parked or for-sale page' };
  }
  const words = String(name || '').toLowerCase().replace(DROP, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const named = words.filter((w) => text.includes(w)).length;
  const town = String(city || '').toLowerCase().trim();

  // IT HAS TO BE IN THE MARKET. Matching name words alone put a La Pine church
  // against a national charity at livingwater.com and a Prineville ranch
  // against any Miller Ranch in America (2026-08-27). A local business says
  // where it is somewhere on its own home page — a phone code, a town, a
  // state. Which towns and which code is a SETTING, because this is meant to
  // work in another market one day without a rewrite (Russ, 2026-08-27).
  const inOregon = MARKET.here.test(text);
  const inTown = Boolean(town) && text.includes(town);

  if (!inOregon) return { ok: false, why: `nothing on the page puts them in ${MARKET.name}` };
  // In Oregon AND named: most of the distinctive words, or one plus their town.
  if (words.length && named >= Math.max(1, Math.ceil(words.length * 0.6))) {
    return { ok: true, why: `in ${MARKET.name}, and names ${named} of ${words.length} words from their name` };
  }
  if (named >= 1 && inTown) return { ok: true, why: 'names them and their own town' };
  return { ok: false, why: `in ${MARKET.name} but only ${named} of ${words.length} name words matched` };
}

async function tryHost(host) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), PAGE_TIMEOUT_MS);
  try {
    const r = await fetch(`https://${host}`, {
      signal: c.signal, redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; HoursBack/1.0; +https://visionairy.biz)' },
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return { url: r.url, html: Buffer.from(buf.slice(0, 400000)).toString('utf8') };
  } catch { return null; } finally { clearTimeout(timer); }
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const sample = Number(arg('sample', 0));
  const limit = sample || Number(arg('limit', 200));
  const dry = process.argv.includes('--dry-run') || Boolean(sample);

  const rows = await db.prospect.findMany({
    where: {
      fieldSource: 'oregon-business-register',
      doNotContact: false,
      website: null, websiteManualValue: null,
    },
    select: { id: true, name: true, address: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  say(`${rows.length} register businesses with no website on file`);
  say(sample ? `SAMPLE RUN — nothing will be written` : 'live run — findings are written as they are proved');

  const out = { tried: 0, resolved: 0, theirs: 0, parked: 0, wrongBusiness: 0, nothing: 0 };
  const found = [];
  let i = 0;
  let stopped = null;

  const worker = async () => {
    for (;;) {
      if (stopped) return;
      const n = i; i += 1;
      if (n >= rows.length) return;
      const r = rows[n];
      const city = String(r.address || '').split(',')[0].trim();
      const guesses = guessesFor(r.name, city);
      if (!guesses.length) { out.nothing += 1; continue; }
      out.tried += 1;
      let hit = null;
      for (const host of guesses) {
        const page = await tryHost(host);
        if (!page) continue;
        out.resolved += 1;
        const verdict = pageIsTheirs(page.html, r.name, city);
        if (verdict.ok) { hit = { host, url: page.url, why: verdict.why }; break; }
        if (/parked|for-sale|for sale/.test(verdict.why)) out.parked += 1; else out.wrongBusiness += 1;
      }
      if (hit) {
        out.theirs += 1;
        found.push({ name: r.name, ...hit });
        if (!dry) {
          try {
            await db.prospect.update({
              where: { id: r.id },
              data: { website: hit.url, normalizedDomain: hit.host.replace(/^www\./, '') },
            });
          } catch { /* one record never stops the run */ }
        }
      }
      // Stop rather than grind. A guessing rule that has stopped working is
      // worse than no run at all, because it looks like an answer.
      if (out.tried >= CHECK_EVERY && out.tried % CHECK_EVERY === 0) {
        const rate = out.theirs / out.tried;
        say(`  ${out.tried} tried, ${out.theirs} found (${Math.round(rate * 100)}%)`);
        // The floor catches a BROKEN search, not a modest one. It stopped a
        // working search twice: 7% in the oldest slice of the register, 1% in
        // the next. That is not a fault — the register is mostly recently
        // formed companies with no web presence, and the ones it does find are
        // the long-established businesses that are the better prospects
        // anyway. It only stops now if it finds NOTHING at all across a long
        // stretch, which is what a genuinely broken guess looks like.
        if (out.theirs === 0 && out.tried >= CHECK_EVERY * 5) {
          stopped = `nothing at all found in ${out.tried} tries — the guessing has stopped working`;
          return;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, rows.length) }, worker));

  say('');
  say(`tried:                    ${out.tried}`);
  say(`an address answered:      ${out.resolved}`);
  say(`PROVED to be theirs:      ${out.theirs}  (${out.tried ? Math.round((out.theirs / out.tried) * 100) : 0}%)`);
  say(`answered but parked:      ${out.parked}`);
  say(`answered, not proved theirs: ${out.wrongBusiness}`);
  say(`no address worth trying:  ${out.nothing}`);
  if (stopped) say(`\nSTOPPED: ${stopped}`);

  say('');
  say('FIRST 15 FOUND:');
  found.slice(0, 15).forEach((f) => say(`   ${f.name.slice(0, 34).padEnd(36)} ${f.host.padEnd(34)} ${f.why}`));

  if (OUT) fs.writeFileSync(OUT, lines.join('\n'));
  await db.$disconnect();
})().catch((e) => { console.error('search failed:', e.message); process.exit(1); });
