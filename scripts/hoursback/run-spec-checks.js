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

// ---------------------------------------------------------------------------
// The checks. Each returns {ok, detail}. Never throws to the caller.
const CHECKS = {};
function def(name, fn) { CHECKS[name] = fn; }

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

function nineBands() {
  const { TEAM_SIZE_BANDS } = rules();
  if (TEAM_SIZE_BANDS.length !== 9) return { ok: false, detail: `expected 9 bands, found ${TEAM_SIZE_BANDS.length}` };
  for (const b of TEAM_SIZE_BANDS) {
    for (const k of ['name', 'floor', 'ceiling', 'auditFee', 'guaranteedHours']) {
      if (b[k] === undefined || b[k] === null) return { ok: false, detail: `band ${b.name || '?'} missing ${k}` };
    }
  }
  return { ok: true, detail: '9 bands, every one carrying name, floor, ceiling, auditFee, guaranteedHours' };
}
def('nine_bands_with_required_fields', nineBands);
def('nine_bands_with_fee_and_hours', nineBands);

def('bands_contiguous_no_gap_no_overlap', () => {
  const { TEAM_SIZE_BANDS } = rules();
  for (let i = 1; i < TEAM_SIZE_BANDS.length; i++) {
    const prev = TEAM_SIZE_BANDS[i - 1], cur = TEAM_SIZE_BANDS[i];
    if (cur.floor !== prev.ceiling + 1) {
      return { ok: false, detail: `gap or overlap between ${prev.name} (ceiling ${prev.ceiling}) and ${cur.name} (floor ${cur.floor})` };
    }
  }
  return { ok: true, detail: 'floors and ceilings are contiguous across all nine bands' };
});

def('band_lookup_in_range', () => {
  const { bandForEmployeeCount, TEAM_SIZE_BANDS } = rules();
  for (let n = TEAM_SIZE_BANDS[0].floor; n <= TEAM_SIZE_BANDS[8].ceiling; n++) {
    const expect = TEAM_SIZE_BANDS.find((b) => n >= b.floor && n <= b.ceiling);
    const got = bandForEmployeeCount(n);
    if (got.band !== expect.name || got.auditFee !== expect.auditFee || got.guaranteedHours !== expect.guaranteedHours) {
      return { ok: false, detail: `count ${n}: got ${got.band}/$${got.auditFee}/${got.guaranteedHours}h, expected ${expect.name}/$${expect.auditFee}/${expect.guaranteedHours}h` };
    }
  }
  return { ok: true, detail: 'every count 1..150 resolves to its band with the right fee and hours' };
});

def('fee_constant_within_band', () => {
  const { bandForEmployeeCount, TEAM_SIZE_BANDS } = rules();
  for (const b of TEAM_SIZE_BANDS) {
    const lo = bandForEmployeeCount(b.floor), hi = bandForEmployeeCount(b.ceiling);
    if (lo.auditFee !== hi.auditFee || lo.guaranteedHours !== hi.guaranteedHours) {
      return { ok: false, detail: `band ${b.name}: fee/hours differ between floor and ceiling` };
    }
  }
  return { ok: true, detail: 'auditFee and guaranteedHours identical at both edges of every band' };
});

def('fee_equals_hundred_times_hours_with_entry_rounding', () => {
  const { TEAM_SIZE_BANDS } = rules();
  const [entry, ...rest] = TEAM_SIZE_BANDS;
  if (entry.auditFee !== 999) return { ok: false, detail: `entry band fee is ${entry.auditFee}, expected the documented 999 rounding of 1000` };
  for (const b of rest) {
    if (b.auditFee !== 100 * b.guaranteedHours) {
      return { ok: false, detail: `band ${b.name}: $${b.auditFee} != 100 x ${b.guaranteedHours}h` };
    }
  }
  return { ok: true, detail: '8 bands at exactly $100/hour; entry band carries the single documented $999 rounding' };
});

def('null_band_below_floor', () => {
  const { bandForEmployeeCount } = rules();
  const r = bandForEmployeeCount(0);
  const ok = r.band === null && r.auditFee === null && r.guaranteedHours === null && !!r.reason;
  return { ok, detail: ok ? `count 0 -> null band, reason "${r.reason}", no throw` : `count 0 -> ${JSON.stringify(r)}` };
});

def('null_band_above_ceiling', () => {
  const { bandForEmployeeCount } = rules();
  const r = bandForEmployeeCount(151);
  const ok = r.band === null && r.auditFee === null && r.guaranteedHours === null && !!r.reason;
  return { ok, detail: ok ? `count 151 -> null band, reason "${r.reason}", no throw` : `count 151 -> ${JSON.stringify(r)}` };
});

def('contract_out_of_range_named_reason', () => {
  const { bandForEmployeeCount, OUT_OF_RANGE_REASONS } = rules();
  const below = bandForEmployeeCount(0).reason, above = bandForEmployeeCount(9999).reason;
  const ok = below === OUT_OF_RANGE_REASONS.BELOW_FLOOR && above === OUT_OF_RANGE_REASONS.ABOVE_CEILING;
  return { ok, detail: ok ? `named reasons: ${below} / ${above}` : `got ${below} / ${above}` };
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

function codeMatchesLocked() {
  const { TEAM_SIZE_BANDS } = rules();
  const locked = bandsFromLockedDecisions();
  if (locked.length !== 9) return { ok: false, detail: `locked-decisions.md table parse found ${locked.length} rows, expected 9` };
  for (const row of locked) {
    const b = TEAM_SIZE_BANDS.find((x) => x.floor === row.floor && x.ceiling === row.ceiling);
    if (!b) return { ok: false, detail: `no code band spans ${row.label}` };
    if (b.auditFee !== row.auditFee || b.guaranteedHours !== row.guaranteedHours) {
      return { ok: false, detail: `${row.label}: code $${b.auditFee}/${b.guaranteedHours}h vs locked-decisions $${row.auditFee}/${row.guaranteedHours}h` };
    }
  }
  return { ok: true, detail: 'all nine code bands equal the locked-decisions.md table (precedence holds)' };
}
def('band_figures_match_locked_decisions', codeMatchesLocked);
def('locked_decisions_wins_on_conflict', () => {
  const base = codeMatchesLocked();
  if (!base.ok) return base;
  const pricing = read(path.join(ROOT, 'src/hoursback/pricing.js'));
  if (!/PRECEDENCE[\s\S]{0,200}locked-decisions\.md/.test(pricing)) {
    return { ok: false, detail: 'pricing.js carries no precedence comment naming locked-decisions.md' };
  }
  return { ok: true, detail: base.detail + '; precedence comment present' };
});
def('contract_precedence_applied', codeMatchesLocked);

def('source_fee_identity_holds_with_entry_rounding', () => {
  const rows = bandsFromBusinessModel();
  if (rows.length !== 9) return { ok: false, detail: `business-model.md pricing table parse found ${rows.length} rows, expected 9` };
  for (const [i, row] of rows.entries()) {
    if (i === 0) {
      if (row.auditFee !== 999) return { ok: false, detail: `entry row "${row.label}" carries $${row.auditFee}, expected the documented 999` };
      continue;
    }
    if (row.auditFee !== 100 * row.guaranteedHours) {
      return { ok: false, detail: `heading "§3 The pricing rule", row "${row.label}": $${row.auditFee} != 100 x ${row.guaranteedHours}h` };
    }
  }
  return { ok: true, detail: 'the source table holds the $100/hour identity, entry band as the single 999 rounding' };
});

def('contract_no_per_employee_fee', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'src/hoursback')).filter((x) => x.endsWith('.js'))) {
    const t = read(path.join(ROOT, 'src/hoursback', f));
    if (/pricePerEmployee|per_employee_fee/i.test(t)) return { ok: false, detail: `${f} carries a per-employee fee name` };
  }
  const fc = CHECKS.fee_constant_within_band();
  if (!fc.ok) return fc;
  return { ok: true, detail: 'no per-employee fee field anywhere in src/hoursback; fee constant within each band' };
});

// --- meta checks over the spec files themselves ---------------------------
const TERMINAL_RE = /^\s*-\s*\[[ x]\]\s/;
def('every_requirement_carries_a_check', () => {
  for (const f of specFiles()) {
    const lines = read(f).split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (TERMINAL_RE.test(lines[i]) && !/check:/.test(lines[i]) && !/check:/.test(lines[i + 1] || '')) {
        return { ok: false, detail: `${path.basename(f)}:${i + 1} terminal with no check` };
      }
    }
  }
  return { ok: true, detail: 'every terminal in every spec carries a check' };
});
def('lb5_every_terminal_has_machine_check', () => CHECKS.every_requirement_carries_a_check());

def('no_human_judgment_terminals', () => {
  for (const f of specFiles()) {
    if (/signoff:/i.test(read(f))) return { ok: false, detail: `${path.basename(f)} carries a signoff marker` };
  }
  return { ok: true, detail: 'no spec defers to a human sign-off' };
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
    && after.auditFee === 2500 && after.guaranteedHours === 25 && after.segment === '21-25';
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

def('band_derived_from_headcount_only', () => {
  const { enrichHeadcount } = enrich();
  const a = enrichHeadcount({ employeeCount: 12, headcountSourceUrl: 'https://a/' });
  const b = enrichHeadcount({ employeeCount: 12, headcountSourceUrl: 'https://b/', email: 'x@y.com', signals: ['fax_listed'] });
  const c = enrichHeadcount({ employeeCount: 40 });
  const sameInputsSameBand = a.segment === b.segment && a.auditFee === b.auditFee && a.guaranteedHours === b.guaranteedHours;
  const differentCountDifferentBand = a.segment !== c.segment;
  const ok = sameInputsSameBand && differentCountDifferentBand;
  return { ok, detail: ok ? 'only the number of people moved the band; nothing else did' : `same=${sameInputsSameBand} differs=${differentCountDifferentBand}` };
});

def('derived_fee_matches_band_table', () => {
  const { enrichHeadcount } = enrich();
  const bad = [];
  for (const row of bandsFromBusinessModel()) {
    for (const n of [row.floor, row.ceiling]) {
      const got = enrichHeadcount({ employeeCount: n });
      if (got.auditFee !== row.auditFee || got.guaranteedHours !== row.guaranteedHours) {
        bad.push(`${n}: got $${got.auditFee}/${got.guaranteedHours}h want $${row.auditFee}/${row.guaranteedHours}h`);
      }
    }
  }
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : 'every band edge prices exactly as the business model says' };
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

def('ambiguous_range_takes_lower_band', () => {
  const { enrichHeadcount } = enrich();
  const { bandForEmployeeCount } = rules();
  const got = enrichHeadcount(readFixture('rangePublisher'));
  const low = bandForEmployeeCount(8);
  const high = bandForEmployeeCount(20);
  const ok = got.guaranteedHours === low.guaranteedHours && got.auditFee === low.auditFee && low.guaranteedHours < high.guaranteedHours;
  return { ok, detail: ok ? `a range spanning two bands promised the smaller ${low.guaranteedHours} hours, not ${high.guaranteedHours}` : JSON.stringify(got) };
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
  const missing = overrides().OVERRIDABLE.filter((f) => !new RegExp(`${f}ManualValue\\s`).test(s));
  return { ok: !missing.length, detail: missing.length ? `no hand-entered column for: ${missing.join(', ')}` : 'every machine-written field has a typed-by-hand column beside it' };
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

def('manual_work_signals_declared', () => {
  const { SIGNAL_WEIGHTS } = scoring();
  const want = ['hiring_admin_role', 'no_online_booking', 'downloadable_forms', 'fax_listed', 'no_customer_portal', 'high_reviews_for_headcount'];
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
  const p = await seedSite(db, 'zeroscore', { website: 'https://redmondsigns.com/' });
  const after = (await enrich().applySiteRead(db, p.id, readFixture('emptyShell'))).prospect;
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
  const family = (n) => n.split('_')[0];
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
