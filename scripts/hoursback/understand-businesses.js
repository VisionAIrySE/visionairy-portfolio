#!/usr/bin/env node
// Read every business's own website and understand it. One pass, everything.
//
//   node scripts/hoursback/understand-businesses.js --look --limit=12
//   node scripts/hoursback/understand-businesses.js --limit=645
//   node scripts/hoursback/understand-businesses.js            (everything with a site)
//
// --look prints what was understood and writes nothing.
//
// Russ, 2026-08-28, after every earlier sweep produced records he could not
// trust: "I want them researched effectively, validated, confirmed accurate
// and fleshed out so I can use them."
//
// This is the pass that does it properly. Their own site, read for meaning:
// what the business is, what it does, who works there and what they actually
// do, the addresses and direct lines and profiles that are published, and how
// — if at all — a stranger can get in touch. That last one is what fixes the
// scoring: a business you can only phone can no longer sit at 100.
//
// COST. Runs on the Claude Code login already on this machine, with Haiku.
// A CEILING is in the code below before anything runs, because a loop that
// spends without one has cost Russ real money before.

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
const { whyNotTheirs } = require('../../src/hoursback/notTheirSite.js');
const { pagesAsDocument, questionAbout, keepOnlyWhatWasRead } = require('../../src/hoursback/understand.js');
const { howToReachThem, callOrderScore } = require('../../src/hoursback/reachable.js');

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const LOOK = process.argv.includes('--look');
const LIMIT = Number(arg('limit', 0));
const LANES = Number(arg('lanes', 5));
const ONLY = arg('only', '');

// --- the ceilings, in code, before anything runs ----------------------------
const MOST_EVER = 3400;          // every business with a website of its own
const PAGES_PER_SITE = 8;        // home, about, team, contact and four more
// HOW LONG TO WAIT FOR AN ANSWER.
//
// Two minutes was enough at eight o'clock and not at nine. The reader got
// slower as the evening went on — 41 to 61 seconds an answer where it had
// been half that — and with eight questions in flight every one ran past two
// minutes and was thrown away. 22 asked, 0 answered, and the pass gave up
// believing the reader was broken when it was only slow (2026-08-28).
//
// So: wait four minutes, and ask five at a time rather than eight. A slow
// answer is still an answer; a discarded one costs the business entirely.
const READ_TIMEOUT_MS = 240000;

// A clean room to read in. Run from the project folder, the reading tool picks
// up this project's own startup scripts and answers as if it were a session —
// twenty seconds and the wrong answer. An empty folder with the extras turned
// off answers the question that was asked.
const ROOM = path.join(require('os').tmpdir(), 'hoursback-reader');
fs.mkdirSync(ROOM, { recursive: true });

function askTheReader(question) {
  return new Promise((resolve) => {
    execFile('claude', [
      '-p', question,
      '--model', 'haiku',
      '--system-prompt', 'You read web pages and answer with JSON only. No preamble, no explanation, no code fences.',
      '--exclude-dynamic-system-prompt-sections',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--settings', '{"hooks":{},"enabledPlugins":{}}',
      '--disallowed-tools', 'Bash,Read,Write,Edit,WebFetch,WebSearch,Glob,Grep,Task,TodoWrite',
    ], { cwd: ROOM, timeout: READ_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve({ answer: null, why: 'the reader did not answer' });
      const text = String(stdout || '');
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return resolve({ answer: null, why: 'the reader answered with no JSON' });
      try { resolve({ answer: JSON.parse(m[0]), why: null }); }
      catch { resolve({ answer: null, why: 'the reader answered with broken JSON' }); }
    });
  });
}

// Is there a way to write to them that is not an address? Only a fact about
// the page's own markup, which is the one place a pattern belongs.
const A_FORM = /<form[\s\S]{0,400}?(type=["']?(email|text)|name=["']?(email|message|comments|inquiry|name))/i;
function hasContactForm(pages) {
  return pages.some((p) => A_FORM.test(String(p.html || '')));
}

// Only read when this file is the thing being run. The OpenRouter-based read
// borrows the saving step from here, and without this guard merely importing
// it would start a second full pass of its own (2026-08-29).
if (require.main === module) (async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  // THE WORKED LIST, and not the review pile.
  //
  // 31,318 of the 32,739 records came off the Oregon business register and
  // were screened out into NEEDS_REVIEW — they have no email, no phone and
  // mostly no website, and Russ is not working them. 1,904 of them do have a
  // website, so an earlier version of this read all 3,139 sites and spent six
  // reads in ten on records he will never open. Russ, 2026-08-28: "We also did
  // a screen of the SoS findings and we didn't retain all 32k... DON'T WASTE
  // EFFORT."
  //
  // --review reads that pile instead, which is the job of turning a screened
  // out record back into a workable one. It is a separate decision and it is
  // never the default.
  const REVIEW_PILE = process.argv.includes('--review');
  const UNREAD_TRADES = process.argv.includes('--unread-trades');
  const TRADES_WITH_STAFF = /accounting|legal|insurance|dental|medical|veterinary|real estate|construction|trades|plumbing|electrical|hvac|auto|landscap|staffing|cleaning|manufactur|storage|professional services/i;

  // PICKING UP WHERE IT STOPPED.
  //
  // Nothing is ever lost in a crash — every business is written the moment it
  // is read. But without this, starting again reads all 1,268 from the top, so
  // a stumble at business 900 costs three hours of work already done and paid
  // for. --fresh=6 means "leave alone anything already read in the last six
  // hours", which turns a restart into a resume (2026-08-28).
  const FRESH = Number(arg('fresh', 0));
  const alreadyDone = FRESH
    ? { OR: [{ siteReadAt: null }, { siteReadAt: { lt: new Date(Date.now() - FRESH * 3600000) } }] }
    : {};

  const where = ONLY
    ? { id: ONLY }
    : {
      ...alreadyDone,
      doNotContact: false,
      // One NOT list, not two. Written as two separate NOT keys the second
      // silently replaces the first and the whole scoping disappears.
      NOT: [
        { AND: [{ website: null }, { websiteManualValue: null }] },
        // The set-aside pile is excluded UNLESS we are deliberately reading it.
        // Asking for it and excluding it in the same breath returned zero
        // businesses and looked like "nothing left to do" (2026-08-30).
        ...(REVIEW_PILE || UNREAD_TRADES ? [] : [{ stage: 'NEEDS_REVIEW' }]),
      ],
      ...(REVIEW_PILE ? { stage: 'NEEDS_REVIEW' } : {}),
      // --unread-trades: the set-aside businesses with a website nobody has
      // opened and a trade that tends to employ people. Russ, 2026-08-29:
      // "don't they have a website? don't you think the website will have a
      // phone number and contacts?" They do. They were set aside because the
      // RECORD was empty, not because the business cannot be reached.
      ...(UNREAD_TRADES ? { stage: 'NEEDS_REVIEW', siteReadAt: null } : {}),
    };

  const rows = await db.prospect.findMany({
    where,
    select: {
      id: true, name: true, nameManualValue: true, trade: true, phone: true,
      website: true, websiteManualValue: true, email: true, emailManualValue: true,
      automationScore: true, scoreEvidence: true, stage: true,
    },
    // THE ONES WE KNOW NOTHING ABOUT COME FIRST. Then, among equals, the ones
    // he can email today — they are the ones he will open.
    //
    // Read in best-first order alone this re-reads businesses already
    // described before it ever reaches one that has never been described. On
    // 2026-08-30 that was 1,361 ahead of 226, and the 226 sorted DEAD LAST
    // because a business nobody has written down also tends to have no email
    // on file. Nine hours of reading before the first genuinely unknown
    // business. Selection has to follow what is MISSING — the same mistake,
    // in the same script, cost a wasted paid run two days earlier.
    //
    // Without nulls: 'last' the database puts the EMPTY ones at the top on a
    // descending sort, so the first look landed on a lacrosse booster club and
    // a horse ranch instead of his best prospects (2026-08-28).
    orderBy: [
      { theirWork: { sort: 'asc', nulls: 'first' } },
      { email: { sort: 'desc', nulls: 'last' } },
      { automationScore: { sort: 'desc', nulls: 'last' } },
    ],
    ...(UNREAD_TRADES ? { take: MOST_EVER } : (LIMIT ? { take: Math.min(LIMIT, MOST_EVER) } : { take: MOST_EVER })),
  });

  // Trim to the staffed trades AFTER the query, then apply the limit — so a
  // tranche of 50 means 50 businesses actually read, not 50 looked at and most
  // thrown away.
  if (UNREAD_TRADES) {
    const kept = rows.filter((r) => TRADES_WITH_STAFF.test(r.trade || ''));
    rows.length = 0;
    rows.push(...(LIMIT ? kept.slice(0, LIMIT) : kept));
  }

  console.log(`${rows.length} businesses with a website to read  (ceiling ${MOST_EVER})`);
  console.log(LOOK ? 'LOOKING ONLY — nothing will be written\n' : `reading, ${LANES} at a time\n`);

  const tally = {
    read: 0, notTheirSite: 0, siteDown: 0, readerFailed: 0,
    tradeConfirmed: 0, tradeCorrected: 0, tradeUnsure: 0,
    people: 0, roles: 0, rolesUnderstood: 0, emails: 0, directLines: 0, profiles: 0,
    sharedInbox: 0, formOnly: 0, phoneOnly: 0, held: 0, newlyScored: 0,
    brokeOnThisOne: 0,
  };
  const notes = [];
  const failed = [];
  const broke = [];
  let next = 0;
  const started = Date.now();

  // If the reader stops answering — a rate limit, a login that expired, the
  // machine losing its connection — every business after that point gets
  // marked unreadable and the whole list looks broken. So a run of failures
  // stops the pass instead, with everything read so far already written.
  let inARow = 0;
  const GIVE_UP_AFTER = 15;
  let stopped = false;

  const lane = async () => {
    for (;;) {
      const at = next; next += 1;
      if (at >= rows.length) return;
      const r = rows[at];
      // ONE BAD WEBSITE MUST NOT END THE PASS.
      //
      // Twice tonight a single page stopped a run over 1,141 businesses: once
      // a variable that was never handed over, once a site carrying a byte the
      // reader refuses to accept. Both are fixed, but the shape of the failure
      // is the thing worth fixing — anything unexpected on one site should cost
      // that site, not the three hours behind it. Whatever went wrong is
      // counted and named at the end so it can be looked at (2026-08-28).
      try {
        const name = r.nameManualValue || r.name || '';
        const url = r.websiteManualValue || r.website;

        if (whyNotTheirs(url, name)) { tally.notTheirSite += 1; continue; }

        let pages = [];
        try {
          const got = await ps.fetchPeoplePages(url, { maxPages: PAGES_PER_SITE });
          pages = got.pages || [];
        } catch { /* their site did not answer */ }
        if (!pages.length) { tally.siteDown += 1; continue; }

        const document = pagesAsDocument(pages);
        if (document.length < 200) { tally.siteDown += 1; continue; }

        // One retry. The reader came back empty on two of the first ten — a long
        // page occasionally runs it past its own limit — and a business skipped
        // for that reason is a business Russ never sees corrected.
        let { answer } = await askTheReader(questionAbout(name, document));
        if (!answer) {
          ({ answer } = await askTheReader(questionAbout(name, document.slice(0, 12000))));
        }
        if (!answer) {
          tally.readerFailed += 1; failed.push(name);
          inARow += 1;
          if (inARow >= GIVE_UP_AFTER && !stopped) {
            stopped = true;
            console.log(`\n\nSTOPPED — the reader failed ${GIVE_UP_AFTER} times in a row.`);
            console.log('Everything read up to this point is already saved. Run again to carry on.\n');
            next = rows.length;
          }
          continue;
        }
        inARow = 0;

        const understood = keepOnlyWhatWasRead(answer, document, name);

        // The pages turned out to belong to somebody else. The website on file
        // is cleared along with everything read off it, and the record says why
        // in plain words so it can be looked at rather than quietly emptied.
        if (understood.notTheirSite) {
          tally.notTheirSite += 1;
          if (notes.length < 40) notes.push(`\n  NOT THEIRS  ${name.slice(0, 30).padEnd(32)}${url}\n              ${understood.cannotTell}`);
          if (!LOOK) {
            await db.prospect.update({
              where: { id: r.id },
              data: {
                website: null, websiteManualValue: null, normalizedDomain: null,
                siteStatus: 'NO_WEBSITE', siteReadAt: new Date(),
                siteGaps: JSON.stringify([understood.cannotTell]),
              },
            });
          }
          continue;
        }
        tally.read += 1;

        const found = {
          peopleWithEmail: understood.people.filter((p) => p.name && p.email).length,
          peopleNamed: understood.people.length,
          peopleWithPhone: understood.people.filter((p) => p.phone).length,
          peopleWithProfile: understood.people.filter((p) => p.linkedIn).length,
          sharedEmail: understood.sharedEmail,
          contactForm: hasContactForm(pages),
          website: true,
          phone: Boolean(r.phone),
        };
        const reach = howToReachThem(found);
        // 1,891 businesses with a website have never been scored at all, so
        // there is nothing to rank them by. The reader is already on the page,
        // so the website tells are worked out from the same reading rather than
        // left blank forever. An existing score is kept — it was built from
        // things this pass cannot see, like a job advert.
        const opportunity = r.automationScore == null
          ? opportunityFromTheRead(understood, found, r)
          : { score: r.automationScore, evidence: null };
        const ranked = callOrderScore(opportunity.score, reach);

        tally.people += understood.people.length;
        tally.roles += understood.people.filter((p) => p.role).length;
        tally.rolesUnderstood += understood.people.filter((p) => p.role && p.roleWasPrinted === false).length;
        tally.emails += found.peopleWithEmail;
        tally.directLines += found.peopleWithPhone;
        tally.profiles += found.peopleWithProfile;
        if (reach.route === 'shared_inbox') tally.sharedInbox += 1;
        if (reach.route === 'contact_form') tally.formOnly += 1;
        if (reach.route === 'phone_only') tally.phoneOnly += 1;
        if (r.automationScore != null && ranked < r.automationScore) tally.held += 1;
        if (r.automationScore == null) tally.newlyScored += 1;

        if (understood.trade && understood.trade === r.trade) tally.tradeConfirmed += 1;
        else if (understood.trade) tally.tradeCorrected += 1;
        else if (understood.tradeUnsure) tally.tradeUnsure += 1;

        if (LOOK && notes.length < 40) {
          const lines = [];
          lines.push(`\n${'='.repeat(74)}\n${name}   ${url}`);
          lines.push(`  what they are   ${understood.trade || '(could not tell)'}${understood.trade && understood.trade !== r.trade ? `   was: ${r.trade || 'none'}` : ''}`);
          if (understood.whatTheyDo) lines.push(`  what they do    ${understood.whatTheyDo}`);
          if (understood.realName) lines.push(`  real name       ${understood.realName}`);
          lines.push(`  score           ${r.automationScore ?? '-'} -> ${ranked}    ${reach.inWords}`);
          if (understood.sharedEmail) lines.push(`  general inbox   ${understood.sharedEmail}`);
          if (understood.people.length) {
            lines.push('  who works there');
            for (const p of understood.people.slice(0, 12)) {
              const bits = [p.role ? `${p.role}${p.roleWasPrinted === false ? ' (understood)' : ''}` : 'no title given'];
              if (p.email) bits.push(p.email);
              if (p.phone) bits.push(p.phone);
              if (p.linkedIn) bits.push('LinkedIn');
              lines.push(`      ${p.name.padEnd(26)} ${bits.join('  ·  ')}`);
            }
          } else lines.push('  who works there  nobody named');
          if (understood.cannotTell) lines.push(`  not on the site ${understood.cannotTell}`);
          if (understood.dropped.length) lines.push(`  refused         ${understood.dropped.slice(0, 4).join(' | ')}`);
          notes.push(lines.join('\n'));
        }

        if (!LOOK) {
          await writeItDown(db, r, understood, reach, ranked, found, opportunity, url);
        }
        if (tally.read % 25 === 0) {
          process.stdout.write(`\r  read ${tally.read} of ${rows.length}   people ${tally.people}   addresses ${tally.emails}   phones on file now   `);
        }
      } catch (e) {
        tally.brokeOnThisOne += 1;
        if (broke.length < 25) broke.push(`  ${(r.nameManualValue || r.name || '(no name)').slice(0, 30).padEnd(32)}${String(e && e.message || e).slice(0, 90)}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(LANES, rows.length) }, lane));

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(notes.join('\n'));
  console.log(`\n${'='.repeat(74)}`);
  console.log(`read properly:            ${tally.read}   in ${mins} minutes`);
  console.log(`website was not theirs:   ${tally.notTheirSite}`);
  console.log(`site would not answer:    ${tally.siteDown}`);
  console.log(`reader gave no answer:    ${tally.readerFailed}`);
  if (tally.brokeOnThisOne) {
    console.log(`something broke on:       ${tally.brokeOnThisOne}   (the pass carried on regardless)`);
    console.log(broke.join('\n'));
  }
  console.log('');
  console.log(`trade confirmed:          ${tally.tradeConfirmed}`);
  console.log(`trade CORRECTED:          ${tally.tradeCorrected}`);
  console.log(`trade genuinely unclear:  ${tally.tradeUnsure}`);
  console.log('');
  console.log(`people found:             ${tally.people}`);
  console.log(`  with a real title:      ${tally.roles}   (${tally.rolesUnderstood} understood from a sentence, not printed)`);
  console.log(`  with their own address: ${tally.emails}`);
  console.log(`  with a direct line:     ${tally.directLines}`);
  console.log(`  with a profile:         ${tally.profiles}`);
  console.log('');
  console.log(`general inbox only:       ${tally.sharedInbox}`);
  console.log(`a form and nothing else:  ${tally.formOnly}`);
  console.log(`the phone and nothing else: ${tally.phoneOnly}`);
  console.log(`scores held down:         ${tally.held}`);
  await db.$disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });

// ---------------------------------------------------------------------------
// Writing it down.
//
// A hand-typed correction is never overwritten — that is what the paired
// ...ManualValue columns are for. Everything here writes the fetched column
// only, so a correction Russ typed survives this pass exactly as it survived
// the last one.
// ---------------------------------------------------------------------------
// How much is there to save here, for a business nobody has scored yet.
//
// 1,891 businesses with a website have no score at all, so there is nothing to
// rank them by. Russ, when an earlier version of this was about to work it out
// from website tells alone: "What about industry, team size, etc. not just
// what's on the fucking website!"
//
// He is right, and the answer already existed — opportunity.js turns a trade
// and a team size into roughly how many hours a week of repetitive office work
// sit in a business, calibrated against documented figures, and ranks that
// against every other business on the list. Nothing new is invented here. This
// only feeds it what the reading found and adds the tells that are genuinely
// about the website.
const { hoursSittingHere, scoreFromHours } = require('../../src/hoursback/opportunity.js');
const { scoreAutomationFit } = require('../../src/hoursback/scoring.js');

function opportunityFromTheRead(understood, found, r) {
  // The people named on their own site are a FLOOR on the team, never the
  // team. Most businesses name three and employ twenty.
  const named = understood.people.length;
  const team = named >= 3 ? named : null;
  const hours = hoursSittingHere({ trade: understood.trade || r.trade, people: team });
  const fromHours = scoreFromHours(hours.hours);

  // The website tells, which are worth a nudge and never the substance.
  const signals = [];
  if (understood.canBookOnline === false) signals.push({ signal: 'no_online_booking', quote: 'nothing on their site books an appointment' });
  if (understood.formsToPrint) signals.push({ signal: 'downloadable_forms', quote: 'they ask people to print a form and bring it back' });
  if (understood.listsAFax) signals.push({ signal: 'fax_listed', quote: 'a fax number is still published' });
  if (understood.hiringOffice) signals.push({ signal: 'hiring_admin_role', quote: 'advertising an office role right now' });
  if (!understood.sharedEmail && !found.peopleWithEmail) signals.push({ signal: 'no_email_published', quote: 'no address published anywhere on their site' });
  if (!found.contactForm && !understood.sharedEmail && !found.peopleWithEmail) signals.push({ signal: 'no_way_to_enquire', quote: 'no way to get in touch but the phone' });
  if (named > 0) signals.push({ signal: 'named_decision_maker', quote: `you can ask for ${understood.people[0].name}` });
  if (team) signals.push({ signal: 'team_size_known', quote: `at least ${team} people named on their own site` });
  if (understood.yearsInBusiness >= 20) signals.push({ signal: 'long_established', quote: `${understood.yearsInBusiness} years, by their own account` });
  const tells = scoreAutomationFit({ signals });

  const score = Math.max(0, Math.min(100, Math.round(fromHours * 0.75 + Math.min(tells.score, 100) * 0.25)));
  return {
    score,
    evidence: [
      { signal: 'hours_sitting_here', label: `About ${hours.hours} hours a week of repetitive office work`, weight: fromHours, url: null, quote: hours.because },
      ...tells.evidence,
    ],
  };
}

// ---------------------------------------------------------------------------
// Is the address on file worse than one we just read off their own site?
//
// A personal mailbox — gmail, yahoo, the local cable company — is a perfectly
// good address for a small business and never counts as wrong.
const A_PERSONAL_MAILBOX = /^(gmail|yahoo|hotmail|outlook|aol|icloud|msn|comcast|bendbroadband|live|me|mac|protonmail|att|verizon|sbcglobal|frontier|centurylink|q|charter|cox|earthlink|juno|mail)\./i;

function domainOf(value) {
  try {
    const s = String(value || '');
    return new URL(s.startsWith('http') ? s : `https://${s}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}

function betterAddressFound(r, understood, url) {
  if (r.emailManualValue) return null;               // Russ typed it; it stands
  const site = domainOf(url);
  if (!site) return null;

  // What this read actually saw published on their own domain.
  const onTheirDomain = [
    ...understood.people.filter((p) => p.email).map((p) => p.email),
    ...(understood.sharedEmail ? [understood.sharedEmail] : []),
  ].filter((e) => {
    const host = e.split('@')[1];
    return host && (host === site || site.endsWith(`.${host}`) || host.endsWith(`.${site}`));
  });
  if (!onTheirDomain.length) return null;

  const held = String(r.email || '').toLowerCase();
  if (!held) return onTheirDomain[0];                // nothing on file: take it
  const heldHost = held.split('@')[1] || '';
  if (heldHost === site) return null;                // already on their domain
  if (A_PERSONAL_MAILBOX.test(heldHost)) return null; // a personal box is fine
  return onTheirDomain[0];
}

// A name that is really a page title. Every one of these is a fact about the
// STRING, which is the one place a pattern belongs — it decides only whether
// to TRUST the name on file, never what the business is.
const A_PAGE_TITLE = /( [-|–—] |&#|&amp;|^(home|index|welcome|about( us)?|contact( us)?|shop now|menu)$|\.(com|net|org|biz)\b|^[a-z0-9-]+\.[a-z]{2,4}$|\bnear me\b)/i;
function nameLooksLikeAPageTitle(name) {
  const n = String(name || '').trim();
  return n.length > 0 && (A_PAGE_TITLE.test(n) || n.length > 70);
}

async function writeItDown(db, r, understood, reach, ranked, found, opportunity, url) {
  // Everything behind the number, in the shape the account card already reads:
  // a list of tells, then one line saying what reaching them costs the score.
  // The evidence already on file is not always a list. An earlier version of
  // this pass wrote it as a single object, so 25 records carry that shape and
  // reading them as a list threw (2026-08-28). Anything that is not a list is
  // treated as nothing rather than crashing the whole run.
  let tells = opportunity.evidence;
  if (!Array.isArray(tells)) {
    try { tells = JSON.parse(r.scoreEvidence || '[]'); } catch { tells = []; }
  }
  if (!Array.isArray(tells)) tells = [];

  const evidence = JSON.stringify([
    ...tells.filter((e) => e && e.signal !== 'held_by_reach'),
    {
      signal: 'held_by_reach',
      label: ranked < opportunity.score
        ? `Held at ${ranked} — ${reach.inWords.toLowerCase()}`
        : `Reachable: ${reach.inWords.toLowerCase()}`,
      weight: ranked - opportunity.score,
      url: null,
      quote: `the fit is ${opportunity.score}; getting to them is what decides whether it stands`,
    },
  ]);

  await db.prospect.update({
    where: { id: r.id },
    data: {
      ...(understood.trade ? { trade: understood.trade } : {}),
      ...(understood.whatTheyDo ? { theirWork: understood.whatTheyDo } : {}),
      // A general inbox is a way in, so it goes on the business — never on a
      // person. Only where nothing better is already on file.
      ...(understood.sharedEmail && !r.email && !r.emailManualValue
        ? { email: understood.sharedEmail, emailStatus: 'SHARED_INBOX', emailConfidence: 0.6 } : {}),
      // AN ADDRESS THAT BELONGS TO SOMEBODY ELSE.
      //
      // 68 businesses hold an address on a different domain to their website.
      // Most are fine — Three Creeks Brewing uses its brewpub domain, a
      // realtor uses their brokerage — and comparing the two names as strings
      // cannot tell those apart from a genuine error. So nothing is decided by
      // comparing names. It is decided by evidence: if this read found an
      // address published on their OWN domain and the record is holding one
      // that is neither on that domain nor a personal mailbox, the published
      // one wins, because it was seen on their site and the other was not.
      // Never touches an address Russ typed himself (2026-08-28).
      ...(betterAddressFound(r, understood, url)
        ? { email: betterAddressFound(r, understood, url), emailStatus: 'READ_FROM_THEIR_SITE', emailConfidence: 0.8 }
        : {}),
      // THE PHONE. There is not one number on the whole list of 32,739 — the
      // register this list came from does not publish them, so the calling day
      // has nothing to dial (found 2026-08-28). Businesses put their number on
      // their own homepage, which is free to read and always theirs.
      ...(understood.mainPhone && !r.phone ? { phone: understood.mainPhone } : {}),
      // NO RENAMING HERE. It was tried and it made things worse: Branch Bros
      // became "Home page" and Horner Law became "Horner Law Home - Horner
      // Law, LLP, Attorneys at Law". The reader was handing back the browser
      // tab title, which is the same class of mistake the names already
      // suffer from. A bad name is at least recognisable; a bad name replaced
      // by a worse one is a record Russ cannot find (2026-08-28). The real
      // name is still recorded below, so it can be reviewed rather than
      // applied blind.
      // WHY THE NAME IS APPLIED NOW, HAVING BEEN REFUSED BEFORE.
      //
      // The earlier attempt made things worse because the question was weak —
      // "is the record's name wrong?" — and nothing checked what came back, so
      // Branch Bros became "Home page". Both halves are fixed. The reader is
      // now asked what the business is CALLED, the name on the sign, and the
      // answer is thrown away unless it was actually printed on their pages and
      // is the shape of a name rather than a browser tab title.
      //
      // 194 of 1,268 carry a name Russ could not find his own business under —
      // "Home", "Circulars - Grocery Outlet", "Bend Dentist — Bend Family
      // Dentistry — Third Street — Bend, OR". It is the most visible field on
      // the list. Only ever where the name on file fails a STRING test, never
      // where Russ typed it himself, and the old name is kept on the record so
      // nothing is lost and the change can be read back (2026-08-28).
      ...(understood.realName && !r.nameManualValue && nameLooksLikeAPageTitle(r.name)
        ? { name: understood.realName, selfDescription: `was on file as: ${r.name}` }
        : understood.realName ? { selfDescription: `calls itself: ${understood.realName}` } : {}),
      ...(understood.yearsInBusiness ? { yearsInBusiness: understood.yearsInBusiness } : {}),
      automationScore: ranked,
      scoreEvidence: evidence,
      siteGaps: understood.cannotTell ? JSON.stringify([understood.cannotTell]) : null,
      stalledBuild: understood.stalledBuild || null,
      separateOperations: understood.separateOperations || 1,
      siteStatus: 'READ',
      siteReadAt: new Date(),
      // OFF THE REVIEW PILE. 31,318 records were screened out for having no
      // way to reach them. If reading their own site turned one up, the reason
      // they were set aside no longer holds and the record belongs on the
      // worked list — otherwise the run finds things and leaves them buried.
      // Only ever in this direction: nothing here puts a business INTO review.
      ...(r.stage === 'NEEDS_REVIEW'
        && (understood.sharedEmail || understood.mainPhone || found.peopleWithEmail > 0)
        ? { stage: 'NO_CONTACT' } : {}),
    },
  });

  // The people. Matched on the name so a correction typed against a person is
  // not thrown away and re-added as a stranger.
  const already = await db.contact.findMany({
    where: { prospectId: r.id },
    select: { id: true, name: true, role: true, email: true, phone: true, linkedIn: true },
  });
  const lost = [];   // people the record refused, for a reason nobody expected
  const byName = new Map(already.filter((c) => c.name).map((c) => [c.name.trim().toLowerCase(), c]));

  // THE SAME PERSON UNDER A MIDDLE INITIAL.
  //
  // The register writes an owner as "Gary L Weltmann"; his own website says
  // "Gary Weltmann". Matching on the name exactly makes those two people, so
  // 132 humans were sitting on their own cards twice, each holding half of
  // what is known about them (2026-08-28).
  //
  // Matched on first name and surname only, which is a fact about the string.
  // Deliberately NOT on surname alone: Kassandra, Spencer and Katie Rydman are
  // three people in one family business, and merging them would invent a
  // person who does not exist.
  const firstAndLast = (n) => {
    const w = String(n || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((x) => x.length > 1);
    return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : null;
  };
  const bySameHuman = new Map();
  for (const c of already) {
    const k = c.name && firstAndLast(c.name);
    if (k && !bySameHuman.has(k)) bySameHuman.set(k, c);
  }

  // A NAMELESS ROW IS A PERSON WHOSE NAME WAS NEVER CAPTURED.
  //
  // An earlier pass collected addresses without names, so Branch Bros carries a
  // row holding yod@branchbros.llc and nobody. A business may only hold an
  // address once, so tonight's read — which DID get him, "Yod Branch, Owner,
  // with a LinkedIn profile" — could not be written: the address was taken, the
  // write threw, and the catch below swallowed it without a word. The record
  // kept an anonymous address and threw the man away (2026-08-28). 448
  // businesses carry a nameless row like this, so this was about to happen
  // quietly, hundreds of times, across the whole run.
  //
  // An address already on file with nobody attached IS that person's row. The
  // name goes into it rather than beside it.
  const namelessByEmail = new Map(
    already.filter((c) => !c.name && c.email).map((c) => [c.email.trim().toLowerCase(), c]),
  );

  for (const p of understood.people) {
    let match = byName.get(p.name.trim().toLowerCase())
      || bySameHuman.get(firstAndLast(p.name));
    if (!match && p.email && namelessByEmail.has(p.email)) {
      match = namelessByEmail.get(p.email);
      namelessByEmail.delete(p.email);      // one row, one person
    }
    // Only ever fill a blank or improve on nothing — never wipe what is there.
    const filled = {
      ...(p.role ? { role: p.role } : {}),
      ...(p.email ? { email: p.email } : {}),
      ...(p.phone ? { phone: p.phone } : {}),
      ...(p.linkedIn ? { linkedIn: p.linkedIn } : {}),
      ...(p.seenOn ? { foundOn: p.seenOn } : {}),
    };
    try {
      if (match) {
        // Where the row had nobody attached, the name is what it was missing.
        await db.contact.update({
          where: { id: match.id },
          data: { ...filled, ...(match.name ? {} : { name: p.name }) },
        });
      } else {
        await db.contact.create({
          data: { prospectId: r.id, name: p.name, source: 'WEBSITE', ...filled },
        });
      }
    } catch (e) {
      // A PERSON WHO COULD NOT BE SAVED IS NEWS, not a shrug.
      //
      // This swallowed every failure silently. The note said "two people
      // sharing an address", and that is one real case — two staff listed
      // under the same inbox, where the first keeps it. But the catch did
      // not check: ANY failure here dropped a person with nobody told. It
      // is how 887 people were read off pages, counted, reported, and
      // never written down (2026-08-29).
      //
      // The expected case still passes quietly. Anything else is counted
      // and handed back, so the run can say how many people it lost.
      const expected = /Unique constraint|prospectId_email/i.test(String(e && e.message || e));
      if (!expected) lost.push(`${p.name}: ${String(e && e.message || e).slice(0, 70)}`);
    }
  }
  return lost;
}

// Shared with the OpenRouter-based read, which asks the same question of the
// same pages and must save the answer exactly the same way. It was written
// once with its own saving step and quietly dropped 887 people on the floor —
// found, counted, reported, never written down (2026-08-29). One saving
// function, used by both, is the only way that cannot happen twice.
module.exports = { writeItDown, hasContactForm, opportunityFromTheRead };
