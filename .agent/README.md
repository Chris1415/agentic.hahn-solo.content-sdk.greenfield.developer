# Agent workflows

**Repo layout:** This `.agent/` folder at the repository root drives **project development** (`commands/project/` — `dev-flow/`, `templates/`, `prime.md`, `create-rules.md`, `product-workspace.md`, ...), plus manifests (`manifests/`) and reference rules (`rules/`). Agent identities live under `agents/team/`.

**Product-scoped planning:** All PRDs, run manifests, and planning artifacts live under **`products/<product-slug>/project-planning/`**. Every project command applies `.agent/commands/project/product-workspace.md` first: resolve which product (`product=`, first slash arg when unambiguous, or **ask the user**), bootstrap folders if needed, then read/write only under that tree.

The following sections describe agent commands and workflows for structured development.

---

## Agent model

**Agents** (`.agent/agents/`) define **role identity only** — persona, personality, expertise, and working style. They carry no task instructions, no output formats, and no artifact contracts.

**All task orchestration comes from three sources:**
- **Commands** (`.agent/commands/`) — fully specify the task, input contract, output contract (file paths, templates, required sections), handoff chain, and quality gates for each agent invocation
- **Team Lead** (`.agent/agents/team/00-team-lead.md`) — orchestrates project development. Runs in the main conversation context, **spawns each specialist as an isolated sub-agent** with only its mandated inputs, validates output artifacts, and enforces stage gates. See `.agent/WORKFLOW.md` (Sub-agent orchestration model)
- **Direct invocation** — call an agent directly and give it a custom task; each agent file has a `## Direct Invocation` section that tells you what to tell it

**User-in-the-loop:** Every planning stage pauses for user confirmation. When any fact, scope decision, or assumption is unclear, the pipeline asks — it does not guess.

**Escalation protocol:** When a downstream agent hits a gap, it escalates through the Team Lead rather than guessing. See `.agent/WORKFLOW.md` (Escalation protocol).

This separation means any agent can be reused for different tasks without creating new agent files. The Product Manager can write a PRD, challenge a PRD, or revise a PRD — depending on which command invokes it and in what mode.

---

## Development pipeline

```
/prime            → products/<slug>/project-planning/plans/prime.md (read-only recon)
/rubber-ducky     → products/<slug>/project-planning/brain-dumps/brain-dump-<timestamp>.md (interactive discovery)
/create-prd       → products/<slug>/project-planning/specs/prd-NNN.md + prd-minimal-NNN.md (discovery → PRD → ADRs; chains to /challenge-prd) [PRD weight]
/create-frd       → products/<slug>/project-planning/specs/frd-NNN.md + frd-minimal-NNN.md (bounded feature; skips /architect; → /task-breakdown) [FRD weight]
/create-bug       → products/<slug>/project-planning/specs/bug-NNN.md + bug-minimal-NNN.md + thin task breakdown (RED-test-first; → /implement) [bug weight]
/challenge-prd    → critical review of that spec + merges the answers back in (re-extracts minimal, adjusts ADRs); carries the `spec` gate
/architect        → architecture blueprint + ADRs + optional UI design + POC clickdummies
/task-breakdown   → task-breakdown-<timestamp>.md with § 4c + TDD enrichment
/implement        → implementation from prd-minimal + enriched task breakdown (slim context)
/code-review      → critical code review → auto-fix findings
/test             → comprehensive testing → auto-fix findings
```

Optional special stage: run `/source-analysis` only when the operator explicitly provides URL(s) and requests rebuild parity extraction. Place it after `/challenge-prd` and before `/architect`.

**Typical sequence:** `/prime` → `/rubber-ducky` (optional) → `/create-prd` → `/challenge-prd` → `/architect` → `/task-breakdown` → `/implement` → `/code-review` → `/test`

**Greenfield vs feature:** Use the same pipeline for (1) **greenfield** — whole-app idea, first run → PRD-000, whole-app architecture and plan; (2) **feature during a project** — existing app, new feature idea → next PRD (PRD-001, ...), feature-scoped architecture and execution plan.

### Pipeline commands

```
/rubber-ducky [idea or source-path]              → concept brief (interactive, standalone)
/create-prd [optional brain-dump path] [prompt]  → PRD + prd-minimal + ADRs
/challenge-prd [spec-path] [focus prompt]        → critical review + merge (auto-chained; also on-demand re-challenge)
/source-analysis [url ...] [rebuild]             → optional URL parity extraction (only explicit URL + rebuild requests)
/architect [prd-path]                            → architecture + optional UI (interactive)
/task-breakdown [prd-path]                       → execution-ready task list (interactive)
/implement                                       → builds from prd-minimal + task breakdown
/code-review [scope]                             → reviews and fixes code
/test                                            → tests and fixes findings
```
(Artifacts are under `products/<slug>/project-planning/`, resolved via manifest `canonical_artifacts` or latest-by-timestamp per directory. Set slug with `product=` or a leading slash argument; see `product-workspace.md`.)

---

## Setup commands

| Command | Purpose |
|---------|---------|
| `/prime` | Read-only reconnaissance → `products/<slug>/project-planning/plans/prime.md` |
| `/create-rules` | Generate AGENTS.md + .agent/rules/*.mdc |
| `/cleanup-project-planning` | Reset planning artifacts |

**Order matters:** Run `/prime` first. Then settle the initial scope with `/create-prd`. Run `/create-rules` *after* the initial scope is settled so rules can reflect scope and boundaries.

### New project kickoff
1. Run `/prime`
2. Run `/create-prd` (with discovery)
3. Run `/create-rules`
4. Run `/architect` → `/task-breakdown` → `/implement` → `/code-review` → `/test`

### Existing project kickoff
1. Run `/prime` to map the current stack, commands, repo layout, and boundaries
2. Run `/create-prd` with a **raw prompt**, a **brain-dump path** from `/rubber-ducky`, or **both**. If PRDs already exist, the run creates the next PRD (PRD-001, ...) and feature-scoped planning.
3. Run `/create-rules` after the scope document exists so rules can reflect both the codebase and the intended work

---

## Folder map

| Location | Contents |
|----------|----------|
| `products/<slug>/project-planning/brain-dumps/` | brain-dump-<timestamp>.md |
| `products/<slug>/project-planning/specs/` | prd-000.md (holistic), prd-001.md, ... (ascending); follow-up tasks use latest PRD |
| `products/<slug>/project-planning/architecture/` | architecture-<timestamp>.md (optional on **minimal** track) |
| `products/<slug>/project-planning/ui-design/` | ui-design-<timestamp>-vN.md, 1-3 variants (optional) |
| `products/<slug>/project-planning/plans/` | prime.md, task-breakdown-<timestamp>.md, qa-report.md (optional on minimal), code-review-<timestamp>.md, test-report-<timestamp>.md (legacy schema-6 runs also carry implementation-runbook-<timestamp>.md; schema 7+ absorbed it into task-breakdown § 0 + § 8) |
| `products/<slug>/project-planning/source-analysis/` | source-analysis-<timestamp>.md (optional; URL rebuild parity runs only) |
| `products/<slug>/project-planning/workflow/` | run-<timestamp>.json, current-run.json |

---

## Commands reference

| Command | Flow | Intent |
|---------|------|--------|
| prime | Setup | analysis |
| rubber-ducky | Project | discovery |
| create-prd | Project | product_spec |
| create-frd | Project | feature_spec |
| create-bug | Project | bug_report |
| challenge-prd | Project | review_and_align |
| source-analysis | Project | discovery (optional URL rebuild parity extraction) |
| architect | Project | planning |
| task-breakdown | Project | planning |
| implement | Project | implementation |
| code-review | Project | review |
| test | Project | verification |
| create-rules | Setup | setup |

---

## Templates

**Dev-flow templates** (`.agent/commands/project/dev-flow/templates/`):

| Template | Used by | Purpose |
|----------|---------|---------|
| brain-dump.template.md | rubber-ducky | concept brief output structure |
| prd.template.md | create-prd | PRD output structure |
| frd.template.md | create-frd | FRD (feature) output structure — leaner than PRD; mandatory acceptance criteria |
| bug.template.md | create-bug | bug report output structure — repro/current/expected + RED-test spec |
| prd-minimal.template.md | create-prd, create-frd, create-bug, challenge-prd, architect, implement | slim spec for implementation (type-agnostic minimal contract) |
| source-analysis.template.md | (on-demand source analysis) | source/URL analysis output |
| architecture.template.md | architect | architecture blueprint structure |
| ui-design.template.md | architect | UI design specification (optional) |
| task-breakdown.template.md | task-breakdown | execution-plan structure |
| tdd-breakdown.template.md | task-breakdown | TDD-style task breakdown |
| implementation-runbook.template.md | implement | implementation runbook structure (tombstone — schema 7+ no longer produces this artifact; absorbed into task-breakdown § 0 + § 8) |

**Shared project templates** (`.agent/commands/project/templates/`):

| Template | Used by | Purpose |
|----------|---------|---------|
| qa.template.md | task-breakdown, test | QA report structure |


---

## Flow registry (`.agent/flows.json`)

Machine-readable index of all commands, agent assignments, input/output contracts, and flow relationships. Use it to:

- **Validate flows** — check that command sequences have matching inputs/outputs
- **Generate wrappers** — run `bash .agent/scripts/sync-wrappers.sh` to regenerate `.claude/commands/` and `.cursor/commands/` from `flows.json`
- **Discover commands** — programmatically list available commands by flow, intent, or agent

Update `flows.json` whenever you add, rename, or remove a command.

## Wrapper sync (`.agent/scripts/sync-wrappers.sh`)

The `.claude/commands/` and `.cursor/commands/` directories contain thin wrappers that delegate to canonical commands in `.agent/commands/`. Run the sync script after modifying `flows.json` to keep wrappers in sync:

```bash
bash .agent/scripts/sync-wrappers.sh
```

---

## Rules (`.agent/rules/*.mdc`)

- **Reference rule files** — Numbered **`NN-name.mdc`** under **`.agent/rules/`** (e.g. `00-general`, `10-language`, `20-boundaries`, `30-tdd`) define default structure and guardrails.
- **`/create-rules`** — Generates **`00-general.mdc`**, **`10-language.mdc`**, and **`20-boundaries.mdc`** into **`.agent/rules/`** (does not overwrite **`30-tdd.mdc`**). Uses `products/<slug>/project-planning/plans/prime.md` (required) plus optionally the current PRD (from run manifest or latest PRD under that product — see WORKFLOW.md) to infer scope-aware boundaries. Run after the initial scope is settled.

---

## Improvement backlog (`.agent/BACKLOG.md`)

The framework's own **fold-back ledger** — learnings we want to fold into the setup as directives (rules /
agent traits), commands, or hooks, each with status + provenance. Audit an entry against the current
`.agent/` before actioning it; every change is organizational design (it cascades across all projects).
