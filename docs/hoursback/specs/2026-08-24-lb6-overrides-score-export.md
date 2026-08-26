# XFFI Spec — Hours Back overrides, automation-fit score and call-sheet export
Generated: 2026-08-25 (rewritten — the generated version aimed 64 checks at a file that was never created)
Intent: Make Russ's corrections outrank anything the machine fetched, and make them survive every later sweep. Score each business on how manual it still looks, with a live job posting for an admin role as the strongest signal. Then hand out a plain call sheet so calling can start before the CRM exists.
<!-- xfxa-status: unverified -->

## Roots

- docs/hoursback/code-layout.md
- docs/hoursback/business-model.md
- docs/hoursback/specs/2026-08-24-lb1-rules.md
- docs/hoursback/specs/2026-08-24-lb2-record-shape.md

## Terminals

Build

  hand-corrections-win-and-persist
  - [x] The overrides module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/overrides.js |  -->
  - [x] Every machine-written field has a paired hand-entered value alongside it. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_fetched_field_has_override_pair | 0 -->
  - [x] resolveField returns the hand-entered value when present and the fetched value otherwise. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=override_wins_over_fetched | 0 -->
  - [x] Setting a correction records who set it and when. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=override_records_who_and_when | 0 -->
  - [x] Re-running enrichment overwrites the fetched value and leaves the hand-entered value untouched. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=override_survives_reenrichment | 0 -->
  - [x] A monthly top-up that re-finds the business leaves every hand-entered value untouched. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=override_survives_monthly_topup | 0 -->
  - [x] Correcting the headcount recomputes the band, the fee and the guaranteed hours from the corrected number. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=headcount_override_recomputes_band | 0 -->
  - [x] Every correction appends a history row naming the field, the old value, the new value, who and when. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=edit_history_is_append_only | 0 -->
  - [x] Clearing a correction restores the fetched value rather than leaving the field empty. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=clearing_override_restores_fetched | 0 -->

  automation-fit-score
  - [x] The scoring module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/scoring.js |  -->
  - [x] The signal weights live in one exported table, not scattered through the code. <!-- type:Build --> <!-- check: text_presence | src/hoursback/scoring.js | SIGNAL_WEIGHTS -->
  - [x] A live job posting for an admin, scheduler, receptionist or data-entry role is the highest-weighted single signal. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=job_posting_is_top_signal | 0 -->
  - [x] The other signals scored are no online booking, downloadable forms, a listed fax number, no customer portal, and high review count relative to headcount. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=manual_work_signals_declared | 0 -->
  - [x] Headcount contributes nothing to the score — it sets the band, never the ranking. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=headcount_does_not_affect_score | 0 -->
  - [x] Business category shifts the score only slightly and never gates a business out of the list. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=category_tilts_only | 0 -->
  - [x] Each scored business carries the evidence behind its score — which signal, what weight, and where it was seen. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=score_carries_evidence | 0 -->
  - [x] A business with no signals found scores zero and stays on the list rather than being dropped. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_signals_scores_zero_not_dropped | 0 -->
  - [x] The weights can be revised from logged call outcomes without editing the scoring code. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=weights_revisable_from_outcomes | 0 -->

  call-sheet-export
  - [ ] The export module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/export.js |  -->
  - [ ] The export includes only businesses that qualify and carry a band, a fee and guaranteed hours. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_only_fully_priced_qualified | 0 -->
  - [ ] Duplicates and do-not-contact businesses never appear in the export. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_excludes_duplicates_and_suppressed | 0 -->
  - [ ] Exported values are the resolved ones, so a hand-correction shows rather than the fetched value. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_uses_resolved_values | 0 -->
  - [ ] Each row carries company, phone, website, headcount, band, fee, guaranteed hours, email status, score and evidence. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_column_roster | 0 -->
  - [ ] Businesses with no email or a low-confidence email still export, marked, because the phone lane does not need email. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_keeps_emailless_rows | 0 -->
  - [ ] The export carries a header row and a stamp naming the run it came from. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_has_header_and_run_stamp | 0 -->
  - [ ] Exporting unchanged data twice produces an identical file. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_is_reproducible | 0 -->
  - [ ] The export sorts by score, highest first, so the sheet is callable top to bottom. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_sorts_by_score | 0 -->

Understand

- [x] The band table the exported fee and hours come from is in the business model. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | $100 for every hour a week you get back. -->
- [x] The qualification rules the export filters on are defined. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-24-lb1-rules.md |  -->
- [x] The code layout names where these three modules live. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/code-layout.md | src/hoursback/scoring.js -->

Specify

- [ ] The export runs before the CRM exists, needing nothing from it. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=export_has_no_crm_dependency | 0 -->
- [x] Every check here runs with no network access. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=checks_run_offline | 0 -->

Operate

- [x] The check runner exists. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [x] The full suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
