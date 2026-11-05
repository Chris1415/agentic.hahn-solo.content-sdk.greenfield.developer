---
name: code-review
intent: review
writes:
  - products/<product-slug>/project-planning/plans/code-review-<timestamp>.md
  - products/<product-slug>/docs/build-decisions.md
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/08-developer.md
  - .agent/manifests/run-manifest.template.json
---

# /code-review — Critical code review with automated fixes

## Pipeline position

This command is part of the development pipeline: `/prime` → `/rubber-ducky` → `/create-prd` → `/challenge-prd` → `/architect` → `/task-breakdown` → `/implement` → **`/code-review`** → `/test` → `/ship` (`/document` is on-demand, not in the canonical sequence)

**Git context:** This command runs on the feature branch. Uses `git diff` against the default branch to scope changed files for review.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts` under that product.

## Goal

Execute a **critical, thorough code review** of the implementation, then **fix all findings** using the Developer Agent (08). This is not a rubber-stamp — the review must be adversarial, looking for real problems that would cause bugs, security issues, maintenance burden, or deviation from the planning artifacts.

## When to run

- **After `/implement`** — as the first post-implementation quality gate.
- **On demand** — any time you want a critical review of recent code changes.

## Delivery loop role (rule `71-delivery-loop.mdc`)

`/code-review` is the **second leg of the delivery loop** (`.agent/glossary.md` § "Delivery loop"). When the Team Lead drives a **component-vertical** run, this command is invoked **scoped to one component tranche** (a scope glob or the tranche's changed files) and its outcome routes the loop:

- **Clean** (no unfixed Critical/Major after auto-fix) → the loop advances to `/test` for the **same tranche**.
- **A Critical/Major could not be auto-fixed** (needs a non-trivial decision, or the fix would touch code outside the tranche scope) → the tranche **loops back to `/implement`** (the Developer), not forward (this is already a critical trigger in Output rules).
- The loop is **bounded to 5 cycles** across implement → review → test for a tranche; the Team Lead escalates to the operator on the fifth non-clean pass.

The auto-fix step in this command already *is* "back to the Developer (08)" — the reviewer files findings, the Developer fixes them in-loop. The delivery-loop framing makes that explicit and **per-component**: a clean tranche advances, a still-broken tranche returns to `/implement`. In a single-tranche / freeform run it is one pass, unchanged.

**Cadence — `scope_dial.delivery_loop` (rule `71` § "Cadence dial").** This command is **unaffected by the dial: it runs once per component tranche under BOTH `per_component` and `once`** (changed 2026-07-29 — `once` formerly batched review too). The dial moves the **QA leg only**, because review is diff-local and cheap while `/test` is integration-scoped and expensive. Under `once` the tranche's review outcome is also its **commit checkpoint** — the Team Lead commits + records the tranche at review-clean, and nothing unreviewed accumulates behind the batched test. Under `parallel` you run **inside the tranche's worktree** against the diff alone (no full suite, no `generate-map` there). The one place scope widens: the whole-build `/implement` fix that follows a failed end-of-build `/test` is reviewed as its own diff.

## Inputs

- **Run manifest** — resolve from `project-planning/workflow/current-run.json`. Use `canonical_artifacts.prd_minimal` and `canonical_artifacts.task_breakdown` (the breakdown's § 0 carries target dir + delivery order, § 8 carries test coverage — formerly the runbook's role) for context. On legacy schema-6 runs, `canonical_artifacts.implementation_runbook` may still be set and supplements the breakdown.
- **Implementation target directory** — from the run manifest or explicit argument.
- **Git diff** — `git diff` and `git log` to scope which files changed in this implementation run.
- **Project guidelines** — `AGENTS.md`, `.agent/rules/*.mdc`, `prime.md` when available.
- **Optional argument:** Path or glob to scope review (e.g., `/code-review src/components/`). Default: all files changed in the current implementation run.
- **Freeform runs:** When `implementation.mode` is `freeform` in the manifest, the review still works — it uses the freeform task-breakdown stub's § 0 + § 1 scope and the git diff as context instead of full planning artifacts. Skip architecture compliance checks against § 4c (there is none on freeform); focus on correctness, security, code quality, test quality, and performance.

## Dual review (`scope_dial.dual_review`)

**Default `off`: a single reviewer.**

When `dual_review` is `on` or `fable`, spawn a **second, independent** code review of the same diff in
the same turn. Agent 08 keeps its `sonnet` pin for the primary review, and the two reviewers must differ:

- **`on`:** pass `model: "opus"` on the second spawn.
- **`fable`:** pass `model: "fable"` instead. This is an explicit opt-in that costs about 2.5× an Opus
  review.

Give both reviewers the identical brief, and show neither one the other's findings.

Then **07 QA arbitrates**:

- Merge the two reports and dedupe findings that describe the same defect.
- Resolve any disagreement on the code, not by majority. That includes one reviewer explicitly clearing
  something the other flagged.
- A finding raised by only one reviewer is not weaker for that. On the 5.0 generation, each reviewer alone
  false-cleared a real defect the other caught.

The merged, arbitrated list feeds the delivery loop, and the two raw reports are kept alongside it.

**Why the second reviewer moved from Fable to Opus:** on the 5.5 / 5.1 generation, every pairing reached
the same union coverage, and Sonnet 5.5 alone matched the best pair.
 The pair is now insurance, not measured extra recall, so
the cheaper second model is the default.

Fire this only when `dual_review` is `on` or `fable`. On `off`, run exactly one review and change nothing.

## Review scope

The Developer Agent (08) reviews the implementation with a **critical, independent mind**. The review must cover:

### 1. Correctness
- Does the code do what the task breakdown and prd-minimal specify?
- Are there logic errors, off-by-one mistakes, race conditions, or unhandled edge cases?
- Do error paths behave correctly?
- Are promises/async operations handled properly?
- **SDK-contract greps (mandatory when any file under `lib/sdk/` or `core/` changed; see `40-sdk-contracts.mdc` § Reviewer grep checks):** run the three greps from that rule (`client.mutate(...)` + `.data.data` regression, missing `// shape:` citation on SDK calls, empty `catch {}` on SDK calls). Each hit becomes a finding (CRITICAL for the mutation-unwrap regression, MAJOR for the others). This catches the class of bug where `xmc.authoring.graphql` silently returned undefined for every lookup because mutations were unwrapped at the wrong level.

### 2. Security
- Input validation at system boundaries (user input, API responses, URL params)
- XSS, injection, CSRF, and other OWASP top 10 risks
- Secrets or credentials exposed in code
- Unsafe use of `dangerouslySetInnerHTML`, `eval`, or equivalent

### 3. Architecture compliance
- Does the code follow § 4c boundaries from the task breakdown?
- Are ADR decisions honored?
- Are file locations, naming conventions, and module boundaries correct per § 4c-5?
- Are dependencies authorized and necessary?
- **Architecture budget (`scope_dial.architecture_budget`, default `mindful`):** Did the implementation stay within the chosen budget? Flag new abstractions, service layers, generic utilities, framework pivots, or dependencies that are not justified by the PRD/FRD/bug, ADRs, § 4c, or existing repo patterns.

### 4. Scope and abstraction discipline
- New abstractions, indirection layers, shared base classes, plugin systems, or "framework inside the app" patterns must map to a stated requirement — not convenience or hypothetical reuse.
- Prefer concrete, local solutions when the requirement is single-use. Duplication is acceptable until a second real consumer exists (Rule of Three).
- New npm dependencies require justification: what existing code or stdlib alternative was rejected and why.
- Findings here use category `architecture` (MAJOR when scope expands beyond spec; CRITICAL when it contradicts ADRs or § 4c).

### 5. Code quality
- Dead code, unused imports, redundant logic
- Functions that are too long or do too many things
- Missing or incorrect TypeScript types (when applicable)
- Copy-paste duplication that should be extracted
- Naming clarity — can a reader understand the code without comments?
- **Comment economy (rule `87`).** A comment block over 25 lines is a MAJOR finding, and a file-header essay is the common form. The remedy is **never** "delete it" — it is "move it to `docs/build-decisions.md` and leave a one-line pointer". Flag comments that narrate build history, review findings, task/tranche IDs or measurement logs; leave short trailing `// why` annotations alone, since those are the form the rule asks for.

### 6. Test quality
- Do tests actually assert meaningful behavior?
- Are there important paths without test coverage?
- Are tests brittle (testing implementation details rather than behavior)?
- Do mocks accurately represent the real dependencies?

### 7. Performance
- Obvious N+1 queries, unnecessary re-renders, unbounded loops
- Missing memoization where expensive computation repeats
- Large bundle imports that could be tree-shaken or lazy-loaded

### 8. Pack contract checks — the code-review brief

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage code-review \
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


The brief's skills are the **comparison reference** for SDK call sites and editor/preview branches:
the skill is the *"what should this look like"* source, the diff is *"what does it look like."*
Findings are filed under category `architecture` with the offending convention named.

**Apply each skill's declared `severity` as written.** These are not style notes — they are the
regression classes that have actually shipped, and a reviewer who downgrades one is overruling
measured evidence. Also run every `additions.review_checks` entry.

**Skill-load reuse rule:** if `/implement` already loaded a given skill this session, **do not
re-invoke it** — cite the already-loaded content by name. Only invoke what `/implement` did not load.

## Process

1. **Spawn sub-agent: Developer (review mode).** Spawn an isolated sub-agent. Prompt must include: read `.agent/agents/team/08-developer.md` for identity (spawn it via `Agent(subagent_type: "developer")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). **Task:** Perform a critical code review of the implementation. Read the task breakdown (§ 4c especially) and prd-minimal for context. Read `scope_dial.architecture_budget` from the manifest (default `mindful`). Review every changed file against the review categories above. Be thorough and adversarial. Report every issue you find with its honest severity, minor ones included: do not pre-filter, because triage happens at step 7, and a reviewer told to report less does.

2. **Produce findings.** For each finding, record:
   - **File and line(s):** exact location
   - **Category:** correctness | security | architecture | quality | tests | performance | abstraction
   - **Severity:** critical (must fix) | major (should fix) | minor (consider fixing)
   - **Description:** what's wrong and why it matters
   - **Suggested fix:** concrete code change or approach

3. **Write review report** to `project-planning/plans/code-review-<timestamp>.md`:
   ```markdown
   # Code Review — <timestamp>

   **Reviewer:** Developer Agent (08)
   **Scope:** <files reviewed / git diff scope>
   **Overall assessment:** PASS | PASS WITH ISSUES | NEEDS WORK

   ## Critical Findings
   <numbered list, or "None">

   ## Major Findings
   <numbered list, or "None">

   ## Minor Findings
   <numbered list, or "None">

   ## Summary
   <1-3 sentence assessment>
   ```

4. **Fix all critical and major findings.** After producing the review, the Developer Agent (08) **immediately fixes** all critical and major findings. For each fix:
   - Apply the code change
   - Run lint and build to confirm no regressions
   - Note the fix in the review report (append a "Fixes Applied" section)

5. **Re-verify.** After all fixes are applied:
   - Run the full test suite
   - Run lint and build
   - If any new issues are introduced by fixes, fix those too

6. **Record the durable decisions — this is what keeps them out of the source files (rule `87-comment-economy.mdc`).** Before closing, append to the product's `docs/build-decisions.md` (create it from `.agent/commands/project/dev-flow/templates/build-decisions.template.md` if absent) **one entry per decision a future reader could not recover from the code**. The bar is specific: an approach was **rejected** and the reason is not visible in what shipped; a non-obvious constraint (an SDK, Edge or browser behaviour) forced the shape; or a measurement decided it. Routine fixes get nothing.

   Each entry carries a **stable anchor** (`### <Component> — <short claim> {#component-slug}`), the decision in one or two sentences, what was rejected and why, and how it was verified. Keep it under ~15 lines; link the review report (`plans/code-review-<timestamp>.md`, tracked since 2026-08-12) for the full trace rather than reproducing it.

   Then, in the code, leave **only** a pointer: `// see docs/build-decisions.md#component-slug`. **Do not write the reasoning into the source file** — that is exactly the failure this step exists to prevent (measured 2026-08-12: 183 files carrying 8,477 lines of header essay, two head apps with more comment than code, and one app whose review reports had vanished so the comments were the only surviving copy).

   Run `node .agent/scripts/audit-comment-density.mjs --path <product-or-app-path> --quiet` before closing; exit 1 is a Major finding in this review, not a note for later.

7. **Minor findings:** Present minor findings to the user. The user decides which (if any) to address.

8. **Update the run manifest:**
   - Record the review report path under `canonical_artifacts` (or in `notes` if no canonical slot exists yet).
   - Update `updated_at`.
   - **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "code_reviewed", agent: "08-developer", outcome: "completed", … }`. On failure, append with `outcome: "failed"` and the error message.
   - Update both `run-<timestamp>.json` and `current-run.json`.


9. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt before reporting completion. Default-skip.

## Validation

Before finishing, verify:
- The code review report exists at the correct path
- All critical and major findings have been fixed
- Lint and build pass after fixes
- Full test suite passes after fixes
- The review report includes a "Fixes Applied" section documenting what was changed
- The run manifest is updated with the review report path
- `stage_history` contains an entry for `code_reviewed`

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage code-review` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "code-review", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Output rules
- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it **above** the findings summary and the "next step" line. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "code-review"`. Typical sources at `/code-review`: minor findings the operator must triage (decision), major findings auto-fixed but where the fix introduced an assumption (assumption), fixes that touched code outside the PRD scope (concern), security/SDK-contract concerns the reviewer flagged but could not fix without operator input (concern), test regressions introduced by fixes and re-fixed (info — record for traceability).
- Report the review findings count by severity
- Report which fixes were applied
- List any minor findings left for user decision
- **Operator gate — SOFT (auto-continue unless critical)** per `.agent/glossary.md` § "Operator Gate". Clean runs end with a one-line "Recommended next: `/test`" and **do not** stop and wait. **Critical triggers that escalate this run to a hard stop:** (a) any Critical or Major finding could not be auto-fixed and needs an operator decision; (b) an SDK-contract grep hit landed and the fix would touch code outside the PRD scope; (c) build / lint / test suite is still failing after fix attempts; (d) any `[BLOCKER]`-tagged item in the Operator Checkpoint. When triggered, end with: *"STOP — `<reason>`. Reply **YES** to override and proceed to `/test` anyway, or address the issue first."*
