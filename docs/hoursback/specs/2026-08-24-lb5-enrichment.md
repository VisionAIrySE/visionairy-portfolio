# XFFI Spec — Hours Back headcount and email enrichment
Generated: 2026-08-25 (rewritten — the generated version's checks read the spec's own words back to itself)
Intent: Fill in the two things Google Places cannot tell you. Headcount, which decides the band, the fee and the hours promised. And an email address where one can be found — with a missing email never costing a business its place on the call list, because the phone lane does not need it.

Amended 2026-08-25: the source is the business's own public website, read directly, rather than a paid lookup service. Reason: it costs nothing, it needs no account, and it returns more than an address — it also returns the owner's name and the tells the score is built from. A paid lookup can be layered on later without changing anything below.
<!-- xfxa-status: unverified -->

## Roots

- docs/hoursback/code-layout.md
- docs/hoursback/business-model.md
- docs/hoursback/specs/2026-08-24-lb1-rules.md
- docs/hoursback/specs/2026-08-24-lb2-record-shape.md

## Terminals

Build

  headcount-enrichment
  - [x] The enrichment module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/enrich.js |  -->
  - [x] Enriching headcount writes the employee count, the page it came from, and how confident that reading is. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=headcount_writes_count_source_confidence | 0 -->
  - [x] The band, the fee and the guaranteed hours are derived from the employee count alone and from nothing else. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=band_derived_from_headcount_only | 0 -->
  - [x] The derived fee for a known headcount matches the band table in the business model exactly. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=derived_fee_matches_band_table | 0 -->
  - [x] A company profile that cannot be resolved leaves the band, the fee and the hours all empty with a named reason, rather than guessing. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=unresolved_headcount_leaves_nulls_with_reason | 0 -->
  - [x] A headcount published as a range rather than an exact number still resolves to one band. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=headcount_range_resolves_to_band | 0 -->
  - [x] A headcount that spans two bands is resolved to the lower band, so the promise is never over-stated. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=ambiguous_range_takes_lower_band | 0 -->
  - [x] Enrichment never writes a per-employee fee field. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_per_employee_fee_written | 0 -->

  email-enrichment
  - [x] An email lookup runs against the business's own web domain, not its name. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=email_lookup_uses_domain | 0 -->
  - [x] A found email is stored with its confidence and a status naming how it was found. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=email_stored_with_confidence_and_status | 0 -->
  - [x] A business with no website gets a named unavailable status and keeps its place on the list. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_website_marked_unavailable_kept | 0 -->
  - [x] A lookup returning nothing gets the same unavailable status and keeps its place. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=empty_lookup_marked_unavailable_kept | 0 -->
  - [x] An email below the configured confidence floor is marked low-confidence and kept, not discarded. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=low_confidence_email_kept_marked | 0 -->
  - [x] No email outcome ever removes a business from the list or blocks it from the call queue. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=email_never_gates_the_list | 0 -->
  - [x] The reading is provable without touching the internet: recorded sample pages stand in for live sites. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/fixtures/site-fixtures.js |  -->

  cost-and-repeat-safety
  - [x] A business already carrying a resolved headcount is not looked up again on the monthly top-up. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_repeat_headcount_lookup | 0 -->
  - [x] A business already carrying an email is not looked up again. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_repeat_email_lookup | 0 -->
  - [x] Each run stops once its configured lookup budget is spent, and records where it stopped. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=lookup_budget_enforced_and_recorded | 0 -->
  - [x] A failed lookup is retried a configured number of times and then marked failed, never left half-written. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=failed_lookup_retries_then_marks | 0 -->
  - [x] Re-running enrichment on the same business twice leaves the record identical. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=enrichment_is_idempotent | 0 -->

Understand

- [x] The band table the derived fee is checked against is in the business model. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | $100 for every hour a week you get back. -->
- [x] The rules module that maps a headcount to a band is specified. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-24-lb1-rules.md |  -->
- [x] The record these fields are written onto is specified. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-24-lb2-record-shape.md |  -->
- [x] The code layout names where the enrichment module lives. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/code-layout.md | src/hoursback/enrich.js -->

Specify

- [x] A hand-corrected headcount is never overwritten by a later enrichment run. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=enrichment_respects_hand_corrections | 0 -->
- [x] Every check here except the reachability one runs with no network access. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=checks_run_offline | 0 -->

Operate

- [x] The lookup key is read from the environment and never written into the repository. <!-- type:Operate --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_api_key_in_repo | 0 -->
- [x] The check runner exists. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [x] The full suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
