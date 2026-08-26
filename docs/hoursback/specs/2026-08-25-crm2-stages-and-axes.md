# XFFI Spec — Hours Back CRM stage ladder and independent status axes
Generated: 2026-08-25
Intent: Give every prospect one position on a six-step ladder, and keep everything else that describes it on separate axes that the ladder never absorbs — what happened on each dial, whether the business asked never to be called again, how many attempts have been spent, and why a record left the ladder.
<!-- xfxa-status: unverified -->

## Roots

- docs/hoursback/code-layout.md
- docs/hoursback/business-model.md
- docs/hoursback/specs/2026-08-25-crm1-record-and-quote.md
- /home/visionairy/Veristone/builderflow/prisma/schema.prisma

## Terminals

Build

  six-step-ladder
  - [x] The stages module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/stages.js |  -->
  - [x] The ladder declares exactly six values in order: NO_CONTACT, INITIAL_CONTACT, ACTIVE, IN_PROCESS, CUSTOMER, EXPANDED_CUSTOMER, and no seventh. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=ladder_has_exactly_six_values | 0 -->
  - [x] A new prospect written by the list builder starts at NO_CONTACT. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=new_prospect_starts_no_contact | 0 -->
  - [x] A prospect reaches CUSTOMER only through ACTIVE and IN_PROCESS, never by skipping either. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=ladder_no_skipping | 0 -->
  - [x] EXPANDED_CUSTOMER is reachable only from CUSTOMER. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=expanded_only_from_customer | 0 -->

  call-outcome-axis
  - [x] Call outcomes declare NO_ANSWER, VOICEMAIL, GATEKEEPER, WRONG_NUMBER, NOT_INTERESTED and INTERESTED. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=call_outcomes_declared | 0 -->
  - [x] Writing a call outcome never changes a prospect's stage. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=outcome_does_not_move_stage | 0 -->
  - [x] Changing a stage never writes a call outcome. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=stage_does_not_write_outcome | 0 -->
  - [x] Every dial appends a call log row rather than overwriting the previous one. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=call_log_is_append_only | 0 -->

  do-not-contact-suppression
  - [x] doNotContact is declared on the prospect record and defaults to false. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=do_not_contact_declared | 0 -->
  - [x] A prospect with doNotContact true is absent from the call queue, the follow-up queue and every send list. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=do_not_contact_absent_everywhere | 0 -->
  - [x] Suppression is applied inside the queries themselves, so a new caller cannot forget to filter for it. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=suppression_enforced_at_read | 0 -->
  - [x] A monthly top-up that re-finds a suppressed business leaves doNotContact true. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=suppression_survives_refresh | 0 -->

  attempts-dormancy-and-exit
  - [x] attemptCount increments on every dial and is never reset by a stage change. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=attempt_count_increments | 0 -->
  - [x] A prospect reaching the configured give-up threshold with no reply becomes DORMANT automatically. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=give_up_retires_to_dormant | 0 -->
  - [x] The give-up threshold is read from configuration, not hardcoded. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=give_up_threshold_configured | 0 -->
  - [x] lostReason and reactivateAfter are written whenever a prospect leaves the ladder. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=exit_records_reason_and_reactivation | 0 -->
  - [x] A dormant prospect whose reactivateAfter date has passed returns to the call queue; one with doNotContact true never does. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=reactivation_respects_suppression | 0 -->

Understand

- [x] The give-up threshold's source of truth is the business model's cadence section. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | Three touches, no reply -->
- [x] The record these axes sit on is defined by the CRM record spec. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-25-crm1-record-and-quote.md |  -->
- [x] The code layout names where the stages module lives. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/code-layout.md | src/hoursback/crm/stages.js -->

Specify

- [x] The schema validates with the ladder and every axis declared. <!-- type:Specify --> <!-- check: exit_code | npx prisma validate | 0 -->
- [x] Prospects already written by the list builder are backfilled to NO_CONTACT with a zero attempt count. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=backfill_existing_prospects | 0 -->

Operate

- [x] The check runner exists. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [x] The full suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
