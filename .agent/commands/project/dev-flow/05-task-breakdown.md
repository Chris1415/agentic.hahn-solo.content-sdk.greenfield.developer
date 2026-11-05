---
name: task-breakdown
intent: planning
writes:
  - products/<product-slug>/project-planning/plans/task-breakdown-<timestamp>.md (written by Lead Developer 06; then edited in place by QA 07)
  - products/<product-slug>/project-planning/plans/qa-report.md (optional summary; omit on minimal track when declined)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/06-lead-developer.md
  - .agent/agents/team/07-qa-specialist.md
  - .agent/commands/project/dev-flow/templates/task-breakdown.template.md
  - .agent/commands/project/dev-flow/templates/tdd-breakdown.template.md
  - .agent/commands/project/templates/qa.template.md
  - .agent/manifests/run-manifest.template.json
---

# /task-breakdown — Execution plan from architecture to implementation-ready task list

## Pipeline position

This command is part of the development pipeline: `/prime` → `/rubber-ducky` → `/create-prd` → `/challenge-prd` → `/architect` → **`/task-breakdown`** → `/implement` → `/code-review` → `/test` → `/ship` (`/document` is on-demand, not in the canonical sequence)

**Git context:** This command runs on the feature branch (`prd-NNN`) created by `/create-prd`. All writes (task breakdown, QA report) land on that branch.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. All `project-planning/...` paths in this command are under **`products/<product-slug>/project-planning/`**.

## Work item type routing (schema 8+)

Read `work_item_type` from the run manifest (treat a missing field as `prd` — legacy). See `.agent/glossary.md` § "Work item type":

- **`prd`** — run at full weight (the canonical path below). This command's close is **HARD gate #2** of the 2-gate PRD ladder.
- **`frd`** — run at **feature weight**: the spec is `frd-NNN.md` + `frd-minimal-NNN.md`; there is usually no architecture file (minimal track), so § 4c-2 cites only the FRD's inline decisions/ADRs. This command's close is **SOFT for an FRD, exactly as for a PRD** — it carries no gate token, so it auto-continues (step 4; `/create-frd` § Scope dial: an FRD's operative stops are the end-of-build review and `go_live`). Keep the breakdown proportional to the FRD's ~150-line scope.

  > This line read *"the FRD's **single HARD gate** (implementation-approach review)"* until 2026-09-02, contradicting step 4 and the soft-gate note in step 1 **of this same file**, plus `/create-frd`'s gate topology. It was reported by two separate runs (2026-08-04 and 2026-08-07), the latter naming the exact line numbers — and survived both because nothing converts a repeatedly-reported run deviation into a framework edit. Corrected on the third report. The reporting channel works; the loop back into the framework is what was missing.
- **`bug`** — **normally skipped.** `/create-bug` already produced a thin task breakdown inline (T001 RED test, T002 fix-to-green). Only run here if a bug's fix turned out to need real decomposition — and if it needs that much, re-check the not-contained valve (it may warrant promotion). If invoked on a `bug` manifest with an existing thin breakdown, report that it is already plan-ready and recommend `/implement`.

## Goal

Take the PRD and architecture/ADR artifacts from `/architect` and produce an **execution-ready task breakdown**. **Pipeline order:** **Lead Developer (06)** produces the **split task list** first → **QA Specialist (07)** **edits that same task-breakdown file** to add TDD discipline, per-task tests, and meaningful cases → optional standalone `qa-report.md`. When done, the run is execution-ready; implementation is then `/implement`.

## Sub-agent orchestration

This command uses the **sub-agent orchestration model** defined in `.agent/WORKFLOW.md` and the **slim context chain** defined in `.agent/glossary.md`. The Team Lead spawns each specialist as an isolated sub-agent with only its mandated inputs, validates the output, and presents it to the user at the gate before spawning the next specialist.

## Inputs

- **Optional first argument:** Path to a PRD file. If omitted, resolve from `project-planning/workflow/current-run.json` → `canonical_artifacts.prd`. If the manifest is missing or that entry is absent, use the **latest PRD** in `project-planning/specs/` (see `.agent/WORKFLOW.md`: prefer `prd-NNN.md` with highest N; else latest-by-timestamp).
- Architecture and UI artifacts are resolved from the run manifest (`canonical_artifacts.architecture`, `ui_design.selected_variant_path`).
- If no PRD exists, tell the user and ask for a path or run `/create-prd` first.

## Interactivity rule

- ****SUPERSEDED — see step 1 and Output rules.** This stage closes SOFT and auto-continues; it carries no gate token. The paragraph below is pre-2026-07-30 residue from before the hard-to-soft gate correction, kept only because deleting it would lose the reasoning. Where it disagrees with step 1, step 1 wins. Historically: every stage is interactive.** After each major artifact (task breakdown from Lead Developer, QA enrichment of that file, optional QA report), pause and:
  - Summarize what was produced and key decisions.
  - Ask the user if they want to adjust anything before continuing.
  - If the user requests changes, revise the artifact and confirm again.
- Ask 1–3 focused questions when something is ambiguous; wait for answers before proceeding.

## Timestamp rule

- If `project-planning/workflow/current-run.json` exists and references a canonical PRD, reuse that `run_id` for all outputs in this run.
- Otherwise, if the chosen PRD file name includes a timestamp in the form `*-<timestamp>.md`, reuse that timestamp.
- Otherwise, resolve a fresh timestamp and ensure the run manifest is initialized (or updated) so all artifacts from this run share the same id.

## Steps

0. **Auto-archive is RETIRED (was schema 7) — no action.** This step used to move superseded `plans/task-breakdown-*.md` / `plans/qa-report-*.md` (and legacy schema-6 `implementation-runbook-*.md`) into `archive/plans/`. Under artifact durability tiering (schema 8+) those three families are untracked, so the move had no git-visible effect. Write the new timestamped breakdown directly; leave predecessors in place. **`plans/ship-report-*.md` and `plans/*probe-findings*.md` remain TRACKED** — never move or overwrite them (the retired sweep was observed archiving ship reports it was supposed to preserve). See `.agent/glossary.md` § "Artifact durability tiering".

1. **Lead Developer task breakdown (interactive).** **Spawn sub-agent: Lead Developer.** Spawn an isolated sub-agent. Prompt must include: read `.agent/agents/team/06-lead-developer.md` for identity (spawn it via `Agent(subagent_type: "lead-developer")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). **Task:** Convert the canonical PRD, architecture (or ADRs on minimal track), and optional UI variant into an execution-ready development task breakdown.

    **Inputs to load (slim context):** Full PRD + architecture file path **or** PRD + ADRs from `project-planning/ADR/` when `canonical_artifacts.architecture` is `null` + optionally the selected UI variant (`ui_design.selected_variant_path` or single `ui-design-*-vN.md`) + the winning POC folder (`ui_design.selected_poc_path`) when it exists. For rebuild runs (`source.analysis_mode == rebuild`), also load `source.source_analysis_artifact`; when `source.clone_scope_mode == full_website_clone`, also load `source.content_dump`, `source.assets_bundle`, and `source.clone_handover_artifact` (mandatory). **Do not load** `prd-minimal` as a substitute for the full PRD here — the full PRD + architecture/ADRs are required at this stage.

   **Feature PRDs (PRD-001+):** Produce a task breakdown scoped to this feature only. Do not re-plan the whole project.

   **Output contract:**
   - Read `.agent/commands/project/dev-flow/templates/task-breakdown.template.md` for the output structure.
   - Write to: `project-planning/plans/task-breakdown-<timestamp>.md` only.
   - **Mandatory fields for every task:** Task ID (T001, T002, ... zero-padded three digits; stable and unique), Title, Description, Expected Output, Depends on (comma-separated Task IDs or `none`).
   - **§ 4b Important Test Cases:** Initial list of test cases per epic/feature for QA Specialist to expand.
   - **§ 5 must carry an explicit task owning the POC's VISUAL LAYER — mandatory when the run has a selected POC** (`ui_design.selected_poc_path` or `ui_design.selected_variant_path` is set). Name **one task whose Expected Output is the POC's stylesheet ported into the app** — its tokens, its component rules, its layout — not "style it like the POC" scattered as a clause inside each component task. **Cause, so the next reader understands why this exists:** a breakdown decomposed by *behaviour* (components, states, data, degradation) cannot surface work nobody allocated, and structural green plus visual zero is a stable, self-consistent state. Observed: a site rendered with **zero component CSS through three tranches and 517 passing tests** — `HeaderShell.tsx` emitted `className="site-header"` and `grep '\.site-header\s*{' src/` returned nothing. Every gate read DOM markers and passed.
   - **§ 8 must require a pixel capture-and-compare against the POC before a tranche closes** (same condition). One line naming the check: a rendered screenshot of what the tranche delivered, compared against the POC's corresponding view, at that tranche's own exit. **Structural assertions cannot see this class of defect** — a `className` renders identically whether or not a rule exists for it.
    - **Unless the brief declares the platform cannot do it.** Check the task-breakdown brief for `per_tranche_visual_compare`. When it carries `supported: false`, § 8 must **state the substitution and name the declaration as its source**, then carry every entry of the brief's `substitute` list verbatim as plan content — typically a first-real-host-render exit condition on tranche 1 plus ONE batched compare at the build gate. **Check each `substitute` entry against the incapacity that produced it, before carrying it.** The brief may declare `substitute_precondition`; apply it whether or not it does. A substitute that requires the very thing whose absence made the gate unsupported **is not a substitute** — it is the same gate wearing different words, and a plan that carries it verbatim is *textually compliant and materially empty*. Name every unsatisfiable substitute **as unsatisfiable**, and do not present the list as discharged. **When every surviving substitute is a non-compare, say plainly that the visual layer is produced and never observed** — that is a run-level fact for the spec's success criteria, not a line in § 8. Measured 2026-09-04 (F-L2): a declaration correctly stated Mode A cannot render outside a host frame, then offered three substitutes of which **two required a host frame**; only the non-compare survived, and nothing noticed.

**Silently omitting the compare is a planning defect; so is carrying a per-tranche compare the platform cannot run.** Cause (a Marketplace build, 2026-09-01): with no way to declare the incapacity, a mandated gate degraded into six individually-reasonable deferrals — the first tranche's visual layer shipped unseen and the first real render happened after tranche 4, on operator initiative. **A gate deferred every tranche was never a gate.** The porting task in § 5 is never waived by this — only the compare is.
   - **§ 4c Implementation execution contract (mandatory — must not be thin):** Fill all 7 subsections per `.agent/glossary.md` § "§ 4c — Implementation execution contract". Include the **winning POC path** (`project-planning/design-prototypes/poc-vN-prdNNN/`) in 4c-4 as the canonical visual reference. If § 4c is thin the Developer will be forced to open upstream docs — that is a planning failure, not a Developer workaround.
   - **Section 5 Execution order — component-vertical tranches (rule `71-delivery-loop.mdc`):** Group the Task IDs into an ordered sequence of **tranches**, decomposed **by component first, then additional logic** (see `.agent/glossary.md` § "Tranche"). One tranche **per component** — each a full **vertical slice** carrying *all* that component's items (its data layer + the component + registration + variants + its tests), **not** a horizontal layer split across many components — followed by cross-cutting **additional-logic** tranches (navigation, theming, routing, app-level wiring). Each component tranche is a **delivery-loop unit** (`.agent/glossary.md` § "Delivery loop"): it is implemented, code-reviewed, and tested as a whole before the next component starts, so the operator gets granular per-component progress. Still emit the flat numbered order (mirrored into § 0), but the **tranche grouping** is what the delivery loop reads. A 🔍 probe tranche still leads when a component rests on a load-bearing unknown. This applies to **every** composition, pack-active or not; a bug / small FRD with a single component collapses to one tranche.
    - **No UI tranche against an uncaptured SDK shape — when the brief declares `sdk_call_inventory`.** Read the declared `artifact` (the architect wrote it; its path is in the declaration and in `canonical_artifacts` / the architecture doc). For every component tranche, name the inventory rows it reads. **A tranche may not be planned against a row whose `status` is not `captured`** — that row becomes a 🔍 **probe tranche**: blocking, first, alone, with the exit condition *"row `<call>` reaches `captured` — one real response from the call as the app makes it, committed under `project-planning/captures/` and the `reads` path confirmed present in it."* Only then may the dependent component tranche be scheduled. State the pairing explicitly in § 5 (which tranche reads which rows) so the dependency is checkable rather than implied; a row nothing is planned against needs no probe (the declaration's `not_a_veto`). **Do not substitute a hand-written fixture for the capture** — rule `30`'s independently-sourced-fixture clause applies at its strongest here: a fixture invented for a shape nobody captured encodes the author's misreading and then confirms it, which is strictly worse than having no test, because it converts an open question into a green one. Cause (a Marketplace build, 2026-09-02): the app's primary check never executed once — `usePageScan` read `ctx.siteInfo?.rootPath` where the tenant nests it at `siteInfo.properties.rootPath`, so every internal link took the "excluded" branch and the panel reported *"No findings on this page"*. It survived 261 unit tests (the fixture encoded the same misreading), `tsc` (index signature), code review (internally consistent), four mutation-proven prohibition gates (they assert what the app must NOT do) and a POC self-test (it checks the POC against itself). **Not one gate in the pipeline asked whether the feature does its job**, and no gate of that same structural kind would have.
    - **Tranche independence — declare only what is PROVABLE (rule `71` § "Parallel tranches").** After sequencing the tranches, add a **Tranche independence** block to § 5 naming any set that may run **concurrently** (one triad each, isolated git worktrees). A set qualifies only when **all five** hold, with the evidence stated concretely: (1) no 🔍 probe tranche still pending or unconfirmed — probes are **blocking** and run first, alone; (2) no `Depends on` path between them in the transitive closure; (3) § 4c-5 file sets **disjoint** (generated `.sitecore/*` build output exempt — regenerated once at the join); (4) no shared mutable state — `sitecore.config.ts`, `next.config.*`, `package.json`, `.env*`, shared types/barrels, or shared **live-tenant items** (Available Renderings, Page/Partial Designs, placeholder settings, insert options); (5) the evidence for 2–4 is nameable, not "they look separate."
      **`Concurrent sets: none` is a correct answer and the safe default** — sequential costs only wall-clock, a wrong split corrupts the build. Do **not** declare a set to look thorough. Where the composition declares shared live-tenant state (the brief's `hooks.tranche_join`), component tranches typically contend on it: either state that the shared write is **deferred to the join**, or declare nothing.
    - **Full clone mode planning rule (mandatory when `source.clone_scope_mode == full_website_clone`):** Planning may phase implementation, but the task breakdown must keep full website clone parity as the end-state contract. Section 5 must include explicit route/component/content closure tranches derived from source-analysis artifacts and the clone handover, with unresolved deltas surfaced as explicit backlog tasks.
   - **Do not** finalize TDD enforcement or set `task_breakdown_style: tdd` — that is QA Specialist's job in step 2.
   - Update `canonical_artifacts.task_breakdown` in the run manifest.

   **Handoff:** Present task list to user; ask for changes; revise until satisfied. Step 2 (QA Specialist) then edits the same file in place.

   **1b. ADRs from task planning (when it makes sense).** After the user agrees on the task list, scan for **new** technical commitments; add ADRs and index rows as needed.

   **§ 4c enrichment — the task-breakdown brief.** Run `node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage task-breakdown --record <product>/project-planning/workflow --md` (the `--record` flag stamps `packs.briefs_resolved[]` as a side effect of composing the brief — `/ship` fails on a pack-declared stage that has neither a stamp nor a reasoned waiver). Load its skills by policy and satisfy **every** `additions.section_4c_requirements` entry — each names a § 4c subsection and what must be concrete in it. A `MANDATORY when` skill here is a **planning-time** gate: a plan that violates the convention is rejected now, not at `/implement`. The brief's `tranche_shape` sets how § 5 slices, and its `additions.tranche_template` (where present) is the per-tranche cycle that shape implies.

   > **The Lead Developer (06) holds no Bash and cannot run that command.** The orchestrator
   > resolves the brief and passes it down in the spawn prompt. Measured 2026-08-24: a real run
   > reconstructed the brief by reading `pack.json` files directly and said so — that is the
   > second resolution path `platform-pack.md` § 6 forbids, and the reconstruction is exactly
   > how two readers of one contract end up with two answers. QA (07) does hold Bash.


   Legacy detail, still true and now pack-supplied:
   - `4c-3` — the scaffold command from the brief's platform, as the **first** execution step.
   - `4c-5` — the platform's file/module conventions (component-map registration, variant file naming, source-folder grouping). Per-concern detail lives in the brief's skills.
   - `4c-6` — exact SDK query/mutation keys and param structures, cited from the brief's skills.
   When no content-model reference is selected, note in `4c-6` that the Developer designs components freely per the platform's patterns. The scaffold command in `4c-3` still applies.

   **§ 4c gate check (mandatory before proceeding to step 2):** Before presenting the task breakdown to the user, verify each § 4c subsection is either filled or explicitly marked `N/A — <reason>`. Check:
   - `4c-1` Non-negotiable technical boundaries: at least one entry (or `N/A`)?
   - `4c-2` ADR one-liners: one line per ADR that affects this plan (or `N/A`)?
   - `4c-3` Stack / tooling specifics: package manager, test runner, build command present?
   - `4c-4` UI implementation notes: tokens / colors / typography present, or `N/A`?
   - `4c-5` File / module structure and naming conventions: stated?
   - `4c-6` Integration and API contract notes: all external calls covered, or `N/A`?
  - `4c-7` Parity / rebuild pointers: set per manifest `analysis_mode`, or `N/A — greenfield`? If `source.clone_scope_mode == full_website_clone`, this subsection must reference `source_analysis_artifact`, `content_dump`, `assets_bundle`, and `clone_handover_artifact`, and must state full-clone closure criteria.

   If any subsection is blank (not explicitly `N/A`), **do not proceed**. Ask the Lead Developer persona to fill the gap before moving on. Only once all subsections are filled or explicitly marked `N/A` may you continue.

   **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "plan_ready", agent: "06-lead-developer", outcome: "completed", … }`. On failure, append with `outcome: "failed"` and the error message, then stop.

   **Soft gate (default autonomous).** `/task-breakdown` is a SOFT top-level gate — auto-continue from step 1 (Lead Developer) to step 2 (QA Specialist enrichment) without stopping. Briefly state: *"Lead Developer task breakdown is complete. Continuing to QA enrichment."* Then proceed. **Stop ONLY** when the operator listed a task-breakdown stop in `scope_dial.extra_stops` (e.g. `task-breakdown`, `after /task-breakdown`) — then output: *"Lead Developer task breakdown is complete. Reply **YES** to continue to QA enrichment, or describe changes."* and **wait** before step 2.

   Most operators do not want to read the Lead-Dev → QA diff; they want the final QA-enriched task breakdown only — hence auto-continue by default (glossary § "Operator Gate": the top-level `/task-breakdown` gate is soft by default).

2. **QA Specialist — edit task breakdown in place (interactive; mandatory).** **Spawn sub-agent: QA Specialist.** Spawn an isolated sub-agent. Prompt must include: read `.agent/agents/team/07-qa-specialist.md` for identity (spawn it via `Agent(subagent_type: "qa-specialist")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). **Task:** Enrich the task breakdown from step 1 by editing it in place to enforce TDD discipline.

   **Inputs to load:** Full PRD + architecture file (or ADRs when minimal track) + optional selected UI variant path + the task breakdown file from step 1 (`canonical_artifacts.task_breakdown`). These are needed for gap analysis and enrichment only — **Developer (08) will not inherit this full context.** If tests or acceptance criteria depend on UI or architecture detail that is only in those files, copy or summarize the relevant detail into § 4c or the per-task spec.

   **Pre-QA snapshot — conditional, not default.** See `.agent/glossary.md` § "Pre-QA snapshot". Default to skip; opt in only when interactive human review of the Lead-Dev → QA diff is happening.

   **Output contract (edits to the existing task breakdown file — same path, no new file):**
   - **§ 9 — TDD and quality contract (add if missing):** State the RED → GREEN → REFACTOR mandate for all implementation work — unit, integration, UI/component, API, E2E as applicable. No production code before a failing test for that behavior. Label any task that is docs-only or non-code explicitly.
   - **§ 10 — Per-task test specifications (add):** For each Task ID (or task group), list meaningful tests: scenario name, expected outcome, test type (unit | integration | UI | E2E), suggested file location / naming convention.
   - **§ 10a — Requirement-to-test evidence map (add, mandatory):** One row per PRD user story / FRD acceptance criterion / bug RED test. Link each requirement to Task ID(s), test type, test file or command, and coverage status (`pending` | `covered` | `manual-only` | `not applicable` | `deferred`). Scale row count by `work_item_type` — bugs stay to one primary row plus named smoke steps.
   - **§ 4b — Strengthen:** Expand the initial Important Test Cases with concrete, traceable cases linked to Task IDs.
   - **Depends on / Execution order — adjust for test-first:** Where TDD applies, the failing-test task must appear before the implementation task in Depends on. If the Lead Developer's ordering was test-after, reorder it. Preserve stable Task IDs; use suffixes (T012a, T012b) if tasks must be split.
   - **§ 4c — Extend if needed:** If a per-task test requires UI, architectural, or parity detail not already in § 4c, add it so Developer never needs to open upstream docs.
   - **Meaningful tests only:** Every test spec asserts behavior users care about — not trivial identity checks.
   - After enrichment: set `task_breakdown_style` to **`tdd`** in the run manifest when the breakdown enforces test-first ordering; otherwise keep `standard`.

   **Handoff:** Present changes to user; revise until satisfied. Developer (08) in `/implement` reads only `prd-minimal` + this enriched file.

   **Optional standalone `qa-report.md`:** If **minimal track**, ask whether to also write `qa-report.md` or rely on the enriched task breakdown only. If full track or user wants it: read `.agent/commands/project/templates/qa.template.md`. Use the canonical PRD, architecture or ADRs, and **enriched** task breakdown. Write `project-planning/plans/qa-report.md` only if requested; update `canonical_artifacts.qa_report` or set **`null`**.

   **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "qa_ready", agent: "07-qa-specialist", outcome: "completed", … }`. On failure, append with `outcome: "failed"` and the error message, then stop.

   **Then output:** "QA enrichment is complete." **Do not stop and wait** — continue to step 3. (The operator can still revise the breakdown afterwards; a mid-stage confirmation stop was removed on 2026-07-30 because `/task-breakdown` carries no gate token and therefore could not be unticked.)

3. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt. Default-skip; appends a friction-log entry only if the operator types a one-liner.

4. **Handoff (SOFT operator gate).** Summarize artifacts (task breakdown **after QA**, optional `qa-report.md`). Then apply the **soft** operator gate per `.agent/glossary.md` § "Operator Gate" — `/task-breakdown` carries **no gate token**, so it auto-continues. End the message with: *"Recommended next: `/implement` (slim context: `prd_minimal` + enriched task breakdown)."* Do **not** stop and wait.

   **Exception — the operator asked for a stop.** When `scope_dial.extra_stops` contains a task-breakdown stop, promote this close to hard: *"Planning is complete. Reply **YES** to proceed to `/implement`, or describe changes to the task breakdown / § 4c first."* and wait. Same escalation applies on any `[BLOCKER]` Operator Checkpoint item or a critical trigger (below).

## Validation

Before finishing, verify:

- **§ 5 carries a `Tranche independence` block** — either `Concurrent sets: none` or one or more sets with **named evidence** for every one of the five checks (rule `71`). A declared set with hand-wavy evidence ("they look separate") is a planning defect: send it back or downgrade it to none. 🔍 probe tranches are sequenced first and marked blocking.
- **The POC's visual layer has an owner (when `ui_design.selected_poc_path` / `selected_variant_path` is set):** § 5 names an explicit task whose Expected Output is the ported stylesheet, **and** § 8 carries the per-tranche pixel capture-and-compare against the POC. Missing either is a planning defect — send it back. A behaviour-decomposed plan cannot surface work nobody allocated, and no structural assertion detects a component that renders its class names with no rules behind them.
- The task breakdown exists with task IDs (T001, T002, ...), Depends on, Execution order, **§ 4c** (all seven subsections `4c-1`–`4c-7` filled or explicitly `N/A — <reason>`; no blank subsections), **sections 9–10** (TDD contract and per-task tests), and **§ 10a** (requirement-to-test evidence map with every in-scope requirement/AC/RED test row present) **after QA (07)** unless explicitly waived (should not happen in normal flow).
- When `source.clone_scope_mode == full_website_clone`, the task breakdown references all four source artifacts (`source_analysis_artifact`, `content_dump`, `assets_bundle`, `clone_handover_artifact`) and Section 5 includes explicit full-clone closure tranches (route/component/content) rather than a subset-only endpoint.
- **Standalone QA:** If `canonical_artifacts.qa_report` is a string path, `qa-report.md` exists. If **`null`**, the **enriched** task breakdown is the test contract.
- Both run-manifest files exist and reference the same canonical artifact set (including explicit `null`s where applicable).
- **Pack-active runs:** every `additions.section_4c_requirements` entry from the task-breakdown brief is satisfied in the named § 4c subsection — including the scaffold command as § 4c-3's first execution step.
- The enriched breakdown is complete enough that the Developer never needs an upstream doc — the stage auto-continues, so completeness (not an operator confirmation) is what guards the handoff.
- `stage_history` contains entries for `plan_ready` (after Lead Developer 06) and `qa_ready` (after QA Specialist 07).

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage task-breakdown` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "task-breakdown", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Output rules

- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it **above** the artifact summary and the "next step" line. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "task-breakdown"`. Typical sources at `/task-breakdown`: § 4c subsections marked `N/A` that the operator should validate (assumption), RED-test scaffolds written against assumed SDK shapes lacking `.d.ts` or captured-fixture provenance (concern), tasks the QA Specialist split or reordered that diverge meaningfully from the Lead Developer's original plan while auto-continuing (the default soft task-breakdown gate) (assumption), test fixtures the operator must capture before `/implement` can proceed against real-tenant data (decision).
- Report which PRD was used and which files were written.
- **Operator gate — SOFT (auto-continue unless critical)** per `.agent/glossary.md` § "Operator Gate". `/task-breakdown` carries **no gate token** in `scope_dial.gates`, so it must not hold a stop the operator has no way to untick — a hard stop here made `fully_autonomous` unreachable. Clean runs end with the one-line "Recommended next: `/implement`" from step 4 and **do not** stop and wait. **Critical triggers that escalate this run to a hard stop:** (a) `scope_dial.extra_stops` names a task-breakdown stop (the operator explicitly asked for one); (b) § 4c has a blank subsection that could not be filled or explicitly `N/A`-ed; (c) a test fixture must be captured against a real tenant before `/implement` can proceed; (d) any `[BLOCKER]`-tagged item in the Operator Checkpoint. When triggered, end with: *"STOP — `<reason>`. Reply **YES** to override and proceed to `/implement` anyway, or address the issue first."*
  - **Changed 2026-07-30.** This close was previously HARD and self-described as one of "the two hard gates". That contradicted the five-token gate ladder (glossary § "Operator Gate", `/create-prd` § Inheritance and override, root `CLAUDE.md`), which lists `/task-breakdown` as soft and gives it no token. The token ladder wins.
- If the user asks to redo a stage, repeat that stage interactively and overwrite the artifact; then continue or stop as the user prefers.
