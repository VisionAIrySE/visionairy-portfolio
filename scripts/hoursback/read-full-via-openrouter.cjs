#!/usr/bin/env node
// Run the full, evidence-preserving website reader through OpenRouter.
// Only the model transport changes; the full crawler and saving path remain
// in understand-businesses.js.

const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '../..'));
try {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    // Repository settings are the source of truth for this run. In
    // particular, do not let an older Windows-level OpenRouter key override
    // the replacement key Russ saved in this repository.
    process.env[match[1]] = value;
  }
} catch { /* settings may be supplied by the host */ }

const arg = (name, fallback) => {
  const found = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const MODEL = arg('model', 'google/gemini-3.1-flash-lite');
const LIMIT = Math.min(50, Math.max(1, Number(arg('limit', 50))));
const LANES = Math.min(4, Math.max(1, Number(arg('lanes', 3))));
const NO_SPENDING_LIMIT = process.argv.includes('--no-spending-limit');
const CEILING = NO_SPENDING_LIMIT ? Infinity : Math.max(0.05, Number(arg('ceiling', 1)));
const ID = arg('id', '');
const READER_VERSION = arg('reader-version', '2026-09-14-whole-site-openrouter');
const LOOK = process.argv.includes('--look');
const SELECTED_MISSING_FULL_READ = process.argv.includes('--selected-missing-full-read');
const ALL_MISSING_FULL_READ = process.argv.includes('--all-missing-full-read');
const HAS_EMAIL = !ALL_MISSING_FULL_READ
  && !process.argv.includes('--include-without-email');
const SELECTED_ATTEMPT_PREFIX = arg('selected-attempt-prefix', '');

if (!process.env.OPENROUTER_API_KEY) {
  console.error('OpenRouter access is not configured. Nothing was read or changed.');
  process.exit(1);
}
const { makeOpenRouterPool } = require('../../src/hoursback/openRouterPool.js');
const { runUnderstand } = require('./understand-businesses.js');
const writer = makeOpenRouterPool({
  model: MODEL, apiKey: process.env.OPENROUTER_API_KEY,
  ceilingUsd: CEILING, hardKillMs: 120000, maxTokens: 2200,
  systemPrompt: 'You read web pages and answer with JSON only. No preamble, no explanation, no code fences.',
  temperature: 0,
  onCall: ({ answered, why }) => {
    if (!answered && why) console.error(`OpenRouter call failed: ${why}`);
  },
});

console.log(`Full website research: up to ${LIMIT} unread businesses through ${MODEL}`);
console.log(NO_SPENDING_LIMIT
  ? 'No added spending ceiling; actual OpenRouter charges will be reported.'
  : `OpenRouter spending ceiling: $${CEILING.toFixed(2)}`);
console.log(SELECTED_MISSING_FULL_READ
  ? 'Queue: selected contacts whose business lacks saved full-site research'
  : ALL_MISSING_FULL_READ ? 'Queue: all active website businesses lacking saved full-site research'
  : HAS_EMAIL ? 'Queue: businesses with a usable email on file'
    : 'Queue: businesses with or without an email');

runUnderstand({
  ask: writer.ask, model: MODEL,
  readerVersion: READER_VERSION,
  readerDescription: `${MODEL} through OpenRouter`,
  limit: LIMIT, lanes: LANES, untried: true, hasEmail: HAS_EMAIL, look: LOOK,
  selectedMissingFullRead: SELECTED_MISSING_FULL_READ,
  allMissingFullRead: ALL_MISSING_FULL_READ,
  selectedAttemptPrefix: SELECTED_ATTEMPT_PREFIX,
  skipStaleReadingRepair: true,
  ...(ID ? { only: ID } : {}),
}).then((result) => {
  console.log(`OpenRouter cost: $${writer.spent.toFixed(4)}`
    + (NO_SPENDING_LIMIT ? '' : ` of the $${CEILING.toFixed(2)} ceiling`));
  writer.close();
  process.exitCode = result.code || 0;
}).catch((error) => {
  writer.close();
  console.error(`Website research failed: ${error.message}`);
  process.exitCode = 1;
});
