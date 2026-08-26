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

function emailsFromPages(pages, siteDomain) {
  const seen = new Map();
  for (const page of pages) {
    const html = String(page.html || '');
    const found = [];
    for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.push(decodeURIComponent(m[1]));
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
      ownerName: null, signals: [], pagesRead: 0,
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
    signals: signalsFromPages(list),
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
    ownerName: null, ownerSourceUrl: null, signals: [], pagesRead: 0,
  };
}

// ---------------------------------------------------------------------------
// the only half that touches the internet

const FOLLOW_WORDS = /(about|our[- ]?team|team|staff|contact|careers|jobs|employment|our[- ]?story|who[- ]we[- ]are|meet)/i;

function absoluteUrl(href, base) {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function linksWorthFollowing(html, baseUrl) {
  const base = new URL(baseUrl);
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

  const queue = linksWorthFollowing(home, start).slice(0, maxPages - 1);
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

  const data = {
    ...head,
    ...mail,
    siteStatus: finding.status,
    automationScore: scored.score,
    scoreEvidence: JSON.stringify(scored.evidence),
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

  // Nothing new to say? Write nothing at all, so reading twice leaves the
  // record byte-for-byte identical.
  const same = Object.entries(data).every(([k, v]) => {
    const cur = before[k];
    if (v instanceof Date || cur instanceof Date) return String(cur) === String(v);
    return cur === v;
  });
  if (same) return { changed: false, prospect: before, score: scored.score };

  data.siteReadAt = options.now || new Date();
  data.fetchedAt = options.now || new Date();
  const after = await db.prospect.update({ where: { id: prospectId }, data });
  return { changed: true, prospect: after, score: scored.score };
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
      const finding = pages.length ? readSite(pages, { domain: domainOf(site) }) : readSite([]);
      if (!pages.length) result.unreachable += 1;
      if (finding.email) result.withEmail += 1;
      if (finding.employeeCount !== null) result.withHeadcount += 1;
      try {
        const r = await applySiteRead(db, p.id, finding, { ...options, category: p.category || null });
        if (r.changed) result.changed += 1;
      } catch (e) { /* one bad record never sinks the run */ }
      if (options.onProgress) options.onProgress(result, p.name);
      if (delay) await sleep(delay);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, selected.length) }, worker));
  return result;
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
  enrichHeadcount, enrichEmail, needsSiteRead, applySiteRead, runSiteEnrichment,
  resolveSiteAddress, domainOf,
};
