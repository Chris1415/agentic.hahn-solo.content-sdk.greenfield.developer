---
name: implement
intent: implementation
writes:
  - products/<product-slug>/project-planning/plans/task-breakdown-<timestamp>.md (§ 0 updated with actual target dir + delivery order; § 8 updated with actual test status)
  - <implementation target directory>/* (source code, tests)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/platform-pack.md
  - .agent/agents/team/08-developer.md
  - .agent/rules/71-delivery-loop.mdc
  - .agent/rules/72-orchestrator-discipline.mdc
  - .agent/commands/project/dev-flow/templates/task-breakdown.template.md
  - .agent/commands/project/dev-flow/templates/prd-minimal.template.md
  - .agent/manifests/run-manifest.template.json
---

> **Schema 7:** `/implement` no longer produces a separate `implementation-runbook-*.md`. The task breakdown's § 0 Quick orientation + § 5 Execution order + § 8 What Needs To Be Tested now carry everything the runbook used to. The Developer updates § 0 in place when the target directory or delivery order deviates from what Lead Dev (06) planned. Schema-6 runs still find their existing runbook on disk; new runs do not generate one.

# /implement — Execute implementation from planning artifacts or freeform prompt

## Pipeline position

This command serves two modes:

1. **Pipeline mode** (default): Part of the development pipeline: `/prime` → `/rubber-ducky` → `/create-prd` → `/challenge-prd` → `/architect` → `/task-breakdown` → **`/implement`** → `/code-review` → `/test` → `/ship` (`/document` is on-demand, not in the canonical sequence)
2. **Freeform mode**: Standalone vibe-coding — skip the planning pipeline, describe what you want directly. The Developer implements from your prompt, then you run `/code-review` → `/test` to verify.

## Mode detection

| Condition | Mode | Behavior |
|-----------|------|----------|
| `current-run.json` exists with `canonical_artifacts.task_breakdown` | **Pipeline** | Use prd_minimal + task breakdown as inputs |
| No manifest or no task_breakdown, but user provides a **text prompt** | **Freeform** | Implement directly from the prompt |
| User explicitly says `freeform`, `vibe`, or `standalone` | **Freeform** | Even if a manifest exists, use the prompt as input |
| No manifest, no prompt, no arguments | **Error** | Ask the user what to implement |

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. In pipeline mode, resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts`. In freeform mode, still resolve the product workspace (for the runbook and manifest paths) but do not require planning artifacts.

## Work item type routing (schema 8+)

Pipeline mode reads `prd_minimal + task_breakdown` regardless of `work_item_type` — the slim-context contract is uniform (see `.agent/glossary.md` § "Work item type"). One behavioral delta for **`work_item_type: bug`**: the task breakdown is the thin TDD pair from `/create-bug` — **T001 is the RED regression test**. Run it first and **confirm it fails (RED)** before implementing T002 (the fix); the bug is done when T001 flips GREEN and stays in the suite. For SDK-touching bugs, a real-tenant smoke is required before `/ship` (it substitutes for the planning gate a bug skips). For `frd` and `prd`, behavior is unchanged.

## Goal

**Pipeline mode:** Turn the approved **`prd_minimal` + QA-enriched task breakdown** into a working implementation while preserving canonical run lineage and making the target directory decision explicit. Apply the **slim context chain** (`.agent/glossary.md`): the Developer loads only `prd_minimal` + enriched task breakdown — not the full PRD, architecture, or UI specs. The winning **POC clickdummy** (`ui_design.selected_poc_path`) is the one allowed exception, opened as visual reference only. Standalone `qa-report.md` is optional summary only. On **rebuild** runs, also use manifest `source` assets. **Legacy:** if `prd_minimal` is missing, fall back once to full PRD + task breakdown and note the gap. This step is intended to **run on its own** once planning is complete.

**Freeform mode:** Implement directly from the user's prompt. The Developer reads the existing codebase (via `/prime` artifacts if available, or by inspecting the target directory directly), understands the current state, and implements the requested changes. No planning artifacts are required — the user's prompt is the specification. A **freeform task-breakdown stub** (§ 0 + § 8 only) documents what was done and keeps `/code-review` → `/test` → `/ship` working from a single canonical file — no separate `implementation-runbook-*.md` (schema 7+). Record `implementation_mode: freeform` in the run manifest.

## Inputs

### Pipeline mode inputs
- Optional slash-command arguments.
- Default source resolution: read `project-planning/workflow/current-run.json` and use **`canonical_artifacts.prd_minimal`**, **`canonical_artifacts.task_breakdown`**, and when not **`null`**: `canonical_artifacts.qa_report`. **Primary implementation inputs:** `prd_minimal` + task breakdown (see `.agent/WORKFLOW.md`, **Slim context chain**). If **`prd_minimal`** is absent (legacy), use **`canonical_artifacts.prd`** (full PRD) **once** for this run and prefer writing `prd-minimal-NNN.md` afterward.
- **`architecture`:** Do **not** load for implementation when `prd_minimal` is present—the task breakdown **§ 4c** must carry architectural boundaries. If `prd_minimal` is missing and tasks omit § 4c, you may load architecture **only** after user confirmation or manifest note (avoid by fixing the task breakdown).
- **Winning POC:** When `ui_design.selected_poc_path` exists in the manifest, the Developer **may** open the HTML/CSS files in that folder as a visual reference during implementation. The POC clickdummy is the canonical look-and-feel reference — when § 4c-4 text and the clickdummy disagree on visual details, follow the clickdummy.
- If `qa_report` is **`null`**, do **not** fall back to a random `qa-report.md` in the folder. If the manifest is missing or an entry is absent, use latest-by-timestamp rules per `.agent/WORKFLOW.md` where applicable.
- **Rebuild runs:** If `source.analysis_mode` is `rebuild`, also use `source.content_dump`, `source.assets_bundle`, and the source-analysis markdown (sections 10–12) when implementing parity.
- Optional explicit implementation target directory may be provided.

### Freeform mode inputs
- **User prompt** — the change request, feature description, or bug fix instruction. This is the sole specification.
- **Optional:** file paths, code snippets, or references the user includes in the prompt.
- **Optional:** `prime.md` if it exists — for codebase context (stack, conventions, test commands). The Developer MAY read it for orientation but is not required to.
- **Optional:** explicit target directory.

## Timestamp rule
- If `project-planning/workflow/current-run.json` exists and references a canonical run, reuse that `run_id`.
- Otherwise, resolve a fresh timestamp for this implementation run and initialize a run manifest before changing code.

## Git — branch verification

### Pipeline mode

The feature branch (`prd-NNN`) was already created by `/create-prd` (step 8).
Before writing any code, **verify** the current branch matches
`implementation.branch_name` from the run manifest. If the branch is wrong
(e.g. still on `main`), check out the correct branch. Do not create a new
branch — if the expected branch does not exist, stop and report the error
(the PRD step was likely skipped or incomplete).

### Freeform mode

Freeform mode has no PRD, so no branch was created upstream. Before writing
any implementation code:

1. **Repository check.** Run `git rev-parse --show-toplevel` from the
   product root. If no git repo exists, follow the **first-time repo
   setup** in `02-create-prd.md` § 8a: ask the stakeholder for a
   pre-created empty GitHub repo URL, record it in the run manifest as
   `implementation.remote_url`, then `git init`, `git branch -M main`,
   ensure `.gitignore` is in place, `git add .`,
   create the first commit with a convention-compliant message (use
   `/commit-message type=chore scope=<product-slug> context="initialize repository"` if needed), then `git remote add origin <remote_url>`,
   `git push -u origin main`. Do not invoke `gh repo create` — the
   stakeholder creates the remote repo out-of-band and hands over the URL.
2. **Branch creation.** Ask the user: *"What should I name the feature
   branch?"* Suggest a slug derived from the first few words of their
   prompt. Create with `git checkout -b <user-chosen-name>` from the
   default branch. Record `branch_name` in the run manifest under
   `implementation`.

## Required behavior
- **The container comes from the pack brief's `workspace` slot; `site/` is the fallback, not the
  rule.** Read `workspace.container` / `workspace.layout` from the brief. A platform that declares
  one owns the answer — for a two-level layout the container is the run's own app folder (a sibling
  of the shared baseline, or nested inside it, depending on the run's repo topology) and **never
  `site/`**. **Take `workspace.layout` verbatim; do not reconstruct it** — where the platform offers
  a repo topology the resolver has already merged this run's choice into it, which is why the brief
  must be resolved with `--topology <the run's repo_topology>`. Omitting the flag returns the
  *default* layout, so a `monorepo` run would scaffold and implement one directory level away from
  its own repo while every check here passed. Only when **no** pack declares a workspace does the
  generic convention below apply, which keeps implementation code out of `project-planning/` at the
  repo root.

  > **This branch was missing until 2026-08-22.** The table below was
  > unconditional, so a platform whose apps do not live in `site/` had **no consumer for its
  > declared workspace** — every such run either took the `target=` override or resolved the
  > container by a path this command never described. The table was right for one layout and silent
  > about the other.

  Before scaffolding, inspect the resolved container and **enforce** the convention:

  | Container state | Action |
  |--------------------|--------|
  | Exists with source files (any non-`node_modules` content) | Use it. Proceed. |
  | Exists but contains **only** `node_modules` (no source committed) | **Stop.** Surface to the operator: *"the container exists but contains no source — likely the implementation was never committed or `.gitignore` swallowed it. Investigate before continuing. Override with `force-site` slash arg only if you understand the state."* This guards the failure mode where the folder looked populated (e.g. only `node_modules`) but held nothing reviewable. |
  | Product root has `src/` (or another implementation folder) at the root level instead of the declared container | **Stop and ask.** This is a legacy root-level layout deviation. Either (a) accept it and continue with the existing folder (record `notes.container_deviation: <reason>` and require a one-line ADR explaining why), or (b) move into the declared container first. Default action: ask. |
  | Neither the declared container nor a root-level implementation folder exists | Create the declared container (or `site/` when no pack declares one). The user may override with an explicit target directory. |

  Slash-arg overrides: `force-site` (proceed with an empty container), `target=<path>` (explicit container).

- Record the target directory in the task breakdown's § 0 Quick orientation and in `project-planning/workflow/run-<timestamp>.json` and `project-planning/workflow/current-run.json`. When a deviation was accepted, record `notes.container_deviation` with the reason and the ADR id.

- **POC clickdummy presence check (light enforcement).** Read `ui_design.selected_poc_path` from the run manifest. If it is non-null but the folder does not exist (or contains no `index.html`), surface a **WARN** to the operator: *"`/architect` recorded a winning POC at `<path>` but the folder is missing. The Developer will implement without the canonical visual reference; § 4c-4 must carry the visual contract instead. Continue (Y) or abort and fix POC (n)?"* This warns rather than blocks because some operators may have removed POCs intentionally; recording the WARN in the runbook makes the gap traceable.

- Resolve planning inputs from the run manifest `canonical_artifacts` (or latest in each directory; for PRD use latest PRD per `.agent/WORKFLOW.md`, if the manifest is missing).

- **Apply every `constraint` in the pack brief.** Each is a standing rule for this stage under the active composition — e.g. which surface the build phase verifies on, and whether publishing is permitted during implementation. A constraint is not advice; it binds the Developer for the whole stage.

- **Live-tenant auth pre-flight (fail fast, before the first live write) — the brief's `preflight_credentials` slot.** A `null` slot (with its reason) means this platform makes no live write during `/implement` and there is nothing to check. Where the slot is populated: before the Developer makes **any** live write, verify **every** credential the live leg needs **in one pass** and stop with the exact re-auth command if any is stale — do not discover an expired token mid-tranche (runs have stalled separately on each of the credentials listed there). Run every `checks[]` entry, apply its stated `remedy`, and **never silently proceed on a mystery credential** — a dead client is flagged for rotation, not worked around. Only when all pass does the live leg proceed; note any credential refreshed in the Operator Checkpoint. This is a **`go_live`-boundary check** — it runs regardless of the gate set (a blocked credential is a genuine blocker, not a review stop).

## Pack brief — the platform's skills, slots and hooks for this stage

**Resolve the composition and read the brief. Do not restate a platform's list here.**

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage implement \
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


The composition comes from the run manifest's `packs` block (resolved at intake step 0 —
`.agent/commands/project/platform-pack.md`). With every dimension at its null the brief is empty and
this stage runs generically — that is the correct outcome, not a missing pack.

**The brief is the delivery channel, and it is generated on every invocation.** Two hand-maintained
skill lists drift by construction — `08-developer.md:125` already concedes it (*"commands name these
too — prefer the invoking command's list"*). One generated list cannot.

**How the Developer applies it:**

- **`Load ALWAYS`** — invoke before writing any code, so command syntax, file conventions, SDK shapes
  and testing recipes don't drift.
- **`MANDATORY when …`** — not "as relevant". The predicate is stated; when it holds, the skill is
  not optional. (`content-sdk-create-component` was discretionary until 2026-08-12, and three of five
  brands drifted flat while every one of them passed the gate.)
- **`when relevant`** — the Developer invokes only what the task in hand needs, **never the whole
  catalogue**.
- **`{var}`** in a skill name interpolates from the run's resolved variables (`{router}` → `app`).

Slots (`scaffold`, `definition_of_done`, `generated_artifacts`, `preflight_credentials`),
`constraints`, hook steps and `additions` all arrive in the same brief and are applied where the
sections below say so.

If § 4c references an SDK contract, the Developer reads the matching skill *and* cites the underlying `node_modules/.../*.d.ts` per rule `40-sdk-contracts.mdc` — the skill is the conceptual entry point; the `.d.ts` is the binding contract.

## Scaffold execution gate (rule `50-scaffold.mdc`)

**The gate is core; the command, the skip condition and the post-scaffold assertions are the
`scaffold` slot in the pack brief.** No pack declaring the slot ⇒ nothing to scaffold, skip the gate.

**Skip when the app is already scaffolded.** Apply the slot's `skip_when` and, if it holds, its
`skip_assertions` — then proceed. **Do not re-run the generator.** The gate below applies where no
scaffold exists: platforms whose `repo_setup.seeds_baseline_on_main` is false, freeform runs, and any
product predating the baseline rule.

Where it does apply, the very first implementation step is the canonical scaffold command — and it is **non-negotiable**:

1. **Locate the canonical command** — the brief's `scaffold.command` (or `commands[<variable>]` when the platform selects by one). Task breakdown § 4c-3 should carry the same string verbatim; **if the two disagree, stop and report** rather than picking one.
2. **Execute it literally** via Bash. Same flags. Same registry URL. No paraphrase, no shortcut, no hand-rolled `npm init` substitute.
3. **If the command fails** (network unavailable, registry down, permission denied, sandbox no-network, timeout): **HARD STOP.** Surface to the user:
   - The exact command that failed
   - The exact error from stdout/stderr
   - What the user can do (run it themselves outside the agent, change network, fix permissions)
   Do NOT proceed to write source files. Do NOT hand-write `package.json`, `tsconfig.json`, or `next.config.*` from training data — pinned versions drift the moment the cutoff passes (hand-written manifests have pinned stale majors while the live scaffold/registry shipped newer ones, producing resolver mismatches that only surface at build time).
4. **Run the slot's `post_assertions`.** These are the platform's proof that the *right* scaffold landed — a generator that succeeds can still produce the wrong shape. **HARD STOP and report** on any failure; never hand-edit config or move files to correct it.
5. Once the scaffold succeeds, proceed with the slot's `post_scaffold` steps and the same `setup-*` skill.

This is rule `50-scaffold.mdc` — it applies to **every** run whose pack declares a `scaffold` slot, including freeform runs where the platform was detected rather than declared, and every research or prototype run regardless of how throwaway the output is. The `package.json` always comes from the live scaffold; only the deeper file-level skeleton may be partial in research runs.

## Escalation protocol

If during implementation the Developer encounters a gap in § 4c, an ambiguous task description, a missing dependency, or a contradiction that prevents completing a task, the Developer must **escalate** per `.agent/WORKFLOW.md` (Escalation protocol) rather than guessing or loading unauthorized upstream docs. The escalation stops work on the blocked task, surfaces the gap to the user through the Team Lead, and routes to the right upstream agent for a fix. The Developer may continue unblocked tasks while waiting.

## Parallel execution model — TRANCHE-level, opt-in by proof (rule `71` § "Parallel tranches")

**Superseded 2026-07-29.** The former model parallelized *individual tasks* inside a "parallel group" and disqualified any `tdd`-style breakdown. Since QA (07) enrichment is **mandatory** and sets `task_breakdown_style: tdd` on essentially every pipeline run, that path could never fire — it was unreachable. Concurrency now happens at the **tranche** level, where the delivery loop's unit of work already lives.

**Probe tranches are absolutely blocking.** Every 🔍 probe tranche runs **first, alone, to completion**, and stops for operator go/no-go before ANY implementation tranche starts — parallel or sequential. Nothing that depends on a probe's outcome begins until the operator confirms it (rule `70`).

**Sequential is the default.** Concurrency requires an explicit **Tranche independence** declaration in § 5 **and** the Team Lead's own re-verification of all five eligibility checks (rule `71`): no pending probe · no `Depends on` path · disjoint § 4c-5 file sets (generated `.sitecore/*` exempt) · no shared mutable state including **live-tenant items** (Available Renderings, Page/Partial Designs, placeholder settings) · nameable evidence. **A declaration is a claim, not a permit** — verify it. Any check unverifiable → run sequentially and say so.

**The split: Dev + Review run concurrently; QA runs once, after the merge.** The triad's halves have opposite dependencies — **code review is diff-local** (it needs the diff, `prd-minimal`, § 4c, not the sibling tranches, so it is fully valid in isolation and is the cheap early catch), while **QA is integration-dependent** (a worktree holds only its own tranche, so its generated maps are partial and its build would validate a codebase that will never ship). Running QA per worktree is a weak signal at full cost, and you would have to repeat it properly anyway.

**How it works:**
1. **Create the worktrees yourself, in the PRODUCT repo.** For each concurrent tranche run `git worktree add <path> -b tranche-<slug>` inside the product's own git repo, placing them outside the product tree. Then spawn one Developer per tranche **without** the `Agent` tool's `isolation:` flag, telling each its worktree path in the prompt. **Do NOT use `isolation: "worktree"`** — probed 2026-07-29: it worktrees the *framework* repo, where `products/*/*` is gitignored, so the product is absent and the Developer gets an empty scaffold. The worktree itself is mandatory: concurrent Developers in a shared tree race on `index.lock` and interleave commits even when their files are disjoint, defeating the incremental-commit crash-checkpoint.
2. Each receives `prd_minimal` + the task breakdown + its own tranche's Task IDs — slim context, unchanged. Each writes **and commits incrementally** inside its worktree.
3. Each implements its **whole** component (schema + component + registration + variants + tests) exactly as in the sequential flow, but **defers shared-tenant registration writes** to the join when the declaration said so.
4. **Then its Code-Reviewer, in the same worktree** (`subagent_type: "developer"`, review mode) — reviews that tranche's **diff** only. An unfixed Critical/Major returns to a fresh Developer **in that worktree**, bounded to 5 cycles. A tranche joins the merge only once it is **review-clean**.
5. **Do NOT run `generate-map`, the full suite, or QA inside a worktree** — all three are integration-scoped. The Code-Reviewer reviews the diff; it does not need a green build to do that.
6. **The join (orchestrator only), once every tranche is review-clean.** **Run the brief's `hooks.tranche_join` steps here, in order** — that anchor exists because a worktree cannot do integration-scoped work, so anything the platform defers lands at the join and nowhere else. Its assertions run **BEFORE** merging where they say so (a worktree's generated map is partial by construction, so an assertion that it was left alone must precede the merge). Then: merge each tranche's branch → run the anchor's regeneration and deferred-write steps → run the brief's `hooks.integration_assertions` → **one QA (07) over the integrated whole** (full suite + lint + build + any required smoke). This is the run's *only* real test pass. A failure — including the no-tranche-touched-maps check and the two map assertions, which are integration-gate failures like any other — loops back to a fresh Developer **on the merged tree** (an integration fix — the worktrees are gone), bounded to 5 integration cycles, then escalate. See rule `71` join step 4a for why these four are asserted rather than trusted: each one fails *green*.
7. Record one `stage_history` entry per tranche, plus one for the integration gate.

**Fallback (not optional):** a merge conflict at the join means the eligibility test was **wrong**. Stop, report which check failed, and finish the remaining tranches **sequentially**. Never resolve a join conflict by picking a side — the framework cannot know which tranche's intent is correct.

## Delivery loop — a FRESH triad per component (rule `71-delivery-loop.mdc`)

When the task breakdown's § 5 is **component-vertical** (one tranche per component, then additional-logic tranches — the default; see `.agent/glossary.md` § "Tranche"), each component tranche is delivered by a **fresh {Developer → Code-Reviewer → QA} triad, spawned sequentially by the Team Lead** — `/implement` is the triad's first leg. **One component tranche is delivered fully — the component and *all* its items — before the next starts, and each tranche is code-reviewed and tested as a unit. No context is carried between components** (rule `72-orchestrator-discipline.mdc`): every triad member is a fresh, slim subagent, and every component boundary is a durable crash-checkpoint.

**Cadence — read `scope_dial.delivery_loop` first (rule `71` § "Cadence dial"; override per-run with the `loop=<per_component|once>` slash arg).** The dial sets *when the **test** leg runs*, not *how* implementation is chunked and **not** when code review runs — **`/code-review` is per tranche in both cadences** (it is diff-local and cheap; only the integration-scoped QA leg batches):

- **`per_component` (default):** the FRESH-triad-per-component flow described in this section — `/implement` → `/code-review` → `/test` on each tranche, loop-back before the next component starts.
- **`once`:** each tranche is delivered by a fresh **{Developer → Code-Reviewer} pair** — `/implement` the whole component → `/code-review` **its diff only** → loop back to a fresh Developer on an unfixed Critical/Major (bounded 5, then escalate) → the Team Lead **commits + records at review-clean** → next tranche. `/test` is **not** invoked between tranches; after the last component + additional-logic tranche is review-clean, a **single** `/test` runs over the **whole build** (the integration gate), with bounded (3-cycle) whole-build loop-back whose fix diff is code-reviewed as normal. Cheaper (one full suite/lint/build instead of N), at the cost of cross-component regressions surfacing late. In `once` mode, treat the bullets below as describing implementation **and its per-tranche review**; only the test leg defers.
- **Inert on single-tranche runs:** a bug / small single-component FRD / freeform run is one implement → review → test pass regardless of the dial (the collapse noted at the end of this section). Absent/legacy manifest ⇒ `per_component`.

- **The Team Lead spawns the triad, sequentially, per component** (rule `72` — it passes paths + the tranche's Task IDs, not artifact contents; it never implements / reviews / tests itself):
  1. **ONE Developer subagent (this command)** — implements the **whole** component to the brief's **`definition_of_done`** slot, plus every entry in `additions.definition_of_done_addenda[]`. Where no pack declares the slot, the core default applies: **the module + its types + wiring + tests**. Apply the slot's `constraints[]` too — they are what make the DoD reproducible rather than a description (e.g. *derive from the app's own contract, never copy from a sibling*). **A component is not "done" as code alone** whenever the platform's DoD names artifacts outside the repo; that is exactly what the slot exists to say, and it is why it is a slot rather than a sentence in this file. **Writes + commits incrementally** (so a mid-turn crash keeps the code — see `08-developer.md` `## Outputs Contract`), and returns a **decision-grade minimal report** (see *Minimal report* below).
  2. **ONE Code-Reviewer subagent** (`/code-review`, Developer 08 in review mode) — reviews **only** this component's diff; returns `{findings, severity}` minimal.
  3. **ONE QA subagent** (`/test`, QA Specialist 07) — tests **only** this component (suite + lint + build, scoped); returns `{pass|fail, counts}` minimal.
- **Loop-back.** If `/code-review` leaves an unfixed Critical/Major, or `/test` fails, the tranche **loops back to a fresh `/implement`** — a new Developer subagent fixes, and the tranche re-reviews + re-tests. The loop is **bounded to 5 cycles**; a tranche still not clean after the fifth implement → review → test pass **escalates to the operator** (hard stop naming the blocking findings).
- **Exit ⇒ the Team Lead commits + records, then a brand-new triad starts.** A component tranche is done when `/code-review` has **no unfixed Critical/Major** and `/test` is **green** (suite + lint + build + any required tranche smoke). The Team Lead then **commits the component + records it to the manifest** (the durable crash-checkpoint: manifest update + `git commit`, together) and spawns a **fresh triad** for the next component. **Additional-logic tranches** (navigation, theming, routing, app-level wiring) run *after* all component tranches, through the **same triad shape**.
- **Run every step in the brief's `tranche_exit` hook — in order, at the tranche's exit.** These are the platform's exit gates, not suggestions. Each step states its `order` relative to the commit, whether it is `blocking`, and where a deliberate exception is recorded.

  **A `blocking: true` step that exits non-zero closes nothing** — fix it in *this* tranche rather than carrying it forward, because the axes these gates score are typically invisible to the build, the tests and the delivery surface. A waiver is a decision an operator can read back, so it goes in the step's named ignore file **with its own stated reason**, and is **never** widened to clear a finding you have not understood.

  Steps that serialize live state back into the repo commit **together with the component code**, so code and state land in the same crash-checkpoint and the state is versioned rather than live-only. Cadence is **per component tranche**, never one summarized end-of-run pass.

  > Why these live in the pack: they were reachable only if the agent happened to read a rule with `alwaysApply: false` and Cursor-style globs that nothing in this repo evaluates. The schema audit was wired into this command by hand on 2026-08-12; the authorability audit **was not, and had been missing ever since**. A hook the brief emits cannot be forgotten one gate at a time.
- **Run the comment-economy audit at the same exit point — EVERY run, not just Content SDK (rule `87-comment-economy.mdc`):**

  ```sh
  node .agent/scripts/audit-comment-density.mjs --path <product-or-app-path> --quiet
  ```

  **Before the commit, alongside the schema and authorability audits.** Exit 1 = a source file carries a comment wall (a block of 25+ lines). Fix it in this tranche: the reasoning goes into the product's `docs/build-decisions.md` under a stable anchor, and the source keeps a one-line pointer to it. A deliberate exception goes in `<product>/.comment-density-ignore.json` under `files`, **each with its own stated reason**.

  **Never resolve this finding by deleting the comment.** The wall usually holds the only durable copy of a decision — harvest first, then strip (rule `87` § "Applying it to existing code"). Deleting is the one remedy the audit cannot tell apart from the right one.
- **Tracked, not stopped.** The per-component `stage_history` entry recorded at exit is the operator's *granular tracking of how implementation is doing while it is built*. The loop does **not** stop between components (autonomous within the build phase); the hard gates (§ "Operator Gate") are unchanged.
- **The review surface is built autonomously across the build, and reviewed ONCE at end-of-build** (the gate at `/test` close). Do **NOT** stop `/implement` to have the operator eyeball it after a component or before code-review/QA — that is the over-stop rule `71` forbids. *What* that surface is, and who composes it, is the platform's business: the content-sdk pack's `implement` stage carries the Content SDK answer (the Components Preview tree is QA's, not the Developer's). This bullet named that answer inline until 2026-08-23; the pack already held the same sentence verbatim, so the copy here was a leftover of the extraction, not a second source — and it dragged the Content SDK head-app rule into the core export's `depends_on` along with it.
- **Single-tranche / freeform runs** (a bug, a small FRD, vibe-coding) collapse the loop to one implement → review → test pass — the current behavior. This section adds structure only when § 5 defines multiple component tranches.

### Minimal report (the Developer subagent's return — rule `72` / Change 3)

Each Developer subagent returns a **decision-grade envelope, nothing more** — the detail already lives on disk (the code + the task breakdown § 0/§ 8) and in the subagent's own transcript. No narrative prose in the returned message:

```
outcome:     done | blocked | partial
summary:     ≤ 3 lines — what the component now does / the verdict
artifacts:   [repo-relative paths written]
escalations: [≤ N one-liners — blockers/decisions only]
```

The Team Lead relays this ~5-line envelope onward (at a gate or into `stage_history`), never the underlying files or the build log.

## Generated artifacts — regenerate and accept (both modes)

**The brief's `generated_artifacts` slot.** A `null` slot (with its reason) means the platform
produces no generated build output and this whole section is inert.

Where the slot is populated, its `paths[]` are **deterministic build output the app imports** — not drift. **Before the build gate (§ 8b)**, run the slot's `generator` against the **complete current component set**, then **stage and commit whatever it produces**. A newly added component *should* change those files; reverting it as an "unwanted change" breaks the build. **Do NOT inspect-and-revert them** — the save/build owns them; reverting them every run wastes time and breaks imports. The only guard: generation ran against the full set, so a *complete* artifact is committed, never a half-written one. Honour the slot's `worktree_rule` — generation is integration-scoped, and a worktree's output is partial by construction.

**Then run every entry in the brief's `hooks.integration_assertions` — EVERY build, both cadences, both `serial` and `parallel`.** Regeneration succeeding is not the same as the artifact being *right*. Each assertion carries a `fails: green` note precisely because that is what makes it necessary: lint passes, build passes, tests pass, and the thing renders blank with no error. Where an assertion is marked `diagnose_first`, check it **before** suspecting the component itself.

A failure in any of them is an integration-gate failure: route it back to a fresh Developer, **do not hand-patch the generated artifact**.

Accordingly, the § 8c / § 8d git-status hard stop **exempts** the paths the brief lists under `additions.git_status_exempt` (build output, not source the Developer forgot to commit).

## Steps — Pipeline mode

1. **Resolve inputs and target.** Read `.agent/manifests/run-manifest.template.json`. Resolve canonical planning inputs from the run manifest or explicit arguments. **Prefer** `prd_minimal` + `task_breakdown`. If the manifest is missing, resolve latest `prd-minimal-NNN.md` paired with latest task breakdown, or fall back per `.agent/WORKFLOW.md`. Do **not** load architecture when `prd_minimal` + § **4c** are present.
2. Decide the implementation target directory; update the task breakdown's § 0 Quick orientation in place if it deviates from what Lead Dev (06) planned. **Do NOT write a separate `implementation-runbook-*.md`** (schema 7 retired the file).
3. Create or update:
   - `project-planning/workflow/run-<timestamp>.json`
   - `project-planning/workflow/current-run.json`
4. **Parse § 5 execution order, tranches, and the `Tranche independence` block.** Determine the execution plan:
   - **🔍 Probe tranches first, alone, blocking** — run each to completion and stop for operator go/no-go before any implementation tranche (rule `70`). Never concurrent with anything.
   - **Declared concurrent set?** Re-verify all five eligibility checks yourself (rule `71` § "Parallel tranches"); the declaration is a claim, not a permit. All pass → concurrent tranche execution. Any check failing or unverifiable → **sequential**, and say which check failed.
   - **Otherwise** → sequential tranche execution per the Execution order list (the default).
5. **For each tranche (or sequential task):**
   - **Sequential tranche / single task:** Spawn one Developer sub-agent. Prompt must include: read `.agent/agents/team/08-developer.md` for identity (spawn it via `Agent(subagent_type: "developer")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). Task: implement the specified task IDs from the task breakdown using § 4c + per-task text. Follow the slim context chain. If any input is insufficient, follow the escalation protocol — do not guess.
   - **Verified concurrent set:** Spawn one Developer sub-agent **per tranche**, simultaneously, each in a **`git worktree` you created in the product repo** and named in its prompt (never the `Agent` `isolation:` flag — see § "Parallel execution model"). Each is scoped to its own tranche's Task IDs, writes + commits incrementally inside its worktree, does **not** run `generate-map` or the full suite, and defers any shared live-tenant registration write to the join. **Each is followed by its own Code-Reviewer in the same worktree** (diff-scoped; unfixed Critical/Major → fresh Developer in that worktree, bounded 5). Once **every** tranche is review-clean, perform **the join** (merge → regenerate `.sitecore` maps once over the full set → apply deferred shared-tenant writes serially → **one QA over the integrated whole**: full suite + lint + build, then **tear down the worktrees** — `git worktree remove --force` + `prune` + delete the `tranche-*` branches; cleanup is not automatic). A merge conflict at the join means the eligibility test was wrong: stop, report the failed check, and finish the remaining tranches sequentially. An integration-gate failure loops to a fresh Developer on the merged tree, bounded 5.
6. Implement tests per the **standalone QA plan** ("Test Cases To Implement") when `qa_report` is present; when `qa_report` is **`null`**, use the task breakdown's test tasks, **4b Important Test Cases**, and TDD sections as the test contract. Update the task breakdown's § 8 **What Needs To Be Tested** with the actual status (unit / UI / E2E coverage that landed, smoke gates that ran) so `/test` can run a holistic pass against the breakdown.
7. Update the task breakdown's § 0 **Planned delivery order** block with the actual execution sequence, noting which **tranches** ran concurrently (and, when a declared set was downgraded to sequential, **which eligibility check failed**). The § 5 Execution order field stays in its planned form; § 0 records what actually happened.

8. **Pre-completion validation gate (HARD STOP on failure).** Before declaring the implementation done, the Team Lead runs three checks against the implementation target directory. Each check failure leaves `implementation.status: "in_progress"` and a `stage_history` entry with `outcome: "failed"` — do **not** append `implemented` until all three pass.

   **8a. Lint** — `npm run lint` (or the project's documented lint command from `prime.md` / `package.json` scripts). Pre-existing baseline warnings are tolerated when the task breakdown § 0 records the baseline; any **new** errors fail the gate.

   **8b. Build** — `npm run build` (or the project's documented build command). **This step is non-negotiable.** Test pass alone is not sufficient: strict-TS errors, missing-types errors, and config drift only surface in build. Skipping build has shipped wrong field references (e.g. a type that exposes `finalLayout` + `sharedLayout`, not a single `layout`) that tests never caught until review. Build failure = HARD STOP; surface the exact error and the file:line(s) to the operator.

   **8c. Git-status check** — run `git status --porcelain` from the implementation target directory. **Untracked files in the target directory are a HARD STOP** until the operator makes an explicit decision per file (**exempt:** regenerated `.sitecore` map files per § "Generated `.sitecore` maps — regenerate and accept" — those are auto-staged build output, not a hard stop):
   - `commit` — stage and commit the file (Team Lead does it); proceed. Message per the commit-message convention (`.agent/glossary.md` § "Commit message convention") — state *why* the file belongs in the change (what it adds / the reason it exists), not just "add `<file>`". Enforce the convention's hard limits (subject <= 72 chars; rationale body <= 4 non-empty lines/sentences, excluding trailing reference/status lines).
   - `keep-untracked-with-reason` — operator provides a one-line reason which gets recorded under task-breakdown § 0 in an "Untracked files (kept by operator)" sub-block. The file stays out of git intentionally.
   - `delete` — Team Lead removes the file; proceed.

   Test files left untracked on disk are a common miss — they pass locally but vanish on a fresh clone. The check exists to make that class of bug structurally impossible.

   **All three checks must pass — or each failure must be acknowledged and resolved by the operator — before step 9 records the `implemented` `stage_history` entry.**

9. Update the run manifest implementation status before finishing.
10. **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "implemented", agent: "08-developer", outcome: "completed", one_line: "<≤140 chars>", deliverables: [<code + test file paths touched>, "<task-breakdown path — § 0 + § 8 updated>"], escalations: [...] }`. On failure, append with `outcome: "failed"` and the error message; leave `implementation.status: "failed"` so the run can be resumed.
11. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt before reporting completion. One nudge per `/implement` run total — not per Developer sub-agent. Default-skip.

## Steps — Freeform mode

1. **Detect freeform mode.** No usable `task_breakdown` in manifest or on disk, OR user explicitly requested freeform/vibe/standalone.
2. Read `.agent/manifests/run-manifest.template.json`.
3. **Orient on the codebase.** If `project-planning/plans/prime.md` exists, read it for stack, conventions, and test commands. Otherwise, inspect the target directory directly: package.json, tsconfig, existing source structure, test setup.
3a. **Freeform pack detection.** Freeform has no intake stage, so **M0 runs here** — apply the detect rung of `.agent/commands/project/platform-pack.md` § 2 against the codebase, so the pack brief applies in freeform mode too.
   - Evaluate each pack's `detect.signals[]`. A **`strong`** signal alone resolves; **`corroborating` signals alone never do**.
   - Resolve each active pack's `variables` by its declared `detect` (e.g. `router` from `src/app/` vs `src/pages/`) and record them.
   - No pack matches → every dimension stays at its null, the brief is empty, and this run is generic. That is a resolution, not a failure.
   - Record the resolved `packs` block (and any variables) in the freeform run manifest, with `resolved_by: detect` and `notes.composition_detected_from: codebase`.
   - **Ambiguity stops, it does not guess** — two strong signals from different packs, or a strong signal whose scaffold artifacts are missing: ask the user before proceeding.
4. Resolve a fresh timestamp. Create a run manifest with `implementation_mode: freeform` and `prd_input_mode: prompt_only`. Set `canonical_artifacts.task_breakdown` and `canonical_artifacts.prd_minimal` to `null`.
5. **Spawn Developer sub-agent.** Read `.agent/agents/team/08-developer.md` for identity (spawn it via `Agent(subagent_type: "developer")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73 — freeform defaults to the agent pin = `minimal`). **Task:** Implement the user's request against the existing codebase. The user's prompt is the specification — implement exactly what was asked, no more. Inspect the existing code to understand patterns, conventions, and structure before making changes. Follow existing patterns. Write tests for new behavior where the project has a test setup. When step 3a resolved any pack, apply the *Pack brief* section above — the brief is identical in both modes.
6. Write a **freeform task-breakdown stub** at `project-planning/plans/task-breakdown-<timestamp>.md` (per `.agent/commands/project/dev-flow/templates/task-breakdown.template.md`) populating only § 0 Quick orientation + § 8 What Needs To Be Tested. This is the freeform equivalent of the retired implementation-runbook — keeps `/code-review`, `/test`, `/ship` working from a single canonical file. Skip § 4 Task Breakdown / § 9 TDD contract / § 10 per-task tests (freeform did not plan tasks). Set `canonical_artifacts.task_breakdown` to this file's path.
   - § 0 Quick orientation: target directory + canonical inputs ("Freeform — user prompt") + planned delivery order (what was changed, in what order) + completion criteria for this change.
   - § 1 Implementation Overview: the user's prompt (verbatim or summarized).
   - § 8 What Needs To Be Tested: tests written or needed for `/test` to verify.
7. Create or update both manifest files.

8. **Pre-completion validation gate (HARD STOP on failure).** Same three checks as pipeline mode § 8 — apply identically in freeform mode:

   **8a. Lint** — fail-fast on new errors; pre-existing baseline tolerated when recorded in the task breakdown § 0.

   **8b. Build** — `npm run build` (or documented build command). **Non-negotiable.** Strict-TS errors, missing-types errors, and config drift only surface in build. Build failure = HARD STOP; surface the error and file:line(s).

   **8c. Existing tests** — full test suite passes. New behavior should already have new tests (the prompt was the spec).

   **8d. Git-status check** — `git status --porcelain` in the target directory. Untracked files force operator decision (commit / keep-untracked-with-reason / delete) per pipeline § 8c. Regenerated `.sitecore` map files are **exempt** (build output — see § "Generated `.sitecore` maps — regenerate and accept").

9. Update the run manifest: `status: implemented`, `implementation.status: completed`.
10. **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "implemented", agent: "08-developer", outcome: "completed", one_line: "<≤140 chars>", deliverables: [<files touched>], escalations: [...] }`. On failure, append with `outcome: "failed"` and the error message; leave `implementation.status: "failed"` so the run can be resumed.
11. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt before reporting completion. One nudge per `/implement` run total. Default-skip.

## Validation — Pipeline mode

Before finishing, verify:
- The task breakdown's § 0 Quick orientation reflects the actual target directory and (if changed) the actual delivery order
- The task breakdown's § 8 What Needs To Be Tested reflects the actual test coverage that landed
- The run manifest exists and records the implementation target directory
- Canonical artifacts referenced by the run manifest **exist as non-null paths** (**`prd_minimal` preferred**, else full PRD for legacy; **task breakdown**; `qa_report` only when not `null`)
- Lint and build pass, or any failures are explicitly reported
- **Tests are implemented** per standalone QA plan **or** per task-breakdown test contract when QA is omitted; **full test suite** has been run (unit, UI, E2E if present) and passes or failures are explicitly reported
- Core user workflows have automated test coverage as specified in the QA plan **or** task breakdown
- `stage_history` contains an entry for `implemented` with structured fields per schema 7 (`one_line`, `deliverables[]`, `escalations[]`)
- **No `implementation-runbook-*.md` was produced** (schema 7+; legacy runs leave the file in place untouched)

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage implement` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "implement", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Validation — Freeform mode

Before finishing, verify:
- The freeform task-breakdown stub exists at `project-planning/plans/task-breakdown-<timestamp>.md` with § 0 Quick orientation + § 1 prompt summary + § 8 What Needs To Be Tested
- The run manifest exists with `implementation_mode: freeform` and `canonical_artifacts.task_breakdown` set to the stub
- Lint and build pass, or failures are explicitly reported
- Existing tests still pass (no regressions)
- New tests were written for new behavior where the project has a test setup
- The changes match what the user asked for — no scope creep
- `stage_history` contains an entry for `implemented` with schema-7 structured fields

## Output rules
- **Each Developer subagent returns a decision-grade minimal report** (rule `72-orchestrator-discipline.mdc` / Change 3): `outcome` (done|blocked|partial) · `summary` (≤3 lines) · `artifacts[]` (repo-relative paths) · `escalations[]` (≤N one-liners) — **no narrative**. The detail lives on disk; the Team Lead relays the ≤5-line envelope, never the underlying files or build log. (See *Minimal report* under the Delivery loop section.) The Operator Checkpoint block below is the operator-facing surface at the run's gate, distinct from this per-subagent return.
- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it **above** the file-paths summary and the "next step" line. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "implement"`. Typical sources at `/implement`: SDK calls made against assumed shapes pending real-tenant verification (concern), tasks the Developer escalated and the operator resolved verbally without updating § 4c (assumption), tests skipped because the runner isn't configured yet (concern), `[inferred]` choices in freeform mode where the codebase did not give clear signal (assumption), untracked files kept via `keep-untracked-with-reason` (assumption — operator-confirmed intent), build/lint warnings tolerated as pre-existing baseline (concern).
- Report the exact file paths written
- **Pipeline mode:** Mention which canonical planning artifacts were used (**`prd_minimal` + task breakdown** in normal flow)
- **Freeform mode:** Mention `freeform mode` and summarize what was implemented
- Mention the implementation target directory
- **Operator gate — SOFT (auto-continue unless critical)** per `.agent/glossary.md` § "Operator Gate". Clean runs end with a one-line "Recommended next: `/code-review`" and **do not** stop and wait. The operator chains the rest of the pipeline. **Never insert an operator review of the build's review surface here** — the build-phase operator look is the single end-of-build `build`/`final` gate at `/test` close (rule `71`), not an `/implement` stop. **Critical triggers that escalate this run to a hard stop:** (a) the pre-completion validation gate fired and an operator decision was required (lint / build / git-status untracked-file hard stop); (b) the Developer escalated a § 4c gap that could not be resolved without operator input; (c) the build or full test suite is failing at handoff; (d) any `[BLOCKER]`-tagged item in the Operator Checkpoint. When triggered, end with: *"STOP — `<reason>`. Reply **YES** to override and proceed to `/code-review` anyway, or address the issue first."* In freeform mode, the same triggers apply; the recommendation otherwise stays the same.
- If workspace structure or artifact lineage is ambiguous, stop and ask before scaffolding or generating code
