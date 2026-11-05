#!/usr/bin/env node
/**
 * manifest-write.mjs — the ONLY sanctioned way to write a run manifest.
 *
 * WHY THIS EXISTS. Several agents write the same manifest during a run, and each
 * one used to do it by dumping a mutated copy of the whole file. That is a
 * wholesale clobber: whatever another agent added between your read and your
 * write is gone. Observed 2026-08-11 — one agent set `provisioning` by replacing
 * the object and **two of its three keys vanished** (`editing_host` and
 * `superseded_editing_host` erased, only `editing_host_freshness` survived). No
 * error, no diff anyone looked at; it surfaced only because someone re-read a
 * field they expected to still be there. The same shape silently truncates
 * `stage_history` and `operator_attention`, which are contractually append-only.
 *
 * So this helper does read → deep-merge → write, to BOTH `run-<id>.json` and
 * `current-run.json`, and verifies they end byte-identical (the mirror invariant
 * from `.agent/manifests/README.md` § "Artifact durability tiers").
 *
 * MERGE RULES (a patch describes a DELTA, never the whole file):
 *   object + object → merged key by key, recursively — untouched keys survive
 *   array  + array  → APPENDED — `stage_history` / `operator_attention` grow
 *   anything else   → replaced (scalars, null → object, object → null)
 *   --replace <dot.path> → replace wholesale at that path (the escape hatch for
 *                          a genuinely rewritten list, e.g. scope_dial.extra_stops)
 *
 * Usage (patch is JSON on stdin — see "Why stdin" below):
 *   node .agent/scripts/manifest-write.mjs --workflow <product>/project-planning/workflow <<'JSON'
 *   { "status": "tested",
 *     "stage_history": [ { "stage": "tested", "agent": "07-qa-specialist", "outcome": "completed",
 *                          "one_line": "…", "deliverables": [], "escalations": [], "error": null } ] }
 *   JSON
 *
 *   --workflow <dir>        the run's workflow/ directory (resolves both files)
 *   --manifest <file>       …or either file directly; its sibling is resolved
 *   --patch-file <file>     read the patch from a file instead of stdin — pass an ABSOLUTE
 *                           path; see "Never /tmp" below
 *   --allow-stale-patch     accept a --patch-file older than the staleness window (a replay
 *                           or a hand-written fixture is legitimately pre-staged)
 *   --replace <dot.path>    replace instead of merge/append at this path (repeatable)
 *   --verify                check the pair only; write nothing
 *   --dry-run               print the merged result + change log; write nothing
 *   --no-touch              do not refresh `updated_at`
 *   --force-mirror          resolve a real divergence by taking run-<id>.json as truth
 *   --json / --quiet
 *
 * Exit codes: 0 ok · 1 divergence, verify failure, or post-write mismatch · 2 usage.
 *
 * WHY STDIN JSON AND NOT `--set path=value`. Real manifest writes are nested
 * objects and whole array ELEMENTS — a `stage_history` entry, an
 * `operator_attention` entry, a `provisioning` block. `--set` can only carry a
 * scalar before it needs JSON in the value anyway, at which point it is stdin
 * with worse quoting: this repo drives scripts from both PowerShell and Git Bash,
 * and PowerShell parses a bare `{…}` argument as a script block. A heredoc is
 * quoting-neutral in both, and the patch reads in the transcript as the same
 * shape as the thing being written, so a reviewer can see the delta.
 *
 * NEVER `/tmp` — IT IS TWO DIRECTORIES. On Windows, Node resolves `/tmp` to `C:\tmp` (a
 * drive-root path on the current drive) and Git Bash resolves it to the MSYS mount,
 * `C:\Users\<you>\AppData\Local\Temp`. Neither is wrong; they simply never name the same
 * place. So a patch WRITTEN from Node to `/tmp/x.json` and READ back through a Bash redirect
 * (`… < /tmp/x.json`) reads a different file — absent (the shell fails) or, far worse, a
 * **stale** one left by an earlier Bash-side write of the same name. A stale patch is
 * non-empty and valid JSON, so every guard below passes it, and because arrays APPEND by
 * design the result is a plausible DUPLICATE `stage_history` entry, exit 0, and a cheerful
 * `append stage_history +1`. Measured twice in one run, 2026-09-26/27,
 * by two agents who each invented the pattern independently, neither having been told to.
 *
 * The rule: **a file written by one runtime and read by another must be named by an absolute
 * path both resolve identically** — the session scratchpad, never `/tmp`, never `/c/tmp`,
 * never a bare relative path. Two forms are safe, and both are cheaper than getting it right:
 *   1. a HEREDOC in the same shell invocation — no file, so no path to disagree about; or
 *   2. `--patch-file <ABSOLUTE path>`, which hands resolution to **Node**, the same runtime
 *      that wrote the file, so writer and reader agree by construction.
 * Prefer these over `< patch.json`. The empty/unparseable-stdin guards below are NOT the fix
 * for this — they already existed, and neither measured instance would have tripped them.
 *
 * STALENESS. A `--patch-file` is written moments before it is read, so one whose mtime
 * predates this process by more than `STALE_PATCH_SECONDS` is refused (exit 2) naming its
 * age — a left-over file from an earlier turn cannot merge silently. `--allow-stale-patch`
 * opts out, because a replay or a hand-written fixture is legitimately pre-staged. The window
 * is a JUDGEMENT, not a measurement: it covers a slow write-then-invoke pair and nothing
 * longer. (The proposal this came from said "older than the process start", which is
 * unimplementable — EVERY patch file predates the process that reads it.) On success the
 * patch's source and a short content hash print beside the merge log, so a wrong-file merge is
 * visible in the transcript when it happens rather than on a lucky re-read afterwards.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolveLogical } from './resolve-products-root.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const argv = process.argv.slice(2);

// --init seeds the pair from the template when `workflow/` is empty. Without it, the script
// documented as "the ONLY sanctioned way to write a run manifest" could not perform the FIRST
// write — so every run hand-seeded it, which is the one moment the sanctioned path did not
// exist. Four separate runs reported this. Read-merge-write is unchanged for every later
// call; --init only ever CREATES, and refuses if a manifest is already there.
const INIT = argv.includes('--init');
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const argAll = (n) => argv.reduce((acc, a, i) => (a === `--${n}` && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const flag = (n) => argv.includes(`--${n}`);
/** A --patch-file older than this (relative to process start) is refused — see the header,
 *  "STALENESS". A judgement, not a measurement: wide enough for a slow write-then-invoke
 *  pair, far short of the cross-stage gap that produced the measured duplicate. */
const STALE_PATCH_SECONDS = 300;
const PROCESS_START_MS = Date.now() - Math.round(process.uptime() * 1000);

const AS_JSON = flag('json');
const QUIET = flag('quiet');
const VERIFY_ONLY = flag('verify');
const DRY_RUN = flag('dry-run');
const NO_TOUCH = flag('no-touch');
const FORCE_MIRROR = flag('force-mirror');
const REPLACE = new Set(argAll('replace'));

const say = (s) => { if (!QUIET && !AS_JSON) console.log(s); };
const die = (code, ...lines) => {
  if (AS_JSON) console.log(JSON.stringify({ status: code === 0 ? 'ok' : 'error', message: lines.join('\n') }, null, 2));
  else for (const l of lines) console.error(l);
  process.exit(code);
};

// Canonical on-disk form. Both files are written from ONE buffer, so
// "byte-identical" is guaranteed by construction, then re-asserted after write.
const serialize = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
// Strip the BOM: PowerShell's `>` / Out-File writes UTF-8 WITH BOM by default, and
// JSON.parse rejects it. Real manifests on disk carry one (one product's
// run-20260528T101200Z.json does), so without this the sanctioned writer cannot
// read the very files it is the only sanctioned way to write.
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch (e) { die(1, `Unparseable manifest ${p}: ${e.message}`); } };

// ── locate the pair ─────────────────────────────────────────────────────────
function resolvePair() {
  const wf = arg('workflow', null);
  const mf = arg('manifest', null);
  if (!wf && !mf) die(2, 'Usage: manifest-write.mjs --workflow <workflow-dir> | --manifest <file>  [flags]',
                      '  Patch: a heredoc on stdin, or --patch-file <ABSOLUTE path>. Never `< /tmp/x.json` — see the header.');
  // Callers pass the LOGICAL path (`products/<group>/<slug>/project-planning/workflow`)
  // because that is what the manifest itself stores. `products/` is a mount point
  // (product-workspace.md § 1a), so resolve it here rather than requiring every caller
  // to — this is the one script every stage writes through.
  const dir = resolveLogical(wf || dirname(mf));
  if (!existsSync(dir)) die(2, `No such workflow directory: ${dir}`);

  const currentPath = join(dir, 'current-run.json');
  let runPath = null;

  if (mf && /^run-.+\.json$/i.test(basename(mf))) runPath = resolveLogical(mf);
  if (!runPath && existsSync(currentPath)) {
    const id = readJson(currentPath).run_id;
    if (id && existsSync(join(dir, `run-${id}.json`))) runPath = join(dir, `run-${id}.json`);
  }
  if (!runPath) {
    // Fall back to newest run-*.json (timestamped ids sort lexically).
    const runs = readdirSync(dir).filter((f) => /^run-.+\.json$/i.test(f)).sort();
    if (runs.length) runPath = join(dir, runs[runs.length - 1]);
  }
  // The FIRST write. Without this branch the script documented as "the ONLY sanctioned way to
  // write a run manifest" cannot perform the first one, so every run hand-seeds the pair — the
  // single moment the sanctioned path does not exist. The flag was added 2026-08-26 and left
  // INERT: `const INIT = argv.includes('--init')` was its only occurrence, and control flow died
  // here before it could apply. Three more runs hand-seeded before anyone RAN it (rule `88`:
  // the cheapest counter-move is to run the thing). Wired 2026-08-27.
  // --init on a workflow that ALREADY has a manifest is a caller mistake worth surfacing: it
  // means a second run is about to seed over a live one, or a stage re-ran its first write. The
  // flag's own comment always claimed it "refuses if a manifest is already there" — it did not.
  // It fell through to an ordinary merge, so the guard was a comment asserting a safety the code
  // lacked. Found by running the clobber case rather than reading the branch.
  // --init seeds a NEW RUN's pair. The clobber it must refuse is `run-<id>.json` already
  // existing — not "any manifest is present in the directory".
  //
  // It refused the latter until 2026-09-02, which meant --init only ever worked for a
  // product's VERY FIRST run: a workflow dir accumulates run-<id>.json files, so from the
  // second run onward the guard fired. And the fallback was worse than useless — without
  // --init, runPath resolves from current-run.json's run_id, so a second run's first write
  // MERGES ITSELF INTO THE PREVIOUS RUN'S FILE. The script documented as "the ONLY
  // sanctioned way to write a run manifest" therefore could not start a second run at all,
  // which is exactly why one product's six runs were hand-seeded — the anti-pattern the
  // comment three lines up was added to stop. Found by running it (rule `88`), on the first
  // dogfood run after the contract was tightened.
  //
  // Seeding a new run legitimately REPLACES current-run.json: "current" means the run in
  // flight, and starting a new one is what makes it current. Only the immutable per-run file
  // is protected.
  if (INIT) {
    const raw = arg('run-id', null);
    if (!raw) die(2, '--init needs --run-id <id> to name the immutable run-<id>.json. The id is the BARE timestamp — the `run-` prefix belongs to the filename.');
    // `run_id` is documented as `<timestamp>` and the FILE is `run-<timestamp>.json`, so an id that
    // already carries the prefix produced `run-run-<id>.json`. Worse than cosmetic: the lookup at
    // "resolve runPath from current-run.json" rebuilds the name as `run-${current.run_id}.json`, so
    // a prefixed field and a doubled filename never agree and the pair resolution falls through to
    // latest-by-name. Normalised ONCE here, for both the filename and the field, so they cannot
    // disagree. Found 2026-09-04 by a real run.
    const id = raw.replace(/^run-/i, '');
    if (id !== raw && !QUIET) console.error(`note: --run-id "${raw}" normalised to "${id}" — the \`run-\` prefix is the filename's, not the id's.`);
    if (!id) die(2, `--init: --run-id "${raw}" is empty once the \`run-\` prefix is removed.`);
    const target = join(dir, `run-${id}.json`);
    if (existsSync(target)) {
      die(2, `--init refuses to seed ${dir}: run-${id}.json already exists.`,
          '  That run id is already seeded. Every write after the first is an ordinary merge —',
          '  drop --init and pipe the patch.');
    }
    return { dir, runPath: target, currentPath, seeding: true };
  }
  if (!runPath && !existsSync(currentPath)) {
    die(2, `No manifest found in ${dir} (looked for run-*.json and current-run.json).`,
        '',
        '  If this is the FIRST write of a new run, seed the pair through this script rather than',
        '  by hand — hand-seeding is how a run ends up with a manifest no schema ever checked:',
        '',
        `    node .agent/scripts/manifest-write.mjs --workflow ${arg('workflow', '<dir>')} \\`,
        '      --init --run-id <id> --patch-file <ABSOLUTE path>   # or a heredoc on stdin');
  }
  if (!runPath) {
    // Only current-run.json exists — derive the immutable name from its run_id.
    const id = readJson(currentPath).run_id;
    if (!id) die(1, `${currentPath} has no run_id, so its run-<id>.json counterpart cannot be named. Fix the manifest first.`);
    runPath = join(dir, `run-${id}.json`);
  }
  return { dir, runPath, currentPath };
}

// ── divergence ──────────────────────────────────────────────────────────────
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function inspectPair({ runPath, currentPath, seeding = false }) {
  const runExists = existsSync(runPath);
  const curExists = existsSync(currentPath);
  // --init: the pair is SUPPOSED to be absent. Seed from the template so the first manifest has
  // the same shape every later reader expects, and let the normal merge apply the patch on top —
  // seeding is not a separate write path, only a different base.
  if (seeding) {
    // Only the immutable per-run file is protected. `current-run.json` belonging to the
    // PREVIOUS run is the normal state when a new run starts, and it is replaced by design —
    // see the --init note in resolveTarget.
    if (runExists) {
      die(2, `--init refuses to overwrite an existing manifest (${runPath}).`,
          '  Drop --init and pipe the patch normally; every write after the first is a merge.');
    }
    const tpl = join(REPO_ROOT, '.agent', 'manifests', 'run-manifest.template.json');
    if (!existsSync(tpl)) die(1, `--init needs the manifest template, which is missing: ${tpl}`);
    return { state: 'seeded', base: readJson(tpl) };
  }
  if (!runExists && !curExists) die(2, `Neither ${runPath} nor ${currentPath} exists.`);
  if (!runExists) return { state: 'missing-run', base: readJson(currentPath) };
  if (!curExists) return { state: 'missing-current', base: readJson(runPath) };

  const a = readFileSync(runPath);
  const b = readFileSync(currentPath);
  if (a.equals(b)) return { state: 'identical', base: readJson(runPath) };

  const ja = readJson(runPath);
  const jb = readJson(currentPath);
  if (deepEqual(ja, jb)) return { state: 'format-drift', base: ja };

  const keys = [...new Set([...Object.keys(ja), ...Object.keys(jb)])].filter((k) => !deepEqual(ja[k], jb[k]));
  return { state: 'diverged', base: ja, divergentKeys: keys };
}

// ── merge ───────────────────────────────────────────────────────────────────
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// An array and an object are different CONTAINERS, and swapping one for the other
// throws the contents away. Before this guard the array/object case fell through to
// the ordinary `set` below: a patch of `{"stage_history": {"40": {...}}}` — the shape
// you reach for to edit one entry — replaced a 47-entry array with a two-key object,
// logged a cheerful `set`, printed ✓ and exited 0. 56 KB of run history, gone silently
// (measured 2026-09-25). Say so and refuse; `--replace <path>`
// is the way to mean it. A scalar (incl. `null`) over a container is left alone — that
// is how a field gets cleared.
function guardContainerKind(base, patch, path) {
  const kind = (v) => (Array.isArray(v) ? 'array' : isPlainObject(v) ? 'object' : null);
  const a = kind(base);
  const b = kind(patch);
  if (a && b && a !== b) {
    die(1, `Refusing to write: patch would replace the ${a} at "${path || '<root>'}" with an ${b}.`,
      `  An array and an object are different containers — merging them discards the ${a}'s contents.`,
      `  To edit one entry of an array, read it, change it, and send the WHOLE array back with`,
      `  --replace ${path || '<path>'}. To mean the swap, pass --replace ${path || '<path>'}.`);
  }
}

function merge(base, patch, path, log) {
  if (REPLACE.has(path)) { log.push(`replace  ${path}`); return clone(patch); }
  guardContainerKind(base, patch, path);
  if (Array.isArray(base) && Array.isArray(patch)) {
    log.push(`append   ${path}  +${patch.length} (was ${base.length})`);
    return [...clone(base), ...clone(patch)];
  }
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out = { ...base };
    for (const k of Object.keys(patch)) {
      const p = path ? `${path}.${k}` : k;
      if (k in base) out[k] = merge(base[k], patch[k], p, log);
      else { log.push(`add      ${p}`); out[k] = clone(patch[k]); }
    }
    return out;
  }
  log.push(`set      ${path}`);
  return clone(patch);
}

// ── advisory lock ───────────────────────────────────────────────────────────
// Read-modify-write has a race window when two agents land together. This is a
// short advisory lock, not a transaction: it serializes the merge, breaks a
// stale lock after 15s (a crashed agent must not wedge the run), and never
// blocks longer than that.
function withLock(dir, fn) {
  const lock = join(dir, '.manifest-write.lock');
  const deadline = Date.now() + 15000;
  let fd = null;
  while (fd === null) {
    try { fd = openSync(lock, 'wx'); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = Infinity;
      try { age = Date.now() - statSync(lock).mtimeMs; } catch { /* vanished — retry */ }
      if (age > 15000) { try { unlinkSync(lock); } catch { /* someone else won the break */ } continue; }
      if (Date.now() > deadline) die(1, `Could not acquire ${lock} within 15s — another manifest write is in flight or wedged.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);   // 50ms sleep, no deps
    }
  }
  try { return fn(); } finally { closeSync(fd); try { unlinkSync(lock); } catch { /* already gone */ } }
}

// ── run ─────────────────────────────────────────────────────────────────────
const pair = resolvePair();
const seen = inspectPair(pair);

if (VERIFY_ONLY) {
  const ok = seen.state === 'identical';
  if (AS_JSON) console.log(JSON.stringify({ status: ok ? 'ok' : seen.state, run: pair.runPath, current: pair.currentPath, divergentKeys: seen.divergentKeys ?? [] }, null, 2));
  else if (ok) say(`✓ manifest pair in sync — ${pair.runPath}`);
  else console.error(`✖ manifest pair NOT in sync (${seen.state}${seen.divergentKeys ? `: ${seen.divergentKeys.join(', ')}` : ''}) — ${pair.runPath}`);
  process.exit(ok ? 0 : 1);
}

if (seen.state === 'diverged' && !FORCE_MIRROR) {
  die(1,
      '✖ MANIFEST DIVERGENCE — run-<id>.json and current-run.json hold different content.',
      `    ${pair.runPath}`,
      `    ${pair.currentPath}`,
      `  Differing top-level key(s): ${seen.divergentKeys.join(', ')}`,
      '',
      '  These two must be byte-identical (.agent/manifests/README.md § Artifact durability',
      '  tiers). Someone wrote one without the other, so one of them is missing real work.',
      '  Diff them, fold anything worth keeping into run-<id>.json (it is the TRACKED copy),',
      '  then re-run. To accept run-<id>.json as truth and overwrite the mirror: --force-mirror');
}

// read the patch
let patchRaw = '';
const patchFile = arg('patch-file', null);
let patchSource = 'stdin';
if (patchFile) {
  patchSource = patchFile;
  // A patch file is written moments before it is read. One that predates this process by more
  // than the window is a LEFT-OVER, and the measured way to acquire one is to write it from Node
  // to `/tmp` and read it back through a Bash redirect — two different directories on Windows,
  // so the shell hands over an older file of the same name. That file is non-empty and valid
  // JSON, so every guard below passes it, and arrays APPEND by design: the result is a plausible
  // duplicate `stage_history` entry at exit 0. See the header, "NEVER /tmp".
  let st;
  try { st = statSync(patchFile); }
  catch (e) { die(2, `--patch-file cannot be read: ${patchFile}`, `  ${e.message}`,
                   '  Pass an ABSOLUTE path. `/tmp` is NOT one: Node reads it under the drive root and Git Bash',
                   '  under the user temp dir, so a file written by one is invisible to the other.'); }
  const ageSec = Math.round((PROCESS_START_MS - st.mtimeMs) / 1000);
  if (ageSec > STALE_PATCH_SECONDS && !flag('allow-stale-patch')) {
    die(2, `✖ STALE PATCH FILE — written ${ageSec}s before this run started (limit ${STALE_PATCH_SECONDS}s).`,
        `    ${patchFile}`,
        `    mtime ${new Date(st.mtimeMs).toISOString()}`,
        '',
        '  A patch is written immediately before it is read, so this one is probably not the patch',
        '  you just wrote. The usual cause is a cross-runtime path: Node writes /tmp/x.json to',
        '  the drive root while Git Bash reads it under the user temp dir — a DIFFERENT, older file',
        '  that is still valid JSON, so nothing else here can tell. Re-write it to an absolute',
        '  path both runtimes resolve identically (the session scratchpad), or use a heredoc.',
        '',
        '  If the file really is meant to be pre-staged (a replay, a fixture): --allow-stale-patch');
  }
  patchRaw = readFileSync(patchFile, 'utf8');
} else if (!process.stdin.isTTY) patchRaw = readFileSync(0, 'utf8');
if (!patchRaw.trim()) die(2, 'No patch given. Pipe a JSON object on stdin (a heredoc), or pass --patch-file <ABSOLUTE path>. (Use --verify to only check the pair.)');
let patch;
try { patch = JSON.parse(patchRaw); } catch (e) { die(2, `Patch is not valid JSON: ${e.message}`); }
if (!isPlainObject(patch)) die(2, 'Patch must be a JSON object describing a delta (not an array or scalar).');

const log = [];
const merged = merge(seen.base, patch, '', log);
if (!NO_TOUCH && !('updated_at' in patch)) merged.updated_at = new Date().toISOString();

// A seeded manifest must never carry the template's `<placeholder>` strings as if they were data.
// `"product_slug": "<product-slug>"` parses, validates, and reads as a real value to every
// downstream consumer — the same "unfilled vs chosen" confusion the dial filter records `null` to
// avoid. Null them and NAME them, so the first write says what it does not know.
const unfilled = [];
if (seen.state === 'seeded') {
  // Three placeholder DIALECTS live in the template, and the first pass only recognised one.
  //   1. <angle>            — "<product-slug>"
  //   2. enum|pipe|lists    — "interactive|relayed|unattended", "light|standard|thorough"
  //   3. paths carrying <>  — "products/<product-slug>/project-planning/specs/prd-NNN.md"
  // 2 and 3 are the dangerous ones: they PARSE, they validate, and they read as data. A run that
  // crashed between --init and its first patch left `product_root` resolving to a literal
  // "<product-slug>" directory — and `discovery_mode: "interactive|relayed|unattended"` defeated
  // the very guard that field exists for, since the contradiction check tests for the exact string
  // "unattended". Measured by two verification runs, 2026-08-27.
  const isPlaceholder = (v) => {
    if (typeof v !== 'string') return false;
    if (/<[^>]+>/.test(v)) return true;                       // 1 and 3
    // 2 — an enum list. The first version anchored the WHOLE string, so a list with prose glued
    // on escaped it: `implementation.git_remote` seeded as
    //   "url|local|create — operator-chosen remote strategy asked upfront at create-prd sec 10a: …"
    // and survived as a 300-character sentence that parses, validates and reads as data — the
    // exact failure the stripper exists to prevent, one dialect over, in the field `/ship` reads
    // to decide whether to push. Match the enum at the START and let anything follow it.
    if (/^[a-z0-9_.-]+(\|[a-z0-9_.-]+){1,}(\s|$)/i.test(v)) return true;
    return false;
  };
  const hasPlaceholder = (v) => isPlaceholder(v)
    || (Array.isArray(v) && v.some(hasPlaceholder))
    || (isPlainObject(v) && Object.values(v).some(hasPlaceholder));
  const strip = (node, trail) => {
    for (const [k, v] of Object.entries(node)) {
      const at = trail ? `${trail}.${k}` : k;
      // A `//`-prefixed key is DOCUMENTATION, not data — the template's own guidance for whoever
      // opens the manifest next. Stripping placeholders out of it deletes the explanation while
      // leaving the key, which is worse than either extreme. The first version ate 2 of the 3
      // lines in `// two-level identity` because they legitimately contain `<project-slug>`.
      if (k.startsWith('//')) continue;
      // A placeholder KEY documents the shape of a dynamic map (`smoke_outcomes.<task-id>`), not
      // an entry. Seeded, it becomes a smoke outcome for a task literally named
      // "<task-id-or-step-label>". Delete the key, keep the map.
      if (isPlaceholder(k)) { delete node[k]; unfilled.push(`${at} (key template dropped)`); continue; }
      if (isPlaceholder(v)) { node[k] = null; unfilled.push(at); }
      // The template documents ARRAY shape with one fake element (a `stage_history` entry, an
      // `intake.source`). Seeded verbatim, that fake reads as a real record — worse than an empty
      // array, because a consumer counting stage_history would find one stage that never ran.
      // Drop the examples and keep the array. (The first pass only walked objects, so these
      // survived and the test caught five of them.)
      else if (Array.isArray(v)) {
        const kept = v.filter((el) => !hasPlaceholder(el));
        if (kept.length !== v.length) { node[k] = kept; unfilled.push(`${at}[] (example entries dropped)`); }
        kept.forEach((el, i) => { if (isPlainObject(el)) strip(el, `${at}[${i}]`); });
      } else if (isPlainObject(v)) strip(v, at);
    }
  };
  strip(merged, '');
  // --run-id names the FILE; it must also fill the FIELD, or run-<id>.json and its own run_id
  // disagree and resolvePair() can never find the pair again. Caught by running it, not reading it.
  if (!merged.run_id) {
    // Normalised identically to the filename above — a prefixed field with an unprefixed file is
    // exactly the disagreement this block's own comment warns about.
    merged.run_id = (arg('run-id', null) ?? '').replace(/^run-/i, '') || null;
    const i = unfilled.indexOf('run_id');
    if (i >= 0) unfilled.splice(i, 1);
  }
  if (!merged.created_at) merged.created_at = new Date().toISOString();
  if (!merged.run_id) die(1, '--init produced a manifest with no run_id. Pass it in the patch or via --run-id.');
  if (basename(pair.runPath) !== `run-${merged.run_id}.json`) {
    die(1, `--init: the patch's run_id (${merged.run_id}) does not match --run-id (${arg('run-id', '?')}).`,
        '  The filename and the field must agree, or the pair becomes unfindable.');
  }
}

// Provenance: which patch produced this write. It does not PREVENT a wrong-file merge — nothing
// can, since any patch is content the script has never seen — but it puts the source and a
// content hash in the transcript at the moment of the write, instead of leaving a stale merge
// to be discovered by a lucky re-read.
const patchSha8 = createHash('sha256').update(patchRaw).digest('hex').slice(0, 8);

const bytes = serialize(merged);

if (DRY_RUN) {
  if (AS_JSON) console.log(JSON.stringify({ status: 'dry-run', pairState: seen.state, changes: log, merged }, null, 2));
  else {
    say(`--dry-run — nothing written. Pair state: ${seen.state}`);
    for (const l of log) say(`  ${l}`);
  }
  process.exit(0);
}

withLock(pair.dir, () => {
  writeFileSync(pair.runPath, bytes);
  writeFileSync(pair.currentPath, bytes);
});

// Re-read and assert the invariant the whole helper exists to hold.
const back = [readFileSync(pair.runPath), readFileSync(pair.currentPath)];
if (!back[0].equals(back[1])) {
  die(1, '✖ POST-WRITE MISMATCH — the two manifests are not byte-identical after writing.',
      `    ${pair.runPath}`, `    ${pair.currentPath}`,
      '  Something wrote between our two writes. Re-run and check for a concurrent agent.');
}

const result = {
  status: 'ok',
  run: pair.runPath,
  current: pair.currentPath,
  pairStateBefore: seen.state,
  changes: log,
  patchSource,
  patchSha: patchSha8,
  bytes: bytes.length,
  ...(seen.state === 'seeded' ? { seeded: true, unfilled } : {}),
};
if (seen.state === 'seeded' && unfilled.length) {
  say(`  seeded from template — ${unfilled.length} field(s) left null (not yet known):`);
  for (const u of unfilled.slice(0, 12)) say(`    ${u}`);
  if (unfilled.length > 12) say(`    …and ${unfilled.length - 12} more`);
}
if (AS_JSON) console.log(JSON.stringify(result, null, 2));
else {
  if (seen.state === 'format-drift') say('  (healed formatting drift between the pair)');
  if (seen.state === 'missing-current') say('  (created the current-run.json mirror)');
  if (seen.state === 'missing-run') say(`  (created ${basename(pair.runPath)} from the mirror)`);
  if (seen.state === 'diverged') say('  (--force-mirror: overwrote current-run.json from run-<id>.json)');
  for (const l of log) say(`  ${l}`);
  say(`  patch    ${patchSource}  sha256:${patchSha8}`);
  say(`✓ wrote both manifests (${bytes.length} bytes) — ${pair.runPath}`);
}
