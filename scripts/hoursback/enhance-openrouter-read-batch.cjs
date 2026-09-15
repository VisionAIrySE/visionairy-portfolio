#!/usr/bin/env node
// Turn the current OpenRouter whole-site batch into evidence-backed noticing
// records. Campaign writing remains a separate, auditable second command.
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
if (!process.env.OPENROUTER_API_KEY) throw new Error('OpenRouter access is not configured');

const { PrismaClient } = require('@prisma/client');
const { makeOpenRouterPool } = require('../../src/hoursback/openRouterPool.js');
const { main } = require('./write-noticings.js');
const READER_VERSION = '2026-09-14-whole-site-openrouter';
const idArg = process.argv.find((value) => value.startsWith('--id='));
const ONLY_ID = idArg ? idArg.slice(5) : '';
const db = new PrismaClient();
const finder = makeOpenRouterPool({
  model: 'google/gemini-3.1-flash-lite', apiKey: process.env.OPENROUTER_API_KEY,
  ceilingUsd: 1, hardKillMs: 120000, maxTokens: 1800, temperature: 0,
  systemPrompt: 'Analyze only the supplied website evidence and answer with JSON only. No preamble, explanation, or code fences.',
  onCall: ({ answered, why }) => { if (!answered && why) console.error(`Evidence call failed: ${why}`); },
});
const writer = makeOpenRouterPool({
  model: 'openai/gpt-5.6-luna', apiKey: process.env.OPENROUTER_API_KEY,
  ceilingUsd: 1.5, hardKillMs: 120000, maxTokens: 1000, temperature: 0.2,
  systemPrompt: 'Write precise, natural business English grounded only in the supplied evidence. Answer with JSON only. No preamble or code fences.',
  onCall: ({ answered, why }) => { if (!answered && why) console.error(`Writing call failed: ${why}`); },
});

(async () => {
  const readings = await db.reading.findMany({
    where: {
      reader: 'understand-businesses', readerVersion: READER_VERSION,
      outcome: 'read',
      ...(ONLY_ID ? { prospectId: ONLY_ID } : {}),
      pages: { some: { OR: [
        { AND: [{ text: { not: null } }, { NOT: { text: '' } }] },
        { sameAs: { not: null } },
      ] } },
    },
    distinct: ['prospectId'],
    select: { prospectId: true },
  });
  const ids = readings.map((row) => row.prospectId);
  console.log(`${ids.length} fully researched businesses selected for evidence enhancement`);
  await db.$disconnect();
  const result = await main({
    ids, limit: 50, atOnce: 4,
    ask: finder.ask, askToWrite: writer.ask,
  });
  console.log(`Evidence-analysis cost: $${finder.spent.toFixed(4)} of $1.00`);
  console.log(`Customer-facing wording cost: $${writer.spent.toFixed(4)} of $1.50`);
  finder.close(); writer.close();
  process.exitCode = result.code || 0;
})().catch(async (error) => {
  finder.close(); writer.close();
  try { await db.$disconnect(); } catch { /* already closed */ }
  console.error(`Enhancement failed: ${error.message}`);
  process.exitCode = 1;
});
