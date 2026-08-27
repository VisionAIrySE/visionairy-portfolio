#!/usr/bin/env node
// Re-collect the name, phone and address of a business from its OWN website,
// so nothing on the record has to come from Google Places.
//
//   node scripts/hoursback/recollect-from-sites.js --dry-run
//   node scripts/hoursback/recollect-from-sites.js
//
// Why. Google's support asked, plainly, whether we store business names,
// contact details or addresses fetched from their Places API. We do, for 2,043
// businesses. Their terms allow the Place ID and coordinates to be kept and
// nothing else, so all of it has to go — and it costs nothing, because every
// one of those businesses publishes the same details on its own site
// (2026-08-27).
//
// Free. It reads pages the businesses themselves put on the public internet.
// Nothing here touches Google.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no local settings file */ }

const PAGE_TIMEOUT_MS = 8000;
const POLITE_DELAY_MS = 700;
const LANES = 6;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// A phone number as a business writes it on its own page.
function phoneFrom(html) {
  const tel = html.match(/href=["']tel:([^"']+)["']/i);
  if (tel) {
    const d = tel[1].replace(/[^\d]/g, '').replace(/^1(?=\d{10}$)/, '');
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const m = text.match(/\(?\b([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// An Oregon street address as published on the page.
function addressFrom(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;?/gi, ' ');
  const m = clean(text).match(/\b(\d{1,6}\s+[A-Za-z0-9.'\- ]{3,40},?\s+(?:Bend|Redmond|Sisters|Prineville|Madras|La Pine|Sunriver|Terrebonne|Culver|Tumalo|Powell Butte|Warm Springs)\b[, ]*(?:OR|Oregon)?\s*\d{0,5})/i);
  return m ? clean(m[1]).replace(/,$/, '') : null;
}

// The name a business calls itself, off its own page title.
function nameFrom(html) {
  const t = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i);
  if (!t) return null;
  // A title is often "Name | Tagline | Town" — the first part is the name.
  const first = clean(t[1]).split(/\s*[|–—·]\s*/)[0];
  return first && first.length >= 2 && first.length <= 80 ? first : null;
}

async function readPage(url) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), PAGE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: c.signal, redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; HoursBack/1.0; +https://visionairy.biz)' },
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return Buffer.from(buf.slice(0, 900000)).toString('utf8');
  } catch { return null; } finally { clearTimeout(timer); }
}

(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const dry = process.argv.includes('--dry-run');

  const rows = await db.prospect.findMany({
    where: { placeId: { startsWith: 'ChI' } },
    select: { id: true, name: true, phone: true, address: true, website: true, websiteManualValue: true },
  });
  const withSite = rows.filter((r) => r.website || r.websiteManualValue);
  console.log(`${rows.length} businesses carry a Google id`);
  console.log(`${withSite.length} of them publish a website we can read instead\n`);

  const out = { read: 0, gotName: 0, gotPhone: 0, gotAddress: 0, unreachable: 0 };
  let i = 0;
  const worker = async () => {
    for (;;) {
      const n = i; i += 1;
      if (n >= withSite.length) return;
      const p = withSite[n];
      const url = p.websiteManualValue || p.website;
      const html = await readPage(url.startsWith('http') ? url : `https://${url}`);
      if (!html) { out.unreachable += 1; continue; }
      out.read += 1;
      const found = { name: nameFrom(html), phone: phoneFrom(html), address: addressFrom(html) };
      if (found.name) out.gotName += 1;
      if (found.phone) out.gotPhone += 1;
      if (found.address) out.gotAddress += 1;
      if (!dry) {
        // Written into the hand-entered columns, which is where a value that
        // did NOT come from a sweep belongs — and it means the deletion pass
        // that follows can empty the fetched columns without losing anything.
        const data = {};
        if (found.name) data.nameManualValue = found.name;
        if (found.phone) data.phoneManualValue = found.phone;
        if (found.address) data.addressManualValue = found.address;
        if (Object.keys(data).length) await db.prospect.update({ where: { id: p.id }, data });
      }
      if (out.read % 100 === 0) console.log(`  ${out.read} read, ${out.gotPhone} phones, ${out.gotAddress} addresses`);
      await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, withSite.length) }, worker));

  console.log('');
  console.log(`sites read:            ${out.read}`);
  console.log(`unreachable:           ${out.unreachable}`);
  console.log(`name found on page:    ${out.gotName}`);
  console.log(`phone found on page:   ${out.gotPhone}`);
  console.log(`address found on page: ${out.gotAddress}`);
  if (dry) console.log('\ndry run — nothing written');
  await db.$disconnect();
})().catch((e) => { console.error('re-collection failed:', e.message); process.exit(1); });
