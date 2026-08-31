# START HERE — finish the message tonight

**Russ has to email in the morning. The message must be written and sitting on
every prospect record before he sleeps. This is the only job.**

Read this file, then `docs/hoursback/offer-ladder.md`, then start writing. Do not
re-derive any of this from the code and do not re-open the decisions below — they
were settled over a long conversation on 2026-08-30, and reopening them is how
the last two attempts were lost.

---

## The one sentence being rewritten

Every first email already has four parts:

1. what we noticed about them
2. what Russ does
3. **the free fifteen minutes**  ← ONLY THIS PART CHANGES
4. the close

Part 3 today reads, identically for everyone:

> Give me fifteen minutes on the phone to see where the time actually goes. Then
> I go and find the right tool for it and come back with what I would put in,
> what it costs, and why that one. Free either way, nothing to sign. If the first
> one is worth having there are usually others, and we can talk about those once
> you have seen it work.

**That promise is right and must survive.** It names a deliverable in return for
their time, and its last line is the door to the paid work. What changes is only
the part saying *what those fifteen minutes would go looking for in a business
shaped like theirs.*

---

## What every version must contain

- **The tool hunt.** Russ goes and finds a tool, names it, says what it costs and
  why that one. Free either way.
- **The build possibility, alongside it — never after it.** Some of the work has
  something good already sold for it. Some never will. The fifteen minutes is
  what tells them which is which. **That telling-which-is-which is the Xpansion
  edge and it is the reason to take the call.**
- **A hint there is usually more than one thing to find.** This is what opens the
  paid work.
- **The customization** — what Discovery would expect to find in a business of
  that shape.

## What every version must NOT contain

- No price, no fee, no dollar figure of any kind.
- No naming any software the business runs — that was never broadcast to us.
- No claim about the recipient. Only expectations about businesses of that shape.
  Russ: *"we can lightly infer but there won't be definitive enough info to call
  something out specifically and confidently."*
- Nothing that reads as surveillance ("you announced a portal in 2023").
- None of: workflow, integration, AI-powered, solution, leverage.

---

## THE TWO DRAFTS REJECTED TONIGHT — do not produce a third of either kind

**Draft one** made building the entire offer and deleted the tool hunt from all
six versions. Russ: *"You have completely eliminated the whole automation, off
the shelf premise and replaced it with the build when we said the build
communication augments the automation, opening the door for both."*

**Draft two** made building a fallback for when nothing off the shelf fits.
Russ: *"It's not 'if nothing fits'. Automation does not preclude Build! or vice
versa."*

**Both are live from the first minute.** Not a door and a backup door. A business
can be worth buying tools for AND worth building something for, at the same time.

---

## The six versions to write

Five say what Discovery would expect to find, plus one plain default. Each needs
**three or four wordings**, because every other line in the message picks from a
list of three or four so two neighbouring businesses never get the same letter.
The real deliverable is roughly **22 sentences**, not six.

1. **Nothing on the market covers the work** — the job that ends up done by hand
   because nothing sold was built for it.
2. **Software was announced and never landed** — what people do in the meantime.
3. **Paying a monthly seat fee for something ownable** — which rented seat is
   doing one small job better owned.
4. **Launching a service with no tooling yet** — the part held together by a
   spreadsheet and someone remembering.
5. **Four or more genuinely different operations** — where they meet; handovers
   are where the hours go.
6. **Default, nothing leans** — the jobs done by hand every week that nobody has
   ever counted.

Two notes from Russ's read of the rejected draft: *"With a business that does
what yours does"* is limp, and *"a handful of paid seats"* edges toward a claim
about them.

---

## Where it goes in the code

The wordings live in `src/hoursback/crm/variants.js` alongside the other
message-part lists. The message is assembled in
`src/hoursback/crm/firstContact.js` at the `{freeLook}` slot.

**Delete on the way through:** the `WHAT_I_DO_BUILD` family and `buildReasonFor()`
in variants.js, and the code in firstContact.js that chooses between them. That
was the pass/fail build test and it is retired — the Discovery offer now goes to
everyone, and only the fifteen-minute line varies.

The site reading already records what feeds this, per business:
`separateOperations` (how many genuinely different operations), `stalledBuild`
(software announced and never delivered), `toolsInUse`, `openRoles`, `theirWork`.

---

## Checks that must pass before this is called done

Add to `scripts/hoursback/run-spec-checks.js`, **above** the `(async () => {`
runner or they never execute:

- every first message offers the free fifteen minutes AND promises a named tool
  with its cost — neither half may go missing
- no first message contains a price, a fee, or any dollar figure
- no first message names a software product
- no first message contains a second-person factual claim about the recipient
- the retired build sentence appears in zero messages
- no message prints the word `null`

Then rewrite every message and count from the DATABASE, never from the
generator's own report. Three nights were declared successes by a generator that
worked correctly and then threw the results away.

---

## State of the data, evening of 2026-08-30

- **Russ's list:** 1,811 businesses. 1,395 fully described. 215 have a website
  but nothing written down — being read now, roughly 1.5 hours.
- **Set aside:** 30,928, of which only 63 are described. Not being worked.
- **Messages:** 1,943 drafts, 0 sent, 0 containing "null".
- **Checks:** 288 of 307 pass. The 19 failures predate 2026-08-30.
- Reading runs 50 at a time on the local session only. **No paid calls without
  Russ's explicit word** — standing order.

## Also outstanding, but NOT blocking tonight

The list of tools per trade — about 20 trades, 3-4 tools each with cited prices.
Never named in a message; it is what Russ names on the call. Not started.
