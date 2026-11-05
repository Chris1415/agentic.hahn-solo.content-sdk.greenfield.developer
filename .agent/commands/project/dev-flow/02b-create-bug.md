---
name: create-bug
intent: bug_report
writes:
  - products/<product-slug>/project-planning/specs/bug-NNN.md
  - products/<product-slug>/project-planning/specs/bug-minimal-NNN.md
  - products/<product-slug>/project-planning/plans/task-breakdown-<timestamp>.md (thin: T001 RED test, T002 fix-to-green)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/platform-pack.md
  - .agent/commands/project/dev-flow/02-create-prd.md
  - .agent/agents/team/02-product-manager.md
  - .agent/commands/project/dev-flow/templates/bug.template.md
  - .agent/commands/project/dev-flow/templates/prd-minimal.template.md
  - .agent/commands/project/dev-flow/templates/task-breakdown.template.md
  - .agent/commands/project/templates/status-md.template.md
  - .agent/manifests/run-manifest.template.json
---

# /create-bug — Bug report (the BUG weight of the intake engine)

## What this is

`/create-bug` is the **bug weight** of the same intake engine `/create-prd` drives. A bug restores **intended behavior that is broken** — it is a contained fix, not a new capability. A bug report **maps directly to TDD**: "steps to reproduce + expected behavior" IS the RED test spec. The path is **autonomous** — zero planned operator gates — guarded by two safety valves (below). Same artifact slots as PRD/FRD, filled thinly: a 1–2 task breakdown is produced inline so `/implement` runs with its normal contract.

**When to use bug vs FRD vs PRD.** See `.agent/glossary.md` § "Work item type". A bug is *contained* and restores existing-intended behavior. If the work adds new behavior or the root cause is a design flaw, it is NOT a bug — promote it (§ The two valves).

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **before** parsing slash arguments. Resolve `product_slug` first.

## Inheritance from /create-prd (do not duplicate)

Reuse `/create-prd`'s mechanics as-written, with deltas:

- **§ Timestamp rule**, **§ Composition**, **§ Steps 0 / 0a (durability-tiering backfill + STATUS.md)** — identical, scanning the `bug-NNN.md` family. (Step 0's former auto-archive sweep is retired — see `/create-prd` § 0.)
- **§ Step 0 — pack resolution (M0)** — identical contract (`platform-pack.md`), **inherit-only and silent**. A bug is a contained fix to code that already exists, so the composition is whatever the product already runs; this weight is autonomous by default and **must never ask**. No prior manifest ⇒ report it rather than detect — a bug against a product with no run history is a mis-weighted intake.

  **What to RECORD when both inherit rungs miss** — mandated, because stating only the prohibition left the record undefined and two agents given the identical contract invented two different shapes for it (2026-08-23):

  ```json
  "packs": { "platform": null, "method": null, "audience": null,
             "resolved_by": "unresolved",
             "unresolved_reason": "no prior run manifest; /create-bug M0 is inherit-only",
             "detected_candidate": { "platform": "content-sdk", "signals": ["…"] } }
  ```

  Three rules make this safe. **`resolved_by: "unresolved"` with null dimensions** — not the detected value, because a downstream stage reads `packs.platform` and cannot tell an advisory guess from an inherited fact. **No platform value is recorded outside `detected_candidate`**, for the same reason: one run recorded a real platform as though resolved, off a rung this weight forbids, and every later stage would have believed it. **A detected candidate may be recorded, under `detected_candidate` only** — it is evidence for the operator and for the `/create-frd` or `/create-prd` run this promotes into, which resolves its own M0 properly. Add an `operator_attention[]` entry either way.
- **§ Step 10 (Git setup)** — identical, branch name **`bug-NNN`**. Run the inherited stacked-detection sub-step (10b-i) **as written** — it scans **all three families** (`prd-*` / `frd-*` / `bug-*`) for an unmerged predecessor. A bug usually branches fresh off `main`, BUT when the broken code lives on an **unmerged** branch (a regression in an as-yet-unmerged PRD/FRD), the bug branch must stack on **that** branch — which is commonly a different family than `bug-*`. Do not restrict the scan to the `bug-*` family. Fall back to a fresh branch off `main` only when no unmerged work-item branch exists.
- **§ Step 14 (minimal extraction)** — identical mechanism applied to the bug: extract `<!-- PRD_MINIMAL_BEGIN -->…END` from `bug-NNN.md` into **`bug-minimal-NNN.md`** (frontmatter `document_type: bug_minimal`). The marker name stays `PRD_MINIMAL`.
- **§ Operator Checkpoint output rules** — identical.

## Scope dial — DERIVED from type

A bug does not run the scope-dial kickoff. Derive and record:

```json
"scope_dial": { "rigor": "light", "track": "minimal", "ui_variants": "skip", "docs_at_ship": "auto-lite", "autonomy": "auto_3_gates", "gates": { "spec": true, "design": true, "build": true, "final": true, "go_live": true }, "extra_stops": [], "content_authoring": "no", "imagery": "none", "output_verbosity": "auto" }
```

`/architect`, UI design, and the heavy `/task-breakdown` planning weight are all skipped. A bug's `spec`/`design` gates are inert; `build` is inert too (a bug is single-tranche with no content phase, so `/test` is the last look, not an end-of-build-before-content one); its operative gates are `final` (the `/test` close) and `go_live`. `content_authoring` defaults to `no` (a contained fix does not author audience-facing content). Override `output_verbosity` with `verbosity=` (rule `73`). The **bug valves** (can't-reproduce → ask, not-contained → promote) remain regardless of the gate set, even when `gates=none`.

## Numbering

`BUG-NNN` is a **separate per-product namespace**. First bug is `BUG-001`. Resolve `NNN` as `highest existing bug-NNN + 1`.

## Capture (no heavy discovery)

A bug needs **capture**, not discovery. Read the input (prompt / GitHub issue / ticket) and fill the bug template's fields: Summary, Steps to reproduce, Current behavior (actual), Expected behavior (should-be), Environment/context (the resolved `packs` composition, versions, tenant/route), Root-cause hypothesis. Ask the operator a tight clarifying cluster ONLY when a field cannot be filled from the input. Most of this is mechanical transcription — keep it fast.

## The two valves (what makes "autonomous" safe)

Before writing the RED test, run both checks. Either can stop the autonomous path:

1. **Can't-reproduce valve.** If you cannot specify a concrete RED test that fails today — because the repro is non-deterministic, environment-specific, or under-described — **STOP and ask the operator**. You cannot auto-fix what you cannot trigger. Record `notes.bug_blocked: cannot_reproduce` and surface it as a `[BLOCKER]` Decision in the Operator Checkpoint. Do not guess a fix.

2. **Not-contained valve.** If the root-cause hypothesis reveals a **design flaw**, a **missing capability**, or a change that **spans multiple surfaces** — it is not a bug. **Promote** it: tell the operator "this is not a contained fix; recommend `/create-frd`" (or `/create-prd` if multi-phase), carry the repro/current/expected forward as the problem statement, and record a `stage_history` `{ stage: "promoted", outcome: "superseded", one_line: "BUG-NNN promoted to FRD/PRD — root cause is design, not a contained fix" }` entry. This valve is the safety net that prevents "fixing" the wrong thing (cf. the real-tenant-probe-at-T001 lesson).

## RED test first — the DoD backbone

The bug's definition of done is its **RED regression test**: a test that fails today and must pass after the fix, and then **stays in the suite** to guard the regression. Specify it in the § 1.5 Developer slice and § 4: test location, the exact assertion, and the fixture (independently sourced per rule `30-tdd.mdc` if SDK-touching). The RED test is written **before** any fix. SDK-touching bugs additionally require a **real-tenant smoke before ship** (per the working-style rule: hard checkpoint against real tenant).

## Steps

1. **Archive + STATUS refresh** — per `/create-prd` steps 0 / 0a, scanning the `bug-NNN.md` family.
2. Record `work_item_type: bug` and the derived `scope_dial` in the run manifest.
3. Read `.agent/commands/project/dev-flow/templates/bug.template.md`. Read and capture the input.
4. **Invoke Product Manager (constructive mode)** to write `bug-NNN.md`: Summary, § 1.5 Developer slice (inside the markers — what's broken, steps, current, expected, RED test spec, fix-location hint, containment check), Environment, Root-cause hypothesis, Regression test (expanded), Severity/impact. **Respect the ~120-line soft cap.**
5. **Run the two valves** (§ above). If either fires, stop / promote per its rule — do not continue to step 6.
6. **Git setup** — per `/create-prd` step 10, branch **`bug-NNN`**.
7. Write `bug-NNN.md`.
8. **Extract `bug-minimal-NNN.md`** — per `/create-prd` step 14 mechanics.
9. **Write a thin task breakdown** — `task-breakdown-<timestamp>.md` using the task-breakdown template, filled minimally so `/implement` runs in pipeline mode with its normal contract:
   - **§ 0 Quick orientation** — target directory, the RED test path, delivery order.
   - **T001** — write the RED regression test (RED before GREEN, per rule `30-tdd.mdc`).
   - **T002** — implement the fix until T001 is GREEN; `Depends on: T001`.
   - **§ 4c** — fill the boundaries / stack / SDK-contract subsections that the fix touches (or `N/A — <reason>`).
   - **§ 5 Execution order** — the numbered order `/implement` follows: `T001 → T002`.
   - **§ 8 What Needs To Be Tested** — the regression test + any SDK-touching real-tenant smoke.
   Record `canonical_artifacts.task_breakdown` and `task_breakdown_style: tdd`. The PM (02) fills these thin sections directly — no Lead-Dev (06) / QA (07) pass runs on the bug path; the RED-test discipline substitutes for QA enrichment.
10. **Manifests** — write `run-<timestamp>.json` + `current-run.json`. Record `work_item_type: bug`, `scope_dial`, `packs`, `branch_name`, canonical `prd`/`prd_minimal` slots (= the bug paths), `task_breakdown`. Append `stage_history` `spec_ready` entry (`one_line` states the bug + that the RED test is specified).

## Validation

- `work_item_type: bug` recorded; current branch is `bug-NNN`.
- `bug-NNN.md` and `bug-minimal-NNN.md` exist with matching NNN; manifest `prd`/`prd_minimal` slots point at them.
- **A concrete RED regression test is specified** (the DoD backbone) — OR the can't-reproduce valve fired and is recorded as a `[BLOCKER]`.
- The **containment check** was performed; if not contained, promotion is recorded and the path stopped.
- A **thin task breakdown** exists (T001 RED test, T002 fix-to-green) so `/implement` has its pipeline contract; `task_breakdown_style: tdd`.
- For SDK-touching bugs, a real-tenant smoke is named in § 8 / `smoke_outcomes`.
- `stage_history` has a `spec_ready` (or `promoted`) entry.

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage create-bug` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, and a missing `stage_history` entry.
  **This weight had no such gate until 2026-09-02**, and it is the weight that needed it most: of 57 typed manifests on disk, 30 are FRD and 14 are bug against 13 PRD, so the check was wired into the minority path while bug intake closed with nothing asserting that `/task-breakdown` and `/implement` could find the spec at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "create-bug", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array.

## Output rules

- **Begin with the Operator Checkpoint block.** A can't-reproduce stop is a `[BLOCKER]` Decision; a promotion is a Concern; an SDK-touching real-tenant smoke is a Concern.
- **Operator gate — SOFT (0 planned gates).** End with: "Recommended next: `/implement` (write the RED test → make it green)." **Escalate to a hard STOP** when either valve fired (can't-reproduce → ask; not-contained → promote) or any `[BLOCKER]` checkpoint item exists. A clean, contained, reproducible bug flows straight to `/implement` without stopping.
