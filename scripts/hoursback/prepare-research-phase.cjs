#!/usr/bin/env node
// Run one bounded cohort of at most 50 sites, then audit it. A later cohort
// requires a separate invocation after the previous result is reviewed.
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
const db = require('../../src/hoursback/crm/productLegacyScope.js').legacyClient(new PrismaClient(),{enabled:process.env.CRM_PRODUCT_PREVIEW==='1'});
const value = (name, fallback = '') => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const scope = value('scope', 'selected');
const prefix = value('prefix');
const maxBatches = Number(value('max-batches', '1'));
const doIt = process.argv.includes('--do-it');
const BATCH_LIMIT = 50;

function eligibleWhere() {
  const where = {
    doNotContact: false, repliedAt: null,
    AND: [
      { OR: [{ website: { not: null } },
        { websiteManualValue: { not: null } }] },
      { readings: { none: {
        source: 'website', reader: 'understand-businesses', outcome: 'read',
        pages: { some: { AND: [
          { text: { not: null } }, { NOT: { text: '' } },
        ] } },
      } } },
      { readings: { none: {
        reader: 'understand-businesses',
        readerVersion: { startsWith: `${prefix}_` },
        finishedAt: { not: null },
      } } },
    ],
  };
  if (scope === 'selected') where.contacts = { some: {
    isPrimary: true, email: { not: null }, bouncedAt: null, setAsideAt: null,
  } };
  else where.stage = { notIn: ['CUSTOMER', 'EXPANDED_CUSTOMER', 'DORMANT'] };
  return where;
}

async function snapshot(version = '') {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const eligible = await tx.prospect.count({ where: eligibleWhere() });
    const attempted = version ? await tx.reading.groupBy({
      by: ['prospectId'], where: {
        source: 'website', reader: 'understand-businesses',
        readerVersion: version, finishedAt: { not: null },
      },
    }) : [];
    return { eligible, attempted: attempted.length };
  }, { timeout: 30000 });
}

async function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, script), ...args],
      { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
}

(async () => {
  if (!['selected', 'all'].includes(scope) || !/^[a-zA-Z0-9_-]+$/.test(prefix)
    || !Number.isInteger(maxBatches) || maxBatches !== 1) {
    throw new Error('Supply a valid scope, unique prefix, and exactly one batch of at most 50 websites.');
  }
  if (!doIt) {
    console.log(`Preview only: ${scope} websites, one cohort of at most ${BATCH_LIMIT}. No records or emails were changed. OpenRouter charges will be reported; no spending ceiling is added.`);
    return;
  }
  let batches = 0;
  for (let index = 1; index <= maxBatches; index += 1) {
    const before = await snapshot();
    if (!before.eligible) break;
    const expected = Math.min(BATCH_LIMIT, before.eligible);
    const version = `${prefix}_${index}`;
    console.log(`Batch ${index}: ${before.eligible} sites remain eligible; ${expected} should be attempted now.`);
    const code = await run('prepare-openrouter-campaign-batch.cjs', [
      `--reader-version=${version}`, `--limit=${expected}`,
      `--selected-attempt-prefix=${prefix}_`,
      scope === 'selected' ? '--selected-missing-full-read' : '--all-missing-full-read',
      '--no-spending-limit',
      '--do-it',
    ]);
    const after = await snapshot(version);
    batches += 1;
    console.log(`Batch ${index} saved ${after.attempted} finished website attempts; ${after.eligible} sites still eligible.`);
    if (after.attempted !== expected) {
      throw new Error(`Batch ${index} did not account for every planned site. Expected ${expected}, found ${after.attempted}. No later batch was started.`);
    }
    if (code !== 0) {
      process.exitCode = code;
      console.error(`Batch ${index} did not pass every stage audit. Later batches were not started.`);
      return;
    }
  }
  const ending = await snapshot();
  console.log(`${batches} checked batches finished; ${ending.eligible} sites still eligible under this phase prefix.`);
  await run('audit-stage-completion.cjs', [
    '--stage=research', `--scope=${scope}`, '--show=5',
  ]);
  if (ending.eligible) process.exitCode = 2;
  else console.log('The attemptable websites in this phase are accounted for. Review recorded exceptions and the whole backlog before calling CRM research complete.');
})().catch((error) => {
  console.error(`Research phase stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
