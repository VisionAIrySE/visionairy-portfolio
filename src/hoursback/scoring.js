// Hours Back — how manual does this business still look?
//
// The score decides call order, nothing else. It never decides who is on the
// list: a business with no tells at all scores zero and still gets called.
// Team size is deliberately absent — size sets the price, never the ranking.
//
// Every weight lives in one table below. Calling outcomes can revise those
// weights through a settings file, so tuning the order never means editing
// this code.

const fs = require('fs');
const path = require('path');

// The tells, and what each is worth. A live posting for an office role is the
// strongest single signal by design: someone is about to be paid to do what
// software could do.
//
// Weights rebalanced 2026-08-25 against the real Central Oregon list. The two
// absence signals fired on roughly three in four businesses, so at their
// original weights 799 companies tied on exactly the same number and the
// middle of the list could not be sorted at all. They are still real tells —
// they are just not distinguishing ones here, so they weigh less than the
// rare ones that actually separate one business from the next.
const SIGNAL_WEIGHTS = {
  hiring_admin_role: 40,          // source: lb6 spec — highest single signal
  no_website: 25,                 // nothing online at all: every enquiry is a call
  downloadable_forms: 15,         // paper in, typing out
  no_online_booking: 14,          // every appointment costs a phone call
  // No way at all for a visitor to get in touch except the phone. Checked
  // properly across 100 sites on 2026-08-27: 18 of them genuinely had none,
  // and it is the most commercially useful thing on this list — it is a
  // rebuild you can quote in a day.
  no_way_to_enquire: 18,
  fax_listed: 12,                 // a fax number in this decade
  no_email_published: 8,          // no way to reach them but the phone
  // no_customer_portal was worth 7 and retired on 2026-08-27. Read properly,
  // 24 of the 85 businesses it had called "no customer login" turned out to
  // have one — wrong more than a quarter of the time. A signal that unreliable
  // cannot carry points. Booking was checked the same way and was wrong only 3
  // times in 85, so it stays.

  // Everything below comes from what was learned about the business rather
  // than from a missing feature on its website. Added 2026-08-26 so the call
  // order reflects everything known, not just the tells.
  runs_several_businesses: 30,    // one conversation, several sets of hours
  hiring_several_office_roles: 22,// more than one open desk job at once
  long_established: 10,           // decades of habits, and the money to fix them
  team_size_known: 6,             // priceable on the first call, no discovery needed
  disconnected_tools: 14,         // paying for software that does not talk
  named_decision_maker: 8,        // you can ask for them by name
};

// Plain-English labels, for the call screen.
const SIGNAL_LABELS = {
  hiring_admin_role: 'Hiring for an office role right now',
  no_website: 'No website at all',
  downloadable_forms: 'Forms are PDFs to print and fill in',
  no_online_booking: 'No way to book online',
  fax_listed: 'Still lists a fax number',
  no_email_published: 'Publishes no email address',
  no_way_to_enquire: 'No way to get in touch but the phone',
  runs_several_businesses: 'The same owner runs other businesses here',
  hiring_several_office_roles: 'Advertising more than one office role',
  long_established: 'Decades in business',
  team_size_known: 'Team size known, so priceable today',
  disconnected_tools: 'Paying for software that does not talk to itself',
  named_decision_maker: 'You can ask for them by name',
};

// Category nudges the order a little and never gates anyone out. Capped at
// CATEGORY_TILT_CAP so no category can outrank a real signal.
const CATEGORY_TILT_CAP = 5;
const CATEGORY_TILTS = {
  'dental office': 5, 'medical clinic': 5, 'law firm': 4, 'accounting firm': 4,
  'property management': 4, 'insurance agency': 3, 'veterinary clinic': 3,
  'hvac contractor': 3, 'plumber': 3, 'electrician': 3, 'general contractor': 2,
  'auto repair': 2, 'landscaping': 1, 'restaurant': -2, 'retail store': -2,
};

const WEIGHTS_FILE = path.join(process.cwd(), 'data', 'scoring-weights.json');

// The weights actually in force: the table above, with any revision from the
// settings file laid over it. No file = the defaults.
function loadWeights(file = WEIGHTS_FILE) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const merged = { ...SIGNAL_WEIGHTS };
    for (const [k, v] of Object.entries(saved.weights || saved)) {
      if (k in SIGNAL_WEIGHTS && Number.isFinite(Number(v))) merged[k] = Number(v);
    }
    return merged;
  } catch { return { ...SIGNAL_WEIGHTS }; }
}

function categoryTilt(category) {
  if (!category) return 0;
  const key = String(category).toLowerCase().trim();
  const tilt = CATEGORY_TILTS[key] || 0;
  return Math.max(-CATEGORY_TILT_CAP, Math.min(CATEGORY_TILT_CAP, tilt));
}

// record: { signals: [{signal, url, quote}], category }
// Returns the score and the evidence behind every point of it.
function scoreAutomationFit(record = {}, options = {}) {
  const weights = options.weights || loadWeights(options.weightsFile);
  const seen = new Set();
  const evidence = [];
  let score = 0;
  for (const s of record.signals || []) {
    const name = typeof s === 'string' ? s : s.signal;
    if (!(name in weights) || seen.has(name)) continue;
    seen.add(name);
    const weight = weights[name];
    score += weight;
    evidence.push({
      signal: name,
      label: SIGNAL_LABELS[name] || name,
      weight,
      url: (typeof s === 'object' && s.url) || null,
      quote: (typeof s === 'object' && s.quote) || null,
    });
  }
  const tilt = categoryTilt(record.category);
  if (tilt) {
    score += tilt;
    evidence.push({ signal: 'category_tilt', label: `Category: ${record.category}`, weight: tilt, url: null, quote: null });
  }
  return { score: Math.max(0, score), evidence };
}

// Revise the weights from what actually happened on the phone. A signal that
// shows up on businesses that said yes gains weight; one that shows up on
// businesses that said no loses it. Writes the settings file — this code is
// never edited to tune the order.
//
// outcomes: [{ signals: [...], interested: true|false }]
function reviseWeightsFromOutcomes(outcomes, options = {}) {
  const file = options.file || WEIGHTS_FILE;
  const base = { ...SIGNAL_WEIGHTS };
  const tally = {};
  for (const row of outcomes || []) {
    for (const s of row.signals || []) {
      const name = typeof s === 'string' ? s : s.signal;
      if (!(name in base)) continue;
      tally[name] = tally[name] || { yes: 0, total: 0 };
      tally[name].total += 1;
      if (row.interested) tally[name].yes += 1;
    }
  }
  const minCalls = options.minCalls || 5;
  const weights = { ...base };
  for (const [name, t] of Object.entries(tally)) {
    if (t.total < minCalls) continue;             // too few calls to learn from
    const rate = t.yes / t.total;
    // 0% interested halves the weight, 100% interested adds half again.
    weights[name] = Math.round(base[name] * (0.5 + rate));
  }
  if (options.write !== false) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ revisedFromCalls: (outcomes || []).length, weights }, null, 2));
  }
  return weights;
}

module.exports = {
  SIGNAL_WEIGHTS, SIGNAL_LABELS, CATEGORY_TILTS, CATEGORY_TILT_CAP, WEIGHTS_FILE,
  loadWeights, categoryTilt, scoreAutomationFit, reviseWeightsFromOutcomes,
};
