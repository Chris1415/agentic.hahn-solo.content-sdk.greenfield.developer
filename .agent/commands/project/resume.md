---
name: resume
intent: resume
writes:
  - products/<product-slug>/project-planning/workflow/current-run.json (reconciled to disk+git reality)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json (stage_history reconcile entry)
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/00-team-lead.md
  - .agent/rules/71-delivery-loop.mdc
  - .agent/rules/72-orchestrator-discipline.mdc
  - .agent/manifests/run-manifest.template.json
---

# /resume — Reconcile a crashed/interrupted run against reality, then continue

## Goal

Recover a run whose orchestrator crashed, disconnected, or was interrupted **mid-flight** — with **zero manual reconstruction**. The mechanism: **diff disk + git against the run manifest → update the manifest to reality → continue from `next_action`.** This mechanizes the manual `git status` reconstruction that operators otherwise repeat by hand after a crash (the operational need behind rule `72-orchestrator-discipline.mdc`). Because every stage / tranche / component checkpoints to git + the manifest together (rule `71-delivery-loop.mdc` / Change 4), the disposable conversation can be thrown away and rebuilt from durable state alone.

Use `/resume` when: a pipeline run was cut off (crash, "Connection closed mid-response", laptop/network drop, an aborted session), a manifest looks stale versus what is actually on disk, or you simply want a fresh orchestrator to pick up an in-flight run exactly where it left off.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts` under that product. If several products have in-flight runs (`status` not in `shipped|shipped_with_caveats|incomplete`), ask the operator which run to resume.

## Orchestrator discipline applies (rule `72-orchestrator-discipline.mdc`)

`/resume` is executed by the orchestrator during pipeline execution, so rule `72` is in force: **pass paths, not contents**; **validate by verifier subagent**; **guard all Bash output** (`git status --porcelain`, `git log --oneline`, `git diff --stat` — never a raw dump); hold no un-persisted state. The reconcile itself reads only **git metadata + targeted manifest fields**, never output artifacts.

## Steps

1. **Load the manifest snapshot.** Read `current-run.json`. Capture, via one-liners: `status`, `implementation.status`, the **last `stage_history` entry**, `next_action` (may be absent on legacy runs), `canonical_artifacts.*`, and `implementation.branch_name`. Do **not** read the underlying artifacts.

2. **Verify the branch.** `git branch --show-current`. If it does not match `implementation.branch_name`, check out the expected branch (do not create a new one — a missing expected branch is a **hard stop**: report it, the run's lineage is broken).

3. **Diff git against the manifest.** Using guarded output only:
   - `git log --oneline <default-branch>..HEAD` — the commits this run actually landed (piped/counted, not dumped).
   - `git status --porcelain` — uncommitted work in the tree (a crash may have left staged-but-uncommitted or written-but-unstaged files). `| wc -l` first, then a scoped view.
   - For a component-vertical build (rule `71`): map committed components to the task breakdown's tranches to find **which component was in flight** when the crash hit and **which leg** (implement / code-review / test) it reached. Delegate the "which tranche is done vs partial" read to a **verifier subagent** that inspects the task breakdown § 0/§ 8 + git and returns `{last_complete_component, in_flight_component, in_flight_leg}` — do not read those artifacts into the orchestrator.

4. **Decide the reconciliation.** Three cases per unit of work:
   - **Committed + recorded** — the manifest already reflects it; nothing to do.
   - **Committed but NOT recorded** (crash between `git commit` and the manifest write) — **update the manifest to reality**: append the missing `stage_history` entry, advance `status` / `implementation.status`, and set `next_action` to the step that follows the committed unit.
   - **Written but NOT committed** (crash mid-turn, before the checkpoint) — surface the uncommitted files to the operator (`commit` / `keep-untracked-with-reason` / `delete`, per `/implement` § 8c). Committing here restores the "committed + recorded" invariant; then set `next_action`.
   - **Legacy run with no `next_action`** — derive the next step from the last `stage_history` entry + the flow sequence (`flows.json` `typical_sequence` / `content_sdk_sequence` / the delivery loop), and write a fresh `next_action` so the run is resumable going forward.

5. **Write the reconcile checkpoint.** Update `current-run.json`: reconciled `status`, `implementation.status`, any missing `stage_history` entries (append-only; add one reconcile entry `{ stage: "resumed", agent: "00-team-lead", outcome: "completed", one_line: "reconciled disk+git vs manifest; continuing from <next_action>", deliverables: [], escalations: [...] }`), `implementation.resumed_from_stage`, and the authoritative **`next_action`**. This is the durable checkpoint — the conversation stays disposable.

6. **Report the reconciliation (decision-grade, ≤5 lines)** and continue. Per rule `72`, relay a minimal envelope:
   ```
   outcome:     done | blocked
   summary:     ≤ 3 lines — what was already done (committed/recorded), what was reconciled, where we resume
   next_action: <the explicit next step>
   escalations: [uncommitted files / broken lineage / operator decisions]
   ```
   Then **continue from `next_action`** by spawning the appropriate stage/triad subagent — unless the gate policy (`scope_dial.gates`) or a `[BLOCKER]` requires an operator confirm first (e.g. `next_action` crosses a `go_live` boundary). Do **not** restart the run from the beginning; do **not** redo already-committed units (idempotent — rule `71` / Change 4).

## What `/resume` does NOT do

- **Never restarts a completed stage/component.** Committed + recorded units are skipped. Re-running a stage inspects manifest/git/disk and does only the remainder (idempotency, per the schema-8 create-or-skip contract extended to the build loop).
- **Never reads output artifacts into the orchestrator** to "figure out where we are" — that is what the manifest, git, and verifier subagents are for (rule `72`). Reconstructing state by reading the full PRD/architecture/source is the exact bloat this refactor removes.
- **Never fabricates progress.** If git shows a unit is uncommitted, it is not done — surface it, do not record it as complete.

## Relationship

- Rule `72-orchestrator-discipline.mdc` — the disposable-conversation / stateless-orchestrator principle `/resume` operationalizes.
- Rule `71-delivery-loop.mdc` — the per-component checkpoint (commit + manifest, together) is what makes reconciliation exact; `/resume` resumes at the component/leg granularity.
- The manifest `next_action` field (`.agent/manifests/run-manifest.template.json`) — the explicit continuation pointer `/resume` reads and rewrites.

## Direct invocation

`/resume` with no argument reconciles the single in-flight run for the resolved product. `/resume <product-slug>` targets a specific product. If nothing is in flight (all runs terminal), report that and stop — there is nothing to resume.
