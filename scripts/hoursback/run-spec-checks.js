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
async function withDb(fn) {
  const { PrismaClient } = require(path.join(ROOT, 'node_modules/@prisma/client'));
  const db = new PrismaClient();
  try { return await fn(db); } finally { await db.$disconnect(); }
}

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
  const { execSync } = require('child_process');
  try {
    const tab = execSync('crontab -l', { encoding: 'utf8' });
    const ok = /monthly-top-up\.js/.test(tab);
    return { ok, detail: ok ? 'host crontab carries the monthly top-up entry' : 'crontab exists but has no top-up entry' };
  } catch { return { ok: false, detail: 'no crontab installed on this host' }; }
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
  if (one) process.exit(await run(one.replace('--check=', '')));

  // Bare invocation runs everything — the specs' Operate terminals call the
  // runner with no flag and judge its exit code. A bare word filters by
  // substring: `npm test -- prospect-roundtrip` runs just that suite.
  const norm = (s) => s.replace(/-/g, '_');
  const filters = args.filter((a) => !a.startsWith('--'));
  let names = Object.keys(CHECKS);
  if (filters.length) names = names.filter((n) => filters.some((f) => norm(n).includes(norm(f))));
  if (!names.length) { console.log(`no checks match: ${filters.join(' ')}`); process.exit(2); }
  let fails = 0;
  for (const name of names) if (await run(name) !== 0) fails++;
  console.log(`\n${names.length - fails}/${names.length} checks pass`);
  process.exit(fails ? 1 : 0);
})();
