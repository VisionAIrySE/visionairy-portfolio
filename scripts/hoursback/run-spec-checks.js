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

def('all_spec_checks_execute_and_pass', () => {
  // Runs every registered check except itself; names each failure. This is
  // the one-command verdict the lb1 spec's Operate limb asks for.
  const failures = [];
  for (const [name, fn] of Object.entries(CHECKS)) {
    if (name === 'all_spec_checks_execute_and_pass') continue;
    let r; try { r = fn(); } catch (e) { r = { ok: false, detail: e.message }; }
    if (!r.ok) failures.push(`${name} (${r.detail})`);
  }
  return failures.length
    ? { ok: false, detail: `failing: ${failures.join('; ')}` }
    : { ok: true, detail: `${Object.keys(CHECKS).length - 1} checks executed, all passed` };
});

// ---------------------------------------------------------------------------
function run(name) {
  const fn = CHECKS[name];
  if (!fn) { console.log(`? ${name} — unknown check (unimplemented checks fail, never pass)`); return 3; }
  let r;
  try { r = fn(); } catch (e) { r = { ok: false, detail: `check raised: ${e.message}` }; }
  console.log(`${r.ok ? '✓' : '✗'} ${name} — ${r.detail}`);
  return r.ok ? 0 : 1;
}

const args = process.argv.slice(2);
const one = args.find((a) => a.startsWith('--check='));
if (one) process.exit(run(one.replace('--check=', '')));
// Bare invocation runs everything — the specs' Operate terminals call the
// runner with no flag and judge its exit code.
if (args.length === 0 || args.includes('--all')) {
  let fails = 0;
  for (const name of Object.keys(CHECKS)) if (run(name) !== 0) fails++;
  console.log(`\n${Object.keys(CHECKS).length - fails}/${Object.keys(CHECKS).length} checks pass`);
  process.exit(fails ? 1 : 0);
}
console.log('usage: run-spec-checks.js [--check=NAME | --all]');
process.exit(2);
