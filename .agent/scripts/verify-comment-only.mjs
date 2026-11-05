#!/usr/bin/env node
// verify-comment-only.mjs — prove a commit changed ONLY comments.
// Companion to `audit-comment-density.mjs` (rule `87-comment-economy`).
//
// ⚠ KNOWN FALSE POSITIVE — a reported change is a PROMPT TO LOOK, not a verdict.
// The stripper tracks string state character-by-character, so prose containing an
// unbalanced comment marker or an odd number of quote characters desyncs it and
// every later comment survives the strip, reporting a phantom code change.
// Observed on a component spec (5 block-opens vs 4
// closes in its header prose).
//
// When it fires, confirm by hand before believing it:
//   git diff HEAD~1 HEAD -- <file> | grep -E '^[+-]' | grep -vE '^[+-]{3}' //     | grep -vE '^[+-]\s*(//|\*|/\*)' | grep -vE '^[+-]\s*$'
// Empty output both directions == the change really is comment-only.
//
// Strip every comment from the before and
// after of each source file and assert the remaining code is byte-identical.
// Blank lines are normalised away too, since removing a header shifts them.
import { execFileSync } from 'node:child_process';

const repo = process.argv[2];
const git = (...args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Remove line and block comments, respecting strings and template literals. */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let quote = null;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '').join('\n');
}

const files = git('show', '--name-only', '--format=', 'HEAD').trim().split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f));

let bad = 0;
for (const f of files) {
  const before = git('show', `HEAD~1:${f}`);
  const after = git('show', `HEAD:${f}`);
  if (stripComments(before) !== stripComments(after)) { bad++; console.log(`  CODE CHANGED  ${f}`); }
}
console.log(bad === 0
  ? `  ${files.length} source file(s): comment-only, code byte-identical`
  : `  ${bad} file(s) HAVE CODE CHANGES`);
process.exit(bad ? 1 : 0);
