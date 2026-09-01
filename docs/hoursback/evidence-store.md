# The evidence store — how this system is allowed to know things

**Status: the rule. Not a proposal. Written 2026-09-01, after 979 website
readings were destroyed by an ordinary Tuesday.**

---

## Why this document exists

On 2026-09-01 we went looking for why some businesses with no website and no
email were scoring 100. The score turned out to be fine. What we found instead
was worse.

Two different scripts were writing to the same slot on a record in two
different shapes. One stored a full structured reading of a website — what the
site could do, what was missing, how confident the reader was. The other stored
a single sentence, or nothing at all. Whichever ran last won.

**1,081 businesses carried a site reading. Only 102 still had the findings.**

Nobody chose that. Nothing announced it. No error was raised. The work was paid
for once, thrown away silently, and would have been paid for again.

That is the failure this document exists to make impossible.

---

## The rule

> **A reading is an event. It is written once and kept forever.**
> **Nothing overwrites a reading. Nothing deletes a reading.**
> **Erasure requires a deliberate, named act by a person.**

Everything below follows from that sentence.

---

## What a reading is

A reading is one occasion on which this system learned something about a
business from a source. It records:

| | |
|---|---|
| **what it says** | the fact itself |
| **where it came from** | the exact page, not just the domain |
| **the words behind it** | the sentence on the page that supports it |
| **when** | the moment it was read |
| **how it was known** | observed, inferred, or confirmed — never blurred |
| **how sure** | confidence, and an explicit "could not tell" |
| **who read it** | which reader, which version, which model |

A reading that could not determine something **is still a reading**. "I looked
and could not tell" is a finding, and it is kept. It is not the same as never
having looked, and the system must never again be unable to tell those apart.

---

## The bug this rule retires

The old reader wrote the number of separate operations a business runs as
**"1" whenever the model did not answer.** Not blank — one.

So "we asked and it is a single operation" and "we never asked" became the same
value, permanently, with no way back. Of 107 records holding that number, 105
say "1".

Under this rule that class of bug cannot occur. An unanswered question is
recorded as unanswered. A default is never quietly substituted for an answer.

**Any code that supplies a fallback value in place of an absent answer is
wrong.** Absence is data.

---

## What may never happen

1. **No silent overwrite.** A newer reading never replaces an older one. Both
   are kept. The current answer is chosen from them; the losers survive.
2. **No two writers, one slot.** If two pieces of code want to record the same
   kind of fact, they write two readings, not one contested field.
3. **No default standing in for an answer.** See above.
4. **No fact without a source.** If we cannot say which page and which sentence,
   we do not record it as known.
5. **No inference dressed as observation.** The brief is firm on this and so are
   we: an inference is labelled an inference, forever.
6. **No deletion as a side effect.** Clearing a wrong website may retire the
   facts drawn from it — but retiring is an act that is itself written down and
   reversible. Nothing vanishes.

---

## How the record's current answers work

The fields on a business record do not disappear. They become **the current
best answer**, derived from the readings — a fast copy for the screen, not the
truth itself.

That means:

- Rescoring never touches a website again. Replay the readings, get new scores.
- Changing your mind about what matters costs nothing. Ask the kept text a new
  question.
- A number on a card can always show its work — which page, which sentence,
  what date, how sure.
- A hand correction by Russ still wins over any reading. It is recorded as a
  reading of its own, from the most authoritative source there is.

---

## What gets kept from a website

The readable text of the pages, cleaned of markup — not the raw page.

This is the decision that makes every future re-read free. When we later want
to know something we never thought to ask, we ask the kept text instead of the
business's website. No fetching, no fee, no waiting, no risk of the page having
changed.

Cost is small: the whole database is 58 MB today. The readable text of all
1,719 sites already read adds roughly 70 MB.

---

## How scoring uses it

The score keeps its current meaning: **how manual does this business look**, and
it sets call order only. It never decides who is on the list.

What changes is where its inputs come from. Today some findings live only in a
display list that any rescore wipes, and the score is never recalculated after a
site is re-read — so the number and its stated reasons drift apart. Under this
rule the score is computed from the readings, every time, and cannot drift from
them.

The reachability ceiling stays as it is. It answers a different question — can
we get to them — and holding one number under the other was right.

---

## Order of build

1. **The store, and writing to it in parallel.** Every reading from today
   forward lands here as well as wherever it lands now. Behaviour does not
   change. The bleeding stops.
2. **Scoring reads from the store.** Fixes the drifted scores and the blank
   reasons on 800 cards.
3. **Re-read what was lost** — the 979, then the rest of the 1,719.
4. **Current answers become views over the readings.** Only once there is a real
   history to view.

Outreach does not stop for any of this.

---

## What is NOT being built yet

Deliberately deferred, 2026-09-01, Russ's call:

- technographics (what software they already run)
- change and growth signals
- review and customer-experience analysis
- visitor intelligence

They are right, and they are later. The brief's own guard applies: **do not
collect fields that cannot change targeting, pitch, timing or prioritization.**

We have a live example of why that guard matters. Six versions of the first
email were written. **Four have never once fired** — 869 drafts, and not one
uses them — because the signals they key on were never captured. More fields
will not help until what we capture reaches the decision.

---

## Reading costs

Website reading runs **50 at a time, on the local session's Claude only.**
Never through OpenRouter, never a paid call, until Russ says otherwise.
Standing order, 2026-08-29, reaffirmed 2026-09-01.
