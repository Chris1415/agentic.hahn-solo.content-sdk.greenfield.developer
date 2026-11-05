---
name: research
intent: research
writes: []
depends_on:
  - .agent/agents/team/03-research-sidecar.md
---

# /research — Spawn the Research Sidecar for an ad-hoc topic

## Goal

Run a **single, bounded research question** through the Research Sidecar (`research-sidecar`, agent 03) and return a short, decision-grade synthesis inline. Use this when you want an explicit, deterministic research call rather than relying on Claude's auto-routing (which also works — see *When to use this vs. natural language* below).

This command is a **thin wrapper** around the sidecar. The sidecar runs in its own isolated context, returns its synthesis to this command's parent (you), and exits. Nothing is written to `project-planning/` by default.

See `.agent/glossary.md` § "Research Sidecar" for the agent's full contract and behavior.

## Inputs

Slash-command arguments are free-form. Parse them in this order:

1. **Explicit key=value flags** (any subset, any order):
   - `depth=quick|standard|deep` — defaults to `standard`
   - `word_budget=<int>` — soft cap on synthesis length (e.g. `word_budget=400`); defaults to ~300
   - `write_to=<repo-relative path>` — persist the synthesis under `storage/reports/sidecar/`. When omitted, inline only.
   - `context="<one sentence>"` — quoted; tells the sidecar why you're asking so it shapes the synthesis
2. **Remaining free text** — treated as `topic + question`. Split intelligently: a leading noun phrase is the `topic`, the rest is the `question`. If the user provided only a topic (no question), ask one follow-up before spawning.
3. **No args** — ask the user: *"What topic and specific question would you like the Research Sidecar to look into? Pick a depth: `quick` / `standard` (default) / `deep`. Optionally add a one-sentence context for why you're asking."* Wait for the answer; do **not** spawn with a half-formed prompt.

**Examples:**

- `/research Next.js 16 proxy.ts replacement of middleware`
  → `topic: Next.js 16 proxy.ts`, `question: "what replaced middleware and is it stable?"` (inferred), `depth: standard`
- `/research depth=quick Stripe automatic_tax customer_tax_location_invalid error`
  → `topic: Stripe automatic_tax`, `question: "what causes customer_tax_location_invalid and what is the canonical fix?"`, `depth: quick`
- `/research depth=deep word_budget=600 context="picking a paywall provider for a billing PRD" top paywall providers for B2B SaaS in 2026 with Stripe-based and independent options compared`
  → all flags parsed, all remaining text becomes topic+question

## Steps

1. **Parse args** per *Inputs* above. Resolve `topic`, `question`, `depth`, optional `word_budget` / `context` / `write_to`.
2. **Validate the question.** If `question` is empty or too vague to answer (e.g. just `/research Sitecore`), ask **one** clarifying question to the user before spawning. The sidecar will return `NEED_CLARIFICATION` otherwise — better to catch it here.
3. **Spawn the sidecar.** Issue exactly one `Agent` tool call:
   - `subagent_type: "research-sidecar"`
   - `description`: a 3–5 word task label (e.g. "Research Next 16 proxy")
   - `prompt`: a self-contained brief with the parsed inputs, in this shape:
     ```
     topic: <parsed topic>
     question: <parsed question>
     depth: <quick|standard|deep>
     [context: <if provided>]
     [word_budget: ~<N>]
     [write_to: <path, if provided>]

     Return the standard inline synthesis (Bottom line / Key findings / Sources / Caveats / Confidence). Use NEED_CLARIFICATION if the question is too underspecified or has multiple defensible scopes.
     ```
4. **Display the synthesis.** When the sidecar returns, render its response verbatim to the user. Do **not** rewrite it, summarize it, or add a "based on the research…" commentary on top — the synthesis is already the deliverable.
5. **Relay `NEED_CLARIFICATION` when present.** If the sidecar prepended or returned a `NEED_CLARIFICATION` block, do **not** assume the `Default-if-no-answer`. Relay the `Q1 / Q2 / …` to the user as the next prompt. When they reply, re-spawn the sidecar with the answers folded into the `context` field of a fresh invocation. (The sidecar does not maintain state between calls.)
6. **Persistence.** If `write_to` was passed, verify the sidecar actually wrote the file (it should report the path in its response). If the sidecar did not write but `write_to` was requested, surface that as a Concern in the closing summary.
7. **Closing summary.** End with a one-line note: *"Sidecar synthesis returned (depth: <X>, confidence: <Y>). Run `/research` again for follow-up questions."*

## When to use this vs. natural language

| Situation | Use |
|-----------|-----|
| You want explicit, deterministic invocation with named flags | `/research depth=deep <topic>` |
| You want to persist a synthesis to `storage/reports/sidecar/` | `/research write_to=… <topic>` |
| You're mid-conversation and just want a quick fact check | Natural language ("what's the current state of X?") — Claude auto-routes via the agent's `description` field |
| You're inside `/rubber-ducky` or `/create-prd` and the agent triggers research per their command's "Inline research delegation" section | That command spawns the sidecar — do not double-invoke |

**Both paths produce the same sidecar invocation.** `/research` exists for explicitness; natural-language routing exists for flow.

## Validation

Before finishing, verify:

- Exactly one `Agent(subagent_type: "research-sidecar", ...)` call was made (no nested research, no parallel duplicates).
- The sidecar's response was rendered verbatim, not paraphrased.
- If `NEED_CLARIFICATION` was returned, it was relayed to the user, **not** silently resolved.
- If `write_to` was passed and the sidecar reported a write, the file exists at that path.

## Output rules

- Do **not** prepend or append your own analysis to the sidecar's synthesis. The sidecar is the analyst; you are the messenger.
- Do **not** write the synthesis under `products/<slug>/project-planning/` from this command. The sidecar is a tool, not a stage — synthesis is ephemeral unless `write_to` requested otherwise.
- Do **not** try to call the scheduled research pipeline (`/release-the-minions` et al.) from this command — that lives in a separate research repo and is out of scope here. This command only spawns the sidecar (03).
