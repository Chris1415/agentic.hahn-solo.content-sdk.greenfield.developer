#!/usr/bin/env node
/**
 * extract-comment-evidence.mjs — split a comment wall into EVIDENCE (stays in
 * source, rule `40` + rule `87` § "Evidence stays in source") and NARRATIVE
 * (moves to `docs/build-decisions.md`). Read-only: reports, never rewrites.
 *
 *   node .agent/scripts/extract-comment-evidence.mjs --path <dir>
 *   node .agent/scripts/extract-comment-evidence.mjs --path <dir> --json
 *   node .agent/scripts/extract-comment-evidence.mjs --path <dir> --verify <doc.md>
 *
 * WHY THIS EXISTS. The first bulk harvest on this repo (2026-08-12) summarised
 * the narrative well and silently dropped the evidence: only 39% of high-signal
 * tokens survived (57 of 148) — including 0 of 21 `.d.ts` citations, which rule
 * `40` REQUIRES to stay at the call site. The prose read complete, so nothing
 * about the result looked wrong. A bulk pass over comments needs a mechanical
 * classifier, not a careful reader.
 *
 * WHAT IT CANNOT DO. It classifies by pattern, so it will miss evidence that
 * carries no recognisable token — a sentence like "we measured this at three
 * different widths" is narrative-shaped and will be classified as narrative.
 * Treat the EVIDENCE list as a floor: everything it finds must be kept, but
 * finding nothing is not proof there is nothing.
 *
 * `--verify <doc>` answers the retention question directly: which evidence
 * tokens from the source tree are absent from the decisions doc. Exit 1 when
 * any are missing, so a harvest can be gated rather than eyeballed.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const AS_JSON = argv.includes('--json');
const TARGET = arg('path', null);
const VERIFY = arg('verify', null);
const MIN_RUN = Number(arg('min', 12));

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', 'out', 'coverage', '.turbo',
  '.vercel', '.yarn', 'obj', 'bin', 'playwright-report', 'test-results',
  'generated', '__generated__', '.sitecore', '.worktrees', 'project-planning',
  'design-prototypes',
]);

/**
 * Evidence patterns, in the order rule 87 § "Evidence stays in source" lists
 * them. A line matching ANY of these must survive into the stripped file.
 */
const EVIDENCE = [
  [/node_modules\/[\w@./-]+\.d\.ts/, 'dts-citation'],
  [/\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/, 'guid'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/, 'guid'],
  [/project-planning\/(?:captures|spike-notes|smoke)\/[\w.-]+/, 'capture-path'],
  [/\b\d+(?:\.\d+)?\s*:\s*1\b/, 'measured-ratio'],
  [/\bfirst\s*:\s*\d+/, 'pagination-bound'],
  [/\bsource\s*:/i, 'source-marker'],
];

/** Tokens worth counting for the retention check — the un-rederivable ones. */
const SIGNAL = [
  [/node_modules\/[\w@./-]+\.d\.ts/g, 'dts-citation'],
  [/\{[0-9A-Fa-f]{8}-[0-9A-Fa-f-]{27,}\}/g, 'guid'],
  [/project-planning\/(?:captures|spike-notes|smoke)\/[\w.-]+/g, 'capture-path'],
  [/\b\d+(?:\.\d+)?:1\b/g, 'measured-ratio'],
  [/\bfirst:\s*\d+/g, 'pagination-bound'],
];

/**
 * The WCAG bars themselves. A comment citing `4.5:1` is quoting the standard,
 * not reporting a measurement — counting them as dropped evidence buries the
 * handful of real measured values under a pile of constants nobody lost.
 */
const WCAG_THRESHOLDS = new Set(['3:1', '3.0:1', '4.5:1', '7:1', '7.0:1', '21:1']);

/**
 * `1:1` is never a contrast measurement (it means two identical colours) and in
 * prose it is almost always English — "1:1 wrappers", "a 1:1 plumbing layer".
 * Three of the four hits on this repo were prose. Excluded outright.
 */
const NOT_A_RATIO = new Set(['1:1', '0:1']);

/**
 * Fixture GUIDs — `{11111111-1111-…}`, `{AAAAAAAA-…}`, `{33333333-0000-…0001}`.
 * These are invented test data living in test files; they belong exactly where
 * they are and must never be promoted into a decisions doc as if they named a
 * real Sitecore item. Detected structurally (a segment of one repeated
 * character) rather than by an allow-list, so a new fixture family needs no
 * script change.
 */
function isPlaceholderGuid(token) {
  const body = token.replace(/[{}]/g, '');
  const segs = body.split('-');
  const repeated = segs.filter((s) => s.length > 3 && /^(.)\1+$/.test(s)).length;
  const trivial = segs.filter((s) => /^0+$/.test(s) || /^0+[0-9]$/.test(s)).length;
  return repeated >= 1 && (repeated + trivial) >= 2;
}

/** True when a signal token is genuinely un-rederivable evidence. */
export function isRealSignal(kind, token) {
  if (kind === 'guid') return !isPlaceholderGuid(token);
  if (kind === 'measured-ratio') return !WCAG_THRESHOLDS.has(token) && !NOT_A_RATIO.has(token);
  return true;
}

/* ---------------------------------------------------------------- helpers */

function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries; try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP_DIRS.has(e)) walk(p); }
      else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function isGenerated(src) {
  return /@generated|DO NOT EDIT/i.test(src.split(/\r?\n/, 8).join('\n'));
}

/** Comment runs of >= MIN_RUN lines, as { start, end, lines }. 1-indexed. */
export function commentRuns(src, min = MIN_RUN) {
  const lines = src.split(/\r?\n/);
  const runs = [];
  let inBlock = false, start = -1;
  const flush = (endExclusive) => {
    if (start >= 0 && endExclusive - start >= min) {
      runs.push({ start: start + 1, end: endExclusive, lines: lines.slice(start, endExclusive) });
    }
    start = -1;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    let isComment = false;
    if (inBlock) { isComment = true; if (t.includes('*/')) inBlock = false; }
    else if (t.startsWith('//')) isComment = true;
    else if (t.startsWith('/*') || t.startsWith('{/*')) { isComment = true; if (!t.includes('*/')) inBlock = true; }
    if (isComment) { if (start < 0) start = i; }
    else flush(i);
  }
  flush(lines.length);
  return runs;
}

/** Classify one comment line. Returns a reason string, or null for narrative. */
export function classifyLine(line) {
  for (const [re, kind] of EVIDENCE) if (re.test(line)) return kind;
  return null;
}

/* ------------------------------------------------------------ self-check */

function selfCheck() {
  const fail = [];
  const ok = (label, actual, expected) => {
    if (actual !== expected) fail.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  ok('dts citation is evidence',
    classifyLine(' * source: node_modules/@sitecore-content-sdk/react/types/components/Text.d.ts'), 'dts-citation');
  ok('braced GUID is evidence',
    classifyLine(' * resolver {2F5C334E-5615-423C-8281-9FC180191302}'), 'guid');
  ok('bare GUID is evidence',
    classifyLine(' * ds=562b191a-8911-48e0-9022-2a5956d913e2'), 'guid');
  ok('capture path is evidence',
    classifyLine(' * project-planning/captures/2026-08-09-showcase-grid-payload.json'), 'capture-path');
  ok('measured ratio is evidence', classifyLine(' * measures 6.04:1 in light'), 'measured-ratio');
  ok('pagination bound is evidence', classifyLine(' * failed at first: 25'), 'pagination-bound');
  ok('plain narrative is not evidence',
    classifyLine(' * The team lead decided to abandon the float approach.'), null);
  ok('a task id alone is not evidence', classifyLine(' * T060-T061, Tranche 19, C9'), null);
  ok('a POC line ref alone is not evidence', classifyLine(' * index.html l. 1605-1612 markup'), null);

  // Signal filtering — both directions on every filter, so a filter that has
  // silently started rejecting everything cannot report a clean retention run.
  ok('a real resolver GUID is signal',
    isRealSignal('guid', '{2F5C334E-5615-423C-8281-9FC180191302}'), true);
  ok('a real lowercase GUID is signal',
    isRealSignal('guid', '{562b191a-8911-48e0-9022-2a5956d913e2}'), true);
  ok('an all-ones fixture GUID is filtered',
    isRealSignal('guid', '{11111111-1111-1111-1111-111111111111}'), false);
  ok('an alpha fixture GUID is filtered',
    isRealSignal('guid', '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}'), false);
  ok('a repeated-prefix fixture GUID is filtered',
    isRealSignal('guid', '{33333333-0000-0000-0000-000000000001}'), false);
  ok('the 4.5:1 WCAG bar is filtered', isRealSignal('measured-ratio', '4.5:1'), false);
  ok('the 21:1 WCAG bar is filtered', isRealSignal('measured-ratio', '21:1'), false);
  ok('a measured 1.657:1 is signal', isRealSignal('measured-ratio', '1.657:1'), true);
  ok('a measured 15.6:1 is signal', isRealSignal('measured-ratio', '15.6:1'), true);
  ok('capture paths are never filtered',
    isRealSignal('capture-path', 'project-planning/captures/x.json'), true);
  ok('1:1 is filtered (prose, not contrast)', isRealSignal('measured-ratio', '1:1'), false);
  ok('1.23:1 is a real measurement', isRealSignal('measured-ratio', '1.23:1'), true);

  // A token containing a space must survive key round-tripping — `first: 10`
  // was silently truncated to `first:` by a split-on-every-space.
  {
    const key = 'pagination-bound first: 10';
    const gap = key.indexOf(' ');
    ok('a spaced token round-trips intact', key.slice(gap + 1), 'first: 10');
  }

  const runs = commentRuns(['/**', ...Array.from({ length: 14 }, (_, i) => ` * ${i}`), ' */', 'const a = 1;'].join('\n'), 12);
  ok('a 16-line block is one run', runs.length, 1);
  ok('the run reports its start line', runs[0]?.start, 1);
  ok('a short block is not a run', commentRuns('/**\n * x\n */\nconst a = 1;', 12).length, 0);

  if (fail.length) {
    console.error('SELF-CHECK FAILED — the classifier cannot be trusted:');
    for (const f of fail) console.error(`  - ${f}`);
    process.exit(2);
  }
}
selfCheck();

/* ------------------------------------------------------------------- run */

if (!TARGET) {
  console.error('Usage: node extract-comment-evidence.mjs --path <dir> [--json] [--verify <doc.md>] [--min N]');
  process.exit(2);
}
if (!existsSync(TARGET)) { console.error(`No such directory: ${TARGET}`); process.exit(2); }

const files = [];
const signalIndex = new Map(); // token -> Set(file)

for (const f of sourceFiles(TARGET)) {
  const src = readFileSync(f, 'utf8');
  if (isGenerated(src)) continue;
  const rel = relative(TARGET, f).split(sep).join('/');

  // ONLY tokens inside a comment wall are at risk: phase 2 strips comments,
  // never code. A GUID living in a test fixture or a token constant is not
  // "dropped evidence" — it was never going to move. Scanning the whole file
  // reported 22 phantom losses on one app, every one of them a code constant.
  const wallText = commentRuns(src, MIN_RUN).map((r) => r.lines.join('\n')).join('\n');
  for (const [re, kind] of SIGNAL) {
    for (const m of wallText.match(re) ?? []) {
      if (!isRealSignal(kind, m)) continue;
      const key = `${kind} ${m}`;
      if (!signalIndex.has(key)) signalIndex.set(key, new Set());
      signalIndex.get(key).add(rel);
    }
  }

  const runs = commentRuns(src);
  if (!runs.length) continue;
  const blocks = runs.map((r) => {
    const evidence = [], narrative = [];
    for (const line of r.lines) {
      const kind = classifyLine(line);
      if (kind) evidence.push({ line: line.trim(), kind });
      else if (line.trim().replace(/^[/*\s]+|[*/\s]+$/g, '')) narrative.push(line.trim());
    }
    return { start: r.start, end: r.end, total: r.lines.length, evidence, narrativeLines: narrative.length };
  });
  files.push({ file: rel, blocks });
}

if (VERIFY) {
  if (!existsSync(VERIFY)) { console.error(`No such doc: ${VERIFY}`); process.exit(2); }
  const doc = readFileSync(VERIFY, 'utf8');
  const missing = [], present = [];
  for (const [key, where] of signalIndex) {
    // Split on the FIRST space only — a token can itself contain one
    // (`first: 10`), and `key.split(' ')` silently truncated it to `first:`.
    const gap = key.indexOf(' ');
    const kind = key.slice(0, gap);
    const token = key.slice(gap + 1);
    // `.d.ts` citations are REQUIRED to stay in source (rule 40) — the doc is
    // not expected to carry them, so they are reported separately, never as a
    // retention failure against the doc.
    if (kind === 'dts-citation') continue;
    (doc.includes(token) ? present : missing).push({ kind, token, files: [...where] });
  }
  const dts = [...signalIndex].filter(([k]) => k.startsWith('dts-citation')).length;
  if (AS_JSON) {
    console.log(JSON.stringify({ verify: VERIFY, present: present.length, missing, dtsInSourceOnly: dts }, null, 2));
  } else {
    console.log(`\nEvidence retention — ${TARGET} vs ${VERIFY}`);
    console.log(`  ${present.length} present · ${missing.length} MISSING · ${dts} .d.ts citation(s) stay in source by rule 40\n`);
    for (const m of missing) console.log(`  [MISSING ${m.kind}] ${m.token}\n      ${m.files.slice(0, 3).join(', ')}`);
    if (!missing.length) console.log('  No dropped evidence.\n');
  }
  process.exit(missing.length ? 1 : 0);
}

const totalEvidence = files.reduce((a, f) => a + f.blocks.reduce((b, x) => b + x.evidence.length, 0), 0);
const totalNarrative = files.reduce((a, f) => a + f.blocks.reduce((b, x) => b + x.narrativeLines, 0), 0);

if (AS_JSON) {
  console.log(JSON.stringify({ path: TARGET, totalEvidence, totalNarrative, files }, null, 2));
  process.exit(0);
}

console.log(`\nComment-wall composition — ${TARGET}`);
console.log(`  ${files.length} file(s) with a wall ≥ ${MIN_RUN} lines · ${totalEvidence} evidence line(s) to KEEP · ${totalNarrative} narrative line(s) to move\n`);
for (const f of files) {
  const ev = f.blocks.reduce((a, b) => a + b.evidence.length, 0);
  if (!ev) continue;
  console.log(`  ${f.file}`);
  for (const b of f.blocks) {
    for (const e of b.evidence) console.log(`      L${b.start}  [${e.kind}] ${e.line.slice(0, 100)}`);
  }
}
console.log('\n  Every line above must still be present after the strip (rule 87 § Evidence stays in source).\n');
