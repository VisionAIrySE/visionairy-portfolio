// Disposable-database + HTTP regression test. Never loads repository credentials.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const testUrl = 'postgresql://postgres:test@localhost:55432/hoursback_test';
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
const { PrismaClient } = require('@prisma/client');
const { saveChoices } = require('../../src/hoursback/crm/recipientChoiceBatch.js');
const { setOverrides } = require('../../src/hoursback/overrides.js');
const { loadWorkflowProgress } = require('../../src/hoursback/crm/workflowProgress.js');
const { queuedEmailPages } = require('../../src/hoursback/crm/queuedEmailPages.js');
const db = new PrismaClient();
const prefix = `performance-${Date.now()}`;
const ids = [];
let server;

(async () => {
  assert.equal(new URL(process.env.DATABASE_URL).pathname, '/hoursback_test');
  for (let index = 0; index < 27; index += 1) {
    const p = await db.prospect.create({ data: {
      placeId: `${prefix}-${index}`, name: `Performance fixture ${index}`,
      trade: prefix, automationScore: index >= 25 ? null : index <= 1 ? 100 : 100 - index,
      email: `office${index}@example.test`, emailInboxSelected: false,
      contacts: { create: { name: 'Alex Example', email: `alex${index}@example.test`,
        isPrimary: false, source: 'MANUAL' } },
    } });
    ids.push(p.id);
    await db.outreachMessage.createMany({ data:
      ['tailored_first', 'touch_2', 'touch_3', 'touch_4'].map((openedWith) => ({
        prospectId: p.id, lane: 'EMAIL', state: 'DRAFT', openedWith,
        sentTo: `alex${index}@example.test`, subject: 'Test only',
        body: `PERFORMANCE_BODY_${index}_END`,
      })) });
  }
  const person = await db.contact.findFirst({ where: { prospectId: ids[0] } });
  const saved = await saveChoices(db, ids[0], [person.id], false);
  assert.equal(saved.saved, true);
  assert.equal((await db.contact.findUnique({ where: { id: person.id } })).isPrimary, true);
  await saveChoices(db, ids[0], [], false);
  assert.equal((await db.contact.findUnique({ where: { id: person.id } })).isPrimary, false);
  assert.equal(await db.outreachMessage.count({ where: { prospectId: ids[0], state: 'SUPPRESSED' } }), 4);
  await saveChoices(db, ids[0], [person.id], false);
  assert.equal(await db.outreachMessage.count({ where: { prospectId: ids[0], state: 'DRAFT' } }), 4);

  await setOverrides(db, ids[0], { name: 'Saved performance fixture', phone: '555-0100' });
  assert.equal(await db.prospectFieldEdit.count({ where: { prospectId: ids[0], correctedBy: 'russ' } }), 2);
  const progress = await loadWorkflowProgress(db);
  assert.ok(progress.withEmail >= 27);

  // Exercise Prisma's nested score ordering and ID cursor across modified rows.
  await db.outreachMessage.updateMany({ where: { prospectId: { in: ids } }, data: { state: 'QUEUED' } });
  const walked = [];
  for await (const page of queuedEmailPages(db, { prospectId: { in: ids }, state: 'QUEUED' }, 10)) {
    walked.push(...page.map((m) => m.id));
    await db.outreachMessage.updateMany({ where: { id: { in: page.map((m) => m.id) } }, data: { state: 'DRAFT' } });
  }
  assert.equal(new Set(walked).size, 108);

  server = spawn(process.execPath, [path.resolve(__dirname, 'crm-app.js')], {
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl,
      NODE_PATH: process.env.NODE_PATH || '', HOST: '127.0.0.1', PORT: '38765',
      CRM_PASSWORD: 'local-performance-test', RESEND_API_KEY: '', RESEND_INBOUND_API_KEY: '',
      OPENROUTER_API_KEY: '', HOURSBACK_CUSTOMER_EMAIL_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let errors = '';
  server.stderr.on('data', (chunk) => { errors += chunk; });
  server.stdout.resume();
  const base = 'http://127.0.0.1:38765';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(base)).ok) break; } catch (_) { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pw=local-performance-test' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const page = await fetch(`${base}/email?trade=${prefix}`, { headers: { cookie } });
  const html = await page.text();
  assert.equal(page.status, 200, errors);
  assert.ok(html.includes('PERFORMANCE_BODY_0_END'));
  assert.ok(html.includes('PERFORMANCE_BODY_24_END'));
  assert.ok(!html.includes('PERFORMANCE_BODY_25_END'));
  const progressPage = await fetch(`${base}/progress`, { headers: { cookie } });
  assert.equal(progressPage.status, 200);
  assert.match(await progressPage.text(), /Recipient campaigns/);
  const savePage = await fetch(`${base}/email/recipients-all?trade=${prefix}`, {
    method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ company: ids[0], [`recipient.${ids[0]}`]: person.id }),
  });
  assert.equal(savePage.status, 303);
  assert.match(decodeURIComponent(savePage.headers.get('location')), /saved/);
  assert.equal((await db.contact.findUnique({ where: { id: person.id } })).isPrimary, true);
  console.log('PASS: local database selections, clear/reselect, field history, paged sender, Email bodies, Progress and bulk-save HTTP');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) server.kill();
  if (ids.length) {
    await db.prospectFieldEdit.deleteMany({ where: { prospectId: { in: ids } } });
    await db.outreachMessage.deleteMany({ where: { prospectId: { in: ids } } });
    await db.contact.deleteMany({ where: { prospectId: { in: ids } } });
    await db.prospect.deleteMany({ where: { id: { in: ids } } });
  }
  await db.$disconnect();
});
