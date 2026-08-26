// Find the people. Names, roles, direct emails, direct phone numbers, and a
// real team size — from the business's own website and nothing else.
//
// Why this exists: the first pass read at most five pages per site and only
// counted people on a page whose address happened to contain team or staff.
// On most sites the team page sits one click BELOW the About tab, so it was
// never opened. Russ opened BeginRight Employment — which has a team page
// right there under About — and the record said team size unknown. He was
// right to stop everything (2026-08-26).
//
// Two changes make the difference: this follows links TWO hops instead of one,
// and it keeps a person who has no published email address instead of throwing
// the whole record away — which is why not one of the 2,471 people already on
// file had a phone number.
//
// Free, always. Their own websites, no key, no paid service, nothing to meter.

const { textOf } = require('./enrich.js');

function absoluteUrl(href, base) {
  try { return new URL(String(href), base).toString(); } catch { return null; }
}

const MAX_PAGES_PER_SITE = 12;      // a hard stop; most sites finish in four
const PAGE_TIMEOUT_MS = 8000;
const DELAY_BETWEEN_PAGES_MS = 900;
const MAX_HTML_BYTES = 1500000;

// The pages worth opening, best first. A team page is usually one of these or
// sits one click under the About page.
const WORTH_OPENING = [
  /\b(our[- ]?team|meet[- ]the[- ]team|meet[- ]our|team|staff|our[- ]people|people|leadership|management|providers|attorneys|agents|doctors|dentists|physicians|associates|employees|who[- ]we[- ]are)\b/i,
  /\b(about|about[- ]us|our[- ]story|company)\b/i,
  /\b(contact|contact[- ]us|locations|offices|directory)\b/i,
];

function rank(url, label) {
  const hay = `${url} ${label}`;
  for (const [i, re] of WORTH_OPENING.entries()) if (re.test(hay)) return i;
  return 99;
}

// Every same-site link, sorted by how likely it is to hold people.
function linksToPeople(html, baseUrl) {
  let base;
  try { base = new URL(baseUrl); } catch { return []; }
  const scored = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,140}?)<\/a>/gi)) {
    const label = textOf(m[2]);
    const abs = absoluteUrl(m[1], baseUrl);
    if (!abs) continue;
    let u;
    try { u = new URL(abs); } catch { continue; }
    if (u.host !== base.host) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const key = u.origin + u.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = rank(u.pathname, label);
    if (r === 99) continue;
    scored.push({ url: u.toString(), rank: r });
  }
  scored.sort((a, b) => a.rank - b.rank);
  return scored.map((s) => s.url);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; VisionAIry research; russ@visionairy.biz)' },
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const text = await res.text();
    return text.slice(0, MAX_HTML_BYTES);
  } finally { clearTimeout(t); }
}

// Read a site two hops deep, opening the pages most likely to name people.
async function fetchPeoplePages(website, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const maxPages = Math.min(options.maxPages || MAX_PAGES_PER_SITE, MAX_PAGES_PER_SITE);
  const delay = options.delayMs === undefined ? DELAY_BETWEEN_PAGES_MS : options.delayMs;
  const start = absoluteUrl(website && website.startsWith('http') ? website : `https://${website}`, 'https://x/');
  if (!start) return { pages: [], error: 'unreadable web address' };

  const pages = [];
  const opened = new Set();
  let home;
  try { home = await fetchPage(start, fetchImpl); } catch (e) { return { pages: [], error: e.message }; }
  pages.push({ url: start, html: home });
  opened.add(new URL(start).pathname);

  // First hop: the obvious pages off the homepage.
  const firstHop = linksToPeople(home, start);
  for (const url of firstHop) {
    if (pages.length >= maxPages) break;
    const path = new URL(url).pathname;
    if (opened.has(path)) continue;
    opened.add(path);
    if (delay) await sleep(delay);
    try { pages.push({ url, html: await fetchPage(url, fetchImpl) }); } catch { /* one bad page never sinks the read */ }
  }

  // Second hop — the whole point. A team page under the About tab is
  // invisible from the homepage and was being missed on almost every site.
  const secondHopSources = pages.slice(1);
  for (const page of secondHopSources) {
    if (pages.length >= maxPages) break;
    let deeper = [];
    try { deeper = linksToPeople(page.html, page.url); } catch { deeper = []; }
    for (const url of deeper) {
      if (pages.length >= maxPages) break;
      const path = new URL(url).pathname;
      if (opened.has(path)) continue;
      opened.add(path);
      if (delay) await sleep(delay);
      try { pages.push({ url, html: await fetchPage(url, fetchImpl) }); } catch { /* keep going */ }
    }
  }
  return { pages, error: null };
}

// ---------------------------------------------------------------------------
// reading the people off the pages
//
// A person is kept even with no published email. The old reader dropped
// anyone without one, which is why not a single person on file had a phone
// number — the record was discarded before the number was ever looked at.

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const ROLE_WORDS = [
  'owner', 'founder', 'co-founder', 'president', 'vice president', 'ceo', 'cfo', 'coo', 'cto',
  'principal', 'partner', 'managing partner', 'director', 'managing director', 'general manager',
  'office manager', 'operations manager', 'practice manager', 'business manager', 'branch manager',
  'project manager', 'account manager', 'service manager', 'sales manager', 'marketing manager',
  'administrator', 'office administrator', 'administrative assistant', 'executive assistant',
  'receptionist', 'front desk', 'coordinator', 'scheduler', 'dispatcher', 'estimator',
  'bookkeeper', 'controller', 'accountant', 'attorney', 'paralegal', 'agent', 'broker',
  'dentist', 'hygienist', 'doctor', 'physician', 'nurse', 'technician', 'foreman', 'superintendent',
];
const NAME = '[A-Z][a-z]+(?:[-\'][A-Z][a-z]+)?(?:\\s+[A-Z]\\.?)?\\s+[A-Z][a-z]+(?:[-\'][A-Z][a-z]+)?';
const ROLES = ROLE_WORDS.map((r) => r.replace(/ /g, '\\s+')).join('|');
const NAME_THEN_ROLE = new RegExp(`(?:^|[.|\\u2022]\\s*)(${NAME})\\s*[,\\u2013\\u2014|-]\\s*(${ROLES})\\b`, 'gi');
const ROLE_THEN_NAME = new RegExp(`(${ROLES})\\s*[:,\\u2013\\u2014|-]\\s*(${NAME})`, 'gi');
const NOT_A_NAME = /^(The|Our|Your|We|This|About|Contact|Home|Meet|Team|Privacy|Terms|Read|More|New|Get|Call|Learn|View|Book|Click|All|Free|Site|Web|Page|Main|Office|Front|Service|Customer|Business|Company|Search|Menu|Skip|Copyright)\b/i;

// A first pass on BeginRight returned "current position", "where he" and
// "Payroll and" beside three real people — the pattern ran across sentence
// boundaries and picked up ordinary words. A name is capitalised words, none
// of which is an ordinary English word, starting where a block starts.
const ORDINARY_WORD = new RegExp(`^(?:${[
  'current','position','where','he','she','they','payroll','and','the','our','your','with','for',
  'from','that','this','these','those','his','her','their','its','has','have','had','was','were',
  'been','being','will','would','can','could','joined','started','began','works','working','brings',
  'holds','leads','serves','years','experience','career','role','time','over','after','before',
  'while','account','branch','office','staffing','employment','services','service','client',
  'customer','business','company','team','group','center','centre','north','south','east','west',
  'new','old','first','second','senior','junior','lead','chief','full','part','also','than','then',
  // Navigation dressed as a name — BeginRight returned "BeginRight Online",
  // "Job Search" and "Download Job App" from its own menu.
  'online','search','download','app','apps','login','logout','portal','signin','signup','register',
  'apply','submit','browse','find','jobs','job','careers','career','resources','resource','blog',
  'news','events','event','pay','bill','billing','español','espanol','francais','more','less',
  'next','previous','back','close','open','view','menu','home','faq','faqs','help','support',
].join('|')})$`, 'i');

function looksLikeAPerson(clean) {
  const parts = clean.split(' ');
  if (parts.length < 2 || parts.length > 4) return false;
  if (NOT_A_NAME.test(clean)) return false;
  for (const w of parts) {
    if (!/^[A-Z]/.test(w) && !/^(de|van|von|del|la|di|mac|mc|o')$/i.test(w)) return false;
    if (ORDINARY_WORD.test(w)) return false;
  }
  return true;
}

function tidyPhone(m) { return `${m[1]}-${m[2]}-${m[3]}`; }

// Everyone a page names, with role, and any email or phone sitting near them.
function peopleOnPage(page) {
  const text = textOf(page.html);
  const out = new Map();
  const add = (name, role, at) => {
    const clean = String(name).replace(/\s+/g, ' ').trim();
    if (!looksLikeAPerson(clean)) return;
    const key = clean.toLowerCase();
    const near = text.slice(Math.max(0, at - 160), at + 260);
    const email = (near.match(EMAIL_RE) || []).find((e) => !/\.(png|jpe?g|gif|webp)$/i.test(e)) || null;
    PHONE_RE.lastIndex = 0;
    const pm = PHONE_RE.exec(near);
    const phone = pm ? tidyPhone(pm) : null;
    const prior = out.get(key);
    out.set(key, {
      name: clean,
      role: (prior && prior.role) || String(role).replace(/\s+/g, ' ').toLowerCase(),
      email: (prior && prior.email) || email,
      phone: (prior && prior.phone) || phone,
      foundOn: page.url,
    });
  };
  for (const m of text.matchAll(NAME_THEN_ROLE)) add(m[1], m[2], m.index || 0);
  for (const m of text.matchAll(ROLE_THEN_NAME)) add(m[2], m[1], m.index || 0);
  return [...out.values()];
}

// Most team pages are not "Name, Role" at all — they are a run of names with a
// credential after some of them, one after another, which is how Jones & Roth
// lists forty CPAs and why the role-based pattern found nobody there. A run of
// three or more person-shaped names in sequence IS the team.
const CREDENTIALS = /\s*,?\s*\b(CPA|CFP|CFA|EA|MBA|JD|Esq\.?|PE|PLS|RN|LPN|DDS|DMD|MD|DO|DC|PA-?C|NP|LCSW|CPCU|CIC|AAI|LEED\s*AP|MAI|SIOR|CCIM|GRI|ABR|CRS|QPA|QKA|CEBS|SHRM-?[CS]P|PHR|SPHR|CISSP|PMP|AIA|RA|LUTCF|ChFC|CLU|CRPC|AAMS)\b\.?/gi;

function stripCredentials(name) {
  return String(name).replace(CREDENTIALS, '').replace(/\s+/g, ' ').trim();
}

function rosterRun(page) {
  const text = textOf(page.html);
  // Split on the sentence marks the text reader inserts at block ends.
  const parts = text.split(/\s*[.|\u2022]\s+/);
  const runs = [];
  let run = [];
  for (const raw of parts) {
    const candidate = stripCredentials(raw);
    if (looksLikeAPerson(candidate)) { run.push(candidate); continue; }
    if (run.length >= 3) runs.push(run);
    run = [];
  }
  if (run.length >= 3) runs.push(run);
  const best = runs.sort((a, b) => b.length - a.length)[0] || [];
  return best.map((name) => ({ name, role: null, email: null, phone: null, foundOn: page.url }));
}

// Everyone across every page opened, deduplicated by name.
function peopleFromSite(pages) {
  const all = new Map();
  for (const page of pages) {
    for (const person of [...peopleOnPage(page), ...rosterRun(page)]) {
      const key = person.name.toLowerCase();
      const prior = all.get(key);
      if (!prior) { all.set(key, person); continue; }
      all.set(key, {
        ...prior,
        role: prior.role || person.role,
        email: prior.email || person.email,
        phone: prior.phone || person.phone,
      });
    }
  }
  return [...all.values()];
}

// The team size their own site publishes, by counting the people it names.
// Two is a coincidence and eighty is a directory of every agent in the state.
function teamSizeFrom(people) {
  const n = people.length;
  return n >= 3 && n <= 80 ? n : null;
}

module.exports = {
  MAX_PAGES_PER_SITE, PAGE_TIMEOUT_MS, DELAY_BETWEEN_PAGES_MS,
  WORTH_OPENING, rank, linksToPeople, fetchPeoplePages,
  peopleOnPage, peopleFromSite, rosterRun, stripCredentials, teamSizeFrom, looksLikeAPerson, ROLE_WORDS,
};
