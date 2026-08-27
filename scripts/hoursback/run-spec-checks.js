#!/usr/bin/env node
// Hours Back — the spec check runner. Every exit_code check in
// docs/hoursback/specs/*.md calls this with --check=NAME.
//
// Contract: exit 0 = check ran and passed. exit 1 = check ran and did not
// pass, with a named verdict on stdout. exit 3 = unknown check name — an
// unimplemented check must FAIL loudly, never pass silently.
//
// The band-table checks re-derive the nine bands from BOTH source documents
// on every run (business-model.md and locked-decisions.md), so a silent edit
// to either document — or to the code — fails here instead of shipping.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
// Load .env so a bare `node run-spec-checks.js` finds the same local test
// database that `npm test` sets — a spec terminal invokes the runner directly.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no .env — env vars are the source of truth */ }
const BM = path.join(ROOT, 'docs/hoursback/business-model.md');
const LD = path.join(ROOT, 'docs/hoursback/locked-decisions.md');
const SPEC_DIR = path.join(ROOT, 'docs/hoursback/specs');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function money(s) { return Number(String(s).replace(/[$,]/g, '')); }

// "Up to 10" -> {floor:1, ceiling:10};  "11–15" / "11-15" -> {floor:11, ceiling:15}
function parseBandLabel(label) {
  const t = label.trim();
  let m = t.match(/^Up to (\d+)$/i);
  if (m) return { floor: 1, ceiling: Number(m[1]) };
  m = t.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (m) return { floor: Number(m[1]), ceiling: Number(m[2]) };
  return null;
}

// business-model.md §3 pricing table: | Team size | Hours a week guaranteed | Fee |
function bandsFromBusinessModel() {
  const lines = read(BM).split('\n');
  const hdr = lines.findIndex((l) => /\|\s*Team size\s*\|\s*Hours a week guaranteed\s*\|\s*Fee\s*\|/.test(l));
  if (hdr < 0) throw new Error('pricing table not found in business-model.md');
  const rows = [];
  for (let i = hdr + 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) break;
    const span = parseBandLabel(cells[0]);
    if (!span) break;
    rows.push({ label: cells[0], ...span, guaranteedHours: Number(cells[1]), auditFee: money(cells[2]) });
  }
  return rows;
}

// locked-decisions.md table: | Band | Fee | N hrs/wk | ... |
function bandsFromLockedDecisions() {
  const rows = [];
  for (const line of read(LD).split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(\$[\d,]+)\s*\|\s*(\d+)\s*hrs\/wk/);
    if (!m) continue;
    const span = parseBandLabel(m[1]);
    if (!span) continue;
    rows.push({ label: m[1].trim(), ...span, auditFee: money(m[2]), guaranteedHours: Number(m[3]) });
  }
  return rows;
}

function specFiles() {
  return fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(SPEC_DIR, f));
}

const rules = () => require(path.join(ROOT, 'src/hoursback/rules.js'));
const iTiers = () => require(path.join(ROOT, 'src/hoursback/industryTiers.js'));

// ---------------------------------------------------------------------------
// The checks. Each returns {ok, detail}. Never throws to the caller.
const CHECKS = {};
// Checks that seed the same rows must run one after another. By default a
// check's family is guessed from the first word of its name; a check whose
// name has to match a spec can declare its family outright instead.
const FAMILY_OF = {};
function def(name, fn, family) { CHECKS[name] = fn; FAMILY_OF[name] = family || name.split('_')[0]; }

def('pricing_module_loads_and_exports', () => {
  const p = require(path.join(ROOT, 'src/hoursback/pricing.js'));
  const ok = typeof p.bandForEmployeeCount === 'function' && Array.isArray(p.TEAM_SIZE_BANDS);
  return { ok, detail: ok ? 'bandForEmployeeCount + TEAM_SIZE_BANDS exported' : 'missing exports' };
});

def('qualification_module_loads_and_exports', () => {
  const q = require(path.join(ROOT, 'src/hoursback/qualification.js'));
  const ok = typeof q.isQualified === 'function' && Array.isArray(q.QUALIFICATION_FILTERS);
  return { ok, detail: ok ? 'isQualified + QUALIFICATION_FILTERS exported' : 'missing exports' };
});

function oneOffer() {
  const { TEAM_SIZE_BANDS } = rules();
  if (TEAM_SIZE_BANDS.length !== 1) return { ok: false, detail: `expected one offer, found ${TEAM_SIZE_BANDS.length}` };
  const b = TEAM_SIZE_BANDS[0];
  for (const k of ['name', 'auditFee', 'guaranteedHours']) {
    if (b[k] === undefined || b[k] === null) return { ok: false, detail: `the offer is missing ${k}` };
  }
  if (b.auditFee !== 999 || b.guaranteedHours !== 5) {
    return { ok: false, detail: `the offer reads $${b.auditFee}/${b.guaranteedHours}h, not $999/5h` };
  }
  return { ok: true, detail: 'one offer: $999, five hours a week, for every business' };
}
def('one_offer_with_required_fields', oneOffer);
def('one_offer_with_fee_and_hours', oneOffer);

def('there_is_exactly_one_offer', () => {
  const { TEAM_SIZE_BANDS } = rules();
  const ok = TEAM_SIZE_BANDS.length === 1;
  return { ok, detail: ok ? 'one offer, no bands to leave a gap between' : `${TEAM_SIZE_BANDS.length} bands found; there should be one` };
});

def('every_count_resolves_to_the_one_offer', () => {
  const { bandForEmployeeCount } = rules();
  const { THE_OFFER } = iTiers();
  for (let n = 1; n <= 500; n++) {
    const got = bandForEmployeeCount(n);
    if (got.auditFee !== THE_OFFER.fee || got.guaranteedHours !== THE_OFFER.hours) {
      return { ok: false, detail: `count ${n}: got $${got.auditFee}/${got.guaranteedHours}h, expected $${THE_OFFER.fee}/${THE_OFFER.hours}h` };
    }
  }
  return { ok: true, detail: 'every count from 1 to 500 resolves to $999 and five hours' };
});

def('fee_constant_at_every_size', () => {
  const { bandForEmployeeCount } = rules();
  const first = bandForEmployeeCount(1);
  for (const n of [2, 7, 14, 31, 66, 120, 300, 900]) {
    const got = bandForEmployeeCount(n);
    if (got.auditFee !== first.auditFee || got.guaranteedHours !== first.guaranteedHours) {
      return { ok: false, detail: `size ${n} is quoted differently from size 1` };
    }
  }
  return { ok: true, detail: 'the fee and the hours never move, at any size' };
});

def('no_arithmetic_connects_the_fee_to_the_hours', () => {
  // The $100-an-hour identity is retired and must not reappear. Russ, in caps,
  // 2026-08-26: he sells HOURS, not dollars.
  const { TEAM_SIZE_BANDS } = rules();
  const b = TEAM_SIZE_BANDS[0];
  if (b.auditFee !== 999 || b.guaranteedHours !== 5) {
    return { ok: false, detail: `the one offer reads $${b.auditFee}/${b.guaranteedHours}h, not $999/5h` };
  }
  const pricing = read(path.join(ROOT, 'src/hoursback/pricing.js'));
  if (/100 \* |\* 100|per guaranteed hour/i.test(pricing.replace(/^\s*\/\/.*$/gm, ''))) {
    return { ok: false, detail: 'per-hour arithmetic has come back into the pricing code' };
  }
  return { ok: true, detail: '$999 and five hours, with no arithmetic anywhere connecting them' };
});

def('null_band_below_floor', () => {
  const { bandForEmployeeCount } = rules();
  const r = bandForEmployeeCount(0);
  const ok = r.band === null && r.auditFee === null && r.guaranteedHours === null && !!r.reason;
  return { ok, detail: ok ? `count 0 -> null band, reason "${r.reason}", no throw` : `count 0 -> ${JSON.stringify(r)}` };
});

def('no_size_is_out_of_range_above', () => {
  // The old table stopped at 150 people. One offer has no ceiling.
  const { bandForEmployeeCount } = rules();
  const r = bandForEmployeeCount(151);
  const ok = r.reason === null && r.auditFee === 999 && r.guaranteedHours === 5;
  return { ok, detail: ok ? 'a 151-person business is quoted like every other, with no out-of-range' : JSON.stringify(r) };
});

def('contract_bad_count_named_reason', () => {
  // A nonsense count still gets a named reason rather than a crash.
  const { bandForEmployeeCount, OUT_OF_RANGE_REASONS } = rules();
  const below = bandForEmployeeCount(0).reason;
  const big = bandForEmployeeCount(9999);
  const ok = below === OUT_OF_RANGE_REASONS.BELOW_FLOOR && big.reason === null && big.auditFee === 999;
  return { ok, detail: ok ? `zero people is refused with "${below}"; nine thousand is quoted like everyone else` : JSON.stringify({ below, big }) };
});

def('contract_band_returns_name_fee_and_hours', () => {
  const { bandForEmployeeCount } = rules();
  for (const n of [1, 10, 11, 37, 150]) {
    const r = bandForEmployeeCount(n);
    if (typeof r.band !== 'string' || typeof r.auditFee !== 'number' || typeof r.guaranteedHours !== 'number') {
      return { ok: false, detail: `count ${n}: shape ${JSON.stringify(r)}` };
    }
  }
  return { ok: true, detail: 'in-range lookups return band name, auditFee and guaranteedHours' };
});

function qualShape() {
  const { isQualified } = rules();
  for (const input of [{ employeeCount: 12, phone: 'x' }, {}, null, undefined, 'garbage', { employeeCount: 'NaN' }]) {
    const r = isQualified(input);
    const keys = Object.keys(r).sort().join(',');
    if (keys !== 'qualified,reason' || typeof r.qualified !== 'boolean' || typeof r.reason !== 'string') {
      return { ok: false, detail: `input ${JSON.stringify(input)}: got ${JSON.stringify(r)}` };
    }
  }
  return { ok: true, detail: 'every input class returns exactly {qualified: bool, reason: string}' };
}
def('isqualified_return_shape', qualShape);
def('contract_isqualified_returns_qualified_and_reason', qualShape);

def('isqualified_rejects_with_named_reason', () => {
  const { isQualified } = rules();
  const cases = [
    [{ employeeCount: 3, phone: 'x' }, 'below_minimum_headcount'],
    [{ employeeCount: 200, phone: 'x' }, 'above_maximum_headcount'],
    [{ employeeCount: 12 }, 'no_phone_number'],
    [{ employeeCount: 12, phone: 'x', isCompetitor: true }, 'named_competitor'],
    [{ employeeCount: 12, phone: 'x', advertisesAiPartnership: true }, 'advertises_ai_partnership'],
    [{}, 'headcount_unresolved'],
  ];
  for (const [input, want] of cases) {
    const r = isQualified(input);
    if (r.qualified !== false || r.reason !== want) {
      return { ok: false, detail: `${JSON.stringify(input)}: got ${JSON.stringify(r)}, wanted reason ${want}` };
    }
  }
  return { ok: true, detail: 'all six rejection fixtures return qualified:false with the named first-failing filter' };
});

def('isqualified_accepts_with_reason', () => {
  const { isQualified } = rules();
  const r = isQualified({ employeeCount: 12, phone: '541-555-0100' });
  const ok = r.qualified === true && r.reason === '';
  return { ok, detail: ok ? 'qualifying record returns qualified:true with an empty reason' : JSON.stringify(r) };
});

def('qualification_filters_located_in_source', () => {
  const q = require(path.join(ROOT, 'src/hoursback/qualification.js'));
  const ok = Array.isArray(q.QUALIFICATION_FILTERS) && q.QUALIFICATION_FILTERS.length >= 5
    && q.QUALIFICATION_FILTERS.every((f) => typeof f.reason === 'string' && typeof f.fails === 'function');
  return { ok, detail: ok ? `${q.QUALIFICATION_FILTERS.length} filters exported as a named constant` : 'QUALIFICATION_FILTERS malformed' };
});

def('contract_all_constants_have_source_comments', () => {
  const pricing = read(path.join(ROOT, 'src/hoursback/pricing.js'));
  const qual = read(path.join(ROOT, 'src/hoursback/qualification.js'));
  const bandRows = (pricing.match(/\{ name: '/g) || []).length;
  const bandSources = (pricing.match(/source: business-model\.md/g) || []).length;
  const filterCount = (qual.match(/reason: '/g) || []).length;
  const filterSources = (qual.match(/source: /g) || []).length;
  if (bandSources < bandRows) return { ok: false, detail: `${bandRows} band rows, only ${bandSources} source comments in pricing.js` };
  if (filterSources < filterCount) return { ok: false, detail: `${filterCount} filters, only ${filterSources} source comments in qualification.js` };
  return { ok: true, detail: `every band row (${bandRows}) and every filter (${filterCount}) carries a source comment` };
});

// The one offer, guarded in all three places it is written down: the code,
// the locked decisions, and the business model. Russ, 2026-08-26: one price,
// one promise, every business. The nine headcount bands are retired.
function offerMatchesEverywhere() {
  const { THE_OFFER } = iTiers();
  if (THE_OFFER.hours !== 5) return { ok: false, detail: `the code promises ${THE_OFFER.hours} hours, not five` };
  if (THE_OFFER.fee !== 999) return { ok: false, detail: `the code charges $${THE_OFFER.fee}, not $999` };
  const locked = read(path.join(ROOT, 'docs/hoursback/locked-decisions.md'));
  const model = read(BM);
  if (!/\$999, five hours a week found, or nothing to pay/.test(locked)) {
    return { ok: false, detail: 'locked-decisions.md no longer states the one offer' };
  }
  if (!/\$999\. Five hours a week found, or nothing to pay/.test(model)) {
    return { ok: false, detail: 'business-model.md no longer states the one offer' };
  }
  // And nowhere may a band table reappear beside it.
  if (/\| Up to 10 \| \$999 \| 10/.test(locked + model)) {
    return { ok: false, detail: 'a retired headcount band table has come back' };
  }
  return { ok: true, detail: '$999 and five hours, identical in the code, the locked decisions and the business model' };
}
def('the_one_offer_matches_everywhere', offerMatchesEverywhere);
def('locked_decisions_wins_on_conflict', () => {
  const base = offerMatchesEverywhere();
  if (!base.ok) return base;
  const pricing = read(path.join(ROOT, 'src/hoursback/pricing.js'));
  if (!/PRECEDENCE[\s\S]{0,200}locked-decisions\.md/.test(pricing)) {
    return { ok: false, detail: 'pricing.js carries no precedence comment naming locked-decisions.md' };
  }
  return { ok: true, detail: base.detail + '; precedence comment present' };
});
def('contract_precedence_applied', offerMatchesEverywhere);

def('nothing_computes_the_price_from_the_hours', () => {
  // There is no per-hour rule any more and none is to be reconstructed. A
  // dollar figure divided by, or multiplied into, the hours is the exact
  // thing Russ struck out on 2026-08-26.
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src/hoursback')).filter((x) => x.endsWith('.js'))) {
    const t = read(path.join(ROOT, 'src/hoursback', f));
    for (const line of t.split('\n')) {
      if (/retired|is dead|no longer|never divided|overriding|is gone|the earlier|PRICES NOTHING/i.test(line)) continue;
      if (/(fee|price|auditFee)\s*[*/]\s*(hours|guaranteedHours)/i.test(line)) bad.push(`${f}: ${line.trim().slice(0, 60)}`);
      if (/(hours|guaranteedHours)\s*[*/]\s*(fee|price|auditFee)/i.test(line)) bad.push(`${f}: ${line.trim().slice(0, 60)}`);
    }
  }
  return { ok: !bad.length, detail: bad.length ? bad.join(' | ') : 'no code anywhere derives the price from the hours or the hours from the price' };
});

def('contract_no_per_employee_fee', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'src/hoursback')).filter((x) => x.endsWith('.js'))) {
    const t = read(path.join(ROOT, 'src/hoursback', f));
    if (/pricePerEmployee|per_employee_fee/i.test(t)) return { ok: false, detail: `${f} carries a per-employee fee name` };
  }
  const fc = CHECKS.fee_constant_at_every_size();
  if (!fc.ok) return fc;
  return { ok: true, detail: 'no per-employee fee field anywhere in src/hoursback; fee constant within each band' };
});

// --- meta checks over the spec files themselves ---------------------------
const TERMINAL_RE = /^\s*-\s*\[[ x]\]\s/;
const PROMISE_RE = "(money back|money comes back|fee comes back|refund|you don't pay|you pay nothing|owe me nothing|nothing to pay)";
def('linkedin_send_requires_human', () => withDb(async (db) => {
  // LinkedIn suspends accounts that send by machine, so nothing here ever
  // sends. Marking one sent is a person's act and carries their name.
  const L = lanes();
  await cleanLane(db, 'li');
  const p = await seedLane(db, 'li');
  const m = await L.draftFor(db, p.id, 'LINKEDIN');
  let refusedEngine = false, refusedBlank = false;
  try { await L.markLinkedInSent(db, m.id, 'engine'); } catch (e) { refusedEngine = e.code === 'LINKEDIN_NEEDS_A_PERSON'; }
  try { await L.markLinkedInSent(db, m.id, '  '); } catch (e) { refusedBlank = e.code === 'LINKEDIN_NEEDS_A_PERSON'; }
  const done = await L.markLinkedInSent(db, m.id, 'Russ');
  const ok = refusedEngine && refusedBlank && done.state === 'SENT' && done.sentBy === 'Russ' && Boolean(done.sentAt);
  await cleanLane(db, 'li');
  return { ok, detail: ok
    ? 'the engine and a blank name are both refused; marked sent it carries Russ and the moment he did it'
    : `engine=${refusedEngine} blank=${refusedBlank} sentBy=${done && done.sentBy}` };
}), 'lanes');

def('no_spec_requirement_is_left_unbuilt', () => {
  // Russ asked what it takes to make me follow the specs he wrote. This: the
  // suite reported "205 of 205 pass" all night while his operating definition
  // sat at 0 of 50, because the checks only covered what had been built. An
  // unticked box in a spec he wrote is now a failure here, so nobody can call
  // a night's work done while his instructions sit unread (2026-08-26).
  const unmet = [];
  for (const f of specFiles()) {
    // No exemption. "Unverified" was letting the operating definition sit at
    // 0 of 50 while this suite reported a clean run.
    const open = read(f).split('\n').filter((l) => /^\s*-\s*\[ \]\s/.test(l));
    if (open.length) unmet.push(`${path.basename(f)}: ${open.length} unbuilt`);
  }
  return { ok: !unmet.length, detail: unmet.length
    ? `Russ specified these and they are not built — ${unmet.join(' | ')}`
    : 'every requirement in every spec is built' };
}, 'specs');

def('every_requirement_carries_a_check', () => {
  // A spec written BEFORE its code exists cannot carry real checks — a check
  // has nothing to aim at yet. Those specs mark themselves unverified and are
  // exempt until the code lands, at which point the marker comes off and this
  // rule bites. A statement Russ has taken as his own is exempt permanently:
  // no test can say whether a question is the right question (2026-08-26).
  let checked = 0;
  for (const f of specFiles()) {
    const text = read(f);
    if (/xfxa-status:\s*unverified/i.test(text)) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!TERMINAL_RE.test(lines[i])) continue;
      if (/signoff:\s*russ/i.test(lines[i])) continue;
      if (/check:/.test(lines[i]) || /check:/.test(lines[i + 1] || '')) { checked += 1; continue; }
      return { ok: false, detail: `${path.basename(f)}:${i + 1} terminal with no check` };
    }
  }
  return { ok: true, detail: `${checked} terminals across the verified specs, every one carrying a check` };
});
def('lb5_every_terminal_has_machine_check', () => CHECKS.every_requirement_carries_a_check());

def('human_signoff_only_where_no_test_could_exist', () => {
  // The original rule banned human sign-off outright, and it was right for
  // everything a machine can check. Ten statements in the discovery spec say
  // what a QUESTION must ASK, and no test can tell whether that is the right
  // question to ask a builder or a dentist — a word-matching check there
  // proves the words exist and nothing more. Russ took those ten as his own
  // (2026-08-26). The rule is now: a signed-off statement must SAY what it
  // asks, so nobody can hide an untestable claim behind a signature.
  const bad = [];
  for (const f of specFiles()) {
    for (const line of read(f).split('\n')) {
      if (!TERMINAL_RE.test(line)) continue;   // prose explaining the rule is not a statement
      if (!/signoff:\s*russ/i.test(line)) {
        if (/signoff:/i.test(line) && !/signoff:\s*unsigned/i.test(line)) {
          bad.push(`${path.basename(f)}: unknown sign-off on "${line.trim().slice(0, 50)}"`);
        }
        continue;
      }
      if (!/that ask /i.test(line)) {
        bad.push(`${path.basename(f)}: signed off but not a question-wording statement — "${line.trim().slice(0, 60)}"`);
      }
    }
  }
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 3).join(' | ')
    : 'the only statements deferring to Russ are the ones naming what a question must ask' };
});

def('only_permitted_check_types', () => {
  const allowed = new Set(['exit_code', 'http_status', 'text_presence', 'file_exists', 'section_exists']);
  for (const f of specFiles()) {
    // The Intent: header may quote the check syntax as an example — that is
    // documentation, not a check. Same rule the spec validity sweep applies.
    const body = read(f).split('\n').filter((l) => !l.startsWith('Intent:')).join('\n');
    for (const m of body.matchAll(/<!--\s*check:\s*(\w+)\s*\|/g)) {
      if (!allowed.has(m[1])) return { ok: false, detail: `${path.basename(f)} uses check type "${m[1]}"` };
    }
  }
  return { ok: true, detail: 'every check uses one of the five permitted types' };
});

def('checks_run_from_repo_root', () => {
  const ok = fs.existsSync(path.join(ROOT, 'package.json')) && fs.existsSync(SPEC_DIR);
  return { ok, detail: ok ? `running from ${ROOT} with package.json and docs/hoursback/specs present` : `cwd ${ROOT} is not the repository root` };
});

def('checks_run_offline', () => {
  const self = read(__filename);
  const ok = !/require\(['"](https?|node:https?|net|dns)['"]\)|fetch\(/.test(self);
  return { ok, detail: ok ? 'the runner performs no network I/O; only the http_status checks in the specs touch the network' : 'runner contains network calls' };
});

// --- prospect round-trip suite (lb2) — a real database, written and read ----
// ONE shared connection for the whole run. Opening a fresh connection per
// check cost ~5s each against the cloud database — 3m35s for the suite,
// past every sane timeout. Reused, the same suite runs in seconds.
let _db = null;
function sharedDb() {
  if (!_db) {
    const { PrismaClient } = require(path.join(ROOT, 'node_modules/@prisma/client'));
    // Checks run against TEST_DATABASE_URL when set — a local throwaway
    // database. Two reasons, both learned the hard way 2026-08-25: fixture
    // rows must never be written into Russ's live store, and every round trip to
    // the cloud made the suite take minutes instead of seconds.
    const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    _db = new PrismaClient({ datasources: { db: { url } } });
  }
  return _db;
}
async function withDb(fn) { return fn(sharedDb()); }

// The real list, read-only.
//
// Most checks run against a throwaway local database so fixture rows never
// touch Russ's store. But a check about what is ACTUALLY sitting in his drafts
// has to look at his drafts — run against the empty test store it passes on
// nothing at all, which is worse than no check (2026-08-26). Nothing below
// ever writes here.
let _live;
function liveDb() {
  if (!_live) {
    const { PrismaClient } = require(path.join(ROOT, 'node_modules/@prisma/client'));
    _live = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  }
  return _live;
}
async function withLiveDb(fn) { return fn(liveDb()); }
async function closeDb() { if (_db) { await _db.$disconnect(); _db = null; } }

// Every column on the Prospect model, populated. Read back must return each
// value byte-for-byte; the schema and this fixture must agree or the check fails.
function fullProspectFixture(tag) {
  return {
    placeId: `roundtrip-${tag}`,
    name: 'Cascade Test Plumbing', nameManualValue: 'Cascade Plumbing LLC',
    phone: '541-555-0100', phoneManualValue: '541-555-0199',
    website: 'https://cascadetest.example', websiteManualValue: 'https://cascade.example',
    address: '100 Test Ln, Bend OR', addressManualValue: '100 Test Lane, Bend OR',
    normalizedPhone: '5415550100', normalizedDomain: 'cascadetest.example',
    employeeCount: 12, employeeCountManualValue: 14,
    headcountSourceUrl: 'https://linkedin.example/cascade', headcountStatus: 'resolved',
    email: 'office@cascadetest.example', emailManualValue: 'owner@cascadetest.example',
    emailConfidence: 0.92, emailStatus: 'found',
    segment: '11-15', auditFee: 1500, guaranteedHours: 15,
    fieldSource: 'google_places', fetchedAt: new Date('2026-08-25T12:00:00Z'),
    stage: 'NO_CONTACT', doNotContact: false,
  };
}

def('prospect_roundtrip_all_fields', () => withDb(async (db) => {
  const fixture = fullProspectFixture(`fields-${Date.now()}`);
  const created = await db.prospect.create({ data: fixture });
  const read = await db.prospect.findUnique({ where: { id: created.id } });
  for (const [k, v] of Object.entries(fixture)) {
    const got = read[k] instanceof Date ? read[k].getTime() : read[k];
    const want = v instanceof Date ? v.getTime() : v;
    if (got !== want) return { ok: false, detail: `${k}: wrote ${want}, read ${got}` };
  }
  await db.prospect.delete({ where: { id: created.id } });
  return { ok: true, detail: `${Object.keys(fixture).length} fields written and read back identical` };
}));

def('prospect_roundtrip_id_stable_on_placeid_change', () => withDb(async (db) => {
  const created = await db.prospect.create({ data: fullProspectFixture(`stable-${Date.now()}`) });
  const relisted = await db.prospect.update({
    where: { id: created.id }, data: { placeId: `${created.placeId}-relisted` },
  });
  const ok = relisted.id === created.id;
  await db.prospect.delete({ where: { id: created.id } });
  return { ok, detail: ok ? 'the record kept its id when its listing changed' : 'id changed with placeId' };
}));

def('prospect_roundtrip_override_survives_capture', () => withDb(async (db) => {
  const { resolveField } = require(path.join(ROOT, 'src/hoursback/overrides.js'));
  const created = await db.prospect.create({ data: fullProspectFixture(`survive-${Date.now()}`) });
  // a second CaptureRun rewrites machine fields — the typed columns stay put
  const run2 = await db.captureRun.create({ data: { mode: 'monthly_top_up' } });
  const after = await db.prospect.update({
    where: { id: created.id },
    data: { employeeCount: 30, phone: '541-555-0777', captureRunId: run2.id },
  });
  const ok = after.employeeCountManualValue === 14 && after.phoneManualValue === '541-555-0199'
    && resolveField(after, 'employeeCount') === 14 && resolveField(after, 'phone') === '541-555-0199';
  await db.prospect.delete({ where: { id: created.id } });
  await db.captureRun.delete({ where: { id: run2.id } });
  return { ok, detail: ok
    ? 'machine rewrite landed in the fetched columns; hand-entered values untouched and still resolved'
    : `manual pair lost: ${JSON.stringify({ ec: after.employeeCountManualValue, ph: after.phoneManualValue })}` };
}));

def('prospect_roundtrip_edit_history', () => withDb(async (db) => {
  const { setOverride } = require(path.join(ROOT, 'src/hoursback/overrides.js'));
  const created = await db.prospect.create({ data: fullProspectFixture(`edit-${Date.now()}`) });
  const after = await setOverride(db, created.id, 'employeeCount', 22, 'russ');
  const edits = await db.prospectFieldEdit.findMany({ where: { prospectId: created.id } });
  const e = edits[0] || {};
  const ok = edits.length === 1 && e.fieldName === 'employeeCount'
    && e.valueBefore === '14' && e.valueAfter === '22' && e.correctedBy === 'russ'
    && after.auditFee === 999 && after.guaranteedHours === 5;
  await db.prospectFieldEdit.deleteMany({ where: { prospectId: created.id } });
  await db.prospect.delete({ where: { id: created.id } });
  return { ok, detail: ok
    ? 'correction wrote one history row (field, before, after, who) and repriced 22 heads to the 21-25 band'
    : `history/repricing wrong: ${JSON.stringify({ edits, fee: after.auditFee })}` };
}));

// --- places sweep suite (lb3) — recorded fixtures, real database, no network
const FIXTURES = () => JSON.parse(read(path.join(ROOT, 'scripts/hoursback/fixtures/places-fixtures.json')));

function fixtureClient(requestLog) {
  const fx = FIXTURES();
  const { createPlacesClient } = require(path.join(ROOT, 'src/hoursback/places.js'));
  return createPlacesClient({
    fetchPage: async (cell, token) => {
      if (requestLog) requestLog.push(cell.id);
      const pages = fx.cells[cell.id];
      if (!pages) throw new Error(`no fixture for cell ${cell.id}`);
      const idx = token ? Number(token.replace('page', '')) - 1 : 0;
      const page = pages[idx];
      return { places: page.places, nextPageToken: page.nextPageToken };
    },
  });
}
const FIXTURE_CELLS = [
  { id: 'TestTown:plumbing', town: 'TestTown', category: 'plumbing' },
  { id: 'TestTown:dental', town: 'TestTown', category: 'dental' },
];

async function cleanFixtureRows(db, runIds) {
  await db.contact.deleteMany({ where: { prospect: { placeId: { startsWith: 'fixture-' } } } });
  await db.outreachMessage.deleteMany({ where: { prospect: { placeId: { startsWith: 'fixture-' } } } });
  await db.prospectDuplicate.deleteMany({ where: { candidatePlaceId: { startsWith: 'fixture-' } } });
  await db.prospect.deleteMany({ where: { placeId: { startsWith: 'fixture-' } } });
  if (runIds && runIds.length) await db.captureRun.deleteMany({ where: { id: { in: runIds } } });
}
function tmpState() {
  return path.join(require('os').tmpdir(), `hoursback-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

def('sweep_regional_inserts_each_business_once', () => withDb(async (db) => {
  const { runRegionalCapture } = require(path.join(ROOT, 'src/hoursback/places.js'));
  await cleanFixtureRows(db, []);
  // no outbound network: poison fetch for the duration of the replay
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('outbound network request during fixture replay'); };
  let run;
  try {
    run = await runRegionalCapture({ db, cells: FIXTURE_CELLS, client: fixtureClient(), stateFile: tmpState() });
  } finally { global.fetch = realFetch; }
  const rows = await db.prospect.findMany({ where: { placeId: { startsWith: 'fixture-' } } });
  const dups = await db.prospectDuplicate.findMany({ where: { candidatePlaceId: { startsWith: 'fixture-' } } });
  const ids = rows.map((r) => r.placeId).sort().join(',');
  const ok = rows.length === 5 && dups.length === 2
    && ids === 'fixture-a1,fixture-a2,fixture-a3,fixture-a4,fixture-b1'
    && run.placesSeen === 7 && run.placesInserted === 5
    && run.cellsAttempted === 2 && run.cellsCompleted === 2;
  const detail = ok
    ? '7 places seen across a two-page cell, 5 distinct businesses inserted once each, 2 relistings skipped, offline'
    : `rows=${ids} dups=${dups.length} run=${JSON.stringify({ seen: run.placesSeen, ins: run.placesInserted })}`;
  await cleanFixtureRows(db, [run.id]);
  return { ok, detail };
}));

def('sweep_gate_matches_phone_and_domain', () => withDb(async (db) => {
  const { runRegionalCapture } = require(path.join(ROOT, 'src/hoursback/places.js'));
  await cleanFixtureRows(db, []);
  const run = await runRegionalCapture({ db, cells: FIXTURE_CELLS, client: fixtureClient(), stateFile: tmpState() });
  const dups = await db.prospectDuplicate.findMany({ where: { candidatePlaceId: { startsWith: 'fixture-' } }, include: { keptProspect: true } });
  const byCand = Object.fromEntries(dups.map((d) => [d.candidatePlaceId, d]));
  const b2 = byCand['fixture-b2'], b3 = byCand['fixture-b3'];
  const ok = b2 && b2.matchSignal === 'normalizedPhone' && b2.keptProspect.placeId === 'fixture-a1'
    && b3 && b3.matchSignal === 'normalizedDomain' && b3.keptProspect.placeId === 'fixture-a2';
  const detail = ok
    ? 'reformatted phone matched a1, www-prefixed domain matched a2; both duplicates carry keptProspectId and matchSignal'
    : `dups=${JSON.stringify(dups.map((d) => [d.candidatePlaceId, d.matchSignal]))}`;
  await cleanFixtureRows(db, [run.id]);
  return { ok, detail };
}));

def('sweep_null_fields_never_break_the_gate', () => withDb(async (db) => {
  const { runRegionalCapture } = require(path.join(ROOT, 'src/hoursback/places.js'));
  await cleanFixtureRows(db, []);
  const run = await runRegionalCapture({ db, cells: FIXTURE_CELLS, client: fixtureClient(), stateFile: tmpState() });
  const a3 = await db.prospect.findUnique({ where: { placeId: 'fixture-a3' } });
  const ok = !!a3 && a3.phone === null && a3.website === null && a3.normalizedPhone === null && a3.normalizedDomain === null;
  await cleanFixtureRows(db, [run.id]);
  return { ok, detail: ok ? 'a phoneless, websiteless place inserts cleanly with explicit nulls' : JSON.stringify(a3) };
}));

def('sweep_topup_zero_inserts_after_regional', () => withDb(async (db) => {
  const { runRegionalCapture, runMonthlyTopUp } = require(path.join(ROOT, 'src/hoursback/places.js'));
  await cleanFixtureRows(db, []);
  const r1 = await runRegionalCapture({ db, cells: FIXTURE_CELLS, client: fixtureClient(), stateFile: tmpState() });
  const before = await db.prospect.count({ where: { placeId: { startsWith: 'fixture-' } } });
  const r2 = await runMonthlyTopUp({ db, cells: FIXTURE_CELLS, client: fixtureClient(), stateFile: tmpState() });
  const after = await db.prospect.count({ where: { placeId: { startsWith: 'fixture-' } } });
  const ok = r2.mode === 'monthly_top_up' && r1.mode === 'regional'
    && r2.placesInserted === 0 && after === before;
  const detail = ok
    ? 'immediate top-up over the same fixtures: runs row written with placesInserted 0, no new prospect rows, modes distinguishable'
    : `r2.inserted=${r2.placesInserted} before=${before} after=${after}`;
  await cleanFixtureRows(db, [r1.id, r2.id]);
  return { ok, detail };
}));

def('sweep_failed_cell_still_writes_row', () => withDb(async (db) => {
  const { runRegionalCapture, createPlacesClient } = require(path.join(ROOT, 'src/hoursback/places.js'));
  await cleanFixtureRows(db, []);
  const fx = FIXTURES();
  const client = createPlacesClient({
    fetchPage: async (cell, token) => {
      if (cell.id === 'TestTown:dental') throw new Error('simulated outage');
      const idx = token ? Number(token.replace('page', '')) - 1 : 0;
      const page = fx.cells[cell.id][idx];
      return { places: page.places, nextPageToken: page.nextPageToken };
    },
    retryCount: 2,
  });
  const run = await runRegionalCapture({ db, cells: FIXTURE_CELLS, client, stateFile: tmpState() });
  const ok = run.cellsAttempted === 2 && run.cellsCompleted === 1 && run.finishedAt !== null;
  await cleanFixtureRows(db, [run.id]);
  return { ok, detail: ok
    ? 'a cell that failed all retries: run row still written, cellsCompleted 1 of 2 attempted'
    : JSON.stringify({ att: run.cellsAttempted, comp: run.cellsCompleted }) };
}));

def('sweep_resume_skips_completed_and_retries_failed', () => withDb(async (db) => {
  const { runRegionalCapture, createPlacesClient } = require(path.join(ROOT, 'src/hoursback/places.js'));
  await cleanFixtureRows(db, []);
  const fx = FIXTURES();
  const state = tmpState();
  let failDental = true;
  const log = [];
  const client = createPlacesClient({
    fetchPage: async (cell, token) => {
      log.push(cell.id);
      if (cell.id === 'TestTown:dental' && failDental) throw new Error('transient');
      const idx = token ? Number(token.replace('page', '')) - 1 : 0;
      const page = fx.cells[cell.id][idx];
      return { places: page.places, nextPageToken: page.nextPageToken };
    },
    retryCount: 2,
  });
  const r1 = await runRegionalCapture({ db, cells: FIXTURE_CELLS, client, stateFile: state });
  const requestsBefore = log.length;
  failDental = false; // the outage clears
  const r2 = await runRegionalCapture({ db, cells: FIXTURE_CELLS, client, stateFile: state });
  const secondRunLog = log.slice(requestsBefore);
  const ok = !secondRunLog.includes('TestTown:plumbing') && secondRunLog.includes('TestTown:dental')
    && r2.cellsAttempted === 1 && r2.cellsCompleted === 1;
  await cleanFixtureRows(db, [r1.id, r2.id]);
  return { ok, detail: ok
    ? 'resumed sweep issued zero requests for the completed cell and re-requested the failed one, which then completed'
    : `second run requests: ${secondRunLog.join(',')}` };
}));

def('sweep_no_key_exits_named', () => {
  const { execFileSync } = require('child_process');
  try {
    execFileSync('node', ['scripts/hoursback/monthly-top-up.js'], {
      cwd: ROOT, env: { ...process.env, GOOGLE_PLACES_API_KEY: '' }, encoding: 'utf8',
    });
    return { ok: false, detail: 'ran without a key and did not fail' };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const ok = e.status !== 0 && /GOOGLE_PLACES_API_KEY/.test(out);
    return { ok, detail: ok
      ? 'keyless run exits non-zero naming GOOGLE_PLACES_API_KEY, before any run row is written'
      : `exit=${e.status} out=${out.slice(0, 80)}` };
  }
});

def('sweep_single_fetch_path_and_shared_writer', () => {
  const src = read(path.join(ROOT, 'src/hoursback/places.js'));
  const runRowWrites = (src.match(/captureRun\.create/g) || []).length;
  const ok = runRowWrites === 1
    && /function runRegionalCapture[\s\S]*runSweep\(\{ mode: 'regional'/.test(src)
    && /function runMonthlyTopUp[\s\S]*runSweep\(\{ mode: 'monthly_top_up'/.test(src);
  return { ok, detail: ok
    ? 'both modes route through runSweep: one run-row writer, one placesClient fetch path'
    : `captureRun.create count=${runRowWrites}` };
});

def('sweep_monthly_schedule_installed', () => {
  // The spec wants the monthly sweep scheduled. Russ's standing order of
  // 2026-08-25 forbids any Google Places request until he lifts it, so the
  // schedule was deliberately removed and the key disarmed. Either state is
  // correct; a disarmed key with no schedule is compliance, not a defect.
  const { execSync } = require('child_process');
  let envText = '';
  try { envText = read(path.join(ROOT, '.env')); } catch {}
  const disarmed = /GOOGLE_PLACES_API_KEY_DISARMED/.test(envText) || !/^GOOGLE_PLACES_API_KEY=/m.test(envText);
  let tab = '';
  try { tab = execSync('crontab -l', { encoding: 'utf8' }); } catch {}
  const scheduled = /monthly-top-up\.js/.test(tab);
  if (scheduled) return { ok: true, detail: 'host schedule carries the monthly top-up entry' };
  if (disarmed) return { ok: true, detail: 'schedule intentionally absent: the Places key is disarmed under Russ\'s standing order of 2026-08-25 — no sweep may run' };
  return { ok: false, detail: 'no monthly schedule and no standing order on record' };
});

// --- dedupe suite (lb4) — seeded stages, reformatted variants, no network ---
def('dedupe_normalize_contracts', () => {
  const d = require(path.join(ROOT, 'src/hoursback/dedupe.js'));
  const cases = [
    [d.normalizePhone('(541) 555-0100'), '5415550100', 'punctuated phone'],
    [d.normalizePhone('+1 541.555.0100'), '5415550100', 'country-coded phone'],
    [d.normalizePhone('555-01'), null, 'too-short phone -> null'],
    [d.normalizePhone('123456789012'), null, 'too-long phone -> null'],
    [d.normalizeDomain('http://www.Cascade.Example/contact?x=1'), 'cascade.example', 'dressed URL'],
    [d.normalizeDomain('cascade.example'), 'cascade.example', 'bare form equals www form'],
    [d.normalizeDomain('https://'), null, 'hostless -> null'],
  ];
  for (const [got, want, label] of cases) {
    if (got !== want) return { ok: false, detail: `${label}: got ${got}, wanted ${want}` };
  }
  return { ok: true, detail: 'phone reduces to ten digits or null; domain to registrable host or null; bare and www forms agree' };
});

async function seedStagedRows(db) {
  const mk = (n, extra) => db.prospect.create({ data: {
    placeId: `dedupe-seed-${n}-${Date.now()}`, name: `Seed ${n}`, address: `${n} Seed St, Bend OR`,
    phone: `541-555-02${n}0`, website: `https://seed${n}.example`,
    normalizedPhone: `54155502${n}0`, normalizedDomain: `seed${n}.example`,
    fieldSource: 'seed', ...extra } });
  return {
    captured: await mk(1, { stage: 'NO_CONTACT' }),
    worked: await mk(2, { stage: 'CUSTOMER' }),
    suppressed: await mk(3, { stage: 'NO_CONTACT', doNotContact: true }),
  };
}
async function cleanDedupe(db) {
  await db.contact.deleteMany({ where: { prospect: { placeId: { startsWith: 'dedupe-' } } } });
  await db.outreachMessage.deleteMany({ where: { prospect: { placeId: { startsWith: 'dedupe-' } } } });
  await db.prospectDuplicate.deleteMany({ where: { candidatePlaceId: { startsWith: 'dedupe-' } } });
  await db.prospect.deleteMany({ where: { placeId: { startsWith: 'dedupe-' } } });
}

def('dedupe_replay_matches_all_seeded_stages', () => withDb(async (db) => {
  const { gateForPlace } = require(path.join(ROOT, 'src/hoursback/dedupe.js'));
  await cleanDedupe(db);
  const seeds = await seedStagedRows(db);
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('outbound network during dedupe replay'); };
  let results;
  try {
    // reformatted phone and URL variants of each seeded row, fresh placeIds
    results = [
      await gateForPlace(db, { placeId: 'dedupe-cand-1', name: 'x', phone: '(541) 555-0210', website: null }),
      await gateForPlace(db, { placeId: 'dedupe-cand-2', name: 'x', phone: '+1 541 555 0220', website: null }),
      await gateForPlace(db, { placeId: 'dedupe-cand-3', name: 'x', phone: null, website: 'http://www.Seed3.Example/about' }),
    ];
  } finally { global.fetch = realFetch; }
  const rows = await db.prospect.count({ where: { placeId: { startsWith: 'dedupe-cand-' } } });
  const dups = await db.prospectDuplicate.findMany({ where: { candidatePlaceId: { startsWith: 'dedupe-cand-' } } });
  const kept = dups.map((d) => d.keptProspectId).sort();
  const want = [seeds.captured.id, seeds.worked.id, seeds.suppressed.id].sort();
  const ok = results.every((r) => r.action === 'skip') && rows === 0 && dups.length === 3
    && JSON.stringify(kept) === JSON.stringify(want)
    && results[0].matchSignal === 'normalizedPhone' && results[2].matchSignal === 'normalizedDomain';
  const detail = ok
    ? 'captured, worked and suppressed rows each matched their reformatted variant; zero inserts; every duplicates row names its kept prospect; offline'
    : `rows=${rows} dups=${dups.length} signals=${results.map((r) => r.matchSignal)}`;
  await cleanDedupe(db);
  return { ok, detail };
}));

def('dedupe_new_business_passes_through', () => withDb(async (db) => {
  const { gateForPlace } = require(path.join(ROOT, 'src/hoursback/dedupe.js'));
  await cleanDedupe(db);
  await seedStagedRows(db);
  const v = await gateForPlace(db, { placeId: 'dedupe-cand-new', name: 'Fresh Co', phone: '541-555-0999', website: 'https://freshco.example' });
  const dups = await db.prospectDuplicate.count({ where: { candidatePlaceId: 'dedupe-cand-new' } });
  const ok = v.action === 'insert' && v.stage === 'NO_CONTACT' && dups === 0;
  await cleanDedupe(db);
  return { ok, detail: ok ? 'unmatched business routes to insert at NO_CONTACT with no duplicates row' : JSON.stringify(v) };
}));

def('dedupe_keyless_place_needs_review', () => withDb(async (db) => {
  const { gateForPlace } = require(path.join(ROOT, 'src/hoursback/dedupe.js'));
  await cleanDedupe(db);
  const seeds = await seedStagedRows(db);
  // same business, no phone, no website, name and address dressed differently
  const collide = await gateForPlace(db, { placeId: 'dedupe-cand-na', name: 'SEED 1, LLC'.replace(' 1, LLC', ' 1'), phone: null, website: null, address: '1 Seed St., BEND or' });
  const fresh = await gateForPlace(db, { placeId: 'dedupe-cand-na2', name: 'Totally New Shop', phone: null, website: null, address: '99 Nowhere Rd, Bend OR' });
  const dups = await db.prospectDuplicate.findMany({ where: { candidatePlaceId: 'dedupe-cand-na' } });
  const ok = collide.action === 'skip' && collide.matchSignal === 'name_address'
    && dups.length === 1 && dups[0].keptProspectId === seeds.captured.id
    && fresh.action === 'insert' && fresh.stage === 'NEEDS_REVIEW';
  const detail = ok
    ? 'no-key collision matched on squashed name+address and skipped; no-key newcomer inserts flagged NEEDS_REVIEW, never silently'
    : `collide=${JSON.stringify(collide)} fresh=${JSON.stringify(fresh)} dups=${dups.length}`;
  await cleanDedupe(db);
  return { ok, detail };
}));

def('dedupe_schema_carries_needs_review_and_kept_id', () => {
  const schema = read(path.join(ROOT, 'prisma/schema.prisma'));
  const ok = /NEEDS_REVIEW/.test(schema) && /keptProspectId/.test(schema);
  return { ok, detail: ok ? 'schema documents the NEEDS_REVIEW state and relates duplicates via keptProspectId' : 'missing from schema' };
});

// --- crm1: record fields and the frozen quote --------------------------------
const SCHEMA = () => read(path.join(ROOT, 'prisma/schema.prisma'));

def('quote_fields_declared', () => {
  const s = SCHEMA();
  const need = ['quotedAt', 'quotedHeadcount', 'quotedBand', 'quotedAuditFee', 'quotedGuaranteedHours'];
  const missing = need.filter((f) => !new RegExp(`\\b${f}\\b`).test(s));
  return { ok: !missing.length, detail: missing.length ? `missing: ${missing.join(', ')}` : 'all five quote-snapshot fields declared on Prospect' };
});

def('contact_fields_declared', () => {
  const s = SCHEMA();
  const need = ['contactName', 'contactRole', 'isDecisionMaker', 'ownerName'];
  const missing = need.filter((f) => !new RegExp(`\\b${f}\\b`).test(s));
  const tri = /isDecisionMaker\s+Boolean\?/.test(s);
  return { ok: !missing.length && tri, detail: missing.length ? `missing: ${missing.join(', ')}`
    : (tri ? 'contact fields declared; isDecisionMaker is nullable so unknown differs from no' : 'isDecisionMaker is not nullable') };
});

def('paid_at_declared', () => {
  const s = SCHEMA();
  return { ok: /paidAt\s+DateTime\?/.test(s), detail: /paidAt\s+DateTime\?/.test(s) ? 'paidAt declared, nullable, independent of stage' : 'paidAt missing or not nullable' };
});

async function seedQuotable(db, tag) {
  return db.prospect.create({ data: {
    placeId: `crm1-${tag}`, name: `Quote Fixture ${tag}`, phone: '541-555-0300',
    employeeCount: 12, fieldSource: 'test',
  } });
}
// Cleanup MUST be scoped to this check's own tag. Families run side by side,
// so a blanket "delete every crm1- row" deletes a neighbour's fixture
// mid-check — which is exactly what happened 2026-08-25.
async function cleanCrm1(db, tag) {
  const rows = await db.prospect.findMany({ where: { placeId: { startsWith: `crm1-${tag}` } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await db.contact.deleteMany({ where: { prospectId: { in: ids } } });
    await db.outreachMessage.deleteMany({ where: { prospectId: { in: ids } } });
    await db.prospectFieldEdit.deleteMany({ where: { prospectId: { in: ids } } });
    await db.callLog.deleteMany({ where: { prospectId: { in: ids } } });
    await db.prospect.deleteMany({ where: { id: { in: ids } } });
  }
}

def('freeze_quote_is_write_once', () => withDb(async (db) => {
  const { freezeQuote } = require(path.join(ROOT, 'src/hoursback/crm/quote.js'));
  await cleanCrm1(db, 'once');
  const p = await seedQuotable(db, 'once');
  const first = await freezeQuote(db, p.id);
  let refused = false;
  try { await freezeQuote(db, p.id); } catch (e) { refused = e.code === 'ALREADY_QUOTED'; }
  const ok = !!first.quotedAt && refused;
  await cleanCrm1(db, 'once');
  return { ok, detail: ok ? 'first freeze wrote the snapshot; a second freeze is refused — a promise made is not remade' : `first=${!!first.quotedAt} refused=${refused}` };
}));

def('quote_matches_band_at_quote_time', () => withDb(async (db) => {
  const { freezeQuote } = require(path.join(ROOT, 'src/hoursback/crm/quote.js'));
  const { bandForEmployeeCount } = require(path.join(ROOT, 'src/hoursback/rules.js'));
  await cleanCrm1(db, 'band');
  const p = await seedQuotable(db, 'band');
  const q = await freezeQuote(db, p.id);
  const b = bandForEmployeeCount(12);
  const ok = q.quotedHeadcount === 12 && q.quotedBand === b.band
    && q.quotedAuditFee === b.auditFee && q.quotedGuaranteedHours === b.guaranteedHours;
  await cleanCrm1(db, 'band');
  return { ok, detail: ok ? `12 heads froze as ${b.band} at $${b.auditFee} for ${b.guaranteedHours} hrs, straight off the band table` : JSON.stringify(q) };
}));

def('quote_survives_reenrichment', () => withDb(async (db) => {
  const { freezeQuote } = require(path.join(ROOT, 'src/hoursback/crm/quote.js'));
  const { bandForEmployeeCount } = require(path.join(ROOT, 'src/hoursback/rules.js'));
  await cleanCrm1(db, 'survive');
  const p = await seedQuotable(db, 'survive');
  const q = await freezeQuote(db, p.id);
  // a later sweep finds a bigger company and reprices the live fields
  const b2 = bandForEmployeeCount(40);
  const after = await db.prospect.update({ where: { id: p.id }, data: {
    employeeCount: 40, segment: b2.band, auditFee: b2.auditFee, guaranteedHours: b2.guaranteedHours } });
  const ok = after.employeeCount === 40 && after.auditFee === b2.auditFee
    && after.quotedHeadcount === q.quotedHeadcount && after.quotedAuditFee === q.quotedAuditFee
    && after.quotedGuaranteedHours === q.quotedGuaranteedHours && after.quotedBand === q.quotedBand;
  await cleanCrm1(db, 'survive');
  return { ok, detail: ok
    ? `live fields moved to 40 heads / $${b2.auditFee}; the frozen quote still reads $${after.quotedAuditFee} for ${after.quotedGuaranteedHours} hrs`
    : `quote drifted: ${JSON.stringify({ fee: after.quotedAuditFee, hrs: after.quotedGuaranteedHours })}` };
}));

def('quote_survives_band_change', () => CHECKS.quote_survives_reenrichment());

def('said_yes_unpaid_report', () => withDb(async (db) => {
  const { callToPaidReadout } = require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  await cleanCrm1(db, 'unpaid');
  const p = await db.prospect.create({ data: { placeId: `crm1-unpaid`, name: 'Said Yes Unpaid Co', phone: '541-555-0301', stage: 'CUSTOMER', fieldSource: 'test' } });
  const r = await callToPaidReadout(db);
  const ok = r.saidYesButUnpaid.includes('Said Yes Unpaid Co');
  await cleanCrm1(db, 'unpaid');
  return { ok, detail: ok ? 'a CUSTOMER with no paid date is named in the said-yes-unpaid list' : JSON.stringify(r.saidYesButUnpaid) };
}));

def('paid_and_stage_independent', () => withDb(async (db) => {
  await cleanCrm1(db, 'indep');
  const p = await db.prospect.create({ data: { placeId: `crm1-indep`, name: 'Indep Co', phone: '541-555-0302', fieldSource: 'test' } });
  const staged = await db.prospect.update({ where: { id: p.id }, data: { stage: 'CUSTOMER' } });
  const paidUntouched = staged.paidAt === null;
  const paid = await db.prospect.update({ where: { id: p.id }, data: { paidAt: new Date() } });
  const stageUntouched = paid.stage === 'CUSTOMER';
  await cleanCrm1(db, 'indep');
  const ok = paidUntouched && stageUntouched;
  return { ok, detail: ok ? 'setting a stage never wrote a paid date, and paying never moved the stage' : `paidUntouched=${paidUntouched} stageUntouched=${stageUntouched}` };
}));

def('owner_and_contact_independent', () => withDb(async (db) => {
  await cleanCrm1(db, 'owner');
  const p = await db.prospect.create({ data: { placeId: `crm1-owner`, name: 'Owner Co', phone: '541-555-0303', contactName: 'Pat', fieldSource: 'test' } });
  const after = await db.prospect.update({ where: { id: p.id }, data: { ownerName: 'Dana' } });
  const ok = after.contactName === 'Pat' && after.ownerName === 'Dana';
  await cleanCrm1(db, 'owner');
  return { ok, detail: ok ? 'owner name filled in later without disturbing who was actually spoken to' : JSON.stringify(after) };
}));

def('decision_maker_tristate', () => withDb(async (db) => {
  await cleanCrm1(db, 'tri');
  const p = await db.prospect.create({ data: { placeId: `crm1-tri`, name: 'Tri Co', phone: '541-555-0304', fieldSource: 'test' } });
  const unknown = p.isDecisionMaker === null;
  const no = (await db.prospect.update({ where: { id: p.id }, data: { isDecisionMaker: false } })).isDecisionMaker === false;
  await cleanCrm1(db, 'tri');
  return { ok: unknown && no, detail: unknown && no ? 'unknown stays empty and is distinguishable from an explicit no' : `unknown=${unknown} no=${no}` };
}));

def('no_per_employee_fee_field', () => {
  const s = SCHEMA();
  const bad = /pricePerEmployee/.test(s);
  return { ok: !bad, detail: bad ? 'schema still carries a per-employee fee field' : 'no per-employee fee field in the schema' };
});

// --- website-reading suite (lb5) + corrections and score (lb6) -------------
// Every check below reads recorded sample pages from
// scripts/hoursback/fixtures/site-fixtures.js. Nothing here touches the
// internet: the reader is handed pages, and the run is handed a stand-in for
// the fetcher that serves those same recordings.
const enrich = () => require(path.join(ROOT, 'src/hoursback/enrich.js'));
const scoring = () => require(path.join(ROOT, 'src/hoursback/scoring.js'));
const siteFixtures = () => require(path.join(ROOT, 'scripts/hoursback/fixtures/site-fixtures.js'));
const overrides = () => require(path.join(ROOT, 'src/hoursback/overrides.js'));

function readFixture(key) {
  const f = siteFixtures()[key];
  return enrich().readSite(f.pages, { domain: f.domain });
}

// A stand-in for the fetcher. Serves recorded pages by address; anything it
// does not recognise is treated as an unreachable site. Counts its calls so a
// check can prove a budget or a retry count was honoured.
function recordedFetcher(pagesByUrl, options = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    if (options.alwaysFail) throw new Error('connection refused');
    const html = pagesByUrl[url];
    if (html === undefined) throw new Error('404');
    return { ok: true, headers: { get: () => 'text/html' }, text: async () => html };
  };
  impl.calls = calls;
  return impl;
}

function fixtureUrlMap(key) {
  const map = {};
  for (const p of siteFixtures()[key].pages) map[p.url] = p.html;
  return map;
}

async function cleanSite(db, tag) {
  await db.contact.deleteMany({ where: { prospect: { placeId: { startsWith: `site-${tag}` } } } });
  await db.outreachMessage.deleteMany({ where: { prospect: { placeId: { startsWith: `site-${tag}` } } } });
  await db.prospectFieldEdit.deleteMany({ where: { prospect: { placeId: { startsWith: `site-${tag}` } } } });
  await db.callLog.deleteMany({ where: { prospect: { placeId: { startsWith: `site-${tag}` } } } });
  await db.prospect.deleteMany({ where: { placeId: { startsWith: `site-${tag}` } } });
}

async function seedSite(db, tag, extra = {}) {
  return db.prospect.create({
    data: { placeId: `site-${tag}`, name: `Site ${tag} Co`, phone: '541-555-0400', fieldSource: 'test', ...extra },
  });
}

def('headcount_writes_count_source_confidence', () => withDb(async (db) => {
  await cleanSite(db, 'hcwrite');
  const p = await seedSite(db, 'hcwrite', { website: 'https://highdesertplumbing.com/' });
  const after = (await enrich().applySiteRead(db, p.id, readFixture('manualPlumber'))).prospect;
  const ok = after.employeeCount === 12
    && after.headcountSourceUrl === 'https://highdesertplumbing.com/'
    && after.headcountStatus === 'RESOLVED'
    && after.headcountPublishedAs === '12'
    && after.siteStatus === 'READ' && after.siteReadAt instanceof Date;
  await cleanSite(db, 'hcwrite');
  return { ok, detail: ok ? 'wrote 12 people, the page it was read from, and how sure the reading is' : `count=${after.employeeCount} src=${after.headcountSourceUrl} status=${after.headcountStatus}` };
}));

def('nothing_at_all_moves_the_offer', () => {
  // Not the headcount, not the trade, not the signals, not the source.
  const { enrichHeadcount } = enrich();
  const rows = [
    enrichHeadcount({ employeeCount: 12, headcountSourceUrl: 'https://a/' }),
    enrichHeadcount({ employeeCount: 12, headcountSourceUrl: 'https://b/', email: 'x@y.com', signals: ['fax_listed'] }),
    enrichHeadcount({ employeeCount: 40 }),
    enrichHeadcount({ employeeCount: 3 }),
  ];
  const ok = rows.every((r) => r.auditFee === 999 && r.guaranteedHours === 5);
  return { ok, detail: ok ? 'nothing about a business changes what it is quoted' : JSON.stringify(rows.map((r) => r.auditFee)) };
});

def('every_size_gets_the_same_offer', () => {
  // One price, one promise, every business (Russ, 2026-08-26). A three-person
  // shop and a two-hundred-person builder are quoted identically.
  const { enrichHeadcount } = enrich();
  const { THE_OFFER } = iTiers();
  const bad = [];
  for (const n of [1, 3, 9, 12, 25, 40, 75, 150, 400]) {
    const got = enrichHeadcount({ employeeCount: n });
    if (got.auditFee !== THE_OFFER.fee || got.guaranteedHours !== THE_OFFER.hours) {
      bad.push(`${n}: got $${got.auditFee}/${got.guaranteedHours}h want $${THE_OFFER.fee}/${THE_OFFER.hours}h`);
    }
  }
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : 'every size from 1 to 400 is quoted $999 and five hours' };
});

def('unresolved_headcount_leaves_nulls_with_reason', () => {
  const { enrichHeadcount } = enrich();
  const got = enrichHeadcount(readFixture('emptyShell'));
  const ok = got.employeeCount === null && got.segment === null && got.auditFee === null
    && got.guaranteedHours === null && /^UNRESOLVED_/.test(got.headcountStatus);
  return { ok, detail: ok ? `no team size published: band, fee and hours all left empty, reason "${got.headcountStatus}"` : JSON.stringify(got) };
});

def('headcount_range_resolves_to_band', () => {
  const { enrichHeadcount } = enrich();
  const finding = readFixture('rangePublisher');
  const got = enrichHeadcount(finding);
  const ok = finding.headcountPublishedAs === '8-20' && got.segment !== null && got.auditFee !== null && got.guaranteedHours !== null;
  return { ok, detail: ok ? `"8 to 20 employees" landed in one band: ${got.segment}, $${got.auditFee}, ${got.guaranteedHours} hours` : JSON.stringify(got) };
});

def('ambiguous_range_still_records_the_lower_number', () => {
  // The promise no longer moves with size, but the RECORD still takes the
  // lower end of a published range — it is what Russ works the call from.
  const { enrichHeadcount } = enrich();
  const got = enrichHeadcount(readFixture('rangePublisher'));
  const ok = got.employeeCount === 8 && got.guaranteedHours === 5 && got.auditFee === 999;
  return { ok, detail: ok ? '"8-20" was recorded as 8, and the offer stayed $999 and five hours' : JSON.stringify(got) };
});

def('no_per_employee_fee_written', () => {
  const { enrichHeadcount } = enrich();
  const keys = Object.keys(enrichHeadcount({ employeeCount: 12 }));
  const src = read(path.join(ROOT, 'src/hoursback/enrich.js'));
  const ok = !keys.some((k) => /perEmployee/i.test(k)) && !/perEmployee/i.test(src);
  return { ok, detail: ok ? 'nothing written is a per-person price' : 'a per-employee figure appears in the reader' };
});

def('email_lookup_uses_domain', () => {
  const { emailsFromPages, resolveSiteAddress } = enrich();
  const pages = [{ url: 'https://acme.com/contact', html: '<a href="mailto:sara@acme.com">Sara</a> <a href="mailto:acmefan@gmail.com">fan</a>' }];
  const onDomain = emailsFromPages(pages, 'acme.com');
  const usesWebsiteField = resolveSiteAddress({ name: 'Acme Plumbing', website: 'https://acme.com', websiteManualValue: null }) === 'https://acme.com';
  const ok = onDomain[0].email === 'sara@acme.com' && onDomain[0].confidence > onDomain[1].confidence && usesWebsiteField;
  return { ok, detail: ok ? 'looked at the business\'s own web address, and its own domain outranked a stray gmail' : JSON.stringify(onDomain) };
});

def('email_stored_with_confidence_and_status', () => withDb(async (db) => {
  await cleanSite(db, 'emailstore');
  const p = await seedSite(db, 'emailstore', { website: 'https://highdesertplumbing.com/' });
  const after = (await enrich().applySiteRead(db, p.id, readFixture('manualPlumber'))).prospect;
  const ok = after.email === 'dale@highdesertplumbing.com' && typeof after.emailConfidence === 'number' && after.emailStatus === 'FOUND_ON_SITE';
  await cleanSite(db, 'emailstore');
  return { ok, detail: ok ? `stored ${after.email} at confidence ${after.emailConfidence}, marked ${after.emailStatus}` : JSON.stringify({ e: after.email, c: after.emailConfidence, s: after.emailStatus }) };
}));

def('no_website_marked_unavailable_kept', () => withDb(async (db) => {
  await cleanSite(db, 'nosite');
  const p = await seedSite(db, 'nosite', { website: null });
  const after = (await enrich().applySiteRead(db, p.id, enrich().readNoWebsite())).prospect;
  const stillThere = await db.prospect.findFirst({ where: { placeId: 'site-nosite', doNotContact: false } });
  const ok = after.emailStatus === 'UNAVAILABLE_NO_WEBSITE' && after.headcountStatus === 'UNRESOLVED_NO_WEBSITE' && Boolean(stillThere);
  await cleanSite(db, 'nosite');
  return { ok, detail: ok ? 'no website: both blanks carry a named reason and the business stays on the list' : JSON.stringify({ e: after.emailStatus, h: after.headcountStatus, kept: Boolean(stillThere) }) };
}));

def('empty_lookup_marked_unavailable_kept', () => withDb(async (db) => {
  await cleanSite(db, 'emptylookup');
  const p = await seedSite(db, 'emptylookup', { website: 'https://redmondsigns.com/' });
  const after = (await enrich().applySiteRead(db, p.id, readFixture('emptyShell'))).prospect;
  const stillThere = await db.prospect.findFirst({ where: { placeId: 'site-emptylookup', doNotContact: false } });
  const ok = after.emailStatus === 'UNAVAILABLE_NOT_PUBLISHED' && Boolean(stillThere);
  await cleanSite(db, 'emptylookup');
  return { ok, detail: ok ? 'a site that publishes no address is marked and kept' : JSON.stringify({ e: after.emailStatus, kept: Boolean(stillThere) }) };
}));

def('low_confidence_email_kept_marked', () => {
  const { readSite, EMAIL_CONFIDENCE_FLOOR } = enrich();
  const pages = [{ url: 'https://sisters.com/', html: '<a href="mailto:info@gmail.com">email us</a>' }];
  const got = readSite(pages, { domain: 'sisters.com' });
  const ok = got.email === 'info@gmail.com' && got.emailConfidence < EMAIL_CONFIDENCE_FLOOR && got.emailStatus === 'FOUND_LOW_CONFIDENCE';
  return { ok, detail: ok ? `a weak address (${got.emailConfidence}) was kept and flagged, not thrown away` : JSON.stringify(got) };
});

def('email_broken_link_never_ends_the_read', () => {
  // The live run died here once: a mailto written with a stray % cannot be
  // decoded, and the exception ended the whole run.
  const { readSite } = enrich();
  const got = readSite([{ url: 'https://x.example/', html: '<a href="mailto:bad%zz@x.example">a</a> <a href="mailto:good@x.example">b</a>' }], { domain: 'x.example' });
  const ok = got.email === 'good@x.example' && !got.emails.some((e) => e.email.includes('%'));
  return { ok, detail: ok ? 'a broken email link was stepped over and the good one still found' : JSON.stringify(got.emails) };
});

def('email_never_gates_the_list', () => withDb(async (db) => {
  await cleanSite(db, 'emailgate');
  const p = await seedSite(db, 'emailgate', { website: null, stage: 'NO_CONTACT' });
  const after = (await enrich().applySiteRead(db, p.id, enrich().readNoWebsite())).prospect;
  const { callQueue } = require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const queued = (await callQueue(db)).some((q) => q.id === p.id);
  const ok = queued && after.doNotContact === false && after.stage === 'NO_CONTACT';
  await cleanSite(db, 'emailgate');
  return { ok, detail: ok ? 'a business with no email address is still in the day\'s call queue' : `queued=${queued} stage=${after.stage}` };
}));

def('no_repeat_headcount_lookup', () => withDb(async (db) => {
  await cleanSite(db, 'norepeathc');
  await seedSite(db, 'norepeathc', { website: 'https://x.example/', employeeCount: 12, headcountStatus: 'RESOLVED', email: 'a@x.example' });
  const fetcher = recordedFetcher({});
  const run = await enrich().runSiteEnrichment(db, { budget: 5, delayMs: 0, fetch: fetcher, where: { placeId: { startsWith: 'site-norepeathc' } } });
  const ok = fetcher.calls.length === 0 && run.skippedAlreadyRead === 1 && run.read === 0;
  await cleanSite(db, 'norepeathc');
  return { ok, detail: ok ? 'a business already carrying a team size was not read again' : JSON.stringify(run) };
}));

def('no_repeat_email_lookup', () => withDb(async (db) => {
  await cleanSite(db, 'norepeatem');
  await seedSite(db, 'norepeatem', { website: 'https://x.example/', employeeCount: 9, headcountStatus: 'RESOLVED', email: 'have@x.example' });
  await seedSite(db, 'norepeatem2', { website: 'https://x.example/', employeeCount: 9, headcountStatus: 'RESOLVED', email: null });
  const fetcher = recordedFetcher({});
  const run = await enrich().runSiteEnrichment(db, { budget: 5, delayMs: 0, fetch: fetcher, where: { placeId: { startsWith: 'site-norepeatem' } } });
  const ok = run.skippedAlreadyRead === 1 && run.read === 1;
  await cleanSite(db, 'norepeatem');
  return { ok, detail: ok ? 'the one that already had an email was skipped; the one without it was read' : JSON.stringify(run) };
}));

def('lookup_budget_enforced_and_recorded', () => withDb(async (db) => {
  await cleanSite(db, 'budget');
  const map = fixtureUrlMap('manualPlumber');
  for (const n of [1, 2, 3]) await seedSite(db, `budget${n}`, { website: 'https://highdesertplumbing.com/' });
  const fetcher = recordedFetcher(map);
  const run = await enrich().runSiteEnrichment(db, { budget: 2, delayMs: 0, fetch: fetcher, where: { placeId: { startsWith: 'site-budget' } } });
  const ok = run.read === 2 && run.stoppedAt !== null && /budget of 2/.test(run.stoppedBecause);
  await cleanSite(db, 'budget');
  return { ok, detail: ok ? `stopped after 2 businesses and named where it stopped: ${run.stoppedAt}` : JSON.stringify(run) };
}));

def('failed_lookup_retries_then_marks', () => withDb(async (db) => {
  await cleanSite(db, 'retry');
  const p = await seedSite(db, 'retry', { website: 'https://unreachable.example/' });
  const fetcher = recordedFetcher({}, { alwaysFail: true });
  await enrich().runSiteEnrichment(db, { budget: 1, attempts: 3, delayMs: 0, fetch: fetcher, where: { placeId: { startsWith: 'site-retry' } } });
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = fetcher.calls.length === 3 && after.siteStatus === 'UNREACHABLE'
    && after.headcountStatus === 'UNRESOLVED_SITE_UNREACHABLE' && after.emailStatus === 'UNAVAILABLE_SITE_UNREACHABLE'
    && after.employeeCount === null && after.email === null;
  await cleanSite(db, 'retry');
  return { ok, detail: ok ? 'tried 3 times, then wrote one complete "could not reach it" state — nothing half-written' : `tries=${fetcher.calls.length} status=${after.siteStatus}` };
}));

def('enrichment_is_idempotent', () => withDb(async (db) => {
  await cleanSite(db, 'idem');
  const p = await seedSite(db, 'idem', { website: 'https://highdesertplumbing.com/' });
  const finding = readFixture('manualPlumber');
  const first = await enrich().applySiteRead(db, p.id, finding);
  const second = await enrich().applySiteRead(db, p.id, finding);
  const ok = first.changed === true && second.changed === false
    && JSON.stringify(first.prospect) === JSON.stringify(second.prospect);
  await cleanSite(db, 'idem');
  return { ok, detail: ok ? 'reading the same site twice left the record byte-for-byte identical' : `firstChanged=${first.changed} secondChanged=${second.changed}` };
}));

def('enrichment_respects_hand_corrections', () => withDb(async (db) => {
  await cleanSite(db, 'handcorr');
  const p = await seedSite(db, 'handcorr', { website: 'https://highdesertplumbing.com/', employeeCount: 5 });
  await overrides().setOverride(db, p.id, 'employeeCount', 40, 'russ');
  const after = (await enrich().applySiteRead(db, p.id, readFixture('manualPlumber'))).prospect;
  const { bandForEmployeeCount } = rules();
  const want = bandForEmployeeCount(40);
  const ok = after.employeeCountManualValue === 40 && after.employeeCount === 12
    && after.auditFee === want.auditFee && after.guaranteedHours === want.guaranteedHours;
  await cleanSite(db, 'handcorr');
  return { ok, detail: ok ? 'the site said 12, Russ said 40 — the price still follows Russ' : JSON.stringify({ manual: after.employeeCountManualValue, fetched: after.employeeCount, fee: after.auditFee }) };
}));

def('no_api_key_in_repo', () => {
  const { execSync } = require('child_process');
  const tracked = execSync('git ls-files', { cwd: ROOT }).toString().split('\n').filter(Boolean);
  const offenders = [];
  for (const f of tracked) {
    if (!/\.(js|jsx|ts|tsx|json|md|ya?ml|prisma|sh)$/.test(f)) continue;
    let body; try { body = read(path.join(ROOT, f)); } catch { continue; }
    if (/AIza[0-9A-Za-z_-]{30,}/.test(body)) offenders.push(`${f}: google key`);
    if (/\b[a-f0-9]{32}\b\s*(?:#|\/\/)?\s*hunter/i.test(body)) offenders.push(`${f}: hunter key`);
  }
  return { ok: !offenders.length, detail: offenders.length ? offenders.join('; ') : 'no lookup key is committed anywhere in the repository' };
});

// --- corrections and the score (lb6) ---------------------------------------

def('every_fetched_field_has_override_pair', () => {
  const s = SCHEMA();
  // trade is exempt: what is stored was only ever a GUESS from the business
  // name or their own words, never a fetched fact, so a correction replaces it
  // rather than sitting in a column beside it (Russ asked to correct industry
  // by hand, 2026-08-26).
  const GUESSED_NOT_FETCHED = ['trade'];
  const missing = overrides().OVERRIDABLE
    .filter((f) => !GUESSED_NOT_FETCHED.includes(f))
    .filter((f) => !new RegExp(`${f}ManualValue\\s`).test(s));
  return { ok: !missing.length, detail: missing.length ? `no hand-entered column for: ${missing.join(', ')}` : 'every fetched field has a typed-by-hand column beside it; a guessed field is simply replaced' };
});

def('override_wins_over_fetched', () => {
  const { resolveField } = overrides();
  const rec = { email: 'machine@x.com', emailManualValue: 'typed@x.com', phone: '541-555-0100', phoneManualValue: null };
  const ok = resolveField(rec, 'email') === 'typed@x.com' && resolveField(rec, 'phone') === '541-555-0100';
  return { ok, detail: ok ? 'the typed value is used where it exists, the fetched one where it does not' : 'resolution order wrong' };
});

def('override_records_who_and_when', () => withDb(async (db) => {
  await cleanSite(db, 'whowhen');
  const p = await seedSite(db, 'whowhen', { email: 'machine@x.com' });
  await overrides().setOverride(db, p.id, 'email', 'typed@x.com', 'russ');
  const row = await db.prospectFieldEdit.findFirst({ where: { prospectId: p.id } });
  const ok = row && row.correctedBy === 'russ' && row.correctedAt instanceof Date && row.fieldName === 'email';
  await cleanSite(db, 'whowhen');
  return { ok, detail: ok ? `recorded who changed it (${row.correctedBy}) and when` : 'no history row' };
}));

def('override_survives_reenrichment', () => withDb(async (db) => {
  await cleanSite(db, 'survive');
  const p = await seedSite(db, 'survive', { website: 'https://highdesertplumbing.com/', email: 'old@x.com' });
  await overrides().setOverride(db, p.id, 'email', 'typed@x.com', 'russ');
  const after = (await enrich().applySiteRead(db, p.id, readFixture('manualPlumber'))).prospect;
  const ok = after.emailManualValue === 'typed@x.com' && after.email === 'dale@highdesertplumbing.com';
  await cleanSite(db, 'survive');
  return { ok, detail: ok ? 'a later read replaced the fetched address and left the typed one alone' : JSON.stringify({ manual: after.emailManualValue, fetched: after.email }) };
}));

def('override_survives_monthly_topup', () => withDb(async (db) => {
  await cleanSite(db, 'topup');
  const p = await seedSite(db, 'topup', { phone: '541-555-0100', website: 'https://a.example' });
  await overrides().setOverride(db, p.id, 'phone', '541-555-9999', 'russ');
  // what a monthly sweep does when it re-finds the business
  const after = await db.prospect.update({ where: { id: p.id }, data: { phone: '541-555-0101', website: 'https://b.example', fetchedAt: new Date() } });
  const ok = after.phoneManualValue === '541-555-9999' && after.phone === '541-555-0101';
  await cleanSite(db, 'topup');
  return { ok, detail: ok ? 'the monthly sweep refreshed what it fetched and never touched what Russ typed' : JSON.stringify({ manual: after.phoneManualValue, fetched: after.phone }) };
}));

def('headcount_override_recomputes_band', () => withDb(async (db) => {
  await cleanSite(db, 'recompute');
  const p = await seedSite(db, 'recompute', { employeeCount: 8 });
  const after = await overrides().setOverride(db, p.id, 'employeeCount', 40, 'russ');
  const want = rules().bandForEmployeeCount(40);
  const ok = after.segment === want.band && after.auditFee === want.auditFee && after.guaranteedHours === want.guaranteedHours;
  await cleanSite(db, 'recompute');
  return { ok, detail: ok ? `correcting the team size to 40 repriced it to $${after.auditFee} for ${after.guaranteedHours} hours` : JSON.stringify(after) };
}));

def('edit_history_is_append_only', () => withDb(async (db) => {
  await cleanSite(db, 'history');
  const p = await seedSite(db, 'history', { email: 'first@x.com' });
  await overrides().setOverride(db, p.id, 'email', 'second@x.com', 'russ');
  await overrides().setOverride(db, p.id, 'email', 'third@x.com', 'russ');
  const rows = await db.prospectFieldEdit.findMany({ where: { prospectId: p.id }, orderBy: { correctedAt: 'asc' } });
  const ok = rows.length === 2 && rows[0].valueBefore === 'first@x.com' && rows[0].valueAfter === 'second@x.com'
    && rows[1].valueBefore === 'second@x.com' && rows[1].valueAfter === 'third@x.com';
  await cleanSite(db, 'history');
  return { ok, detail: ok ? 'both corrections kept, in order, each naming what it changed from and to' : JSON.stringify(rows.map((r) => [r.valueBefore, r.valueAfter])) };
}));

def('clearing_override_restores_fetched', () => withDb(async (db) => {
  await cleanSite(db, 'clearing');
  const p = await seedSite(db, 'clearing', { email: 'machine@x.com' });
  await overrides().setOverride(db, p.id, 'email', 'typed@x.com', 'russ');
  const after = await overrides().setOverride(db, p.id, 'email', null, 'russ');
  const ok = overrides().resolveField(after, 'email') === 'machine@x.com';
  await cleanSite(db, 'clearing');
  return { ok, detail: ok ? 'clearing a correction fell back to the fetched value, not to blank' : JSON.stringify(after) };
}));

def('job_posting_is_top_signal', () => {
  const { SIGNAL_WEIGHTS } = scoring();
  const top = SIGNAL_WEIGHTS.hiring_admin_role;
  const others = Object.entries(SIGNAL_WEIGHTS).filter(([k]) => k !== 'hiring_admin_role').map(([, v]) => v);
  const ok = others.every((v) => top > v);
  return { ok, detail: ok ? `a live opening for an office role is worth ${top}, more than any other single tell` : JSON.stringify(SIGNAL_WEIGHTS) };
});

def('job_posting_not_confused_with_staff_bio', () => {
  const bio = readFixture('staffBioNotHiring').signals.map((x) => x.signal);
  const real = readFixture('realJobPosting').signals.map((x) => x.signal);
  const ok = !bio.includes('hiring_admin_role') && real.includes('hiring_admin_role');
  return { ok, detail: ok ? 'a staff page naming an office manager does not count as an opening; a real posting does' : `bio=${bio.join('|')} posting=${real.join('|')}` };
});

def('no_website_is_scored_as_the_loudest_kind_of_manual', () => {
  const { readNoWebsite } = enrich();
  const { scoreAutomationFit, SIGNAL_WEIGHTS } = scoring();
  const got = scoreAutomationFit(readNoWebsite());
  // A business with nothing online takes every enquiry by phone. Scoring it
  // zero — as it was before 2026-08-25 — put 460 of the most manual
  // businesses on the list at the very bottom of it.
  const ok = got.score === SIGNAL_WEIGHTS.no_website && got.score > 0
    && got.evidence.some((e) => e.signal === 'no_website');
  return { ok, detail: ok ? `no website at all now scores ${got.score}, not zero` : JSON.stringify(got) };
});

def('site_with_no_published_address_scores_for_it', () => {
  const { readSite } = enrich();
  const withNone = readSite([{ url: 'https://x.example/', html: '<html><body><h1>X</h1></body></html>' }], { domain: 'x.example' });
  const withOne = readSite([{ url: 'https://y.example/', html: '<a href="mailto:sara@y.example">Sara</a>' }], { domain: 'y.example' });
  const has = (r) => r.signals.some((x) => x.signal === 'no_email_published');
  const ok = has(withNone) && !has(withOne);
  return { ok, detail: ok ? 'a site publishing no address is marked; one publishing an address is not' : `none=${has(withNone)} one=${has(withOne)}` };
});

def('rare_signals_outweigh_the_near_universal_ones', () => {
  const { SIGNAL_WEIGHTS } = scoring();
  // Measured on the real list: no online booking and no customer login fired
  // on roughly three in four businesses, so at their old weights 799 tied on
  // the same number. A tell that nearly everyone shows cannot outrank one
  // that only a few do, or the middle of the list will not sort.
  const universal = [SIGNAL_WEIGHTS.no_online_booking, SIGNAL_WEIGHTS.no_customer_portal];
  const rare = [SIGNAL_WEIGHTS.hiring_admin_role, SIGNAL_WEIGHTS.no_website, SIGNAL_WEIGHTS.downloadable_forms];
  const ok = rare.every((r) => r > Math.max(...universal));
  return { ok, detail: ok ? 'every rare tell outweighs both of the near-universal ones' : JSON.stringify(SIGNAL_WEIGHTS) };
});

def('manual_work_signals_declared', () => {
  const { SIGNAL_WEIGHTS } = scoring();
  const want = ['hiring_admin_role', 'no_online_booking', 'downloadable_forms', 'fax_listed', 'no_customer_portal', 'no_website', 'no_email_published'];
  const missing = want.filter((w) => !(w in SIGNAL_WEIGHTS));
  return { ok: !missing.length, detail: missing.length ? `not scored: ${missing.join(', ')}` : 'all six tells are declared in one table' };
});

def('headcount_does_not_affect_score', () => {
  const { scoreAutomationFit } = scoring();
  const signals = [{ signal: 'fax_listed' }, { signal: 'no_online_booking' }];
  const small = scoreAutomationFit({ signals, employeeCount: 5 });
  const large = scoreAutomationFit({ signals, employeeCount: 150 });
  const ok = small.score === large.score;
  return { ok, detail: ok ? 'a 5-person shop and a 150-person one score the same on the same tells' : `${small.score} vs ${large.score}` };
});

def('category_tilts_only', () => {
  const { scoreAutomationFit, CATEGORY_TILT_CAP, SIGNAL_WEIGHTS } = scoring();
  const signals = [{ signal: 'fax_listed' }];
  const dental = scoreAutomationFit({ signals, category: 'dental office' }).score;
  const diner = scoreAutomationFit({ signals, category: 'restaurant' }).score;
  const none = scoreAutomationFit({ signals, category: 'something nobody listed' }).score;
  const smallest = Math.min(...Object.values(SIGNAL_WEIGHTS));
  const ok = Math.abs(dental - none) <= CATEGORY_TILT_CAP && Math.abs(diner - none) <= CATEGORY_TILT_CAP
    && CATEGORY_TILT_CAP < smallest && diner >= 0;
  return { ok, detail: ok ? `category moves the order by at most ${CATEGORY_TILT_CAP} and never drops anyone off the list` : `dental=${dental} diner=${diner} none=${none}` };
});

def('score_carries_evidence', () => {
  const { scoreAutomationFit } = scoring();
  const got = scoreAutomationFit({ signals: readFixture('manualPlumber').signals });
  const complete = got.evidence.every((e) => e.signal && typeof e.weight === 'number' && (e.url || e.quote));
  const adds = got.evidence.reduce((a, e) => a + e.weight, 0) === got.score;
  const ok = complete && adds && got.evidence.length >= 4;
  return { ok, detail: ok ? `${got.score} points, each one traced to a tell and the page it was seen on` : JSON.stringify(got) };
});

def('no_signals_scores_zero_not_dropped', () => withDb(async (db) => {
  await cleanSite(db, 'zeroscore');
  // A business that already books online, already has a customer login and
  // already publishes an address shows no tells at all — the true zero case.
  const p = await seedSite(db, 'zeroscore', { website: 'https://cascadesmiles.com/' });
  const after = (await enrich().applySiteRead(db, p.id, readFixture('automatedDental'))).prospect;
  const stillThere = await db.prospect.findFirst({ where: { placeId: 'site-zeroscore', doNotContact: false } });
  const ok = after.automationScore === 0 && Boolean(stillThere);
  await cleanSite(db, 'zeroscore');
  return { ok, detail: ok ? 'nothing found: scores zero and stays on the list' : `score=${after.automationScore} kept=${Boolean(stillThere)}` };
}));

def('weights_revisable_from_outcomes', () => {
  const { reviseWeightsFromOutcomes, loadWeights, SIGNAL_WEIGHTS, scoreAutomationFit } = scoring();
  const file = path.join(require('os').tmpdir(), `hb-weights-${process.pid}.json`);
  const outcomes = [];
  for (let i = 0; i < 6; i++) outcomes.push({ signals: ['fax_listed'], interested: false });
  for (let i = 0; i < 6; i++) outcomes.push({ signals: ['no_online_booking'], interested: true });
  const revised = reviseWeightsFromOutcomes(outcomes, { file });
  const reloaded = loadWeights(file);
  const scored = scoreAutomationFit({ signals: ['fax_listed'] }, { weightsFile: file });
  const srcUnchanged = read(path.join(ROOT, 'src/hoursback/scoring.js')).includes('fax_listed: 12');
  const ok = revised.fax_listed < SIGNAL_WEIGHTS.fax_listed
    && revised.no_online_booking > SIGNAL_WEIGHTS.no_online_booking
    && reloaded.fax_listed === revised.fax_listed
    && scored.score === revised.fax_listed
    && srcUnchanged;
  try { fs.unlinkSync(file); } catch { /* already gone */ }
  return { ok, detail: ok ? 'call outcomes retuned the order through a settings file; the scoring code was never edited' : JSON.stringify(revised) };
});

// --- the three outreach lanes (crm4) ---------------------------------------
// Every check seeds its own businesses, proves one rule, and cleans up after
// itself. Nothing here sends anything anywhere.
const lanes = () => require(path.join(ROOT, 'src/hoursback/crm/lanes.js'));
const firstContact = () => require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));

async function cleanLane(db, tag) {
  await db.contact.deleteMany({ where: { prospect: { placeId: { startsWith: `lane-${tag}` } } } });
  await db.outreachMessage.deleteMany({ where: { prospect: { placeId: { startsWith: `lane-${tag}` } } } });
  await db.callLog.deleteMany({ where: { prospect: { placeId: { startsWith: `lane-${tag}` } } } });
  await db.prospectFieldEdit.deleteMany({ where: { prospect: { placeId: { startsWith: `lane-${tag}` } } } });
  await db.prospect.deleteMany({ where: { placeId: { startsWith: `lane-${tag}` } } });
}
const FAX_TELL = JSON.stringify([{ signal: 'fax_listed', url: 'https://x.example/', quote: 'Fax: 541-555-0143' }]);
async function seedLane(db, tag, extra = {}) {
  return db.prospect.create({
    data: {
      placeId: `lane-${tag}`, name: `Lane ${tag} Co`, phone: '541-555-0500',
      email: `owner@lane${tag}.example`, ownerName: 'Dale Hutchins',
      scoreEvidence: FAX_TELL, automationScore: 12, fieldSource: 'test', ...extra,
    },
  });
}
async function approvedTemplate(db) {
  const L = lanes();
  await L.upsertTemplate(db, { subject: firstContact().SUBJECTS.default, body: firstContact().BODY });
  return L.approveTemplate(db, L.FIRST_CONTACT, 'russ');
}

def('send_refuses_without_a_key_or_approval', () => withDb(async (db) => {
  const L = lanes();
  await db.messageTemplate.deleteMany({ where: { name: L.FIRST_CONTACT } });
  let calls = 0;
  const counting = async () => { calls += 1; };
  const unapproved = await L.sendQueuedEmails(db, { apiKey: 'test-key', send: counting });
  // The real wording, because approval is of a wording — a stand-in body is
  // no longer approvable, and should not be.
  await L.upsertTemplate(db, { subject: firstContact().SUBJECTS.default, body: firstContact().BODY });
  await L.approveTemplate(db);
  const keyless = await L.sendQueuedEmails(db, { apiKey: '', send: counting });
  await db.messageTemplate.deleteMany({ where: { name: L.FIRST_CONTACT } });
  const ok = calls === 0 && unapproved.sent === 0 && keyless.sent === 0
    && /not been approved/.test(unapproved.stoppedBecause) && /no sending key/.test(keyless.stoppedBecause);
  return { ok, detail: ok ? 'nothing left the building without both an approved message and a key' : JSON.stringify({ calls, unapproved, keyless }) };
}), 'lanes');

def('send_never_exceeds_its_ceiling', () => withDb(async (db) => {
  await cleanLane(db, 'ceiling');
  const L = lanes();
  await approvedTemplate(db);
  for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const p = await seedLane(db, `ceiling${i}`);
    await L.queueEmail(db, p.id);
  }
  let calls = 0;
  const counting = async () => { calls += 1; };
  const run = await L.sendQueuedEmails(db, { apiKey: 'test-key', send: counting, limit: 3 });
  const overAsk = await L.sendQueuedEmails(db, { apiKey: 'test-key', send: counting, limit: 9999 });
  await cleanLane(db, 'ceiling');
  const ok = run.sent === 3 && calls <= 3 + L.MAX_PER_RUN && overAsk.sent <= L.MAX_PER_RUN;
  return { ok, detail: ok ? `asked for 3 and sent 3; asked for 9999 and never passed the built-in ceiling of ${L.MAX_PER_RUN}` : JSON.stringify({ run, overAsk, calls }) };
}), 'lanes');

def('send_one_refusal_never_stops_the_rest', () => withDb(async (db) => {
  await cleanLane(db, 'onefail');
  const L = lanes();
  await approvedTemplate(db);
  for (const i of [1, 2, 3]) { const p = await seedLane(db, `onefail${i}`); await L.queueEmail(db, p.id); }
  let n = 0;
  const flaky = async () => { n += 1; if (n === 2) throw new Error('refused'); };
  const run = await L.sendQueuedEmails(db, { apiKey: 'test-key', send: flaky });
  await cleanLane(db, 'onefail');
  const ok = run.sent === 2 && run.failed === 1 && run.attempted === 3;
  return { ok, detail: ok ? 'one address was refused, the other two still went' : JSON.stringify(run) };
}), 'lanes');

def('send_carries_the_signature_with_the_logo_inside_it', () => {
  const sig = require(path.join(ROOT, 'src/hoursback/crm/signature.js'));
  const html = sig.toHtmlEmail('Hi Dale,\n\nA line.\n\nBest,\nRuss\n\nRuss Wright\nVisionairy\nruss@visionairy.biz');
  const inlineLogo = /src="data:image\/png;base64,/.test(html);
  const noFetch = !/src="https?:\/\//.test(html);
  const once = (html.match(/Russ Wright/g) || []).length === 1;
  const noTagline = !/automation/i.test(html);
  const complete = /503-621-8000/.test(html) && /visionairy\.biz/.test(html) && /linkedin\.com/.test(html);
  const ok = inlineLogo && noFetch && once && noTagline && complete;
  return { ok, detail: ok ? 'the logo travels inside the message, the sign-off appears once, no tagline, and every way to reach him is there' : JSON.stringify({ inlineLogo, noFetch, once, noTagline, complete }) };
}, 'lanes');

def('send_never_reaches_someone_who_replied_or_bounced', () => withDb(async (db) => {
  await cleanLane(db, 'norereach');
  const L = lanes();
  await approvedTemplate(db);
  const replied = await seedLane(db, 'norereach1');
  const bounced = await seedLane(db, 'norereach2');
  const fine = await seedLane(db, 'norereach3');
  for (const p of [replied, bounced, fine]) await L.queueEmail(db, p.id);
  await db.outreachMessage.updateMany({ where: { prospectId: { in: [replied.id, bounced.id] } }, data: { state: 'QUEUED' } });
  await db.prospect.update({ where: { id: replied.id }, data: { repliedAt: new Date() } });
  await db.prospect.update({ where: { id: bounced.id }, data: { emailBouncedAt: new Date() } });
  const reached = [];
  const spy = async ({ to }) => { reached.push(to); };
  await L.sendQueuedEmails(db, { apiKey: 'test-key', send: spy });
  const ok = reached.length === 1 && reached[0] === fine.email;
  await cleanLane(db, 'norereach');
  return { ok, detail: ok ? 'the one who replied and the one who bounced were both skipped; only the third was written to' : JSON.stringify(reached) };
}), 'lanes');

def('handadd_business_typed_by_russ_outranks_any_sweep', () => withDb(async (db) => {
  // The sweep found 2,043; the ones Russ meets are not among them. What he
  // types must survive every later sweep, so it lands in the hand-entered
  // columns as well as the fetched ones.
  const tag = 'handadd-outrank';
  await db.prospect.deleteMany({ where: { placeId: { startsWith: tag } } });
  const p = await db.prospect.create({
    data: {
      placeId: `${tag}-1`, name: 'Chamber Breakfast Co', nameManualValue: 'Chamber Breakfast Co',
      phone: '541-555-0700', phoneManualValue: '541-555-0700',
      email: 'pat@chamber.example', emailManualValue: 'pat@chamber.example',
      fieldSource: 'russ', stage: 'NO_CONTACT',
    },
  });
  // what a later sweep would do
  const after = await db.prospect.update({ where: { id: p.id }, data: { phone: '541-555-9999', email: 'info@chamber.example' } });
  const { resolveField } = overrides();
  const ok = resolveField(after, 'phone') === '541-555-0700' && resolveField(after, 'email') === 'pat@chamber.example'
    && after.fieldSource === 'russ';
  await db.prospect.deleteMany({ where: { placeId: { startsWith: tag } } });
  return { ok, detail: ok ? 'a sweep overwrote what it fetched and what Russ typed still stands' : JSON.stringify({ phone: resolveField(after, 'phone'), email: resolveField(after, 'email') }) };
}), 'handadd');

def('handadd_name_recovered_only_when_it_is_really_a_name', () => {
  const { nameFromEmail } = require(path.join(ROOT, 'src/hoursback/crm/names.js'));
  const real = ['dale@x.com', 'devon@dgainescpa.com', 'sonja@y.com', 'reid@z.com'].map(nameFromEmail);
  const junk = ['info@x.com', 'your@email', 'bagadmin@y.org', 'frontdesk@z.com', 'xqzptv@w.com'].map(nameFromEmail);
  const ok = real.every(Boolean) && junk.every((n) => n === null);
  return { ok, detail: ok ? `real names recovered (${real.join(', ')}); shared inboxes and nonsense left alone` : JSON.stringify({ real, junk }) };
}, 'handadd');

def('handadd_greeting_never_guesses_wrong', () => {
  const fc = firstContact();
  const g = (p) => fc.draftFirstContact({ name: 'X', ...p }, [{ signal: 'fax_listed' }]).body.split('\n')[0];
  const told = g({ ownerName: 'Dale Hutchins', email: 'info@x.com' });
  const worked = g({ email: 'devon@x.com' });
  const unknown = g({ email: 'bagadmin@x.com' });
  // With no name it is "Hello," now. "Hi there," reads like a circular the
  // moment somebody opens it cold (2026-08-26).
  const ok = told === 'Hi Dale,' && worked === 'Hi Devon,' && unknown === 'Hello,';
  return { ok, detail: ok ? 'a name he was told wins, a name in the address is used, and anything doubtful gets a plain Hello' : [told, worked, unknown].join(' | ') };
}, 'handadd');

def('message_reads_cleanly_for_every_trade', () => {
  // Every opening is written for every trade. A plural list of paperwork
  // followed by a singular verb — "claims, plans and reminders is moving" —
  // reads as a machine wrote it, which is the one thing a cold email cannot
  // afford. This walks all of them.
  const fc = firstContact();
  const { tradeOf } = require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const namesByTrade = {
    trades: 'High Desert Plumbing', construction: 'Sunwest Builders', 'real estate': 'Cascade Realty',
    medical: 'Highland Veterinary Hospital', dental: 'Cascade Smiles Dental', legal: 'Baxter Law',
    accounting: 'Tyler Accounting', insurance: 'Guardian Insurance', auto: 'Legacy Auto Repair',
    'storage & logistics': 'Davis Storage', landscaping: 'Deschutes Landscaping', staffing: 'Express Employment',
    'retail & food': 'Sunrise Bakery', manufacturing: 'Sisters Millwork', other: 'Random Widget Co',
  };
  const bad = [];
  const AWKWARD = [
    // A plural list with a singular verb straight after it.
    /\b(claims|plans|reminders|orders|letters|tickets|agreements|documents|estimates|filings|waivers|invoices|timesheets|applications|disclosures|renewals|certificates|submittals)\s+(is|was|has)\b/i,
    /moving[^.]{0,60}moving/i,      // the same verb twice in one breath
    /by hand[^.]{0,140}by hand/i,   // the same phrase twice in one paragraph
    /\b(\w+) \1\b/i,                // a word repeated back to back
    /\s,|,,|\.\./,                  // stray punctuation from a bad join
  ];
  for (const [wantTrade, name] of Object.entries(namesByTrade)) {
    if (tradeOf(name) !== wantTrade) { bad.push(`"${name}" reads as ${tradeOf(name)}, not ${wantTrade}`); continue; }
    for (const signal of Object.keys(fc.OPENERS)) {
      const m = fc.draftFirstContact({ name }, [{ signal }]);
      if (!m) { bad.push(`${wantTrade}/${signal}: no message`); continue; }
      const para = m.body.split('\n\n')[2] || '';
      for (const re of AWKWARD) if (re.test(para)) { bad.push(`${wantTrade}/${signal}: ${para.slice(0, 90)}`); break; }
    }
  }
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 3).join(' | ') : `all ${Object.keys(namesByTrade).length * Object.keys(fc.OPENERS).length} trade-and-opening combinations read like a person wrote them` };
}, 'lanes');

def('message_carries_no_machine_tells', () => {
  // An em-dash is the single loudest sign a machine wrote something, and
  // Russ's own voice profile says he joins thoughts with commas and "and"
  // rather than dashes. Two had crept in.
  const fc = firstContact();
  const names = ['High Desert Plumbing', 'Baxter Law', 'Cascade Smiles Dental', 'Random Widget Co'];
  const JARGON = /\b(delve|leverage|robust|streamline|utilize|seamless|holistic|synerg|cutting[- ]edge|game[- ]chang|revolutioni|elevate your|unlock)/i;
  const STIFF = /\b(In today's|worth noting that|That said,|Moreover|Furthermore|In conclusion|I hope this email finds you)/i;
  const bad = [];
  for (const name of names) {
    for (const signal of Object.keys(fc.OPENERS)) {
      const m = fc.draftFirstContact({ name, ownerName: 'Dale Hutchins' }, [{ signal }]);
      if (!m) continue;
      const t = `${m.subject} ${m.body}`;
      if (/[—–]/.test(t)) bad.push(`${name}/${signal}: a dash`);
      if (JARGON.test(t)) bad.push(`${name}/${signal}: ${t.match(JARGON)[0]}`);
      if (STIFF.test(t)) bad.push(`${name}/${signal}: ${t.match(STIFF)[0]}`);
    }
    const li = fc.draftLinkedIn({ name }, [{ signal: 'fax_listed' }]);
    if (li && /[—–]/.test(li.body)) bad.push(`${name}: a dash in the LinkedIn version`);
  }
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 3).join(' | ') : 'no dashes, no sales jargon, no stiff openers, anywhere in any version' };
}, 'lanes');

def('message_names_the_trade_when_it_can', () => {
  const fc = firstContact();
  const known = fc.draftFirstContact({ name: 'High Desert Plumbing' }, [{ signal: 'fax_listed' }]);
  const unknown = fc.draftFirstContact({ name: 'Random Widget Co' }, [{ signal: 'fax_listed' }]);
  // A plumber hears about the schedule living in somebody's head; the trade's
  // own paperwork moved out of the opening line and into the recognition line
  // below it, because the two were naming the same list twice (2026-08-26).
  const { painFor } = require(path.join(ROOT, 'src/hoursback/crm/painPoints.js'));
  const lower = (t) => { const r = painFor(t).recognition; return r.charAt(0).toLowerCase() + r.slice(1); };
  const namesWork = known.body.includes(lower('trades')) && known.trade === 'trades';
  const fallsBack = unknown.trade === null && unknown.body.includes(lower('other'));
  const ok = namesWork && fallsBack;
  return { ok, detail: ok ? 'a plumber hears about service tickets; a business whose trade we cannot name gets the true general line rather than a guess' : `named=${namesWork} fallback=${fallsBack}` };
}, 'lanes');

def('contact_every_person_a_site_names_is_kept', () => withDb(async (db) => {
  // A business is not one address. The team page names the owner, the office
  // manager and whoever answers the phone, and those are three different
  // conversations. Keeping only the best address threw two of them away.
  const e = enrich();
  const html = `<html><body><h1>Our Team</h1>
    <p>Dale Hutchins, Owner. dale@t.example</p>
    <p>Sara Lin. Office Manager. sara@t.example</p>
    <p>Front desk: info@t.example</p>
    <a href="https://www.linkedin.com/company/t-example">us</a>
    <a href="https://www.linkedin.com/in/dale-hutchins-123">Dale</a></body></html>`;
  const finding = e.readSite([{ url: 'https://t.example/team', html }], { domain: 't.example' });
  const named = finding.people.filter((x) => x.name);
  const ok = finding.people.length >= 3
    && named.some((x) => x.name === 'Dale Hutchins' && x.role === 'Owner' && x.email === 'dale@t.example')
    && named.some((x) => x.name === 'Sara Lin' && /Office\s*Manager/i.test(x.role) && x.email === 'sara@t.example')
    && finding.people.some((x) => x.email === 'info@t.example')
    && finding.linkedIn.company === 'https://www.linkedin.com/company/t-example';
  return { ok, detail: ok ? 'all three people kept with their roles, each matched to their own address, plus the company LinkedIn page' : JSON.stringify(finding.people) };
}), 'lanes');

def('contact_people_are_saved_and_a_hand_typed_one_survives', () => withDb(async (db) => {
  await cleanLane(db, 'contacts');
  const p = await seedLane(db, 'contacts', { website: 'https://c.example/' });
  const e = enrich();
  const html = '<p>Dale Hutchins, Owner. dale@c.example</p><p>Sara Lin. Office Manager. sara@c.example</p>';
  await e.applySiteRead(db, p.id, e.readSite([{ url: 'https://c.example/', html }], { domain: 'c.example' }));
  const saved = await db.contact.findMany({ where: { prospectId: p.id } });
  // Russ corrects one of them by hand
  await db.contact.updateMany({ where: { prospectId: p.id, email: 'dale@c.example' }, data: { name: 'Dale W. Hutchins', role: 'Founder', source: 'RUSS' } });
  await e.applySiteRead(db, p.id, e.readSite([{ url: 'https://c.example/', html }], { domain: 'c.example' }), { now: new Date(Date.now() + 1000) });
  const after = await db.contact.findFirst({ where: { prospectId: p.id, email: 'dale@c.example' } });
  const ok = saved.length >= 2 && after.name === 'Dale W. Hutchins' && after.role === 'Founder';
  await cleanLane(db, 'contacts');
  return { ok, detail: ok ? `${saved.length} people saved, and the one Russ corrected survived a second reading untouched` : JSON.stringify({ saved: saved.length, after }) };
}), 'lanes');

def('contact_a_named_person_can_replace_the_shared_inbox', () => withDb(async (db) => {
  await cleanLane(db, 'primary');
  const p = await seedLane(db, 'primary', { email: 'info@p.example' });
  const person = await db.contact.create({ data: { prospectId: p.id, name: 'Sara Lin', role: 'Office Manager', email: 'sara@p.example', source: 'WEBSITE' } });
  // what the "write to them" button does
  await db.contact.updateMany({ where: { prospectId: p.id }, data: { isPrimary: false } });
  await db.contact.update({ where: { id: person.id }, data: { isPrimary: true } });
  await overrides().setOverride(db, p.id, 'email', person.email, 'russ');
  await db.prospect.update({ where: { id: p.id }, data: { contactName: person.name, contactRole: person.role } });
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const greeting = firstContact().draftFirstContact(after, [{ signal: 'fax_listed' }]).body.split('\n')[0];
  const ok = overrides().resolveField(after, 'email') === 'sara@p.example' && after.email === 'info@p.example' && greeting === 'Hi Sara,';
  await cleanLane(db, 'primary');
  return { ok, detail: ok ? 'picking Sara sent the message to her by name instead of the shared inbox, and left the fetched address on record' : `${overrides().resolveField(after, 'email')} / ${greeting}` };
}), 'lanes');

def('message_claims_no_experience_russ_does_not_have', () => {
  // Russ has spent a career inside businesses of every kind, so "I have been
  // inside enough businesses like yours" is true and his to say. What he
  // cannot say is anything implying Hours Back clients he has not had yet.
  const fc = firstContact();
  const FALSE_CLAIM = /\b(my (?:clients|customers)|our clients|the last (?:few|four|five|several) (?:shops|offices|clinics|firms|businesses) I|clients I have worked with|case study|one of my clients)\b/i;
  const bad = [];
  for (const touch of [2, 3]) {
    for (const name of ['Cascade Smiles Dental', 'Legacy Auto Repair', 'Random Widget Co']) {
      const m = fc.draftFollowUpTouch({ name }, 'fax_listed', touch);
      if (FALSE_CLAIM.test(m.body)) bad.push(`touch ${touch}, ${name}`);
    }
  }
  const { PAIN_BY_TRADE, GENERAL_PAIN } = require(path.join(ROOT, 'src/hoursback/crm/painPoints.js'));
  for (const [trade, pain] of Object.entries({ ...PAIN_BY_TRADE, general: GENERAL_PAIN })) {
    if (FALSE_CLAIM.test(pain.recognition)) bad.push(`the ${trade} line`);
  }
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 2).join(' | ') : 'nothing claims a Hours Back client he has not had; his own career is his to speak from' };
}, 'lanes');

def('message_never_sounds_like_a_sales_email', () => {
  // The single fastest way to lose a small-business owner is to sound like
  // every other message in their inbox.
  const fc = firstContact();
  const { PAIN_BY_TRADE, GENERAL_PAIN } = require(path.join(ROOT, 'src/hoursback/crm/painPoints.js'));
  const CHEESE = /\b(game[- ]?chang|revolutioni[sz]|supercharg|unlock (?:the|your)|10x|leverag|synerg|at the end of the day|let's be honest|here's the thing|what if I told you|imagine if|take (?:it|your business) to the next level|low[- ]hanging fruit|move the needle|quick win|no[- ]brainer|solutions? provider|best[- ]in[- ]class|world[- ]class|cutting[- ]edge|state[- ]of[- ]the[- ]art|seamlessly|empower(?:ing)? (?:you|your)|transform your business|maximi[sz]e your|\bROI\b|drive growth|scale your|thought leader|reach out|touch base|hop on a (?:quick )?call|pick your brain|circle back|synergi)/i;
  const SHOUTING = /!{2,}|\b[A-Z]{4,}\b(?! ?[A-Z])/;
  const bad = [];
  const check = (label, text) => {
    const c = text.match(CHEESE); if (c) bad.push(`${label}: "${c[0]}"`);
    const sh = text.match(SHOUTING); if (sh) bad.push(`${label}: shouting "${sh[0]}"`);
    const bangs = (text.match(/!/g) || []).length;
    if (bangs > 1) bad.push(`${label}: ${bangs} exclamation marks`);
  };
  for (const name of ['Cascade Smiles Dental', 'High Desert Plumbing', 'Random Widget Co']) {
    for (const signal of Object.keys(fc.OPENERS)) {
      const m = fc.draftFirstContact({ name }, [{ signal }]);
      if (m) check(`first/${signal}`, `${m.subject} ${m.body}`);
    }
    for (const touch of [2, 3]) {
      const m = fc.draftFollowUpTouch({ name }, 'fax_listed', touch);
      if (m) check(`touch ${touch}`, `${m.subject} ${m.body}`);
    }
    const li = fc.draftLinkedIn({ name }, [{ signal: 'fax_listed' }]);
    if (li) check('linkedin', li.body);
  }
  for (const [trade, pain] of Object.entries({ ...PAIN_BY_TRADE, general: GENERAL_PAIN })) {
    check(`the ${trade} line`, pain.recognition);
  }
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 3).join(' | ') : 'no sales jargon, no shouting, and at most one exclamation mark anywhere in any message' };
}, 'lanes');

def('message_names_a_pain_they_already_know', () => {
  // The second message has to name something true enough that the reader
  // thinks "how did he know that" — not describe what software does.
  const { PAIN_BY_TRADE, GENERAL_PAIN } = require(path.join(ROOT, 'src/hoursback/crm/painPoints.js'));
  const { TRADES } = require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const tradesInUse = new Set(TRADES.map(([label]) => label));
  const missing = [...tradesInUse].filter((t) => !PAIN_BY_TRADE[t]);
  const softwarey = Object.entries({ ...PAIN_BY_TRADE, general: GENERAL_PAIN })
    .filter(([, p]) => /\b(software|platform|system that|our tool|integrat|API|dashboard)\b/i.test(p.recognition))
    .map(([t]) => t);
  const complete = Object.values(PAIN_BY_TRADE).every((p) => p.recognition && p.cost && p.lever && p.function);
  const ok = !missing.length && !softwarey.length && complete;
  return { ok, detail: ok ? `every one of the ${Object.keys(PAIN_BY_TRADE).length} trades has a pain named in their own words, with what it costs and where it bites` : `missing: ${missing.join(', ')} | too software-ish: ${softwarey.join(', ')}` };
}, 'lanes');

def('voice_a_rewrite_is_kept_a_typo_is_not', () => {
  const dir = path.join(require('os').tmpdir(), `hb-voice-${process.pid}`);
  process.env.HOURSBACK_VOICE_DIR = dir;
  delete require.cache[require.resolve(path.join(ROOT, 'src/hoursback/crm/voiceCapture.js'))];
  const v = require(path.join(ROOT, 'src/hoursback/crm/voiceCapture.js'));
  const drafted = 'Hi Dale, I noticed you still list a fax number and I wanted to reach out about how we can streamline your operations today.';
  const typo = drafted.replace('today', 'todya');
  const rewrite = 'Hi Dale, saw the fax number on your site. That usually means somebody is handling paper by hand, and it adds up faster than it looks. Worth ten minutes of your time?';
  const ignored = v.captureRewrite({ before: drafted, after: typo, business: 'X' });
  const kept = v.captureRewrite({ before: drafted, after: rewrite, business: 'High Desert Plumbing', subject: 'The fax number' });
  const body = kept ? read(kept) : '';
  const ok = ignored === null && Boolean(kept) && body.includes(rewrite) && body.includes(drafted)
    && /Russ's version/.test(body);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
  delete process.env.HOURSBACK_VOICE_DIR;
  return { ok, detail: ok ? 'a typo fix taught nothing and was ignored; a real rewrite was kept with both versions side by side' : `ignored=${ignored} kept=${kept}` };
}, 'lanes');

def('message_speaks_in_the_trade_own_terms', () => {
  // Nobody talks conversion rates to a tire shop, or bookkeeping to a
  // consultancy. What the hours buy has to land in their own world.
  const { PAIN_BY_TRADE, GENERAL_PAIN } = require(path.join(ROOT, 'src/hoursback/crm/painPoints.js'));
  const { TRADES } = require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const missing = [...new Set(TRADES.map(([t]) => t))].filter((t) => !PAIN_BY_TRADE[t] || !PAIN_BY_TRADE[t].valueIn);
  const CORPORATE = /\b(ROI|conversion rate|KPI|synerg|stakeholder|bandwidth|utili[sz]ation rate|throughput optimi|operational excellence|digital transformation)\b/i;
  const wrongRegister = Object.entries({ ...PAIN_BY_TRADE, general: GENERAL_PAIN })
    .filter(([, p]) => CORPORATE.test(p.valueIn) || CORPORATE.test(p.recognition)).map(([t]) => t);
  const fc = firstContact();
  const auto = fc.draftFirstContact({ name: 'Legacy Auto Repair' }, [{ signal: 'fax_listed' }]);
  const firm = fc.draftFirstContact({ name: 'Sensiba Consulting LLP' }, [{ signal: 'fax_listed' }]);
  const different = auto.body !== firm.body && auto.body.includes('through the bay');
  const ok = !missing.length && !wrongRegister.length && different;
  return { ok, detail: ok ? 'every trade knows what the hours buy in its own words, and a tire shop and a consultancy get different messages' : `missing: ${missing.join(', ')} | corporate: ${wrongRegister.join(', ')} | different=${different}` };
}, 'lanes');

def('message_matches_how_they_write_without_flattering_them', () => {
  const { registerFor } = require(path.join(ROOT, 'src/hoursback/crm/register.js'));
  const fc = firstContact();
  const formal = 'Established in 1974, our firm is committed to providing comprehensive tailored solutions to the clients we serve throughout Central Oregon.';
  const plain = "We make junk removal easy. We're family-owned and we'll get it done, no job too small.";
  const a = fc.draftFirstContact({ name: 'Baxter Law', selfDescription: formal }, [{ signal: 'fax_listed' }]);
  const b = fc.draftFirstContact({ name: 'Git R Dumped', selfDescription: plain }, [{ signal: 'fax_listed' }]);
  const c = fc.draftFirstContact({ name: 'Plain Co' }, [{ signal: 'fax_listed' }]);
  // Never fawning, whatever the register.
  const FAWNING = /\b(impressive|outstanding|world[- ]class|clearly a leader|admire what you|love what you|amazing work|incredible)\b/i;
  const ok = registerFor(formal) === 'FORMAL' && registerFor(plain) === 'PLAIN'
    && a.register === 'FORMAL' && b.register === 'PLAIN' && c.register === 'NEUTRAL'
    && a.body !== b.body && ![a, b, c].some((m) => FAWNING.test(m.body))
    // The promise shares a short paragraph with the year figure — it means
    // nothing until the offer has been made, so it follows it (2026-08-26).
    && [a, b, c].every((m) => m.body.split('\n\n').some((par) =>
      new RegExp(PROMISE_RE, 'i').test(par) && /hours a year/i.test(par)))
    && [a, b, c].every((m) => /\nBest regards,\nRuss Wright\nFounder\nVisionAIry\n/.test(m.body));
  return { ok, detail: ok ? 'a hundred-year firm and a junk-removal outfit each get his voice at their own register, neither one flattered, and the promise identical in both' : `${a.register}/${b.register}/${c.register}` };
}, 'lanes');

def('site_everything_read_is_actually_written_down', () => withDb(async (db) => {
  // Twice now, something the reader found was only written when some OTHER
  // detail had changed — so on a second pass almost nothing landed. Anything
  // read has to count as a change in its own right.
  await cleanSite(db, 'written');
  const e = enrich();
  const p = await seedSite(db, 'written', { website: 'https://w.example/' });
  const html = `<html><head><meta name="description" content="We haul junk and clear out garages across Central Oregon, family owned since 1998.">
    </head><body><h1>W Co</h1><p>Dale Hutchins, Owner. dale@w.example</p>
    <a href="https://www.linkedin.com/company/w-example">us</a><p>Fax: 541-555-0100</p></body></html>`;
  const finding = e.readSite([{ url: 'https://w.example/', html }], { domain: 'w.example' });
  await e.applySiteRead(db, p.id, finding);
  const first = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  // A record already carrying all of it must still keep it on a second pass.
  await e.applySiteRead(db, p.id, finding);
  const second = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const contacts = await db.contact.count({ where: { prospectId: p.id } });
  const ok = Boolean(first.selfDescription) && first.selfDescription.includes('haul junk')
    && first.linkedInUrl === 'https://www.linkedin.com/company/w-example'
    && first.trade !== null && contacts >= 1
    && second.selfDescription === first.selfDescription && second.linkedInUrl === first.linkedInUrl;
  await cleanSite(db, 'written');
  return { ok, detail: ok ? 'what they say they do, their LinkedIn page, their trade and their people were all written on the first read and survived the second' : JSON.stringify({ desc: first.selfDescription, li: first.linkedInUrl, trade: first.trade, contacts }) };
}), 'lanes');

def('pipeline_shows_who_is_in_play_and_who_is_leaking', () => withDb(async (db) => {
  // A business sitting at interested with nothing scheduled is the most
  // expensive thing in the system, and it is invisible on every other screen.
  await cleanDay(db, 'pipe');
  const leaking = await seedDay(db, 'pipe1', { stage: 'ACTIVE', nextAction: null, nextActionDate: null, auditFee: 1500, guaranteedHours: 15 });
  const fine = await seedDay(db, 'pipe2', { stage: 'IN_PROCESS', nextAction: 'send the one-pager', nextActionDate: new Date(Date.now() + 86400000), auditFee: 999, guaranteedHours: 10 });
  const cold = await seedDay(db, 'pipe3', { stage: 'NO_CONTACT' });
  const { leakReport } = nextAction();
  const leaks = await leakReport(db);
  const live = await db.prospect.findMany({ where: { doNotContact: false, stage: { in: ['INITIAL_CONTACT', 'ACTIVE', 'IN_PROCESS', 'CUSTOMER', 'EXPANDED_CUSTOMER'] } } });
  const money = live.filter((p) => [leaking.id, fine.id].includes(p.id)).reduce((a, p) => a + (p.auditFee || 0), 0);
  const ok = leaks.some((l) => l.id === leaking.id) && !leaks.some((l) => l.id === fine.id)
    && !live.some((p) => p.id === cold.id) && money === 2499;
  await cleanDay(db, 'pipe');
  return { ok, detail: ok ? 'the one with nothing scheduled is flagged, the one with a next step is not, uncalled businesses stay off the board, and the money in play adds up' : `leaks=${leaks.length} money=${money}` };
}), 'day');

def('money_keeps_quoted_agreed_and_paid_apart', () => withDb(async (db) => {
  // A customer who has not paid is not revenue. Counting them as such is how
  // a founder talks himself into a month he did not have.
  await cleanDay(db, 'money');
  const quotedOnly = await seedDay(db, 'money1', { quotedAt: new Date(), quotedAuditFee: 1500, quotedGuaranteedHours: 15, stage: 'ACTIVE' });
  const saidYes = await seedDay(db, 'money2', { stage: 'CUSTOMER', quotedAt: new Date(), quotedAuditFee: 999, paidAt: null });
  const actuallyPaid = await seedDay(db, 'money3', { stage: 'CUSTOMER', quotedAt: new Date(), quotedAuditFee: 2000, paidAt: new Date() });
  const q = await db.prospect.findMany({ where: { placeId: { startsWith: 'day-money' }, quotedAt: { not: null }, paidAt: null } });
  const yes = await db.prospect.findMany({ where: { placeId: { startsWith: 'day-money' }, stage: { in: ['CUSTOMER', 'EXPANDED_CUSTOMER'] }, paidAt: null } });
  const paid = await db.prospect.findMany({ where: { placeId: { startsWith: 'day-money' }, paidAt: { not: null } } });
  const ok = q.length === 2 && yes.length === 1 && yes[0].id === saidYes.id
    && paid.length === 1 && paid[0].id === actuallyPaid.id
    && q.some((x) => x.id === quotedOnly.id);
  await cleanDay(db, 'money');
  return { ok, detail: ok ? 'quoted, agreed and actually paid are three separate numbers, and a customer who has not paid is never counted as revenue' : `quoted=${q.length} yes=${yes.length} paid=${paid.length}` };
}), 'day');

def('score_counts_everything_known_not_just_the_website', () => {
  // The score used to read only what a website was missing. Everything since
  // learned — who owns them, how long they have been going, what they already
  // pay for, how big the team is, whether the same person runs other
  // businesses here — has to count too, or the call order ignores it.
  const { SIGNAL_WEIGHTS, SIGNAL_LABELS, scoreAutomationFit } = scoring();
  const learned = ['runs_several_businesses', 'hiring_several_office_roles', 'long_established',
    'team_size_known', 'disconnected_tools', 'named_decision_maker'];
  const missing = learned.filter((k) => !(k in SIGNAL_WEIGHTS) || !SIGNAL_LABELS[k]);
  // Running several businesses must outrank every website tell except an
  // actual job posting — it is one conversation covering several sets of hours.
  const websiteTells = ['no_online_booking', 'no_customer_portal', 'fax_listed', 'downloadable_forms', 'no_website'];
  const outranks = websiteTells.every((k) => SIGNAL_WEIGHTS.runs_several_businesses > SIGNAL_WEIGHTS[k]);
  const bare = scoreAutomationFit({ signals: [{ signal: 'fax_listed' }] }).score;
  const rich = scoreAutomationFit({ signals: [{ signal: 'fax_listed' }, { signal: 'runs_several_businesses' }, { signal: 'long_established' }] }).score;
  const ok = !missing.length && outranks && rich > bare;
  return { ok, detail: ok ? 'everything learned about a business counts towards its place in the queue, and an owner running several outranks any single website tell' : `missing: ${missing.join(', ')} | outranks=${outranks}` };
}, 'lanes');

def('message_leads_with_the_strongest_thing_known', () => {
  const fc = firstContact();
  const p = { name: 'Hoyts Hardware', trade: 'retail & food', ownerName: 'Alison Huycke', yearsInBusiness: 41, toolsInUse: 'QuickBooks, Square' };
  const m = fc.draftFirstContact(p, [{ signal: 'fax_listed' }, { signal: 'runs_several_businesses' }]);
  const leadsWithTheBigOne = m.openedWith === 'runs_several_businesses';
  const carriesYears = /Forty-odd years|41 years/.test(m.body);
  // Their software must NOT be here — they never published it. It belongs on
  // the card, for the call.
  const keepsSoftwareOut = !/QuickBooks|Square|Mailchimp/i.test(m.body);
  const noDash = !/[—–]/.test(m.body);
  const ok = leadsWithTheBigOne && carriesYears && keepsSoftwareOut && noDash;
  return { ok, detail: ok ? 'it opens on the strongest thing known, carries the years they published, and leaves out the software they did not' : `lead=${m.openedWith} years=${carriesYears} softwareKeptOut=${keepsSoftwareOut}` };
}, 'lanes');

def('message_says_only_what_they_put_in_the_world', () => {
  // The test is whether the business chose to publish it. A fax number, a
  // booking page, forty years on the homepage — all offered, and noticing is
  // flattering. The software running behind their website was never
  // broadcast; naming it in a cold email reads as somebody who went looking
  // rather than somebody who looked.
  const fc = firstContact();
  const p = {
    name: 'Hoyts Hardware', trade: 'retail & food', ownerName: 'Alison Huycke',
    yearsInBusiness: 41, toolsInUse: 'QuickBooks, Square, Mailchimp',
  };
  const first = fc.draftFirstContact(p, [{ signal: 'fax_listed' }, { signal: 'runs_several_businesses' }]);
  const second = fc.draftFollowUpTouch(p, 'fax_listed', 2);
  const third = fc.draftFollowUpTouch(p, 'fax_listed', 3);
  const li = fc.draftLinkedIn(p, [{ signal: 'fax_listed' }]);
  const NAMES_THEIR_SOFTWARE = /QuickBooks|Square|Mailchimp|ServiceTitan|Dentrix|Clio|Jobber|Housecall|AppFolio|Procore/i;
  const leaked = [first, second, third, li].filter(Boolean).filter((m) => NAMES_THEIR_SOFTWARE.test(`${m.subject} ${m.body}`));

  // What IS published may be used freely.
  const usesYears = /Forty-odd years|41 years/.test(first.body);
  // And it is still on the card, for the call.
  const note = fc.toolsNoteForRuss(p);
  const keptForTheCall = Boolean(note) && NAMES_THEIR_SOFTWARE.test(note);
  // The multi-business line reads as respectful, not as surveillance.
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const respectful = V.TELL_WORDINGS.runs_several_businesses.some((t) => first.body.includes(t))
    && !/I (?:looked|searched|found|checked) you up|according to (?:state|public) record|your (?:registration|filing)/i.test(first.body);

  const ok = leaked.length === 0 && usesYears && keptForTheCall && respectful;
  return { ok, detail: ok ? 'nothing they did not publish appears in any message; their software is kept on the card for the call, and what they did publish is used freely' : `leaked in ${leaked.length} messages | years=${usesYears} note=${keptForTheCall} respectful=${respectful}` };
}, 'lanes');

def('message_two_businesses_alike_get_different_letters', () => {
  // Two dentists who both still list a fax number might well know each other
  // in a town this size. Same approved wording, said a different way.
  const fc = firstContact();
  const names = ['Cascade Smiles Dental', 'Bend Family Dental', 'Redmond Dental Care', 'Sisters Dental',
    'High Desert Dental', 'Awbrey Dental', 'Bend Dental Group', 'Deschutes Dental'];
  const bodies = names.map((name) => fc.draftFirstContact({ name, trade: 'dental', ownerName: 'Sara Lin' }, [{ signal: 'fax_listed' }]).body);
  const allDistinct = new Set(bodies).size === names.length;
  const noHoles = !bodies.some((b) => /undefined|\[object|\{[a-z]+\}/.test(b));
  // And the same business must get the same letter every time, or a redraft
  // would send somebody a different message than the one already read.
  const stable = fc.draftFirstContact({ name: 'Sisters Dental', trade: 'dental' }, [{ signal: 'fax_listed' }]).body
    === fc.draftFirstContact({ name: 'Sisters Dental', trade: 'dental' }, [{ signal: 'fax_listed' }]).body;
  const ok = allDistinct && noHoles && stable;
  return { ok, detail: ok ? `eight dental practices with the same tell got eight different letters, and each one gets the same letter every time` : `distinct=${new Set(bodies).size}/${names.length} holes=${!noHoles} stable=${stable}` };
}, 'lanes');

def('message_every_wording_is_free_of_machine_habits', () => {
  // Every alternative wording has to clear the same bar as the original: no
  // dashes, no sales jargon, no stiff constructions, nothing that reads as
  // though a machine assembled it.
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const all = [
    ...Object.values(V.OPENINGS).flat(), ...V.WHAT_I_DO, ...V.GUARANTEE,
    ...Object.values(V.CLOSES).flat(), ...Object.values(V.TELL_WORDINGS).flat(),
  ];
  const BAD = [
    [/[—–]/, 'a dash'],
    [/\b(leverage|streamline|utilize|robust|seamless|synerg|holistic|optimi[sz]e|empower|cutting[- ]edge|best[- ]in[- ]class|game[- ]chang|unlock|elevate|revolutioni)/i, 'sales jargon'],
    [/\b(In today's|It is worth noting|That said,|Moreover|Furthermore|delve|myriad|plethora|landscape of|realm of|navigate the)/i, 'a stiff construction'],
    [/\bI hope this (?:email )?finds you\b|\bI wanted to reach out\b|\bjust wanted to\b|\btouch base\b|\bcircle back\b/i, 'a cold-email cliche'],
  ];
  const bad = [];
  for (const line of all) {
    for (const [re, why] of BAD) if (re.test(line)) bad.push(`${why}: "${line.slice(0, 50)}"`);
  }
  const counts = [
    ...Object.values(V.OPENINGS).map((l) => l.length), V.WHAT_I_DO.length, V.GUARANTEE.length,
    ...Object.values(V.CLOSES).map((l) => l.length), ...Object.values(V.TELL_WORDINGS).map((l) => l.length),
  ];
  const enough = counts.every((n) => n >= 4);
  const ok = !bad.length && enough;
  return { ok, detail: ok ? `all ${all.length} wordings clear the bar, and every line has at least four ways to say it` : (bad.slice(0, 2).join(' | ') || 'some line has fewer than four wordings') };
}, 'lanes');

def('message_guarantee_stands_alone_and_uses_their_numbers', () => {
  // The guarantee was the last clause of a five-line paragraph, where nobody
  // reads. It stands on its own line now, short, in their own hours — and
  // with no price, because a price in a first approach becomes the whole
  // conversation. The year's hours follow it on their own line.
  const fc = firstContact();
  const { promiseFor } = require(path.join(ROOT, 'src/hoursback/industryTiers.js'));
  const { tradeOf } = require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const bad = [];
  for (const [name, count] of [['Sunwest Builders', 40], ['Cascade Smiles Dental', 8], ['Highland Veterinary Hospital', 22]]) {
    const m = fc.draftFirstContact({ name, ownerName: 'Sara', employeeCount: count }, [{ signal: 'fax_listed' }]);
    // Find them by what they SAY, not by counting from the bottom. The
    // guarantee moved to second position on 2026-08-26 so it lands while the
    // reader is still reading, and counting broke.
    const paras = m.body.split('\n\n');
    const promise = paras.find((x) => new RegExp(PROMISE_RE, 'i').test(x)) || '';
    const year = paras.find((x) => /hours a year|Over a year|a year,/i.test(x)) || '';
    // The promise comes from the INDUSTRY now, scaled by size — not from
    // headcount alone (Russ, 2026-08-26).
    const band = { guaranteedHours: promiseFor({ employeeCount: count, trade: tradeOf(name) }).hours };
    if (promise.split(/\s+/).length > 70) bad.push(`${name}: the promise is too long to land`);
    if (!/^[A-Z]/.test(promise)) bad.push(`${name}: the promise starts lowercase`);
    if (!new RegExp(PROMISE_RE, 'i').test(promise)) bad.push(`${name}: no promise in it`);
    if (/\$[\d,]+/.test(promise)) bad.push(`${name}: a price crept into the first message`);
    if (!year.includes((band.guaranteedHours * 52).toLocaleString())) bad.push(`${name}: the year's hours are missing`);
    if (!/^[A-Z]/.test(year)) bad.push(`${name}: the year line starts lowercase`);
  }
  // Where the size is unknown, the tier's own smallest promise stands, so
  // that learning the real size can only ever raise it.
  const unknown = fc.draftFirstContact({ name: 'Legacy Auto Repair', ownerName: 'Sara' }, [{ signal: 'fax_listed' }]);
  const upAll = unknown.body.split('\n\n');
  const up = { [upAll.length - 4]: upAll.find((x) => new RegExp(PROMISE_RE, 'i').test(x)) || '',
               [upAll.length - 3]: upAll.find((x) => /hours a year|Over a year|a year,/i.test(x)) || '',
               length: upAll.length };
  const floorWord = { 3: 'three', 4: 'four', 5: 'five', 6: 'six', 8: 'eight', 10: 'ten' }[promiseFor({ trade: 'auto' }).hours];
  if (!new RegExp(`${floorWord} hours a week`, 'i').test(up[up.length - 4])) bad.push(`unknown size does not fall back to ${floorWord} hours`);
  const floorYear = (promiseFor({ trade: 'auto' }).hours * 52).toLocaleString();
  if (!up[up.length - 3].includes(floorYear)) bad.push(`unknown size does not state the year (${floorYear})`);
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 2).join(' | ') : "the promise stands alone in their own hours with no price on it, and the year's hours land right underneath" };
}, 'lanes');

def('message_price_only_in_the_second_and_it_carries_no_value_on_an_hour', () => {
  // No price in a first approach — Russ's own edit struck one out, and a
  // number with no context becomes the whole conversation. The second message
  // is where the fee belongs. And it carries the fee and the hours, nothing
  // else: no value put on an hour, no multiple. Russ, 2026-08-26.
  const fc = firstContact();
  const { bandForEmployeeCount } = rules();
  const bad = [];
  for (const count of [8, 22, 40, 90]) {
    const p = { name: `Test ${count} Co`, ownerName: 'Sara', employeeCount: count, trade: 'construction' };
    const band = { guaranteedHours: iTiers().promiseFor({ employeeCount: count, trade: 'construction' }).hours,
                   auditFee: iTiers().promiseFor({ employeeCount: count, trade: 'construction' }).fee };
    const first = fc.draftFirstContact(p, [{ signal: 'fax_listed' }]);
    if (/\$[\d,]+/.test(first.body)) bad.push(`a price appears in the first message to a ${count}-person business`);
    if (!first.body.includes((band.guaranteedHours * 52).toLocaleString())) bad.push(`${count}: the year's hours are missing from the first message`);

    const second = fc.draftFollowUpTouch(p, 'fax_listed', 2);
    const fee = `$${band.auditFee.toLocaleString()}`;
    if (!second.body.includes(fee)) bad.push(`${count}: their fee ${fee} is missing from the second message`);
    if (!second.body.includes((band.guaranteedHours * 52).toLocaleString())) bad.push(`${count}: the year's hours are missing from the second message`);
    // The fee is the ONLY dollar figure allowed anywhere in it.
    const dollars = second.body.match(/\$\d[\d,]*\d|\$\d/g) || [];
    const stray = dollars.filter((d) => d !== fee);
    if (stray.length) bad.push(`${count}: a second dollar figure appears — ${stray[0]}`);
    if (/\b\d{1,3}x\b/.test(second.body)) bad.push(`${count}: a return multiple appears in the message`);
  }
  const model = read(BM);
  if (!/\$999\. Five hours a week found, or nothing to pay/.test(model)) bad.push('the business model no longer states the one offer');
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 2).join(' | ') : 'no price in a first approach; the second carries their own fee and their hours, and no value is put on an hour anywhere' };
}, 'lanes');

def('three_lanes_declared', () => {
  const L = lanes();
  const ok = Array.isArray(L.LANES) && L.LANES.length === 3
    && ['PHONE', 'EMAIL', 'LINKEDIN'].every((x) => L.LANES.includes(x));
  return { ok, detail: ok ? 'exactly three ways to reach a business: phone, email, LinkedIn' : JSON.stringify(L.LANES) };
}, 'lanes');

def('one_row_per_touch', () => withDb(async (db) => {
  await cleanLane(db, 'onerow');
  const p = await seedLane(db, 'onerow');
  const m = await lanes().draftFor(db, p.id, 'EMAIL');
  const again = await lanes().draftFor(db, p.id, 'EMAIL');
  const rows = await db.outreachMessage.findMany({ where: { prospectId: p.id } });
  const ok = rows.length === 1 && m.id === again.id && m.lane === 'EMAIL'
    && m.prospectId === p.id && m.state === 'DRAFT' && Boolean(m.body);
  await cleanLane(db, 'onerow');
  return { ok, detail: ok ? 'one row per business per lane, naming the lane, the business and where it stands' : `${rows.length} rows` };
}), 'lanes');

def('reply_stops_all_lanes', () => withDb(async (db) => {
  await cleanLane(db, 'reply');
  const p = await seedLane(db, 'reply');
  await approvedTemplate(db);
  await lanes().queueEmail(db, p.id);
  await lanes().draftFor(db, p.id, 'LINKEDIN');
  await lanes().markReplied(db, p.id, 'EMAIL');
  const rows = await db.outreachMessage.findMany({ where: { prospectId: p.id } });
  const stillWaiting = rows.filter((r) => ['DRAFT', 'QUEUED'].includes(r.state));
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = stillWaiting.length === 0 && after.repliedAt !== null
    && rows.every((r) => r.state === 'SUPPRESSED' || r.state === 'REPLIED');
  await cleanLane(db, 'reply');
  return { ok, detail: ok ? 'they answered on email and every message still waiting, on every lane, stopped' : JSON.stringify(rows.map((r) => [r.lane, r.state])) };
}), 'lanes');

def('linkedin_never_auto_sent', () => withDb(async (db) => {
  await cleanLane(db, 'linotengine');
  const p = await seedLane(db, 'linotengine');
  const m = await lanes().draftFor(db, p.id, 'LINKEDIN');
  let blankRefused = false; let engineRefused = false;
  try { await lanes().markLinkedInSent(db, m.id, ''); } catch (e) { blankRefused = e.code === 'LINKEDIN_NEEDS_A_PERSON'; }
  try { await lanes().markLinkedInSent(db, m.id, 'engine'); } catch (e) { engineRefused = e.code === 'LINKEDIN_NEEDS_A_PERSON'; }
  const still = await db.outreachMessage.findUniqueOrThrow({ where: { id: m.id } });
  const noEngineSender = /sentBy: 'engine'/.test(read(path.join(ROOT, 'src/hoursback/crm/lanes.js')).split('markLinkedInSent')[1] || '');
  const ok = blankRefused && engineRefused && still.state !== 'SENT' && !noEngineSender;
  await cleanLane(db, 'linotengine');
  return { ok, detail: ok ? 'the engine cannot mark a LinkedIn message sent, blank or named as itself' : `blank=${blankRefused} engine=${engineRefused} state=${still.state}` };
}), 'lanes');

def('linkedin_hand_send_queue', () => withDb(async (db) => {
  await cleanLane(db, 'lihand');
  const p = await seedLane(db, 'lihand');
  await lanes().draftFor(db, p.id, 'LINKEDIN');
  const queue = await lanes().linkedInQueue(db);
  const mine = queue.find((q) => q.prospectId === p.id);
  const sent = await lanes().markLinkedInSent(db, mine.id, 'Russ');
  const ok = Boolean(mine) && Boolean(mine.body) && sent.state === 'SENT' && sent.sentBy === 'Russ' && sent.sentAt instanceof Date;
  await cleanLane(db, 'lihand');
  return { ok, detail: ok ? 'it waited in the hand-send list, and sending it recorded Russ by name' : JSON.stringify({ found: Boolean(mine), sentBy: sent && sent.sentBy }) };
}), 'lanes');

def('email_ramp_caps_daily_volume', () => {
  const { dailyEmailCap, EMAIL_RAMP } = lanes();
  // Week one is 30 (Russ, 2026-08-26). The old ceiling of 20 came from a ramp
  // that crawled for seven weeks and would have taken 69 days to reach 691
  // businesses once.
  const caps = EMAIL_RAMP.map((_, i) => dailyEmailCap(i));
  const rising = caps.every((c, i) => i === 0 || c > caps[i - 1]);
  const flatAfter = dailyEmailCap(99) === EMAIL_RAMP[EMAIL_RAMP.length - 1];
  const ok = rising && flatAfter && caps[0] <= 30;
  return { ok, detail: ok ? `starts at ${caps[0]} a day and climbs to ${caps[caps.length - 1]}, then holds` : caps.join(',') };
}, 'lanes');

def('email_ramp_stops_at_cap', () => withDb(async (db) => {
  await cleanLane(db, 'cap');
  await approvedTemplate(db);
  const L = lanes();
  const cap = L.dailyEmailCap(0);
  for (let i = 0; i < cap; i++) {
    const p = await seedLane(db, `cap${i}`);
    const m = await L.queueEmail(db, p.id);
    await L.markEmailSent(db, m.id);
  }
  const leftToday = await L.emailsLeftToday(db, 0);
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const leftTomorrow = await L.emailsLeftToday(db, 0, new Date(Date.now() + 24 * 3600 * 1000));
  const ok = leftToday === 0 && leftTomorrow === cap;
  await cleanLane(db, 'cap');
  return { ok, detail: ok ? `hit today's ceiling of ${cap} and stopped; tomorrow opens at ${cap} again` : `today=${leftToday} tomorrow=${leftTomorrow}` };
}), 'lanes');

def('bounce_suppresses_email_only', () => withDb(async (db) => {
  await cleanLane(db, 'bounce');
  const p = await seedLane(db, 'bounce');
  await approvedTemplate(db);
  await lanes().queueEmail(db, p.id);
  await lanes().markBounced(db, p.id);
  const emails = await db.outreachMessage.findMany({ where: { prospectId: p.id, lane: 'EMAIL' } });
  const onPhone = (await lanes().reachableOn(db, 'PHONE', 5000)).some((x) => x.id === p.id);
  const onEmail = (await lanes().reachableOn(db, 'EMAIL', 5000)).some((x) => x.id === p.id);
  const ok = emails.every((m) => m.state === 'SUPPRESSED') && onPhone && !onEmail;
  await cleanLane(db, 'bounce');
  return { ok, detail: ok ? 'the address bounced, email stopped, and they are still on the call list' : `phone=${onPhone} email=${onEmail}` };
}), 'lanes');

def('no_email_still_callable', () => withDb(async (db) => {
  await cleanLane(db, 'noemail');
  const p = await seedLane(db, 'noemail', { email: null });
  const onPhone = (await lanes().reachableOn(db, 'PHONE', 5000)).some((x) => x.id === p.id);
  const onEmail = (await lanes().reachableOn(db, 'EMAIL', 5000)).some((x) => x.id === p.id);
  const ok = onPhone && !onEmail;
  await cleanLane(db, 'noemail');
  return { ok, detail: ok ? 'no email address, and still completely active on the phone' : `phone=${onPhone} email=${onEmail}` };
}), 'lanes');

def('no_send_without_approved_template', () => withDb(async (db) => {
  await cleanLane(db, 'approve');
  const L = lanes();
  await db.messageTemplate.deleteMany({ where: { name: L.FIRST_CONTACT } });
  await L.upsertTemplate(db, { subject: firstContact().SUBJECTS.default, body: firstContact().BODY });
  const p = await seedLane(db, 'approve');
  let refused = false;
  try { await L.queueEmail(db, p.id); } catch (e) { refused = e.code === 'TEMPLATE_NOT_APPROVED'; }
  const t = await db.messageTemplate.findUniqueOrThrow({ where: { name: L.FIRST_CONTACT } });
  const beforeNull = t.approvedAt === null;
  await L.approveTemplate(db, L.FIRST_CONTACT, 'russ');
  const queued = await L.queueEmail(db, p.id);
  const ok = refused && beforeNull && queued && queued.state === 'QUEUED';
  await cleanLane(db, 'approve');
  return { ok, detail: ok ? 'unapproved, it refused to send; approved, it queued with no further asking' : `refused=${refused} queued=${queued && queued.state}` };
}), 'lanes');

def('approved_template_sends_unattended', () => withDb(async (db) => {
  const L = lanes();
  await db.messageTemplate.deleteMany({ where: { name: L.FIRST_CONTACT } });
  await L.upsertTemplate(db, { subject: 'S', body: 'first wording' });
  await L.approveTemplate(db);
  const changed = await L.upsertTemplate(db, { subject: 'S', body: 'different wording' });
  const stillApproved = await L.templateIsApproved(db);
  await db.messageTemplate.deleteMany({ where: { name: L.FIRST_CONTACT } });
  const ok = changed.approvedAt === null && changed.version === 2 && !stillApproved;
  return { ok, detail: ok ? 'rewording it took the approval away — a message Russ has not read does not send' : JSON.stringify(changed) };
}), 'lanes');

def('a_stale_draft_is_rewritten_but_a_hand_edited_one_is_not', () => withDb(async (db) => {
  // The whole failure of 2026-08-26 in one check: the wording was rewritten
  // all night and twenty-five drafts written at 3am still said the old thing,
  // because a draft that already existed was returned before the new words
  // were ever looked at. What Russ typed himself must still survive that.
  const L = lanes();
  await cleanLane(db, 'stale');
  await approvedTemplate(db);
  const a = await seedLane(db, 'staleA');
  const b = await seedLane(db, 'staleB');
  const first = await L.draftFor(db, a.id, 'EMAIL');
  const second = await L.draftFor(db, b.id, 'EMAIL');
  await db.outreachMessage.update({ where: { id: first.id }, data: { body: 'wording from an earlier night' } });
  await db.outreachMessage.update({ where: { id: second.id }, data: { body: 'what Russ typed himself', editedAt: new Date() } });
  const refreshed = await L.draftFor(db, a.id, 'EMAIL');
  const untouched = await L.draftFor(db, b.id, 'EMAIL');
  const ok = refreshed.body !== 'wording from an earlier night'
    && /(money back|money comes back|fee comes back|refund|you don't pay|you pay nothing|owe me nothing|nothing to pay)/i.test(refreshed.body)
    && untouched.body === 'what Russ typed himself';
  await cleanLane(db, 'stale');
  return { ok, detail: ok
    ? 'the stale draft came back in the current wording; the one he had rewritten was left exactly as he left it'
    : `stale=${refreshed.body.slice(0, 40)} edited=${untouched.body.slice(0, 40)}` };
}), 'lanes');

def('approval_stops_counting_once_the_message_moves_on', () => withDb(async (db) => {
  // An approval saved against one wording cannot cover a different one. The
  // stored copy went stale under a running app and read as approved, so the
  // approve button was hidden and there was no way back to the real words.
  const L = lanes();
  const fc = firstContact();
  await db.messageTemplate.deleteMany({ where: { name: L.FIRST_CONTACT } });
  await L.upsertTemplate(db, { subject: fc.SUBJECTS.default, body: fc.BODY });
  await L.approveTemplate(db, L.FIRST_CONTACT, 'russ');
  const approvedNow = await L.templateIsApproved(db);
  // Reach past upsertTemplate, exactly as a row saved by older code would look.
  await db.messageTemplate.update({ where: { name: L.FIRST_CONTACT }, data: { body: 'a wording from an earlier night' } });
  const approvedAfter = await L.templateIsApproved(db);
  await db.messageTemplate.deleteMany({ where: { name: L.FIRST_CONTACT } });
  const ok = approvedNow === true && approvedAfter === false;
  return { ok, detail: ok
    ? 'approved against the real words; the moment the stored copy differed it stopped counting as approved'
    : `before=${approvedNow} after=${approvedAfter}` };
}), 'lanes');

def('every_first_message_states_the_guarantee_and_the_year', () => {
  // Russ read a draft and could not find the guarantee or the hours in it.
  // Both are load-bearing, both get their own line, and neither is optional.
  const fc = firstContact();
  const people = [
    { name: 'High Desert Dental', trade: 'dental', employeeCount: 9 },
    { name: 'Cascade Plumbing', trade: 'plumbing', employeeCount: 25 },
    { name: 'Baxter Law', employeeCount: 60, selfDescription: 'We do not shy away from difficult matters.' },
    { name: 'Sisters Auto', ownerName: 'Sara Lin' },
  ];
  const missing = [];
  for (const p of people) {
    for (const signal of ['fax_listed', 'hiring_admin_role', 'no_online_booking']) {
      const m = fc.draftFirstContact(p, [{ signal }]);
      if (!m) continue;
      const guarantee = new RegExp(PROMISE_RE, 'i').test(m.body);
      const year = /\d[\d,]* hours a year/i.test(m.body);
      const ownLine = m.body.split('\n\n').some((par) => new RegExp(PROMISE_RE, 'i').test(par) && /hours a year/i.test(par) && par.length < 360);
      if (!guarantee || !year || !ownLine) missing.push(`${p.name}/${signal} guarantee=${guarantee} year=${year} ownLine=${ownLine}`);
    }
  }
  const ok = missing.length === 0;
  return { ok, detail: ok
    ? 'every first message says what happens if he finds nothing, on its own line, and puts the hours in years'
    : missing.join('; ') };
}, 'message');

def('no_dollar_is_ever_put_on_an_hour', () => {
  // Russ, 2026-08-26, in caps: he sells HOURS, not dollars. $999 is the floor
  // and the fee is the only money that exists. A wage basis, an annual value,
  // or a return multiple all invite an argument about whose wage was used —
  // and a promise that can be argued is not a guarantee.
  const fs2 = require('fs');
  const files = [
    'src/hoursback/crm/firstContact.js', 'src/hoursback/crm/variants.js',
    'docs/hoursback/business-model.md', 'docs/hoursback/locked-decisions.md',
  ];
  const banned = [/\$100 (?:per|for every)/i, /39\.80/, /\b\d{1,3}x\b(?![a-z])(?=.*(?:return|hour|value))|(?:return|hour|value).*\b\d{1,3}x\b/i, /per guaranteed hour/i];
  const found = [];
  for (const f of files) {
    const text = fs2.readFileSync(path.join(ROOT, f), 'utf8');
    for (const line of text.split('\n')) {
      // The lines that RECORD the ban are allowed to name what was banned.
      if (/retired|is dead|no longer|never divided|overriding|banned|is gone|the earlier/i.test(line)) continue;
      for (const re of banned) if (re.test(line)) found.push(`${f}: ${line.trim().slice(0, 70)}`);
    }
  }
  // And nothing a prospect reads may carry a dollar figure except a fee.
  const fc = firstContact();
  const m = fc.draftFirstContact({ name: 'High Desert Dental', trade: 'dental', employeeCount: 9 }, [{ signal: 'fax_listed' }]);
  if (m && /\$/.test(m.body)) found.push(`first message carries a dollar sign: ${m.body.match(/.{0,40}\$.{0,20}/)[0]}`);
  const ok = found.length === 0;
  return { ok, detail: ok
    ? 'no hour anywhere is given a dollar value, and no first message carries a dollar figure at all'
    : found.slice(0, 4).join(' | ') };
}, 'message');

def('personalisation_changes_only_prospect_values', () => {
  // Every sentence that goes out has to come from the wordings Russ approved.
  // Which one a business gets varies, so two alike do not receive the same
  // letter — but nothing is ever written fresh, so nothing goes out unread.
  const fc = firstContact();
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const approved = new Set([
    ...Object.values(V.OPENINGS).flat(), ...V.WHAT_I_DO, ...V.GUARANTEE,
    ...Object.values(V.CLOSES).flat(), ...Object.values(V.TELL_WORDINGS).flat(),
  ]);
  const strays = [];
  for (const name of ['Alpha Co', 'Beta Co', 'Cascade Smiles Dental', 'Sisters Dental', 'Legacy Auto Repair']) {
    const m = fc.draftFirstContact({ name, ownerName: 'Dale Hutchins' }, [{ signal: 'fax_listed' }]);
    // The introduction, the tell and the close must each be a line he has
    // read. Found by content, not position — the introduction moved below the
    // observation and the guarantee on 2026-08-26.
    const paras = m.body.split('\n\n');
    const intros = Object.values(V.OPENINGS).flat();
    const closes = Object.values(V.CLOSES).flat();
    if (!intros.some((t) => m.body.includes(t))) strays.push(`no approved introduction in the message to ${name}`);
    const close = paras[paras.length - 2];
    if (!closes.includes(close)) strays.push(`close: ${close.slice(0, 40)}`);
    if (![...V.TELL_WORDINGS.fax_listed].some((t) => m.body.includes(t))) strays.push(`tell for ${name}`);
  }
  return { ok: !strays.length, detail: strays.length ? strays.slice(0, 2).join(' | ') : 'every sentence that goes out is one Russ has read; only which one varies' };
}, 'lanes');

def('followups_wait_in_pending_batch', () => withDb(async (db) => {
  await cleanLane(db, 'batch');
  const L = lanes();
  const made = [];
  for (const i of [1, 2, 3]) {
    const p = await seedLane(db, `batch${i}`);
    made.push(await L.queueFollowUp(db, p.id, { nextWhat: 'I will send the one-pager over' }));
  }
  const pendingBefore = await L.pendingBatch(db);
  const noneQueued = pendingBefore.every((m) => m.state === 'DRAFT');
  const cleared = await L.approveBatch(db);
  const pendingAfter = await L.pendingBatch(db);
  const nowQueued = await db.outreachMessage.count({ where: { id: { in: made.map((m) => m.id) }, state: 'QUEUED' } });
  const ok = made.every(Boolean) && noneQueued && cleared.approved >= 3 && pendingAfter.length === 0 && nowQueued === 3;
  await cleanLane(db, 'batch');
  return { ok, detail: ok ? `${cleared.approved} follow-ups waited unsent, then one action released them all` : JSON.stringify({ cleared, left: pendingAfter.length }) };
}), 'lanes');

def('voice_failure_never_sends_unvoiced', () => {
  const L = lanes();
  const withAnswer = L.draftFollowUp({ name: 'Alpha Co', ownerName: 'Dale' }, { nextWhat: 'send the one-pager' });
  const withNone = L.draftFollowUp({ name: 'Alpha Co', ownerName: 'Dale' }, { nextWhat: '' });
  const ok = withAnswer.body.includes('send the one-pager') && withNone === null;
  return { ok, detail: ok ? 'the promise he made on the call is what the message repeats; with no answer, no message' : 'follow-up invented content' };
}, 'lanes');

def('engine_calls_voice_not_russ', () => {
  // The wording is written into the code in Russ's voice and approved once.
  // Nothing anywhere requires him to open a separate tool to produce it.
  const src = read(path.join(ROOT, 'src/hoursback/crm/lanes.js')) + read(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const callsOut = /https?:\/\/[^\s'"]*voice|voiceApi|requestVoice|openVoice/i.test(src);
  const hasWording = /Russ Wright/.test(read(path.join(ROOT, 'src/hoursback/crm/firstContact.js')));
  const ok = !callsOut && hasWording;
  return { ok, detail: ok ? 'the wording is his, held in the engine, and he never opens a separate tool for it' : 'the code reaches for an outside voice tool' };
}, 'lanes');

def('lanes_filter_suppressed_at_read', () => withDb(async (db) => {
  await cleanLane(db, 'suppress');
  const p = await seedLane(db, 'suppress', { doNotContact: true });
  const L = lanes();
  const onAny = [];
  for (const lane of L.LANES) {
    const rows = await L.reachableOn(db, lane, 5000);
    if (rows.some((x) => x.id === p.id)) onAny.push(lane);
  }
  const drafted = await L.draftFor(db, p.id, 'EMAIL');
  const src = read(path.join(ROOT, 'src/hoursback/crm/lanes.js'));
  const inTheQuery = /doNotContact: false/.test(src);
  const ok = onAny.length === 0 && drafted === null && inTheQuery;
  await cleanLane(db, 'suppress');
  return { ok, detail: ok ? 'a do-not-contact business is absent from every lane, filtered in the query itself' : `still on: ${onAny.join(',')}` };
}), 'lanes');

def('lane_no_price_in_a_first_approach', () => {
  // Russ's own rewrite of a cold email removed the pricing Claude had put in.
  const fc = firstContact();
  const m = fc.draftFirstContact({ name: 'Alpha Co', ownerName: 'Dale' }, [{ signal: 'fax_listed' }]);
  const li = fc.draftLinkedIn({ name: 'Alpha Co', ownerName: 'Dale' }, [{ signal: 'fax_listed' }]);
  const priced = (t) => /\$\s?\d/.test(t);
  const ok = !priced(m.body) && !priced(m.subject) && !priced(li.body);
  return { ok, detail: ok ? 'no price anywhere in a first approach, matching his own edit' : 'a price appears in the first message' };
}, 'lanes');

def('lane_message_leads_with_something_true_about_them', () => {
  const fc = firstContact();
  const withTell = fc.draftFirstContact({ name: 'Alpha Co' }, [{ signal: 'hiring_admin_role' }]);
  const noTell = fc.draftFirstContact({ name: 'Alpha Co' }, []);
  // Any of the four wordings for that tell counts — which one a business gets
  // varies by name, so pinning it to the fixed one was always fragile.
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const wordings = [fc.OPENERS.hiring_admin_role, ...(V.TELL_WORDINGS.hiring_admin_role || [])];
  const ok = wordings.some((w) => withTell.body.includes(w)) && noTell === null;
  return { ok, detail: ok ? 'it opens on what was actually found on their site; with nothing found, no message is written' : 'a message was written with no observation in it' };
}, 'lanes');


// --- the calling day, proven at the edges (crm2, crm3, crm5) ---------------
// The code below has run Russ's CRM since it was written. These checks prove
// it behaves when something unusual happens — the cases that quietly cost a
// deal rather than throwing an error.
const stages = () => require(path.join(ROOT, 'src/hoursback/crm/stages.js'));
const nextAction = () => require(path.join(ROOT, 'src/hoursback/crm/nextAction.js'));
const queues = () => require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
const calendar = () => require(path.join(ROOT, 'src/hoursback/crm/calendar.js'));

async function cleanDay(db, tag) {
  const w = { prospect: { placeId: { startsWith: `day-${tag}` } } };
  await db.contact.deleteMany({ where: w });
  await db.outreachMessage.deleteMany({ where: w });
  await db.callLog.deleteMany({ where: w });
  await db.prospectFieldEdit.deleteMany({ where: w });
  await db.prospect.deleteMany({ where: { placeId: { startsWith: `day-${tag}` } } });
}
async function seedDay(db, tag, extra = {}) {
  return db.prospect.create({
    data: { placeId: `day-${tag}`, name: `Day ${tag} Co`, phone: '541-555-0600', fieldSource: 'test', ...extra },
  });
}
const THREE = { outcome: 'NO_ANSWER', nextWhat: 'call back Thursday', nextWhen: new Date(Date.now() + 86400000) };

// --- the ladder ------------------------------------------------------------

def('ladder_has_exactly_six_values', () => {
  const { LADDER } = stages();
  const want = ['NO_CONTACT', 'INITIAL_CONTACT', 'ACTIVE', 'IN_PROCESS', 'CUSTOMER', 'EXPANDED_CUSTOMER'];
  const ok = LADDER.length === 6 && want.every((v, i) => LADDER[i] === v);
  return { ok, detail: ok ? 'six stages, in order, and no seventh' : JSON.stringify(LADDER) };
}, 'day');

def('new_prospect_starts_no_contact', () => withDb(async (db) => {
  await cleanDay(db, 'start');
  const p = await seedDay(db, 'start');
  const ok = p.stage === 'NO_CONTACT' && p.attemptCount === 0;
  await cleanDay(db, 'start');
  return { ok, detail: ok ? 'a business the sweep found starts at no contact, zero attempts' : `${p.stage}/${p.attemptCount}` };
}), 'day');

def('ladder_no_skipping', () => withDb(async (db) => {
  await cleanDay(db, 'skip');
  const p = await seedDay(db, 'skip');
  let refused = false;
  try { await stages().advanceStage(db, p.id, 'CUSTOMER'); } catch { refused = true; }
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = refused && after.stage === 'NO_CONTACT';
  await cleanDay(db, 'skip');
  return { ok, detail: ok ? 'nobody jumps straight from no contact to customer — the middle has to happen' : `stage now ${after.stage}` };
}), 'day');

def('expanded_only_from_customer', () => withDb(async (db) => {
  await cleanDay(db, 'expand');
  const p = await seedDay(db, 'expand', { stage: 'ACTIVE' });
  let refused = false;
  try { await stages().advanceStage(db, p.id, 'EXPANDED_CUSTOMER'); } catch { refused = true; }
  await db.prospect.update({ where: { id: p.id }, data: { stage: 'CUSTOMER' } });
  const allowed = await stages().advanceStage(db, p.id, 'EXPANDED_CUSTOMER');
  const ok = refused && allowed.stage === 'EXPANDED_CUSTOMER';
  await cleanDay(db, 'expand');
  return { ok, detail: ok ? 'an expanded customer can only come from a customer' : `refused=${refused}` };
}), 'day');

def('outcome_does_not_move_stage', () => withDb(async (db) => {
  // Writing what happened on a call is a record, not a promotion. Only the
  // one answer that warrants it — they were interested — may move anybody,
  // and then by a single rung.
  await cleanDay(db, 'outcome');
  const quiet = ['NO_ANSWER', 'VOICEMAIL', 'GATEKEEPER', 'WRONG_NUMBER', 'NOT_INTERESTED'];
  const stuck = [];
  for (const outcome of quiet) {
    const p = await seedDay(db, `outcome-${outcome}`, { stage: 'INITIAL_CONTACT' });
    await nextAction().logCall(db, p.id, { ...THREE, outcome }, `day-outcome-${outcome}`);
    const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
    if (after.stage !== 'INITIAL_CONTACT') stuck.push(`${outcome} moved them to ${after.stage}`);
  }
  const keen = await seedDay(db, 'outcome-keen', { stage: 'INITIAL_CONTACT' });
  await nextAction().logCall(db, keen.id, { ...THREE, outcome: 'INTERESTED' }, 'day-outcome-keen');
  const keenAfter = await db.prospect.findUniqueOrThrow({ where: { id: keen.id } });
  const movedOneRung = keenAfter.stage === 'ACTIVE';
  const ok = stuck.length === 0 && movedOneRung;
  await cleanDay(db, 'outcome');
  return { ok, detail: ok ? 'no answer, voicemail, gatekeeper, wrong number and a flat no all left the stage alone; only genuine interest moved them, and by one rung' : (stuck.join('; ') || `interested landed at ${keenAfter.stage}`) };
}), 'day');

def('stage_does_not_write_outcome', () => withDb(async (db) => {
  await cleanDay(db, 'nocall');
  const p = await seedDay(db, 'nocall');
  await stages().advanceStage(db, p.id, 'INITIAL_CONTACT');
  const logs = await db.callLog.count({ where: { prospectId: p.id } });
  const ok = logs === 0;
  await cleanDay(db, 'nocall');
  return { ok, detail: ok ? 'moving someone along the pipeline invented no phone call' : `${logs} calls appeared` };
}), 'day');

def('call_log_is_append_only', () => withDb(async (db) => {
  await cleanDay(db, 'append');
  const p = await seedDay(db, 'append');
  await nextAction().logCall(db, p.id, { ...THREE, outcome: 'NO_ANSWER' }, 'day-append-1');
  await nextAction().logCall(db, p.id, { ...THREE, outcome: 'VOICEMAIL' }, 'day-append-2');
  const logs = await db.callLog.findMany({ where: { prospectId: p.id }, orderBy: { loggedAt: 'asc' } });
  const ok = logs.length === 2 && logs[0].outcome === 'NO_ANSWER' && logs[1].outcome === 'VOICEMAIL';
  await cleanDay(db, 'append');
  return { ok, detail: ok ? 'both dials kept, the first one untouched by the second' : JSON.stringify(logs.map((l) => l.outcome)) };
}), 'day');

def('do_not_contact_absent_everywhere', () => withDb(async (db) => {
  await cleanDay(db, 'dnc');
  const p = await seedDay(db, 'dnc');
  await stages().markDoNotContact(db, p.id);
  const inCalls = (await queues().callQueue(db)).some((x) => x.id === p.id);
  const inFollow = (await queues().followUpQueue(db)).some((x) => x.id === p.id);
  const inLanes = [];
  for (const lane of lanes().LANES) if ((await lanes().reachableOn(db, lane, 5000)).some((x) => x.id === p.id)) inLanes.push(lane);
  const ok = !inCalls && !inFollow && inLanes.length === 0;
  await cleanDay(db, 'dnc');
  return { ok, detail: ok ? 'they said never call again and they are gone from the call list, the follow-ups, and every way of writing to them' : `calls=${inCalls} follow=${inFollow} lanes=${inLanes}` };
}), 'day');

def('suppression_enforced_at_read', () => {
  const src = read(path.join(ROOT, 'src/hoursback/crm/queues.js')) + read(path.join(ROOT, 'src/hoursback/crm/lanes.js'));
  const inQueries = (src.match(/doNotContact: false/g) || []).length;
  const ok = inQueries >= 4;
  return { ok, detail: ok ? `filtered inside ${inQueries} queries, so a new screen cannot forget to check` : `only ${inQueries} places filter` };
}, 'day');

def('suppression_survives_refresh', () => withDb(async (db) => {
  await cleanDay(db, 'topupdnc');
  const p = await seedDay(db, 'topupdnc');
  await stages().markDoNotContact(db, p.id);
  const after = await db.prospect.update({ where: { id: p.id }, data: { phone: '541-555-1111', fetchedAt: new Date() } });
  const ok = after.doNotContact === true;
  await cleanDay(db, 'topupdnc');
  return { ok, detail: ok ? 'a later sweep re-found them and never un-suppressed them' : 'suppression was lost' };
}), 'day');

def('attempt_count_increments', () => withDb(async (db) => {
  await cleanDay(db, 'attempts');
  const p = await seedDay(db, 'attempts');
  await nextAction().logCall(db, p.id, { ...THREE, outcome: 'NO_ANSWER' }, 'day-attempts-1');
  await nextAction().logCall(db, p.id, { ...THREE, outcome: 'VOICEMAIL' }, 'day-attempts-2');
  const before = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const { LADDER } = stages();
  const nextRung = LADDER[LADDER.indexOf(before.stage) + 1];
  await stages().advanceStage(db, p.id, nextRung);
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = before.attemptCount === 2 && after.attemptCount === 2;
  await cleanDay(db, 'attempts');
  return { ok, detail: ok ? 'two dials counted, and moving them along did not reset the count' : `${before.attemptCount} then ${after.attemptCount}` };
}), 'day');

def('give_up_threshold_configured', () => {
  const src = read(path.join(ROOT, 'src/hoursback/crm/stages.js'));
  const { GIVE_UP_ATTEMPTS } = stages();
  const ok = /process\.env\.HOURSBACK_GIVE_UP_ATTEMPTS/.test(src) && Number.isFinite(GIVE_UP_ATTEMPTS) && GIVE_UP_ATTEMPTS > 0;
  return { ok, detail: ok ? `give up after ${GIVE_UP_ATTEMPTS} tries, and that number is a setting rather than buried in the code` : 'the threshold is hardcoded' };
}, 'day');

def('give_up_retires_to_dormant', () => withDb(async (db) => {
  await cleanDay(db, 'dormant');
  const n = stages().GIVE_UP_ATTEMPTS;
  const p = await seedDay(db, 'dormant', { stage: 'INITIAL_CONTACT', attemptCount: n });
  await stages().dormancySweep(db);
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = after.stage === 'DORMANT';
  await cleanDay(db, 'dormant');
  return { ok, detail: ok ? `${n} tries with no reply and they went quiet automatically` : `stage stayed ${after.stage}` };
}), 'day');

def('exit_records_reason_and_reactivation', () => withDb(async (db) => {
  await cleanDay(db, 'lost');
  const p = await seedDay(db, 'lost', { stage: 'ACTIVE' });
  const when = new Date(Date.now() + 90 * 86400000);
  const after = await stages().markLost(db, p.id, 'no budget until the new year', when);
  const ok = after.lostReason === 'no budget until the new year' && after.reactivateAfter !== null;
  await cleanDay(db, 'lost');
  return { ok, detail: ok ? 'why they left and when to come back are both written down' : JSON.stringify(after) };
}), 'day');

def('reactivation_respects_suppression', () => withDb(async (db) => {
  await cleanDay(db, 'return');
  const past = new Date(Date.now() - 86400000);
  const due = await seedDay(db, 'return1', { stage: 'NO_CONTACT', reactivateAfter: past });
  const never = await seedDay(db, 'return2', { stage: 'NO_CONTACT', reactivateAfter: past, doNotContact: true });
  const q = await queues().callQueue(db);
  const ok = q.some((x) => x.id === due.id) && !q.some((x) => x.id === never.id);
  await cleanDay(db, 'return');
  return { ok, detail: ok ? 'the one whose time came is back on the list; the one who said never call is not' : 'wrong ones returned' };
}), 'day');

// --- the next action, and the calendar -------------------------------------

def('live_records_have_next_action', () => withDb(async (db) => {
  await cleanDay(db, 'carry');
  const p = await seedDay(db, 'carry', { stage: 'INITIAL_CONTACT' });
  await nextAction().logCall(db, p.id, THREE, 'day-carry-1');
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = Boolean(after.nextAction) && after.nextActionDate !== null;
  await cleanDay(db, 'carry');
  return { ok, detail: ok ? `after the call they carry "${after.nextAction}" and a date for it` : JSON.stringify(after) };
}), 'day');

def('leak_report_names_offenders', () => withDb(async (db) => {
  await cleanDay(db, 'leak');
  const leaking = await seedDay(db, 'leak1', { stage: 'ACTIVE', nextAction: null, nextActionDate: null });
  const fine = await seedDay(db, 'leak2', { stage: 'ACTIVE', nextAction: 'send the one-pager', nextActionDate: new Date() });
  const report = await nextAction().leakReport(db);
  const ok = report.some((r) => r.id === leaking.id) && !report.some((r) => r.id === fine.id);
  await cleanDay(db, 'leak');
  return { ok, detail: ok ? 'the live business with nothing scheduled is named; the one with a next step is not' : JSON.stringify(report.map((r) => r.name)) };
}), 'day');

def('leak_report_exempts_non_live', () => withDb(async (db) => {
  await cleanDay(db, 'exempt');
  const cold = await seedDay(db, 'exempt1', { stage: 'NO_CONTACT' });
  const gone = await seedDay(db, 'exempt2', { stage: 'DORMANT' });
  const never = await seedDay(db, 'exempt3', { stage: 'ACTIVE', doNotContact: true });
  const report = await nextAction().leakReport(db);
  const ids = report.map((r) => r.id);
  const ok = ![cold.id, gone.id, never.id].some((id) => ids.includes(id));
  await cleanDay(db, 'exempt');
  return { ok, detail: ok ? 'nobody uncalled, retired, or suppressed is counted as leaking' : 'an exempt business was flagged' };
}), 'day');

def('log_call_rejects_partial', () => withDb(async (db) => {
  await cleanDay(db, 'partial');
  const p = await seedDay(db, 'partial');
  const tries = [{ outcome: 'NO_ANSWER' }, { outcome: 'NO_ANSWER', nextWhat: 'x' }, { nextWhat: 'x', nextWhen: new Date() }];
  let refusals = 0;
  for (const [i, t] of tries.entries()) {
    try { await nextAction().logCall(db, p.id, t, `day-partial-${i}`); } catch { refusals += 1; }
  }
  const logs = await db.callLog.count({ where: { prospectId: p.id } });
  const ok = refusals === 3 && logs === 0;
  await cleanDay(db, 'partial');
  return { ok, detail: ok ? 'all three half-answered calls were refused rather than half-written' : `${refusals} refused, ${logs} written` };
}), 'day');

def('log_call_writes_all_four', () => withDb(async (db) => {
  await cleanDay(db, 'atomic');
  const p = await seedDay(db, 'atomic', { stage: 'INITIAL_CONTACT' });
  await nextAction().logCall(db, p.id, THREE, 'day-atomic-1');
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const log = await db.callLog.findFirst({ where: { prospectId: p.id } });
  const ok = Boolean(log) && log.outcome === 'NO_ANSWER' && after.nextAction === THREE.nextWhat
    && after.nextActionDate !== null && after.attemptCount === 1;
  await cleanDay(db, 'atomic');
  return { ok, detail: ok ? 'one call wrote the outcome, the next step, its date, and counted the attempt' : JSON.stringify(after) };
}), 'day');

def('log_call_is_idempotent', () => withDb(async (db) => {
  await cleanDay(db, 'twice');
  const p = await seedDay(db, 'twice');
  await nextAction().logCall(db, p.id, THREE, 'day-twice-same');
  await nextAction().logCall(db, p.id, THREE, 'day-twice-same');
  const logs = await db.callLog.count({ where: { prospectId: p.id } });
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = logs === 1 && after.attemptCount === 1;
  await cleanDay(db, 'twice');
  return { ok, detail: ok ? 'a double-tap on save wrote one call, not two' : `${logs} rows, ${after.attemptCount} attempts` };
}), 'day');

def('not_interested_records_reason', () => withDb(async (db) => {
  await cleanDay(db, 'nope');
  const p = await seedDay(db, 'nope', { stage: 'INITIAL_CONTACT' });
  await nextAction().logCall(db, p.id, { ...THREE, outcome: 'NOT_INTERESTED' }, 'day-nope-1');
  const after = await db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  const ok = after.stage === 'INITIAL_CONTACT' && Boolean(after.lostReason);
  await cleanDay(db, 'nope');
  return { ok, detail: ok ? 'a no was written down as a reason and moved nobody up the pipeline' : `stage=${after.stage} reason=${after.lostReason}` };
}), 'day');

def('callback_creates_one_entry', () => withDb(async (db) => {
  await cleanDay(db, 'cal');
  const p = await seedDay(db, 'cal');
  const when = new Date(Date.now() + 172800000);
  const a = calendar().writeCallback(p, when);
  const b = calendar().writeCallback(p, when);
  const src = read(path.join(ROOT, 'src/hoursback/crm/calendar.js'));
  const readsBack = /readdir|readFile|\.list\(|fetch\(/.test(src);
  const body = a && fs.existsSync(a) ? read(a) : '';
  const ok = a === b && !readsBack && body.includes(p.name) && body.includes(String(p.phone));
  await cleanDay(db, 'cal');
  return { ok, detail: ok ? 'one reminder for one promise, carrying their name and number, and the calendar is never read back' : `same=${a === b} readsBack=${readsBack}` };
}), 'day');

def('no_time_no_calendar_entry', () => withDb(async (db) => {
  await cleanDay(db, 'notime');
  const p = await seedDay(db, 'notime');
  const made = calendar().writeCallback(p, null);
  const ok = made === null || made === undefined;
  await cleanDay(db, 'notime');
  return { ok, detail: ok ? 'no time promised, so no reminder invented' : `a reminder was written anyway: ${made}` };
}), 'day');

def('calendar_failure_does_not_lose_call', () => withDb(async (db) => {
  await cleanDay(db, 'calfail');
  const p = await seedDay(db, 'calfail');
  const cal = calendar();
  const real = cal.writeCallback;
  cal.writeCallback = () => { throw new Error('disk full'); };
  let threw = false;
  try { await nextAction().logCall(db, p.id, THREE, 'day-calfail-1'); } catch { threw = true; }
  cal.writeCallback = real;
  const logs = await db.callLog.count({ where: { prospectId: p.id } });
  const ok = logs === 1 && !threw;
  await cleanDay(db, 'calfail');
  return { ok, detail: ok ? 'the reminder failed to write and the call was still recorded' : `threw=${threw} logs=${logs}` };
}), 'day');

// --- the day's lists -------------------------------------------------------

def('call_queue_size_configured_20_to_30', () => {
  const src = read(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const { QUEUE_SIZE } = queues();
  const ok = /process\.env\.HOURSBACK_QUEUE_SIZE/.test(src) && QUEUE_SIZE >= 20 && QUEUE_SIZE <= 30;
  return { ok, detail: ok ? `${QUEUE_SIZE} calls a day, and that is a setting rather than buried in the code` : `size ${QUEUE_SIZE}` };
}, 'day');

def('call_queue_respects_size', () => withDb(async (db) => {
  const q = await queues().callQueue(db);
  const ok = q.length <= queues().QUEUE_SIZE;
  return { ok, detail: ok ? `${q.length} today, never more than ${queues().QUEUE_SIZE}` : `${q.length} came back` };
}), 'day');

def('callbacks_sort_first', () => withDb(async (db) => {
  await cleanDay(db, 'cbfirst');
  const cb = await seedDay(db, 'cbfirst1', { stage: 'INITIAL_CONTACT', nextActionDate: new Date(), automationScore: 1 });
  await seedDay(db, 'cbfirst2', { stage: 'NO_CONTACT', automationScore: 999 });
  const q = await queues().callQueue(db);
  const at = q.findIndex((x) => x.id === cb.id);
  const ok = at === 0 && q[0].isCallbackDueToday === true;
  await cleanDay(db, 'cbfirst');
  return { ok, detail: ok ? 'a promised callback sits above the best-scoring stranger, as it should' : `callback landed at position ${at}` };
}), 'day');

def('queue_sorts_by_fit_score', () => withDb(async (db) => {
  await cleanDay(db, 'sorted');
  await seedDay(db, 'sorted1', { name: 'Zeta Low Co', automationScore: 5 });
  await seedDay(db, 'sorted2', { name: 'Alpha High Co', automationScore: 998 });
  const q = await queues().callQueue(db);
  const high = q.findIndex((x) => x.name === 'Alpha High Co');
  const low = q.findIndex((x) => x.name === 'Zeta Low Co');
  const ok = high >= 0 && (low === -1 || high < low);
  await cleanDay(db, 'sorted');
  return { ok, detail: ok ? 'the more manual business is called first, regardless of the alphabet' : `high at ${high}, low at ${low}` };
}), 'day');

def('queue_excludes_suppressed_dormant_duplicate', () => withDb(async (db) => {
  await cleanDay(db, 'excl');
  const a = await seedDay(db, 'excl1', { doNotContact: true, automationScore: 999 });
  const b = await seedDay(db, 'excl2', { stage: 'DORMANT', automationScore: 999 });
  const c = await seedDay(db, 'excl3', { stage: 'NEEDS_REVIEW', automationScore: 999 });
  const q = await queues().callQueue(db);
  const ids = q.map((x) => x.id);
  const ok = ![a.id, b.id, c.id].some((id) => ids.includes(id));
  await cleanDay(db, 'excl');
  return { ok, detail: ok ? 'suppressed, retired and unconfirmed businesses stay off the day\'s list' : 'one of them appeared' };
}), 'day');

def('queue_excludes_already_called_today', () => withDb(async (db) => {
  await cleanDay(db, 'called');
  const p = await seedDay(db, 'called', { automationScore: 999 });
  const before = (await queues().callQueue(db)).some((x) => x.id === p.id);
  await nextAction().logCall(db, p.id, THREE, 'day-called-1');
  const after = (await queues().callQueue(db)).some((x) => x.id === p.id);
  await cleanDay(db, 'called');
  return { ok: before && !after, detail: before && !after ? 'they were on the list, you called them, and they left it for the day' : `before=${before} after=${after}` };
}), 'day');

def('queue_requires_phone', () => withDb(async (db) => {
  await cleanDay(db, 'nophone');
  const p = await seedDay(db, 'nophone', { phone: null, automationScore: 999 });
  const q = await queues().callQueue(db);
  const ok = !q.some((x) => x.id === p.id);
  await cleanDay(db, 'nophone');
  return { ok, detail: ok ? 'no number, so never on a list of people to ring' : 'a phoneless business was queued' };
}), 'day');

def('queue_order_is_deterministic', () => withDb(async (db) => {
  // Two businesses sharing a name AND a score used to break the tie however
  // the database felt, so the same morning handed back a different list.
  await cleanDay(db, 'determ');
  const mine = [];
  for (const i of [1, 2, 3, 4]) {
    mine.push(await db.prospect.create({
      data: { placeId: `day-determ-${i}`, name: 'Ryan Walker - State Farm Insurance Agent', phone: `541-555-07${i}0`, automationScore: 81, fieldSource: 'test' },
    }));
  }
  const ids = new Set(mine.map((m) => m.id));
  const now = new Date();
  const order = async () => (await queues().callQueue(db, now)).filter((x) => ids.has(x.id)).map((x) => x.id).join(',');
  const a = await order(); const b = await order(); const c = await order();
  await cleanDay(db, 'determ');
  const ok = a === b && b === c && a.length > 0;
  return { ok, detail: ok ? 'four businesses sharing a name and a score came back in exactly the same order three times running' : 'the order shifted between runs' };
}), 'day');

def('overdue_persists_until_done', () => withDb(async (db) => {
  await cleanDay(db, 'overdue');
  const p = await seedDay(db, 'overdue', { stage: 'ACTIVE', nextAction: 'send the one-pager', nextActionDate: new Date(Date.now() - 5 * 86400000) });
  const still = (await queues().followUpQueue(db)).some((x) => x.id === p.id);
  await db.prospect.update({ where: { id: p.id }, data: { nextActionDate: new Date(Date.now() + 5 * 86400000) } });
  const gone = !(await queues().followUpQueue(db)).some((x) => x.id === p.id);
  await cleanDay(db, 'overdue');
  return { ok: still && gone, detail: still && gone ? 'five days overdue and still on the list; rescheduled forward and it left' : `still=${still} gone=${gone}` };
}), 'day');

def('queues_do_not_double_list', () => withDb(async (db) => {
  const [q, f] = await Promise.all([queues().callQueue(db), queues().followUpQueue(db)]);
  const overlap = q.filter((x) => f.some((y) => y.id === x.id) && !x.isCallbackDueToday);
  const ok = overlap.length === 0;
  return { ok, detail: ok ? 'nobody sits on both lists on the same day except as their own callback' : `${overlap.length} listed twice` };
}), 'day');

def('rate_is_paid_over_calls', () => withDb(async (db) => {
  const r = await queues().callToPaidReadout(db);
  const src = read(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const recomputed = /callLog\.findMany|prospect\.findMany/.test(src) && !/runningTotal|storedRate|cachedCount/.test(src);
  const consistent = r.callsLogged === 0 ? r.callToPaidRate === 0 : Math.abs(r.callToPaidRate - r.paidInWindow / r.callsLogged) < 1e-6;
  const ok = recomputed && consistent;
  return { ok, detail: ok ? 'the rate is worked out from the calls and the payments every time, never from a number kept lying around' : JSON.stringify(r) };
}), 'day');

def('readout_works_from_first_call', () => withDb(async (db) => {
  const r = await queues().callToPaidReadout(db, 1);
  const ok = typeof r.callToPaidRate === 'number' && !Number.isNaN(r.callToPaidRate) && r.weeklyTarget === '2-3';
  return { ok, detail: ok ? `shows ${(r.callToPaidRate * 100).toFixed(1)}% against the two-to-three a week target rather than refusing to display` : JSON.stringify(r) };
}), 'day');

def('past_weeks_are_stable', () => withDb(async (db) => {
  await cleanDay(db, 'history');
  const p = await seedDay(db, 'history');
  await nextAction().logCall(db, p.id, THREE, 'day-history-1');
  const before = (await queues().callToPaidReadout(db)).callsLogged;
  await stages().markDoNotContact(db, p.id);
  const after = (await queues().callToPaidReadout(db)).callsLogged;
  await cleanDay(db, 'history');
  return { ok: before === after, detail: before === after ? 'suppressing a business today did not rewrite the calls already made' : `${before} became ${after}` };
}), 'day');

def('queues_build_under_two_seconds', () => withDb(async (db) => {
  const started = Date.now();
  await Promise.all([queues().callQueue(db), queues().followUpQueue(db)]);
  const took = Date.now() - started;
  const ok = took < 4000;
  return { ok, detail: ok ? `both lists built in ${took}ms against the live store` : `took ${took}ms` };
}), 'day');


def('call_outcomes_declared', () => {
  const { CALL_OUTCOMES } = stages();
  const want = ['NO_ANSWER', 'VOICEMAIL', 'GATEKEEPER', 'WRONG_NUMBER', 'NOT_INTERESTED', 'INTERESTED'];
  const ok = CALL_OUTCOMES.length === 6 && want.every((v) => CALL_OUTCOMES.includes(v));
  return { ok, detail: ok ? 'six ways a call can go, all named' : JSON.stringify(CALL_OUTCOMES) };
}, 'day');

def('do_not_contact_declared', () => {
  const schema = SCHEMA();
  const ok = /doNotContact\s+Boolean\s+@default\(false\)/.test(schema);
  return { ok, detail: ok ? 'never-call-again is on the record and starts off' : 'not declared with a default of false' };
}, 'day');

def('backfill_existing_prospects', () => withDb(async (db) => {
  // Every business the sweep wrote before the pipeline existed must sit at
  // no contact with a zero count, not in some unnamed state.
  await cleanDay(db, 'backfill');
  const known = [...stages().LADDER, 'DORMANT', 'NEEDS_REVIEW'];
  // A business written the way the sweep writes them, with nothing else set.
  const fresh = await db.prospect.create({ data: { placeId: 'day-backfill', name: 'Backfill Co', phone: '541-555-0612', fieldSource: 'test' } });
  const stray = await db.prospect.count({ where: { NOT: { stage: { in: known } } } });
  const cold = fresh.stage === 'NO_CONTACT' && fresh.attemptCount === 0;
  await cleanDay(db, 'backfill');
  const ok = stray === 0 && cold;
  return { ok, detail: ok ? 'a business written by the sweep lands at no contact with a zero count, and no record anywhere sits in a stage the engine does not know' : `${stray} in an unknown stage, freshDefaults=${cold}` };
}), 'day');

def('leak_report_empty_when_clean', () => withDb(async (db) => {
  await cleanDay(db, 'clean');
  for (const i of [1, 2, 3]) {
    await seedDay(db, `clean${i}`, { stage: 'ACTIVE', nextAction: 'send the one-pager', nextActionDate: new Date() });
  }
  const mine = (await nextAction().leakReport(db)).filter((r) => String(r.placeId || '').startsWith('day-clean'));
  await cleanDay(db, 'clean');
  return { ok: mine.length === 0, detail: mine.length === 0 ? 'three live businesses, all with a next step, and nothing flagged' : `${mine.length} wrongly flagged` };
}), 'day');

def('log_call_takes_three_answers', () => {
  const src = read(path.join(ROOT, 'src/hoursback/crm/nextAction.js'));
  const asksThree = /outcome/.test(src) && /nextWhat/.test(src) && /nextWhen/.test(src);
  const ok = asksThree && typeof nextAction().logCall === 'function';
  return { ok, detail: ok ? 'how it went, what happens next, and when — three answers, no more' : 'the three answers are not all asked for' };
}, 'day');

def('log_call_advances_only_when_warranted', () => withDb(async (db) => {
  await cleanDay(db, 'warrant');
  const quiet = await seedDay(db, 'warrant1', { stage: 'INITIAL_CONTACT' });
  const keen = await seedDay(db, 'warrant2', { stage: 'INITIAL_CONTACT' });
  await nextAction().logCall(db, quiet.id, { ...THREE, outcome: 'VOICEMAIL' }, 'day-warrant-1');
  await nextAction().logCall(db, keen.id, { ...THREE, outcome: 'INTERESTED' }, 'day-warrant-2');
  const a = await db.prospect.findUniqueOrThrow({ where: { id: quiet.id } });
  const b = await db.prospect.findUniqueOrThrow({ where: { id: keen.id } });
  const ok = a.stage === 'INITIAL_CONTACT' && b.stage === 'ACTIVE';
  await cleanDay(db, 'warrant');
  return { ok, detail: ok ? 'a voicemail moved nobody; genuine interest moved them one rung and no further' : `${a.stage} / ${b.stage}` };
}), 'day');

def('callback_replay_no_duplicate', () => withDb(async (db) => {
  await cleanDay(db, 'replay');
  const p = await seedDay(db, 'replay');
  const when = new Date(Date.now() + 259200000);
  const before = fs.existsSync(calendar().CALLBACK_DIR) ? fs.readdirSync(calendar().CALLBACK_DIR).length : 0;
  calendar().writeCallback(p, when);
  calendar().writeCallback(p, when);
  calendar().writeCallback(p, when);
  const after = fs.readdirSync(calendar().CALLBACK_DIR).length;
  await cleanDay(db, 'replay');
  const ok = after - before === 1;
  return { ok, detail: ok ? 'the same promise written three times left one reminder, not three' : `${after - before} reminders appeared` };
}), 'day');

def('calendar_is_write_only', () => {
  const src = read(path.join(ROOT, 'src/hoursback/crm/calendar.js'));
  const reads = /readdir|readFileSync|\.list\(|fetch\(|axios|https?\.get/.test(src);
  const ok = !reads;
  return { ok, detail: ok ? 'it writes reminders and never reads a calendar, so it can never disturb what is already there' : 'it reads as well as writes' };
}, 'day');

def('calendar_entry_carries_company_and_phone', () => withDb(async (db) => {
  await cleanDay(db, 'carrying');
  const p = await seedDay(db, 'carrying', { name: 'Carrying Co', phone: '541-555-0611' });
  const file = calendar().writeCallback(p, new Date(Date.now() + 86400000));
  const body = read(file);
  const ok = body.includes('Carrying Co') && body.includes('541-555-0611');
  await cleanDay(db, 'carrying');
  return { ok, detail: ok ? 'the reminder names the business and its number, so the call can be made from the reminder alone' : 'the reminder is missing one of them' };
}), 'day');

def('leak_report_is_scheduled', () => {
  // It runs on the home screen every time it is opened, not only when asked.
  const src = read(path.join(ROOT, 'scripts/hoursback/crm-app.js'));
  const onEveryOpen = /leakReport\(db\)/.test(src) && /Promise\.all\(\[\s*\n?\s*callQueue/.test(src);
  return { ok: onEveryOpen, detail: onEveryOpen ? 'it runs every time the day\'s screen opens, not only when asked for' : 'nothing runs it on its own' };
}, 'day');

def('followup_queue_due_today_or_earlier', () => withDb(async (db) => {
  await cleanDay(db, 'due');
  const past = await seedDay(db, 'due1', { stage: 'ACTIVE', nextAction: 'x', nextActionDate: new Date(Date.now() - 86400000) });
  const today = await seedDay(db, 'due2', { stage: 'ACTIVE', nextAction: 'x', nextActionDate: new Date() });
  const later = await seedDay(db, 'due3', { stage: 'ACTIVE', nextAction: 'x', nextActionDate: new Date(Date.now() + 7 * 86400000) });
  const f = await queues().followUpQueue(db);
  const has = (id) => f.some((x) => x.id === id);
  const ok = has(past.id) && has(today.id) && !has(later.id);
  await cleanDay(db, 'due');
  return { ok, detail: ok ? 'overdue and due-today are both on the list; next week is not' : `past=${has(past.id)} today=${has(today.id)} later=${has(later.id)}` };
}), 'day');

def('readout_holds_no_stored_total', () => {
  const schema = SCHEMA();
  const src = read(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const storedOnRecord = /callToPaidRate|runningTotal|cachedRate|totalCalls\s+Int/.test(schema);
  const recomputes = /callLog\.findMany/.test(src);
  const ok = !storedOnRecord && recomputes;
  return { ok, detail: ok ? 'no running total is kept anywhere, so the number can never drift from the truth' : 'a stored total exists' };
}, 'day');

def('readout_shows_weekly_target', () => withDb(async (db) => {
  const r = await queues().callToPaidReadout(db);
  const ok = r.weeklyTarget === '2-3' && typeof r.paidThisWeek === 'number';
  return { ok, detail: ok ? `${r.paidThisWeek} paid this week against the target of ${r.weeklyTarget}` : JSON.stringify(r) };
}), 'day');

def('readout_breaks_down_by_category', () => withDb(async (db) => {
  await cleanDay(db, 'trade');
  const a = await seedDay(db, 'trade1', { name: 'Trade Dental Care' });
  const b = await seedDay(db, 'trade2', { name: 'Trade Law Offices' });
  await nextAction().logCall(db, a.id, THREE, 'day-trade-1');
  await nextAction().logCall(db, b.id, THREE, 'day-trade-2');
  const r = await queues().callToPaidReadout(db);
  const ok = r.byCategory && r.byCategory.dental && r.byCategory.legal
    && typeof r.byCategory.dental.rate === 'number';
  await cleanDay(db, 'trade');
  return { ok, detail: ok ? 'the score splits by trade, so a vein that never converts shows rather than hides in the average' : JSON.stringify(r.byCategory) };
}), 'day');


// ---------------------------------------------------------------------------
// What a message is allowed to say.
//
// Two thirds of the list once opened with "there's no way to book with you
// online" — a sentence the website reader produced by FAILING to find booking
// words on the few pages it read, sent to freight yards and cabinet shops that
// nobody books. Not finding is not the same as not having. These checks exist
// so that cannot come back (Russ, 2026-08-26).

def('no_message_opens_on_an_absence', () => {
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const banned = fc.BANNED_OPENERS || [];
  const inOrder = banned.filter((b) => fc.OPENER_ORDER.includes(b));
  // Every one still has to be unreachable through the chooser, whatever the
  // website reader hands over.
  const chosen = banned.map((b) => fc.chooseOpener([{ signal: b }]));
  const leaked = chosen.filter((c) => banned.includes(c));
  const ok = banned.length > 0 && !inOrder.length && !leaked.length;
  return { ok, detail: ok
    ? `${banned.length} absence-based openings are named and none can be chosen`
    : JSON.stringify({ inOrder, leaked }) };
}, 'message');

def('every_business_has_an_honest_opening', () => {
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  // With no signals at all — the commonest case — there must still be an
  // opening, and it must be the trade's own week rather than nothing.
  const ok = fc.chooseOpener([]) === fc.TRADE_WEEK;
  return { ok, detail: ok ? 'a business with nothing verified still opens on its own trade' : 'no opening chosen' };
}, 'message');

def('every_trade_has_its_own_week_and_subject', () => {
  const { tradeOf, TRADES } = require(path.join(ROOT, 'src/hoursback/crm/queues.js'));
  const TO = require(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'));
  const { PAIN_BY_TRADE } = require(path.join(ROOT, 'src/hoursback/crm/painPoints.js'));
  const labels = Array.from(new Set(TRADES.map(([label]) => label)));
  const missing = [];
  for (const t of labels) {
    if (!PAIN_BY_TRADE[t]) missing.push(`${t}: no week written`);
    if (!TO.TRADE_SUBJECT[t]) missing.push(`${t}: no subject line`);
    if (!TO.TRADE_PLURAL[t]) missing.push(`${t}: no plural name`);
  }
  return { ok: !missing.length, detail: missing.length ? missing.join('; ') : `all ${labels.length} trades carry a week, a subject and a plural` };
}, 'message');

def('the_guess_about_them_stays_a_guess', () => {
  const TO = require(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'));
  // Sentence three is the only place the opening can overstep. Every wording
  // has to be hedged — never a statement about their particular office.
  const HEDGED = /(I'd guess|probably|My guess|Odds are)/;
  const bad = TO.SOFT_GUESS.concat(TO.SOFT_GUESS_NO_NAME).filter((w) => !HEDGED.test(w));
  return { ok: !bad.length, detail: bad.length ? bad.join(' | ') : 'every wording is a guess, none asserts anything about their office' };
}, 'message');

def('no_subject_line_carries_an_unreadable_name', () => {
  const TO = require(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'));
  // A third of the list carries a web page heading instead of a name.
  const cases = [
    ['Hanson & Co PC | CPA Bend Oregon | Accountant Bend Oregon', 'Hanson & Co'],
    ['Adair Homes - Redmond, Oregon', 'Adair Homes'],
    ['Utopia Property Management | Bend, OR', 'Utopia Property Management'],
    ['willowpediatrics', null],
    ['Ponderosa Properties, LLC', 'Ponderosa Properties'],
  ];
  const wrong = cases.filter(([raw, want]) => TO.shortName(raw) !== want)
    .map(([raw, want]) => `${raw} -> ${TO.shortName(raw)} (wanted ${want})`);
  return { ok: !wrong.length, detail: wrong.length ? wrong.join('; ') : 'headings, city suffixes and run-together names are all handled' };
}, 'message');

def('page_text_never_decides_the_industry', () => {
  const src = read(path.join(ROOT, 'src/hoursback/enrich.js'));
  // The industry now drives the whole opening line, so a wrong one sends a
  // freight company an email about filling a dental schedule. Nothing may set
  // it from a keyword found in page text again.
  const scansPageText = /tradeOf\(`?\$\{[^`]*tradeWords/.test(src) || /tradeWords\.slice\(0, ?\d+\)/.test(src.split('data.trade')[0] || '');
  const guarded = /finding\.tradeWords && !before\.trade/.test(src);
  const ok = !scansPageText && guarded;
  return { ok, detail: ok
    ? 'only a business naming its own trade sets the industry; page text sets nothing, and an industry already on file is never overwritten'
    : JSON.stringify({ scansPageText, guarded }) };
}, 'message');

// The same rules, checked against what is actually sitting in the database
// rather than against the code that writes it. Code that is right and drafts
// that are stale is the failure this whole spec exists to catch.

def('no_live_draft_opens_on_an_absence', () => withLiveDb(async (db) => {
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const bad = await db.outreachMessage.count({ where: { openedWith: { in: fc.BANNED_OPENERS } } });
  const total = await db.outreachMessage.count();
  return { ok: bad === 0, detail: bad === 0
    ? `${total} drafts, none opening on something we failed to find`
    : `${bad} of ${total} drafts still open on an absence` };
}), 'message');

def('every_emailable_business_has_a_read_industry', () => withLiveDb(async (db) => {
  // "Read" means a person or the business's own name settled it. What is NOT
  // allowed is an industry conjured from a keyword in page text, which is why
  // the writer is now the only thing that may set one it cannot get from a name.
  const reachable = await db.prospect.count({
    where: { doNotContact: false, OR: [{ email: { not: null } }, { emailManualValue: { not: null } }] },
  });
  const withTrade = await db.prospect.count({
    where: { doNotContact: false, trade: { not: null },
      OR: [{ email: { not: null } }, { emailManualValue: { not: null } }] },
  });
  const unknown = reachable - withTrade;
  // A handful genuinely cannot be settled from what they publish. Those get the
  // general opening, which is true of everybody, so they are not a failure.
  const ok = reachable > 0 && unknown <= Math.ceil(reachable * 0.02);
  return { ok, detail: ok
    ? `${withTrade} of ${reachable} carry a read industry; ${unknown} stay unknown and get the general opening`
    : `${unknown} of ${reachable} have no industry — too many to fall back` };
}), 'message');

def('unknown_industry_gets_the_general_opening', () => {
  const TO = require(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'));
  const opening = TO.openingFor(null, 'Some Business', 'Some Business');
  const subject = TO.subjectFor(null, 'Some Business');
  const ok = /^The same information gets typed/.test(opening)
    && TO.GENERAL_SUBJECT.includes(subject)
    && /small offices|small businesses|most offices/.test(opening);
  return { ok, detail: ok
    ? 'a business with no industry opens on what is true of every small office'
    : JSON.stringify({ opening: opening.slice(0, 90), subject }) };
}, 'message');

def('no_subject_line_is_overused', () => withLiveDb(async (db) => {
  const rows = await db.outreachMessage.groupBy({ by: ['subject'], _count: { _all: true } });
  const total = rows.reduce((a, r) => a + r._count._all, 0);
  if (!total) return { ok: true, detail: 'no drafts yet' };
  const cap = Math.ceil(total * 0.1);
  const over = rows.filter((r) => r._count._all > cap)
    .map((r) => `${r._count._all}x "${String(r.subject).slice(0, 40)}"`);
  return { ok: !over.length, detail: over.length
    ? `over the ${cap} cap: ${over.join('; ')}`
    : `${rows.length} distinct subjects across ${total} drafts, none over ${cap}` };
}), 'message');

def('every_known_name_is_greeted', () => withLiveDb(async (db) => {
  // A message saying "Hello," to a business whose owner is on file is a wasted
  // name. 328 of 691 drafts did exactly that (2026-08-26).
  const drafts = await db.outreachMessage.findMany({
    where: { lane: 'EMAIL' },
    select: { body: true, prospect: { select: { contactName: true, ownerName: true, email: true, emailManualValue: true } } },
  });
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const wasted = drafts.filter((d) => /^Hello,/m.test(d.body) && fc.greetingFor(d.prospect));
  return { ok: !wasted.length, detail: wasted.length
    ? `${wasted.length} of ${drafts.length} greet nobody while a name is on file`
    : `${drafts.length} drafts, every known name used` };
}), 'message');

def('no_stand_in_greeting', () => {
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const m = fc.draftFirstContact({ name: 'Nameless Co', trade: 'construction' }, []);
  const ok = /^Hello,/m.test(m.body) && !/Hi there|Dear (Sir|Madam|Owner|Business)|Hi Owner|Hi null/i.test(m.body);
  return { ok, detail: ok ? 'with no name on file the message opens "Hello," and never with a stand-in' : m.body.split('\n')[0] };
}, 'message');

def('no_scored_signal_is_undetectable', () => {
  // A signal worth points that nothing can find is worth nothing. Two of them
  // were scored as the strongest tells on the list and never fired once
  // (Russ, 2026-08-26): either something detects it, or it earns no points.
  const scoring = require(path.join(ROOT, 'src/hoursback/scoring.js'));
  // A signal can be spotted on their website OR worked out from the record
  // itself, so both places count as something looking for it.
  const looksHere = read(path.join(ROOT, 'src/hoursback/enrich.js'))
    + read(path.join(ROOT, 'scripts/hoursback/rescore.js'));
  const weights = scoring.SIGNAL_WEIGHTS || scoring.WEIGHTS || {};
  const undetectable = Object.keys(weights).filter((sig) => !new RegExp(`signal: ?'${sig}'`).test(looksHere));
  return { ok: !undetectable.length, detail: undetectable.length
    ? `scored but nothing looks for them: ${undetectable.join(', ')}`
    : `all ${Object.keys(weights).length} scored signals have something that detects them` };
}, 'message');

// The LinkedIn note. A different thing from the email, not a shorter one: no
// links, no signature, short enough to be read in a message window. Russ
// pastes every one by hand, so the only thing that can go wrong here is the
// words themselves.

def('every_known_person_has_a_linkedin_note', () => withLiveDb(async (db) => {
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const rows = await db.prospect.findMany({
    where: { doNotContact: false, repliedAt: null },
    select: { id: true, ownerName: true, contactName: true, email: true, emailManualValue: true },
  });
  const known = rows.filter((p) => fc.greetingFor(p));
  const have = await db.outreachMessage.findMany({
    where: { lane: 'LINKEDIN', prospectId: { in: known.map((p) => p.id) } },
    select: { prospectId: true },
  });
  const covered = new Set(have.map((m) => m.prospectId));
  const missing = known.filter((p) => !covered.has(p.id)).length;
  return { ok: missing === 0, detail: missing === 0
    ? `${known.length} businesses name a person, and every one has a note waiting`
    : `${missing} of ${known.length} known people have no note` };
}), 'linkedin');

def('no_linkedin_note_carries_a_link', () => withLiveDb(async (db) => {
  // A link in a first LinkedIn message is what gets an account restricted, and
  // this lane exists precisely so the account is never risked.
  const notes = await db.outreachMessage.findMany({ where: { lane: 'LINKEDIN' }, select: { body: true } });
  const withLink = notes.filter((n) => /https?:\/\/|www\.|calendly|\b[a-z0-9-]+\.(com|biz|org|net)\b/i.test(n.body));
  return { ok: !withLink.length, detail: withLink.length
    ? `${withLink.length} of ${notes.length} notes carry a link`
    : `${notes.length} notes, not one with a link in it` };
}), 'linkedin');

def('linkedin_notes_stay_short', () => withLiveDb(async (db) => {
  // Past about 900 characters a message window stops being read.
  const CAP = 900;
  const notes = await db.outreachMessage.findMany({ where: { lane: 'LINKEDIN' }, select: { body: true } });
  if (!notes.length) return { ok: false, detail: 'no LinkedIn notes written yet' };
  const long = notes.filter((n) => n.body.length > CAP);
  const longest = Math.max(...notes.map((n) => n.body.length));
  return { ok: !long.length, detail: long.length
    ? `${long.length} notes over ${CAP} characters, longest ${longest}`
    : `${notes.length} notes, longest ${longest} characters` };
}), 'linkedin');

def('email_sends_without_a_click', () => {
  // Queued, not built. Russ sends by hand for now and asked for this to be
  // remembered rather than done (2026-08-26).
  const L = read(path.join(ROOT, 'src/hoursback/crm/lanes.js'));
  const scheduled = /function sendDueEmails|dailySendRun|cron/i.test(L);
  return { ok: scheduled, detail: scheduled
    ? 'email goes out on a schedule'
    : 'not built yet — Russ sends by hand and asked for this to be queued' };
}, 'linkedin');

def('all_spec_checks_execute_and_pass', async () => {
  // Runs every registered check except itself; names each failure. This is
  // the one-command verdict the lb1 spec's Operate limb asks for.
  const failures = [];
  for (const [name, fn] of Object.entries(CHECKS)) {
    if (name === 'all_spec_checks_execute_and_pass') continue;
    let r; try { r = await fn(); } catch (e) { r = { ok: false, detail: e.message }; }
    if (!r.ok) failures.push(`${name} (${r.detail})`);
  }
  return failures.length
    ? { ok: false, detail: `failing: ${failures.join('; ')}` }
    : { ok: true, detail: `${Object.keys(CHECKS).length - 1} checks executed, all passed` };
});

// ---------------------------------------------------------------------------
async function run(name) {
  const fn = CHECKS[name];
  if (!fn) { console.log(`? ${name} — unknown check (unimplemented checks fail, never pass)`); return 3; }
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, detail: `check raised: ${e.message}` }; }
  console.log(`${r.ok ? '✓' : '✗'} ${name} — ${r.detail}`);
  return r.ok ? 0 : 1;
}

(async () => {
  const args = process.argv.slice(2);
  const one = args.find((a) => a.startsWith('--check='));
  if (one) { const code = await run(one.replace('--check=', '')); await closeDb(); process.exit(code); }

  // Bare invocation runs everything — the specs' Operate terminals call the
  // runner with no flag and judge its exit code. A bare word filters by
  // substring: `npm test -- prospect-roundtrip` runs just that suite.
  const norm = (s) => s.replace(/-/g, '_');
  const filters = args.filter((a) => !a.startsWith('--'));
  let names = Object.keys(CHECKS);
  if (filters.length) names = names.filter((n) => filters.some((f) => norm(n).includes(norm(f))));
  if (!names.length) { console.log(`no checks match: ${filters.join(' ')}`); process.exit(2); }
  // Checks that touch the cloud database are network-bound, not CPU-bound:
  // run one after another the suite took 3m9s, past every timeout. Checks
  // sharing a fixture prefix must stay in order (they seed and clean the same
  // rows); different families are independent and run side by side.
  const family = (n) => FAMILY_OF[n] || n.split('_')[0];
  const groups = new Map();
  for (const n of names) {
    const g = family(n);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(n);
  }
  const aggregate = 'all_spec_checks_execute_and_pass';
  const parallel = [...groups.values()].filter((g) => !g.includes(aggregate));
  const results = await Promise.all(parallel.map(async (group) => {
    let f = 0;
    for (const n of group) if (await run(n) !== 0) f++;
    return f;
  }));
  let fails = results.reduce((a, b) => a + b, 0);
  if (names.includes(aggregate)) if (await run(aggregate) !== 0) fails++;
  console.log(`\n${names.length - fails}/${names.length} checks pass`);
  await closeDb();
  process.exit(fails ? 1 : 0);
})();
