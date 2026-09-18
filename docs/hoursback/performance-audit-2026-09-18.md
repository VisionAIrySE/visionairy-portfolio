# CRM performance and workflow audit, 18 September 2026

## Scope and limits

Audited local main at `74fd751`: Render entry point, Email, company, business-list,
pipeline, Today and progress screens; recipient saves; campaign preparation;
follow-up scheduling and delivery; replies; website readers; schema and deployment
configuration. This is a source audit with offline executable characterization,
not a production load test. No production database, website reading, paid model,
provider send, push, deployment, or migration was run for this audit.

FACT means executable source or a local simulation supports the statement.
INFERENCE means likely impact, not measured live. UNKNOWN means production
measurement or external configuration is still required. Database call counts
below are ORM method calls, not measured SQL statements or elapsed seconds.

## Highest-priority findings

### 1. Email loads the backlog before choosing the 25 visible companies

**FACT.** `scripts/hoursback/crm-app.js:1112`, `emailScreen`, loads every matching
prospect with contacts and all active message bodies at line 1189. It fetches an
overlapping global company/contact/message set at line 1239 and all started first
messages at line 1272. Only afterward does it select 25 visible companies at
line 1339. `pendingBatch` (`src/hoursback/crm/lanes.js:968`) also fetches whole
after-call messages and companies although the UI previews five.

Reads: prospects, contacts, messages, research presence, delivery history.
Writes: process-local display order only. No database write on this GET.
**INFERENCE:** growing message bodies dominate transfer, allocation, and response
time. The save redirect pays this cost again.

Fix: compute eligibility and counts using lightweight address/status fields;
load full bodies only for the visible 25 companies, then consider loading a
contact's chain when expanded. Preserve global counts, ordering and the ANY
unstarted-address filter. Do not apply a premature SQL limit that hides matching
companies. Verify mixed sent/unsent contacts and selected company inboxes.

### 2. Follow-up scheduling repeatedly scans the same company

**FACT.** `src/hoursback/crm/lanes.js:1009`, `queueNextTouch`, rereads template,
company, recipient, sent history and contacts each time it advances one recipient.
For each previously inspected due recipient it queries possible follow-ups again.
`queueDueTouches:1108` calls this function repeatedly, up to 50 times per company.

Offline reproduction: `node scripts/hoursback/audit-scheduler-query-cost.cjs`.
One company, every selected recipient has a sent first and a draft day-four
follow-up, all due, approved template:

| Recipients | Read calls | Follow-up lookup calls | Queued | Left in draft |
| --- | ---: | ---: | ---: | ---: |
| 1 | 13 | 2 | 1 | 0 |
| 15 | 216 | 135 | 15 | 0 |
| 23 | 420 | 299 | 23 | 0 |
| 50 | 1,526 | 1,275 | 50 | 0 |
| 51 | 1,526 | 1,275 | 50 | 1 |

Reads: approval, selection and campaign history. Writes: draft-to-queued changes;
the real implementation can create missing follow-ups. No provider calls here.
**INFERENCE:** this is a major avoidable scheduler delay, with roughly quadratic
lookup growth. The 51st due recipient remaining in draft is reproduced, not an
assertion that a current production company has that many due recipients.

Fix: load one company snapshot, group messages by normalized address and touch,
calculate all due changes, apply bounded writes. Replace the 50-pass algorithm
with finite traversal of the actual recipients. Preserve fresh stop/selection
checks at delivery, per-person timing, and uncertain-delivery protection.

### 3. Sender materializes repeated copies of a company's campaign history

**FACT.** `lanes.js:1176`, `sendQueuedEmails`, loads queued messages with nested
prospect, contacts and the company's complete email history on each message.
It deduplicates sibling messages only after this result has been materialized.
For N queued recipients and M historical company messages, the returned object
graph can contain N copies of M metadata rows. At the normal maximum,
`take` becomes undefined.

**INFERENCE:** this repeats the memory-risk pattern previously removed from the
Email page. Actual heap usage and the cause of past Render restarts are UNKNOWN.
Fix: bounded queue pages with stable ordering; fetch shared company data once
per page. A page size controls memory, not the user's daily sending allowance.
Keep delivery claims and immediate pre-send reads in `crm/delivery.js`.

### 4. Saving selections still includes preparation and serial queue writes

**FACT.** `crm-app.js:1064`, `saveEmailRecipientChoices`, saves choices, calls
`ensureSelectedFirstDrafts`, then `syncSelectedEmailCampaigns`. The latter reads
all email messages and performs individual sequential queue-state updates
(`lanes.js:250`). The earlier local fix `74fd751` removes redundant existing
draft rebuilds but does not eliminate these costs or the page reload.

Reads/writes: recipient choices, inbox choice, campaign drafts and queue state.
Fix: make the company's selection changes atomic; batch compatible queue updates
and avoid unchanged writes. If preparation becomes asynchronous, show separate
truthful 'choices saved' and 'campaign preparation' states. Never announce success
before persistence, and never skip readiness checks to improve the spinner.

### 5. Bulk-save failures can be misreported after partial changes

**FACT.** `crm-app.js:2963`, recipients-all handler, catches every error and returns
`saved:false`; the notice says affected companies 'were not changed because the
record changed'. `saveEmailRecipientChoices` is not one enclosing transaction:
selection writes may finish before preparation or readiness fails.

**INFERENCE:** a user can retry unnecessarily or misunderstand what persisted.
Fix: atomic choice persistence, report preparation separately, retain failed
company identifiers and reasons, retry only unfinished operations. Test injected
failure after saving choices, mixed successful/failed companies, and stale forms.

## Other material findings

### 6. Company saves can launch an unrequested quick website scan

**FACT.** `crm-app.js:2288`, `saveBusiness`, always calls `refreshInBackground`.
That invokes `refreshProspect` without `readSite:false`; `src/hoursback/refresh.js:291`
defaults reading on and scans when site status is absent and a website exists.
`src/hoursback/enrich.js:18` limits this quick reader to five pages. This is a
different reader from full research, not proof that the full reader has a
five-page limit. The process-local BUSY set only deduplicates one company within
one running server; it has no overall concurrency bound or durable completion.

Writes/side effects: enrichment, scoring, stage and possible draft preparation;
external website requests. This conflicts with Russ's later explicit-reading
approval instruction. Fix: ordinary saves perform local recalculation only;
explicit authorized research uses a durable bounded job and saved completion.
Preserve the at-most-50-websites cohort rule. Test save-without-read and restarts.

### 7. Progress counters use an older definition of completion

**FACT.** `crm-app.js:658`, `progressScreen`, counts company-level email fields
without contact emails, groups all readings with pages, and computes a `ready`
variable from presence of a reader-version record rather than four-message
recipient completeness. It sends read IDs back to the database in serial batches
of 200. These are different predicates from recipient campaign readiness.

Reads only. **INFERENCE:** this adds unnecessary work and can explain conflicting
progress explanations, but exact production discrepancies were not measured.
Fix: shared recipient-level status computation, database aggregates where useful,
distinct labels for company research, reachable addresses and complete campaigns.
Test contact-only email, general inbox, partial reads and partially completed chains.

### 8. Company edits issue repeated reads and writes per field

**FACT.** `saveBusiness:2288` reads the company then invokes
`src/hoursback/overrides.js:setOverride` per changed field. Each call rereads the
company, updates it, and adds history separately. Background refresh rereads
after changes to trade, score and stage (`refresh.js:313`).

Fix: one snapshot, one company update and batched history within a transaction;
preserve manual-field priority, pricing, quote protections and history. Avoid
parallelizing dependent score/trade operations using stale values.

### 9. Company page performs sequential edit-offer checks and full reload polling

**FACT.** `businessCard:1905` loads all unsent messages including historical
suppressed rows before canonical filtering. It awaits `spreadOffer:190` per
message, which may query approved wording per eligible edit. During refresh
the page reloads every six seconds (`crm-app.js:2007`).

Fix: prefilter relevant messages; fetch shared wording once per request; poll
small job-status results, refreshing only affected content. Avoid replacing
unsaved text. Request-local reuse is safer than persistent readiness caching.

### 10. Campaign writing repeats company evidence for every recipient

**FACT.** `scripts/hoursback/write-the-whole-sequence.cjs:575` fetches the latest
noticing reading with all findings inside the per-recipient worker. It then
queries each follow-up slot individually at line 674. Existing missing-only,
manual-edit, sent-message and passing-content guards already prevent some
unnecessary paid writing. Concurrency is bounded by `AT_ONCE`.

Fix: share immutable company evidence and preloaded campaign metadata within
the authorized batch; retain individual role prompts and per-recipient checks.
Do not cache one recipient's generated language for another. Recheck mutable
message state before saving. Validate second-run no-op behavior and actual charges.

### 11. Resume repeats stages and arbitrary default budgets remain

**FACT.** `prepare-openrouter-campaign-batch.cjs:33` skips research and its audit
on resume but always reruns contact audit, evidence enhancement and writing;
there is no per-stage completed checkpoint in that controller. It supplies a
$1 reading limit by default and $5 writing limit, while enhancement defaults
to $1/$1.50 and the shared OpenRouter pool defaults to $2.

**UNKNOWN:** whether any given past run used explicit overrides or no-limit mode.
These defaults are not evidence of Russ approving those amounts. They conflict
with his standing instruction if applied without specific approval.
Fix: require an explicit budget choice or explicit no-added-limit choice;
save cohort IDs and stage outcomes, resume only actionable gaps, audit again.
Keep append-only evidence: do not skip recording new findings merely because a
page's text is unchanged. No budget was chosen or paid request made by this audit.

### 12. Reply forwarding waits for every attachment before acknowledging webhook

**FACT.** `crm-app.js:2775` awaits `forwardReceived` before returning success.
`src/hoursback/crm/resendReplies.js:41-105` retrieves attachments sequentially,
buffers them in memory as base64, and has no explicit application timeout on
those fetches. The forwarding idempotency key is already present.

**INFERENCE:** large or slow attachments prolong webhook requests, use memory
and can cause provider retries. Fix: persist receipt and stop state promptly,
queue durable forwarding with bounded attachment handling and explicit timeouts.
Do not acknowledge before durable recording or blindly retry uncertain sends.

### 13. Database indexes need query-plan review

**FACT:** `prisma/schema.prisma` has message prospect/lane and state indexes,
delivery lease indexes, contact prospect/email indexes and research indexes.
It defines no secondary Prospect indexes for the common active/score/trade
list queries, and no field-edit prospect/field/date index.
**UNKNOWN:** live indexes, query plans, table sizes and whether missing indexes
are a material bottleneck. Inspect read-only plans before proposing a migration;
do not add speculative indexes, which also cost storage and write time.

### 14. Unbounded secondary screens and full exports

**FACT.** `pipelineScreen:596` loads all live companies and latest call logs;
`followUpQueue` loads all overdue companies; `moneyScreen:780` loads unbounded
unpaid quotes/customers; export (`crm-app.js:2840`) loads all companies before
JSON serialization. Business list and missing-email screens already paginate.
Fix: paginate large lists and stream exports; aggregate counts independently.
Maintain full result access and correct totals.

### 15. Runtime scope, stale documentation and missing performance evidence

**FACT.** Render's checked-in entry point is `scripts/hoursback/crm-app.js`, a
Node HTML server. The root build/dev scripts target Vite/React, and Render
installs the full root package tree. Do not optimize the React UI assuming it
serves the CRM. Dependency separation may reduce build size/time but requires
an import audit; no package is proven safe to remove here.

Render YAML describes a free web plan and an inactive cron; live configuration
is UNKNOWN in this audit. Historical CLAUDE instructions demand spending ceilings
and local Claude, contrary to later user/AGENTS instructions. Comments in
`lanes.js` still describe old daily caps. Treat executable logic as evidence.

No route-level duration/query-count/memory instrumentation was found in the
active server. Add redacted timing and operation counts before release; avoid
logging email contents, addresses or secrets. Repair the local Prisma dependency
setup before claiming full database integration verification.

## Areas already doing useful work

- Recipient saves use four bounded company workers and submit changed companies.
- `74fd751` avoids rebuilding existing first campaigns.
- Full reading and browser fallback are separate; browser instance reuse and
  fallback guards exist in `browserRead.js`.
- Full crawl tracks visited paths and saves partial/failure evidence; preserve
  completeness and site politeness rather than blindly increasing concurrency.
- Writer protects manual edits and sent messages, supports missing-only work,
  uses bounded workers and checks saved results.
- Delivery claims, idempotency, uncertain-outcome holds and fresh suppression
  checks are intentional safeguards, not redundant work to delete.

## Implementation and completion order

1. Instrument save, Email page, scheduling and delivery. Fix misleading partial
   save outcomes, implicit research and unapproved budget defaults.
2. Reduce Email payloads and save reload work; verify counts and recipient
   choices across company and Email screens, including new addresses.
3. Replace repeated follow-up scans; bound sender memory. Test 1, 15, 23, 50,
   51 and 100 recipients, due dates, replies, bounces, unselected contacts,
   duplicate first drafts and uncertain delivery. Preserve unlimited total sends.
4. Unify progress definitions, batch company edits and reuse writing evidence;
   add durable stage checkpoints and forwarding work where required.
5. Measure read-only production query plans and runtime timing; propose only
   supported indexes, then obtain approval before production migration/deployment.

Each stage closes with expected-versus-actual outcome checks, remaining exceptions,
and measured query/payload changes. Do not call a speed change complete based on
a spinner disappearing. A production release needs live verification; no exact
seconds or percentage improvement is promised without those measurements.

## Validation performed

- Offline scheduler characterization above reproduced query growth and the
  51-recipient gap. No Prisma client or database is used by that harness.
- 31 targeted offline tests passed across recipient drafting, Email progress,
  selected-draft lineup, scheduled gaps, delivered-first protection, delivery
  claims and inbox selection.
- Source tracing across the listed active and supporting areas.
- Full production load testing, real database integration, live Render metrics
  and query plans remain unverified. Existing safety tests passing does not
  establish that the performance findings or all workflow defects are fixed.

This audit adds only this report and an offline measurement script. Application
behavior is unchanged; the earlier save optimization remains local at `74fd751`.


## Implementation update after Russ approved the corrections

The preceding report is the baseline, not a claim that every recommendation is
implemented. The offline scheduler harness now measures the corrected code.

Implemented in this release:

- Email backlog queries omit bodies; full text is fetched only for the 25 displayed
  companies. Removed the unused sample-message query.
- Follow-up scheduling visits a company once and caches its touch lookups. The
  reproduced 23-recipient case dropped from 420 to 7 read calls; 51 and 100 due
  recipients all advance. The 50-websites-per-approved-research-batch rule is unchanged.
- Sender uses bounded pages and one shared company history per page. A real local
  database test found that an ID cursor combined with changing queue states could
  prematurely end traversal; explicit score/ID boundaries now avoid that problem.
  Tied and null scores are exercised. Page size is not a sending quota.
- Recipient choices and inbox choice commit atomically; unchanged contact flags
  are not rewritten. A later preparation failure is reported as saved choices
  needing preparation, with links to affected companies.
- Ordinary company saves explicitly disable website reading.
- Progress counts company research and recipient campaigns separately, includes
  contact-only emails, and distinguishes four messages written from selected/queued.
- Multi-field company edits use one transaction and retain per-field history.
- Company edit-offer checks reuse approved wording within the request.
- Campaign writing reuses immutable company evidence within a run; recipient text,
  role, edit protections and delivery checks remain separate.
- Paid preparation requires explicit spending choices; no default dollar ceilings
  are supplied by the changed controller, reader, enhancer, writer or model pool.
- Reply attachment retrieval uses two bounded workers and explicit fetch timeouts.
- Request logs record route category, elapsed time and heap usage without contact
  identities, message contents, query strings or secrets.

Validation:

- All 336 executable specification checks passed on the disposable local database.
- The broad unit run passed 234 checks; two test files initially could not resolve
  the isolated Prisma runtime. Rerunning those files with the correct NODE_PATH
  passed all 27 of their checks. No test assertion was weakened for that setup issue.
- The new end-to-end local test passes choice save/clear/reselect, field history,
  108-message pagination while states change, visible-only Email message bodies,
  Progress rendering and the bulk-save HTTP path.
- Syntax checks and diff whitespace checks pass.
- No production records, schema, customer messages or website readings were changed
  while implementing/testing. The earlier 74fd751 deployment was separately approved
  and Russ confirmed it deployed.

Read-only production inspection was completed after the baseline audit. The CRM
uses the hoursback schema. Prospect has only its primary and placeId indexes;
ProspectFieldEdit has only its primary index. EXPLAIN for the active-business score
query estimates a sequential scan and sort of about 34,230 rows. These are planner
estimates, not measured runtime or a new business-backlog count. No index was added.

Remaining recommendations, deliberately not represented as completed fixes:

- Durable research/forwarding jobs and exact-cohort resume checkpoints still need
  implementation and failure/restart testing. Reply forwarding still runs inside
  its webhook request, now with timeouts and bounded attachment concurrency.
- Secondary-screen pagination/export streaming and removal of full company-page
  reload polling remain follow-up work. Some lightweight Email metadata still spans
  the backlog; this release primarily removes bulk message text from that load.
- Index migrations should follow a reviewed database change with production approval.
- Dependency separation and historical-file cleanup require an import/use inventory;
  nothing was deleted merely because it looked old.
- Live timing/memory measurements are still required after deploying this release.
