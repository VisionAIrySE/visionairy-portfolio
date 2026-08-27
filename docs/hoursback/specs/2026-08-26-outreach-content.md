# Spec — what an outreach message is allowed to say

Generated: 2026-08-26

**Intent:** Every outreach message leads with something true and specific about that business — the real week of its trade, or a fact somebody actually read off its own page — and never with something the engine failed to find. The industry that drives that opening is read, not keyword-matched. No subject line carries an unreadable name, and no message greets a stranger when a name is on file.

**Why this spec exists.** Thirteen specs covered how outreach *moves* — three channels, daily caps, approval before sending, bounces, replies stopping a sequence. Not one line anywhere said what a message must *contain*. That hole is why 464 of 691 drafts opened by telling businesses they could not be booked online, including 62 construction companies, 32 freight yards and 21 manufacturers, none of whom take appointments. Russ found it by reading the drafts, not by any check firing.

## Roots

- docs/hoursback/business-model.md
- docs/hoursback/code-layout.md
- src/hoursback/crm/firstContact.js
- src/hoursback/crm/tradeOpening.js
- src/hoursback/crm/painPoints.js
- src/hoursback/enrich.js

## Terminals

Build

  the-opening-is-never-an-absence
  - [x] Openings that fire when something was NOT found are named in code and can never be chosen. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_message_opens_on_an_absence | 0 -->
  - [x] A business with nothing verified still gets an opening, and it is its own trade's week. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_business_has_an_honest_opening | 0 -->
  - [x] Every trade the system can name carries its own week, its own subject line and its own plural. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_trade_has_its_own_week_and_subject | 0 -->
  - [x] The sentence guessing about their business is hedged in every wording and asserts nothing about their particular office. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=the_guess_about_them_stays_a_guess | 0 -->
  - [x] No drafted message in the database opens on an absence. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_live_draft_opens_on_an_absence | 0 -->

  the-industry-is-read-not-guessed
  - [x] Page text can never decide a business's industry, and an industry already on file is never overwritten. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=page_text_never_decides_the_industry | 0 -->
  - [x] Every business reachable by email has an industry that was read, or none at all. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_emailable_business_has_a_read_industry | 0 -->
  - [x] A business with no industry gets the general opening rather than a guessed one. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=unknown_industry_gets_the_general_opening | 0 -->

  the-subject-line
  - [x] A business name that is really a web page heading is trimmed before it reaches a subject line, and one that cannot be trimmed is left out. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_subject_line_carries_an_unreadable_name | 0 -->
  - [x] No single subject line is shared by more than a tenth of the drafted messages. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_subject_line_is_overused | 0 -->

  the-greeting
  - [x] No message greets nobody at a business where a person's name is on file. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_known_name_is_greeted | 0 -->
  - [x] A business with no name on file is greeted without one, never with a stand-in. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_stand_in_greeting | 0 -->

  the-dead-signals
  - [x] Every opening the scoring system pays for is one something can actually detect. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_scored_signal_is_undetectable | 0 -->

  the-linkedin-note
  - [x] Every business where a person is actually known has a LinkedIn note waiting to be pasted. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_known_person_has_a_linkedin_note | 0 -->
  - [x] No LinkedIn note carries a link, which is what gets an account restricted. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_linkedin_note_carries_a_link | 0 -->
  - [x] No LinkedIn note runs longer than what actually gets read. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=linkedin_notes_stay_short | 0 -->

  the-sentence-has-to-read-straight
  - [x] No message claims a document holds something a document cannot hold. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_sentence_promises_what_a_report_cannot_hold | 0 -->
  - [x] No wording puts a bare pronoun where it can land on the wrong thing. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_pronoun_points_at_the_wrong_thing | 0 -->
  - [x] Every guarantee wording says HOW the tools give the time back, rather than listing hours as a thing received. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_guarantee_wording_reads_straight | 0 -->

  the-linkedin-invitation
  - [x] Every LinkedIn note has a short invitation to send with the request to connect. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=every_linkedin_note_has_an_invitation | 0 -->
  - [x] No invitation runs past what LinkedIn allows, and none of them carries the offer. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_invitation_is_too_long_or_sells | 0 -->

  what-it-actually-does
  - [x] No sentence about a business reads their own marketing back at them. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=no_sentence_reads_their_marketing_back | 0 -->

  noticing-a-reply-and-a-bounce
  - [x] A person answering stops every remaining message; a holiday responder changes nothing. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=a_reply_is_told_apart_from_a_holiday_responder | 0 -->
  - [x] A bounced address goes back into the list of addresses to find, and the business stays callable. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=a_bounced_address_is_queued_to_be_found_again | 0 -->
  - [x] Only a properly signed, recent message from the mail service is acted on. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=an_unsigned_mail_event_is_refused | 0 -->
  - [x] A bounce, a spam complaint, a reply and a holiday responder each mean exactly one thing. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=each_mail_event_means_one_thing | 0 -->
  - [x] Being marked as spam stops every channel, phone included. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=being_marked_as_spam_stops_everything | 0 -->
  - [x] The mail service is heard without a password, and only because it signed the message. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=the_mail_service_is_heard_without_a_password | 0 -->

  queued-for-later
  - [ ] Email sends on a schedule without Russ clicking, and a morning note says what went and what is due. <!-- type:Build --> <!-- check: exit_code | node scripts/hoursback/run-spec-checks.js --check=email_sends_without_a_click | 0 -->

Understand

- [x] The single offer — five hours a week, $999 — is what the business model document states, with no other number standing. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | **Subject:** five hours a week back, or you don't pay -->
- [x] The promise stated to an owner is at least five hours, not a range. <!-- type:Comprehend --> <!-- check: text_presence | docs/hoursback/business-model.md | You get at least five hours a week back -->

Specify

- [ ] Why an absence must never open a message is written down where the next person will read it. <!-- type:Specify --> <!-- check: text_presence | src/hoursback/crm/tradeOpening.js | Not finding is not the same as not having -->
- [ ] The rule that a general truth beats a specific error is recorded against the industry decision. <!-- type:Specify --> <!-- check: text_presence | src/hoursback/enrich.js | General and true beats specific and wrong -->


Operate

- [x] The check runner exists. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/run-spec-checks.js |  -->
- [ ] The full suite runs from one command. <!-- type:Operate --> <!-- check: exit_code | npm test | 0 -->
