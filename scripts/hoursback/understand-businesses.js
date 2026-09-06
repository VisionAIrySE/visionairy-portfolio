#!/usr/bin/env node
// Read every business's own website — the WHOLE site — and understand it.
//
//   node scripts/hoursback/understand-businesses.js --look --limit=12
//   node scripts/hoursback/understand-businesses.js --limit=50
//   node scripts/hoursback/understand-businesses.js            (one batch of 50)
//
// --look prints what was understood and writes nothing.
//
// Russ, 2026-08-28: "I want them researched effectively, validated, confirmed
// accurate and fleshed out so I can use them." And 2026-09-01: read EVERY
// page, sort each by what it is for, and keep all of it.
//
// HOW A VISIT WORKS NOW (2026-09-01, replacing the 8-page single-question read):
//
//   1. crawl the whole site — every same-host page, two minutes at most, ten
//      pages of one path shape at most EXCEPT under the team page
//   2. classify every page by purpose — identity, services, contact, people,
//      hiring, news; a page can carry several
//   3. one focused model read per non-empty group, in parallel, batched where
//      a group outgrows its allowance; a reconciliation read ONLY where the
//      groups genuinely contradict each other or all come back empty
//   4. ONE immutable reading per visit: startReading once, keepPage for every
//      fetched page (the skipped ones included), record() for every finding
//      naming the group that produced it, finishReading always — partial
//      visits KEPT and marked partial, never discarded
//
// COST. Runs on the Claude Code login already on this machine, with Haiku.
// A CEILING is in the code below before anything runs, because a loop that
// spends without one has cost Russ real money before. Fifty businesses a
// batch — the standing order of 2026-08-29 — and every model call leaves
// through askTheReader() to the LOCAL reader: no OpenRouter, no paid call.

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
const {
  keepOnlyWhatWasRead, readSiteInGroups, makeFlightController, mergedUnderstood, PURPOSES,
} = require('../../src/hoursback/understand.js');
const { howToReachThem, callOrderScore } = require('../../src/hoursback/reachable.js');
const { recordGroupedRead, READER } = require('../../src/hoursback/recordTheRead.js');
const R = require('../../src/hoursback/readings.js');
const { readAnswer } = require('../../src/hoursback/readAnswer.js');
const { detectedTools } = require('../../src/hoursback/siteRead.js');
const { looksLikeARealPage } = require('../../src/hoursback/browserRead.js');

// Which model answered, and which version of this reader asked. Both are kept
// on every reading, so a batch that turns out to be wrong can be found and set
// aside by the reader that made it, instead of by guessing at dates.
const MODEL = 'haiku';
const READER_VERSION = '2026-09-01-whole-site';

/// What the few words on a near-empty site actually mean. One question, asked
/// only where a site gave SOMETHING but not enough to read as a business.
const WHY_NOTHING_HERE = (name, words) => `A business on file as "${name}" has a web address, and this is EVERYTHING on it:

"""
${words}
"""

That is not a working business website. Read what is actually there and say which of these it is.

Answer with JSON and nothing else:

{
  "verdict": one of "acquired", "not_built_yet", "moved_elsewhere", "blocked_to_us", "a_real_small_site", "cannot_tell",
  "quote": the sentence above that proves it, copied exactly, or null
}

"acquired" only where the words say this business is now part of, owned by, or trading as another company. Name that company in the quote.
"not_built_yet" where this is a website builder's placeholder, a parked domain, or a page nobody has built yet.
"moved_elsewhere" where the words point at a different website as the real one.
"blocked_to_us" where this is a robot check, a security screen, or a "turn on JavaScript" notice: the site exists, we were not let in.
"a_real_small_site" where this genuinely is their whole site and it is simply very small.
"cannot_tell" where the words do not settle it. Say that rather than choosing the closest, and set quote to null.`;

/// IS THIS EVEN THEIR WEBSITE? Asked at the front door, before anything is
/// spent (Russ, 2026-09-03: "we have to do a quick initial pass when we first
/// hit a page to validate we have the right site before we dump this much into
/// the wrong websites").
///
/// Two of twelve sites read tonight belonged to strangers. One was a Turkish
/// gambling site; the other was Dassault Systemes, a French software company,
/// and it cost 226 pages and 49 questions before anything noticed. The check
/// that catches a directory compares the business's name to the domain, which
/// cannot catch a real company's real website that simply is not theirs.
///
/// So: one question, on the front page alone. A wrong answer here costs one
/// question; being wrong the other way costs a whole night.
const IS_THIS_THEIRS = (name, town, url, words) => `A business on file as "${name}"${town ? ` in ${town}` : ''} has this web address: ${url}

These are the first words on that page:

"""
${words}
"""

Is this page the website of THAT business?

Answer with JSON and nothing else:

{
  "verdict": one of "theirs", "somebody elses", "cannot tell",
  "whose": if it is somebody else's, whose it appears to be, or null
}

Judge it on whether these words are THIS business talking about itself. A page selling software to manufacturers is not a Central Oregon plumber's website, however professional it looks. A page in another language, about another industry, or about a company with a different name, is somebody else's.

Say "theirs" where the words are plainly this business: their name, their town, their trade, their services. A small or unfinished page is still theirs.
Say "cannot tell" where the words do not settle it. Do not guess in either direction.`;

const arg = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const LOOK = process.argv.includes('--look');
const LIMIT = Number(arg('limit', 0));
const LANES = Number(arg('lanes', 3));
const ONLY = arg('only', '');
// Only businesses that already have a message drafted to them — the list Russ
// actually works. Read these first so the CRM becomes usable after the first
// fifty rather than after all 1,602 (2026-09-01).
const EMAILABLE = process.argv.includes('--emailable');
// --untried: ONLY businesses whose website has never been opened at all.
//
// A test run of three picked juniper-insurance.com, joelochner.com and
// bisnett.com — the three we already know are a builder's placeholder, a
// server that hangs up on us, and a business that was acquired. Left alone,
// the nightly run would spend its first attempts on the same dead sites every
// night. 1,458 have never been looked at and 31 have been tried and failed, so
// the untouched ones come first and the retries wait their turn.
const UNTRIED = process.argv.includes('--untried');

// --- the ceilings, in code, before anything runs ----------------------------
//
// FIFTY SITES A BATCH. The standing order (Russ, 2026-08-29, reaffirmed
// 2026-09-01): website reading runs 50 at a time, on the local session's
// Claude only. However many are asked for, no run reads past this.
const BATCH_OF_SITES = 50;

// HOW LONG TO WAIT FOR AN ANSWER.
//
// Two minutes was enough at eight o'clock and not at nine. The reader got
// slower as the evening went on — 41 to 61 seconds an answer where it had
// been half that — and every answer past the limit was thrown away. 22 asked,
// 0 answered (2026-08-28). So: wait four minutes per call, and let the flight
// controller decide how many fly at once from what the reader actually does.
const READ_TIMEOUT_MS = 240000;
// The reader ignores a polite stop, so this is the one that actually fires:
// our own timer, and a kill it cannot refuse. A normal read takes ~13 seconds.
const HARD_KILL_MS = 180000;

// How long one business's model reads may take in total. The crawl carries
// its own two-minute limit inside crawlWholeSite(); this bounds the reads
// that follow it. A visit that runs out is KEPT and marked partial.
const VISIT_READ_BUDGET_MS = 12 * 60000;

// A clean room to read in. Run from the project folder, the reading tool picks
// up this project's own startup scripts and answers as if it were a session —
// twenty seconds and the wrong answer. An empty folder with the extras turned
// off answers the question that was asked.
const ROOM = path.join(require('os').tmpdir(), 'hoursback-reader');
fs.mkdirSync(ROOM, { recursive: true });

// Every model call this run makes, written down as it happens: which reader,
// which model, how long. The run log can then SHOW there was no OpenRouter
// call and no paid call, rather than assert it.
const callLog = [];

// READERS THAT ARE ALREADY AWAKE (2026-09-03).
//
// Every question below starts a reader from cold, and that start-up alone was
// measured at 7.5 seconds for a question with nothing in it to think about.
// A business asks five to seven questions, so most of a night went on
// watching the same program wake up.
//
// A couple of readers are kept started and waiting now, so a question is
// handed to one already awake. Each still answers exactly ONE question and is
// then closed — the steps are deliberately blind to each other and a shared
// conversation would destroy that. Two, not more: four idle readers cost 1.26
// GB, which on this machine is a worse trade than the time it buys.
//
// If the pool cannot start for any reason, every question falls back to the
// cold path below and the run is slow rather than broken.
const { makeReaderPool } = require('../../src/hoursback/readerPool.js');
let thePool = null;
function readerPool() {
  if (thePool === null) {
    try {
      thePool = makeReaderPool({
        // READY READERS COST MEMORY, SO THERE ARE FEW (2026-09-04, measured).
        //
        // Two ready readers against six businesses meant four were always
        // queueing, and an empty pool starts one from cold — about eight
        // seconds before the question is even asked.
        //
        // Raising it to eight made that worse, not better: each waiting reader
        // holds about 280 MB, a replacement is started the moment one is taken,
        // and a three-business test had nineteen of them alive holding 5.3 GB
        // on a 9 GB machine. Memory pressure is what makes the fans run.
        //
        // Four is the compromise: enough that a business rarely waits, few
        // enough that they fit. Raise it only with a memory check beside it.
        size: Number(process.env.HOURSBACK_WARM_READERS || 4),
        hardKillMs: HARD_KILL_MS,
        cwd: ROOM,
        onCall: ({ ms, answered }) => callLog.push({ via: 'local claude', model: 'haiku', ms, answered, warm: true }),
      });
    } catch { thePool = false; }
  }
  return thePool;
}
function closeReaderPool() {
  if (thePool) { try { thePool.close(); } catch { /* gone */ } }
  thePool = false;
}

function askTheReader(question) {
  const pool = readerPool();
  if (pool) return pool.ask(question);
  return askTheReaderCold(question);
}

function askTheReaderCold(question) {
  const began = Date.now();
  return new Promise((resolve) => {
    // A HUNG READ MUST NOT HOLD THE RUN.
    //
    // execFile's own `timeout` sends SIGTERM, which the reader ignores, so the
    // promise never settles: on 2026-09-02 one read sat for over ten minutes
    // against a normal thirteen seconds, and every business behind it waited.
    // The cutoff was in the code the whole time and did nothing.
    //
    // So the timer is ours, the kill is SIGKILL, and the promise settles
    // whether or not the child ever answers. A read that dies is recorded as
    // no answer — which is true — rather than stopping the night.
    let child = null;
    let settled = false;
    const answer = (v) => { if (!settled) { settled = true; clearTimeout(guard); resolve(v); } };
    const guard = setTimeout(() => {
      try { if (child && child.pid) process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ }
      callLog.push({ via: 'local claude', model: 'haiku', ms: Date.now() - began, answered: false, killed: true });
      answer({ answer: null, why: `the reader did not answer inside ${Math.round(HARD_KILL_MS / 1000)}s and was stopped` });
    }, HARD_KILL_MS);

    child = execFile('claude', [
      '-p', question,
      '--model', 'haiku',
      '--system-prompt', 'You read web pages and answer with JSON only. No preamble, no explanation, no code fences.',
      '--exclude-dynamic-system-prompt-sections',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--settings', '{"hooks":{},"enabledPlugins":{}}',
      '--disallowed-tools', 'Bash,Read,Write,Edit,WebFetch,WebSearch,Glob,Grep,Task,TodoWrite',
    ], { cwd: ROOM, timeout: READ_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (settled) return;
      callLog.push({ via: 'local claude', model: 'haiku', ms: Date.now() - began, answered: Boolean(stdout) });
      if (err && !stdout) return answer({ answer: null, why: 'the reader did not answer' });
      const text = String(stdout || '');
      // THE READER'S OWN LIMIT IS NOT A THIN WEBSITE.
      //
      // When the local reader is out of allowance it answers in prose about
      // that, not in JSON. On 2026-09-02 six businesses in a row were recorded
      // as "kept the trade sentence" — six honest-looking fallbacks that were
      // really one dead reader (feedback-a-working-fallback-hides-a-dead-primary).
      if (/session limit|usage limit|rate limit|resets at|out of (credit|quota)/i.test(text.slice(0, 400))) {
        return answer({ answer: null, why: 'THE READER IS OUT OF ALLOWANCE — this is not a thin website', readerExhausted: true });
      }
      // Prose in front of it, a code fence around it, a trailing comma, the
      // model's own curly quotes, a line break inside a sentence: every one
      // of those used to be "broken JSON" and cost the business its opening
      // line. They are read properly now (src/hoursback/readAnswer.js).
      answer(readAnswer(text));
    });
  });
}

// ---------------------------------------------------------------------------
// SURVIVING THE NIGHT (2026-09-02). Three failures at 3,000 businesses each
// used to ruin a whole run, and this block answers all three:
//
//   1. The reader runs out of allowance mid-run. askTheReader detects it
//      (readerExhausted on the result) but nothing acted on it: on 2026-09-02
//      six businesses in a row were recorded as honest-looking failures that
//      were really one dead reader. makeReaderGuard below turns the detection
//      into a STOP — not one more business starts, nothing further is written,
//      and the run exits EXIT_READER_EXHAUSTED so a wrapper can tell it from
//      a crash.
//   2. A run whose FIRST calls all fail is broken, not facing thousands of
//      thin websites. FIRST_CALLS_MUST_ANSWER failures before a single answer
//      stops the run with EXIT_BROKEN_START.
//   3. However a run ends — finished, reader out, broken start, crash — ONE
//      plain-English line lands on docs/hoursback/last-run.md, the last thing
//      written. It is a status board, not a record: overwriting it is fine,
//      and nothing ever resumes FROM it — a resume counts from the database.

const LAST_RUN = path.resolve(__dirname, '../../docs/hoursback/last-run.md');

// The one line that tells the owner how the last run ended. Written on EVERY
// ending, and always the last thing written.
function writeLastRun({ script, why, done, remaining, needsPerson = null, at = LAST_RUN }) {
  const line = `${script} stopped ${new Date().toISOString()} — ${why}; `
    + `${done} done, ${remaining} left; `
    + `${needsPerson ? `needs a person: ${needsPerson}` : 'needs nobody'}.`;
  try { fs.writeFileSync(at, `${line}\n`); } catch { /* the status board must never sink the run itself */ }
  return line;
}

// The stop reasons as FIXED strings, so a reading closed with one of them can
// be recognised for what it was — the run stopping, never that business
// failing — and the business counted as unreached and still eligible.
const READER_OUT_MSG = 'THE READER IS OUT OF ALLOWANCE — the run stops here; this business was cut off, not read';
const BROKEN_START_MSG = 'the run could not get a single answer from the reader in its first tries — stopped as broken, not as thousands of thin websites';
const READER_SILENT_MSG = 'the reader answered none of the group reads';
// The three ways OUR OWN TOOL gave nothing back. A reading closed with one of
// these says nothing whatever about the business, so it must not retire them
// from the untouched list — and it must not send them round again forever
// either. See the note on neverOpened below.
const READER_GAVE_NOTHING = [READER_OUT_MSG, BROKEN_START_MSG, READER_SILENT_MSG];

// How many calls may fail, before ANY has succeeded, before the run is judged
// broken. One answered call, ever, retires this check for the whole run.
const FIRST_CALLS_MUST_ANSWER = 5;

// Distinct exit codes, so a wrapper can tell these endings from a crash (1).
const EXIT_READER_EXHAUSTED = 75; // temporary: rerun with --fresh once the allowance resets
const EXIT_BROKEN_START = 74;     // the reader needs a person before any rerun

// Wraps the reader for ONE run. The wrapped ask behaves exactly like the real
// one until the reader is out of allowance (readerExhausted on the result) or
// the run's first calls have all failed — then it THROWS an error marked
// stopTheRun, and keeps throwing without ever calling the reader again, so
// every business in flight aborts before recording anything and no new
// business can start. The exhausted answer itself is never handed onward:
// handed onward it becomes a plausible "could not tell" on the record, which
// is exactly the lie this guard exists to stop.
function makeReaderGuard(rawAsk, { firstCallsMustAnswer = FIRST_CALLS_MUST_ANSWER } = {}) {
  const state = {
    readerOut: false, brokenStart: false,
    answeredEver: false, failedBeforeFirstAnswer: 0, calls: 0,
  };
  const stopNow = (message, mark) => {
    const e = new Error(message);
    e.stopTheRun = true;
    e[mark] = true;
    return e;
  };
  const ask = async (question) => {
    if (state.readerOut) throw stopNow(READER_OUT_MSG, 'readerExhausted');
    if (state.brokenStart) throw stopNow(BROKEN_START_MSG, 'brokenStart');
    const res = await rawAsk(question);
    state.calls += 1;
    if (res && res.readerExhausted) {
      state.readerOut = true;
      throw stopNow(READER_OUT_MSG, 'readerExhausted');
    }
    if (res && res.answer) {
      state.answeredEver = true;
    } else if (!state.answeredEver) {
      state.failedBeforeFirstAnswer += 1;
      if (state.failedBeforeFirstAnswer >= firstCallsMustAnswer) {
        state.brokenStart = true;
        throw stopNow(BROKEN_START_MSG, 'brokenStart');
      }
    }
    return res;
  };
  return { ask, state };
}

// Is there a way to write to them that is not an address? Only a fact about
// the page's own markup, which is the one place a pattern belongs.
const A_FORM = /<form[\s\S]{0,400}?(type=["']?(email|text)|name=["']?(email|message|comments|inquiry|name))/i;
function hasContactForm(pages) {
  return pages.some((p) => A_FORM.test(String(p.html || '')));
}

// ---------------------------------------------------------------------------
// ONE VISIT to one business — the whole flow, exported so it can be tested.
//
// One startReading(), one keepPage() per fetched page (skip-from-reading
// pages INCLUDED — a wrong skip must be recoverable without a second visit),
// one record() per finding, one finishReading() however the visit ends.
// There is deliberately NO skip-if-unchanged guard and NO early return that
// would keep a page from being stored or a finding from being recorded on a
// re-visit: that guard has twice thrown away every new field added below it.
async function visitOneBusiness(db, r, deps = {}) {
  const askReader = deps.askTheReader || askTheReader;
  const controller = deps.controller || makeFlightController();
  const look = deps.look === undefined ? LOOK : deps.look;
  const name = r.nameManualValue || r.name || '';
  // THE FRONT DOOR. Their address with any advertising tracking taken off it —
  // 109 businesses' addresses were copied off a Google listing with tracking
  // attached, and opened as given they bounce and hand back nothing. What is
  // stored is not changed; this is only how we knock.
  const url = ps.frontDoor(r.websiteManualValue || r.website);

  const visit = {
    name, url, outcome: null, fetched: 0, failures: 0, skipped: 0,
    byPurpose: {}, modelCalls: 0, partial: false, concurrency: null,
    understood: null, reach: null, ranked: null, found: null, opportunity: null,
    error: null,
  };

  if (whyNotTheirs(url, name)) { visit.outcome = 'not_their_site'; return visit; }

  // ONE reading per visit. It opens as FAILED so a crash mid-visit leaves a
  // reading that says so, and every group read below shares its readingId.
  const reading = look ? null : await R.startReading(db, {
    prospectId: r.id, source: R.WEBSITE, sourceUrl: url,
    reader: READER, readerVersion: READER_VERSION, model: MODEL,
  });

  try {
    // THE FRONT DOOR, CHECKED BEFORE ANYTHING IS SPENT. One page, one question:
    // is this actually their website? Two of twelve sites tonight were
    // strangers' — a Turkish gambling site and a French software company, the
    // second costing 226 pages and 49 questions before anything noticed.
    if (!look && !deps.skipTheirsCheck) {
      // A CHECK THAT SAVES TIME MUST NEVER COST TIME. The first version of
      // this hung for ten minutes on the very site it exists to catch. One
      // page, half a minute, and then it gives up and lets the ordinary read
      // decide — being slow here would defeat the whole point.
      // Ninety seconds. The wrong answer is the slow one — Dassault Systèmes'
      // front page took the reader 24 seconds to judge, against 8 for a small
      // plumber — so a tight limit would time out exactly on the sites this
      // exists to catch.
      const GIVE_UP_AFTER_MS = 90000;
      const inTime = (work) => Promise.race([
        work,
        new Promise((resolve) => setTimeout(() => resolve(null), GIVE_UP_AFTER_MS)),
      ]);
      let front = null;
      try {
        const one = await inTime(ps.crawlWholeSite(url, {
          fetch: deps.fetch, delayMs: 0, timeLimitMs: 20000, pageCeiling: 1,
        }));
        front = one && (one.pages || [])[0];
      } catch { /* cannot open it: the ordinary path below records that */ }
      const firstWords = String((front && front.text) || '').trim().slice(0, 1500);
      if (firstWords.length > 120) {
        try {
          const said = await inTime(askReader(IS_THIS_THEIRS(name, r.address || '', url, firstWords)));
          const verdict = said && said.answer && String(said.answer.verdict || '').toLowerCase().trim();
          // UNSURE MEANS ASK RUSS, NOT GUESS (his instruction, 2026-09-03).
          // Reading a stranger's whole site costs a night; asking him costs a
          // line in the morning report. The visit stops and says so.
          if (verdict === 'cannot tell') {
            if (reading) {
              await R.record(db, {
                readingId: reading.id,
                prospectId: r.id,
                field: 'theirOwnSite',
                value: null,
                status: R.COULD_NOT_TELL,
                url,
                quote: 'the front page did not settle whether this site is theirs',
              });
              await R.finishReading(db, reading.id, R.FAILED,
                'stopped at the front door: could not tell whether this site is theirs, and Russ decides');
            }
            visit.outcome = 'ask_russ_whose_site';
            return visit;
          }
          if (verdict === 'somebody elses') {
            const whose = said.answer.whose ? String(said.answer.whose).slice(0, 120) : 'somebody else';
            if (reading) {
              await R.record(db, {
                readingId: reading.id,
                prospectId: r.id,
                field: 'theirOwnSite',
                value: 'no',
                status: R.INFERRED,
                url,
                quote: `the front page is ${whose}, not this business`,
              });
              await R.finishReading(db, reading.id, R.FAILED,
                `not their site: the front page is ${whose}`);
            }
            visit.outcome = 'not_their_site';
            visit.whoseSiteItIs = whose;
            return visit;
          }
        } catch { /* one unanswered question never stops a visit */ }
      }
    }

    let crawl;
    try {
      crawl = await ps.crawlWholeSite(url, { fetch: deps.fetch, delayMs: deps.delayMs, timeLimitMs: deps.crawlTimeLimitMs });
    } catch (e) {
      crawl = { pages: [], failures: [], partial: false, stoppedShapes: [], error: e.message };
    }
    // READING A SITE MEANS READING ALL OF IT (Russ, 2026-09-03).
    //
    // About two sites in five hand an ordinary fetch nothing but a page
    // title: their words only appear once a browser has run the page's
    // scripts, or a robot check stands in front of them. Recovering those
    // was a separate pass that had to be remembered and pointed at them, and
    // so it mostly was not — twenty-one of fifty in one batch sat unread with
    // the tool to read them sitting right there.
    //
    // It is not a separate pass any more. When nothing on a site reads as a
    // business talking, this visit opens a real browser and reads it again,
    // itself, before deciding anything. One visit, one reading, whatever it
    // takes to actually read them.
    //
    // The ordinary attempt is NOT thrown away: what a plain fetch saw is a
    // real event and is stored beside what the browser saw. Both are kept.
    visit.readVia = 'fetch';
    visit.wordsRecovered = 0;
    let alsoStore = [];
    const spokeToUs = (pages) => (pages || [])
      .some((pg) => looksLikeARealPage(String((pg && pg.text) || '')));
    //
    // A visit handed a stand-in way to fetch — which is every test — must
    // never quietly launch a real browser against the real internet. It gets
    // a stand-in browser or it gets none.
    const openBrowser = deps.crawlWithBrowser
      || (deps.fetch ? null : require('../../src/hoursback/browserRead.js').crawlWithBrowser);
    if (openBrowser && !spokeToUs(crawl.pages)) {
      try {
        // probe:false — we have already proved a plain fetch cannot read it.
        const viaBrowser = await openBrowser(url, { probe: false, delayMs: deps.delayMs });
        // KEEP WHAT THE BROWSER GOT, EVEN WHEN IT IS NOT A WHOLE PAGE.
        //
        // This used to take the browser's version only when a page looked like
        // a FULL business page. Bisnett Insurance's entire website is
        // "Bisnett Insurance is now a part of ... (800) 303-0419" — 91
        // characters, which does not clear that bar, so the browser's words
        // were discarded and the empty plain read was kept in their place. The
        // business is on file as unreadable when in fact it told us plainly
        // that it has been acquired.
        //
        // So the browser's version stands whenever it holds MORE than the
        // plain read did. What those words MEAN is a separate question, asked
        // below, and answered by a reader rather than by a length.
        const charsIn = (pages) => (pages || [])
          .reduce((n, pg) => n + String((pg && pg.text) || '').trim().length, 0);
        const browserSawMore = charsIn(viaBrowser.pages) > charsIn(crawl.pages);
        if (spokeToUs(viaBrowser.pages) || browserSawMore) {
          alsoStore = crawl.pages;                     // what the plain fetch saw, kept
          visit.wordsRecovered = viaBrowser.pages
            .reduce((n, pg) => n + String((pg && pg.text) || '').length, 0);
          crawl = {
            ...crawl,
            pages: viaBrowser.pages,
            failures: viaBrowser.failures || crawl.failures,
            partial: crawl.partial || Boolean(viaBrowser.partial),
          };
          visit.readVia = 'browser';
        }
      } catch (e) {
        // A browser that will not start is worth recording and is never worth
        // sinking the visit: the ordinary read stands as what we have.
        visit.browserError = String((e && e.message) || e);
      }
    }

    visit.fetched = crawl.pages.length;
    visit.failures = crawl.failures.length;
    // A CRAWL THAT STOPPED EARLY MUST SAY WHY (Russ, 2026-09-03: "watch for
    // stalls"). Ran-out-of-time and stopped-answering both ended as the same
    // word on screen, so a stall was invisible in a run of big sites.
    visit.stalled = Boolean(crawl.stalled);
    visit.saidNothingNew = Boolean(crawl.saidNothingNew);

    if (!crawl.pages.length) {
      if (reading) await R.finishReading(db, reading.id, R.UNREACHABLE, crawl.error || 'no page could be opened');
      visit.outcome = 'unreachable';
      return visit;
    }

    // Classify, group, and read — six focused questions at most, in parallel,
    // through the LOCAL reader only, plus a reconciliation read only where the
    // groups genuinely collide.
    const read = await readSiteInGroups({
      businessName: name,
      pages: crawl.pages,
      askTheReader: askReader,
      controller,
      deadline: Date.now() + (deps.visitReadBudgetMs || VISIT_READ_BUDGET_MS),
    });
    visit.modelCalls = read.modelCalls;
    visit.partial = crawl.partial || read.partial;
    visit.concurrency = read.concurrencySettledAt;
    visit.skipped = read.skipped.length;
    for (const purpose of PURPOSES) visit.byPurpose[purpose] = read.groups[purpose].length;

    // Every fetched page is KEPT — the skipped ones included, marked with
    // whether their words were handed to the model — before anything is
    // decided about what the answers mean. N pages fetched, N page rows.
    if (reading) {
      for (const page of crawl.pages) {
        await R.keepPage(db, reading.id, {
          url: page.url,
          title: page.title || null,
          text: page.text,
          sentToModel: read.sentUrls.has(page.url),
        });
      }
      // What the plain fetch saw before the browser was opened. A real
      // event, kept beside the browser's, never instead of it — that is how
      // a site that starts hiding its words can be recognised later.
      for (const page of alsoStore) {
        await R.keepPage(db, reading.id, {
          url: page.url,
          title: page.title || null,
          text: page.text,
          sentToModel: false,
        });
      }
    }

    // Each group's answer, cleaned against the pages of THAT group — a name
    // or address absent from those pages is dropped before record() sees it.
    const understoodByGroup = {};
    for (const purpose of PURPOSES) {
      if (!read.answers[purpose]) continue;
      const doc = (read.documents[purpose] || []).map((b) => b.document).join('\n\n');
      understoodByGroup[purpose] = keepOnlyWhatWasRead(read.answers[purpose], doc, name);
    }
    const understood = mergedUnderstood(understoodByGroup, read.reconciliation);
    visit.understood = understood;

    const groupsWithPages = PURPOSES.filter((g) => read.groups[g].length);
    const groupsAnswered = PURPOSES.filter((g) => read.answers[g]);
    if (groupsWithPages.length && !groupsAnswered.length) {
      // NOT ASKED IS NOT THE SAME AS ASKED AND FAILED.
      //
      // A site can return pages that carry no readable words at all — a bot
      // challenge, or a site whose text only appears once a browser runs its
      // scripts. Every group document is then empty, so no question is ever
      // put to the reader. Calling that "the reader failed" records a failure
      // that never happened and hides the real one, which is that the site
      // gave us nothing to read (2026-09-01, the evidence rule: absence is
      // data, and it must be recorded as itself).
      const anyWords = crawl.pages.some((pg) => (pg.text || '').trim().length > 0);
      if (!anyWords) {
        if (reading) await R.finishReading(db, reading.id, R.UNREACHABLE, 'the site opened but published no readable words — its text needs a browser, or a challenge page was served instead');
        visit.outcome = 'no_readable_words';
        return visit;
      }
      // There WERE words and the reader still answered nothing.
      if (reading) await R.finishReading(db, reading.id, R.FAILED, 'the reader answered none of the group reads');
      visit.outcome = 'reader_failed';
      return visit;
    }

    // Every system the visit detected — over the SKIPPED pages as well as the
    // read ones — each paired with the method that found it.
    const tools = detectedTools(crawl.pages, understood.toolsInUse || []);

    const partialNote = [
      visit.partial ? 'partial — stopped before everything was read; every answer that arrived is kept' : null,
      crawl.partial ? 'the crawl hit its two-minute limit' : null,
      crawl.stoppedShapes.length ? `stopped after ten pages of: ${crawl.stoppedShapes.join(', ')}` : null,
      read.cut.length ? `shortened for the reader (full text kept): ${[...new Set(read.cut)].join(', ')}`.slice(0, 400) : null,
      `concurrency settled at ${read.concurrencySettledAt}`,
    ].filter(Boolean).join('; ');

    if (reading) {
      await recordGroupedRead(db, {
        readingId: reading.id, prospectId: r.id, url,
        saidByGroup: read.answers, understoodByGroup,
        couldNotTell: read.couldNotTell,
        reconciliation: read.reconciliation,
        tools,
      });
    }

    // The pages turned out to belong to somebody else. The website on file is
    // cleared along with everything read off it — but the reading, its pages
    // and its findings all stay: the visit happened, and the verdict is a fact.
    if (understood.notTheirSite) {
      if (!look) {
        await db.prospect.update({
          where: { id: r.id },
          data: {
            website: null, websiteManualValue: null, normalizedDomain: null,
            siteStatus: 'NO_WEBSITE', siteReadAt: new Date(),
            siteGaps: JSON.stringify([understood.cannotTell]),
          },
        });
      }
      if (reading) await R.finishReading(db, reading.id, R.READ, `not their site; ${partialNote}`);
      visit.outcome = 'not_their_site';
      return visit;
    }

    const found = {
      peopleWithEmail: understood.people.filter((p) => p.name && p.email).length,
      peopleNamed: understood.people.length,
      peopleWithPhone: understood.people.filter((p) => p.phone).length,
      peopleWithProfile: understood.people.filter((p) => p.linkedIn).length,
      sharedEmail: understood.sharedEmail,
      contactForm: hasContactForm(crawl.pages),
      website: true,
      phone: Boolean(r.phone),
    };
    const reach = howToReachThem(found);
    // WORKED OUT AFRESH EVERY READ, never kept. A score has to be answerable
    // from what we can point at; if a fresh reading of their own site cannot
    // justify it, it should not stand (2026-09-01).
    const opportunity = opportunityFromTheRead(understood, found, r);
    const ranked = callOrderScore(opportunity.score, reach);
    visit.found = found;
    visit.reach = reach;
    visit.opportunity = opportunity;
    visit.ranked = ranked;

    // READ MEANS PAGES STORED (2026-09-02).
    //
    // If not one page of theirs landed with words on it, this visit did not
    // read them — whatever else it worked out along the way. Stamping it READ
    // anyway is what made six businesses permanently invisible: the resume
    // filter trusted the stamp and never came back, and they surfaced weeks
    // later at the writing step as "their site's words are not on file". The
    // visit is still recorded in full; it simply does not claim to be a read.
    //
    // AND A ROBOT CHECK IS NOT WORDS (2026-09-02). Deschutes Heating stored
    // one page of perfectly good English — "verify you are human, this
    // process is automatic" — and the run counted it as read, so the browser
    // pass that exists precisely for challenge pages never saw them. The
    // test is not "is there text" but "does anything here look like a
    // business talking": a phone number, an email, an address, or two of
    // navigation, service descriptions and a real body of varied words.
    //
    // Judged across the WHOLE SITE, never page by page — a real Contact page
    // can be three lines long, and it is the site as a whole that either
    // spoke to us or did not.
    const anyWords = (crawl.pages || [])
      .some((pg) => String((pg && pg.text) || '').trim().length > 0);
    const anythingReal = (crawl.pages || [])
      .some((pg) => looksLikeARealPage(String((pg && pg.text) || '')));
    const wordsLanded = anyWords && anythingReal;
    if (!look) {
      await writeItDown(db, r, understood, reach, ranked, found, opportunity, url, { wordsLanded });
    }
    // WHY THERE IS NOTHING HERE, ASKED RATHER THAN ASSUMED (Russ, 2026-09-03).
    //
    // Three sites came back near-empty and all three were recorded as the same
    // kind of nothing. They are not:
    //
    //   juniper-insurance.com  a website builder's placeholder. They are
    //                          launching. Worth coming back to.
    //   joelochner.com         moved to a State Farm page. The address we hold
    //                          is stale; there IS a site, elsewhere.
    //   bisnett.com            "Bisnett Insurance is now a part of Risk
    //                          Strategies". The business is gone as a prospect.
    //
    // Each deserves a different answer and the site itself says which. So where
    // a visit ends with words but not a readable site, the reader is asked what
    // those words mean, once, and the answer is kept as its own finding. A site
    // that gave literally nothing is not asked about: there is nothing to ask
    // with, and a guess is worse than the silence.
    if (!wordsLanded && anyWords && reading && !look) {
      const held = (crawl.pages || [])
        .map((pg) => String((pg && pg.text) || '')).join('\n').trim().slice(0, 2000);
      try {
        const reply = await askReader(WHY_NOTHING_HERE(name, held));
        const said = reply && reply.answer;
        const verdict = said && String(said.verdict || '').trim();
        if (['acquired', 'not_built_yet', 'moved_elsewhere', 'blocked_to_us', 'a_real_small_site']
          .includes(verdict)) {
          await R.record(db, {
            readingId: reading.id,
            prospectId: r.id,
            field: 'whyNothingOnTheirSite',
            value: verdict,
            status: said.quote ? R.OBSERVED : R.INFERRED,
            url,
            quote: said.quote ? String(said.quote).slice(0, 300) : null,
          });
          visit.whyNothing = verdict;
        }
      } catch { /* one unanswered question never sinks a visit */ }
    }

    if (reading) {
      await R.finishReading(db, reading.id, wordsLanded ? R.READ : R.FAILED,
        wordsLanded ? (partialNote || null)
          : (anyWords
            ? 'nothing on the site read as a business talking — a challenge page or a shell; '
              + 'this is not a read, and it needs a browser'
            : 'every page of theirs came back empty — nothing was stored, so this is not a read'));
    }
    visit.outcome = wordsLanded ? 'read' : 'no_readable_words';
    return visit;
  } catch (e) {
    // However a visit breaks, its reading is CLOSED as failed — never left
    // dangling, and nothing already stored is touched.
    visit.error = String((e && e.message) || e);
    if (reading) {
      await R.finishReading(db, reading.id, R.FAILED, visit.error.slice(0, 300)).catch(() => {});
    }
    visit.outcome = 'failed';
    return visit;
  }
}

// What this run has managed so far, for the crash report alone — the status
// board line written when something throws needs numbers, and the throw can
// land outside every inner scope. A resume never reads this: it counts from
// the database.
const progress = { done: 0, total: 0 };

// The whole pass, callable. The command line runs it below; the tests run it
// with a fake db, a fake fetch and a fake reader — the only way the stop
// behaviours can be proved without touching a real business. A real run
// injects nothing and behaves exactly as before.
async function understandPass(injected = {}) {
  const db = injected.db || new (require('@prisma/client').PrismaClient)();
  const look = injected.look ?? LOOK;
  const lanesWanted = injected.lanes ?? LANES;
  const only = injected.only ?? ONLY;
  const emailable = injected.emailable ?? EMAILABLE;
  const ask = injected.ask || askTheReader; // tests hand in a fake; a real run uses the LOCAL reader, nothing else
  const lastRunAt = injected.lastRunPath || LAST_RUN;
  progress.done = 0; progress.total = 0;

  // THE WORKED LIST, and not the review pile.
  //
  // 31,318 of the 32,739 records came off the Oregon business register and
  // were screened out into NEEDS_REVIEW — they have no email, no phone and
  // mostly no website, and Russ is not working them. --review reads that pile
  // instead; it is a separate decision and never the default.
  const REVIEW_PILE = injected.reviewPile ?? process.argv.includes('--review');
  const UNREAD_TRADES = injected.unreadTrades ?? process.argv.includes('--unread-trades');
  const TRADES_WITH_STAFF = /accounting|legal|insurance|dental|medical|veterinary|real estate|construction|trades|plumbing|electrical|hvac|auto|landscap|staffing|cleaning|manufactur|storage|professional services/i;

  // PICKING UP WHERE IT STOPPED. --fresh=6 means "leave alone anything
  // already read in the last six hours", which turns a restart into a resume
  // (2026-08-28). It selects which sites to VISIT — it never stops a visit
  // that has started from storing its pages and findings. The resume point is
  // the DATABASE's siteReadAt, which writeItDown sets only when a visit truly
  // finished — never a file a run wrote about itself, never a run's own tally.
  const FRESH = injected.fresh ?? Number(arg('fresh', 0));
  const freshCutoff = FRESH ? new Date(Date.now() - FRESH * 3600000) : null;

  // READ MEANS PAGES STORED (2026-09-02).
  //
  // Six businesses in the first fifty carried a read date and held not one
  // word. Read by hand afterwards they had five, four, twenty, seven and
  // twenty-three readable pages each — the visit had been stamped finished
  // before anything landed. The resume filter then treated the stamp as
  // proof and never went back, so they were permanently invisible: not in
  // the unread pile, not in the failures, just quietly absent, and they
  // showed up at the writing step as "their site's words are not on file".
  //
  // So the stamp is no longer the test. A business is read when we HOLD
  // WORDS from their site. One that does not is put back in the queue
  // however recently it was stamped, and it is counted separately at the
  // end so a thin-website tally never absorbs it.
  //
  // The cap stops a genuinely wordless site looping forever: after this many
  // website visits on file we stop retrying and the emptiness stands as the
  // answer it is.
  const MOST_RETRIES_WHEN_NOTHING_LANDED = 3;
  const holdsNoWords = {
    readings: {
      none: {
        source: R.WEBSITE,
        pages: { some: { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } },
      },
    },
  };
  let neverActuallyRead = [];
  if (FRESH && !only) {
    const marked = await db.prospect.findMany({
      where: { doNotContact: false, siteReadAt: { gte: freshCutoff }, ...holdsNoWords },
      select: { id: true, _count: { select: { readings: true } } },
    });
    neverActuallyRead = marked
      .filter((m) => m._count.readings < MOST_RETRIES_WHEN_NOTHING_LANDED)
      .map((m) => m.id);
    if (neverActuallyRead.length) {
      console.log(`${neverActuallyRead.length} marked read but holding no words — `
        + 'put back in the queue (the stamp is not the test, the words are)');
    }
  }

  const alreadyDone = FRESH
    ? {
      OR: [
        { siteReadAt: null },
        { siteReadAt: { lt: freshCutoff } },
        ...(neverActuallyRead.length ? [{ id: { in: neverActuallyRead } }] : []),
      ],
    }
    : {};

  // A BUSINESS WITH NO WEB ADDRESS NEVER REACHES THE READER (Russ, 2026-09-03).
  //
  // "Grandpashabet Giris Adresi 2026" has no address on file, was read anyway,
  // and came back with 7,445 words about a Turkish gambling site. The reader
  // had gone and found somebody else's page. That cost real questions to learn
  // nothing, and put a stranger's words on a Central Oregon business.
  //
  // A record with no address is a record with a hole in it, not a website to
  // read. It is left alone until somebody fills the hole in.
  //
  // It goes in an AND, not an OR. `alreadyDone` above also uses OR, and two
  // OR keys in one object means the second silently replaces the first — the
  // exact mistake this file already warns about twice. Written as an OR here
  // it wiped out the resume rule and the run re-read everything.
  const HAS_AN_ADDRESS_TO_READ = {
    AND: [{
      OR: [
        { website: { not: null } },
        { websiteManualValue: { not: null } },
      ],
    }],
  };

  const baseWhere = only
    ? { id: only }
    : {
      doNotContact: false,
      ...HAS_AN_ADDRESS_TO_READ,
      // One NOT list, not two. Written as two separate NOT keys the second
      // silently replaces the first and the whole scoping disappears.
      NOT: [
        { AND: [{ website: null }, { websiteManualValue: null }] },
        // The set-aside pile is excluded UNLESS we are deliberately reading it.
        ...(REVIEW_PILE || UNREAD_TRADES ? [] : [{ stage: 'NEEDS_REVIEW' }]),
      ],
      ...(REVIEW_PILE ? { stage: 'NEEDS_REVIEW' } : {}),
      ...(UNREAD_TRADES ? { stage: 'NEEDS_REVIEW', siteReadAt: null } : {}),
      // --emailable: ONLY the businesses that already have a message written
      // to them, so the list Russ actually works is corrected first.
      ...(emailable
        ? { messages: { some: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } } } }
        : {}),
    };
  // CLOSE WHAT A STOPPED RUN LEFT OPEN, every time, before anything is counted
  // (Russ, 2026-09-05: "this should happen automatically"). Nothing is deleted;
  // a reading that never finished gets its end time and a note saying why.
  {
    const closed = await R.closeWhatDiedEarlier(db);
    if (closed) console.log(`closed ${closed} reading(s) a stopped run had left open`);
  }

  const untried = injected.untried ?? UNTRIED;
  // NEVER ACTUALLY REACHED, not merely "has a record" (2026-09-04).
  //
  // On the night of the 3rd the reader could not be started at all, and 62
  // businesses got a reading saying so. Every one of them was then treated as
  // already tried and dropped out of this list for good — 62 sites nobody had
  // ever opened, quietly retired by a fault in our own tooling.
  //
  // A reading is kept forever either way; that rule does not move. What
  // changes is what counts as having tried: an answer about the business
  // (read it, no site, site down) counts. Our own tool falling over does not.
  // TRIED MEANS WE REACHED A CONCLUSION ABOUT THEM (2026-09-04, second pass).
  //
  // First this counted any record at all, so 62 businesses our own broken
  // reader had never opened were retired for good. Then it counted only a
  // clean read — and the opposite broke: every placeholder page, parked
  // domain and site that turns out to belong to somebody else came back in
  // the very next batch, and the next, forever. Six of eight visits in one
  // batch were the same six sites again.
  //
  // Both are answers about the business and both are final: "this is not
  // their site" is a conclusion, not a failure. The only thing that leaves a
  // business genuinely untouched is our own reader giving nothing back at
  // all, and those three messages are ours, fixed, and listed above.
  const neverOpened = untried
    ? {
      readings: {
        none: {
          source: R.WEBSITE,
          reader: 'understand-businesses',
          OR: [
            { outcome: { in: [R.READ, R.NO_WEBSITE, R.UNREACHABLE] } },
            { AND: [{ finishedAt: { not: null } }, { NOT: { note: { in: READER_GAVE_NOTHING } } }] },
          ],
        },
      },
    }
    : {};
  const where = only ? baseWhere : { ...alreadyDone, ...baseWhere, ...neverOpened };

  // A RESUMED RUN'S NUMBERS ARE LEGIBLE, and they come from the database.
  if (FRESH && !only) {
    const skippedAsDone = await db.prospect.count({
      where: {
        ...baseWhere,
        siteReadAt: { gte: freshCutoff },
        NOT: { id: { in: neverActuallyRead } },
      },
    });
    const remainEligible = await db.prospect.count({ where });
    console.log(`resume: ${skippedAsDone} read in the last ${FRESH}h — skipped as already done; `
      + `${remainEligible} remain eligible${UNREAD_TRADES ? ' (counted before the trade screen)' : ''}`);
  }

  // The batch ceiling is applied IN THE QUERY: however large --limit is, no
  // run reads more than BATCH_OF_SITES businesses. Standing order.
  const takeAtMost = Math.min((injected.limit ?? LIMIT) || BATCH_OF_SITES, BATCH_OF_SITES);

  const rows = await db.prospect.findMany({
    where,
    select: {
      id: true, name: true, nameManualValue: true, trade: true, phone: true,
      website: true, websiteManualValue: true, email: true, emailManualValue: true,
      automationScore: true, scoreEvidence: true, stage: true,
      // The hand-typed columns MUST be loaded, or the guards that protect them
      // compare against undefined, read as "empty", and overwrite the very
      // values they exist to defend (caught before first run, 2026-09-01).
      addressManualValue: true, employeeCountManualValue: true, ownerName: true,
      phoneManualValue: true,
    },
    // THE ONES WE KNOW NOTHING ABOUT COME FIRST. Then, among equals, the ones
    // he can email today — they are the ones he will open (2026-08-30).
    orderBy: [
      { theirWork: { sort: 'asc', nulls: 'first' } },
      { email: { sort: 'desc', nulls: 'last' } },
      { automationScore: { sort: 'desc', nulls: 'last' } },
    ],
    take: UNREAD_TRADES ? BATCH_OF_SITES * 20 : takeAtMost,
  });

  // Trim to the staffed trades AFTER the query, then apply the batch ceiling —
  // so a tranche of 50 means 50 businesses actually read.
  if (UNREAD_TRADES) {
    const kept = rows.filter((row) => TRADES_WITH_STAFF.test(row.trade || ''));
    rows.length = 0;
    rows.push(...kept.slice(0, takeAtMost));
  }

  progress.total = rows.length;
  console.log(`${rows.length} businesses with a website to read  (batch ceiling ${BATCH_OF_SITES})`);
  console.log(look ? 'LOOKING ONLY — nothing will be written\n' : `reading, ${lanesWanted} site(s) at a time, groups in parallel within each\n`);

  const tally = {
    read: 0, notTheirSite: 0, siteDown: 0, readerFailed: 0, noReadableWords: 0, partial: 0,
    viaBrowser: 0, wordsRecovered: 0, browserBroke: 0, stalled: 0, nothingNew: 0,
    tradeConfirmed: 0, tradeCorrected: 0, tradeUnsure: 0,
    people: 0, roles: 0, rolesUnderstood: 0, emails: 0, directLines: 0, profiles: 0,
    sharedInbox: 0, formOnly: 0, phoneOnly: 0, held: 0, newlyScored: 0,
    modelCalls: 0, pagesFetched: 0, brokeOnThisOne: 0,
  };
  const notes = [];
  const failed = [];
  const broke = [];
  let next = 0;
  const started = Date.now();

  // ONE flight controller for the whole run: the number of model reads in
  // flight is tuned from what the reader is actually doing tonight, across
  // every site being read, and the level it settles on is reported.
  const controller = makeFlightController();

  // ONE reader guard for the whole run: the moment the reader is out of
  // allowance — or the run's first calls have all failed — every lane stops
  // before its next business, and the businesses in flight abort without
  // recording anything on the prospect.
  const guard = makeReaderGuard(ask);
  const cutOffMidVisit = [];

  // If the reader stops answering — a rate limit, a login that expired — a
  // run of failures stops the pass, with everything read so far already
  // written and every visit's reading closed.
  let inARow = 0;
  const GIVE_UP_AFTER = 15;
  let stopped = false;

  const lane = async () => {
    for (;;) {
      // THE RUN STOPS THE MOMENT THE GUARD FIRES — no lane starts another
      // business, so nothing further is written to any record.
      if (guard.state.readerOut || guard.state.brokenStart) return;
      const at = next; next += 1;
      if (at >= rows.length) return;
      const r = rows[at];
      // ONE BAD WEBSITE MUST NOT END THE PASS. Anything unexpected on one site
      // costs that site, not the hours behind it (2026-08-28).
      try {
        const visit = await visitOneBusiness(db, r, {
          controller, askTheReader: guard.ask, look,
          ...(injected.fetch ? { fetch: injected.fetch } : {}),
        });

        // A visit that failed WITH THE GUARD'S OWN MESSAGE was not a visit —
        // it was the run stopping underneath it. Its reading is already
        // closed naming the true reason, nothing landed on the prospect, and
        // it stays eligible: counted with the unreached, never as broken.
        if (visit.outcome === 'failed' && (visit.error === READER_OUT_MSG || visit.error === BROKEN_START_MSG)) {
          cutOffMidVisit.push(visit.name || '(no name)');
          continue; // the check at the top of the loop ends this lane
        }
        progress.done += 1;

        // The per-site report the run promises: pages fetched, the count in
        // each purpose, model calls, and finished or PARTIAL.
        const byP = PURPOSES.map((g) => `${g} ${visit.byPurpose[g] ?? 0}`).join('  ');
        console.log(`  ${String(visit.name).slice(0, 34).padEnd(36)} ${String(visit.fetched).padStart(3)} pages  (${byP})  ${visit.modelCalls} calls  ${visit.stalled ? 'STALLED' : (visit.saidNothingNew ? 'SAID-NOTHING-NEW' : (visit.partial ? 'PARTIAL' : visit.outcome))}${visit.browserError ? `  browser would not open: ${visit.browserError}` : ''}`);

        tally.modelCalls += visit.modelCalls;
        tally.pagesFetched += visit.fetched;
        if (visit.partial) tally.partial += 1;

        if (visit.browserError) tally.browserBroke += 1;
        if (visit.stalled) tally.stalled += 1;
        if (visit.saidNothingNew) tally.nothingNew += 1;
        if (visit.outcome === 'not_their_site') { tally.notTheirSite += 1; continue; }
        if (visit.outcome === 'unreachable') { tally.siteDown += 1; continue; }
        if (visit.outcome === 'failed') {
          tally.brokeOnThisOne += 1;
          if (broke.length < 25) broke.push(`  ${String(visit.name || '(no name)').slice(0, 30).padEnd(32)}${String(visit.error).slice(0, 90)}`);
          continue;
        }
        // The site opened and published nothing readable. Counted apart from a
        // reader failure, and it must NEVER trip the give-up counter — a run of
        // script-driven sites is not the reader breaking.
        if (visit.readVia === 'browser') {
          tally.viaBrowser += 1;
          tally.wordsRecovered += visit.wordsRecovered || 0;
        }
        if (visit.outcome === 'no_readable_words') { tally.noReadableWords += 1; inARow = 0; continue; }
        if (visit.outcome === 'reader_failed') {
          tally.readerFailed += 1; failed.push(visit.name);
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
        tally.read += 1;

        const { understood, found, reach, ranked } = visit;
        tally.people += understood.people.length;
        tally.roles += understood.people.filter((x) => x.role).length;
        tally.rolesUnderstood += understood.people.filter((x) => x.role && x.roleWasPrinted === false).length;
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

        if (look && notes.length < 40) {
          const lines = [];
          lines.push(`\n${'='.repeat(74)}\n${visit.name}   ${visit.url}`);
          lines.push(`  what they are   ${understood.trade || '(could not tell)'}${understood.trade && understood.trade !== r.trade ? `   was: ${r.trade || 'none'}` : ''}`);
          if (understood.whatTheyDo) lines.push(`  what they do    ${understood.whatTheyDo}`);
          if (understood.realName) lines.push(`  real name       ${understood.realName}`);
          lines.push(`  score           ${r.automationScore ?? '-'} -> ${ranked}    ${reach.inWords}`);
          if (understood.sharedEmail) lines.push(`  general inbox   ${understood.sharedEmail}`);
          if (understood.people.length) {
            lines.push('  who works there');
            for (const person of understood.people.slice(0, 12)) {
              const bits = [person.role ? `${person.role}${person.roleWasPrinted === false ? ' (understood)' : ''}` : 'no title given'];
              if (person.email) bits.push(person.email);
              if (person.phone) bits.push(person.phone);
              if (person.linkedIn) bits.push('LinkedIn');
              lines.push(`      ${person.name.padEnd(26)} ${bits.join('  ·  ')}`);
            }
          } else lines.push('  who works there  nobody named');
          if (understood.recentNews) lines.push(`  recent news     ${understood.recentNews}`);
          if (understood.cannotTell) lines.push(`  not on the site ${understood.cannotTell}`);
          if (understood.dropped.length) lines.push(`  refused         ${understood.dropped.slice(0, 4).join(' | ')}`);
          notes.push(lines.join('\n'));
        }
      } catch (e) {
        progress.done += 1;
        tally.brokeOnThisOne += 1;
        if (broke.length < 25) broke.push(`  ${(r.nameManualValue || r.name || '(no name)').slice(0, 30).padEnd(32)}${String((e && e.message) || e).slice(0, 90)}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(lanesWanted, rows.length) }, lane));

  // A STOP FROM THE GUARD: say it plainly, write the status board LAST, and
  // hand the wrapper a distinct exit code so it can tell this from a crash.
  // Everything already done is recorded normally; everything not reached is
  // untouched and still eligible; nothing further is written to any record.
  if (guard.state.readerOut || guard.state.brokenStart) {
    const done = progress.done;
    const remaining = rows.length - done;
    const why = guard.state.readerOut
      ? 'the reader is out of allowance and the run stopped'
      : `the run's first calls all failed (${FIRST_CALLS_MUST_ANSWER} before a single answer) — the reader is broken, not the websites`;
    console.log(`\n\nSTOPPED — ${why}.`);
    console.log(`${done} of ${rows.length} in this batch were done and are recorded normally; ${remaining} were not reached and stay eligible.`);
    if (cutOffMidVisit.length) console.log(`cut off mid-visit, still eligible: ${cutOffMidVisit.join(', ')}`);
    console.log('Nothing further was written. Rerun with --fresh=12 to resume from the database once the reader answers.');
    try { await require('../../src/hoursback/browserRead.js').closeSharedBrowser(); } catch { /* nothing to close */ }
    closeReaderPool();
    await db.$disconnect();
    writeLastRun({
      script: 'understand-businesses.js', why, done, remaining, at: lastRunAt,
      needsPerson: guard.state.readerOut
        ? 'wait for the reader\'s allowance to reset, then rerun with --fresh=12'
        : 'check the local claude reader and its login, then rerun with --fresh=12',
    });
    return {
      ending: guard.state.readerOut ? 'reader_exhausted' : 'broken_start',
      code: guard.state.readerOut ? EXIT_READER_EXHAUSTED : EXIT_BROKEN_START,
      done, remaining,
    };
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(notes.join('\n'));
  console.log(`\n${'='.repeat(74)}`);
  console.log(`read properly:            ${tally.read}   in ${mins} minutes   (${tally.partial} partial, kept and marked)`);
  console.log(`website was not theirs:   ${tally.notTheirSite}`);
  console.log(`site would not answer:    ${tally.siteDown}`);
  console.log(`reader gave no answer:    ${tally.readerFailed}`);
  if (tally.browserBroke) console.log(`browser would NOT start:  ${tally.browserBroke}   (these are not thin websites — we never got to look)`);
  if (tally.stalled) console.log(`site stopped answering:   ${tally.stalled}   (six minutes with no new page; kept what we had)`);
  if (tally.nothingNew) console.log(`stopped saying anything new: ${tally.nothingNew}   (a run of pages that only repeated what the site had already said)`);
  console.log(`read through a browser:    ${tally.viaBrowser}   (a plain fetch saw nothing; ${tally.wordsRecovered.toLocaleString()} chars recovered)`);
  console.log(`site published no words:  ${tally.noReadableWords}   (nothing came back even with a real browser)`);
  if (tally.brokeOnThisOne) {
    console.log(`something broke on:       ${tally.brokeOnThisOne}   (the pass carried on; each reading closed as failed)`);
    console.log(broke.join('\n'));
  }
  console.log('');
  console.log(`pages fetched:            ${tally.pagesFetched}`);
  console.log(`model calls:              ${tally.modelCalls}   every one via the local claude reader (${MODEL}) — no OpenRouter, no paid call`);
  console.log(`calls logged:             ${callLog.length}   (${callLog.filter((c) => c.via === 'local claude').length} local claude, 0 anything else)`);
  console.log(`concurrency settled at:   ${controller.settledAt} in flight`);
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
  // The browser is a real process; it does not outlive the run that opened it.
  try { await require('../../src/hoursback/browserRead.js').closeSharedBrowser(); } catch { /* nothing to close */ }
  closeReaderPool();
  await db.$disconnect();

  // The status board — the last thing written, whatever the ending was.
  const done = progress.done;
  const remaining = rows.length - done;
  const why = stopped
    ? `the reader failed ${GIVE_UP_AFTER} times in a row and the pass stopped early`
    : `finished the batch${look ? ' (a look only — nothing was written)' : ''}`;
  writeLastRun({
    script: 'understand-businesses.js', why, done, remaining, at: lastRunAt,
    needsPerson: stopped ? 'check the reader, then rerun with --fresh=12 to resume' : null,
  });
  return { ending: stopped ? 'reader_kept_failing' : 'finished', code: 0, done, remaining };
}

// However the run ends — finished, stopped by the guard, or a crash — the
// status board gets its line. On a crash it is written here, then the error
// carries on to whoever called.
async function runUnderstand(injected = {}) {
  try {
    return await understandPass(injected);
  } catch (e) {
    writeLastRun({
      script: 'understand-businesses.js',
      why: `it crashed: ${String((e && e.message) || e).slice(0, 200)}`,
      done: progress.done,
      remaining: Math.max(0, progress.total - progress.done),
      needsPerson: 'read the crash above, then rerun with --fresh=12 to resume',
      at: injected.lastRunPath || LAST_RUN,
    });
    throw e;
  }
}

// Only read when this file is the thing being run. The OpenRouter-based read
// borrows the saving step from here, and without this guard merely importing
// it would start a second full pass of its own (2026-08-29).
if (require.main === module) {
  // ONE MODEL JOB AT A TIME. Reading websites and writing letters both run
  // models; two of them together cook this laptop (see onlyOneCopy.js).
  const { claimTheMachine } = require('../../src/hoursback/onlyOneCopy.js');
  let giveTheMachineBack;
  try {
    giveTheMachineBack = claimTheMachine('models', { label: 'reading websites' });
  } catch (e) {
    console.error(`\n${e.message}\n`);
    process.exit(e.code === 'ALREADY_RUNNING' ? 73 : 1);
  }
  const letGo = () => { try { giveTheMachineBack(); } catch { /* already given back */ } };
  process.on('exit', letGo);
  process.on('SIGINT', () => { letGo(); process.exit(130); });
  process.on('SIGTERM', () => { letGo(); process.exit(143); });

  runUnderstand().then((out) => {
    // The distinct codes let a wrapper tell "out of allowance, rerun later"
    // (75) and "broken from the first call" (74) apart from a crash (1).
    if (out && out.code) process.exit(out.code);
  }).catch((e) => {
    console.error('failed:', e.message);
    process.exit(1);
  });
}

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

// ONE RULE, ONE PLACE (2026-09-03). This file had its own copy of the test for
// "is this a name or a web page's title", and the letter had none — so the
// reading corrected a name the letter could still say out loud, and the two
// disagreed about which names to trust. The rule now lives beside every other
// judgement about a name, where both can ask it, and it knows that a name
// filed with the state is never a page title.
const { nameLooksLikeAPageTitle } = require('../../src/hoursback/crm/names.js');

async function writeItDown(db, r, understood, reach, ranked, found, opportunity, url, opts = {}) {
  // Whether their site gave up any words at all. Everything learned is still
  // written; only the READ stamp is withheld, so the next run comes back.
  const wordsLanded = opts.wordsLanded !== false;
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
      // EVERYTHING ELSE THE READER SAW, which used to be found and dropped.
      //
      // Each of these was visible on the page and never reached the card, so a
      // business could be read in full and still show blank where the answer
      // was sitting. A hand-typed value always wins; these only ever fill a
      // gap (2026-09-01).
      ...(understood.postalAddress && !r.addressManualValue
        ? { address: understood.postalAddress } : {}),
      ...(understood.companyProfile ? { linkedInUrl: understood.companyProfile } : {}),
      ...(understood.toolsInUse && understood.toolsInUse.length
        ? { toolsInUse: understood.toolsInUse.join(', ') } : {}),
      ...(Number.isFinite(understood.openOfficeRoles)
        ? { openRoles: understood.openOfficeRoles } : {}),
      // Only where the SITE stated a team size. A count of names on a page is a
      // floor on the team, never the team, and the two must not be confused —
      // the price is set off this number.
      ...(understood.teamSize && !r.employeeCountManualValue
        ? {
          employeeCount: understood.teamSize,
          headcountStatus: 'PUBLISHED_ON_THEIR_SITE',
          headcountSourceUrl: url,
        } : {}),
      // Who runs it. Never overwrites a name Russ typed.
      ...(understood.whoRunsIt && !r.ownerName ? { ownerName: understood.whoRunsIt } : {}),
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
      // THE NAME THEIR OWN SITE GIVES, when what we hold is a page title.
      // The site's answer has to be a real name too: swapping "Bend, OR
      // Attorneys" for "Home" helps nobody. What was on file is never lost —
      // it moves to selfDescription (Russ, 2026-09-03).
      ...(understood.realName && !r.nameManualValue
          && nameLooksLikeAPageTitle(r.name) && !nameLooksLikeAPageTitle(understood.realName)
        ? { name: understood.realName, selfDescription: `was on file as: ${r.name}` }
        : understood.realName ? { selfDescription: `calls itself: ${understood.realName}` } : {}),
      ...(understood.yearsInBusiness ? { yearsInBusiness: understood.yearsInBusiness } : {}),
      automationScore: ranked,
      scoreEvidence: evidence,
      siteGaps: understood.cannotTell ? JSON.stringify([understood.cannotTell]) : null,
      stalledBuild: understood.stalledBuild || null,
      // Null where the reader did not answer, never 1 — the second of the two
      // places that collapse silently made "asked" and "never asked" the same
      // value (2026-09-01, docs/hoursback/evidence-store.md).
      separateOperations: Number.isFinite(understood.separateOperations)
        ? understood.separateOperations : null,
      ...(wordsLanded
        ? { siteStatus: 'READ', siteReadAt: new Date() }
        : { siteStatus: 'UNREADABLE' }),
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
      // Only where the pages actually placed them. A blank stays blank and
      // means unknown — never "here", which is how a whole firm's staff ended
      // up on one town's record.
      ...(p.basedAt ? { basedAt: p.basedAt } : {}),
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
module.exports = {
  writeItDown, hasContactForm, opportunityFromTheRead,
  // the whole-site visit, exported so it can be tested without a run
  visitOneBusiness, askTheReader, closeReaderPool, BATCH_OF_SITES, MODEL, READER_VERSION,
  IS_THIS_THEIRS, WHY_NOTHING_HERE,
  // surviving the night: the run itself, the reader guard that stops it the
  // moment the reader is out, and the status board — all exported so the
  // stop behaviours can be proved by tests instead of by a ruined night
  runUnderstand, makeReaderGuard, writeLastRun, LAST_RUN,
  READER_OUT_MSG, BROKEN_START_MSG, FIRST_CALLS_MUST_ANSWER,
  EXIT_READER_EXHAUSTED, EXIT_BROKEN_START,
};
