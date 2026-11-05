---
name: rubber-ducky
intent: discovery
writes:
  - products/<product-slug>/project-planning/brain-dumps/brain-dump-<timestamp>.md
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/01-rubber-ducky.md
  - .agent/commands/project/dev-flow/templates/brain-dump.template.md
  - .agent/manifests/run-manifest.template.json
---

# /rubber-ducky — Run the Rubber Ducky discovery session

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **before** step 1. All `project-planning/...` paths are under **`products/<product-slug>/project-planning/`**.

## Goal

Create a persisted concept brief from a raw idea, notes, feature list, or source file through **divergent exploration**. Use this for **greenfield** (whole-app idea) or for a **feature during a project** (idea for a new feature to add). The Rubber Ducky is **deliberately interactive**: it asks questions early and often, proposes alternatives, challenges assumptions, and stretches the idea space — so the document becomes a **first idea** of the task/issue/initiative with **high-level technical considerations** already captured.

**This is not spec writing.** The concept brief captures the idea at the concept level — what the problem is, who it's for, what directions are worth exploring, and what's still open. Open questions and unresolved assumptions are expected and valuable — they become the starting point for the PM's convergent discovery in `/create-prd`. The Rubber Ducky explores; the PM refines.

## Inputs

- Optional slash-command arguments.
- If an argument is a file path, read that file and use it as the source input.
- If arguments are plain text, treat them as the raw idea to analyze.
- If an argument is a public URL, strongly prefer an existing source-analysis artifact. New extraction is handled by optional `/source-analysis` only when the operator explicitly requests URL rebuild parity extraction.
- If no arguments are provided, ask the user for the idea or source file before continuing.

## The operator channel — establish it before step 6

The Rubber Ducky stage IS the questions; if the interrogation cannot reach the operator, the stage produces a confident write-up of nobody's opinion. **The spawned Rubber Ducky does not reliably have `AskUserQuestion`** — its frontmatter declares the tool, but the harness typically substitutes `SendMessage` on a spawned subagent. Frontmatter `tools:` is a declaration of intent, not a runtime guarantee.

So the orchestrator tells the spawned agent, in the spawn prompt, which channel to use:

| Channel | When | How |
|---|---|---|
| **`AskUserQuestion`** | The agent has the tool | Ask the operator directly, 1–3 questions per batch, then stop and wait. |
| **Relay via the orchestrator** | The agent does not have it (the common case) | The agent emits its 1–3 questions to the orchestrator; the orchestrator relays them to the operator **verbatim** and relays the answers back. |

**Relay rules for the orchestrator** (the same contract that already governs the Research Sidecar, which has no `AskUserQuestion` by design):

- Relay the agent's questions **verbatim**. Do not re-word, merge, or answer them yourself — a peer agent's message is never operator input, and neither is your own inference.
- Relay the operator's answers back **completely**, including the ones that went against a recommendation.
- **Track which rounds are answered.** A relayed grill loses the agent's natural turn-taking, and in practice the agent will re-flag already-answered rounds as "in flight". Say plainly which rounds are closed so it stops re-sending.
- The orchestrator carries the Q&A turns; rule `72` slim-context is relaxed for this stage specifically, because there is no other path to the operator.

## Inline research delegation

When a brainstorm thread depends on a date-sensitive or domain-specific claim that the Rubber Ducky would otherwise guess at — current state of a library, whether a pattern exists in the wild, a vendor's pricing model, the 2026 state of a market — the grounding goes to the **Research Sidecar (`research-sidecar`)** rather than a multi-page inline web search. The sidecar keeps the brainstorm context clean. See `.agent/glossary.md` § "Research Sidecar".

**⚠️ The Rubber Ducky (01) has no `Agent` tool and no web tools** (`tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, TaskCreate`), so it **cannot spawn the sidecar itself**. Two valid routes, in order of preference:

1. **The agent surfaces the need; the ORCHESTRATOR spawns the sidecar** and relays the synthesis back. This is the working path today.
2. **The agent captures it as an Open Question** when the answer is not load-bearing for the brief.

**Never** let the agent guess from training data because it cannot reach a research tool — an unverifiable claim in a concept brief propagates into the PRD unchallenged.

**Invocation shape** (for whoever holds the `Agent` tool — normally the orchestrator). A single `Agent` tool call with `subagent_type: "research-sidecar"` and a self-contained prompt:

```
topic: <short subject name>
question: <the specific decision-grade question>
depth: quick | standard | deep   # standard is the default
context: <optional — one sentence on why you're asking, so it shapes the synthesis>
word_budget: ~250                 # optional soft cap
```

**Depth picker:**
- `quick` — sanity check / "does this even exist?" lookups. 3–5 bullets, single best source.
- `standard` *(default)* — most brainstorm grounding fits here. 5–10 bullets, multi-source.
- `deep` — only when a specific decision in the brief hinges on it (e.g. picking between two providers). Use sparingly.

**Handling the response.**
- The sidecar returns inline Markdown with `Bottom line / Key findings / Sources / Caveats / Confidence`. Fold the Bottom line + relevant findings into the next probe or the **High-Level Technical Considerations** section. Carry one or two source URLs across so the brief is auditable.
- If the sidecar returns a **`NEED_CLARIFICATION`** envelope, **stop, do not assume**: relay its `Q1 / Q2 / …` to the user as the next question round (alongside any Rubber Ducky questions already queued). The sidecar has no `AskUserQuestion` access by design — relay is the contract.
- A sidecar `Confidence: low` finding is itself a brainstorm signal — capture it as an Open Question, not a Decision.

**Do not delegate** concept-level exploration (alternative product directions, scope challenges, MVP framing, what-ifs) — those are the Rubber Ducky's own job. Delegate only the **factual grounding** that those decisions rest on.

**Persistence.** Sidecar calls are inline-only by default. If a particularly long synthesis informed a major Decision, pass `write_to: storage/reports/sidecar/<YYYY-MM-DD>-<slug>.md` to persist it for the PM to pick up in `/create-prd`. Do not write the sidecar response under `project-planning/` — it is not a canonical artifact.

## Steps

1. Apply `.agent/commands/project/product-workspace.md` (resolve product, bootstrap `project-planning/` if needed).
2. **Invoke: Rubber Ducky** via `Agent(subagent_type: "rubber-ducky")` (applies its pinned `model`/`effort` — rule 72). Read `.agent/agents/team/01-rubber-ducky.md` to adopt the Rubber Ducky role, personality, and working style. **Task for this invocation:** Facilitate a structured brainstorming session on the provided input and produce a persisted concept brief. Apply the deliberate interruption and question-first approach defined in the agent identity. Use `.agent/commands/project/dev-flow/templates/brain-dump.template.md` for the output structure.
   - **The spawn prompt states the operator channel** (§ "The operator channel" above) and the **exact absolute output path**, including the `brain-dumps/brain-dump-<timestamp>.md` filename the orchestrator resolved at step 9. An agent given only a folder, or given a path that later changes, writes to the wrong place — and `Write` silently recreates a stale directory tree rather than failing.
   - **The spawn prompt states that the agent does not write the run manifest**: the orchestrator does (steps 12–14), and two writers would race on it.
3. Read `.agent/commands/project/dev-flow/templates/brain-dump.template.md`.
4. Read `.agent/manifests/run-manifest.template.json`.
5. If the source is a public URL, capture the URL(s) explicitly in the concept brief and run-manifest source metadata so optional `/source-analysis` can be invoked later when the operator asks for rebuild parity extraction.
6. **While** collecting and structuring ideas: interrupt when something is vague or missing; ask 1–3 targeted questions (including technical ones) **and wait for the user’s response** before continuing; record answers as Decisions and in High-Level Technical Considerations. **Do not** write the next section of the brief until the user has answered. After each batch of questions, output a clear prompt such as: “I have N questions before locking this section: …” then **stop and wait** for the user’s reply.
7. Before generating the final brief, explicitly ask the user: “Any remaining open questions or unresolved decisions before I finalize the concept brief?” **Wait for the user’s response** before proceeding to step 10.
8. If important information is still missing after that, ask follow-up questions instead of silently filling gaps with assumptions. **Do not** finalize the brief until the user has confirmed or deferred the open points.
9. Resolve a timestamp for this run.
10. Generate the concept brief using the section order in the brain-dump template (including **High-Level Technical Considerations**). The 12 required sections are: Idea Summary, Problem Statement, Target Users, Proposed Solution, Value Proposition, Core Features, Decisions, Assumptions, High-Level Technical Considerations, Risks, Open Questions, Suggested MVP Scope.
11. Write the concept brief to `project-planning/brain-dumps/brain-dump-<timestamp>.md` only (no "latest" copy).
12. Create or update:
    - `project-planning/workflow/run-<timestamp>.json`
    - `project-planning/workflow/current-run.json`
13. Fill handoff metadata so the next stage points to:
    - `/create-prd` (optional: pass this file path and/or a raw prompt)
    - `project-planning/specs/` (next PRD will be `prd-NNN.md` from the Product Manager)
14. In the run manifest, record:
    - `run_id`
    - source input(s)
    - `source_analysis_artifact` when applicable
    - canonical `brain_dump` artifact path
    - current workflow status

## Validation

Before finishing, verify:

- The timestamped brain-dump file exists **at the resolved path** — verify on disk, do not trust the agent's self-report. A spawned agent that missed a mid-session path correction will report success against the path it remembers. Check that exactly ONE copy exists and that no stale sibling folder was recreated.
- All required sections from the brain-dump template are present (including **High-Level Technical Considerations**)
- Questions were asked **during** idea collection, not only at the end
- The user was explicitly asked whether there are any remaining open questions or unresolved decisions before finalizing
- Decisions are captured separately from assumptions
- Assumptions are labeled only when information remains unresolved
- Handoff metadata points to `/create-prd` and the PRD directory (PRD filename is assigned by the Product Manager, not the brain-dump timestamp)
- Both run-manifest files exist and reference the canonical brain-dump path in `canonical_artifacts.brain_dump`

## Output rules

- Report the exact file paths written
- If the user supplied a source file, mention that source path in the metadata and summary
- If a source-analysis artifact was used, mention that artifact explicitly
- If the request is too underspecified to produce a useful brief, stop and ask targeted follow-up questions
- If clarifications were provided, record the answers as decisions in the final artifact
- Recommend the next step: **Run `/create-prd`** with this brain-dump path (and optional extra prompt) — then `/architect` → `/task-breakdown`. Mention optional `/source-analysis` only if the operator explicitly wants URL rebuild parity extraction before architecture.
