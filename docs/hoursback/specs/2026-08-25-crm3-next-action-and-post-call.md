# XFFI Spec — Hours Back next-action rule and post-call capture
Generated: 2026-08-25
Intent: Make sure no live prospect is ever sitting with nothing scheduled, and make recording a call take three answers rather than typing. When a call ends the system asks how it went, what happens next, and when — then fills in the record itself and puts any promised callback on the calendar.
<!-- xfxa-status: unverified -->

## Roots

- docs/hoursback/code-layout.md
- docs/hoursback/business-model.md
- docs/hoursback/specs/2026-08-25-crm2-stages-and-axes.md
- docs/hoursback/specs/2026-08-24-operating-definition.md

## Terminals

Build

  next-action-invariant
  - [x] The next-action module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/nextAction.js |  -->
  - [x] Every prospect between INITIAL_CONTACT and CUSTOMER carries a non-null next action and next-action date. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=live_records_have_next_action | 0 -->
  - [x] A live prospect missing either one appears in the leak report, named. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=leak_report_names_offenders | 0 -->
  - [x] The leak report is empty for a fixture set where every live prospect has both. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=leak_report_empty_when_clean | 0 -->
  - [x] Prospects at NO_CONTACT, DORMANT, or with doNotContact true are exempt and never appear in the leak report. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=leak_report_exempts_non_live | 0 -->

  three-answer-capture
  - [x] logCall accepts a prospect and exactly three answers — how it went, what happens next, and when. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=log_call_takes_three_answers | 0 -->
  - [x] logCall rejects a call with fewer than three answers rather than writing a partial record. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=log_call_rejects_partial | 0 -->
  - [x] One logCall writes the call outcome, the next action, the next-action date, and increments the attempt count. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=log_call_writes_all_four | 0 -->
  - [x] logCall advances the stage only when the first answer warrants it, and never otherwise. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=log_call_advances_only_when_warranted | 0 -->
  - [x] An answer of not interested sets the call outcome and writes a lost reason without advancing the stage. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=not_interested_records_reason | 0 -->
  - [x] Running logCall twice on the same call identifier writes one call log row, not two. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=log_call_is_idempotent | 0 -->

  one-way-callback-calendar
  - [x] The calendar module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/calendar.js |  -->
  - [x] A promised date and time creates exactly one calendar entry. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=callback_creates_one_entry | 0 -->
  - [x] Replaying the same promised callback creates no duplicate entry. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=callback_replay_no_duplicate | 0 -->
  - [x] A next action with no promised time creates no calendar entry at all. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_time_no_calendar_entry | 0 -->
  - [x] The calendar module contains no read or list operation — it writes only. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=calendar_is_write_only | 0 -->
  - [x] A calendar entry carries the prospect's company name and phone number so the call can be made from the reminder alone. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=calendar_entry_carries_company_and_phone | 0 -->

Understand

- [x] The manual-versus-automatic split naming the three questions exists. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-24-operating-definition.md |  -->
- [x] The stage ladder this advances along is defined. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-25-crm2-stages-and-axes.md |  -->
- [x] The code layout names where the next-action and calendar modules live. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/code-layout.md | src/hoursback/crm/nextAction.js -->

Specify

- [x] The leak report runs as a scheduled sweep, not only on demand. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=leak_report_is_scheduled | 0 -->
- [x] Calendar failures do not roll back a logged call — the call is recorded even if the calendar write fails. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=calendar_failure_does_not_lose_call | 0 -->

Operate

- [x] The check runner exists. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [x] The full suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
