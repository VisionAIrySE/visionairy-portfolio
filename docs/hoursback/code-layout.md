# Hours Back — code layout

Single source of truth for where each piece lives. Every spec's checks aim here.

| Path | Holds |
|---|---|
| `prisma/schema.prisma` | Every model: Prospect, ProspectDuplicate, CaptureRun, ProspectFieldEdit, CallLog, OutreachTouch, SequenceStep |
| `src/hoursback/rules.js` | `isQualified(record)`, `bandForEmployeeCount(count)` |
| `src/hoursback/places.js` | `runRegionalCapture()`, `runMonthlyTopUp()` |
| `src/hoursback/dedupe.js` | `normalizePhone`, `normalizeDomain`, `findDuplicate` |
| `src/hoursback/enrich.js` | `enrichHeadcount(record)`, `enrichEmail(record)` |
| `src/hoursback/overrides.js` | `resolveField(record, fieldName)`, `setOverride(...)` |
| `src/hoursback/scoring.js` | `scoreAutomationFit(record)` |
| `src/hoursback/export.js` | `exportQualifiedList()` |
| `src/hoursback/crm/quote.js` | `freezeQuote(prospectId)` — write-once quote snapshot |
| `src/hoursback/crm/stages.js` | Stage ladder, call outcomes, do-not-contact, dormancy |
| `src/hoursback/crm/nextAction.js` | `logCall(prospectId, answers)`, next-action invariant, leak report |
| `src/hoursback/crm/calendar.js` | One-way Outlook callback write |
| `src/hoursback/crm/lanes.js` | Phone, email ramp, hand-sent LinkedIn, Voice handoff |
| `src/hoursback/crm/queues.js` | Daily call queue, follow-up queue, call-to-paid readout |
| `scripts/hoursback/run-spec-checks.js` | The check runner every `exit_code` check calls |
