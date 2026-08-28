// Where the five hours are, by trade — four or more places to look in each.
//
// Built 2026-08-28 after Russ asked for "justification for at least 4
// scenarios per industry available for each customer based on their industry,
// available by click".
//
// Each one pairs three things that are useless apart:
//   · WHAT HAPPENS      the week as that trade actually lives it
//   · THE ARITHMETIC    how often x how long = hours. Their numbers on a call.
//   · WHAT FIXES IT     platforms already on file, and what Russ builds instead
//
// HOW TO READ THE NUMBERS. `perWeek` and `minutes` are starting estimates, not
// findings — they are there so the sum can be shown before the client has said
// anything, and they get overwritten with the client's own answer on the call.
// Where a trade body has published something, `evidence` names it and the real
// figure comes from evidence.js instead.
//
// What is NEVER estimated: how much of those hours a tool actually removes.
// Nobody has measured that for most of these platforms, so `removes` says
// 'most', 'some' or 'unmeasured' and never a percentage nobody counted.

const { evidenceFor, evidenceForWork } = require('./evidence.js');
const { platformsFor, buildFor, TYPES } = require('./toolLibrary.js');

// removes: how much of the counted hours the tool actually takes on.
//   MOST        the task runs without a person, exceptions only
//   HALF        the task still needs a person, but far less of one
//   UNMEASURED  plausible, nobody has counted it, say so
const MOST = 'most';
const HALF = 'about half';
const UNMEASURED = 'unmeasured';

const S = {
  construction: [
    { type: 'approvals_and_signatures', what: 'Change orders written up, emailed out, then chased for a signature', perWeek: 6, minutes: 35, removes: MOST, note: 'The chasing is the part that disappears — reminders send themselves.' },
    { type: 'field_capture', what: 'Site photos and daily reports sorted into the right job folder by hand', perWeek: 5, minutes: 25, removes: MOST },
    { type: 'quoting_and_proposals', what: 'Bids built from scratch each time, then followed up when they go quiet', perWeek: 4, minutes: 45, removes: HALF },
    { type: 'data_entry', what: 'The same job numbers typed into the estimate, the schedule and the books', perWeek: 12, minutes: 12, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Progress billing assembled by hand and payment chased by phone', perWeek: 8, minutes: 18, removes: HALF },
  ],

  'real estate': [
    { type: 'data_entry', what: 'Client details typed into the CRM, the transaction platform and the disclosure forms', perWeek: 3, minutes: 45, removes: MOST },
    { type: 'lead_follow_up', what: 'Enquiries that go cold because nobody had time to follow up twice', perWeek: 10, minutes: 5, removes: MOST, note: 'These are hours nobody currently spends — call it revenue found, not time saved.' },
    { type: 'referral_and_repeat', what: 'Past clients nobody has spoken to since closing', perWeek: 8, minutes: 8, removes: MOST },
    { type: 'approvals_and_signatures', what: 'Documents sent for signature and chased through the week', perWeek: 12, minutes: 10, removes: MOST },
    { type: 'social_content', what: 'Listings posted by hand to every channel, one at a time', perWeek: 6, minutes: 20, removes: HALF },
  ],

  medical: [
    { type: 'claims_and_billing_codes', what: 'Prior authorisations submitted, chased and resubmitted', perWeek: 39, minutes: 20, removes: HALF, evidence: 'medical', note: 'The one figure with a doctors\' association behind it.' },
    { type: 'records_requests', what: 'Records found, copied and sent when another practice asks', perWeek: 20, minutes: 6, removes: MOST },
    { type: 'intake_and_onboarding', what: 'New patient forms filled in on paper and typed in afterwards', perWeek: 25, minutes: 4, removes: MOST },
    { type: 'client_communication', what: 'Appointment reminders and no-show calls made by hand', perWeek: 60, minutes: 2, removes: MOST },
    { type: 'phone_answering', what: 'Calls going to voicemail while the front desk is with a patient', perWeek: 40, minutes: 3, removes: HALF },
  ],

  dental: [
    { type: 'claims_and_billing_codes', what: 'Insurance verified one patient at a time by phone or portal', perWeek: 30, minutes: 6, removes: MOST, evidence: 'dental' },
    { type: 'client_communication', what: 'Recall calls to patients who were due back six months ago', perWeek: 40, minutes: 3, removes: MOST },
    { type: 'scheduling', what: 'Gaps in the book filled by ringing round a waiting list', perWeek: 8, minutes: 15, removes: MOST },
    { type: 'reviews_and_reputation', what: 'Asking happy patients for a review, when anyone remembers', perWeek: 30, minutes: 3, removes: MOST },
    { type: 'intake_and_onboarding', what: 'New patient paperwork on a clipboard, typed in later', perWeek: 15, minutes: 5, removes: MOST },
  ],

  accounting: [
    { type: 'document_collection', what: 'Chasing clients for documents they swear they already sent', perWeek: 30, minutes: 4, removes: MOST, evidence: 'accounting' },
    { type: 'data_entry', what: 'Receipts and statements keyed in one line at a time', perWeek: 40, minutes: 6, removes: MOST },
    { type: 'client_communication', what: 'Answering the same five questions for every client, every year', perWeek: 25, minutes: 6, removes: HALF },
    { type: 'intake_and_onboarding', what: 'Taking on a new client: engagement letter, forms, setup', perWeek: 3, minutes: 40, removes: HALF },
    { type: 'invoicing_and_collections', what: 'Invoices raised by hand and chased when they age', perWeek: 20, minutes: 8, removes: MOST },
  ],

  legal: [
    { type: 'drafting_and_documents', what: 'The same clauses and letters retyped for each matter', perWeek: 15, minutes: 20, removes: HALF, evidence: 'legal' },
    { type: 'intake_and_onboarding', what: 'New matter intake taken by phone and typed up afterwards', perWeek: 6, minutes: 30, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Time written up from memory, billed, then chased', perWeek: 25, minutes: 10, removes: HALF },
    { type: 'document_collection', what: 'Chasing clients for the documents a matter cannot move without', perWeek: 15, minutes: 6, removes: MOST },
    { type: 'call_notes_and_follow_up', what: 'Attendance notes written up after every call', perWeek: 20, minutes: 8, removes: MOST },
  ],

  insurance: [
    { type: 'compliance_records', what: 'Certificates of insurance produced by hand', perWeek: 8, minutes: 60, removes: MOST, evidence: 'insurance', note: 'Best-evidenced scenario in the whole list.' },
    { type: 'client_communication', what: 'Renewal reminders sent and chased one policy at a time', perWeek: 25, minutes: 6, removes: MOST },
    { type: 'data_entry', what: 'The same client details typed into the carrier site and the agency system', perWeek: 20, minutes: 8, removes: MOST },
    { type: 'document_collection', what: 'Chasing signed applications and supporting documents', perWeek: 15, minutes: 6, removes: MOST },
    { type: 'quoting_and_proposals', what: 'Quotes compared across carriers and written up by hand', perWeek: 10, minutes: 25, removes: HALF },
  ],

  veterinary: [
    { type: 'client_communication', what: 'Vaccine and check-up reminders phoned through', perWeek: 60, minutes: 3, removes: MOST, evidence: 'veterinary' },
    { type: 'drafting_and_documents', what: 'Records and discharge notes finished at home after closing', perWeek: 30, minutes: 12, removes: HALF, evidence: 'veterinary' },
    { type: 'records_requests', what: 'Records pulled and sent when another clinic or an insurer asks', perWeek: 15, minutes: 8, removes: MOST },
    { type: 'scheduling', what: 'Booking and rebooking by phone, and chasing no-shows', perWeek: 40, minutes: 4, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Invoices raised at the desk and payment plans tracked by hand', perWeek: 35, minutes: 5, removes: HALF },
  ],

  trades: [
    { type: 'dispatch_and_routing', what: 'The day\'s jobs given out by phone, and changed by phone', perWeek: 40, minutes: 5, removes: MOST, evidence: 'trades' },
    { type: 'invoicing_and_collections', what: 'Paper job sheets typed up into invoices back at the office', perWeek: 40, minutes: 4, removes: MOST },
    { type: 'quoting_and_proposals', what: 'Quotes written up in the van at night and followed up never', perWeek: 12, minutes: 20, removes: HALF },
    { type: 'scheduling', what: 'Booking calls taken while somebody is under a house', perWeek: 30, minutes: 5, removes: MOST },
    { type: 'phone_answering', what: 'Calls missed during the working day and lost to the next name on the list', perWeek: 25, minutes: 4, removes: HALF },
  ],

  auto: [
    { type: 'phone_answering', what: 'Calls going unanswered while the advisor is writing an estimate', perWeek: 30, minutes: 4, removes: HALF, evidence: 'auto' },
    { type: 'quoting_and_proposals', what: 'Estimates that go quiet with nobody following up', perWeek: 25, minutes: 4, removes: MOST },
    { type: 'client_communication', what: 'Service reminders and "your car is ready" calls', perWeek: 40, minutes: 3, removes: MOST },
    { type: 'reviews_and_reputation', what: 'Asking for a review at collection, when anyone remembers', perWeek: 30, minutes: 3, removes: MOST },
    { type: 'inventory_and_ordering', what: 'Walking the shelves to work out what to reorder', perWeek: 5, minutes: 25, removes: HALF },
  ],

  'professional services': [
    { type: 'proposal_content', what: 'Proposals written from a blank page each time', perWeek: 4, minutes: 60, removes: HALF },
    { type: 'lead_follow_up', what: 'Enquiries answered once and never chased', perWeek: 12, minutes: 6, removes: MOST },
    { type: 'call_notes_and_follow_up', what: 'Notes and actions written up after every client call', perWeek: 15, minutes: 10, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Time collected from memory, invoiced, then chased', perWeek: 20, minutes: 8, removes: HALF },
    { type: 'scheduling', what: 'Meetings arranged over email, three messages each', perWeek: 15, minutes: 8, removes: MOST },
  ],

  manufacturing: [
    { type: 'quoting_and_proposals', what: 'Quotes priced by hand from drawings and past jobs', perWeek: 10, minutes: 30, removes: HALF },
    { type: 'data_entry', what: 'A quote retyped as a work order, then again as a packing slip', perWeek: 25, minutes: 10, removes: MOST },
    { type: 'inventory_and_ordering', what: 'Stock counted and reorder points worked out by eye', perWeek: 6, minutes: 30, removes: HALF },
    { type: 'compliance_records', what: 'Certificates, material records and traceability kept by hand', perWeek: 15, minutes: 12, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Invoices raised from paperwork after despatch', perWeek: 25, minutes: 8, removes: MOST },
  ],

  landscaping: [
    { type: 'scheduling', what: 'Weather reschedules phoned through to every customer', perWeek: 20, minutes: 4, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Invoices raised job by job at the end of the week', perWeek: 45, minutes: 3, removes: MOST },
    { type: 'quoting_and_proposals', what: 'Quotes measured, written up and rarely chased', perWeek: 15, minutes: 20, removes: HALF },
    { type: 'dispatch_and_routing', what: 'Crew routes worked out on paper each morning', perWeek: 5, minutes: 25, removes: MOST },
    { type: 'photo_and_visual', what: 'Before-and-after photos sorted for quotes and social', perWeek: 8, minutes: 15, removes: HALF },
  ],

  'storage & logistics': [
    { type: 'data_entry', what: 'The same ticket retyped at every handoff', perWeek: 40, minutes: 6, removes: MOST },
    { type: 'client_communication', what: 'Rent reminders, late notices and gate-code queries by phone', perWeek: 35, minutes: 4, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Monthly billing raised and chased by hand', perWeek: 30, minutes: 5, removes: MOST },
    { type: 'compliance_records', what: 'Driver logs, inspections and insurance certificates filed by hand', perWeek: 15, minutes: 10, removes: MOST },
    { type: 'phone_answering', what: 'Enquiry calls missed while somebody is out on the lot', perWeek: 25, minutes: 4, removes: HALF },
  ],

  'retail & food': [
    { type: 'inventory_and_ordering', what: 'Counting shelves to build the order', perWeek: 5, minutes: 45, removes: HALF },
    { type: 'social_content', what: 'Posting specials and hours, when somebody remembers', perWeek: 7, minutes: 15, removes: MOST },
    { type: 'reviews_and_reputation', what: 'Reviews answered late or not at all', perWeek: 15, minutes: 5, removes: MOST },
    { type: 'email_and_newsletter', what: 'Staying in front of regulars between visits', perWeek: 2, minutes: 60, removes: MOST },
    { type: 'scheduling', what: 'The rota built and rebuilt every week by hand', perWeek: 2, minutes: 75, removes: HALF },
  ],

  agriculture: [
    { type: 'compliance_records', what: 'Spray records, load tickets and certifications written twice', perWeek: 20, minutes: 10, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Invoices raised from delivery paperwork', perWeek: 20, minutes: 8, removes: MOST },
    { type: 'data_entry', what: 'Weights and loads copied from paper into a spreadsheet', perWeek: 30, minutes: 6, removes: MOST },
    { type: 'inventory_and_ordering', what: 'Inputs and parts tracked by memory and a clipboard', perWeek: 5, minutes: 30, removes: HALF },
    { type: 'client_communication', what: 'Ringing round buyers and hauliers to confirm each week', perWeek: 25, minutes: 5, removes: HALF },
  ],

  'cleaning & facilities': [
    { type: 'dispatch_and_routing', what: 'Crews, keys and routes arranged by phone each morning', perWeek: 30, minutes: 5, removes: MOST },
    { type: 'scheduling', what: 'Cancellations and one-off jobs slotted in by hand', perWeek: 20, minutes: 5, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Monthly invoices built from job sheets', perWeek: 30, minutes: 5, removes: MOST },
    { type: 'field_capture', what: 'Completion checklists on paper, photographed and emailed', perWeek: 40, minutes: 4, removes: MOST },
    { type: 'quoting_and_proposals', what: 'Walkthrough quotes written up at night', perWeek: 8, minutes: 25, removes: HALF },
  ],

  'personal care': [
    { type: 'scheduling', what: 'Bookings taken by phone between clients', perWeek: 45, minutes: 4, removes: MOST },
    { type: 'client_communication', what: 'Reminder calls and texts to cut no-shows', perWeek: 50, minutes: 2, removes: MOST },
    { type: 'reviews_and_reputation', what: 'Asking for reviews and answering them', perWeek: 20, minutes: 4, removes: MOST },
    { type: 'social_content', what: 'Posting work to Instagram, one photo at a time', perWeek: 10, minutes: 12, removes: HALF },
    { type: 'invoicing_and_collections', what: 'Payments, packages and deposits tracked by hand', perWeek: 40, minutes: 3, removes: MOST },
  ],

  staffing: [
    { type: 'lead_follow_up', what: 'Candidates and clients chased one message at a time', perWeek: 40, minutes: 5, removes: MOST },
    { type: 'compliance_records', what: 'Right-to-work, certifications and onboarding paperwork collected', perWeek: 12, minutes: 15, removes: MOST },
    { type: 'data_entry', what: 'CVs and details retyped into the system', perWeek: 25, minutes: 8, removes: MOST },
    { type: 'scheduling', what: 'Interviews arranged across three diaries', perWeek: 15, minutes: 10, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Timesheets collected, checked and invoiced', perWeek: 30, minutes: 6, removes: MOST },
  ],

  'nonprofit & community': [
    { type: 'reporting', what: 'Grant and board reports assembled from several places', perWeek: 3, minutes: 90, removes: HALF },
    { type: 'client_communication', what: 'Donor and volunteer messages sent one at a time', perWeek: 40, minutes: 5, removes: MOST },
    { type: 'data_entry', what: 'Donations and volunteer hours typed into a spreadsheet', perWeek: 30, minutes: 5, removes: MOST },
    { type: 'scheduling', what: 'Volunteer rotas built and rebuilt by hand', perWeek: 3, minutes: 45, removes: HALF },
    { type: 'email_and_newsletter', what: 'The newsletter that takes a day and goes out late', perWeek: 1, minutes: 180, removes: HALF },
  ],

  'education & childcare': [
    { type: 'intake_and_onboarding', what: 'Enrolment forms filled in on paper and typed up', perWeek: 8, minutes: 20, removes: MOST },
    { type: 'client_communication', what: 'Parent updates, reminders and absence calls', perWeek: 50, minutes: 4, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Fees invoiced and chased each month', perWeek: 30, minutes: 5, removes: MOST },
    { type: 'compliance_records', what: 'Ratios, checks and certifications kept up to date by hand', perWeek: 10, minutes: 15, removes: MOST },
    { type: 'scheduling', what: 'Staff cover arranged by phone each morning', perWeek: 10, minutes: 10, removes: HALF },
  ],

  'fitness & recreation': [
    { type: 'scheduling', what: 'Classes and sessions booked and rearranged by hand', perWeek: 50, minutes: 3, removes: MOST },
    { type: 'client_communication', what: 'Reminders, waitlists and cancellations handled one by one', perWeek: 40, minutes: 3, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Memberships, failed payments and renewals tracked by hand', perWeek: 25, minutes: 6, removes: MOST },
    { type: 'lead_follow_up', what: 'Trial visitors who never got a second contact', perWeek: 15, minutes: 6, removes: MOST },
    { type: 'social_content', what: 'Posting the timetable and the results, when there is time', perWeek: 7, minutes: 15, removes: MOST },
  ],

  'lodging & hospitality': [
    { type: 'client_communication', what: 'Booking confirmations, arrival details and questions answered one at a time', perWeek: 45, minutes: 5, removes: MOST },
    { type: 'scheduling', what: 'Cleaning and turnover coordinated by phone', perWeek: 25, minutes: 6, removes: MOST },
    { type: 'reviews_and_reputation', what: 'Reviews chased and replied to across three sites', perWeek: 20, minutes: 5, removes: MOST },
    { type: 'invoicing_and_collections', what: 'Deposits, balances and damage charges tracked by hand', perWeek: 25, minutes: 5, removes: MOST },
    { type: 'data_entry', what: 'Bookings retyped between the channel and the calendar', perWeek: 30, minutes: 5, removes: MOST },
  ],

  'funeral & memorial': [
    { type: 'drafting_and_documents', what: 'Notices, orders of service and filings produced for each family', perWeek: 5, minutes: 45, removes: HALF },
    { type: 'compliance_records', what: 'Permits and registrations filed by hand', perWeek: 5, minutes: 30, removes: MOST },
    { type: 'client_communication', what: 'Arrangements confirmed and reconfirmed by phone', perWeek: 25, minutes: 6, removes: HALF },
    { type: 'invoicing_and_collections', what: 'Accounts settled with families and insurers', perWeek: 10, minutes: 15, removes: HALF },
  ],
};

// A trade nobody wrote a list for still gets somewhere to look — these are the
// four that sit in every business regardless of what it sells.
const EVERY_BUSINESS = [
  { type: 'lead_follow_up', what: 'Enquiries answered once and never chased', perWeek: 12, minutes: 6, removes: MOST },
  { type: 'invoicing_and_collections', what: 'Invoices raised by hand and chased when they age', perWeek: 20, minutes: 7, removes: MOST },
  { type: 'client_communication', what: 'The same questions answered by phone all week', perWeek: 30, minutes: 4, removes: HALF },
  { type: 'scheduling', what: 'Appointments arranged over three messages each', perWeek: 15, minutes: 8, removes: MOST },
];

function hoursFor(s) {
  return Math.round(((s.perWeek * s.minutes) / 60) * 10) / 10;
}

// Everything to show on a customer's card: what to look at, the sum, what
// fixes it, and what may be said out loud about it.
function forTrade(trade) {
  const key = String(trade || '').toLowerCase();
  const list = S[key] || EVERY_BUSINESS;
  const ev = evidenceFor(key);
  const scenarios = list.map((s) => ({
    ...s,
    label: (TYPES[s.type] && TYPES[s.type].label) || s.type,
    hours: hoursFor(s),
    sum: `${s.perWeek} a week x ${s.minutes} min = ${hoursFor(s)} hours`,
    buy: platformsFor(s.type).slice(0, 4),
    build: buildFor(s.type),
    // Two kinds, and the second is the one that reaches nearly every trade.
    //   evidence      a trade body measured this task in THIS trade
    //   workEvidence  somebody measured this KIND OF WORK anywhere
    // Following up an enquiry is the same act in a roofing company and a
    // dental practice, so the Harvard lead-response study belongs to both
    // (2026-08-28, after Russ refused to accept three trades out of
    // twenty-four: "all of these fucking tools and there are no credible
    // measurements?").
    evidence: s.evidence ? evidenceFor(s.evidence) : null,
    workEvidence: evidenceForWork(s.type),
  })).sort((a, b) => b.hours - a.hours);

  return {
    trade: key,
    generic: !S[key],
    scenarios,
    // The whole trade's evidence, whatever its trust level.
    evidence: ev,
    topThreeHours: Math.round(scenarios.slice(0, 3).reduce((n, s) => n + s.hours, 0) * 10) / 10,
  };
}

function tradesCovered() { return Object.keys(S); }

module.exports = { S, EVERY_BUSINESS, MOST, HALF, UNMEASURED, hoursFor, forTrade, tradesCovered };
