// The browser read, adjudicated. One named test per behaviour the browser
// crawl promises — see src/hoursback/browserRead.js.
//
//   node --test tests/hoursback/browser-read.test.js
//
// NO network, NO model calls, NO real browser, NO database: the browser is a
// stub serving an in-memory site, and every timing knob is brought down so the
// suite runs in moments. Every test fails if the behaviour it names is absent.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ps = require('../../src/hoursback/peopleSweep.js');
const { readableText } = require('../../src/hoursback/understand.js');
const B = require('../../src/hoursback/browserRead.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a fake browser serving an in-memory site --------------------------------
//
// site: { '/path': { html, challengeHtml, challengeFor } }
//   challengeFor N means the first N polls of that page see challengeHtml,
//   and poll N+1 onward sees the real html — a challenge that clears.
//   challengeFor Infinity is a challenge that never clears.

const HOST = 'https://blocked.example';

const CHALLENGE_HTML = '<html><body><p>Checking your site connection before proceeding. This process is automatic.</p></body></html>';

// A page that carries the marks of a real business page — a phone number, an
// address, an email, real navigation, service talk. The wait now decides
// whether a page has become the business's own by these marks rather than by
// matching challenge words, so a practice page has to look like one.
function longPage(words, links = []) {
  const a = links.map((h) => `<a href="${h}">${h}</a>`).join(' ');
  const nav = '<nav><a href="/about">About</a> <a href="/services">Services</a> <a href="/contact">Contact</a></nav>';
  const marks = 'Call us on 541-382-0424 or email info@example.test. '
    + 'We are at 62880 Peerless Ct, Bend, Oregon 97701. '
    + 'We provide installation, repair and maintenance services for customers across Central Oregon. ';
  return `<html><head><title>t</title></head><body>${nav}${a}<p>${words} ${marks}${'real words on a real page. '.repeat(20)}</p></body></html>`;
}

function stubPage(site, { gotoDelayMs = 0 } = {}) {
  let at = null;
  const polls = new Map();
  const currentHtml = (entry, pollCount) => {
    const n = entry.challengeFor || 0;
    return pollCount > n ? entry.html : (n ? (entry.challengeHtml || CHALLENGE_HTML) : entry.html);
  };
  const page = {
    gotoCalls: [],
    async goto(url) {
      const u = new URL(url);
      at = u.pathname;
      page.gotoCalls.push(at);
      if (gotoDelayMs) await sleep(gotoDelayMs);
      const entry = site[at];
      return { status: () => (entry === undefined ? 404 : (entry.status || 200)) };
    },
    async evaluate() {
      const entry = site[at];
      if (entry === undefined) return '';
      const n = (polls.get(at) || 0) + 1;
      polls.set(at, n);
      return readableText(currentHtml(entry, n));
    },
    async content() {
      const entry = site[at];
      if (entry === undefined) return '<html><body></body></html>';
      return currentHtml(entry, polls.get(at) || 1);
    },
    async close() {},
    pollsAt: (p) => polls.get(p) || 0,
  };
  return page;
}

function stubBrowser(site, opts = {}) {
  let open = 0;
  let peak = 0;
  let contextsMade = 0;
  return {
    peak: () => peak,
    contextsMade: () => contextsMade,
    async newContext() {
      contextsMade += 1;
      open += 1;
      peak = Math.max(peak, open);
      const page = stubPage(site, opts);
      return {
        async newPage() { return page; },
        async close() { open -= 1; },
      };
    },
  };
}

// Every crawl below skips the ordinary-fetch probe (its own test is last) and
// brings the wait's knobs down so the suite runs in moments — the CRAWL
// bounds themselves are never touched: they are peopleSweep's.
const FAST = {
  probe: false,
  delayMs: 0,
  challengePollMs: 5,
  challengeWaitCeilingMs: 60,
  substantialChars: 40,
};

// --- the challenge wait -------------------------------------------------------

test('the challenge-clearing wait stops early the moment real text arrives', async () => {
  const site = { '/': { html: longPage('home'), challengeFor: 2 } };
  const page = stubPage(site);
  await page.goto(`${HOST}/`);

  const began = Date.now();
  const wait = await B.waitForChallengeToClear(page, {
    pollMs: 5, ceilingMs: 2000, substantialChars: 40,
  });

  assert.equal(wait.cleared, true, 'the wait must report the challenge cleared');
  assert.ok(wait.text.includes('real words'), 'the cleared text is the real page');
  // Two challenge polls then the real page: three polls, not four hundred.
  assert.equal(page.pollsAt('/'), 3, 'polling stops the moment the text is real');
  assert.ok(Date.now() - began < 500, 'nowhere near the two-second ceiling');
});

test('a challenge that never clears resolves with what it showed — it does not hang', async () => {
  const site = { '/': { html: longPage('never seen'), challengeFor: Infinity } };
  const page = stubPage(site);
  await page.goto(`${HOST}/`);

  const wait = await B.waitForChallengeToClear(page, {
    pollMs: 5, ceilingMs: 40, substantialChars: 40,
  });

  assert.equal(wait.cleared, false, 'never clearing is reported as itself');
  assert.match(wait.text, /checking your site connection/i, 'the words it DID show come back');
  assert.ok(wait.waitedMs >= 40, 'it waited to the ceiling before answering');
});

test('a crawl over a never-clearing challenge returns the page with its words, marked why', async () => {
  const site = { '/': { html: longPage('unreachable truth'), challengeFor: Infinity } };
  const crawl = await B.crawlWithBrowser(`${HOST}/`, { ...FAST, browser: stubBrowser(site) });

  assert.equal(crawl.pages.length, 1, 'the page is RETURNED, not dropped');
  const pg = crawl.pages[0];
  assert.equal(typeof pg.text, 'string');
  // THE WORDS ARE KEPT, WHATEVER THEY TURNED OUT TO BE (2026-09-03, replacing
  // the emptying this test used to assert). The page's text used to be wiped
  // whenever it never became a full business page, and moved to a field
  // nothing reads — which destroyed 91 characters of real answer on Bisnett
  // Insurance ("now a part of ... (800) 303-0419") for the crime of being
  // short. Nothing downstream needs the emptying: every judgement that must
  // not mistake a robot-check screen for the site asks looksLikeARealPage,
  // which this screen fails on its own merits.
  assert.match(pg.text, /checking your site connection/i,
    'the words it showed are KEPT — a reading is never erased');
  assert.equal(pg.neverBecameAPage, true,
    'and the page says plainly that it never became a full business page');
  assert.equal(pg.challengeNeverCleared, true, 'the page says the challenge never cleared');
  assert.ok(pg.challengeNote, 'and says why, in words');
  assert.deepEqual(crawl.challengesNeverCleared, [`${HOST}/`]);
  assert.equal(crawl.error, null, 'a real answer is not an error');
});

// --- the crawl is peopleSweep's, imported — not a reimplementation ------------

test('the crawl is delegated to peopleSweep.crawlWholeSite with the caller\'s bounds', async (t) => {
  const real = ps.crawlWholeSite;
  const calls = [];
  ps.crawlWholeSite = async (url, opts) => {
    calls.push({ url, opts });
    return { pages: [], failures: [], partial: false, stoppedShapes: [], error: 'no page could be opened' };
  };
  t.after(() => { ps.crawlWholeSite = real; });

  const site = { '/': { html: longPage('home') } };
  await B.crawlWithBrowser(`${HOST}/`, { ...FAST, browser: stubBrowser(site), timeLimitMs: 1234 });

  assert.equal(calls.length, 1, 'exactly one crawl, and it is peopleSweep\'s');
  assert.equal(calls[0].url, `${HOST}/`);
  assert.equal(calls[0].opts.timeLimitMs, 1234, 'the time bound is handed to the one true crawl');
  assert.equal(typeof calls[0].opts.fetch, 'function', 'the browser stands in as the fetch, nothing more');
});

test('ten pages of one path shape, then that shape stops — peopleSweep\'s bound, through the browser', async () => {
  const productLinks = Array.from({ length: 15 }, (_, i) => `/products/item-${i + 1}`);
  const site = { '/': { html: longPage('home', productLinks) } };
  for (const p of productLinks) site[p] = { html: longPage(`product ${p}`) };

  const crawl = await B.crawlWithBrowser(`${HOST}/`, { ...FAST, browser: stubBrowser(site) });

  const products = crawl.pages.filter((p) => p.shape === '/products/*');
  assert.equal(products.length, ps.SAME_SHAPE_LIMIT, 'exactly the imported limit, not one more');
  assert.ok(crawl.stoppedShapes.includes('/products/*'), 'and the stop is recorded, readable later');
});

test('the two-minute-style time limit is honoured and the partial crawl is kept', async () => {
  const links = Array.from({ length: 30 }, (_, i) => `/page-${i + 1}`);
  const site = { '/': { html: longPage('home', links) } };
  for (const p of links) site[p] = { html: longPage(p) };

  const crawl = await B.crawlWithBrowser(`${HOST}/`, {
    ...FAST,
    browser: stubBrowser(site, { gotoDelayMs: 15 }),
    timeLimitMs: 80,
  });

  assert.equal(crawl.partial, true, 'stopping early is SAID, never silent');
  assert.ok(crawl.pages.length >= 1, 'what was gathered before the stop is kept');
  assert.ok(crawl.pages.length < 31, 'and the limit genuinely stopped the crawl');
  for (const pg of crawl.pages) assert.equal(typeof pg.text, 'string', 'every kept page carries its words');
});

// --- every page kept, skipped ones included -----------------------------------

test('a page a skip rule catches is still fetched and returned with its text', async () => {
  const site = {
    '/': { html: longPage('home', ['/privacy-policy', '/team']) },
    '/privacy-policy': { html: longPage('the policy nobody reads') },
    '/team': { html: longPage('our team') },
  };
  const crawl = await B.crawlWithBrowser(`${HOST}/`, { ...FAST, browser: stubBrowser(site) });

  const byPath = new Map(crawl.pages.map((p) => [new URL(p.url).pathname, p]));
  assert.ok(byPath.has('/privacy-policy'), 'the skipped page is IN the result');
  const legal = byPath.get('/privacy-policy');
  assert.equal(legal.skipFromReading, true);
  assert.equal(legal.skippedBy, 'legal-boilerplate', 'named by the rule that caught it');
  assert.ok(legal.text.includes('the policy nobody reads'), 'with its words — skipping means not sent to a model, never not stored');
  assert.equal(byPath.get('/team').skipFromReading, false, 'an ordinary page is not skipped');
});

// --- the concurrency ceiling ---------------------------------------------------

test('no more than MAX_BROWSER_PAGES_OPEN browser pages are ever open at once', async () => {
  const site = { '/': { html: longPage('home') } };
  let open = 0;
  let peak = 0;
  const oneBrowser = {
    async newContext() {
      open += 1;
      peak = Math.max(peak, open);
      const page = stubPage(site, { gotoDelayMs: 25 });
      return { async newPage() { return page; }, async close() { open -= 1; } };
    },
  };

  const eight = Array.from({ length: 8 }, () => B.crawlWithBrowser(`${HOST}/`, { ...FAST, browser: oneBrowser }));
  const crawls = await Promise.all(eight);

  assert.ok(peak <= B.MAX_BROWSER_PAGES_OPEN, `held: peak ${peak} never passed the ceiling of ${B.MAX_BROWSER_PAGES_OPEN}`);
  assert.equal(peak, B.MAX_BROWSER_PAGES_OPEN, 'and the slots were actually used, not serialised by accident');
  assert.equal(open, 0, 'every context was closed');
  // Every waiting crawl completed. Not a fixed page count — the practice page
  // now carries real navigation, so the crawl rightly follows it.
  for (const c of crawls) assert.ok(c.pages.length >= 1, 'every waiting crawl still completed');
});

// --- the guard: never a browser where a fetch will do ---------------------------

test('a site an ordinary fetch can read never reaches the browser', async () => {
  const probeFetch = async () => ({ ok: true, status: 200, text: async () => longPage('a perfectly readable site') });
  const browser = stubBrowser({ '/': { html: longPage('should never be served') } });

  const crawl = await B.crawlWithBrowser(`${HOST}/`, {
    probeFetch, delayMs: 0, browser,
  });

  assert.equal(crawl.ordinaryFetchReadsIt, true);
  assert.equal(crawl.pages.length, 0, 'the browser did no crawling');
  assert.equal(browser.contextsMade(), 0, 'no browser context was ever opened');
  assert.match(crawl.error, /ordinary fetch can read/i, 'and the result says why, in words');
});

test('a challenge page served to the ordinary fetch does NOT count as readable', async () => {
  // A challenge page has words — "checking your site connection…" — and they
  // must not fool the guard into calling the site readable.
  const challengeText = `<html><body><p>${'Checking your site connection before proceeding. '.repeat(10)}</p></body></html>`;
  const probeFetch = async () => ({ ok: true, status: 200, text: async () => challengeText });

  const probe = await B.ordinaryFetchCanRead(`${HOST}/`, { fetch: probeFetch });
  assert.equal(probe.canRead, false, 'challenge boilerplate is not a readable site, however long it is');
});
