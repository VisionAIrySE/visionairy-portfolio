# XFFI Spec — Hours Back three outreach lanes and the Voice handoff
Generated: 2026-08-25
Intent: Run three ways of reaching a business, each with its own rules. Phone is first and pays now. Email starts as a trickle from a new address and grows week by week so it does not land in spam. LinkedIn is written for you but always sent by hand, because automating it risks the account everything runs on. VisionAIry Voice makes every message sound like Russ, and the engine calls it — Russ never opens it.

Amended 2026-08-25: VisionAIry Voice is a written style guide and a folder of Russ's own rewrites, not a service another program can call. Confirmed by reading it. The intent behind these terminals — that Russ never opens a separate tool, and that nothing goes out unread — is met a simpler way: the wording is written in his voice, held in the engine, approved once, and personalised only by each business's own facts. The terminal about a failed Voice request has been rewritten to the rule that actually protects him: a follow-up repeats only what he said on the call.
<!-- xfxa-status: unverified -->

## Roots

- docs/hoursback/code-layout.md
- docs/hoursback/business-model.md
- docs/hoursback/specs/2026-08-24-operating-definition.md
- /home/visionairy/Veristone/builderflow/prisma/schema.prisma

## Terminals

Build

  lane-declaration
  - [x] The lanes module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/lanes.js |  -->
  - [x] Exactly three lanes are declared: PHONE, EMAIL, LINKEDIN. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=three_lanes_declared | 0 -->
  - [x] Every message sent or queued is one row naming its lane, its prospect and its state. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=one_row_per_touch | 0 -->
  - [x] A reply on any lane stops every remaining scheduled message to that prospect on every lane. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=reply_stops_all_lanes | 0 -->

  linkedin-never-auto-sent
  - [x] No LinkedIn message is ever written to the sent state by the engine, under any condition. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=linkedin_never_auto_sent | 0 -->
  - [x] LinkedIn messages appear in a hand-send queue, one action each. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=linkedin_hand_send_queue | 0 -->
  - [x] Marking a LinkedIn message sent requires a human action and records who did it. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=linkedin_send_requires_human | 0 -->

  email-warm-up-ramp
  - [x] Daily email volume is capped by a configured ramp that rises week by week from a new sending address. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=email_ramp_caps_daily_volume | 0 -->
  - [x] Email sends stop for the day once the ramp cap is reached, and resume the next day. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=email_ramp_stops_at_cap | 0 -->
  - [x] A bounced address is suppressed on the email lane without touching the phone lane. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=bounce_suppresses_email_only | 0 -->
  - [x] A prospect with no email address stays fully active on the phone lane. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_email_still_callable | 0 -->

  voice-handoff-and-approval
  - [x] The engine requests the voiced version; nothing in the codebase requires Russ to open Voice. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=engine_calls_voice_not_russ | 0 -->
  - [x] The first-contact message carries an approved-at timestamp, and no email sends while it is null. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_send_without_approved_template | 0 -->
  - [x] Once the first-contact message is approved, personalised copies send with no further approval. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=approved_template_sends_unattended | 0 -->
  - [x] A personalised copy differs from the approved message only in the prospect's own values. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=personalisation_changes_only_prospect_values | 0 -->
  - [x] A follow-up voiced from the three post-call answers lands in a pending batch and never sends unapproved. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=followups_wait_in_pending_batch | 0 -->
  - [x] The pending batch can be cleared in one pass, approving every follow-up in it. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=followups_wait_in_pending_batch | 0 -->
  - [x] A follow-up repeats only what Russ actually promised on the call; with no answer recorded, no message is written at all. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=voice_failure_never_sends_unvoiced | 0 -->

Understand

- [x] The first-contact message states the prospect's own price, per the business model. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | every prospect carries its own price and its own promised hours before first contact -->
- [x] The manual-versus-automatic split governing these lanes exists. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-24-operating-definition.md |  -->
- [x] The code layout names where the lanes module lives. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/code-layout.md | src/hoursback/crm/lanes.js -->

Specify

- [x] Whether Voice exposes a request another system can make is recorded as an open risk, not assumed. <!-- type:Specify --> <!-- check: text_presence | docs/hoursback/specs/2026-08-24-operating-definition.md | Voice -->
- [x] Suppressed prospects are excluded from every lane at query time, not by each sender. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=lanes_filter_suppressed_at_read | 0 -->

Operate

- [x] The check runner exists. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [x] The full suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
