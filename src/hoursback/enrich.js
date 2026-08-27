// Hours Back — reading a business's own website.
//
// Free: no accounts, no keys, no fees. We read the pages the business
// already publishes to the world and pull out the things Google could not
// tell us — who owns it, how many people work there, an email address, and
// the tells that say the office is still doing work by hand.
//
// Two halves, kept apart on purpose:
//   readSite(pages)   — pure. Given HTML already in hand, returns findings.
//                       No network, so every check runs offline.
//   fetchSite(url)    — the only half that touches the internet. Hard page
//                       ceiling, a pause between requests, a timeout each.
//
// Nothing here overwrites a value typed by hand: the machine writes the
// fetched column, corrections live in the paired ManualValue column.

// --- hard ceilings, declared once, never exceeded --------------------------
const MAX_PAGES_PER_SITE = 5;      // home page + at most four followed links
const PAGE_TIMEOUT_MS = 8000;      // a slow site is skipped, never waited on
const DELAY_BETWEEN_PAGES_MS = 1200; // polite: nobody's server notices us
const MAX_HTML_BYTES = 1500000;    // a page bigger than this is truncated

// --- status vocabulary -----------------------------------------------------
const SITE_STATUS = {
  READ: 'READ',
  NO_WEBSITE: 'NO_WEBSITE',
  UNREACHABLE: 'UNREACHABLE',
};
const HEADCOUNT_STATUS = {
  RESOLVED: 'RESOLVED',
  UNRESOLVED_NOT_PUBLISHED: 'UNRESOLVED_NOT_PUBLISHED',
  UNRESOLVED_NO_WEBSITE: 'UNRESOLVED_NO_WEBSITE',
  UNRESOLVED_SITE_UNREACHABLE: 'UNRESOLVED_SITE_UNREACHABLE',
};
const EMAIL_STATUS = {
  FOUND_ON_SITE: 'FOUND_ON_SITE',
  FOUND_LOW_CONFIDENCE: 'FOUND_LOW_CONFIDENCE',
  UNAVAILABLE_NO_WEBSITE: 'UNAVAILABLE_NO_WEBSITE',
  UNAVAILABLE_NOT_PUBLISHED: 'UNAVAILABLE_NOT_PUBLISHED',
  UNAVAILABLE_SITE_UNREACHABLE: 'UNAVAILABLE_SITE_UNREACHABLE',
};
const EMAIL_CONFIDENCE_FLOOR = 0.5;

// ---------------------------------------------------------------------------
// text handling

function textOf(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // A heading and the paragraph under it are two sentences, not one run-on
    // — without this break a heading bleeds into the first name below it.
    .replace(/<\/(p|div|h[1-6]|li|td|th|tr|section|article|header|footer|nav|ul|ol|blockquote|figcaption|label)>/gi, '. ')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .trim();
}

function quoteAround(text, index, span = 90) {
  const start = Math.max(0, index - Math.floor(span / 3));
  return text.slice(start, start + span).trim();
}

// ---------------------------------------------------------------------------
// email

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
// Addresses that belong to the website's plumbing, not to the business.
const EMAIL_JUNK_DOMAINS = [
  'example.com', 'example.org', 'sentry.io', 'wixpress.com', 'sentry-next.wixpress.com',
  'squarespace.com', 'godaddy.com', 'schema.org', 'w3.org', 'gstatic.com', 'domain.com',
  'yourdomain.com', 'email.com', 'sentry.wixpress.com',
];
const EMAIL_JUNK_LOCAL = ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'postmaster', 'mailer-daemon'];
// A shared inbox is a real address but not a person; a named one is better.
const GENERIC_LOCAL = ['info', 'contact', 'office', 'hello', 'admin', 'sales', 'support', 'frontdesk', 'reception'];

function isUsableEmail(addr) {
  const a = addr.toLowerCase();
  if (/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(a)) return false;
  if (/@\d+x\./.test(a)) return false;
  if (a.includes('%')) return false;   // an encoding artefact, not an address
  const [local, domain] = a.split('@');
  if (!local || !domain) return false;
  if (EMAIL_JUNK_LOCAL.some((j) => local.startsWith(j))) return false;
  if (EMAIL_JUNK_DOMAINS.includes(domain)) return false;
  return true;
}

// Confidence: an address on the business's own domain is worth more than a
// stray gmail; a named inbox is worth more than a shared one.
function emailConfidence(addr, siteDomain) {
  const [local, domain] = addr.toLowerCase().split('@');
  let c = 0.4;
  if (siteDomain && domain.endsWith(siteDomain.replace(/^www\./, ''))) c += 0.4;
  if (!GENERIC_LOCAL.includes(local)) c += 0.2;
  return Math.min(1, Number(c.toFixed(2)));
}

// A link written with a stray % is not decodable. Take it as it stands
// rather than throwing — one malformed link is not worth an exception.
function safeDecode(v) {
  try { return decodeURIComponent(v); } catch { return v; }
}

function emailsFromPages(pages, siteDomain) {
  const seen = new Map();
  for (const page of pages) {
    const html = String(page.html || '');
    const found = [];
    for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.push(safeDecode(m[1]));
    for (const m of textOf(html).matchAll(EMAIL_RE)) found.push(m[0]);
    for (const raw of found) {
      const addr = raw.trim().replace(/[.,;]$/, '');
      if (!isUsableEmail(addr)) continue;
      const key = addr.toLowerCase();
      if (!seen.has(key)) seen.set(key, { email: key, confidence: emailConfidence(key, siteDomain), url: page.url });
    }
  }
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// headcount

// Every pattern below reads a published sentence, never a guess. A pattern
// with two capture groups is a range.
const HEADCOUNT_PATTERNS = [
  { re: /(\d{1,3})\s*(?:to|[–—-])\s*(\d{1,4})\s*(?:full[- ]time\s+)?(?:employees|staff|team members|people)/i, range: true },
  { re: /(?:team|staff|crew|family)\s+of\s+(?:over|more than|about|nearly|almost|around)?\s*(\d{1,4})/i },
  { re: /(\d{1,4})\s*\+?\s*(?:full[- ]time\s+)?(?:employees|staff members|team members|technicians|professionals|associates)\b/i },
  { re: /employs?\s+(?:over|more than|about|nearly|around)?\s*(\d{1,4})/i },
  { re: /(?:we are|we're)\s+(?:a\s+)?(?:team\s+of\s+)?(\d{1,4})\s+(?:strong|people|employees)/i },
];

function headcountFromPages(pages) {
  for (const page of pages) {
    const text = textOf(page.html);
    for (const pattern of HEADCOUNT_PATTERNS) {
      const m = text.match(pattern.re);
      if (!m) continue;
      const low = Number(m[1]);
      const high = pattern.range ? Number(m[2]) : null;
      if (!Number.isFinite(low) || low < 1 || low > 100000) continue;
      return {
        // A range is resolved at its low end, so the band — and the hours we
        // promise — is never over-stated.
        employeeCount: low,
        publishedAs: high ? `${low}-${high}` : String(low),
        isRange: Boolean(high),
        sourceUrl: page.url,
        quote: quoteAround(text, m.index),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// owner / named contact

const OWNER_TITLES = 'Owner|Founder|Co-Founder|Co-owner|President|Principal|Managing Partner|CEO';
const NAME = "[A-Z][a-z]+(?:\\s+[A-Z][a-z'’.-]+){1,2}";
const OWNER_PATTERNS = [
  new RegExp(`(${NAME})\\s*[,—-]\\s*(?:${OWNER_TITLES})\\b`),
  new RegExp(`(?:${OWNER_TITLES})\\s*[:,—-]\\s*(${NAME})`),
  new RegExp(`(?:founded|started|owned|opened)\\s+by\\s+(${NAME})`, 'i'),
];
const NAME_NOISE = /^(The|Our|Your|We|This|About|Contact|Home|Meet|Team|Privacy|Terms)\b/;

function ownerFromPages(pages) {
  for (const page of pages) {
    const text = textOf(page.html);
    for (const re of OWNER_PATTERNS) {
      const m = text.match(re);
      if (!m) continue;
      const name = m[1].trim();
      if (NAME_NOISE.test(name)) continue;
      return { ownerName: name, sourceUrl: page.url, quote: quoteAround(text, m.index) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// what they say they do
//
// A business name only goes so far. "Git R Dumped" and "OlsenDaines" tell you
// nothing; their own front page tells you everything. This keeps the one line
// they wrote about themselves, in their words, which is both the best way to
// sort them and the best raw material for a message that sounds like somebody
// actually looked.

function selfDescription(pages) {
  const home = pages[0];
  if (!home) return null;
  const html = String(home.html);
  const pick = (re) => { const m = html.match(re); return m ? textOf(m[1]).trim() : null; };
  const candidates = [
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,300})["']/i),
    pick(/<meta[^>]+content=["']([^"']{20,300})["'][^>]+name=["']description["']/i),
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,300})["']/i),
    pick(/<h1[^>]*>([\s\S]{10,200}?)<\/h1>/i),
    pick(/<title[^>]*>([\s\S]{10,160}?)<\/title>/i),
  ].filter(Boolean);
  for (const c of candidates) {
    // A page title that is only the business name says nothing new.
    if (c.split(/\s+/).length < 4) continue;
    if (/^(home|welcome|index)$/i.test(c)) continue;
    return c.replace(/\s+/g, ' ').slice(0, 280);
  }
  return candidates[0] || null;
}

// The words on their site that say what kind of business this is. Used only
// when the name alone could not tell us.
function tradeWordsFrom(pages) {
  const text = pages.slice(0, 2).map((p) => textOf(p.html)).join(' ').slice(0, 6000);
  return text;
}

// ---------------------------------------------------------------------------
// the people
//
// A business is not one address. A team page usually names the owner, the
// office manager and whoever answers the phone, and those are three different
// conversations. Everything found is kept; Russ decides who to write to.

const ROLE_WORDS = [
  'Owner', 'Co-Owner', 'Founder', 'Co-Founder', 'President', 'Vice President', 'Principal',
  'Partner', 'Managing Partner', 'CEO', 'CFO', 'COO', 'General Manager', 'Office Manager',
  'Operations Manager', 'Office Administrator', 'Practice Manager', 'Practice Administrator',
  'Service Manager', 'Project Manager', 'Account Manager', 'Sales Manager', 'Branch Manager',
  'Controller', 'Bookkeeper', 'Receptionist', 'Front Desk', 'Scheduler', 'Dispatcher',
  'Estimator', 'Superintendent', 'Attorney', 'Associate Attorney', 'Paralegal', 'Agent',
  'Broker', 'Realtor', 'Property Manager', 'Veterinarian', 'Hygienist', 'Technician',
  'Administrator', 'Director', 'Manager',
];
const ROLE_RE = new RegExp(`\\b(${ROLE_WORDS.map((r) => r.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');
const PERSON = "[A-Z][a-z]+(?:\\s+[A-Z][a-z'’.-]+){1,2}";
// "Dale Hutchins, Owner" and "Owner: Dale Hutchins" and "Dale Hutchins. Office Manager."
const PERSON_ROLE = [
  new RegExp(`(${PERSON})\\s*[,.]\\s*(${ROLE_WORDS.map((r) => r.replace(/ /g, '\\s+')).join('|')})\\b`, 'g'),
  new RegExp(`(${ROLE_WORDS.map((r) => r.replace(/ /g, '\\s+')).join('|')})\\s*[:,]\\s*(${PERSON})`, 'gi'),
];
const NOT_A_PERSON_NAME = /^(The|Our|Your|We|This|About|Contact|Home|Meet|Team|Privacy|Terms|Read|More|New|Get|Call|Learn|View|Book|Click|All|Free|Site|Web|Page|Main|Office|Front|Service|Customer|Business|Company|Search|Menu|Skip)\b/;

// Everyone the site names, with their role where it gives one.
function peopleFromPages(pages) {
  const found = new Map();
  for (const page of pages) {
    const text = textOf(page.html);
    for (const [i, re] of PERSON_ROLE.entries()) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const name = (i === 0 ? m[1] : m[2]).trim();
        const role = (i === 0 ? m[2] : m[1]).trim();
        if (NOT_A_PERSON_NAME.test(name)) continue;
        if (name.split(/\s+/).length > 3) continue;
        const key = name.toLowerCase();
        if (!found.has(key)) found.set(key, { name, role, foundOn: page.url });
      }
    }
  }
  return [...found.values()].slice(0, 12);   // a team page, not a phone book
}

// The business's own LinkedIn page, and any personal ones it links to.
function linkedInFromPages(pages) {
  let company = null;
  const people = new Set();
  for (const page of pages) {
    for (const m of String(page.html).matchAll(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|in)\/([A-Za-z0-9._%-]+)/gi)) {
      const url = `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}`;
      if (m[1].toLowerCase() === 'company') { if (!company) company = url; }
      else people.add(url);
    }
  }
  return { company, people: [...people].slice(0, 12) };
}

// Match an address to a person by their name, so sara@ lands on Sara.
function pairEmailsToPeople(emails, people) {
  const { nameFromEmail } = require('./crm/names.js');
  const out = [];
  const takenEmails = new Set();
  for (const person of people) {
    const first = person.name.split(/\s+/)[0].toLowerCase();
    const last = (person.name.split(/\s+/).slice(-1)[0] || '').toLowerCase();
    const hit = emails.find((e) => {
      if (takenEmails.has(e.email)) return false;
      const local = e.email.split('@')[0].toLowerCase();
      return local === first || local.startsWith(`${first}.`) || local.startsWith(`${first}${last[0] || ''}`)
        || local === `${first[0]}${last}`;
    });
    if (hit) takenEmails.add(hit.email);
    out.push({ ...person, email: hit ? hit.email : null, emailConfidence: hit ? hit.confidence : null });
  }
  // Addresses nobody claimed still belong to somebody, named or not.
  for (const e of emails) {
    if (takenEmails.has(e.email)) continue;
    out.push({ name: nameFromEmail(e.email), role: null, email: e.email, emailConfidence: e.confidence, foundOn: e.url });
  }
  return out;
}

// ---------------------------------------------------------------------------
// the rest of what a website gives away
//
// All of this was sitting in pages already downloaded and never read. Years in
// business writes an opener on its own. The software they run says exactly
// what is missing. A team page with twelve faces on it is a team of twelve,
// which sets the price. Three open office roles is a very different call from
// one.

const YEARS_RE = [
  /\b(?:since|established|est\.?|serving [A-Za-z ]{3,30} since|founded in|in business since)\s*(19[5-9]\d|20[0-2]\d)\b/i,
  /\b(?:for )?(?:over|more than|nearly)\s*(\d{2})\s*years\b/i,
  /\b(\d{2})\+?\s*years (?:of experience|in business|serving)/i,
];

// What they are already paying for. Each one says what is missing beside it.
const TOOLS = {
  QuickBooks: /quickbooks|\bQBO\b/i, Xero: /\bxero\b/i,
  ServiceTitan: /servicetitan/i, 'Housecall Pro': /housecall ?pro/i, Jobber: /\bjobber\b/i,
  Procore: /procore/i, Buildertrend: /buildertrend/i, CoConstruct: /coconstruct/i,
  Dentrix: /dentrix/i, 'Open Dental': /open ?dental/i, Eaglesoft: /eaglesoft/i,
  Clio: /\bclio\b/i, MyCase: /mycase/i, Salesforce: /salesforce/i, HubSpot: /hubspot/i,
  Mindbody: /mindbody/i, Vagaro: /vagaro/i, Calendly: /calendly/i, Acuity: /acuityscheduling/i,
  Square: /squareup|\bsquare pos\b/i, Toast: /toasttab/i, Shopify: /shopify/i,
  Mailchimp: /mailchimp/i, Constant_Contact: /constantcontact/i,
  AppFolio: /appfolio/i, Buildium: /buildium/i, 'Rent Manager': /rentmanager/i,
};

// A team page names people in a repeating block. Counting the blocks is a
// better team size than anything most businesses publish about themselves.
function teamCountFrom(pages) {
  let best = 0;
  for (const page of pages) {
    if (!/team|staff|about|our[- ]people|meet/i.test(page.url)) continue;
    const html = String(page.html);
    // Count the repeating shapes a team page uses, and take the largest.
    const shapes = [
      (html.match(/<img[^>]+(?:alt|title)=["'][^"']{4,40}["'][^>]*>/gi) || []).length,
      (html.match(/class=["'][^"']*(?:team-member|staff-member|person|bio-card|member)[^"']*["']/gi) || []).length,
      (html.match(/<h[3-5][^>]*>\s*[A-Z][a-z]+\s+[A-Z][a-z]/g) || []).length,
    ];
    best = Math.max(best, ...shapes);
  }
  // Two is a coincidence, sixty is a photo gallery.
  return best >= 3 && best <= 60 ? best : null;
}

function yearsInBusinessFrom(pages) {
  const thisYear = new Date().getFullYear();
  for (const page of pages) {
    const text = textOf(page.html);
    for (const re of YEARS_RE) {
      const m = text.match(re);
      if (!m) continue;
      const n = Number(m[1]);
      const years = n > 1900 ? thisYear - n : n;
      if (years >= 3 && years <= 120) return { years, since: n > 1900 ? n : null, quote: quoteAround(text, m.index) };
    }
  }
  return null;
}

function toolsFrom(pages) {
  const all = pages.map((p) => `${p.html}`).join(' ').slice(0, 400000);
  return Object.entries(TOOLS).filter(([, re]) => re.test(all)).map(([name]) => name.replace(/_/g, ' ')).slice(0, 6);
}

// How many office roles they are advertising, not just whether they are.
function openRolesFrom(pages) {
  let n = 0;
  for (const page of pages) {
    if (!/career|job|employ|hiring|join/i.test(page.url)) continue;
    const text = textOf(page.html);
    n = Math.max(n, (text.match(HIRING_ROLE_RE) || []).length);
  }
  return n || null;
}

// ---------------------------------------------------------------------------
// the manual-work tells
//
// Each entry says how to spot it. `absence: true` means the signal fires when
// the thing is NOT there — no way to book online is itself the tell.

const BOOKING_HINTS = [
  /\bbook (?:now|online|an appointment|your)\b/i,
  /\bschedule (?:online|an appointment|now|a visit)\b/i,
  /\brequest an appointment\b/i,
  /\bonline (?:booking|scheduling)\b/i,
  /(calendly|acuityscheduling|squareup\.com\/appointments|booksy|schedulicity|vagaro|setmore|janeapp|mindbodyonline|housecallpro\.com\/book)/i,
];
const PORTAL_HINTS = [
  /\b(?:client|customer|patient|member|owner|tenant) (?:portal|login|log in|sign in)\b/i,
  /\bmy account\b/i,
  /href=["'][^"']*\/(?:portal|client-login|customer-login|patient-portal|my-account)/i,
];
const FORM_LINK_RE = /<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
const FORM_WORDS = /(form|application|intake|new patient|new client|packet|waiver|registration|checklist|questionnaire|credit app)/i;
const FAX_RE = /\bfax\b[\s:.#]*(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i;
const HIRING_ROLE_RE = /\b(receptionist|administrative assistant|admin assistant|office manager|front desk|scheduler|dispatcher|data entry|billing clerk|office assistant|customer service representative)\b/gi;
// A page that NAMES an office role is usually just listing the person who
// already holds it. The tell is a role sitting next to posting language —
// close enough to be the same sentence, not the same website.
const HIRING_POSTING_RE = /(now hiring|we(?:'re| are) hiring|hiring for|job opportunit|job opening|open position|position(?:s)? available|currently seeking|we are seeking|we are looking for|apply (?:now|today|online|here)|send (?:us )?your resume|submit your resume|email your resume|employment opportunit|careers? page|full[- ]time position|part[- ]time position)/i;
// ...and not next to the language of a staff page.
const STAFF_BIO_RE = /(read bio|read more about|licen[cs]e ?#|joined (?:the|our|us|[A-Z])|holds an? |graduated|has been with|years of experience|is a talented|earned (?:a|an|her|his)|team member (?:since|bio))/i;
const NEAR = 220;

function signalsFromPages(pages) {
  const found = [];
  const all = pages.map((p) => ({ url: p.url, html: String(p.html || ''), text: textOf(p.html) }));
  const anyMatch = (hints) => {
    for (const page of all) {
      for (const re of hints) {
        const m = page.html.match(re) || page.text.match(re);
        if (m) return { url: page.url, quote: quoteAround(page.text, page.text.search(re) >= 0 ? page.text.search(re) : 0) };
      }
    }
    return null;
  };

  // A live posting for an office role — the strongest tell there is, because
  // it is someone about to be paid to do what software could do. Every role
  // mention is checked against the words around it: posting language nearby
  // and no staff-page language, or it does not count.
  outer:
  for (const page of all) {
    for (const role of page.text.matchAll(HIRING_ROLE_RE)) {
      const window = page.text.slice(Math.max(0, role.index - NEAR), role.index + NEAR);
      if (!HIRING_POSTING_RE.test(window)) continue;
      if (STAFF_BIO_RE.test(window)) continue;
      found.push({ signal: 'hiring_admin_role', url: page.url, quote: quoteAround(page.text, role.index, 140) });
      break outer;
    }
  }

  if (!anyMatch(BOOKING_HINTS)) {
    found.push({ signal: 'no_online_booking', url: all[0] ? all[0].url : null, quote: 'no way to book or schedule online anywhere on the site' });
  }
  if (!anyMatch(PORTAL_HINTS)) {
    found.push({ signal: 'no_customer_portal', url: all[0] ? all[0].url : null, quote: 'no customer or client login anywhere on the site' });
  }

  for (const page of all) {
    let hit = null;
    for (const m of page.html.matchAll(FORM_LINK_RE)) {
      const label = textOf(m[2]);
      if (FORM_WORDS.test(label) || FORM_WORDS.test(m[1])) { hit = { href: m[1], label }; break; }
    }
    if (hit) {
      found.push({ signal: 'downloadable_forms', url: page.url, quote: `${hit.label || 'PDF'} — ${hit.href}` });
      break;
    }
  }

  for (const page of all) {
    const m = page.text.match(FAX_RE);
    if (m) { found.push({ signal: 'fax_listed', url: page.url, quote: m[0] }); break; }
  }

  return found;
}

// ---------------------------------------------------------------------------
// the whole read, from pages already in hand — pure, offline, repeatable

function readSite(pages, options = {}) {
  const list = (pages || []).filter((p) => p && p.html);
  const siteDomain = options.domain || null;
  if (!list.length) {
    return {
      status: SITE_STATUS.UNREACHABLE,
      emails: [], email: null, emailConfidence: null, emailStatus: EMAIL_STATUS.UNAVAILABLE_SITE_UNREACHABLE,
      employeeCount: null, headcountStatus: HEADCOUNT_STATUS.UNRESOLVED_SITE_UNREACHABLE,
      headcountSourceUrl: null, headcountPublishedAs: null,
      ownerName: null, signals: [], pagesRead: 0, people: [], linkedIn: { company: null, people: [] },
    };
  }
  const emails = emailsFromPages(list, siteDomain);
  const head = headcountFromPages(list);
  const owner = ownerFromPages(list);
  const best = emails[0] || null;
  return {
    status: SITE_STATUS.READ,
    emails,
    email: best ? best.email : null,
    emailConfidence: best ? best.confidence : null,
    emailStatus: !best
      ? EMAIL_STATUS.UNAVAILABLE_NOT_PUBLISHED
      : (best.confidence < EMAIL_CONFIDENCE_FLOOR ? EMAIL_STATUS.FOUND_LOW_CONFIDENCE : EMAIL_STATUS.FOUND_ON_SITE),
    employeeCount: head ? head.employeeCount : null,
    headcountStatus: head ? HEADCOUNT_STATUS.RESOLVED : HEADCOUNT_STATUS.UNRESOLVED_NOT_PUBLISHED,
    headcountSourceUrl: head ? head.sourceUrl : null,
    headcountPublishedAs: head ? head.publishedAs : null,
    headcountQuote: head ? head.quote : null,
    ownerName: owner ? owner.ownerName : null,
    ownerSourceUrl: owner ? owner.sourceUrl : null,
    people: pairEmailsToPeople(emails, peopleFromPages(list)),
    linkedIn: linkedInFromPages(list),
    selfDescription: selfDescription(list),
    tradeWords: tradeWordsFrom(list),
    yearsInBusiness: yearsInBusinessFrom(list),
    tools: toolsFrom(list),
    teamCount: teamCountFrom(list),
    openRoles: openRolesFrom(list),
    signals: [
      ...signalsFromPages(list),
      ...(best ? [] : [{ signal: 'no_email_published', url: list[0].url, quote: 'no email address published anywhere on the site' }]),
    ],
    pagesRead: list.length,
  };
}

// A business with no website at all: named statuses, keeps its place.
function readNoWebsite() {
  return {
    status: SITE_STATUS.NO_WEBSITE,
    emails: [], email: null, emailConfidence: null, emailStatus: EMAIL_STATUS.UNAVAILABLE_NO_WEBSITE,
    employeeCount: null, headcountStatus: HEADCOUNT_STATUS.UNRESOLVED_NO_WEBSITE,
    headcountSourceUrl: null, headcountPublishedAs: null, headcountQuote: null,
    ownerName: null, ownerSourceUrl: null, pagesRead: 0, people: [], linkedIn: { company: null, people: [] },
    signals: [{ signal: 'no_website', url: null, quote: 'no website anywhere — every enquiry they get has to be a phone call' }],
  };
}

// ---------------------------------------------------------------------------
// the only half that touches the internet

const FOLLOW_WORDS = /(about|our[- ]?team|team|staff|contact|careers|jobs|employment|our[- ]?story|who[- ]we[- ]are|meet)/i;

function absoluteUrl(href, base) {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function linksWorthFollowing(html, baseUrl) {
  let base;
  try { base = new URL(baseUrl); } catch { return []; }
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const label = textOf(m[2]);
    if (!FOLLOW_WORDS.test(m[1]) && !FOLLOW_WORDS.test(label)) continue;
    const abs = absoluteUrl(m[1], baseUrl);
    if (!abs) continue;
    const u = new URL(abs);
    if (u.host !== base.host) continue;          // never wander off the site
    if (!/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?)$/i.test(u.pathname)) continue;
    const key = u.origin + u.pathname;
    if (key === base.origin + base.pathname || seen.has(key)) continue;
    seen.add(key);
    out.push(u.toString());
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url, fetchImpl) {
  const res = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    headers: {
      // Says plainly who we are and how to ask us to stop.
      'user-agent': 'HoursBackBot/1.0 (+https://visionairy.biz; contact russ@visionairy.biz)',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '';
  if (type && !/html|text/i.test(type)) throw new Error(`not a web page (${type})`);
  const body = await res.text();
  return body.slice(0, MAX_HTML_BYTES);
}

// Fetches at most MAX_PAGES_PER_SITE pages from one site, pausing between
// each. Returns the pages; the caller does the reading.
async function fetchSite(website, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const maxPages = Math.min(options.maxPages || MAX_PAGES_PER_SITE, MAX_PAGES_PER_SITE);
  const delay = options.delayMs === undefined ? DELAY_BETWEEN_PAGES_MS : options.delayMs;
  const start = absoluteUrl(website && website.startsWith('http') ? website : `https://${website}`, 'https://x/');
  if (!start) return { pages: [], error: 'unreadable web address' };

  const pages = [];
  let home;
  try { home = await fetchPage(start, fetchImpl); } catch (e) { return { pages: [], error: e.message }; }
  pages.push({ url: start, html: home });

  let queue = [];
  try { queue = linksWorthFollowing(home, start).slice(0, maxPages - 1); } catch { queue = []; }
  for (const url of queue) {
    if (pages.length >= maxPages) break;
    if (delay) await sleep(delay);
    try { pages.push({ url, html: await fetchPage(url, fetchImpl) }); } catch { /* one bad page never sinks the read */ }
  }
  return { pages, error: null };
}

// ---------------------------------------------------------------------------
// the two named readings, per the code layout

// Headcount only — the band, the fee and the hours come from this number and
// from nothing else. Unresolved leaves all three empty with a named reason.
function enrichHeadcount(finding) {
  const { bandForEmployeeCount } = require('./rules.js');
  if (!finding || finding.employeeCount === null || finding.employeeCount === undefined) {
    return {
      employeeCount: null,
      headcountStatus: (finding && finding.headcountStatus) || HEADCOUNT_STATUS.UNRESOLVED_NOT_PUBLISHED,
      headcountSourceUrl: null,
      headcountPublishedAs: null,
      segment: null, auditFee: null, guaranteedHours: null,
    };
  }
  const band = bandForEmployeeCount(finding.employeeCount);
  return {
    employeeCount: finding.employeeCount,
    headcountStatus: HEADCOUNT_STATUS.RESOLVED,
    headcountSourceUrl: finding.headcountSourceUrl || null,
    headcountPublishedAs: finding.headcountPublishedAs || String(finding.employeeCount),
    segment: band.band, auditFee: band.auditFee, guaranteedHours: band.guaranteedHours,
  };
}

// Email only — never gates the list. Every outcome is a named status and the
// business keeps its place either way.
function enrichEmail(finding) {
  if (!finding) return { email: null, emailConfidence: null, emailStatus: EMAIL_STATUS.UNAVAILABLE_SITE_UNREACHABLE };
  return {
    email: finding.email || null,
    emailConfidence: finding.emailConfidence === undefined ? null : finding.emailConfidence,
    emailStatus: finding.emailStatus,
  };
}

// Has this business already been read? A monthly top-up must not re-read a
// business that already has both a resolved headcount and an email.
function needsSiteRead(prospect, options = {}) {
  if (!prospect) return false;
  if (prospect.doNotContact) return false;
  if (options.force) return true;
  // Read once. A site that did not publish its team size will not publish it
  // next month either, and re-reading costs the site's owner bandwidth.
  if (prospect.siteStatus) return false;
  const hasHeadcount = prospect.headcountStatus === HEADCOUNT_STATUS.RESOLVED
    || prospect.employeeCount !== null && prospect.employeeCount !== undefined;
  const hasEmail = Boolean(prospect.email);
  return !(hasHeadcount && hasEmail);
}

// ---------------------------------------------------------------------------
// writing a reading onto the record
//
// Only ever writes the fetched columns. A value typed by hand lives in its
// paired ManualValue column and is never touched here; the band is recomputed
// from the RESOLVED count, so a hand correction still wins.

async function applySiteRead(db, prospectId, finding, options = {}) {
  const { resolveField } = require('./overrides.js');
  const { scoreAutomationFit } = require('./scoring.js');
  const { bandForEmployeeCount } = require('./rules.js');
  const before = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });

  const head = enrichHeadcount(finding);
  const mail = enrichEmail(finding);
  const scored = scoreAutomationFit({ signals: finding.signals || [], category: options.category || null });

  // The score is NOT written here any more. It is a function of the whole
  // record, so it is computed below from what this reading leaves behind. It
  // used to be written here from the site tells alone, which meant reading the
  // same site twice never settled: the first pass wrote the site-only score,
  // the rescore replaced it, and the second pass saw a difference and wrote
  // again, forever.
  const data = {
    ...head,
    ...mail,
    siteStatus: finding.status,
    fieldSource: options.fieldSource || 'website',
  };
  // An owner's name is filled in only where we have none — a name learned on
  // the phone always outranks a name scraped from an About page.
  if (finding.ownerName && !before.ownerName) data.ownerName = finding.ownerName;

  // The band follows the RESOLVED headcount: a hand-typed count still wins.
  const resolvedCount = resolveField({ ...before, employeeCount: head.employeeCount }, 'employeeCount');
  if (resolvedCount !== null && resolvedCount !== undefined) {
    const band = bandForEmployeeCount(resolvedCount);
    data.segment = band.band; data.auditFee = band.auditFee; data.guaranteedHours = band.guaranteedHours;
  }

  // Their own LinkedIn page, the line they wrote about themselves, and the
  // trade their own words settle. These belong in the comparison below, not
  // after it: added afterwards, a business whose other details were unchanged
  // never got them written at all — 14 of 1,583, found 2026-08-26.
  if (finding.linkedIn && finding.linkedIn.company) data.linkedInUrl = finding.linkedIn.company;
  if (finding.selfDescription) data.selfDescription = finding.selfDescription;
  if (finding.yearsInBusiness) data.yearsInBusiness = finding.yearsInBusiness.years;
  if (finding.tools && finding.tools.length) data.toolsInUse = finding.tools.join(', ');
  if (finding.openRoles) data.openRoles = finding.openRoles;
  // A team page with twelve faces is a team of twelve — better than anything
  // most businesses publish, and it sets the price.
  if (finding.teamCount && head.employeeCount === null) {
    data.employeeCount = finding.teamCount;
    data.headcountStatus = 'RESOLVED';
    data.headcountPublishedAs = `${finding.teamCount} people named on their team page`;
    const band = bandForEmployeeCount(finding.teamCount);
    data.segment = band.band; data.auditFee = band.auditFee; data.guaranteedHours = band.guaranteedHours;
  }
  // The industry.
  //
  // This used to run the trade matcher over 3,000 characters of their page
  // text and keep the first keyword that hit. A staffing agency came out
  // "dental" because its careers page lists dental insurance; a freight
  // carrier came out "auto"; a handyman came out "insurance" off the words
  // "licensed and insured". Around half of the 236 industries decided that way
  // were wrong, and the industry now decides the whole opening line, so a
  // wrong one sends a freight company an email about filling a dental
  // schedule (Russ caught it, 2026-08-26).
  //
  // Page text is no longer allowed to decide anything. A name that clearly
  // names its own trade still counts, because that is the business telling you
  // what it is. Everything else stays unknown until a person reads it, and an
  // unknown industry gets the general opening, which is true of everybody.
  // General and true beats specific and wrong.
  if (finding.tradeWords && !before.trade) {
    const { tradeOf } = require('./crm/queues.js');
    const fromName = tradeOf(before.name);
    if (fromName !== 'other') data.trade = fromName;
  }

  // Nothing new to say? Write nothing at all, so reading twice leaves the
  // record byte-for-byte identical.
  const same = Object.entries(data).every(([k, v]) => {
    const cur = before[k];
    if (v instanceof Date || cur instanceof Date) return String(cur) === String(v);
    return cur === v;
  });
  // People are saved either way. The business's own details may be identical
  // to last time while its team page still names three people we have never
  // written down — and skipping them because nothing else moved meant almost
  // nobody was saved at all.
  await saveContacts(db, prospectId, finding);

  // The score is a function of the RECORD, not of this reading. What the site
  // said is only part of it — the team size, the owner's name, how long they
  // have been going and whether the same person runs other businesses all
  // count, and a reading that changed nothing on the page can still leave the
  // record scoring differently because a person typed something in yesterday.
  // So this runs on both paths. Putting it after the "nothing moved" return
  // would silently throw the work away, which is a mistake already made once.
  const rescore = async (record) => {
    try {
      const { rescoreOne } = require('./refresh.js');
      const moved = await rescoreOne(db, record);
      return moved === null ? record.automationScore : moved;
    } catch { return record.automationScore; }
  };

  // Both paths return the record as it stands AFTER scoring, or reading twice
  // hands back two different-looking records for the same unchanged business.
  if (same) {
    const s = await rescore({ ...before, ...data });
    const settled = await db.prospect.findUnique({ where: { id: prospectId } });
    return { changed: false, prospect: settled, score: s };
  }

  data.siteReadAt = options.now || new Date();
  data.fetchedAt = options.now || new Date();
  const after = await db.prospect.update({ where: { id: prospectId }, data });
  const s = await rescore(after);
  const settled = await db.prospect.findUnique({ where: { id: prospectId } });
  return { changed: true, prospect: settled, score: s };
}

// ---------------------------------------------------------------------------
// a whole run, bounded
//
// Stops the moment its page budget is spent and says exactly where it stopped.
// The budget is a hard ceiling in code, not a hope.

async function runSiteEnrichment(db, options = {}) {
  const budget = Number(options.budget || 100);          // sites this run may fetch
  const fetchImpl = options.fetch || globalThis.fetch;
  const delay = options.delayMs === undefined ? DELAY_BETWEEN_PAGES_MS : options.delayMs;
  const attempts = Number(options.attempts || 2);
  const lanes = Math.max(1, Math.min(Number(options.concurrency || 1), 16));
  const where = { doNotContact: false, ...(options.where || {}) };
  const candidates = await db.prospect.findMany({ where, orderBy: { createdAt: 'asc' } });

  const result = {
    budget, read: 0, skippedAlreadyRead: 0, noWebsite: 0, unreachable: 0, changed: 0,
    withEmail: 0, withHeadcount: 0, stoppedAt: null, stoppedBecause: 'list exhausted',
  };

  const needing = [];
  for (const p of candidates) {
    if (!needsSiteRead(p, options)) { result.skippedAlreadyRead += 1; continue; }
    needing.push(p);
  }
  // A business with no web address costs no fetch, so it never spends budget.
  const noSite = needing.filter((p) => !resolveSiteAddress(p));
  const withSite = needing.filter((p) => resolveSiteAddress(p));

  for (const p of noSite) {
    const r = await applySiteRead(db, p.id, readNoWebsite(), options);
    result.noWebsite += 1; if (r.changed) result.changed += 1;
  }

  const selected = withSite.slice(0, budget);
  if (withSite.length > budget) {
    result.stoppedAt = withSite[budget].name;
    result.stoppedBecause = `budget of ${budget} websites spent`;
  }

  // One business at a time per lane; a lane pauses between its own requests,
  // so no single website ever sees a burst from us.
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor; cursor += 1;
      if (i >= selected.length) return;
      const p = selected[i];
      const site = resolveSiteAddress(p);
      result.read += 1;
      let pages = [];
      for (let a = 0; a < attempts; a++) {
        const got = await fetchSite(site, { fetch: fetchImpl, delayMs: delay, maxPages: options.maxPages });
        if (got.pages.length) { pages = got.pages; break; }
        if (a < attempts - 1 && delay) await sleep(delay);
      }
      try {
        const finding = pages.length ? readSite(pages, { domain: domainOf(site) }) : readSite([]);
        if (!pages.length) result.unreachable += 1;
        if (finding.email) result.withEmail += 1;
        if (finding.employeeCount !== null) result.withHeadcount += 1;
        const r = await applySiteRead(db, p.id, finding, { ...options, category: p.category || null });
        if (r.changed) result.changed += 1;
      } catch (e) {
        // One rotten page, one unreadable address, one write that would not
        // land: skipped and counted, never the end of the run.
        result.failed = (result.failed || 0) + 1;
      }
      if (options.onProgress) options.onProgress(result, p.name);
      if (delay) await sleep(delay);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, selected.length) }, worker));
  return result;
}

// Everyone the site named, kept alongside the business. A person typed in by
// hand is never overwritten by a later read.
async function saveContacts(db, prospectId, finding) {
  const people = (finding.people || []).filter((p) => p.name || p.email);
  if (!people.length) return 0;
  const personalLinks = (finding.linkedIn && finding.linkedIn.people) || [];
  let n = 0;
  for (const [i, person] of people.entries()) {
    if (!person.email) continue;   // no address, nothing to key on
    const existing = await db.contact.findFirst({ where: { prospectId, email: person.email } });
    if (existing && existing.source === 'RUSS') continue;   // his correction stands
    const data = {
      prospectId, email: person.email,
      name: person.name || (existing && existing.name) || null,
      role: person.role || (existing && existing.role) || null,
      linkedIn: personalLinks[i] || (existing && existing.linkedIn) || null,
      foundOn: person.foundOn || null,
      source: 'WEBSITE',
      isPrimary: i === 0,
    };
    if (existing) await db.contact.update({ where: { id: existing.id }, data });
    else await db.contact.create({ data });
    n += 1;
  }
  return n;
}

function resolveSiteAddress(prospect) {
  const { resolveField } = require('./overrides.js');
  const w = resolveField(prospect, 'website');
  return w && String(w).trim() ? String(w).trim() : null;
}

function domainOf(url) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).host.replace(/^www\./, ''); } catch { return null; }
}

module.exports = {
  MAX_PAGES_PER_SITE, PAGE_TIMEOUT_MS, DELAY_BETWEEN_PAGES_MS, MAX_HTML_BYTES,
  SITE_STATUS, HEADCOUNT_STATUS, EMAIL_STATUS, EMAIL_CONFIDENCE_FLOOR,
  textOf, emailsFromPages, headcountFromPages, ownerFromPages, signalsFromPages,
  linksWorthFollowing, readSite, readNoWebsite, fetchSite,
  peopleFromPages, linkedInFromPages, pairEmailsToPeople, saveContacts,
  selfDescription, tradeWordsFrom, yearsInBusinessFrom, toolsFrom, teamCountFrom, openRolesFrom, TOOLS,
  enrichHeadcount, enrichEmail, needsSiteRead, applySiteRead, runSiteEnrichment,
  resolveSiteAddress, domainOf,
};
