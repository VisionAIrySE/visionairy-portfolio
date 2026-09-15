#!/usr/bin/env node
// Bounded preparation pass for businesses with stored full website pages but
// no saved company-specific noticing jobs. Save evidence, fill absent message
// slots, audit the cohort, and leave first emails as drafts.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
for (const line of fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient } = require('@prisma/client');
const { makeOpenRouterPool } = require('../../src/hoursback/openRouterPool.js');
const { main: saveEvidence } = require('./write-noticings.js');
const value = (name, fallback = '') => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const limit = Math.min(50, Math.max(1, Number(value('limit', '50'))));
const expected = Number(value('expected-count', '0'));
const doIt = process.argv.includes('--do-it');
const db = new PrismaClient();
async function run(script, args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.HOURSBACK_TARGET_CAMPAIGNS_JSON;
    const child = spawn(process.execPath, [path.join(__dirname, script), ...args],
      { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', shell: false, env });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
}

async function targets() {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const full = await tx.reading.groupBy({
      by: ['prospectId'], where: {
        source: 'website', reader: 'understand-businesses', outcome: 'read',
        pages: { some: { AND: [
          { text: { not: null } }, { NOT: { text: '' } },
        ] } },
      },
    });
    const businesses = await tx.prospect.findMany({
      where: {
        id: { in: full.map((row) => row.prospectId) },
        doNotContact: false, repliedAt: null,
        stage: { notIn: ['CUSTOMER', 'EXPANDED_CUSTOMER', 'DORMANT'] },
        readings: { none: {
          source: 'website', reader: 'noticing', outcome: 'read',
          findings: { some: { field: 'noticingJob' } },
        } },
      },
      select: { id: true },
      orderBy: [{ automationScore: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return businesses.map((business) => business.id);
  }, { timeout: 30000 });
}

(async () => {
  if (!Number.isFinite(limit) || !Number.isFinite(expected)) {
    throw new Error('Batch limit or expected count is invalid.');
  }
  const ids = await targets();
  console.log(`${ids.length} fully researched businesses still need saved company-specific evidence in this batch.`);
  if (!doIt) {
    console.log('Preview only. No evidence, draft, queue, or email was changed.');
    return;
  }
  if (!expected || expected !== ids.length) {
    throw new Error(`Evidence scope changed. Expected ${expected}, found ${ids.length}. Nothing was changed.`);
  }
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter access is not configured. Nothing was changed.');
  }
  const finder = makeOpenRouterPool({
    model: 'google/gemini-3.1-flash-lite', apiKey: process.env.OPENROUTER_API_KEY,
    ceilingUsd: 1, hardKillMs: 120000, maxTokens: 1800, temperature: 0,
    systemPrompt: 'Analyze only supplied website evidence; answer in JSON.',
  });
  const writer = makeOpenRouterPool({
    model: 'openai/gpt-5.6-luna', apiKey: process.env.OPENROUTER_API_KEY,
    ceilingUsd: 1.5, hardKillMs: 120000, maxTokens: 1000, temperature: 0.2,
    systemPrompt: 'Write natural business English from supplied evidence; answer in JSON.',
  });
  try {
    await db.$disconnect();
    const result = await saveEvidence({
      ids, limit: ids.length, atOnce: 4,
      ask: finder.ask, askToWrite: writer.ask,
      skipStaleReadingRepair: true, evidenceOnly: true,
      reviewPage: path.resolve(__dirname, '../../docs/hoursback/missing-evidence-to-review.md'),
    });
    console.log(`Evidence model cost: $${finder.spent.toFixed(4)} of $1.00; wording model cost: $${writer.spent.toFixed(4)} of $1.50.`);
    if (result.code) process.exitCode = result.code;
    const verifyDb = new PrismaClient();
    try {
      const readyIds = await verifyDb.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const ready = await tx.prospect.findMany({ where: {
          id: { in: ids },
          readings: { some: {
            source: 'website', reader: 'noticing', outcome: 'read',
            findings: { some: { field: 'noticingJob' } },
          } },
        }, select: { id: true } });
        return ready.map((business) => business.id);
      }, { timeout: 30000 });
      const remaining = ids.length - readyIds.length;
      console.log(`${ids.length - remaining} of ${ids.length} selected businesses now have saved message evidence; ${remaining} remain exceptions.`);
      if (remaining) process.exitCode = 2;
      if (readyIds.length) {
        const writerCode = await run('write-the-whole-sequence.cjs', [
          `--ids=${readyIds.join(',')}`, '--all-contacts', '--missing-only',
          '--do-it', '--prepare-only', '--openrouter-model=openai/gpt-5.6-luna',
          '--openrouter-ceiling=5',
        ]);
        if (writerCode) process.exitCode = writerCode;
        const auditCode = await run('audit-stage-completion.cjs', [
          '--stage=drafts', '--scope=ids', `--ids=${readyIds.join(',')}`,
          '--strict', '--show=10',
        ]);
        if (auditCode) process.exitCode = auditCode;
      }
    } finally {
      await verifyDb.$disconnect();
    }
  } finally {
    finder.close(); writer.close();
  }
})().catch((error) => {
  console.error(`Evidence batch stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
