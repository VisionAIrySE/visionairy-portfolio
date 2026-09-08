// SWAP THE STALE STANDING LINE, TOUCH NOTHING ELSE.
//
// The line about three or four more jobs has four versions, picked per
// business. Russ rewrote it on 4 September to stop it presuming, and that went
// into ONE of the four — so three letters in four still say "Most", including
// letters he wrote himself by hand.
//
// Rewriting a whole letter to fix one fixed line would throw away his own
// words. This replaces ONLY that sentence, in place, and leaves every other
// character alone — including a letter he has edited, which nothing else here
// is allowed to touch.
//
//   node scripts/hoursback/refresh-the-standing-line.cjs                 — all of them, shown
//   node scripts/hoursback/refresh-the-standing-line.cjs --only="Bryant" — one business
//   ... add --do-it to make it so
const { PrismaClient } = require('@prisma/client');
const C = require('../../src/hoursback/crm/campaign.js');
const V = require('../../src/hoursback/crm/variants.js');
const db = new PrismaClient();

const DO_IT = process.argv.includes('--do-it');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

// Every shape the standing line has ever taken. It always opens one of four
// ways and always mentions three or four more.
const STALE = /(?:Some [^.]*?\.\s*)?(?:Most|Plenty of|Some|You may well have)[^.]*?three or four[^.]*?\.(?=\s|$)|(?:You may well have that one handled|Some \w+[^.]*?)\.\s*Most[^.]*?\.(?=\s|$)/i;
const PRESUMES = /\b(most|mostly|usually|typically)\b/i;

(async () => {
  const letters = await db.outreachMessage.findMany({
    where: {
      lane: 'EMAIL', sentAt: null,
      ...(ONLY ? { prospect: { name: { contains: ONLY } } } : {}),
    },
    include: { prospect: { select: { name: true } } },
  });

  const toFix = [];
  for (const m of letters) {
    if (!PRESUMES.test(m.body)) continue;          // already carries his wording
    const hit = m.body.match(STALE);
    if (!hit) continue;
    if (!PRESUMES.test(hit[0])) continue;          // the presuming is elsewhere; leave it
    // KEEP THE WORD THE LETTER ALREADY USED FOR THEM. The original said
    // "shops" to a mechanic, "operations" to a ranch, "practices" to a dentist.
    // Replacing that with a flat "firms" would send a rancher a line about
    // firms, which is exactly the kind of wrong-for-this-business wording the
    // whole letter exists to avoid.
    const theirWord = (hit[0].match(/\b(?:Some|Most|Plenty of)\s+([a-z]+)\b/) || [])[1] || 'firms';
    const fresh = V.pick(C.ALREADY_HANDLED, m.prospect.name, 'handled')
      .replace('{they}', theirWord);
    toFix.push({ m, was: hit[0], now: fresh });
  }

  console.log(`${letters.length} letters looked at`);
  console.log(`${toFix.length} carry a standing line Russ replaced\n`);

  for (const f of toFix.slice(0, ONLY ? 5 : 3)) {
    console.log(`--- ${f.m.prospect.name}${f.m.editedAt ? '  (you edited this one — only this line changes)' : ''}`);
    console.log(`  was: ${f.was}`);
    console.log(`  now: ${f.now}\n`);
  }
  if (toFix.length > (ONLY ? 5 : 3)) console.log(`  ...and ${toFix.length - (ONLY ? 5 : 3)} more\n`);

  if (!DO_IT) { console.log('Nothing changed. Add --do-it to make it so.'); await db.$disconnect(); return; }

  let done = 0;
  for (const f of toFix) {
    const body = f.m.body.replace(f.was, f.now);
    if (body === f.m.body) continue;
    await db.outreachMessage.update({ where: { id: f.m.id }, data: { body } });
    done += 1;
  }
  console.log(`${done} letters now carry the wording he approved. Nothing else in them changed.`);
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
