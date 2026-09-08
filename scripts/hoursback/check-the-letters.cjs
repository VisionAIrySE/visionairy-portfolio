// READ THE LETTER THE CUSTOMER WILL READ.
//
// Every count before this one asked the records a question — was the sentence
// regenerated, is the version current — and never opened the letter. On
// 2026-09-07 that reported 299 letters "ready in the current wording" while
// 202 of them still carried wording Russ replaced on 4 September, seven named
// a client's own software in a cold email, and the one he pasted back named no
// cost at all. Every one of those is visible in the text in under a second.
//
// So this opens the letters. Nothing else.
//
//   node scripts/hoursback/check-the-letters.cjs          — the counts
//   node scripts/hoursback/check-the-letters.cjs --show 5 — and five examples
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const SHOW = Number((process.argv.find((a) => a.startsWith('--show=')) || '').split('=')[1]
  || (process.argv.includes('--show') ? 3 : 0));

// The paragraph that names their work is the one that is not the greeting, not
// the who-I-am lines, not the offer, and not the sign-off.
function theirParagraph(body) {
  const paras = String(body || '').split('\n\n');
  return paras.find((t) => t.length > 120
    && !/^Hi |sat in the offices|local to Central Oregon|Fifteen minutes|no charge for the review|Best regards/i.test(t.trim())) || '';
}

// WHAT A COST LOOKS LIKE. Money, hours, or a named thing that is lost — a
// booking that goes elsewhere, a slot that stays empty, an invoice unpaid.
// "It takes time" is not a cost; every owner knows they are busy.
const NAMES_MONEY = /\$[\d,]+|\bdollars?\b|five-figure|a year\b|a month\b|per (job|week|month|year)/i;
const NAMES_HOURS = /\b(hours?|minutes?|a day|all day|the week|evenings?)\b/i;
const NAMES_A_LOSS = /goes? (?:to|somewhere|with) (?:someone|somebody|another|the next|voicemail)|books? (?:with|somewhere)|never (?:comes? back|hear|gets? read|starts?)|sits? (?:empty|unpaid|open|idle)|lose|lost|gone for good|elsewhere|already (?:booked|reserved|called)/i;

const RUSS_OWN_LINE = /may have that one covered by now/i;
const THE_OLD_LINE = /Most (?:have|firms|practices|shops|places)|Plenty of/i;
const PRESUMES_MOST = /\b(most|mostly|usually|typically)\b/i;

// Software a business runs, named back at them in a cold message.
const NAMES_THEIR_SOFTWARE = /QuickBooks|Xero|Salesforce|HubSpot|ServiceTitan|Jobber|Housecall|Mindbody|Square\b|Shopify|Toast\b|Dentrix|Eaglesoft|Clio|MyCase/i;

(async () => {
  // ONLY THE ONES CALLED READY. A letter is ready when the business has an
  // email address, their own site has been read, and the sentence was written
  // under the current wording. That is the pile Russ would actually send, and
  // the only one worth judging.
  const N = require('../../src/hoursback/crm/noticing.js');
  const readable = (await db.reading.groupBy({ by: ['prospectId'], where: { pages: { some: {} } } })).map((r) => r.prospectId);
  const current = await db.reading.findMany({
    where: { prospectId: { in: readable }, readerVersion: N.READER_VERSION },
    select: { prospectId: true }, distinct: ['prospectId'],
  });
  const readyIds = current.map((c) => c.prospectId);
  const letters = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', sentAt: null,
      prospectId: { in: readyIds },
      prospect: { doNotContact: false, OR: [{ email: { not: null } }, { emailManualValue: { not: null } }] },
    },
    include: { prospect: { select: { name: true } } },
  });

  const faults = {
    noCost: [], oldLine: [], presumesMost: [], namesSoftware: [], noParagraph: [],
  };
  let clean = 0;

  for (const m of letters) {
    const p = theirParagraph(m.body);
    if (!p) { faults.noParagraph.push(m); continue; }
    let bad = false;
    if (!(NAMES_MONEY.test(p) || NAMES_HOURS.test(p) || NAMES_A_LOSS.test(p))) { faults.noCost.push({ m, p }); bad = true; }
    if (THE_OLD_LINE.test(p) || (!RUSS_OWN_LINE.test(p) && /three or four/i.test(p))) { faults.oldLine.push({ m, p }); bad = true; }
    if (PRESUMES_MOST.test(p)) { faults.presumesMost.push({ m, p }); bad = true; }
    if (NAMES_THEIR_SOFTWARE.test(p)) { faults.namesSoftware.push({ m, p }); bad = true; }
    if (!bad) clean += 1;
  }

  console.log(`${letters.length} letters not yet sent, read in full\n`);
  console.log(`  ${clean} pass every rule`);
  console.log(`  ${faults.noCost.length} never say what the work COSTS`);
  console.log(`  ${faults.oldLine.length} carry wording Russ replaced on 4 September`);
  console.log(`  ${faults.presumesMost.length} presume with "most" / "usually" / "typically"`);
  console.log(`  ${faults.namesSoftware.length} name the client's own software in a cold message`);
  console.log(`  ${faults.noParagraph.length} have no paragraph naming their work at all`);

  if (SHOW) {
    for (const [name, rows] of Object.entries(faults)) {
      if (!rows.length || name === 'noParagraph') continue;
      console.log(`\n--- ${name}, first ${Math.min(SHOW, rows.length)} of ${rows.length} ---`);
      for (const r of rows.slice(0, SHOW)) {
        console.log(`  ${r.m.prospect.name}:\n    ${String(r.p).slice(0, 300)}\n`);
      }
    }
  }
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
