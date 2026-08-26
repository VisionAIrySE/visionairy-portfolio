# XFFI Spec — Hours Back CRM prospect record and frozen quote
Generated: 2026-08-25
Intent: Extend the list-builder prospect record with the CRM fields Hours Back needs to run a calling day: a write-once quote snapshot that cannot be altered by a later headcount change, the person actually spoken to and whether they can say yes, and a paid date kept separate from the stage. Field names carried forward unchanged from the list builder: keptProspectId, auditFee, guaranteedHours, employeeCount.
<!-- xfxa-status: verified: 2026-08-25 -->

## Roots

- docs/hoursback/code-layout.md
- docs/hoursback/business-model.md
- docs/hoursback/specs/2026-08-24-lb2-record-shape.md
- /home/visionairy/Veristone/builderflow/prisma/schema.prisma

## Terminals

Build

  quote-snapshot-fields
  - [x] The Prospect model declares quotedAt, quotedHeadcount, quotedBand, quotedAuditFee and quotedGuaranteedHours. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=quote_fields_declared | 0 -->
  - [x] freezeQuote writes all five quoted fields in one call and refuses a second call on the same prospect. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=freeze_quote_is_write_once | 0 -->
  - [x] Re-running enrichment on a quoted prospect changes employeeCount and auditFee while every quoted field returns its original value. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=quote_survives_reenrichment | 0 -->
  - [x] quotedAuditFee and quotedGuaranteedHours match what bandForEmployeeCount returned for quotedHeadcount at the moment freezeQuote ran. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=quote_matches_band_at_quote_time | 0 -->
  - [x] The quote module exists at its declared path. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/quote.js |  -->

  contact-and-authority-fields
  - [x] The Prospect model declares contactName, contactRole, isDecisionMaker and ownerName. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=contact_fields_declared | 0 -->
  - [x] isDecisionMaker is nullable and defaults to null rather than false, so unknown is distinguishable from no. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=decision_maker_tristate | 0 -->
  - [x] ownerName can be filled after contactName without overwriting it. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=owner_and_contact_independent | 0 -->

  paid-date-separate-from-stage
  - [x] The Prospect model declares paidAt, nullable, independent of stage. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=paid_at_declared | 0 -->
  - [x] A prospect can reach the CUSTOMER stage with paidAt still null, and the said-yes-unpaid report lists exactly those prospects. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=said_yes_unpaid_report | 0 -->
  - [x] Setting a stage never writes paidAt and writing paidAt never changes a stage. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=paid_and_stage_independent | 0 -->

  schema-carries-the-fields
  - [x] The Prisma schema file exists. <!-- type:Build --> <!-- check: file_exists | prisma/schema.prisma |  -->
  - [x] The schema validates with every relation resolved. <!-- type:Build --> <!-- check: exit_code | npx prisma validate | 0 -->
  - [x] The schema keeps keptProspectId as the duplicates pointer, unchanged from the list builder. <!-- type:Build --> <!-- check: text_presence | prisma/schema.prisma | keptProspectId -->
  - [x] The schema uses auditFee and contains no per-employee fee field. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_per_employee_fee_field | 0 -->

Understand

- [x] The band table the quote is frozen from is the one in the business model. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | $999 is the floor. Above it, the fee is set by band -->
- [x] The list-builder record this extends declares the fields it inherits. <!-- type:Comprehend --> <!-- check: file_exists | docs/hoursback/specs/2026-08-24-lb2-record-shape.md |  -->
- [x] The code layout names where the quote module lives. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/code-layout.md | src/hoursback/crm/quote.js -->

Specify

- [x] A quoted prospect whose headcount later crosses a band boundary keeps its original quotedBand. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=quote_survives_band_change | 0 -->
- [x] Every check in this spec runs without network access except those explicitly targeting a URL. <!-- type:Specify --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=checks_run_offline | 0 -->

Operate

- [x] The check runner exists and reports a named verdict per check rather than a bare exit code. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [x] The full check suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
