#!/usr/bin/env node
// Compare inexpensive OpenRouter models against Sonnet on the exact first-email
// prompt and the CRM's own acceptance rules. This is read-only and never saves
// model output or changes a campaign.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)="?([^"\r]*)"?$/);
    // The repository's ignored settings are the user's current choice. An
    // older process-level key must not silently override a newly supplied one.
    if (match) process.env[match[1]] = match[2];
  }
} catch { /* environment may already be configured */ }

const { PrismaClient } = require('@prisma/client');
const C = require('../../src/hoursback/crm/campaign.js');
const FC = require('../../src/hoursback/crm/firstContact.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const W = require('./write-the-whole-sequence.cjs');

const db = new PrismaClient();
const MODELS = [
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.6-luna',
  'deepseek/deepseek-v4.1-flash',
  'inception/mercury-2.5',
];
const MAX_SPEND = 0.10;
let spent = 0;

async function ask(model, prompt) {
  if (spent >= MAX_SPEND) throw new Error(`the $${MAX_SPEND.toFixed(2)} comparison ceiling was reached`);
  const startedAt = Date.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Write polished business English and answer with JSON only. No preamble or code fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    let reason = '';
    try {
      const failure = await response.json();
      reason = String(failure.error && failure.error.message || '').slice(0, 160);
    } catch { /* status is still enough */ }
    throw new Error(`${model} returned ${response.status}${reason ? `: ${reason}` : ''}`);
  }
  const payload = await response.json();
  const cost = Number(payload.usage && payload.usage.cost || 0);
  spent += cost;
  const text = String(payload.choices?.[0]?.message?.content || '');
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error(`${model} did not return JSON`);
  return { answer: JSON.parse(json[0]), cost, ms: Date.now() - startedAt };
}

(async () => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OpenRouter access is not configured');
  await C.loadHisWordings(db);
  // Fictional records exercise the same industries, roles and writing rules
  // without transmitting any CRM company or employee data to OpenRouter.
  const samples = [
    {
      prospect: { name: 'Cascade Property Services', trade: 'commercial real estate' },
      recipient: { name: 'Dana Brooks', role: 'VP Finance' },
      jobs: ['tenant billing and rent collection', 'owner financial reporting'],
    },
    {
      prospect: { name: 'Pine Ridge Dental', trade: 'dental' },
      recipient: { name: 'Morgan Lee', role: 'Practice Manager' },
      jobs: ['patient appointment scheduling', 'insurance benefit verification'],
    },
    {
      prospect: { name: 'High Desert Fabrication', trade: 'manufacturing' },
      recipient: { name: 'Alex Rivera', role: 'Operations Manager' },
      jobs: ['production work-order handoffs', 'material availability tracking'],
    },
  ];

  const results = [];
  for (const model of MODELS) {
    for (const { prospect, recipient, jobs } of samples) {
      try {
        const response = await ask(model, W.askForFirst({
          name: prospect.name,
          trade: prospect.trade,
          roleTitle: recipient.role,
          jobs,
          otherJobs: [],
          why: null,
        }));
        const answer = response.answer;
        const greetingName = FC.greetingFor({ contactName: recipient.name });
        const greeting = greetingName ? `Hi ${greetingName},` : 'Hello,';
        const shapeOK = W.acceptableOpening(answer.body)
          && W.acceptableSubject(answer.subject)
          && W.acceptableQuestion(answer.question, jobs.length);
        const letter = shapeOK ? W.buildFirstLetter({
          greeting, passage: answer.body, question: answer.question, seed: prospect.name,
        }) : '';
        const judged = shapeOK ? J.judgeLetter(letter, { day: 0, jobs, roleTitle: recipient.role }) : { ok: false, why: 'failed the required response shape' };
        results.push({ model, company: prospect.name, role: recipient.role, pass: judged.ok, why: judged.ok ? null : judged.why, cost: response.cost, ms: response.ms, subject: answer.subject, passage: answer.body, question: answer.question });
      } catch (error) {
        results.push({ model, company: prospect.name, role: recipient.role, pass: false, why: error.message });
      }
    }
  }

  for (const model of MODELS) {
    const rows = results.filter((result) => result.model === model);
    const modelCost = rows.reduce((sum, row) => sum + Number(row.cost || 0), 0);
    const timed = rows.filter((row) => row.ms);
    const averageMs = timed.length ? Math.round(timed.reduce((sum, row) => sum + row.ms, 0) / timed.length) : 0;
    console.log(`\n${model}: ${rows.filter((row) => row.pass).length}/${rows.length} passed | $${modelCost.toFixed(4)} | ${averageMs} ms average`);
    for (const row of rows) {
      console.log(`  ${row.pass ? 'PASS' : 'FAIL'} ${row.company} — ${row.role || 'role unknown'}${row.why ? ` — ${row.why}` : ''}`);
      if (row.passage) console.log(`    ${row.subject} | ${row.passage} ${row.question}`);
    }
  }
  console.log(`\nOpenRouter comparison cost: $${spent.toFixed(4)}`);
  await db.$disconnect();
})().catch(async (error) => {
  console.error(`Comparison failed: ${error.message}`);
  try { await db.$disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
