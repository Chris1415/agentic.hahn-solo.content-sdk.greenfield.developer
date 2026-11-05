#!/usr/bin/env node
/**
 * assert-manifest-pointers.mjs — a stage did the work; did it leave the POINTER?
 *
 *   node .agent/scripts/assert-manifest-pointers.mjs --workflow <dir> --stage <stage>
 *   node .agent/scripts/assert-manifest-pointers.mjs --workflow <dir> --all
 *
 * WHY THIS EXISTS (a prior run, 2026-08-27).
 *
 * Four separate times in one run, a stage produced its artifact correctly and then
 * failed to record where it went. Every one was silent, and each would have starved
 * the NEXT stage rather than the one that made the mistake:
 *
 *   the UI design pointer was written under `canonical_artifacts.ui_design`
 *         — a slot that does not exist. `ui_design` is a TOP-LEVEL manifest key.
 *   `canonical_artifacts.task_breakdown` was left null after the task
 *         breakdown was written. `/implement` loads exactly two things, and that
 *         is one of them: the Developer would have received no plan at all.
 *   four stages closed without appending their `stage_history` entry, so the
 *         run's own record of what happened had holes in it.
 *   `operator_attention[]` entries marked resolved carried no reference to
 *         what resolved them.
 *
 * None of these fails a build, a test, or the framework validator: the artifact is
 * on disk and the manifest is valid JSON. The only thing wrong is that nothing
 * points at it. That is rule 88's shape — a thing exists and nothing uses it — so
 * the counter-move is a gate that reads the pointer rather than the artifact.
 *
 * WHAT 2026-09-02 ADDED (16 Content SDK manifests, Aug 4 – Sep 2, read end to end).
 *
 * The gate existed and was cited by nine commands, and the contract still drifted,
 * because the gate held three of the contract's ten fields and no vocabulary at all:
 *
 *   history-shape       now covers all ten fields — four ERROR, five WARN (ratchet)
 *   history-stage       65 distinct stage names against 13 canonical; command-shaped
 *                       spellings (`implement`, `ship`) ERROR, unprescribed ones WARN
 *   history-outcome     11 of 16 runs carried an illegal `outcome`, most of them
 *                       because 02-create-prd.md PRESCRIBED one the enum forbade
 *   retired-field       `platform_target` written beside `packs` eight days after
 *                       its retirement, on three runs, with nothing looking
 *   attention-shape     the template declares one shape; six were in use
 *   gate-record         this script's own exit code, recorded rather than claimed —
 *                       a bug shipped 2026-09-02 through a /ship where it exits 1
 *
 * Also fixed here: the check tested `e.reference`, while the template declares
 * `references`. A correctly-formed entry was reported as unreferenced — the check
 * disagreed with the schema it was enforcing.
 *
 * Read-only. No network. Exit 1 on any ERROR, 0 otherwise.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/** Slots the manifest template actually defines, read from the template itself. */
function templateSlots() {
  const t = JSON.parse(stripBom(readFileSync(join(REPO, '.agent/manifests/run-manifest.template.json'), 'utf8')));
  return { canonical: new Set(Object.keys(t.canonical_artifacts ?? {})), top: new Set(Object.keys(t)) };
}

/**
 * A manifest may be UTF-8-with-BOM — PowerShell writes one by default and 26 of 93
 * manifests on disk carry one. A plain JSON.parse rejects those outright, so a
 * reader that skips this silently ignores a quarter of the portfolio.
 */
const stripBom = (s) => s.replace(/^﻿/, '');

/**
 * What each stage must have recorded by the time it closes.
 * `artifacts` are `canonical_artifacts.*` keys; `top` are dotted top-level paths.
 */
export const STAGE_CONTRACT = {
  'create-prd':      { artifacts: ['prd', 'prd_minimal', 'status_index'], history: ['discovery', 'spec_ready'] },
  // The two LIGHTER intake weights. Added 2026-09-02: they had no contract here and neither
  // command's Validation block cited this script, so the whole gate was wired into the minority
  // path — of 57 typed manifests on disk, 30 are FRD and 14 are bug against 13 PRD. An FRD or bug
  // therefore closed its intake with nothing checking that its spec pointers were recorded, which
  // is the exact starvation defect (`/implement` handed no plan) exists to prevent.
  // `status_index` is required on the FRD (step 1 refreshes STATUS.md) but not on a bug, whose
  // contract does not own that refresh. `promoted` is accepted for a bug because the
  // not-contained valve legitimately closes intake by promoting instead of writing a spec.
  'create-frd':      { artifacts: ['prd', 'prd_minimal', 'status_index'], history: ['spec_ready'] },
  'create-bug':      { artifacts: ['prd', 'prd_minimal'], history: ['spec_ready', 'promoted'] },
  'challenge-prd':   { artifacts: ['prd', 'prd_minimal'], history: ['spec_ready'] },
  'architect':       { artifacts: [], history: ['architecture_ready'] },
  'design':          { artifacts: [], top: ['ui_design.selected_poc_path'], history: ['ui_ready'] },
  'task-breakdown':  { artifacts: ['task_breakdown'], history: ['plan_ready', 'qa_ready'] },
  'implement':       { artifacts: ['task_breakdown'], history: ['implemented', 'implementation_in_progress'] },
  'code-review':     { artifacts: [], history: ['code_reviewed'] },
  'test':            { artifacts: [], history: ['tested'] },
  'ship':            { artifacts: ['ship_report', 'status_index'], history: ['shipped'] },
};

/**
 * Slot names older manifests used for artifacts that now have canonical slots.
 * Add an entry only for a spelling actually observed on disk — this map exists to
 * describe history, not to license new variants.
 */
export const LEGACY_SLOT_ALIASES = {
  code_review: 'code_review_report',
  test_results: 'test_report',
  ui_design: 'ui_design (top-level manifest key, not a canonical_artifacts slot)',
};

/**
 * Every `stage_history.stage` name the framework prescribes, core + packs.
 *
 * MEASURED 2026-09-02 across 16 Content SDK runs: 65 DISTINCT names against the 13
 * the README table then carried. Two different defects hid in that number, and only
 * the first is agent drift:
 *
 *  1. Format drift on names that DO exist — `implement`/`implemented`,
 *     `code-review`/`code_reviewed`, `test`/`tested`, `ship`/`shipped`. Unambiguous
 *     bugs, so STAGE_ALIASES below makes them an ERROR that names the right spelling.
 *  2. Names nothing prescribed. `provisioned`, `components_discovered`,
 *     `content_authored`, `merged`, `probe` and `implementation_in_progress` appeared
 *     in run after run while NO file under `.agent/` told anyone to write them —
 *     `publish.md`, `ship-close-out.md` and `test-content.md` name theirs, and the
 *     other pack stages simply did not. The runs were not being sloppy; they were
 *     filling a hole. Those stages now prescribe their name, and it is listed here.
 *
 * Adding a name means prescribing it at the stage that writes it. A name that only
 * lives in this set is the orphaned-declaration shape rule 88 exists to catch.
 */
export const CANONICAL_STAGES = new Set([
  // intake + spec
  'discovery', 'discovery_summary', 'spec_ready', 'spec_challenged', 'promoted',
  // architecture + design
  'architecture_ready', 'adr_density_check', 'baseline_promoted', 'ui_ready',
  // plan + build
  'plan_ready', 'qa_ready', 'probe', 'implementation_in_progress', 'implemented',
  'code_reviewed', 'tested',
  // close
  'documented', 'doc_audit', 'tiering_verified', 'tiering_backfilled', 'shipped', 'merged',
  // orchestration
  'resumed',
  // platform:content-sdk pack stages
  'provisioned', 'content_sdk_closeout', 'components_discovered', 'content_authored',
  'content_tested', 'published',
  // method:clone pack stages
  'source_ready',
]);

/** Command-shaped or drifted spellings of a canonical stage. ERROR — the name exists. */
export const STAGE_ALIASES = {
  'create-prd': 'spec_ready', 'create-frd': 'spec_ready', 'create-bug': 'spec_ready',
  'challenge-prd': 'spec_challenged',
  architect: 'architecture_ready', architected: 'architecture_ready',
  design: 'ui_ready',
  'task-breakdown': 'plan_ready',
  implement: 'implemented',
  'code-review': 'code_reviewed',
  test: 'tested',
  document: 'documented',
  ship: 'shipped',
  provisioning: 'provisioned', 'provision-sitecoreai': 'provisioned',
  'discover-components': 'components_discovered',
  'author-content': 'content_authored',
  'test-content': 'content_tested',
  publish: 'published',
};

/** `manifests/README.md` § "Stage history" — the only legal `outcome` values. */
export const LEGAL_OUTCOMES = new Set(['completed', 'failed', 'skipped', 'superseded', 'partial']);

/**
 * Illegal outcomes observed on disk, mapped to what they meant.
 *
 * `confirmed` / `confirmed_with_changes` are the load-bearing pair: they were not
 * invented by any agent, they were PRESCRIBED by 02-create-prd.md for the
 * `discovery_summary` entry while the README enum never contained them. Two
 * framework contracts disagreed and every PRD run followed the wrong one — 11 of 16
 * runs carried an illegal outcome, and this was the most common cause.
 */
export const OUTCOME_ALIASES = {
  confirmed: 'completed', confirmed_with_changes: 'completed',
  blocked: 'failed', paused: 'partial', in_progress: 'partial',
  done: 'completed', bundled: 'completed', closed_soft: 'completed',
  completed_with_caveats: 'partial', 'pass-with-carried-items': 'partial',
};

/**
 * `stage_history` entry fields, split by how hard the gate holds them.
 *
 * ERROR on the four that carry meaning no other field can recover; WARN on the five
 * that are recoverable or merely forensic. This is a RATCHET, not a final position —
 * a flat ERROR on all ten would fail every manifest written before 2026-09-02 and a
 * gate that fails everything is a gate that gets skipped.
 */
const HISTORY_FIELDS_ERROR = ['stage', 'agent', 'outcome', 'one_line'];
const HISTORY_FIELDS_WARN = ['entered_at', 'exited_at', 'deliverables', 'escalations', 'error'];

/** `operator_attention[]` keys the manifest template declares. */
const ATTENTION_REQUIRED = ['stage', 'severity', 'item'];
const ATTENTION_KNOWN = new Set([
  ...ATTENTION_REQUIRED, 'kind', 'raised_at', 'resolved_at', 'references', 'resolution',
]);

const dig = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/**
 * Resolve a repo-relative `products/...` path through the products mount.
 *
 * `products/` is a logical mount point, so a plain `join(REPO, p)` is wrong
 * whenever the root is configured elsewhere — and here it is: the repo is
 * `…/project` while products live at `…/products`, a sibling. A first draft
 * imported a function name that does not exist (`resolveLogicalPath`; the real
 * export is `resolveLogical`), the `catch` swallowed it, and every pointer was
 * then checked against a path that could never exist — reporting SEVEN dangling
 * pointers for files that were all present. A silent fallback in a checker turns
 * it into a fabricator, so this one throws instead.
 */
let _resolver;
async function toDisk(p) {
  if (!p) return null;
  _resolver ??= await import('./resolve-products-root.mjs');
  if (typeof _resolver.resolveLogical !== 'function') {
    throw new Error('resolve-products-root.mjs exposes no resolveLogical() — refusing to guess product paths');
  }
  const r = _resolver.resolveLogical(p, { repoRoot: REPO });
  const out = typeof r === 'string' ? r : r?.path ?? r?.abs;
  if (!out) throw new Error(`resolveLogical returned nothing for "${p}"`);
  return out;
}

/** " · products root: <path> (source: env|workspace.json|default)" — or '' if it cannot be read.
 *  Advisory only: a hint that cannot be produced must never turn a real finding into a crash. */
async function rootHint() {
  try {
    _resolver ??= await import('./resolve-products-root.mjs');
    const info = _resolver.resolveProductsRoot?.({ repoRoot: REPO });
    return info?.root ? ` · products root: ${info.root}${info.source ? ` (source: ${info.source})` : ''}` : '';
  } catch { return ''; }
}

export async function check(manifest, { stage, slots } = {}) {
  const findings = [];
  const add = (level, code, msg) => findings.push({ level, code, msg });
  const S = slots ?? templateSlots();

  // ── a pointer written into a slot that does not exist ────────────────
  for (const [k, v] of Object.entries(manifest.canonical_artifacts ?? {})) {
    if (S.canonical.has(k)) continue;

    // Older manifests spell some slots differently. The pointer is not LOST, it is
    // just non-standard — so this is a migration WARN, not a starvation ERROR.
    // Reported rather than silently accepted: two spellings for one artifact is
    // drift, and a reader looking for the canonical name still finds nothing.
    if (LEGACY_SLOT_ALIASES[k]) {
      add('WARN', 'legacy-slot-name',
        `canonical_artifacts.${k} is a legacy name for \`${LEGACY_SLOT_ALIASES[k]}\` — migrate it. ` +
        `A reader looking up the canonical slot finds nothing.`);
      continue;
    }

    const alt = S.top.has(k) ? ` — \`${k}\` is a TOP-LEVEL manifest key, not a canonical_artifacts slot` : '';
    // A NULL stub in an unknown slot points at nothing and starves nobody; it is
    // untidy, not broken. A POPULATED one hides a real artifact from every reader.
    add(v == null || v === '' ? 'WARN' : 'ERROR', 'unknown-slot',
      `canonical_artifacts.${k} is not a slot defined by run-manifest.template.json${alt}. ` +
      `A pointer in a non-existent slot is invisible to every reader.`);
  }

  // ── every non-null pointer must actually resolve on disk ───────────────────
  // Slots hold either a path or an ARRAY of paths (`adrs`), so flatten first —
  // a string-only check silently skips every array slot and reports clean.
  for (const [k, v] of Object.entries(manifest.canonical_artifacts ?? {})) {
    const paths = Array.isArray(v) ? v : [v];
    for (const [i, p] of paths.entries()) {
      if (typeof p !== 'string' || !p) continue;
      const label = Array.isArray(v) ? `${k}[${i}]` : k;
      const disk = await toDisk(p);
      if (disk && !existsSync(disk)) {
        // Name the ROOT it resolved against, and where that root came from. `products/` is a mount
        // point, so the single likeliest cause of a dangling pointer is a misconfigured or unset
        // root — and a message that only says "does not exist" sends the reader hunting for a
        // missing artifact that is sitting right there under a different mount
        // (measured 2026-09-04 on a scratch run with the env var unset).
        add('ERROR', 'dangling-pointer',
          `canonical_artifacts.${label} -> "${p}" does not exist on disk (resolved to "${disk}"${await rootHint()}).`);
      }
    }
  }

  // ── the stage's own required pointers + history entry ─────────
  if (stage) {
    const c = STAGE_CONTRACT[stage];
    if (!c) {
      add('WARN', 'unknown-stage', `no contract defined for stage "${stage}" — nothing asserted.`);
    } else {
      for (const key of c.artifacts) {
        const v = manifest.canonical_artifacts?.[key];
        if (v == null || v === '') {
          add('ERROR', 'missing-pointer',
            `canonical_artifacts.${key} is null/absent at the close of /${stage}. ` +
            `The artifact may well exist — but nothing downstream can find it.`);
        }
      }
      for (const path of c.top ?? []) {
        if (dig(manifest, path) == null) {
          add('ERROR', 'missing-pointer', `${path} is null/absent at the close of /${stage}.`);
        }
      }
      const hist = manifest.stage_history ?? [];
      if (!hist.some((e) => c.history.includes(e?.stage))) {
        add('ERROR', 'missing-history',
          `no stage_history entry for /${stage} (expected stage one of: ${c.history.join(' | ')}). ` +
          `stage_history is append-only and is the run's own record of what happened.`);
      }
    }
  }

  // ── stage_history entry shape, vocabulary and outcome ─────────────────────
  for (const [i, e] of (manifest.stage_history ?? []).entries()) {
    for (const f of HISTORY_FIELDS_ERROR) {
      if (!e?.[f]) add('ERROR', 'history-shape', `stage_history[${i}] is missing required field "${f}".`);
    }
    // Presence, NOT truthiness — `error` is null on success and `deliverables` is
    // legitimately []. A truthy test would flag every correct entry, which is how
    // this check came to cover only three of the contract's ten fields.
    for (const f of HISTORY_FIELDS_WARN) {
      if (!(e && f in e)) add('WARN', 'history-shape', `stage_history[${i}] is missing field "${f}" (schema-7 contract).`);
    }

    const stage = e?.stage;
    if (stage && !CANONICAL_STAGES.has(stage)) {
      const canon = STAGE_ALIASES[stage];
      if (canon) {
        add('ERROR', 'history-stage',
          `stage_history[${i}].stage is "${stage}" — the canonical name is "${canon}". ` +
          `A command name is not a stage name; readers filtering on the canonical name miss this entry.`);
      } else {
        // A per-tranche journal entry is USEFUL and should not be suppressed — it
        // just does not belong in the `stage` field, where it makes the run
        // unqueryable ("did /test pass?" cannot be answered across 30 invented names).
        const looksPerTranche = /^(tranche[_-]|.*_(tranche|phase)\b)|_(t\d+|phase\d+)/i.test(stage);
        add('WARN', 'history-stage',
          `stage_history[${i}].stage is "${stage}", which no framework file prescribes.` +
          (looksPerTranche
            ? ` Per-tranche detail belongs in the \`tranche\` field beside a canonical \`stage\`, not in the stage name itself.`
            : ` Either prescribe it at the stage that writes it, or use a canonical name.`));
      }
    }

    const outcome = e?.outcome;
    if (outcome && !LEGAL_OUTCOMES.has(outcome)) {
      const canon = OUTCOME_ALIASES[outcome];
      add('ERROR', 'history-outcome',
        `stage_history[${i}].outcome is "${outcome}", which is not one of ${[...LEGAL_OUTCOMES].join(' | ')}` +
        (canon ? ` — record "${canon}" and put the nuance in \`one_line\`.` : '.'));
    }
  }

  // ── the retired `platform_target` (2026-08-23) ────────────────────────────
  // M0 still READS it at ladder rung 2 to migrate pre-pack manifests, so its mere
  // presence is not the defect — writing it ALONGSIDE `packs` is. Three
  // runs created 2026-08-31, eight days after the retirement, carried both.
  if (manifest.packs && 'platform_target' in manifest) {
    add('ERROR', 'retired-field',
      `platform_target is present alongside \`packs\` — it was retired 2026-08-23 and must not be written. ` +
      `Two sources for one fact is exactly how they come to disagree.`);
  }

  // ── operator_attention shape ──────────────────────────────────────────────
  // The template declares one shape; SIX were measured in the wild, all six inside
  // one manifest alone. README § operator_attention calls this array
  // the SoT for cross-product roll-ups, which no reader could do against six shapes.
  for (const [i, e] of (manifest.operator_attention ?? []).entries()) {
    const missing = ATTENTION_REQUIRED.filter((f) => !e?.[f]);
    if (missing.length) {
      add('ERROR', 'attention-shape',
        `operator_attention[${i}] is missing ${missing.map((f) => `"${f}"`).join(', ')} — ` +
        `the template declares { ${[...ATTENTION_KNOWN].join(', ')} }.`);
    }
    const unknown = Object.keys(e ?? {}).filter((k) => !ATTENTION_KNOWN.has(k));
    if (unknown.length) {
      add('WARN', 'attention-shape',
        `operator_attention[${i}] carries undeclared key(s) ${unknown.map((k) => `"${k}"`).join(', ')}.`);
    }

    // ── a resolved attention item must say what resolved it ───────────
    if (e?.kind === 'resolved' && !(e.reference || e.references || e.resolved_by || e.resolved_at)) {
      add('ERROR', 'unreferenced-resolution',
        `operator_attention[${i}] is marked resolved but carries no reference / resolved_by / resolved_at. ` +
        `"Resolved" with nothing to check is indistinguishable from "dropped".`);
    }
  }

  // ── the gate's own exit code must be RECORDED, not merely claimed ──────────
  // Nine commands cite this script as an "exits 0" criterion. On 2026-09-02 a bug
  // shipped through /ship with it exiting 1: nothing recorded whether it had been
  // run, skipped or overridden, so a prose exit criterion was indistinguishable
  // from no criterion at all — rule 88's shape applied to a gate rather than a
  // declaration. `notes.gates.manifest_pointers[]` makes the answer a fact.
  if (stage === 'ship') {
    const runs = manifest.notes?.gates?.manifest_pointers;
    if (!Array.isArray(runs) || !runs.length) {
      add('ERROR', 'gate-record',
        `notes.gates.manifest_pointers[] is empty at the close of /ship — no stage recorded running this gate. ` +
        `Append { stage, exit, at } each time it runs; an unrecorded gate cannot be distinguished from a skipped one.`);
    } else {
      for (const [i, r] of runs.entries()) {
        if (r?.exit !== 0 && !r?.override_reason) {
          add('ERROR', 'gate-record',
            `notes.gates.manifest_pointers[${i}] records exit ${r?.exit} for /${r?.stage} with no override_reason. ` +
            `A failing gate may be overridden — it may not be silent.`);
        }
      }
    }
  }

  return findings;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('assert-manifest-pointers.mjs');
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const workflow = arg('--workflow');
  const stage = arg('--stage');
  const asJson = argv.includes('--json');
  const quiet = argv.includes('--quiet');

  if (!workflow) {
    console.error('usage: assert-manifest-pointers.mjs --workflow <dir> [--stage <stage>] [--json] [--quiet]');
    process.exit(2);
  }

  // `--workflow` is a LOGICAL path (`products/<group>/<slug>/…`) exactly like the pointers this
  // script checks, so it must go through the same resolver. It was `join()`ed against CWD, which
  // meant that on any external products mount the gate `/create-prd` Validation mandates verbatim
  // exited 2 for EVERY product — not a false pass, a false inability to run, which under time
  // pressure gets skipped. This script already carried a 12-line comment explaining that a plain
  // join is wrong "whenever the root is configured elsewhere — and here it is", and then did it in
  // its own argument parsing. Found 2026-08-28 by running the documented command.
  // Reuse `toDisk` — the SAME resolver the pointer payload goes through. A second resolution path
  // is how the two halves drift, which is the defect this fix exists to close.
  const workflowDir = await toDisk(workflow);
  let file = join(workflowDir, 'current-run.json');
  if (!existsSync(file)) {
    const runs = existsSync(workflowDir)
      ? readdirSync(workflowDir).filter((f) => /^run-.*\.json$/.test(f)).sort()
      : [];
    if (!runs.length) {
      console.error(`[ERROR] no manifest in ${workflowDir}`);
      if (workflowDir !== workflow) console.error(`        (--workflow "${workflow}" resolved through the products mount)`);
      process.exit(2);
    }
    file = join(workflowDir, runs.at(-1));
  }

  const manifest = JSON.parse(stripBom(readFileSync(file, 'utf8')));
  const findings = await check(manifest, { stage });
  const errors = findings.filter((f) => f.level === 'ERROR');

  if (asJson) {
    console.log(JSON.stringify({ file, stage: stage ?? null, findings, ok: !errors.length }, null, 2));
  } else if (!quiet || errors.length) {
    console.log(`  manifest: ${file}${stage ? `  ·  stage /${stage}` : ''}`);
    for (const f of findings) console.log(`  ${f.level}  [${f.code}] ${f.msg}`);
    if (!findings.length) console.log('  OK — every pointer this stage owes is present and resolves.');
  }
  process.exit(errors.length ? 1 : 0);
}
