# Visionairy Portfolio — project instructions

Loaded after `~/.claude/CLAUDE.md` and `/home/visionairy/CLAUDE.md`. Only what
is specific to this repository lives here.

---

## The evidence rule (SUPREME — this repository)

> **A reading is an event. It is written once and kept forever.**
> **Nothing overwrites a reading. Nothing deletes a reading.**
> **Erasure requires a deliberate, named act by a person.**

Full guidance: [`docs/hoursback/evidence-store.md`](docs/hoursback/evidence-store.md).
**Read it before writing anything that records what we know about a business.**

This is not style. On 2026-09-01 we found that two scripts had been writing to
the same slot in different shapes, and the later one silently wiped the earlier.
**979 of 1,081 website readings were destroyed.** No error, no warning, no way
to tell it had happened.

Four rules follow, and they are the ones actually broken in the past:

1. **Absence is data.** Never substitute a default for an answer that was not
   given. The old reader wrote "1 separate operation" whenever the model did not
   answer, so "asked and it's one" and "never asked" are now permanently
   indistinguishable on 105 records. Record "could not tell" as itself.
2. **One writer per fact.** If two pieces of code record the same kind of thing,
   they write two readings — never one contested field.
3. **No fact without a source.** Which page, which sentence, when, and whether
   it was observed, inferred, or confirmed.
4. **A skip-if-unchanged guard is a defect here.** It has twice thrown away every
   new field added below it.

Before adding a fallback, a default, an overwrite, or an early return in any
code that records a finding: stop and raise it.

---

## What the score means

`automationScore` answers **how manual does this business look** — and it sets
call order, nothing else. It never decides who is on the list.

"No website" is worth **+25 points on purpose**. Nothing online means every
enquiry is a phone call. A high score with no website is not a bug.

A second, separate question — **can we actually reach them** — holds that score
under a ceiling. Keep the two apart. One number answering both is the mistake
that was already made and fixed here on 2026-08-28.

---

## Costs and standing orders

- **Website reading: 50 at a time, local Claude only.** No OpenRouter, no paid
  call, until Russ says otherwise. Standing order 2026-08-29.
- **No Google Places requests.** Standing order 2026-08-25.
- **Spend-bearing code carries a hard ceiling in code before its first run.**

---

## Counting

**Count from the database, never from a script's own report.** Three nights were
declared successes by generators that worked correctly and then threw the
results away.

Count the outcome, not the blank field. A blank is not automatically a problem —
check what it means before reporting a number built on it.
