# VisionAIry CRM + StockerAI: build source of truth

Version: 1.1 | Approved: 2026-09-21 | Status: APPROVED

## Purpose and authority

Expand the existing CRM so Russ can manage VisionAIry consulting outreach and StockerAI operator outreach in one application, switching between product tabs. Preserve existing working behavior and records.

Russ approved this specification on 2026-09-21 with the amendment that drip scheduling uses business days only. Recommendations are accepted as the build direction. Explicit verification items remain gates, not assumed facts.

The VisionAIry CRM — Architecture & Control ChatGPT Project controls product and architecture decisions. This file is the proposed matching repository specification. It has not yet been published to that Project. Version 1.0 is approved by Russ in this task. AGENTS.md continues to govern permissions and safety.

After approval, maintain a version, date, decision log, and matching copy in both locations. If copies disagree, report the discrepancy and resolve it before dependent implementation. Do not silently choose one or change intended behavior.

## 1. Agreed scope

- One CRM with VisionAIry and StockerAI product tabs.
- Preserve current VisionAIry records, messages, selections, schedules, delivery history, and working functions.
- StockerAI promotes a specific product to small and midsize vending operators. It does not inherit the consulting offer or free 15-minute review CTA.
- Use the supplied operator list as the starting material. It contains 70 operator entries; it is not proof that all addresses remain valid or that websites have been fully researched.
- Existing StockerAI draft emails are source material. Research and enrich operator contacts and company context before drafting personalized campaigns when website research is specifically authorized.
- Four or five StockerAI emails are appropriate. The five-message schedule below is approved; final personalized copy remains subject to review.
- Correct public URL: https://www.stocker-ai.com/.
- No recipient is automatically selected, whether a person or a general inbox.
- Website research requires specific approval. Each invocation covers at most 50 websites, followed by a completion audit before another cohort begins.
- Do not impose arbitrary spending ceilings. Paid processing must follow the existing authorization and budget rules.

## 2. Proposed everyday experience

RECOMMENDATION: retain the familiar CRM workflow and add an unmistakable product selector above it. Switching products changes the companies being worked, recipient choices, message sequences, sending queue, replies, and progress totals. Every page and confirmation identifies its product.

Within each product, follow the approved direction: Today, Prepare, Send, Replies & Sales, Businesses, and Reports. This project does not require rebuilding every screen or completing the entire earlier redesign first.

Keep the familiar company accordion: expand a company to see recipients and positions, then expand a recipient to review their sequence. Show general inboxes as selectable recipients, not fictitious people. Preserve bulk selection saving and useful filters.

Switching tabs must not silently discard unsaved choices. Recommended behavior: warn and offer Save or Discard before switching; failed saves leave the user on the current product with their edits intact.

A recipient can be inspected without being selected. Selection and enrollment must not require duplicate approval checkboxes. StockerAI starts paused until the approved launch process is completed.

## 3. Product separation requirements

RECOMMENDATIONS FOR APPROVAL:

| Information or behavior | Scope |
| --- | --- |
| Company identity, contacts, source pages, factual research | May be shared when they describe the same real business |
| Product membership and qualification | Separate for each product |
| Recipient selection | Separate for each product |
| Enrollment, sequence version, draft approval, schedule, delivery history | Separate for each product and recipient |
| Sender identity, signature, offer, links, sequence length and cadence | Product-specific |
| Queue, readiness, filters, progress totals | Product-specific |
| Address bounce and explicit do-not-contact protection | Shared safety protection; details in decision D3 |
| Reply handling, sales stage, next action, archive | Scope must be settled in D3, not inherited accidentally from current company-wide fields |

A company or person is not a campaign. The same address must not be duplicated into artificial contact records merely to participate in two products. A general inbox must remain distinguishable from a named person.

Every read and write path must enforce the intended product, including direct links, bulk saves, exports, background jobs, imports, generation, queueing, retries, delivery callbacks, and reports. Hiding another product in the interface is insufficient.

Defaulting old records to VisionAIry is a proposed migration strategy, not permission to alter production. A dry-run mapping and before/after reconciliation must prove that existing delivery state and selection remain unchanged.

## 4. StockerAI product and content reference

Observed sources on 2026-09-21:

- Product repository: https://github.com/My-Stocker-AI/stockerai
- Existing first-email drafts: https://github.com/My-Stocker-AI/stockerai/blob/main/docs/outreach/batch-1-drafts.md (10 first-touch drafts found; no complete approved follow-up sequence established).
- Public website: https://www.stocker-ai.com/
- Pricing: https://www.stocker-ai.com/pricing
- Live demo: https://www.stocker-ai.com/demo
- Supplied target list: attachment 75a7bc80-1321-41c4-8e57-4a7c19b731db, Pasted text.txt. Its research is dated 2026-06-30; its assertions are supplied research, not newly verified facts.

Core proposition: upload an existing supported picking report, hear picking instructions on a smartphone, and keep hands working rather than repeatedly consulting paper or a screen.

Current displayed pricing: 2–5 drivers at $20/driver/month; 6–20 at $18; 21–50 at $15. Two-driver minimum. The site describes a 14-day trial. Confirm these at campaign approval; do not use obsolete draft pricing.

Approved calculator model, deployed separately in StockerAI commit 125a5b72d3c155b11d25c26bee32a9d1eb9bc188:

- Driver slider determines team size and existing subscription tiers.
- Assume one route per driver per workday and five workdays per week.
- Picking hours per route remain adjustable, default 1.5.
- Hourly wage remains adjustable, default $21.
- Estimated picking-time reduction is adjustable from 25% to 35%, default 35%.
- Monthly time value = drivers × hours per route × 5 × 52 ÷ 12 × hourly wage × time-reduction fraction.
- Subtract the tiered subscription separately.
- Five-driver default: $1,194.38 monthly time value, $100 subscription, $1,094.38 after subscription.
- Describe a value of time freed up, not guaranteed payroll savings. Do not equate 35% less time with 35% faster throughput.

Content guardrails: preserve the grounded founder-to-operator style; use evidence-supported personalization; no invented names, roles, route counts, software usage, or savings claims about a particular company; no em dashes. General inboxes receive company-appropriate greetings unless evidence supports a named addressee. Keep the offer distinct from VisionAIry consulting.

The live site has differing statements about supported report formats: some sections name Parlevel, Nayax, and VendSoft as supported, while another says Parlevel is supported today and others are being added. Confirm actual support before making compatibility claims in campaign copy. Historical README URLs and older drafts do not override Russ's corrected public URL.

## 5. Approved sequence

Recommended primary invitation: try the live demo; replies are welcome for questions. Do not require a consultation appointment as the main conversion step.

| Touch | Business day | Distinct purpose |
| --- | --- | --- |
| 1 | 1 | Founder story, familiar picking task, demo invitation |
| 2 | 4 | Fit with existing reports and equipment |
| 3 | 9 | Transparent savings example with stated assumptions |
| 4 | 16 | Address setup, onboarding, and report-format questions |
| 5 | 25 | Respectful final invitation and easy decline |

Business days mean Monday through Friday. The first sending day is business day 1. Count subsequent intervals excluding Saturdays and Sundays, and do not send scheduled campaign messages on weekends. Public-holiday exclusion has not been specified. Confirm the local sending hour before queueing.

Each message must make sense independently. The website research must precede final personalized drafting; the sequence outline alone does not authorize generating or overwriting production messages.

## 6. Research, import, and preparation

1. Prepare an import preview of the 70 supplied entries, including duplicate candidates, source, contact confidence, and missing information. Do not mark the list as fully researched.
2. Import only after specific production-data approval. No imported contact is selected, enrolled, or queued automatically.
3. After specific website-reading approval, read one cohort of at most 50 sites, including relevant About, Team, profile, service, and contact pages. Save page text and provenance. A quick contact scan is not a full read.
4. Confirm discovered people and published email addresses. Preserve generic inboxes without labeling them as people. Do not guess emails or treat discovered staff count as total company size.
5. Audit saved research and contacts against the intended cohort. Retry authorized actionable gaps; list inaccessible sites and unresolved contact identities explicitly.
6. Create product-specific messages using approved copy rules and saved evidence. Preserve existing manually edited messages unless overwriting is specifically authorized.
7. Audit every intended recipient for the approved number of messages, correct order, identity, links, signature, evidence, and readiness.

Readiness must use one shared decision across product screens and sender paths, parameterized for each product's approved sequence and content rules. StockerAI must not be forced to satisfy VisionAIry's consulting CTA or fixed four-message sequence.

## 7. Sending and tracking safeguards

- Selection, message completeness, research, reply/bounce stops, do-not-contact, archive, and presentation are rechecked immediately before sending.
- Use the existing delivery idempotency protections so retries do not create duplicate emails. Hold uncertain delivery outcomes for reconciliation rather than blindly retrying.
- Scheduling uses the correct product, recipient, sequence version, sender, and cadence. Changing the active screen tab cannot change a scheduled job's scope.
- Track prepared, selected, queued, sent, failed, stopped, and uncertain counts separately. Do not label incomplete or merely drafted campaigns as sent or complete.
- After each send stage, reconcile intended due messages with provider-confirmed outcomes. Report omissions, unexpected sends, duplicates, and exceptions.
- Keep the whole product backlog visible separately from the current cohort.
- No new automatic LinkedIn sending is included. Preserve existing LinkedIn functions and approval boundaries.

## 8. Implementation and acceptance gates

| Stage | Deliverable | Completion evidence |
| --- | --- | --- |
| 0 | Approved specification and reliable local source copy | Resolved decisions; documented repository baseline; no unexplained deleted files included |
| 1 | Product separation design and migration preview | Trace all affected reads/writes/jobs; prove mapping of legacy VisionAIry records |
| 2 | Local implementation and disposable-database testing | Product tabs, isolated choices and drafts, independent sequence lengths, unchanged legacy behavior |
| 3 | Approved production migration/deployment | Before/after read-only reconciliation; existing schedules, selections, and messages preserved |
| 4 | Approved list import and research cohort | Intended entries reconcile to saved records, duplicates, missing data, and exceptions |
| 5 | Message review and approved test delivery | All intended sequences complete; actual delivered rendering, sender, links, signature, and reply routing checked |
| 6 | Approved initial outreach | Due-versus-delivered reconciliation; correct follow-up and stop behavior; accurate product totals |

Required test cases include: same company in both products; same contact in both; general inbox only; no selected contacts; bulk saves across companies; unsaved tab switching; incorrect-product direct requests rejected; four-touch versus five-touch campaigns; replies and bounces; duplicate delivery retries; uncertain delivery; legacy VisionAIry queue unaffected; one product's counts exclude the other; background work uses explicit product scope.

At every gate record completed records, actionable gaps, failures, intentional holds, and uncertain deliveries. Do not declare completion while an eligible intended record is unfinished. Do not promise absolute absence of errors; state what was verified and what remains unknown.

Production data changes, production migrations, pushes, deployments, and real emails each require specific approval under AGENTS.md. Approval of this specification does not waive those boundaries.

## 9. Decisions needed before dependent implementation

| ID | Decision | Recommendation / known evidence |
| --- | --- | --- |
| D1 | StockerAI sender and reply address | Approved by Russ: russ@visionairy.biz for sender and replies, through Resend. Verify sender ownership and reply monitoring before enabling delivery. |
| D2 | Sequence length and timing | Approved: five messages on business days 1, 4, 9, 16, and 25, Monday through Friday only. Approved send time: 10 AM America/Los_Angeles (Pacific), weekdays. |
| D3 | Cross-product stops and sales state | Recommend address bounces and explicit global do-not-contact block both; a normal reply pauses that recipient's responding-product campaign, with a visible alert if another product is active. Sales stage, next action, and product archive remain separate. Confirm scope and how to handle unsubscribe requests before coding. |
| D4 | StockerAI qualification and content facts | Use vending-operator fit rather than consulting automation score. Confirm supported report formats and final messaging claims. Do not invent a new scoring system. |

## 10. Current state and change log

- 2026-09-21: Russ agreed to establish an SOT before the multi-product build. This draft records agreed scope separately from recommendations.
- StockerAI calculator correction is live and Russ confirmed the website is right.
- No multi-product CRM implementation, prospect import, new operator website reading, or StockerAI email sending has been performed as part of this specification.
- Local CRM workspace currently reports numerous missing tracked files and previously showed a missing Git history object. Cause is unknown. Preserve it; establish a verified clean baseline without treating those deletions as intentional changes.
- No production campaign counts are certified by this document. Establish fresh read-only baselines before any migration or import.

Approval record: Russ approved the SOT in this task on 2026-09-21, with business-day-only drip scheduling. Architecture & Control Project copy: pending.

- Version 1.0: approved specification and recommended direction; drip intervals and sending exclude weekends. Explicit verification gates remain before dependent work.


## Approved addition: responses, calls, actions and follow-up dates

Russ explicitly requested and approved full sales follow-through for both products on 2026-09-21. Record replies and conversation history with who and when; calls with person, notes and outcome; completed actions and open tasks; next action and due date; overdue visibility and sales status. Scope these records to the product/company relationship while preserving the shared company/contact identities. A StockerAI response, call, action or next-action date must not overwrite the VisionAIry history or follow-up. Include this separation in acceptance tests. Existing stop rules still apply; recording a normal reply stops that recipient's responding-product enrollment. Automatic reply ingestion, manual logging, and scheduled reminders must be distinguished in completion reports.

- 2026-09-21 sender/time clarification: Russ specified russ@visionairy.biz and 10 AM Pacific. Resend confirmed as the sending provider. Reply tracking must be verified; preserving the existing monitored forwarding route versus direct inbox monitoring is pending Russ's choice.

- 2026-09-21 reply decision: Russ said to use the same email. Continue the existing VisionAIry Resend sender and monitored reply-forwarding arrangement, delivering replies to russ@visionairy.biz. No independent Google inbox or new mailbox is required. Product routing and an end-to-end test remain launch gates.
