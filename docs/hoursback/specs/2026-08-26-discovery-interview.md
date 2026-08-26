# XFFI Spec — Build the Hours Back discovery interview: a question bank plus the runtime that 
Generated: 2026-08-26
Intent: Build the Hours Back discovery interview: a question bank plus the runtime that drives it, living alongside the existing Hours Back modules in src/hoursback/. Its purpose is to learn how a business actually runs, and it is DONE for a work area when four facts can be named: who does the work, what they do it with, how long it takes them, and what it would take to do it better. Ten mutually exclusive work areas cover every hour in a small business: getting work, booking it, doing it, getting paid, money in and out, people, buying and stock, after the sale, rules and records, and running the place. Most questions are open and ask how the work moves, who touches it and where it stalls, because that understanding is what makes a recommendation worth anything and is where a product opportunity shows up; a minority are measurement questions that reject any answer without a number, because that is where the five guaranteed hours get counted. Each question carries the trades it applies to, the roles that can answer it, its answer contract, the website fact that pre-fills and silences it, and the condition that fires a walk-me-through follow-up when an answer signals real recoverable hours or an unmet need. In person the laptop microphone transcribes live and the follow-up is offered on screen mid-conversation for Russ to ask or skip; over Google Meet, which will not hand its audio to an outside page, the transcript arrives after the call and Russ asks follow-ups by ear. The runtime prunes by trade and by the role in the room, marks questions the present role cannot answer as needing whoever does the work, and carries the answers forward as the audit's evidence.
<!-- xfxa-status: unverified -->

## Roots

- src/hoursback/industryTiers.js
- src/hoursback/crm/painPoints.js
- src/hoursback/crm/queues.js
- src/hoursback/enrich.js
- src/hoursback/peopleSweep.js
- prisma/schema.prisma
- scripts/hoursback/crm-app.js

## What Russ signs off, and what a machine can

Sixty of these statements are provable once the code exists: run them and each
one passes or fails with no opinion in it.

Ten are not, and never will be. They say what a QUESTION must ASK — "the
getting-work questions must ask who chases leads, what tool holds them, how
long a week of chasing takes, and what better would take" — and no test can
tell whether that is the right question to ask a builder or a dentist. A
word-matching check there would prove the words exist and nothing more, which
is false comfort.

Those ten carry `signoff: russ`. He reads the questions and says yes, that is
what I would ask. That is the real check, and it is his (his call, 2026-08-26).

## Terminals

Build

  ten-area-question-bank
  - [ ] The question bank in src/hoursback/ exports an AREAS constant holding exactly ten slugs, and checkQuestionBank() exits non-zero when the length is not ten or when a slug repeats <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] QUESTIONS gains entries with area getting-work that ask who chases leads, what tool holds them, how long a week of chasing takes and what better would take, so areaCoverage() can return done for getting-work <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area booking that ask who turns an enquiry into a booked job, what calendar or board holds it, how long booking one job takes and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area doing-the-work that ask who performs the job, what they record it on, how long that recording takes and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area getting-paid that ask who raises and chases invoices, what they raise them in, how long invoicing and chasing take and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area money-in-and-out that ask who reconciles and pays bills, what ledger holds them, how long a reconciliation cycle takes and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area people that ask who handles hiring, rosters, timesheets and payroll, what they handle it in, how long it takes and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area buying-and-stock that ask who orders and counts stock, what list or system holds it, how long ordering and counting take and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area after-the-sale that ask who handles follow-up, warranty and complaints, what tracks them, how long that takes and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area rules-and-records that ask who keeps licences, insurance, safety and compliance records, what holds them, how long upkeep takes and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] QUESTIONS gains entries with area running-the-place that ask who does owner admin, reporting and vendor management, what they use, how long it takes and what better would take <!-- type:Build --> <!-- signoff: russ -->
  - [ ] Every entry in QUESTIONS carries an area field holding one slug from AREAS, and checkQuestionBank() exits non-zero on an entry whose area is missing or outside AREAS <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Every entry in QUESTIONS carries a fact field valued who, tool, duration or better, and areaCoverage() returns done for a slug only when all four values appear among the answered entries for that slug <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Every entry in QUESTIONS carries all five of the fields trades, roles, contract, prefillFact and followUpWhen, and checkQuestionBank() exits non-zero on an entry missing one of the five <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Every entry in QUESTIONS carries a unique id string that a saved answer row cites, and checkQuestionBank() exits non-zero when two entries share an id <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] areaCoverage() treats a skipped entry as unanswered, so skipping a question can never make a work area read as done <!-- type:Build --> <!-- signoff: unsigned -->

  open-vs-measurement-answer-contracts
  - [ ] Each entry written into QUESTIONS carries a contract field set to the string open or the string measurement, and checkQuestionBank() exits non-zero on any third value <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] validateAnswer() returns a rejection object carrying reason no-number when an entry with contract measurement receives text holding no numeral, so no guaranteed hour is counted from a vague answer <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] validateAnswer() returns accepted for prose of any length on an entry with contract open, including prose holding numerals, and never returns the no-number rejection for contract open <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Every entry written with contract open asks how the work moves, who touches it or where it stalls, and checkQuestionBank() exits non-zero on an open entry whose text can be answered yes or no <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] checkQuestionBank() exits non-zero when the count of entries with contract measurement is not a strict minority of the QUESTIONS length, holding the rule that discovery exists to learn the business <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Each entry with contract measurement carries an hoursSource field naming the task whose recovered hours it counts, and countableHours() totals only entries carrying that field <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Every answer row for an entry with contract measurement carries a numeric hours field parsed from the answer text beside the raw answer, so countableHours() totals hours without re-reading prose <!-- type:Build --> <!-- signoff: unsigned -->

  website-fact-prefill-and-silencing
  - [ ] The prefillFact field on each QUESTIONS entry names a website-derived field already attached to the business record, and checkQuestionBank() exits non-zero on a prefillFact naming a field no producer under src/hoursback/ writes <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] applyPrefill() sets source to website, copies the fact value into the answer field and drops the entry from askNow when the named fact is present on the business record, so the meeting is never spent asking for what the site already states <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] applyPrefill() keeps the entry in askNow when the named fact is absent or empty on the business record <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] applyPrefill() keeps the entry in askNow when the named fact carries an inferred flag rather than a published value, so only a fact the business put on its own site silences a question <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] saveAnswer() writes a source field valued website, spoken or deferred onto every answer row, so the audit evidence separates a fact read from the site of the business from a fact heard in the room <!-- type:Build --> <!-- signoff: unsigned -->

  saved-answers-as-audit-evidence
  - [ ] saveInterview() writes one answer row per answered entry carrying id, area, fact, contract, answer, source and role, keyed to the business record <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] areaCoverage() reads the answer rows for one business and returns done for a slug only when rows with fact valued who, tool, duration and better all exist for that slug, and returns the missing fact values otherwise <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] countableHours() returns a per-task total naming the person and the task behind each figure, so the five guaranteed hours are shown as named work rather than a lump sum <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] The Prisma interview answer model is added beside the existing business and CRM models and the existing CRM rows stay readable after the migration <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] An entry no present role can answer is saved with source valued deferred and a needsRole field naming the role who must answer it, so the audit evidence shows an open item instead of a silent gap <!-- type:Build --> <!-- signoff: unsigned -->

  interview-runtime-alongside-industrytiers
  - [ ] listQuestions(business, trade, rolesPresent) returns only entries whose trades field admits the given trade and treats an empty trades field as admitting every trade <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] listQuestions() takes the trade for a business from the classification exported by src/hoursback/enrich.js rather than carrying a second trade list <!-- type:Build --> <!-- check: file_exists | src/hoursback/enrich.js | --> <!-- signoff: unsigned -->
  - [ ] listQuestions() returns the two arrays askNow and needsWhoeverDoesTheWork, and checkInterviewRuntime() exits non-zero when an admitted entry lands in neither array or in both <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] listQuestions() places an entry in needsWhoeverDoesTheWork when no value in rolesPresent appears in the roles field of that entry, and stamps needsRole with the first role that entry names <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] listQuestions() returns askNow ordered so every entry sharing one AREAS slug is contiguous, so the conversation finishes one work area before moving to the next <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] listQuestions() returns identical arrays for the same business, trade and rolesPresent on repeated calls and issues no outbound request, matching the pure-function shape of the existing modules in src/hoursback/ <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] checkInterviewRuntime() asserts AREAS, QUESTIONS, validateAnswer(), applyPrefill(), listQuestions(), areaCoverage(), countableHours() and evaluateFollowUp() and exits non-zero on the first failing assertion <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] skipQuestion(sessionId, questionId, reason) records the entry as skipped with an optional reason and removes it from askNow, so Russ can pass on any question mid-interview <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] saveInterview() writes skipped entries as rows carrying source valued skipped, so the report can name what was not asked rather than pretending it was <!-- type:Build --> <!-- signoff: unsigned -->

  follow-up-surfacing-from-saved-transcripts
  - [ ] evaluateFollowUp(question, answer) returns the walk-me-through prompt text when the followUpWhen condition on the entry matches the answer and returns null otherwise <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Every followUpWhen condition carries a kind field valued hours or need, and checkQuestionBank() exits non-zero on any third value <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] With sessionMode valued live, saveAnswer() runs evaluateFollowUp() as the answer is stored and returns the prompt in the same result object, so the prompt reaches the screen while the conversation is still running <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] saveAnswer() writes followUpStatus valued skipped onto the answer row when a returned prompt is dismissed, a value distinct from unasked, so the answer rows separate a prompt raised and declined from one never raised <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] With sessionMode valued postCall, pendingFollowUps(businessId) runs evaluateFollowUp() over every stored answer row and returns the fired prompts as a list carrying the entry id and AREAS slug behind each one, so the prompts can be asked by ear once the transcript arrives <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] pendingFollowUps() returns the fired prompts grouped by the kind field, so prompts with kind hours drive the counted recoverable hours while prompts with kind need stay a spoken discussion starter outside the report body <!-- type:Build --> <!-- signoff: unsigned -->

Understand
- [ ] The ten AREAS slugs are treated as mutually exclusive and collectively exhaustive over every working hour in a small business, so any task heard in the room maps to exactly one slug and none is homeless, which is the property the QUESTIONS shape must preserve <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] An area counts as DONE when four facts are named, who does the work, what they do it with, how long it takes and what better would take, so completeness is a property of the answer rows read by areaCoverage() rather than of how many questions were asked <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] Most entries carry contract open because understanding how the work moves is what makes the recommendation worth anything and is where a product opportunity shows up, while contract measurement exists only where the five guaranteed hours get counted <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] The existing modules in src/hoursback/ are pure and dependency-light and are gated by a spec check, so the question bank and its runtime must be reachable the same way or they sit outside the verification the audit rests on <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] applyPrefill() consumes the website-derived fields already attached to the business record, so an entry whose prefillFact names a present field never reaches askNow and no meeting minute is spent re-asking a published fact <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] sessionMode valued live and sessionMode valued postCall differ only in when evaluateFollowUp() runs, so both paths read one QUESTIONS array and one set of followUpWhen conditions rather than two banks <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] A role in the room who cannot answer an entry is an expected state, so needsWhoeverDoesTheWork carries that entry forward with needsRole rather than dropping it, and the audit evidence shows it as an open item <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] src/hoursback/industryTiers.js already resolves the trade for a business, so listQuestions() prunes by that resolved trade instead of asking the business to name its trade again <!-- type:Comprehend --> <!-- signoff: unsigned -->

Specify
- [ ] A dated spec document under docs/hoursback/specs/ defines the QUESTIONS entry shape as an object carrying id, area, fact, trades, roles, contract, prefillFact and followUpWhen, and checkQuestionBank() asserts AREAS and QUESTIONS against that document <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] The spec document under docs/hoursback/specs/ names the ten AREAS slugs with a one-sentence definition each so a task heard in the room is assignable to exactly one slug <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] The spec document under docs/hoursback/specs/ defines DONE for a work area as rows with fact valued who, tool, duration and better all present for that slug <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] The contract vocabulary is closed at the two values open and measurement, and validateAnswer() throws on any other value rather than defaulting to open <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] A prefillFact value must name a website-derived field a producer under src/hoursback/ actually writes, and checkQuestionBank() reports an unknown prefillFact as a failure rather than a silent no-prefill <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] The spec document under docs/hoursback/specs/ lists the answer row fields id, area, fact, contract, answer, source, role, needsRole, hours and followUpStatus, and saveInterview() writes exactly those fields before the Prisma interview answer model is added <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] checkQuestionBank() asserts the count of entries with contract measurement stays below a stated numeric fraction of the QUESTIONS length, so the open majority is checked rather than judged by eye <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] applyPrefill() writes source valued website onto an answer row only when the copied value carries a published flag, and returns a rejection when the value carries an inferred flag, so nothing guessed is repeated back to the business as fact <!-- type:Build --> <!-- signoff: unsigned -->

Operate
- [ ] Running the spec-check gate exercises checkQuestionBank() and checkInterviewRuntime() over AREAS, QUESTIONS, validateAnswer(), applyPrefill(), listQuestions(), areaCoverage(), countableHours() and evaluateFollowUp() and exits non-zero on the first failure <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] The Prisma interview answer model is applied by an additive migration, after which the existing CRM rows are still read unchanged by the existing tooling <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] sessionMode valued live configures saveAnswer() to return follow-up prompts inline for display during the conversation, and sessionMode valued postCall configures pendingFollowUps() as the only producer of prompts <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] Adding or rewriting an entry in the QUESTIONS array changes data only, and re-running checkQuestionBank() is the sole verification step before that entry is used in a meeting <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] Answer rows are read back per business through a lookup keyed by the business record id, so a later audit run consumes areaCoverage() and countableHours() without repeating the interview <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] listQuestions() completes over the full QUESTIONS array with no network read, so the interview can be driven in a room with no connection <!-- type:Operate --> <!-- signoff: unsigned -->
