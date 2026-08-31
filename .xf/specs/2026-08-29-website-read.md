# XFFI Spec — Build a single reading run that visits each remaining business website and write
Generated: 2026-08-29
Intent: Build a single reading run that visits each remaining business website and writes onto that business's CRM record: trade, one sentence on what the business does, shared inbox address, main phone, every named person with job title and any published personal email or LinkedIn profile link, and one sentence naming what the site never states. Restore the 86 addresses emptied as malformed. Write every field every time, never skipping a record because it looks unchanged. The reader judges meaning and may answer that it cannot tell, rather than matching patterns. A business whose site names people but whose record ends with zero people is reported as a failure, and three consecutive such failures halt the run; a dollar ceiling is checked before every call. The run is only called a success by querying the records afterwards, never by counting what the reader returned.
<!-- xfxa-status: unverified -->

## Roots

- scripts/hoursback/read-via-openrouter.js
- scripts/hoursback/understand-businesses.js
- src/hoursback/understand.js
- src/hoursback/reachable.js
- prisma/schema.prisma

## Terminals

Build

  one-pass-reader-over-every-remaining-site
  - [x] scripts/hoursback/understand-businesses.js selects every business record in businesses.js that carries a website and has not yet been read in this run, and calls src/hoursback/understand.js once per selected record in a single pass. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] src/hoursback/understand.js returns each person as an entry carrying name, job title, personal email or null, and profile link or null, and keeps an entry whose personal email is null. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
  - [x] src/hoursback/understand.js returns the trade, the one-sentence description, the shared inbox address, the main phone and the one-sentence never-stated statement for each record it reads. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
  - [x] src/hoursback/understand.js returns a cannot-tell value for any of trade, description, shared inbox address, main phone or the never-stated sentence that the pages it read do not support. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
  - [x] src/hoursback/understand.js follows a team page linked only from an About page, so person entries named there appear in the list it returns. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->

  writing-every-field-every-time-including-the-people-rows
  - [x] scripts/hoursback/understand-businesses.js writes trade, description, shared inbox address, main phone, the never-stated sentence and the people list onto the business record in businesses.js on every read, with no branch that skips a write because the read value equals the stored value. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] scripts/hoursback/understand-businesses.js writes the profile link onto the person row in businesses.js for every entry whose profile link is non-null. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] scripts/hoursback/understand-businesses.js stores a person row whose job title is present and whose personal email is null, instead of dropping that entry before the people list is assigned to the record in businesses.js. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] scripts/hoursback/understand-businesses.js assigns the whole people list returned by src/hoursback/understand.js in one write, so a row missing an optional field does not prevent the remaining rows from being saved. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->

  restoring-the-86-addresses-emptied-as-malformed
  - [x] scripts/hoursback/understand-businesses.js includes the 86 business records in businesses.js whose address field was emptied as malformed in the run's selection, even when those records were read before. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] scripts/hoursback/understand-businesses.js writes the shared inbox address returned by src/hoursback/understand.js onto each of those 86 records, overwriting the emptied field. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] businesses.js holds a non-empty shared inbox address for every one of the 86 emptied records for which src/hoursback/understand.js returned an address, and an empty address only where it returned none. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->

  halting-on-people-loss-failures-and-on-the-dollar-ceiling
  - [x] scripts/hoursback/understand-businesses.js records a failure for a business where src/hoursback/understand.js returned at least one person entry but the record in businesses.js ends the write with zero people rows. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] scripts/hoursback/understand-businesses.js stops the run after three such failures occur consecutively, leaving every record already written in businesses.js intact. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] scripts/hoursback/understand-businesses.js compares accumulated spend against a fixed dollar ceiling before every call and stops the run when the next call would carry spend past that ceiling. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
  - [x] scripts/hoursback/understand-businesses.js writes the identifier of the last business record it wrote, so a halted run continues from the next unread record rather than from the start of the list. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->

  proving-the-run-by-querying-the-saved-fields-in-businesses-js
  - [x] run success is derived from a query over the fields saved in businesses.js and never from a count of the entries src/hoursback/understand.js returned. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
  - [ ] the query reports, per field, the number of business records in businesses.js holding a non-empty trade, description, shared inbox address, main phone, never-stated sentence and people list. <!-- type:Build --> <!-- signoff: unsigned -->
  - [x] the query fails when a record in businesses.js for which src/hoursback/understand.js returned person entries holds zero people rows. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
  - [ ] the query fails when a person row in businesses.js holds a null profile link while the entry returned for that person carried a non-null profile link. <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] the query reports how many of the 86 emptied addresses now hold a non-empty shared inbox address in businesses.js. <!-- type:Build --> <!-- signoff: unsigned -->

Understand
- [ ] the analysis states which business records in businesses.js the run selects, separating records never read from records already carrying a written trade and description. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] the analysis states what a shared inbox address is as distinct from a named person's personal email, and which of the two src/hoursback/understand.js assigns to the business-level address field versus a person row. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] the analysis states where in scripts/hoursback/understand-businesses.js the people list is assigned onto the business record, and whether any filter sitting between the reader's return and that assignment can drop a person entry whose personal email is null. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] the analysis states which pages of a site src/hoursback/understand.js fetches per record and how a team page reachable only through an About page enters that set. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] the analysis states how src/hoursback/understand.js signals that it cannot tell a field, and how scripts/hoursback/understand-businesses.js distinguishes that signal from a field whose value is genuinely absent. <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] the analysis states which field on a record in businesses.js the 86 emptied addresses occupy and what makes those 86 records identifiable as a set the run must revisit. <!-- type:Comprehend --> <!-- signoff: unsigned -->

Specify
- [x] the spec states that where the value returned by src/hoursback/understand.js and the stored value in businesses.js disagree on a field, the value written is the one the reader returned. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
- [x] the spec states that scripts/hoursback/understand-businesses.js writes every field on every read, and forbids any conditional that skips a write because the read value matches the stored value. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
- [x] the spec states that a person entry returned by src/hoursback/understand.js is written to businesses.js whenever it carries a name, whether or not its personal email and profile link are null. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
- [x] the spec states the fixed dollar ceiling checked in scripts/hoursback/understand-businesses.js before every call, and that the run stops rather than continuing once the next call would pass it. <!-- type:Build --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
- [x] the spec states that three consecutive people-loss failures halt the run, where a people-loss failure is a record for which src/hoursback/understand.js returned person entries and whose businesses.js record holds zero people rows. <!-- type:Build --> <!-- check: file_exists | src/hoursback/understand.js | -->
- [ ] the spec states that run success is declared only when every check over the saved fields in businesses.js passes, never from the reader's own tally. <!-- type:Build --> <!-- signoff: unsigned -->

Operate
- [x] the dollar ceiling and the consecutive-failure limit are set in scripts/hoursback/understand-businesses.js before the first call of the run. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
- [x] scripts/hoursback/understand-businesses.js is started as one background command whose output is written to a log file under data/. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
- [x] a halted run is resumed by re-running scripts/hoursback/understand-businesses.js, which skips the business records in businesses.js already written during this run and continues from the next unread record. <!-- type:Operate --> <!-- check: file_exists | scripts/hoursback/understand-businesses.js | -->
- [ ] the checks over businesses.js are executed after the run completes or halts, and their per-field counts are read before the run is called a success. <!-- type:Operate --> <!-- signoff: unsigned -->
