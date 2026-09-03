// Read a site through a REAL BROWSER — only for the sites an ordinary fetch
// cannot read at all.
//
// Why this exists (2026-09-01): about one site in five returns ZERO readable
// words to an ordinary fetch. Diagnosed tonight: they are not script-rendered
// sites — their host serves a bot-challenge page (SiteGround's sgcaptcha and
// similar) instead of the site, and a plain fetch can never pass it. A real
// browser can: deschutesheating.com went from 0 characters to 2,963 —
// address, email and phone included — under Playwright chromium.
//
// WHAT THIS DELIBERATELY IS NOT: a second crawler. The crawl itself — which
// links to follow, which pages to skip, ten of one path shape, two minutes a
// business, staff profiles exempt beneath a team page — is peopleSweep's
// crawlWholeSite(), called here with a browser standing in for fetch. One
// crawl, two ways of opening a page. The bounds cannot drift apart because
// they are the same code.
//
// THE EVIDENCE RULE APPLIES (docs/hoursback/evidence-store.md). Every page the
// browser opens is returned with its readable text, skipped ones included. A
// challenge that never clears is A REAL ANSWER — but it is the answer "we
// could not read it yet", never "this is their site". The page comes back
// with EMPTY text (the store's own protocol for "opened, published nothing",
// see readings.keepPage), the words the screen did show kept beside it in
// challengeText, and a note saying why — never dropped, and never passed off
// as the site's words. Deschutes Heating & Cooling was stored with 531
// characters of a "Robot Challenge Screen" as if that were their website
// (found 2026-09-02); everything downstream then treated a working business
// as one with no website content. Empty text also keeps the business
// ELIGIBLE for another attempt: the retry is its own reading, appended.
//
// HOW A CHALLENGE ACTUALLY CLEARS (measured on that same site, 2026-09-02):
// it REDIRECTS. The page navigates to a new document at ~12s — evaluating at
// that instant throws "Execution context was destroyed" — and the real page
// is there at ~14s. So the wait survives the navigation and keeps polling on
// the new document, and the ceiling is 45 seconds, not 20. The two-minute
// per-business crawl bound still holds: each page's wait is capped at
// whatever remains of the crawl's own budget.
//
// A BROWSER IS SLOW AND HEAVY. It must never run for a site an ordinary fetch
// can read — that is what ordinaryFetchCanRead() is for, and crawlWithBrowser
// checks it first unless the caller says it already has.

const ps = require('./peopleSweep.js');
const { readableText } = require('./understand.js');

// --- the named ceilings ------------------------------------------------------

// How many browser pages may be open at once, across every site being read.
// A hard ceiling, not a tunable: each open page is a rendering engine, and the
// machine running this is usually also running the main read.
const MAX_BROWSER_PAGES_OPEN = 3;

// The challenge wait: poll the page's visible text every two seconds, up to
// the ceiling, and stop EARLY the moment a real page arrives. The ceiling is
// 45 seconds because the redirect chains these hosts use only land at ~14s
// and then need to render (measured 2026-09-02, deschutesheating.com) — 20
// was too tight and threw away readable sites. The crawl's own two-minute
// per-business bound still caps every page's wait, so a slow site cannot run
// away with the batch.
const CHALLENGE_POLL_MS = 2000;
const CHALLENGE_WAIT_CEILING_MS = 45000;

// How long one navigation may take before the browser gives up on it.
const BROWSER_NAV_TIMEOUT_MS = 30000;

// Text this long, carrying the marks of a real page, is a page actually
// talking. Also the bar ordinaryFetchCanRead() uses.
const SUBSTANTIAL_TEXT_CHARS = 200;

// --- what a real business page looks like ------------------------------------
//
// The old has-it-cleared test matched the page's words against a list of
// challenge phrases, and it was wrong in both directions: a real page saying
// "checking availability", carrying a "Reviews" nav item, or mentioning
// captchas in a post could be called blocked forever, and a wordy challenge
// screen could be called clear. This repository's standing rule: read for
// meaning, never by keyword. So the question is now what the page HAS, not
// which phrases it matches. A bot wall never shows the business's own phone
// number, postal address or email, never carries navigation to real
// sections, never describes services, and never publishes a varied body of
// text — a real business page carries several of those marks.

const A_PHONE_NUMBER = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const AN_EMAIL_ADDRESS = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const A_POSTAL_ADDRESS = /\b\d{1,6}\s+(?:[A-Za-z][A-Za-z.'-]*\s+){0,4}(?:st(?:reet)?|ave(?:nue)?|road|rd|blvd|boulevard|dr(?:ive)?|ln|lane|way|ct|court|cir(?:cle)?|pl(?:ace)?|plaza|ter(?:race)?|hwy|highway|pkwy|parkway|rte|route|suite|ste)\b\.?/i;
const REAL_SECTIONS = /\b(home|about(?: us)?|services?|contact(?: us)?|team|staff|locations?|hours|faq|testimonials|reviews|gallery|portfolio|careers?|blog|news|menu|pricing|schedule|appointments?|products?|shop|financing|maintenance|specials?|coupons?|book(?:ing)? online|request (?:service|a quote|an estimate)|get a quote)\b/gi;
const SERVICE_TALK = /\b(our services|services (?:include|we (?:offer|provide))|we (?:offer|provide|specialize|install|repair|service|build|clean|design|deliver|maintain)|providing|serving [a-z]|family[- ]owned|locally owned|since (?:19|20)\d{2})\b/i;

/// The marks this text carries. Strong marks are facts a bot wall never
/// publishes about the business (its phone, address, email); weak marks are
/// the shape of a real page (navigation, service talk, a varied body of
/// text), any two of which together settle it.
function marksOfARealPage(text) {
  const t = String(text || '');
  const strong = [];
  const weak = [];
  if (A_PHONE_NUMBER.test(t)) strong.push('a phone number');
  if (AN_EMAIL_ADDRESS.test(t)) strong.push('an email address');
  if (A_POSTAL_ADDRESS.test(t)) strong.push('a postal address');
  const sections = new Set((t.match(REAL_SECTIONS) || []).map((s) => s.toLowerCase()));
  if (sections.size >= 3) weak.push('navigation to real sections');
  if (SERVICE_TALK.test(t)) weak.push('service descriptions');
  const distinctWords = new Set(t.toLowerCase().match(/[a-z]{2,}/g) || []);
  if (t.trim().length >= 500 && distinctWords.size >= 40) weak.push('a substantial body of varied text');
  return { strong, weak };
}

/// Is this the site talking, or still a wall? One strong mark settles it; so
/// do two weak ones. Boilerplate — however wordy — carries neither.
function looksLikeARealPage(text, substantialChars = SUBSTANTIAL_TEXT_CHARS) {
  const t = String(text || '').trim();
  if (t.length < substantialChars) return false;
  const marks = marksOfARealPage(t);
  return marks.strong.length >= 1 || marks.weak.length >= 2;
}

// --- one browser, reused across sites ---------------------------------------
//
// Launching chromium costs seconds and real memory; one launch serves the
// whole run. Contexts are NOT shared: each site gets a fresh one, so a cookie
// or a cleared challenge from one business never leaks into the next.

let theOneBrowser = null; // a promise, so two callers cannot both launch

function sharedBrowser() {
  if (!theOneBrowser) {
    theOneBrowser = (async () => {
      // Required lazily: tests stub the browser and must never load playwright.
      const { chromium } = require('playwright');
      return chromium.launch({ headless: true });
    })();
  }
  return theOneBrowser;
}

async function closeSharedBrowser() {
  if (!theOneBrowser) return;
  const opening = theOneBrowser;
  theOneBrowser = null;
  try { const b = await opening; await b.close(); } catch { /* already gone */ }
}

// --- the page-slot ceiling ---------------------------------------------------
//
// A freed slot is handed DIRECTLY to the next waiter, count unchanged — so a
// newcomer racing the hand-off can never push the open count past the ceiling.

let pagesOpenNow = 0;
const waitingForASlot = [];

async function takeAPageSlot() {
  if (pagesOpenNow < MAX_BROWSER_PAGES_OPEN && waitingForASlot.length === 0) {
    pagesOpenNow += 1;
    return;
  }
  await new Promise((slotIsYours) => waitingForASlot.push(slotIsYours));
  // the releasing side kept the count held for us; nothing to add
}

function releaseThePageSlot() {
  const next = waitingForASlot.shift();
  if (next) { next(); return; }   // the slot passes straight on, still counted
  pagesOpenNow -= 1;
}

// --- waiting for a challenge to clear ---------------------------------------

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/// Poll the page's visible text until it carries the marks of a real page,
/// or until the ceiling. Never throws, never hangs: a challenge that never
/// clears resolves { cleared: false } with whatever text the page showed.
///
/// THESE CHALLENGES REDIRECT — they do not update in place. Mid-navigation
/// the execution context is destroyed and evaluate() throws; that throw is
/// the challenge CLEARING, not the wait failing. It is caught, the new
/// document is allowed to finish loading, and polling CONTINUES on the new
/// document. The throw never ends the wait, and last-held content is never
/// returned in its place.
async function waitForChallengeToClear(page, {
  pollMs = CHALLENGE_POLL_MS,
  ceilingMs = CHALLENGE_WAIT_CEILING_MS,
  substantialChars = SUBSTANTIAL_TEXT_CHARS,
  sleep = defaultSleep,
} = {}) {
  const began = Date.now();
  const timeLeft = () => ceilingMs - (Date.now() - began);
  let text = '';
  for (;;) {
    let sawTheDocument = true;
    try {
      text = String(await page.evaluate(() => (document.body ? document.body.innerText : '')) || '');
    } catch {
      // The page navigated out from under us — the redirect that IS the
      // challenge clearing. Wait for the new document, then poll it.
      sawTheDocument = false;
      try {
        if (typeof page.waitForLoadState === 'function') {
          await page.waitForLoadState('domcontentloaded', { timeout: Math.max(timeLeft(), 1) });
        } else {
          await sleep(pollMs);
        }
      } catch { /* still settling — the next poll will look again */ }
    }
    if (sawTheDocument && looksLikeARealPage(text, substantialChars)) {
      return { cleared: true, waitedMs: Date.now() - began, text };
    }
    if (timeLeft() <= 0) {
      return { cleared: false, waitedMs: Date.now() - began, text };
    }
    if (!sawTheDocument) continue;   // the new document just landed — read it now
    await sleep(pollMs);
  }
}

// --- the guard: never run a browser where a fetch will do --------------------

/// One ordinary fetch of the site's front door. If it comes back with a page
/// carrying the marks of a real business page, the ordinary crawl can read
/// this site and the browser must not run for it.
async function ordinaryFetchCanRead(website, { fetch: fetchImpl, timeoutMs = 10000 } = {}) {
  const impl = fetchImpl || globalThis.fetch;
  let front;
  try {
    const given = new URL(String(website).startsWith('http') ? website : `https://${website}`);
    front = `${given.origin}/`;
  } catch {
    return { canRead: false, chars: 0, why: 'unreadable web address' };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await impl(front, {
      signal: ctrl.signal,
      redirect: 'follow',
      // The same ask-like-a-browser posture the ordinary crawl uses.
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    const html = await res.text();
    const words = readableText(html);
    const chars = words.trim().length;
    const canRead = looksLikeARealPage(words, SUBSTANTIAL_TEXT_CHARS);
    return { canRead, chars, why: canRead ? 'an ordinary fetch reads this site' : null };
  } catch (e) {
    // The fetch itself failing is exactly the case the browser exists for.
    return { canRead: false, chars: 0, why: String((e && e.message) || e).slice(0, 120) };
  } finally { clearTimeout(t); }
}

// --- the crawl ---------------------------------------------------------------

/// Crawl one business's whole site through a real browser. SAME SHAPE as
/// peopleSweep.crawlWholeSite — { pages, failures, partial, stoppedShapes,
/// error } — because it IS crawlWholeSite, handed a browser in place of fetch.
///
/// Additions, all additive, nothing renamed:
///   ordinaryFetchReadsIt   true when the guard stopped the browser running
///   challengesNeverCleared the page addresses whose challenge never cleared
///   and, on such a page:   challengeNeverCleared: true, challengeNote: why
///
/// options:
///   probe: false            skip the ordinary-fetch guard (caller already ran it)
///   probeFetch              fetch used by the guard (tests)
///   browser                 a browser to use instead of the shared one (tests)
///   delayMs, timeLimitMs    passed straight to crawlWholeSite
///   challengePollMs, challengeWaitCeilingMs, navTimeoutMs, substantialChars,
///   sleep                   the wait's knobs (tests bring them down)
async function crawlWithBrowser(url, options = {}) {
  if (options.probe !== false) {
    const probe = await ordinaryFetchCanRead(url, { fetch: options.probeFetch });
    if (probe.canRead) {
      return {
        pages: [], failures: [], partial: false, stoppedShapes: [],
        error: 'not run: an ordinary fetch can read this site',
        ordinaryFetchReadsIt: true, probeChars: probe.chars, challengesNeverCleared: [],
      };
    }
  }

  const browser = options.browser || await sharedBrowser();
  const waitOpts = {
    pollMs: options.challengePollMs,
    ceilingMs: options.challengeWaitCeilingMs,
    substantialChars: options.substantialChars,
    sleep: options.sleep,
  };
  const navTimeoutMs = options.navTimeoutMs || BROWSER_NAV_TIMEOUT_MS;

  await takeAPageSlot();
  let context = null;
  try {
    // A FRESH CONTEXT PER SITE: cookies, cleared challenges and storage from
    // one business never follow us to the next.
    context = await browser.newContext();
    const page = await context.newPage();
    const waits = new Map();   // url -> how the challenge wait went there

    // The browser wearing fetch's coat. crawlWholeSite hands this a URL and
    // expects { ok, status, text() }; the 8-second abort signal it also hands
    // over is deliberately ignored — a challenge can take longer than that to
    // clear, and the crawl's own two-minute limit still bounds the visit.
    const viaBrowser = async (target) => {
      let response = null;
      try {
        response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
      } catch (e) {
        throw new Error(`the browser could not open it: ${String((e && e.message) || e).split('\n')[0].slice(0, 140)}`);
      }
      const wait = await waitForChallengeToClear(page, waitOpts);
      const status = response && typeof response.status === 'function' ? response.status() : 200;
      const looksChallenged = !looksLikeARealPage(wait.text || '', SUBSTANTIAL_TEXT_CHARS);
      // An error page that is NOT a challenge and never said anything real is
      // a failure, same as the ordinary crawl would record. A challenge — even
      // one that never cleared — is NOT: it is returned with its words below.
      if (!wait.cleared && !looksChallenged && status >= 400) {
        throw new Error(`http ${status}`);
      }
      waits.set(target, wait);
      let html = '';
      try { html = String(await page.content() || ''); } catch { html = ''; }
      return { ok: true, status, text: async () => html };
    };

    // THE crawl — bounds, skip rules, path shapes, team-page exemption and all
    // — is peopleSweep's, not a copy of it.
    const crawl = await ps.crawlWholeSite(url, {
      fetch: viaBrowser,
      delayMs: options.delayMs,
      timeLimitMs: options.timeLimitMs,
    });

    // Mark the pages whose challenge never cleared. The page itself is KEPT,
    // words and all — "we waited and it never cleared" is a real answer.
    const challengesNeverCleared = [];
    for (const pg of crawl.pages) {
      const wait = waits.get(pg.url);
      if (wait && !wait.cleared) {
        pg.challengeNeverCleared = true;
        // A PAGE THAT NEVER BECAME A BUSINESS PAGE IS NOT AN ANSWER.
        //
        // Its words are kept — we waited and this is what it showed — but the
        // page's text is emptied so nothing downstream mistakes a challenge
        // screen for the site. Empty text means "we opened it and it published
        // nothing", which leaves the business eligible for another attempt
        // rather than marked read (CLAUDE.md rule 1: absence is data).
        const stillNotAPage = !looksLikeARealPage(wait.text || '', SUBSTANTIAL_TEXT_CHARS);
        pg.challengeNote = stillNotAPage
          ? `never became a full business page after ${Math.round(wait.waitedMs / 1000)}s`
          : `cleared late, after ${Math.round(wait.waitedMs / 1000)}s`;
        // THE WORDS ARE NEVER ERASED (Russ, 2026-09-03).
        //
        // This used to empty pg.text whenever the page did not reach the bar
        // of a full business page, and tuck the words into pg.challengeText —
        // a field NOTHING reads. So the words were not set aside, they were
        // destroyed, and the business came back "published no words".
        //
        // Bisnett Insurance is the case that found it. Their whole website
        // reads "Bisnett Insurance is now a part of ... (800) 303-0419" — 91
        // characters, and a real answer: the business has been acquired. It
        // was deleted for being short.
        //
        // Nothing downstream needs the emptying. Every judgement that must not
        // mistake a robot-check screen for the site already asks
        // looksLikeARealPage, which a challenge screen fails on its own
        // merits. So the words stay, the page carries a mark saying it never
        // became a full business page, and what that MEANS is decided by
        // whoever reads it — not by throwing the evidence away first.
        //
        // This is the repository's own rule: a reading is an event, written
        // once and kept forever. Nothing overwrites a reading.
        pg.neverBecameAPage = stillNotAPage;
        challengesNeverCleared.push(pg.url);
      }
    }

    return { ...crawl, ordinaryFetchReadsIt: false, challengesNeverCleared };
  } finally {
    if (context) { try { await context.close(); } catch { /* the site is done either way */ } }
    releaseThePageSlot();
  }
}

module.exports = {
  crawlWithBrowser, waitForChallengeToClear, ordinaryFetchCanRead,
  sharedBrowser, closeSharedBrowser,
  MAX_BROWSER_PAGES_OPEN, CHALLENGE_POLL_MS, CHALLENGE_WAIT_CEILING_MS,
  BROWSER_NAV_TIMEOUT_MS, SUBSTANTIAL_TEXT_CHARS,
  marksOfARealPage, looksLikeARealPage,
};
