// Reading a business's website the way a visitor sees it.
//
// The old reader downloaded the raw page and searched the text for phrases
// like "book now". Modern sites build their buttons after the page arrives, so
// the raw file is nearly empty of the thing being looked for. Checked by hand
// against five businesses on 2026-08-27, the old reader was wrong on four:
// a State Farm agent with a full customer portal, a quote builder and an ID
// card download was recorded as having none of it.
//
// Three changes, all of which Russ asked for:
//
//   1. Let the page finish loading before looking at it. What a visitor sees
//      is what counts, not what arrives in the first packet.
//   2. Look for the FORM, not the word. A contact form is a <form> with input
//      boxes in it; a login is a password box. Booking is usually a link to
//      one of a dozen services everybody uses. Structure, never vocabulary.
//   3. Follow the contact and about pages. Half the misses were a form sitting
//      on /contact while only the home page was read.
//
// And the rule that makes it safe to score again. THREE answers, never two:
//
//   FOUND        we saw it
//   ABSENT       we looked properly and it is not there
//   UNKNOWN      we could not tell
//
// The old reader had no UNKNOWN. Everything it failed to see was written down
// as absent, which is how a business with a customer portal was told it had
// none. UNKNOWN scores nothing and is never spoken to a client.

const FOUND = 'FOUND';
const ABSENT = 'ABSENT';
const UNKNOWN = 'UNKNOWN';

const PAGE_TIMEOUT_MS = 20000;
const SETTLE_MS = 1500;        // let the page finish drawing itself
const MAX_PAGES = 6;

// The services a small business actually books through. A link to one of these
// is proof, whatever the button happens to say.
const BOOKING_HOSTS = [
  'calendly.com', 'acuityscheduling.com', 'squareup.com/appointments', 'setmore.com',
  'simplybook.me', 'bookedin.com', 'schedulicity.com', 'vagaro.com', 'mindbodyonline.com',
  'housecallpro.com', 'servicetitan.com', 'jobber.com', 'getjobber.com', 'workiz.com',
  'appointy.com', 'youcanbook.me', 'hubspot.com/meetings', 'meetings.hubspot.com',
  'book.squareup.com', 'opentable.com', 'resy.com', 'zocdoc.com', 'nexhealth.com',
  'localmed.com', 'demandforce.com', 'weave.com', 'podium.com', 'tebra.com',
  'cal.com', 'savvycal.com', 'tidycal.com', 'doodle.com', 'picktime.com',
];

// Where a form or a login usually hides if it is not on the home page.
const WORTH_FOLLOWING = /(contact|about|book|schedul|appoint|quote|estimate|request|get-?started|portal|login|sign-?in|client|patient|customer)/i;

// What a page tells us, read off its structure rather than its words.
function readDom() {
  const norm = (s) => String(s || '').toLowerCase();
  const inputsIn = (f) => Array.from(f.querySelectorAll('input, textarea, select'))
    .filter((el) => !['hidden', 'submit', 'button', 'image'].includes(norm(el.type)));

  const forms = Array.from(document.querySelectorAll('form'));
  // A real enquiry form has somewhere to type. A single box is a search bar or
  // a newsletter signup, not a way to ask a business for something.
  const enquiryForms = forms.filter((f) => {
    const fields = inputsIn(f);
    if (fields.length < 2) return false;
    const blob = norm(f.className + ' ' + f.id + ' ' + f.getAttribute('name') + ' '
      + fields.map((el) => el.name + ' ' + el.id + ' ' + el.placeholder + ' ' + (el.type || '')).join(' '));
    if (/\b(search|newsletter|subscribe|signup-email)\b/.test(blob) && fields.length < 3) return false;
    return /message|comment|enquir|inquir|question|detail|describe|how can we|name/.test(blob)
      || fields.some((el) => el.tagName === 'TEXTAREA');
  });

  const passwordBoxes = document.querySelectorAll('input[type="password"]').length;

  const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
    href: a.href, text: norm(a.textContent).trim().slice(0, 80),
  }));

  // Anything the page loads from somewhere else — a booking widget usually
  // arrives as a frame or a script from the service that runs it.
  const external = Array.from(document.querySelectorAll('iframe[src], script[src]'))
    .map((el) => el.src).filter(Boolean);

  // Everything else a site can do, read the same way: what is actually on the
  // page, not what the page says about itself.
  const text = norm(document.body ? document.body.innerText : '');
  const priceMentions = (text.match(/\$\s?\d[\d,]*(\.\d{2})?/g) || []).length;
  const images = document.querySelectorAll('img').length;
  const galleryish = document.querySelectorAll(
    '[class*="gallery" i],[class*="portfolio" i],[class*="project" i],[id*="gallery" i],[class*="before-after" i]').length;
  const chatWidget = Boolean(document.querySelector(
    '[class*="chat" i],[id*="chat" i],[class*="intercom" i],[id*="tawk" i],[class*="drift" i],[class*="messenger" i]'));
  const viewport = document.querySelector('meta[name="viewport"]');
  const emailOnlyInputs = Array.from(document.querySelectorAll('input[type="email"]')).length;

  return {
    formCount: forms.length,
    enquiryForms: enquiryForms.length,
    passwordBoxes,
    links,
    external,
    priceMentions,
    images,
    galleryish,
    chatWidget,
    emailOnlyInputs,
    mobileMeta: Boolean(viewport && /width\s*=\s*device-width/i.test(viewport.content || '')),
    text: text.slice(0, 20000),
    title: document.title || '',
  };
}

// The software a business is already paying for, read off its own pages. Half
// the time the tool somebody needs is a feature of something already on their
// bill that nobody switched on, and that is the cheapest recommendation there
// is. This used to be thrown away on every reading (2026-08-27).
const TOOL_FINGERPRINTS = {
  // booking and scheduling
  Calendly: /calendly\.com/i, Acuity: /acuityscheduling\.com/i, 'Square Appointments': /squareup\.com\/appointments|book\.squareup\.com/i,
  Setmore: /setmore\.com/i, Vagaro: /vagaro\.com/i, Mindbody: /mindbodyonline\.com/i, Schedulicity: /schedulicity\.com/i,
  'Cal.com': /\bcal\.com/i, 'HubSpot Meetings': /meetings\.hubspot\.com/i,
  // field service
  'Housecall Pro': /housecallpro\.com/i, ServiceTitan: /servicetitan\.com/i, Jobber: /getjobber\.com|jobber\.com/i,
  Workiz: /workiz\.com/i, 'Service Fusion': /servicefusion\.com/i,
  // healthcare
  NexHealth: /nexhealth\.com/i, Zocdoc: /zocdoc\.com/i, Weave: /getweave\.com|weave\.com/i,
  Tebra: /tebra\.com|kareo\.com/i, 'Dentrix / Henry Schein': /dentrix\.com|henryscheinone\.com/i,
  Solutionreach: /solutionreach\.com/i, LocalMed: /localmed\.com/i,
  // marketing and reviews
  Podium: /podium\.com/i, Birdeye: /birdeye\.com/i, 'Google Reviews widget': /elfsight|reviewsonmywebsite|trustindex/i,
  Mailchimp: /mailchimp\.com|list-manage\.com/i, 'Constant Contact': /constantcontact\.com/i,
  Klaviyo: /klaviyo\.com/i, ActiveCampaign: /activecampaign\.com/i,
  // crm and sales
  HubSpot: /hubspot\.com|hs-scripts\.com/i, Salesforce: /salesforce\.com|force\.com/i,
  GoHighLevel: /gohighlevel\.com|leadconnectorhq\.com/i, Pipedrive: /pipedrive\.com/i, Zoho: /zoho\.com/i,
  // payments
  Stripe: /js\.stripe\.com|stripe\.com/i, 'Square payments': /squareup\.com\/(?!appointments)/i,
  PayPal: /paypal\.com/i, QuickBooks: /quickbooks|intuit\.com/i,
  // chat and support
  Intercom: /intercom\.io|intercom\.com/i, Tawk: /tawk\.to/i, Drift: /drift\.com/i, Zendesk: /zendesk\.com/i,
  Tidio: /tidio\.co/i, LiveChat: /livechatinc\.com/i,
  // the site itself
  WordPress: /wp-content|wp-includes/i, Squarespace: /squarespace\.com|sqsp\.net/i, Wix: /wix\.com|wixstatic/i,
  Shopify: /shopify\.com|cdn\.shopify/i, GoDaddy: /godaddy\.com\/websites|websitebuilder/i, Webflow: /webflow\.com/i,
  Duda: /duda\.co|dudamobile/i, Weebly: /weebly\.com/i,
  // forms
  'JotForm': /jotform\.com/i, 'Google Forms': /docs\.google\.com\/forms/i, Typeform: /typeform\.com/i,
  Gravity: /gravityforms/i, 'Contact Form 7': /contact-form-7/i,
};

// Runs over EVERY page handed to it — the pages a skip rule kept from the
// model included. A booking widget on a page nobody read is still a tool the
// business pays for, and skipping a page from READING never skips it from
// this (2026-09-01).
function toolsFromPages(pages) {
  const hay = pages.flatMap((p) => (p.external || []).concat((p.links || []).map((l) => l.href))).join(' ');
  const html = pages.map((p) => [p.text || '', p.html || ''].filter(Boolean).join(' ')).join(' ');
  const found = [];
  for (const [name, re] of Object.entries(TOOL_FINGERPRINTS)) {
    if (re.test(hay) || re.test(html)) found.push(name);
  }
  return found;
}

// Every system the visit detected, each as a TOOL_FINGERPRINTS name (or the
// model's own name for one the fingerprints do not know) PAIRED with the
// detection method that found it. When the fingerprint and the model name the
// SAME system, one entry says so; when they name DIFFERENT systems, both
// entries are kept — the disagreement is information, not noise.
function detectedTools(pages = [], modelNamed = []) {
  const out = [];
  const byName = new Map();
  for (const name of toolsFromPages(pages)) {
    const entry = { name, method: 'fingerprint' };
    out.push(entry);
    byName.set(name.toLowerCase(), entry);
  }
  for (const raw of Array.isArray(modelNamed) ? modelNamed : []) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const had = byName.get(name.toLowerCase());
    if (had) { had.method = 'fingerprint and model'; continue; }
    out.push({ name, method: 'model' });
  }
  return out;
}

// Everything gathered from every page, turned into three answers.
function verdictFrom(pages) {
  // Nothing opened means nothing is known about anything. Listing the three
  // original capabilities here and forgetting the eleven added later would
  // leave them undefined, and undefined is not the same as "we could not tell".
  const EVERY_CAPABILITY = ['enquiry', 'booking', 'login', 'quote_request', 'online_payment',
    'pricing_shown', 'work_shown', 'reviews_shown', 'live_chat', 'mobile_ready',
    'newsletter_capture', 'careers', 'intake_forms', 'catalogue'];
  if (!pages.length) {
    const blank = { pagesRead: 0, toolsInUse: [], lookedProperly: false };
    for (const c of EVERY_CAPABILITY) blank[c] = { state: UNKNOWN, why: 'none of their pages could be opened' };
    return blank;
  }
  const all = pages.flatMap((p) => p.links || []).concat();
  const externals = pages.flatMap((p) => p.external || []);
  const hay = all.map((l) => l.href).concat(externals).join(' ').toLowerCase();

  const bookingHit = BOOKING_HOSTS.find((h) => hay.includes(h));
  const enquiryPages = pages.filter((p) => p.enquiryForms > 0);
  const passwordPages = pages.filter((p) => p.passwordBoxes > 0);
  // A link to a portal that lives on somebody else's domain is a login too.
  const portalLink = all.find((l) => /\b(log ?in|sign ?in|client portal|customer portal|patient portal|my account)\b/.test(l.text));

  // Whether we looked in the right places at all. Saying "they have no contact
  // form" after reading only a home page is not an observation.
  const followedContact = pages.some((p) => /contact|quote|estimate|request|book|schedul|appoint/i.test(p.url));
  const lookedProperly = pages.length >= 2 && followedContact;

  const answer = (found, why, absentWhy) => {
    if (found) return { state: FOUND, why };
    if (!lookedProperly) return { state: UNKNOWN, why: `only ${pages.length} page(s) opened and no contact page among them` };
    return { state: ABSENT, why: absentWhy };
  };

  // The rest of what a site can do, judged the same way. Each is a plain
  // observation, and anything only a person could settle is left UNKNOWN
  // rather than guessed.
  const allText = pages.map((p) => p.text || '').join(' ');
  const priceMentions = pages.reduce((a, p) => a + (p.priceMentions || 0), 0);
  const gallery = pages.reduce((a, p) => a + (p.galleryish || 0), 0);
  const images = pages.reduce((a, p) => a + (p.images || 0), 0);
  const chat = pages.some((p) => p.chatWidget);
  const mobile = pages.some((p) => p.mobileMeta);
  const emailBoxes = pages.reduce((a, p) => a + (p.emailOnlyInputs || 0), 0);
  const tools = toolsFromPages(pages);
  const has = (re) => re.test(hay) || re.test(allText);

  const quoteWords = /\b(request a quote|get a quote|free estimate|request an estimate|get an estimate|request pricing)\b/i;
  const careersWords = /\b(careers|join our team|apply now|we're hiring|now hiring|employment opportunities)\b/i;
  const intakeWords = /\b(new patient form|patient forms|intake form|new client form|registration form|paperwork)\b/i;
  const paymentTools = /stripe|paypal|squareup|\bpay (?:my|your) bill\b|make a payment/i;
  const reviewTools = /birdeye|podium|elfsight|trustindex|reviewsonmywebsite|\b\d(\.\d)? ?stars?\b|google reviews/i;

  return {
    enquiry: answer(enquiryPages.length,
      `a form to fill in on ${enquiryPages.length ? enquiryPages[0].url : 'their site'}`,
      'no form to fill in on their home page, their contact page, or anywhere linked from them'),
    booking: answer(bookingHit,
      `books through ${bookingHit}`,
      'nothing on their site books or schedules anything'),
    // Both reasons are built before the call decides which to use, so neither
    // may assume the thing it describes was found.
    login: answer(passwordPages.length || portalLink,
      passwordPages.length ? `a password box on ${passwordPages[0].url}`
        : (portalLink ? `a link reading "${portalLink.text}"` : 'a way to log in'),
      'no way for a customer to log in'),
    quote_request: answer(enquiryPages.length && has(quoteWords) ? 1 : 0,
      'a way to ask for a price', 'no way to ask for a price without phoning'),
    online_payment: answer(has(paymentTools) ? 1 : 0,
      'a way to pay online', 'no way to pay online'),
    pricing_shown: answer(priceMentions >= 3 ? 1 : 0,
      `${priceMentions} prices published`, 'no prices published anywhere'),
    work_shown: answer(gallery > 0 || images >= 12 ? 1 : 0,
      gallery > 0 ? 'a gallery of their work' : `${images} pictures of the work`,
      'the work is described but never shown'),
    reviews_shown: answer(has(reviewTools) ? 1 : 0,
      'reviews on the site', 'no reviews anywhere on the site'),
    live_chat: answer(chat ? 1 : 0, 'a chat box', 'no way to get an answer without waiting'),
    mobile_ready: answer(mobile ? 1 : 0, 'built to work on a phone', 'not built for a phone'),
    newsletter_capture: answer(emailBoxes > 0 ? 1 : 0,
      'somewhere to leave an email address', 'no way to leave an email for later'),
    careers: answer(has(careersWords) ? 1 : 0, 'a way to apply for a job', 'no way to apply for a job'),
    intake_forms: answer(has(intakeWords) && enquiryPages.length ? 1 : 0,
      'forms to fill in before arriving', 'no forms to fill in before arriving'),
    catalogue: answer(images >= 20 || /\b(shop|products|catalog|our products|browse)\b/i.test(allText) ? 1 : 0,
      'what they sell is listed', 'what they sell is not listed'),
    toolsInUse: tools,
    pagesRead: pages.length,
    lookedProperly,
  };
}

// Read one business's site: the home page, then the pages worth following.
async function readSiteAsVisitor(browser, url, options = {}) {
  const max = options.maxPages || MAX_PAGES;
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const pages = [];
  const seen = new Set();
  const queue = [url.startsWith('http') ? url : `https://${url}`];
  const page = await context.newPage();
  // Images and fonts change nothing here and cost most of the load time.
  // Both calls have to be caught: a request that finishes on its own while
  // this is deciding throws, and an uncaught throw here kills the whole page
  // load. Four of five test sites returned nothing at all until this was
  // wrapped (2026-08-27).
  await page.route('**/*', async (route) => {
    const t = route.request().resourceType();
    try {
      if (['image', 'font', 'media'].includes(t)) await route.abort();
      else await route.continue();
    } catch { /* the request resolved itself */ }
  });

  try {
    while (queue.length && pages.length < max) {
      const next = queue.shift();
      if (seen.has(next)) continue;
      seen.add(next);
      try {
        await page.goto(next, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(SETTLE_MS);
        const got = await page.evaluate(readDom);
        pages.push({ url: next, ...got });
        // Queue the pages a visitor looking to get in touch would click.
        if (pages.length === 1) {
          // Same business, not same address. A site served over http links to
          // its own https pages, and a contact page often sits on www when the
          // home page does not. Matching the whole origin missed all of those
          // and left three of five test sites read one page deep (2026-08-27).
          const host = new URL(next).hostname.replace(/^www\./, '');
          for (const l of got.links) {
            let h;
            try { h = new URL(l.href); } catch { continue; }
            if (h.hostname.replace(/^www\./, '') !== host) continue;
            if (seen.has(l.href) || queue.includes(l.href)) continue;
            if (WORTH_FOLLOWING.test(l.href) || WORTH_FOLLOWING.test(l.text)) queue.push(l.href);
          }
        }
      } catch { /* one page failing never loses the others */ }
    }
  } finally {
    await context.close();
  }
  return { pages, ...verdictFrom(pages) };
}

module.exports = {
  FOUND, ABSENT, UNKNOWN, BOOKING_HOSTS, WORTH_FOLLOWING,
  PAGE_TIMEOUT_MS, SETTLE_MS, MAX_PAGES,
  readDom, verdictFrom, readSiteAsVisitor, toolsFromPages, detectedTools, TOOL_FINGERPRINTS,
  EVERY_CAPABILITY: ['enquiry', 'booking', 'login', 'quote_request', 'online_payment',
    'pricing_shown', 'work_shown', 'reviews_shown', 'live_chat', 'mobile_ready',
    'newsletter_capture', 'careers', 'intake_forms', 'catalogue'],
};
