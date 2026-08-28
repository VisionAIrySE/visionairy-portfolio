#!/usr/bin/env node
// Re-read business websites properly and say what changed.
//
//   node scripts/hoursback/recheck-sites.js --limit=100 --output <path>
//   node scripts/hoursback/recheck-sites.js --urls=a.com,b.com --output <path>
//
// Free. It opens pages businesses put on the public internet. Nothing here
// touches Google.

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
const LANES = Number(arg('lanes', 4));
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };

// What a reading means for the record. Only three of these are worth points,
// and a reading that could not tell is worth none — which is the whole reason
// this rewrite happened.
async function save(db, id, r, trade) {
  const S = require('../../src/hoursback/siteRead.js');
  const C = require('../../src/hoursback/siteCapability.js');
  const p = await db.prospect.findUnique({ where: { id }, select: { scoreEvidence: true, toolsInUse: true } });
  let evidence = [];
  try { evidence = JSON.parse(p.scoreEvidence || '[]'); } catch { evidence = []; }
  // Everything this reading is authoritative about goes; what it says replaces it.
  const OURS = ['no_online_booking', 'no_customer_portal', 'no_way_to_enquire', 'site_below_par'];
  evidence = evidence.filter((e) => !OURS.includes(e.signal));

  if (r.enquiry && r.enquiry.state === S.ABSENT) {
    evidence.push({ signal: 'no_way_to_enquire', url: null, quote: r.enquiry.why });
  }
  if (r.booking && r.booking.state === S.ABSENT) {
    evidence.push({ signal: 'no_online_booking', url: null, quote: r.booking.why });
  }

  // How their site measures against what a site in their trade could do.
  const found = {};
  for (const c of S.EVERY_CAPABILITY) if (r[c]) found[c] = r[c].state;
  const site = C.scoreSite({ trade, found });
  if (site.score !== null && site.confident && site.score < 50) {
    evidence.push({
      signal: 'site_below_par', url: null,
      quote: `${site.verdict.say}: ${site.missing.slice(0, 3).map((m) => m.label.toLowerCase()).join('; ')}`,
    });
  }

  const data = {
    scoreEvidence: JSON.stringify(evidence),
    siteReadAt: new Date(),
    siteScore: site.score,
    // `found` is what the reader actually saw, kept raw. The trade decides how
    // it is scored, and 117 businesses are on the wrong trade — correcting one
    // has to be able to re-score its site without opening a single page again.
    siteGaps: JSON.stringify({
      found,
      missing: site.missing, have: site.have.map((h) => h.cap),
      verdict: site.verdict, confident: site.confident,
      readAt: new Date().toISOString().slice(0, 10),
    }),
  };
  // What they already pay for. Half the time the answer to a problem is a
  // feature of something already on their bill.
  if (r.toolsInUse && r.toolsInUse.length) data.toolsInUse = r.toolsInUse.join(', ');
  await db.prospect.update({ where: { id }, data });
}

(async () => {
  const { chromium } = require('playwright');
  const { PrismaClient } = require('@prisma/client');
  const S = require('../../src/hoursback/siteRead.js');
  const db = new PrismaClient();

  const urlList = arg('urls', null);
  let targets;
  if (urlList) {
    targets = urlList.split(',').map((u) => ({ name: u, url: u.trim(), old: null }));
  } else {
    const limit = Number(arg('limit', 100));
    const rows = await db.prospect.findMany({
      where: { siteStatus: 'READ', doNotContact: false },
      select: { id: true, name: true, trade: true, website: true, websiteManualValue: true, scoreEvidence: true, automationScore: true },
      orderBy: { automationScore: 'desc' },
      take: limit,
    });
    const sig = (r, s) => { try { return JSON.parse(r.scoreEvidence || '[]').some((e) => e.signal === s); } catch { return false; } };
    targets = rows.filter((r) => r.websiteManualValue || r.website).map((r) => ({
      id: r.id, name: r.name, trade: r.trade, url: r.websiteManualValue || r.website,
      old: { booking: !sig(r, 'no_online_booking'), login: !sig(r, 'no_customer_portal') },
    }));
  }
  say(`re-reading ${targets.length} sites the way a visitor sees them`);

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const out = [];
  let i = 0, done = 0;
  const worker = async () => {
    for (;;) {
      const n = i; i += 1;
      if (n >= targets.length) return;
      const t = targets[n];
      try {
        const r = await S.readSiteAsVisitor(browser, t.url, {});
        out.push({ ...t, ...r, pages: undefined, pageUrls: r.pages.map((p) => p.url) });
      } catch (e) {
        out.push({ ...t, enquiry: { state: S.UNKNOWN, why: e.message.slice(0, 60) }, booking: { state: S.UNKNOWN }, login: { state: S.UNKNOWN }, pagesRead: 0 });
      }
      done += 1;
      if (done % 20 === 0) say(`  ${done} of ${targets.length}`);
      // Write it down as it goes. A ninety-minute run that only reports at the
      // end has nothing to show if it dies at minute eighty.
      const r = out[out.length - 1];
      if (t.id && !process.argv.includes('--dry-run')) {
        try { await save(db, t.id, r, t.trade); } catch { /* one record never stops the run */ }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, targets.length) }, worker));
  await browser.close();

  const count = (k, s) => out.filter((r) => r[k] && r[k].state === s).length;
  say('');
  say('WHAT A VISITOR ACTUALLY FINDS');
  for (const k of ['enquiry', 'booking', 'login']) {
    say(`  ${k.padEnd(9)} found ${String(count(k, S.FOUND)).padStart(4)}   genuinely absent ${String(count(k, S.ABSENT)).padStart(4)}   could not tell ${String(count(k, S.UNKNOWN)).padStart(4)}`);
  }
  say(`  pages opened per site, average: ${(out.reduce((a, r) => a + (r.pagesRead || 0), 0) / Math.max(1, out.length)).toFixed(1)}`);

  const withOld = out.filter((r) => r.old);
  if (withOld.length) {
    const wrongBooking = withOld.filter((r) => !r.old.booking && r.booking.state === S.FOUND).length;
    const wrongLogin = withOld.filter((r) => !r.old.login && r.login.state === S.FOUND).length;
    say('');
    say('WHERE THE OLD READING WAS WRONG');
    say(`  said no way to book, actually books:   ${wrongBooking} of ${withOld.filter((r) => !r.old.booking).length} it called absent`);
    say(`  said no customer login, actually has: ${wrongLogin} of ${withOld.filter((r) => !r.old.login).length} it called absent`);
  }

  say('');
  say('FIRST 15, ONE LINE EACH');
  out.slice(0, 15).forEach((r) => say(`  ${String(r.name).slice(0, 30).padEnd(32)} enquiry:${r.enquiry.state.padEnd(7)} booking:${r.booking.state.padEnd(7)} login:${r.login.state.padEnd(7)} (${r.pagesRead} pages)`));

  if (OUT) fs.writeFileSync(OUT, `${lines.join('\n')}\n\n${JSON.stringify(out, null, 1)}`);
  await db.$disconnect();
})().catch((e) => { console.error('re-check failed:', e.message); process.exit(1); });
