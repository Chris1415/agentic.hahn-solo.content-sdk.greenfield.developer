# Agents

This folder defines the **agent identities** that staff the framework's pipelines. Each `.md` file is a persona — capabilities, working style, behavioral rules — that commands inject at runtime to perform a specific task. Identity lives here; task instructions and I/O contracts live in `.agent/commands/`.

This README is the **format contract** for agent files: what fields are mandatory, how they are structured, and how the same files are mirrored into Claude Code's native subagent system under `.claude/agents/`.

## File layout

```
.agent/agents/
  team/                          # Numbered specialist roles (00-99)
    00-team-lead.md              # Orchestrator
    01-rubber-ducky.md           # Discovery facilitator
    02-product-manager.md        # PM (PRD authoring + critical review)
    03-research-sidecar.md       # On-demand inline research delegate
    04-software-architect.md     # ADRs + architecture
    05-ui-designer.md            # UI proposals + POC clickdummies
    06-lead-developer.md         # Task breakdown
    07-qa-specialist.md          # TDD enrichment in-place
    08-developer.md              # Implementation
    09-doc-writer.md             # Heavy doc passes
    13-devops-engineer.md        # SitecoreAI infra provisioning + publish
    14-content-author.md         # Audience-facing content authoring
    99-source-analyst.md         # Greenfield/rebuild URL crawls
  README.md                      # This file
```


This folder holds **full agents** (`team/*.md`) — self-contained personas with frontmatter and body.

## Frontmatter schema (full agents)

Every file in `team/` must begin with YAML frontmatter:

```yaml
---
name: <lowercase-hyphen-id>           # required — must match the filename slug
description: >                        # required — used by Claude to auto-route
  <when to invoke this agent. Lead with the trigger; spell out scope boundaries.>
tools: <comma-separated tool names>   # optional — capability allowlist; omit = inherit all
model: <opus|sonnet|haiku|fable>      # optional — defaults to inherited model
effort: <low|medium|high|xhigh|max>   # optional — per-subagent reasoning depth; overrides session effort
output_verbosity: <minimal|verbose>   # optional — mid-turn chat narration pin (rule 73); not a harness knob
role_id: <numeric agent id>           # required — matches flows.json agent_registry key
type: <orchestrator|specialist|discovery>  # required — matches flows.json type
---
```

| Field | Purpose | Example |
|-------|---------|---------|
| `name` | Stable identifier used by `Agent(subagent_type: "<name>")` calls and by the wrapper sync script. **Must equal the filename slug** (`08-developer.md` → `name: developer` — strip the numeric prefix). | `developer` |
| `description` | The routing trigger. Claude reads this to decide whether to delegate to this subagent. **Lead with the use case, then spell out negative scope** ("NOT for X, NOT when Y"). One paragraph, ~3-5 sentences. | See worked example below |
| `tools` | Capability allowlist. Restrict to what the role legitimately needs. Omit only when the role genuinely needs full capability. | `Read, Edit, Write, Bash, Glob, Grep, Skill` |
| `model` | Cost/quality dial. `opus` for high-reasoning planning roles; `sonnet` for execution; `haiku` is rare here; `fable` is **assigned to no role**; since 2026-09-29 it is reachable only as the explicit `dual_review=fable` opt-in (see the rule of thumb below). Defaults to inherited if omitted. | `sonnet` |
| `effort` | Reasoning-depth dial — per-subagent, **overrides session effort**. `xhigh` for the fuzziest reasoning (PM/Architect), `high` for planning that works from complete inputs, `medium` for contract-driven execution, `low` for sourced assembly. Pin explicitly so behavior is deterministic regardless of the session setting. Per-*identity*, not per-invocation (see the rule of thumb below). Defaults to session effort if omitted. | `medium` |
| `output_verbosity` | Mid-turn **chat** narration pin (rule `73-output-verbosity.mdc`) — `minimal` = silence between tools / results-only; `verbose` = short progress OK when an operator is watching. **Not a Claude Code harness field** (unlike `effort`); the Team Lead also injects `Output Level:` on spawn. Pin `minimal` on execution roles, `verbose` on discovery/critical-review/architecture. Artifacts on disk are unaffected. | `minimal` |
| `role_id` | Cross-reference to `flows.json` `agent_registry`. Lets the registry stay the single source of truth for the numbered roster while frontmatter is human-readable. | `08` |
| `type` | Same as `flows.json` — `orchestrator` for 00, `discovery` for 01, `specialist` for everything else. | `specialist` |

### Worked `description` example

Bad (too generic):

> A developer agent that writes code.

Good (trigger + scope + negative scope):

> Implementation specialist for an approved task breakdown. Use this agent when a `prd-minimal` and a QA-enriched task breakdown exist and code needs to be written under `products/<slug>/site/`. Operates TDD-disciplined and dependency-ordered, loads only `prd-minimal` + task breakdown (slim context), and escalates rather than guesses when § 4c is incomplete. NOT for planning, architecture decisions, scope expansion, or freeform feature work without a task breakdown — for those use `/rubber-ducky`, `/architect`, or `/task-breakdown` first.

## Frontmatter schema (specialization layers)

> No specialization layers exist in this repo. The format contract below is retained for reference.

Specialization layers use a reduced frontmatter. They never override the base agent's `tools` or `model` — those are inherited at composition time.

```yaml
---
name: <slug-pm>                       # e.g. scb-pm, jss-pm, content-sdk-pm
description: >                        # when to pick this specialization over the base
  <one paragraph: which managed repo, what scope, what's specifically different.>
extends: <base-agent-name>            # required — references a team/ agent's `name`
role_id: <base agent's role_id>       # required — same numeric id as base
type: specialist
---
```

The body of a specialization layer documents **only the deltas** from the base agent: managed repo paths, vendor-specific lenses, repo acquisition protocol, output naming. It must not duplicate the base agent's persona or signature behaviors.

## Body section spec

After frontmatter, every full agent file uses this section order. Specializations omit the sections marked **(optional for specializations)**.

| # | Section | Purpose | Required |
|---|---------|---------|----------|
| 1 | `# <Display Name>` | H1 title, human-readable (e.g. `# Developer`). | yes |
| 2 | `## Identity` | Persona, scope boundaries, what this agent IS and IS NOT. One paragraph, max two. | yes |
| 3 | `## Core Expertise` | Bulleted capabilities. Each bullet is a concrete competency, not a marketing claim. | yes |
| 4 | `## Inputs Contract` | Canonical artifacts this agent expects when invoked. Reference run-manifest paths where relevant. **NEW** — pulled out of command files so the agent is self-describing. | yes (full agents); optional for specializations |
| 5 | `## Outputs Contract` | Artifacts this agent produces, with repo-relative paths. **NEW** — same rationale. | yes (full agents); optional for specializations |
| 6 | `## Personality and Working Style` | Disposition. How the agent decides, what it tolerates, what it rejects. | yes |
| 7 | `## Communication Style` | Tone, format, structure of outputs. | yes |
| 8 | `## Signature Behaviors` | Bulleted, **bold-prefixed** concrete operational rules. The most important section — this is where pipeline discipline lives. | yes |
| 9 | `## Direct Invocation` | What to do when called outside an orchestrated command (no task pre-assigned). Always asks the caller for the missing context. | yes |

### `Inputs Contract` shape

```markdown
## Inputs Contract

When invoked via a command, expect these artifacts. Resolve via the run manifest at
`products/<product-slug>/project-planning/workflow/current-run.json`:

- `canonical_artifacts.prd_minimal` — repo-relative path to `products/<slug>/project-planning/specs/prd-minimal-NNN.md`
- `canonical_artifacts.task_breakdown` — QA-enriched breakdown with mandatory § 4c
- `canonical_artifacts.qa_report` — standalone report or `null` (minimal track)
- `source.analysis_mode` — `greenfield` or `rebuild`; only when `rebuild`, also load source-analysis sections 10-12 and the asset bundle
- `source.clone_scope_mode` — `none` | `home_plus_top5_primary_nav` | `full_website_clone`; when `full_website_clone`, also load `source.clone_handover_artifact` and treat full clone parity as the planning target unless explicitly overridden

When invoked directly (no command, no run manifest), ask the caller for the equivalent artifacts before starting.
```

### `Outputs Contract` shape

```markdown
## Outputs Contract

This agent always produces:

- Source code under `products/<product-slug>/site/` (target directory recorded explicitly in the task breakdown's § 0 Quick orientation)
- Updated run manifest with `implementation.status` and `stage_history` entries for `implemented`
- Test results summary (lint + build + full test suite) recorded in the task breakdown's § 8 What Needs To Be Tested (schema 7+; legacy schema-6 runs wrote a separate `implementation-runbook-<run_id>.md`)

Never writes to: `.env*`, `.claude/`, `.cursor/`, `.agent/`, or paths outside `products/<slug>/`.
```

## Tool allowlists (canonical defaults)

Restrict every agent to the smallest tool surface that lets it do its job. Reduces blast radius and makes intent explicit.

| Agent | `tools` allowlist | `model` | `effort` | `output_verbosity` |
|-------|-------------------|---------|----------|-------------------|
| 00 Team Lead | `Read, Glob, Grep, Agent, TaskCreate, TaskUpdate, TaskList, TaskGet, AskUserQuestion, Edit, SendMessage` | `opus` | `medium` | `minimal` |
| 01 Rubber Ducky | `Read, Write, Edit, Glob, Grep, AskUserQuestion, TaskCreate, SendMessage` | `sonnet` | `high` | `verbose` |
| 02 Product Manager | `Read, Write, Edit, Glob, Grep, AskUserQuestion, WebFetch, WebSearch, SendMessage` | `opus` | `medium` | `verbose` |
| 03 Research Sidecar | `Read, Write, Glob, Grep, WebFetch, WebSearch, mcp__plugin_context7_context7__*, SendMessage` | `sonnet` | `medium` | `minimal` |
| 04 Software Architect | `Read, Write, Edit, Glob, Grep, Bash, Skill, WebFetch, WebSearch, SendMessage` | `opus` | `medium` | `verbose` |
| 05 UI Designer | `Read, Write, Edit, Glob, Grep, Bash, Skill, WebFetch, WebSearch, mcp__plugin_playwright_playwright__*, SendMessage` | `opus` | `medium` | `verbose` |
| 06 Lead Developer | `Read, Write, Edit, Glob, Grep, Skill, SendMessage` | `opus` | `medium` | `verbose` |
| 07 QA Specialist | `Read, Edit, Glob, Grep, Bash, Skill, SendMessage` | `sonnet` | `medium` | `minimal` |
| 08 Developer | `Read, Edit, Write, Bash, Glob, Grep, Skill, TaskCreate, TaskUpdate, TaskList, TaskGet, SendMessage` | `sonnet` | `medium` | `minimal` |
| 09 Doc Writer | `Read, Write, Edit, Glob, Grep, SendMessage` | `sonnet` | `low` | `minimal` |
| 13 DevOps Engineer | `Read, Write, Edit, Bash, Glob, Grep, Skill, SendMessage` | `opus` | `medium` | `minimal` |
| 14 Content Author | `Read, Write, Edit, Bash, Glob, Grep, Skill, WebFetch, WebSearch, AskUserQuestion, mcp__sitecore-marketer__*, mcp__plugin_playwright_playwright__*, SendMessage` | `opus` | `medium` | `minimal` |
| 99 Source Analyst | `Read, Write, Edit, Glob, Grep, Bash, WebFetch, mcp__plugin_playwright_playwright__*, SendMessage` | `sonnet` | `medium` | `minimal` |

Notes:

- **Team Lead has `Edit` but no `Write`** — it orchestrates and never edits source. `Edit` is reserved for narrow orchestration writes (friction-log appends, `stage_history` entries, status transitions on stage exit). Manifest fields owned by stage owners (e.g. `canonical_artifacts.prd_minimal`) are written by the specialist that owns the stage, never by the Team Lead.
- **QA Specialist has `Edit` but not `Write`** — its job is in-place enrichment of the task breakdown, not creating new files. (When a standalone `qa-report.md` is needed it is written by the command via templating, not by the agent's free-form `Write`.)
- **MCP tools** (`mcp__plugin_playwright_playwright__*`) are listed by glob; the sync into `.claude/agents/` resolves the glob to the concrete tool names available in the environment.
- **`SendMessage` is in every allowlist.** An agent's plain-text output is invisible to whoever spawned it, so reporting is a tool call — and the last one every agent makes. See each agent's first signature behavior.
- **A listed tool is permission, not presence.** MCP globs resolve to whatever the environment actually exposes — possibly nothing — so an agent must check what it holds rather than trust its own frontmatter. Any role whose core job depends on a tool must name a built-in fallback in its identity: 07 QA drives Playwright from a Node script via `Bash` when `mcp__plugin_playwright_playwright__*` is absent, and 01 Rubber Ducky relays questions when it does not hold `AskUserQuestion`.
- When a role legitimately needs a tool not in its default list, the **command** that invokes it can extend the allowlist for that single invocation; do not relax the agent's frontmatter.

## Model & effort selection rule of thumb

`model`, `effort`, and `output_verbosity` move together on **one axis — planning/reasoning vs. mechanical execution** —
because a role that needs a stronger model usually also needs deeper reasoning *and* benefits from visible narration
when an operator is watching. Set them as a trio, not independently.

**Model:**

- **`opus`** — planning, design, critical review, architecture, PRD authoring, and any real-cloud / brand-facing
  boundary where a mistake is expensive (13 DevOps, 14 Content Author). Reasoning over ambiguous inputs or acting
  where the blast radius is real.
- **`sonnet`** — execution, enrichment, research, documentation. Following structured contracts.
- **`haiku`** — rare here. Reserved for narrow, repetitive assembly/formatting that doesn't appear in the current roster.
- **`fable`** is accepted by the contract but **assigned to no role**. Its only use is the explicit
  `dual_review=fable` opt-in (the second reviewer in `/code-review` and `/challenge-prd`).
  - **Measured 2026-09-29** (blind-graded on the pre-registered
    `fable-probe/` fixtures):
    - Fable 5.1 added **no coverage** over Sonnet 5.5 on code review or on the PM critique.
    - It costs 2.5× an Opus 5.5 review and about 6× a Sonnet 5.5 review.
    - The 5.0-generation evidence for pairing it (`fable-probe/result-dual-review.md`) did not reproduce.
  - Rates per MTok: Fable 5.1 $10/$50 (cache read $0.25); Opus 5.5 $4/$20 (read $0.20); Sonnet 5.5 $2/$10
    (read $0.20).
  - Two older caveats still hold if anyone revisits it:
    1. **Do not stack it with `xhigh`.**
    2. **It is prescription-sensitive:** it prefers goal + constraints over step-enumerated prompts, so A/B the
       command file, not just the model.

**Where Sonnet 5.5 beats or ties Opus 5.5 (2026-09-29 probe, same report):**

- **Critique:** the `/challenge-prd` cold-read analysis now spawns with `model: "sonnet"`. It scored 11–12/12,
  against 9.3 for Opus at `medium`.
- **Code review** stays on Sonnet. It had the best recall and the lowest cost.
- **Consequential decisions stay on Opus.** On 04 Architect, only Opus made the collection-placement call
  correctly.
- **06 Lead Developer is a tie.** Sonnet at `high` ≈ Opus at `medium` for about 55% of the cost, and 06 keeps
  its Opus pin (operator decision, 2026-09-29).
- **Raising Opus to `high` bought nothing on 04/06**, so keep the Opus pins at `medium`.

**Effort** (per-subagent reasoning depth; pin it explicitly so behavior is deterministic regardless of session effort):

- **Opus roles run at `medium` (2026-09-25, operator decision).** Every `opus` identity — 00 Team Lead, 02 PM,
  04 Architect, 05 UI Designer, 06 Lead Developer, 13 DevOps, 14 Content Author — is pinned `medium`. On Opus 5.x the
  lower tiers already exceed prior models' high tiers, and the extra depth of `high`/`xhigh` was paid on every spawn.
  If a planning stage's output quality drops, raise that ONE identity back (02/04 were `xhigh`, 00/05/06 `high`).
- **`high`** — 01 Rubber Ducky (sonnet; divergent exploration with no contract).
- **`medium`** — contract-driven execution: 08 Developer, 07 QA, 03 Research, 99 Source Analyst — plus every opus role above.
- **`low`** — sourced assembly that follows a fixed structure: 09 Doc Writer.

**The governing rule:** *effort should be inversely proportional to how complete the contract feeding the agent is.*
Low effort is safe **only where the contract is complete** — which is exactly what the slim-context + §4c investment
buys the Developer. Under-powering a stage with a thin contract just trades reasoning tokens for bounded 5 rework loops
(each a full re-spawn + re-review + re-test), which costs more than it saved. So keep planning high and starve only the
downstream stages whose inputs are already tight. If you see Developer rework loops, the fix is bumping **06 Lead Developer**
(the §4c author) back up (`high`/`xhigh`), not the Developer.

**Two constraints on `effort`:**

1. **Per-*identity*, not per-*invocation*.** The `Agent` spawn tool exposes `model` but has no per-call `effort`
   override — only this frontmatter field controls it. So an agent that serves multiple tasks runs them all at one
   pinned effort (08 Developer runs both `/implement` and `/code-review` at `medium`; 02 PM runs discovery, critical
   review, and ship-report authoring at `medium`). Pin to the most demanding use. Split a role into a second identity
   only if two of its tasks genuinely need different depths — we are watching `/implement` vs `/code-review` for this.
2. **`effort` ≠ extended thinking.** This overrides the *session* effort for spawned subagents; it is not the legacy
   on/off thinking budget and body-prompt keywords ("ultrathink") don't reliably drive it. On Opus 5, `effort` is the depth dial.

**Output verbosity** (mid-turn chat narration; rule `73-output-verbosity.mdc`):

- **`verbose`** — discovery / critical review / architecture / UI / §4c authoring (01, 02, 04, 05, 06). Visible reasoning is load-bearing when an operator is watching.
- **`minimal`** — execution and orchestration (00, 03, 07, 08, 09, 13, 14, 99). Silence between tools; progress lives on disk; final message = decision-grade envelope. Does **not** shrink artifacts.
- Run dial `scope_dial.output_verbosity` (`auto` / `minimal` / `verbose`, asked at `/create-prd` Call 3) and `fully_autonomous` → force-minimal can override the pin. The Team Lead injects `Output Level:` on every spawn (prompt-enforced — unlike `effort`, this is not a harness frontmatter field the spawn tool reads).

## Naming conventions

- **Filename** — numbered prefix preserved (`08-developer.md`); the prefix anchors role identity in `flows.json` and in stage-history references like `implemented` (08).
- **`name` frontmatter** — strip the numeric prefix (`developer`). This is what `Agent(subagent_type: ...)` and `.claude/agents/` consume.

## Sync to `.claude/agents/`

Agent files are mirrored into Claude Code's native subagent location the same way commands are mirrored into `.claude/commands/`:

- **Source of truth:** `.agent/agents/team/*.md`.
- **Generated mirror:** `.claude/agents/<name>.md`. The mirror is the same file with the filename's numeric prefix stripped (`08-developer.md` → `.claude/agents/developer.md`).
- **Sync script:** `bash .agent/scripts/sync-agents.sh` (companion to `sync-wrappers.sh`). Run after editing any agent file. Validates frontmatter against this contract before writing.
- **Cursor mirror:** Cursor does not yet have a native subagent slot equivalent to `.claude/agents/`; the sync script may emit a thin pointer under `.cursor/agents/` for parity but it is informational only.

The mirror is **regenerated, not edited**. If something needs to change, change the source under `.agent/agents/` and re-run the sync script.

## Boundary: agent file vs command file

When in doubt, ask whether the rule is **about who is acting** (agent file) or **about what task is being performed** (command file).

| Belongs in agent file | Belongs in command file |
|----------------------|------------------------|
| Persona, expertise, working style | The specific task to perform on this invocation |
| Behavioral rules that apply across all invocations of this role | I/O contracts specific to this stage of a flow |
| Tool allowlist, model preference | Stage gates, manifest writes, handoff format |
| Direct-invocation fallback | Skill loads needed for this stage only |
| Universal escalation discipline | Templates the command consumes |

A signature behavior in an agent file should hold true regardless of whether the agent is invoked via `/implement`, `/code-review`, `/test`, or directly. Anything stage-specific belongs in the command.

## Validation rules

The sync script will reject an agent file that fails any of these checks. They are also the rules a human reviewer should apply when editing by hand.

1. **Frontmatter is present** and is the very first content in the file.
2. **`name` matches the filename slug** (filename minus numeric prefix and `.md`).
3. **`role_id` exists in `flows.json` `agent_registry`** and the registry's `file` field points back to this file.
4. **`type` matches `flows.json`**.
5. **`description` is present and non-empty**, longer than one sentence.
6. **`tools` (if specified) lists only known tools** — Claude Code built-ins, MCP tool names, or supported globs.
7. **`model` (if specified) is one of `opus`, `sonnet`, `haiku`, `fable`**.
8. **All required body sections are present** in the order listed above.
9. **No section is empty** — empty section is a stronger signal than a missing one and is treated as malformed.
10. **Specializations declare `extends`** that resolves to a real `team/` agent.
11. **`effort` (if specified) is one of `low`, `medium`, `high`, `xhigh`, `max`**.
12. **`output_verbosity` (if specified) is one of `minimal`, `verbose`**.

## Updating an agent file

1. Edit the canonical file under `.agent/agents/`.
2. Re-run `bash .agent/scripts/sync-agents.sh` to regenerate the `.claude/agents/` mirror.
3. If the change affects routing (`description`), tool surface (`tools`), or model (`model`), call it out in the commit message — these affect the harness, not just prose.
4. If the change affects what artifacts the agent expects or produces, also update the relevant command file's I/O section so command and agent stay in sync.
