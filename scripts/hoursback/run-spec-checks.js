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

// ---------------------------------------------------------------------------
// Was tonight's work actually finished? (2026-08-28)
//
// Three things were promised: the names read and corrected, the research done
// with its sources recorded, and the two paired onto the customer card. Each
// one is checked here rather than reported, because a report of my own work is
// what put invented numbers into the scoring in the first place.

def('a_person_on_the_list_has_something_behind_them', async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    // Relaxing the team-page reader so it could see a job title under a
    // photograph also let a great deal of the page in with it: "Drainage
    // Solutions" was the main contact at an excavation company, and
    // "Flea Treatment" and "Wire Transfers" were people (2026-08-28).
    //
    // A person a business published has something attached: an address, a job
    // title, a direct line, or a profile. A row that is only two capitalised
    // words has nothing behind it and cannot be written to or rung.
    const bare = await db.contact.count({
      where: {
        AND: [
          { source: { not: 'RUSS' } },
          { OR: [{ email: null }, { email: '' }] },
          { OR: [{ role: null }, { role: '' }] },
          { OR: [{ phone: null }, { phone: '' }] },
          { OR: [{ linkedIn: null }, { linkedIn: '' }] },
        ],
      },
    });
    if (bare > 50) return { ok: false, detail: `${bare} people have nothing behind them at all` };
    const total = await db.contact.count();
    return { ok: true, detail: `${total} people, ${bare} of them with nothing behind them` };
  } finally { await db.$disconnect(); }
}, 'people');

def('the_fifteen_minutes_belongs_to_a_business', () => {
  const src = read(path.join(ROOT, 'scripts/hoursback/crm-app.js'));
  // It was a menu item where a trade is picked, which is a reference sheet
  // rather than a tool. Russ: "The 15 Minutes was supposed to be a link inside
  // each Business's card, tied to their specific industry, so it would capture
  // it IN THEIR RECORD FOR FUTURE USE" (2026-08-28).
  if (/<a href="\/questions">/.test(src)) return { ok: false, detail: 'still a menu item with no business behind it' };
  if (!src.includes('The 15 minutes for ${esc(p.trade')) return { ok: false, detail: 'no button on a business that names their trade' };
  if (!src.includes('questionsScreen(id ? decodeURIComponent(id) : null, url.searchParams.get(\'for\'))')) {
    return { ok: false, detail: 'the page is not told which business it was opened from' };
  }
  return { ok: true, detail: 'opened from a business, knowing their trade, and the call writes back to them' };
});

def('the_account_page_is_editable_where_you_sit', () => {
  const src = read(path.join(ROOT, 'scripts/hoursback/crm-app.js'));
  // Russ: "why wouldn't there just be the list on the account page showing the
  // people and the emails with the check boxes there?" (2026-08-28)
  for (const field of ['name', 'role', 'email', 'phone', 'linkedIn']) {
    if (!src.includes(`name="p.\${c.id}.${field}"`)) return { ok: false, detail: `${field} is not editable on the account page` };
  }
  if (!src.includes('name="send" value="${c.id}"')) return { ok: false, detail: 'no tick box beside a person on the account page' };
  if (!src.includes('Save everything above')) return { ok: false, detail: 'no single save' };
  if (!src.includes('/people/save?back=${p.id}')) return { ok: false, detail: 'saving does not come back to the business' };
  return { ok: true, detail: 'name, role, address, direct line, profile, tick box and messages — all editable, one save' };
});

def('names_were_read_and_corrected', () => {
  const C = require(path.join(ROOT, 'src/hoursback/nameCorrections.js'));
  const n = Object.keys(C.BY_DOMAIN).length;
  const held = Object.keys(C.STILL_UNKNOWN).length;
  const chains = C.NOT_A_LOCAL_BUSINESS.length;
  if (n < 90) return { ok: false, detail: `only ${n} names corrected, expected 90+` };
  if (!held) return { ok: false, detail: 'nothing held back — every unreadable name was guessed at' };
  if (!chains) return { ok: false, detail: 'no national chains excluded' };
  // A correction that is itself a search heading has fixed nothing. The shapes
  // that were actually in the bad data: "Dentist in Redmond OR", "Best Vet
  // Hospital In Bend, OR", "Award-Winning Staffing Agency in Bend, OR".
  //
  // Ending in "Services" is NOT a heading — Bright Services and Midstate
  // Construction Services are what those businesses are called, and an earlier
  // version of this check failed them (2026-08-28).
  const HEADING = /(near ?me|top.rated|award.winning|official site)|\bin (bend|redmond|sisters|prineville|madras|la pine|sunriver|central oregon)\b|^(best|affordable|expert|trusted|premier|cheap)\s/i;
  const bad = Object.entries(C.BY_DOMAIN).filter(([, v]) => HEADING.test(v));
  if (bad.length) return { ok: false, detail: `${bad.length} corrections are still headings: ${bad[0][1]}` };
  return { ok: true, detail: `${n} names read by hand, ${held} held back unconfirmed, ${chains} chains excluded` };
});

def('name_reader_keeps_the_town_in_the_name', () => {
  const { properName } = require(path.join(ROOT, 'src/hoursback/businessName.js'));
  // The bug that sent "Accounting PC" to Bend Accounting PC. A town is only
  // stripped when a state marker follows it, which is what makes it a heading.
  const keep = ['Bend Accounting PC', 'Central Oregon Irrigation District', 'La Pine Realty', 'Bend Oral Surgery', 'Prineville Body and Paint'];
  for (const name of keep) {
    if (properName(name) !== name) return { ok: false, detail: `"${name}" came back as "${properName(name)}"` };
  }
  // And it still throws away a real search heading.
  if (properName('Bend, OR Dentist Near Me') !== null) return { ok: false, detail: 'a search heading survived' };
  return { ok: true, detail: `${keep.length} town-named businesses keep their names; headings still dropped` };
});

def('industries_were_read_and_corrected', () => {
  const T = require(path.join(ROOT, 'src/hoursback/tradeCorrections.js'));
  const { ADMIN_SHARE } = require(path.join(ROOT, 'src/hoursback/industryTiers.js'));
  const S = require(path.join(ROOT, 'src/hoursback/scenarios.js'));
  const known = new Set([...Object.keys(ADMIN_SHARE), ...S.tradesCovered()]);
  const fixed = Object.entries(T.TRADE_BY_DOMAIN);
  if (!fixed.length) return { ok: false, detail: 'no industries corrected' };
  // A correction to an industry nothing knows about is worse than the error.
  for (const [d, t] of fixed) {
    if (!known.has(t)) return { ok: false, detail: `${d} corrected to "${t}", which no scenario list covers` };
  }
  // Every dropped business must say WHY in words, not a flag.
  const dropped = Object.entries(T.NOT_A_PROSPECT);
  if (!dropped.length) return { ok: false, detail: 'nothing dropped — every record was accepted as a prospect' };
  for (const [d, why] of dropped) {
    if (!why || why.length < 12) return { ok: false, detail: `${d} dropped with no reason given` };
  }
  return { ok: true, detail: `${fixed.length} industries corrected by hand, ${dropped.length} dropped with a stated reason` };
});

def('research_carries_a_source_and_a_trust_level', () => {
  const E = require(path.join(ROOT, 'src/hoursback/evidence.js'));
  const LEVELS = [E.PRIMARY, E.SECOND_HAND, E.VENDOR, E.NONE];
  const entries = Object.entries(E.EVIDENCE);
  if (entries.length < 8) return { ok: false, detail: `only ${entries.length} trades researched` };
  for (const [trade, e] of entries) {
    if (!LEVELS.includes(e.trust)) return { ok: false, detail: `${trade}: trust level "${e.trust}" is not one of the four` };
    if (!e.who) return { ok: false, detail: `${trade}: no source named` };
    if (!e.what) return { ok: false, detail: `${trade}: nothing recorded about what was found` };
  }
  // The gate that matters: only a PRIMARY source may be quoted word for word.
  for (const [trade, e] of entries) {
    if (e.sayItLikeThis && e.trust !== E.PRIMARY) {
      return { ok: false, detail: `${trade}: quotable line on a ${e.trust} source` };
    }
  }
  const quotable = entries.filter(([t]) => E.quotableFor(t)).length;
  if (!quotable) return { ok: false, detail: 'nothing at all is quotable to a client' };
  return { ok: true, detail: `${entries.length} trades researched, ${quotable} quotable, ${E.SEARCHED_NOTHING_FOUND.length} searched with nothing found` };
});

def('every_trade_has_four_scenarios_paired_to_platforms', () => {
  const S = require(path.join(ROOT, 'src/hoursback/scenarios.js'));
  const { ADMIN_SHARE } = require(path.join(ROOT, 'src/hoursback/industryTiers.js'));
  const trades = Object.keys(ADMIN_SHARE).filter((t) => t !== 'other');
  const thin = [];
  const unpaired = [];
  for (const t of trades) {
    const d = S.forTrade(t);
    if (d.generic) thin.push(t);
    if (d.scenarios.length < 4) thin.push(`${t} (${d.scenarios.length})`);
    // Pairing is the whole point: a scenario with no tool is a complaint.
    for (const sc of d.scenarios) {
      if (!sc.buy.length && !sc.build) unpaired.push(`${t}/${sc.type}`);
    }
  }
  if (thin.length) return { ok: false, detail: `no list of four for: ${thin.join(', ')}` };
  if (unpaired.length) return { ok: false, detail: `${unpaired.length} scenarios have nothing that fixes them: ${unpaired[0]}` };
  const total = trades.reduce((n, t) => n + S.forTrade(t).scenarios.length, 0);
  return { ok: true, detail: `${trades.length} trades, ${total} scenarios, every one paired to a tool or a build` };
});

def('evidence_reaches_every_trade_through_the_work', () => {
  const S = require(path.join(ROOT, 'src/hoursback/scenarios.js'));
  const E = require(path.join(ROOT, 'src/hoursback/evidence.js'));
  const { ADMIN_SHARE } = require(path.join(ROOT, 'src/hoursback/industryTiers.js'));
  const trades = Object.keys(ADMIN_SHARE).filter((t) => t !== 'other');
  // Searching trade by trade reached three trades out of twenty-four. The same
  // question asked by KIND OF WORK reaches nearly all of them, because
  // following up an enquiry is the same act everywhere (2026-08-28).
  const bare = trades.filter((t) => !S.forTrade(t).scenarios.some((sc) => sc.evidence || sc.workEvidence));
  if (bare.length) return { ok: false, detail: `no published evidence reaches: ${bare.join(', ')}` };
  // And the same gate as before: only a PRIMARY source may be quoted.
  for (const [type, e] of Object.entries(E.BY_WORK)) {
    if (e.sayItLikeThis && e.trust !== E.PRIMARY) return { ok: false, detail: `${type}: quotable line on a ${e.trust} source` };
    if (!e.who || !e.what) return { ok: false, detail: `${type}: source or finding missing` };
  }
  let backed = 0; let total = 0;
  for (const t of trades) for (const sc of S.forTrade(t).scenarios) { total += 1; if (sc.evidence || sc.workEvidence) backed += 1; }
  const quotable = Object.keys(E.BY_WORK).filter((k) => E.quotableForWork(k)).length;
  return { ok: true, detail: `all ${trades.length} trades reached, ${backed}/${total} scenarios backed, ${quotable} kinds of work quotable word for word` };
});

def('no_scenario_invents_how_much_a_tool_removes', () => {
  const S = require(path.join(ROOT, 'src/hoursback/scenarios.js'));
  const ALLOWED = [S.MOST, S.HALF, S.UNMEASURED];
  for (const t of S.tradesCovered()) {
    for (const sc of S.forTrade(t).scenarios) {
      if (!ALLOWED.includes(sc.removes)) {
        return { ok: false, detail: `${t}/${sc.type}: "${sc.removes}" — nobody measured that` };
      }
    }
  }
  return { ok: true, detail: 'every saving is words, never an unmeasured percentage' };
});

def('the_card_shows_the_scenarios', () => {
  const src = read(path.join(ROOT, 'scripts/hoursback/crm-app.js'));
  if (!src.includes("require('../../src/hoursback/scenarios.js')")) return { ok: false, detail: 'the card does not load the scenarios' };
  if (!src.includes('Where their five hours are')) return { ok: false, detail: 'no scenarios section on the card' };
  if (!src.includes('trustWord')) return { ok: false, detail: 'the card shows research without saying how far it can be trusted' };
  return { ok: true, detail: 'the card loads them, shows them, and labels how far each source can be trusted' };
});

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
    const { PrismaClient } = require('@prisma/client');
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
    const { PrismaClient } = require('@prisma/client');
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
  // A business with no tells on its site is no longer a zero. The score now
  // says how many hours are probably sitting there, and a dental practice is
  // full of them whether or not its website is modern — that reversal was the
  // whole point of the rework (Russ, 2026-08-27). What still must hold is that
  // it keeps its place on the list and scores only on opportunity, with
  // nothing added for tells it does not have.
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const onlyOpportunity = R.opportunityPart(after).points;
  // Points may still come from what the RECORD knows — a team size, a named
  // owner — because those are true whatever the website looks like. What must
  // never appear is a point earned from a website tell this business does not
  // have.
  const SITE_TELLS = ['no_online_booking', 'no_way_to_enquire', 'no_website',
    'fax_listed', 'downloadable_forms', 'no_email_published', 'hiring_admin_role'];
  let evidence = [];
  try { evidence = JSON.parse(after.scoreEvidence || '[]'); } catch { evidence = []; }
  const invented = evidence.filter((e) => SITE_TELLS.includes(e.signal));
  const ok = !invented.length && after.automationScore >= onlyOpportunity && Boolean(stillThere);
  await cleanSite(db, 'zeroscore');
  return { ok, detail: ok
    ? `nothing found on the site: scores ${after.automationScore}, of which ${onlyOpportunity} is the hours sitting there, and stays on the list`
    : invented.length ? `credited with tells it does not have: ${invented.map((e) => e.signal).join(', ')}`
      : `score=${after.automationScore} below opportunity=${onlyOpportunity}, kept=${Boolean(stillThere)}` };
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

def('two_senders_cannot_send_the_same_email', () => withDb(async (db) => {
  await cleanLane(db, 'twosenders');
  const L = lanes();
  await approvedTemplate(db);
  const p = await seedLane(db, 'twosenders');
  await L.queueEmail(db, p.id);
  let calls = 0;
  const slowSend = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { id: 'provider-one' };
  };
  const runs = await Promise.all([
    L.sendQueuedEmails(db, { apiKey: 'test-key', send: slowSend, limit: 1 }),
    L.sendQueuedEmails(db, { apiKey: 'test-key', send: slowSend, limit: 1 }),
  ]);
  const saved = await db.outreachMessage.findFirstOrThrow({
    where: { prospectId: p.id, lane: 'EMAIL' },
  });
  const ok = calls === 1 && runs.reduce((total, run) => total + run.sent, 0) === 1
    && saved.state === 'SENT' && saved.deliveryState === 'DELIVERED'
    && saved.providerMessageId === 'provider-one';
  await cleanLane(db, 'twosenders');
  return { ok, detail: ok
    ? 'two senders raced; the provider was called once and one delivery was recorded'
    : JSON.stringify({ calls, runs, state: saved.state, deliveryState: saved.deliveryState }) };
}), 'lanes');

def('send_one_refusal_never_stops_the_rest', () => withDb(async (db) => {
  await cleanLane(db, 'onefail');
  const L = lanes();
  await approvedTemplate(db);
  for (const i of [1, 2, 3]) { const p = await seedLane(db, `onefail${i}`); await L.queueEmail(db, p.id); }
  let n = 0;
  const flaky = async () => {
    n += 1;
    if (n === 2) {
      const error = new Error('refused');
      error.definitelyNotSent = true;
      throw error;
    }
  };
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
  // The trade's week now OPENS the message, so it starts a sentence and keeps
  // its capital. It used to follow an observed tell and run on mid-sentence,
  // which is why this only ever looked for the lower-cased version.
  const either = (body, t) => {
    const r = painFor(t).recognition;
    return body.includes(r) || body.includes(r.charAt(0).toLowerCase() + r.slice(1));
  };
  const namesWork = either(known.body, 'trades') && known.trade === 'trades';
  // A business whose trade cannot be settled gets the general week, which is
  // true of every small office. The trade itself is worked out from the name
  // now, so it is rarely null (2026-08-27).
  const fallsBack = either(unknown.body, 'other') || either(unknown.body, unknown.trade || 'other');
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
    && ![a, b, c].some((m) => FAWNING.test(m.body))
    // The promise gets a paragraph short enough to be read rather than
    // scanned past. The year figure that used to sit beside it came out on
    // 2026-08-27.
    && [a, b, c].every((m) => m.body.split('\n\n').some((par) =>
      new RegExp(PROMISE_RE, 'i').test(par) && par.length < 420));
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
    // The trade is no longer read off page text — that filed a staffing agency
    // as dental off the phrase "dental insurance" in a benefits list, and half
    // of the 236 settled that way were wrong (2026-08-26). Only a name that
    // says its own trade counts now, so a site read is not expected to produce
    // one. What it must still write down is below.
    && contacts >= 1
    && second.selfDescription === first.selfDescription && second.linkedInUrl === first.linkedInUrl;
  await cleanSite(db, 'written');
  return { ok, detail: ok ? 'what they say they do, their LinkedIn page and their people were all written on the first read and survived the second' : JSON.stringify({ desc: first.selfDescription, li: first.linkedInUrl, trade: first.trade, contacts }) };
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
  // Nothing detects "runs more than one business" — it is scored and never
  // found — so what is provable is that the strongest tell PRESENT wins.
  const leadsWithTheBigOne = m.openedWith === 'hiring_admin_role' || m.openedWith === 'runs_several_businesses';
  const carriesYears = /Forty-odd years|41 years/.test(m.body);
  // Their software must NOT be here — they never published it. It belongs on
  // the card, for the call.
  const keepsSoftwareOut = !/QuickBooks|Square|Mailchimp/i.test(m.body);
  const noDash = !/[—–]/.test(m.body);
  const ok = leadsWithTheBigOne && keepsSoftwareOut && noDash;
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
  // Four wordings a line, so two dentists in the same town do not get the same
  // letter. The exception is a line Russ wrote himself: his words matter more
  // than the variety, and inventing versions of them would be putting words in
  // his mouth. He wrote the opening on 2026-08-27 and it stands alone.
  const counts = [
    V.WHAT_I_DO.length, V.GUARANTEE.length,
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
  // The historical ramp stays visible as reference, but Russ removed the
  // daily cap on 2026-09-06. The per-run ceiling remains the runaway guard.
  const caps = EMAIL_RAMP.map((_, i) => dailyEmailCap(i));
  const uncapped = caps.every((c) => c === Number.MAX_SAFE_INTEGER)
    && dailyEmailCap(99) === Number.MAX_SAFE_INTEGER;
  return { ok: uncapped, detail: uncapped
    ? 'the retired ramp is not applied; the per-run ceiling remains in force'
    : caps.join(',') };
}, 'lanes');

def('email_ramp_stops_at_cap', () => withDb(async (db) => {
  await cleanLane(db, 'cap');
  const L = lanes();
  const cap = L.dailyEmailCap(0);
  const leftToday = await L.emailsLeftToday(db, 0);
  const leftTomorrow = await L.emailsLeftToday(db, 0, new Date(Date.now() + 24 * 3600 * 1000));
  const ok = cap === Number.MAX_SAFE_INTEGER
    && leftToday === Number.MAX_SAFE_INTEGER
    && leftTomorrow === Number.MAX_SAFE_INTEGER;
  await cleanLane(db, 'cap');
  return { ok, detail: ok
    ? 'there is no daily ceiling; a single run is still limited separately'
    : `cap=${cap} today=${leftToday} tomorrow=${leftTomorrow}` };
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

def('every_first_message_states_the_guarantee', () => {
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
      // The year's hours came out on 2026-08-27: third number in one
      // paragraph, arguing with somebody who had not disagreed. What still
      // has to hold is that the promise is there and lands in a paragraph
      // short enough to be read rather than scanned past.
      const ownLine = m.body.split('\n\n').some((par) => new RegExp(PROMISE_RE, 'i').test(par) && par.length < 420);
      if (!guarantee || !ownLine) missing.push(`${p.name}/${signal} guarantee=${guarantee} ownLine=${ownLine}`);
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
    // The tell has to be one that is still allowed to open a message. A fax
    // number is scored but never spoken now, so a message built from one
    // carries no fax wording at all and never could (2026-08-27).
    const m = fc.draftFirstContact({ name, ownerName: 'Dale Hutchins' }, [{ signal: 'hiring_admin_role' }]);
    // The introduction, the tell and the close must each be a line he has
    // read. Found by content, not position — the introduction moved below the
    // observation and the guarantee on 2026-08-26.
    const paras = m.body.split('\n\n');
    // The introduction moved INTO the "what I do" paragraph when the offer
    // became a free fifteen minutes, so there is no separate intro sentence
    // to look for any more (2026-08-27).
    const intros = V.WHAT_I_DO_FREE;
    const closes = Object.values(V.CLOSES).flat();
    if (!intros.some((t) => m.body.includes(t))) strays.push(`no approved introduction in the message to ${name}`);
    const close = paras[paras.length - 2];
    if (!closes.includes(close)) strays.push(`close: ${close.slice(0, 40)}`);
    if (![...V.TELL_WORDINGS.hiring_admin_role].some((t) => m.body.includes(t))) strays.push(`tell for ${name}`);
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
  // With nothing verified a message is still written, and it opens on the
  // trade's own week — true of every business in that trade and impossible to
  // be wrong about. Writing nothing was the old rule; the new one is that it
  // never opens on something we failed to find (2026-08-27).
  const opensOnTheTell = wordings.some((w) => withTell.body.includes(w));
  const opensOnTheWeek = noTell && noTell.openedWith === fc.TRADE_WEEK;
  const ok = opensOnTheTell && opensOnTheWeek;
  return { ok, detail: ok
    ? "it opens on what was actually found on their site; with nothing found, on that trade's own week"
    : `tell=${opensOnTheTell} week=${Boolean(opensOnTheWeek)}` };
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
  // Email only. LinkedIn notes carry no subject, and counting them reported
  // "null" as a subject line used 1,283 times (2026-08-27).
  const rows = await db.outreachMessage.groupBy({
    by: ['subject'], where: { lane: 'EMAIL' }, _count: { _all: true },
  });
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
  // The record-derived signals moved into refresh.js when the score became a
  // function of the record; this used to read only the website reader and the
  // run-everything script and reported six real signals as undetectable.
  // The browser-based reader is a fourth place a signal can be found. It is
  // the only thing that can see a form or a password box, because those are
  // built after a page arrives and never appear in its raw text.
  const looksHere = read(path.join(ROOT, 'src/hoursback/enrich.js'))
    + read(path.join(ROOT, 'src/hoursback/refresh.js'))
    + read(path.join(ROOT, 'scripts/hoursback/rescore.js'))
    + read(path.join(ROOT, 'scripts/hoursback/recheck-sites.js'));
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
    // Only businesses somebody has actually looked at. The state register
    // added 31,669 with a name and nothing else, and this then demanded a note
    // for all 30,407 of them (2026-08-27).
    where: {
      doNotContact: false, repliedAt: null,
      NOT: { fieldSource: 'oregon-business-register' },
    },
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
  // 700 is where a message window stops being read, and for a while this was
  // set there. Then the note was cut to fit it — the build line and the five to
  // twenty hours taken out of Russ's own copy without telling him. His words
  // win over my length rule, so the limit is what the note actually needs with
  // all of it in: about 950, and 1,000 is the line that says something has gone
  // wrong rather than something is long (2026-08-30).
  const CAP = 1000;
  const notes = await db.outreachMessage.findMany({
    where: { lane: 'LINKEDIN', state: { in: ['DRAFT', 'QUEUED'] } }, select: { body: true },
  });
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

// Sentences that are individually true and collectively wrong.
//
// Every item in "the report names the tools, how to put them in, and at least
// five hours a week" is real, so nothing flagged it — but a report does not
// name hours, and read plainly the sentence says it does. It sat in a draft
// that had been printed, read and passed (2026-08-26). Wanting to catch it was
// not enough with it on screen, so it is checked here instead.

def('no_sentence_promises_what_a_report_cannot_hold', () => withLiveDb(async (db) => {
  const drafts = await db.outreachMessage.findMany({ select: { body: true, prospect: { select: { name: true } } } });
  // A verb of CONTENT — names, lists, sets out, you get — may only govern
  // things a document can hold. Hours are an outcome, so they have to arrive
  // through "how they ...", never as another item in the list.
  const CONTENT_VERB = /\b(report (?:names|lists|sets out)|you get|you'll get|it names|it lists)\b/i;
  const HOURS_AS_AN_ITEM = /,\s*and\s+(?:at least\s+)?(?:\w+|\d+)\s+hours a week\b/i;
  const bad = [];
  for (const d of drafts) {
    for (const sentence of String(d.body).split(/(?<=[.!?])\s+/)) {
      if (CONTENT_VERB.test(sentence) && HOURS_AS_AN_ITEM.test(sentence)) {
        bad.push(`${d.prospect.name}: ${sentence.trim().slice(0, 110)}`);
        break;
      }
    }
  }
  return { ok: !bad.length, detail: bad.length
    ? `${bad.length} drafts say a report contains hours — e.g. ${bad[0]}`
    : `${drafts.length} drafts, none claiming a document holds hours` };
}), 'reads');

def('no_pronoun_points_at_the_wrong_thing', () => {
  const V = require(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'));
  // "You treat dogs, cats and horses, and my guess is a version of THAT is
  // sitting on somebody" — "that" lands on the animals rather than on the week
  // described before it. Any wording that puts a bare "that" straight after
  // the business's own words is ambiguous by construction.
  const risky = V.THEIR_WORK_GUESS.filter((w) => /\{work\}[^.]*\ba version of that\b/i.test(w)
    || /\{work\}[^.]*\bbit of that\b/i.test(w));
  return { ok: !risky.length, detail: risky.length
    ? `ambiguous: ${risky.join(' | ')}`
    : 'no wording puts a bare "that" against the clause about their business' };
}, 'reads');

def('every_guarantee_wording_reads_straight', () => {
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  // Where a guarantee lists hours, the hours must arrive as HOW the tools give
  // them back, not as one more thing in a list of contents.
  // The defect is hours appearing as an item in a list of things a DOCUMENT
  // holds. Hours as the object of "find" is correct and always was; the first
  // version of this check was too crude and would have failed a good sentence.
  const CONTENT_VERB = /\b(report (?:names|lists|sets out)|you get|it names|it lists)\b/i;
  const HOURS_AS_AN_ITEM = /,\s*and\s+(?:at least\s+)?\{hours\}\s+hours a week\b/i;
  const wrong = V.GUARANTEE.filter((g) => CONTENT_VERB.test(g) && HOURS_AS_AN_ITEM.test(g));
  return { ok: !wrong.length, detail: wrong.length
    ? `${wrong.length} wordings put hours in a list of things a document holds: ${wrong[0]}`
    : `all ${V.GUARANTEE.length} wordings treat hours as something found, not something a document contains` };
}, 'reads');

def('every_linkedin_note_has_an_invitation', () => withLiveDb(async (db) => {
  // LinkedIn has two doors and they are not the same size. Everything built
  // first ran 278-678 characters, which fits only the door that opens for
  // people already connected (2026-08-27).
  const notes = await db.outreachMessage.findMany({ where: { lane: 'LINKEDIN' }, select: { inviteBody: true } });
  if (!notes.length) return { ok: false, detail: 'no LinkedIn notes written yet' };
  const missing = notes.filter((n) => !n.inviteBody).length;
  return { ok: !missing, detail: missing
    ? `${missing} of ${notes.length} notes have nothing to send with the invitation`
    : `${notes.length} notes, each with an invitation to send first` };
}), 'linkedin');

def('no_invitation_is_too_long_or_sells', () => withLiveDb(async (db) => {
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const notes = await db.outreachMessage.findMany({
    where: { lane: 'LINKEDIN', NOT: { inviteBody: null } }, select: { inviteBody: true },
  });
  if (!notes.length) return { ok: false, detail: 'no invitations written yet' };
  const tooLong = notes.filter((n) => n.inviteBody.length > fc.INVITE_MAX);
  // An invitation that names the promise reads as a salesperson to somebody
  // who has not yet looked at you, and gets declined on reflex.
  const sells = notes.filter((n) => /hours a week|don't pay|do not pay|\$\d|guarantee/i.test(n.inviteBody));
  const longest = Math.max(...notes.map((n) => n.inviteBody.length));
  const ok = !tooLong.length && !sells.length;
  return { ok, detail: ok
    ? `${notes.length} invitations, longest ${longest} of ${fc.INVITE_MAX} allowed, none carrying the offer`
    : JSON.stringify({ tooLong: tooLong.length, carryingTheOffer: sells.length, longest }) };
}), 'linkedin');

def('no_sentence_reads_their_marketing_back', () => withLiveDb(async (db) => {
  // The sentence about a business has to say what they DO, not repeat the
  // adjectives they chose for themselves. "You build projects that realise a
  // client's vision and strengthen the community" is their own brochure read
  // back to them, and it lands as flattery from a stranger (2026-08-27).
  const rows = await db.prospect.findMany({
    where: { theirWork: { not: null } }, select: { name: true, theirWork: true },
  });
  // Words that describe how a business feels about itself rather than the work.
  // "vision" only counts as puffery when it belongs to somebody — "a client's
  // vision". Vision insurance is a real product (2026-08-27).
  const PUFF = /(\bpassionate\b|\bdedicated to\b|\bcommitted to\b|\btrusted\b|\bpremier\b|\bexcellence\b|\bintegrity\b|\bproud to\b|\bstrives?\b|\bexpectations\b|\bdeserve\b|\bworld-?class\b|\bunparalleled\b|\bcraftsmanship\b|relationships first|building relationships|['’]s vision)/i;
  // What matters is whether it reaches a message. A business can hold anything
  // in that field — Russ pasted a whole About paragraph into one — and the
  // guard refuses it before it can be spoken, telling him why on the card.
  // This used to fail on the field itself, which reported a message fault
  // where none existed (2026-08-27).
  const T = require(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'));
  const reaching = rows.filter((r) => PUFF.test(r.theirWork) && T.usableWorkClause(r.theirWork));
  const heldButRefused = rows.filter((r) => PUFF.test(r.theirWork)).length - reaching.length;
  return { ok: !reaching.length, detail: reaching.length
    ? `${reaching.length} read their own marketing back — e.g. ${reaching[0].name}: "${reaching[0].theirWork}"`
    : `${rows.length} sentences, none of them marketing copy that could reach a message`
      + (heldButRefused ? ` (${heldButRefused} on file are marketing and are refused before they can be spoken)` : '') };
}), 'reads');

def('both_channels_say_what_the_software_does', () => withLiveDb(async (db) => {
  // The email and the LinkedIn note carry the same promise in different
  // wording, so a fix to one can silently miss the other. It did: the note
  // kept "name the tools that give it back" — the abstract line Russ rejected
  // — for a while after the email had dropped it (2026-08-27).
  const abstract = /name the tools that (give|free) it (back|up)/i;
  const all = await db.outreachMessage.findMany({ select: { lane: true, body: true } });
  const badEmail = all.filter((m) => m.lane === 'EMAIL' && abstract.test(m.body)).length;
  const badNote = all.filter((m) => m.lane === 'LINKEDIN' && abstract.test(m.body)).length;
  const emails = all.filter((m) => m.lane === 'EMAIL').length;
  const notes = all.filter((m) => m.lane === 'LINKEDIN').length;
  const ok = !badEmail && !badNote;
  return { ok, detail: ok
    ? `${emails} emails and ${notes} notes, both saying what the software actually does`
    : `still abstract: ${badEmail} emails, ${badNote} notes` };
}), 'reads');

def('nothing_is_written_to_an_unverified_business', () => withLiveDb(async (db) => {
  // A business straight out of the state register has a name, a city and an
  // owner — no website, nothing read, nobody confirmed it still trades. It is
  // a lead, not a prospect, and nothing may be drafted for it until a site has
  // been found and read (2026-08-27).
  const bad = await db.outreachMessage.count({
    where: { prospect: { fieldSource: 'oregon-business-register', siteStatus: null } },
  });
  const total = await db.outreachMessage.count();
  return { ok: !bad, detail: bad
    ? `${bad} messages drafted for businesses nobody has looked at yet`
    : `${total} messages, none written to a business that has not been read` };
}), 'reads');

// Noticing a reply and noticing a bounce. Both were Russ's job by hand, and a
// missed reply means the engine writes again to somebody who already said yes.

def('a_reply_is_told_apart_from_a_holiday_responder', () => {
  const I = require(path.join(ROOT, 'src/hoursback/crm/inbox.js'));
  const reply = I.classify({ from: 'Marilyn <m@b.example>', subject: 'Re: your note', body: 'Give me a call Thursday.' });
  const away = I.classify({ from: 'Dale <d@w.example>', subject: 'Automatic reply: Out of Office', body: 'I am currently away until the 9th.' });
  const leave = I.classify({ from: 'Sam <s@x.example>', subject: 'Re: your note', body: 'I am on maternity leave until March.' });
  const ok = reply.kind === 'reply' && away.kind === 'auto' && leave.kind === 'auto';
  return { ok, detail: ok
    ? 'a person answering stops the sequence; a holiday responder changes nothing'
    : JSON.stringify({ reply: reply.kind, away: away.kind, leave: leave.kind }) };
}, 'inbox');

def('a_bounce_names_the_address_that_failed', () => {
  const I = require(path.join(ROOT, 'src/hoursback/crm/inbox.js'));
  // A bounce comes FROM the mail system, so the sender says nothing about
  // which address was wrong. It has to be dug out of the body.
  const shapes = [
    'Your message to office@sisters.example could not be delivered.',
    'Final-Recipient: rfc822; office@sisters.example',
    '<office@sisters.example> does not exist',
    'Original-Recipient: rfc822; office@sisters.example',
  ];
  const wrong = shapes.filter((b) => I.addressThatFailed(b) !== 'office@sisters.example');
  const c = I.classify({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', body: shapes[0] });
  const ok = !wrong.length && c.kind === 'bounce';
  return { ok, detail: ok
    ? 'every common bounce shape gives up the address that failed'
    : JSON.stringify({ kind: c.kind, missed: wrong.length }) };
}, 'inbox');

def('a_bounced_address_is_queued_to_be_found_again', () => {
  // A bounce is a wrong address, not a refusal. The business stays callable
  // and appears in the list of addresses that need finding (Russ, 2026-08-27).
  const src = read(path.join(ROOT, 'scripts/hoursback/crm-app.js'));
  const inTheQueue = /emailBouncedAt: \{ not: null \}/.test(src);
  const flagged = /the address bounced/.test(src);
  const ok = inTheQueue && flagged;
  return { ok, detail: ok
    ? 'a bounced address goes back into the list of addresses to find, marked as bounced'
    : JSON.stringify({ inTheQueue, flagged }) };
}, 'inbox');


// What the sending service tells us. This replaced reading Russ's own inbox:
// his mail is a Microsoft business account through GoDaddy, where the simple
// password route is often switched off by the administrator — and the service
// that sends the mail already hears the answers (2026-08-27).

def('an_unsigned_mail_event_is_refused', () => {
  const ME = require(path.join(ROOT, 'src/hoursback/crm/mailEvents.js'));
  const body = JSON.stringify({ type: 'email.bounced', data: { to: ['x@y.example'] } });
  const secret = 'whsec_' + Buffer.from('a'.repeat(32)).toString('base64');
  const now = Math.floor(Date.now() / 1000);
  const crypto = require('crypto');
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const good = crypto.createHmac('sha256', key).update(`id1.${now}.${body}`).digest('base64');

  const valid = ME.signatureIsValid(body, { 'svix-id': 'id1', 'svix-timestamp': String(now), 'svix-signature': `v1,${good}` }, secret);
  const unsigned = ME.signatureIsValid(body, {}, secret);
  const wrong = ME.signatureIsValid(body, { 'svix-id': 'id1', 'svix-timestamp': String(now), 'svix-signature': 'v1,' + Buffer.from('x'.repeat(32)).toString('base64') }, secret);
  // Anything older than five minutes is somebody replaying a message we have
  // already seen. Without this, one captured event could empty the queue.
  const old = ME.signatureIsValid(body, { 'svix-id': 'id1', 'svix-timestamp': String(now - 4000), 'svix-signature': `v1,${good}` }, secret);
  const noSecret = ME.signatureIsValid(body, { 'svix-id': 'id1', 'svix-timestamp': String(now), 'svix-signature': `v1,${good}` }, '');
  const ok = valid && !unsigned && !wrong && !old && !noSecret;
  return { ok, detail: ok
    ? 'only a properly signed, recent message from the mail service is acted on'
    : JSON.stringify({ valid, unsigned, wrong, old, noSecret }) };
}, 'mail');

def('each_mail_event_means_one_thing', () => {
  const ME = require(path.join(ROOT, 'src/hoursback/crm/mailEvents.js'));
  const cases = [
    ['email.bounced', {}, 'bounced'],
    ['email.complained', {}, 'complained'],
    ['email.received', { subject: 'Re: your note', from: 'Marilyn <m@b.example>' }, 'replied'],
    ['email.received', { subject: 'Automatic reply: Out of Office', from: 'd@w.example' }, 'ignore'],
    ['email.delivered', {}, 'ignore'],
    ['email.opened', {}, 'ignore'],
  ];
  const wrong = cases.filter(([type, data, want]) => ME.meaning({ type, data }).act !== want)
    .map(([type, , want]) => `${type} should be ${want}`);
  return { ok: !wrong.length, detail: wrong.length ? wrong.join('; ')
    : 'a bounce, a spam complaint, a reply and a holiday responder each mean exactly one thing' };
}, 'mail');

def('being_marked_as_spam_stops_everything', () => {
  // Worse than a bounce: they do not want to hear from Russ at all, so the
  // business is never contacted again on any channel, phone included.
  const src = read(path.join(ROOT, 'scripts/hoursback/crm-app.js'));
  const i = src.indexOf("act === 'complained'");
  const block = i >= 0 ? src.slice(i, i + 400) : '';
  const ok = i >= 0 && /doNotContact: true/.test(block);
  return { ok, detail: ok
    ? 'a spam complaint marks the business never-contact, on every channel'
    : 'a spam complaint does not stop the phone lane' };
}, 'mail');

def('the_mail_service_is_heard_without_a_password', () => {
  // The mail service is not Russ knocking, so it cannot sign in. It proves
  // who it is by signing every message. That means the listening address has
  // to sit BEFORE the password check, and its signature check is the only
  // thing protecting it.
  const src = read(path.join(ROOT, 'scripts/hoursback/crm-app.js'));
  const listener = src.indexOf("route === 'mail-events'");
  const passwordGate = src.indexOf('if (!signedIn(req))');
  const checksSignature = /signatureIsValid\(raw, req\.headers/.test(src);
  const ok = listener > 0 && passwordGate > listener && checksSignature;
  return { ok, detail: ok
    ? 'the mail service is heard before the password check, and only if it signed the message'
    : JSON.stringify({ listener, passwordGate, checksSignature }) };
}, 'mail');

// What happens after a record changes. Russ typed a phone, a website, an
// email, a team size and a trade onto one business and the record stayed
// unscored, stayed flagged "needs a look" and never got a message written,
// because each of those was a separate thing somebody had to remember to run
// (2026-08-27).

def('a_hand_edit_runs_the_whole_chain', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/crm-app.js'), 'utf8');
  // Every path where a person changes a record: correcting the card, logging a
  // call, and typing a new business in.
  const inSave = /async function saveBusiness[\s\S]{0,2000}?refreshInBackground\(id\)/.test(src);
  const inCall = /queueFollowUp[\s\S]{0,240}?refreshInBackground\(id\)/.test(src);
  const inAdd = /refreshInBackground\(created\.id\)/.test(src);
  const ok = inSave && inCall && inAdd;
  return { ok, detail: ok
    ? 'correcting a card, logging a call and adding a business all run the same chain'
    : `missing on: ${[!inSave && 'the card', !inCall && 'a call', !inAdd && 'a new business'].filter(Boolean).join(', ')}` };
});

def('the_chain_does_every_step', () => {
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const has = ['signalsFor', 'rescoreOne', 'settleTrade', 'clearReviewFlag', 'writeMessages', 'refreshProspect']
    .filter((f) => typeof R[f] !== 'function');
  return { ok: !has.length, detail: has.length
    ? `missing: ${has.join(', ')}`
    : 'read the site, score the record, settle the trade, clear the review flag, write the message' };
});

def('the_score_is_one_set_of_rules', () => {
  // The fuller scoring logic used to live only inside the run-everything
  // script, so a record could sit unscored forever unless somebody remembered
  // to run it by hand. There must be exactly one copy.
  const rescore = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/rescore.js'), 'utf8');
  const shares = /require\(['"]\.\.\/\.\.\/src\/hoursback\/refresh\.js['"]\)/.test(rescore);
  const duplicated = /function signalsFor/.test(rescore);
  const ok = shares && !duplicated;
  return { ok, detail: ok
    ? 'the run-everything script and a hand edit score from the same rules'
    : duplicated ? 'the scoring rules are copied in two places and will drift' : 'the script does not share the rules' };
});

def('a_bulk_import_never_fires_website_reads', () => {
  // Thirty thousand register businesses arriving at once must not start thirty
  // thousand website reads nobody asked for.
  const add = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/registry-add.js'), 'utf8');
  const importsChain = /refreshProspect/.test(add);
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const bulkReadsNothing = typeof R.rescoreMany === 'function'
    && !/runSiteEnrichment|readSite/.test(R.rescoreMany.toString());
  const ok = !importsChain && bulkReadsNothing;
  return { ok, detail: ok
    ? 'the register import reads no websites, and the bulk re-score reads none either'
    : importsChain ? 'the register import runs the per-record chain' : 'the bulk re-score can reach a website' };
});

def('a_pasted_paragraph_never_reaches_a_message', () => {
  const TO = require(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'));
  const good = 'do windshield work both mobile and in the shop';
  const pasted = "Founded in 2004, we are Central Oregon's premier crane and rigging company. "
    + 'With over 50 years of experience, we have lifted everything from hot tubs to whole houses.';
  const cases = [
    ['a clause written by hand', TO.usableWorkClause(good) === good],
    ['a whole About paragraph', TO.usableWorkClause(pasted) === null],
    ['their own voice', TO.usableWorkClause('we build custom homes') === null],
    ['their own marketing', TO.usableWorkClause('are the premier roofer in Bend') === null],
    ['two sentences', TO.usableWorkClause('do roofing. We also do gutters') === null],
    ['a reason is given back', typeof TO.whyWorkClauseIsUnusable(pasted) === 'string'],
  ];
  const bad = cases.filter(([, passed]) => !passed).map(([w]) => w);
  return { ok: !bad.length, detail: bad.length
    ? `lets through: ${bad.join(', ')}`
    : 'only a short clause in the third person is used; anything else falls back to their industry, and the card says why' };
});

def('their_own_marketing_is_refused_on_both_channels', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/hoursback/crm/firstContact.js'), 'utf8');
  const toSrc = fs.readFileSync(path.join(ROOT, 'src/hoursback/crm/tradeOpening.js'), 'utf8');
  const linkedIn = /usableWorkClause\(prospect\.theirWork\)/.test(src);
  const email = /usableWorkClause\(theirWork\)/.test(toSrc);
  const ok = linkedIn && email;
  return { ok, detail: ok
    ? 'the email and the LinkedIn note both refuse a paragraph pasted into their own words'
    : `unguarded: ${[!email && 'the email', !linkedIn && 'the LinkedIn note'].filter(Boolean).join(', ')}` };
});

def('the_review_flag_clears_itself', () => withLiveDb(async (db) => {
  // "Needs a look" means there was no way to reach them. Once there is a phone
  // or a website, the reason is gone and it should not wait on Russ.
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const tag = `reviewflag-${Date.now()}`;
  const p = await db.prospect.create({ data: { placeId: tag, name: 'Flag Test Co', stage: 'NEEDS_REVIEW' } });
  const stuck = await R.clearReviewFlag(db, p);
  await db.prospect.update({ where: { id: p.id }, data: { phoneManualValue: '541-555-0111' } });
  const withPhone = await db.prospect.findUnique({ where: { id: p.id } });
  const cleared = await R.clearReviewFlag(db, withPhone);
  const after = await db.prospect.findUnique({ where: { id: p.id } });
  await db.prospect.delete({ where: { id: p.id } });
  const ok = stuck === null && cleared === 'NO_CONTACT' && after.stage === 'NO_CONTACT';
  return { ok, detail: ok
    ? 'unreachable stays flagged; a phone or a website clears it without anybody clicking'
    : `stayed ${after.stage} with a phone on file` };
}), 'writes');

def('nothing_is_written_to_somebody_who_answered', () => {
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const base = { doNotContact: false, repliedAt: null, emailBouncedAt: null, siteStatus: 'READ', email: 'a@b.example' };
  const cases = [
    ['a business that replied', R.cannotBeWrittenTo({ ...base, repliedAt: new Date() })],
    ['an address that bounced', R.cannotBeWrittenTo({ ...base, emailBouncedAt: new Date() })],
    ['one marked leave-alone', R.cannotBeWrittenTo({ ...base, doNotContact: true })],
    ['a site nobody has read', R.cannotBeWrittenTo({ ...base, siteStatus: null })],
    ['no address at all', R.cannotBeWrittenTo({ ...base, email: null })],
  ];
  const through = cases.filter(([, reason]) => !reason).map(([w]) => w);
  const writable = R.cannotBeWrittenTo(base);
  const ok = !through.length && writable === null;
  return { ok, detail: ok
    ? 'a reply, a bounce, a leave-alone mark, an unread site and a missing address each stop a message being written'
    : through.length ? `would still write to: ${through.join(', ')}` : `refuses a business it should write to: ${writable}` };
});

def('no_small_website_detail_opens_a_message', () => {
  // A fax number and a page of downloadable forms led 122 of 736 messages.
  // Both are true, both still count towards the score, and neither is worth
  // opening on — they were beating the one thing actually known about the
  // business, which is what its whole trade's week looks like (Russ,
  // 2026-08-27: "The fax machine seems way too heavily weighted to lead with").
  const F = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const leaked = F.NEVER_LEADS.filter((k) => F.OPENER_ORDER.includes(k));
  const ok = !leaked.length && F.NEVER_LEADS.includes('fax_listed') && F.NEVER_LEADS.includes('downloadable_forms');
  return { ok, detail: ok
    ? `${F.OPENER_ORDER.length} openings allowed, all of them facts about the business itself; ${F.NEVER_LEADS.join(' and ')} are scored but never spoken`
    : `still allowed to open a message: ${leaked.join(', ')}` };
});

def('no_live_draft_opens_on_a_small_detail', () => withLiveDb(async (db) => {
  const F = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const bad = await db.outreachMessage.count({
    where: { lane: 'EMAIL', openedWith: { in: F.NEVER_LEADS } },
  });
  const total = await db.outreachMessage.count({ where: { lane: 'EMAIL' } });
  return { ok: !bad, detail: bad
    ? `${bad} of ${total} still open on a fax number or a page of forms`
    : `${total} emails, none opening on a small website detail` };
}), 'reads');

def('the_score_means_hours_not_scraping', () => {
  // The old score answered "how much did we scrape off their website", so a
  // modern dental practice with a clean site scored below a one-person shop
  // with a fax number. It now answers "roughly how many hours a week of
  // repetitive office work sit here", which is what the offer promises to find
  // (Russ, 2026-08-27).
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const dental = R.opportunityPart({ trade: 'dental', employeeCountManualValue: 6 }).points;
  const faxShop = R.opportunityPart({ trade: 'other' }).points;
  const ok = dental > faxShop && R.OPPORTUNITY_MAX > R.READINESS_MAX;
  return { ok, detail: ok
    ? `a six-person dental practice scores ${dental} on opportunity against ${faxShop} for an unknown one-person trade, and opportunity (${R.OPPORTUNITY_MAX}) outweighs what was observed (${R.READINESS_MAX})`
    : `opportunity is not the bigger half: dental ${dental}, unknown ${faxShop}` };
});

def('every_industry_clears_the_guarantee', () => {
  // Five hours a week is promised to everybody, so no industry may sit below
  // it even in a typical small shop, or the guarantee is not safe there.
  const O = require(path.join(ROOT, 'src/hoursback/opportunity.js'));
  const { THE_OFFER } = require(path.join(ROOT, 'src/hoursback/industryTiers.js'));
  const short = O.industryTable(O.TYPICAL_TEAM).filter((r) => r.hours < THE_OFFER.hours);
  return { ok: !short.length, detail: short.length
    ? `below the ${THE_OFFER.hours}-hour guarantee: ${short.map((r) => `${r.trade} (${r.hours})`).join(', ')}`
    : `all ${O.industryTable().length} industries clear ${THE_OFFER.hours} hours in a typical ${O.TYPICAL_TEAM}-person shop, the lowest being ${O.industryTable().slice(-1)[0].hours}` };
});

def('the_score_is_scored_the_same_way_everywhere', () => {
  // A hand edit and a bulk run must produce the same number. They did not for
  // about an hour: the bulk path kept its own copy and scored 1,984
  // businesses on the old rules, which showed up as scores above 100.
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const src = fs.readFileSync(path.join(ROOT, 'src/hoursback/refresh.js'), 'utf8');
  const bulkShares = /const scored = scoreFor\(p, counts\)/.test(src);
  const oneShares = /const scored = scoreFor\(prospect,/.test(src);
  const capped = R.OPPORTUNITY_MAX + R.READINESS_MAX === 100;
  const ok = bulkShares && oneShares && capped;
  return { ok, detail: ok
    ? 'one scorer, used by a hand edit and by a bulk run, capped at 100'
    : `not shared: ${[!oneShares && 'the single-record path', !bulkShares && 'the bulk path', !capped && 'the total is not 100'].filter(Boolean).join(', ')}` };
});

def('no_score_exceeds_its_ceiling', () => withLiveDb(async (db) => {
  const R = require(path.join(ROOT, 'src/hoursback/refresh.js'));
  const ceiling = R.OPPORTUNITY_MAX + R.READINESS_MAX;
  const over = await db.prospect.count({ where: { automationScore: { gt: ceiling } } });
  const scored = await db.prospect.count({ where: { automationScore: { not: null } } });
  return { ok: !over, detail: over
    ? `${over} of ${scored} score above ${ceiling}, which means they were scored by the old rules`
    : `${scored} scored, none above ${ceiling}` };
}), 'reads');

def('no_business_holds_two_messages_on_one_channel', () => withLiveDb(async (db) => {
  // One draft per business per channel. Two appeared on 2026-08-27 when the
  // new automatic chain ran at the same moment as a bulk rewrite: both looked
  // for an existing draft, both found none, both wrote one. Nothing enforces
  // this in the database itself yet, so this is the thing that notices.
  const dupes = await db.outreachMessage.groupBy({
    by: ['prospectId', 'lane'], _count: true,
    having: { prospectId: { _count: { gt: 1 } } },
  });
  const total = await db.outreachMessage.count();
  return { ok: !dupes.length, detail: dupes.length
    ? `${dupes.length} businesses hold more than one message on the same channel`
    : `${total} messages, one per business per channel` };
}), 'reads');

def('the_first_message_asks_for_fifteen_free_minutes', () => {
  // The ask is a free fifteen-minute call, not the paid audit. A guarantee in
  // a cold email from a stranger is a claim that has to be believed before it
  // helps, and nothing in a first message earns that; fifteen minutes to find
  // one thing needs no belief at all (Russ chose this, 2026-08-27).
  const fc = require(path.join(ROOT, 'src/hoursback/crm/firstContact.js'));
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const m = fc.draftFirstContact({ name: 'Cascade Test Dental', contactName: 'Dale Hutchins', trade: 'dental' }, []);
  const asks = V.FREE_LOOK.some((t) => m.body.includes(t));
  const noGuarantee = !V.GUARANTEE.some((t) => m.body.includes(t.replace('{hours}', 'five')));
  const ok = asks && noGuarantee;
  return { ok, detail: ok
    ? 'the first message asks for fifteen free minutes and carries no guarantee'
    : `${!asks ? 'does not ask for the free look' : ''}${!noGuarantee ? ' still carries the guarantee' : ''}` };
}, 'lanes');

def('no_first_message_carries_a_price_or_a_promise', () => withLiveDb(async (db) => {
  // Nothing about money reaches a stranger. The price was never in a first
  // message; the guarantee is out too now the ask is a free call.
  const all = await db.outreachMessage.findMany({ select: { body: true, inviteBody: true } });
  const money = /\$\s?\d|\b999\b|\byou don't pay\b|\bno hours, no invoice\b/i;
  const bad = all.filter((m) => money.test(m.body) || money.test(m.inviteBody || ''));
  return { ok: !bad.length, detail: bad.length
    ? `${bad.length} of ${all.length} mention money or promise hours to a stranger`
    : `${all.length} messages, none mentioning money or promising hours to a stranger` };
}), 'reads');

def('both_channels_make_the_same_offer', () => withLiveDb(async (db) => {
  // The note Russ pastes by hand and the email that sends itself have to ask
  // for the same thing. The note promised the paid audit for a while after the
  // email had moved to the free fifteen minutes (2026-08-27).
  // Every wording of the ask, not just the plain one. From 2026-08-30 the
  // fifteen-minute line has six versions — what it goes looking for changes
  // with the business — and this read only the plain family, so 518 emails
  // and 594 notes carrying a perfectly good ask were counted as missing it.
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const asks = (b) => V.ALL_FREE_LOOKS.some((t) => String(b).includes(t));
  // Only what can still reach a reader. A stood-down message carries whatever
  // it said the day its business stopped being contactable, and holding
  // tonight's ask against it measures nothing.
  const live = { editedAt: null, state: { in: ['DRAFT', 'QUEUED'] } };
  const emails = await db.outreachMessage.findMany({ where: { lane: 'EMAIL', ...live }, select: { body: true } });
  const notes = await db.outreachMessage.findMany({ where: { lane: 'LINKEDIN', ...live }, select: { body: true } });
  const badE = emails.filter((m) => !asks(m.body)).length;
  const badL = notes.filter((m) => !asks(m.body)).length;
  const ok = !badE && !badL;
  return { ok, detail: ok
    ? `${emails.length} emails and ${notes.length} notes, all asking for the same fifteen minutes`
    : `not asking for the free look: ${badE} emails, ${badL} notes` };
}), 'reads');

// Stage 1 — the free fifteen minutes, before the paid audit.

def('stage_one_asks_about_their_own_work', () => {
  // Two of the five questions name THIS trade's work rather than asking the
  // owner to summarise their week. That is the whole advantage of knowing who
  // you are calling before you dial, and it is what a stranger reading from a
  // generic script cannot do (2026-08-27).
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const build = S.questionsFor('construction');
  const dental = S.questionsFor('dental');
  const differ = build[1].ask !== dental[1].ask && build[2].ask !== dental[2].ask;
  const fiveOf = build.length === 5;
  const asksLever = build[0].answers && build[0].answers.length === 3;
  const ok = differ && fiveOf && asksLever;
  return { ok, detail: ok
    ? 'five questions, the middle two written from the trade itself, and the first one asks what they actually want'
    : `${!fiveOf ? 'not five questions; ' : ''}${!differ ? 'the same questions for every trade; ' : ''}${!asksLever ? 'no lever question' : ''}` };
}, 'lanes');

def('stage_one_prescribes_nothing', () => {
  // Naming a tool live sounds like a guess. The call finds the bottleneck and
  // books the second conversation; the fix is decided afterwards.
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/crm-app.js'), 'utf8');
  const close = S.closingLine({ hoursPerWeek: 6, friction: 'chasing signatures' });
  const promisesToComeBack = /couple of days/i.test(close);
  const noToolNamed = !Object.keys(require(path.join(ROOT, 'src/hoursback/toolLibrary.js')).PLATFORMS)
    .some((t) => close.includes(t));
  const screenSaysSo = /Do not name a tool on this call/i.test(src);
  const ok = promisesToComeBack && noToolNamed && screenSaysSo;
  return { ok, detail: ok
    ? 'the call closes by promising to come back with the fix, names no tool, and the screen says so'
    : `${!promisesToComeBack ? 'no promise to come back; ' : ''}${!noToolNamed ? 'a tool is named live; ' : ''}${!screenSaysSo ? 'the screen does not say not to prescribe' : ''}` };
}, 'lanes');

def('stage_one_captures_the_hours', () => {
  // The hours figure is what the guarantee is measured against and what the
  // paid work is priced against. A call without it is not finished.
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const empty = S.whatIsMissing({});
  const full = S.whatIsMissing({ lever: 'hours', repetition: 'chasing', hoursPerWeek: 6, whoDoesIt: 'Dale' });
  const ok = empty.length === 4 && full.length === 0
    && empty.some((m) => /hours/i.test(m)) && empty.some((m) => /who/i.test(m));
  return { ok, detail: ok
    ? 'a call is unfinished until the hours and who does them are on the record'
    : `missing-check wrong: empty=${empty.length}, complete=${full.length}` };
}, 'lanes');

def('what_they_want_reorders_where_you_look', () => {
  // Somebody whose phone is not ringing does not want their filing tidied.
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const money = S.whereToLook('construction', 'money').map((x) => x.type);
  const hours = S.whereToLook('construction', 'hours').map((x) => x.type);
  const ok = money[0] !== hours[0] && money.length > 0 && hours.length > 0;
  return { ok, detail: ok
    ? `wanting money in leads with ${money[0]}; wanting hours back leads with ${hours[0]}`
    : 'the answer to the first question changes nothing' };
}, 'lanes');

def('stage_one_lives_on_the_record', () => {
  const schema = read(path.join(ROOT, 'prisma/schema.prisma'));
  const need = ['stageOneLever', 'stageOneHours', 'stageOneWho', 'stageOneBottleneck', 'stageOneFix'];
  const absent = need.filter((f) => !schema.includes(f));
  return { ok: !absent.length, detail: absent.length
    ? `not on the record: ${absent.join(', ')}`
    : 'what they said on the free call is kept on their record, not in a note' };
}, 'lanes');

def('a_promised_callback_gets_a_date', () => {
  // "Give me a couple of days" with no date on it is how a free call quietly
  // becomes nothing. Saving one writes the follow-up the rest of the CRM
  // already watches, so a promised second call shows up on the front screen
  // like every other promise (2026-08-27).
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/crm-app.js'), 'utf8');
  const asksForIt = /When are you calling them back\?/.test(src);
  const feedsNextAction = /stageOneCallBackAt = when;[\s\S]{0,300}?nextActionDate = when/.test(src);
  const downloadable = /route === 'callback'/.test(src);
  const ok = asksForIt && feedsNextAction && downloadable;
  return { ok, detail: ok
    ? 'the callback is dated, joins the follow-ups the CRM already watches, and downloads into Outlook'
    : `${!asksForIt ? 'never asked for; ' : ''}${!feedsNextAction ? 'not a tracked follow-up; ' : ''}${!downloadable ? 'not downloadable' : ''}` };
}, 'lanes');

def('the_second_call_carries_three_things', () => {
  // What the fix is, what it costs, and the first step this week. Nothing
  // else, and the door only opens once all three are there.
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const empty = S.whatIsMissingForTheFix({});
  const full = S.whatIsMissingForTheFix({ tool: 'Jobber', cost: '$29/mo', firstStep: 'sign up and import your customers' });
  const hasDoor = Array.isArray(S.DOOR) && S.DOOR.length >= 1
    && S.DOOR.every((d) => /set it up with you|put it in for you|price that/i.test(d));
  const ok = empty.length === 3 && full.length === 0 && hasDoor;
  return { ok, detail: ok
    ? 'the second call is not ready until the fix, the cost and the first step are all there, and the door offers two ways to say yes'
    : `empty=${empty.length}, complete=${full.length}, door=${hasDoor}` };
}, 'lanes');

def('the_bottleneck_chosen_matches_what_they_asked_for', () => {
  // More than one problem always surfaces. The one to fix is the one that
  // hurts most AND matches what they said they cared about — fixing the most
  // painful thing is worth nothing if it is not what they wanted.
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const candidates = [
    { type: 'data_entry', hoursPerWeek: 5 },
    { type: 'lead_follow_up', hoursPerWeek: 4 },
  ];
  const wantsMoney = S.pickTheOne(candidates, 'money');
  const wantsHours = S.pickTheOne(candidates, 'hours');
  const ok = wantsMoney && wantsHours && wantsMoney.type === 'lead_follow_up' && wantsHours.type === 'data_entry';
  return { ok, detail: ok
    ? 'a smaller problem wins when it is the one they asked about; the bigger one wins when it is not'
    : `money picked ${wantsMoney && wantsMoney.type}, hours picked ${wantsHours && wantsHours.type}` };
}, 'lanes');

def('a_recording_fills_the_form_not_the_other_way_round', () => {
  // Russ should not be typing while a business owner is talking to him. The
  // recording already has it (2026-08-27).
  const T = require(path.join(ROOT, 'src/hoursback/crm/transcript.js'));
  const call = [
    'Russ Wright: would you want more money coming in, hours back, or happier customers?',
    "Dale Hutchins: It's the hours back, we're drowning in paperwork.",
    'Russ Wright: how many hours a week does that eat, and who is doing it?',
    "Dale Hutchins: About 6 hours a week. That's Marilyn, our office manager.",
    'Dale Hutchins: Somebody has to chase every change order by hand and it falls through the cracks.',
  ].join('\n');
  const r = T.readTranscript(call);
  const ok = r.usable && r.hours === 6 && r.lever === 'hours' && r.who === 'Marilyn'
    && r.moments.length > 0 && !r.moments.some((m) => /would you want|how many hours a week does/i.test(m));
  return { ok, detail: ok
    ? 'a pasted call gives up the hours, what they want, who does it, and their own words with none of Russ\'s questions in them'
    : `hours=${r.hours} lever=${r.lever} who=${r.who} moments=${r.moments && r.moments.length}` };
}, 'lanes');

def('a_recording_never_guesses', () => {
  // A wrong answer quietly filled in is worse than a blank one: a blank asks to
  // be filled and a wrong one does not. "It's the hours back" was being read as
  // a person called "the hours" (2026-08-27).
  const T = require(path.join(ROOT, 'src/hoursback/crm/transcript.js'));
  const vague = "Dale: Honestly it's the hours back. We're drowning in it, every single week.";
  const r = T.readTranscript(`${vague}\n${vague}\n${vague}`);
  const noPerson = r.who === null;
  const saysSo = r.couldNotFind.some((c) => /who does the work/i.test(c));
  const noHours = r.hours === null && r.couldNotFind.some((c) => /how many hours/i.test(c));
  const ok = noPerson && saysSo && noHours;
  return { ok, detail: ok
    ? 'what it cannot find it leaves blank and names, rather than filling in something that reads true'
    : `who=${JSON.stringify(r.who)} hours=${r.hours} couldNotFind=${JSON.stringify(r.couldNotFind)}` };
}, 'lanes');

def('a_recording_never_overwrites_what_russ_said', () => {
  // He was on the call and the reader was not. Anything already answered stands.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/crm-app.js'), 'utf8');
  const guards = [
    /r\.hours !== null && \(p\.stageOneHours === null \|\| p\.stageOneHours === undefined\)/,
    /r\.lever && !p\.stageOneLever/,
    /r\.who && !p\.stageOneWho/,
  ];
  const unguarded = guards.filter((re) => !re.test(src)).length;
  return { ok: !unguarded, detail: unguarded
    ? `${unguarded} of ${guards.length} fields can be overwritten by the recording`
    : 'the recording only fills blanks; anything Russ answered himself stands' };
}, 'lanes');

def('the_hours_figure_carries_the_sentence_it_came_from', () => {
  // A number quoted to a client has to be answerable. "Two hours a day" is ten
  // a week, and recording it as two would understate the whole offer.
  const T = require(path.join(ROOT, 'src/hoursback/crm/transcript.js'));
  const perDay = T.hoursFrom('It is about 2 hours a day, honestly.');
  const range = T.hoursFrom('I would say four to six hours a week.');
  const straight = T.hoursFrom('Probably 6 hours a week.');
  const ok = perDay.hours === 10 && /per day/i.test(perDay.howRead)
    && range.hours === 5 && /range/i.test(range.howRead)
    && straight.hours === 6 && straight.said === '6 hours a week';
  return { ok, detail: ok
    ? 'per-day becomes per-week, a range becomes its middle, and each carries the words it was read from'
    : `perDay=${perDay.hours} range=${range.hours} straight=${straight.hours}` };
}, 'lanes');

def('the_questions_can_be_read_before_a_call', () => {
  // Reading them for the first time on a live call is how you get halfway down
  // and find the order is wrong (Russ, 2026-08-27).
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/crm-app.js'), 'utf8');
  const hasScreen = /async function questionsScreen/.test(src);
  const routed = /route === 'questions'/.test(src);
  const inMenu = /href="\/questions">/.test(src);
  const ok = hasScreen && routed && inMenu;
  return { ok, detail: ok
    ? 'every question for every trade can be read on one page, reachable from the menu, without opening anybody\'s record'
    : `${!hasScreen ? 'no screen; ' : ''}${!routed ? 'not reachable; ' : ''}${!inMenu ? 'not in the menu' : ''}` };
}, 'lanes');

def('a_call_can_be_started_over', () => {
  // Emptying a box and saving leaves it empty, so there was no way to wipe a
  // call and begin again. The recording is kept: it is what was actually said.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/crm-app.js'), 'utf8');
  const clears = src.match(/async function clearStageOne[\s\S]{0,900}?\n\}/);
  if (!clears) return { ok: false, detail: 'no way to clear a call' };
  const body = clears[0];
  const wipes = ['stageOneLever', 'stageOneRepetition', 'stageOneFriction', 'stageOneHours',
    'stageOneWho', 'stageOneWand', 'stageOneFix', 'stageOneCallBackAt']
    .filter((f) => new RegExp(`${f}: null`).test(body));
  const keepsTranscript = !/stageOneTranscript: null/.test(body);
  const routed = /route === 'stage1clear'/.test(src);
  const asks = /confirm\('Clear everything from this call/.test(src);
  const ok = wipes.length === 8 && keepsTranscript && routed && asks;
  return { ok, detail: ok
    ? 'a call can be wiped and started again, it asks first, and the recording survives'
    : `wipes ${wipes.length} of 8, keeps the recording=${keepsTranscript}, routed=${routed}, asks=${asks}` };
}, 'lanes');

def('fifteen_minutes_has_enough_to_ask', () => {
  // Five questions is three minutes each and nobody talks like that. A real
  // fifteen minutes is twelve to fifteen questions, most of them follow-ups to
  // what was just said (Russ, 2026-08-27, twice).
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const qs = S.questionsFor('construction');
  const total = qs.reduce((n, q) => n + 1 + ((q.thenAsk || []).length), 0);
  const spine = qs.length;
  const withDepth = qs.filter((q) => (q.thenAsk || []).length >= 3).length;
  const ok = spine === 5 && total >= 15 && withDepth >= 4;
  return { ok, detail: ok
    ? `${total} questions available, ${spine} of them compulsory, ${withDepth} carrying three or more follow-ups`
    : `${total} questions from ${spine} compulsory, only ${withDepth} with real depth` };
}, 'lanes');

def('going_deeper_is_conditional_not_compulsory', () => {
  // The follow-ups only get asked where the answer says there is something
  // there. A business that says "that is handled" gets moved past, which is
  // what keeps the call from being tedious.
  const S = require(path.join(ROOT, 'src/hoursback/crm/stageOne.js'));
  const src = fs.readFileSync(path.join(ROOT, 'scripts/hoursback/crm-app.js'), 'utf8');
  // Only the five decide whether a call is finished.
  const missing = S.whatIsMissing({});
  const onlySpine = missing.length === 4;
  const saysSo = /If they say it is handled, move on/.test(src);
  const foldedAway = /<details/.test(src);
  const ok = onlySpine && saysSo && foldedAway;
  return { ok, detail: ok
    ? 'only the five count towards a finished call; the rest are folded away and the screen says to move on when there is nothing there'
    : `compulsory=${missing.length}, screen says move on=${saysSo}, folded=${foldedAway}` };
}, 'lanes');

// The call, filled in while it happens.

def('a_call_stops_when_a_tool_can_be_named', () => {
  // Not a question count and not a clock. The stopping point is whether Russ
  // can name a tool and say why (Russ, 2026-08-27: "getting a sufficient
  // amount of knowledge, with all known factors in play, to be able to make
  // appropriate recommendations").
  const E = require(path.join(ROOT, 'src/hoursback/crm/enoughToRecommend.js'));
  const nothing = E.whatIsStillNeeded({});
  const enough = {
    type: 'approvals_and_signatures', hoursPerWeek: 5, whoDoesIt: 'office',
    arrivesAs: 'email', connectsTo: 'QuickBooks', triedBefore: 'tool_failed', triedWhat: 'DocuSign',
  };
  const ok = nothing.length >= 5 && E.canRecommend(enough) && !E.canRecommend({ ...enough, hoursPerWeek: null });
  return { ok, detail: ok
    ? `${nothing.length} things must be known before a tool can be named, and it says which are missing`
    : `empty=${nothing.length}, full set enough=${E.canRecommend(enough)}` };
}, 'lanes');

def('time_never_cuts_a_line_of_questions_short', () => {
  // "To have 2 of 3 lines of questions completed with a third undeveloped
  // would be unacceptable" (Russ). Time only decides whether to open ANOTHER
  // problem, never whether to finish the one in hand.
  const E = require(path.join(ROOT, 'src/hoursback/crm/enoughToRecommend.js'));
  const half = { type: 'approvals_and_signatures', hoursPerWeek: 5, whoDoesIt: 'office' };
  const early = E.whereWeAre(half, 3);
  const late = E.whereWeAre(half, 22);
  // Over time, it still names what is missing rather than declaring it finished.
  const ok = !early.done && !late.done && early.roomForAnother && !late.roomForAnother
    && late.gaps.length === early.gaps.length;
  return { ok, detail: ok
    ? 'running late closes the door on a second problem and never on finishing the first'
    : `early done=${early.done} room=${early.roomForAnother}; late done=${late.done} room=${late.roomForAnother}` };
}, 'lanes');

def('a_tool_they_already_binned_is_never_recommended_back', () => {
  // Knowing they tried and failed is worth far less than knowing WHAT. The
  // button alone kept DocuSign on the list for a business that had already
  // bought it and abandoned it (2026-08-27).
  const E = require(path.join(ROOT, 'src/hoursback/crm/enoughToRecommend.js'));
  const F = require(path.join(ROOT, 'src/hoursback/crm/liveForm.js'));
  const base = { type: 'approvals_and_signatures', hoursPerWeek: 5, whoDoesIt: 'office', arrivesAs: 'email', connectsTo: 'QuickBooks' };
  const demandsName = F.stillNeedsTheName('tool_failed', '') && !F.stillNeedsTheName('never', '');
  const blocked = E.whatIsStillNeeded({ ...base, triedBefore: 'tool_failed' })
    .some((g) => /name of what they tried/i.test(g.missing));
  const named = E.shortlist({ ...base, triedBefore: 'tool_failed', triedWhat: 'DocuSign' }, []);
  const gone = !named.some((t) => t.name === 'DocuSign');
  const ok = demandsName && blocked && gone;
  return { ok, detail: ok
    ? 'the name is demanded before a call counts as finished, and what they binned never comes back on the list'
    : `demands the name=${demandsName}, blocks without it=${blocked}, drops it=${gone}` };
}, 'lanes');

def('the_call_asks_in_buttons_not_sentences', () => {
  // Russ types fast but not that fast. Anything predictable is a button, and
  // every button set has a way in for when the buttons are wrong.
  const F = require(path.join(ROOT, 'src/hoursback/crm/liveForm.js'));
  const biz = { trade: 'construction', toolsInUse: 'QuickBooks Online' };
  const first = F.nextQuestions(biz, {})[0];
  const problem = F.nextQuestions(biz, { lever: 'hours' })[0];
  const hasChoices = first.choices && first.choices.length === 3;
  const problemFromTrade = problem.choices.some((c) => c.value === 'approvals_and_signatures');
  const hasEscape = Boolean(problem.freeText);
  // The hours figure comes from two clicks rather than a number.
  const hours = F.hoursFromButtons('daily', '1h');
  const ok = hasChoices && problemFromTrade && hasEscape && hours === 5;
  return { ok, detail: ok
    ? 'the first question is three buttons, the problems come from their own trade, every set has a way out, and five hours a week comes from two clicks'
    : `choices=${hasChoices} fromTrade=${problemFromTrade} escape=${hasEscape} hours=${hours}` };
}, 'lanes');

def('every_question_says_why_it_appeared', () => {
  // A call has to be readable back, not just followable.
  const F = require(path.join(ROOT, 'src/hoursback/crm/liveForm.js'));
  const biz = { trade: 'dental' };
  const seen = [];
  const a = {};
  for (const [k, v] of [['lever', 'hours'], ['type', 'client_communication'], ['howOften', 'daily']]) {
    const q = F.nextQuestions(biz, a)[0];
    if (q) seen.push(q);
    a[k] = v;
  }
  const allExplained = seen.length >= 3 && seen.every((q) => q.why && q.why.length > 20);
  return { ok: allExplained, detail: allExplained
    ? `${seen.length} questions checked, every one carrying why it was asked`
    : `${seen.filter((q) => !q.why).length} of ${seen.length} appear with no reason given` };
}, 'lanes');

// ---------------------------------------------------------------------------
// The night the records were read rather than scanned (2026-08-28)
//
// Russ, having asked more than once: "Stop doing keyword bullshit and use your
// semantic language capabilities to UNDERSTAND what is on the pages", and then
// "you also need to rescore appropriately. No way to contact except phone is
// not a 100."
//
// Each check below is a rule that was broken in the doing, so each one is
// proof against the specific way it went wrong rather than a general good
// intention.

const understand = () => require(path.join(ROOT, 'src/hoursback/understand.js'));
const reachable = () => require(path.join(ROOT, 'src/hoursback/reachable.js'));

def('a_business_you_can_only_phone_never_ranks_at_the_top', () => {
  // Kernutt Stokes sat at 100 with no website, no address and no number on
  // file. The 100 was right about the business — fifteen people, an accounting
  // firm, something like sixty-six hours a week of repetitive office work. It
  // was silent about there being no way in at all, and Russ ranks his day by
  // that number.
  const { howToReachThem, callOrderScore } = reachable();
  const phoneOnly = howToReachThem({ phone: true });
  const nothing = howToReachThem({});
  const named = howToReachThem({ peopleWithEmail: 1, peopleNamed: 1, website: true });
  const rankedOnPhone = callOrderScore(100, phoneOnly);
  const rankedOnNothing = callOrderScore(100, nothing);
  const rankedOnNamed = callOrderScore(100, named);
  if (rankedOnPhone >= 100) return { ok: false, detail: `a phone-only business still ranks ${rankedOnPhone}` };
  if (rankedOnNothing >= rankedOnPhone) return { ok: false, detail: 'no way in at all ranks the same as the phone' };
  if (rankedOnNamed !== 100) return { ok: false, detail: `a business you can write to by name was held at ${rankedOnNamed}` };
  return {
    ok: true,
    detail: `a perfect fit ranks ${rankedOnNamed} when you can write to somebody by name, ${rankedOnPhone} on the phone alone and ${rankedOnNothing} with no way in`,
  };
}, 'score');

def('the_fit_survives_being_held_down', () => {
  // Holding the ranking must never destroy what was known about the business.
  // A number that quietly becomes 50 with no trace of the 100 behind it is a
  // black box, and Russ has to be able to argue with every part of it.
  const { howToReachThem, callOrderScore, explain } = reachable();
  const reach = howToReachThem({ website: true });
  const said = explain(95, reach);
  const ranked = callOrderScore(95, reach);
  if (ranked >= 95) return { ok: false, detail: 'nothing was held down at all' };
  if (!said.includes('95')) return { ok: false, detail: `the fit is not visible in the words: ${said}` };
  return { ok: true, detail: `held down and still readable: "${said}"` };
}, 'score');

def('a_placeholder_is_never_saved_as_an_address', () => {
  // Horner Law's record came back with "your@email" as its address — the grey
  // placeholder inside their own contact form. It was genuinely on the page,
  // so "did you actually read this" was not enough of a test. A placeholder is
  // worse than a blank: a blank shows as missing, a placeholder looks like a
  // working address and quietly bounces everything written to it.
  const { isARealAddress } = understand();
  const mustRefuse = ['your@email', 'you@yourcompany.com', 'name@domain.com', 'email@example.com',
    'info@highdesertpm.com\\', 'a@b', 'test@test', 'someone@yourdomain.com'];
  const mustKeep = ['dan@firkus.com', 'will@ankenynw.com', 'trish.ackerman@wilco.coop',
    'yewavestorage@gmail.com', 'info@x.co.uk'];
  const wronglyKept = mustRefuse.filter((v) => isARealAddress(v));
  const wronglyRefused = mustKeep.filter((v) => !isARealAddress(v));
  const ok = !wronglyKept.length && !wronglyRefused.length;
  return {
    ok,
    detail: ok
      ? `${mustRefuse.length} placeholders refused, ${mustKeep.length} real addresses kept`
      : `kept: ${wronglyKept.join(', ')} | refused: ${wronglyRefused.join(', ')}`,
  };
}, 'people');

def('a_first_name_is_a_person_and_a_company_is_not', () => {
  // Two mistakes in opposite directions, both made in one hour. Demanding two
  // words filed Linda, Joan, Mike and 301 others as junk — plenty of team
  // pages list staff by first name and nothing else. Allowing anything two
  // words long filed "Outwest Insurance" as an agent and "Dental Assistant"
  // as an office manager.
  const { looksLikeAHuman } = understand();
  const people = ['Linda', 'Megan J. Horner', 'Skip David Shields', "Sean O'Brien", 'Yod Branch'];
  const notPeople = ['Outwest Insurance', 'Dental Assistant', 'Advanced Medical',
    'Construction Manager', 'Skip to content', 'Meet Our Team', 'Contact Us'];
  const missed = people.filter((n) => !looksLikeAHuman(n, true));
  const letIn = notPeople.filter((n) => looksLikeAHuman(n, true));
  // And a bare first name with nothing attached is a heading, not a person.
  const bareWordKept = looksLikeAHuman('Linda', false);
  const ok = !missed.length && !letIn.length && !bareWordKept;
  return {
    ok,
    detail: ok
      ? 'a first name with a job beside it is a person; a company name never is; a bare word on its own is a heading'
      : `missed people: ${missed.join(', ')} | let through: ${letIn.join(', ')} | bare word kept: ${bareWordKept}`,
  };
}, 'people');

def('a_shared_inbox_is_never_handed_to_a_person', () => {
  // info@ belongs to the business. Handing it to a named person makes a
  // message read as though it were written to them, and makes the business
  // look reachable by name when it is not.
  const { keepOnlyWhatWasRead } = understand();
  const document = 'Our team. Dan Firkus, owner. info@firkus.com. 541-555-0100.';
  const got = keepOnlyWhatWasRead({
    trade: 'trades',
    people: [{ name: 'Dan Firkus', role: 'owner', email: 'info@firkus.com' }],
  }, document, 'Firkus Plumbing');
  const dan = got.people.find((p) => p.name === 'Dan Firkus');
  if (!dan) return { ok: false, detail: 'Dan was dropped entirely' };
  if (dan.email) return { ok: false, detail: `the shared inbox was given to Dan: ${dan.email}` };
  if (got.sharedEmail !== 'info@firkus.com') return { ok: false, detail: 'the shared inbox was lost instead of moved' };
  return { ok: true, detail: 'the general inbox moved to the business and Dan kept his name and his job' };
}, 'people');

def('nothing_is_written_that_was_not_actually_on_the_page', () => {
  // The reader is good and it is not a guarantee. An address it constructs
  // from a naming pattern it noticed — first.last@ — looks exactly like one it
  // read. Everything kept is checked back against the words that were handed
  // over, so a fact Russ says out loud on a call came from their own site.
  const { keepOnlyWhatWasRead } = understand();
  const document = 'Meet Sarah Kent, our practice manager. Call the office on 541-555-0199.';
  const got = keepOnlyWhatWasRead({
    trade: 'dental',
    people: [{
      name: 'Sarah Kent',
      role: 'practice manager',
      email: 'sarah.kent@brightsmile.com',
      linkedIn: 'https://linkedin.com/in/sarahkent',
    }],
    mainPhone: '541-555-0199',
  }, document, 'Bright Smile Dental');
  const sarah = got.people.find((p) => p.name === 'Sarah Kent');
  if (!sarah) return { ok: false, detail: 'a person who WAS on the page got dropped' };
  if (sarah.email) return { ok: false, detail: `an invented address was kept: ${sarah.email}` };
  if (sarah.linkedIn) return { ok: false, detail: 'an invented profile was kept' };
  if (sarah.role !== 'practice manager') return { ok: false, detail: 'her real job was lost' };
  if (got.mainPhone !== '541-555-0199') return { ok: false, detail: 'the number that WAS published got dropped' };
  return { ok: true, detail: 'the invented address and profile were refused; her name, her job and the published number were kept' };
}, 'people');

def('a_person_who_was_never_there_is_refused', () => {
  // A name that does not appear in the pages was not read off them.
  const { keepOnlyWhatWasRead } = understand();
  const got = keepOnlyWhatWasRead({
    trade: 'legal',
    people: [{ name: 'Megan J. Horner', role: 'managing partner' }, { name: 'Nobody Atall', role: 'partner' }],
  }, 'Horner Law. Megan J. Horner, managing partner.', 'Horner Law');
  const names = got.people.map((p) => p.name);
  if (!names.includes('Megan J. Horner')) return { ok: false, detail: 'the real person was dropped' };
  if (names.includes('Nobody Atall')) return { ok: false, detail: 'a person who was never on the page was kept' };
  if (!got.dropped.length) return { ok: false, detail: 'nothing was recorded about the refusal' };
  return { ok: true, detail: `kept the person who was there, refused the one who was not, and said why: "${got.dropped[0]}"` };
}, 'people');

def('an_unsure_trade_is_left_blank_rather_than_guessed', () => {
  // A wrong trade costs far more than a blank one: it picks the wrong opening
  // line, the wrong scenarios and the wrong estimate of the hours. The reader
  // is allowed to say it cannot tell, which no pattern can ever do.
  const { keepOnlyWhatWasRead } = understand();
  const unsure = keepOnlyWhatWasRead({
    trade: 'accounting',
    tradeSure: false,
    cannotTell: 'it could be accounting or bookkeeping software, the page never says',
  }, 'some words about a business', 'Something Ltd');
  if (unsure.trade) return { ok: false, detail: 'a trade it was unsure about was written down anyway' };
  if (!unsure.tradeUnsure) return { ok: false, detail: 'the doubt was not recorded' };
  if (!unsure.cannotTell) return { ok: false, detail: 'no reason was kept for Russ to read' };
  const sure = keepOnlyWhatWasRead({ trade: 'accounting', tradeSure: true }, 'words', 'X');
  if (sure.trade !== 'accounting') return { ok: false, detail: 'a trade it WAS sure about got thrown away' };
  return { ok: true, detail: 'unsure is left blank with the reason kept; sure is written down' };
}, 'trade');

def('the_reader_is_asked_to_understand_not_to_match', () => {
  // The whole point. If this question ever turns back into a word list, every
  // fault of the last week comes back with it.
  const { questionAbout, TRADES } = understand();
  const q = questionAbout('Vernam Crane Service', 'we lift things onto building sites');
  const mustSay = [
    ['for MEANING', 'never tells the reader to read for meaning'],
    ['Never pattern-match', 'never forbids pattern matching'],
    ['A firm of accountants whose benefits page mentions dental insurance is accounting', 'lost the example that explains the difference'],
    ['set trade to null', 'never allows "I cannot tell" on the trade'],
    ['role is null', 'never allows "I cannot tell" on a job title'],
    ['NOWHERE else', 'no longer keeps a shared inbox off a person'],
    ['Never guess one from a name', 'no longer forbids guessing a profile'],
  ];
  const missing = mustSay.filter(([needle]) => !q.includes(needle)).map(([, why]) => why);
  if (missing.length) return { ok: false, detail: missing.join('; ') };
  if (TRADES.length < 20) return { ok: false, detail: `only ${TRADES.length} trades offered` };
  return { ok: true, detail: `the reader is asked to judge what a business IS, across ${TRADES.length} trades, and is allowed to answer that it cannot tell` };
}, 'trade');

def('an_address_in_a_link_is_not_lost', () => {
  // Stripping the tags off a page threw away every address and number that
  // lived inside a link, which is where small businesses put them. "Email Dan"
  // became the words "Email Dan" and the one fact worth having was gone.
  const { readableText } = understand();
  const html = '<p>Reach <a href="mailto:dan@firkus.com">Dan</a> or ring '
    + '<a href="tel:5415550100">the office</a>. '
    + '<a href="https://www.linkedin.com/in/danfirkus">Dan on LinkedIn</a></p>';
  const text = readableText(html);
  if (!text.includes('dan@firkus.com')) return { ok: false, detail: 'the address inside the link was thrown away' };
  if (!text.includes('5415550100')) return { ok: false, detail: 'the number inside the link was thrown away' };
  if (!/linkedin\.com\/in\/danfirkus/.test(text)) return { ok: false, detail: 'the profile inside the link was thrown away' };
  if (!text.includes('Dan')) return { ok: false, detail: 'the words around the link were lost' };
  return { ok: true, detail: 'addresses, numbers and profiles inside links survive into what the reader sees' };
}, 'people');

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

// ── The night of 2026-08-29 ─────────────────────────────────────────
// Three runs in a row did what was asked and produced nothing Russ
// wanted. Each of these is one of those failures, written as a check so
// it cannot come back quietly. Spec: .xf/specs/2026-08-29-website-read.md

def('a_person_with_a_name_but_no_address_is_still_saved', () => {
  // Most people on a small firm's website are a name and a job and
  // nothing else. If only the ones with an email survive, the whole
  // point of reading the page is lost.
  const { keepOnlyWhatWasRead } = understand();
  const document = 'Our team. Sandy Caverhill, CPA. Chelan Cameron, Accounting Office Manager. info@mc.com';
  const got = keepOnlyWhatWasRead({
    trade: 'accounting',
    people: [
      { name: 'Sandy Caverhill', role: 'CPA' },
      { name: 'Chelan Cameron', role: 'Accounting Office Manager' },
    ],
  }, document, 'McGregor Caverhill');
  if (got.people.length !== 2) {
    return { ok: false, detail: `${2 - got.people.length} of the two were dropped for having no address` };
  }
  return { ok: true, detail: 'both kept their place with a name and a job and no address' };
}, 'people');

def('the_reader_may_answer_that_it_cannot_tell', () => {
  // A page that says nothing about the trade must produce silence, not
  // a guess. Russ: "read the data, don't pattern-match it."
  const { keepOnlyWhatWasRead } = understand();
  const got = keepOnlyWhatWasRead(
    { trade: null, tradeUnsure: true, people: [], cannotTell: 'The site never says what they do.' },
    'Welcome. Open Monday to Friday. Call us.', 'The Workshop');
  if (got.trade) return { ok: false, detail: `a trade was invented from a page that never named one: ${got.trade}` };
  if (!got.cannotTell) return { ok: false, detail: 'the honest sentence about what is missing was thrown away' };
  return { ok: true, detail: 'no trade invented, and the page\'s silence was written down as a sentence' };
}, 'people');

def('a_run_that_saves_nobody_is_reported_as_a_failure', () => {
  // The night's worst one. 887 people were read off the pages, counted,
  // reported in the tally, and never written to a single record. Every
  // check passed because every check asked the reader, not the records.
  const fs = require('fs');
  const src = fs.readFileSync('scripts/hoursback/read-via-openrouter.js', 'utf8');
  if (!/THE PEOPLE WERE NOT SAVED/.test(src)) {
    return { ok: false, detail: 'the run can finish with nobody saved and still call itself a success' };
  }
  if (!/db\.prospect\.findMany[\s\S]{0,400}contacts:/.test(src)) {
    return { ok: false, detail: 'success is still judged from the reader, not from the records' };
  }
  return { ok: true, detail: 'the run reads the records back and says so plainly when the people are missing' };
}, 'people');

def('the_money_ceiling_is_checked_before_the_call_not_after', () => {
  // Checked afterwards, the ceiling is a receipt. Checked before, it is
  // a limit. Russ has paid for the difference.
  const fs = require('fs');
  const src = fs.readFileSync('scripts/hoursback/read-via-openrouter.js', 'utf8');
  const stop = src.indexOf('spent + worst > CEILING_USD');
  const call = src.indexOf('await askTheReader(');
  if (stop === -1) return { ok: false, detail: 'nothing works out the cost before spending it' };
  if (call === -1 || stop > call) return { ok: false, detail: 'the money is spent before the ceiling is consulted' };
  return { ok: true, detail: 'the ceiling is consulted before every call, so it cannot be passed by the call that finds it' };
}, 'people');

def('the_two_ways_of_reading_a_site_save_it_the_same_way', () => {
  // Written twice, it was written wrong: one path saved people and the
  // other silently did not. One saving step, used by both, is the only
  // arrangement in which that cannot happen again.
  const fs = require('fs');
  const src = fs.readFileSync('scripts/hoursback/read-via-openrouter.js', 'utf8');
  if (!/require\('\.\/understand-businesses\.js'\)/.test(src)) {
    return { ok: false, detail: 'the second path has its own saving step again' };
  }
  if (/db\.prospect\.update\(/.test(src)) {
    return { ok: false, detail: 'the second path still writes records by hand instead of through the shared step' };
  }
  return { ok: true, detail: 'both ways of reading a website save it through the same step' };
}, 'people');

def('a_person_the_record_refuses_is_never_swallowed', () => {
  // The saving step used to catch every failure and say nothing. The note
  // claimed it was only for two staff sharing one inbox — but it never
  // checked, so ANY failure dropped a person in silence. That is how 887
  // people were read, counted, reported and never written (2026-08-29).
  const fs = require('fs');
  const src = fs.readFileSync('scripts/hoursback/understand-businesses.js', 'utf8');
  if (/\}\s*catch\s*\{\s*\/\* two people sharing an address/.test(src)) {
    return { ok: false, detail: 'the saving step still swallows every failure without saying so' };
  }
  if (!/lost\.push\(/.test(src)) {
    return { ok: false, detail: 'a person the record refuses is still not counted anywhere' };
  }
  const run = fs.readFileSync('scripts/hoursback/read-via-openrouter.js', 'utf8');
  if (!/PEOPLE WERE REFUSED BY THE RECORDS/.test(run)) {
    return { ok: false, detail: 'the run never tells anybody a person was refused' };
  }
  return { ok: true, detail: 'a refused person is counted and named in the run summary instead of vanishing' };
}, 'people');

def('no_message_ever_prints_the_word_null', () => {
  // A trade with nothing published gets no research line — that is the honest
  // answer, and proofFor returns nothing for storage, manufacturing,
  // agriculture, retail and cleaning. Dropped into the template unchecked it
  // printed the literal word "null" between the opening and what Russ does.
  // 281 messages were carrying it, none sent, found by reading one
  // (2026-08-30).
  //
  // Written against a FRESHLY COMPOSED message, not stored rows: the first
  // version counted rows in the test database, found none, and passed saying
  // "none of 0 messages" — a check that can only ever pass proves nothing.
  const { draftFirstContact } = require('../../src/hoursback/crm/firstContact.js');
  const bare = ['storage & logistics', 'manufacturing', 'agriculture', 'retail & food', 'cleaning & facilities'];
  const bad = [];
  for (const trade of bare) {
    const drafted = draftFirstContact({
      id: 'x', name: 'Cascade Works', trade, phone: '541-555-0100',
      email: 'office@cascadeworks.example', ownerName: 'Dale Hutchins',
      automationScore: 40, theirWork: 'We move freight across Central Oregon.',
    });
    const text = `${drafted && drafted.body || ''} ${drafted && drafted.subject || ''}`;
    if (/\bnull\b|\bundefined\b/.test(text)) bad.push(trade);
  }
  if (bad.length) return { ok: false, detail: `a missing research line prints as a word for: ${bad.join(', ')}` };
  return { ok: true, detail: `${bare.length} trades with nothing published compose cleanly — no "null" in the text` };
}, 'messages');

// ---------------------------------------------------------------------------
// THE FIFTEEN-MINUTE LINE (2026-08-30)
//
// The offer is one paragraph and it has to carry four things at once: the free
// fifteen minutes, a named tool with what it costs, building as a live answer
// from the first minute rather than a fallback, and a hint there is usually
// more than one thing to find. Two drafts were thrown out for dropping one of
// them, so each half is checked separately rather than eyeballed.
//
// Everything below reads the DATABASE, not the generator's own report. Three
// nights were declared successes by a generator that worked correctly and then
// threw the results away.

// What everything here counts as the same sentence said different ways.
const FIFTEEN = /fifteen minutes|quarter of an hour/i;
const WHAT_IT_COSTS = /what it costs|its cost|the cost\b|its price|the price\b|what it runs to/i;
const THE_BUILD = /\bbuilt?\b|building|to build|to make|has to be made|worth making|having it made|worth having made/i;
// The paragraph body, without Russ's own sign-off. His signature carries a
// calendly.com link, which is a named product and would fail the software test
// on every message ever written.
const justTheLetter = (body) => String(body).split(/\nBest regards,/)[0];

def('every_message_offers_the_fifteen_minutes_and_a_priced_tool', () => withLiveDb(async (db) => {
  // Neither half may go missing. The first rejected draft kept the call and
  // deleted the tool hunt from all six versions — Russ: "You have completely
  // eliminated the whole automation, off the shelf premise."
  // What can still reach a reader: not sent, not suppressed. A suppressed row
  // is a message that has been stood down and will never go anywhere, and
  // holding tonight's wording against one is measuring the wrong thing.
  const drafts = await db.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } }, select: { body: true, prospectId: true },
  });
  if (!drafts.length) return { ok: false, detail: 'no email drafts exist to check' };
  const noCall = drafts.filter((d) => !FIFTEEN.test(justTheLetter(d.body)));
  const noTool = drafts.filter((d) => !/\btool\b/i.test(justTheLetter(d.body)) || !WHAT_IT_COSTS.test(justTheLetter(d.body)));
  const noBuild = drafts.filter((d) => !THE_BUILD.test(justTheLetter(d.body)));
  if (noCall.length || noTool.length || noBuild.length) {
    return { ok: false, detail: `${noCall.length} without the free fifteen minutes, ${noTool.length} without a tool and what it costs, ${noBuild.length} without building on the table` };
  }
  return { ok: true, detail: `${drafts.length} messages still able to go out, every one offering fifteen free minutes, a named tool with its cost, and building alongside it` };
}), 'messages');

def('no_first_message_carries_a_price', () => withLiveDb(async (db) => {
  // The price belongs in the SECOND touch, after they have read something
  // honest. A number in a first approach becomes the whole conversation.
  const drafts = await db.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } }, select: { body: true },
  });
  const MONEY = /\$\s*\d|\b\d[\d,]*\s*(?:dollars?|bucks|usd)\b|\bfee\b|\bcosts? \$?\d/i;
  const priced = drafts.filter((d) => MONEY.test(justTheLetter(d.body)));
  return { ok: !priced.length, detail: priced.length
    ? `${priced.length} first messages name a price or a fee`
    : `${drafts.length} messages still able to go out, no price, no fee, no figure` };
}), 'messages');

def('no_first_message_names_software_they_run', () => withLiveDb(async (db) => {
  // What they pay for was never broadcast to us. Naming it reads as somebody
  // who went looking rather than somebody who looked, and it is the one thing
  // that turns a warm note cold.
  const { TOOLS } = require(path.join(ROOT, 'src/hoursback/enrich.js'));
  const names = Object.keys(TOOLS).map((n) => n.replace(/_/g, ' '));
  const drafts = await db.outreachMessage.findMany({
    where: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] } },
    select: { body: true, prospect: { select: { theirWork: true, selfDescription: true } } },
  });
  const caught = [];
  for (const d of drafts) {
    const letter = justTheLetter(d.body);
    // What THEY put on their own website is theirs to have named. An
    // accountant whose homepage says "bookkeeping and QuickBooks work" has
    // broadcast it, and quoting their own sentence back is the whole point of
    // the opening line. What the reading DETECTED behind their site is the
    // thing that was never broadcast, and that may never appear.
    const published = `${d.prospect?.theirWork || ''} ${d.prospect?.selfDescription || ''}`;
    for (const n of names) {
      const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(letter) && !re.test(published)) caught.push(n);
    }
  }
  return { ok: !caught.length, detail: caught.length
    ? `software named in a cold message: ${[...new Set(caught)].join(', ')}`
    : `${drafts.length} messages still able to go out, no product named in any of them` };
}), 'messages');

def('the_fifteen_minute_line_never_claims_anything_about_them', () => {
  // The opening line DOES say something about them, on purpose, and only ever
  // something they published. The fifteen-minute line is different: it says
  // what Russ would go looking for in a business of that shape, and it must
  // never assert a fact. Russ, 2026-08-30: "we can lightly infer but there
  // won't be definitive enough info to call something out specifically and
  // confidently." So this reads the wordings themselves, not the whole letter.
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const CLAIM = /\byou(?:'re| are| have| had| run| pay| paid| use| own| bought| announced| employ| still| already)\b|\byour \w+ (?:is|was|has|costs|runs)\b/i;
  const bad = V.ALL_FREE_LOOKS.filter((s) => CLAIM.test(s));
  if (bad.length) return { ok: false, detail: `${bad.length} wordings state a fact about the reader: "${bad[0].slice(0, 70)}..."` };
  return { ok: true, detail: `${V.ALL_FREE_LOOKS.length} wordings, none of them telling a stranger what is true of their business` };
}, 'messages');

def('every_business_gets_a_fifteen_minute_line_the_record_supports', () => {
  // A lean is used only where the reading recorded something. Where it did not,
  // the plain version goes — an invented lean reads as a mail-merge and costs
  // the reply, the same lesson as the retired build sentence.
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  const cases = [
    ['a shelved piece of software', { stalledBuild: 'Their site has advertised a client portal as coming soon since 2022.' }, V.FREE_LOOK_STALLED_BUILD],
    ['five different operations', { separateOperations: 5 }, V.FREE_LOOK_HANDOVERS],
    ['work that is a different shape every time', { trade: 'construction' }, V.FREE_LOOK_NO_TOOL_EXISTS],
    ['a published job advert', { openRoles: 2 }, V.FREE_LOOK_NEW_AND_UNTOOLED],
    ['software we detected but they never published', { toolsInUse: 'QuickBooks, Square' }, V.FREE_LOOK_RENTED_SEAT],
    ['nothing read at all', {}, V.FREE_LOOK],
    ['a record with nothing on it', { separateOperations: 1, openRoles: 0, trade: 'accounting' }, V.FREE_LOOK],
  ];
  for (const [what, record, expected] of cases) {
    if (V.freeLookFamilyFor(record) !== expected) return { ok: false, detail: `${what} landed on the wrong version` };
  }
  if (V.freeLookFamilyFor(null) !== V.FREE_LOOK) return { ok: false, detail: 'a missing record did not fall back to the plain version' };
  const seen = new Set(V.ALL_FREE_LOOKS);
  if (seen.size !== V.ALL_FREE_LOOKS.length) return { ok: false, detail: 'the same wording appears in more than one version' };
  return { ok: true, detail: `${V.ALL_FREE_LOOKS.length} wordings across six versions, each chosen only from what the reading recorded` };
}, 'messages');

def('the_retired_build_sentence_is_in_no_message', () => withLiveDb(async (db) => {
  // The pass/fail build test is gone. Building is on the table for everybody
  // from the first minute now, so no message may still carry the sentence that
  // told a high-scoring business nothing off the shelf would fit it.
  const V = require(path.join(ROOT, 'src/hoursback/crm/variants.js'));
  if (V.WHAT_I_DO_BUILD || V.buildReasonFor) {
    return { ok: false, detail: 'the retired build family is still exported from variants.js' };
  }
  const RETIRED = /fit badly|covers the half of it|built rather than bought|all run out of one office|different operations run out of one office/i;
  const drafts = await db.outreachMessage.findMany({ where: { state: { in: ['DRAFT', 'QUEUED'] } }, select: { body: true } });
  const stale = drafts.filter((d) => RETIRED.test(String(d.body)));
  return { ok: !stale.length, detail: stale.length
    ? `${stale.length} messages still carry the retired build sentence`
    : `${drafts.length} messages still able to go out, none carrying it` };
}), 'messages');

def('no_message_prints_the_word_null', () => withLiveDb(async (db) => {
  // 281 messages once carried the literal text "null" between the opening and
  // what Russ does, because a trade with no published research returned nothing
  // and nothing was dropped into the template. None had been sent.
  const drafts = await db.outreachMessage.findMany({ where: { state: { in: ['DRAFT', 'QUEUED'] } }, select: { body: true, subject: true } });
  const broken = drafts.filter((d) => /\bnull\b|\bundefined\b|\{[a-zA-Z]+\}/.test(`${d.subject || ''} ${d.body}`));
  return { ok: !broken.length, detail: broken.length
    ? `${broken.length} messages print a word the reader was never meant to see`
    : `${drafts.length} messages still able to go out, no "null", no unfilled slot` };
}), 'messages');

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
