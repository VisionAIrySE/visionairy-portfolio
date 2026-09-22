# Multi-product implementation record

2026-09-21. Approved product specification: multi-product-crm-sot.md v1.0.

## Source baseline

Clean isolated checkout: C:/Users/RussWright/AppData/Local/Temp/visionairy-multiproduct.
Remote main: 282464ece7b9133819528bdbb6dbca6132607436.
Original workspace reports 274 status entries, mostly missing tracked files. Left untouched.
Original workspace's unpublished commit 77acf27 was recovered, reviewed and preserved as b6b6a86 in this checkout. Its progress-query-count test passed. Original missing working-tree files remain untouched.

## Executable findings

- prisma/schema.prisma: Prospect owns emailInboxSelected, repliedAt, stage, doNotContact and message/contact relations. Contact.isPrimary owns recipient selection. There is no product membership or campaign enrollment entity.
- src/hoursback/crm/recipientChoiceBatch.js: saveChoices writes Contact.isPrimary and Prospect.emailInboxSelected, then regenerates/synchronizes existing email campaigns. Reusing it for StockerAI would affect VisionAIry choices.
- src/hoursback/crm/lanes.js: approveBatch queues the pending batch without a product scope. touchDue derives timing from elapsed milliseconds and shared FOLLOW_UP_DAYS. StockerAI requires a separate versioned business-day schedule.
- scripts/hoursback/crm-app.js: company/contact views and email filters read the same shared selection fields. A product tab alone cannot enforce separation.

## Concrete implementation design

Keep business identity, real contacts and evidence shared. Introduce Product, ProductProspect membership, recipient enrollment and sequence version records. ProductProspect owns product-level archive, stage and next action. Enrollment owns the selection and progression for an explicit person or business inbox, with a stable recipient identity and address snapshot. A general inbox must not require a fabricated Contact. Enforce product/company/contact consistency transactionally and with constraints where practical.

Associate every campaign message with its enrollment and sequence version. Store product sender configuration independently. Retain delivery keys, frozen payloads, provider IDs and historical outcomes. A version change must not silently rewrite existing enrollments.

Prepare a reversible migration/backfill preview mapping all existing memberships, selections and messages to VisionAIry. Do not use new defaults to select contacts. Reconcile counts and exact identities; do not infer missing historic intent. Execute on disposable database first. No production migration yet.

Replace implicit shared selection and campaign reads with explicit product-scoped services. UI tabs call those services; jobs store and pass product identity rather than relying on the current screen. Validate mismatched product/enrollment IDs before writes. Keep StockerAI disabled for sending until sender, routing, content, research and launch gates are satisfied.

Legacy queue and reply handling require explicit compatibility tests before connecting any new runtime path. Unknown-product requests must fail closed, not fall back to VisionAIry. Keep global address bounce/do-not-contact protections and apply approved reply scope without weakening current legacy stops during transition.

## Completed local stage

Added productSchedule.js: StockerAI sequence version 1, business days 1/4/9/16/25; rejects weekend first dates and invalid calendar dates. Computes calendar dates independently of server timezone or daylight-saving elapsed hours. Caller must supply the configured local date; send-hour/timezone conversion and final weekend send guard still need integration.

Four dependency-free tests passed: exact Monday schedule, Friday schedule across daylight saving, invalid dates/weekend rejection, immutable sequence definition. No application runtime imports this module yet. These tests prove scheduling arithmetic only, not end-to-end sending.

## Next gates

1. Implement schema and membership/enrollment services with isolation tests on disposable database.
2. Migrate legacy runtime through explicit scoped services; verify all existing behavior.
3. Add product tabs and scoped preparation/review/send/report screens.
4. Confirm sender/reply configuration, timezone/send hour and report support before launch.
5. Obtain specific production migration/deploy/import/research/send approvals as each stage becomes concrete.

No production data, research, generated outreach or real sends in this stage. No push or deployment.

## Product membership/enrollment foundation completed locally

Added five additive models: CRMProduct, ProductProspect, ProductRecipient, ProductSequence and ProductEnrollment. Product sending defaults off; recipient selection defaults false; enrollment defaults DRAFT. No existing database column was removed or rewritten. Composite foreign keys prevent crossing products between membership, recipient, sequence and enrollment.

Added productEnrollment.js services for explicit membership, atomic scoped recipient choices and idempotent draft enrollment. Reject unknown products, wrong-company contacts, unavailable contacts, duplicate selected addresses, changed recipient addresses, archived memberships, company email stops and recipient replies. These services do not touch legacy Contact.isPrimary, Prospect.emailInboxSelected or OutreachMessage, and do not generate, queue or send.

Prisma 6.19.3 validated the schema. Applied only to localhost:55432 / hoursback_test / product_build_test with DATABASE_URL and DIRECT_URL both local. Prepared migration 20260921000000_product_enrollment_foundation from schema diff; not applied to production. Two real-database integration tests and four schedule tests passed. Integration tests cover cross-product selections/enrollments, unchanged legacy choices, wrong-company IDs, duplicate enrollment, reply stop, direct database FK enforcement, and rolled-back fixtures.

Stage limitations: new services have no callers in the live application. Message-to-enrollment linkage, global address stop registry, concurrency stress tests, legacy backfill preview, full regression suite, UI integration and sender integration remain. No production-ready claim is made. Existing unpushed progress fix 77acf27 still requires separate reconciliation before any release.

## Draft messages and preparation preview

Added ProductMessage with a composite product/enrollment foreign key and unique enrollment/touch. Draft storage is separate from OutreachMessage so the legacy sender cannot accidentally pick it up. ProductMessages validates ownership, sequence length, nonempty content, single-line subject and no em dash; automatic generation cannot overwrite manually edited drafts; started/stopped campaigns cannot be rewritten by this draft API.

Added scoped, paginated productWorkspace reads and escaped company/recipient/sequence preview. crm-app exposes /products/:id only behind CRM_PRODUCT_PREVIEW=1 after normal authentication; preview accepts GET only and returns 404 for unknown products. Feature off by default. StockerAI preview uses its own page so legacy unscoped actions are not presented as StockerAI actions. No claim of full product-tab integration yet.

Expanded the disposable-database integration test: wrong-product draft rejected, out-of-sequence touch rejected, manual edit preserved, started sequence protected, product B cannot view A's drafts, and new draft storage leaves legacy OutreachMessage empty. All six schedule/integration tests pass; server syntax and diff checks pass. No browser/end-to-end preview check yet. No production data or deployment.

Next: interactive recipient/edit controls with request protection; shared readiness for variable sequence lengths; reviewed legacy mapping; address-level stops and delivery integration. Resolve verified sender settings and send time before enabling sending. Full regression audit remains before release.

## Interactive preparation controls and browser audit

Implemented per-company recipient forms and per-message editors in the protected preview. Form tokens are product-bound; posts require normal authentication, a valid token and bounded URL-encoded bodies. Rendering escapes company/contact/message data. Selection saves are independent from draft preparation so a preparation failure does not falsely report a lost selection. Saving selected recipients prepares only an empty DRAFT enrollment when an approved sequence exists; existing enrollments are not silently switched to a newer version. No generation or sending occurs.

Forms preserve unsaved edits on failures, show save confirmation, update selected counts and recipient labels, and update the saved-message count. A before-unload guard covers unsaved edits. New sequences are accessed via an explicit refresh link to avoid silently discarding edits in other forms. That refresh interaction should be improved before final release.

Eight automated tests passed, including product-bound request tokens and escaped recipient rendering, in addition to real database isolation/draft tests. Tested the actual rendered components and save actions in a local browser harness against a rolled-back database transaction: named person selection, generic inbox selection, save/reload persistence, five message slots with business-day labels, saving a draft, clearing choices, and immediate selected/message-count updates. Browser testing found stale recipient/message-count labels; corrected and reverified. Harness used the actual components/services but not the full authenticated crm-app process, so full route/authentication integration and unsaved-change dialog behavior still need end-to-end coverage.

Preview fixtures were rolled back and preview server stopped. No production changes, live deployment, website research, paid generation, or real emails. StockerAI feature remains disabled by default.

## Product-specific sales tracking foundation

SOT v1.1 records Russ's explicit approval of responses, calls, actions/tasks, next actions/dates and product-separated sales follow-through. Updated the approved SOT in both the original workspace and isolated checkout.

Added ProductActivity (append-only history) and ProductTask (due date and completion timestamp), linked by composite product/membership keys. Added productSales services for manual response/call/action logging, setting next action with recorded change history, dated tasks, completion and due-work retrieval. Normal response logging requires an identified product recipient and atomically stops that recipient's product enrollment; no legacy company reply field is touched. Call events require outcome and notes. Due dates use date-only semantics; caller supplies the local date for due/overdue comparisons. Services do not choose a send timezone.

Nine test cases across the local suites pass. Sales integration checks same-company cross-product isolation, unchanged legacy next action/reply state, wrong-product response/task rejection, idempotent event logging/completion, reply stop, due-date queries and invalid date rejection. All fixtures rolled back. Prisma validation and local schema application passed.

Not yet complete: sales UI, automatic provider reply ingestion, notification/reminder delivery, next-action completion control, sales-stage controls, global stop integration and full authenticated end-to-end audit. These are explicit remaining work, not covered by the foundation tests. No production changes, push, deployment or sends.

## Sales controls connected and browser-checked

Added company-level Responses, calls & follow-up panel with next-action date and completion, product-specific sales status, call/response/action/note logging, dated tasks, task completion and recent history. Activity timestamps display in the browser's local time; task due dates remain date-only with today/overdue labels. Next-action completion checks the expected saved title/date, so an old form cannot complete a newer action. Existing stage vocabulary is reused, not independently redesigned.

Saving sales work refreshes only that sales panel and rebinds its controls, while keeping other company edits intact. When another form in the same panel has unsaved changes, it offers a refresh instead of discarding those edits. Browser verified: save next action and task, reload persistence, complete both, log call, then re-tested immediate task creation/completion with updated counts and history. Test harness uses real services and rendered forms against a rolled-back disposable database transaction, not the full authenticated server.

Nine automated tests pass, including new status isolation and stale next-action rejection. Server and emitted browser-script syntax checks pass. Remaining: paginated complete history beyond the recent 50, full authenticated route tests, automatic inbound-response integration, notifications, sender/readiness integration and full regression audit. The panel is still behind the disabled-by-default preview flag. No live data or deployment.


## Readiness, delivery and integration checkpoint

2026-09-21: Russ corrected the sender/reply preference to russ@visionairy.biz and confirmed 10 AM Pacific. Resend remains the provider. The SOT records this; verification flags remain unset. The existing executable reply flow uses a Resend receiving subdomain and forwards to Russ. A choice between preserving that monitored route and adding direct inbox monitoring is pending; neither is assumed verified.

Added productReadiness shared by the workspace, save responses and delivery service. Batched lookups check explicit selection, current address, company evidence from full website reads, sequence completeness, presentation, reply/bounce stops and verified product configuration. Added global EmailAddressStop and durable ProductMailEvent storage. Replies matching legacy and new product history are held for review instead of guessed; the readiness check blocks subsequent product delivery while a reply is unresolved. Received body retrieval and forwarding are not yet connected.

Added durable claim/payload/idempotency fields, business-day due checking, same-day duplicate prevention, final pre-provider readiness check and uncertain-result holds. productAudit compares an explicit intended campaign cohort before and after processing. Tests use an injected fake sender; no live provider adapter or cron for StockerAI is enabled. A complete customer-facing send/release flow and durable run-level audit storage remain outstanding.

Added floating master recipient save in the preparation preview. Browser verified saving a choice, reload persistence, clearing the last recipient, immediate count and readiness updates. Edits made during a save remain marked unsaved; simultaneous submissions are guarded. Broader bulk failure and navigation tests remain.

Full authenticated localhost HTTP test passed: login gate, invalid request token, select/deselect persistence, five message slots, readiness rendering, unknown product, unsigned webhook rejection and unchanged legacy choices. Temporary test records removed. Browser preview fixtures rolled back.

336 existing CRM checks passed on hoursback_test/product_build_test with provider credentials disabled. 17 new product tests pass (schedule, product isolation, drafts, sales, readiness, fake delivery, event handling, stage audit, full HTTP routes and legacy scope). These results do not certify live provider routing or production migration.

Added a transitional VisionAIry query boundary to crm-app and send-due-emails, enabled only with CRM_PRODUCT_PREVIEW=1. Historical records with no product membership remain visible; explicit other-product-only companies/contacts are excluded; shared VisionAIry membership remains visible. Disposable database tests cover reads, guarded writes and same-transaction creation. Raw legacy queries and array transactions fail closed under this boundary. Remaining independent research/audit/maintenance entry points still need review and adoption before any operator import. StockerAI routes use the explicit product client.

Migration regenerated and schema validated; additive new tables/constraints only, no production execution. Remaining launch gates: legacy tooling isolation, existing-record migration/reconciliation and unpublished 77acf27 preservation, full report/filter/history integration, provider adapter and verified reply forwarding, message content/compatibility approval, import preview and authorized research. StockerAI is not ready for live sending. No production data, external website reads, paid generation, GitHub push, deployment or real emails performed.


## Continued compatibility and provider work

Russ confirmed using the same working email arrangement as VisionAIry. The reply-route decision above is resolved: preserve monitored Resend forwarding to russ@visionairy.biz; verify product-specific matching before launch.

Added productResend adapter using the existing Resend HTTP helper, durable delivery key and frozen payload. Reads the RFC Message-ID after acceptance; failure of that metadata read does not resend an accepted email. ProductMailEvents can retrieve reply text/headers through an injected retrieval adapter and match In-Reply-To to the exact ProductMessage. A test with overlapping legacy delivery history proves an exact StockerAI thread stops StockerAI without changing the legacy company reply field. Adapter tests are mocked; no external provider calls made. Reference: https://resend.com/changelog/message-id-for-sent-emails and https://resend.com/docs/api-reference/emails/retrieve-received-email.

Extended the conditional legacy membership boundary to 67 existing script entry points, listed in product-legacy-entry-points.md. This is a static code change; those research/repair tools were not executed. Exact SET TRANSACTION READ ONLY remains allowed; other raw legacy queries fail closed pending review. Shared feature configuration across all deployment and operator entry points remains a prerequisite to importing StockerAI data. Re-ran existing regression runner with preview flag set: 336/336 passed. Tests explicitly constructing raw disposable clients do not prove every legacy script has been exercised.

Prepared source-only import inventory: 70 operator rows, 69 website addresses, 43 rows with supplied email, 27 without supplied email, no duplicate normalized website strings. This does not deduplicate against production or verify business identity. Preserved source assertions as supplied, not verified research; no automatic recipient choices. No import executed. Added product-wide research summary showing all active memberships independently of the displayed page.

Latest test suite has 20 cases. The full combined run originally exposed a test fixture assertion that counted another concurrent test's temporary product; narrowed the rollback assertion to its own exact fixture IDs, then re-ran successfully. This was test isolation, not a change to production behavior.

Still outstanding: unified existing/new webhook routing and forwarding, live configuration verification, durable run-level send audit and production scheduler integration, filters and full activity history, explicit legacy migration/rollback rehearsal and import application, generation integration with approved StockerAI copy, broader bulk failure tests and scope-flag deployment enforcement. Do not deploy or import based solely on this checkpoint.

## Paused-workspace release checkpoint (2026-09-21)

The following supersedes the earlier outstanding-work list where explicitly resolved:

- Existing verified mail-event endpoint now routes recognized StockerAI events through durable product matching and existing monitored reply forwarding. Unresolved shared-address replies hold both send paths rather than guessing. Provider adapters remain mocked in tests; live routing is not certified.
- Added durable ProductSendRun before/after audits and an explicitly disabled StockerAI scheduler. Scheduler checks Pacific business days and the approved 10 AM hour, uses selected recipients without a second approval checkbox, and reports selected recipients missing campaigns. No Render job created or enabled.
- Added setup and source-list import services. Setup associates historical companies with VisionAIry without editing legacy selections, messages or schedules. Database inserts are chunked within one transaction. Import preserves source provenance, never invents people, and leaves research, selection and messages untouched.
- Read-only production comparison found 32,794 existing companies and no exact normalized-name/domain matches for the 70 supplied operators. This is not proof against fuzzy identity duplicates. The comparison used a verified read-only transaction; no production import occurred.
- Disposable import rehearsal reconciled all 70 supplied operators (43 with supplied email); repeated import creates none again. Setup test crosses the 500-row statement boundary and checks preserved legacy messages and choices.
- All 25 product checks passed together serially. A subsequent recipient/content-change guard added a 26th check; the affected delivery suite passed all 10 tests. Earlier existing regression suite passed 336 checks. No real provider sends or paid model calls.
- Applied the exact additive migration to a separate local schema initialized from the pre-change schema. Schema comparison reported no differences. No production migration ran.
- Immediately before provider delivery, frozen recipient/content/sender payload must still match current saved values; changes hold delivery for review.

Proposed next approval is ONLY the paused workspace rollout: push the three local commits, deploy code, apply the additive migration, and run setup to associate historical records with VisionAIry and create empty StockerAI configuration. Keep StockerAI sending disabled; no operator import, website reads, generated messages or emails. Verify fresh before/after legacy selection/message/schedule counts, authenticate both product views, and inspect logs before calling this stage complete. Do not enable the feature before tables/setup exist. Coordinate the web and existing sender's product-scope setting; do not import other-product records until all relevant entry points are protected.

Remaining after that bounded stage: separately approved operator import and website reading; StockerAI research/generation integration; approved copy and compatibility facts; live signature/rendering/reply verification with an approved test email; full history/filter/report controls; unresolved-reply review; duplicate-address/concurrent-send stress checks; scheduler deployment and explicit sending approval. The paused workspace is not certification of completed outreach functionality.

## Production paused workspace and operator import

The approved paused-workspace rollout completed on 2026-09-21. GitHub and Render deployed fa087d0. The additive migration and setup audit preserved 32,794 VisionAIry memberships, 36 selected company inboxes, 2,783 selected contacts, and 5,462 legacy messages with the same DRAFT/QUEUED/REPLIED/SENT/SUPPRESSED counts. The live VisionAIry view and paused StockerAI view both returned successfully. StockerAI sender and reply verification remain unset and sending remains disabled.

Russ then specifically approved importing the supplied 70 operators. Production reconciliation imported 70, left zero unresolved, retained 43 supplied addresses for review, and created 70 source-provenance notes. It created no recipients, selections, campaigns, messages, or website readings. VisionAIry visibility, selections, and message counts remained unchanged. The live StockerAI page reports 70 companies, 43 addresses on file, and 70 needing research.

Prepared but did not run the first research cohort: 50 exact StockerAI IDs (all 43 with supplied addresses plus 7 without). The reader now requires an explicit product-bound cohort of at most 50 and suppresses VisionAIry-only automation scoring, stalled-build, and legacy stage writes during StockerAI research. Shared website pages, findings, company facts and discovered contacts remain shared as approved; recipient selection remains separate. A dedicated wrapper records actual cost and reconciles qualifying saved full-site readings. Website reading still requires Russ's specific cohort approval and spending choice.
