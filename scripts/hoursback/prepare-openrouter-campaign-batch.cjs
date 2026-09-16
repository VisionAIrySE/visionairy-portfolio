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
const noSpendingLimit = process.argv.includes('--no-spending-limit');
const writerModel = value('writer-model', 'openai/gpt-5.6-luna');
const selectedGap = process.argv.includes('--selected-missing-full-read');
const allGap = process.argv.includes('--all-missing-full-read');
const selectedAttemptPrefix = value('selected-attempt-prefix');
const resume = process.argv.includes('--resume');
const doIt = process.argv.includes('--do-it');

if (!version || !/^[a-zA-Z0-9_-]+$/.test(version)) {
  console.error('Supply a unique --reader-version using only letters, numbers, dashes, and underscores.');
  process.exitCode = 2;
} else if (!Number.isFinite(limit) || !Number.isFinite(writerCeiling)
  || (selectedGap && allGap)) {
  console.error('The batch size and writing spending ceiling must be numbers.');
  process.exitCode = 2;
} else {
  const stages = [
    ...(!resume ? [{ label: 'Read full websites', script: 'read-full-via-openrouter.cjs',
      args: [`--reader-version=${version}`, `--limit=${limit}`,
        ...(noSpendingLimit ? ['--no-spending-limit'] : ['--ceiling=1']),
        ...(selectedGap ? ['--selected-missing-full-read'] : []),
        ...(allGap ? ['--all-missing-full-read', '--include-without-email'] : []),
        ...(selectedAttemptPrefix ? [`--selected-attempt-prefix=${selectedAttemptPrefix}`] : [])] }] : []),
    ...(!resume ? [{ label: 'Audit website reading', script: 'audit-stage-completion.cjs',
      args: ['--stage=research', '--scope=batch', `--reader-version=${version}`, '--strict'] }] : []),
    { label: 'Audit contact labels and recipient choice', script: 'audit-contact-finder.cjs',
      args: [`--reader-version=${version}`, '--strict'] },
    { label: 'Save company-specific evidence', script: 'enhance-openrouter-read-batch.cjs',
      args: [`--reader-version=${version}`,
        ...(noSpendingLimit ? ['--no-spending-limit'] : [])] },
    { label: 'Audit saved evidence', script: 'audit-stage-completion.cjs',
      args: ['--stage=evidence', '--scope=batch', `--reader-version=${version}`, '--strict'] },
    { label: 'Prepare four messages per address', script: 'write-the-whole-sequence.cjs',
      args: [`--reader-version=${version}`, '--all-contacts', '--do-it', '--prepare-only',
        `--openrouter-model=${writerModel}`,
        ...(noSpendingLimit ? ['--no-spending-limit']
          : [`--openrouter-ceiling=${writerCeiling}`])] },
    { label: 'Audit every recipient campaign', script: 'audit-stage-completion.cjs',
      args: ['--stage=drafts', '--scope=batch', `--reader-version=${version}`, '--strict'] },
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
      console.log('All preparation stages passed their checks. Review any website exceptions in the audit reports before enabling automatic sending.');
    })().catch((error) => {
      console.error(`Preparation stopped: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
