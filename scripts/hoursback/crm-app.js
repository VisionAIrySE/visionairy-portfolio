#!/usr/bin/env node
// The Hours Back calling screen.
//
// Four screens:
//   /            today — callbacks first, follow-ups due, the week's score
//   /list        every business, best first, searchable
//   /business/x  the account card: everything known, everything editable
//   /call/x      the three questions after a dial
//
// Anything typed here outranks anything fetched, forever, and every
// correction is kept with who made it and when.
const http = require('http');
const fs = require('fs');
process.chdir(require('path').resolve(__dirname, '../..'));
// Local convenience only: read .env when it exists. On a host there is no
// .env — the settings arrive as real environment variables — and a missing
// file must never crash the app. (It did: first deploy died here.)
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no .env on the host — expected */ }
const { PrismaClient } = require('@prisma/client');
const { callQueue, followUpQueue, callToPaidReadout } = require('../../src/hoursback/crm/queues.js');
const { logCall, leakReport } = require('../../src/hoursback/crm/nextAction.js');
const { markDoNotContact, CALL_OUTCOMES } = require('../../src/hoursback/crm/stages.js');
const { freezeQuote } = require('../../src/hoursback/crm/quote.js');
const { setOverride, resolveField, OVERRIDABLE } = require('../../src/hoursback/overrides.js');
const L = require('../../src/hoursback/crm/lanes.js');
const { draftFirstContact, draftLinkedIn, BODY: TEMPLATE_BODY, SUBJECTS } = require('../../src/hoursback/crm/firstContact.js');
const db = new PrismaClient();

const OUTCOME_LABELS = {
  NO_ANSWER: 'No answer', VOICEMAIL: 'Left voicemail', GATEKEEPER: 'Gatekeeper',
  WRONG_NUMBER: 'Wrong number', NOT_INTERESTED: 'Not interested', INTERESTED: 'Interested!',
};
const SITE_STATUS_LABELS = {
  READ: 'website read', NO_WEBSITE: 'no website', UNREACHABLE: 'website would not load',
};
const EMAIL_STATUS_LABELS = {
  FOUND_ON_SITE: 'found on their site', FOUND_LOW_CONFIDENCE: 'found, but might be wrong',
  UNAVAILABLE_NO_WEBSITE: 'no website to look at', UNAVAILABLE_NOT_PUBLISHED: 'not published anywhere',
  UNAVAILABLE_SITE_UNREACHABLE: 'site would not load',
};

const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const digits = (v) => String(v || '').replace(/\D/g, '');

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Hours Back</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:920px;margin:0 auto;padding:16px;background:#fafaf7;color:#1a1a1a}
h1{font-size:22px} h2{font-size:17px;margin-top:28px;border-bottom:2px solid #e0ddd5;padding-bottom:4px}
.card{background:#fff;border:1px solid #e0ddd5;border-radius:10px;padding:12px 16px;margin:10px 0}
.cb{border-left:5px solid #d97706}
.phone{font-size:20px;font-weight:700;color:#065f46;text-decoration:none}
.muted{color:#666;font-size:14px} .row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
button,.btn{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #bbb;background:#fff;cursor:pointer;text-decoration:none;color:#1a1a1a}
button.primary{background:#065f46;color:#fff;border-color:#065f46}
select,input,textarea{font:inherit;padding:8px;border-radius:8px;border:1px solid #bbb;width:100%;box-sizing:border-box}
label{display:block;margin:14px 0 4px;font-weight:600}
.score{display:flex;gap:18px;flex-wrap:wrap}.score div{background:#fff;border:1px solid #e0ddd5;border-radius:10px;padding:10px 16px;text-align:center}
.score b{display:block;font-size:22px}
.warn{background:#fef3c7;border-color:#d97706}
a{color:#065f46}
.pill{display:inline-block;background:#065f46;color:#fff;border-radius:999px;padding:2px 10px;font-size:14px;font-weight:700}
.pill.cool{background:#9ca3af}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
@media(max-width:640px){.grid{grid-template-columns:1fr}}
.tell{margin:6px 0;padding-left:14px;border-left:3px solid #d97706}
.tell b{display:block}
.was{font-size:13px;color:#888;margin-top:2px}
nav{margin-bottom:8px} nav a{margin-right:14px;font-weight:600}
table{width:100%;border-collapse:collapse} td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;font-size:15px}
pre.msg{background:#fff;border:1px solid #e0ddd5;border-radius:10px;padding:14px;white-space:pre-wrap;font:15px/1.55 system-ui,sans-serif;margin:8px 0}
</style></head><body><nav><a href="/">Today</a><a href="/list">All businesses</a><a href="/email">Email</a><a href="/linkedin">LinkedIn</a></nav>${body}</body></html>`;
}

const scoreBadge = (n) => `<span class="pill ${(n || 0) >= 40 ? '' : 'cool'}">${n === null || n === undefined ? '–' : n}</span>`;

// ---------------------------------------------------------------------------
async function home() {
  const [queue, follow, leaks, score] = await Promise.all([
    callQueue(db), followUpQueue(db), leakReport(db), callToPaidReadout(db),
  ]);
  const total = await db.prospect.count({ where: { doNotContact: false } });
  const withEmail = await db.prospect.count({ where: { email: { not: null } } });
  const li = (p, cb) => `<div class="card ${cb ? 'cb' : ''}"><div class="row">
    <div><a href="/business/${p.id}"><b>${esc(p.name)}</b></a> ${scoreBadge(p.automationScore)}${cb ? ' — <b style="color:#d97706">callback due today</b>' : ''}
      <div class="muted">${esc((p.address || '').replace(/, USA$/, ''))}${p.nextAction ? ` · next: ${esc(p.nextAction)}` : ''}</div></div>
    <div class="row"><a class="phone" href="tel:${digits(p.phone)}">${esc(p.phone || '')}</a>
    <a class="btn primary" href="/call/${p.id}">Log call</a></div></div></div>`;
  return page(`<h1>Hours Back — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
  <div class="score">
    <div><b>${score.paidThisWeek}</b>paid this week<br><span class="muted">target ${score.weeklyTarget}</span></div>
    <div><b>${score.callsLogged}</b>calls, 4 weeks</div>
    <div><b>${(score.callToPaidRate * 100).toFixed(1)}%</b>call → paid</div>
    <div><b>${total}</b>businesses banked</div>
    <div><b>${withEmail}</b>with an email</div>
  </div>
  ${score.saidYesButUnpaid.length ? `<div class="card warn"><b>Said yes, not yet paid:</b> ${score.saidYesButUnpaid.map(esc).join(', ')}</div>` : ''}
  ${leaks.length ? `<div class="card warn"><b>Leaking (live, nothing scheduled):</b> ${leaks.map((l) => esc(l.name)).join(', ')}</div>` : ''}
  <h2>Today's calls (${queue.length})</h2>${queue.map((p) => li(p, p.isCallbackDueToday)).join('')}
  <h2>Follow-ups due (${follow.length})</h2>${follow.slice(0, 15).map((p) => li(p, false)).join('') || '<p class="muted">none due</p>'}`);
}

// ---------------------------------------------------------------------------
// Every business, best first. This is the room the call list is picked from.
async function list(params) {
  const q = (params.get('q') || '').trim();
  const stage = params.get('stage') || '';
  const page_ = Math.max(1, Number(params.get('page') || 1));
  const per = 50;
  const where = { doNotContact: false };
  if (q) where.OR = [
    { name: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
  ];
  if (stage) where.stage = stage;
  const [rows, total] = await Promise.all([
    db.prospect.findMany({ where, orderBy: [{ automationScore: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }], take: per, skip: (page_ - 1) * per }),
    db.prospect.count({ where }),
  ]);
  const pages = Math.ceil(total / per);
  const rowHtml = rows.map((p) => `<tr>
    <td>${scoreBadge(p.automationScore)}</td>
    <td><a href="/business/${p.id}"><b>${esc(resolveField(p, 'name'))}</b></a><div class="muted">${esc((resolveField(p, 'address') || '').replace(/, USA$/, ''))}</div></td>
    <td><a href="tel:${digits(resolveField(p, 'phone'))}">${esc(resolveField(p, 'phone') || '—')}</a></td>
    <td class="muted">${esc(resolveField(p, 'email') || '—')}</td>
    <td class="muted">${esc(p.stage)}</td>
  </tr>`).join('');
  const link = (n) => `<a class="btn" href="/list?page=${n}${q ? `&q=${encodeURIComponent(q)}` : ''}${stage ? `&stage=${stage}` : ''}">${n === page_ - 1 ? 'Previous' : 'Next'}</a>`;
  return page(`<h1>All businesses (${total})</h1>
  <form method="GET" action="/list" class="row" style="margin:12px 0">
    <input name="q" value="${esc(q)}" placeholder="search a name, a town, an email" style="flex:1">
    <button class="primary">Search</button>
  </form>
  <p class="muted">Sorted by how manual they still look — the highest numbers are the ones most worth a call.</p>
  <table><tr><th>Score</th><th>Business</th><th>Phone</th><th>Email</th><th>Stage</th></tr>${rowHtml}</table>
  <p class="row">${page_ > 1 ? link(page_ - 1) : '<span></span>'}<span class="muted">page ${page_} of ${pages || 1}</span>${page_ < pages ? link(page_ + 1) : '<span></span>'}</p>`);
}

// ---------------------------------------------------------------------------
// The email screen. Nothing goes out until the wording is approved once, and
// after that every message is that same wording with their own facts in it.
async function emailScreen(params) {
  const template = await db.messageTemplate.findUnique({ where: { name: L.FIRST_CONTACT } });
  const approved = Boolean(template && template.approvedAt);
  const weeks = Number(params.get('weeks') || 0);
  const [left, ready, sent, batch] = await Promise.all([
    L.emailsLeftToday(db, weeks),
    db.outreachMessage.findMany({
      where: { lane: 'EMAIL', state: { in: ['DRAFT', 'QUEUED'] }, openedWith: { not: 'after_the_call' }, prospect: { doNotContact: false, repliedAt: null } },
      include: { prospect: true }, orderBy: { prospect: { automationScore: 'desc' } }, take: 25,
    }),
    db.outreachMessage.count({ where: { lane: 'EMAIL', state: 'SENT' } }),
    L.pendingBatch(db),
  ]);
  const reachable = await db.prospect.count({
    where: { doNotContact: false, repliedAt: null, emailBouncedAt: null, OR: [{ email: { not: null } }, { emailManualValue: { not: null } }] },
  });

  const wording = `<h2>The message</h2>
  <p class="muted">Written once in your voice. Approve it once and every business gets this exact wording with only their own name and the thing you found on their site changed.</p>
  ${approved
    ? `<div class="card" style="background:#dcfce7;border-color:#16a34a">Approved ${new Date(template.approvedAt).toLocaleDateString()} by ${esc(template.approvedBy)} — version ${template.version}. Change a word and it needs approving again.</div>`
    : '<div class="card warn"><b>Not approved yet.</b> Nothing can be sent until you read this and approve it.</div>'}
  <pre class="msg">${esc(template ? template.body : TEMPLATE_BODY)}</pre>
  ${approved ? '' : `<form method="POST" action="/email/approve"><button class="primary">I've read it — approve it</button></form>`}`;

  const one = (m) => `<div class="card"><div class="row">
      <div><a href="/business/${m.prospectId}"><b>${esc(resolveField(m.prospect, 'name'))}</b></a> ${scoreBadge(m.prospect.automationScore)}
        <div class="muted">${esc(resolveField(m.prospect, 'email') || 'no address')} · opens on: ${esc(m.openedWith || '')}</div></div>
      <div class="muted">${esc(m.state)}</div></div>
      <pre class="msg">${esc(m.subject ? `Subject: ${m.subject}\n\n` : '')}${esc(m.body)}</pre>
      <form method="POST" action="/email/sent/${m.id}" style="display:inline"><button ${approved ? '' : 'disabled'}>I sent this</button></form>
      <form method="POST" action="/email/replied/${m.prospectId}" style="display:inline"><button>They replied</button></form>
      <form method="POST" action="/email/bounced/${m.prospectId}" style="display:inline"><button>It bounced</button></form>
    </div>`;

  const justSent = params.get('sent');
  return page(`<h1>Email</h1>
  ${justSent !== null ? `<div class="card" style="background:#dcfce7;border-color:#16a34a"><b>${esc(justSent)} sent.</b> ${esc(params.get('why') || '')}</div>` : ''}
  <div class="score">
    <div><b>${reachable}</b>reachable by email</div>
    <div><b>${ready.length}</b>written and waiting</div>
    <div><b>${sent}</b>sent so far</div>
    <div><b>${left}</b>allowed today<br><span class="muted">week ${weeks} of the ramp</span></div>
  </div>
  ${wording}
  ${batch.length ? `<h2>After-call follow-ups waiting (${batch.length})</h2>
    <p class="muted">Written from what you promised on the call. None of them go anywhere until you release them.</p>
    ${batch.slice(0, 5).map(one).join('')}
    <form method="POST" action="/email/batch"><button class="primary">Release all ${batch.length}</button></form>` : ''}
  <h2>First contact, written and waiting (${ready.length})</h2>
  <p class="row">
    <form method="POST" action="/email/write"><button ${approved ? '' : 'disabled'}>Write the next 25</button></form>
    <form method="POST" action="/email/send?weeks=${weeks}"><button ${approved && left > 0 ? 'class="primary"' : 'disabled'}>Send the queue — at most ${Math.min(left, 25)} right now</button></form>
  </p>
  <p class="muted">Sending never passes ${L.MAX_PER_RUN} in one go, never passes today's ${L.dailyEmailCap(weeks)}, and refuses entirely without an approved message.</p>
  ${ready.map(one).join('') || '<p class="muted">Nothing written yet.</p>'}`);
}

// LinkedIn is only ever sent by hand, one at a time, and who sent it is kept.
async function linkedInScreen() {
  const queue = await L.linkedInQueue(db, 25);
  return page(`<h1>LinkedIn — by hand only</h1>
  <p class="muted">The engine never sends these. Copy one, send it yourself, then mark it. Your name goes on it.</p>
  <p><form method="POST" action="/linkedin/write"><button class="primary">Write the next 25</button></form></p>
  ${queue.map((m) => `<div class="card">
      <div class="row"><div><a href="/business/${m.prospectId}"><b>${esc(resolveField(m.prospect, 'name'))}</b></a> ${scoreBadge(m.prospect.automationScore)}</div></div>
      <pre class="msg">${esc(m.body)}</pre>
      <form method="POST" action="/linkedin/sent/${m.id}"><button>I sent this one</button></form>
    </div>`).join('') || '<p class="muted">Nothing written yet.</p>'}`);
}

// ---------------------------------------------------------------------------
// The account card. Everything we know, and every line of it editable.
function editable(p, field, label, type = 'text') {
  const manual = p[`${field}ManualValue`];
  const fetched = p[field];
  const shown = manual !== null && manual !== undefined ? manual : fetched;
  const wasLine = (manual !== null && manual !== undefined && fetched !== null && fetched !== undefined && String(manual) !== String(fetched))
    ? `<div class="was">their site said: ${esc(fetched)}</div>` : '';
  return `<div><label>${label}</label><input name="${field}" type="${type}" value="${esc(shown)}">${wasLine}</div>`;
}

async function businessCard(id, saved) {
  const p = await db.prospect.findUnique({ where: { id }, include: { callLogs: { orderBy: { loggedAt: 'desc' }, take: 8 }, fieldEdits: { orderBy: { correctedAt: 'desc' }, take: 8 } } });
  if (!p) return page('<p>Not found. <a href="/">Back</a></p>');
  let evidence = [];
  try { evidence = JSON.parse(p.scoreEvidence || '[]'); } catch { evidence = []; }

  const tells = evidence.length
    ? evidence.map((e) => `<div class="tell"><b>${esc(e.label || e.signal)}</b>
        <span class="muted">${esc(e.quote || '')}${e.url ? ` — <a href="${esc(e.url)}" target="_blank">seen here</a>` : ''}</span></div>`).join('')
    : '<p class="muted">Nothing found on their site yet.</p>';

  const count = resolveField(p, 'employeeCount');
  const priceLine = p.quotedAt
    ? `<b>$${p.quotedAuditFee} for ${p.quotedGuaranteedHours} hours a week</b> — quoted ${new Date(p.quotedAt).toLocaleDateString()}, locked.`
    : (p.auditFee
      ? `<b>$${p.auditFee} for ${p.guaranteedHours} hours a week</b> (band ${esc(p.segment)}) — not yet quoted.`
      : '<span class="muted">No team size known, so no price yet. Type one in below and it prices itself.</span>');

  const emailLine = resolveField(p, 'email')
    ? `${esc(resolveField(p, 'email'))} <span class="muted">— ${esc(EMAIL_STATUS_LABELS[p.emailStatus] || p.emailStatus || '')}${p.emailConfidence ? `, ${Math.round(p.emailConfidence * 100)}% sure` : ''}</span>`
    : `<span class="muted">${esc(EMAIL_STATUS_LABELS[p.emailStatus] || 'not looked for yet')}</span>`;

  const site = resolveField(p, 'website');
  return page(`
  ${saved ? '<div class="card" style="background:#dcfce7;border-color:#16a34a">Saved.</div>' : ''}
  <h1>${esc(resolveField(p, 'name'))} ${scoreBadge(p.automationScore)}</h1>
  <p><a class="phone" href="tel:${digits(resolveField(p, 'phone'))}">${esc(resolveField(p, 'phone') || 'no phone')}</a><br>
    <span class="muted">${esc((resolveField(p, 'address') || '').replace(/, USA$/, ''))}</span><br>
    ${site ? `<a href="${esc(site)}" target="_blank">${esc(site)}</a>` : '<span class="muted">no website</span>'}
    <span class="muted"> · ${esc(SITE_STATUS_LABELS[p.siteStatus] || 'not read yet')}${p.siteReadAt ? `, ${new Date(p.siteReadAt).toLocaleDateString()}` : ''}</span></p>
  <p><a class="btn primary" href="/call/${p.id}">Log a call</a>
     ${!p.quotedAt && p.auditFee ? `<form method="POST" action="/quote/${p.id}" style="display:inline"><button>Lock this quote in</button></form>` : ''}</p>

  <h2>Why call them</h2>${tells}

  <h2>The price</h2>
  <p>${priceLine}</p>
  <p class="muted">Team size: ${count === null || count === undefined ? 'unknown' : count}${p.headcountPublishedAs && p.headcountPublishedAs !== String(count) ? ` (their site says ${esc(p.headcountPublishedAs)})` : ''}${p.headcountSourceUrl ? ` — <a href="${esc(p.headcountSourceUrl)}" target="_blank">where it says so</a>` : ''}</p>

  <h2>Who</h2>
  <p>Owner: ${esc(p.ownerName || '—')} · Spoke to: ${esc(p.contactName || '—')}${p.contactRole ? ` (${esc(p.contactRole)})` : ''}
     · Decision maker: ${p.isDecisionMaker === null ? 'unknown' : (p.isDecisionMaker ? 'yes' : 'no')}<br>
     Email: ${emailLine}</p>

  <h2>Everything, editable</h2>
  <p class="muted">What you type here beats anything the machine found, and it survives every later sweep.</p>
  <form method="POST" action="/business/${p.id}">
    <div class="grid">
      ${editable(p, 'name', 'Business name')}
      ${editable(p, 'phone', 'Phone')}
      ${editable(p, 'email', 'Email')}
      ${editable(p, 'website', 'Website')}
      ${editable(p, 'address', 'Address')}
      ${editable(p, 'employeeCount', 'Team size (sets the price)', 'number')}
      <div><label>Owner's name</label><input name="ownerName" value="${esc(p.ownerName)}"></div>
      <div><label>Who you spoke to</label><input name="contactName" value="${esc(p.contactName)}"></div>
      <div><label>Their role</label><input name="contactRole" value="${esc(p.contactRole)}"></div>
      <div><label>Are they the decision maker?</label><select name="isDecisionMaker">
        <option value="">unknown</option>
        <option value="yes"${p.isDecisionMaker === true ? ' selected' : ''}>yes</option>
        <option value="no"${p.isDecisionMaker === false ? ' selected' : ''}>no</option></select></div>
    </div>
    <p><button class="primary">Save</button></p>
  </form>

  <h2>What's happened</h2>
  ${p.callLogs.length ? p.callLogs.map((c) => `<div class="card"><b>${esc(OUTCOME_LABELS[c.outcome] || c.outcome)}</b> — ${new Date(c.loggedAt).toLocaleString()}
     <div class="muted">${esc(c.nextWhat || '')}${c.nextWhen ? ` · ${new Date(c.nextWhen).toLocaleString()}` : ''}</div></div>`).join('') : '<p class="muted">No calls logged yet.</p>'}
  ${p.fieldEdits.length ? `<h2>Corrections</h2>${p.fieldEdits.map((e) => `<div class="muted">${esc(e.fieldName)}: "${esc(e.valueBefore)}" → "${esc(e.valueAfter)}" · ${esc(e.correctedBy)} · ${new Date(e.correctedAt).toLocaleDateString()}</div>`).join('')}` : ''}

  <form method="POST" action="/dnc/${p.id}" style="margin-top:24px" onsubmit="return confirm('Never contact this business again?')">
    <button style="color:#b91c1c">They said: never call again</button>
  </form>`);
}

// Saves the card. Overridable fields go through the corrections path, so who
// typed it and when is kept forever; the rest are plain notes.
async function saveBusiness(id, form) {
  const before = await db.prospect.findUniqueOrThrow({ where: { id } });
  for (const field of OVERRIDABLE) {
    if (!(field in form)) continue;
    const raw = String(form[field]).trim();
    const value = raw === '' ? null : (field === 'employeeCount' ? Number(raw) : raw);
    if (String(resolveField(before, field) ?? '') === String(value ?? '')) continue;
    await setOverride(db, id, field, value, 'russ');
  }
  const plain = {};
  for (const f of ['ownerName', 'contactName', 'contactRole']) {
    if (f in form) plain[f] = String(form[f]).trim() || null;
  }
  if ('isDecisionMaker' in form) {
    plain.isDecisionMaker = form.isDecisionMaker === 'yes' ? true : (form.isDecisionMaker === 'no' ? false : null);
  }
  if (Object.keys(plain).length) await db.prospect.update({ where: { id }, data: plain });
}

// ---------------------------------------------------------------------------
async function callForm(id) {
  const p = await db.prospect.findUnique({ where: { id } });
  if (!p) return page('<p>Not found. <a href="/">Back</a></p>');
  const opts = CALL_OUTCOMES.map((o) => `<option value="${o}">${OUTCOME_LABELS[o]}</option>`).join('');
  let evidence = [];
  try { evidence = JSON.parse(p.scoreEvidence || '[]'); } catch { evidence = []; }
  return page(`<h1>${esc(resolveField(p, 'name'))} ${scoreBadge(p.automationScore)}</h1>
  <p><a class="phone" href="tel:${digits(resolveField(p, 'phone'))}">${esc(resolveField(p, 'phone') || 'no phone')}</a><br>
  <span class="muted">${esc(resolveField(p, 'address') || '')} · <a href="/business/${p.id}">the whole card</a> · stage ${esc(p.stage)} · attempts ${p.attemptCount}</span></p>
  ${evidence.length ? `<div class="card"><b>What to open with</b>${evidence.slice(0, 3).map((e) => `<div class="tell"><b>${esc(e.label || e.signal)}</b><span class="muted">${esc(e.quote || '')}</span></div>`).join('')}</div>` : ''}
  ${p.auditFee ? `<div class="card"><b>The offer:</b> $${p.auditFee} for ${p.guaranteedHours} hours a week back${p.quotedAt ? ' (already quoted — do not change it)' : ''}</div>` : ''}
  <form method="POST" action="/call/${p.id}">
    <label>1 — How did it go?</label><select name="outcome">${opts}</select>
    <label>2 — What happens next?</label><input name="nextWhat" placeholder="e.g. Call back, ask for Sarah / send one-pager" required>
    <label>3 — When?</label><input type="datetime-local" name="nextWhen" required>
    <label>Who did you talk to? <span class="muted">(optional)</span></label><input name="contactName" placeholder="name and role">
    <label>Their team size, if learned <span class="muted">(optional — sets the price)</span></label><input name="headcount" type="number" min="1">
    <p><button class="primary">Save call</button> <a class="btn" href="/business/${p.id}">Back to the card</a></p>
  </form>`);
}

async function handleCall(id, form) {
  const answers = { outcome: form.outcome, nextWhat: form.nextWhat, nextWhen: form.nextWhen, wentHow: form.wentHow || null };
  await logCall(db, id, answers, `web-${id}-${Date.now()}`);
  if (form.contactName) await db.prospect.update({ where: { id }, data: { contactName: form.contactName } });
  if (form.headcount) {
    await setOverride(db, id, 'employeeCount', Number(form.headcount), 'russ');
    const p = await db.prospect.findUnique({ where: { id } });
    if (!p.quotedAt) { try { await freezeQuote(db, id); } catch { /* already quoted */ } }
  }
  // The follow-up writes itself from what he just promised, and waits in the
  // batch until he releases it. A failure here never loses the call.
  try { await L.queueFollowUp(db, id, { nextWhat: form.nextWhat }); } catch { /* the call is what matters */ }
}

// --- the lock. When CRM_PASSWORD is set (it always is in production), every
// page requires sign-in once per browser; the cookie is an HMAC so a guessed
// cookie without the password is worthless. No password set = local-only dev.
const crypto = require('crypto');
const PASSWORD = process.env.CRM_PASSWORD || '';
const token = () => crypto.createHmac('sha256', PASSWORD).update('hoursback-session').digest('hex');
function signedIn(req) {
  if (!PASSWORD) return true;
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')));
  return cookies.hb === token();
}
function loginPage(wrong) {
  return page(`<h1>Hours Back</h1><div class="card"><form method="POST" action="/login">
    <label>Password</label><input type="password" name="pw" autofocus>
    ${wrong ? '<p style="color:#b91c1c">Wrong password.</p>' : ''}
    <p><button class="primary">Sign in</button></p></form></div>`);
}

const html = (res, body) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(body); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const [, route, id] = url.pathname.split('/');
    const body = async () => {
      let raw = '';
      for await (const c of req) raw += c;
      return Object.fromEntries(new URLSearchParams(raw));
    };

    if (route === 'login' && req.method === 'POST') {
      const form = await body();
      if (PASSWORD && form.pw === PASSWORD) {
        res.writeHead(303, { 'Set-Cookie': `hb=${token()}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`, Location: '/' });
        return res.end();
      }
      return html(res, loginPage(true));
    }
    if (!signedIn(req)) return html(res, loginPage(false));

    // One-time data door: receives the prospect store from the home machine
    // after deploy. Password-gated like everything else; refuses to overwrite
    // a store that already has rows unless ?force=1.
    if (route === 'import' && req.method === 'POST') {
      const existing = await db.prospect.count();
      if (existing > 0 && url.searchParams.get('force') !== '1') { res.writeHead(409); return res.end(`refused: ${existing} rows already here`); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const rows = JSON.parse(Buffer.concat(chunks).toString());
      let n = 0;
      for (const r of rows) { await db.prospect.upsert({ where: { placeId: r.placeId }, update: r, create: r }); n += 1; }
      res.writeHead(200); return res.end(`imported ${n}`);
    }
    if (route === 'export' && req.method === 'GET') {
      const rows = await db.prospect.findMany();
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(rows));
    }

    if (req.method === 'POST') {
      const form = await body();
      if (route === 'email') {
        const [, , what, arg] = url.pathname.split('/');
        if (what === 'approve') {
          await L.upsertTemplate(db, { subject: SUBJECTS.default, body: TEMPLATE_BODY });
          await L.approveTemplate(db, L.FIRST_CONTACT, 'russ');
        }
        // Write the next batch of first-contact messages, best businesses first.
        if (what === 'write') {
          const targets = await L.reachableOn(db, 'EMAIL', 200);
          let written = 0;
          for (const t of targets) {
            if (written >= 25) break;
            const m = await L.draftFor(db, t.id, 'EMAIL');
            if (m && m.state === 'DRAFT') written += 1;
          }
        }
        // Send for real. The ceiling lives in the code, not in this button.
        if (what === 'send') {
          const weeks = Number(url.searchParams.get('weeks') || form.weeks || 0);
          const run = await L.sendQueuedEmails(db, { weeksSending: weeks });
          res.writeHead(303, { Location: `/email?sent=${run.sent}&why=${encodeURIComponent(run.stoppedBecause || '')}` });
          return res.end();
        }
        if (what === 'sent' && arg) await L.markEmailSent(db, arg);
        if (what === 'replied' && arg) await L.markReplied(db, arg, 'EMAIL');
        if (what === 'bounced' && arg) await L.markBounced(db, arg);
        if (what === 'batch') await L.approveBatch(db);
        res.writeHead(303, { Location: '/email' }); return res.end();
      }
      if (route === 'linkedin') {
        const [, , what, arg] = url.pathname.split('/');
        if (what === 'write') {
          const targets = await L.reachableOn(db, 'PHONE', 200);
          let written = 0;
          for (const t of targets) {
            if (written >= 25) break;
            const m = await L.draftFor(db, t.id, 'LINKEDIN');
            if (m && m.state === 'DRAFT') written += 1;
          }
        }
        if (what === 'sent' && arg) { try { await L.markLinkedInSent(db, arg, 'Russ'); } catch { /* already sent */ } }
        res.writeHead(303, { Location: '/linkedin' }); return res.end();
      }
      if (route === 'call') { await handleCall(id, form); res.writeHead(303, { Location: '/' }); return res.end(); }
      if (route === 'business') { await saveBusiness(id, form); res.writeHead(303, { Location: `/business/${id}?saved=1` }); return res.end(); }
      if (route === 'quote') { try { await freezeQuote(db, id); } catch { /* already quoted */ } res.writeHead(303, { Location: `/business/${id}` }); return res.end(); }
      if (route === 'dnc') { await markDoNotContact(db, id); res.writeHead(303, { Location: '/' }); return res.end(); }
      res.writeHead(303, { Location: '/' }); return res.end();
    }

    if (route === 'email') return html(res, await emailScreen(url.searchParams));
    if (route === 'linkedin') return html(res, await linkedInScreen());
    if (route === 'call' && id) return html(res, await callForm(id));
    if (route === 'business' && id) return html(res, await businessCard(id, url.searchParams.get('saved')));
    if (route === 'list') return html(res, await list(url.searchParams));
    return html(res, await home());
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(`error: ${e.message}`);
  }
});
const PORT = Number(process.env.PORT || 4747);
server.listen(PORT, '0.0.0.0', () => console.log(`Hours Back CRM on port ${PORT}${PASSWORD ? ' (password-locked)' : ' (local, no password)'}`));
