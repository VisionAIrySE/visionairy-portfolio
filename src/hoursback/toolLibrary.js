// What software can take off a business, by industry.
//
// Two layers on purpose. TYPES are the things every business in a trade needs
// fixing — document collection, data entry, client chasing. They barely change.
// PLATFORMS are the products that do them today, and those change constantly.
// A tool that dies takes its row with it; the type it sat under stays, and the
// discovery questions hanging off that type keep working (Russ, 2026-08-27:
// "each industry should have 3 or 4 types of tools that are impactful for
// their specific business and we can start fleshing out the library from
// there").
//
// A tier belongs to a PAIRING, never to a platform on its own. The best tool
// on the market is a bad recommendation for a business without that problem:
//   1  no-brainer for this trade
//   2  probably helpful, depends what discovery finds
//   3  investigate before recommending
//
// Every saving carries where the figure came from. The guarantee is five hours
// a week or nothing to pay, so a number in a report has to be answerable when a
// client asks where it comes from. `source: null` means nobody has verified it
// and it may not be quoted to a client.
//
// Cost is a monthly figure per seat or per business, stamped with the date it
// was checked. Prices go stale; a stale price in front of a client reads as
// carelessness.

const CHECKED = '2026-08-27';

// The five places work happens. Discovery walks all of them.
const DEPARTMENTS = ['operations', 'sales', 'marketing', 'admin', 'finance'];

// A type of work software can take over. `department` is where it lives,
// `question` is the top-level thing to ask about it on a call.
const TYPES = {
  document_collection: {
    department: 'admin',
    label: 'Collecting documents from clients',
    question: 'How do documents get from your clients to you, and who chases the ones that never arrive?',
  },
  data_entry: {
    department: 'admin',
    label: 'Typing in what arrives',
    question: 'Once something arrives, who types it into your systems, and how many places does it go?',
  },
  client_communication: {
    department: 'admin',
    label: 'Reminders, updates and answering the same questions',
    question: 'What questions does your team answer over and over, and who fields them?',
  },
  scheduling: {
    department: 'operations',
    label: 'Booking, rescheduling and no-shows',
    question: 'How does something get on the calendar, and what happens when it moves?',
  },
  quoting_and_proposals: {
    department: 'sales',
    label: 'Getting a price out and chasing it',
    question: 'How does a quote get built and sent, and who follows up on the ones that go quiet?',
  },
  field_capture: {
    department: 'operations',
    label: 'Recording what happened on site',
    question: 'How does what happened on a job get written down, and when does it get typed up?',
  },
  approvals_and_signatures: {
    department: 'operations',
    label: 'Getting things signed and back',
    question: 'What has to be signed and returned before work can carry on, and who chases it?',
  },
  invoicing_and_collections: {
    department: 'finance',
    label: 'Billing and getting paid',
    question: 'How does an invoice get raised, and who follows up when it is not paid?',
  },
  lead_follow_up: {
    department: 'sales',
    label: 'Following up on enquiries',
    question: 'What happens to an enquiry that comes in when nobody has time to answer it that day?',
  },
  reporting: {
    department: 'finance',
    label: 'Putting numbers together for somebody',
    question: 'What reports does somebody assemble by hand each week or month?',
  },
  intake_and_onboarding: {
    department: 'operations',
    label: 'Taking on a new client or job',
    question: 'Walk me through what happens between somebody saying yes and work actually starting.',
  },
  inventory_and_ordering: {
    department: 'operations',
    label: 'Knowing what to reorder',
    question: 'How do you decide what to order, and who works that out?',
  },
  claims_and_billing_codes: {
    department: 'finance',
    label: 'Claims and what comes back rejected',
    question: 'What happens when a claim comes back over a missing field, and who fixes it?',
  },
  records_requests: {
    department: 'admin',
    label: 'Finding and sending records somebody asked for',
    question: 'Who handles requests for records, and how long does one take?',
  },
  dispatch_and_routing: {
    department: 'operations',
    label: 'Getting people and vehicles to the right place',
    question: 'Who decides who goes where each morning, and what happens when it changes?',
  },
  compliance_records: {
    department: 'admin',
    label: 'Records you have to keep for somebody else',
    question: 'What do you have to record because a regulator or an insurer asks for it?',
  },

  // --- growth -------------------------------------------------------------
  // The first pass of this file was entirely back office: chasing, typing,
  // filing. That is half the offer. A landscaper who gets every job by word of
  // mouth does not need his admin trimmed, he needs a way to be found on a
  // Tuesday in February — and the tools for that are the same price as the
  // ones that file his paperwork (Russ, 2026-08-27: "A landscaper that only
  // gets new business by word of mouth would love social media automation and
  // content generation to drive business").
  //
  // These sit under the same rule as everything else: they must make money,
  // save time, or make the work better, and the saving has to be sourced.
  outbound_prospecting: {
    department: 'sales',
    label: 'Finding and contacting businesses who have never heard of you',
    question: 'Where does new work come from today, and what happens in a month when it is quiet?',
  },
  social_content: {
    department: 'marketing',
    label: 'Getting posted regularly without anybody writing it',
    question: 'Who writes and posts your social media, and how often does it actually happen?',
  },
  reviews_and_reputation: {
    department: 'marketing',
    label: 'Asking for reviews and answering them',
    question: 'Who asks your customers for a review, and who replies to the ones you get?',
  },
  local_search_presence: {
    department: 'marketing',
    label: 'Being found when somebody nearby searches',
    question: 'When somebody local searches for what you do, what do they find?',
  },
  email_and_newsletter: {
    department: 'marketing',
    label: 'Staying in front of past customers',
    question: 'What do you send to people who bought from you two years ago?',
  },
  website_and_capture: {
    department: 'marketing',
    label: 'Turning a visitor into an enquiry',
    question: 'Somebody lands on your site at nine at night with a job to quote. What happens?',
  },
  referral_and_repeat: {
    department: 'sales',
    label: 'Asking for the next job and the referral',
    question: 'Who asks a happy customer for the next job, or for a name?',
  },
  proposal_content: {
    department: 'sales',
    label: 'Writing the words in a proposal',
    question: 'Who writes the wording in a proposal, and how much of it is written fresh each time?',
  },

  // --- the work itself ----------------------------------------------------
  // Not admin and not growth: the trade's own output. Cheap to overlook and
  // often the biggest single win in a small shop.
  drafting_and_documents: {
    department: 'operations',
    label: 'Producing the documents the work runs on',
    question: 'What documents does your team write from scratch that mostly say the same thing?',
  },
  knowledge_lookup: {
    department: 'operations',
    label: 'Finding the answer buried in your own files',
    question: 'How long does it take somebody to find the answer to a question in your own records?',
  },
  training_and_handover: {
    department: 'operations',
    label: 'Getting a new person up to speed',
    question: 'How long before a new hire is useful, and who carries that?',
  },

  // --- what AI does that software never could -----------------------------
  // Everything above could in principle be done by ordinary software. These
  // could not, and they are where the surprise lives on a call: a phone that
  // answers itself at seven at night, video content nobody had to film, a
  // recording that writes its own notes. Missed on the first two passes
  // (Russ, 2026-08-27: "tools like Eleven Labs and HeyGen").
  phone_answering: {
    department: 'operations',
    label: 'The phone being answered when nobody is there',
    question: 'What happens to a call that comes in at seven in the evening, or while your team is on a job?',
  },
  call_notes_and_follow_up: {
    department: 'sales',
    label: 'Writing up what was said on a call',
    question: 'After a call with a customer, who writes down what was agreed and what happens next?',
  },
  video_content: {
    department: 'marketing',
    label: 'Video without filming anything',
    question: 'Have you ever wanted video for your business and stopped because of what it takes to make?',
  },
  voice_and_audio: {
    department: 'marketing',
    label: 'Voiceover, adverts and recorded messages',
    question: 'Who records your hold message, your adverts, or anything a customer hears?',
  },
  translation_and_accessibility: {
    department: 'operations',
    label: 'Reaching customers who do not read English',
    question: 'How much of your customer base speaks Spanish, and how do you serve them today?',
  },
  photo_and_visual: {
    department: 'marketing',
    label: 'Photographs of the work, made presentable',
    question: 'What happens to the photos your crew takes on site?',
  },
};

// The three or four types that matter most in each trade, strongest first.
// The order IS the recommendation order on a free fifteen-minute call.
// Four each, and they are NOT all back office. Where a trade's problem is
// that nobody knows they exist, the growth types lead. A landscaper who gets
// every job by word of mouth has a quiet February, and trimming his filing
// does nothing about it.
const BY_TRADE = {
  accounting: ['document_collection', 'data_entry', 'client_communication', 'email_and_newsletter'],
  construction: ['approvals_and_signatures', 'field_capture', 'quoting_and_proposals', 'invoicing_and_collections'],
  landscaping: ['social_content', 'reviews_and_reputation', 'scheduling', 'local_search_presence'],
  trades: ['dispatch_and_routing', 'lead_follow_up', 'reviews_and_reputation', 'invoicing_and_collections'],
  dental: ['client_communication', 'claims_and_billing_codes', 'scheduling', 'reviews_and_reputation'],
  medical: ['records_requests', 'claims_and_billing_codes', 'client_communication', 'intake_and_onboarding'],
  veterinary: ['client_communication', 'scheduling', 'drafting_and_documents', 'reviews_and_reputation'],
  legal: ['intake_and_onboarding', 'drafting_and_documents', 'knowledge_lookup', 'client_communication'],
  insurance: ['document_collection', 'client_communication', 'data_entry', 'referral_and_repeat'],
  'real estate': ['lead_follow_up', 'data_entry', 'social_content', 'referral_and_repeat'],
  'professional services': ['quoting_and_proposals', 'proposal_content', 'lead_follow_up', 'invoicing_and_collections'],
  auto: ['lead_follow_up', 'client_communication', 'reviews_and_reputation', 'inventory_and_ordering'],
  manufacturing: ['quoting_and_proposals', 'data_entry', 'inventory_and_ordering', 'outbound_prospecting'],
  'storage & logistics': ['field_capture', 'dispatch_and_routing', 'invoicing_and_collections', 'client_communication'],
  'cleaning & facilities': ['dispatch_and_routing', 'scheduling', 'outbound_prospecting', 'invoicing_and_collections'],
  'personal care': ['scheduling', 'client_communication', 'reviews_and_reputation', 'social_content'],
  'fitness & recreation': ['scheduling', 'email_and_newsletter', 'social_content', 'reviews_and_reputation'],
  'retail & food': ['inventory_and_ordering', 'scheduling', 'social_content', 'reviews_and_reputation'],
  'lodging & hospitality': ['scheduling', 'reviews_and_reputation', 'client_communication', 'local_search_presence'],
  agriculture: ['field_capture', 'compliance_records', 'data_entry', 'outbound_prospecting'],
  staffing: ['outbound_prospecting', 'lead_follow_up', 'document_collection', 'client_communication'],
  'nonprofit & community': ['email_and_newsletter', 'reporting', 'client_communication', 'social_content'],
  'education & childcare': ['intake_and_onboarding', 'client_communication', 'scheduling', 'compliance_records'],
  'funeral & memorial': ['intake_and_onboarding', 'drafting_and_documents', 'client_communication', 'compliance_records'],
  other: ['client_communication', 'lead_follow_up', 'invoicing_and_collections', 'social_content'],
};

// ---------------------------------------------------------------------------
// The platforms themselves.
//
// One or two per type, not a directory. The free fifteen-minute call ends with
// ONE tool named, so what matters is having a defensible first answer for
// every common problem, not a catalogue nobody reads.
//
// `runsOn` matters more than it looks. Reading 1,322 Central Oregon business
// websites on 2026-08-27 found 411 on WordPress, 108 on Squarespace, 33 on
// Shopify, 20 on Wix and 13 on Weebly — so a tool with a WordPress plugin
// installs in minutes for over half the market and a tool without one is an
// argument. Only 43 of 749 businesses run any CRM at all.
//
// `costFrom` is dollars a month at the entry tier, checked on CHECKED above.
// Prices go stale; a stale price in front of a client reads as carelessness.
//
// `saves` is hours a week, and `source` is where that figure comes from.
// source: null means nobody has verified it and it MAY NOT be quoted to a
// client. The guarantee is five hours a week or nothing to pay, so a number in
// a report has to be answerable.
const PLATFORMS = {
  // --- getting in touch, booking, scheduling -----------------------------
  Calendly: { types: ['scheduling'], costFrom: 10, runsOn: ['WordPress', 'Squarespace', 'Wix', 'anything'], note: 'the default for one person booking meetings; 16 businesses on this list already use it', saves: null, source: null },
  Acuity: { types: ['scheduling'], costFrom: 20, runsOn: ['WordPress', 'Squarespace', 'anything'], note: 'built into Squarespace, so free-standing setup for the 108 on it', saves: null, source: null },
  'Square Appointments': { types: ['scheduling', 'invoicing_and_collections'], costFrom: 0, runsOn: ['anything'], note: 'free for one person, and takes the payment too', saves: null, source: null },
  Jobber: { types: ['scheduling', 'dispatch_and_routing', 'quoting_and_proposals', 'invoicing_and_collections'], costFrom: 29, runsOn: ['standalone'], note: 'quote to schedule to invoice for a trade; 8 on this list use it', saves: null, source: null },
  'Housecall Pro': { types: ['scheduling', 'dispatch_and_routing', 'invoicing_and_collections'], costFrom: 59, runsOn: ['standalone'], note: 'the same job for a field crew; documents 8+ hours a week saved', saves: 8, source: 'Housecall Pro published figure, recorded in industryTiers.js' },
  ServiceTitan: { types: ['dispatch_and_routing', 'scheduling', 'invoicing_and_collections'], costFrom: 400, runsOn: ['standalone'], note: 'the heavy option, worth it above about fifteen field staff', saves: null, source: null },

  // --- forms and getting a question answered ------------------------------
  'Gravity Forms': { types: ['document_collection', 'intake_and_onboarding', 'website_and_capture'], costFrom: 5, runsOn: ['WordPress'], note: '94 businesses on this list already have it and most use one form', saves: null, source: null },
  JotForm: { types: ['document_collection', 'intake_and_onboarding'], costFrom: 0, runsOn: ['anything'], note: 'free tier covers a small practice; signatures and payments included', saves: null, source: null },
  Typeform: { types: ['document_collection', 'intake_and_onboarding'], costFrom: 25, runsOn: ['anything'], note: 'better completion rates, worth it for a long intake', saves: null, source: null },

  // --- chasing documents and re-keying what arrives -----------------------
  'Dext / Hubdoc': { types: ['document_collection', 'data_entry'], costFrom: 25, runsOn: ['QuickBooks', 'Xero'], note: 'chases clients for paperwork and reads what arrives; 32 here run QuickBooks', saves: null, source: null },
  'Karbon': { types: ['document_collection', 'client_communication'], costFrom: 59, runsOn: ['standalone'], note: 'built for accounting practices chasing clients in season', saves: null, source: null },
  Zapier: { types: ['data_entry'], costFrom: 20, runsOn: ['anything'], note: 'moves data between two systems that will not talk; the general answer to typing something twice', saves: null, source: null },
  Make: { types: ['data_entry'], costFrom: 9, runsOn: ['anything'], note: 'cheaper than Zapier at volume, harder to set up', saves: null, source: null },

  // --- reminders, reviews and staying in front of people ------------------
  Podium: { types: ['reviews_and_reputation', 'client_communication'], costFrom: 249, runsOn: ['anything'], note: 'texting and review requests in one; 6 on this list use it', saves: null, source: null },
  Birdeye: { types: ['reviews_and_reputation'], costFrom: 299, runsOn: ['anything'], note: 'the same job, stronger reporting', saves: null, source: null },
  NiceJob: { types: ['reviews_and_reputation'], costFrom: 75, runsOn: ['WordPress', 'anything'], note: 'the affordable option for a small shop', saves: null, source: null },
  Weave: { types: ['client_communication', 'scheduling', 'reviews_and_reputation'], costFrom: 400, runsOn: ['dental software'], note: 'reminders, recalls and reviews for a dental or medical front desk', saves: null, source: null },
  Mailchimp: { types: ['email_and_newsletter'], costFrom: 13, runsOn: ['WordPress', 'Squarespace', 'anything'], note: 'the default for staying in front of past customers', saves: null, source: null },
  Klaviyo: { types: ['email_and_newsletter'], costFrom: 20, runsOn: ['Shopify', 'WordPress'], note: 'better where there is a shop attached; 11 here run it', saves: null, source: null },

  // --- finding and following up on new business ---------------------------
  GoHighLevel: { types: ['outbound_prospecting', 'lead_follow_up', 'client_communication'], costFrom: 97, runsOn: ['standalone'], note: 'follow-up, texting and pipeline in one; 12 on this list run it', saves: null, source: null },
  HubSpot: { types: ['lead_follow_up', 'outbound_prospecting'], costFrom: 0, runsOn: ['WordPress', 'anything'], note: 'free tier is enough for most; 31 here already have it', saves: null, source: null },
  Pipedrive: { types: ['lead_follow_up'], costFrom: 14, runsOn: ['standalone'], note: 'simplest pipeline for somebody who just needs to not forget', saves: null, source: null },
  Apollo: { types: ['outbound_prospecting'], costFrom: 49, runsOn: ['standalone'], note: 'finding businesses to contact and writing the first message', saves: null, source: null },

  // --- the phone, and what gets said on it --------------------------------
  'Goodcall / Rosie': { types: ['phone_answering'], costFrom: 59, runsOn: ['any phone number'], note: 'answers the phone when nobody is there and books the job', saves: null, source: null },
  'Ruby Receptionists': { types: ['phone_answering'], costFrom: 235, runsOn: ['any phone number'], note: 'real people rather than software, for a business that will not accept a robot', saves: null, source: null },
  Fathom: { types: ['call_notes_and_follow_up'], costFrom: 0, runsOn: ['Zoom', 'Google Meet', 'Teams'], note: 'free, writes up every call and what was agreed', saves: null, source: null },
  Otter: { types: ['call_notes_and_follow_up'], costFrom: 17, runsOn: ['anything'], note: 'the same for in-person meetings', saves: null, source: null },

  // --- content, video and voice -------------------------------------------
  'ElevenLabs': { types: ['voice_and_audio'], costFrom: 5, runsOn: ['anything'], note: 'voiceover, hold messages and adverts without a studio', saves: null, source: null },
  HeyGen: { types: ['video_content'], costFrom: 29, runsOn: ['anything'], note: 'video without filming anything; the surprise on most calls', saves: null, source: null },
  Descript: { types: ['video_content'], costFrom: 12, runsOn: ['anything'], note: 'edits video by editing the words', saves: null, source: null },
  'Canva': { types: ['social_content', 'photo_and_visual'], costFrom: 15, runsOn: ['anything'], note: 'the one most small businesses already half-know', saves: null, source: null },
  Buffer: { types: ['social_content'], costFrom: 6, runsOn: ['anything'], note: 'posts on a schedule so it happens whether or not anybody remembers', saves: null, source: null },
  'Metricool': { types: ['social_content'], costFrom: 22, runsOn: ['anything'], note: 'scheduling plus what actually got seen', saves: null, source: null },

  // --- being found locally -------------------------------------------------
  'Google Business Profile': { types: ['local_search_presence', 'reviews_and_reputation'], costFrom: 0, runsOn: ['anything'], note: 'free, and the single biggest local lever most businesses have half-finished', saves: null, source: null },
  BrightLocal: { types: ['local_search_presence'], costFrom: 39, runsOn: ['anything'], note: 'fixes the listings that are wrong across the web', saves: null, source: null },

  // --- writing, documents and finding answers ------------------------------
  'Claude / ChatGPT': { types: ['drafting_and_documents', 'proposal_content', 'social_content', 'knowledge_lookup'], costFrom: 20, runsOn: ['anything'], note: 'the general answer where the work is words; where most businesses should start', saves: null, source: null },
  'PandaDoc': { types: ['quoting_and_proposals', 'approvals_and_signatures'], costFrom: 35, runsOn: ['anything'], note: 'proposal out, signed, and back without chasing', saves: null, source: null },
  DocuSign: { types: ['approvals_and_signatures'], costFrom: 10, runsOn: ['anything'], note: 'signatures only, and everybody already trusts it', saves: null, source: null },

  // --- money ---------------------------------------------------------------
  Stripe: { types: ['invoicing_and_collections'], costFrom: 0, runsOn: ['WordPress', 'anything'], note: 'a payment link takes ten minutes and no rebuild', saves: null, source: null },
  'QuickBooks Online': { types: ['invoicing_and_collections', 'reporting'], costFrom: 30, runsOn: ['standalone'], note: '32 on this list already run it, and most use a fraction of it', saves: null, source: null },
  'Chaser / Invoiced': { types: ['invoicing_and_collections'], costFrom: 40, runsOn: ['QuickBooks', 'Xero'], note: 'chases unpaid invoices so nobody has to make the awkward call', saves: null, source: null },

  // --- what happens on site, and what has to be recorded ------------------
  'CompanyCam': { types: ['field_capture', 'photo_and_visual'], costFrom: 19, runsOn: ['standalone'], note: 'crew photographs the job on a phone and it files itself against the right address', saves: null, source: null },
  'Raken': { types: ['field_capture', 'compliance_records'], costFrom: 15, runsOn: ['standalone'], note: 'daily reports and safety records from the field, not typed up at night', saves: null, source: null },
  'GoCanvas': { types: ['field_capture', 'compliance_records'], costFrom: 45, runsOn: ['standalone'], note: 'turns any paper form a crew carries into one on a phone', saves: null, source: null },
  'Fulcrum': { types: ['field_capture', 'compliance_records'], costFrom: 25, runsOn: ['standalone'], note: 'the same for inspections and compliance rounds', saves: null, source: null },

  // --- knowing what to reorder --------------------------------------------
  'Sortly': { types: ['inventory_and_ordering'], costFrom: 29, runsOn: ['standalone'], note: 'stock counts on a phone for a shop that runs on somebody walking the shelves', saves: null, source: null },
  'Craftybase': { types: ['inventory_and_ordering'], costFrom: 39, runsOn: ['Shopify', 'standalone'], note: 'for a maker who has to track materials as well as finished stock', saves: null, source: null },
  'inFlow': { types: ['inventory_and_ordering'], costFrom: 89, runsOn: ['standalone'], note: 'stock, orders and a catalogue in one, for a distributor', saves: null, source: null },

  // --- claims, records requests and the paperwork somebody else demands ----
  'Waystar': { types: ['claims_and_billing_codes'], costFrom: 100, runsOn: ['practice software'], note: 'checks a claim for the missing field before it goes rather than after it comes back', saves: null, source: null },
  'Tebra': { types: ['claims_and_billing_codes', 'records_requests', 'client_communication'], costFrom: 150, runsOn: ['standalone'], note: 'practice management for a small clinic, claims included', saves: null, source: null },
  'Vyne / Trellis': { types: ['claims_and_billing_codes', 'records_requests'], costFrom: 90, runsOn: ['dental software'], note: 'attachments and records moving between a practice and an insurer', saves: null, source: null },
  'Verifiable': { types: ['compliance_records'], costFrom: 200, runsOn: ['standalone'], note: 'keeps licences and credentials current without somebody diarising them', saves: null, source: null },

  // --- the site itself, and turning a visitor into an enquiry -------------
  'Lovable': { types: ['website_and_capture'], costFrom: 25, runsOn: ['standalone'], note: 'a whole site rebuilt in a day rather than a month', saves: null, source: null },
  'Framer': { types: ['website_and_capture'], costFrom: 15, runsOn: ['standalone'], note: 'a rebuild where the look matters more than the plumbing', saves: null, source: null },
  'Tidio': { types: ['client_communication', 'website_and_capture'], costFrom: 29, runsOn: ['WordPress', 'Shopify', 'anything'], note: 'answers the common questions on the site itself, day or night', saves: null, source: null },
  'Intercom': { types: ['client_communication'], costFrom: 39, runsOn: ['anything'], note: 'heavier, worth it where support volume is real', saves: null, source: null },

  // --- asking for the next job, and the referral --------------------------
  'Referral Factory': { types: ['referral_and_repeat'], costFrom: 95, runsOn: ['anything'], note: 'asks a happy customer for a name without anybody having to remember', saves: null, source: null },
  'Reviews + follow-up in GoHighLevel': { types: ['referral_and_repeat', 'reviews_and_reputation'], costFrom: 97, runsOn: ['standalone'], note: 'where they already run it, this is a setting rather than a purchase', saves: null, source: null },

  // --- getting a new person useful ----------------------------------------
  'Trainual': { types: ['training_and_handover', 'knowledge_lookup'], costFrom: 250, runsOn: ['standalone'], note: 'how the business runs, written once, so a new hire is not shadowing somebody for a month', saves: null, source: null },
  'Notion': { types: ['training_and_handover', 'knowledge_lookup'], costFrom: 10, runsOn: ['anything'], note: 'the cheap version of the same thing, and most people can drive it', saves: null, source: null },
  'Guru': { types: ['knowledge_lookup'], costFrom: 15, runsOn: ['anything'], note: 'answers questions out of a business own files', saves: null, source: null },

  // --- serving customers who do not read English --------------------------
  'Weglot': { types: ['translation_and_accessibility'], costFrom: 17, runsOn: ['WordPress', 'Squarespace', 'Shopify'], note: 'the whole site in Spanish in an afternoon; installs on over half this market', saves: null, source: null },
  'DeepL': { types: ['translation_and_accessibility'], costFrom: 9, runsOn: ['anything'], note: 'documents and letters, not the site', saves: null, source: null },
};

// What Russ BUILDS, per type of work.
//
// The list above is what a business can buy. It is half the answer and the
// cheap half. Russ builds automations and AI software, so for most of these
// the off-the-shelf tool gets a business most of the way and the last part is
// something built for how they actually work — and that is the paid work, not
// a $20 subscription (Russ, 2026-08-27: "website integration is only a small
// part of this, I'm primarily building automations and AI software").
//
// `instead` is when a build beats buying outright. `alongside` is the more
// common case: they buy the tool AND the build makes it fit.
const BUILDS = {
  document_collection: { alongside: 'chasing that knows who has already sent what, in their words, and stops when it arrives' },
  data_entry: { instead: 'a direct link between the two systems that will not talk, so nothing is typed twice and nothing waits on a person clicking' },
  client_communication: { alongside: 'answers drawn from their own files rather than a script, so the reply is right rather than generic' },
  scheduling: { alongside: 'the rules a real business schedules by — who can do what, travel time, which customer must not be moved' },
  quoting_and_proposals: { instead: 'a quote built from their own pricing and past jobs, written in their voice, out the same day' },
  field_capture: { alongside: 'what the crew records turning into the invoice and the compliance record without anybody re-entering it' },
  approvals_and_signatures: { alongside: 'chasing that escalates on its own and tells somebody when a job is blocked' },
  invoicing_and_collections: { instead: 'invoices raised from what actually happened on the job, and chased on a schedule nobody has to run' },
  lead_follow_up: { instead: 'every enquiry answered within minutes, at any hour, with something specific to what they asked' },
  reporting: { instead: 'the report assembled from the systems it comes from, on the day it is due, without anybody building it' },
  intake_and_onboarding: { instead: 'the whole path from yes to work starting, running itself and telling somebody only when it is stuck' },
  inventory_and_ordering: { alongside: 'reorder points worked out from what actually sold, not from somebody walking the shelves' },
  claims_and_billing_codes: { alongside: 'a claim checked against what actually gets rejected at their payers before it leaves' },
  records_requests: { instead: 'a request read, the records found, and the response drafted, with a person only approving it' },
  dispatch_and_routing: { alongside: 'the schedule in one person head written down and rebuilt when the day changes' },
  compliance_records: { alongside: 'the record built as the work happens rather than assembled the week an auditor asks' },
  outbound_prospecting: { instead: 'a list built from public sources and a first message written from what is true about each business' },
  social_content: { instead: 'posts written from their own work and their own voice, on a schedule, needing approval not writing' },
  reviews_and_reputation: { alongside: 'the ask going out at the right moment in a job rather than on a timer' },
  local_search_presence: { alongside: 'listings watched and corrected as they drift' },
  email_and_newsletter: { instead: 'what to send worked out from what each customer bought and when, rather than one letter to everybody' },
  website_and_capture: { instead: 'a site rebuilt in a day that takes the enquiry, books the job and tells them straight away' },
  referral_and_repeat: { alongside: 'the ask timed off the job finishing, and the follow-up if nothing comes back' },
  proposal_content: { instead: 'proposal wording drawn from their own past work rather than a template' },
  drafting_and_documents: { instead: 'the documents the work runs on, drafted from their own precedents in their own language' },
  knowledge_lookup: { instead: 'their own files answering questions in plain language, so nobody hunts through folders' },
  training_and_handover: { instead: 'how the business actually runs, captured from watching it, so a new person is useful in days' },
  phone_answering: { alongside: 'an answering assistant that knows their prices, their diary and their rules, not a generic script' },
  call_notes_and_follow_up: { alongside: 'the notes turning into the next action in their system, not a summary somebody reads later' },
  video_content: { instead: 'video made from their own jobs and their own words, produced on a schedule' },
  voice_and_audio: { alongside: 'their own voice, so a customer hears the business rather than a stock read' },
  translation_and_accessibility: { alongside: 'Spanish across the whole business, not just the website' },
  photo_and_visual: { alongside: 'crew photographs sorted, tagged to the job and ready to show without anybody filing them' },
};

function buildFor(type) { return BUILDS[type] || null; }

// Every platform that could answer a given type of work.
function platformsFor(type) {
  return Object.entries(PLATFORMS)
    .filter(([, p]) => p.types.includes(type))
    .map(([name, p]) => ({ name, ...p }));
}

// What to say on a free call about one business: their trade's biggest problems,
// strongest first, each with the tools that answer it.
function shortlistFor(trade, alreadyUsing = []) {
  const have = new Set(alreadyUsing.map((t) => String(t).toLowerCase()));
  return (BY_TRADE[String(trade || 'other').toLowerCase()] || BY_TRADE.other).map((type) => ({
    type,
    ...TYPES[type],
    // A tool already on their bill is the cheapest recommendation there is,
    // so it is listed first and marked.
    tools: platformsFor(type)
      .map((p) => ({ ...p, alreadyPayingFor: have.has(p.name.toLowerCase()) }))
      .sort((a, b) => (b.alreadyPayingFor - a.alreadyPayingFor) || (a.costFrom - b.costFrom)),
    // What Russ would build for this, which is the paid work.
    build: buildFor(type),
  }));
}

module.exports = { CHECKED, DEPARTMENTS, TYPES, BY_TRADE, PLATFORMS, BUILDS, platformsFor, buildFor, shortlistFor };
