// Oregon's business register, read through a public mirror.
//
// The state's own site refuses automated requests. OpenGovUS carries the same
// public record — 800,000 Oregon businesses, each with the person registered
// behind it — and lets us look. That person is the owner far more often than
// not, and a name is the single biggest thing missing from the outreach.
//
// Free. No account, no key, no fee. Public record, read politely: one business
// at a time, a pause between each, a hard ceiling on the run.

const BASE = 'https://opengovus.com';
const SEARCH = `${BASE}/oregon-business?q=`;
const PAUSE_MS = 900;          // never faster than one look a second
const HARD_CEILING = 2500;     // no run may ever look up more than this
const TIMEOUT_MS = 15000;

const UA = 'Mozilla/5.0 (compatible; HoursBackBot/1.0; +https://visionairy.biz)';

// The page states it plainly: "The registered agent of the business is X."
const AGENT_RE = /The registered agent of the business is ([^.<]{3,60})\./g;
const LOCATION_RE = /registered business location is at ([^.<]{5,120})\./;
const COMPANYISH = /\b(LLC|L\.L\.C|INC|CORP|CO\.|COMPANY|SERVICES|GROUP|PROFESSIONAL|REGISTERED AGENT|AGENTS?|CT CORPORATION|NORTHWEST|LEGALZOOM|INCFILE|HARBOR COMPLIANCE)\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Search terms that actually match a register entry. "Ryan Walker - State Farm
// Insurance Agent" is a franchise label, not a registered name; the register
// knows the business, not the branding.
function searchTermFor(name) {
  return String(name || '')
    .replace(/\s*[-–—|]\s*(state farm|allstate|farmers|american family|edward jones).*/i, '')
    .replace(/[^A-Za-z0-9& ]/g, ' ')
    .replace(/\b(LLC|L L C|Inc|Incorporated|Corp|Corporation|PC|LLP|Co)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Phrases that came off the page rather than off the record. "us and our"
// and "Principal Broker" both slipped through as people.
const NOT_A_NAME = /\b(us|our|we|the|and|of|for|with|principal|broker|agent|owner|manager|president|director|registered|business|entity|record|name|address|llc|inc)\b/i;

function looksLikeAPerson(s) {
  const t = String(s || '').trim();
  if (t.length < 5 || t.length > 50) return false;
  if (COMPANYISH.test(t)) return false;
  if (NOT_A_NAME.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // A person's name is capitalised, every word of it.
  return words.every((w) => /^[A-Z][A-Za-z'.-]*$/.test(w) || /^[A-Z]\.$/.test(w));
}

// Tidy "JAMES ROBERT BAUERSFELD" into "James Robert Bauersfeld".
function tidyName(s) {
  return String(s).trim().split(/\s+/)
    .map((w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

// Look one business up. Returns the people named on its register entry, or an
// empty list — never throws.
async function lookUp(businessName, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const term = searchTermFor(businessName);
  if (!term) return { people: [], location: null, url: null };
  try {
    const results = await get(SEARCH + encodeURIComponent(term), fetchImpl);
    const link = (results.match(/href="(https:\/\/opengovus\.com\/oregon-business\/\d+)"/) || [])[1];
    if (!link) return { people: [], location: null, url: null };
    if (options.pause !== 0) await sleep(options.pause || PAUSE_MS);
    const record = await get(link, fetchImpl);
    const people = [];
    AGENT_RE.lastIndex = 0;
    for (const m of record.matchAll(AGENT_RE)) {
      const raw = m[1].trim();
      if (!looksLikeAPerson(raw)) continue;
      const name = tidyName(raw);
      if (!people.includes(name)) people.push(name);
    }
    const location = (record.match(LOCATION_RE) || [])[1] || null;
    return { people: people.slice(0, 4), location, url: link };
  } catch {
    return { people: [], location: null, url: null };   // one refusal ends nothing
  }
}

module.exports = { BASE, PAUSE_MS, HARD_CEILING, searchTermFor, looksLikeAPerson, tidyName, lookUp };
