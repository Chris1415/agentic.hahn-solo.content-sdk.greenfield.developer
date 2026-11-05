# Agent Workflow

## Development Pipeline

The canonical sequence is **9 steps**. `/challenge-prd` rejoined it on 2026-07-29 (split out of `/create-prd`, which used to run the critical review inline); `/document` remains **on-demand only**.

```
/prime → /rubber-ducky → /create-prd → /challenge-prd → /architect → /design → /task-breakdown → /implement → /code-review → /test → /ship
  setup    explore         spec           spec review      structure     visual    planning         build         review          verify    close
```

| Step | Command | Agent(s) | Purpose | Output |
|------|---------|----------|---------|--------|
| 0 | `/prime` | — | Read-only repo reconnaissance | `prime.md` |
| 1 | `/rubber-ducky` | 01 Rubber Ducky | Divergent exploration → concept brief | `brain-dump-<ts>.md` |
| 2 | `/create-prd` | 02 Product Manager | Scope dial → **discovery grill** (one question at a time) → PRD → ADRs (closes soft, auto-chains to stage 2a) | `prd-NNN.md`, `prd-minimal-NNN.md`, ADRs, `interrogation-discovery-<ts>.md` |
| 2a | `/challenge-prd` | 02 Product Manager | Cold-read gap analysis → **grill over the ranked gaps** (one question at a time) → merge answers into the spec → re-extract `prd-minimal` → adjust ADRs. **Carries the `spec` gate.** | revised `prd-NNN.md`, re-extracted `prd-minimal-NNN.md`, adjusted ADRs, `interrogation-challenge-<ts>.md` |
| 3 | `/architect` | 04 Architect | Architecture blueprint + ADRs + baseline promotion (≥5 ADRs). No UI. Soft close | `architecture-<ts>.md`, ADRs, optional `baseline.md` |
| 3a | `/design` | 05 UI Designer | 1–3 UI variant specs + POC clickdummies. **Carries the `design` gate** (the POC winner pick). Skipped when `ui_variants: skip` / no UI scope | `ui-design-<ts>-vN.md`, `project-planning/design-prototypes/poc-vN-prdNNN/` |
| 4 | `/task-breakdown` | 06 Lead Developer, 07 QA | Execution-ready task list with § 4c + TDD. Soft close (no gate token) | `task-breakdown-<ts>.md`, optional `qa-report.md` |
| 5 | `/implement` | 08 Developer | Build from prd-minimal + task breakdown (slim context) | implementation code + task-breakdown § 0/§ 8 updated in place (schema 7+; no separate runbook) |
| 6 | `/code-review` | 08 Developer (review mode) | Critical code review → auto-fix findings | `code-review-<ts>.md` |
| 7 | `/test` | 07 QA Specialist, 08 Developer | Comprehensive testing → auto-fix findings | `test-report-<ts>.md` |
| 8 | `/ship` | 02 Product Manager | Ship report + lite README/CHANGELOG (auto-lite) + commit + push + PR | `ship-report-<ts>.md`, README/CHANGELOG updates |

The 8-step table above is the **PRD path**. It is the *full* weight of one shared engine with three intake entry points.

### Intake types (schema 8+)

The pipeline has three entry points discriminated by manifest `work_item_type`. **Same engine, same artifact slots, different fill** — `canonical_artifacts.prd`/`prd_minimal` are the universal spec slots regardless of type, so the Architect/Lead-Dev/QA/Developer contracts above are unchanged. See `.agent/glossary.md` § "Work item type".

| Type | Command | Weight | Sequence | Gate tokens that apply |
|------|---------|--------|----------|-----------|
| **prd** | `/create-prd` | full | `/create-prd → /challenge-prd → /architect → /design → /task-breakdown → /implement → /code-review → /test → /ship` | all five (`spec` · `design` · `build` · `final` · `go_live`) |
| **frd** | `/create-frd` | feature | `/create-frd → /challenge-prd (light, soft) → /task-breakdown → /implement → /code-review → /test → /ship` (skips `/architect`+UI by default) | `build`/`final` + `go_live` (`spec`/`design` inert) |
| **bug** | `/create-bug` | bug | `/create-bug → /implement → /code-review → /test → /ship` (RED-test-first; thin task breakdown produced inline; skips `/architect`+`/task-breakdown` planning) | `final` + `go_live` + two valves |

**Gate ladder:** the five tokens in `scope_dial.gates` are the whole planned-stop surface — all default on, all untickable (drop them all ⇒ `fully_autonomous`). A lighter weight does not have *fewer gates*, it has **inert tokens**: an FRD/bug never reaches `/challenge-prd`'s hard close or `/design`, so `spec`/`design` never fire. **Stages with no token close SOFT for every weight** (`/architect`, `/task-breakdown`, `/implement`, `/code-review`, `/ship`, `/publish`) — they escalate on a critical trigger, a `[BLOCKER]`, or an operator-named `extra_stops` entry, but hold no standing stop (corrected 2026-07-30). The **bug valves** (can't-reproduce → ask; not-contained → promote) fire regardless of the token set. **Promotion** (bug→frd→prd) is re-classify + enrich, never restart. **Definition-of-done backbone** per type: prd = per-phase AC; frd = acceptance criteria; bug = the RED regression test.

**On-demand commands (NOT in canonical sequence):**

| Command | When to use | Why on-demand |
|---------|-------------|---------------|
| `/document` | Heavy doc refresh: post-MVP polish, architecture overhaul, public release of an internal product, or when `scope_dial.docs_at_ship == full` | `/ship` emits a 1-paragraph README + CHANGELOG entry inline on `auto-lite` (the default). Heavy `/document` runs were skipped by 7/8 products when they sat in the canonical sequence |

**Typical sequence:** `/prime` → `/rubber-ducky` (optional) → `/create-prd` → `/challenge-prd` → `/architect` → `/design` → `/task-breakdown` → `/implement` → `/code-review` → `/test` → `/ship`

**Content SDK branch:** `/create-prd → /challenge-prd → /discover-sitecoreai → /architect → /design → /task-breakdown → /provision-sitecoreai → /implement → /code-review → /test → /ship → /discover-components → /author-content → /test-content → /publish`. **`/discover-sitecoreai`** (read-only) runs a scenario interview (what already exists) and, for an existing CM, reads the real serialized items through the operator's existing CM code base and writes `canonical_artifacts.content_model` so the **Architect designs against the real component inventory** (renderings + datasource field types/casing + resolver patterns) instead of `[ASSUMED]` shapes — the **PM/PRD stays at product altitude**. NEW sites skip the read (content model derived from the static app). **`/provision-sitecoreai`** (DevOps Engineer) then stands up the decoupled CM + editing host and deploys the baseline before `/implement`. The **`/implement → /code-review → /test` span is a DELIVERY LOOP** (rule `71-delivery-loop.mdc`): one component fully built (all its items) → reviewed → tested, loop back to the Developer on an unfixed Critical/Major or a test fail (bounded 5, then escalate). Its **cadence is operator-set** via `scope_dial.delivery_loop` and moves the **test leg only** — `/code-review` runs per tranche in both: `per_component` (default — review+test after each component tranche) or `once` (review each tranche as it lands, commit at review-clean, then a single `/test` over the whole build; cheaper). **PREVIEW-FIRST / PUBLISH-LAST:** everything up to `/publish` works against **preview**; **`/ship` ships CODE ONLY** (deploy against the preview context — no publish), then the **content phase runs AFTER `/ship`** — **`/author-content`** (Content Author 14 + in-loop Content QA 07) authors real brand content (or seeds test pages) into Sitecore via the **Marketer MCP** against **preview** (no publish here), then **`/test-content`** (QA 07 fresh audit + 14 fixes; bounded loop, 07 is the arbiter of "good enough") is the authoritative content gate (**hard gate #3**). **`/publish`** is the FINAL live step — publish everything (layout + content + media) + ser-pull the authored content into `cm/` + commit + LIVE-context redeploy + media gate. A live Sitecore write is an integration boundary (preview→confirm→verify). and rules `71-delivery-loop` / `81-existing-site-discovery` / `80-content-sdk-headapp`. **The whole content phase is gated on `scope_dial.content_authoring`** (set at `/create-prd` kickoff): `auto` (default — runs iff content-sdk) / `yes` (force) / `no` (skip — `/ship` is terminal). When it runs, `scope_dial.imagery` (`mood` default / `none`) sets how `/author-content` fills empty Image fields. **Operator stop-points are pick-any** (`scope_dial.gates`: `spec`/`design`/`build`/`final`/`go_live`, all default on; `build` = the single end-of-build review of the **Components Preview** page at `/test` close on content-sdk runs — the build phase is otherwise autonomous, no per-component/mid-build stops; untick all = fully autonomous, publishes unattended) — see `.agent/glossary.md` § "Operator Gate".

**Minimal quick path:** `/prime` → `/create-prd` → `/challenge-prd` → `/architect` → `/task-breakdown` → `/implement` → `/code-review` → `/test` → `/ship`

**Freeform (vibe-coding) path:** `/implement` (with text prompt) → `/code-review` → `/test` — skip the entire planning pipeline, describe what you want, let the Developer build it, then verify with code review and testing.

**Setup commands (not part of pipeline):** `/create-rules`, `/cleanup-project-planning`

## Rubber Ducky vs Create-PRD discovery

Both `/rubber-ducky` and `/create-prd` involve asking questions, but they serve fundamentally different purposes and operate at different levels:

| | `/rubber-ducky` (Agent 01) | `/create-prd` discovery (Agent 02) |
|---|---|---|
| **Mode** | Divergent exploration | Convergent refinement |
| **Question** | "What could this be?" | "What exactly are we building?" |
| **Assumes** | Nothing — starts from chaos | A direction exists (from brain-dump or user's stated goal) |
| **Tolerance for ambiguity** | High — open questions are a feature | Low — every answer must be concrete enough to become a requirement |
| **Proposes alternatives** | Yes — "What if instead…?" | No — drives toward the spec, not away from it |
| **Output precision** | Concept-level (idea, problem, users, rough scope) | Requirement-level (acceptance criteria, NFRs, measurable success) |
| **Open questions** | Captured and passed downstream | Resolved or explicitly deferred with rationale |

**When brain-dump exists:** `/create-prd` accepts the brain-dump's Decisions as confirmed and focuses discovery on resolving its Open Questions, converting Assumptions to decisions, and driving high-level items to requirement-level precision. It does **not** re-explore the fundamentals the Rubber Ducky already covered.

## Product workspace

All planning artifacts for a product live under **`products/<product-slug>/project-planning/`**. Resolve `<product-slug>` **before** any writes: see `.agent/commands/project/product-workspace.md` (`product=` in the message, an unambiguous first slash argument, or **ask the user** which product to use).

In the rest of this document, **`project-planning/`** means that folder under the **currently resolved product** (full path `products/<product-slug>/project-planning/`). Run manifests MUST include `product_slug`, `product_root`, and **repo-relative** paths in `canonical_artifacts` (see `.agent/manifests/run-manifest.template.json`). Do not use a repo-root `project-planning/` folder for new work.

**`products/` is a logical MOUNT POINT** (`product-workspace.md` § 1a): the root resolves as `AGENTIC_PRODUCTS_ROOT` → `.agent/workspace.json` → `<repo>/products`, so the trees may sit outside this repo. Every path in this document stays in that logical form — resolve it with `.agent/scripts/resolve-products-root.mjs` before touching the filesystem, and **store the logical path, never the resolved one**, or the manifest stops being readable on a machine whose root differs. `products/_root/` is pinned to the repo and never moves.

## Canonical Principles

- Prefer one canonical run id per project flow.
- Persist lineage in:
  - `products/<product-slug>/project-planning/workflow/run-<timestamp>.json`
  - `products/<product-slug>/project-planning/workflow/current-run.json`
- Resolve artifact paths from the run manifest `canonical_artifacts`. If the manifest is missing, use the file in the appropriate directory under the resolved product whose name has the latest timestamp (e.g. `brain-dump-YYYYMMDD-HHMMSS.md`). No "latest" or alias files are written.

## Sub-agent orchestration model

The Team Lead (00) is the **only agent that runs in the main conversation context**. All specialist agents (02, 04, 05, 06, 07, 08, 13, 14, 99) run as **isolated sub-agents** — each spawned in its own context, given only its mandated inputs, and shut down when its work is complete.

**Why this matters:** When specialists share a single conversation context, by the time QA (07) runs, the context contains the PRD, architecture, UI specs, task breakdown, and 4+ persona files — the "slim context" becomes a convention that can't be enforced. Sub-agent isolation turns slim context from a guideline into a structural guarantee: each specialist literally cannot see artifacts outside its input list.

**How it works in practice:**

1. **Team Lead reads the goal** and determines the agent sequence (which specialists, in what order).
2. **Team Lead presents the sequence** to the user and waits for confirmation.
3. For each specialist stage, the Team Lead **spawns a sub-agent** with:
   - **The `subagent_type`** — the agent's frontmatter `name` (e.g. `software-architect`, `developer`, `qa-specialist`), passed to the `Agent` tool as `subagent_type: "<name>"`. **This is load-bearing:** it is the ONLY thing that applies the agent's pinned `model:` and `effort:` (see the **Spawn contract** below). Also pass the identity file path (e.g. `.agent/agents/team/04-software-architect.md`) in the prompt as belt-and-suspenders.
   - The task description from the command step
   - **Explicit file paths** for all mandated inputs (per the Slim Context Chain table below)
   - The output file path and template path
4. The sub-agent **reads its identity, reads its inputs, does its work, writes its artifact to disk**, and completes.
5. The Team Lead **reads the output artifact** and validates it (non-empty, required sections present, handoff metadata correct).
6. The Team Lead **presents the result to the user** at the gate and waits for approval or change requests.
7. If changes are needed, the Team Lead spawns the same specialist again with the change request as additional input.
8. Once approved, the Team Lead updates the run manifest and proceeds to the next specialist.

**User-in-the-loop:** The user interacts only with the Team Lead. Every gate between specialists is a mandatory user checkpoint. When any fact, scope decision, or assumption is unclear at any stage, the Team Lead (or the specialist through the Team Lead) **asks the user** — no stage proceeds on ambiguity.

**Spawn contract (mandatory — this is what applies the pinned model + effort).** Every specialist is spawned with a single `Agent` tool call whose **`subagent_type` is the agent's frontmatter `name`** — one of `product-manager`, `software-architect`, `ui-designer`, `lead-developer`, `qa-specialist`, `developer`, `doc-writer`, `devops-engineer`, `content-author`, `source-analyst`, `research-sidecar`, `rubber-ducky`. Claude Code applies that agent file's `model:` and `effort:` **only** when the spawn names its `subagent_type`. A spawn with a generic type (`claude` / `general-purpose`), a missing `subagent_type`, or an explicit `model:` override **silently drops the pinned model + effort** — the sub-agent inherits the parent session's model (Opus) and the session effort, defeating the model split (optimization #3) and the per-stage effort dial. **Never pass a `model:` override on a specialist spawn** unless deliberately overriding for one run. (Observed regression: one run's FRD spawned every specialist generically → all sub-agents ran on Opus, including Developer/QA which are pinned `sonnet`, and the `effort:` dial never took effect.) **Also inject `Output Level: <minimal|verbose>`** on every spawn (rule `73-output-verbosity.mdc`) — that field is prompt-enforced (not a harness frontmatter knob like `effort`), so the explicit line is what makes mid-turn silence stick.

**Sub-agent prompt template:** When spawning a sub-agent, the Team Lead includes in the prompt:
- "Read `<agent-identity-file>` to adopt your role, personality, and working style."
- "Your task: `<task description from the command step>`"
- "Read these input files: `<list of file paths>`"
- "Read the output template: `<template path>`"
- "Write your output to: `<output file path>`"
- **`Output Level: <minimal|verbose>`** — resolved per rule `73-output-verbosity.mdc` (spawn override → `scope_dial.output_verbosity` → `fully_autonomous` force-minimal → agent frontmatter pin). Mandatory on every spawn; cuts mid-turn narration tokens on execution stages.
- Any stage-specific instructions (mode, the resolved composition, skills to load, etc.)

## Slim context chain (token discipline)

Late pipeline steps should **not** reload every prior artifact. Bounded inputs reduce context size and cost while preserving correctness **if** upstream agents push actionable detail into the right files. **Sub-agent isolation enforces this structurally** — each sub-agent receives only the files listed below, not the accumulated context of prior stages.

| Agent / stage | Primary inputs to load (do not load full chat history or earlier drafts) |
|---------------|--------------------------------------------------------------------------|
| **04 Software Architect** (`/architect`) | **Full PRD** + **existing ADRs** in `project-planning/ADR/` that apply to this initiative (index + relevant files). Optional: `prime.md` for stack/test conventions **only if** the PRD does not already state them. For rebuild runs (`source.analysis_mode == rebuild`), load `source.source_analysis_artifact` (mandatory). For full-clone rebuilds (`source.clone_scope_mode == full_website_clone`), also load `source.content_dump`, `source.assets_bundle`, and `source.clone_handover_artifact` (mandatory). |
| **05 UI Designer** (`/architect`) | **Full PRD** + **architecture blueprint** or **PRD + ADRs** (minimal track). |
| **06 Lead Developer** (`/task-breakdown`) | **Full PRD** + **architecture path** or **PRD + ADRs** + **selected UI variant** (path or file). For rebuild runs (`source.analysis_mode == rebuild`), also load `source.source_analysis_artifact`; for full-clone rebuilds (`source.clone_scope_mode == full_website_clone`), also load `source.content_dump`, `source.assets_bundle`, and `source.clone_handover_artifact`. Produces a task breakdown that is **self-contained for implementation** (see **§ Task breakdown as execution contract** below). |
| **07 QA Specialist** (`/task-breakdown`) | **Full PRD** + architecture or ADRs + **task breakdown** (+ optional UI path) for gap analysis and enrichment. **Edits the task breakdown in place.** |
| **08 Developer** (`/implement`) | **`canonical_artifacts.prd_minimal`** + **enriched `canonical_artifacts.task_breakdown`** only. **Parallel execution (tranche-level, 2026-07-29):** Sequential by default. When § 5 declares a **Tranche independence** set AND the Team Lead re-verifies all five eligibility checks (rule `71` § "Parallel tranches"), it spawns one Developer **plus its Code-Reviewer** per tranche **concurrently, each in a **`git worktree` the orchestrator created in the product repo** (not the `Agent` `isolation:` flag)**, scoped to that tranche's Task IDs. Each still receives only prd_minimal + the task breakdown. **QA does not run per tranche** — once every tranche is review-clean the orchestrator owns the join (merge → regenerate `.sitecore` maps once → serial shared-tenant writes → **one QA over the integrated whole**: full suite + lint + build); a join conflict means the test was wrong → finish sequentially. 🔍 probe tranches are blocking and run first, alone. See `/implement` § "Parallel execution model". **Exceptions:** (1) **Rebuild** runs: also use manifest `source` (`content_dump`, `assets_bundle`, source-analysis artifact) when `analysis_mode` is `rebuild`. (2) **Legacy manifests** without `prd_minimal`: one-time fallback to full PRD + task breakdown; then set `prd_minimal` on the next planning cycle. Scoped read of **`project-planning/plans/prime.md`** is allowed **only** when a task or runbook explicitly requires toolchain paths (keep the read minimal). **Do not** load the full PRD, architecture blueprint, or UI spec files in the normal flow. |
| **08 Developer** (`/code-review`) | **`prd_minimal`** + **task breakdown** (§ 4c + § 0 target dir + § 8 test status) + **git diff**. Legacy schema-6 runs also read the implementation runbook when present. Reviews code critically then fixes findings. |
| **07 QA Specialist** (`/test`) | **PRD** (or prd-minimal) + **architecture/ADRs** (or **baseline.md** when promoted) + **task breakdown** (§ 8 global test reference; § 9-10 contract) + optional **code review report** + optional **POC clickdummy**. Legacy schema-6 runs also read the implementation runbook. Tests comprehensively then hands findings to Developer (08) for fixing. |

## Escalation protocol

When a downstream agent (typically Developer 08, but any agent) discovers a gap in its inputs that prevents it from completing its work, the pipeline uses a structured escalation rather than guessing or loading unauthorized upstream docs.

**When to escalate:**
- A § 4c subsection is missing detail the Developer needs to implement a task
- A task description is ambiguous and could be interpreted in multiple incompatible ways
- A dependency between tasks is missing or contradictory
- An API contract, data model, or integration point referenced in the task breakdown doesn't match reality
- Any situation where proceeding would require guessing

**Escalation structure:** The escalating agent writes a structured escalation block (in chat or as a comment in the artifact):

```
## ESCALATION
- **From:** Agent ID and role (e.g. "08 Developer")
- **Blocked task:** Task ID and title
- **Gap type:** missing-detail | ambiguity | contradiction | missing-dependency
- **What's missing:** Specific description of what's needed
- **Which § 4c section (if applicable):** e.g. "4c-4 UI implementation notes"
- **Suggested resolution:** What the agent thinks is needed (optional)
```

**Resolution flow:**

1. The escalating agent **stops work on the blocked task** (may continue other unblocked tasks if dependency order allows).
2. The Team Lead receives the escalation and determines which upstream agent can resolve it:
   - § 4c-1/4c-2 gaps → Software Architect (04)
   - § 4c-3 gaps → Lead Developer (06)
   - § 4c-4 gaps → UI Designer (05) or Lead Developer (06)
   - § 4c-5/4c-6 gaps → Lead Developer (06)
   - § 4c-7 gaps → Source Analyst (99)
   - Task description ambiguity → Lead Developer (06) or Product Manager (02)
   - Contradictions → **ask the user** first, then route to the relevant agent
3. The Team Lead **presents the escalation to the user** and asks whether to (a) route to the upstream agent for a fix, (b) provide the answer directly, or (c) adjust the plan.
4. If routed to an upstream agent: the Team Lead **spawns a sub-agent** with the escalation as input plus the relevant upstream artifact. The sub-agent patches the artifact (e.g. updates § 4c in the task breakdown) and completes.
5. The Team Lead validates the patch, presents it to the user, and — once approved — signals the blocked agent to resume.

**Key rule:** Escalation always surfaces to the user. No agent autonomously patches another agent's output without the user seeing the change.

**Auto-friction on escalation.** Every escalation event automatically writes a friction-log entry per `.agent/manifests/README.md` § Friction log — no operator step required. The escalating agent (or Team Lead, when transcribing a sub-agent's escalation) appends an entry with:

- `Severity: medium` (single nudge) or `high` (multiple iterations needed before resolution) or `critical` (run stopped)
- `Observed by: stage-failure` (when the gap halted the stage) or `self-flag from agent NN` (when the agent surfaced the gap proactively)
- `What happened:` Restate the escalation block's gap + which § 4c subsection was incomplete + which upstream agent had to patch
- `Skill / command at fault:` The upstream artifact path that should have carried the missing detail (e.g. `task-breakdown-<ts>.md`, `architecture-<ts>.md`)
- `Suggested patch target:` What rule, skill, or template would have prevented the gap (e.g. "extend `40-sdk-contracts.mdc` to require unwrap-level citation in § 4c-6")
- `Status: open`

This makes dormancy impossible — escalations no longer rely on the operator remembering to record them. The `/cleanup-friction` sweep then promotes these into rule, skill, or template patches.

## Friction-log gate prompt

A short, default-skip prompt invoked at every interactive pipeline gate to capture friction the operator noticed but the agents did not auto-flag. Quoted verbatim by `/architect`, `/task-breakdown`, `/implement`, `/code-review`, `/test` so the wording stays consistent.

**When to run:** After the operator confirms an interactive gate (architecture handoff, UI handoff, task-breakdown handoff, QA-enrichment handoff) and before the next sub-agent is spawned. For non-interactive commands (`/implement`, `/code-review`, `/test`), run once at end-of-command before final output.

**Prompt shape:** A single line — do not use `AskUserQuestion`, that is too heavy for a default-skip prompt. Output:

```
Friction nudge — anything noteworthy this stage worth recording?
Reply with a one-line note (severity defaults to medium), or 'skip' (default).
```

**On reply:**
- If the user replies `skip`, an empty message, or an affirmative like `no` / `nope` / `nothing`, do nothing — do not create or touch the friction log.
- If the user replies with any text, append a friction-log entry per `.agent/manifests/README.md` § Friction log:
  - **Severity:** parse from the reply (operator can prefix `low:` / `medium:` / `high:` / `critical:`); default `medium`.
  - **Observed by:** `user-correction` (the user surfaced it) or `Team Lead` (the Team Lead surfaced it inline before the user replied).
  - **What happened:** the user's reply, verbatim.
  - **Skill / command at fault:** best-effort guess based on the gate context (the command + step that just completed); leave `null` if unclear.
  - **Suggested patch target:** `null` unless the user's reply names one.
  - **Status:** `open`.
- Initialize the friction-log file (per `.agent/commands/project/dev-flow/templates/friction-log.template.md`) if it doesn't exist for this run.

**Why default-skip.** A friction prompt that nags every gate gets ignored or actively resisted. Defaulting to skip keeps the prompt low-friction (one line, `Enter` skips); the operator only types when something is genuinely worth recording. This converts the friction log from a discipline-only artifact (measured: 1/8 products had logs) into an at-the-time capture (every gate, near-zero cost).

**Rate limit.** A single command run produces at most one prompt per gate — not per sub-agent action. `/implement` spawns multiple Developer sub-agents; the friction nudge fires once at command end, not per sub-agent.

**`prd-minimal` artifact:** After the PRD is **created and critically reviewed** and **revised**, write **`project-planning/specs/prd-minimal-NNN.md`** with the **same numeric id** as `prd-NNN.md`. Content: problem, goal, non-negotiable bullets, short in/out of scope, success criteria, key constraints (ADR ids when relevant). Template: `.agent/commands/project/dev-flow/templates/prd-minimal.template.md`. Record path in `canonical_artifacts.prd_minimal`. If the full PRD changes materially later, **update `prd-minimal` in the same edit pass** so it stays aligned.

**Task breakdown as execution contract:** The file **`task-breakdown-<timestamp>.md`** (after **06** and **07**) must contain everything **08** needs that would otherwise live only in architecture or UI docs:

- **§ 4c Implementation execution contract** — non-negotiable technical boundaries, key ADR references, parity notes, and any **UI implementation snippets** (tokens, layout, copy) copied or summarized from the selected UI variant.
- Per-task **Description** / **Expected Output** must carry enough detail to implement without opening the architecture or UI files.
- **§ 9–10** (TDD + per-task tests) are the test contract when standalone `qa-report.md` is omitted.

## Minimal vs full planning track

Not every initiative needs every planning file. Two tracks are supported; both end with a task breakdown ready for `/implement`.

| Track | Core artifacts | Optional extras |
|-------|----------------|-----------------|
| **Minimal** | PRD, **`prd-minimal`** (same id as PRD), ADRs (`project-planning/ADR/`), task breakdown (`task-breakdown-<timestamp>.md`) | — |
| **Full** (default in `/architect` unless you choose minimal) | Same as minimal | Separate **architecture blueprint** (`architecture/<timestamp>.md`), optional **UI design** (`ui-design/<timestamp>-vN.md`, 1–3 variants), optional **standalone QA report** (`plans/qa-report.md`) |

**Manifest fields:** In `canonical_artifacts`, set `architecture` or `qa_report` to **`null`** when that artifact is intentionally omitted (minimal track). Do **not** treat `null` as "resolve latest file"—there is no file.

**Resolution for implementation:**

- **Agent 08 default:** **`prd_minimal` + task breakdown** (enriched by **07**). Rebuild source assets per manifest when applicable.
- **No architecture file (minimal track):** Planning still used **PRD + ADRs** to produce tasks; **08** does not reload ADRs if **§ 4c** and tasks already encode decisions. If something is missing, fix the task breakdown (or temporarily fall back for legacy runs).
- **No qa-report.md:** Use the task breakdown's **test tasks**, **4b Important Test Cases**, **§ 8 What Needs To Be Tested**, and **§§ 9–10** (TDD contract and per-task test specifications) after **QA Specialist (07)** enrichment as the test contract. The task breakdown § 8 is the global test reference (formerly the implementation-runbook's role; absorbed in schema 7+).

**Optional by context:** Source analysis (URL/rebuild), brain dumps, and UI design remain optional regardless of track; see **Useful Optional Artifacts** below.

## Greenfield vs feature (during project)

The **same pipeline** is available in two cases. Through `/architect` → `/task-breakdown`, planning order is: **architecture (04)** → **optional UI design (05)** → **task breakdown from Lead Developer (06)** → **QA (07) edits that same task-breakdown file** (TDD + per-task tests) → optional standalone `qa-report.md` → then **`/implement` (08)** → **`/code-review` (08)** → **`/test` (07+08)**.

1. **Greenfield** — You are starting from scratch. Run `/prime` then `/create-prd` with your **whole-app idea**. The run creates **PRD-000** (holistic view of the app), then planning artifacts (architecture, optional UI, task breakdown enriched by QA, optional QA report) per your track.
2. **Feature during a project** — The app (or a prior phase) already exists and you have a **feature idea**. Run `/prime` (to refresh context), then `/create-prd` with your **feature idea**. The pipeline creates the **next** PRD (PRD-001, PRD-002, ...), then **feature-scoped** planning that integrates with the existing system. Downstream agents use the latest PRD and scope their output to that feature.

So you can dump ideas into a PRD and execution plan both for the whole app (greenfield) and for features that follow later.

## PRD numbering and resolution

- **PRD-000** is the holistic view of the whole app and is usually the greenfield starting point. File: `products/<product-slug>/project-planning/specs/prd-000.md`.
- Subsequent PRDs are numbered ascending: **PRD-001**, **PRD-002**, ... (files `prd-001.md`, `prd-002.md`, ...). These are typically **feature PRDs** (one PRD per feature or initiative).
- **Follow-up tasks** (architecture, task breakdown, critical review, testing, execution, etc.) **always use the latest PRD** unless the user explicitly specifies another PRD.
- **Resolving the latest PRD** when the run manifest is missing or `canonical_artifacts.prd` is absent: prefer files named `prd-NNN.md` (three-digit id) in `products/<product-slug>/project-planning/specs/` and take the one with the **highest N**; if none exist, fall back to the file in that directory with the latest timestamp (e.g. `prd-YYYYMMDD-HHMMSS.md`).
- **`prd_minimal` resolution:** Prefer `canonical_artifacts.prd_minimal`. If absent, derive **`prd-minimal-NNN.md`** using the same **NNN** as the resolved canonical PRD; if that file is missing, treat as legacy run (implementation may use full PRD once—see **Slim context chain**).

## Agent catalog (numeric order)

Agent files define **role identity only** (persona, personality, expertise, working style). They contain no task instructions. Tasks and deliverable contracts are injected by the invoking command at runtime. This makes every agent reusable across different jobs — the same PM can author a PRD, challenge a PRD, or revise a PRD depending on which command invokes it and in which mode.

**Paths:** The **Agent file** column is relative to **`.agent/agents/`** (for example, `team/00-team-lead.md` → `.agent/agents/team/00-team-lead.md`).

| ID | Agent file | Role identity | Pipeline commands |
|----|------------|--------------|-------------------|
| 00 | `team/00-team-lead.md` | Delivery coordinator; reads goal, sequences specialist agents, enforces stage gates | Orchestrates all commands |
| 01 | `team/01-rubber-ducky.md` | Interruptive brainstorming facilitator; question-first, assumption-hostile | `/rubber-ducky` |
| 02 | `team/02-product-manager.md` | Senior PM and Technical Strategist; methodical, user-obsessed, spec-rigorous | `/create-prd`, `/create-frd`, `/create-bug`, `/challenge-prd`, `/ship` |
| 03 | `team/03-research-sidecar.md` | On-demand inline research delegate; grounds fuzzy claims for 01/02 without polluting caller context | `/research` (and inline during `/rubber-ducky` / `/create-prd`) |
| 04 | `team/04-software-architect.md` | Senior Software Architect; opinionated, ADR-first, consequence-oriented | `/architect` |
| 05 | `team/05-ui-designer.md` | Senior UI/UX Designer; research-grounded, named directions, always confirms count + divergence | `/architect` |
| 06 | `team/06-lead-developer.md` | Technical Program Manager / Engineering Lead; precision-oriented, dependency-explicit, § 4c mandatory | `/task-breakdown` |
| 07 | `team/07-qa-specialist.md` | QA Architect and Test Lead; TDD enforcer, edits task breakdown in place, treats untested code as incomplete | `/task-breakdown`, `/test` |
| 08 | `team/08-developer.md` | Principal Implementation Lead; artifact-faithful, slim-context disciplined, stops and asks vs guessing | `/implement`, `/code-review`, `/test` (fixes) |
| 09 | `team/09-doc-writer.md` | Synthesizes planning artifacts into README, CHANGELOG, and `docs/` | `/document` |
| 99 | `team/99-source-analyst.md` | Source Discovery and Parity Analyst; never invents content, extracted vs inferred labeling, classifies mode first | On-demand source analysis |


## Agent invocation modes

Some agents support multiple modes activated by task injection in the invoking command. The agent file defines identity and personality; the mode is a behavioral override delivered by the command at invocation time.

| Agent | Mode | Activated by |
|-------|------|-------------|
| 02 Product Manager | discovery (grill the idea — one question at a time) | `/create-prd` (step 2) |
| 02 Product Manager | constructive (build spec from the grill ledger) | `/create-prd` (step 8) |
| 02 Product Manager | critical (cold-read gap analysis, then grill the operator) | `/challenge-prd` (steps 3–4) |
| 08 Developer | implementation | `/implement` |
| 08 Developer | review (critical code review) | `/code-review` |
| 08 Developer | fix (apply fixes from review/test) | `/code-review`, `/test` |

## Error recovery and run resumption

If a stage fails mid-run:

1. The failing agent sets `status` to `failed` and appends a `stage_history` entry with `outcome: "failed"` and an `error` description.
2. The user (or Team Lead on retry) reads the manifest, identifies the failed stage from `stage_history`, and decides whether to retry or skip.
3. On retry, set `implementation.resumed_from_stage` to the stage being retried, update `status` back to the appropriate in-progress value, and re-invoke the agent.
4. Agents receiving a manifest with `resumed_from_stage` should treat it as a continuation — reuse existing artifacts rather than regenerating from scratch.

**`paused` status:** Use when a stage is blocked on user input (e.g. critical review gate, planning track selection). The stage remains in `stage_history` with `exited_at: null` until the user responds.

## QA task breakdown snapshots

Before QA Specialist (07) edits the task breakdown in place, the invoking command (`/task-breakdown`) should:

1. Copy the current `task-breakdown-<timestamp>.md` to `task-breakdown-<timestamp>-pre-qa.md`
2. Set `canonical_artifacts.task_breakdown_pre_qa` to that path
3. Then invoke QA (07) to edit the original

This preserves a clean diff between Lead Developer's original and QA-enriched versions. If QA enrichment introduces issues, the pre-QA snapshot is available for comparison or rollback.

## Manifest Expectations

The canonical run manifest should track:

- source inputs (`source`, including URL/rebuild fields when relevant)
- source-analysis artifact
- canonical planning artifacts (`canonical_artifacts`), including **`prd_minimal`** alongside **`prd`**
- **`ui_design`** — object with `proposal_count`, `divergence`, `variant_paths`, `selected_variant_path` (see `run-manifest.template.json`; legacy manifests may use a **string** path only—treat as a single selected UI file). If variant markdown is **removed from the repo** or a prior selection (e.g. hybrid v11) is **revoked**, clear **`selected_variant_path`** (**`null`**), set **`variant_paths`** to **`[]`**, and record the change in **`notes`** so agents do not treat an old path as canonical. Until a new UI pass, rely on **task breakdown §4c** and the implemented app for visual intent.
- **`task_breakdown_style`** — `standard` until QA enrichment; often set to **`tdd`** after QA (07) enforces test-first ordering in the task breakdown
- QA artifact (standalone `qa_report` path, or **`null`** on minimal track when omitted)
- code review report path
- test report path
- implementation target directory (recorded in task-breakdown § 0; was the runbook's job in schema 6)
- workflow status

## Architecture Decision Records (ADRs)

- **ADRs are the backbone of the architecture.** All major architectural decisions and answers are documented in `project-planning/ADR/`.
- **Numbering:** ADR-0001, ADR-0002, ... (four-digit, ascending). Files: `adr-0001-<short-slug>.md`. Next number = highest existing + 1.
- **When to create an ADR:** Whenever an architectural question is answered (by the user, by discovery, or by analysis), whenever you get needed information that affects architecture, or whenever a significant technology/pattern/constraint is chosen. Create one whenever it makes sense. Prefer **one primary decision per ADR**; split bundled decisions into multiple ADRs (see `project-planning/ADR/README.md`).
- **Template:** Use `project-planning/ADR/template.md`. After creating a new ADR, update the index in `project-planning/ADR/README.md`.
- **Contradicting information:** If you receive information that contradicts an existing ADR or a prior answer:
  1. **Inform the user** explicitly: state what was previously decided (and which ADR or source) and what contradicts it.
  2. Do not silently overwrite. Ask how to resolve.
  3. Once resolved: either update the existing ADR (add an "Update (date): ..." note and keep Status) or create a new ADR that supersedes the old one and set the old ADR's status to **Superseded by ADR-XXXX**.
- Architecture work (e.g. within `/architect`) and other planning should align with and reference ADRs; new decisions that emerge should be written into ADRs.

## Target Directory Rule

Before scaffolding a new app, inspect the workspace root.

For a **new Sitecore Content SDK / SitecoreAI head** app, use the official generator from `products/` (or the user-chosen parent folder): **`npx create-content-sdk-app@latest nextjs`** — see the **`setup-scaffold`** skill (single source for commands, policies, and post-scaffold env setup; plugin install: `CLAUDE.md` § "Sitecore skills plugin"). Do not hand-assemble `package.json` as a substitute.

If the root is not safe to scaffold into directly, ask the user to choose between:

- workspace root
- `site/`
- `app/`
- user-specified directory

Record that decision in the run manifest and the task breakdown's § 0 Quick orientation.

## Source analysis: optional URL parity stage

`/source-analysis` is **on-demand only**. It is not part of the standard sequence.

Run it only when the operator explicitly:

- provides one or more public URL(s), and
- requests rebuild/parity extraction from those URLs.

When it runs in rebuild mode, source analysis executes the rebuild crawl (`products/<product-slug>/project-planning/scripts/source-rebuild-crawl/`), producing `content-dump.json`, `manifest.json`, and downloaded files under `products/<product-slug>/project-planning/source-analysis/assets/<run_id>/`. The markdown artifact includes a deep content map (sections 10–12). **Implementation** for that run should use those assets and the dump unless the operator explicitly drops parity.

`source.clone_scope_mode` refines rebuild runs:

- `home_plus_top5_primary_nav`: bootstrap parity scope.
- `full_website_clone`: exact full-clone parity is the run-family definition of done; source-analysis emits `full-clone-handover-<timestamp>.md`, and both `/architect` and `/task-breakdown` must consume the full source bundle (analysis markdown + dump + assets + handover) before planning.

`greenfield` mode remains available only by explicit operator request for inspiration-only URL analysis; it is never a default trigger from URL presence.

## Useful Optional Artifacts

- `project-planning/source-analysis/source-analysis-<timestamp>.md`
- `project-planning/source-analysis/assets/<run_id>/` (rebuild mode: crawl output)
- `project-planning/ui-design/ui-design-<timestamp>-v1.md` (and `-v2`, `-v3` when multiple proposals)
- `project-planning/plans/code-review-<timestamp>.md`
- `project-planning/plans/test-report-<timestamp>.md`

These reduce ambiguity for rebuilds, redesigns, and multi-stage implementation work.
