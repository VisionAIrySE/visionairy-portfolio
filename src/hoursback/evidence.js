// What has actually been published about where the hours go, by trade.
//
// Gathered 2026-08-28 by searching, reading and recording the source. Written
// after Russ found that the industry weightings driving the score were mine,
// not research: "you gave me very specific industry specific breakdowns... and
// you made all that shit up that we've been basing everything on?"
//
// EVERY entry carries where it came from and how far it can be trusted:
//
//   PRIMARY      the trade body's own page or report. Quotable to a client.
//   SECOND_HAND  a real institution's figure, but seen only quoted elsewhere.
//                Say the institution's name, never the number, until read.
//   VENDOR       published by a company selling the fix. Useful for shape,
//                never quotable as proof.
//   NONE         searched and nothing published exists. Say so out loud.
//
// A trade with NONE is not a weaker prospect. It means the hours have to be
// counted on the call instead of quoted, which is the honest way anyway.

const GATHERED = '2026-08-28';

const PRIMARY = 'PRIMARY';
const SECOND_HAND = 'SECOND_HAND';
const VENDOR = 'VENDOR';
const NONE = 'NONE';

const EVIDENCE = {
  medical: {
    trust: PRIMARY,
    who: 'American Medical Association',
    what: 'Survey of 1,000 physicians, late 2024. Practices complete 39 prior authorisation requests per physician per week, and physicians and their staff spend 13 hours a week completing them. 40% of practices have staff working on prior authorisation and nothing else.',
    hoursAWeek: 13,
    measures: 'prior authorisation only',
    url: 'https://www.ama-assn.org/practice-management/prior-authorization/survey-quantifies-time-burdens-prior-authorization',
    sayItLikeThis: "The doctors' association timed prior authorisations at thirteen hours a week per physician, and four practices in ten have somebody doing nothing else.",
    sayItShorter: 'The doctors\' association timed prior authorisations at thirteen hours a week per physician.',
  },

  insurance: {
    trust: PRIMARY,
    who: 'Independent Insurance Agents & Brokers of America',
    what: 'A single certificate of insurance takes 45 to 90 minutes to produce by hand. At a mid-size agency, certificates alone run 8 to 15 hours a week of a service rep\'s time.',
    hoursAWeek: 8,
    measures: 'certificates of insurance only',
    url: null,
    sayItLikeThis: "The agents' association puts a single certificate at forty-five to ninety minutes by hand, and eight to fifteen hours a week of somebody's time on certificates alone.",
    sayItShorter: 'The agents\' association puts certificates alone at eight to fifteen hours a week of somebody\'s time.',
  },

  veterinary: {
    trust: PRIMARY,
    who: 'Federation of Veterinarians of Europe, and a 2023 American Veterinary Medical Association survey',
    what: 'Vets spend 25-35% of the working day on documentation and admin — two to three hours a day — plus an average of 6.2 hours a week finishing records after hours at home. Between August 2024 and January 2025 not one vet surveyed reported their admin going down; 64% said it had doubled.',
    hoursAWeek: 6.2,
    measures: 'after-hours record writing; the 2-3 hours a day is inside the working day',
    url: 'https://fve.org/cms/wp-content/uploads/Admin-burden-report-R13-1.pdf',
    sayItLikeThis: 'The vets\' federation found records alone take six hours a week after the clinic has closed, and not one vet surveyed said their paperwork had gone down.',
    sayItShorter: 'The vets\' federation found records alone take six hours a week after the clinic has closed.',
  },

  legal: {
    trust: VENDOR,
    who: 'Clio Legal Trends Report',
    what: 'Attorneys work 48 hours a week and bill 36. Utilisation across firms was 38% in 2025, and 48% of non-billable hours go on administration — roughly three hours a day on billing, collections and office work.',
    hoursAWeek: 15,
    measures: 'all non-billable admin, not one task',
    url: 'https://www.clio.com/resources/legal-trends/',
    sayItLikeThis: null,  // Clio sells the software. Use the shape, not the number.
  },

  accounting: {
    trust: SECOND_HAND,
    who: 'CPA Practice Advisor survey, and a 2024 survey of accounting professionals',
    what: 'Firms report 9.3 hours a week on client communication. 65% named "getting information and documents from clients" as their single biggest workflow problem. Separately reported: 6-10 hours a week chasing documents in tax season.',
    hoursAWeek: 9.3,
    measures: 'all client communication, of which chasing is the largest part',
    url: null,
    sayItLikeThis: null,  // read the original before quoting the number
  },

  dental: {
    trust: SECOND_HAND,
    who: 'American Dental Association, 2024 Dental Practice Economic Survey',
    what: 'Front-desk administrative time is 28-34% of total practice staff cost, and insurance verification is the single largest component of it. Claim denials from eligibility and coverage errors run 12-16%.',
    hoursAWeek: null,
    measures: 'share of staff cost, not hours',
    url: 'https://www.ada.org/resources/research/health-policy-institute/dental-practice-research',
    sayItLikeThis: null,
  },

  construction: {
    trust: SECOND_HAND,
    who: 'Construction Management Association of America',
    what: 'Administrative tasks take up to 30% of a typical contractor\'s week. Separately reported: superintendents lose 5.4 hours a week looking for documents, project managers 6.2 hours compiling and tracking them.',
    hoursAWeek: null,
    measures: 'share of the week',
    url: null,
    sayItLikeThis: null,
  },

  auto: {
    trust: SECOND_HAND,
    who: 'Marchex call analytics, and a PartsTech 2025 survey of 752 shops',
    what: 'Up to 21% of calls to automotive service go unanswered, and 85% of people who reach voicemail never call back. Average hours per repair order run 2.50-3.25.',
    hoursAWeek: null,
    measures: 'missed calls, not admin hours',
    url: null,
    sayItLikeThis: null,
  },

  trades: {
    trust: VENDOR,
    who: 'Housecall Pro and other field-service software makers',
    what: 'Claim 8+ hours a week saved on scheduling, estimates and invoicing, and that a tech at a 10-person shop spends about an hour a day on paperwork. No trade association has published a figure.',
    hoursAWeek: 5,
    measures: 'vendor claim',
    url: null,
    sayItLikeThis: null,
  },

  'real estate': {
    trust: NONE,
    who: 'National Association of Realtors',
    what: 'Searched their 2025 Member Profile and 2025 Technology Survey. They publish median hours worked (35 a week) and technology spend, but NOT how many hours go on paperwork. 66% say they adopt technology mainly to save time — which is a motive, not a measurement.',
    hoursAWeek: null,
    measures: null,
    url: 'https://www.nar.realtor/research-and-statistics/research-reports/realtor-technology-survey',
    sayItLikeThis: null,
  },
};

// ---------------------------------------------------------------------------
// THE SAME QUESTION, ASKED THE RIGHT WAY ROUND (2026-08-28).
//
// Searching trade by trade found three usable figures out of twenty-four, and
// Russ would not accept that: "Marketing, inventory mgt, sales f/u, all of
// these fucking tools and there are no credible measurements?"
//
// He was right, and the fault was the axis. The tools are not industry
// products — they are FUNCTIONS. Following up an enquiry is the same act in a
// roofing company and a dental practice, and that is what has actually been
// studied, for decades, at a level of rigour no trade association reaches.
//
// So the evidence hangs on the kind of work. A dentist and a landscaper both
// inherit the reminder trial and the lead-response study, because both of them
// send reminders and both of them answer enquiries.
const BY_WORK = {
  lead_follow_up: {
    trust: PRIMARY,
    who: 'Harvard Business Review — Oldroyd, McElheran and Elkington, "The Short Life of Online Sales Leads", March 2011',
    what: 'An audit of 2,241 US companies found the average response to an online enquiry took 42 hours, and 23% never replied at all. Across 1.25 million leads at 42 companies, firms that made contact inside an hour were nearly seven times more likely to qualify that lead than firms that waited one more hour, and more than sixty times more likely than firms that waited a day.',
    url: 'https://hbr.org/2011/03/the-short-life-of-online-sales-leads',
    sayItLikeThis: 'Harvard Business Review audited 2,241 companies and found the average reply to an online enquiry took forty-two hours — and that answering inside the first hour makes you seven times more likely to qualify that lead.',
    sayItShorter: 'Harvard Business Review found the average reply to an online enquiry takes forty-two hours.',
  },

  client_communication: {
    trust: PRIMARY,
    who: 'Cochrane Review — Gurol-Urganci et al., "Mobile phone messaging reminders for attendance at healthcare appointments", 2013',
    what: 'A pooled analysis of eight randomised controlled trials found text reminders lifted attendance from 67.8% with no reminder to 78.6%, and cut non-attendance by roughly a quarter — matching phone calls at a fraction of the cost. Cochrane reviews are the highest tier of evidence there is.',
    url: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007458.pub3/references',
    sayItLikeThis: 'Eight randomised trials, pooled by Cochrane, found text reminders lift attendance from sixty-eight per cent to seventy-nine — the same effect as ringing people, at a fraction of the cost.',
    sayItShorter: 'Eight randomised trials found text reminders lift attendance from sixty-eight per cent to seventy-nine.',
  },

  scheduling: {
    trust: PRIMARY,
    who: 'Cochrane Review — Gurol-Urganci et al., 2013',
    what: 'The same pooled analysis of eight randomised trials: attendance rose from 67.8% to 78.6% where reminders were sent automatically.',
    url: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007458.pub3/references',
    sayItLikeThis: 'Eight randomised trials found automatic reminders lift attendance from sixty-eight per cent to seventy-nine.',
    sayItShorter: 'Eight randomised trials found automatic reminders lift attendance by eleven points.',
  },

  reviews_and_reputation: {
    trust: PRIMARY,
    who: 'Harvard Business School — Michael Luca, "Reviews, Reputation, and Revenue: The Case of Yelp.com"',
    what: 'Matching Yelp ratings against Washington State Department of Revenue takings for Seattle restaurants, 2003-2009, one extra star was worth five to nine per cent more revenue. Luca controlled for actual quality by exploiting how Yelp rounds its scores. The effect was LARGER for independent businesses than for chains.',
    url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1928601',
    sayItLikeThis: 'A Harvard Business School study matched review scores against state revenue records and found one extra star is worth five to nine per cent more revenue — and it counts for more at an independent business than at a chain.',
    sayItShorter: 'A Harvard Business School study found one extra review star is worth five to nine per cent more revenue.',
  },

  email_and_newsletter: {
    trust: VENDOR,
    who: 'Litmus, 2025 State of Email, around 500 marketers',
    what: 'Marketers report returns between 10:1 and 36:1 on email programmes; 35% claim 36:1 or better. Self-reported by the people running the campaigns, and one in five could not measure it at all.',
    url: 'https://www.litmus.com/state-of-email-reports',
    sayItLikeThis: null,
  },

  quoting_and_proposals: {
    trust: SECOND_HAND,
    who: '6sense, and B2B response-time benchmarks',
    what: 'Reported that 84% of business deals go to the first vendor the buyer contacts, and that buyers form a preference within about four hours of asking. Seen quoted rather than read.',
    url: null,
    sayItLikeThis: null,
  },

  phone_answering: {
    trust: SECOND_HAND,
    who: 'Marchex call analytics',
    what: 'Up to 21% of calls to automotive service go unanswered, and 85% of callers who reach voicemail never ring back.',
    url: null,
    sayItLikeThis: null,
  },

  inventory_and_ordering: {
    trust: SECOND_HAND,
    who: 'A review of automated inventory systems in small and medium businesses',
    what: 'Reports inventory accuracy up 25-35%, carrying costs down 20-30%, stockouts down 35-45%, and manual processing time down 60% after implementation. An academic review, but seen quoted rather than read end to end.',
    url: null,
    sayItLikeThis: null,
  },

  invoicing_and_collections: {
    trust: VENDOR,
    who: 'ADP 2025 Construction Payroll Benchmark Report',
    what: 'Payroll processing that takes 12-18 hours a week by hand drops to 2-3 hours once the time-to-payroll chain is automated. Paper timesheets measured 62% accurate. ADP sells payroll software, so the shape is useful and the number is not proof.',
    url: null,
    sayItLikeThis: null,
  },
};

// The strongest thing that may be said about a piece of work, whoever does it.
function evidenceForWork(type) {
  return BY_WORK[String(type || '')] || null;
}

function quotableForWork(type) {
  const e = evidenceForWork(type);
  return e && e.sayItLikeThis
    ? { line: e.sayItLikeThis, short: e.sayItShorter || e.sayItLikeThis, who: e.who, url: e.url }
    : null;
}

// Trades searched with nothing published found. Named on purpose — an empty
// entry has to be visible, or the next person assumes nobody looked.
const SEARCHED_NOTHING_FOUND = [
  'landscaping', 'storage & logistics', 'manufacturing', 'retail & food',
  'agriculture', 'cleaning & facilities', 'personal care', 'staffing',
  'professional services', 'nonprofit & community', 'education & childcare',
  'fitness & recreation', 'lodging & hospitality', 'funeral & memorial',
];

function evidenceFor(trade) {
  return EVIDENCE[String(trade || '').toLowerCase()] || null;
}

// Only what may be repeated to a client, word for word.
// SAME FINDING, FEWER WORDS, FOR A CHANNEL WITH NO ROOM.
//
// A LinkedIn note is read to about 700 characters and abandoned after that.
// 450 of the 464 notes running past 700 were doing it because of this one
// paragraph — the Harvard line alone is 216 characters (measured 2026-08-30).
// So each finding carries a second wording that says the same thing shorter.
// It is a shorter QUOTE OF THE SAME SOURCE, never a different claim, and the
// email keeps the full one.
function quotableFor(trade) {
  const e = evidenceFor(trade);
  return e && e.sayItLikeThis
    ? { line: e.sayItLikeThis, short: e.sayItShorter || e.sayItLikeThis, who: e.who, url: e.url }
    : null;
}

function wasSearched(trade) {
  const t = String(trade || '').toLowerCase();
  return Boolean(EVIDENCE[t]) || SEARCHED_NOTHING_FOUND.includes(t);
}

module.exports = {
  GATHERED, PRIMARY, SECOND_HAND, VENDOR, NONE,
  EVIDENCE, SEARCHED_NOTHING_FOUND, BY_WORK,
  evidenceFor, quotableFor, wasSearched,
  evidenceForWork, quotableForWork,
};
