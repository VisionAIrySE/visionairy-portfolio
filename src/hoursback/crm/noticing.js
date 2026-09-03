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
const READER_VERSION = '2026-09-02-noticing-3';
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
        // A SUSPICION, NOT A VERDICT (Russ, 2026-09-03).
        //
        // The kinds are coarse on purpose, and "enquiries" catches every job
        // with the word call, email, question or answer in it. So Team Wieche,
        // who have a portal for routine requests and payments, had ANSWERING
        // THE PHONE ruled out as already handled — three good areas in a row,
        // and the business kept the generic trade sentence. A portal does not
        // answer phones.
        //
        // Word-matching cannot tell the difference and should never have been
        // asked to. It raises the suspicion; whether the tool genuinely does
        // that job is a question of meaning, and it goes to the reader.
        return {
          ok: false,
          suspect: { toolName: sys.name, does: sys.does, job: t },
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

function passable(sentence, { roleTitle = null, avoid = [], jobs = [] } = {}) {
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
  if (/[!?]/.test(s)) return { ok: false, why: 'an exclamation or a question — the voice allows neither' };
  if (/[—–]/.test(s)) return { ok: false, why: 'a dash — the voice rules say no dashes' };
  if (/[{}<>]/.test(s)) return { ok: false, why: 'placeholder braces' };
  if (!/\.$/.test(s)) return { ok: false, why: 'does not end with a period' };
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
  // THE STANDARD BELONGS AT THE EARLIEST STAGE THAT CAN MEET IT (Russ,
  // 2026-09-03: "shouldn't the instructions incorporate the restrictive
  // components we identified? We keep dancing around failure").
  //
  // Every fix tonight went into the WRITING step. But the failures kept
  // coming from HERE: the wrong work was picked, and by the time it reached
  // the writer no sentence could save it. Postal Connections was offered
  // "choosing the right carrier" — the skilled part, which Russ had already
  // ruled out weeks ago. Obsidian was offered "following up with clients",
  // true of every broker alive. The writer was never the problem.
  //
  // So the bar the finished sentence has to clear is stated HERE, before a
  // single area is named.
  // THE WHOLE BRIEF, WRITTEN OUT ONCE (2026-09-03).
  //
  // Russ: "WHY DO WE HAVE TO KEEP DEFINING WHAT WE ARE DOING? I HAVE GIVEN
  // YOU EVERYTHING NEEDED." He had. Every piece below was already said —
  // some of it weeks ago — and it went in one fragment at a time, each fix
  // treated as a new discovery. It is written down whole here so nobody has
  // to say it again.
  lines.push('WHAT THIS IS FOR, BEFORE ANYTHING ELSE.');
  lines.push('');
  lines.push('Russ Wright takes repetitive office work off small businesses in Central');
  lines.push('Oregon and hands it to software and AI. He is sending one cold email. It');
  lines.push('sells nothing and names no price. It asks for fifteen minutes on the');
  lines.push('phone, after which he goes away and does real research for free and');
  lines.push('comes back with one tool, what it costs, and what it would take to build');
  lines.push('what nothing off the shelf covers.');
  lines.push('');
  lines.push('Whether they give him those fifteen minutes turns on ONE sentence: the');
  lines.push('one that opens the email, about their business. It has to make them');
  lines.push('think this person has sat in my chair. Not "looked at my website" —');
  lines.push('every stranger does that, and they can tell instantly. Someone who has');
  lines.push('DONE the job knows which part of it grinds.');
  lines.push('');
  lines.push('Your job here is earlier than that sentence. You find the work it will');
  lines.push('be written about. If you hand up the wrong work, no sentence can save');
  lines.push('it, and this business is wasted.');
  lines.push('');
  lines.push('WHAT MAKES WORK WORTH NAMING. All four, or it does not qualify.');
  lines.push('');
  lines.push('1. SOFTWARE COULD ACTUALLY TAKE IT. It repeats, the same shape every');
  lines.push('   time, many times a week. It is never the judgement, the skill, the');
  lines.push('   licence or the eye they are paid for, and never a person handling a');
  lines.push('   physical thing. No software packs a box, welds a bracket or mows a');
  lines.push('   lawn. But the calls, the forms, the reminders, the re-typing and the');
  lines.push('   chasing around all of that are exactly what it takes.');
  lines.push('   NOT: "choosing the right carrier for each package" — the skilled');
  lines.push('   part, and offering to take it is insulting.');
  lines.push('   YES: "answering the same question about customs paperwork".');
  lines.push('');
  lines.push('2. IT COSTS SOMEBODY SOMETHING YOU CAN NAME. Not the business, not the');
  lines.push('   process — a PERSON. A process cannot be tired and nobody recognises');
  lines.push('   themselves in one. These are the costs that land:');
  lines.push('     - somebody\'s day, hours of it, gone to this');
  lines.push('     - the same thing typed twice, here and then again there');
  lines.push('     - the same question answered over and over');
  lines.push('     - the work they are actually paid for, waiting while this gets done');
  lines.push('     - evenings and weekends, because there is no room in the day');
  lines.push('     - one person it always lands on, and nothing moves when they are out');
  lines.push('     - the ones that slip: enquiries, reminders, follow-ups lost');
  lines.push('   If you cannot say in plain words what this takes out of somebody, it');
  lines.push('   does not qualify.');
  lines.push('');
  lines.push('3. IT IS THEIRS, NOT THEIR TRADE\'S. This is where most work dies.');
  lines.push('   "Following up with clients" is true of every broker in the country,');
  lines.push('   so it proves nothing and the email is binned. It has to attach to');
  lines.push('   something ONLY THEY have on their pages: the towns they name, the');
  lines.push('   brands and systems they list, the exact services on their menu, the');
  lines.push('   seasons and deadlines their work turns on, the numbers they publish.');
  lines.push('   Put that specific thing in the job itself.');
  lines.push('   NOT: "following up with prospective buyers".');
  lines.push('   YES: "keeping two hundred listings straight across La Pine, Redmond');
  lines.push('   and Bend".');
  lines.push('');
  lines.push('4. IT RESTS ON THEIR OWN PAGES. Not on a guess about their trade. You');
  lines.push('   are inferring, not inventing: what a business like this plainly does');
  lines.push('   is fair and their pages need not announce it. What is forbidden is a');
  lines.push('   claim their pages contradict.');
  lines.push('');
  // RUSS'S OWN TASTE LINE, spoken 2026-08-26 and never once put into these
  // instructions until now: "Only thing might be too much insight from a cold
  // caller might be creepy... I might be a little suspect if someone knew what
  // software platforms I was running if I didn't make it a point of
  // broadcasting my business. It has to be relevant, appropriate, and
  // tasteful." He worked the line out by asking how HE would feel receiving
  // it, which is his test for everything.
  lines.push('RELEVANT, APPROPRIATE AND TASTEFUL. There is a line between a');
  lines.push('stranger who has clearly read your website and a stranger who has been');
  lines.push('looking into you. Use what they chose to publish and broadcast: their');
  lines.push('services, their towns, their opening hours, the forms and buttons on');
  lines.push('their own pages, the brands they advertise carrying.');
  lines.push('');
  lines.push('Do NOT use anything that reads as having been dug up. Never name the');
  lines.push('software running behind their business unless their own site');
  lines.push('advertises it. Never name an individual and what you think their day');
  lines.push('looks like. Never anything about their finances, their staff turnover,');
  lines.push('or how well they seem to be doing. The test is simple: would a');
  lines.push('business owner reading this be glad someone looked, or unsettled that');
  lines.push('they looked that hard?');
  lines.push('');
  lines.push('SILENCE IS A REAL ANSWER AND A BETTER ONE THAN A GENERIC PICK. A');
  lines.push('business whose pages will not support anything specific keeps the');
  lines.push('sentence written for its whole trade, which is true and safe. Say');
  lines.push('cannotTell and move on. A generic area wastes the one chance this');
  lines.push('business gets.');
  lines.push('');
  lines.push(...businessBlock(e));
  lines.push('');
  lines.push('THE MENU. This library is the complete list of the kinds of work');
  lines.push('software can take off a business. It is the benchmark: a job qualifies');
  lines.push('ONLY if it maps to one of these type keys. A job that fits none of them');
  lines.push('does not qualify, full stop — leave it out, however true it is of their');
  lines.push('day.');
  for (const [key, t] of Object.entries(T.TYPES)) {
    lines.push(`- ${key} (${t.department}): ${t.label}`);
  }
  lines.push('');
  lines.push('Find EVERY type of work on that menu that a business like THIS one');
  lines.push('plainly does, judging from their own pages. One, two, three, four or');
  lines.push('more, if they honestly qualify — never one more for the sake of it.');
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
  lines.push('Answer with JSON only, one of:');
  lines.push('{"areas":[{"job":"the work in a few plain words","type":"a type key from the menu, exactly as written","restsOn":"the url of the page this rests on","quote":"the words on that page that led you to it"}]}');
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
  if (second && materiallyWeaker(second, first)) {
    const why = `"${first.job}" ranked first (${first.rankWhy}). The next area of a different kind, `
      + `"${second.job}", was materially weaker (${second.rankWhy}), and a weak second drags a `
      + 'strong first down, so the email names one.';
    return { chosen: [first], why };
  }
  if (!second) {
    const why = `"${first.job}" ranked first (${first.rankWhy}); nothing of a genuinely different `
      + 'kind stood on its own beside it, so the email names one.';
    return { chosen: [first], why };
  }
  const why = `"${first.job}" ranked first (${first.rankWhy}). "${second.job}" is the strongest `
    + `of a different kind of work (${second.rankWhy}).`;
  return { chosen: [first, second], why };
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

  // WHAT THIS SENTENCE IS FOR, SAID FIRST AND SAID ALONE (Russ, 2026-09-03).
  //
  // This instruction had grown into twelve prohibitions and no purpose. Every
  // correction got bolted on as another ban, so a writer could satisfy every
  // rule and still miss the point entirely — "the intake repeats, but nothing
  // else does" breaks no rule and lands nothing. Nobody had ever told it what
  // the sentence was FOR.
  //
  // It is for one thing, and everything below is a consequence of it.
  lines.push('WHAT THIS SENTENCE IS FOR. Read it first. Everything else follows from it.');
  lines.push('');
  lines.push('A stranger opens this email. In one sentence you have to make them');
  lines.push('think: this person has sat in my chair. Not "this person looked at my');
  lines.push('website" — anyone can do that, and they can tell the difference');
  lines.push('instantly. Someone who has DONE the job knows which part of it grinds.');
  lines.push('');
  lines.push('If they believe that, they give up fifteen minutes. That is the whole');
  lines.push('purpose of the sentence. It is not selling anything. Nobody buys');
  lines.push('software from a cold email, and there is no price anywhere in this');
  lines.push('letter. The offer that follows is free research with nothing to sign,');
  lines.push('and it only reads as genuine if the sentence before it has already');
  lines.push('proved you understand the work.');
  lines.push('');
  lines.push('So: name the work, and name what it takes out of somebody.');
  lines.push('');
  lines.push('WHAT COUNTS AS A COST. Not the business, not the process — a PERSON.');
  lines.push('These are the ones that land:');
  lines.push('  - somebody\'s day, hours of it, gone to this');
  lines.push('  - the same thing typed twice, here and then again there');
  lines.push('  - the same question answered over and over');
  lines.push('  - the work they are actually paid for, waiting while this gets done');
  lines.push('  - evenings and weekends, because there is no room in the day');
  lines.push('  - one person it always lands on, and nothing moves when they are out');
  lines.push('  - the ones that slip: enquiries, reminders, follow-ups lost');
  lines.push('');
  lines.push('AND MAKE IT THEIRS. This is where it is usually lost. "Calls come in all');
  lines.push('day and somebody writes them down" is true of every business in their');
  lines.push('trade, so it proves nothing and they bin it. Reach into their own pages');
  lines.push('and USE something only they have: the towns they name, the tools and');
  lines.push('brands they list, the exact services on their own menu, the numbers they');
  lines.push('publish, the seasons and deadlines their work turns on.');
  lines.push('');
  lines.push('  WEAK: "You are getting calls all day about repairs and upgrades."');
  lines.push('  THEIRS: "Somebody is working out which van goes to Terrebonne and');
  lines.push('   which to Prineville, and every finance application is still typed');
  lines.push('   in by hand."');
  lines.push('');
  lines.push('The test: could this sentence be sent, word for word, to their');
  lines.push('competitor down the road? If yes, it is not finished. Something in it');
  lines.push('must be wrong for anybody else.');
  lines.push('');
  lines.push('If a reader could answer it with "yes, and?", you have not done the job.');
  lines.push('');
  // REAL REJECTIONS, IN THE WORDS THEY WERE REJECTED IN (2026-09-03). Every
  // one of these was written by a good reader, passed every mechanical check,
  // and was thrown out by a person in that trade reading it cold. They are
  // the sharpest teaching there is and none of them were written down.
  lines.push('SENTENCES THAT FAILED, AND WHY. Each of these was written, checked,');
  lines.push('and thrown out by somebody in that trade reading it cold.');
  lines.push('');
  lines.push('  "The intake repeats, but nothing else does."');
  lines.push('    Describes a process. Nobody is in it, nothing is lost, and the');
  lines.push('    second half talks the first half back down.');
  lines.push('');
  lines.push('  "Somebody types out every application that comes through your form."');
  lines.push('    A person, doing it, every time. And? It never says what it takes.');
  lines.push('');
  lines.push('  "You are getting calls all day about repairs and upgrades."');
  lines.push('    Generic to every company in the trade. Proves nothing.');
  lines.push('');
  lines.push('  "You are the one deciding which carrier fits each package."');
  lines.push('    That is the skilled part they are paid for. Nothing should take');
  lines.push('    it, and offering to is insulting.');
  lines.push('');
  lines.push('  "Following up with clients between sales is on somebody there."');
  lines.push('    True of every broker in the country. Says what they do, not what');
  lines.push('    it costs, and nothing in it is only theirs.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    'The work below was read off this business\'s own pages and checked. Write '
    + 'the passage, or say it cannot be written.',
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
  lines.push('So the passage names the work AND what it costs. One clause is enough.');
  lines.push('Never a number, never a promise, never a scolding.');
  lines.push('');
  lines.push('THE COST FALLS ON A PERSON AND THEIR TIME — never on the process. A');
  lines.push('workflow cannot be tired. Somebody is doing this, it is taking their');
  lines.push('day, and it is the same every time. Say THAT.');
  lines.push('');
  lines.push('  NOT: "The intake repeats, but nothing else does." — that describes a');
  lines.push('       process. Nobody is in it, and nothing is being lost.');
  lines.push('  YES: "Somebody is typing the same details in all day." — a person, a');
  lines.push('       day, gone.');
  lines.push('');
  lines.push('AND NEVER TALK YOURSELF OUT OF IT. Do not add a clause that shrinks what');
  lines.push('you just said: not "but nothing else does", not "though it is only part');
  lines.push('of it", not "at least the rest varies". The passage says the thing and');
  lines.push('stops. The concession comes in the NEXT sentence of the letter, which is');
  lines.push('already written and is not yours to add.');
  lines.push('');
  lines.push('If a reader could answer the passage with "yes, and?", it is not done.');
  lines.push('');
  // HOW RUSS SOUNDS, NOT A LIST OF DON'TS (2026-09-03).
  //
  // These were twelve prohibitions in a row, and a writer obeying all twelve
  // still wrote a sentence with nobody in it. What could not be checked by
  // code belongs here, said as a voice to be held rather than a fence to
  // stay inside. The facts that CAN be checked — offering what they already
  // run, naming a person from their pages, quoting hours — are checked in
  // code after this, and are not the writer's to remember.
  // MIRROR THE READER, PEER TO PEER (Russ, spoken 2026-08-26): "Mirror and
  // match my voice with the target... Keep my tone and approach but mirror,
  // without being obsequious, the communication style, peer to peer, to the
  // target, understand? ... I'm not going to talk conversion and ROI to a Tire
  // Shop, and not going to talk mundane accounting to a consulting firm."
  lines.push('WHO YOU ARE TALKING TO. Russ\'s tone never moves, but the words meet');
  lines.push('the person where they work. He does not talk conversion rates and');
  lines.push('return on investment to a tyre shop, and he does not talk about');
  lines.push('mundane bookkeeping to a consulting firm. Use the words that trade');
  lines.push('uses about its own day. Peer to peer, never talking up or down, never');
  lines.push('flattering.');
  lines.push('');
  lines.push('AND TALK TO THE PAIN WITHOUT MAKING IT A PITCH (his words). You are');
  lines.push('naming something true about their week. You are not selling, not');
  lines.push('hinting at a solution, not implying they are behind. If the sentence');
  lines.push('reads as the opening of a sales call, it is wrong. It reads as');
  lines.push('recognition, and the offer comes later in the letter, from Russ.');
  lines.push('');
  lines.push('HOW IT SOUNDS. Russ, talking. Hold this while you write.');
  lines.push('');
  lines.push('He is one working person recognising another working person\'s week.');
  lines.push('Warm, easy, sure of itself. He says it out loud across a counter, in');
  lines.push('plain short everyday words, and then he stops. Somebody is always IN the');
  lines.push('sentence: "that comes back to you", "somebody has to", "you are the one');
  lines.push('who". A person doing a real job beats a described process every time —');
  lines.push('a process cannot be tired, and nobody recognises themselves in one.');
  lines.push('');
  lines.push('He is never a consultant and never a report. Nothing stiff or official:');
  lines.push('no "must manage", no "are required to", no "ensuring", no "requests are');
  lines.push('handled". If it reads like a form, it is wrong. No marketing words —');
  lines.push('"leverage", "streamline", "solutions", "optimize", "seamless" are all');
  lines.push('his tell for someone who has not done the work. No flattery, no');
  lines.push('exclamation mark, no question, no dashes.');
  lines.push('');
  lines.push('He never scolds and never implies they are behind. It is a fact about');
  lines.push('their week said kindly, not a criticism. And he never tells them who');
  lines.push('they are: no job title, no clause about the reader.');
  lines.push('');
  lines.push('LENGTH. One job: one sentence, two short ones at the very most. Two');
  lines.push('jobs: two or three short sentences. Never a paragraph, never a list.');
  lines.push('');
  lines.push('IT MUST BE WRONG FOR THE SHOP DOWN THE ROAD. Say only what their own');
  lines.push('pages support — but inference is not invention. What a business like');
  lines.push('this plainly does is fair game and their pages need not announce it.');
  lines.push('What is forbidden is a claim their pages contradict, or one that would');
  lines.push('be equally true of any business anywhere. Never promise or count hours,');
  lines.push('and never name a time or money figure their pages do not carry.');
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
//
// RAISED AGAIN TO TWENTY (2026-09-03) when the judge was added: every
// sentence now costs one more round to be read back cold, and four pairings
// at two writes and two judgings each is sixteen on top of the four the
// finding and recurrence stages take.
const MOST_ROUNDS_PER_BUSINESS = 20;

// AND A CEILING ON HOW MANY AREAS ARE WALKED. Every qualifying area gets its
// turn, but a business that found a dozen does not get a dozen goes — the
// ranking put the hardest-hitting first, and by the fifth pairing the work
// being offered is no longer the work worth opening on.
const MOST_PAIRINGS_TRIED = 4;

// AND HOW MANY TIMES THE READER MAY STUMBLE at one stage before we stop
// asking. A stumble is a reply that could not be read at all — prose where
// JSON was asked for, an answer cut off part way. It is the reader tripping,
// not the business having nothing to say, so it does not spend one of the
// tries this business gets to be understood. The overall round ceiling above
// still holds, so a reader stumbling forever cannot run away with the night.
const MOST_STUMBLES = 2;

async function askForNoticing({ evidence, roleTitle = null, avoid = [], ask: rawAsk, attempts = 2 }) {
  let rounds = 0;
  let ranOut = false;
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
    let judged = null;
    let stumbled = 0;
    for (let go = 0; go < attempts; go++) {
      const res = await ask(promptToWrite(evidence, mine, roleTitle, avoid, rejected));
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
      if (!offers.ok) {
        // The word-match raised a suspicion. Whether the tool they have
        // GENUINELY does that job is a question of meaning, so it goes to the
        // reader before a good area is thrown away over a shared word.
        let reallyDoes = true;
        if (offers.suspect) {
          const t = offers.suspect;
          const said = await ask(promptToCheckOverlap(t.toolName, t.does, t.job));
          if (said && said.answer && said.answer.alreadyDoes === false) {
            reallyDoes = false;
          }
        }
        if (reallyDoes) { refusal = offers.why; break; }
        // IT DOES NOT COVER THE WORK, SO THE SENTENCE STANDS (2026-09-03).
        //
        // This used to send the sentence back to be written again, which
        // spent both of the business's attempts on a sentence that had
        // nothing wrong with it, and Obsidian Real Estate lost a passage it
        // had passed with hours earlier. A tool that does not do the job is
        // not a reason to change a word.
      }
      // IS ANYTHING IN IT ONLY THEIRS? Checked here, not judged. Measured
      // 2026-09-03: only 17% of sentences carried anything specific to that
      // business, and every sentence Russ called good had one while every one
      // he rejected had none. Demanding it in words did not move it; the
      // stranger who reads it cold cannot see their website and was turning
      // DOWN six real town names as generic. So it is a lookup against their
      // own pages, and it is not optional.
      // Only asked of a business whose pages actually offer something to
      // use. A site carrying no names and no numbers at all cannot satisfy
      // it, and blocking on the impossible would cost that business its
      // sentence for a fault that is not the writer's.
      const theyOffer = theirOwnWords(pages).size > 0;
      const mine2 = theyOffer ? onlyTheirs(sentence, pages) : ['(their pages name nothing)'];
      if (!mine2.length) {
        rejected = {
          sentence,
          why: 'nothing in it is only theirs — this would read the same sent to their '
            + 'competitor down the road. Their own pages are above: use a place they '
            + 'name, a brand or system they list, a service on their menu, or a number '
            + 'they publish, and put it IN the sentence',
        };
        continue;
      }
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
      // THE JUDGE. Every check above is a ban; this one asks whether the
      // sentence did its job. A cold reader, given only the sentence and the
      // trade, says whether it sounds like somebody who has sat in that
      // chair. Its verdict is not a rejection of the WORK — the work is
      // fine — so a failure sends the same work back to be said better,
      // in the judge's own words.
      const verdict = await ask(promptToJudge(sentence, evidence.trade, roleTitle));
      if (verdict && verdict.answer && verdict.answer.passes === false) {
        judged = { sentence, why: String(verdict.answer.why || 'it would not make me stop reading') };
        rejected = {
          sentence,
          why: `a person in that trade read it cold and said: ${judged.why}. `
            + 'Say the same work again so it lands: somebody real, their time, and what '
            + 'it takes out of them',
        };
        continue;
      }
      wrote = { sentence, sure: a.sure, judged: verdict && verdict.answer ? verdict.answer.why : null };
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
        judgedWhy: wrote.judged || null,
        angle,
      };
    }
    // Refused (the writer said this work does not warrant a passage) or
    // rejected (its wording failed the checks): either way this pairing is
    // finished. The reason lands on the areas — kept forever with them — and
    // the next-ranked qualifying area gets its turn.
    const why = refusal
      || (judged
        ? `a person in that trade read it cold and it did not land: ${judged.why}`
        : `no passage for it stood: ${rejected ? rejected.why : 'no answer stood'}`);
    for (const c of mine) { c.chosen = false; c.refused = true; c.refusedWhy = why; }
    refusals.push(`"${mine.map((c) => c.job).join('" and "')}" did not stand (${why}).`);
    pool = pool.filter((x) => !mine.includes(x));
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


// DOES THAT TOOL ACTUALLY DO THAT JOB? (Russ, 2026-09-03.)
//
// Asked only when the word-match above has raised a suspicion, so it costs
// nothing on the businesses where nothing clashes. The reader is given the
// tool, what it plainly does, and the job — and nothing else. It is a
// question about the real world, not about this letter.
function promptToCheckOverlap(toolName, does, job) {
  return [
    'A small business visibly uses this on their own website:',
    '',
    `  ${toolName}${does ? ` — ${does}` : ''}`,
    '',
    'Somebody wants to offer to take this job off them:',
    '',
    `  ${job}`,
    '',
    'One question. Does the tool they already have ACTUALLY do that job, so',
    'that offering it would be offering them something they have?',
    '',
    'Think about what the tool really does, not what it sounds like. A portal',
    'where customers submit routine requests does not answer the telephone. An',
    'online booking page does not chase the people who did not turn up. A',
    'contact form does not follow anything up. Tools cover the part they cover',
    'and no more, and the work either side of them is still somebody\'s job.',
    '',
    'Answer with JSON only:',
    '{"alreadyDoes":true or false,"why":"one short sentence"}',
    '',
    'Say true only when the tool plainly and fully does that job. Where it does',
    'part of it and a person still does the rest, say false.',
  ].join('\n');
}


// IS ANYTHING IN THIS SENTENCE ONLY THEIRS? (Russ, 2026-09-03.)
//
// Measured across every sentence ever written for these businesses: the ones
// that say what the work COSTS went from 43% to 70% once that was demanded.
// The ones naming something only that business has went from 10% to 17%. One
// in six. Every sentence Russ called good has one — Terrebonne, Prineville,
// GreenSky, La Pine, the Apply Now button, notary and mailbox slots — and
// every one he rejected has none.
//
// Demanding it in words did not work, and the stranger who reads the sentence
// cold CANNOT judge it: shown six real town names it said "what every broker
// does", because it has no way to know those towns are real. It was rejecting
// the very thing it should reward.
//
// So it is checked here instead, mechanically and unarguably: does the
// sentence carry a distinctive word or number that appears on their own
// pages? Not a judgement — a lookup. Common words are ignored, so "calls"
// and "appointments" prove nothing; "Terrebonne", "GreenSky" and "200" do.

// Words too common to prove anything, however true. Kept deliberately short:
// anything a business of any trade would say about its own week.
const NOT_DISTINCTIVE = new Set(`
the a an and or but of to in on at for with from by is are was were be been
you your yours they their them we our us it its this that these those
i he she him her his hers who whom whose which what when where why how
all any both each few more most other some such no nor not only own same
so than too very can will just should now then there here
day days week weeks month months year years time times hour hours morning
call calls calling called phone phones email emails message messages text
book books booking bookings booked appointment appointments schedule
scheduling scheduled reschedule rescheduling customer customers client
clients people person somebody someone work works working job jobs
service services request requests form forms order orders quote quotes
invoice invoices payment payments follow following up back over again
every each same still comes come coming lands land landing takes take
taking gets get getting keeps keep keeping does do doing done make makes
making need needs needed want wants new one two three four five
business businesses office offices team teams staff shop shops company
across through around before after during between within without into onto
another others already always never usually often sometimes something
someone anything everything nothing anyone everyone whether because
though although however therefore instead rather really simply actually
please thanks thank welcome contact about below above right left
online offline website websites number numbers detail details
information provide provided providing provider offer offers offering
include includes including available availability options option
process processes handle handles handling manage manages managing
schedule schedules support supports supporting help helps helping
answer answers answering complete completed together throughout
whatever whenever wherever whoever however anywhere everywhere nowhere
yourself myself ourselves themselves himself herself itself
getting having making taking coming going looking seeing knowing
little enough almost mostly nearly hardly barely quite pretty
`.trim().split(/\s+/));

/// Every distinctive word and number this business's own pages carry.
function theirOwnWords(pages) {
  const seen = new Set();
  for (const p of pages || []) {
    const text = String((p && p.text) || '');
    // Numbers they publish: 200 units, 24 hours, 1998.
    for (const n of text.match(/\b\d[\d,]*\+?\b/g) || []) {
      const bare = n.replace(/[,+]/g, '');
      if (bare.length >= 2) seen.add(bare);
    }
    // NAMES, not merely uncommon words. "across" and "through" appear on
    // every page ever written and prove nothing; Terrebonne, GreenSky and
    // Redmond are theirs. So a word counts where their own pages use it as a
    // NAME — capitalised somewhere other than the start of a sentence.
    for (const m of text.matchAll(/([^.!?\n]\s+)([A-Z][A-Za-z'-]{2,})/g)) {
      const w = m[2];
      const low = w.toLowerCase();
      if (NOT_DISTINCTIVE.has(low)) continue;
      seen.add(low);
    }
    // AND THE PARTICULAR THINGS THEY SELL, which are usually lowercase:
    // notary, mailbox, backflow, radioiodine, escrow, organizer. Every good
    // sentence Russ picked out carries one. Six letters or more, and never a
    // word any business would use about any week.
    for (const w of text.match(/\b[a-z][a-z'-]{5,}\b/g) || []) {
      if (NOT_DISTINCTIVE.has(w)) continue;
      seen.add(w);
    }
  }
  return seen;
}

/// What in this sentence is only theirs, drawn from their own pages. An empty
/// list means the sentence would read the same to their competitor.
function onlyTheirs(sentence, pages) {
  const theirs = theirOwnWords(pages);
  const found = [];
  const text = String(sentence || '');
  for (const n of text.match(/\b\d[\d,]*\+?\b/g) || []) {
    const bare = n.replace(/[,+]/g, '');
    if (bare.length >= 2 && theirs.has(bare)) found.push(n);
  }
  for (const w of text.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) || []) {
    const low = w.toLowerCase();
    if (NOT_DISTINCTIVE.has(low)) continue;
    if (theirs.has(low)) found.push(w);
  }
  return [...new Set(found)];
}

// ---------------------------------------------------------------------------
// THE JUDGE (Russ, 2026-09-03).
//
// Every check before this one is a BAN: no dashes, no hours, no naming a
// person, no offering what they already run. Twelve of them, each added the
// day Russ caught something. And a sentence can pass all twelve and still be
// worthless — "the intake repeats, but nothing else does" broke no rule and
// landed nothing, because no check ever asked whether the sentence did its
// job.
//
// So this one asks. It is deliberately given ONLY the finished sentence and
// the trade — never the instructions it was written under, never the pages it
// was drawn from, never the reasoning that produced it. It reads the way the
// recipient reads: cold, in an inbox, with no context and no patience.
//
// One question, and it is the whole purpose of the letter: does this sound
// like somebody who has sat in my chair, or somebody who read my website?
//
// This is the only check that can catch a fault nobody has thought of yet,
// which is every fault Russ has had to find himself.

function promptToJudge(sentence, trade, roleTitle = null) {
  const who = roleTitle ? `You are the ${roleTitle}.` : 'You run the place.';
  return [
    `You work at a small ${said(trade)} business. ${who} You are busy.`,
    '',
    'A cold email arrives from a stranger. This is its opening:',
    '',
    `  "${sentence}"`,
    '',
    'You have no idea who sent it and no reason to care. Answer honestly, as',
    'yourself, reading it for the first time:',
    '',
    'Does this sound like somebody who has actually DONE this job and sat in a',
    'place like yours? Or like somebody who skimmed your website an hour ago?',
    '',
    'Two things have to be true. Check them one at a time, in order.',
    '',
    'ONE: does it name something real about your week? Something specific to',
    'you, not to your trade in general. You should half-wonder how they knew.',
    '',
    'Assume the specifics are real. If it names a town, a brand or a number,',
    'somebody has checked those against their website already. You are judging',
    'whether it LANDS, not whether it is true.',
    '',
    'TWO: does it say what that work COSTS? Not that it happens — you know it',
    'happens. What it takes: somebody\'s whole day, the same thing over and',
    'over, the second time you have typed it, the good work waiting while this',
    'gets done. A sentence that names a person DOING something has still only',
    'told you what you do. The cost has to be IN the words, not left for you',
    'to work out.',
    '',
    '  "Somebody types out every application that comes in." — FAILS. Yes. And?',
    '  "Somebody types out every application, and it is the same eight boxes',
    '   every time." — passes. Now you know what it takes.',
    '',
    'If you cannot point at the words that say what it costs, it fails. Not',
    'implied, not obvious to you: in the sentence.',
    '',
    'THREE: is this something that could actually be taken off you? Imagine',
    'you gave them the fifteen minutes. Is the work they named the kind of',
    'thing software or a bit of automation could plainly carry — the repeating,',
    'predictable, same-shape-every-time part? Or is it the judgement, the',
    'skill, the thing only a person can do?',
    '',
    'Nobody wants fifteen minutes about the part that cannot be helped. If the',
    'sentence names real pain that nothing could lift, it fails: it is true and',
    'it is useless.',
    '',
    'It fails when any of these is true:',
    '- You cannot point at what the work costs. IT MUST SAY.',
    '- The work named is judgement or skill, not the repeating part around it.',
    '- It describes a process with nobody in it, and nothing being lost.',
    '- It only says what you do. You know what you do. So what.',
    // NOT asked whether it is specific enough. It cannot tell: shown six real
    // town names off a business's own pages it said "what every broker does".
    // Whether anything in the sentence is only theirs is checked against
    // their pages in code, where it can actually be known (2026-09-03).

    '- It hedges its own point, or talks itself back down after making it.',
    '- It reads like a consultant, a brochure, or a form.',
    '- It gets something about your work plainly wrong.',
    '- It knows something you never published. A stranger who has read your',
    '  website is fine. A stranger who seems to have been looking INTO you is',
    '  not, and you would not reply to that one.',
    '',
    'Answer with JSON only:',
    '{"passes":true or false,"why":"one short sentence in your own words"}',
    '',
    'Be honest rather than kind. A sentence that would not make you stop is a',
    'sentence that fails.',
  ].join('\n');
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

async function noticeOneBusiness(db, prospectId, { ask, avoid = [], roleTitle = null, prospect = null } = {}) {
  const evidence = await gatherEvidence(db, prospectId, prospect);
  const result = await askForNoticing({ evidence, roleTitle, avoid, ask });
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

async function noticingFor(db, prospectId) {
  const best = await R.currentAnswer(db, prospectId, 'noticing');
  if (!best || !best.value || best.status === R.COULD_NOT_TELL) return null;
  return best.value;
}

module.exports = {
  READER, READER_VERSION, MODEL,
  angleFor, ANGLES, passable, normalise, pickPages, pageScore,
  promptToFind, promptForRecurrence, promptToWrite, promptToJudge, promptToCheckOverlap,
  groundingPage, askForNoticing, gatherEvidence, noticeOneBusiness,
  recordNoticing, noticingFor,
  kindsOf, offersWhatTheyHave, whatTheyAlreadyRun,
  tierFor, hoursFor, rankAreas, chooseForEmail, materiallyWeaker,
  CLAIMS_HOURS, VISIBLE_TO,
  notAJob, namesAPerson, onlyTheirs, theirOwnWords,
};
