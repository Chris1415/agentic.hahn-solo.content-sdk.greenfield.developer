---
name: ship
intent: closure
writes:
  - products/<product-slug>/project-planning/plans/ship-report-<timestamp>.md
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
  - products/<product-slug>/project-planning/.gitignore (artifact durability tiering, schema 8+ — seeded at /create-prd step 4a; step 15b backfills it for legacy products, and 15b-promote may `git mv` durable artifacts out of a legacy archive/)
  - git commit + push + pull request
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/02-product-manager.md
  - .agent/agents/team/08-developer.md
  - .agent/agents/team/09-doc-writer.md
  - .agent/commands/project/dev-flow/templates/ship-report.template.md
  - .agent/commands/project/dev-flow/templates/task-breakdown.template.md
  - .agent/commands/project/templates/status-md.template.md
  - .agent/manifests/run-manifest.template.json
---

# /ship — Close the implementation cycle with a completion summary

## Pipeline position

This command is the final step of the development pipeline: `/prime` → `/rubber-ducky` → `/create-prd` → `/challenge-prd` → `/architect` → `/task-breakdown` → `/implement` → `/code-review` → `/test` → **`/ship`**

**Is `/ship` the final step? Ask the packs, not a platform name.** Read the brief's `owns.stages`
for every active pack. **If any active pack owns a stage that runs AFTER `/ship`, this is not the
final step** — recommend that stage and say so in the close-out. If none does, `/ship` is terminal.

> Today content-sdk owns six post-ship stages (`discover-components` → `author-content` ⇄
> `test-content` → `publish`) and marketplace owns none, so the answer is the same as the old
> hardcoded one — but it is now *derived*, and a new platform answers it by declaring rather than
> by someone remembering to edit this file. The dial still applies: `content_authoring: no`
> makes `/ship` terminal whatever the packs own.

On a composition whose packs own post-ship stages, `/ship` is **not** the final step (unless the operator turned content authoring off) — it ships **code only** (editing-host + Vercel deploy against the **preview** context, commit, PR). The **content phase** (`/discover-components` → `/author-content` ⇄ `/test-content`) runs **after** `/ship` **when `scope_dial.content_authoring != no`**, and **`/publish`** is the final live step (`.agent/glossary.md` § "Preview-first delivery"). Non-content / Marketplace / generic runs — **and content-sdk runs with `content_authoring == no`** — are terminal at `/ship`.

**`/document` is no longer in the canonical sequence.** `/ship` spawns the Doc Writer (09) in **lite mode** for a minimal README + CHANGELOG entry (when `scope_dial.docs_at_ship` is `auto-lite`, the default). `/document` remains available on-demand for heavy doc refreshes (when `scope_dial.docs_at_ship` is `full`). When `scope_dial.docs_at_ship` is `none`, `/ship` skips all doc emission. Background: 7 of 8 portfolio products skipped `/document`, leaving every shipped product without a README — the canonical-sequence ceremony was strictly worse than no docs.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts` under that product.

## Work item type routing (schema 8+)

Read `work_item_type` (missing → `prd`, legacy). State it in the ship report header and scale the report to the weight (see `.agent/glossary.md` § "Work item type"): a **bug** ship report is short — "RED test went GREEN; regression test retained in suite; (SDK) real-tenant smoke <outcome>"; an **frd** ship report checks delivered work against the FRD's acceptance criteria; a **prd** ship report is the full synthesis. The PR title/branch follow the type (`bug-NNN` / `frd-NNN` / `prd-NNN`). `STATUS.md` refresh at close rolls up all three families.

## Goal

Produce a **completion summary** that synthesizes the entire implementation cycle: what was specified vs what was delivered, what was deferred, known limitations, test coverage state, technical debt introduced, and recommendations for the next iteration. Then update the run manifest to `status: shipped`.

This is the handoff document. It answers: "Is this PRD done? What shipped? What didn't? What should we do next?"

## When to run

After `/test` (canonical path) or after `/code-review` if testing was skipped. `/ship` evaluates outcomes, **emits lite docs when `scope_dial.docs_at_ship` is `auto-lite`** (the default), commits, pushes, and creates a PR. `/ship` does not fix code; on the auto-lite path it spawns the Doc Writer for a 1-paragraph README and a CHANGELOG entry.

## Inputs

- Default source resolution: read `project-planning/workflow/current-run.json` and use:
  - **`canonical_artifacts.prd`** — full PRD (for scope comparison: user stories, requirements, success criteria)
  - **`canonical_artifacts.prd_minimal`** — prd-minimal (for quick orientation)
  - **`canonical_artifacts.task_breakdown`** — task breakdown (for delivered vs planned tasks)
  - **task breakdown § 0 + § 8** (no separate implementation-runbook in schema 7+; legacy schema-6 runs may still reference `canonical_artifacts.implementation_runbook` — read it when present, otherwise resolve target directory / delivery order / test status from the task breakdown's § 0 and § 8)
  - Test report at `project-planning/plans/test-report-*.md` (latest by timestamp if not in manifest)
  - Code review report at `project-planning/plans/code-review-*.md` (latest by timestamp if not in manifest)
  - ADRs in `project-planning/ADR/` (for compliance check)
  - Documentation outputs: `README.md`, `CHANGELOG.md`, `docs/` (produced by `/document`)
- Optional: user-provided notes on known caveats or context

## Sub-agent orchestration

This command uses the **sub-agent orchestration model** defined in `.agent/WORKFLOW.md` § "Sub-agent orchestration model". **`/ship` is orchestrated, not performed** — per rule `72-orchestrator-discipline`, the Team Lead never authors an artifact, never writes a commit message, and never reads an output artifact. It sequences, gates, writes targeted manifest fields, and relays to the operator. **Three specialists are spawned:**

| # | Spawn | Owns |
|---|---|---|
| 1 | **Product Manager (02)** — `subagent_type: "product-manager"`, constructive mode | The **ship report** — every spec item classified `delivered` / `partial` / `deferred` / `cut`, with evidence. Spawned isolated so the delivered-vs-specified call has genuine fresh-eyes independence. Step 1. |
| 2 | **Doc Writer (09)** — `subagent_type: "doc-writer"` | The **`auto-lite` README + CHANGELOG emission**. Step 15a. |
| 3 | **Developer (08)** — `subagent_type: "developer"` | **Git finalization** — stage, commit message, commit, push, open the PR. Steps 16–18. |

**The Team Lead keeps only:** the ship-status gate (13), targeted manifest + `stage_history` writes (14), the `STATUS.md` / `tasks.md` refresh (15–15a-status), the build-economics rollup (15a-economics), the durability-tiering verify + probe promotion (15b / 15b-promote), the doc-freshness audit routing, and the operator presentation.

**Validation is by targeted check, never by reading.** After each spawn returns, confirm the artifact exists at the claimed path and carries its required sections with a scoped `grep -c` / `test -f` (per `.agent/glossary.md` § "Self-report verification" and rule `72`'s Bash-output guard). Do **not** read the ship report, the README, or the diff into the orchestrator's context.

## Steps

1. **Spawn sub-agent: Product Manager (constructive mode).** Spawn an isolated sub-agent with a single `Agent` tool call, `subagent_type: "product-manager"`. The prompt must include: read `.agent/agents/team/02-product-manager.md` for identity; **mode: constructive** — synthesize, don't critique. **Task:** Evaluate what was delivered against what was specified and produce the ship report. Pass the explicit input paths (steps 4–10) and the output path (step 12); the sub-agent reads its inputs, produces the report per steps 5–11, writes it to `project-planning/plans/ship-report-<timestamp>.md`, and returns. The Team Lead then validates the returned report **by targeted check** (file exists; required sections present via a scoped `grep -c`) and sequences the rest: the ship-status gate (13), manifest/STATUS refresh (14–15a-status), **spawn 2 — Doc Writer** for the lite docs (15a), the durability-tiering verify + probe promotion (15b / 15b-promote), then **spawn 3 — Developer** for git finalization (16–18). Steps 2–12 below describe the PM sub-agent's work.
2. Read `.agent/commands/project/dev-flow/templates/ship-report.template.md`.
3. Read `.agent/manifests/run-manifest.template.json`.
4. Resolve all canonical artifacts from the run manifest. If the manifest is missing key paths, use latest-by-timestamp rules.
5. **Read the full PRD** and extract: all user stories, acceptance criteria, functional requirements, non-functional requirements, and success metrics.
6. **Read the task breakdown** and extract: all tasks, their completion status (from `stage_history.deliverables[]` + the breakdown's § 0 actual-delivery block), and any escalations that occurred (from `stage_history.escalations[]` or `operator_attention[]`).
7. **Resolve implementation details from the task breakdown** (schema 7+): target directory + actual delivery sequence from § 0; risks that materialized from § 7; test status from § 8. For legacy schema-6 runs with a populated `canonical_artifacts.implementation_runbook`, also read that file as a supplemental source.
8. **Read the test report** (if exists) and extract: pass/fail counts, coverage areas, open gaps.
9. **Read the code review report** (if exists) and extract: findings count, auto-fixed count, remaining issues.
10. **Read ADRs** in `project-planning/ADR/` and check each decision against the implementation.
10a. **Read the friction log** at `canonical_artifacts.friction_log` (when present and non-empty). Group entries by `Skill / command at fault` for the ship report's "What hurt this run" section. Count entries by severity (`medium`/`high`/`critical`) for the summary line. If the friction log is missing or empty, record "No friction events captured this run" and skip the promotion offer in step 14a.
10b. **Read `notes.program`** from the run manifest (see `.agent/manifests/README.md` § "Program"). When present, this item is one member of a split idea and **must not be presented as a finished product**. Resolve the sibling states by reading each `members[]` entry's manifest (a member with no manifest yet is `planned`), then compute `shipped_count` (members whose `status` is `shipped` / `shipped_with_caveats`, counting THIS run as shipped) against `total`.

   - If `shipped_count < total`, set the **program banner**:

     `⚠ Program <id> — this is phase <index> of <total>. The product is NOT feature-complete. Remaining: <PRD-NNN (deliverable)>, …`

   - Also read `notes.split_override` (set at `/create-prd` when the operator split despite a failed shippability leg). When present, add to "What hurt this run": `Split override: <reason> — this phase may not stand alone as specified`.
   - When `shipped_count == total` after this run, set the banner to `✅ Program <id> complete — all <total> phases shipped` instead, and list the members.
   - No `notes.program` → no banner, and every step below that mentions it is inert. Do **not** invent a program for a standalone item.

   **Ownership.** The PM sub-agent computes the banner and lands it in the ship report (step 11). The **Team Lead** reads `notes.program` from the manifest directly — a targeted field read, allowed under rule `72` — and passes the banner verbatim into the **Doc Writer spawn prompt** (step 15a, so README/CHANGELOG stay truthful) and the **Developer spawn prompt** (steps 16–18, so it reaches the PR body). It is a one-line string; it does not require reading any artifact into orchestrator context.

11. **Produce the ship report** using the template. **When step 10b set a program banner, it is the FIRST line of the report, above the summary** — an incomplete-program ship that reads as a finished deliverable is the exact failure the program concept exists to prevent. Mirror the banner into the report's "Open follow-ups" as one entry per remaining member. For each spec item (scaled by `work_item_type` — PRD user stories/ACs, FRD acceptance criteria, or bug RED test + smoke), classify as: `delivered`, `partial`, `deferred`, or `cut`. Populate the **Evidence** column from the test report's § Requirement Coverage, `smoke_outcomes`, code review report, or named manual procedures — not from test counts alone. Be honest — if something is partial, say what's missing.
12. Write the ship report to `project-planning/plans/ship-report-<timestamp>.md`.
13. **Determine ship status (with smoke-outcomes gate):**
    Before classifying, read `smoke_outcomes` from the run manifest. If the manifest is `schema_version` < 4 or has no `smoke_outcomes` block, fall back to legacy behavior (advisory only). Otherwise apply the gate:

    - **All `smoke_outcomes` entries `passed`** AND all PRD requirements delivered AND tests pass AND no critical limitations → `shipped`.
    - **Any `smoke_outcomes` entry `pending` or `failed`** → status is **forced** to `shipped_with_caveats` regardless of test/code-review status. Each non-passing entry appears in the ship report's "Open follow-ups" section with: the smoke description, the recorded outcome, and a recommended next action. Do NOT mark `shipped` even if the user requests it — escalate by asking the user to first record outcomes via `/test --record-smoke <task-id> <passed|failed>` or by manually updating `smoke_outcomes` in the manifest.
    - **All `smoke_outcomes` entries `skipped`** (with explicit `notes` reason on each) → `shipped_with_caveats` — skipped smoke is itself a caveat.
    - **Mix of passed + skipped (no pending/failed)** → `shipped_with_caveats` if any skipped, otherwise `shipped`.
    - **Significant PRD requirements undelivered** → `incomplete` (overrides smoke gate; recommend further iteration before considering this PRD closed).

    Rationale: A green automated pipeline is not sufficient when real-tenant smoke was skipped or failed — production can still be broken. The smoke-outcomes gate ensures real-tenant verification is not optional for `shipped`. See `.agent/manifests/README.md` "Smoke outcomes and ship gating".
14. Update the run manifest:
    - Set `status` to `shipped` (or `shipped_with_caveats` / `incomplete`)
    - Add `canonical_artifacts.ship_report` pointing to the ship report path
    - **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "shipped", agent: "02-product-manager", outcome: "completed", … }` (or `outcome: "failed"` with error on failure)
    - Update `updated_at`
14a. **Friction-log promotion offer** (skip if the friction log was missing or empty in step 10a). Present the run's friction entries grouped by target file to the user with a summary like:
     ```
     Friction captured this run (N entries — M medium / H high / C critical):
       • <skill or command path>: <count> — <one-line gist of the most severe entry>
       • <skill or command path>: <count> — <one-line gist>
     Promote to patch queues now? (yes / no / pick subset)
     ```
     If the user accepts (`yes` or a subset), do **not** edit other CATALOGs or skills directly here — instead, mark each promoted entry's `Status` field in the friction log as `promoted-to-cleanup-friction` and tell the user to run `/cleanup-friction` next to apply the patches. Rationale: `/ship` is a closure command, not a maintenance command — promotion should be batched and reviewed in its own pass. If the user declines, leave entries `open` for the next `/cleanup-friction` sweep.

     **Skill-patch sub-pass (mandatory).** Before the bundled offer above, separately scan every friction-log entry for the literal phrase `Skill patch suggestion:` (or `**Skill patch suggestion:**`) and enumerate each occurrence in its own list with the suggested target skill (by **name**) and a one-line summary. For each `medium`-or-higher entry that contains a Skill patch suggestion, REQUIRE one of three explicit user dispositions: `applied` (already landed on the skill), `promoted` (queued for `/cleanup-friction`), or `punted` with a one-line reason recorded back into the friction-log entry. `/ship` does not finish until every `medium+` Skill patch suggestion has one of those three labels — the goal is to make dormancy impossible.
15. Update both:
    - `project-planning/workflow/run-<timestamp>.json`
    - `project-planning/workflow/current-run.json`

15a-status. **Refresh `project-planning/STATUS.md` (schema 7+).** Per `.agent/commands/project/templates/status-md.template.md`'s "Generation rules" block. Rescan PRDs and rebuild the table — the row for THIS PRD now reflects the just-set ship status, the merged PR(s) from `implementation.merged_prs[]`, and the `passed`/`pending`/`failed` smoke roll-up. Update "Last activity" with a new top entry (`<YYYY-MM-DD> — PRD-NNN <shipped status>`). Overwrite `project-planning/STATUS.md`. Confirm `canonical_artifacts.status_index` is set in the manifest.

15a-intake. **Intake source close-out (local) — if this run was sourced via `/triage`.** If `current-run.json` has an `intake` block with `source: local` (or `tasks.md`), update the product's `project-planning/tasks.md`: set the originating entry (`intake.task_id`) to `status: done` and move it under `## Closed` (newest first), appending the ship outcome + `spawned_as` link. Idempotent — skip if it is already under `## Closed`. (For `source: github`, the issue is closed after the PR exists — step 18.) Absent an `intake` block, do nothing. This wires the close-out the `/triage` design expects (previously a manual step).

15a. **Lite docs emission (per `scope_dial.docs_at_ship`).** Read `scope_dial.docs_at_ship` from the run manifest. Default to `auto-lite` when unset (legacy / pre-schema-5 manifests).

   **`auto-lite` (default) — spawn 2: Doc Writer (09).** Spawn an isolated sub-agent, `subagent_type: "doc-writer"`. The prompt must include: read `.agent/agents/team/09-doc-writer.md` for identity; **mode: lite** — emit the minimal pair only, do NOT do a full `/document` pass. Pass the **paths** to the ship report (the authoritative source for the classification table), the spec, and the product root; pass the skeletons below as the required shape. The sub-agent writes `README.md` and prepends the `CHANGELOG.md` entry, then returns a ≤5-line report. The Team Lead confirms both files by targeted check and never reads them. No `/document` invocation is needed — this is 09 in lite mode, not the full refresh.
   - **README.md** (at product root): If missing, create with this skeleton populated from PRD-000 / latest PRD + ship report:
     ```markdown
     # <product name from PRD executive summary>

     <one-paragraph description from PRD § 1 Executive Summary or § 2 Problem Statement>

     ## Status
     <ship status from this run>; latest PRD: <prd-NNN>. See `CHANGELOG.md` for history.

     ## Stack
     <one-line stack summary derived from package.json / task breakdown § 0>

     ## Getting started
     <2-4 lines: clone, install, env, run>
     ```
     If a README.md already exists, update **only** the `## Status` section to reference this run's PRD and ship status. Do not touch other sections — the operator may have customized them.
   - **CHANGELOG.md** (at product root): If missing, create with header `# Changelog\n\nAll notable changes to this product. Generated from ship reports.\n`. Then prepend (above any existing entries) a new section:
     ```markdown
     ## [PRD-NNN] — <YYYY-MM-DD>
     **Ship status:** <shipped | shipped_with_caveats | incomplete>

     ### Delivered
     - <one bullet per PRD requirement classified `delivered` in the ship report's "Delivered vs Specified" table>

     ### Deferred
     - <one bullet per `partial` or `deferred` requirement, or "None" if empty>
     ```
     Pull entries from the ship report's classification table; do **not** re-derive from the PRD or task breakdown.
     **Program members (step 10b):** when the program banner is set, the entry's first line under the heading is `> <banner>` and the README's capability paragraph describes **only what this phase actually delivers** — never the full program's ambition. A README that promises the whole idea while shipping phase 1 of 3 is the "standalone truth" leg of the shippability test failing after the fact (`.agent/glossary.md` § "Deliverable vs execution unit").
   - **No `docs/` files** are written by `auto-lite`. The operator can run `/document` later for the full pass.
   - **Doc-readiness check (auto-lite):** After emission, verify README contains at minimum: (1) what the product is (one paragraph), (2) how to run it (clone/install/env/run), (3) stack one-liner, (4) pointer to CHANGELOG and planning artifacts (`project-planning/` or ADRs). README must **not** copy full PRD sections, task breakdowns, or agent workflow internals.

   **`full`:** `/document` should have been invoked before `/ship` per legacy flow. If `canonical_artifacts` shows no `documented` entry in `stage_history`, surface this and ask the operator: *"`scope_dial.docs_at_ship: full` was set but `/document` did not run. Run `/document` now (Y) or downgrade to `auto-lite` for this ship (n)?"* Default: ask, do not silently skip.

   **CHANGELOG entry handoff (full mode).** Even when `/document` did run, `/ship` prepends the `## [PRD-NNN] — <date>` CHANGELOG entry inline using the ship-report classification table. `/document` cannot author the entry — it runs before `/ship`, so the ship report (the entry's only authoritative source) does not exist yet. The CHANGELOG entry format is identical to `auto-lite` (see the auto-lite block above): ship status line, Delivered bullets (one per `delivered` row), Deferred bullets (one per `partial` / `deferred` row), Known limitations bullets if any are flagged in the ship report's § 4. Pull entries from the ship-report classification table; do not re-derive from PRD text. Append a `stage_history` note that the entry was prepended by `/ship` in full mode. Rationale: `/document` runs before `/ship`, so the ship report is the authoritative source for the CHANGELOG entry — `/ship` must prepend it inline when `/document` did not.

   **`none`:** Skip all doc emission entirely. Record `notes.docs_emission: skipped` in the run manifest.

   **Append `stage_history` entry** when `auto-lite` ran successfully: `{ stage: "documented", agent: "09-doc-writer", outcome: "completed", notes: "auto-lite emission from /ship (lite mode)" }`. The Doc Writer **is** invoked in `auto-lite` mode as of 2026-07-29 — previously the Team Lead emitted these inline and the entry was attributed to agent 02 "as the content source", which both violated rule `72` (the orchestrator authoring an artifact) and made the manifest misattribute the work. When `full` ran via `/document`, that command's own `documented` entry is already in the history.

15a-economics. **Build economics rollup (schema 8+) — per-run window.** In the **main context** (the PM sub-agent has no Bash), read the run's start timestamp from the manifest (`created_at`; else `stage_history[0].entered_at`; else derive from `run_id`, e.g. `20260720-151103` → `2026-07-20T15:11:03`) and run the **windowed** build-cost so the recorded figure is THIS run (this PRD / FRD / bug), not the product-cumulative total:

   ```
   node scripts/build-cost.mjs --slug <product-slug> --since <manifest.created_at>
   ```

   Omit `--until` to count through the latest transcript event (= ship time); pass `--until <ISO>` only to freeze a boundary. Append `--month-usd <N>` for the operator's Claude subscription (default `$90`), and `--by-session` if a per-session drill-down is wanted. Windowing keeps attribution whole-session (still dominant-site) but counts only tokens/time/turns **inside `[since, until)`** — so a session shared with a prior run, or a straddling multi-day session, contributes only its in-window slice (see the `build-cost.mjs` header § WINDOWING). The script emits a `### Build economics` table (elapsed / engaged / idle, operator turns, total **and output** tokens, **API-equivalent $** with the prompt-cache saving, subscription share) with the window noted in its subtitle. Append it to the ship report under a `## Build economics` heading; add the one-line summary to `STATUS.md`'s "Last activity" (e.g. `build economics: ~$X API-equiv (this run), Yh engaged, Z turns — scripts/build-cost.mjs`); and record `notes.build_cost_usd` (the **per-run** API-equivalent figure) on the manifest. **Optional cumulative context:** re-run without `--since` for the product-to-date total and add a one-line note (`~$X cumulative <slug> PRD-000→<id>`). If the script exits non-zero (no attributed sessions yet, or transcripts unavailable in a headless run), record `build economics: n/a` and continue — **never block the ship on it**. Rationale: every build self-documents what **it** cost; the numbers come straight from the transcript `usage` counters, so they are the metered-equivalent (accurate whether billed per-token or absorbed by a flat subscription). Rates are a snapshot in `scripts/build-cost.mjs` — update them there when Anthropic pricing changes.

15b. **Artifact durability tiering — verify, don't move (schema 8+).** The committed surface is the **durable record**; this run's **execution scaffolding** is never tracked in the first place. Enforcement is the declarative `project-planning/.gitignore` seeded at `/create-prd` step 4a, **not** an imperative sweep at ship. See `.agent/glossary.md` § "Artifact durability tiering" and `.agent/manifests/README.md` § "Artifact durability tiers".

   **There is no move step, and no gate.** Nothing is `git mv`'d, no `canonical_artifacts.*` path is rewritten, and `notes.archive_skip` is retired (it had nothing left to suppress). Because the paths never move, they stay valid permanently — a later `/document` or design-polish run resolves the same path the producing stage wrote.

   **Do verify, before the commit in step 16:**

   1. `project-planning/.gitignore` exists. If it does not (a product created before this was seeded, or a legacy schema-6/7 run), copy it now from `.agent/templates/project-planning-seed/.gitignore`, then `git rm -r --cached` the newly-ignored paths so the ship commit lands the clean structure. **First run the rescue in 15b-promote below** — a legacy product may have durable artifacts already sitting inside `archive/`.
   2. `git status --short project-planning/` shows only Tier-1 changes: the spec, ADRs, `baseline.md`, `STATUS.md`, `tasks.md`, this run's `workflow/run-<id>.json`, this run's `plans/ship-report-<ts>.md`, and any probe/smoke/capture/spike notes. **Anything else appearing as tracked is a `.gitignore` gap — fix it rather than committing it.**

   Append a `stage_history` entry `{ stage: "tiering_verified", agent: "02-product-manager", outcome: "completed", one_line: "Durable record committed (spec/ADR/baseline/ship-report/probe notes); scaffolding untracked per project-planning/.gitignore", deliverables: [] }`.

   **Why.** The durable record (intent → decisions → outcome) is the committed documentation surface a future run or reader needs. The scaffolding (architecture blueprint, task breakdown, qa/test/review reports, minimals, UI variants, POCs) is working material the pipeline consumes DURING the run but that shipped code + ADRs + the ship report supersede. The previous design moved it to `archive/`, which did not reduce commit noise — a `git mv` is a delete plus an add of identical bytes — and grew the committed tree without bound (measured: `archive/` reached 60% of one product's planning bytes and ~36 of its last 40 commits). Untracking achieves the same intent declaratively: the files still exist on disk and the pipeline still reads them, but they never enter a commit. A further benefit is that a declarative rule cannot drift the way move rules did — the previous sweep was observed archiving `ship-report-<ts>.md` despite its own "NEVER swept" list naming it.

15b-promote. **Probe promotion (durable facts out of run-scoped notes).** A probe finding is a **fact about the world** — an API shape, a tenant behavior, an SDK quirk — not a fact about the run. It does not decay when the run ships, and it is the artifact most likely to save the *next* project real time. Left in a product's planning folder it is invisible to every other product.

   **Rescue first (legacy products only).** If `project-planning/archive/` exists, move any durable artifact the old sweep trapped there back into the canonical folders before doing anything else — `git mv archive/plans/<f> plans/<f>` for every file matching `*probe*`, `*smoke*`, `*capture*`, `*spike*`, or `ship-report-*`. Then eyeball whatever remains in `archive/` for anything else durable. (Observed in the wild: 12 probe/smoke findings and 2 ship reports across two products.)

   **Then, for each probe/spike/capture note this run produced** — `plans/*probe-findings*.md`, `captures/*`, `spike-notes/*` — classify the finding:

   | Finding | Promote to |
   |---|---|
   | Constrains **this product's** design | An ADR. It should already be one; if not, author it now. |
   | A fact about an **external platform** (API shape, wire format, tenant behavior, SDK quirk) | The owning domain skill (`content-sdk-*`, `sitecore-*`, `sitecoreai-*`, `marketplace-sdk-*`, `blok-*`), or a memory entry. It is not product-specific. |
   | Neither (a one-off measurement, e.g. a bundle-size baseline) | Leave it tracked in place — it is cheap and occasionally useful. |

   Record what was promoted in the ship report under a `## Probe promotions` heading (one line each: finding → destination). If the run produced no probe notes, omit the heading.

   **Why.** Concrete precedent: a prior product's T001 probe overturned three assumptions in the `sitecoreai-agent` skill (version-pinned `@v2.0` URL; `jobId` arrives as the `x-sc-job-id` header, not a body field; the error model is 400-plus-errors-map, not 422). Those are corrections to a shared skill, but they were readable only from one product's archive folder — so the next project re-learns them the expensive way. Promotion is what makes probe cost amortize across products instead of being paid once per run.

## Pack constraints

**Apply every `constraint` in the pack brief** — they bind this stage for the whole close-out.
Where an audience declares one, it governs how the run REPORTS: a ship report naming tranches, ADRs
and smoke outcomes is not a report to a non-developer operator, it is a report near them.

## Pack close-out — the `ship.pre_commit` anchor

Run every step the brief injects at this anchor, **before the git commit**, so anything a step
captures lands in the same commit:

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage ship \
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


A hook step carrying a `body` path means **the step IS that file** — open it and follow it. An empty
anchor means the composition has no close-out, and `/ship` proceeds straight to the docs audit.

Each injected step records its own `stage_history` entry; core does not summarize them.

## Documentation freshness audit — before commit (ALL runs)

Runs after the lite-docs emission (step 15a) and the Content SDK close-out, and **immediately before the git commit (step 16)** — so any doc corrections land in the **same** ship commit / PR. This is the **critical counterweight** to step 15a's deliberately narrow lite emission (which only creates a skeleton README or touches its `## Status`): here you **critically re-read the whole doc surface and make it true again**. Enforces rule `90-doc-freshness.mdc`. Runs on every run regardless of `work_item_type`.

**This is a critical review, not a mechanical emission.** Take the delivered change — the ship report's "Delivered vs Specified" table plus `git status` / `git diff` on the product root and the implementation target — and ask of **every** candidate doc: *does anything this change did make a statement here now wrong, incomplete, or misleading?* (a renamed / removed feature, a changed command / flag / env var / path, altered behavior, a new capability the docs don't mention, or a count / claim the change invalidated). A template cannot find these for you — only a read against the diff can.

**Candidate doc surface — scan each that exists:**
- product `README.md` — **all** sections, not just `## Status` (step 15a intentionally leaves the rest untouched; this audit owns them)
- `CHANGELOG.md` — this run's entry is correct and complete
- `docs/**` (`architecture.md`, `decisions.md`, integration / topic docs)
- a product-level `CLAUDE.md` / `AGENTS.md`, if present
- any doc the spec / feature explicitly references
- **Framework-repo runs** (the diff touched `.agent/`, `scripts/`, agents, commands, rules, templates, or `flows.json`): additionally audit the **root `CLAUDE.md`**, root `README.md`, `.agent/flows.json` prose, and `.agent/glossary.md`.

**Disposition:**
- **Stale → fix it now, in place, in this commit.** Prefer surgical edits over rewrites; honor each doc's budget / redirect rules (don't bloat the README — route detail to `docs/`, per `/document`).
- **A correction needs a product decision** (ambiguous intent, or a rewrite beyond this run's scope) → do **not** guess: record it as an Operator Checkpoint "Decisions needed" item, and tag `[BLOCKER]` if a doc would otherwise ship untrue.
- **Docs already current → assert it explicitly.** Record "Docs audited current — checked <list>". Silence is not a pass.

Honor `scope_dial.docs_at_ship`: on `none`, still run the audit but only **correct existing** docs — do not create new doc files. On `auto-lite` / `full`, the audit **complements** the emission (it fixes what emission deliberately left alone).

Append a `stage_history` entry `{ stage: "doc_audit", agent: "02-product-manager", outcome: "completed", one_line: "Doc freshness audit — <N corrected | all current>; checked <surface>" }`. (Performed by the Team Lead in the main context, drawing on the ship-report classification as the content source — same attribution model as the auto-lite emission.)

## Git finalization — commit, push, and PR

**Spawn 3: Developer (08).** After the ship report, manifest and lite docs are written, spawn an isolated sub-agent, `subagent_type: "developer"`, **mode: release** — it writes no product code here. The prompt must include: read `.agent/agents/team/08-developer.md` for identity; **task:** finalize the branch per steps 16–18 below — stage the product root and the implementation target directory, author the commit message per the convention, commit, push, and open the PR. Pass the **paths** to the ship report and the manifest (the message's rationale comes from the ship report's outcome line, which the sub-agent reads — the Team Lead does not). It returns `{ commit_sha, branch, pr_url }` in ≤5 lines.

**Why 08 and not the orchestrator:** authoring a commit message is authoring, and rule `72` forbids it. The Developer already commits incrementally throughout `/implement` (rule `71`, "Developer writes + commits incrementally"), so the release commit is the same hands finishing the same branch. The Team Lead records `{ commit_sha, pr_url }` into the manifest and presents the PR at the gate.

Steps 16–18 below describe the sub-agent's work. Step 18b is **not** part of Spawn 3: the main context runs it after Spawn 3 returns, because it needs Bash and a Developer spawn to answer a reviewer.

### 16. Stage and commit all changes

Stage all modified and new files in the product root (`products/<product-slug>/`)
and the implementation target directory.

**Stage from the product root, never from the git root — they are not always the same folder.**
Where the platform's brief declares `repo_setup.topology`, the repo may span more than this run's
workspace: under Content SDK's `monorepo` topology the git root is the CM repo (`…/cm`) and this
run's product root is `…/cm/sites/<head-app-slug>`. A bare `git add -A` from the git root would
sweep in a **sibling head app's** in-flight work and the CM's serialized items, putting another
run's uncommitted changes into this PR. Stage explicit paths, and if `git status` shows changes
outside this run's product root and implementation target, **leave them alone and name them in the
ship report** rather than deciding they are yours.

Author the message per the
**commit-message convention** (`.agent/glossary.md` § "Commit message convention"):
a Conventional-Commits subject **plus a rationale body that explains why the work
was done** — not a file-by-file recap of the diff.

- **Subject:**
  - **Pipeline:** `<type>(<product-slug>): deliver <work_item_id> — <one-line outcome from ship report>` — `<type>` follows `work_item_type` (`fix` for a bug, else `feat`).
  - **Freeform:** `<type>(<product-slug>): <one-line outcome from task breakdown § 1>`.
- **Body:** a 1–4 sentence rationale drawn from the spec's problem/goal — the PRD problem statement / phase goal, the FRD user value, or (bug) the current-vs-expected behavior and what the fix restores. State what it fixes or improves and **why it was needed**. Then trailing lines: the work-item id and `Ship status: <shipped | shipped_with_caveats | incomplete>`.

Apply the hard guardrails from the convention while authoring this message:

- Subject must be **<= 72 characters** (target 50-68). Shorten the one-line outcome if needed.
- Body rationale must stay within **1-4 non-empty lines/sentences** (reference/status trailing lines are allowed after that).
- Put detailed implementation bullets in the PR body or ship report, not in the commit body.
- If you want drafting support, run `/commit-message` first and use its validated output.

The `Ship status:` line is mandatory; the rationale paragraph is what turns "files changed" into "why this shipped."

### 17. Push the branch

Push the feature branch to the remote:

```
git push -u origin <branch_name>
```

**Honor the git-remote strategy** (`implementation.git_remote`, set at `/create-prd`
§ 10a). If it is **`local`** (or `implementation.remote_url` is intentionally
`null`), **SKIP push + PR entirely** — commit locally only, record `git_remote:
local-only` in the ship report, and do **not** stop to ask. Otherwise (a remote is
expected): if no remote is configured (`git remote -v` is empty), wire it from the
run manifest before pushing: `git remote add origin <implementation.remote_url>`,
then `git push -u origin main` (or the current default branch) followed by
`git push -u origin <branch_name>`. If `implementation.remote_url` is missing but
the strategy is **`create`**, run `gh repo create <owner>/<slug>` matching the
sibling head-app naming/visibility (the sanctioned exception, per § 10a) and wire
it. Only if the strategy is unset AND no remote exists: stop and ask the
stakeholder for the GitHub clone URL.

### 18. Create a pull request

**Greenfield scaffolded runs — split the baseline from the project code (first PR on a new repo).**

**First check whether the split already happened.** When the platform declares `repo_setup.deployable_baseline` and `/create-prd` seeded it on `main` (first-time repo setup), the scaffold is **already on `main`** and `prd-NNN` branched from it — so this run's branch contains only project code and the PR is inherently reviewable. **Ship one PR** and note the baseline commit in the body; do not manufacture a second one. Verify rather than assume: `git log main --oneline -1` shows the `feat(scaffold):` baseline, and `git diff main...<branch> --stat` carries no generator output. The two-PR procedure below applies to the remaining cases — Marketplace runs, and any run where the scaffold landed on the feature branch.

When this run **scaffolded the app onto the feature branch** (rule `50-scaffold` ran a `create-*-app` / registry command and § 10a-4b did not seed a baseline), the branch contains two categorically different things: **untouched generator output** and **the work someone is actually reviewing**. Shipping them as one PR makes the review impossible — on a real Content SDK run the scaffold was **69 files / 11,313 insertions**, a third of a 264-file PR, and no reviewer can see "did they build this well" through it.

**Land them as two PRs, in order:**

1. **Baseline PR** — the pristine scaffold commit alone (the `feat(scaffold): …` commit from T001), `main` ← that commit. Title it `baseline: <generator> scaffold (unmodified)`. Body states the exact command + resolved dependency versions and that **nothing in it is hand-written** (rule `50-scaffold` forbids it). Merge it first.
2. **Work PR** — `main` (now at the baseline) ← `<work-item-branch>`. This is the reviewable one: **only** the project's own code.

The scaffold is already an isolated commit if `/implement` followed its own contract, so this works retroactively — no rebase or history surgery needed.

**Fallback when a split is genuinely impractical** (scaffold and project code interleaved across commits): ship one PR, but the body **must** name the baseline boundary explicitly so a reviewer can diff from it —

```
## Review boundary
Baseline scaffold: <sha> (unmodified generator output — <N> files)
Review this instead: `git diff <sha>..HEAD` (<M> files)
```

Record which shape was used in the ship report.

---

Create the PR targeting the default branch (`main` or `master`) using `gh pr create`:

- **Title:** `<prd_id>: <PRD executive summary first sentence>` (pipeline) or
  `<branch_name>: <one-line summary>` (freeform). Keep under 70 characters.
- **Body:** Use this structure:

```
## Summary
- Ship status: <shipped | shipped_with_caveats | incomplete>
- <program banner from step 10b, when notes.program is present — omit the line entirely otherwise>
- <2-3 bullet points from the ship report: what was delivered, what was deferred>

## Artifacts
- PRD: `<canonical_artifacts.prd path>`
- Ship report: `<canonical_artifacts.ship_report path>`
- Task breakdown: `<canonical_artifacts.task_breakdown path>`

## Test plan
- [ ] Lint and build pass
- [ ] All automated tests pass
- [ ] <any manual verification items from the ship report>
```

**Pack addendum — append every `additions.pr_body_items` entry from the brief** to the `## Test plan`, so a reviewer can verify the parts automation cannot reach on its own.

Report the PR URL to the user.

### 18b. After the PR — main context, after Spawn 3 returns


`/ship` ends at an open pull request. Report the PR URL and stop there: **a human reviews the PR and merges it.** Do not merge it yourself, and do not wait for an automated review to arrive. If the repository runs its own required checks, name them in the report and say whether they were green when the PR opened.

If a reviewer asks for changes, the Developer (08) fixes them in fix mode on the same branch, commits per the convention and pushes; the human reviews again. Never resolve a finding by deleting a test, loosening an assertion or removing a comment.

**Intake source close-out (github) — if sourced via `/triage`.** If `current-run.json` `intake.source` is `github`, close the originating issue now that the PR exists: `gh issue close <intake.issue_number> --comment "Shipped in <PR-URL> (<ship status>)."` Idempotent — skip if already closed. (Local sources were closed in step 15a-intake.)

### 19. Pack post-PR steps — the `ship.post_pr` anchor

Run every step the brief injects at this anchor, **after the PR is opened / merged**. A step
carrying a `body` path IS that file. An empty anchor means the composition has nothing to do here.

### Edge cases

- **No git repo:** If `/implement` did not set up git (e.g. the product
  predates this workflow), run the repository check and branch creation
  from `/implement`'s "Git setup" section **now** — initialize the repo,
  create the branch, then proceed with steps 16–18.
- **Already on the default branch:** If for some reason work happened on
  `main`/`master` directly (legacy run), create a branch from the current
  HEAD (`git checkout -b prd-NNN`), then push and PR as normal.
- **Nothing to commit:** If `git status` shows no changes (all work was
  already committed incrementally), skip step 16 and proceed to push + PR.

## Validation

Before finishing, verify:

- The ship report file exists at the expected path
- Every spec requirement has a row in the "Delivered vs Specified" table — **scaled to `work_item_type`**: for a **prd**, every user story; for an **frd**, every acceptance criterion; for a **bug**, the RED-test outcome (went GREEN? regression test retained?) plus any SDK-touching real-tenant smoke. A bug/FRD has no PRD user stories — do not flag their absence.
- **Evidence column populated:** Every `delivered` or `partial` row cites a concrete proof source (test report section, smoke outcome, code review, or manual note)
- The ship status (`shipped` / `shipped_with_caveats` / `incomplete`) is justified by the table contents
- **Smoke-outcomes gate respected**: if any `smoke_outcomes` entry is `pending` or `failed`, status is NOT `shipped`; non-passing entries appear in "Open follow-ups"
- The run manifest `status` is updated and `canonical_artifacts.ship_report` is set
- **Program banner (10b):** when `notes.program` is present, the banner is the ship report's first line, each remaining member has an "Open follow-ups" entry, and the same one-liner appears in the PR body `## Summary` and (auto-lite) the CHANGELOG entry. `shipped_count` was computed from the members' real manifest states, not assumed. Absent `notes.program` → no banner anywhere (an invented program is a defect)
- **`notes.split_override` surfaced** in "What hurt this run" when present
- Deferred items (if any) include a suggested follow-up action
- Technical debt section is populated (even if just "None identified")
- ADR compliance table covers every ADR in `project-planning/ADR/`
- The ship report includes a "What hurt this run" section reflecting the friction log (or explicitly states "No friction events captured this run")
- If friction entries were promoted, their `Status` field in the friction log was updated to `promoted-to-cleanup-friction`
- **Lite docs emission honored `scope_dial.docs_at_ship`:** `auto-lite` produced README.md (created or `## Status` updated) + CHANGELOG.md prepended entry; README passes doc-readiness check (purpose, run path, stack, pointers — no planning-artifact dump); `full` confirmed `/document` ran or downgraded after asking; `none` recorded `notes.docs_emission: skipped`
- **Documentation freshness audit ran (all runs, before commit):** the full doc surface (product README all sections / CHANGELOG / `docs/` / product `CLAUDE.md`·`AGENTS.md`; **plus** root `CLAUDE.md`·`README.md`·`flows.json`·`glossary.md` on framework-repo runs) was **critically checked against the delivered change** — statements the change falsified were corrected in this commit, or an explicit "docs audited current — checked <list>" was recorded; any doc correction that needed a product decision was surfaced to the Operator Checkpoint (`[BLOCKER]` if a doc would otherwise ship untrue); a `doc_audit` `stage_history` entry was appended. Enforces rule `90-doc-freshness.mdc`.
- **Durability tiering (15b):** `project-planning/.gitignore` present (backfilled if the product predates it); `git status --short project-planning/` shows Tier-1 changes only — spec, ADRs, `baseline.md`, ship-report, `STATUS.md`, `tasks.md`, this run's `run-<id>.json`, probe/smoke notes. Nothing moved; no `canonical_artifacts.*` path rewritten; a `tiering_verified` `stage_history` entry was appended. Runs at every ship status (there is no move to gate).
- **Preview blind side named (content-sdk runs, rule `85-preview-live-divergence`):** the ship report carries a `## Unverifiable until /publish` section listing at minimum route-path form, media resolution, and cache/tag semantics as **open** — not absorbed into a green test count. A ship report that reads as fully verified after a preview-only deploy is a defect.
- **Probe promotion (15b-promote):** legacy `archive/` rescued if present; each probe/spike/capture note from this run classified and promoted (ADR / skill / memory) or deliberately left in place; a `## Probe promotions` section appended to the ship report (omitted when the run produced no probe notes).
- **Build economics rolled up (per-run window):** `scripts/build-cost.mjs --slug <product-slug> --since <manifest.created_at>` ran; its windowed `### Build economics` block (this run, not product-cumulative) is appended to the ship report under `## Build economics`; STATUS.md "Last activity" carries the one-line summary (marked "this run"); `notes.build_cost_usd` set to the per-run figure on the manifest — OR `build economics: n/a` recorded if the script found no attributed sessions (never a hard failure)
- The feature branch has been pushed to the remote
- A pull request exists targeting the default branch
- **After the PR (18b):** the PR URL was reported, and the PR was reviewed and merged by a human.
- The PR URL has been reported to the user
- `stage_history` contains an entry for `shipped`

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage ship` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "ship", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

- **Pack brief coverage — `node .agent/scripts/check-brief-coverage.mjs --workflow <product>/project-planning/workflow` exits 0.**
  Every stage the run's composition declares pack content for must carry a `packs.briefs_resolved[]` stamp, written by `resolve-packs.mjs --record` as a side effect of actually composing that stage's brief.
  **A stage the run legitimately never reached is not a defect and is not silence either** — record `packs.briefs_waived[] = { stage, reason }` naming why (`docs_at_ship: auto-lite, /document not invoked`; `ui_variants: skip`). A waiver with no reason is rejected. Do **not** waive a stage that ran; that is the failure this gate exists for.
  Cause, 2026-09-02 — `platform:marketplace`'s first end-to-end run resolved **5 of the 9** stages its pack declares. `/code-review` and `/test` were run as hand-written sub-agent prompts rather than as the stage commands, so their briefs were never composed and **nothing anywhere failed**. What was skipped: `/test`'s `live-walkthrough` axis (declared MANDATORY before `shipped`, with `status_gating` that forbids inheriting the host-frame smoke result), its `blocking_inputs` (host URL + app origin, which would have made the stage unstartable without a real portal session), and `/code-review`'s `marketplace-sdk-client` + `marketplace-sdk-xmc` (both `mandatory_when` an SDK call site is in the diff, **CRITICAL per violation**). The app then shipped a missing `sitecoreContextId` whose cause the manifest records as *"marketplace-sdk-xmc § 6a"* — the pack named the exact skill section documenting the defect, and no reviewer ever loaded it. Rule `88`: the brief existed, four stages did not use it, and every light stayed green.

## Output rules

- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it **above** the file-paths summary, the ship-status line, and the PR URL. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "ship"`. The ship checkpoint is the **last gate** before the PR enters review — every still-open `operator_attention[]` entry from upstream stages (where `kind ≠ resolved`) MUST be carried forward here as either "Concerns / risks" (if it survived to ship) or "Decisions needed" (if the operator must act after merge). Typical fresh sources at `/ship`: Marketplace runs with `host-frame-smoke: deferred` or `pending` (concern → `[BLOCKER]` for `shipped` status), extension-point registrations marked `pending` (decision — must paste into Cloud Portal), open follow-ups created from the ship report (concern), `shipped_with_caveats` status itself (concern — the caveat list is the attention list), documentation the delivered change made stale that needs a product decision to fix (Decisions needed — `[BLOCKER]` if a doc would otherwise ship untrue; see the Documentation freshness audit section).
- Report the exact file paths written
- State the ship status and a one-sentence justification
- **State plainly that this was a PREVIEW deploy (content-sdk runs).** `/ship` deploys the editing host against the **preview** context and publishes nothing, so per rule `85-preview-live-divergence` the claims that only LIVE Edge can settle — route-path form, media resolution, cache/tag semantics — are **still open**. Say so in one line ("verified against preview; route form / media / cache semantics remain unverified until `/publish`") and carry the `## Unverifiable until /publish` items into the Operator Checkpoint as concerns. Do not let a preview-green run read as a live-green one.
- If `shipped_with_caveats` or `incomplete`: list the top deferred items and limitations
- **Report the PR URL**
- **Operator gate — SOFT (auto-continue unless critical)** per `.agent/glossary.md` § "Operator Gate". Clean runs (`shipped`) end with a one-line recommendation for what comes next, **gated on `scope_dial.content_authoring`**: **for a Content SDK run with `content_authoring != no`** (`auto` on a content-sdk run, or `yes`), that is `/discover-components` then the content phase (`/author-content` ⇄ `/test-content`) → `/publish` — the run is **not live** until `/publish` (say so). **When `content_authoring == no`** (or the run is not content-sdk), `/ship` is **terminal** — do not recommend the content phase; recommend the next PRD for deferred features / backlog grooming / "this PRD is fully closed". **Critical triggers that escalate this run to a hard stop:** (a) ship status is `incomplete`; (b) any `[BLOCKER]`-tagged item from upstream stages survived to the ship checkpoint; (c) the PR could not be created or pushed; (d) post-merge action is required from the operator (e.g. Cloud Portal extension-point paste, secrets to set in production). When triggered, end with: *"STOP — `<reason>`. The PR is at `<URL>` but cannot be considered shipped until `<action>`."*
