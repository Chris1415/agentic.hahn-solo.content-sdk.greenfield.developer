#!/usr/bin/env node
/**
 * check-brief-coverage.mjs — did every pack-declared stage actually resolve its brief?
 *
 *   node .agent/scripts/check-brief-coverage.mjs --workflow <product>/project-planning/workflow
 *   node .agent/scripts/check-brief-coverage.mjs --workflow <dir> --json
 *
 * Pure Node, no deps, no network. Read-only — it never writes the manifest.
 *
 * WHY THIS EXISTS (2026-09-02). `platform:marketplace`'s first full end-to-end run
 * (a Marketplace build) resolved briefs for 5 of the 9 stages the pack declares content for.
 * `/code-review` and `/test` were never run as commands — the orchestrator hand-wrote the
 * sub-agent prompts instead — so their briefs were never composed. What was skipped:
 *
 *   - `/test`'s `live-walkthrough` axis, declared MANDATORY before status can be `shipped`,
 *     with `status_gating` that explicitly forbids inheriting the host-frame smoke result.
 *     That is the "does the feature actually work for a real editor" gate whose ABSENCE the
 *     run's retrospective then proposed as its single highest-value improvement. It already
 *     existed. It was simply never resolved.
 *   - `/test`'s `blocking_inputs` (host URL + app origin), which would have made the stage
 *     unstartable without a real portal session.
 *   - `/code-review`'s `marketplace-sdk-client` + `marketplace-sdk-xmc`, both `mandatory_when`
 *     an SDK call site is in the diff, severity CRITICAL per violation. The app shipped a
 *     missing `sitecoreContextId` whose cause the manifest records as "marketplace-sdk-xmc
 *     § 6a" — the pack named the exact skill section documenting the defect, and no reviewer
 *     ever loaded it.
 *
 * Every one of those is a live gate that no green light could distinguish from a run that had
 * passed it. That is rule `88` exactly: the brief existed, four stages did not use it, and
 * nothing failed. So the gate is coverage, not content — it cannot know whether a brief was
 * OBEYED, only whether it was ever composed.
 *
 * A stage that legitimately did not run is not a defect and is not silently tolerated either:
 * it is WAIVED, by name, with a reason, in `packs.briefs_waived[]`. Converting silence into a
 * one-line record is the entire point.
 *
 * Exit codes: 0 covered · 1 a declared stage has neither a stamp nor a waiver · 2 usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, composePacks, NULLS } from './resolve-packs.mjs';
// `products/` is a LOGICAL mount point, not necessarily a directory in this repo
// (product-workspace.md § 1a). Joining it onto cwd finds nothing on an external root,
// and "no manifest" is indistinguishable from "no run" — so /ship's coverage gate could
// not run at all. resolveLogical passes absolute paths through and pins `_root` to the repo.
import { resolveLogical } from './resolve-products-root.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');

/**
 * A manifest may be UTF-8-with-BOM — PowerShell's `>` / `Out-File` / `Set-Content` write one by
 * default and 26 of 93 manifests on disk carry it. A plain JSON.parse rejects those outright, so
 * a reader without this strip silently reports a quarter of the portfolio as unreadable.
 */
export function readManifest(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

/**
 * Which stages does this composition actually declare content for?
 *
 * Derived from the composed brief rather than from a hand-kept list, so a pack that gains a
 * stage is covered the day it gains it — a maintained list is the drift this repo keeps
 * measuring.
 */
export function declaredStages(triple, { packs } = loadPacks()) {
  const { composition } = composePacks(triple, { packs });
  return {
    stages: Object.keys(composition.stages ?? {}).sort(),
    active: composition.active ?? [],
  };
}

/**
 * Pack stage name → the `stage_history[].stage` value that proves the stage actually RAN.
 *
 * WHY THIS EXISTS (2026-09-04, dogfood finding D26). The first version of this gate checked only
 * that a brief had been COMPOSED. That is not the same event as the stage RUNNING, and `/ship`
 * read it as the latter. Measured live: a `task-breakdown` stamp existed while
 * `canonical_artifacts.task_breakdown` was `null` and the stage had not started — **a stage that
 * never ran was already "covered"**. Rule `88`'s shape, inside the fix written for rule `88`'s
 * shape.
 *
 * A stage may legitimately close under more than one history name (`/task-breakdown` closes
 * `plan_ready` and, after QA enrichment, `qa_ready`), so each maps to a SET and any one satisfies
 * it. Names are the canonical vocabulary in `.agent/manifests/README.md`.
 *
 * A pack stage absent from this map is stamp-only — it cannot be execution-checked, and the gate
 * says so rather than silently passing it.
 */
export const EXECUTION_EVIDENCE = {
  'create-prd': ['spec_ready'],
  'architect': ['architecture_ready'],
  'design': ['ui_ready'],
  'task-breakdown': ['plan_ready', 'qa_ready'],
  'implement': ['implemented', 'implementation_in_progress'],
  'code-review': ['code_reviewed'],
  'test': ['tested'],
  'ship': ['shipped'],
  'document': ['documented'],
};

/**
 * The canonical pipeline order. A stage may not be stamped while an EARLIER pack-declared stage is
 * neither stamped nor waived.
 *
 * WHY (dogfood finding D25). The gate was terminal, not sequential: the orchestrator skipped
 * `/design` and the omission would not have surfaced until `/ship`, hours later, with the task
 * breakdown already written against a POC that did not exist. The canonical order is known, so a
 * skipped stage is detectable the moment the next one is stamped.
 */
export const CANONICAL_ORDER = [
  'create-prd', 'architect', 'design', 'task-breakdown',
  'implement', 'code-review', 'test', 'document', 'ship',
];

export function coverage(manifest, { packs } = loadPacks()) {
  const findings = [];
  const p = manifest?.packs ?? {};
  const triple = {
    platform: p.platform ?? NULLS.platform,
    method: p.method ?? NULLS.method,
    audience: p.audience ?? NULLS.audience,
  };

  const { stages: declared, active } = declaredStages(triple, { packs });
  const stamped = new Set((p.briefs_resolved ?? []).map((b) => b?.stage).filter(Boolean));
  const waived = new Map();
  for (const w of p.briefs_waived ?? []) {
    if (!w?.stage) continue;
    // A waiver without its own reason is not a waiver, it is a way to silence the gate. Same
    // rule the schema-audit / authorability / comment-density ignore files carry.
    if (!w.reason || !String(w.reason).trim()) {
      findings.push({ severity: 'ERROR', stage: w.stage, message: `waiver for stage "${w.stage}" carries no reason — a waiver states WHY the stage did not run, or it is not a waiver.` });
      continue;
    }
    waived.set(w.stage, String(w.reason).trim());
  }

  // Floor assertion — and it is conditioned on a pack actually being ACTIVE.
  //
  // Zero declared stages means two completely different things, and conflating them was a real
  // defect in the first version of this file (2026-09-02, caught before any run hit it):
  //
  //   active: []          → the all-nulls core-only composition. Zero stages is the CORRECT and
  //                         expected answer; there is no pack, so there is nothing to cover and
  //                         coverage is vacuously satisfied. Erroring here would have made /ship
  //                         block EVERY core-only run — a gate nothing could satisfy.
  //   active: [pack…]     → a pack loaded and declared no stages. THAT is broken, and a "clean"
  //                         verdict over it would be the check-that-cannot-fail this floor exists
  //                         to prevent.
  if (declared.length === 0 && active.length > 0) {
    findings.push({ severity: 'ERROR', stage: null, message: `packs ${active.join(', ')} are active but the composition declares NO stages — discovery or the pack is broken, so this result is meaningless rather than clean.` });
  }

  const missing = [];
  for (const stage of declared) {
    if (stamped.has(stage)) continue;
    if (waived.has(stage)) continue;
    missing.push(stage);
    findings.push({ severity: 'ERROR', stage, message: `stage "${stage}" carries pack content but its brief was never resolved (no packs.briefs_resolved entry) and it is not waived. Run the stage command, or record packs.briefs_waived[] = { stage, reason }.` });
  }

  // ── A stamp is not execution (D26) ──────────────────────────────────────────
  // The stamp proves the brief was COMPOSED. Only stage_history proves the stage RAN. Requiring
  // both is what stops a stamped-but-never-run stage from reading as covered.
  const ranStages = new Set(
    (manifest?.stage_history ?? [])
      .filter((h) => h && h.stage && h.outcome !== 'failed')
      .map((h) => h.stage),
  );
  const stampedNotRun = [];
  const unverifiable = [];
  for (const stage of declared) {
    if (!stamped.has(stage)) continue;      // already reported as missing/waived above
    const evidence = EXECUTION_EVIDENCE[stage];
    if (!evidence) {
      // Never silently pass a stage we cannot execution-check — say the check does not apply.
      unverifiable.push(stage);
      findings.push({ severity: 'WARN', stage, message: `stage "${stage}" is stamped but has no execution-evidence mapping, so only the stamp was checked. Add it to EXECUTION_EVIDENCE or accept that this stage is stamp-only.` });
      continue;
    }
    if (evidence.some((e) => ranStages.has(e))) continue;
    stampedNotRun.push(stage);
    findings.push({ severity: 'ERROR', stage, message: `stage "${stage}" carries a brief stamp but NO stage_history entry (expected one of: ${evidence.join(' | ')}). A stamp proves the brief was composed, never that the stage ran — a stamped stage that never ran must not read as covered.` });
  }

  // ── Order: a stage may not be stamped over an unstamped predecessor (D25) ────
  const outOfOrder = [];
  const declaredInOrder = CANONICAL_ORDER.filter((s) => declared.includes(s));
  for (let i = 0; i < declaredInOrder.length; i++) {
    const stage = declaredInOrder[i];
    if (!stamped.has(stage)) continue;
    for (const earlier of declaredInOrder.slice(0, i)) {
      if (stamped.has(earlier) || waived.has(earlier)) continue;
      outOfOrder.push({ stage, earlier });
      findings.push({ severity: 'ERROR', stage, message: `stage "${stage}" is stamped while the EARLIER pack-declared stage "${earlier}" is neither stamped nor waived — a stage was skipped. Detected here rather than at /ship, which is the whole point of checking the order and not just the set.` });
    }
  }

  // A stamp for a stage the composition declares nothing for is not an error — core stages
  // resolve a brief too, and an empty brief is a legitimate answer. Report it as INFO so the
  // count reconciles for a reader.
  const extra = [...stamped].filter((s) => !declared.includes(s)).sort();

  return {
    triple, declared, stamped: [...stamped].sort(), waived: [...waived.keys()].sort(),
    missing, extra, stampedNotRun, outOfOrder, unverifiable, findings,
  };
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const wf = arg('workflow');
  const mf = arg('manifest');
  if (!wf && !mf) {
    console.error('Usage: check-brief-coverage.mjs --workflow <product>/project-planning/workflow [--json] [--quiet]');
    process.exit(2);
  }
  const file = mf ? resolveLogical(mf) : path.join(resolveLogical(wf), 'current-run.json');
  if (!fs.existsSync(file)) { console.error(`x manifest not found: ${file}`); process.exit(2); }

  const r = coverage(readManifest(file));
  const errs = r.findings.filter((f) => f.severity === 'ERROR');

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...r, ok: errs.length === 0 }, null, 2));
    process.exit(errs.length ? 1 : 0);
  }
  if (!argv.includes('--quiet') || errs.length) {
    console.log(`composition: platform:${r.triple.platform} × method:${r.triple.method} × audience:${r.triple.audience}`);
    console.log(`declared ${r.declared.length} · resolved ${r.stamped.length} · waived ${r.waived.length} · MISSING ${r.missing.length} · stamped-not-run ${r.stampedNotRun.length} · out-of-order ${r.outOfOrder.length}`);
    for (const f of r.findings) console.log(`  x [${f.severity}] ${f.message}`);
    if (r.extra.length) console.log(`  i stamped but not pack-declared (fine — core stages resolve too): ${r.extra.join(', ')}`);
    if (!errs.length) console.log('ok — every pack-declared stage resolved its brief or is waived with a reason.');
  }
  process.exit(errs.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
