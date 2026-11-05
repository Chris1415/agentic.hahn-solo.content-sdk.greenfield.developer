# Development Execution Plan

---
document_type: task_breakdown
artifact_name: task-breakdown-<timestamp>.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
source_inputs:
  - project-planning/specs/prd-NNN.md
  - project-planning/specs/prd-minimal-NNN.md (Developer 08 orientation only; Lead Developer 06 still uses full PRD)
  - project-planning/architecture/architecture-<timestamp>.md (full track; omit when minimal—use ADRs instead)
  - project-planning/baseline.md (when promoted; consolidated architecture baseline)
  - project-planning/ADR/ (minimal track or delta ADRs not in baseline)
consumed_by:
  - QA Specialist (07) enriches this file; Developer Code Monkey (08) implements from this file + prd-minimal only
next_input:
  - project-planning/plans/qa-report.md (optional on minimal track)
---

<!-- Soft cap: ~800 lines (frontmatter excluded). Exceeding the cap typically means the spec scope is too broad — propose coarser tranche grouping or an explicit phase boundary in § 5 before ballooning a single task breakdown. Splitting the SPEC is the operator's call and requires the shippability test (glossary § "Deliverable vs execution unit"); the breakdown is a function of spec scope, not a place to re-scope it. -->

## 0. Quick orientation (absorbed from former implementation-runbook)

*Populated by **Lead Developer (06)** at file creation. Updated by Developer (08) at `/implement` time if the target directory deviates. This section gives the Developer everything they need to start work without reading the architecture, full PRD, or any prior runbook.*

### Implementation target directory

- **Target:** `<workspace root|site/|app/|explicit path>` — the directory implementation code lives in.
- **Container convention:** see `06-implement.md` § Required behavior. Default is `site/` at the product root. Deviations must be recorded with reason.

### Canonical inputs (Developer 08 normal flow loads ONLY these)

- **`prd-minimal-NNN.md`** — primary scope/orientation (mechanically extracted from the full PRD's Developer slice).
- **This task breakdown** — execution contract (§ 4c, tasks, tests, order).
- **Winning POC clickdummy** (when present): `project-planning/design-prototypes/poc-vN-prdNNN/` — visual source of truth for look-and-feel. The Developer MAY open POC HTML/CSS files; this is the one allowed exception to slim context.
- **`baseline.md`** (when promoted) — consolidated architecture baseline; carries stable inherited ADR decisions in one place.

**NOT loaded** in Developer normal flow: full PRD, architecture file, raw ADR files (use § 4c-2 one-liners + baseline.md instead), UI variant specs, source-analysis markdown.

### Planned delivery order

*Mirror of § 5 Execution order — repeated here so the Developer sees the running sequence without scrolling.*

```
<populated by Lead Developer; one Task ID per line in dependency order;
group with blank lines for tranches when applicable; prefix a probe tranche
with 🔍 (rule 70-probe-and-tranche — a refuted probe stops for operator go/no-go)>
```

### Completion criteria

- **Pre-completion validation gate** (per `06-implement.md` § 9): lint passes, build passes, git-status clean (or untracked files have explicit operator dispositions).
- **Smoke gates** (when the stage brief declares `requires_smoke`): real-tenant smoke recorded under manifest `smoke_outcomes` per `/test` and `/ship`.
- **§ 9 TDD contract green** (when `task_breakdown_style: tdd`): every RED test for in-scope tasks has a passing GREEN; no production code written before RED.

## 1. Implementation Overview

## 2. Epics

## 3. Feature Breakdown

## 4. Task Breakdown

For each task include (execution agent uses **Task ID** and **Depends on** to run in dependency order):

- **Task ID:** (e.g. T001, T002 — unique, zero-padded three digits)
- **Title:**
- **Description:**
- **Expected Output:**
- **Depends on:** (comma-separated task IDs, or `none`)

## 4b. Important Test Cases (by epic / feature)

For each epic or feature, list important cases that must be covered by testing (unit, UI, E2E, or regression). When a standalone QA report exists, the QA Specialist uses this to populate Test Cases To Implement; otherwise (minimal track) implementation uses this section and the test tasks above.

- Epic/Feature name
  - Case (short description, type: unit | UI | E2E | regression)

## 4c. Implementation execution contract (for Developer 08)

**Lead Developer (06):** Fill every subsection below before declaring the task breakdown complete. **QA (07):** Extend subsections when tests need context not yet captured. **Developer (08)** does not open architecture, UI, or ADR files in normal flow — only this file + `prd-minimal-NNN.md`. If a subsection below is genuinely not applicable (e.g. no UI, no rebuild), mark it `N/A — <reason>` rather than leaving it blank.

### 4c-1. Non-negotiable technical boundaries
List every hard constraint a developer must not violate. One bullet per constraint. Reference the ADR number when applicable (or the baseline.md anchor when the decision is in the promoted baseline). Include **`architecture_budget`** from `scope_dial` (`lean` | `mindful` | `deliberate`; default `mindful`) as a boundary the implementation must respect.
- (e.g. "All data access must go through the repository layer — ADR-0003")

### 4c-2. ADR one-liners (delta from baseline)
For each ADR that affects implementation in this plan **AND is not already in `baseline.md`**, restate the decision in one line. When `baseline.md` exists, the Developer reads it for inherited constitution and this subsection lists only delta/new decisions.
- ADR-NNNN: \<what was decided and why it matters here\>

### 4c-3. Stack / tooling specifics
Package names, versions, CLI commands, config file locations, and build/test invocations the developer needs to know.
- (e.g. "Use `pnpm` not `npm`; test runner: `vitest`; build: `pnpm build`")

### 4c-4. UI implementation notes
Tokens, typography, spacing, color values, component behaviors, and copy that came from the selected UI variant. If no UI variant exists, state `N/A`.
- (e.g. "Primary: `#FF6B6B`; body font: `Inter 16px/24px`; border-radius: `8px`")
- **Winning POC clickdummy:** `project-planning/design-prototypes/poc-vN-prdNNN/` — the HTML clickdummy is the canonical visual reference for look-and-feel. The Developer may open the POC's HTML/CSS files during implementation to match the intended appearance. When spec text and clickdummy diverge on visual details, the clickdummy wins.

### 4c-5. File / module structure and naming conventions
Directory layout, file naming rules, and module/component boundaries the developer must follow.
- (e.g. "`src/features/<feature>/` structure; component files: `PascalCase.tsx`; test files: `*.test.ts` co-located")

### 4c-6. Integration and API contract notes
Endpoint paths, request/response shapes, auth headers, error codes, or inter-service contracts relevant to this plan.
- (e.g. "`POST /api/users` expects `{ email, role }`; returns `201` with `{ id, email }`")

### 4c-7. Parity / rebuild pointers
Asset bundle path, content-dump location, and per-route parity notes when `source.analysis_mode` is `rebuild`. State `N/A — greenfield` otherwise.
- (e.g. "`project-planning/source-analysis/assets/<ts>/content-dump.json` — route `/about` maps to component `AboutHero`")

## 5. Dependencies

- **Ordering constraints:** (Why certain tasks must run before others.)
- **Execution order:** (Ordered list of all task IDs in a valid dependency order, e.g. T001, T002, T003, … — used by the execution agent to implement in the correct sequence.)
- **Tranches — component-vertical, probe-first (rules `70-probe-and-tranche.mdc` + `71-delivery-loop.mdc`):** Group the execution order into ordered **tranches**, not a flat list, decomposed **by component first, then additional logic**. One tranche **per component** — each a full **vertical slice** carrying *all* that component's items (data layer + component + registration + variants + tests), **not** a horizontal layer split across components — followed by cross-cutting **additional-logic** tranches (navigation, theming, routing, app-level wiring). Each component tranche is a **delivery-loop unit** (`.agent/glossary.md` § "Delivery loop"): the Developer implements it, then `/code-review` + `/test` run on that tranche as a whole (loop back to `/implement` on a Critical/Major or a test fail, bounded to 5 cycles) before the next component starts. When any tranche depends on a load-bearing assumption or unknown (SDK/tenant shape, external behavior, migration fidelity), make the FIRST tranche a 🔍 **probe tranche** whose lead task runs `/probe` to confirm it before dependent tasks; a 🔍 probe tranche stops for explicit operator go/no-go (a refuted probe → cancel / split / redesign). See `.agent/glossary.md` § "Tranche" / § "Delivery loop" / § "Probe".
- **Tranche independence (rule `71` § "Parallel tranches") — declare only what you can PROVE:** Name any set of component tranches that may run **concurrently**, each as its own triad in its own git worktree. A tranche set qualifies **only if all five hold**, and you must state the evidence:
  1. no 🔍 probe tranche is still pending or unconfirmed (probes are blocking and run first, alone);
  2. no `Depends on` path between them in the *transitive* closure;
  3. their § 4c-5 file sets are **disjoint** (generated build output — `.sitecore/*` maps — is exempt; it is regenerated once at the join);
  4. neither writes shared mutable state — `sitecore.config.ts`, `next.config.*`, `package.json`, `.env*`, shared types/barrels, **or shared live-tenant items** (Available Renderings, Page/Partial Designs, placeholder settings, insert options);
  5. you can name the evidence for 2–4 concretely, not "they look separate."

  **Declaring nothing is a correct and safe answer** — sequential is the default and costs only wall-clock. Over-declaring corrupts a build. On a Content SDK run, component tranches usually share the Available Renderings registration (check 4) — either note that the registration is **deferred to the join**, or do not declare the set.

  Format: `Concurrent set: [Tranche B, Tranche C] — evidence: no Depends-on path (B: T005-T007, C: T008-T009); disjoint files (B: src/components/CardGrid/**, C: src/components/CTA/**); no shared config; rendering registration deferred to join.` Use `Concurrent sets: none` when nothing qualifies.

  Example:
  ```
  🔍 Tranche 0 (probe — confirm live payload shape before build): T001  → operator go/no-go
  Component tranche A — Hero (implement all its items → /code-review → /test as a unit): T002, T003, T004
  Component tranche B — CardGrid (implement → review → test): T005, T006, T007
  Component tranche C — CTA (implement → review → test): T008, T009
  Additional-logic tranche — Navigation + theming + routing: T010, T011, T012
  ```

  Rules: Tranches execute **in order**. A 🔍 probe tranche (when present) runs **first, alone, and blocking** — it pauses for operator go/no-go, and no implementation tranche (parallel or not) starts before that confirmation. **Component tranches run one at a time by default** — a component is delivered fully (review-clean + test-green, the delivery loop) before the next starts, which is what gives the operator granular per-component progress. **Exception:** a set explicitly declared under *Tranche independence* above, having **proven** all five checks, runs **concurrently** — each tranche's {Developer → Code-Reviewer} pair in its own git worktree, joined by the orchestrator once every tranche is review-clean (merge → regenerate `.sitecore` maps once over the full set → apply deferred shared-tenant writes serially → **one QA pass over the integrated whole**). Any doubt → sequential. **Additional-logic** (cross-cutting) tranches run **after** all component tranches and are rarely independent of them. A component tranche's own items stay sequential unless the item count clearly warrants otherwise. A tranche starts only when everything it depends on is complete. A bug / small FRD with a single component is one tranche — do not force more.

## 6. Suggested Milestones

## 7. Risk Areas

## 8. What Needs To Be Tested (global testing runbook — absorbed from former implementation-runbook)

*Populated by **Lead Developer (06)** (initial) and **QA Specialist (07)** (expansion). Summarizes what must be tested for this PRD so `/test` can run a holistic QA pass. Source: § 4b Important Test Cases + § 9 TDD contract + § 10 per-task tests.*

- **Unit tests**: scope (e.g. by epic/feature); existence and pass status.
- **UI / component tests**: scope; existence and pass status.
- **E2E tests**: critical flows; existence and pass status (or manual E2E where no runner).
- **Regression**: existing behaviors covered by the suite; full suite must pass before release.
- **Test commands**: from `project-planning/plans/prime.md` (e.g. `npm run test`, `npm run test:e2e`).
- **Smoke gates**: which manual smoke steps `/test` populates into `smoke_outcomes`; which require real-tenant verification.

This section is the single project-level reference for "what needs to be tested." Implementation must implement these tests; `/test` uses it to align automated and manual verification.

## 9. TDD and quality contract

*(Populated by **QA Specialist (07)** after Lead Developer (06): non-negotiable RED → GREEN → REFACTOR rules for all applicable layers.)*

## 10. Per-task test specifications

*(Populated by **QA Specialist (07)**: meaningful automated/manual tests per Task ID.)*

## 10a. Requirement-to-test evidence map

*(Populated by **QA Specialist (07)** after § 10. Mandatory traceability from spec to proof — `/test` and `/ship` use this table, not test counts alone.)*

Scale rows by `work_item_type` from the run manifest:

- **PRD:** one row per user story or acceptance criterion from the spec.
- **FRD:** one row per acceptance criterion (§ 1.5 + § 3).
- **Bug:** one row for the RED regression test (DoD backbone); add rows only for additional smoke steps named in § 8.

| Requirement / AC / RED test | Task ID(s) | Test type | Test location / command | Coverage status |
|-----------------------------|------------|-----------|-------------------------|-----------------|
| *e.g. US-003: share link copies URL* | T004, T005 | unit + UI | `src/.../share.test.tsx` | pending |

**Coverage status** must be one of: `pending` (before implement), `covered` (automated test exists and passes), `manual-only` (verified manually — name the procedure), `not applicable` (with reason), `deferred` (with reason and follow-up). `/test` may not mark release-ready while any in-scope row remains `pending` or `deferred` without operator acceptance.

## Handoff Metadata
- Canonical run manifest:
- Source PRD:
- Source architecture: (path, or "ADRs only — minimal track", or "baseline.md when promoted")
- Recommended next command:
- Recommended next input file: (`qa-report.md` if produced; else N/A)
