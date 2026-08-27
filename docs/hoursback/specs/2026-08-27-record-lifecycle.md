# Spec — what happens after a record changes

Generated: 2026-08-27

**Intent:** Everything that follows from a change to a business record happens on its own, in one chain, whoever or whatever made the change. Typing a website in reads the website. Reading the website scores the record. Scoring it settles the trade, clears the review flag, and writes the message. Nobody has to remember a second step.

**Why this spec exists.** Russ opened VERNAM CRANE SERVICE and typed in a phone number, a website, an email address, a team size of 16 and an industry. All five saved correctly. The record then sat unscored, still flagged "needs a look", with no message written — because the score was only ever written by the website sweep, the message only ever by a bulk run, and the review flag only ever by hand. Four separate things somebody had to remember. His words, 2026-08-27: *"Once I add a website and save it, it should read the website and score and write the message right? You have to think through these processes."*

The score in particular had two copies of its rules: a thin one inside the website sweep that only saw what was on the page, and a fuller one inside a run-everything script that saw the whole record. Only the second was correct, and only a person running it by hand ever fired it.

## Roots

- src/hoursback/refresh.js
- src/hoursback/enrich.js
- src/hoursback/scoring.js
- src/hoursback/crm/tradeOpening.js
- scripts/hoursback/crm-app.js
- scripts/hoursback/rescore.js

## Terminals

Build

  the-chain-runs-itself
  - [x] Every path where a person changes a record runs the same chain: correcting the card, logging a call, adding a business. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=a_hand_edit_runs_the_whole_chain | 0 -->
  - [x] The chain does all five steps: read the site, score the record, settle the trade, clear the review flag, write the message. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=the_chain_does_every_step | 0 -->
  - [x] "Needs a look" clears itself the moment there is a phone or a website, and never before. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=the_review_flag_clears_itself | 0 -->

  the-score-is-a-function-of-the-record
  - [x] There is exactly one set of scoring rules, shared by a hand edit and by the run-everything script. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=the_score_is_one_set_of_rules | 0 -->
  - [x] Every scored signal has something that can detect it. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_scored_signal_is_undetectable | 0 -->

  nothing-runs-away
  - [x] A bulk import of the state register fires no website reads, and the bulk re-score reaches no website either. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=a_bulk_import_never_fires_website_reads | 0 -->
  - [x] A reply, a bounce, a leave-alone mark, an unread site or a missing address each stop a message being written. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=nothing_is_written_to_somebody_who_answered | 0 -->
  - [x] Nothing is drafted for a business straight out of the register that nobody has looked at. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=nothing_is_written_to_an_unverified_business | 0 -->

  the-opening-is-the-strongest-thing-known
  - [x] Only facts about the business itself may open a message; a fax number and a page of downloadable forms are scored but never spoken. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_small_website_detail_opens_a_message | 0 -->
  - [x] No drafted message opens on a small website detail. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_live_draft_opens_on_a_small_detail | 0 -->

  their-own-words-stay-a-clause
  - [x] Only a short third-person clause is used as what a business does; a pasted paragraph, their own voice, or their own marketing is refused and the card says why. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=a_pasted_paragraph_never_reaches_a_message | 0 -->
  - [x] The email and the LinkedIn note both refuse it, so neither channel can carry what the other rejects. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=their_own_marketing_is_refused_on_both_channels | 0 -->
  - [x] No business on file has its own marketing sitting in that field. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_sentence_reads_their_marketing_back | 0 -->
