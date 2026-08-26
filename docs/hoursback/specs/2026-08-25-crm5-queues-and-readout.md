# XFFI Spec — Hours Back daily queues and the call-to-paid readout
Generated: 2026-08-25
Intent: Hand Russ a list of who to call today and who to follow up with, in the right order — promised callbacks first, then whoever looks most likely to buy. And show him, from week one, whether 25 dials a day is actually turning into two or three paid audits.
<!-- xfxa-status: unverified -->

## Roots

- docs/hoursback/code-layout.md
- docs/hoursback/business-model.md
- docs/hoursback/specs/2026-08-25-crm2-stages-and-axes.md
- docs/hoursback/specs/2026-08-24-lb6-overrides-score-export.md

## Terminals

Build

  daily-call-queue
  - [x] The queues module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/queues.js |  -->
  - [ ] The call queue size is read from configuration and defaults within 20 to 30. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=call_queue_size_configured_20_to_30 | 0 -->
  - [ ] The call queue never returns more records than its configured size. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=call_queue_respects_size | 0 -->
  - [ ] A callback promised for today sorts above every cold prospect regardless of score. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=callbacks_sort_first | 0 -->
  - [ ] Below the callbacks, the queue sorts by automation-fit score, highest first. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=queue_sorts_by_fit_score | 0 -->
  - [ ] Suppressed, dormant and duplicate prospects never appear in the call queue. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=queue_excludes_suppressed_dormant_duplicate | 0 -->
  - [ ] A prospect already called today does not reappear in the same day's queue. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=queue_excludes_already_called_today | 0 -->
  - [ ] A prospect with no phone number never enters the call queue. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=queue_requires_phone | 0 -->

  follow-up-queue
  - [ ] The follow-up queue holds every prospect whose next-action date is today or earlier. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=followup_queue_due_today_or_earlier | 0 -->
  - [ ] An overdue prospect stays in the follow-up queue until its next action is completed, not just until the day ends. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=overdue_persists_until_done | 0 -->
  - [ ] The follow-up queue and the call queue never list the same prospect twice on the same day. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=queues_do_not_double_list | 0 -->

  call-to-paid-readout
  - [ ] The readout computes the rate as prospects with a paid date divided by calls logged over a window. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=rate_is_paid_over_calls | 0 -->
  - [ ] The readout recomputes from call logs and paid dates alone, holding no stored running total. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=readout_holds_no_stored_total | 0 -->
  - [ ] The readout shows the week's paid audits against the target of two to three a week. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=readout_shows_weekly_target | 0 -->
  - [ ] The readout reports a rate from the first logged call, showing a zero rather than refusing to display. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=readout_works_from_first_call | 0 -->
  - [ ] The readout breaks the rate down by business category, so a category that never converts is visible. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=readout_breaks_down_by_category | 0 -->
  - [ ] Deleting or suppressing a prospect does not retroactively change a past week's reported rate. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=past_weeks_are_stable | 0 -->

Understand

- [x] The two-to-three paid audits a week target comes from the business model's capacity section. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | Weighted average audit fee: $1,699. -->
- [x] The automation-fit score the queue sorts by is defined. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-24-lb6-overrides-score-export.md |  -->
- [x] The code layout names where the queues module lives. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/code-layout.md | src/hoursback/crm/queues.js -->

Specify

- [ ] Queue ordering is deterministic — the same data produces the same order twice. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=queue_order_is_deterministic | 0 -->
- [ ] Both queues build in under two seconds on a fixture of five thousand prospects. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=queues_build_under_two_seconds | 0 -->

Operate

- [x] The check runner exists. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [x] The full suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
