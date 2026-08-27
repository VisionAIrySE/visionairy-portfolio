// Oregon's own business register, read from the state's open data.
//
// The old reader scraped a public mirror one business at a time. That mirror
// now refuses us — 403 on every request — which is why a run of 1,248 lookups
// finished in 42 seconds having found nobody (2026-08-26). It was not that
// the businesses are unregistered; nothing was ever read.
//
// This replaces it with the state's own file. One request pulls every active
// Central Oregon registration that names a person, and the matching happens
// here rather than over the wire. Free, no key, no account, and nothing that
// can be rate-limited into failing silently.
//
//   https://data.oregon.gov/resource/tckn-sxa6.csv
//
// The person named is the registered agent or the authorized representative.
// At a small business that is nearly always the owner. At a larger one it can
// be a lawyer or a filing service, so anything company-shaped is rejected.

const ENDPOINT = 'https://data.oregon.gov/resource/tckn-sxa6.csv';
const CITIES = [
  'BEND', 'REDMOND', 'SISTERS', 'PRINEVILLE', 'MADRAS', 'LA PINE', 'LAPINE',
  'SUNRIVER', 'TERREBONNE', 'TUMALO', 'CULVER', 'WARM SPRINGS', 'POWELL BUTTE',
  'CAMP SHERMAN', 'ALFALFA', 'BLACK BUTTE RANCH',
];

// A filing service or a law firm is not the owner. These turn up as the named
// agent for the bigger entities and would put a stranger's name on a letter.
const NOT_AN_OWNER = /\b(CT CORPORATION|CORPORATION SERVICE|REGISTERED AGENTS?|LEGALZOOM|INCFILE|NORTHWEST REGISTERED|HARBOR COMPLIANCE|COGENCY|NATIONAL REGISTERED|UNITED STATES CORPORATION|PARACORP|VCORP|ZENBUSINESS)\b/i;

// Strip everything that differs between how a business writes its own name and
// how the state has it on file, so the two can be compared.
function normalizeName(raw) {
  return String(raw || '')
    .toUpperCase()
    .split('|')[0]
    .replace(/&#\d+;|&[A-Z]+;/gi, ' ')
    .replace(/\b(LLC|L\.L\.C\.?|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|L\.L\.P\.?|PC|P\.C\.?|PLLC)\b/g, ' ')
    .replace(/\b(BEND|REDMOND|SISTERS|PRINEVILLE|MADRAS|LA PINE|SUNRIVER|TERREBONNE|TUMALO|CENTRAL OREGON|OREGON|OR)\b/g, ' ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Title case for a name the state stores in capitals.
function properCase(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

function fullName(row) {
  const parts = [row.first_name, row.middle_name, row.last_name].filter(Boolean).map(properCase);
  return parts.join(' ').trim();
}

// One line of CSV, respecting quotes.
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] || '').replace(/^"|"$/g, ''); });
    return row;
  });
}

// Pull every Central Oregon registration that names a person. One request.
async function fetchRegistry(fetchImpl = fetch) {
  const cities = CITIES.map((c) => `'${c}'`).join(',');
  const where = `upper(city) in (${cities}) AND associated_name_type in ('AUTHORIZED REPRESENTATIVE','REGISTERED AGENT') AND first_name IS NOT NULL`;
  const url = `${ENDPOINT}?${new URLSearchParams({
    $where: where,
    $select: 'business_name,first_name,middle_name,last_name,city,associated_name_type,registry_date',
    $limit: '200000',
  })}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`Oregon open data returned ${res.status}`);
  return parseCsv(await res.text());
}

// Build a lookup from normalized business name to the person named on it.
// Where a business is filed more than once, the authorized representative
// beats the registered agent — the agent can be a service, the representative
// is the person who signed.
// A person named on more than this many businesses is a lawyer or a filing
// service, not an owner. Chris D Hatfield is the named agent on 138 Central
// Oregon businesses; Edward P Fitch on 76. Putting either name on a letter to
// a business they merely file for is worse than using no name at all. An owner
// genuinely running several businesses is the interesting case Russ wants to
// keep, so the line sits above that rather than at one (2026-08-26).
const AGENT_THRESHOLD = 8;

function indexByName(rows) {
  const byName = new Map();
  // Count first, so a professional agent can be recognised before anything is
  // attributed to them.
  const appearances = new Map();
  for (const row of rows) {
    const who = fullName(row);
    if (who) appearances.set(who, (appearances.get(who) || 0) + 1);
  }
  for (const row of rows) {
    const key = normalizeName(row.business_name);
    if (!key || key.length < 4) continue;
    const who = fullName(row);
    if (!who || NOT_AN_OWNER.test(who) || NOT_AN_OWNER.test(row.business_name)) continue;
    if ((appearances.get(who) || 0) > AGENT_THRESHOLD) continue;
    const better = row.associated_name_type === 'AUTHORIZED REPRESENTATIVE';
    const existing = byName.get(key);
    if (!existing || (better && !existing.preferred)) {
      byName.set(key, { name: who, preferred: better, filedAs: row.business_name, city: row.city });
    }
  }
  return byName;
}

// The person registered behind one business, or nothing. Exact match on the
// normalized name first; then the state's name starting with ours, which
// catches "Hooker Creek" against "HOOKER CREEK COMPANIES".
function ownerOf(businessName, byName) {
  const key = normalizeName(businessName);
  if (!key || key.length < 4) return null;
  const exact = byName.get(key);
  if (exact) return exact;
  // A prefix match only counts when what we have is substantial — three or
  // more words, or a long single word — otherwise "Cascade" matches sixty
  // businesses and picks one at random.
  const words = key.split(' ');
  if (words.length < 3 && key.length < 12) return null;
  let hit = null;
  for (const [k, v] of byName) {
    if (k === key || k.startsWith(`${key} `) || key.startsWith(`${k} `)) {
      if (hit && hit.name !== v.name) return null;   // two different people: not safe
      hit = v;
    }
  }
  return hit;
}

module.exports = {
  ENDPOINT, CITIES, NOT_AN_OWNER, AGENT_THRESHOLD,
  normalizeName, properCase, fullName, parseCsv, splitCsvLine,
  fetchRegistry, indexByName, ownerOf,
};
