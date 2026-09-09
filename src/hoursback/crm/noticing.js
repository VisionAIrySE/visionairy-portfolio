// THE NOTICING — one sentence, true of one business, in Russ's letter.
//
// The second paragraph of the first email used to be the trade's week: the
// same sentence for every accounting firm in town, and two of them in one
// town got it word for word (Russ, 2026-09-01). We now hold what each
// business says about itself — every page of their site, the people on it,
// the software they run — so the sentence can be about THEM.
//
// What changes is exactly one thing: the third element of dayZero, the
// trade's week sentence (`t.week`). Everything else in the letter is Russ's
// own wording and does not move — his greeting, WHO_I_AM, the concession
// line, WHY_ME, THE_OFFER, ASK_DAY0, his sign-off, and the per-business
// variation seeded by the business name.
//
// RUSS'S RULE, SUPREME: never commit to something in the message that may
// not resonate. If the business's own pages do not clearly support one
// specific observation, there is no noticing, and the letter keeps the trade
// sentence unchanged. Silence beats a wrong guess. Absence is data, and it
// is recorded as itself: a could_not_tell finding, kept forever.
//
// EVERY sentence is a finding in the append-only reading store
// (src/hoursback/readings.js). No column was added, nothing is overwritten,
// and a business done twice simply has two findings — the latest wins on the
// way out, exactly as the evidence rule requires.
//
// EVERY model call leaves through the LOCAL reader (askTheReader in
// scripts/hoursback/understand-businesses.js). No OpenRouter, no paid call.
//
// AMENDED 2026-09-02 (second amendment), after a real sentence for a shipping
// shop: "You're picking which carrier for every package. And with the
// international ones, that's customs paperwork too." Grounded, warm, specific
// — and useless. An agent at a counter advising one customer is not work
// software takes, and the sentence rested on a SERVICE THEY ADVERTISE, which
// is a menu item, not evidence of where their week goes. Three changes:
//
//   1. THE TOOL LIBRARY IS THE BENCHMARK. Every job named must map to one of
//      the named types of work in src/hoursback/toolLibrary.js — the list of
//      what software can actually take off a business, each with a department
//      and a plain label. Nothing outside that list qualifies, full stop.
//      The reader is handed the full menu and must name the type key; the
//      code verifies the key exists. This REPLACES the old hand-written
//      hands-on/around-work word lists entirely — the library IS the list,
//      and a job that fits none of its types does not qualify. A customer
//      being on the phone does NOT disqualify a job (phone_answering,
//      call_notes_and_follow_up and knowledge_lookup are all in the library);
//      what disqualifies is a one-off interaction that does not repeat, and a
//      person physically handling an object.
//
//   2. THE RECURRENCE TEST, a separate second call. Mapping to a type is
//      necessary but not sufficient: the job must plainly RECUR, many times a
//      week, the same shape each time. An advertised service is never on its
//      own evidence of recurrence. The second call sees only the trade and
//      each named job with its type and its supporting quote — never the
//      first call's reasoning — and answers yes or no per job, with a reason.
//      A job failing recurrence is dropped; if all drop, Russ's trade
//      sentence stands and the reason is recorded.
//
//   3. THE CARD GETS EVERYTHING; THE EMAIL NAMES TWO (Russ's decision).
//      Every type of work that genuinely fits is found and recorded through
//      readings.record() — two, three, four, more if they honestly qualify.
//      The email names at most the TWO hardest-hitting, ranked on the
//      library's own evidence (the trade's tier pairings, the hours figures,
//      how plainly their pages show it recurring, how visibly it lands on
//      the reader) — one when the second would be filler. Four in a first
//      email reads as a scattergun; the rest are there for the call.
//
// KEPT from the first amendment (2026-09-02): what they already run is
// gathered first, never offered back, and where a system covers part of the
// week the sentence nods to it in passing and steps PAST it.
//
// AMENDED 2026-09-02 (third amendment), after two real outputs read against
// real stored pages:
//
//   OBSIDIAN REAL ESTATE: lead follow-up qualified — tier 1, recurrence
//   confirmed — and the writing step refused it because their pages show that
//   work beside a named broker rather than the principal broker the letter
//   addresses. That refusal was wrong. Work that plainly belongs to the
//   BUSINESS — enquiries arriving, scheduling, chasing, following up,
//   management, anything that comes in from outside and must be dealt with by
//   whoever is there — QUALIFIES even when a named individual appears
//   alongside it. The passage is written about the business and never names
//   that individual (checked in code: namesAPerson). A refusal is honest only
//   when the work is genuinely personal to somebody who is not the recipient
//   — one named specialist's own caseload, one person's licensed professional
//   work — and on such a refusal the reason is recorded against that area and
//   the NEXT-RANKED qualifying area is tried before falling silent. A refusal
//   on one area never ends the attempt while others stand ranked and waiting.
//
//   OSCAR'S AUTO REPAIR: four near-identical pages, each a menu and a phone
//   number. Rejecting it was right; offering "Se Habla Español" as the work
//   task was not. A language offered, an accreditation, a licence or
//   registration number, a slogan, an award, a years-in-business claim and a
//   payment method accepted are facts about the business, not work anybody
//   does in a week — never the job named (said in the find prompt, enforced
//   in code: notAJob). When a site is thin, the honest answer is silence.

const R = require('../readings.js');
const T = require('../toolLibrary.js');

const READER = 'noticing';
const READER_VERSION = '2026-09-04-noticing-4-costs-money';
const MODEL = 'haiku';

// ---------------------------------------------------------------------------
// WHO THE LETTER IS GOING TO, and how that angles the sentence.
//
// The angle changes the PROMPT, never the surface of the sentence — the
// sentence must not name the reader's job, flatter them, or read their job
// description back at them. To an owner the repetition costs money and their
// own evenings; to the person who does the office work it is their actual
// day, and the sentence must never imply they are the problem; to a
// specialist it is time taken from the work they are paid for. No job title
// on record gets the neutral version.

const AN_OWNER = /\b(owner|founder|principal|president|proprietor|partner|ceo|chief executive|general manager|managing (member|director|partner))\b/i;
const RUNS_THE_OFFICE = /\b(office manager|practice manager|operations manager|administrator|administrative|admin|coordinator|receptionist|front desk|bookkeeper|billing|scheduler|dispatcher|secretary|manager)\b/i;
const A_SPECIALIST = /\b(attorney|lawyer|paralegal|agent|broker|loan officer|officer|accountant|cpa|enrolled agent|dentist|dds|dmd|hygienist|doctor|physician|provider|dvm|veterinarian|therapist|stylist|realtor|engineer|estimator|inspector|appraiser|adjuster|technician|advis[eo]r|consultant|designer|architect|surveyor|instructor|trainer|groomer)\b/i;

function angleFor(roleTitle) {
  const t = String(roleTitle || '').trim();
  if (!t) return 'neutral';
  if (AN_OWNER.test(t)) return 'owner';
  if (RUNS_THE_OFFICE.test(t)) return 'office';
  if (A_SPECIALIST.test(t)) return 'specialist';
  return 'neutral';
}

const ANGLES = {
  owner:
    'The letter is going to the person who owns or runs this business. Angle '
    + 'the sentence at what the repeated work costs the place — money, and the '
    + "owner's own evenings. Do this inside the sentence itself, never as a "
    + 'separate clause about the reader, and never say they are the owner.',
  office:
    'The letter is going to the person who does the office work themselves, '
    + 'every day. The sentence must describe the work as their own pages show '
    + 'it, and it must never imply this person is slow or the problem — the '
    + 'work is the problem. Do this inside the sentence itself, never as a '
    + 'separate clause about the reader, and never name their job.',
  specialist:
    'The letter is going to somebody paid for skilled work. Angle the '
    + 'sentence at the time the repeated office work takes from the work they '
    + 'are paid for. Do this inside the sentence itself, never as a separate '
    + 'clause about the reader, and never name their job.',
  neutral:
    "Nothing is known about the reader's job. Write the plain version, about "
    + 'the business as a whole.',
};

// ---------------------------------------------------------------------------
// WHAT KIND OF WORK a job's words touch — used ONLY by the what-they-already-
// run check below, to catch a sentence offering a business work its own
// systems visibly cover. Qualification is NOT decided here any more: the tool
// library is the benchmark for that (2026-09-02, second amendment).
const JOB_KINDS = [
  ['scheduling', /\b(schedul\w+|reschedul\w+|appointments?|book(?:s|ed|ing|ings)?|calendars?|slots?|showings?)\b/i],
  ['chasing', /\b(chas(?:e|es|ed|ing)|remind\w+|follow[\s-]?ups?|follows? up|following up|overdue|nudg\w+|renewals?|due back|reviews? request\w*)\b/i],
  ['records', /\b(retyp\w+|re.?key\w+|typ(?:e|es|ed|ing)|data entry|enter(?:s|ed|ing)? (?:it|them|those|the same|every)|twice|two (?:places|systems)|in step|listings?|availability|inventory|spreadsheets?|price lists?)\b/i],
  ['paperwork', /\b(paperwork|forms?|claims?|intake|organizers?|signatures?|unsigned|waivers?|registrations?|certificates?|permits?|filings?)\b/i],
  ['quoting', /\b(quot(?:e|es|ed|ing)|estimates?|proposals?|invoic\w+|bill(?:s|ed|ing)?|reports?|statements?)\b/i],
  ['enquiries', /\b(calls?|phon(?:e|es|ed|ing)|voicemails?|answer(?:s|ed|ing)?|questions?|enquir\w+|inquir\w+|emails?|texts?|messages?|asking|walk[\s-]?ins?)\b/i],
];

// EVERY kind a job's words touch, not just the first. The collision check
// below needs this: "taking calls about maintenance, availability, and lease
// questions" is availability work AND call-fielding, and a portal covers the
// second — the first match alone let exactly that sentence past a portal on
// the very first live run (2026-09-02).
function kindsOf(text) {
  const t = String(text || '');
  const out = [];
  for (const [kind, re] of JOB_KINDS) if (re.test(t)) out.push(kind);
  return out;
}

// ---------------------------------------------------------------------------
// WHAT IS NEVER A JOB (2026-09-02, third amendment, after Oscar's Auto
// Repair). When a site is thin the reader grabs at whatever is distinctive —
// and offered "Se Habla Español" as the work task. A language offered, an
// accreditation, a licence or registration number, a slogan, an award, a
// years-in-business claim and a payment method accepted are facts about the
// business, not work anybody does in a week. None of them can ever be the job
// named. The find prompt says so in plain words, and this check enforces it
// on whatever comes back — on the job and on the words offered as its
// evidence. The patterns are deliberately tight: they catch the badge itself,
// never a real job whose words brush past one of these subjects.

const NEVER_A_JOB = [
  // Offering or speaking a language is a fact about the business. TRANSLATING
  // into one is real work, and is deliberately left alone.
  ['a language offered', /\b(se habla|hablamos|we speak)\b|\bespa[ñn]ol\b|\bbilingual\b|\b(?:speaks?|speaking|offer(?:s|ing)?|available|service|support|help|assistance|staff)\b[^.]{0,24}\b(?:in\s+)?spanish\b|\bspanish[- ]?(?:spoken|speaking)\b/i],
  // A BADGE IS A CLAIM ABOUT THEMSELVES, NOT A WORD THEY USED (2026-09-02).
  //
  // "certification" caught AAA Contracting, whose entire business is issuing
  // engineered foundation certifications — the word was their product, and a
  // keyword rule threw it out as a boast. So the pattern now wants the shape
  // of a claim: accredited, BBB, a certified this-or-that. Issuing, ordering
  // or delivering certifications is work, and reads as work.
  ['an accreditation', /\b(accredit\w+|better business bureau|\bbbb\b)|\b(?:we(?:'re| are)|is|are|fully|factory)\s+certified\b|\b(?:[a-z]{2,5}|factory|manufacturer|master|fully)?[- ]?certified\s+(?:dealer|installer|technician|mechanic|contractor|partner|professional|specialist|shop|staff|team|centre|center)s?\b/i],
  ['a licence or registration number', /\b(lic(?:en[cs]ed?)?|ccb|reg(?:istration)?)\b\.?\s*(?:no\.?|number|#)?\s*#?\d{3,}/i],
  ['a slogan', /\b(slogan|motto|tagline)\b/i],
  ['an award', /\b(award\w*|prize|winner|voted best|best of \w+|top[- ]rated|readers'? choice)\b/i],
  ['a years-in-business claim', /\bsince (?:19|20)\d\d\b|\b(?:over |more than )?\d+\+? years? (?:in business|of (?:experience|service)|serving)\b/i],
  ['a payment method accepted', /\b(?:we (?:accept|take)|accept(?:s|ed|ing)?|payments? (?:by|via|in))\b[^.]{0,40}\b(?:visa|mastercard|amex|american express|discover|cash|checks?|credit|debit|apple ?pay|venmo|paypal|financing)\b|\b(?:visa|mastercard|amex|american express|discover|apple ?pay|venmo|paypal)\b[^.]{0,30}\baccepted\b/i],
];

// A BADGE OFFERED AS EVIDENCE IS A FRAGMENT; A REAL PASSAGE IS A SENTENCE.
//
// The job — the reader's own statement of what the work IS — is always
// judged. The supporting quote is judged only when it is SHORT, because a
// short quote is the reader holding up the badge itself ("Se Habla Español",
// "CCB #204158", "ASE Certified technicians") while a real sentence off a
// services page is allowed to mention a licence or an award in passing.
//
// Judging every quote is what cost AAA Contracting its opening line four
// times over: their whole business is issuing engineered foundation
// certifications, and a passage describing that work was thrown out as a
// boast about the business (2026-09-02).
const A_BADGE_IS_SHORT = 70;

function notAJob(area) {
  const job = String((area && area.job) || '');
  const quote = String((area && area.quote) || '');
  const judged = quote.trim().length <= A_BADGE_IS_SHORT ? `${job} ${quote}` : job;
  for (const [what, re] of NEVER_A_JOB) if (re.test(judged)) return what;
  return null;
}

// ---------------------------------------------------------------------------
// WHOSE WORK IT IS (2026-09-02, third amendment, after Obsidian Real Estate).
// Work that belongs to the business is written about the business. A named
// person appearing beside the work on their pages does not make it that
// person's private job — rental and property-management enquiries land on the
// OFFICE, whoever heads the desk — and the passage never names that person.
// Checked in code, not hoped for. A part of a name that is also part of the
// business's own name proves nothing and is skipped; short fragments are
// skipped too, so "Al" in "all day" never fires.

function namesAPerson(sentence, people, businessName = '') {
  const s = String(sentence || '');
  const flat = normalise(s);
  const biz = normalise(businessName);
  for (const p of people || []) {
    const full = p && p.name ? String(p.name).trim() : '';
    if (!full) continue;
    if (normalise(full).length >= 4 && flat.includes(normalise(full))) return full;
    for (const part of full.split(/\s+/)) {
      if (part.length < 3) continue;
      if (biz && biz.includes(normalise(part))) continue;
      const safe = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^A-Za-z])${safe}(?=[^A-Za-z]|$)`).test(s)) return full;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// WHAT THEY ALREADY RUN (Russ, 2026-09-02). Offering a business something it
// visibly already has reads as not having looked. Each system the record or
// the site read shows is listed for the reader, and a sentence whose named
// job is work one of those systems already does is rejected — unless the
// sentence nods to the system in passing and steps PAST it to what it does
// not cover, which is the shape Russ asked for.
//
// `covers` is the kind of work the system takes off them, and only kinds a
// system genuinely covers block anything: a chat widget does not answer the
// phone, so chat blocks nothing and is merely listed so it is never offered.

const RUNS = {
  // booking and scheduling
  calendly: ['online booking', 'scheduling'],
  acuity: ['online booking', 'scheduling'],
  'square appointments': ['online booking', 'scheduling'],
  setmore: ['online booking', 'scheduling'],
  vagaro: ['online booking', 'scheduling'],
  mindbody: ['online booking', 'scheduling'],
  schedulicity: ['online booking', 'scheduling'],
  'cal.com': ['online booking', 'scheduling'],
  'hubspot meetings': ['online booking', 'scheduling'],
  zocdoc: ['online booking', 'scheduling'],
  localmed: ['online booking', 'scheduling'],
  nexhealth: ['online booking and patient reminders', 'scheduling'],
  tebra: ['practice management with online booking', 'scheduling'],
  'housecall pro': ['scheduling, dispatch and invoicing', 'scheduling'],
  servicetitan: ['scheduling, dispatch and invoicing', 'scheduling'],
  jobber: ['scheduling, dispatch and invoicing', 'scheduling'],
  workiz: ['scheduling, dispatch and invoicing', 'scheduling'],
  'service fusion': ['scheduling, dispatch and invoicing', 'scheduling'],
  // reminders, recalls and review chasing
  weave: ['phones, reminders and texts', 'chasing'],
  solutionreach: ['patient reminders', 'chasing'],
  demandforce: ['reminders and reviews', 'chasing'],
  podium: ['review requests and texting', 'chasing'],
  birdeye: ['review requests', 'chasing'],
  // listed so they are never offered back; they cover too little of any one
  // kind of work to block a sentence on their own
  intercom: ['website chat', null],
  tawk: ['website chat', null],
  drift: ['website chat', null],
  zendesk: ['website chat and support', null],
  tidio: ['website chat', null],
  livechat: ['website chat', null],
  jotform: ['online forms', null],
  'google forms': ['online forms', null],
  typeform: ['online forms', null],
  gravity: ['online forms', null],
  'contact form 7': ['online forms', null],
  shopify: ['an online store', null],
  stripe: ['online payments', null],
  'square payments': ['online payments', null],
  paypal: ['online payments', null],
  quickbooks: ['bookkeeping and invoicing', null],
  hubspot: ['a CRM', null],
  salesforce: ['a CRM', null],
  gohighlevel: ['a CRM', null],
  pipedrive: ['a CRM', null],
  zoho: ['a CRM', null],
  mailchimp: ['email campaigns', null],
  'constant contact': ['email campaigns', null],
  klaviyo: ['email campaigns', null],
  activecampaign: ['email campaigns', null],
  'google reviews widget': ['reviews shown on the site', null],
  'dentrix / henry schein': ['practice management', null],
};

// The site it is built on says nothing about the week. Running WordPress is
// not running a system.
const SAYS_NOTHING = /^(wordpress|squarespace|wix|godaddy|webflow|duda|weebly)$/i;

function runsEntry(name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k || SAYS_NOTHING.test(k)) return null;
  const hit = RUNS[k] || RUNS[Object.keys(RUNS).find((r) => k.includes(r))];
  return hit ? { name, does: hit[0], covers: hit[1] } : { name, does: null, covers: null };
}

// A portal, read off their own stored words — the system most often offered
// back to a business that already has one.
const PORTAL_WORDS = /\b((?:tenant|resident|client|customer|patient|owner|homeowner|member)s?'? ?portal)\b|\bportal\b/i;

/// Everything the record and the reading store show this business already
/// runs. Newest finding first, first verdict per name wins — a system a later
/// visit recorded gone earns no protection, and no earlier finding is touched.
async function whatTheyAlreadyRun(db, prospectId, prospect, keptPages) {
  const findings = await db.finding.findMany({
    where: {
      prospectId,
      field: { in: ['toolInUse', 'toolsInUse', 'toolGone', 'canBookOnline'] },
      retiredAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { field: true, value: true },
  });
  const verdicts = new Map();
  let booksOnline = null;
  for (const f of findings) {
    if (f.field === 'canBookOnline') {
      if (booksOnline === null && (f.value === 'yes' || f.value === 'no')) booksOnline = f.value;
      continue;
    }
    for (const name of String(f.value || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const key = name.toLowerCase();
      if (!verdicts.has(key)) verdicts.set(key, { name, runs: f.field !== 'toolGone' });
    }
  }
  // The record's fast copy joins in — it may hold what predates the store.
  for (const name of String((prospect && prospect.toolsInUse) || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const key = name.toLowerCase();
    if (!verdicts.has(key)) verdicts.set(key, { name, runs: true });
  }

  const out = [];
  for (const { name, runs } of verdicts.values()) {
    if (!runs) continue;
    const entry = runsEntry(name);
    if (entry) out.push(entry);
  }
  if (booksOnline === 'yes' && !out.some((e) => e.covers === 'scheduling')) {
    out.push({ name: 'online booking on their own site', does: 'taking bookings online', covers: 'scheduling' });
  }
  if (!out.some((e) => /portal/i.test(e.name))) {
    for (const p of keptPages || []) {
      const m = String(p.text || '').match(PORTAL_WORDS);
      if (m) {
        out.push({
          name: m[1] ? m[1].trim() : 'a portal on their site',
          does: 'a portal for routine requests and payments',
          covers: 'enquiries',
        });
        break;
      }
    }
  }
  return out;
}

// The nod that makes stepping past honest: the sentence mentions the system,
// or the kind of thing it is, on its way to what that system does not cover.
const NOD_WORDS = {
  scheduling: /\b(book(?:ing)? online|online booking|books? through|schedule online|online schedul\w+|self[\s-]?schedul\w+)\b/i,
  chasing: /\b(remind\w+ (?:go|going|already)|texts? go out|review requests? (?:go|going)|automatic remind\w+)\b/i,
  enquiries: /\b(portal|chat box|live chat|log ?in)\b/i,
};

function offersWhatTheyHave(sentence, jobs, theyRun) {
  const s = String(sentence || '');
  const texts = (jobs || []).map((j) => j && j.job).filter(Boolean);
  if (!texts.length) texts.push(s);
  for (const sys of theyRun || []) {
    if (!sys || !sys.covers) continue;
    const nodded = (sys.name && normalise(s).includes(normalise(sys.name)))
      || (NOD_WORDS[sys.covers] && NOD_WORDS[sys.covers].test(s));
    if (nodded) continue; // the go-past shape: nodded to in passing, stepped past
    for (const t of texts) {
      if (kindsOf(t).includes(sys.covers)) {
        return {
          ok: false,
          why: `offers work ${sys.name} visibly already does (${sys.does}) — never `
            + 'offer what they already have; nod to it and step past it to what it '
            + 'does not cover, or name different work',
        };
      }
    }
  }
  return { ok: true, why: null };
}

// ---------------------------------------------------------------------------
// WHAT THE SENTENCE IS ALLOWED TO SOUND LIKE.
//
// Russ's voice, enforced in code rather than hoped for: plain, concrete, no
// marketing language, no flattery, no exclamation, no rhetorical question,
// short words, a real task and not a feeling. The reader is asked for this
// and then checked — an answer that fails is rejected, and a rejection twice
// is a could_not_tell, never a shrug-and-send.

const MARKETING = /\b(leverage|leveraging|streamlines?d?|streamlining|solutions?|synerg\w*|optimi[sz]\w*|empower\w*|seamless\w*|robust|innovat\w*|cutting.edge|world.class|best.in.class|state.of.the.art|game.chang\w*|revolutioni[sz]\w*|elevate\w*|unlock\w*|supercharg\w*|transform\w*|impressive|amazing|incredible|fantastic|passionate)\b/i;

// "as the owner", "as your office manager" — a clause about who the reader
// is, which the sentence must never carry whatever the angle did to it.
const ABOUT_THE_READER = /\bas (the|an?|your) [a-z][a-z ]{0,24}\b(owner|founder|principal|president|manager|administrator|coordinator|receptionist|attorney|agent|broker|officer|accountant|dentist|doctor)\b/i;

// WHAT A COST LOOKS LIKE IN THE TEXT ITSELF.
//
// Three shapes count, and nothing else does:
//   money      — a figure, a fee, a rate, a year's worth
//   hours      — time named as time, which is billable work not done
//   a loss     — the caller who rang somebody else, the slot that stayed
//                empty, the invoice that sat, the quote that lost
//
// "It is the same handful of questions every time" is none of the three. It is
// busyness, and busyness is what a good business feels like — an owner reading
// it nods and does nothing. Russ said this in capitals on 2026-09-03 and again
// on 2026-09-07: THAT STILL DOESN'T TELL THEM WHAT THE PAIN COSTS THEM.
const NAMES_A_COST = new RegExp([
  // money
  '\\$[\\d,]+', '\\bdollars?\\b', 'five.figure', '\\ba (?:year|month|week)\\b',
  '\\bper (?:job|call|week|month|year|visit|patient|unit)\\b', '\\bfee\\b', '\\brate\\b',
  '\\bbilled?\\b', '\\bbilling\\b', '\\binvoice', '\\bpaid\\b', '\\bpaying\\b', '\\bmoney\\b', '\\brevenue\\b',
  // hours
  '\\bhours?\\b', '\\bminutes?\\b', '\\ball day\\b', '\\bthe week\\b', '\\bevenings?\\b',
  '\\ba full day\\b', '\\bhalf a day\\b',
  // SOMEBODY OR SOMETHING LOST. Kept deliberately wide, because a narrow
  // version rejected "the ones nobody gets back to have already rented
  // somewhere else" — plainly a customer lost, and a test caught it before it
  // could throw away good sentences in production (2026-09-07).
  '\\bsomewhere else\\b', '\\bsomebody else\\b', '\\bsomeone else\\b', '\\belsewhere\\b',
  '\\bthe next (?:firm|shop|one|practice|agency|caller|guy|place)\\b', '\\bdown the road\\b',
  '\\balready (?:booked|reserved|called|found|rented|hired|signed|gone|bought)\\b',
  'never (?:comes? back|hears? back|gets? read|starts?|answers?|made it|turned into|calls? back)',
  'sits? (?:empty|unpaid|open|idle|there|unrenewed|unsold)',
  '\\blose\\b', '\\blost\\b', '\\blosing\\b', '\\bgone for good\\b',
  '\\bvoicemail\\b', '\\bnot (?:earning|billable|moving|booked|filled)\\b',
  '(?:does not|doesn\'t|do not|don\'t) (?:call back|come back|book|answer|hear)',
  '\\bwent (?:to|with|somewhere|elsewhere)\\b',
  '\\b(?:books?|booked|rents?|rented|orders?|ordered|hires?|hired|goes|go|went) (?:with|to|somewhere)\\b',
].join('|'), 'i');

// Software a business runs, quoted back at a stranger in a first email. It
// reads as surveillance and it is already a standing rule for cold messages.
// Nine letters in the ready pile named one (2026-09-07).
const NAMES_THEIR_SOFTWARE = /\b(QuickBooks|Xero|Sage|FreshBooks|Salesforce|HubSpot|ServiceTitan|Jobber|Housecall|Mindbody|Shopify|Toast|Dentrix|Eaglesoft|Open ?Dental|Clio|MyCase|Yardi|AppFolio|Buildium|Procore|Mailchimp|Calendly|Acuity|Square)\b/i;

// A promise of time back does not belong in this sentence. The library's
// hours figures order the areas internally, and the one thing the library
// says about them out loud is that an unverified figure (source: null) may
// never be quoted to a client — so no figure, verified or not, is quoted here.
// WHOEVER IT IS HANDED BACK TO, IT IS STILL A PROMISE (2026-09-02).
//
// "gets you back 6 hours a week" walked straight through: the phrase needed
// the verb and "back" side by side, and the word in between let it past. Any
// of the usual objects may sit in the middle now.
const CLAIMS_HOURS = /\b(sav(?:e|es|ed|ing)|free(?:s|d)? up|get(?:s|ting)?|tak(?:e|es|en|ing)|win(?:s|ning)?|giv(?:e|es|ing)|hand(?:s|ed|ing)?|buy(?:s|ing)?)\b(?: (?:you|them|him|her|us|the team|your \w+))? back\b[^.]{0,80}?\bhours?\b|\b(sav(?:e|es|ed|ing)|free(?:s|d)? up)\b[^.]{0,80}?\bhours?\b|\bhours?\b[^.]{0,40}?\b(back|saved|freed)\b/i;

function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// WHICH RULES BELONG TO WHICH MESSAGE (2026-09-08).
//
// Two of the rules below are the FIRST message's, not every message's:
//
//   a question — banned because a question to a stranger who has never heard
//     of you reads as a trick. The day-eight message exists to ask one plain
//     question, and judging it by the first message's rule flagged the only
//     message doing exactly what it was told.
//   a cost     — required because a message that only says they are busy does
//     not sell. The day-fourteen sign-off has nothing left to sell, so it
//     carries no cost on purpose.
//
// They are options here rather than a second copy of the rules somewhere else.
// Five separate judges is what let a letter break four rules on the screen for
// days; there is one now, and it is told which message it is reading.
function passable(sentence, {
  roleTitle = null, avoid = [], jobs = [], allowQuestion = false, needsCost = true,
} = {}) {
  const s = String(sentence || '').trim();
  // Two jobs earn a little more room — two or three short sentences, never a
  // paragraph (Russ, 2026-09-02: "I don't see a reason to not say two
  // things"). One job keeps the original slot.
  const twoJobs = Array.isArray(jobs) && jobs.length >= 2;
  if (!s) return { ok: false, why: 'empty' };
  if (/\n/.test(s)) return { ok: false, why: 'more than one paragraph' };
  if (s.length < 30) return { ok: false, why: 'too short to be saying anything specific' };
  if (s.length > (twoJobs ? 400 : 280)) {
    return {
      ok: false,
      why: twoJobs
        ? 'longer than even two jobs need — two or three short sentences, never a paragraph'
        : 'longer than the slot it fills — this is one sentence, not a paragraph',
    };
  }
  if (/!/.test(s)) return { ok: false, why: 'an exclamation mark — the voice does not allow one' };
  if (!allowQuestion && /\?/.test(s)) return { ok: false, why: 'a question — the first message does not ask one' };
  if (/[—–]/.test(s)) return { ok: false, why: 'a dash — the voice rules say no dashes' };
  if (/[{}<>]/.test(s)) return { ok: false, why: 'placeholder braces' };
  // A message allowed to ask a question is allowed to end on one. Without
  // this, every day-eight message failed for ending the way it was told to
  // (2026-09-08): 59 of 60 of them, all correct.
  if (!(allowQuestion ? /[.?]$/ : /\.$/).test(s)) {
    return { ok: false, why: allowQuestion ? 'does not end with a period or a question mark' : 'does not end with a period' };
  }
  const m = s.match(MARKETING);
  if (m) return { ok: false, why: `marketing language ("${m[0]}")` };
  // STIFF IS A FAILURE, NOT A STYLE (Russ, 2026-09-01).
  //
  // The first sentence this wrote was true and grounded and read like a form:
  // "someone must manage those requests". He is offering fifteen minutes and a
  // free piece of research, and the sentence has to sound like one working
  // person recognising another's week — warm, plain, said out loud. Official
  // phrasing is caught here and sent back rather than reaching him.
  const stiff = s.match(/\b(must (?:manage|handle|be |ensure|address|coordinate)|are required to|is required to|it is necessary|necessitat\w*|ensuring|in order to|utilis\w+|utiliz\w+|personnel|individuals|entities|thereby|whereby|facilitat\w+|the aforementioned|said requests|requests are (?:handled|managed|processed)|tasks are (?:handled|managed|performed)|is responsible for|are responsible for|administrat\w+ (?:burden|overhead)|manual processes|operational efficienc\w+)\b/i);
  if (stiff) return { ok: false, why: `stiff, official phrasing ("${stiff[0]}") — say it the way you would say it out loud` };
  // One sentence, occasionally two short ones — three at most when two jobs
  // are named. Never a paragraph.
  const parts = s.slice(0, -1).split(/(?<=[.])\s+/);
  if (parts.length > (twoJobs ? 3 : 2)) {
    return { ok: false, why: twoJobs ? 'more than three sentences' : 'more than two sentences' };
  }
  // Never address someone by their job title, never a clause about the role.
  if (roleTitle) {
    const title = String(roleTitle).trim().replace(/\s+/g, ' ');
    if (title && normalise(title).length > 3 && normalise(s).includes(normalise(title))) {
      return { ok: false, why: "names the reader's job title" };
    }
  }
  if (ABOUT_THE_READER.test(s)) return { ok: false, why: 'a clause about who the reader is' };

  // THE THREE RULES THAT ACTUALLY DECIDE WHETHER HE WOULD SEND IT.
  //
  // Everything above this line is taste — length, dashes, stiffness. None of
  // it caught what Russ found by reading one letter on 2026-09-07: no cost
  // named, wording he had replaced three days earlier, and a client's own
  // software quoted back at them in a cold email. 297 of 381 letters in the
  // ready pile were wrong and every count said they were fine, because the
  // counts read the records and never opened the letter.
  //
  // A judge that does not test the thing that matters is not a judge. These
  // three send the sentence back to be written again.

  // 1. IT HAS TO SAY WHAT THE WORK COSTS. Money, hours, or a named thing lost:
  // the caller who rang somebody else, the slot that stayed empty, the invoice
  // that sat. "It is the same questions every time" is only busyness, and
  // busyness is what a good business feels like — it does not sell.
  if (needsCost && !NAMES_A_COST.test(s)) {
    return { ok: false, why: 'never says what the work COSTS them — name the money, the hours, or who went elsewhere, not the busyness' };
  }

  // 2. IT NEVER PRESUMES (Russ, 2026-09-05: "Stop making presumptions like
  // 'most'. try 'some'."). He is writing to one business, not a survey.
  const presumes = s.match(/\b(most|mostly|usually|typically|generally|always|every business|everyone)\b/i);
  if (presumes) {
    return { ok: false, why: `presumes with "${presumes[0]}" — say "some", or say nothing about what others do` };
  }

  // 3. IT NEVER NAMES THEIR OWN SOFTWARE BACK AT THEM. Reading a stranger's
  // tools off their site and quoting them in a first email reads as surveillance,
  // and it is already a standing rule for cold messages. Nine letters did it.
  const theirs = s.match(NAMES_THEIR_SOFTWARE);
  if (theirs) {
    return { ok: false, why: `names their own software ("${theirs[0]}") in a cold message — nod to what they run without naming it` };
  }

  // Two businesses in one trade never get the same sentence.
  const mine = normalise(s);
  if (avoid.some((a) => normalise(a) === mine)) {
    return { ok: false, why: 'already written to another business in this trade' };
  }
  return { ok: true, why: null };
}

// ---------------------------------------------------------------------------
// WHICH OF THEIR PAGES TO HAND THE READER.
//
// The kept words of the whole site are on file (readings.js keptWords), and
// the most useful for a first sentence are the identity, services and
// contact material — what they say they are, what they say they do, and how
// work reaches them. Team and process pages come next; everything else is a
// tiebreaker. Capped, because the reader gets a handful of calls per
// business, not a crawl.

// HOW MUCH OF THEIR SITE GOES INTO THE QUESTION.
//
// SENDING LESS DOES NOT MAKE IT FASTER. Tried and measured on 2026-09-06,
// because one letter takes about four minutes and a bigger question plainly
// took longer than a small one — a 20,797-character question answered in 132
// seconds where a 2,710-character one answered in 12.
//
// So the same business was asked twice. Cutting their pages from six to four
// and from 12,000 characters to 4,000 made the question 40% smaller and the
// answer took LONGER: 178 seconds became 281. The sentence also got vaguer,
// naming "a detail that slips" where the full read had named walking a new
// advertiser through what it costs and chasing the invoice after.
//
// The reason is that a thinner read gives the finder less to stand a job on,
// so more of its suggestions are rejected and it goes round again. The cost is
// the NUMBER of questions, not the size of them.
//
// Do not trim this to go faster. It was tried.
const PER_PAGE = 3000;
const TOTAL = 12000;
const AT_MOST = 6;

function pageScore(url) {
  let p;
  try { p = new URL(url).pathname.toLowerCase(); } catch { p = String(url || '').toLowerCase(); }
  if (p === '/' || p === '' || /^\/(index|home)(\.\w+)?\/?$/.test(p)) return 6;
  if (/about|who-we-are|our-story|our-firm|company/.test(p)) return 5;
  if (/service|practice|what-we-do|treatment|care-|offering|specialt|menu/.test(p)) return 4;
  if (/team|staff|people|meet-|attorneys|agents|providers|doctors/.test(p)) return 3;
  if (/contact|location|hours|appointment|schedul|book|get-started|new-(client|patient)|form|faq|process|how-it-works/.test(p)) return 3;
  return 1;
}

function pickPages(kept) {
  const seen = new Set();
  const withWords = [];
  for (const p of kept || []) {
    if (!p || !p.url || !p.text || !String(p.text).trim()) continue;
    if (seen.has(p.url)) continue;   // keptWords is newest first; keep the newest
    seen.add(p.url);
    withWords.push(p);
  }
  withWords.sort((a, b) => pageScore(b.url) - pageScore(a.url));
  const out = [];
  let total = 0;
  for (const p of withWords) {
    if (out.length >= AT_MOST || total >= TOTAL) break;
    const text = String(p.text).slice(0, Math.min(PER_PAGE, TOTAL - total));
    out.push({ url: p.url, title: p.title || null, text });
    total += text.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// SHARED PIECES of the prompts.

function said(v) { return v === null || v === undefined || v === '' ? 'not stated' : String(v); }

function businessBlock(e) {
  const lines = [];
  lines.push(`Business: ${said(e.name)}`);
  lines.push(`Trade: ${said(e.trade)}`);
  lines.push(`What they say they do: ${said(e.theirWork || e.selfDescription)}`);
  lines.push(`Software they run: ${said(e.toolsInUse)}`);
  lines.push(`Team size: ${said(e.teamSize)}`);
  lines.push(`Years in business: ${said(e.yearsInBusiness)}`);
  const people = (e.people || []).filter((p) => p && p.name);
  lines.push(`People on their site: ${people.length
    ? people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join('; ')
    : 'none recorded'}`);
  return lines;
}

function pagesBlock(e) {
  const lines = [];
  for (const p of e.pages || []) {
    lines.push('');
    lines.push(`[PAGE ${p.url}${p.title ? ` — ${p.title}` : ''}]`);
    lines.push(String(p.text));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// THE FIRST QUESTION: what work on their pages maps to the library.
//
// The tool library is the benchmark. The reader gets the full menu — every
// type's key, department and label — and every job it names must map to one
// of those keys. The code verifies the key; an unmapped job is rejected and
// rewritten, and a second failure means silence.

function promptToFind(evidence, rejected = null) {
  const e = evidence || {};
  const lines = [];

  lines.push(
    'A first email will be written to a small business. Before a word of it '
    + 'is written, every TYPE of work that software or AI could genuinely '
    + 'take off this business must be found — read ONLY from the pages '
    + 'below, which the business published on its own website. Your job is '
    + 'to name each such area of work, or to say none can be named.',
  );
  lines.push('');
  lines.push(...businessBlock(e));
  lines.push('');
  // START FROM THE TRADE, NOT FROM THE PAGE (Russ, 2026-09-05).
  //
  // This asked what the pages showed and checked it against the trade. A
  // website is a shop window: it says how to pay, how to book, how to get in
  // touch. So payments and booking is what kept coming back, and a business
  // with a customer portal looked like it had nothing left to fix.
  //
  // Nobody publishes the phone ringing all afternoon with the same four
  // questions, or the hour spent hunting an old file. That work has to be
  // reasoned from what the business IS. The trade suggests it, the four
  // questions below find it, and their pages rule things out and size what is
  // left.
  lines.push('WHERE THE WORK IS FOUND. Not by hunting their pages for complaints —');
  lines.push('no business publishes its dull repetitive work. Reason it out from what');
  lines.push('a business of THIS trade and THIS size actually does all week, and use');
  lines.push('their pages to rule things out and to judge scale.');
  lines.push('');
  lines.push('Four questions get you there. Answer each for this business:');
  lines.push('  1. WHAT COMES IN, AND HOW? Phone, form, email, walk-in, referral.');
  lines.push('     Anything arriving by phone or email is handled by a person by');
  lines.push('     definition — nothing catches it, nothing sorts it, nothing replies.');
  lines.push('  2. WHAT HAS TO HAPPEN BEFORE THEY GET PAID? Every step between the');
  lines.push('     work being finished and the money landing is repetitive, and it is');
  lines.push('     the part nobody enjoys.');
  lines.push('  3. WHAT DO THEY HAVE TO LOOK UP? Prices, policies, past jobs, who did');
  lines.push('     what, what was agreed. Time spent finding something already written');
  lines.push('     down is pure loss.');
  lines.push('  4. WHAT DO THEY EXPLAIN MORE THAN ONCE A DAY? The same question, the');
  lines.push('     same answer, a different person each time.');
  lines.push('');
  lines.push('WOULD THERE ACTUALLY BE AN ANSWER? Only name work that could genuinely');
  lines.push('be taken off them today: catching and answering calls, reading what');
  lines.push('arrives in documents, drafting the routine writing, searching their own');
  lines.push('files, chasing what went quiet, moving what arrives into their systems.');
  lines.push('Work that would need them to change how they operate is not a first');
  lines.push('letter.');
  lines.push('');
  lines.push('THE MENU. Every job named must still map to one of these kinds of work,');
  lines.push('which is how the answer stays connected to what can actually be');
  lines.push('recommended. Reason first from the four questions, then find the key it');
  lines.push('belongs under. A job that fits none of them does not qualify.');
  for (const [key, t] of Object.entries(T.TYPES)) {
    lines.push(`- ${key} (${t.department}): ${t.label}`);
  }
  lines.push('');
  lines.push('Find EVERY type of work on that menu that a business like THIS one');
  lines.push('plainly does, judging from their own pages. One, two, three, four or');
  lines.push('more, if they honestly qualify — never one more for the sake of it.');
  lines.push('');
  // WHAT THEIR TOOLS ALREADY COVER, SAID HERE AND NOT ONLY AT THE END
  // (Russ, 2026-09-04: "if they have a portal we don't find the two next best
  // solutions?").
  //
  // Only the writing step used to know. So for a business with a customer
  // portal the finder kept naming portal-shaped work — enquiries, messages,
  // payments — every pairing was refused for offering what they already have,
  // and four businesses ended up with the generic trade line. Their portal
  // became a reason not to write to them.
  //
  // Named here, the same fact does the opposite: it points at the work the
  // portal does not touch, which is the sharper letter.
  const running = (e.theyRun || []).filter((x) => x && x.covers);
  if (running.length) {
    lines.push('WHAT THEY ALREADY RUN. Their pages show these systems in place:');
    for (const sys of running) lines.push(`- ${sys.name}: ${sys.does}`);
    lines.push('');
    lines.push('Do NOT name work those systems plainly already handle. Look PAST them.');
    lines.push('A portal takes routine requests and payments; it does not chase the');
    lines.push('client who never logs in, it does not answer the phone, it does not');
    lines.push('follow up a quote that went quiet, and it does not put anything into');
    lines.push('their books. Find the work left OUTSIDE what they run — that is the');
    lines.push('work worth naming, and there is nearly always some.');
  }
  lines.push('');
  lines.push('READ FOR MEANING, NOT FOR WORDING. Their pages will not announce their');
  lines.push('office work. Nobody writes "we chase a lot of paperwork". You are');
  lines.push('inferring, from what they sell, who they serve, how big they are, how');
  lines.push('work reaches them and what they ask people to do, what a week there');
  lines.push('actually contains. A dental practice with a new-patient form is');
  lines.push('re-typing that form. A shop with an appointment line is booking and');
  lines.push('rebooking all week. That is the reasoning wanted here.');
  lines.push('');
  lines.push('A customer being on the phone does NOT disqualify a job. Repeated calls');
  lines.push('are one of the biggest things software takes: phone_answering,');
  lines.push('call_notes_and_follow_up and knowledge_lookup are all on the menu. What');
  lines.push('disqualifies is a one-off interaction that does not repeat, and a person');
  lines.push('physically handling an object. No software packs a box, welds a bracket');
  lines.push('or mows a lawn, and no software makes the judgment call that needs their');
  lines.push('licence — but the paperwork, the calls, the reminders and the forms');
  lines.push('AROUND that work are exactly what the menu holds.');
  lines.push('');
  lines.push('A services menu says what they will do for a customer, not where their');
  lines.push('week goes. Prefer work their pages show actually happening — hours,');
  lines.push('volume, locations, staff, seasons, forms, FAQs, "call us" — over a line');
  lines.push('in a list of services.');
  lines.push('');
  lines.push('WHAT IS NEVER A JOB. A language offered ("Se Habla Español"), an');
  lines.push('accreditation, a licence or registration number, a slogan, an award, a');
  lines.push('years-in-business claim and a payment method accepted are facts about');
  lines.push('the business, not work anybody does in a week. None of them can ever be');
  lines.push('the job named, however little else the site gives you to work with.');
  lines.push('When a site is thin, the honest answer is cannotTell.');
  lines.push('');
  lines.push('Never invent, never assume. Every quote must appear on the pages, word');
  lines.push('for word.');
  if (rejected) {
    lines.push('');
    lines.push(`Your previous answer was rejected. It gave ${rejected.what}. The problem: ${rejected.why}. Answer again, or say cannotTell.`);
  }
  lines.push('');
  lines.push('Their own pages:');
  lines.push(...pagesBlock(e));
  lines.push('');
  // ANSWER THE FOUR FIRST, THEN NAME THE WORK (Russ, 2026-09-05: "answer first
  // then find solutions, again, why would you do otherwise?").
  //
  // With the four questions as background reading it still named the obvious
  // pair off the page and only reached further when refused. Making them a
  // required part of the answer forces the reasoning to happen before anything
  // is named, so what comes back is the unseen work rather than the shop
  // window with a fallback.
  //
  // AND NO BUSINESS HAS NOTHING. A firm whose whole promise is that the owner
  // answers every call personally is not a firm with nothing to take off it —
  // that promise makes him the bottleneck for showings, follow-ups, chasing
  // paperwork and writing up what was said. Refusing means the looking was too
  // shallow, never that the work is absent.
  lines.push('ANSWER THE FOUR QUESTIONS FIRST, IN WRITING, then name the work. The');
  lines.push('answers are part of your reply. Naming jobs before answering them is');
  lines.push('how the obvious page-visible pair gets picked every time.');
  lines.push('');
  lines.push('EVERY BUSINESS HAS SOMETHING. If the obvious jobs are covered by what');
  lines.push('they run, that is not an answer — it means looking harder. A firm whose');
  lines.push('selling point is that the owner personally handles everything has MORE');
  lines.push('to take off it, not less: that promise makes one person the bottleneck');
  lines.push('for every follow-up, every chase, every write-up. Say cannotTell only');
  lines.push('when their pages leave you unable to tell what the business even does.');
  lines.push('');
  lines.push('Answer with JSON only, one of:');
  lines.push('{"whatComesIn":"how work reaches them, in one line","beforeTheyGetPaid":"what has to happen, in one line","whatTheyLookUp":"what gets hunted for, in one line","explainedDaily":"what gets said again and again, in one line",'
    + '"areas":[{"job":"the work in a few plain words","type":"a type key from the menu, exactly as written","restsOn":"the url of the page this rests on","quote":"the words on that page that led you to it"}]}');
  lines.push('{"cannotTell":"why, in one short sentence"}');
  lines.push('EVERY AREA NAMES THE PAGE IT RESTS ON. The quote need NOT be word for');
  lines.push('word — their pages will not say "we answer the phone all day". Quote what');
  lines.push('led you there and name the page, and that is footing enough. What is not');
  lines.push('allowed is a job resting on no page of theirs at all.');
  lines.push('When nothing on their pages honestly maps to the menu, answer cannotTell. Silence beats a wrong guess.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// THE SECOND QUESTION: does each job actually recur in a business like this.
//
// A separate call, on purpose — it sees only the trade and each job with its
// type and quote, never the first call's reasoning, so it judges the work and
// not the argument.
//
// IT IS ASKED TO REASON, NOT TO FIND A NUMBER (Russ, 2026-09-02).
//
// This once demanded the page show recurrence in its own words, and rejected
// "answering incoming calls" at an auto shop because the site did not state a
// frequency. No small business writes "we take forty calls a week". Asking for
// a stated number is keyword matching in a different coat, and it threw away
// four of six good businesses in one run.
//
// Almost everything here is INFERRED. An auto shop listing loaner cars, an
// intake form and a phone number answers the phone all day — that is known
// from the trade and the shape of the business, not from a sentence on the
// page. The question is what a week at THIS business plainly looks like.

function promptForRecurrence(trade, areas, note = null) {
  const lines = [];
  lines.push(
    'Below are jobs read off the website of one small business. '
    + `The business's trade: ${said(trade)}.`,
  );
  lines.push('');
  lines.push('For each job, answer one question: in a business of this kind and this');
  lines.push('size, does this job happen OVER AND OVER — many times a week, the same');
  lines.push('shape each time?');
  lines.push('');
  lines.push('JUDGE THE WORK, NOT THE WORDING. You are not looking for the page to');
  lines.push('state a frequency. It never will. No small business writes "we take');
  lines.push('forty calls a week". Reason from what the quoted words tell you about');
  lines.push('the business — its trade, what it sells, who it serves, how work');
  lines.push('reaches it — and say what a week there plainly looks like.');
  lines.push('');
  lines.push('So: an auto shop that offers loaner cars and an intake form is');
  lines.push('answering the phone and booking cars in all day. YES. A garden centre');
  lines.push('open six days with an appointment line is taking booking calls all');
  lines.push('week. YES. A property manager with two hundred units is fielding');
  lines.push('tenant questions constantly. YES.');
  lines.push('');
  lines.push('Answer NO when the work genuinely is not frequent for a business like');
  lines.push('this: a monthly newsletter, an annual filing, a once-a-year renewal, a');
  lines.push('service so specialised or so rarely asked for that it cannot be filling');
  lines.push('their week. NO also when the job is a one-off shaped entirely by the');
  lines.push('customer in front of them, with nothing repeating around it.');
  lines.push('');
  lines.push('The jobs:');
  (areas || []).forEach((x, i) => {
    lines.push(`${i + 1}. ${x.job} (kind of work: ${x.label || x.type}) — their words: "${x.quote}"`);
  });
  if (note) {
    lines.push('');
    lines.push(`Your previous answer could not be used: ${note}.`);
  }
  lines.push('');
  lines.push('Answer with JSON only:');
  lines.push('{"verdicts":[{"recurs":"yes" or "no","why":"one short reason","plainly":0.0-1.0}]}');
  lines.push('One verdict per job, in the same order as the jobs above. "plainly" is');
  lines.push('how sure you are that a week at this business is full of this job.');
  lines.push('Say no when the work truly is not frequent here. Do NOT say no merely');
  lines.push('because the page did not state a number — it never states a number.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// THE RANKING — in code, on the library's own evidence, never on a model's
// mood (Russ: "The two have to be the HARDEST hitting").
//
//   1. The tier of the pairing between this TRADE and this type. The library
//      defines tiers (1 no-brainer for this trade, 2 probably helpful, 3
//      investigate before recommending) and hangs them off the per-trade
//      pairings; BY_TRADE holds those pairings strongest first, so the front
//      of a trade's list is its no-brainer pair, the back of the list its
//      probably-helpful pair, and a type not on the trade's list at all is
//      investigate-first. A tier-1 pairing beats a tier-2, always; "a
//      marginally better tier" means a better position INSIDE a tier, and
//      there recurrence evidence outranks position.
//   2. The hours figure the library carries for tools of the type. A figure
//      with source: null is unverified and MAY NOT be quoted to a client —
//      it orders things internally and never reaches the letter.
//   3. How plainly this business's own pages showed the job recurring — the
//      recurrence check's own number.
//   4. How visibly the work lands on the person reading, from the same role
//      angle the prompt uses: the office person feels the admin day, the
//      owner feels money and evenings, the specialist feels time taken from
//      the work they are paid for.

function tierFor(trade, type) {
  const list = T.BY_TRADE[String(trade || 'other').toLowerCase()] || T.BY_TRADE.other;
  const at = list.indexOf(type);
  if (at === -1) return { tier: 3, at: null };
  return { tier: at < 2 ? 1 : 2, at };
}

function hoursFor(type) {
  let hours = null; let verified = false;
  for (const p of T.platformsFor(type)) {
    if (p.saves === null || p.saves === undefined) continue;
    if (hours === null || p.saves > hours) { hours = p.saves; verified = Boolean(p.source); }
  }
  return { hours, verified };
}

// Which departments' work each reader feels directly — drawn from the same
// reasoning as ANGLES above, never from a model call.
const VISIBLE_TO = {
  owner: { finance: 2, sales: 2, operations: 1, marketing: 1, admin: 1 },
  office: { admin: 2, operations: 1, finance: 1, sales: 0, marketing: 0 },
  specialist: { admin: 2, operations: 2, finance: 1, sales: 1, marketing: 0 },
  neutral: { admin: 1, operations: 1, finance: 1, sales: 1, marketing: 1 },
};

function rankAreas(qualifying, { trade, angle = 'neutral' } = {}) {
  const seen = VISIBLE_TO[angle] || VISIBLE_TO.neutral;
  for (const x of qualifying) {
    const { tier, at } = tierFor(trade, x.type);
    const { hours, verified } = hoursFor(x.type);
    x.tier = tier;
    x.at = at;
    x.hours = hours;
    x.hoursVerified = hours === null ? null : verified;
    // "plainly" was the recurrence check's own answer; when it gave none, a
    // neutral 0.5 orders things internally and NOTHING is recorded in its
    // place — the record keeps exactly what the check said (absence is data).
    const plainly = x.plainly === null || x.plainly === undefined ? 0.5 : Number(x.plainly);
    x.score = (hours || 0) * 0.5 + plainly * 4 + (seen[x.department] || 0);
  }
  const ranked = [...qualifying].sort((a, b) => (a.tier - b.tier)
    || (b.score - a.score)
    || ((a.at === null ? 9 : a.at) - (b.at === null ? 9 : b.at)));
  ranked.forEach((x, i) => {
    x.rank = i + 1;
    const bits = [];
    bits.push(x.tier === 1 ? `tier 1 for ${trade || 'this trade'}: a no-brainer pairing in the library`
      : x.tier === 2 ? `tier 2 for ${trade || 'this trade'}: probably helpful, per the library`
        : `tier 3: not among the library's pairings for ${trade || 'this trade'}, investigate before recommending`);
    if (x.hours !== null && x.hours !== undefined) {
      bits.push(x.hoursVerified
        ? `the library documents ${x.hours} hours a week for tools of this type`
        : `the library carries an unverified ${x.hours} hours a week for this type (ordering only, never quoted)`);
    }
    if (x.plainly !== null && x.plainly !== undefined) {
      bits.push(`their own pages show it recurring ${x.plainly >= 0.7 ? 'plainly' : x.plainly >= 0.4 ? 'fairly plainly' : 'thinly'}`);
    }
    if ((seen[x.department] || 0) >= 2) bits.push('work the reader feels directly');
    x.rankWhy = bits.join('; ');
  });
  return ranked;
}

// A weak second drags the strong first down (Russ: never two for the sake of
// two). The second stands only when it hits nearly as hard as the first.
// A SECOND THAT WOULD BE A GUESS. Not "weaker than the first" — weaker is
// fine and normal, a second job rarely hits as hard as the first. This is only
// about whether their own pages show it happening at all.
function barelyThere(second) {
  const p = second.plainly === null || second.plainly === undefined ? 0.5 : Number(second.plainly);
  return p < 0.2;
}

function materiallyWeaker(second, first) {
  const p = (a) => (a.plainly === null || a.plainly === undefined ? 0.5 : Number(a.plainly));
  if (second.tier - first.tier >= 2) return true;         // a no-brainer next to an investigate-first
  if (second.tier > first.tier && p(second) < 0.5) return true; // worse tier and thinner evidence: filler
  if (p(second) < 0.35) return true;                      // recurrence barely shown at all
  return false;
}

// The two hardest-hitting, or one when the second would be filler. Never two
// of the same type — the strongest, then the strongest of a DIFFERENT type,
// preferring a different department when that costs no tier. A tier-3 area
// almost never reaches the email: only as the sole qualifier, never as the
// second, never paired.
function chooseForEmail(ranked) {
  const strong = ranked.filter((x) => x.tier < 3);
  const first = strong[0] || ranked[0];
  const rest = ranked.filter((x) => x !== first && x.type !== first.type && x.tier < 3);
  let second = null;
  if (rest.length) {
    const top = rest[0];
    const otherDept = rest.find((x) => x.tier === top.tier && x.department !== first.department);
    second = (top.department === first.department && otherDept) ? otherDept : top;
  }

  // TWO, AS INSTRUCTED (Russ, 2026-08-27, again 2026-09-04 in capitals).
  //
  // The letter names TWO pieces of repetitive work. That has been the
  // instruction since the beginning and this function quietly dropped to one
  // whenever the second looked weaker, or whenever nothing of a different KIND
  // turned up in the top tiers. Checked on five businesses: three named one job
  // — a three-person garage, a twelve-person law firm and an architect, all of
  // which plainly have a second (parts ordering, calendar management, permit
  // drawings). It was the rule below discarding them, not the sites lacking one.
  //
  // So a second of a different kind is taken wherever one exists, weaker or not.
  // Only two things still yield one job: their pages genuinely show nothing
  // else, or the second is so thinly evidenced that naming it would be a guess.
  if (!second) {
    const anyOther = ranked.filter((x) => x !== first && x.type !== first.type);
    if (anyOther.length) [second] = anyOther;
  }
  if (second && barelyThere(second)) {
    const why = `"${first.job}" ranked first (${first.rankWhy}). The only other kind of work on `
      + `their pages, "${second.job}", is barely evidenced (${second.rankWhy}) and naming it `
      + 'would be a guess, so the email names one.';
    return { chosen: [first], why };
  }
  if (!second) {
    const why = `"${first.job}" ranked first (${first.rankWhy}); their pages show no second kind `
      + 'of repetitive work at all, so the email names one.';
    return { chosen: [first], why };
  }
  // WHICH FOOTING THE PAIR ENDED ON (Russ, 2026-09-04: lean on the rating, fall
  // back to probably-helpful). The library rates each pairing of a trade and a
  // kind of work: 1 is a no-brainer, 2 probably helpful, 3 investigate first.
  // Both jobs on rating 1 means Russ picks up the phone already knowing what he
  // would say. A 2 in the pair is worth naming and worth knowing about first.
  const footing = Math.max(first.tier || 3, second.tier || 3);
  const why = `"${first.job}" ranked first (${first.rankWhy}). "${second.job}" is the strongest `
    + `of a different kind of work (${second.rankWhy}). `
    + (footing === 1
      ? 'Both are no-brainer pairings in the library, so there is a strong answer ready for either.'
      : footing === 2
        ? 'One of the two is only probably-helpful in the library, so the answer to that half needs a look before the call.'
        : 'At least one of these is investigate-first in the library — worth raising, but there is no ready answer for it yet.');
  return { chosen: [first, second], why, footing };
}

// ---------------------------------------------------------------------------
// THE THIRD QUESTION: the sentence itself, naming exactly the chosen work.

function promptToWrite(evidence, chosen, roleTitle = null, avoid = [], rejected = null) {
  const e = evidence || {};
  const C = require('./campaign.js');
  const t = C.tradeCopy(e.trade);
  const jobs = chosen || [];
  const two = jobs.length >= 2;
  const lines = [];

  lines.push(
    'A first email is being written to a small business. ONE short passage '
    + 'of it must name, warmly and plainly, the work listed below — which was '
    + "read off the business's own pages and checked. Your job is to write "
    + 'that passage, or to say it cannot be written.',
  );
  lines.push('');

  lines.push(...businessBlock(e));
  lines.push('');
  lines.push(roleTitle
    ? `The letter is addressed to a person whose job title is "${roleTitle}".`
    : 'The letter is addressed to nobody in particular.');
  lines.push(ANGLES[angleFor(roleTitle)]);
  lines.push('');
  lines.push('WHO IS WRITING. Russ ran offices like theirs before he did this. He is');
  lines.push('offering fifteen minutes and a piece of research, free, with nothing to sign.');
  lines.push('So the sentence sounds like one working person recognising another working');
  lines.push('person\'s week. Warm, easy, sure of itself. Not a consultant\'s observation and');
  lines.push('not a report.');
  lines.push('');
  lines.push(two
    ? 'THE WORK TO NAME. Exactly these two jobs, strongest first, and nothing else:'
    : 'THE WORK TO NAME. Exactly this one job, and nothing else:');
  for (const j of jobs) {
    lines.push(`- ${j.job}${j.label ? ` (${j.label})` : ''}. Their own words: "${j.quote}"`);
  }
  lines.push(two
    ? 'They are genuinely different kinds of work and the passage must keep them that way. Never add a third.'
    : 'Never add a second job of your own.');
  lines.push('');
  lines.push('WHOSE WORK IT IS. Work that plainly belongs to the BUSINESS — enquiries');
  lines.push('arriving, scheduling, chasing, following up, management, anything that');
  lines.push('comes in from outside and must be dealt with by whoever is there —');
  lines.push('qualifies even when a named person appears beside it on their pages. A');
  lines.push("named person standing next to the work does not make it that person's");
  lines.push('private job. Write it about the business, and never name that person in');
  lines.push('the passage. Say cannotTell only when the work is genuinely personal to');
  lines.push('one specific person who is NOT the recipient — one named specialist\'s');
  lines.push("own caseload, one person's licensed professional work, a role the");
  lines.push('recipient plainly has nothing to do with — and it would read as wrong');
  lines.push('said to the recipient.');
  lines.push('');
  lines.push('IT MUST NAME THE PROBLEM, NOT JUST THE WORK (Russ, 2026-09-03).');
  lines.push('');
  lines.push('The sentence that follows this one says "some already have that one');
  lines.push('solved". If all you did was describe what they do, that line points at a');
  lines.push('problem nobody ever named, and the whole message falls apart. Describing');
  lines.push('their work back to them tells them nothing they do not know.');
  lines.push('');
  lines.push('NEVER NAME THEIR CRAFT (Russ, 2026-09-04, reading three drafts as the');
  lines.push('person who would receive them).');
  lines.push('');
  lines.push('A draft told an attorney that answering his clients\' questions was costing');
  lines.push('him drafting time. Another told a broker that surfacing off-market deals and');
  lines.push('walking clients through closing was eating her week. Both are the work those');
  lines.push('people are proud of and paid for. Telling a professional their expertise is');
  lines.push('a cost loses them at the first line.');
  lines.push('');
  lines.push('So name the ADMIN AROUND the craft, never the craft. An attorney does not');
  lines.push('want help counselling clients; he wants the intake questions written down,');
  lines.push('the engagement letter out, the signature chased, the calendar handled. A');
  lines.push('broker does not want help finding deals; she wants showings booked and');
  lines.push('closing documents collected. Sell the hour back, never the judgement.');
  lines.push('');
  lines.push('GIVE THEM CREDIT FOR WHAT THEY HAVE ALREADY SOLVED. Where their pages show');
  lines.push('a tool already doing one of these jobs — an online booking widget, a client');
  lines.push('portal, online payments — say so plainly before naming what is left: "You');
  lines.push('have got online booking sorted." It proves the letter was written after');
  lines.push('looking, and it draws the connection to what still is not handled. Never');
  lines.push('then name that solved job as a problem.');
  lines.push('');
  lines.push('TWO JOBS MEANS TWO DIFFERENT COSTS. Where two are named, each carries its');
  lines.push('own consequence and they must not be the same one twice. An hour billed at');
  lines.push('the wrong rate is not the same as cash sitting still; a customer who went');
  lines.push('elsewhere is not the same as a bay not earning. Two endings that both say');
  lines.push('"they go somewhere else" reads as one point padded out.');
  lines.push('');
  lines.push('AND IT MUST READ AS ONE THING A PERSON SAID. Not two findings stapled');
  lines.push('together. One short paragraph, spoken aloud across a counter, where the');
  lines.push('second job follows the first the way a person adds "and then there is...".');
  lines.push('');
  lines.push('NEVER OPEN BY LISTING WHAT THEY DO. "You are drafting business law, real');
  lines.push('estate, and estate planning" tells an attorney nothing he does not know and');
  lines.push('spends the only line that had his attention. Their services list is not a');
  lines.push('finding. Open on the work that repeats.');
  lines.push('');
  lines.push('THE TWO ENDINGS MUST NOT BE THE SAME ENDING. If both halves finish on');
  lines.push('somebody going elsewhere, that is one point said twice and the second half');
  lines.push('is padding. Give the second a different consequence: time billed at the');
  lines.push('wrong rate, money landing late, a bay not earning, a slot that stays empty.');
  lines.push('');
  lines.push('SOME, NEVER MOST (Russ, 2026-09-04). No claim about how many businesses do');
  lines.push('anything. "Some" where a share is unavoidable, and nothing stronger. That');
  lines.push('bans "most", and it equally bans "mostly" and "usually" doing the same job');
  lines.push('in disguise: "the ones who cannot reach you mostly call someone else" is the');
  lines.push('same invented share wearing a different word.');
  lines.push('');
  lines.push('THE COST IS MONEY, NOT BUSYNESS (Russ, 2026-09-04). An earlier version');
  lines.push('of this instruction said "never a number" and called the cost "it eats');
  lines.push('the day". Every letter then told a business owner they were busy, which');
  lines.push('is something they already know and do not mind. Being busy is what a');
  lines.push('good business feels like. It is not a problem and it does not sell.');
  lines.push('');
  lines.push('So the passage ends on what the work COSTS THEM, in money or in a');
  lines.push('customer lost. Every hour on repetitive work is an hour of billable,');
  lines.push('sellable or renewable work not done, plus the person who went elsewhere');
  lines.push('while nobody could get to them. Name that, not the tiredness.');
  lines.push('');
  lines.push('  NOT: "...and it is the same handful of questions every time."');
  lines.push('       That is only busyness.');
  lines.push('  YES: "...and the ones who call while the front desk is with a patient');
  lines.push('       mostly do not call back."');
  lines.push('       That is a customer who did not become a customer.');
  lines.push('');
  lines.push('A NUMBER IS ALLOWED, AND WANTED, on two strict conditions.');
  lines.push('  1. It must be arithmetic anyone could check, never a claim about');
  lines.push('     this business. "A plan at about $350 a year, five a month, is');
  lines.push('     $21,000" is arithmetic. "You are losing $21,000" is a claim, and');
  lines.push('     it is forbidden.');
  lines.push('  2. Its basis must be either a price stated on their OWN pages, which');
  lines.push('     always wins, or an openly published rate for their trade. Where');
  lines.push('     an example figure is used, the sentence must read as an example.');
  lines.push('');
  lines.push('NEVER invent an industry fact to lean on. "The quote that goes out');
  lines.push('first usually wins" is a sales maxim, not something read anywhere, and');
  lines.push('it is exactly the kind of sentence that must not appear. If no honest');
  lines.push('number is available, name the thing itself that was lost: the empty');
  lines.push('appointment slot, the unit standing vacant, the order placed');
  lines.push('elsewhere. A named loss with no figure beats a figure with no basis.');
  lines.push('');
  lines.push('Never a promise and never a scolding. If a reader could finish the');
  lines.push('passage with "yes, and?", it is not done.');
  lines.push('');
  lines.push('How the passage must read:');
  lines.push('- Say it the way you would say it out loud to them, across a counter.');
  lines.push('- Plain, short, everyday words. It names a real job somebody actually does.');
  lines.push('- Where it is true, put it on THEM: "that comes back to you", "somebody has');
  lines.push('  to", "you are the one who". A named person doing a real task beats a');
  lines.push('  described process every time.');
  lines.push('- One job: one sentence, two short ones at the very most. Two jobs: two or');
  lines.push('  three short sentences. Never a paragraph, never a list.');
  lines.push('- No marketing words: never "leverage", "streamline", "solutions", "optimize", "seamless". No flattery of any kind. No exclamation mark. No question. No dashes.');
  lines.push('- Nothing stiff or official. Never "must manage", "are required to", "it is');
  lines.push('  necessary to", "ensuring", "in order to", "utilise", "individuals",');
  lines.push('  "personnel", "requests are handled". If it reads like a form, rewrite it.');
  lines.push('- Never name or address the reader\'s job title, and never add a clause about who the reader is.');
  lines.push('- Say only what their own pages support. Inference is not invention:');
  lines.push('  what a business like this plainly does is fair, and their pages need');
  lines.push('  not announce it. What is forbidden is a claim their pages contradict,');
  lines.push('  or one that would be equally true of any business anywhere.');
  lines.push('- The passage must be wrong for the shop down the road: it is about THIS business alone.');
  lines.push('- Never promise or count hours saved, and never name a time or money figure their own pages do not carry.');
  lines.push('- Never scold, never imply they are behind, never suggest they are doing it');
  lines.push('  wrong. It is a fact about their week, said kindly, not a criticism.');
  lines.push('');
  const runs = (Array.isArray(e.theyRun) ? e.theyRun : []).filter((r) => r && r.name);
  if (runs.length) {
    lines.push('WHAT THEY ALREADY VISIBLY RUN, from their own record and pages:');
    for (const r of runs) lines.push(`- ${r.name}${r.does ? ` (${r.does})` : ''}`);
    lines.push('Never offer them anything on that list, and never name as the job work one');
    lines.push('of those systems already does — offering what they already have reads as');
    lines.push('not having looked. Where one of them covers part of the week, you may nod');
    lines.push('to it in passing and step PAST it to what it does not cover. The shape,');
    lines.push('never your words: "When someone calls about a unit, you\'ve got the portal');
    lines.push('for that. It\'s the ones asking whether you\'ve got anything in Redmond');
    lines.push('under $1,800 that still land on you." That nod counts as the first of two');
    lines.push('jobs, never a third thing.');
  } else {
    lines.push('Nothing they already run shows on their record or their pages, so do not mention or invent any system.');
  }
  lines.push('');
  lines.push(`For register only, this is the trade sentence yours would replace: "${t.week}" Yours is about THIS business alone.`);
  lines.push(`In the letter your passage is immediately followed by: "${C.ALREADY_HANDLED[0].replace('{they}', t.they)}" So it must name work that reads naturally before that line.`);
  if (avoid && avoid.length) {
    lines.push('');
    lines.push('Sentences already written to other businesses in this trade. Yours must not repeat any of them, in words or in substance:');
    for (const a of avoid.slice(0, 12)) lines.push(`- "${a}"`);
  }
  if (rejected) {
    lines.push('');
    lines.push(`Your previous answer was rejected. It said: "${rejected.sentence}". The problem: ${rejected.why}. Answer again, saying the same work a different way, or say cannotTell.`);
  }
  lines.push('');
  lines.push('Their own pages, for context only — the work to name is fixed above:');
  lines.push(...pagesBlock(e));
  lines.push('');
  lines.push('Answer with JSON only, one of:');
  lines.push('{"sentence":"...","sure":0.0-1.0}');
  lines.push('{"cannotTell":"why, in one short sentence"}');
  lines.push('When in doubt, answer cannotTell. Silence beats a wrong guess.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// GROUNDING. An area stands only on words actually held in the store. The
// reader hands back the words it rested on, and those words are looked for in
// the pages it was given — not trusted on its say-so.

// WHAT GROUNDS A PASSAGE (rewritten 2026-09-02, Russ: "everything is inferred").
//
// This demanded the quoted words appear CHARACTER FOR CHARACTER on a stored
// page. That is keyword matching wearing a different coat, and it threw away
// six good businesses in one run — "answering incoming phone calls",
// "processing rental applications", "billing customers" — all plainly true of
// those businesses, all rejected because the exact string was not on the page.
//
// Grounding is still real: the passage must rest on a page of THEIR site that
// we actually hold, so nothing is written about a business we have not read.
// What it no longer requires is that they said it in those words. Almost
// nothing here is stated outright; it is inferred from what they sell, who
// they serve and how work reaches them.
//
// Three ways a passage can be grounded, best first, and WHICH ONE is recorded
// so a reader can always see how firm the footing was:
//   verbatim  — their own words, found on the page
//   echoed    — most of the distinctive words are there, in different order
//   read from — the page is one of theirs and it is what the reading rested on
//
// Only a quote pointing at NO page of theirs is refused, because that is the
// one case that means the passage came from nowhere.

function groundingPage(quote, pages, url = null) {
  const q = normalise(quote);
  const all = pages || [];
  if (!all.length) return null;

  // 1. Their own words, exactly.
  if (q && q.length >= 12) {
    const exact = all.find((p) => normalise(p.text).includes(q));
    if (exact) return { ...exact, footing: 'verbatim' };
  }

  // 2. The substance of it — most of the distinctive words on one page. Short
  //    and common words are ignored; it is the uncommon ones that tie a
  //    sentence to a page.
  const words = q.split(' ').filter((w) => w.length > 4);
  if (words.length >= 3) {
    for (const p of all) {
      const t = normalise(p.text);
      const hits = words.filter((w) => t.includes(w)).length;
      if (hits / words.length >= 0.6) return { ...p, footing: 'echoed' };
    }
  }

  // 3. It named a page of theirs and that page is one we hold. The passage was
  //    read FROM their site even if they never put it in those words.
  if (url) {
    const named = all.find((p) => p.url === url)
      || all.find((p) => String(p.url || '').includes(String(url).replace(/^https?:\/\//, '').split('/')[0]));
    if (named) return { ...named, footing: 'read from' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// ASK, CHECK, AND EITHER STAND OR STAY SILENT.
//
// Three calls, in order, all through the local reader handed in:
//   FIND    every area of work that maps to the library, each with the exact
//           words behind it (one retry naming what was wrong, then silence)
//   RECUR   the separate recurrence test, per area, blind to the first
//           call's reasoning
//   WRITE   the passage naming the chosen one or two, in Russ's voice,
//           checked in code (one retry, then silence)
//
// Whatever happens after FIND, the areas found — with their verdicts, ranks
// and choices — travel out on the result so they can be recorded and shown.

// A CEILING ON HOW MANY TIMES ONE BUSINESS MAY BE ASKED (2026-09-02).
//
// Three stages, each retrying, and the writing stage walking every pairing of
// areas in turn — one stubborn business could reach two dozen rounds. At about
// twelve seconds each that is five minutes for ONE business, and it is why six
// took a quarter of an hour. The stages are all still there; the business just
// cannot cost more than this many rounds in total. Running out is a real
// answer — Russ's trade sentence stands and the reason is recorded.
//
// RAISED FROM EIGHT TO SIXTEEN (2026-09-02). Eight was set before every area
// got its turn below, and it was too small for the rule it now has to serve:
// finding (2) plus the recurrence check (2) plus four pairings at two goes
// each is twelve, and eight cut the walk off after the second area. Sixteen
// buys the whole walk with headroom. Almost every business finishes in three
// or four; the ceiling only bites on the stubborn ones.
const MOST_ROUNDS_PER_BUSINESS = 16;

// AND A CEILING ON HOW MANY AREAS ARE WALKED. Every qualifying area gets its
// turn, but a business that found a dozen does not get a dozen goes — the
// ranking put the hardest-hitting first, and by the fifth pairing the work
// being offered is no longer the work worth opening on.
// How many pairs of jobs get tried before giving up. Raised from four on
// 2026-09-04: a business whose portal covers its obvious work burned all four
// on refusals and never reached the work the portal does not touch.
const MOST_PAIRINGS_TRIED = 6;

// AND HOW MANY TIMES THE READER MAY STUMBLE at one stage before we stop
// asking. A stumble is a reply that could not be read at all — prose where
// JSON was asked for, an answer cut off part way. It is the reader tripping,
// not the business having nothing to say, so it does not spend one of the
// tries this business gets to be understood. The overall round ceiling above
// still holds, so a reader stumbling forever cannot run away with the night.
const MOST_STUMBLES = 2;

// TWO MODELS, ONE JOB EACH (Russ, 2026-09-04).
//
// Finding the work on a page and judging whether it recurs is fact work, and
// the cheap fast model does it well. Writing the sentence a stranger reads is
// not fact work, and under fifteen accumulated rules that model started
// dropping words: "Then payment for no-shows, and the hours get lost" went out
// as a finished sentence.
//
// So the writing step gets the better model where one is handed in. Both run
// through the Claude already logged in on this machine, so neither is a paid
// call.
async function askForNoticing({
  evidence, roleTitle = null, avoid = [], ask: rawAsk, askToWrite = null, attempts = 2,
}) {
  let rounds = 0;
  let ranOut = false;
  const writeWith = askToWrite || rawAsk;
  const askWriter = async (prompt) => {
    if (rounds >= MOST_ROUNDS_PER_BUSINESS) { ranOut = true; return null; }
    rounds += 1;
    return writeWith(prompt);
  };
  const ask = async (prompt) => {
    if (rounds >= MOST_ROUNDS_PER_BUSINESS) { ranOut = true; return null; }
    rounds += 1;
    return rawAsk(prompt);
  };
  if (typeof ask !== 'function') throw new Error('askForNoticing needs the reader handed in');
  const pages = (evidence && evidence.pages) || [];
  if (!pages.length) return { couldNotTell: "their site's words are not on file" };
  const held = pages.reduce((n, p) => n + String(p.text || '').length, 0);
  if (held < 400) return { couldNotTell: 'too little of their site is on file to say anything specific' };

  // FIND. Every named job must map to a type in the library — the code
  // verifies the key exists — and stand on words actually held in the store.
  let areas = null;
  let rejected = null;
  let stumbles = 0;
  for (let go = 0; go < attempts; go++) {
    const res = await ask(promptToFind(evidence, rejected));
    // A STUMBLE IS NOT AN ANSWER (2026-09-02).
    //
    // A reply that could not be read — prose where JSON was asked for, a
    // sentence cut off part way — used to end the whole attempt on the spot,
    // and the business kept its generic trade sentence. Three in one batch of
    // nineteen, two of them holding thirty pages of their own words. It is
    // the reader that stumbled, not the business that had nothing to say, so
    // it is asked again. Only a reader that is genuinely out, or a business
    // that has used up its rounds, ends it here.
    if (!res || !res.answer) {
      if (res && res.readerExhausted) return { couldNotTell: res.why, readerExhausted: true };
      if (ranOut) {
        return { couldNotTell: `no sentence stood inside ${MOST_ROUNDS_PER_BUSINESS} rounds — the trade sentence stands` };
      }
      // A stumble does not spend one of the tries this business gets to be
      // UNDERSTOOD — those are for answers that were read and found wanting.
      if (stumbles < MOST_STUMBLES) {
        stumbles += 1;
        go -= 1;
        rejected = {
          what: 'a reply that could not be read',
          why: `${(res && res.why) || 'the reader did not answer'} — answer with the JSON on its own, `
            + 'nothing before it and nothing after it',
        };
        continue;
      }
      return { couldNotTell: (res && res.why) || 'the reader did not answer' };
    }
    const a = res.answer;
    if (a.cannotTell) return { couldNotTell: String(a.cannotTell) };
    const found = (Array.isArray(a.areas) ? a.areas : [])
      .map((x) => (x && typeof x === 'object' ? {
        job: x.job ? String(x.job).trim().replace(/\s+/g, ' ') : null,
        type: x.type ? String(x.type).trim() : null,
        quote: x.quote ? String(x.quote).trim() : null,
        // THE PAGE IT RESTS ON, KEPT (2026-09-02).
        //
        // This was dropped here while being asked for above and required
        // below, so a job naming real work on a real page was refused for
        // resting on nothing. Almost everything is inferred; the page is the
        // footing, not the wording.
        restsOn: x.restsOn ? String(x.restsOn).trim() : (x.url ? String(x.url).trim() : null),
      } : null))
      .filter((x) => x && x.job);
    if (!found.length) {
      rejected = { what: 'no areas', why: 'no areas were named and cannotTell was not said — name the areas, or say cannotTell' };
      continue;
    }
    const unmapped = found.find((x) => !x.type || !T.TYPES[x.type]);
    if (unmapped) {
      rejected = {
        what: `"${unmapped.job}" mapped to "${unmapped.type || 'no type at all'}"`,
        why: `"${unmapped.type || '(no type)'}" is not in the library of work software can take `
          + '— every job must map to one of the listed type keys exactly, and a job that '
          + 'honestly fits none of them does not qualify and is left out',
      };
      continue;
    }
    // A badge is never a job, however thin the site (Oscar's Auto Repair,
    // 2026-09-02, offered "Se Habla Español" as the work task).
    const badge = found.map((x) => ({ x, what: notAJob(x) })).find((b) => b.what);
    if (badge) {
      rejected = {
        what: `"${badge.x.job}" resting on ${badge.what}`,
        why: `${badge.what} is not a work task — a language offered, an accreditation, a licence `
          + 'or registration number, a slogan, an award, a years-in-business claim and a '
          + 'payment method accepted are facts about the business, never the job named; leave '
          + 'it out, and when nothing else on the site shows real work, say cannotTell',
      };
      continue;
    }
    let ungrounded = null;
    const grounded = [];
    for (const x of found) {
      const page = groundingPage(x.quote, pages, x.restsOn || x.url || null);
      if (!page) {
        ungrounded = `"${x.job}" points at no page of theirs that we hold — every area `
          + 'must rest on a page we actually read';
        break;
      }
      grounded.push({
        ...x,
        url: page.url,
        department: T.TYPES[x.type].department,
        label: T.TYPES[x.type].label,
        recurs: null,
        recursWhy: null,
        plainly: null,
        rank: null,
        rankWhy: null,
        chosen: false,
        refused: null,
        refusedWhy: null,
      });
    }
    if (ungrounded) { rejected = { what: 'supporting words that are not on the pages', why: ungrounded }; continue; }
    areas = grounded;
    break;
  }
  if (!areas) {
    return { couldNotTell: `every answer was rejected — last: ${rejected ? rejected.why : 'no answer stood'}` };
  }

  // RECUR. A separate call that sees only the trade and each job with its
  // type and quote — never the first call's reasoning.
  let verdicts = null;
  let note = null;
  for (let go = 0; go < attempts; go++) {
    const res = await ask(promptForRecurrence(evidence.trade, areas, note));
    if (res && res.readerExhausted) return { couldNotTell: res.why, readerExhausted: true, areas };
    const v = res && res.answer && Array.isArray(res.answer.verdicts) ? res.answer.verdicts : null;
    if (v && v.length === areas.length && v.every((x) => x && (x.recurs === 'yes' || x.recurs === 'no'))) {
      verdicts = v;
      break;
    }
    note = `it needed a "verdicts" array of exactly ${areas.length} entries, one per job in the `
      + 'same order, each with "recurs" of "yes" or "no"';
  }
  if (!verdicts) return { couldNotTell: 'the recurrence check did not answer cleanly', areas };
  areas.forEach((x, i) => {
    x.recurs = verdicts[i].recurs;
    x.recursWhy = verdicts[i].why ? String(verdicts[i].why).trim() : null;
    x.plainly = verdicts[i].plainly === undefined || verdicts[i].plainly === null
      ? null : Number(verdicts[i].plainly);
  });
  const recurring = areas.filter((x) => x.recurs === 'yes');
  if (!recurring.length) {
    return {
      couldNotTell: 'every named job failed the recurrence test: '
        + areas.map((x) => `"${x.job}" (${x.recursWhy || 'no reason given'})`).join('; '),
      areas,
    };
  }

  // RANK and CHOOSE — in code, on the library's own evidence.
  const angle = angleFor(roleTitle);
  const ranked = rankAreas(recurring, { trade: evidence.trade, angle });

  // WRITE. The passage names exactly the chosen work, in Russ's voice,
  // checked in code; a rejection twice is silence, never a shrug-and-send.
  //
  // A REFUSAL is not a rejection (third amendment, after Obsidian Real
  // Estate). When the writer answers cannotTell for the chosen work, the
  // reason is recorded against those areas and the NEXT-RANKED qualifying
  // area is tried — a refusal on one area never ends the attempt while
  // others stand ranked and waiting. Silence comes only when every
  // qualifying area has been refused, or the passages for one were all
  // rejected. And the passage never names a person from their pages: work
  // that belongs to the business is written about the business.
  //
  // Fourth amendment (2026-09-02): a REJECTION now walks on too. A refusal
  // moved to the next area; a rejection — the writer's wording failing the
  // checks twice — still ended the whole attempt, and a business lost its
  // passage over a form of words rather than over its work. Both endings now
  // do the same thing: record why against those areas, and give the next
  // ranked area its turn. Silence comes only when every area has had one.
  let pool = [...ranked];
  const refusals = [];
  let tried = 0;
  while (pool.length && tried < MOST_PAIRINGS_TRIED) {
    tried += 1;
    const pick = chooseForEmail(pool);
    const mine = pick.chosen;
    for (const c of mine) c.chosen = true;
    rejected = null;
    let refusal = null;
    let wrote = null;
    let stumbled = 0;
    for (let go = 0; go < attempts; go++) {
      const res = await askWriter(promptToWrite(evidence, mine, roleTitle, avoid, rejected));
      // The same rule as at the finding step: a reply that could not be read
      // is the reader stumbling, and it gets asked again.
      if (!res || !res.answer) {
        if (res && res.readerExhausted) return { couldNotTell: res.why, readerExhausted: true, areas };
        if (ranOut) {
          return { couldNotTell: `no sentence stood inside ${MOST_ROUNDS_PER_BUSINESS} rounds — the trade sentence stands`, areas };
        }
        if (stumbled < MOST_STUMBLES) {
          stumbled += 1;
          go -= 1;
          rejected = {
            sentence: '',
            why: `${(res && res.why) || 'the reader did not answer'} — answer with the JSON on its own, `
              + 'nothing before it and nothing after it',
          };
          continue;
        }
        return { couldNotTell: (res && res.why) || 'the reader did not answer', areas };
      }
      const a = res.answer;
      if (a.cannotTell) { refusal = String(a.cannotTell); break; }
      // A DASH IS A TYPING HABIT, NOT A WRONG THOUGHT (2026-09-02).
      //
      // Obsidian Real Estate lost its passage twice over a dash and fell back
      // to the trade sentence — a good business dropped on punctuation. The
      // voice rule stands, so the dash goes; the sentence does not.
      const sentence = String(a.sentence || '').trim()
        .replace(/\s*[—–]\s*/g, ', ')
        .replace(/,\s*,/g, ',')
        .replace(/\s+/g, ' ');
      const check = passable(sentence, { roleTitle, avoid, jobs: mine });
      if (!check.ok) { rejected = { sentence, why: check.why }; continue; }
      const hours = sentence.match(CLAIMS_HOURS);
      if (hours) {
        rejected = {
          sentence,
          why: `promises time back ("${hours[0].trim()}") — no savings figure, verified or not, belongs in this passage`,
        };
        continue;
      }
      // OFFERING WHAT THEY HAVE IS THE WRONG WORK, NOT WRONG WORDING (2026-09-02).
      //
      // This retried the SAME work in different words, burned both attempts on
      // it, and the business lost its passage entirely — three good businesses
      // in one batch, all told they already book online. Nothing was wrong
      // with those businesses; the work chosen was simply already handled.
      //
      // So it stops rewriting and moves to the NEXT-RANKED work instead. The
      // reason is kept against the area that was refused, and only when every
      // area has been refused does the trade sentence stand.
      const offers = offersWhatTheyHave(sentence, mine, (evidence && evidence.theyRun) || []);
      if (!offers.ok) { refusal = offers.why; break; }
      const named = namesAPerson(sentence, evidence.people, evidence.name);
      if (named) {
        rejected = {
          sentence,
          why: `names ${named}, a person from their pages — work that belongs to the business is `
            + 'written about the business, and the passage never names the person who appears '
            + 'beside it',
        };
        continue;
      }
      if (a.sure !== undefined && a.sure !== null && Number(a.sure) < 0.6) {
        return { couldNotTell: 'the reader was not sure enough of it', areas };
      }
      wrote = { sentence, sure: a.sure };
      break;
    }
    if (wrote) {
      return {
        sentence: wrote.sentence,
        jobs: mine.map((c) => ({ job: c.job, quote: c.quote, url: c.url, type: c.type })),
        areas,
        chosenWhy: refusals.length ? `${refusals.join(' ')} ${pick.why}` : pick.why,
        url: mine[0].url,
        quote: mine[0].quote,
        confidence: wrote.sure === undefined || wrote.sure === null ? null : Number(wrote.sure),
        angle,
      };
    }
    // Refused (the writer said this work does not warrant a passage) or
    // rejected (its wording failed the checks): either way this pairing is
    // finished. The reason lands on the areas — kept forever with them — and
    // the next-ranked qualifying area gets its turn.
    const why = refusal
      || `no passage for it stood: ${rejected ? rejected.why : 'no answer stood'}`;
    // A REFUSAL LANDS ON THE LEADING JOB, NOT ON BOTH (2026-09-05).
    //
    // Since the letter names two, a refusal used to discard the pair — and the
    // second job, which the refusal usually says nothing about, went with it.
    // The reason almost always concerns the one the passage was built around:
    // "chasing organizers is Dale Smith's own licensed casework". So the
    // leading job is retired and the other goes back in the pool to be paired
    // with the next-ranked instead.
    const [leading, ...alsoTried] = mine;
    leading.chosen = false;
    leading.refused = true;
    leading.refusedWhy = why;
    for (const c of alsoTried) c.chosen = false;
    refusals.push(`"${mine.map((c) => c.job).join('" and "')}" did not stand (${why}).`);
    pool = pool.filter((x) => x !== leading);
  }
  const left = pool.length;
  return {
    couldNotTell: (tried === 1
      ? 'the one area that qualified did not stand'
      : `all ${tried} areas that were tried came to nothing`)
      + (left ? `, and ${left} more ranked below them were not reached` : '')
      + ` — ${refusals.join(' ')}`,
    areas,
  };
}

// ---------------------------------------------------------------------------
// THE EVIDENCE for one business, from what is already on file. Nothing here
// touches their website — the kept words are the whole point of keeping them.

async function gatherEvidence(db, prospectId, prospect = null) {
  const p = prospect || await db.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  const kept = await R.keptWords(db, prospectId, { limit: 60 });
  const contacts = await db.contact.findMany({
    where: { prospectId },
    select: { name: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  // Every page's words are scanned for what they run, not just the pages the
  // reader will be handed — a portal link lives in a nav bar as often as on a
  // page worth reading.
  const theyRun = await whatTheyAlreadyRun(db, prospectId, p, kept);
  const { tradeOf } = require('./queues.js');
  return {
    name: p.nameManualValue || p.name || '',
    trade: p.trade || tradeOf(p.name) || 'other',
    theirWork: p.theirWork || null,
    selfDescription: p.selfDescription || null,
    toolsInUse: p.toolsInUse || null,
    teamSize: p.employeeCountManualValue ?? p.employeeCount ?? null,
    yearsInBusiness: p.yearsInBusiness ?? null,
    people: contacts.filter((c) => c.name).slice(0, 10),
    theyRun,
    pages: pickPages(kept),
  };
}

async function noticeOneBusiness(db, prospectId, {
  ask, askToWrite = null, avoid = [], roleTitle = null, prospect = null,
} = {}) {
  const evidence = await gatherEvidence(db, prospectId, prospect);
  const result = await askForNoticing({ evidence, roleTitle, avoid, ask, askToWrite });
  result.trade = evidence.trade;
  result.theyRun = evidence.theyRun || [];
  return result;
}

// ---------------------------------------------------------------------------
// THE RECORD. One reading per attempt, through the append-only store — never
// a column, never an overwrite. A could_not_tell is recorded too: "we looked
// and could not say" must never again be indistinguishable from "never
// looked". A business done twice has two findings, and the latest is used.
//
// EVERY area found is recorded — chosen for the email or not, recurring or
// not — as a noticingArea finding whose value carries the type, department,
// verdict, rank and choice, and whose url and quote carry the words it rests
// on. The card shows all of them; the email names at most two.

async function recordNoticing(db, prospectId, result, { sourceUrl = null } = {}) {
  const reading = await R.startReading(db, {
    prospectId, source: R.WEBSITE, sourceUrl,
    reader: READER, readerVersion: READER_VERSION, model: MODEL,
  });
  const recordArea = (x) => R.record(db, {
    readingId: reading.id, prospectId, field: 'noticingArea',
    value: JSON.stringify({
      job: x.job,
      type: x.type,
      department: x.department || null,
      label: x.label || null,
      recurs: x.recurs ?? null,
      recursWhy: x.recursWhy ?? null,
      plainly: x.plainly ?? null,
      tier: x.tier ?? null,
      hours: x.hours ?? null,
      hoursVerified: x.hoursVerified ?? null,
      rank: x.rank ?? null,
      rankWhy: x.rankWhy ?? null,
      chosen: Boolean(x.chosen),
      refused: x.refused ?? null,
      refusedWhy: x.refusedWhy ?? null,
    }),
    status: R.INFERRED,
    url: x.url || null, quote: x.quote || null,
  });

  if (result && result.sentence) {
    await R.record(db, {
      readingId: reading.id, prospectId, field: 'noticing',
      value: result.sentence, status: R.INFERRED,
      confidence: result.confidence ?? null,
      url: result.url || null, quote: result.quote || null,
    });
    await R.record(db, {
      readingId: reading.id, prospectId, field: 'noticingAngle',
      value: result.angle || 'neutral', status: R.INFERRED,
      url: result.url || null,
    });
    // Each job the passage names, with its own words behind it — so Russ can
    // always see WHAT was named and judge it. Appended like everything else.
    for (const j of result.jobs || []) {
      if (!j || !j.job) continue;
      await R.record(db, {
        readingId: reading.id, prospectId, field: 'noticingJob',
        value: j.job, status: R.INFERRED,
        url: j.url || result.url || null, quote: j.quote || null,
      });
    }
    for (const x of result.areas || []) await recordArea(x);
    if (result.chosenWhy) {
      await R.record(db, {
        readingId: reading.id, prospectId, field: 'noticingChoice',
        value: result.chosenWhy, status: R.INFERRED,
        url: result.url || null,
      });
    }
    await R.finishReading(db, reading.id, R.READ, null);
  } else {
    await R.record(db, {
      readingId: reading.id, prospectId, field: 'noticing',
      status: R.COULD_NOT_TELL,
    });
    // What WAS found travels into the record even when the sentence fell
    // back — an area that failed recurrence is a real finding, kept forever.
    for (const x of (result && result.areas) || []) await recordArea(x);
    await R.finishReading(db, reading.id, R.READ,
      (result && result.couldNotTell) || 'could not tell');
  }
  return reading;
}

// ---------------------------------------------------------------------------
// WHAT THE LETTER USES. The latest un-retired answer wins; a hand-typed one
// wins over everything (currentAnswer already knows both rules). A latest
// answer of could_not_tell means the letter keeps Russ's trade sentence —
// that is the fallback working as designed, not a failure.

// A SENTENCE WE ALREADY FOUND IS NOT UNDONE BY A LATER BLANK (Russ, 2026-09-03).
//
// Prineville Coffee's letter carried "You're booking meetings and book clubs,
// managing the no-shows that come with it" — read off their own site. Two
// re-reads later it was gone and the letter had fallen back to the sentence
// written for every coffee shop in the county.
//
// Nothing had been deleted: all three readings are on file, exactly as the
// rules require. The newest simply won, and the newest was "could not tell".
// But "I looked and found nothing" is not a correction of "I looked and found
// this" — it is an absence, and an absence must not beat a finding.
//
// So: the most recent reading that actually FOUND something stands. A blank
// only wins when no reading ever found anything, and then the trade's sentence
// takes over as it always did. What Russ typed himself still beats everything,
// including his own decision to clear it.
//
// The risk, named: a business that changed its website and genuinely stopped
// doing the thing would keep an old sentence. It is small — the sentence is
// about how their work runs, never a price or a claim about them — and every
// one is dated and traceable to the visit that found it.
async function noticingFor(db, prospectId) {
  const said = await db.finding.findMany({
    where: { prospectId, field: 'noticing', retiredAt: null },
    include: { reading: { select: { source: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!said.length) return null;

  // What Russ typed is the answer, whatever it says, including nothing.
  const his = said.find((f) => f.reading.source === R.HAND);
  if (his) {
    return his.value && his.status !== R.COULD_NOT_TELL ? his.value : null;
  }

  const found = said.find((f) => f.value && f.status !== R.COULD_NOT_TELL);
  return found ? found.value : null;
}

module.exports = {
  READER, READER_VERSION, MODEL,
  angleFor, ANGLES, passable, normalise, pickPages, pageScore,
  promptToFind, promptForRecurrence, promptToWrite,
  groundingPage, askForNoticing, gatherEvidence, noticeOneBusiness,
  recordNoticing, noticingFor,
  kindsOf, offersWhatTheyHave, whatTheyAlreadyRun,
  tierFor, hoursFor, rankAreas, chooseForEmail, materiallyWeaker,
  CLAIMS_HOURS, VISIBLE_TO,
  notAJob, namesAPerson,
};
