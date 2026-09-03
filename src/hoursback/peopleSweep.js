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
// The same stripper the reader answers about. Every page the crawl returns
// carries its readable text, because a page fetched and not kept is the
// failure this repository exists to end (docs/hoursback/evidence-store.md).
const { readableText } = require('./understand.js');

function absoluteUrl(href, base) {
  try { return new URL(String(href), base).toString(); } catch { return null; }
}

const MAX_PAGES_PER_SITE = 12;      // a hard stop; most sites finish in four

// A SITE WITH A REAL TEAM PAGE IS ALLOWED FURTHER.
//
// Twelve pages is plenty for a plumber and nowhere near enough for a firm.
// Kernutt Stokes lists its people, each on their own page with a direct email
// and a direct number, and the read stopped after a handful of them — so Russ
// had contact details on screen that the record had never seen (2026-08-31).
//
// The extra pages are only spent where a team page was actually found, and only
// on links sitting underneath it, so an ordinary site still finishes in four.
const MAX_PAGES_WITH_A_TEAM_PAGE = 50;
const PAGE_TIMEOUT_MS = 8000;
const DELAY_BETWEEN_PAGES_MS = 900;
const MAX_HTML_BYTES = 1500000;

// What an ordinary visitor's browser sends. Two of fifteen unreadable sites in
// the first fifty were refusing us purely on this (2026-08-31).
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

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

// EVERY LINK SITTING UNDERNEATH THE TEAM PAGE.
//
// A person's own page is named after the person — /team/trever-campbell — so
// whether the ordinary rule opened it came down to whether the firm happened to
// put a word like "team" in the address. This takes the team page's own address
// and follows anything below it, which is what a profile always is.
function linksBelow(html, teamPageUrl) {
  let base;
  try { base = new URL(teamPageUrl); } catch { return []; }
  const under = base.pathname.replace(/\/+$/, '');
  if (!under || under === '') return [];
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    const abs = absoluteUrl(m[1], teamPageUrl);
    if (!abs) continue;
    let u;
    try { u = new URL(abs); } catch { continue; }
    if (u.host !== base.host) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const path = u.pathname.replace(/\/+$/, '');
    if (path === under) continue;
    if (!path.startsWith(`${under}/`)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(u.toString());
  }
  return out;
}

// Is this page the one listing the people?
function looksLikeATeamPage(url) {
  return WORTH_OPENING[0].test(String(url));
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
    // A 99 is KEPT. It used to be dropped here, which silently capped every
    // caller at the handful of pages the patterns recognise — a whole-site
    // read cannot start from a filter that throws the site away (2026-09-01).
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
      // WE ASK LIKE A BROWSER, BECAUSE A GREAT MANY SITES REFUSE ANYTHING ELSE.
      //
      // Announcing ourselves as research was honest and it got the door shut.
      // Cornerstone Family Dentistry and El Mercadito both returned "refused"
      // to the old line and opened straight away to this one (tested
      // 2026-08-31). Nothing else changes: the same pages, the same pause
      // between them, the same ceiling.
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const text = await res.text();
    return text.slice(0, MAX_HTML_BYTES);
  } finally { clearTimeout(t); }
}

// Read a site two hops deep, opening the pages most likely to name people.
async function fetchPeoplePages(website, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  // No Math.min here. The old clamp silently capped every caller at 12
  // pages whatever they asked for, which is one of the three ways the old
  // read stopped at ~8 pages (2026-09-01). A caller who asks gets what it
  // asked for; a caller who does not ask still gets the modest default.
  const maxPages = options.maxPages || MAX_PAGES_PER_SITE;
  const delay = options.delayMs === undefined ? DELAY_BETWEEN_PAGES_MS : options.delayMs;
  // START AT THE FRONT DOOR, WHATEVER PAGE IS ON THE RECORD.
  //
  // Kernutt Stokes is stored as its Bend office page. Reading began there and
  // never climbed up to the team page, so 32 people with direct emails and
  // direct numbers stayed invisible (2026-08-31). The stored page is still
  // opened — it is often the right one — but the homepage goes first, because
  // that is where the links to everything else live.
  const given = absoluteUrl(website && website.startsWith('http') ? website : `https://${website}`, 'https://x/');
  if (!given) return { pages: [], error: 'unreadable web address' };
  let start = given;
  try {
    const u = new URL(given);
    if (u.pathname && u.pathname !== '/') start = u.origin + '/';
  } catch { /* keep what we were given */ }

  const pages = [];
  const opened = new Set();
  // Every entry carries the address, how the fetch went, and the readable text
  // — never an entry without its words (2026-09-01).
  const entry = (url, html) => ({ url, status: 'fetched', html, text: readableText(html) });
  let home;
  try { home = await fetchPage(start, fetchImpl); } catch (e) { return { pages: [], error: e.message }; }
  pages.push(entry(start, home));
  opened.add(new URL(start).pathname);

  // The page that was on the record, where that is not the homepage. It was put
  // there for a reason — often the local office — and it names people too.
  if (given !== start) {
    try {
      const p2 = new URL(given).pathname;
      if (!opened.has(p2)) {
        opened.add(p2);
        if (delay) await sleep(delay);
        pages.push(entry(given, await fetchPage(given, fetchImpl)));
      }
    } catch { /* the homepage alone is enough to carry on */ }
  }

  // First hop: the obvious pages off the homepage.
  const firstHop = linksToPeople(home, start);
  for (const url of firstHop) {
    if (pages.length >= maxPages) break;
    const path = new URL(url).pathname;
    if (opened.has(path)) continue;
    opened.add(path);
    if (delay) await sleep(delay);
    try { pages.push(entry(url, await fetchPage(url, fetchImpl))); } catch { /* one bad page never sinks the read */ }
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
      try { pages.push(entry(url, await fetchPage(url, fetchImpl))); } catch { /* keep going */ }
    }
  }
  // THIRD HOP — the profiles themselves. Only from a page that is actually the
  // team page, and only to addresses sitting under it. This is where the direct
  // email and the direct number live, and it was never reached.
  const teamPages = pages.filter((pg) => looksLikeATeamPage(pg.url));
  if (teamPages.length) {
    // Math.max, not Math.min: a site with a team page always gets at least
    // the team-page room, and a whole-site caller asking for more gets more.
    const roomier = Math.max(options.maxPages || MAX_PAGES_WITH_A_TEAM_PAGE, MAX_PAGES_WITH_A_TEAM_PAGE);
    for (const page of teamPages) {
      let profiles = [];
      try { profiles = linksBelow(page.html, page.url); } catch { profiles = []; }
      for (const url of profiles) {
        if (pages.length >= roomier) break;
        const path = new URL(url).pathname;
        if (opened.has(path)) continue;
        opened.add(path);
        if (delay) await sleep(delay);
        try { pages.push(entry(url, await fetchPage(url, fetchImpl))); } catch { /* keep going */ }
      }
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
// Every LinkedIn profile link on the page, with where it sat, so a person can
// be matched to the one printed beside their name.
//
// This was never collected. There is a place on every person to keep one and
// nothing that ever filled it: 0 of 7,352 people had a profile, which is not a
// low hit rate but an absence (2026-08-28).
const LINKEDIN_PROFILE = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/gi;

function linkedInProfilesOn(html) {
  const out = [];
  const raw = String(html || '');
  for (const m of raw.matchAll(LINKEDIN_PROFILE)) out.push({ url: m[0], at: m.index || 0 });
  return out;
}

// Which profile link is printed nearest this person's name in the raw page.
// A team grid puts the name, the title and the profile link inside one card,
// so nearest-in-the-page is the same as belonging-to-them.
// `taken` is a Set the caller shares across one page, so a single profile link
// cannot be handed to three different people — which is what happened on the
// first run (2026-08-28).
function profileNear(html, name, profiles, taken = new Set()) {
  if (!profiles.length) return null;
  const raw = String(html || '');
  const at = raw.toLowerCase().indexOf(String(name || '').toLowerCase());
  if (at < 0) return null;
  let best = null;
  for (const p of profiles) {
    if (taken.has(p.url)) continue;
    const gap = Math.abs(p.at - at);
    // A team card is small. Beyond about 600 characters it is somebody else's.
    if (gap < 600 && (!best || gap < best.gap)) best = { url: p.url, gap };
  }
  if (best) taken.add(best.url);
  return best ? best.url : null;
}

function peopleOnPage(page, taken = new Set()) {
  const text = textOf(page.html);
  const profiles = linkedInProfilesOn(page.html);
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
      linkedIn: (prior && prior.linkedIn) || profileNear(page.html, clean, profiles, taken),
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

// Is this piece of text somebody's job title?
const ROLE_LINE = new RegExp(`\\b(${ROLES})\\b`, 'i');
function roleFromLine(piece) {
  const t = String(piece || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 60 || t.split(' ').length > 7) return null;
  return ROLE_LINE.test(t) ? t.toLowerCase().replace(/[.,;:]+$/, '') : null;
}

function rosterRun(page, taken = new Set()) {
  const text = textOf(page.html);
  const profiles = linkedInProfilesOn(page.html);
  // Split on the sentence marks the text reader inserts at block ends.
  const parts = text.split(/\s*[.|\u2022]\s+/);
  const runs = [];
  let run = [];
  // A team grid reads "Jane Smith. Operations Manager. John Doe. Sales
  // Director." — the piece straight after a name is that person's title. It
  // was thrown away on this path, which is why only 28 people in 100 had a
  // role while most team pages print one under every photograph
  // (2026-08-28).
  // The words a team card puts between a name and a title: the label on a
  // profile link, an email link, a "read more". Short, and neither a person
  // nor a job. Treating one of these as the end of the team lost the FIRST
  // person on every card that had a LinkedIn link (2026-08-28).
  const isFiller = (piece) => {
    const t = String(piece || '').replace(/\s+/g, ' ').trim();
    if (!t || t.split(' ').length > 3) return false;
    return !looksLikeAPerson(stripCredentials(t)) && !roleFromLine(t);
  };

  for (let i = 0; i < parts.length; i += 1) {
    const candidate = stripCredentials(parts[i]);
    if (looksLikeAPerson(candidate) && !roleFromLine(candidate)) {
      // The title is the next piece, or the one after a bit of filler.
      let role = roleFromLine(parts[i + 1]);
      let skip = role ? 1 : 0;
      if (!role && isFiller(parts[i + 1])) {
        role = roleFromLine(parts[i + 2]);
        if (role) skip = 2;
      }
      run.push({ name: candidate, role });
      // A title between two names does NOT end the run. Requiring names
      // back-to-back meant a grid that prints a job title under every
      // photograph — which is most of them — produced nothing at all: no
      // roles, and no people either (2026-08-28).
      i += skip;
      continue;
    }
    if (isFiller(parts[i])) continue;
    if (run.length >= 3) runs.push(run);
    run = [];
  }
  if (run.length >= 3) runs.push(run);
  const best = runs.sort((a, b) => b.length - a.length)[0] || [];
  return best.map((p) => ({
    name: p.name,
    role: p.role,
    email: null,
    phone: null,
    linkedIn: profileNear(page.html, p.name, profiles, taken),
    foundOn: page.url,
  }));
}

// Everyone across every page opened, deduplicated by name.
// ONE PERSON'S OWN PAGE.
//
// The two readers above are built for a team LIST — runs of names down a page,
// with nobody's address beside them. A profile page is the opposite: one person,
// their photo, their direct address and their direct line. Read as a list it
// gave a name and nothing else, which is why Kernutt Stokes came back with 24
// people and not one email between them (2026-08-31).
//
// Here the page IS the person. The address in the mailto and the number in the
// tel belong to whoever the page is about.
function personOnTheirOwnPage(page) {
  const html = String(page.html || '');
  const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => m[1].trim().toLowerCase());
  const tels = [...html.matchAll(/tel:([+0-9().\s-]{7,})/gi)].map((m) => m[1].replace(/[^\d+]/g, ''));
  // More than one address means it is a list again, not one person's page.
  const own = [...new Set(mailtos)].filter((a) => !/^(info|contact|office|hello|admin|sales|support|reception|frontdesk)@/i.test(a));
  if (own.length !== 1) return [];

  // A JOB TITLE IS NEVER A NAME.
  //
  // The first version took the first heading that looked like a person and
  // wrote down "Managing Partner" as somebody called Managing — which would
  // have opened a letter "Hi Managing," (caught on the Kernutt Stokes run,
  // 2026-08-31).
  const isATitle = (t) => {
    const low = String(t).toLowerCase().replace(/[^a-z ]/g, ' ').trim();
    if (!low) return true;
    const words = low.split(/\s+/);
    return words.every((w) => ROLE_WORDS.some((r) => r.split(/\s+/).includes(w))
      || ['and', 'of', 'the', 'senior', 'junior', 'chief', 'lead', 'head', 'staff'].includes(w));
  };

  // THE ADDRESS HAS TO AGREE WITH THE NAME.
  //
  // Refusing job titles was not enough — the next heading on one page was the
  // office town, and "Lake Oswego" went down as somebody's name (Kernutt
  // Stokes run, 2026-08-31). On a person's own page the address is theirs, so
  // it is the thing that says which heading is really the person: sritchie@
  // agrees with Ritchie and agrees with nothing about Lake Oswego.
  const local = own[0].split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  const agreesWithTheAddress = (candidate) => {
    const words = String(candidate).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
    return words.some((w) => local.includes(w) || w.includes(local));
  };

  let name = null;
  for (const m of html.matchAll(/<h[1-3][^>]*>([\s\S]{0,120}?)<\/h[1-3]>/gi)) {
    const t = stripCredentials(textOf(m[1]));
    if (!looksLikeAPerson(t) || isATitle(t)) continue;
    if (agreesWithTheAddress(t)) { name = t; break; }
  }
  if (!name) {
    // No heading the address backs up. Build the name from the address itself,
    // which on a profile page belongs to the person the page is about.
    const spaced = own[0].split('@')[0].replace(/[._-]+/g, ' ');
    const cased = spaced.replace(/\b\w/g, (c) => c.toUpperCase());
    if (looksLikeAPerson(cased) && !isATitle(cased)) name = cased;
  }
  // A heading the address does not back up is not used at all. Allowing it as a
  // fallback is how "Lake Oswego" — the office town, in a heading on Steven
  // Ritchie's page — was written down as a person (2026-08-31). No name is a
  // true answer; a town is a letter opening "Hi Lake,".
  if (!name) return [];

  const text = textOf(html);
  // The job title, taken from the words just after the name rather than from
  // the whole opening line — which gave "trever campbell, cpa. partner. email
  // call" as somebody's role.
  const after = text.slice(0, 600);
  const longestFirst = [...ROLE_WORDS].sort((a, b) => b.length - a.length);
  return [{
    name,
    role: (longestFirst.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(after)) || null),
    email: own[0],
    phone: [...new Set(tels)][0] || null,
    linkedIn: (linkedInProfilesOn(html) || [])[0] || null,
    foundOn: page.url,
  }];
}


// ---------------------------------------------------------------------------
// THE WHOLE SITE, not the eight pages a pattern happened to recognise.
//
// Russ, 2026-09-01: read every page, sort each by what it is FOR, and keep all
// of it. The crawl below fetches every same-host HTML page reachable from the
// home page, inside two hard bounds:
//
//   - two minutes of crawl time per business, after which what was gathered is
//     returned marked partial — kept, never thrown away
//   - ten pages of one path shape, so a five-hundred-item shop cannot eat the
//     visit — EXCEPT beneath a team page, where the eleventh staff profile is
//     exactly the page this whole system exists to open
//
// A page a rule catches — a calendar, one product, legal boilerplate, a login
// area, an old post — is still FETCHED and returned with its readable text.
// Skipping means "not handed to the model". It never means "not kept": a wrong
// skip must be recoverable without a second visit.

// HOW LONG ONE SITE MAY TAKE (Russ, 2026-09-03: read the whole site).
//
// Two minutes used to stop most reads before the site was finished, and the
// note beside the page ceiling said so outright: "the time limit usually bites
// first". A firm with forty staff pages on a slow host was cut off part way,
// which is exactly what Russ ruled out on 2026-09-01 — every page, including
// each person's own profile, because that is where the direct email and the
// direct number live.
//
// So it is fifteen minutes, and it is a STALL GUARD rather than a work limit:
// no honest site takes that long, and one that does is broken or hostile. The
// real bounds on how much gets read are the ones that judge the site itself —
// ten pages of any one shape, staff profiles exempt; five hundred pages in
// all; and logins, carts, calendars and search results never opened.
const CRAWL_TIME_LIMIT_MS = 900000;   // fifteen minutes: a stall guard, not a page budget.
const SAME_SHAPE_LIMIT = 10;          // ten of one path shape, then stop that path
// Six minutes without a single new page is a stall, not a big site. Ends the
// crawl and keeps everything already gathered (Russ, 2026-09-03).
const STALL_AFTER_MS = 360000;
const WHOLE_SITE_PAGE_CEILING = 500;  // no site is infinite; this is what stops a huge one now

// A SITE THAT HAS STOPPED SAYING ANYTHING NEW (Russ, 2026-09-03).
//
// Prineville Insurance served 473 pages in fifteen minutes. They were not
// pages: they were the same page with a town swapped into it —
// best-independent-insurance-agents-bend-oregon, -redmond-oregon,
// -madras-oregon — and then the same again for every trade. The ten-of-one-
// shape stop never saw it, because every one of them sits at the top level
// under a different name, so each counts as its own shape.
//
// The stop is therefore on WHAT A PAGE SAYS, not on what it is called. Every
// page's words are compared against every word read so far on this site. A
// page that is almost entirely words we already have has told us nothing new.
// A run of those means the site has stopped giving, and the crawl ends —
// partial, everything kept, and the reason recorded.
//
// Checked against the pages already on file before it was written: it would
// have stopped Prineville at 25 pages instead of 473 and Greenbar at 131 of
// 222, and would not have touched Lar-Moon (41), Central Oregon Radiology
// (21), Rockpoint (16), York Bros (8), Beyond Real Estate (18), Crooked Tails
// (10) or Interface Engineering (11) at all — their longest dull run was two.
const JUDGE_NEWNESS_AFTER = 15;   // a small site is never judged: it has no tail to cut
const NEW_WORDS_FLOOR = 0.05;     // under 5% words we have never seen = nothing new
const NOTHING_NEW_RUN = 10;       // ten such pages in a row and the site has stopped giving

/// The words a page actually contributes, lowercased, four letters or more.
/// Short words are dropped because every page has them and they say nothing
/// about whether this page is different from the last one.
function wordsOf(text) {
  return new Set(String(text || '').toLowerCase().match(/[a-z]{4,}/g) || []);
}

/// What share of this page's words we have never read on this site before.
/// 1 = entirely new, 0 = every word already seen. An empty page returns null:
/// it is not evidence either way and must never count towards a dull run.
function shareOfWordsNotSeen(text, seen) {
  const w = wordsOf(text);
  if (!w.size) return null;
  let fresh = 0;
  for (const word of w) if (!seen.has(word)) fresh += 1;
  return fresh / w.size;
}

// THE FRONT DOOR, NOT THE ADVERTISING SIDE ENTRANCE (Russ, 2026-09-03).
//
// 109 businesses' web addresses on file carry advertising tracking on the end
// — Severson Electric's is seversonelectric.com/?utm_source=google&utm_medium=
// local&utm_campaign=gbp_bend, copied off a Google listing. Opened, that
// address bounces, and both Seversons came back holding not one word while
// their sites are perfectly readable.
//
// So a business's address is cleaned before it is opened. Only tags that are
// known to be advertising tracking are removed — anything a site might
// actually need to show the right page is left exactly as it was.
const TRACKING_TAGS = [
  /^utm_/,           // Google's campaign tags: utm_source, utm_medium, utm_campaign, ...
  /^gclid$/, /^dclid$/, /^wbraid$/, /^gbraid$/,   // Google click identifiers
  /^fbclid$/, /^igshid$/,                          // Facebook and Instagram
  /^msclkid$/, /^ttclid$/, /^twclid$/, /^li_fat_id$/,
  /^mc_(cid|eid)$/,  // Mailchimp
  /^_hs(enc|mi)$/,   // HubSpot
  /^yclid$/, /^vero_(id|conv)$/, /^_ga$/, /^_gl$/,
];

/// A business's own address with advertising tracking taken off it. Anything
/// that is not recognisably tracking is left alone, and an address we cannot
/// read at all is handed back untouched rather than guessed at.
function frontDoor(website) {
  const raw = String(website || '').trim();
  if (!raw) return raw;
  let u;
  try { u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); } catch { return raw; }
  let removed = 0;
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_TAGS.some((tag) => tag.test(key))) { u.searchParams.delete(key); removed += 1; }
  }
  if (!removed) return raw;
  let out = u.toString();
  if (![...u.searchParams.keys()].length) out = out.replace(/\?$/, '');
  return out;
}

// One key per SHAPE of address, so /products/red-widget and /products/blue-widget
// count against the same stop while /about and /contact stay distinct. The rule:
// a single-segment path IS its own shape; a deeper path is its first segment
// plus how deep it goes, with everything below the first segment wildcarded.
function pathShape(pathname) {
  const segs = String(pathname || '').split('/').filter(Boolean);
  if (!segs.length) return '/';
  if (segs.length === 1) return `/${segs[0].toLowerCase()}`;
  return `/${segs[0].toLowerCase()}/${segs.slice(1).map(() => '*').join('/')}`;
}

// The date an address carries, where it carries one — /blog/2024/01/first-post.
const ONE_YEAR_MS = 366 * 24 * 3600 * 1000;
function dateInPath(pathname) {
  const m = String(pathname || '').match(/(?:^|\/)((?:19|20)\d{2})(?:[/-](\d{1,2}))?(?:[/-](\d{1,2}))?(?:[/-]|$)/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 6;
  if (month < 1 || month > 12) return null;
  const day = m[3] ? Math.min(Math.max(Number(m[3]), 1), 28) : 15;
  const when = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(when.getTime()) ? null : when;
}

function titleOf(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  if (!m) return null;
  const t = textOf(m[1]).slice(0, 200).trim();
  return t || null;
}

// The pages fetched and stored but NOT handed to the model, each named by the
// rule that caught it — so a reader can always see why a page went unread.
// Order matters only where two rules could both catch a page; the first name
// wins and both behaviours are the same: fetched, kept, not read.
const SKIP_RULES = [
  { rule: 'logged-in-area', catches: (u) => /(^|\/)(login|log-in|logout|signin|sign-in|signup|sign-up|register|my-?account|account|portal|dashboard|wp-admin|wp-login[^/]*|password|client-area|customer-area|members?-only)([/.]|$)/i.test(u.pathname) },
  { rule: 'cart-or-checkout', catches: (u) => /(^|\/)(cart|checkout|basket|bag|payment|pay-now|order-confirmation)([/.]|$)/i.test(u.pathname) },
  { rule: 'search-results', catches: (u) => /(^|\/)search([/.]|$)/i.test(u.pathname) || /(^|&)(s|q|query|search)=/i.test(u.search.replace(/^\?/, '')) },
  { rule: 'calendar', catches: (u) => /(^|\/)(calendar|calendars|ical|events?\.ics)([/.]|$)/i.test(u.pathname) || /(^|&)(month|week|day)=/i.test(u.search.replace(/^\?/, '')) },
  { rule: 'legal-boilerplate', catches: (u) => /(^|\/)(privacy(-policy)?|terms(-of-(use|service|sale))?|terms-and-conditions|conditions|disclaimer|cookies?(-policy)?|accessibility(-statement)?|legal|gdpr|ccpa|sitemap(\.xml)?)([/.]|$)/i.test(u.pathname) },
  { rule: 'other-language', catches: (u) => /^\/(es|fr|de|it|pt|pt-br|ru|zh|zh-cn|zh-tw|ja|ko|nl|pl|sv|no|da|fi|vi|ar|he|tr)(\/|$)/i.test(u.pathname) || /(^|&)(lang|locale|language)=/i.test(u.search.replace(/^\?/, '')) },
  { rule: 'post-index', catches: (u) => /\/page\/\d+(\/|$)/i.test(u.pathname) || /(^|&)paged?=\d+/i.test(u.search.replace(/^\?/, '')) || /(^|\/)(category|categories|tag|tags|archives?|author)(\/|$)/i.test(u.pathname) },
  { rule: 'individual-product', catches: (u) => /(^|\/)(product|products|shop|store|item|items|catalog|inventory|equipment|rentals?)\/[^/]+/i.test(u.pathname) && !/\/page\/\d+/i.test(u.pathname) },
  { rule: 'old-post', catches: (u) => { const d = dateInPath(u.pathname); return Boolean(d && Date.now() - d.getTime() > ONE_YEAR_MS); } },
];

function whySkip(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  for (const s of SKIP_RULES) if (s.catches(u)) return s.rule;
  return null;
}

// Pages whose links lead nowhere worth going: a calendar spiders into every
// month that ever was, search into every query, a login wall into itself.
// A post INDEX is deliberately not here — its links are the posts.
const FOLLOW_NOTHING_BELOW = new Set(['calendar', 'search-results', 'logged-in-area', 'cart-or-checkout']);

// Crawl one business's whole site.
//
// Returns { pages, failures, partial, stoppedShapes, error }:
//   pages         [{ url, status, html, text, title, shape, skipFromReading, skippedBy }]
//                 — every fetched page, skipped ones included, none without text
//   failures      [{ url, status }] — addresses that would not open
//   partial       true when the two-minute limit stopped the crawl early;
//                 what was gathered is returned, never discarded
//   stoppedShapes the path shapes the ten-page stop closed, so a reader can
//                 see what was deliberately not exhausted
async function crawlWholeSite(website, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const delay = options.delayMs === undefined ? DELAY_BETWEEN_PAGES_MS : options.delayMs;
  // The limit can be brought DOWN (tests do), never raised past two minutes.
  const timeLimit = Math.min(options.timeLimitMs || CRAWL_TIME_LIMIT_MS, CRAWL_TIME_LIMIT_MS);
  const startedAt = Date.now();

  const given = absoluteUrl(website && website.startsWith('http') ? website : `https://${website}`, 'https://x/');
  if (!given) return { pages: [], failures: [], partial: false, stoppedShapes: [], error: 'unreadable web address' };
  let start = given;
  let host;
  try {
    const u = new URL(given);
    host = u.host;
    if (u.pathname && u.pathname !== '/') start = u.origin + '/';
  } catch { /* keep what we were given */ }

  const pages = [];
  const failures = [];
  const opened = new Set();          // pathnames already fetched or refused
  const queued = new Set();          // pathnames already in the queue
  const shapeCounts = new Map();     // shape -> pages fetched of that shape
  const stoppedShapes = new Set();
  let partial = false;
  let stalled = false;
  let lastPageAt = Date.now();
  const wordsSeen = new Set();      // every word this site has said so far
  let dullRun = 0;                  // pages in a row that said nothing new
  let saidNothingNew = false;

  // The queue holds { url, exempt } — exempt means this address came from
  // linksBelow() on a real team page, and the ten-same-shape stop does not
  // apply to it: the eleventh staff profile is still fetched.
  const queue = [{ url: start, exempt: false }];
  queued.add(new URL(start).pathname);
  if (given !== start) {
    try {
      const p = new URL(given).pathname;
      if (!queued.has(p)) { queue.push({ url: given, exempt: false }); queued.add(p); }
    } catch { /* the homepage alone is enough */ }
  }

  while (queue.length && pages.length < WHOLE_SITE_PAGE_CEILING) {
    if (Date.now() - startedAt > timeLimit) { partial = true; break; }
    // A STALL IS NOT THE SAME AS A LONG SITE (Russ, 2026-09-03: "watch for
    // stalls"). With fifteen minutes to play with, a site that answers but
    // gives nothing back could sit there the whole time and look busy. Six
    // minutes with no new page is a stall, and it ends the crawl as partial
    // with everything gathered so far kept.
    if (pages.length && Date.now() - lastPageAt > (options.stallAfterMs || STALL_AFTER_MS)) {
      partial = true;
      stalled = true;
      break;
    }
    const { url, exempt } = queue.shift();
    let u;
    try { u = new URL(url); } catch { continue; }
    const path = u.pathname;
    if (opened.has(path)) continue;
    const shape = pathShape(path);
    if (!exempt && (shapeCounts.get(shape) || 0) >= SAME_SHAPE_LIMIT) {
      // Ten of this shape are already in hand. The stop is RECORDED, so what
      // was deliberately left unfetched is readable later.
      stoppedShapes.add(shape);
      continue;
    }
    opened.add(path);
    if (delay && pages.length) await sleep(delay);

    let html;
    try { html = await fetchPage(url, fetchImpl); } catch (e) {
      failures.push({ url, status: `failed: ${e.message}` });
      continue;
    }
    shapeCounts.set(shape, (shapeCounts.get(shape) || 0) + 1);

    const skippedBy = whySkip(url);
    pages.push({
      url,
      status: 'fetched',
      html,
      // The readable words, ALWAYS — a skipped page's text is kept exactly like
      // a read page's, so a wrong skip costs nothing but a re-run of a prompt.
      text: readableText(html),
      title: titleOf(html),
      shape,
      skipFromReading: Boolean(skippedBy),
      skippedBy: skippedBy || null,
    });
    lastPageAt = Date.now();   // a page landed; the stall clock starts again

    // HAS THIS PAGE SAID ANYTHING WE DID NOT ALREADY HAVE? An empty page is
    // not evidence either way and never counts towards the run.
    const justRead = pages[pages.length - 1].text;
    const shareNew = shareOfWordsNotSeen(justRead, wordsSeen);
    if (shareNew !== null) {
      for (const w of wordsOf(justRead)) wordsSeen.add(w);
      const bigEnoughToJudge = pages.length > (options.judgeNewnessAfter ?? JUDGE_NEWNESS_AFTER);
      if (bigEnoughToJudge && shareNew < (options.newWordsFloor ?? NEW_WORDS_FLOOR)) {
        dullRun += 1;
        if (dullRun >= (options.nothingNewRun ?? NOTHING_NEW_RUN)) {
          partial = true;
          saidNothingNew = true;
          break;
        }
      } else {
        dullRun = 0;
      }
    }

    if (skippedBy && FOLLOW_NOTHING_BELOW.has(skippedBy)) continue;

    // What this page links to. Everything same-host goes in the queue —
    // including addresses no WORTH_OPENING pattern recognises — best-ranked
    // first so a crawl the clock cuts short spent its time well.
    const pageDate = skippedBy === 'old-post' ? dateInPath(path) : null;
    const isTeam = looksLikeATeamPage(url);
    const below = new Set();
    if (isTeam) {
      try { for (const b of linksBelow(html, url)) below.add(new URL(b).pathname); } catch { /* none */ }
    }
    let found = [];
    try { found = linksToPeople(html, url); } catch { found = []; }
    for (const link of found) {
      let lu;
      try { lu = new URL(link); } catch { continue; }
      if (lu.host !== host) continue;
      if (opened.has(lu.pathname) || queued.has(lu.pathname)) continue;
      // BELOW AN OLD POST, NO OLDER POST. One dated page past the one-year
      // limit is fetched and kept; the archive spiral beneath it is not.
      if (pageDate) {
        const linkDate = dateInPath(lu.pathname);
        if (linkDate && linkDate.getTime() < pageDate.getTime()) continue;
      }
      queued.add(lu.pathname);
      queue.push({ url: link, exempt: isTeam && below.has(lu.pathname) });
    }
  }

  if (queue.length && Date.now() - startedAt > timeLimit) partial = true;

  return { pages, failures, partial, stalled, saidNothingNew, stoppedShapes: [...stoppedShapes], error: pages.length ? null : 'no page could be opened' };
}

function peopleFromSite(pages) {
  const all = new Map();
  for (const page of pages) {
    const taken = new Set();
    for (const person of [...personOnTheirOwnPage(page), ...peopleOnPage(page, taken), ...rosterRun(page, taken)]) {
      const key = person.name.toLowerCase();
      const prior = all.get(key);
      if (!prior) { all.set(key, person); continue; }
      all.set(key, {
        ...prior,
        role: prior.role || person.role,
        email: prior.email || person.email,
        phone: prior.phone || person.phone,
        linkedIn: prior.linkedIn || person.linkedIn,
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
  MAX_PAGES_WITH_A_TEAM_PAGE, linksBelow, looksLikeATeamPage,
  MAX_PAGES_PER_SITE, PAGE_TIMEOUT_MS, DELAY_BETWEEN_PAGES_MS,
  WORTH_OPENING, rank, linksToPeople, fetchPeoplePages,
  peopleOnPage, peopleFromSite, personOnTheirOwnPage, rosterRun, stripCredentials, teamSizeFrom, looksLikeAPerson, ROLE_WORDS,
  linkedInProfilesOn, profileNear, roleFromLine,
  // the whole-site crawl (2026-09-01)
  crawlWholeSite, pathShape, dateInPath, whySkip, titleOf,
  SKIP_RULES, CRAWL_TIME_LIMIT_MS, SAME_SHAPE_LIMIT, WHOLE_SITE_PAGE_CEILING,
  frontDoor, shareOfWordsNotSeen, wordsOf,
  JUDGE_NEWNESS_AFTER, NEW_WORDS_FLOOR, NOTHING_NEW_RUN, STALL_AFTER_MS,
};
