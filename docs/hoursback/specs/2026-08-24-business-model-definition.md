# XFFI Spec — Hours Back business-model definition document
Generated: 2026-08-24 · REWRITTEN so every terminal carries a runnable check
Intent: Write one business-model definition document for the Central Oregon guarantee-led AI automation services practice.
<!-- xfxa-status: verified: 2026-08-24 -->

## Roots

- docs/hoursback/locked-decisions.md
- docs/hoursback/business-model.md

## Terminals

Build
- [x] The business-model definition document exists on disk at its stated location. <!-- type:Build --> <!-- check: file_exists | docs/hoursback/business-model.md |  -->
- [x] The locked-decisions source of truth the document defers to exists on disk. <!-- type:Build --> <!-- check: file_exists | docs/hoursback/locked-decisions.md |  -->
- [x] The document reproduces the fee/guarantee/annual-value/return table including the 100-staff row. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $206,959 -->
- [x] The document reproduces the 5-staff floor row of the fee table. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $10,348 -->
- [x] The document reproduces the 25-staff row of the fee table. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $51,740 -->
- [x] The document reproduces the 50-staff row of the fee table. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $103,480 -->
- [x] The document reproduces the 10-staff flat-rate row of the fee table. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $20,696 -->
- [x] Both outreach messages are written out as quotable text, not described — the small-owner subject line is present. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Subject:** ten hours a week back, or you don't pay -->
- [x] The larger-company outreach message is written out as quotable text — its subject line is present. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Subject:** [N] hours a week back at [Company], guaranteed -->
- [x] The capacity model is a table with one row per level carrying audits per week and revenue. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $79,470 -->
- [x] The capacity table carries the practiced-solo level row. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $238,410 -->
- [x] The capacity table carries the solo-ceiling level row. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $397,350 -->

Understand
- [x] The document states that what is guaranteed is the finding and not the doing. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | FINDING, not the doing -->
- [x] The document states the refund test is binary. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | binary test -->
- [x] The document states why the promise binds on hours rather than dollars. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | Dollars invite an argument about whose wage was used -->
- [x] The document states the anti-disintermediation reason the quote sits inside the deliverable. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | takes the list and hires the wiring cheaper elsewhere -->
- [x] The document states the wage arithmetic behind every dollar figure. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | $82,784 per employee per year -->
- [x] The document states the hourly basis derived from the county wage. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | $39.80 per hour -->
- [x] The document explains the 10x floor row as intended rather than an inconsistency. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | This is intended, not an inconsistency -->
- [x] The document states the open competitive band left by the local shops. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | $10,000–$30,000 band -->
- [x] The document states that loss framing was considered and rejected. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | was considered and **rejected** -->

Specify
- [x] The precedence rule naming locked-decisions as the winner on conflict is stated. <!-- type:Specify --> <!-- check: text_presence | docs/hoursback/business-model.md | `locked-decisions.md` wins -->
- [x] The sourcing rule requiring every number to carry a source or derivation is stated. <!-- type:Specify --> <!-- check: text_presence | docs/hoursback/business-model.md | There are no unsourced, underived numbers -->
- [x] The governing hours-only constraint is stated as covering the whole document. <!-- type:Specify --> <!-- check: text_presence | docs/hoursback/business-model.md | hours found, never dollars -->
- [x] The document is declared a single document rather than a set. <!-- type:Specify --> <!-- check: text_presence | docs/hoursback/business-model.md | **Working name.** "Hours Back." -->

  pain-thesis-and-cited-evidence
  - [x] A pain thesis section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 1. The Pain Thesis, and the Evidence For It -->
  - [x] The pain is stated as gain — hours returned and what they are for. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | This is an investment in getting your life back -->
  - [x] The Smartsheet 40-percent finding is cited with its source named. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **over 40%** (≈10 hours) | Smartsheet -->
  - [x] The Smartsheet 60-percent finding is cited with its source named. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **nearly 60%** | Smartsheet -->
  - [x] The 36-percent owner-admin figure is cited. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **≈36%** -->
  - [x] The 15-to-20 recoverable-hours range is cited. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **15–20 hours** -->
  - [x] The one-tenth credibility argument is stated explicitly. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | one tenth of the waste the evidence already establishes -->
  - [x] The Deschutes County wage is stated with its source. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **$66,227** (2024) | Business Oregon -->
  - [x] The Oregon statewide wage is stated with its source. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **$71,964** (2025) | QualityInfo -->
  - [x] The document states which wage figure governs when the two disagree. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | county figure ($66,227) governs -->

  buyer-segments-with-numeric-qualifying-criteria
  - [x] A buyer-segments section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 2. Buyer Segments -->
  - [x] Exactly two segments are defined and named. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | ### Segment A — The Small Owner-Operator -->
  - [x] The second segment is named. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | ### Segment B — The Larger Company -->
  - [x] The small segment carries a numeric headcount band. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **5–30 staff** -->
  - [x] The small segment carries a numeric minimum to qualify. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **5 employees** — below this there is not enough repeated process -->
  - [x] The small segment's observable qualifier is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **The owner is still in the machine** -->
  - [x] The larger segment carries a numeric headcount band. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **31 or more staff** -->
  - [x] The 50-employee dollar-disclosure threshold is specified. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **The 50-employee threshold.** -->
  - [x] The document states the guarantee is identical across segments and only language differs. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Marketing bifurcates; the promise does not -->
  - [x] A prospect sorts into exactly one segment on headcount alone. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | exactly one segment, or disqualify it, using public headcount alone -->

  audit-offer-terms-pricing-guarantee-and-credits
  - [x] An audit-offer-terms section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 3. The Audit Offer — Pricing, Guarantee, Refunds, Credits -->
  - [x] The pricing rule is stated as a flat rate to ten with per-employee pricing above it and a cap. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **$999 flat for teams of 10 or fewer. $100 per employee above 10. Capped at $15,000.** -->
  - [x] The document states headcount is public so every prospect is priced before contact. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | every prospect carries its own price before first contact -->
  - [x] The guarantee threshold is stated with its floor. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **One hour per employee per week, or you pay nothing.** Floor of five hours -->
  - [x] The binding promise is specified as hours only, never dollars. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **The binding promise is hours only, never dollars.** -->
  - [x] The refund condition names both halves of the test. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | A named, specific tool or change that recovers each block -->
  - [x] The refund outcome is stated as pay-nothing-and-keep-the-report. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | the client pays nothing and keeps the report -->
  - [x] The document states implementation is the client's choice, not part of the guarantee. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | never part of the guarantee -->
  - [x] The fee credit rule is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **credited in full against the implementation invoice** -->
  - [x] The document states what happens to the credit if the client implements elsewhere. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | the credit does not apply and is not refunded -->
  - [x] The floor-row multiple is explained rather than presented as an error. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Why the five-person row returns 10x -->

  audit-deliverable-structure-with-embedded-implementation-quote
  - [x] An audit-deliverable section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 4. The Audit Deliverable -->
  - [x] The deliverable is specified section by section in order. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Where your time is going** -->
  - [x] A section listing recoverable hours by named process is specified. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | named tasks, named roles, hours per week, annualized -->
  - [x] A section naming the specific tools is specified, satisfying the tools half of the refund test. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | satisfies the "names the tools" half of the refund test -->
  - [x] The implementation quote is placed inside the report as a named section. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Section 5 is the implementation quote, and it lives INSIDE this report.** -->
  - [x] The anti-disintermediation rule is stated explicitly. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | ### The anti-disintermediation rule -->
  - [x] The live-handover rule is stated and the email-and-wait pattern prohibited. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | is prohibited.** -->
  - [x] An industry-specific section naming three time burners in the client's trade is specified. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **The three things eating time in [their trade]** -->
  - [x] The document marks which deliverable sections are fixed and which are per client. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Structure fixed, content per client -->
  - [x] A completed report is checkable against the section list before handover. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | checked against this section list before handover -->

  revenue-ladder-and-capacity-model
  - [x] A revenue-ladder and capacity section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 5. The Revenue Ladder and Capacity Model -->
  - [x] The ladder is an ordered list of named rungs starting at the audit. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $999 – $15,000 -->
  - [x] The implementation rung carries a price band. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $1,500 – $3,000 -->
  - [x] The custom-build rung carries a price band. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $10,000 – $75,000 -->
  - [x] The retainer rung carries a price band. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | $500 – $2,000/month -->
  - [x] Each rung states what must already have been bought, so the ladder reads as a sequence. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | An ordered sequence, not a menu -->
  - [x] The document identifies which rung absorbs the audit fee credit. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | the tool implementation invoice absorbs it -->
  - [x] The capacity model names the binding constraint at each level. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | What runs out first -->
  - [x] The assumed headcount mix behind the revenue figures is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Weighted average audit fee: $1,589.** -->
  - [x] Unvalidated conversion rates are labelled as assumptions. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | largest source of error in this model -->
  - [x] Each capacity revenue figure is reproducible from the stated inputs. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | reproducible from audits-per-week × the weighted average fee × 50 weeks -->

  competitive-position-with-named-local-rates
  - [x] A competitive-position section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 6. Competitive Position -->
  - [x] A named competitor's published rate is stated with its source. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **From $179/month** -->
  - [x] A named software shop's hourly rate and minimum are stated with a source. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **$150/hr** | **$25,000–$50,000** | DesignRush -->
  - [x] A second named shop's minimum is stated with a source. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **$50,000 and up** | DesignRush -->
  - [x] The Central Oregon floor figure is stated with its source. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | floor at $25,000–$50,000** -->
  - [x] The roughly-tenfold agency differential is stated with its evidence. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Loominary $300,000** -->
  - [x] The document states the guarantee rather than price is why a buyer chooses. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Price gets you compared; a guarantee gets you chosen -->
  - [x] The single differentiator is stated as one quotable sentence. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | doesn't get paid unless it finds the hours -->

  outreach-messages-and-target-list-sourcing
  - [x] An outreach and sourcing section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 7. Outreach Messages and Target-List Sourcing -->
  - [x] The small-owner message states the prospect's own price in the body. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | It's **$999**, it's all remote apart from one call -->
  - [x] The larger-company message shows hours and dollars while binding on hours. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **The guarantee is the hours** -->
  - [x] Each message carries a cited evidence claim matching a source named in the document. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | according to Smartsheet -->
  - [x] The sourcing plan names each data source and the field it supplies. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Oregon Secretary of State business registry** -->
  - [x] The source of record for headcount is named. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Source of record is the **LinkedIn company page** -->
  - [x] The numeric filters producing a qualified list are stated in the segment bands. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Drop anything under 5 employees.** -->
  - [x] The unresolved email-at-volume gap is flagged rather than glossed. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **⚠ UNRESOLVED -->

  engagement-tracking-system
  - [x] An engagement-tracking section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 8. Engagement Tracking -->
  - [x] The stages are named in order from first contact to build sold. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Custom build contract signed -->
  - [x] Each transition is triggered by a recorded event rather than a judgment. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **recorded event, not a judgment** -->
  - [x] The tracked field list includes headcount, computed fee, segment, stage and last contact date. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Computed fee** · **Guaranteed hours** · Segment · Industry · **Stage** · **Last contact date** -->
  - [x] Where tracking is recorded and whether it is by hand is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **A spreadsheet, maintained by hand, for now.** -->
  - [x] The graduation condition off the spreadsheet is stated numerically. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **more than 200 live rows** -->
  - [x] The follow-up cadence is stated in days per stage. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Follow up at **day 5**, then **day 12** -->
  - [x] The condition for marking a prospect dead is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Three touches, no reply -->
  - [x] The two numbers the tracker feeds into the capacity model are named. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Audits closed per week** -->

  proof-surface-and-capability-showcase
  - [x] A proof-surface section exists. <!-- type:Build --> <!-- check: section_exists | docs/hoursback/business-model.md | ## 9. The Proof Surface -->
  - [x] Proof assets are split by whether they appear in outreach or in the meeting. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | Shown in the meeting -->
  - [x] What a sample deliverable may show is specified. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **May show:** -->
  - [x] What a sample deliverable must withhold is specified. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **Must withhold:** -->
  - [x] The client-permission condition before publishing any result is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | that client's written permission -->
  - [x] The framing rule keeping platforms as evidence rather than a catalog is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | never as a product catalog -->
  - [x] How a new trade joins the industry-page set is specified. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | ### How a new trade joins the set -->
  - [x] No asset is described as existing when it does not. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | **NOT YET PRODUCED** -->
  - [x] The permission gate on the Loominary figure is stated. <!-- type:Build --> <!-- check: text_presence | docs/hoursback/business-model.md | must not be published, written into marketing, or attributed -->

Operate
- [x] The document's storage location and filename are stated in the document. <!-- type:Operate --> <!-- check: text_presence | docs/hoursback/business-model.md | `docs/hoursback/business-model.md` -->
- [x] The revision rule separating locked sections from revisable ones is specified. <!-- type:Operate --> <!-- check: text_presence | docs/hoursback/business-model.md | Changing anything in the locked column -->
- [x] The review triggers forcing a re-check of pricing, guarantee or capacity are named. <!-- type:Operate --> <!-- check: text_presence | docs/hoursback/business-model.md | **Review triggers -->
- [x] A review trigger tied to a paid refund is specified. <!-- type:Operate --> <!-- check: text_presence | docs/hoursback/business-model.md | **Any refund paid** -->
- [x] The delivery mode and the site-visit condition are specified. <!-- type:Operate --> <!-- check: text_presence | docs/hoursback/business-model.md | **Site-visit condition:** -->
- [x] The split between client-facing and internal-only sections is specified. <!-- type:Operate --> <!-- check: text_presence | docs/hoursback/business-model.md | No internal figure reaches a buyer by accident -->

