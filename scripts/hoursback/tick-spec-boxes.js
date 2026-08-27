#!/usr/bin/env node
// Tick the boxes in the specs that the checks say are done — and untick the
// ones they say are not.
//
//   node scripts/hoursback/tick-spec-boxes.js --dry-run
//   node scripts/hoursback/tick-spec-boxes.js
//
// Why this exists. A spec box is ticked by hand, so it drifts from the truth
// the moment anybody forgets. On 2026-08-27 the suite reported "26 requirements
// unbuilt" in the outreach spec while more than half of those checks were
// passing — the work was done and the boxes were stale. That reads as "nowhere
// near ready" when the truth was the opposite, which is worse than no report
// at all.
//
// Nothing here decides anything. The check is the evidence; this only copies
// the verdict onto the box. A box whose check fails gets unticked, so it can
// never ratchet its way to a clean-looking spec.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
process.chdir(path.resolve(__dirname, '../..'));

const SPEC_DIR = 'docs/hoursback/specs';
const dry = process.argv.includes('--dry-run');

// One run of the suite, then read the verdict off each line.
console.log('running every check once...');
let out = '';
try {
  out = execFileSync('node', ['scripts/hoursback/run-spec-checks.js'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  // A failing suite still prints every line, and a failing suite is exactly
  // when this matters most.
  out = String((e.stdout || '') + (e.stderr || ''));
}
const verdict = new Map();
for (const line of out.split('\n')) {
  const m = line.match(/^([✓✗])\s+([a-z0-9_]+)\s/);
  if (m) verdict.set(m[2], m[1] === '✓');
}
console.log(`${verdict.size} checks reported`);
if (!verdict.size) { console.error('no check results found — nothing changed'); process.exit(1); }

let ticked = 0, unticked = 0, unknown = 0;
for (const file of fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.md'))) {
  const full = path.join(SPEC_DIR, file);
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i += 1) {
    const box = lines[i].match(/^(\s*-\s*)\[([ x])\](\s.*)$/);
    if (!box) continue;
    const named = lines[i].match(/--check=([a-z0-9_]+)/);
    if (!named) { unknown += 1; continue; }
    const passes = verdict.get(named[1]);
    if (passes === undefined) { unknown += 1; continue; }
    const want = passes ? 'x' : ' ';
    if (box[2] === want) continue;
    lines[i] = `${box[1]}[${want}]${box[3]}`;
    changed = true;
    if (passes) { ticked += 1; console.log(`  ✓ ${file}: ${named[1]}`); }
    else { unticked += 1; console.log(`  ✗ ${file}: ${named[1]} — unticked, its check fails`); }
  }
  if (changed && !dry) fs.writeFileSync(full, lines.join('\n'));
}

console.log('');
console.log(`ticked:   ${ticked}`);
console.log(`unticked: ${unticked}`);
console.log(`no check to read: ${unknown}`);
if (dry) console.log('\ndry run — nothing written');
