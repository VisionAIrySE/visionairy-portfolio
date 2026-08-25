// Hours Back — the Central Oregon sweep. Two modes over ONE client and ONE
// run-row writer: runRegionalCapture (the one-time near-complete capture)
// and runMonthlyTopUp (the recurring pass). They differ only in which
// configured cells they sweep.
//
// A cell is one Places query unit (a town x a category). A cell is COMPLETED
// only when its result pages are exhausted; a cell whose retries are spent is
// FAILED — excluded from cellsCompleted, still counted in cellsAttempted, and
// requested again by the next sweep so a transient failure never permanently
// drops part of the region. Cell state persists to a file, so a resumed
// sweep issues zero requests for completed cells.

const fs = require('fs');
const path = require('path');
const { normalizePhone, normalizeDomain, findDuplicate, recordDuplicate } = require('./dedupe.js');

// The configured Central Oregon cells: every chamber town crossed with the
// category families the business model sweeps. Any business over the
// qualification floor is a candidate — category tilts the score, never the
// sweep (settled 2026-08-24).
const TOWNS = ['Bend', 'Redmond', 'Sisters', 'Prineville', 'Madras', 'La Pine'];
const CATEGORIES = [
  'accounting', 'law firm', 'insurance agency', 'property management',
  'staffing agency', 'medical clinic', 'dental office', 'construction',
  'plumbing', 'electrician', 'hvac', 'landscaping', 'auto repair',
  'real estate', 'veterinarian', 'manufacturer', 'wholesale', 'logistics',
];
const REGIONAL_CELLS = TOWNS.flatMap((t) => CATEGORIES.map((c) => ({ id: `${t}:${c}`, town: t, category: c })));

const DEFAULT_STATE_FILE = path.join(__dirname, '../../data/sweep-cell-state.json');
const DEFAULT_RETRIES = 3;

function loadState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { completed: {} }; }
}
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 1));
}

// The client: fetchPage(cell, pageToken) -> { places, nextPageToken }. The
// production fetchPage talks to Google Places; the fixture one replays
// recorded pages. Either way the caller never paginates by hand, and every
// returned record carries all six fields (phone/website null when absent).
function createPlacesClient({ fetchPage, retryCount = DEFAULT_RETRIES }) {
  return async function fetchCell(cell) {
    const places = [];
    let token;
    let attemptsLeft = retryCount;
    for (;;) {
      let page;
      try {
        page = await fetchPage(cell, token);
      } catch (e) {
        attemptsLeft -= 1;
        if (attemptsLeft <= 0) return { failed: true, places: [] };
        continue;
      }
      for (const p of page.places || []) {
        places.push({
          placeId: p.placeId, name: p.name || null,
          phone: p.phone ?? null, website: p.website ?? null,
          address: p.address ?? null, categories: p.categories ?? [],
        });
      }
      token = page.nextPageToken;
      if (!token) return { failed: false, places };
    }
  };
}

// One production fetchPage. Reads the credential from the environment and
// refuses to run without it — a keyless sweep must exit with a named message,
// never write a runs row claiming it saw zero places.
function requireApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    const err = new Error('GOOGLE_PLACES_API_KEY is not set — the sweep cannot reach Google Places without it');
    err.named = true;
    throw err;
  }
  return key;
}

async function googleFetchPage(cell, pageToken) {
  const key = requireApiKey();
  const body = pageToken
    ? { pageToken }
    : { textQuery: `${cell.category} in ${cell.town}, Oregon` };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.types,nextPageToken',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`places request failed: ${res.status}`);
  const data = await res.json();
  return {
    places: (data.places || []).map((p) => ({
      placeId: p.id, name: p.displayName && p.displayName.text,
      phone: p.nationalPhoneNumber ?? null, website: p.websiteUri ?? null,
      address: p.formattedAddress ?? null, categories: p.types ?? [],
    })),
    nextPageToken: data.nextPageToken,
  };
}

// The insert gate: a prospect row is written only when placeId,
// normalizedPhone and normalizedDomain are ALL THREE absent from the store.
// A match on any one records a ProspectDuplicate row and skips the place.
async function gateAndInsert(db, place, runId) {
  const dup = await findDuplicate(db, place);
  if (dup) {
    await recordDuplicate(db, dup.prospect.id, place, dup.matchSignal);
    return false;
  }
  await db.prospect.create({
    data: {
      placeId: place.placeId, name: place.name || '(unnamed)',
      phone: place.phone, website: place.website, address: place.address,
      normalizedPhone: normalizePhone(place.phone),
      normalizedDomain: normalizeDomain(place.website),
      captureRunId: runId, fieldSource: 'google_places', fetchedAt: new Date(),
    },
  });
  return true;
}

// The one shared sweep. Both modes run through here — one run-row writer,
// so a field added to the runs model lands on both modes at once.
async function runSweep({ db, mode, cells, client, stateFile = DEFAULT_STATE_FILE }) {
  if (!client) client = createPlacesClient({ fetchPage: googleFetchPage });
  if (!process.env.GOOGLE_PLACES_API_KEY && client.usesEnvKey) requireApiKey();
  const startedAt = new Date();
  const state = loadState(stateFile);
  let cellsAttempted = 0, cellsCompleted = 0, placesSeen = 0, placesInserted = 0;

  const run = await db.captureRun.create({ data: { mode, startedAt } });
  for (const cell of cells) {
    if (state.completed[cell.id]) continue; // resumed sweep: zero requests here
    cellsAttempted += 1;
    const result = await client(cell);
    if (result.failed) continue; // failed: not completed, retried next sweep
    for (const place of result.places) {
      placesSeen += 1;
      if (await gateAndInsert(db, place, run.id)) placesInserted += 1;
    }
    cellsCompleted += 1;
    state.completed[cell.id] = true;
    saveState(stateFile, state);
  }
  return db.captureRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), cellsAttempted, cellsCompleted, placesSeen, placesInserted },
  });
}

// The two modes. Regional sweeps every configured cell; the monthly top-up
// sweeps the same region against a FRESH cell state, so it re-asks every
// cell and the insert gate keeps out everything already captured or worked.
function runRegionalCapture(opts = {}) {
  return runSweep({ mode: 'regional', cells: opts.cells || REGIONAL_CELLS, ...opts });
}
function runMonthlyTopUp(opts = {}) {
  const stateFile = opts.stateFile
    || path.join(__dirname, `../../data/topup-cell-state-${new Date().toISOString().slice(0, 7)}.json`);
  return runSweep({ mode: 'monthly_top_up', cells: opts.cells || REGIONAL_CELLS, ...opts, stateFile });
}

exports.REGIONAL_CELLS = REGIONAL_CELLS;
exports.createPlacesClient = createPlacesClient;
exports.googleFetchPage = googleFetchPage;
exports.runRegionalCapture = runRegionalCapture;
exports.runMonthlyTopUp = runMonthlyTopUp;
exports.requireApiKey = requireApiKey;
