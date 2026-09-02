# Messages to review — the noticing pass

Written 2026-09-02T18:42:09.526Z by scripts/hoursback/write-noticings.js — **a look only: nothing in the database was touched**.

One thing changed in each letter below: the second paragraph, which used to be the trade's week, now names at most the two hardest-hitting jobs read off that business's own site, angled to the job of the person it is addressed to. Every other word is Russ's, unchanged. Beside each is what the business already visibly runs; EVERY area of work that mapped to the tool library, each with its type, department, the words it rests on and its recurrence verdict; how the areas ranked and which reached the email, and why. The card gets everything that fits — the email names two at most. Businesses whose site could not support a specific, true sentence are at the end — they keep the trade sentence, and the reason and any areas that fell short are beside each.

## 1. Natures Plan LLC — landscaping

- **What they do:** Landscape design, construction, and maintenance services including xeriscaping and irrigation systems for Central Oregon.
- **Addressed to:** Dan Bertucci (Registered owner; angle: owner)
- **They already run:** Contact Form 7 (online forms)
- **Every area that fits (the card, 6 found):**
  - **#1 — IN THE EMAIL**: Booking, rescheduling and no-shows (`scheduling`, operations) — Booking and scheduling maintenance visits and appointments
    - their words: "Full service landscape maintenance Residential & Commercial"
    - recurs: yes — Word 'maintenance' inherently means recurring visits in same shape (plainly 0.65)
    - why this rank: tier 2 for landscaping: probably helpful, per the library; the library documents 8 hours a week for tools of this type; their own pages show it recurring fairly plainly
  - #2: Recording what happened on site (`field_capture`, operations) — Recording and documenting field work completed on site
    - their words: "Planting, pruning, mowing, edging, pruning, stump removal..."
    - recurs: yes — Mowing and edging are plainly weekly recurring maintenance tasks (plainly 0.75)
    - why this rank: tier 3: not among the library's pairings for landscaping, investigate before recommending; their own pages show it recurring plainly
  - dropped: The phone being answered when nobody is there (`phone_answering`, operations) — Answering and fielding calls for services and estimates
    - their words: "Call Today: 541.480.2071"
    - recurs: no — Phone number is a CTA, not evidence of recurring call volume patterns (plainly 0.1)
  - dropped: Getting a price out and chasing it (`quoting_and_proposals`, sales) — Generating quotes and proposals for landscape design work
    - their words: "Landscape design & construction"
    - recurs: no — Design and construction are episodic services, not recurring many times weekly (plainly 0.1)
  - dropped: Photographs of the work, made presentable (`photo_and_visual`, marketing) — Managing and presenting photos of completed landscape projects
    - their words: "View Our Work!"
    - recurs: no — Portfolio link shows nothing about photo management frequency or patterns (plainly 0.05)
  - dropped: Being found when somebody nearby searches (`local_search_presence`, marketing) — Showing up in local search results for Central Oregon landscaping
    - their words: "Landscape Design and Maintenance Services for Central Oregon"
    - recurs: no — Service area statement does not show search visibility work recurs weekly (plainly 0.05)
- **Why these reached the email:** "Booking and scheduling maintenance visits and appointments" ranked first (tier 2 for landscaping: probably helpful, per the library; the library documents 8 hours a week for tools of this type; their own pages show it recurring fairly plainly); nothing of a genuinely different kind stood on its own beside it, so the email names one.
- **Named in the email:**
  - Booking and scheduling maintenance visits and appointments — their words: "Full service landscape maintenance Residential & Commercial"
- **Rests on:** http://www.naturesplanllc.com/
- **Their own words behind it:** "Full service landscape maintenance Residential & Commercial"
- **Status:** what the letter would become (nothing was written)

**Second paragraph before:**

> At most landscaping outfits one rainy Tuesday turns the week into three phone calls per customer. Plenty of outfits have that task covered by now, and still have three or four more like it burning time in the wings.

**Second paragraph now:**

> You're the one fielding maintenance appointments and rescheduling when somebody needs to move theirs. Plenty of outfits have that task covered by now, and still have three or four more like it burning time in the wings.

**The whole letter as it now stands:**

```
Hi Dan,

I'm based here in Central Oregon and I take the repetitive office work off small businesses, handing it to software automations and AI supported solutions so the time and the money go back into building the business instead.

You're the one fielding maintenance appointments and rescheduling when somebody needs to move theirs. Plenty of outfits have that task covered by now, and still have three or four more like it burning time in the wings.

I've done the job I'm offering to take off you, in finance, in construction and in my own businesses. Not a software person guessing at your week.

Fifteen minutes on the phone is all I need, and then I do the research for you at no cost. You get one tool that solves a specific challenge, what it costs to implement and why that one, plus what it would take to build whatever nothing off the shelf covers. Customers like you have taken anywhere from five to twenty hours a week off the table doing this.

No charge, nothing to sign, and you come away with my best recommendation for a tool that saves your team serious time and money. Worth a quarter of an hour? Reply here, or grab a time from my calendar below.

Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn
Grab a time on my calendar: https://calendly.com/visionairy/new-meeting
```

## 2. Madras Garden Depot — landscaping

- **What they do:** Provides plants, soil treatments, and landscaping supplies suited for high desert gardens.
- **Addressed to:** Karen E Mccarthy (owner; angle: owner)
- **They already run:** nothing visible on their record or their pages
- **Every area that fits (the card, 4 found):**
  - **#1 — IN THE EMAIL**: Staying in front of past customers (`email_and_newsletter`, marketing) — Sending monthly email updates about sales, classes, and gardening information
    - their words: "Mostly monthly missives from Karen, with updates on sales and classes, and gardening trends."
    - recurs: yes — "Mostly monthly missives" plainly states a recurring monthly rhythm. (plainly 0.9)
    - why this rank: tier 3: not among the library's pairings for landscaping, investigate before recommending; their own pages show it recurring plainly
  - dropped: The phone being answered when nobody is there (`phone_answering`, operations) — Answering phone calls and taking messages from customers
    - their words: "just email or call & leave a message"
    - recurs: no — Quote only describes how to contact them, not evidence of a recurring daily job. (plainly 0.15)
  - dropped: Booking, rescheduling and no-shows (`scheduling`, operations) — Booking customer appointments to visit
    - their words: "We're also open by appointment, just email or call & leave a message."
    - recurs: no — "By appointment" describes the booking method, not a fixed recurring task. (plainly 0.2)
  - dropped: Reminders, updates and answering the same questions (`client_communication`, admin) — Advising customers on plant selection, soil conditioning, and landscape design for their yards
    - their words: "She continues to consult with Central Oregon clients, advising them in the 'xeric way' of tending and watering its landscapes."
    - recurs: no — Consulting is inherently bespoke per client, not the same shape each time. (plainly 0.35)
- **Why these reached the email:** "Sending monthly email updates about sales, classes, and gardening information" ranked first (tier 3: not among the library's pairings for landscaping, investigate before recommending; their own pages show it recurring plainly); nothing of a genuinely different kind stood on its own beside it, so the email names one.
- **Named in the email:**
  - Sending monthly email updates about sales, classes, and gardening information — their words: "Mostly monthly missives from Karen, with updates on sales and classes, and gardening trends."
- **Rests on:** http://www.madrasgarden.com/
- **Their own words behind it:** "Mostly monthly missives from Karen, with updates on sales and classes, and gardening trends."
- **Status:** what the letter would become (nothing was written)

**Second paragraph before:**

> At most landscaping outfits one rainy Tuesday turns the week into three phone calls per customer. Some outfits may have that task handled, but many have three or four more like it burning time in the wings.

**Second paragraph now:**

> You're the one writing and sending those monthly updates with sales and classes and gardening trends, and that time lands on you. Some outfits may have that task handled, but many have three or four more like it burning time in the wings.

**The whole letter as it now stands:**

```
Hi Karen,

I'm local to Central Oregon. What I do is take the repetitive office work off small businesses and hand it to software automations and AI supported solutions, so my customers get their time and money back for the work that actually builds the business.

You're the one writing and sending those monthly updates with sales and classes and gardening trends, and that time lands on you. Some outfits may have that task handled, but many have three or four more like it burning time in the wings.

I've done the job I'm offering to take off you, in finance, in construction and in my own businesses. Not a software person guessing at your week.

Fifteen minutes on the phone, then I go away and do the research at no cost. Back comes one tool that solves a specific challenge for you, what implementing it costs and why it makes sense, and what building the parts nothing off the shelf covers would involve. Customers like you have found five to twenty hours a week of repetitive work this way.

No charge for the review, nothing to sign, and my best recommendation for a tool that saves your team real time and money. Worth a quarter of an hour? Reply here, or take a time from my calendar below.

Best regards,
Russ Wright
Founder
VisionAIry
503-621-8000 · russ@visionairy.biz
VisionAIry.biz · LinkedIn
Grab a time on my calendar: https://calendly.com/visionairy/new-meeting
```

## Kept the trade sentence — nothing specific could honestly be said

| Business | Trade | Already runs | Why |
|---|---|---|---|
| Deschutes Heating & Cooling | trades | nothing visible on their record or their pages | The page is blocked by a CAPTCHA robot-challenge screen; actual website content about their business operations is not visible. |
| Obsidian Real Estate Group | real estate | Gravity (online forms); a portal on their site (a portal for routine requests and payments) | Lead gen and qualification is described as Cole Conroy's work in your pages, not plainly shown as something landing on the principal broker's own desk. |
| Postal Connections 119 | storage & logistics | Gravity (online forms); Pipedrive (a CRM); Calendly (online booking) | every named job failed the recurrence test: "Helping customers choose between shipping carriers and options" (Generic service offer; no signal of volume, frequency, or weekly patterns.); "Filling out customs forms for international shipments" (Conditional service ("we can also assist"); happens when customers need it, no recurring pattern shown.); "Scheduling notary public appointments" (Reactive scheduling ("call for availability"); work shape depends on each customer's timing, not recurring in fixed form.); "Managing special orders for stamps and supplies" (Explicitly conditional ("if you need", "may be able to"); one-off orders, not recurring work.) |
| Redmond Oregon Auto Repair | auto | nothing visible on their record or their pages | every answer was rejected — last: the words behind "Support for Spanish-speaking customers" were not found on any stored page — every area needs their own words behind it, word for word |

**Obsidian Real Estate Group — areas found before the fallback:**
  - **#1 — IN THE EMAIL**: Following up on enquiries (`lead_follow_up`, sales) — Lead generation, qualification, and pipeline building for property prospects
    - their words: "She maintains a bespoke sales strategy and confidentiality plan to market businesses and real estate, including lead generation and qualification processes fine-tuned over years as a sales leader."
    - recurs: yes — Language about 'maintains' processes and systems 'fine-tuned over years' indicates established, recurring work. (plainly 0.65)
    - why this rank: tier 1 for real estate: a no-brainer pairing in the library; their own pages show it recurring fairly plainly; work the reader feels directly
  - dropped: Reminders, updates and answering the same questions (`client_communication`, admin) — Handling inquiries and questions from property buyers, renters, and owners
    - their words: "If you have any questions about our homes for sale or rent, or your a property owner who wants to know more, please fill out the form below and we'll get back to you as soon as we can."
    - recurs: no — Quoted text describes a service offering (form for inquiries) with no evidence of volume, frequency, or established pattern. (plainly 0.1)

**Postal Connections 119 — areas found before the fallback:**
  - dropped: Getting a price out and chasing it (`quoting_and_proposals`, sales) — Helping customers choose between shipping carriers and options
    - their words: "We will assist you in choosing the best option for your needs"
    - recurs: no — Generic service offer; no signal of volume, frequency, or weekly patterns. (plainly 0.1)
  - dropped: Producing the documents the work runs on (`drafting_and_documents`, operations) — Filling out customs forms for international shipments
    - their words: "we can also assist with International shipping customs forms"
    - recurs: no — Conditional service ("we can also assist"); happens when customers need it, no recurring pattern shown. (plainly 0.1)
  - dropped: Booking, rescheduling and no-shows (`scheduling`, operations) — Scheduling notary public appointments
    - their words: "Postal Connection's on-site notary professionals (call for availability) will handle your urgent documents"
    - recurs: no — Reactive scheduling ("call for availability"); work shape depends on each customer's timing, not recurring in fixed form. (plainly 0.25)
  - dropped: Knowing what to reorder (`inventory_and_ordering`, operations) — Managing special orders for stamps and supplies
    - their words: "If you need a special picture stamp, a commemorative stamp or a large quantity of postage, give us a call or send a message and we may be able to special order the stamps you need"
    - recurs: no — Explicitly conditional ("if you need", "may be able to"); one-off orders, not recurring work. (plainly 0.05)
