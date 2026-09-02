# Decided, not yet built

Things Russ has said yes to, or said "later" to, that are not in the code yet.
Nothing here is discarded. A line leaves this file when it becomes a spec, or
when Russ says it is dead.

---

## Ask the list a question in plain English

**Raised:** Russ, 2026-09-01. **Status:** deferred on purpose, not dropped.

Search the accounts list by meaning rather than by column. *"Show me companies
that might need a new website."* *"Companies in Bend that could need business
insurance quotes."* Neither question is a field on the record, so no ordinary
filter can answer them — they are judgments about how a site reads.

**Shape agreed:**

- **Facts first, meaning second.** Filter on the columns we already have (town,
  trade, headcount, has-a-website) and only then search the stored words of the
  site. Filtering first is what keeps it affordable — we search the forty that
  passed the filter, never all 1,602.
- **It reads the reading store, it never writes to it.** A second, rebuildable
  copy of the text arranged for searching. If it breaks, rebuild it and lose
  nothing. It adds no second writer, so it does not touch the evidence rule
  (`docs/hoursback/evidence-store.md`).
- **Every result carries the sentence that matched**, quoted off their own
  page, so Russ can see why it came up rather than trusting a ranking.
- **In the app:** a plain-English search box on the Accounts page, results as
  the normal list with the matching sentence beneath each one. Not a new view
  to learn.

**Why it waits:** the reading store is nearly empty. An index over almost
nothing returns almost nothing, and the honest conclusion would look like "it
doesn't work" when the real answer is "there is nothing in it yet." Build it
after roughly 300–400 sites are read — six to eight batches of fifty.

**The cost to name up front:** turning the pages into something searchable by
meaning means running every one through a model. Locally that is free but slow,
likely a full night of machine time for all 1,602. Through a paid service it is
fast and costs money, which the standing order rules out for now. Local,
overnight, is the pick — it uses a different resource from the reading, so the
two do not compete.

**Before it is built it needs its own spec**, with a written definition of a
right and a wrong answer. "Answers a question in plain English" is not
adjudicatable as stated, and without that test we will never know if it works.
It is spec five — after the three still outstanding.
