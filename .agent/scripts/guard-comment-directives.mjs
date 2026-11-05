#!/usr/bin/env node
// guard-comment-directives.mjs — pre/post guard for a comment strip.
// Companion to `audit-comment-density.mjs` (rule `87-comment-economy`).
// Removing an `@ts-expect-error` turns a green build into a compile error;
// removing an `eslint-disable` or `@vitest-environment` changes behaviour.
//
// Usage:  node guard-directives.mjs <dir> snapshot   -> writes a count per file
//         node guard-directives.mjs <dir> compare    -> diffs against it, exit 1
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIR = process.argv[2];
const MODE = process.argv[3];
const SNAP = join(process.env.TEMP || '/tmp', 'directive-snapshot.json');
// One snapshot at a time — this is a within-one-app before/after, not a store.

const DIRECTIVE =
  /@ts-(expect-error|ignore|nocheck)|eslint-disable|eslint-enable|@vitest-environment|@jest-environment|webpackChunkName|prettier-ignore|istanbul ignore|c8 ignore|sourceMappingURL|@license|@preserve/;

const SKIP = new Set(['node_modules', '.next', 'dist', 'build', 'out', 'coverage',
  '.git', '.turbo', '.vercel', 'generated', '__generated__', '.sitecore', '.worktrees']);

function walk(d, acc = []) {
  let e; try { e = readdirSync(d); } catch { return acc; }
  for (const n of e) {
    const p = join(d, n);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) { if (!SKIP.has(n)) walk(p, acc); }
    else if (/\.tsx?$/.test(n)) acc.push(p);
  }
  return acc;
}

const counts = {};
for (const f of walk(DIR)) {
  const n = readFileSync(f, 'utf8').split('\n').filter((l) => DIRECTIVE.test(l)).length;
  if (n) counts[relative(DIR, f).split(sep).join('/')] = n;
}

if (MODE === 'snapshot') {
  writeFileSync(SNAP, JSON.stringify(counts, null, 2));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`snapshot: ${total} directive comment(s) across ${Object.keys(counts).length} file(s)`);
} else {
  if (!existsSync(SNAP)) { console.error('no snapshot to compare against'); process.exit(2); }
  const before = JSON.parse(readFileSync(SNAP, 'utf8'));
  let lost = 0;
  for (const [f, n] of Object.entries(before)) {
    const now = counts[f] ?? 0;
    if (now < n) { lost++; console.error(`  LOST ${n - now} directive(s): ${f}`); }
  }
  console.log(lost === 0
    ? `  directives intact (${Object.values(counts).reduce((a, b) => a + b, 0)} preserved)`
    : `  ${lost} file(s) LOST a directive comment`);
  process.exit(lost ? 1 : 0);
}
