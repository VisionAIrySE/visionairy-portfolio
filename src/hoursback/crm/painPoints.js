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
    recognition: 'Somebody in your office is the schedule. They know which truck is where, who is running late, and which customer has already called twice, and none of it is written down anywhere that would survive them taking a week off.',
    cost: 'eight to fourteen hours a week',
    lever: 'dispatch and the callbacks that come out of it',
  },
  construction: {
    function: 'paper',
    recognition: 'Submittals go out, change orders come back, and somebody spends their week chasing signatures and re-keying the same numbers into a spreadsheet, a folder, and whatever the accountant wants.',
    cost: 'ten to sixteen hours a week',
    lever: 'change orders and the paperwork trail behind them',
  },
  'real estate': {
    function: 'follow-up',
    recognition: 'The same client details get typed into your listing system, your transaction system and your email, and the deals that go quiet mostly go quiet because nobody had time to follow up, not because the client lost interest.',
    cost: 'nine to fifteen hours a week',
    lever: 'the follow-up that keeps deals from going quiet',
  },
  medical: {
    function: 'paper',
    recognition: 'Records requests, referrals and prior authorizations pile up on one desk, and the front office spends its day on the phone with insurers instead of with patients.',
    cost: 'twelve to twenty hours a week',
    lever: 'records requests and claim follow-up',
  },
  dental: {
    function: 'follow-up',
    recognition: 'Recall is the whole business and it is somebody calling down a list. Claims come back rejected for a missing field and get re-sent by hand, and nobody has ever counted the hours that takes.',
    cost: 'ten to eighteen hours a week',
    lever: 'recall and the claims that come back',
  },
  legal: {
    function: 'paper',
    recognition: 'Intake, engagement letters and conflict checks land on whoever is nearest, and the same client information gets typed three times before anybody bills an hour.',
    cost: 'eight to fourteen hours a week',
    lever: 'intake, and getting the file open faster',
  },
  accounting: {
    function: 'follow-up',
    recognition: 'Half the job in season is chasing clients for documents they said they already sent, and the other half is re-keying what they finally send in a format nobody asked for.',
    cost: 'twelve to twenty hours a week',
    lever: 'chasing documents, and what happens when they arrive',
  },
  insurance: {
    function: 'paper',
    recognition: 'Certificates and renewals arrive as a deadline rather than a plan, and somebody re-types the same client details into the carrier portal, the agency system and an email every single time.',
    cost: 'eight to fourteen hours a week',
    lever: 'renewals and certificates',
  },
  auto: {
    function: 'follow-up',
    recognition: 'Estimates go out and half of them never come back, not because the customer went elsewhere but because nobody had time to ring them. Meanwhile the service desk is on hold with a parts supplier.',
    cost: 'seven to twelve hours a week',
    lever: 'estimates that never get chased',
  },
  landscaping: {
    function: 'scheduling',
    recognition: 'Through the season the schedule lives in somebody\u2019s head and a paper diary, weather moves half of it, and every change is three phone calls.',
    cost: 'eight to twelve hours a week',
    lever: 'the schedule, and what happens when weather moves it',
  },
  'storage & logistics': {
    function: 'paper',
    recognition: 'Paperwork moves between dispatch, the driver and the customer and each handoff is somebody re-typing what the last person already wrote down.',
    cost: 'ten to sixteen hours a week',
    lever: 'the handoffs between dispatch and the driver',
  },
  staffing: {
    function: 'paper',
    recognition: 'Applications come in one format, timesheets in another, and somebody spends their week moving both into whatever runs payroll.',
    cost: 'fifteen hours a week or more',
    lever: 'applications and timesheets',
  },
  'retail & food': {
    function: 'inventory',
    recognition: 'Ordering runs on somebody walking the shelves and knowing what usually sells, invoices get entered twice, and the schedule gets rebuilt every time one person calls in.',
    cost: 'eight to twelve hours a week',
    lever: 'ordering and the schedule',
  },
  manufacturing: {
    function: 'paper',
    recognition: 'A quote becomes a work order becomes a packing slip, and each of those is typed fresh by somebody rather than carried forward.',
    cost: 'ten to sixteen hours a week',
    lever: 'quotes carrying through to work orders',
  },
  'personal care': {
    function: 'scheduling',
    recognition: 'Bookings, no-shows and rebooking run through whoever is at the desk, and every gap in the day is money that was already spoken for.',
    cost: 'six to ten hours a week',
    lever: 'bookings and no-shows',
  },
  'fitness & recreation': {
    function: 'scheduling',
    recognition: 'Memberships, bookings and waivers are three separate piles, and chasing lapsed members is the job nobody gets to.',
    cost: 'six to ten hours a week',
    lever: 'lapsed members nobody has time to chase',
  },
  'lodging & hospitality': {
    function: 'scheduling',
    recognition: 'Bookings arrive from three places and get copied into one calendar by hand, and every change is a phone call and a correction.',
    cost: 'eight to fourteen hours a week',
    lever: 'bookings arriving from three places at once',
  },
  'education & childcare': {
    function: 'paper',
    recognition: 'Enrollment forms, immunization records and billing all live in different places, and somebody re-types a family\u2019s details into each of them.',
    cost: 'eight to fourteen hours a week',
    lever: 'enrollment paperwork and billing',
  },
  'cleaning & facilities': {
    function: 'scheduling',
    recognition: 'Crews, keys and route changes run through one person\u2019s phone, and a single cancellation costs half an hour of calls.',
    cost: 'seven to twelve hours a week',
    lever: 'routing crews and handling cancellations',
  },
  'professional services': {
    function: 'follow-up',
    recognition: 'Proposals go out and the ones that go quiet mostly go quiet for want of a follow-up, while the same client details get typed into a proposal, an invoice and a project tool.',
    cost: 'eight to fourteen hours a week',
    lever: 'proposals that go quiet',
  },
  agriculture: {
    function: 'paper',
    recognition: 'Compliance records, load tickets and payroll for seasonal crews all get written once on paper and typed again later, usually at night.',
    cost: 'eight to fourteen hours a week',
    lever: 'load tickets and seasonal payroll',
  },
  'nonprofit & community': {
    function: 'follow-up',
    recognition: 'Donor records, volunteer sign-ups and grant reporting live in three places, and the thanking and following up is what slips when everything else is urgent.',
    cost: 'eight to twelve hours a week',
    lever: 'donor follow-up and grant reporting',
  },
  'funeral & memorial': {
    function: 'paper',
    recognition: 'Every arrangement generates the same details on a dozen forms, and they get written out by hand each time, for families who should not be waiting.',
    cost: 'eight to twelve hours a week',
    lever: 'the forms behind every arrangement',
  },
};

// When the trade is unknown, this is still true of almost every small business.
const GENERAL_PAIN = {
  function: 'paper',
  recognition: 'The same information gets typed into two or three different places by somebody whose actual job is something else, and it is almost never where the owner would guess the hours are going.',
  cost: 'eight to fifteen hours a week',
  lever: 'the same details being typed more than once',
};

function painFor(trade) {
  return PAIN_BY_TRADE[trade] || GENERAL_PAIN;
}

module.exports = { FUNCTIONS, PAIN_BY_TRADE, GENERAL_PAIN, painFor };
