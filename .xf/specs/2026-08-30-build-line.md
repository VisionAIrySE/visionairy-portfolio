# XFFI Spec — Add a second family of wordings to WHAT_I_DO_FREE in src/hoursback/crm/variants.
Generated: 2026-08-30
Intent: Add a second family of wordings to WHAT_I_DO_FREE in src/hoursback/crm/variants.js for businesses whose build score is 60 or above, each naming the specific reason nothing off the shelf fits them, and keep the existing three wordings as the family used when the build score is below 60.
<!-- xfxa-status: unverified -->

## Roots

- src/hoursback/crm/variants.js
- src/hoursback/crm/firstContact.js
- src/hoursback/opportunity.js

## Terminals

Build

  wordings-for-businesses-nothing-off-the-shelf-fits
  - [ ] src/hoursback/crm/variants.js defines a second family of wordings as a flat array of three or more sentences, declared in the same file as `WHAT_I_DO_FREE`, held in the same array shape `pick` already reads, and exported by name from the module.exports block. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/variants.js | -->
  - [ ] Each sentence in the second family names in one sentence the reason nothing off the shelf fits that business — separate operations run out of one office, or work its trade has no ready-made tool for — rather than describing what Russ does in terms that fit any business. <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] No two sentences in the second family name the same reason nothing off the shelf fits, so a business landing on any member of that family reads a reason and not a repetition. <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] The three sentences held in `WHAT_I_DO_FREE` remain character-for-character unchanged and remain the members of `WHAT_I_DO_FREE` after the second family is added. <!-- type:Build --> <!-- signoff: unsigned -->

  choosing-the-family-by-build-score
  - [ ] src/hoursback/crm/variants.js defines a function that takes a build score and returns the second family of wordings when that score is 60 or above. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/variants.js | -->
  - [ ] That function returns `WHAT_I_DO_FREE` when the build score it is given is below 60. <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] That function returns `WHAT_I_DO_FREE` when the build score is null, undefined or not a finite number, so a business whose build score has not been worked out still receives an approved sentence. <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] That function returns the second family for a score of exactly 60 and `WHAT_I_DO_FREE` for a score of 59. <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] That function is exported by name from the module.exports block of src/hoursback/crm/variants.js. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/variants.js | -->

  the-build-score-reaching-the-letter
  - [ ] src/hoursback/crm/firstContact.js obtains the business's build score inside `draftFirstContact(prospect, signals)` from the prospect it is already given, taking the same 0-to-100 quantity `opportunityOf` returns as `build` in src/hoursback/opportunity.js. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/firstContact.js | -->
  - [ ] src/hoursback/crm/firstContact.js fills the `{whatIDo}` slot from the family the build-score selector in src/hoursback/crm/variants.js returns, still passing the business name as the seed so one business reads the same sentence on every draft. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/variants.js | -->
  - [ ] A prospect carrying a build score of 60 or above produces a body containing one sentence from the second family and none of the three sentences held in `WHAT_I_DO_FREE`. <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] A prospect whose build score is below 60, or whose record carries no build score, produces a body containing one of the three sentences held in `WHAT_I_DO_FREE` and none from the second family. <!-- type:Build --> <!-- signoff: unsigned -->

Understand
- [ ] The analysis states that the 60 used by `whichConversation` in src/hoursback/opportunity.js is the same threshold the two families split on, so after the change one score decides both which conversation a business is owed and which family fills `{whatIDo}`. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] The analysis names the route by which the `build` value from `opportunityOf` in src/hoursback/opportunity.js reaches `draftFirstContact` in src/hoursback/crm/firstContact.js after the change, given that `opportunityOf` has no caller outside its own module today. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] The analysis states that `pick` in src/hoursback/crm/variants.js indexes modulo list length, so after the change the number of sentences in the second family decides which of them a given business name lands on. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] The analysis states that after the change a missing or unread build score is treated as below 60, so a business with nothing worked out still receives one of the three sentences in `WHAT_I_DO_FREE` rather than an empty `{whatIDo}` slot. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] The analysis states that the build score measures how badly ready-made software fits a business and is a different quantity from `automationScore` and `siteScore` in prisma/schema.prisma, so the second family's sentences name unfitness rather than hours or website gaps. <!-- type:Comprehend --> <!-- signoff: unsigned -->

Specify
- [ ] The specification defines a high-build business as one whose `build` score from `opportunityOf` in src/hoursback/opportunity.js is 60 or above, and every score below 60 — including a score that is absent — as belonging to `WHAT_I_DO_FREE`. <!-- type:Build --> <!-- check: file_exists | src/hoursback/opportunity.js | -->
- [ ] The specification states that when the build score is 60 or above the second family's sentence wins the `{whatIDo}` slot and the three sentences in `WHAT_I_DO_FREE` are discarded for that business, and when it is below 60 or absent the `WHAT_I_DO_FREE` sentence wins and the second family is discarded. <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] The specification states that both families hold fixed literal strings in src/hoursback/crm/variants.js, so no part of the `{whatIDo}` sentence is assembled at draft time out of record fields. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/variants.js | -->
- [ ] The specification states that `WHAT_I_DO_FREE` keeps its exported name and its three members, so every module that requires that export from src/hoursback/crm/variants.js resolves after the change. <!-- type:Build --> <!-- check: file_exists | src/hoursback/crm/variants.js | -->
- [ ] The specification states that a business's `{whatIDo}` sentence changes only when its build score crosses 60, because `pick` is seeded on the business name and not on the score. <!-- type:Build --> <!-- signoff: unsigned -->

Operate
- [ ] Choosing the family and filling the `{whatIDo}` slot runs entirely from src/hoursback/crm/variants.js, src/hoursback/crm/firstContact.js and src/hoursback/opportunity.js, with no network call and no paid API request, so a draft can be produced repeatedly at no cost. <!-- type:Operate --> <!-- check: file_exists | src/hoursback/crm/variants.js | -->
- [ ] No column is added to prisma/schema.prisma for this change; the build score used at draft time is the value `opportunityOf` produces from fields the record already carries. <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] No environment variable or configuration flag gates the second family at runtime — the build score on the record is the only input that decides which family fills `{whatIDo}`. <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] Drafting one message for a prospect scoring 60 or above and one for a prospect scoring below 60 in a single node process shows a second-family sentence in the first body and a `WHAT_I_DO_FREE` sentence in the second. <!-- type:Operate --> <!-- signoff: unsigned -->
