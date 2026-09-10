// READERS THAT ARE ALREADY AWAKE.
//
// Every question used to start a whole new reader from cold: launch, load,
// connect, answer, exit. Measured on 2026-09-03, that start-up alone was 7.5
// seconds for a question with nothing in it to think about, and a business
// asks five to seven questions. Most of a night was spent watching the same
// program wake up.
//
// So a few readers are started BEFORE they are needed and left waiting. A
// question is handed to one that is already awake; when it answers, it is
// closed and a fresh one is started in its place, ready for the next.
//
// WHAT DOES NOT CHANGE, and must not: every reader still answers exactly ONE
// question and is then closed. The steps are deliberately blind to each
// other — the one that finds the work never sees the recurrence check, and
// the stranger who reads the finished sentence must never see the
// instructions it was written under. A shared, long-lived conversation would
// destroy that. This only moves the waking-up earlier.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readAnswer } = require('./readAnswer.js');

const LOCAL_CLAUDE_JS = path.resolve(process.cwd(), 'node_modules/@anthropic-ai/claude-code/cli.js');
const LOCAL_CLAUDE_EXE = path.resolve(process.cwd(), 'node_modules/@anthropic-ai/claude-code/bin/claude.exe');
const LOCAL_CLAUDE_NATIVE = path.resolve(
  process.cwd(),
  `node_modules/@anthropic-ai/claude-code-${process.platform}-${process.arch}/claude${process.platform === 'win32' ? '.exe' : ''}`,
);

function launchClaude(model, cwd) {
  const args = argsFor(model);
  // Use the installed native package first. The wrapper package's small
  // Windows placeholder is not an executable binary, and falling through to
  // npx used to fetch a temporary copy on every campaign run.
  if (fs.existsSync(LOCAL_CLAUDE_NATIVE)) return spawn(LOCAL_CLAUDE_NATIVE, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  if (fs.existsSync(LOCAL_CLAUDE_JS)) return spawn(process.execPath, [LOCAL_CLAUDE_JS, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  if (fs.existsSync(LOCAL_CLAUDE_EXE)) return spawn(LOCAL_CLAUDE_EXE, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  return spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}

// The model is chosen by the caller now (2026-09-04). Finding facts on a page
// is work the cheap fast model does well. Writing the sentence a stranger will
// read is not: with fifteen rules to satisfy it starts dropping words, and
// "Then payment for no-shows, and the hours get lost" reached the letters.
// Both run through the Claude already logged in on this machine, so neither is
// a paid call and the standing order of 2026-08-29 holds.
const argsFor = (model = 'haiku') => [
  '--model', model,
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--system-prompt', 'You read web pages and answer with JSON only. No preamble, no explanation, no code fences.',
  '--exclude-dynamic-system-prompt-sections',
  '--strict-mcp-config',
  '--no-session-persistence',
  '--settings', '{"hooks":{},"enabledPlugins":{}}',
  '--disallowed-tools', 'Bash,Read,Write,Edit,WebFetch,WebSearch,Glob,Grep,Task,TodoWrite',
  '-p',
];
const READER_ARGS = argsFor('haiku');

/// A reader is out of allowance when it answers in prose about that rather
/// than in JSON. This is the one failure that must stop a whole run, and it
/// is never a thin website (feedback-a-working-fallback-hides-a-dead-primary).
const OUT_OF_ALLOWANCE = /session limit|usage limit|rate limit|resets at|out of (credit|quota)/i;

function makeReaderPool({
  size = 4,
  hardKillMs = 180000,
  cwd = process.cwd(),
  spawnReader = null,
  onCall = null,
  model = 'haiku',
} = {}) {
  const launch = spawnReader || (() => launchClaude(model, cwd));
  let warm = [];
  let closed = false;

  const fill = () => {
    if (closed) return;
    while (warm.length < size) {
      let child;
      try { child = launch(); } catch { return; }
      child.on('error', () => { warm = warm.filter((c) => c !== child); });
      warm.push(child);
    }
  };

  const take = () => {
    const child = warm.shift();
    fill();                                  // start its replacement at once
    return child || launch();                // never block: cold if the pool is empty
  };

  function ask(question) {
    const began = Date.now();
    return new Promise((resolve) => {
      const child = take();
      let settled = false;
      let out = '';
      const done = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        if (onCall) onCall({ ms: Date.now() - began, answered: Boolean(v && v.answer) });
        resolve(v);
      };
      const guard = setTimeout(() => {
        done({ answer: null, why: `the reader did not answer inside ${Math.round(hardKillMs / 1000)}s and was stopped` });
      }, hardKillMs);

      child.on('error', () => done({ answer: null, why: 'the reader could not be started' }));
      child.on('exit', () => {
        if (settled) return;
        // It closed without a result line. Whatever it did say is all we have.
        done(out.trim() ? readAnswer(out) : { answer: null, why: 'the reader did not answer' });
      });
      if (child.stderr) child.stderr.on('data', () => {});

      child.stdout.on('data', (d) => {
        out += String(d);
        let cut = out.lastIndexOf('\n');
        if (cut === -1) return;
        for (const line of out.slice(0, cut).split('\n')) {
          if (!line.trim()) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.type !== 'result') continue;
          const text = String(msg.result || '');
          if (OUT_OF_ALLOWANCE.test(text.slice(0, 400))) {
            return done({ answer: null, why: 'THE READER IS OUT OF ALLOWANCE — this is not a thin website', readerExhausted: true });
          }
          return done(readAnswer(text));
        }
        out = out.slice(cut + 1);
      });

      try {
        child.stdin.write(`${JSON.stringify({
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: String(question) }] },
        })}\n`);
        child.stdin.end();
      } catch {
        done({ answer: null, why: 'the reader would not take the question' });
      }
    });
  }

  function close() {
    closed = true;
    for (const c of warm) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
    warm = [];
  }

  fill();
  return { ask, close, get waiting() { return warm.length; } };
}

module.exports = { makeReaderPool, READER_ARGS, argsFor, OUT_OF_ALLOWANCE };
