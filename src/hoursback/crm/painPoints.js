// What each kind of business actually loses hours to.
//
// The point is not to describe automation. It is to name something they
// already know is true, in their words, so the reply writes itself: "how did
// he know that." Once a person recognises their own week in a sentence, the
// guarantee does the rest of the work — there is nothing to weigh up, because
// finding out costs them nothing.
//
// Every line here is a real, common pattern in that trade. None of it is a
// claim about a client Russ has had. Replace these with his own findings the
// moment the first audits are done; a real number from a real Bend business
// beats every one of them.

// The five places hours go in any business. Naming the function as well as the
// trade is what lets one message speak to a dental office and another to a
// millwork shop without either sounding generic.
const FUNCTIONS = ['paper', 'scheduling', 'follow-up', 'billing', 'inventory', 'hiring'];

// For each trade: the pain most likely to be true, the one they will recognise
// instantly, and roughly what it costs a week. `recognition` is the sentence
// that makes them think somebody looked. `cost` is stated as what a business
// that size typically carries.
const PAIN_BY_TRADE = {
  trades: {
    function: 'scheduling',
    recognition: 'One person in the office is the schedule. They know which truck is where, who is running late and which customer has already called twice, and none of it is written down anywhere that would survive them taking a week off.',
    cost: 'eight to fourteen hours a week',
    lever: 'dispatch and the callbacks that come out of it',
    looksLike: 'the schedule living somewhere other than one person\'s head, and the callbacks going out on their own',
    valueIn: 'another job on the board instead of an evening doing paperwork',
  },
  construction: {
    function: 'paper',
    recognition: 'Submittals go out, change orders come back, and somebody spends their week chasing signatures and re-keying the same numbers into a spreadsheet, a folder, and whatever the accountant wants.',
    cost: 'ten to sixteen hours a week',
    lever: 'change orders and the paperwork trail behind them',
    looksLike: 'a change order going out and coming back signed without anybody chasing it, and the numbers typed once instead of four times',
    valueIn: 'billing going out on time instead of three weeks behind',
  },
  'real estate': {
    function: 'follow-up',
    recognition: 'The same client details get typed into the listing system, the transaction system and an email, and the deals that go quiet mostly go quiet because nobody had time to follow up, not because the client lost interest.',
    cost: 'nine to fifteen hours a week',
    lever: 'the follow-up that keeps deals from going quiet',
    looksLike: 'client details entered once and showing up everywhere, and the follow-up happening whether or not anybody remembers',
    valueIn: 'more time in front of clients and fewer deals going quiet',
  },
  medical: {
    function: 'paper',
    recognition: 'Records requests, referrals and prior authorizations pile up on one desk, and the front office spends its day on the phone with insurers instead of with patients.',
    cost: 'twelve to twenty hours a week',
    lever: 'records requests and claim follow-up',
    looksLike: 'records requests answered without a phone call, and a claim checked before it goes rather than after it comes back',
    valueIn: 'your front office looking after patients instead of insurers',
  },
  dental: {
    function: 'follow-up',
    recognition: 'Somebody spends part of every week phoning patients to book their next cleaning, and re-sending claims that came back over a single missing field.',
    cost: 'ten to eighteen hours a week',
    lever: 'recall and the claims that come back',
    looksLike: 'the reminders going out on their own, and a claim checked for the missing field before it leaves',
    valueIn: 'chairs full without somebody spending their afternoon on the phone to fill them',
  },
  legal: {
    function: 'paper',
    recognition: 'Intake, engagement letters and conflict checks land on whoever is nearest, and the same client information gets typed three times before anybody bills an hour.',
    cost: 'eight to fourteen hours a week',
    lever: 'intake, and getting the file open faster',
    looksLike: 'client details typed once instead of three times, and the file open the day it comes in',
    valueIn: 'more billable hours and files opening the day they come in',
  },
  accounting: {
    function: 'follow-up',
    recognition: 'Half the job in season is chasing clients for documents they said they already sent, and the other half is re-keying what they finally send in a format nobody asked for.',
    cost: 'twelve to twenty hours a week',
    lever: 'chasing documents, and what happens when they arrive',
    looksLike: 'the chasing happening on its own, and what clients finally send landing in your system without anybody typing it',
    valueIn: 'more returns out the door in the same season',
  },
  insurance: {
    function: 'paper',
    recognition: 'Certificates and renewals arrive as a deadline rather than a plan, and somebody re-types the same client details into the carrier portal, the agency system and an email every single time.',
    cost: 'eight to fourteen hours a week',
    lever: 'renewals and certificates',
    looksLike: 'renewals surfacing weeks ahead instead of the day they land, and details entered once for every system',
    valueIn: 'renewals handled before they become a fire drill',
  },
  auto: {
    function: 'follow-up',
    recognition: 'Estimates go out and half of them never come back, not because the customer went elsewhere but because nobody had time to ring them. Meanwhile the service desk is on hold with a parts supplier.',
    cost: 'seven to twelve hours a week',
    lever: 'estimates that never get chased',
    looksLike: 'every estimate chased without anybody having to remember, and parts ordered without sitting on hold',
    valueIn: 'another car through the bay instead of somebody on hold with a parts supplier',
  },
  landscaping: {
    function: 'scheduling',
    recognition: 'Through the season the schedule lives in somebody\u2019s head and a paper diary, weather moves half of it, and every change is three phone calls.',
    cost: 'eight to twelve hours a week',
    lever: 'the schedule, and what happens when weather moves it',
    looksLike: 'the schedule moving itself when the weather does, and the crew told without three phone calls',
    valueIn: 'a full crew day instead of an hour lost to rescheduling',
  },
  'storage & logistics': {
    function: 'paper',
    recognition: 'Paperwork moves between dispatch, the driver and the customer and each handoff is somebody re-typing what the last person already wrote down.',
    cost: 'ten to sixteen hours a week',
    lever: 'the handoffs between dispatch and the driver',
    looksLike: 'the ticket written once and carried through dispatch, driver and customer without being re-typed',
    valueIn: 'a load moving without three people re-typing the same ticket',
  },
  staffing: {
    function: 'paper',
    recognition: 'Applications come in one format, timesheets in another, and somebody spends their week moving both into whatever runs payroll.',
    cost: 'fifteen hours a week or more',
    lever: 'applications and timesheets',
    looksLike: 'applications and timesheets landing in payroll without anybody moving them across',
    valueIn: 'more placements in the same week',
  },
  'retail & food': {
    function: 'inventory',
    recognition: 'Ordering runs on somebody walking the shelves and knowing what usually sells, invoices get entered twice, and the schedule gets rebuilt every time one person calls in.',
    cost: 'eight to twelve hours a week',
    lever: 'ordering and the schedule',
    looksLike: 'ordering built off what actually sold, and the schedule filling itself when somebody calls in',
    valueIn: 'somebody on the floor instead of in the back office',
  },
  manufacturing: {
    function: 'paper',
    recognition: 'A quote becomes a work order becomes a packing slip, and each of those is typed fresh by somebody rather than carried forward.',
    cost: 'ten to sixteen hours a week',
    lever: 'quotes carrying through to work orders',
    looksLike: 'a quote becoming a work order becoming a packing slip without being typed again',
    valueIn: 'a quote turning into a work order without anybody re-keying it',
  },
  'personal care': {
    function: 'scheduling',
    recognition: 'Bookings, no-shows and rebooking run through whoever is at the desk, and every gap in the day is money that was already spoken for.',
    cost: 'six to ten hours a week',
    lever: 'bookings and no-shows',
    looksLike: 'the gaps in the day filled without somebody at the desk phoning round',
    valueIn: 'a fuller book and fewer gaps in the day',
  },
  'fitness & recreation': {
    function: 'scheduling',
    recognition: 'Memberships, bookings and waivers are three separate piles, and chasing lapsed members is the job nobody gets to.',
    cost: 'six to ten hours a week',
    lever: 'lapsed members nobody has time to chase',
    looksLike: 'lapsed members chased without anybody getting to it, and waivers signed before they arrive',
    valueIn: 'members staying rather than quietly lapsing',
  },
  'lodging & hospitality': {
    function: 'scheduling',
    recognition: 'Bookings arrive from three places and get copied into one calendar by hand, and every change is a phone call and a correction.',
    cost: 'eight to fourteen hours a week',
    lever: 'bookings arriving from three places at once',
    looksLike: 'bookings from all three places landing in one calendar on their own',
    valueIn: 'rooms filled without a double-booking to unpick',
  },
  'education & childcare': {
    function: 'paper',
    recognition: 'Enrollment forms, immunization records and billing all live in different places, and somebody re-types a family\u2019s details into each of them.',
    cost: 'eight to fourteen hours a week',
    lever: 'enrollment paperwork and billing',
    looksLike: 'a family entered once and appearing in enrollment, records and billing',
    valueIn: 'staff with families rather than with forms',
  },
  'cleaning & facilities': {
    function: 'scheduling',
    recognition: 'Crews, keys and route changes run through one person\u2019s phone, and a single cancellation costs half an hour of calls.',
    cost: 'seven to twelve hours a week',
    lever: 'routing crews and handling cancellations',
    looksLike: 'one cancellation rerouting the crew without a morning of calls',
    valueIn: 'crews where they should be without a morning of calls',
  },
  'professional services': {
    function: 'follow-up',
    recognition: 'Proposals go out and the ones that go quiet mostly go quiet for want of a follow-up, while the same client details get typed into a proposal, an invoice and a project tool.',
    cost: 'eight to fourteen hours a week',
    lever: 'proposals that go quiet',
    looksLike: 'proposals followed up whether or not anybody remembers, and details entered once',
    valueIn: 'proposals out the same day rather than at the end of the week',
  },
  agriculture: {
    function: 'paper',
    recognition: 'Compliance records, load tickets and payroll for seasonal crews all get written once on paper and typed again later, usually at night.',
    cost: 'eight to fourteen hours a week',
    lever: 'load tickets and seasonal payroll',
    looksLike: 'load tickets and compliance records captured once in the field, not typed again at night',
    valueIn: 'the office side done before dark instead of after it',
  },
  'nonprofit & community': {
    function: 'follow-up',
    recognition: 'Donor records, volunteer sign-ups and grant reporting live in three places, and the thanking and following up is what slips when everything else is urgent.',
    cost: 'eight to twelve hours a week',
    lever: 'donor follow-up and grant reporting',
    looksLike: 'donors thanked without anybody finding the time, and grant reporting assembled rather than written',
    valueIn: 'more time on the mission and less on reporting it',
  },
  veterinary: {
    function: 'follow-up',
    recognition: 'Reminder calls for shots and check-ups fall to whoever has a spare minute, and the front desk is booking the next visit, taking payment and finishing a chart at the same counter.',
    cost: 'eight to fourteen hours a week',
    lever: 'reminders, and what lands on the front desk',
    looksLike: 'the shot and check-up reminders going out on their own, and the chart finished before the next one walks in',
    valueIn: 'a full book without somebody spending an afternoon on the phone to fill it',
  },
  'funeral & memorial': {
    function: 'paper',
    recognition: 'Every arrangement generates the same details on a dozen forms, and they get written out by hand each time, for families who should not be waiting.',
    cost: 'eight to twelve hours a week',
    lever: 'the forms behind every arrangement',
    looksLike: 'the family\'s details entered once and filling every form after that',
    valueIn: 'families waiting on you rather than on paperwork',
  },
};

// When the trade is unknown, this is still true of almost every small business.
const GENERAL_PAIN = {
  function: 'paper',
  looksLike: 'the same details entered once and appearing everywhere they are needed, without anybody typing them again',
  recognition: 'The same information gets typed into two or three different places by somebody whose actual job is something else, and it is almost never where the owner would guess the hours are going.',
  cost: 'eight to fifteen hours a week',
  lever: 'the same details being typed more than once',
  valueIn: 'a day that ends when the work does',
};

function painFor(trade) {
  return PAIN_BY_TRADE[trade] || GENERAL_PAIN;
}

module.exports = { FUNCTIONS, PAIN_BY_TRADE, GENERAL_PAIN, painFor };
