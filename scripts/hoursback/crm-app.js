#!/usr/bin/env node
// The Hours Back calling screen. Local only — your machine, no internet
// needed, nothing spends money. Start it and open http://localhost:4747
//
// What it shows: today's call queue (callbacks first), the follow-up list,
// the leak report, and the week's score. Click a business, dial the number,
// answer three questions, done — the record writes itself.
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
const { markDoNotContact, markLost, CALL_OUTCOMES } = require('../../src/hoursback/crm/stages.js');
const { freezeQuote } = require('../../src/hoursback/crm/quote.js');
const { setOverride } = require('../../src/hoursback/overrides.js');
const db = new PrismaClient();

const OUTCOME_LABELS = {
  NO_ANSWER: 'No answer', VOICEMAIL: 'Left voicemail', GATEKEEPER: 'Gatekeeper',
  WRONG_NUMBER: 'Wrong number', NOT_INTERESTED: 'Not interested', INTERESTED: 'Interested!',
};

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Hours Back</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:880px;margin:0 auto;padding:16px;background:#fafaf7;color:#1a1a1a}
h1{font-size:22px} h2{font-size:17px;margin-top:28px;border-bottom:2px solid #e0ddd5;padding-bottom:4px}
.card{background:#fff;border:1px solid #e0ddd5;border-radius:10px;padding:12px 16px;margin:10px 0}
.cb{border-left:5px solid #d97706}
.phone{font-size:20px;font-weight:700;color:#065f46;text-decoration:none}
.muted{color:#666;font-size:14px} .row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
button,.btn{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #bbb;background:#fff;cursor:pointer;text-decoration:none;color:#1a1a1a}
button.primary{background:#065f46;color:#fff;border-color:#065f46}
select,input{font:inherit;padding:8px;border-radius:8px;border:1px solid #bbb;width:100%;box-sizing:border-box}
label{display:block;margin:14px 0 4px;font-weight:600}
.score{display:flex;gap:18px;flex-wrap:wrap}.score div{background:#fff;border:1px solid #e0ddd5;border-radius:10px;padding:10px 16px;text-align:center}
.score b{display:block;font-size:22px}
.warn{background:#fef3c7;border-color:#d97706}
a{color:#065f46}
</style></head><body>${body}</body></html>`;
}

async function home() {
  const [queue, follow, leaks, score] = await Promise.all([
    callQueue(db), followUpQueue(db), leakReport(db), callToPaidReadout(db),
  ]);
  const total = await db.prospect.count({ where: { doNotContact: false } });
  const li = (p, cb) => `<div class="card ${cb ? 'cb' : ''}"><div class="row">
    <div><b>${p.name}</b>${cb ? ' — <b style="color:#d97706">callback due today</b>' : ''}
      <div class="muted">${(p.address || '').replace(/, USA$/, '')}${p.nextAction ? ` · next: ${p.nextAction}` : ''}</div></div>
    <div class="row"><a class="phone" href="tel:${(p.phone || '').replace(/\D/g, '')}">${p.phone || ''}</a>
    <a class="btn primary" href="/call/${p.id}">Log call</a></div></div></div>`;
  return page(`<h1>Hours Back — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
  <div class="score">
    <div><b>${score.paidThisWeek}</b>paid this week<br><span class="muted">target ${score.weeklyTarget}</span></div>
    <div><b>${score.callsLogged}</b>calls, 4 weeks</div>
    <div><b>${(score.callToPaidRate * 100).toFixed(1)}%</b>call → paid</div>
    <div><b>${total}</b>businesses banked</div>
  </div>
  ${score.saidYesButUnpaid.length ? `<div class="card warn"><b>Said yes, not yet paid:</b> ${score.saidYesButUnpaid.join(', ')}</div>` : ''}
  ${leaks.length ? `<div class="card warn"><b>Leaking (live, nothing scheduled):</b> ${leaks.map((l) => l.name).join(', ')}</div>` : ''}
  <h2>Today's calls (${queue.length})</h2>${queue.map((p) => li(p, p.isCallbackDueToday)).join('')}
  <h2>Follow-ups due (${follow.length})</h2>${follow.slice(0, 15).map((p) => li(p, false)).join('') || '<p class="muted">none due</p>'}`);
}

async function callForm(id) {
  const p = await db.prospect.findUnique({ where: { id } });
  if (!p) return page('<p>Not found. <a href="/">Back</a></p>');
  const opts = CALL_OUTCOMES.map((o) => `<option value="${o}">${OUTCOME_LABELS[o]}</option>`).join('');
  return page(`<h1>${p.name}</h1>
  <p><a class="phone" href="tel:${(p.phone || '').replace(/\D/g, '')}">${p.phone || 'no phone'}</a><br>
  <span class="muted">${(p.address || '')} · ${p.website ? `<a href="${p.website}" target="_blank">website</a>` : 'no website'} · stage ${p.stage} · attempts ${p.attemptCount}</span></p>
  <form method="POST" action="/call/${p.id}">
    <label>1 — How did it go?</label><select name="outcome">${opts}</select>
    <label>2 — What happens next?</label><input name="nextWhat" placeholder="e.g. Call back, ask for Sarah / send one-pager" required>
    <label>3 — When?</label><input type="datetime-local" name="nextWhen" required>
    <label>Who did you talk to? <span class="muted">(optional)</span></label><input name="contactName" placeholder="name and role">
    <label>Their team size, if learned <span class="muted">(optional — sets the price)</span></label><input name="headcount" type="number" min="1">
    <p><button class="primary">Save call</button> <a class="btn" href="/">Back</a></p>
  </form>
  <form method="POST" action="/dnc/${p.id}" onsubmit="return confirm('Never contact ${p.name.replace(/'/g, '')} again?')">
    <button style="color:#b91c1c">They said: never call again</button>
  </form>`);
}

async function handleCall(id, form) {
  const answers = { outcome: form.outcome, nextWhat: form.nextWhat, nextWhen: form.nextWhen, wentHow: form.wentHow || null };
  await logCall(db, id, answers, `web-${id}-${Date.now()}`);
  if (form.contactName) await db.prospect.update({ where: { id }, data: { contactName: form.contactName } });
  if (form.headcount) {
    await setOverride(db, id, 'employeeCount', Number(form.headcount), 'russ');
    const p = await db.prospect.findUnique({ where: { id } });
    if (!p.quotedAt) { try { await freezeQuote(db, id); } catch {} }
  }
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

const server = http.createServer(async (req, res) => {
  try {
    const [, route, id] = req.url.split('/');
    if (route === 'login' && req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      const form = Object.fromEntries(new URLSearchParams(body));
      if (PASSWORD && form.pw === PASSWORD) {
        res.writeHead(303, { 'Set-Cookie': `hb=${token()}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`, Location: '/' });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(loginPage(true));
    }
    if (!signedIn(req)) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(loginPage(false)); }
    // One-time data door: receives the prospect store from the home machine
    // after deploy. Password-gated like everything else; refuses overwrite of
    // a store that already has rows unless ?force=1.
    if (route === 'import' && req.method === 'POST') {
      const existing = await db.prospect.count();
      const force = req.url.includes('force=1');
      if (existing > 0 && !force) { res.writeHead(409); return res.end(`refused: ${existing} rows already here`); }
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
      let body = '';
      for await (const c of req) body += c;
      const form = Object.fromEntries(new URLSearchParams(body));
      if (route === 'call') await handleCall(id, form);
      if (route === 'dnc') await markDoNotContact(db, id);
      res.writeHead(303, { Location: '/' }); return res.end();
    }
    if (route === 'call' && id) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(await callForm(id)); }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await home());
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(`error: ${e.message}`);
  }
});
const PORT = Number(process.env.PORT || 4747);
server.listen(PORT, '0.0.0.0', () => console.log(`Hours Back CRM on port ${PORT}${PASSWORD ? ' (password-locked)' : ' (local, no password)'}`));
