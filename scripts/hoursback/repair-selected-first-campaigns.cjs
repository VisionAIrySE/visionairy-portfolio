#!/usr/bin/env node
// Preview or repair selected, unsent campaigns whose first email fails the
// shared writing check. Sent campaigns and hand-edited first drafts stay out.
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
const L = require('../../src/hoursback/crm/lanes.js');
const J = require('../../src/hoursback/crm/judgeTheLetter.js');
const db = new PrismaClient();
const option = (name, fallback = '') => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const doIt = process.argv.includes('--do-it');
const expected = Number(option('expected-count', '0'));
const ceiling = Number(option('ceiling', '10'));
const model = option('model', 'openai/gpt-5.6-luna');

async function failedFirsts() {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const failures = new Map();
    const gap = await L.selectedDraftGap(tx, {
      judgeStored: (message, context) => {
        const verdict = J.judgeStored(message, context);
        if (!verdict.ok && L.isFirstContactMessage(message)) {
          failures.set(message.prospectId, {
            edited: Boolean(message.editedAt), reason: verdict.why,
          });
        }
        return verdict;
      },
    });
    return { gap, failures };
  }, { timeout: 30000 });
}

(async () => {
  if (!Number.isFinite(expected) || !Number.isFinite(ceiling) || ceiling <= 0) {
    throw new Error('The expected count and spending ceiling must be valid numbers.');
  }
  const before = await failedFirsts();
  const held = [...before.failures.values()].filter((item) => item.edited).length;
  const ids = [...before.failures].filter(([, item]) => !item.edited)
    .map(([id]) => id);
  console.log(`${before.gap.contentFailed} selected campaigns fail writing checks; ${ids.length} have an unedited failing first email; ${held} hand-edited first emails are held.`);
  if (!doIt) {
    console.log('Preview only. No draft was changed or lined up.');
    return;
  }
  if (!expected || expected !== ids.length || held) {
    throw new Error(`Repair scope changed. Expected ${expected} unedited failing first emails; found ${ids.length} and ${held} hand edits. Nothing was changed.`);
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'write-the-whole-sequence.cjs'),
      `--ids=${ids.join(',')}`, '--do-it', '--prepare-only',
      `--openrouter-model=${model}`, `--openrouter-ceiling=${ceiling}`,
    ], { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    process.exitCode = code;
    return;
  }
  const after = await failedFirsts();
  const remaining = ids.filter((id) => after.failures.has(id));
  console.log(`${ids.length - remaining.length} of ${ids.length} targeted first emails now pass; ${remaining.length} still need revision. First emails remain drafts.`);
  if (remaining.length) process.exitCode = 2;
})().catch((error) => {
  console.error(`Repair stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
