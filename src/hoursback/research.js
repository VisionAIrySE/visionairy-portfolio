// Work a business out properly, from what is actually published.
//
// Built 2026-08-28 after Russ read the list and could not trust any of it:
// ABC Supply filed as a firm of accountants, Animal Eye Specialists scoring
// 100 off a vet directory, people with no titles, almost no direct numbers.
// "The quality of qualification and validation of data is horrific... I can't
// rely on any of this."
//
// Every one of those came from the same habit: something was GUESSED and then
// stored as though it were known. An industry inferred from words on a page. A
// team size counted off somebody else's listing. A name lifted from a search
// heading.
//
// THE RULE HERE: only what a business publishes about itself is written down.
// Where the answer is not published, the field stays empty and the record says
// WHY in plain words, so Russ can see the gap rather than a guess dressed as a
// fact. He was explicit: do not hide a business because the research failed —
// research it properly, and say what is missing.

const { whyNotTheirs } = require('./notTheirSite.js');

// ---------------------------------------------------------------------------
// What trade are they in, from their OWN words?
//
// The old way keyword-matched page text, so a staffing agency came out
// "dental" from the words "dental insurance", and a builders' merchant came
// out "accounting". This asks a narrower question: does the business SAY what
// it does, in a sentence about itself?
//
// Each trade is recognised by phrases a business uses about ITSELF, not by any
// mention of the word. "we are a plumbing company" counts; "plumbing supplies
// available" does not.
const SAYS_IT_IS = [
  ['dental', /\b(dental (practice|office|clinic|care|group)|family dentist(ry)?|cosmetic dentist(ry)?|orthodont(ic|ist)|periodont|endodont|denture (clinic|center))\b/i],
  ['veterinary', /\b(veterinary (clinic|hospital|center|practice|care)|animal hospital|vet clinic|equine (veterinar|medical))\b/i],
  ['medical', /\b(medical (clinic|center|practice|group)|family (medicine|practice)|primary care|urgent care|health (clinic|center)|dermatolog|pediatric|ob-?gyn|chiropract|physical therapy|naturopath)\b/i],
  ['legal', /\b(law (firm|office|group)|attorneys? at law|legal (services|representation)|criminal defen[cs]e|estate planning attorney|title (company|insurance))\b/i],
  ['accounting', /\b(cpa (firm|pc|llc)?|certified public account|accounting (firm|services)|bookkeeping (services|for)|tax (preparation|service|planning) (firm|services)?|payroll services)\b/i],
  ['insurance', /\b(insurance (agency|agent|broker|services)|independent (insurance )?agency|medicare (solutions|broker|advantage))\b/i],
  ['real estate', /\b(real estate (agent|broker|brokerage|services|group)|property management|realtor|realty|homes for sale|hoa management)\b/i],
  ['construction', /\b(general contractor|construction (company|services|management)|custom home (builder|building)|remodel(ing|er)|excavation|paving|roofing (contractor|company)|concrete (contractor|services))\b/i],
  // "plumbing and heating services" has words between the trade and the noun,
  // so an exact pair missed Firkus Plumbing entirely. Allow a few words.
  ['trades', /\b(hvac|heating and (air|cooling)|air conditioning (repair|service)|plumbing(\s+\w+){0,3}\s+(company|services|contractor|repair)|electrical contractor|electrician|septic service|glass and mirror)\b/i],
  ['auto', /\b(auto (repair|body|service|glass)|automotive (repair|service)|collision (repair|center)|tire (and|&) (auto|service)|transmission repair|mobile mechanic)\b/i],
  ['landscaping', /\b(landscap(e|ing) (company|services|design|contractor)|lawn care|tree (service|removal)|irrigation (services|contractor)|nursery)\b/i],
  ['manufacturing', /\b(manufactur(ing|er)|machine shop|cnc (machining|milling)|fabricat(ion|or)|metal (works|fabrication)|foundry|millwork|cabinet (maker|shop))\b/i],
  ['storage & logistics', /\b(self.?storage|storage (units|facility)|moving (company|services)|freight (broker|service|shipping)|logistics|courier|trucking company|warehousing)\b/i],
  ['retail & food', /\b(brewery|brew ?pub|distiller|winery|coffee (company|roaster)|restaurant|taphouse|grocery|boutique|mercantile|bakery|candy|market)\b/i],
  ['staffing', /\b(staffing (agency|services|solutions)|recruit(ing|ment) (agency|firm)|executive recruiters|employment services|temp(orary)? staffing)\b/i],
  ['personal care', /\b(med ?spa|day spa|salon|barber|massage (therapy|clinic)|aesthetics|wellness (collective|studio))\b/i],
  ['fitness & recreation', /\b(gym|fitness (studio|center)|crossfit|yoga studio|personal training)\b/i],
  ['lodging & hospitality', /\b(vacation rental|resort|lodge|hotel|inn|bed and breakfast|pet (lodge|boarding))\b/i],
  ['cleaning & facilities', /\b(cleaning (company|services)|janitorial|duct cleaning|facilities (maintenance|services)|handyman services)\b/i],
  ['agriculture', /\b(ranch|farm( store)?|livestock|grass.?fed|orchard|nursery and (garden|farm)|hay|cattle)\b/i],
  ['education & childcare', /\b(preschool|daycare|child ?care (center|services)|school district|tutoring|montessori)\b/i],
  ['nonprofit & community', /\b(non.?profit|501\(c\)|charitable organization|community (foundation|services)|chamber of commerce|irrigation district)\b/i],
  ['professional services', /\b(consult(ing|ancy) (firm|services|group)|marketing agency|web (design|development) (company|agency)|video production|business advisory)\b/i],
  ['funeral & memorial', /\b(funeral (home|services)|crematory|memorial (services|chapel)|mortuary)\b/i],
];

// The trade a business SAYS it is, or null with the reason.
// Reading the WHOLE site and taking the first match put Jones & Roth — a firm
// of accountants — down as dental, because the words "dental insurance" appear
// somewhere in a benefits list, and dental happens to be first in the list
// above. Two rules fix it, and both are refusals rather than cleverness:
//
//   1. Only the opening of their home page counts. A business describes itself
//      in the first paragraph; everything after is services, footers and blog
//      posts where any word can appear.
//   2. If more than one trade matches, NOTHING is decided. An ambiguous page
//      is a page that has not answered, and a guess between two is worse than
//      an honest blank.
function tradeFromTheirWords(text) {
  // The first part of their home page, where a business says what it is.
  const t = String(text || '').replace(/\s+/g, ' ').slice(0, 1200);
  if (t.length < 40) return { trade: null, why: 'their site says almost nothing about what they do' };
  const hits = [...new Set(SAYS_IT_IS.filter(([, re]) => re.test(t)).map(([trade]) => trade))];
  if (!hits.length) return { trade: null, why: 'their site never says plainly what kind of business it is' };
  if (hits.length > 1) {
    return { trade: null, why: `their own words could mean ${hits.slice(0, 3).join(' or ')} — nothing decided` };
  }
  return { trade: hits[0], why: null };
}

// ---------------------------------------------------------------------------
// What is missing, said in words Russ can act on.
//
// A blank field with no explanation is indistinguishable from a field nobody
// checked. Each of these is the sentence that goes on the record.
const NOTHING_PUBLISHED = {
  trade: 'their site never says in words what kind of business it is',
  people: 'their site names nobody',
  roles: 'their team page gives no job titles',
  emails: 'no address is published anywhere on their site',
  phones: 'no direct numbers published — only the main line',
  profiles: 'no LinkedIn profiles linked from their site',
  website: 'no website of their own could be found',
};

// Everything known and unknown about one business, as a short readable note.
function whatIsMissing(found = {}) {
  const gaps = [];
  if (!found.website) gaps.push(NOTHING_PUBLISHED.website);
  if (!found.trade) gaps.push(found.tradeWhy || NOTHING_PUBLISHED.trade);
  if (!found.peopleCount) gaps.push(NOTHING_PUBLISHED.people);
  else {
    if (!found.withRole) gaps.push(NOTHING_PUBLISHED.roles);
    if (!found.withEmail) gaps.push(NOTHING_PUBLISHED.emails);
    if (!found.withPhone) gaps.push(NOTHING_PUBLISHED.phones);
    if (!found.withProfile) gaps.push(NOTHING_PUBLISHED.profiles);
  }
  return gaps;
}

module.exports = { SAYS_IT_IS, tradeFromTheirWords, NOTHING_PUBLISHED, whatIsMissing, whyNotTheirs };
