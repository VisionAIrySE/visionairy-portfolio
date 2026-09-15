#!/usr/bin/env node
// One bounded preparation pass: full website pages -> saved business evidence
// -> four recipient-specific drafts. This preparation job leaves first emails
// as drafts; the separately enabled morning reconciliation lines up only
// selected campaigns after the existing backlog is reviewed. No Resend call.
const { spawn } = require('node:child_process');
const path = require('node:path');

const value = (name, fallback = '') => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const version = value('reader-version');
const limit = Math.min(50, Math.max(1, Number(value('limit', '50'))));
const writerCeiling = Math.max(0.05, Number(value('writer-ceiling', '5')));
const writerModel = value('writer-model', 'openai/gpt-5.6-luna');
const selectedGap = process.argv.includes('--selected-missing-full-read');
const resume = process.argv.includes('--resume');
const doIt = process.argv.includes('--do-it');

if (!version || !/^[a-zA-Z0-9_-]+$/.test(version)) {
  console.error('Supply a unique --reader-version using only letters, numbers, dashes, and underscores.');
  process.exitCode = 2;
} else if (!Number.isFinite(limit) || !Number.isFinite(writerCeiling)) {
  console.error('The batch size and writing spending ceiling must be numbers.');
  process.exitCode = 2;
} else {
  const stages = [
    ...(!resume ? [{ label: 'Read full websites', script: 'read-full-via-openrouter.cjs',
      args: [`--reader-version=${version}`, `--limit=${limit}`, '--ceiling=1',
        ...(selectedGap ? ['--selected-missing-full-read'] : [])] }] : []),
    { label: 'Save company-specific evidence', script: 'enhance-openrouter-read-batch.cjs',
      args: [`--reader-version=${version}`] },
    { label: 'Prepare four messages per address', script: 'write-the-whole-sequence.cjs',
      args: [`--reader-version=${version}`, '--all-contacts', '--do-it', '--prepare-only',
        `--openrouter-model=${writerModel}`, `--openrouter-ceiling=${writerCeiling}`] },
    { label: 'Check all active messages in the batch', script: 'check-the-letters.cjs',
      args: [`--reader-version=${version}`, '--strict'] },
  ];
  if (!doIt) {
    console.log('Preparation preview only. Nothing was read, changed, lined up, or sent.');
    for (const stage of stages) console.log(`- ${stage.label}`);
    console.log('Add --do-it only for an approved production preparation run.');
  } else {
    const root = path.resolve(__dirname, '../..');
    (async () => {
      for (const stage of stages) {
        console.log(`\n${stage.label}...`);
        const code = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath,
            [path.join(__dirname, stage.script), ...stage.args],
            { cwd: root, stdio: 'inherit', shell: false });
          child.once('error', reject);
          child.once('exit', (exitCode) => resolve(exitCode ?? 1));
        });
        if (code !== 0) {
          console.error(`${stage.label} stopped. Later stages were not run; use --resume after resolving the exception.`);
          process.exitCode = code;
          return;
        }
      }
      console.log('Preparation stages finished. Review the recipient and readiness audit before enabling automatic sending.');
    })().catch((error) => {
      console.error(`Preparation stopped: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
