---
name: architect
intent: planning
writes:
  - products/<product-slug>/project-planning/specs/prd-minimal-NNN.md (refresh when PRD changed during planning; usually already from /create-prd)
  - products/<product-slug>/project-planning/architecture/architecture-<timestamp>.md (full track only; omit on minimal track)
  - products/<product-slug>/project-planning/ADR/adr-*.md
  - products/<product-slug>/project-planning/ADR/README.md
  - products/<product-slug>/project-planning/baseline.md (baseline-promotion gate, schema 7+)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/04-software-architect.md
  - .agent/commands/project/dev-flow/templates/architecture.template.md
  - .agent/commands/project/dev-flow/templates/prd-minimal.template.md
  - .agent/commands/project/dev-flow/templates/baseline.template.md
  - .agent/manifests/run-manifest.template.json
---

# /architect — Architecture from PRD

## Pipeline position

This command is part of the development pipeline: `/prime` → `/rubber-ducky` → `/create-prd` → `/challenge-prd` → **`/architect`** → `/design` → `/task-breakdown` → `/implement` → `/code-review` → `/test` → `/ship` (`/document` is on-demand, not in the canonical sequence). UI design was extracted into the standalone `/design` stage. Optional pre-step: run `/source-analysis` only when the operator explicitly requested URL rebuild parity extraction. If that run resolved `source.clone_scope_mode == full_website_clone`, this stage must treat full clone parity as the non-negotiable planning target.

**Git context:** This command runs on the feature branch (`prd-NNN`) created by `/create-prd`. All writes (architecture blueprint, ADRs) land on that branch.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. All `project-planning/...` paths in this command are under **`products/<product-slug>/project-planning/`**.

## Work item type routing (schema 8+)

Read `work_item_type` from the run manifest (treat a missing field as `prd` — legacy). This command's applicability depends on it (see `.agent/glossary.md` § "Work item type"):

- **`prd`** — run normally (this is the default weight).
- **`frd`** — **skipped by default** (`scope_dial.track: minimal`). Run ONLY when the FRD's § 6 flagged a genuine ADR-worthy decision, and the operator opts in. When skipped, the FRD goes `/create-frd` → `/task-breakdown` directly.
- **`bug`** — **not applicable.** A bug never runs `/architect` (its root cause is a contained fix, not an architectural decision; if it needed architecture it would have hit the not-contained valve and been promoted). If invoked on a `bug` manifest, stop and report the misroute.

## Goal

Take a PRD and run **interactively** through the architecture stage: Software Architect (04) → ADRs (→ optional baseline promotion). **Minimal track** is supported per `.agent/WORKFLOW.md`. When done, hand off to **`/design`** for UI design + POC clickdummies — or directly to `/task-breakdown` when there is no UI scope.

## Sub-agent orchestration

This command uses the **sub-agent orchestration model** defined in `.agent/WORKFLOW.md`. The **Team Lead** (main context) spawns the specialist as an **isolated sub-agent** with only its mandated inputs per the Slim Context Chain table. The sub-agent writes its artifact to disk and completes — its context is freed. The Team Lead validates the output and presents it to the user at the gate.

## Inputs

- **Optional first argument:** Path to a PRD file. If omitted, resolve from `project-planning/workflow/current-run.json` → `canonical_artifacts.prd`. If the manifest is missing or that entry is absent, use the **latest PRD** in `project-planning/specs/` (see `.agent/WORKFLOW.md`: prefer `prd-NNN.md` with highest N; else latest-by-timestamp).
- If no PRD exists, tell the user and ask for a path or run `/create-prd` first.

## Interactivity rule

- **Every stage is interactive.** After the architecture artifact, pause and:
  - Summarize what was produced and key decisions.
  - Ask the user if they want to adjust anything before continuing.
  - If the user requests changes, revise the artifact and confirm again.
- Ask 1–3 focused questions when something is ambiguous; wait for answers before proceeding.

## Timestamp rule

- If `project-planning/workflow/current-run.json` exists and references a canonical PRD, reuse that `run_id` for all outputs in this run.
- Otherwise, if the chosen PRD file name includes a timestamp in the form `*-<timestamp>.md`, reuse that timestamp.
- Otherwise, resolve a fresh timestamp and ensure the run manifest is initialized (or updated) so all artifacts from this run share the same id.

## Steps

0. **Auto-archive is RETIRED (was schema 7) — no action.** This step used to move superseded `project-planning/architecture/architecture-*.md` into `archive/` before writing a new blueprint. Under artifact durability tiering (schema 8+) the whole `architecture/` folder is untracked, so predecessors are invisible to git and the move accomplished nothing. Write the new timestamped blueprint directly; leave predecessors in place. `notes.archive_skip` is retired. The durable architectural record is the **ADRs**, which are tracked and never swept. See `.agent/glossary.md` § "Artifact durability tiering".

1. **Resolve PRD, planning track, and platform target.** From argument, run manifest `canonical_artifacts.prd`, or latest PRD in `project-planning/specs/`. Read the PRD in full. Confirm which PRD is in use. Ask whether to use the **full** planning pack or **minimal** track (see `.agent/WORKFLOW.md`):
   - **Full:** separate architecture blueprint → ADRs.
   - **Minimal:** no `architecture-<timestamp>.md` file; set `canonical_artifacts.architecture` to **`null`**; ADRs capture decisions from the **PRD** (and existing ADRs).
   If the run manifest does not exist or does not reference this PRD, create or update `project-planning/workflow/run-<timestamp>.json` and `project-planning/workflow/current-run.json` with the chosen PRD and run_id. Record the chosen track in manifest `notes` if helpful (e.g. `planning_track: minimal`).

   **Resolve the composition:** read `packs` from the run manifest — intake resolved it at step 0 (`.agent/commands/project/platform-pack.md`). If it is absent (a legacy run), apply the ladder there yourself: inherit from the latest manifest, else detect, else **ask once**. All dimensions at their null ⇒ every pack substep below is inert and the architecture stays fully agnostic.

   **Resolve architecture budget (`scope_dial.architecture_budget`).** Controls how much new architecture the run may introduce. Resolve in priority order:
   1. Slash arg or message signal: `budget=lean|mindful|deliberate` (or clear equivalents: "keep it simple", "minimal architecture" → `lean`; "deep architecture pass" → `deliberate`).
   2. Existing value in run manifest `scope_dial.architecture_budget`.
   3. **Default: `mindful`** when unset — right-sized design, justify complexity, avoid speculative abstractions. Do **not** ask every run unless the user explicitly wants to choose.

   | Level | Behavior |
   |-------|----------|
   | **`lean`** | Reuse existing patterns and baseline; minimum new ADRs; no new abstractions, layers, or dependencies unless the PRD/FRD requires them. Prefer extending code over introducing frameworks. |
   | **`mindful`** *(default)* | Right-size to requirements; every new abstraction, boundary, service, queue, cache, state store, or dependency must name the concrete requirement or risk it serves. Reject speculative "future-proof" designs — move those to PRD § Future Opportunities. |
   | **`deliberate`** | Deeper architecture pass for high-risk, public, multi-system, compliance-sensitive, or long-lived work; still no abstractions without stated rationale. |

   Record the resolved level in `scope_dial.architecture_budget`. The Software Architect sub-agent prompt **must** include the chosen budget. `/code-review` later verifies the implementation stayed within it.

2. **Architecture (interactive; full track only).** If **minimal track:** skip this subsection; go to **2b** using the **PRD** as the sole source for new ADRs (no architecture file). Set and keep `canonical_artifacts.architecture` **`null`**. **Architecture budget still applies** to ADR creation in step 2b.

   If **full track:** **Spawn sub-agent: Software Architect.** Spawn an isolated sub-agent. Prompt must include: read `.agent/agents/team/04-software-architect.md` for identity (spawn it via `Agent(subagent_type: "software-architect")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). **Task:** Convert the canonical PRD and existing ADRs into a technical architecture blueprint. **Architecture budget:** `<lean|mindful|deliberate>` from `scope_dial.architecture_budget` (default `mindful`).

   **Inputs to load (slim context):** Full PRD for this initiative + `project-planning/ADR/README.md` + any ADR files that apply to this product. Optional: `project-planning/plans/prime.md` if the PRD does not state stack/test conventions. Load `source.source_analysis_artifact` whenever it exists (mandatory for rebuild/parity runs). When `source.clone_scope_mode == full_website_clone`, also load `source.content_dump`, `source.assets_bundle`, and `source.clone_handover_artifact` (mandatory; if missing, stop and send the run back to `/source-analysis` to emit it). **Do not load:** brain-dump files, prior chat, task breakdowns, UI specs.

   **Feature PRDs (PRD-001+):** Produce a feature-scoped architecture delta — how this feature integrates with the existing system. Do not redesign the whole system.

   **Full website clone mode contract (mandatory when `source.clone_scope_mode == full_website_clone`):**
   - Treat exact full-clone parity (route + component + content within legal replacement boundaries) as the run-family definition of done.
   - You may phase delivery for risk control, but you may not silently redefine done to subset parity. Any narrowing requires explicit operator override and must be logged in `operator_attention`.
   - The architecture document must include a dedicated `Clone scope contract` subsection (under Architecture Overview) stating: full-clone target, source-analysis artifacts consumed, and phase-level route/component/content closure deltas.

   **Output contract:**
   - Read `.agent/commands/project/dev-flow/templates/architecture.template.md` for the output structure.
   - Write to: `project-planning/architecture/architecture-<timestamp>.md` only.
   - **11 sections required:** Architecture Overview, System Components, Architecture Diagram (textual), Data Model, API Design, Infrastructure & Deployment, Technology Stack, Security Considerations, Risks & Tradeoffs, Open Questions, Key decisions (for ADRs). Section 11 must list every significant choice that should become an ADR — one line per decision, stating what was decided and why.
   - Update run manifest `canonical_artifacts.architecture` with the file path.

   **Pack enrichment — read the brief before presenting the architecture to the user:**

   ```sh
   node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage architect \
     --topology <the run's repo_topology, when the platform offers a choice> \
     --record <product>/project-planning/workflow --md
   ```

   > **`--record` is not optional and it is not a separate step.** The stamp is written by the
   > resolver itself, as a side effect of composing the brief, so it exists only if the brief was
   > really resolved — an agent cannot assert it without doing the work. `/ship` fails when a
   > pack-declared stage has neither a stamp nor a reasoned waiver
   > (`.agent/scripts/check-brief-coverage.mjs`). Cause, 2026-09-02: the first full marketplace run
   > resolved 5 of 9 declared stages and nothing could see the other four — including `/test`'s
   > MANDATORY `live-walkthrough` axis and `/code-review`'s two CRITICAL-severity SDK skills.


> **Who runs this matters.** `resolve-packs.mjs` needs Bash, and the Product Manager (02),
> Lead Developer (06) and Doc Writer (09) **do not hold it**. Where this stage spawns one of
> them, the **orchestrator resolves the brief and passes it down in the spawn prompt** — the
> same relay the interrogation protocol already uses when a spawned agent lacks
> `AskUserQuestion`. Frontmatter `tools:` is intent, not a runtime guarantee: **check, don't
> assume.** A spawned agent that cannot run the command must say so and use the relayed brief,
> never reconstruct a composition by reading `pack.json` files — that is the second resolution
> path `platform-pack.md` § 6 forbids, and a real run hit exactly this on 2026-08-24.


   With every dimension at its null the brief is empty and the architecture is fully platform-agnostic. Where a pack is active, apply it:
   - **Load the brief's skills** by the policy each one carries. A `MANDATORY when` entry is not "as relevant" — when its predicate holds, that skill's constraints bind the ADR (Edge complexity limits bound a GraphQL-shaped decision; a navigation pattern that is *the* canonical answer forecloses the alternative).
   - **Run `additions.types_install` when the brief declares it — BEFORE evaluating the SDK gate below.** It installs the platform's SDK packages purely to read their `.d.ts`, at the `cwd` it names. Without it, a platform that scaffolds nothing before `/implement` reaches 2a-bis with **no `node_modules` to cite and no captured fixture**, so the gate is unsatisfiable by construction and the run can only override it or proceed on unverified shapes — two states that look identical to a green run. Its `commit` key says what is version-controlled (the manifest files, never `node_modules/`), which is what makes each citation reproducible at the version it was read. This is **not** a scaffold and does not replace `scaffold` on `implement` (rule `50-scaffold` still governs that). Expect some responses to be declared `unknown` — that is a real answer that narrows the probe to the calls which genuinely still need a captured shape.
   - **Every entry in `additions.required_adrs` gets an ADR.** These are the decisions that are always load-bearing for that platform, so a run that silently omits one has an undocumented default, not a simpler architecture.
   - **Write every `additions.architecture_doc_sections` entry** into the architecture document where it says.
   - **Apply the `shape` declaration** if present — it names the tracks the system actually has, and every ADR must say which side of a sync gate is the source of truth.
   - **`existing_site_rebuild` — consume the discovered model, don't re-assume it.** Where the brief declares it and the run matches its `when`, load the named artifact and treat it as the design contract; do **NOT** emit `[ASSUMED]` shapes for components that already exist, and cite the inventory. If the run matches but the artifact is **absent**, apply the declared `on_absent` — that is a **STOP**, not a warning.
   - Update the run manifest under `architecture.extension_points` with an array of `{ extension_point, route_url, registered: false }` entries so `/ship` can compare against the prior set.

   **2a-bis. SDK contract verification gate (Sitecore/Marketplace tracks).** Before this stage flips to `architecture_ready`, every external SDK call the architecture relies on (each `client.query(...)` / `client.mutate(...)` / `xmc.*` / `ai.*` / `@hey-api/*` / Authoring-GraphQL invocation, and similarly for Content SDK / Edge GraphQL) must carry a **verified-shape citation** in the architecture document. One of:
   - **Type citation:** an inline `// source: node_modules/<pkg>/dist/<path>.d.ts → <Type>` reference pointing at the **declared** request/response shape, OR
   - **Captured shape:** a code-fence containing the actual `JSON.stringify(...)` output of one real call (real tenant, sanitized of secrets/IDs), with a `// captured: <tenant-or-fixture-source> on <YYYY-MM-DD>` comment.

   **The `OR` narrows where the brief declares `sdk_call_inventory`.** When the architect brief carries that declaration, the two bullets above stop being interchangeable for the calls it covers: the architect must additionally write the declared `artifact` — one row per call, carrying every entry of `row_fields` — and a **type citation alone resolves `evidence` but leaves the row at `typed_only`, never `captured`**. Only a response captured from the call **as the app makes it** (the declaration's `capture_must_be_the_shipping_path`) resolves the row's `reads` path. **This is not extra ceremony; it is the only thing that can see the defect class in question.** A type citation is blind to (a) property NESTING under an index signature, (b) a parameter that is optional in the types and required on the wire, and (c) a response declared `unknown`. All three are real on this platform, and the third is measurable from the types themselves — which is why the inventory *narrows* the probe rather than widening it: the rows a `.d.ts` fully answers need no capture, and the declaration's job is to name the ones that do. An out-of-band verification with a bearer token does **not** upgrade a row — it carries tenant scope implicitly and exercises a different call path than the one that ships. Rows left at `typed_only` are carried into the Operator Checkpoint and consumed by `/task-breakdown`, which will not plan a UI tranche against one; they are a **scheduled probe**, not a failure. Cause (a Marketplace build, 2026-08-31 → 09-02): three payload misreadings, all invisible to `tsc`, all against shapes nobody had captured, one of which shipped a panel that reported *"No findings on this page"* past 261 green tests because the fixture was hand-written from the same misunderstanding as the code.

   **Existing-site exception:** for an existing-site rebuild, the `content_model` inventory from `/discover-sitecoreai` (the pulled datasource field types + exact casing) IS the verified shape — cite `sitecore-inventory-<timestamp>.md` per component instead of a per-call `.d.ts` / captured-fixture. (The shapes were captured from the real tenant during discovery, which is exactly what this gate wants.)

   This gate exists because Lead Developer (06), QA (07), and Developer (08) inherit the architect's understanding of every SDK shape. When the architect's understanding is wrong, RED tests pass against shared fiction and the bug only appears at real-tenant smoke. A common failure: treating `xmc.authoring.graphql` **mutations** like queries — the body returns directly at `result.data.iN`, not `result.data.data.iN` (`client.md` § 8b). Skill prose and unwrap matrices can disagree; nothing substitutes for verifying the call before encoding it in the architecture.

   For each cited SDK call, also record the **unwrap level** in plain prose alongside the citation: `single .data` (mutations, base-map queries) or `double .data.data` (`xmc.*` / `ai.*` queries). If the architect cannot confidently classify it, the gate fails and the architect must run the call and capture the shape before continuing.

   **Handoff:** Present main decisions to user; ask for changes; revise until satisfied. Step 2b then creates ADRs from section 11.

   **2b. Create ADRs for architectural decisions.** Read `project-planning/ADR/README.md` and `project-planning/ADR/template.md`. From the **architecture document** (full track) **or the PRD** (minimal track), identify every **fundamental architectural decision** that should be recorded (e.g. technology stack, frameworks, languages, deployment model, security approach, data/store choices, key patterns). Prefer **one primary decision per ADR**; split unrelated choices into separate files (see ADR README). For each such decision:
   - Determine the next ADR number (highest existing `adr-*.md` in `project-planning/ADR/` + 1; never reuse numbers; ADR-0001 is reserved).
   - Create a new file `project-planning/ADR/adr-NNNN-<short-slug>.md` using the template: Context (the issue or question), Decision (what was decided), Consequences (positive, negative, neutral), Status **Accepted**, Date.
   - Append a row to the **Index** table in `project-planning/ADR/README.md` with ADR number, title, and status.
   If the source only repeats or references decisions already documented in existing ADRs, do **not** create duplicate ADRs. **Create at least one ADR** when this run introduces new fundamental decisions (e.g. first time defining stack, deployment, or security for the project), unless every decision is already covered by existing ADRs.

   **2b-i. Deliverable sizing gate.** Before appending the `architecture_ready` `stage_history` entry, **measure four signals and record all four, on every run, whatever the dial says**:

   | Signal | How to count | Threshold |
   |---|---|---|
   | `adrs_new` | ADRs created in **this** `/architect` run (`Date` matches the run timestamp, or the number exceeds the highest pre-run `adr-*.md`) | **≥ 5** |
   | `components` | Distinct components/renderings the architecture + PRD call for | **≥ 10** |
   | `content_types_related` | Content types carrying an authored relationship to **another** type (a standalone type does not count) | **≥ 3** |
   | `tranches_projected` | Component-vertical tranches this implies — one per component, plus additional-logic and any probe tranches (`/task-breakdown` § 5) | **≥ 15** |

   Write them to `notes.sizing` **unconditionally**: `{ adrs_new, components, content_types_related, tranches_projected, thresholds_crossed: [...], delivery_shape, proposal }`. **The measurement is never suppressed by the dial** — a dial that turns off the number is how an operator stops being able to tell a big run from a small one, which is the failure this gate exists to prevent (rule `88`). Under `all` the numbers are still written and `proposal` still records the cut that *would* have been proposed.

   **Then branch on `scope_dial.delivery_shape`** (default `mvp-first`; see `.agent/glossary.md` § "Scope dial"):

   - **`all`** — do not stop. Append an `operator_attention` entry (`severity: warn`, `kind: sizing`) naming the thresholds crossed and the MVP cut that would have been proposed, and continue.
   - **`mvp-first`** with **no** threshold crossed — do not stop. Continue.
   - **`mvp-first`** with **any** threshold crossed — **HARD STOP** and propose an **MVP cut**.

   **Under `fully_autonomous` (every gate token off) there is nobody to ask**, so apply the dial's default — propose nothing, take `mvp-first`'s smallest shippable cut if one is derivable and otherwise continue whole — and record the decision in `operator_attention`. A gate is a token, never a stage: this step must not become an unskippable stop.

   **The MVP cut is the default proposal, and phasing is the fallback — this is deliberately the inverse of the pre-2026-09-25 behaviour.** A tranche is a checkpoint for the *builder*; it is not a deliverable for the *operator*. Ordered phases inside one spec give N places to look and **zero shippable artefacts** until the end, so the operator's only real decision — "is this what I wanted?" — arrives after the money is spent. Where the phases *are* independently shippable they must be separate PRDs, with **PRD-000 as the MVP**. Where they are genuinely not, phasing is still right. Output:

   ```
   ARCHITECT HARD STOP — deliverable sizing gate

   Measured: N new ADRs · C components · T cross-related content types
             · P projected tranches
   Crossed:  <list the thresholds that fired>

   The full vision STAYS IN THE SPEC — it is what the follow-on PRDs are
   cut from. What is in question is how much of it is ONE deliverable.

   Suggested MVP (smallest thing that is shippable AND live):
   - <the layout/chrome + the 1-2 verticals that prove the model>
   Suggested follow-on PRDs:
   - PRD-001: <cluster> · PRD-002: <cluster> · ...

   Choose:
   1. MVP first (RECOMMENDED, default) — PRD-000 becomes the MVP above.
      Requires the three-leg shippability test (glossary § "Deliverable vs
      execution unit"): value / ship / truth, stated per proposed member.
      On a pass, a PROGRAM block is written to notes.program so STATUS.md
      renders "1 of M" and /ship stamps "phase 1 of M — not feature-
      complete". The remaining members are NAMED now and specced later.
      Records `notes.sizing.proposal: mvp_first`.
   2. Phase inside this PRD — one PRD, one deliverable, ordered phases in
      the architecture plan and the PRD's § 12a Execution tranches, each
      closed by a probe or real-tenant smoke before the next opens.
      Correct when the phases are NOT independently shippable.
      Records `notes.sizing.proposal: phased` + `adr_density_phases: N`.
      This /architect run CONTINUES — nothing is aborted.
   3. Build it all, unphased — no cut, no phase plan. Records
      `notes.sizing.proposal: declined`. The ship report flags the bundled
      risk in "What hurt this run", and the operator accepts a heavier
      ship cycle, a wider smoke surface, and no judgeable artefact until
      the end.
   ```

   The Team Lead derives the MVP by asking what the **smallest set of surfaces is that still proves the product's central claim end to end** — typically the layout, chrome, and one or two content verticals with a listing and a detail page — and names the remainder as follow-on members, grouped to minimise cross-member coupling. The operator chooses; **never cut, phase or split unilaterally**, and never present option 1 without running the shippability test first. On **option 1**, follow the program-block procedure in `/create-prd` § "SDK surface heuristic" → *Split escape hatch*; on **option 2**, write the phase plan into the architecture doc's execution-plan section and sync the PRD's § 12a.

   Legacy `notes.adr_density_split` is **read-only history** — written by runs before 2026-09-25 and superseded by `notes.sizing`.

   When the run crosses **two or more** thresholds, or accumulates **12+ new ADRs in one `/architect` run** on top of an already-large ADR set, option 3 is **withdrawn** — at that size an unphased, uncut plan reliably blocks on the last architectural spike while earlier members could have shipped and been judged. The operator picks the cut or the phase plan. This hard stop is strict (no soft-warn intermediate).

   **Measured basis (a prior run's PRD-000, 2026-09-22 → 09-25):** 23 components, 6 cross-related content types, 29 tranches, 17 ADRs — **triple every threshold on three of the four axes**, and nothing in the pipeline raised it. 3.25 calendar days and 22.3 h of engaged agent time produced no artefact the operator could judge until the end, at which point they said, verbatim, *"I have literally no idea if it is great, what I want, or something else."* Four Criticals in that build were found by looking at the running site and none by a mechanical gate — which is the argument for an early deliverable, not for more gates.

   **2b-ii. Baseline-promotion gate (schema 7+).** After ADRs are created in this run and BEFORE appending the `architecture_ready` `stage_history` entry, count the TOTAL ADRs in `project-planning/ADR/` (excluding ADR-0001 if it's the framework's `use-adrs-as-architecture-backbone` boilerplate). When the total reaches **≥5** AND either (a) no `project-planning/baseline.md` exists yet OR (b) the existing baseline.md was promoted ≥5 ADRs ago (compare its `promoted_from[]` list to the current ADR count), propose promotion:

   ```
   Baseline-promotion gate (schema 7+)

   This product now has N total ADRs. The framework's baseline-promotion
   threshold (≥5 ADRs since last promotion) is met. Proposed promotion:

   - ADRs to promote (stable, foundational): <list with one-line titles>
   - ADRs to keep separate (recent, PRD-specific, or in active flux): <list>
   - Output file: project-planning/baseline.md

   Promoting consolidates the stable ADRs into one readable constitution.
   Future task breakdowns' § 4c-2 lists only delta ADRs; the baseline is
   the inherited reference. Promoted ADRs are NOT deleted — they stay in
   project-planning/ADR/ as source of truth.

   Promote (Y) / skip this run (n) / promote a custom subset (s) ?
   ```

   Cluster ADRs by what they constrain (architecture mode, data layer, auth, UI framework, deployment, integration patterns, etc.) and propose promotion for clusters whose decisions have survived 2+ PRDs. ADRs marked `Status: Superseded` are NEVER promoted. The operator confirms or skips. On `Y`:
   - Read `.agent/commands/project/dev-flow/templates/baseline.template.md`.
   - For each promoted ADR, write a paragraph summary into `project-planning/baseline.md` grouped by theme.
   - Record `canonical_artifacts.baseline` in the run manifest as the path.
   - Append `stage_history` entry `{ stage: "baseline_promoted", agent: "04-software-architect", outcome: "completed", one_line: "Promoted N ADRs into baseline (themes: …)", deliverables: ["project-planning/baseline.md"] }`.

   On `s` (subset), the architect names a subset list, the operator confirms, and the same write happens with that subset. On `n`, append `{ stage: "baseline_promoted", outcome: "skipped", one_line: "Operator declined promotion; ADR count N" }` and continue.

   When `baseline.md` already exists, the architect MAY also re-promote (replace the file) when ≥5 NEW ADRs accumulated since the prior promotion. Use the same prompt; record re-promotion in the "Re-promotion log" table at the bottom of the file.

   **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "architecture_ready", agent: "04-software-architect", outcome: "completed", one_line: "<≤140 chars>", deliverables: [<file paths>], escalations: [...] }`. On failure, append with `outcome: "failed"` and the error message, then stop. When the ADR-density hard stop ran, also append `{ stage: "adr_density_check", agent: "04-software-architect", outcome: "completed", one_line: "<split|bundled> — <count> new ADRs; clusters: <list>" }` so the choice is auditable. **The choice goes in `one_line`, not in `outcome`** — `outcome` is the closed five-value enum, and this line prescribed `"split" | "bundled"` until 2026-09-02, which is why one manifest carries an illegal `bundled`. Same defect class as the `discovery_summary` one corrected in `02-create-prd.md` the same day: a command prescribing a value its own contract forbids makes every run that obeys it non-conformant.

   **Then output:** "Architecture stage is complete (full track) / ADRs from PRD are complete (minimal track). Recommended next: `/design` (UI) — or `/task-breakdown` directly if there is no UI scope." **Do not stop and wait** — this stage is soft-gated (see *Output rules*); the design taste stop lives at `/design` close, which the operator can untick via `scope_dial.gates.design`. Escalate to a hard stop only on the critical triggers listed in *Output rules*.

3. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt. Default-skip; appends a friction-log entry only if the operator types a one-liner.

4. **Handoff.** Summarize artifacts (architecture, ADRs, optional baseline). Confirm **`canonical_artifacts.prd_minimal`** is set (from `/create-prd` or this run); if the full PRD changed since `prd-minimal` was written, **re-extract `prd-minimal-NNN.md`** now per `/create-prd` step 14 (locate the `<!-- PRD_MINIMAL_BEGIN -->`/`END` block in `prd-NNN.md`, strip the markers + PRD-side heading + blockquote, demote subheadings one level, prepend the prd-minimal frontmatter, OVERWRITE the prior file). Manual hand-edits to `prd-minimal-NNN.md` are lost on this sync — the full PRD's Developer slice is the single source. Tell the user: "Architecture is complete. Run **`/design`** for UI design + POC clickdummies, or `/task-breakdown` directly if there is no UI scope."

## Validation

Before finishing, verify:

- The PRD used is recorded in the run manifest; **`prd_minimal`** is present and aligned (refresh if PRD changed during planning).
- **Full track:** The architecture file exists and all required sections are present; `canonical_artifacts.architecture` is a string path.
- **Minimal track:** `canonical_artifacts.architecture` is **`null`**; no architecture blueprint file was required for this run.
- When this run introduced new fundamental decisions, ADRs in `project-planning/ADR/` and the ADR index (`README.md`) reflect them (or an explicit note that existing ADRs suffice).
- Both run-manifest files exist and reference the same canonical artifact set (including explicit `null`s where applicable).
- **Pack-active runs:** the `packs` block is recorded in the manifest, and **every** `additions.required_adrs` entry from the architect brief has a corresponding ADR. A missing one is an undocumented default, not a simplification.
- **Full website clone mode:** when `source.clone_scope_mode == full_website_clone`, the architecture doc cites `source_analysis_artifact`, `content_dump`, `assets_bundle`, and `clone_handover_artifact`, and includes the required `Clone scope contract` subsection.
- **SDK contract verification gate (Sitecore tracks):** Every external SDK call the architecture cites carries either a `// source: <.d.ts path> → <Type>` citation or a captured-shape JSON fence with a `// captured:` provenance comment. Each call is annotated with its unwrap level (`single .data` or `double .data.data`). Architecture is not `architecture_ready` until this is satisfied. Failure case to remember: mutation single-unwrap regression on authoring GraphQL helpers (`lib/sdk/authoring-resolve.ts` pattern). **Where the brief declares `sdk_call_inventory`, additionally:** the declared `artifact` exists on disk, carries one row per SDK call the architecture relies on, and **every row carries an explicit `status`** from the declared vocabulary. A row with no status, or an inventory that omits a call the architecture cites, fails this gate — an inventory that can be silently partial is the artifact-shaped version of the defect it exists to catch.
- The user was given a chance to refine the architecture before moving on.
- `stage_history` contains an entry for `architecture_ready`.

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage architect` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "architect", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Output rules

- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it **above** the artifact summary and the "next step" line. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "architect"`. Typical sources at `/architect`: SDK shapes assumed from skill docs without a `.d.ts` citation (assumption), ADRs marked "decide later" (decision), uncertain integration contracts where capture-and-fix is the plan (concern).
- Report which PRD was used and which files were written.
- **Operator gate — SOFT (auto-continue unless critical)** per `.agent/glossary.md` § "Operator Gate". Clean runs end with a one-line "Recommended next: `/design`" (or `/task-breakdown` when there is no UI scope) and **do not** stop and wait. The next mandatory stop in the pipeline is at `/task-breakdown` close. **Critical triggers that escalate this run to a hard stop:** (a) SDK contract verification failed (missing `.d.ts` citation or captured-fixture provenance on a Sitecore track, **or** the brief declared `sdk_call_inventory` and the artifact is absent / a row carries no status — note that rows *at* `typed_only` are NOT a trigger, they are a scheduled probe and belong in the Checkpoint); (b) a load-bearing ADR was deferred with "decide later"; (c) any `[BLOCKER]`-tagged item in the Operator Checkpoint; (d) full-clone mode is active but the clone handover/read-set or Clone scope contract subsection is missing. When triggered, end with: *"STOP — `<reason>`. Reply **YES** to override and proceed anyway, or address the issue first."*
- If the user asks to redo the architecture stage, repeat it interactively and overwrite the artifact; then continue or stop as the user prefers.
