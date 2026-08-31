#!/usr/bin/env node
// Read every business's own website for its people and its real team size.
//
// Russ opened the first business on the list — BeginRight Employment, which
// has a team page right under its About tab — and the record said team size
// unknown. It did across 2,010 of 2,044 businesses, and not one of the 2,471
// people on file had a phone number. Two causes: the first reader only went
// one click deep, and it threw away any person who had no published email
// before it ever looked at their phone number (2026-08-26).
//
// FREE. Their own websites, no key, no paid service, nothing that can meter.
// The only ceilings that matter here are politeness ones: pages per site, a
// pause between pages, and a timeout so a dead host cannot stall the run.

const { PrismaClient } = require('@prisma/client');
const ps = require('../../src/hoursback/peopleSweep.js');

// Eight was enough for a plumber and nowhere near enough for a firm. A site
// with a real team page is allowed as far as fifty, and only for the profile
// pages beneath it — Kernutt Stokes went from 24 people and no addresses to 32
// people each with a direct email and a direct line (2026-08-31).
const PAGES_PER_SITE = 50;
const PAUSE_BETWEEN_SITES_MS = 400;
const PROGRESS_EVERY = 25;

// Save the people, keeping anyone with a name even when they published no
// email — that omission is exactly what lost every phone number last time.
async function savePeople(db, prospectId, people, businessTown = null) {
  // THE LOCAL ONE IS WRITTEN TO, AT A FIRM WITH SEVERAL OFFICES.
  //
  // Kernutt Stokes has five, and the message went to whoever the read happened
  // to find first. Trever Campbell is the Bend one, and his own page carries a
  // Bend number while the others carry Eugene and Portland (Russ, 2026-08-31).
  const town = String(businessTown || '').trim().toLowerCase();
  if (town.length > 2) {
    const local = (p) => `${p.foundOn || ''} ${p.role || ''}`.toLowerCase().includes(town);
    const here = people.filter(local);
    if (here.length && here.length < people.length) people = here.concat(people.filter((p) => !local(p)));
  }
  let saved = 0;
  for (const [i, person] of people.entries()) {
    if (!person.name && !person.email) continue;
    const where = person.email
      ? { prospectId, email: person.email }
      : { prospectId, name: person.name };
    const existing = await db.contact.findFirst({ where });
    if (existing && existing.source === 'RUSS') continue;   // his correction stands
    const data = {
      prospectId,
      name: person.name || (existing && existing.name) || null,
      role: person.role || (existing && existing.role) || null,
      email: person.email || (existing && existing.email) || null,
      phone: person.phone || (existing && existing.phone) || null,
      // Their own LinkedIn profile, printed beside them on the team page. This
      // was never saved because it was never collected: 0 of 7,352 people had
      // one (2026-08-28).
      linkedIn: person.linkedIn || (existing && existing.linkedIn) || null,
      foundOn: person.foundOn || (existing && existing.foundOn) || null,
      source: 'WEBSITE',
      isPrimary: i === 0 && !existing,
    };
    if (existing) await db.contact.update({ where: { id: existing.id }, data });
    else await db.contact.create({ data });
    saved += 1;
  }
  return saved;
}

async function main() {
  const db = new PrismaClient();
  const started = Date.now();
  let done = 0, withPeople = 0, withSize = 0, withPhones = 0, peopleSaved = 0, failed = 0;
  try {
    const rows = await db.prospect.findMany({
      // Whichever address is on the record. It used to look only at the
      // machine's column and skipped 1,226 businesses that had a website
      // (2026-08-31).
      where: { doNotContact: false, OR: [{ website: { not: null } }, { websiteManualValue: { not: null } }] },
      select: { id: true, name: true, website: true, websiteManualValue: true, address: true, addressManualValue: true },
      // Best first, and a business whose score was never worked out is not
      // best. Without this, --limit reads the unscored ones and never reaches
      // the businesses that matter (2026-08-31 — the same fault the email
      // screen had).
      orderBy: { automationScore: { sort: 'desc', nulls: 'last' } },
      // --limit=50 reads the best fifty first, so a run can be looked at before
      // the whole list is committed to.
      ...(Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]) > 0
        ? { take: Number(process.argv.find((a) => a.startsWith('--limit=')).split('=')[1]) } : {}),
    });
    console.log(`${rows.length} businesses with a website to read`);

    // Everything this sweep changes is a scored tell — a team size, a named
    // person you can ask for. The records it touched are re-scored at the end
    // rather than left for somebody to remember (2026-08-27).
    const touched = [];

    // Several sites at once. One at a time, 3,174 businesses at eight pages
    // each is most of a day, and almost all of it is spent waiting on somebody
    // else's web server with nothing else happening. Six is polite: each site
    // still gets its own pause between pages, and no single site sees more
    // than one request at a time (2026-08-28).
    const LANES = 6;
    let next = 0;
    const worker = async () => {
    for (;;) {
      const at = next; next += 1;
      if (at >= rows.length) return;
      const b = rows[at];
      done += 1;
      try {
        const read = await ps.fetchPeoplePages(b.websiteManualValue || b.website, { maxPages: PAGES_PER_SITE });
        if (read.error && !read.pages.length) { failed += 1; continue; }
        const people = ps.peopleFromSite(read.pages);
        if (people.length) {
          withPeople += 1;
          const addr = b.addressManualValue || b.address || '';
          const townMatch = String(addr).match(/,\s*([A-Za-z .'-]{3,30}),\s*[A-Z]{2}\b/);
          peopleSaved += await savePeople(db, b.id, people, townMatch ? townMatch[1].trim() : null);
          touched.push(b.id);
          if (people.some((p) => p.phone)) withPhones += 1;
        }
        const size = ps.teamSizeFrom(people);
        if (size) {
          withSize += 1;
          // Only where nothing was known — a number Russ typed always wins.
          const current = await db.prospect.findUnique({
            where: { id: b.id }, select: { employeeCount: true, employeeCountManualValue: true },
          });
          touched.push(b.id);
          if (current.employeeCountManualValue === null && current.employeeCount === null) {
            await db.prospect.update({
              where: { id: b.id },
              data: {
                employeeCount: size,
                headcountStatus: 'RESOLVED',
                headcountPublishedAs: `${size} people named on their own site`,
                headcountSourceUrl: (people.find((p) => p.foundOn) || {}).foundOn || null,
              },
            });
          }
        }
      } catch (e) {
        failed += 1;
      }
      if (done % PROGRESS_EVERY === 0) {
        const mins = Math.round((Date.now() - started) / 60000);
        console.log(`${done}/${rows.length} read (${mins}m) — ${withPeople} with people, ${withSize} with a team size, ${withPhones} with a direct number, ${peopleSaved} people saved, ${failed} unreadable`);
      }
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_SITES_MS));
    }
    };
    await Promise.all(Array.from({ length: Math.min(LANES, rows.length) }, worker));

    console.log('');
    console.log(`DONE in ${Math.round((Date.now() - started) / 60000)} minutes`);
    console.log(`  businesses read:        ${done}`);
    console.log(`  with people found:      ${withPeople}`);
    console.log(`  with a real team size:  ${withSize}`);
    console.log(`  with a direct number:   ${withPhones}`);
    console.log(`  people saved:           ${peopleSaved}`);
    console.log(`  unreadable:             ${failed}`);
    const { rescoreMany } = require('../../src/hoursback/refresh.js');
    const r = await rescoreMany(db, touched);
    console.log(`  scores moved:           ${r.moved} of ${r.scored}`);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
