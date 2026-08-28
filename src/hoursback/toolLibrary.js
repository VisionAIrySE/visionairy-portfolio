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

module.exports = { CHECKED, DEPARTMENTS, TYPES, BY_TRADE };
