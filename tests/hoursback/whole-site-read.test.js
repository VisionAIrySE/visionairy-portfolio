// The whole-site read, adjudicated. One named test per behavioural terminal in
// .xf/specs/2026-09-01-whole-site-read.md.
//
//   node --test tests/hoursback/whole-site-read.test.js
//
// NO network, NO model calls, NO database: the fetch is a fake serving an
// in-memory site, the reader is a fake answering per purpose, and the db is a
// fake that records exactly what it was asked to write. Every test fails if
// the behaviour it names is absent.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ps = require('../../src/hoursback/peopleSweep.js');
const U = require('../../src/hoursback/understand.js');
const R = require('../../src/hoursback/readings.js');
const { recordGroupedRead } = require('../../src/hoursback/recordTheRead.js');
const { detectedTools, toolsFromPages } = require('../../src/hoursback/siteRead.js');
const script = require('../../scripts/hoursback/understand-businesses.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a fake site ------------------------------------------------------------

const HOST = 'https://biz.example';

function htmlPage(title, body, links = []) {
  const a = links.map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  return `<html><head><title>${title}</title></head><body>${a}<p>${body}</p></body></html>`;
}

function makeFetch(siteMap, { delayMs = 0 } = {}) {
  const fetched = [];
  const impl = async (url) => {
    const u = new URL(url);
    if (delayMs) await sleep(delayMs);
    const html = siteMap[u.pathname + u.search] ?? siteMap[u.pathname];
    fetched.push(u.pathname);
    if (html === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => html };
  };
  impl.fetched = fetched;
  return impl;
}

// --- a fake reader ----------------------------------------------------------

function purposeOf(question) {
  const m = question.match(/handed only the site's (\w+)/);
  if (m) return m[1];
  if (/disagreed, or all came back empty/.test(question)) return 'reconciliation';
  return null;
}

function makeReader(answers, { latencyMs = 0 } = {}) {
  const calls = [];
  let inFlight = 0;
  let most = 0;
  const fn = async (question) => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    calls.push(question);
    if (latencyMs) await sleep(latencyMs);
    inFlight -= 1;
    const p = purposeOf(question);
    const a = typeof answers === 'function' ? answers(p, question, calls.length) : answers[p];
    return { answer: a === undefined ? null : a, why: null };
  };
  fn.calls = calls;
  fn.maxInFlight = () => most;
  fn.callsFor = (purpose) => calls.filter((q) => purposeOf(q) === purpose);
  return fn;
}

// --- a fake database --------------------------------------------------------

function fakeDb() {
  let n = 0;
  const id = (p) => `${p}_${(n += 1)}`;
  const rows = { readings: [], pages: [], findings: [], prospectUpdates: [], contacts: [] };
  return {
    rows,
    reading: {
      create: async ({ data }) => {
        const row = { id: id('reading'), startedAt: new Date(), finishedAt: null, note: null, ...data };
        rows.readings.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = rows.readings.find((x) => x.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    readingPage: {
      create: async ({ data }) => {
        const row = { id: id('page'), fetchedAt: new Date(), ...data };
        rows.pages.push(row);
        return row;
      },
      findFirst: async ({ where }) => {
        const hit = rows.pages.find((p) => p.url === where.url && p.digest === where.digest && p.text !== null);
        return hit ? { id: hit.id } : null;
      },
    },
    finding: {
      create: async ({ data }) => {
        const row = { id: id('finding'), createdAt: new Date(), retiredAt: null, ...data };
        rows.findings.push(row);
        return row;
      },
      findMany: async ({ where = {} } = {}) => rows.findings
        .filter((f) => {
          if (where.prospectId && f.prospectId !== where.prospectId) return false;
          if (typeof where.field === 'string' && f.field !== where.field) return false;
          if (where.field && where.field.in && !where.field.in.includes(f.field)) return false;
          if (where.retiredAt === null && f.retiredAt !== null) return false;
          if (where.NOT && where.NOT.readingId && f.readingId === where.NOT.readingId) return false;
          return true;
        })
        .map((f) => ({ ...f, reading: rows.readings.find((r) => r.id === f.readingId) || { source: 'website' } })),
    },
    prospect: { update: async (args) => { rows.prospectUpdates.push(args); return {}; } },
    contact: {
      findMany: async () => [],
      create: async ({ data }) => { rows.contacts.push(data); return data; },
      update: async (args) => args,
    },
  };
}

// ===========================================================================
// whole-site-crawl-replacing-the-page-cap
// ===========================================================================

function bigSite() {
  const body = 'Blue Widget Co is a family business making fine widgets with care and patience since long ago.';
  const links = [
    ['/about', 'About'], ['/contact', 'Contact'], ['/services', 'Services'],
    ['/team', 'Team'], ['/careers', 'Careers'], ['/blog', 'Blog'],
    ['/widgets-info', 'Widget info'], ['/pricing', 'Pricing'],
    ['/faq', 'FAQ'], ['/gallery', 'Gallery'], ['/history', 'History'],
    ['/warranty', 'Warranty'], ['/delivery', 'Delivery'], ['/reviews', 'Reviews'],
    ['/wholesale', 'Wholesale'], ['/materials', 'Materials'],
  ];
  const site = { '/': htmlPage('Blue Widget Co', body, links) };
  for (const [href] of links) site[href] = htmlPage(href, `${body} This page is about ${href} and its widgets.`);
  return site;
}

test('crawl returns every same-host HTML page, including pages matching no WORTH_OPENING pattern, and more than 8 of them', async () => {
  const got = await ps.crawlWholeSite(HOST, { fetch: makeFetch(bigSite()), delayMs: 0 });
  assert.ok(got.pages.length > 8, `expected more than 8 pages, got ${got.pages.length}`);
  const urls = got.pages.map((p) => new URL(p.url).pathname);
  // Neither of these matches any WORTH_OPENING pattern; the old read dropped them.
  assert.ok(urls.includes('/widgets-info'), 'a page no pattern recognises must still be crawled');
  assert.ok(urls.includes('/faq'), 'a page no pattern recognises must still be crawled');
  assert.equal(got.partial, false);
});

test('linksToPeople keeps a rank-99 link in the queue instead of dropping it', () => {
  const html = htmlPage('x', 'body', [['/widgets-info', 'Widget info'], ['/about', 'About']]);
  const links = ps.linksToPeople(html, `${HOST}/`);
  assert.ok(links.some((u) => u.includes('/widgets-info')), 'the 99-ranked link must stay in the queue');
  // and the ranked one sorts first
  assert.ok(links[0].includes('/about'));
});

test('fetchPeoplePages honors a caller asking beyond the old 12-page clamp', async () => {
  const got = await ps.fetchPeoplePages(HOST, { fetch: makeFetch(bigSite()), delayMs: 0, maxPages: 40 });
  assert.ok(got.pages.length > ps.MAX_PAGES_PER_SITE,
    `a caller asking for 40 must get past ${ps.MAX_PAGES_PER_SITE}, got ${got.pages.length}`);
});

test('crawl stops at the time limit and returns what it gathered marked partial', async () => {
  const got = await ps.crawlWholeSite(HOST, {
    fetch: makeFetch(bigSite(), { delayMs: 40 }), delayMs: 0, timeLimitMs: 100,
  });
  assert.equal(got.partial, true, 'a crawl cut short must say so');
  assert.ok(got.pages.length >= 1, 'what was gathered before the stop is kept');
  assert.ok(got.pages.length < 12, 'the stop actually stopped it');
});

test('crawl stops a path after ten pages of one shape and records the shape', async () => {
  const products = Array.from({ length: 15 }, (_, i) => [`/products/p${i + 1}`, `Product ${i + 1}`]);
  const site = {
    '/': htmlPage('Shop', 'A shop full of widgets and other pleasant things to browse.', [['/products', 'Products']]),
    '/products': htmlPage('Products', 'All the products, listed for browsing pleasure here.', products),
  };
  for (const [href] of products) site[href] = htmlPage(href, `One single product living at ${href}, very shiny.`);
  const got = await ps.crawlWholeSite(HOST, { fetch: makeFetch(site), delayMs: 0 });
  const productPages = got.pages.filter((p) => /\/products\/p\d+/.test(p.url));
  assert.equal(productPages.length, 10, `ten of one shape, no more — got ${productPages.length}`);
  assert.ok(got.stoppedShapes.includes('/products/*'), 'the shape it stopped on is recorded');
});

test('an eleventh staff profile under the team page is still fetched', async () => {
  const profiles = Array.from({ length: 12 }, (_, i) => [`/team/person-${i + 1}`, `Person ${i + 1}`]);
  const site = {
    '/': htmlPage('Firm', 'A firm of many people doing careful work every day.', [['/team', 'Our Team']]),
    '/team': htmlPage('Team', 'Meet the whole team, every last one of them here.', profiles),
  };
  for (const [href] of profiles) site[href] = htmlPage(href, `The profile of the person living at ${href}.`);
  const got = await ps.crawlWholeSite(HOST, { fetch: makeFetch(site), delayMs: 0 });
  const profilePages = got.pages.filter((p) => /\/team\/person-/.test(p.url));
  assert.equal(profilePages.length, 12, `all 12 profiles under the team page, got ${profilePages.length}`);
});

test('every crawled page carries url, fetch status and readable text', async () => {
  const got = await ps.crawlWholeSite(HOST, { fetch: makeFetch(bigSite()), delayMs: 0 });
  for (const p of got.pages) {
    assert.ok(p.url, 'a page without a url is not a page');
    assert.equal(p.status, 'fetched');
    assert.equal(typeof p.text, 'string');
    assert.ok(p.text.length > 0, `no url entry may lack its text: ${p.url}`);
  }
});

function skippySite() {
  const body = 'Blue Widget Co makes widgets and this page has plenty of readable words on it.';
  const links = [
    ['/calendar', 'Calendar'], ['/products/red-widget', 'Red widget'],
    ['/privacy-policy', 'Privacy'], ['/login', 'Log in'],
    ['/cart', 'Cart'], ['/checkout', 'Checkout'],
    ['/search?q=widgets', 'Search'], ['/blog/page/2', 'Older posts'],
    ['/es/about', 'Español'], ['/blog', 'Blog'],
  ];
  const site = { '/': htmlPage('Blue Widget Co', body, links) };
  for (const [href] of links) {
    const clean = href.split('?')[0];
    site[clean] = htmlPage(clean, `${body} And this particular page lives at ${clean}.`);
  }
  site['/blog'] = htmlPage('Blog', `${body} Latest news lives here.`, [
    ['/blog/2024/06/old-post', 'An old post'],
    ['/blog/2026/08/new-post', 'A new post'],
  ]);
  site['/blog/2024/06/old-post'] = htmlPage('Old post', `${body} Written a good while ago now, truly.`, [
    ['/blog/2023/05/ancient-post', 'An even older post'],
  ]);
  site['/blog/2026/08/new-post'] = htmlPage('New post', `${body} Hot off the press, quite recent indeed.`);
  site['/blog/2023/05/ancient-post'] = htmlPage('Ancient post', `${body} From the mists of time itself.`);
  return site;
}

async function crawlSkippy() {
  return ps.crawlWholeSite(HOST, { fetch: makeFetch(skippySite()), delayMs: 0 });
}

function pageAt(got, pathname) {
  return got.pages.find((p) => new URL(p.url).pathname === pathname);
}

test('a calendar page is marked skip-from-reading and its text still returned', async () => {
  const got = await crawlSkippy();
  const p = pageAt(got, '/calendar');
  assert.ok(p, 'the calendar page must still be FETCHED');
  assert.equal(p.skipFromReading, true);
  assert.equal(p.skippedBy, 'calendar');
  assert.ok(p.text.length > 0, 'skipping means not read, never not kept');
});

test('an individual product page is marked skip-from-reading and its text still returned', async () => {
  const got = await crawlSkippy();
  const p = pageAt(got, '/products/red-widget');
  assert.ok(p);
  assert.equal(p.skipFromReading, true);
  assert.equal(p.skippedBy, 'individual-product');
  assert.ok(p.text.length > 0);
});

test('legal boilerplate is marked skip-from-reading and its text still returned', async () => {
  const got = await crawlSkippy();
  const p = pageAt(got, '/privacy-policy');
  assert.ok(p);
  assert.equal(p.skipFromReading, true);
  assert.equal(p.skippedBy, 'legal-boilerplate');
  assert.ok(p.text.length > 0);
});

test('a logged-in area is marked skip-from-reading and its text still returned', async () => {
  const got = await crawlSkippy();
  const p = pageAt(got, '/login');
  assert.ok(p);
  assert.equal(p.skipFromReading, true);
  assert.equal(p.skippedBy, 'logged-in-area');
  assert.ok(p.text.length > 0);
});

test('cart, checkout, search results, post indexes and other-language copies are skipped and kept', async () => {
  const got = await crawlSkippy();
  const expected = {
    '/cart': 'cart-or-checkout',
    '/checkout': 'cart-or-checkout',
    '/search': 'search-results',
    '/blog/page/2': 'post-index',
    '/es/about': 'other-language',
  };
  for (const [pathname, rule] of Object.entries(expected)) {
    const p = pageAt(got, pathname);
    assert.ok(p, `${pathname} must still be fetched`);
    assert.equal(p.skipFromReading, true, `${pathname} must be skip-from-reading`);
    assert.equal(p.skippedBy, rule);
    assert.ok(p.text.length > 0, `${pathname} must keep its readable text`);
  }
});

test('a post older than one year is skipped, kept, and no still older post below it is followed', async () => {
  const got = await crawlSkippy();
  const old = pageAt(got, '/blog/2024/06/old-post');
  assert.ok(old, 'the old post itself is still fetched and stored');
  assert.equal(old.skipFromReading, true);
  assert.equal(old.skippedBy, 'old-post');
  assert.ok(old.text.length > 0);
  assert.equal(pageAt(got, '/blog/2023/05/ancient-post'), undefined,
    'a still older post below an old post is not followed');
  const fresh = pageAt(got, '/blog/2026/08/new-post');
  assert.ok(fresh, 'a post inside the year is fetched');
  assert.equal(fresh.skipFromReading, false, 'a post inside the year is read');
});

test('pathShape groups product, blog and pagination paths and keeps /about and /contact distinct', () => {
  assert.equal(ps.pathShape('/products/red-widget'), ps.pathShape('/products/blue-widget'));
  assert.equal(ps.pathShape('/blog/2024/01/first-post'), ps.pathShape('/blog/2023/06/older-post'));
  assert.equal(ps.pathShape('/shop/page/2'), ps.pathShape('/shop/page/3'));
  assert.notEqual(ps.pathShape('/about'), ps.pathShape('/contact'));
});

// ===========================================================================
// classify-every-page-by-purpose
// ===========================================================================

test('classify returns an array of purposes for one fetched page', () => {
  const c = U.classify({ url: `${HOST}/about`, text: 'All about our story and the widgets we love.' });
  assert.ok(Array.isArray(c.purposes));
  assert.ok(c.purposes.includes('identity'));
  for (const p of c.purposes) assert.ok(U.PURPOSES.includes(p));
});

test('a page giving an address and naming staff carries both contact and people', () => {
  const c = U.classify({
    url: `${HOST}/contact`,
    text: 'Contact us today. 541-555-1234. 12 Main Street, Bend. Jane Smith, Office Manager',
  });
  assert.ok(c.purposes.includes('contact'), 'the address makes it contact');
  assert.ok(c.purposes.includes('people'), 'the named staff make it people too — never forced into one box');
});

test('every fetched page is classified — counts match, skipped pages included', () => {
  const pages = [
    { url: `${HOST}/`, text: 'About our widget company and its story.' },
    { url: `${HOST}/privacy-policy`, text: 'Legal words.', skipFromReading: true, skippedBy: 'legal-boilerplate' },
    { url: `${HOST}/xyzzy`, text: 'gibberish entirely' },
  ];
  const sorted = U.classifyPages(pages);
  assert.equal(sorted.classified.length, pages.length,
    'the count of classified pages equals the count of fetched pages');
});

test('a page that fits nothing is could_not_tell with no default purpose', () => {
  const c = U.classify({ url: `${HOST}/xyzzy`, text: 'lorem ipsum dolor sit amet' });
  assert.equal(c.purposes, U.COULD_NOT_TELL);
  assert.notEqual(typeof c.purposes, 'object', 'no default purpose array stands in for the answer');
});

test('each purpose carries the url and text it rested on', () => {
  const c = U.classify({
    url: `${HOST}/contact`,
    text: 'Contact us today. 541-555-1234. Jane Smith, Office Manager',
  });
  for (const purpose of c.purposes) {
    const why = c.restedOn.find((r) => r.purpose === purpose);
    assert.ok(why, `${purpose} must say what it rested on`);
    assert.equal(why.url, `${HOST}/contact`);
    assert.ok(why.text.length > 0, `${purpose} must carry the words behind it`);
  }
});

test('a two-purpose page lands in both groups', () => {
  const both = {
    url: `${HOST}/contact`,
    text: 'Contact us today. 541-555-1234. Jane Smith, Office Manager',
  };
  const sorted = U.classifyPages([both]);
  assert.ok(sorted.groups.contact.some((p) => p.url === both.url));
  assert.ok(sorted.groups.people.some((p) => p.url === both.url));
});

test('all six purpose keys exist with empty arrays where no page matched', () => {
  const sorted = U.classifyPages([{ url: `${HOST}/about`, text: 'Our story, told with widgets.' }]);
  for (const purpose of U.PURPOSES) {
    assert.ok(Array.isArray(sorted.groups[purpose]), `${purpose} must be present even when empty`);
  }
  assert.equal(sorted.groups.hiring.length, 0);
  assert.equal(sorted.groups.news.length, 0);
});

test('skipped pages are listed with the rule that caught them', () => {
  const sorted = U.classifyPages([
    { url: `${HOST}/calendar`, text: 'Dates and dates.', skipFromReading: true, skippedBy: 'calendar' },
  ]);
  assert.deepEqual(sorted.skipped, [{ url: `${HOST}/calendar`, rule: 'calendar' }]);
});

test('every answered field sits in exactly one of the two field lists', () => {
  const wholeSite = U.WHOLE_SITE_FIELDS;
  const single = U.SINGLE_GROUP_FIELDS;
  assert.ok(Array.isArray(wholeSite) && wholeSite.length > 0);
  assert.ok(Array.isArray(single) && single.length > 0);
  for (const f of wholeSite) assert.ok(!single.includes(f), `${f} may not be in both lists`);
  assert.equal(new Set(single).size, single.length, 'no field owned by two groups');
});

// ===========================================================================
// parallel-group-reads-wired-into-understand-businesses
// ===========================================================================

test('the question builder returns six distinct prompts, one per purpose', () => {
  const prompts = U.PURPOSES.map((p) => U.questionFor(p, 'Blue Widget Co', 'doc'));
  assert.equal(new Set(prompts).size, 6, 'each purpose must get its own question');
  assert.match(U.questionFor('people', 'X', 'd'), /basedAt/);
  assert.match(U.questionFor('hiring', 'X', 'd'), /openOfficeRoles/);
  assert.match(U.questionFor('news', 'X', 'd'), /recentNews/);
  assert.match(U.questionFor('contact', 'X', 'd'), /postalAddress/);
});

test('an empty group costs zero model calls and is recorded could_not_tell with the reason', async () => {
  const pages = [
    { url: `${HOST}/`, text: 'Blue Widget Co is a family business making fine widgets with patience.' },
    { url: `${HOST}/contact`, text: 'Contact us at 12 Main Street where the office sits quietly.' },
  ];
  const reader = makeReader({
    identity: { theirOwnSite: true, realName: 'Blue Widget Co', trade: 'manufacturing', tradeSure: true },
    contact: { theirOwnSite: true, realName: 'Blue Widget Co', trade: 'manufacturing', tradeSure: true },
  });
  const out = await U.readSiteInGroups({ businessName: 'Blue Widget Co', pages, askTheReader: reader });
  assert.equal(reader.callsFor('hiring').length, 0, 'no hiring page, no hiring call');
  assert.equal(reader.callsFor('news').length, 0, 'no news page, no news call');
  assert.equal(out.answers.hiring, null);
  assert.match(out.couldNotTell.hiring, /no hiring page was found/);
  assert.match(out.couldNotTell.news, /no news page was found/);
});

test('group reads run concurrently, not in sequence', async () => {
  const pages = [
    { url: `${HOST}/about`, text: 'Our story is long and full of widgets and patience.' },
    { url: `${HOST}/contact`, text: 'Contact us: the office address is printed here plainly.' },
    { url: `${HOST}/team`, text: 'Meet the team, all of them fine people indeed.' },
    { url: `${HOST}/careers`, text: 'Careers with us: join the widget makers today please.' },
  ];
  const answer = { theirOwnSite: true, realName: 'Blue Widget Co', trade: 'manufacturing', tradeSure: true };
  const reader = makeReader(() => answer, { latencyMs: 30 });
  await U.readSiteInGroups({
    businessName: 'Blue Widget Co', pages, askTheReader: reader,
    controller: U.makeFlightController({ start: 6, max: 6 }),
  });
  assert.ok(reader.maxInFlight() >= 2,
    `with four non-empty groups the reads must overlap; max in flight was ${reader.maxInFlight()}`);
});

test('a page in two purposes is read once in each group read, answers kept per group', async () => {
  const both = {
    url: `${HOST}/contact`,
    text: 'Contact us today at 12 Main Street. Jane Smith, Office Manager, keeps the diary.',
  };
  const reader = makeReader({
    contact: { theirOwnSite: true, realName: 'Blue Widget Co', trade: 'legal', tradeSure: true, mainPhone: '541-555-9999' },
    people: { theirOwnSite: true, realName: 'Blue Widget Co', trade: 'legal', tradeSure: true, people: [{ name: 'Jane Smith', role: 'office manager' }] },
  });
  const out = await U.readSiteInGroups({ businessName: 'Blue Widget Co', pages: [both], askTheReader: reader });
  const contactCalls = reader.callsFor('contact');
  const peopleCalls = reader.callsFor('people');
  assert.equal(contactCalls.length, 1);
  assert.equal(peopleCalls.length, 1);
  assert.ok(contactCalls[0].includes(both.url), 'the page goes into the contact read');
  assert.ok(peopleCalls[0].includes(both.url), 'and into the people read');
  assert.equal(out.answers.contact.mainPhone, '541-555-9999');
  assert.equal(out.answers.people.people[0].name, 'Jane Smith');
});

test('the flight controller raises on fast answers, lowers on failures, and reports its level', async () => {
  const c = U.makeFlightController({ start: 2, min: 1, max: 5, fastMs: 50, slowMs: 100 });
  await c.run(async () => 'quick');
  await c.run(async () => 'quick');
  assert.ok(c.level > 2, `fast answers must raise the level, got ${c.level}`);
  const wasHigh = c.level;
  await c.run(async () => { throw new Error('reader broke'); }).catch(() => {});
  await c.run(async () => { throw new Error('reader broke'); }).catch(() => {});
  assert.ok(c.level < wasHigh, `failures must lower the level, got ${c.level}`);
  assert.equal(typeof c.settledAt, 'number', 'the level it settled on is reported');
});

test('a group larger than its allowance is read in batches and merged to one answer', async () => {
  const pages = ['/about', '/our-story', '/company', '/history', '/mission'].map((p) => ({
    url: `${HOST}${p}`,
    text: `Blue Widget Co. ${`the ${p.slice(1)} page tells its own long widget story. `.repeat(80)}`,
  }));
  const reader = makeReader((purpose, q, i) => {
    if (purpose !== 'identity') return undefined;
    return reader.callsFor('identity').length <= 1
      ? { theirOwnSite: true, realName: 'Blue Widget Co', trade: 'manufacturing', tradeSure: true }
      : { theirOwnSite: true, trade: 'manufacturing', tradeSure: true, whatTheyDo: 'They craft widgets patiently.' };
  });
  const out = await U.readSiteInGroups({ businessName: 'Blue Widget Co', pages, askTheReader: reader });
  assert.ok(reader.callsFor('identity').length >= 2,
    `text beyond the allowance means batches: got ${reader.callsFor('identity').length} identity call(s)`);
  assert.equal(out.answers.identity.realName, 'Blue Widget Co', 'batch one answer kept');
  assert.equal(out.answers.identity.whatTheyDo, 'They craft widgets patiently.', 'batch two folded into the same single answer');
});

test('repeated blocks across three or more pages appear once, not per page', () => {
  const nav = 'Home About Services Contact Careers News and all the widgets';
  const pages = ['/a', '/b', '/c', '/d'].map((p) => ({
    url: `${HOST}${p}`,
    text: `${nav}\nThe genuinely distinct words of the page at ${p}, all forty characters and more of them.`,
  }));
  const repeated = U.repeatedBlocks(pages);
  assert.ok(repeated.has(nav), 'the shared block must be recognised');
  const { batches } = U.groupDocuments(pages, { repeated });
  const joined = batches.map((b) => b.document).join('\n');
  const appearances = joined.split(nav).length - 1;
  assert.equal(appearances, 1, `the shared menu must not consume the allowance on every page — appeared ${appearances} times`);
});

test('a page too long for the allowance is named in a cut marker', () => {
  const { cut } = U.groupDocuments([
    { url: `${HOST}/long`, text: 'w'.repeat(U.PER_PAGE_CHARS + 500) },
  ]);
  assert.ok(cut.includes(`${HOST}/long`), 'a shortened page must be named, never trimmed silently');
});

test('no TOTAL_CHARS site budget remains; the allowance is per group', () => {
  assert.equal(U.TOTAL_CHARS, undefined, 'the single site-wide budget must be gone');
  assert.equal(typeof U.GROUP_CHARS, 'number', 'each purpose group gets its own allowance');
  const source = fs.readFileSync(path.join(__dirname, '../../src/hoursback/understand.js'), 'utf8');
  assert.ok(!source.includes('TOTAL_CHARS'), 'no TOTAL_CHARS constant in understand.js');
});

// ===========================================================================
// reconciliation-read-when-group-answers-disagree-or-come-back-empty
// ===========================================================================

test('two groups disagreeing is a contradiction; a silent group is not', () => {
  const disputed = U.contradictionsBetween({
    identity: { realName: 'Alpha Widgets' },
    contact: { realName: 'Beta Widget Works' },
  });
  assert.equal(disputed.length, 1);
  assert.equal(disputed[0].field, 'realName');

  const quiet = U.contradictionsBetween({
    identity: { realName: 'Alpha Widgets' },
    contact: { realName: null },
    people: {},
  });
  assert.equal(quiet.length, 0, 'one group answering while another is silent is no contradiction');
});

test('a contradiction fires one reconciliation read; agreement fires none', async () => {
  const pages = [
    { url: `${HOST}/about`, text: 'Alpha Widgets is the finest widget maker around these parts.' },
    { url: `${HOST}/contact`, text: 'Beta Widget Works serves Bend from its quiet office downtown.' },
  ];
  const disagree = makeReader({
    identity: { theirOwnSite: true, realName: 'Alpha Widgets', trade: 'manufacturing', tradeSure: true },
    contact: { theirOwnSite: true, realName: 'Beta Widget Works', trade: 'manufacturing', tradeSure: true },
    reconciliation: { realName: 'Alpha Widgets' },
  });
  const out = await U.readSiteInGroups({ businessName: 'X', pages, askTheReader: disagree });
  assert.equal(disagree.callsFor('reconciliation').length, 1, 'a genuine contradiction fires exactly one reconciliation read');
  assert.equal(out.reconciliation.settled.realName, 'Alpha Widgets');

  const agree = makeReader({
    identity: { theirOwnSite: true, realName: 'Alpha Widgets', trade: 'manufacturing', tradeSure: true },
    contact: { theirOwnSite: true, realName: 'Alpha Widgets', trade: 'manufacturing', tradeSure: true },
  });
  const calm = await U.readSiteInGroups({ businessName: 'X', pages, askTheReader: agree });
  assert.equal(agree.callsFor('reconciliation').length, 0, 'agreement makes ZERO extra model calls');
  assert.equal(calm.reconciliation, null);
});

test('the reconciliation prompt carries the disputed pages themselves', async () => {
  const pages = [
    { url: `${HOST}/about`, text: 'Alpha Widgets is the finest widget maker around these parts.' },
    { url: `${HOST}/contact`, text: 'Beta Widget Works serves Bend from its quiet office downtown.' },
  ];
  const reader = makeReader({
    identity: { theirOwnSite: true, realName: 'Alpha Widgets', trade: 'manufacturing', tradeSure: true },
    contact: { theirOwnSite: true, realName: 'Beta Widget Works', trade: 'manufacturing', tradeSure: true },
    reconciliation: { realName: 'Alpha Widgets' },
  });
  await U.readSiteInGroups({ businessName: 'X', pages, askTheReader: reader });
  const prompt = reader.callsFor('reconciliation')[0];
  assert.ok(prompt.includes('Beta Widget Works serves Bend'),
    'the disputed page TEXT goes into the prompt, not only the answers it produced');
  assert.ok(prompt.includes('finest widget maker'),
    'both sides of the dispute are handed over');
});

test('a field the reconciliation cannot settle is could_not_tell, not a tie-break', async () => {
  const pages = [
    { url: `${HOST}/about`, text: 'Alpha Widgets is the finest widget maker around these parts.' },
    { url: `${HOST}/contact`, text: 'Beta Widget Works serves Bend from its quiet office downtown.' },
  ];
  const reader = makeReader({
    identity: { theirOwnSite: true, realName: 'Alpha Widgets', trade: 'manufacturing', tradeSure: true },
    contact: { theirOwnSite: true, realName: 'Beta Widget Works', trade: 'manufacturing', tradeSure: true },
    reconciliation: { realName: null },
  });
  const out = await U.readSiteInGroups({ businessName: 'X', pages, askTheReader: reader });
  assert.equal(out.reconciliation.settled.realName, U.COULD_NOT_TELL,
    'an unsettled dispute is could_not_tell — neither group answer is promoted');
});

test('a group that runs out of time keeps the batches that finished, marked partial', async () => {
  const pages = ['/about', '/our-story', '/company', '/history', '/mission'].map((p) => ({
    url: `${HOST}${p}`,
    text: `Blue Widget Co. ${`the ${p.slice(1)} page tells its own long widget story. `.repeat(80)}`,
  }));
  const reader = makeReader({
    identity: { theirOwnSite: true, realName: 'Blue Widget Co', trade: 'manufacturing', tradeSure: true },
  }, { latencyMs: 40 });
  const out = await U.readSiteInGroups({
    businessName: 'Blue Widget Co', pages, askTheReader: reader,
    controller: U.makeFlightController({ start: 1, min: 1, max: 1 }),
    deadline: Date.now() + 20,
  });
  assert.ok(out.answers.identity, 'the batch that finished is KEPT');
  assert.equal(out.answers.identity.partial, true, 'and the answer says it was built from part of its batches');
  assert.equal(out.partial, true);
});

// ===========================================================================
// one-immutable-reading-per-visit-with-every-page-text-kept
// ===========================================================================

test('keepPage stores identical text once and points the second visit at it', async () => {
  const db = fakeDb();
  const words = 'The readable words of a page that never changes between visits.';
  const first = await R.keepPage(db, 'reading_A', { url: `${HOST}/about`, text: words });
  const second = await R.keepPage(db, 'reading_B', { url: `${HOST}/about`, text: words });
  assert.ok(first.text, 'the first visit holds the words');
  assert.equal(second.text, null, 'the second visit does not duplicate them');
  assert.equal(second.sameAs, first.id, 'it points at the copy already held');
  const changed = await R.keepPage(db, 'reading_C', { url: `${HOST}/about`, text: `${words} Except now it changed.` });
  assert.ok(changed.text, 'changed words get their own stored row');
  assert.equal(changed.sameAs, null);
});

test('keepPage accepts a sent-to-model marker and omits it when unsaid', async () => {
  const db = fakeDb();
  const read = await R.keepPage(db, 'r1', { url: `${HOST}/a`, text: 'words that were read aloud', sentToModel: true });
  const kept = await R.keepPage(db, 'r1', { url: `${HOST}/b`, text: 'words stored but never read', sentToModel: false });
  const unsaid = await R.keepPage(db, 'r1', { url: `${HOST}/c`, text: 'words from before the marker existed' });
  assert.equal(read.sentToModel, true);
  assert.equal(kept.sentToModel, false, 'stored-but-never-read must be distinguishable from read');
  assert.ok(!('sentToModel' in unsaid), 'an unsaid marker writes NOTHING — never a default');
});

test('everyAnswer returns earlier findings beside new ones', async () => {
  const db = fakeDb();
  db.rows.readings.push({ id: 'r_old', source: 'website', reader: 'x', startedAt: new Date(), sourceUrl: null });
  db.rows.readings.push({ id: 'r_new', source: 'website', reader: 'x', startedAt: new Date(), sourceUrl: null });
  db.rows.findings.push({ id: 'f1', readingId: 'r_old', prospectId: 'p1', field: 'trade', value: 'legal', retiredAt: null, createdAt: new Date() });
  db.rows.findings.push({ id: 'f2', readingId: 'r_new', prospectId: 'p1', field: 'trade', value: 'accounting', retiredAt: null, createdAt: new Date() });
  const all = await R.everyAnswer(db, 'p1', 'trade');
  assert.equal(all.length, 2, 'a new reading sits BESIDE the old one, never replacing it');
});

// ===========================================================================
// recordGroupedRead — findings named by their group
// ===========================================================================

const bareUnderstood = (extra = {}) => ({
  realName: null, trade: null, tradeUnsure: false, cannotTell: null, notTheirSite: false,
  whatTheyDo: null, yearsInBusiness: null, whoRunsIt: null, teamSize: null, companyProfile: null,
  sharedEmail: null, mainPhone: null, postalAddress: null, locations: [], people: [],
  stalledBuild: null, recentNews: null, dropped: [],
  ...extra,
});

test('two groups answering one field leave two findings, each naming its group', async () => {
  const db = fakeDb();
  await recordGroupedRead(db, {
    readingId: 'r1', prospectId: 'p1', url: `${HOST}/`,
    saidByGroup: {
      identity: { theirOwnSite: true, tradeSure: true },
      contact: { theirOwnSite: true, tradeSure: true },
    },
    understoodByGroup: {
      identity: bareUnderstood({ trade: 'legal' }),
      contact: bareUnderstood({ trade: 'accounting' }),
    },
  });
  const trades = db.rows.findings.filter((f) => f.field === 'trade');
  assert.equal(trades.length, 2, 'two groups answering one field leave TWO findings, never one contested value');
  const quotes = trades.map((f) => f.quote).join(' | ');
  assert.match(quotes, /\[identity read\]/);
  assert.match(quotes, /\[contact read\]/);
});

test('the reconciliation result is its own finding beside the group findings', async () => {
  const db = fakeDb();
  await recordGroupedRead(db, {
    readingId: 'r1', prospectId: 'p1', url: `${HOST}/`,
    saidByGroup: {
      identity: { theirOwnSite: true, tradeSure: true },
      contact: { theirOwnSite: true, tradeSure: true },
    },
    understoodByGroup: {
      identity: bareUnderstood({ realName: 'Alpha Widgets' }),
      contact: bareUnderstood({ realName: 'Beta Widget Works' }),
    },
    reconciliation: { fields: ['realName'], settled: { realName: 'Alpha Widgets' } },
  });
  const names = db.rows.findings.filter((f) => f.field === 'realName');
  assert.equal(names.length, 3, 'both group findings AND the reconciliation finding');
  assert.ok(names.some((f) => /\[identity read\]/.test(f.quote || '')));
  assert.ok(names.some((f) => /\[contact read\]/.test(f.quote || '')));
  const settled = names.find((f) => /reconciliation/.test(f.quote || ''));
  assert.ok(settled, 'the reconciliation writes its own finding');
  assert.equal(settled.value, 'Alpha Widgets');
});

test('a detected tool carries its name and detection method; disagreeing detections both kept', async () => {
  const db = fakeDb();
  await recordGroupedRead(db, {
    readingId: 'r1', prospectId: 'p1', url: `${HOST}/`,
    saidByGroup: {}, understoodByGroup: {},
    couldNotTell: Object.fromEntries(U.PURPOSES.map((p) => [p, 'no page'])),
    tools: [{ name: 'Calendly', method: 'fingerprint' }, { name: 'Jobber', method: 'model' }],
  });
  const tools = db.rows.findings.filter((f) => f.field === 'toolInUse');
  assert.equal(tools.length, 2, 'the fingerprint and the model naming different systems keeps BOTH entries');
  const calendly = tools.find((f) => f.value === 'Calendly');
  const jobber = tools.find((f) => f.value === 'Jobber');
  assert.match(calendly.quote, /fingerprint/);
  assert.match(jobber.quote, /model/);
});

test('detectedTools pairs each system with its method and merges only the same system', () => {
  const pages = [{ url: `${HOST}/`, html: '<script src="https://assets.calendly.com/x.js"></script>', text: '' }];
  const out = detectedTools(pages, ['Calendly', 'Jobber']);
  const calendly = out.find((t) => t.name === 'Calendly');
  const jobber = out.find((t) => t.name === 'Jobber');
  assert.equal(calendly.method, 'fingerprint and model', 'the same system named twice is one entry saying both');
  assert.equal(jobber.method, 'model', 'a system only the model named keeps its own entry');
});

test('toolsFromPages reads the skipped pages exactly like the read ones', () => {
  const pages = [
    { url: `${HOST}/`, html: '<p>nothing here</p>', text: 'nothing here' },
    { url: `${HOST}/cart`, html: '<script src="https://js.stripe.com/v3"></script>', text: '', skipFromReading: true, skippedBy: 'cart-or-checkout' },
  ];
  assert.ok(toolsFromPages(pages).includes('Stripe'),
    'a tool on a page that was never read is still a tool they pay for');
});

test('a tool from an earlier visit absent from this one is recorded as gone', async () => {
  const db = fakeDb();
  db.rows.findings.push({
    id: 'f_old', readingId: 'r_before', prospectId: 'p1', field: 'toolInUse',
    value: 'Calendly', retiredAt: null, createdAt: new Date(),
  });
  await recordGroupedRead(db, {
    readingId: 'r_now', prospectId: 'p1', url: `${HOST}/`,
    saidByGroup: {}, understoodByGroup: {},
    couldNotTell: Object.fromEntries(U.PURPOSES.map((p) => [p, 'no page'])),
    tools: [],
  });
  const gone = db.rows.findings.filter((f) => f.field === 'toolGone');
  assert.equal(gone.length, 1, 'a system that went away is recorded as loudly as one appearing');
  assert.equal(gone[0].value, 'Calendly');
  const old = db.rows.findings.find((f) => f.id === 'f_old');
  assert.equal(old.value, 'Calendly', 'the earlier finding is untouched');
  assert.equal(old.retiredAt, null);
});

test("an unread group's fields are recorded could_not_tell with the reason, never a default", async () => {
  const db = fakeDb();
  await recordGroupedRead(db, {
    readingId: 'r1', prospectId: 'p1', url: `${HOST}/`,
    saidByGroup: {}, understoodByGroup: {},
    couldNotTell: { hiring: 'no hiring page was found on the site' },
    tools: [],
  });
  const hiringOffice = db.rows.findings.find((f) => f.field === 'hiringOffice');
  const openRoles = db.rows.findings.find((f) => f.field === 'openOfficeRoles');
  assert.ok(hiringOffice && openRoles, 'the absence itself is recorded');
  for (const f of [hiringOffice, openRoles]) {
    assert.equal(f.status, 'could_not_tell');
    assert.equal(f.value, null, 'no default value stands in for an unanswered question');
    assert.match(f.quote, /no hiring page/);
  }
  const numbered = db.rows.findings.filter((f) => f.status === 'could_not_tell' && (f.value !== null || f.number !== null));
  assert.equal(numbered.length, 0, 'could_not_tell never smuggles a value');
});

// ===========================================================================
// the visit itself — scripts/hoursback/understand-businesses.js
// ===========================================================================

function visitSite() {
  const identityBody = 'Blue Widget Co is a family business making fine widgets with care and patience for years.';
  return {
    '/': htmlPage('Blue Widget Co', identityBody, [
      ['/about', 'About'], ['/contact', 'Contact'], ['/privacy-policy', 'Privacy'],
    ]),
    '/about': htmlPage('About', `${identityBody} Founded long ago by careful people who loved widgets.`),
    '/contact': htmlPage('Contact', 'Contact us at [email info@bluewidget.example] or ring 541-555-1234. The office is at 12 Main Street, Bend.'),
    '/privacy-policy': htmlPage('Privacy', 'The legal words about privacy, cookies and other solemn matters.'),
  };
}

const visitAnswers = {
  identity: {
    theirOwnSite: true, realName: 'Blue Widget Co', trade: 'manufacturing', tradeSure: true,
    whatTheyDo: 'They make fine widgets for shops.', yearsInBusiness: 12,
  },
  contact: {
    theirOwnSite: true, realName: 'Blue Widget Co', trade: 'manufacturing', tradeSure: true,
    sharedEmail: 'info@bluewidget.example', mainPhone: '541-555-1234',
    locations: [{ town: 'Bend', isHeadOffice: true, seenOn: `${HOST}/contact` }],
  },
};

const freshRow = () => ({
  id: 'p1', name: 'BLUEWIDGET LLC - Home', nameManualValue: null, trade: null, phone: null,
  website: `${HOST}/`, websiteManualValue: null, email: null, emailManualValue: null,
  automationScore: null, scoreEvidence: null, stage: 'NO_CONTACT',
  addressManualValue: null, employeeCountManualValue: null, ownerName: null, phoneManualValue: null,
});

async function runVisit(db, { site = visitSite(), answers = visitAnswers, row = freshRow(), deps = {} } = {}) {
  return script.visitOneBusiness(db, row, {
    askTheReader: makeReader(answers),
    controller: U.makeFlightController({ start: 6, max: 6 }),
    look: false,
    fetch: makeFetch(site),
    delayMs: 0,
    ...deps,
  });
}

test('one visit is one reading: pages, findings and the finish all hang off one readingId', async () => {
  const db = fakeDb();
  const visit = await runVisit(db);
  assert.equal(visit.outcome, 'read');
  assert.equal(db.rows.readings.length, 1, 'startReading exactly once per visit');
  const readingId = db.rows.readings[0].id;
  assert.equal(db.rows.pages.length, 4, 'a visit that fetched 4 pages leaves 4 page rows — the skipped one included');
  for (const p of db.rows.pages) assert.equal(p.readingId, readingId);
  assert.ok(db.rows.findings.length > 0);
  for (const f of db.rows.findings) assert.equal(f.readingId, readingId);
  assert.equal(db.rows.readings[0].outcome, 'read', 'finishReading closed the visit');
  assert.ok(db.rows.readings[0].finishedAt, 'the visit has an end');
  const trade = db.rows.findings.filter((f) => f.field === 'trade');
  assert.ok(trade.length >= 2, 'each group that answered trade left its own finding');
});

test('a skipped page is stored with sentToModel false; a read page with true', async () => {
  const db = fakeDb();
  await runVisit(db);
  const privacy = db.rows.pages.find((p) => p.url.includes('privacy-policy'));
  const contact = db.rows.pages.find((p) => p.url.includes('/contact'));
  assert.ok(privacy, 'a wrong skip must be recoverable without a second visit — the page is stored');
  assert.equal(privacy.sentToModel, false);
  assert.equal(contact.sentToModel, true);
});

test('an unreachable site still finishes its reading, as unreachable', async () => {
  const db = fakeDb();
  const visit = await runVisit(db, { site: {} });
  assert.equal(visit.outcome, 'unreachable');
  assert.equal(db.rows.readings.length, 1);
  assert.equal(db.rows.readings[0].outcome, 'unreachable', 'a site that cannot be fetched must not look like one nobody tried');
});

test('a visit that runs out of read time is kept and marked partial', async () => {
  const db = fakeDb();
  const visit = await script.visitOneBusiness(db, freshRow(), {
    askTheReader: makeReader(visitAnswers, { latencyMs: 40 }),
    controller: U.makeFlightController({ start: 1, min: 1, max: 1 }),
    look: false,
    fetch: makeFetch(visitSite()),
    delayMs: 0,
    visitReadBudgetMs: 20,
  });
  assert.equal(visit.outcome, 'read', 'a partial visit is never discarded');
  assert.equal(visit.partial, true);
  assert.match(db.rows.readings[0].note || '', /partial/, 'the reading carries the partial marker');
  assert.ok(db.rows.findings.length > 0, 'every answer that arrived before the stop is kept');
});

test('a re-visit appends a second reading and stores unchanged text once', async () => {
  const db = fakeDb();
  await runVisit(db);
  const firstFindings = db.rows.findings.length;
  await runVisit(db, { row: freshRow() });
  assert.equal(db.rows.readings.length, 2, 'the second visit lands BESIDE the first');
  assert.equal(db.rows.pages.length, 8, 'keepPage ran for every page of both visits — no skip-if-unchanged guard');
  const aboutRows = db.rows.pages.filter((p) => p.url.includes('/about'));
  assert.equal(aboutRows.length, 2);
  const [v1, v2] = aboutRows;
  assert.ok(v1.text, 'the first visit holds the words');
  assert.equal(v2.text, null, 'unchanged text is stored once');
  assert.equal(v2.sameAs, v1.id);
  assert.ok(db.rows.findings.length > firstFindings, 'the second visit recorded its own findings');
  for (const f of db.rows.findings) assert.equal(f.retiredAt, null, 'nothing was retired or touched');
  const all = await R.everyAnswer(db, 'p1', 'trade');
  assert.ok(all.length >= 4, 'everyAnswer returns the earlier findings alongside the new');
});

test('the script keeps its ceilings and has shed the old capped read', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/hoursback/understand-businesses.js'), 'utf8');
  assert.match(source, /const BATCH_OF_SITES = 50/, 'the 50-site batch ceiling is a named constant in code');
  assert.equal(script.BATCH_OF_SITES, 50);
  assert.ok(!source.includes('PAGES_PER_SITE'), 'no PAGES_PER_SITE constant — no visit capped at eight pages');
  assert.ok(!source.includes('questionAbout('), 'no whole-site single question');
  assert.ok(!source.includes('slice(0, 12000)'), 'no retry that quietly truncates the site');
  assert.ok(!/openrouter\.ai/i.test(source), 'no OpenRouter call path');
  assert.ok(source.includes("execFile('claude'"), 'every model call leaves through the local reader');
});

// ---------------------------------------------------------------------------
// A page that published nothing is still a page we opened.
//
// keepPage() used to return null for a page whose text came back empty, so a
// bot-challenge page or a site whose words need a browser left no trace. That
// makes "never opened" and "opened, published nothing" the same absence — the
// collapse CLAUDE.md rule 1 exists to forbid.
test('a page that published no words is kept, not dropped', async () => {
  const R = require('../../src/hoursback/readings.js');
  const made = [];
  const db = {
    readingPage: {
      create: async ({ data }) => { made.push(data); return { id: 'p' + made.length, ...data }; },
      findFirst: async () => null,
    },
  };
  const row = await R.keepPage(db, 'r1', { url: 'https://x.test/blocked', text: '', sentToModel: false });
  assert.ok(row, 'a wordless page must still leave a row');
  assert.equal(made.length, 1);
  assert.equal(made[0].text, '', 'an empty text means "we opened it and it said nothing"');
  assert.equal(made[0].sameAs, null, 'a blank page points at nothing');
  assert.equal(made[0].bytes, 0);
  assert.equal(made[0].sentToModel, false);
});

test('a blank page is never used as the held copy of another page', async () => {
  const R = require('../../src/hoursback/readings.js');
  let asked = null;
  const db = {
    readingPage: {
      create: async ({ data }) => ({ id: 'p1', ...data }),
      findFirst: async (q) => { asked = q; return null; },
    },
  };
  await R.keepPage(db, 'r1', { url: 'https://x.test/a', text: 'real words here', sentToModel: true });
  assert.ok(asked, 'it must look for an earlier identical copy');
  assert.deepEqual(asked.where.NOT, { text: '' }, 'a blank row can never be the copy pointed at');
});
