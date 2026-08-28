// Industries read by hand, 2026-08-28.
//
// All 666 emailable businesses were read one at a time against the sentence
// they wrote about themselves. The recorded industry was right about nineteen
// times in twenty — but the twentieth gets a message about somebody else's
// week, and that is the one they remember.
//
// Two lists. Neither is a rule.

// The industry was wrong. Read off their own words, not their domain.
const TRADE_BY_DOMAIN = {
  // "premium property management and design services" — not a builder.
  'stayz.biz': 'real estate',
  // "Lumber and Steel Trading" — was filed under shops and kitchens, and would
  // have opened with a line about walking the shelves to build an order.
  'shamrockbm.com': 'manufacturing',
  // "smart manufacturing & industrial automation solutions".
  'ces-bend.com': 'manufacturing',
  // "siding and decking specialists since 1937" — building materials.
  'lakesidelumber.com': 'construction',
  // "non-emergency medical transport across Central Oregon" — the week is
  // dispatch and routing, not patients.
  'chrisabbotttransport.com': 'storage & logistics',
  // A women's business network member directory, not an accounting firm.
  'connectw.org': 'nonprofit & community',
};

// Not a prospect at all. Each reason is the business's own words.
const NOT_A_PROSPECT = {
  // --- somewhere else entirely -------------------------------------------
  'willowpediatrics.com': 'their own page says Birmingham, Alabama',
  'macmillanplumbing.net': 'their own page says Camas, Washington',
  'elemaroregon.com': 'a stone showroom in Portland',
  'hummingbirdwholesale.com': 'Eugene, not Central Oregon',
  'carusoproduce.com': 'a Pacific Northwest wholesale distributor, not local',
  'unitedsalad.com': 'Portland produce wholesaler',
  'harborwholesale.com': 'a Washington regional distributor since 1923',
  'echo.com': 'Echo Global Logistics — a national freight broker',
  'enduraproducts.com': 'a national door-component manufacturer',
  'montereycompany.com': 'The Monterey Company, national custom manufacturer',
  'mfcp.com': 'a national industrial distributor',

  // --- a public body, not a business --------------------------------------
  'crookcountyor.gov': 'a county health department',
  'deschutes.org': 'a county health service',
  'warmsprings-nsn.gov': 'a tribal health centre',
  'redmondschools.org': 'a public school district',

  // --- too large for this offer -------------------------------------------
  'andersen-const.com': 'a Pacific Northwest general contractor of real size',
  'rhconst.com': 'a large Portland commercial builder',
  'bremik.com': 'a Portland commercial contractor',
  'censorconstruction.com': 'their own page says nationwide general contractor',
  'pahlischhomes.com': 'a regional production homebuilder',

  // --- they sell the thing Russ sells --------------------------------------
  'kopperfield.com': 'they make automation software for electricians',
};

function domainOf(url) {
  return String(url || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function correctedTrade(url) {
  return TRADE_BY_DOMAIN[domainOf(url)] || null;
}

function whyNotAProspect(url) {
  return NOT_A_PROSPECT[domainOf(url)] || null;
}

module.exports = {
  TRADE_BY_DOMAIN, NOT_A_PROSPECT, domainOf, correctedTrade, whyNotAProspect,
};
