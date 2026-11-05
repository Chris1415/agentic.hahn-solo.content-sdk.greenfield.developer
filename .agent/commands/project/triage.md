---
name: triage
intent: intake
writes:
  - products/<product-slug>/project-planning/tasks.md (local source: status / spawned_as updates in place; created from template if absent)
  - GitHub issue write-back (github source: comment + in-progress label on the picked issue)
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/dev-flow/templates/tasks.template.md
  - .agent/commands/project/dev-flow/02-create-prd.md
  - .agent/commands/project/dev-flow/02a-create-frd.md
  - .agent/commands/project/dev-flow/02b-create-bug.md
  - .agent/glossary.md
---

# /triage — Intake picker (scan a source, take the next item)

## What this is

`/triage` is the **front door** to the intake engine. It reads a product's intake **source** — the
local `tasks.md` queue (see `.agent/glossary.md` § "Intake queue") or a GitHub repo's issues — shows the
open `todo` items, and routes the chosen one into the matching weight of the engine —
`/create-bug | /create-frd | /create-prd` — **without you retyping it**. It does not plan or implement
anything itself; it dispatches and keeps the source's state honest.

This is the **external-source intake adapter**. Two sources are live: `local` (the `tasks.md` file,
default) and `github` (issues read via `gh`). An **`--auto` mode** (§ Autonomous mode) makes `/triage`
the unattended **T4 local trigger** a scheduler invokes on a cadence.

> **Looking for what to build NEXT, as a new product?** That is not here. `/triage` picks work
> **inside an existing product**, because both sources are per-product by construction. Promote one **by hand** with `/create-prd`; there is no third source, and adding one is
> an intake-engine change, not a flag. Say so rather than silently offering only `tasks.md` items
> when the operator asked what to build next.

**Not a backlog of subtasks.** One source item = one prospective pipeline run. Granular tasks (T001…)
are produced downstream by `/create-*`. **Not the research `initiatives.md`** (those are bets — an
initiative is promoted *into* the queue as an entry).

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **before** parsing slash arguments.
Resolve `product_slug` first. The local queue is per-product at `products/<product-slug>/project-planning/tasks.md`.

## Arguments

- `--source local|github` — where to read from. **Default `local`** (the product's `tasks.md`). `github`
  reads the source repo's open issues via `gh` (see § Source adapters).
- `--repo <owner/name>` — github source only: which repo's issues to read. Defaults to the product's git
  `origin` remote.
- `<TASK-NNN>` (local) / `<issue-number>` (github) — skip the picker and take that specific item.
- `--list` / no actionable pick — report the items read-only (a `/status` for intake) and stop.
- `--auto` — non-interactive, policy-driven selection for unattended/scheduled runs (no `AskUserQuestion`). See § Autonomous mode.
- `--execute` — with `--auto`, actually run the pipeline. **Without it, `--auto` is notify-only** (reports, routes nothing).
- `--types bug[,feature,prd]` — `--auto` eligibility filter. **Default `bug`** (the only 0-gate type — safe unattended).
- `--max N` — max items processed per `--auto` run. **Default 1** (one-at-a-time).

## Source adapters

`/triage` reads ONE source per run; both normalize to the same entry shape, so the pick → route → write-back
steps are source-agnostic.

**`local` (default).** The product's `project-planning/tasks.md` (§ "Intake queue"). State lives in the
file; `/triage` writes `status` / `spawned_as` back in place.

**`github`.** The source repo's OPEN issues, via:
`gh issue list --repo <r> --state open --json number,title,state,labels,body,url,createdAt,author`
Normalize each issue to an entry:
- `id` = `github#<number>` · `source` = `github#<number>` · `title` = issue title · body = the issue body
  (seeds the type-specific fields the chosen create command needs).
- **type — label-map + classifier fallback (locked policy A):** label `bug` → `bug`; label
  `enhancement` (or `feature`) → `feature`; an explicit `prd`/`epic` label → `prd`; **anything else or
  unlabeled** → run the propose-and-confirm classifier (`.agent/glossary.md` § "Work item type": confident
  bug-vs-rest, humble FRD-vs-PRD) and confirm the proposed type with the operator before routing.
- **de-dupe:** skip issues already in progress — i.e. carrying an `in-progress` label, or closed. The
  issue's own state is the ledger for github-sourced items; they are **not** copied into `tasks.md`.
- **auth:** uses the active `gh` account. If `gh` is absent or unauthenticated, STOP and report
  (`gh auth login`) — do not fall back silently or improvise the GitHub REST call.

## Autonomous mode (`--auto`) — the T4 local trigger

`--auto` makes `/triage` non-interactive so a **local scheduler** can run it unattended (e.g. Windows Task
Scheduler running `scripts/triage-auto.ps1` on a cadence). NB: headless `claude -p` does **not** resolve
slash commands, so the script instructs claude to **read and follow this command file** with the args
rather than passing `/triage`. It
reuses the same source adapters + routing; only selection and gating change. It runs on **this machine**,
so it inherits the existing `gh`/git auth, the cloned product repos, and the toolchain (the T4 probe
confirmed those are local-machine-bound — a cloud trigger would need a PAT + env reconstruction).

**Selection (policy-driven, no prompts):** read the source, de-dupe, keep items whose type is in `--types`
(default `bug`), sort by priority, take up to `--max` (default 1).

**Two modes, safety-first:**
- **notify-only (default).** If eligible items > 0, report them (count + ids/titles) — via `PushNotification`
  when available, else a printed/logged summary — and route NOTHING. **On 0 eligible, stay silent** (log
  only, no notification) so a scheduled run doesn't nag. Schedule THIS first to validate triggering +
  de-dupe at zero risk.
- **`--execute`.** For each selected item, run the FULL pipeline autonomously to a PR — route via
  `/create-*` → `/implement` → `/code-review` → `/test` → `/ship` (green-before-push). `/ship` closes out
  the source itself (10-ship § 15a-intake / step 18). This is the autonomous run, policy-triggered
  instead of operator-triggered.

**Guardrails (non-negotiable):**
- **Bugs first.** Default `--types bug` — bugs have 0 operator gates, so they run cleanly unattended;
  FRD/PRD would stall on theirs (include them only once an auto-accept policy exists).
- **Never auto-merge.** The opened PR is the human gate.
- **One run at a time per product.** If an in-progress autonomous branch/run exists for the product, skip
  and report — don't stack.
- **Valves still STOP.** A bug's can't-reproduce / not-contained valve halts that item and notifies; never
  guess a fix.
- **Honest status.** Marketplace items ship `shipped_with_caveats` with deferred host-frame smoke (no
  tenant unattended) — never a fabricated pass.

**Staged rollout:** schedule `--auto` (notify-only) → once trusted, `--auto --execute --types bug --max 1`
→ widen `--types` / `--max` later, or graduate to a cloud trigger (needs a PAT).

**Trigger options (all four, pros/cons + recipes): `scripts/triage-auto.README.md`** — OS Task Scheduler
(local, unattended), `CronCreate`/`/loop` (in-session, zero-setup), cloud routine (`/schedule`,
machine-independent), GitHub Action (event-driven). Each is a front-end to this same `--auto` driver.

## Steps

1. **Resolve the source** (§ Source adapters) and load its open items.
   - **local:** read `products/<product-slug>/project-planning/tasks.md`. If it does not exist, offer to
     create it from `.agent/commands/project/dev-flow/templates/tasks.template.md` (header filled with the
     product name), then report "queue created, empty — add entries and re-run" and stop. If it has no
     `todo` entries, report "no open tasks" and stop.
   - **github:** run the `gh issue list` query, normalize + de-dupe. If `gh` is unavailable/unauthenticated,
     STOP and report. If no eligible issues remain, report "no open issues" and stop.
2. **Present the items.** List the open items sorted by priority (high → medium → low) then id/number. Show
   `id · type · title · priority · source` per line. This is the "scan the list" view.
3. **Pick.** If a specific `<TASK-NNN>` / `<issue-number>` arg was given, select it. Otherwise present the
   items via `AskUserQuestion` (offer the top item first, labeled Recommended) and let the operator choose,
   or decline. `--list` / decline → stop after step 2 (read-only).
4. **Validate the pick.** Confirm the item has the fields its `type` needs to seed the create command
   (bug → what's broken + repro + current/expected; feature → user value + scope bound; prd → problem +
   goal). For a github item whose type came from the classifier, confirm the proposed type first. If a
   required field is missing, ask a tight clarifying cluster, capture the answers, then continue. Do not
   invent missing content.
5. **Route by `type`** — invoke the matching create command, seeding it with the item body as the source
   input so it does capture (bug) / discovery (frd, prd) without re-interrogating from scratch:
   - `bug → /create-bug`  ·  `feature → /create-frd`  ·  `prd → /create-prd`
   - Routing always goes **through `/create-*`**, never straight to `/implement` — this preserves the
     same-slots principle and the operator-gate model (default autonomous — 3 gates: spec / clickdummy / content; see § "Work item type" / § "Operator Gate").
   - The create command owns its own scope dial, git branch, manifests, gates, and Operator Checkpoint
     from here. `/triage` does not duplicate that mechanism.
6. **Write back to the source** once the create command has produced the intake doc + branch:
   - **local:** set the picked entry's `status: in_progress` and write `spawned_as: <bug-/frd-/prd-NNN> @ <branch>` in place.
   - **github:** `gh issue comment` the issue ("taken as FRD-NNN @ branch frd-NNN") and add an `in-progress`
     label (create it on the repo first if absent). Do not edit `tasks.md` for github-sourced items — the
     issue is their ledger.
   - On a `not-contained` promotion inside `/create-bug` (bug → frd/prd), reflect the promoted type in the
     write-back (the source mirrors the engine's decision, it does not override it). **Record an `intake`
     block in the run manifest** — `{ source, task_id | issue_number, routed_by: "/triage" }` — so `/ship`
     can close the source at ship. **Terminal close-out** (local entry → `## Closed`; github issue →
     closed) is wired into `/ship` (10-ship § 15a-intake / step 18) and keys on that `intake` block.

## Validation

- `product_slug` resolved; for `local` the queue path is correct for the product (group-aware).
- The source was read: local queue (created from template if absent) OR github issues via `gh` (auth
  confirmed, else the run STOPPED).
- Exactly one item was acted on per run (or the run was read-only / declined).
- The picked item's `type` mapped to the correct create command (label-map or confirmed classifier for
  github); routing went **through** `/create-*`, never straight to `/implement`.
- The source was written back: local `status` / `spawned_as` in place, OR the github issue got the comment
  + `in-progress` label; github items were de-duped (in-progress/closed skipped) and NOT duplicated into `tasks.md`.

## Output rules

- **Begin with the Operator Checkpoint block** (`.agent/glossary.md` § "Operator Checkpoint"). A missing
  required field you had to ask about is a Decision/Assumption; a classifier-proposed type awaiting
  confirmation is a Decision; a `gh` auth stop is a `[BLOCKER]`.
- **Operator gate — SOFT.** After dispatching, end with the next step the *routed* command recommends —
  e.g. for a clean bug: "Recommended next: `/implement` (the queued item is now BUG-NNN)." For frd/prd, hand
  off to the create command's own gate (a prd stops at `/challenge-prd` close; an frd's planning span is
  unattended and its first stop is the end-of-build review). Escalate
  to a hard STOP only if a `[BLOCKER]` arises (`gh` unauthenticated, a malformed queue that cannot be parsed safely).
- A read-only / `--list` run just prints the items and stops — no gate line needed.
- **`--auto` runs are unattended:** the soft gate is moot (no operator present). Notify-only emits the
  eligible-items summary and stops; `--execute` runs each item's pipeline to a PR (the PR is the gate) and
  emits a per-item result. Any valve / `[BLOCKER]` halts that item and notifies instead of prompting.
