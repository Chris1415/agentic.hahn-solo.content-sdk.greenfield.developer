---
name: document
intent: documentation
writes:
  - products/<product-slug>/README.md
  - products/<product-slug>/CHANGELOG.md
  - products/<product-slug>/docs/architecture.md
  - products/<product-slug>/docs/decisions.md
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/09-doc-writer.md
  - .agent/manifests/run-manifest.template.json
---

# /document — Generate or update repository documentation from planning artifacts

## Pipeline position

**On-demand only.** `/document` is no longer in the canonical sequence — `/ship` emits a 1-paragraph README and a CHANGELOG entry inline (when `scope_dial.docs_at_ship` is `auto-lite`, the default). `/document` runs the **heavy** doc pass (full README rewrite + `docs/architecture.md` + `docs/decisions.md`) on demand or when `scope_dial.docs_at_ship` is set to `full`.

When `scope_dial.docs_at_ship == full` is set in the run manifest, run `/document` **before** `/ship` so the heavy docs are in place before the ship report and PR.

Background: 7 of 8 portfolio products skipped `/document` when it sat in the canonical sequence — making the canonical-sequence ceremony strictly worse than the auto-lite path. Heavy `/document` runs are now reserved for major doc refreshes (post-MVP polish, architecture overhaul, public release of an internal product), where they add real value.

Documentation is part of the deliverable — it gets committed and shipped with the code.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts` under that product.

## Goal

Produce or update human-readable documentation that makes the repository self-explanatory. The Doc Writer reads canonical planning artifacts (PRDs, ADRs, ship reports, task breakdowns — and on legacy schema-6 runs, implementation runbooks) and the implemented codebase, then generates documentation for developers, reviewers, and future maintainers.

This is **not** a copy of planning artifacts into docs. Planning artifacts serve the development team during the build cycle. Documentation serves anyone who opens the repo afterward.

## When to run

- **Pipeline (only when `scope_dial.docs_at_ship == full`):** After `/test`, before `/ship`. The heavy docs are then committed by `/ship`.
- **On-demand (the typical path):** Any time. Run `/document` to bring docs up to date with the current state of the repo — typically after a major refactor, post-MVP polish, or before an external release.
- **Skip:** When `scope_dial.docs_at_ship` is `auto-lite` (default) or `none`, do not run `/document` — `/ship` handles or skips docs per the dial.

## Inputs

- Default source resolution: read `project-planning/workflow/current-run.json` and use:
  - **`canonical_artifacts.prd`** — full PRD (for feature descriptions, scope)
  - **`canonical_artifacts.prd_minimal`** — prd-minimal (for quick orientation)
  - **`canonical_artifacts.ship_report`** — ship report (for delivered vs deferred, if available)
  - **`canonical_artifacts.task_breakdown`** — task breakdown (for feature inventory + § 0 target dir + § 8 test coverage; replaces the former implementation-runbook role in schema 7+)
  - **`canonical_artifacts.implementation_runbook`** (legacy schema-6 only) — if present, supplements the task breakdown; schema-7 runs do not produce this artifact
  - ADRs in `project-planning/ADR/` (for decision rationale)
  - Architecture blueprint in `project-planning/architecture/` (if exists)
- The implemented codebase in `site/` (or the recorded target directory)
- Existing documentation files (`README.md`, `CHANGELOG.md`, `docs/`) — update in place, do not overwrite from scratch

## Sub-agent orchestration

This command uses the **sub-agent orchestration model** defined in `.agent/WORKFLOW.md` § "Sub-agent orchestration model". The Team Lead (main context) spawns the **Doc Writer (09)** as an **isolated sub-agent** with only its mandated inputs (PRD, prd-minimal, ship report, task breakdown, ADRs, architecture, the implemented codebase, and existing docs). The entire doc pass — read inputs, produce/update README + CHANGELOG + `docs/`, update the run manifest — is the sub-agent's work; it writes its artifacts and completes, its context freed. The Team Lead validates the outputs against § Validation and surfaces the Operator Checkpoint in the main context. Do not run the doc pass inline.

## Steps

1. **Spawn sub-agent: Doc Writer.** Spawn an isolated sub-agent with a single `Agent` tool call, `subagent_type: "doc-writer"`. The prompt must include: read `.agent/agents/team/09-doc-writer.md` for identity. **Task:** Read all available planning artifacts and the codebase (inputs per steps 3–5), then produce or update repository documentation per steps 6–9 and update the run manifest per step 10. Pass the explicit input paths and output paths; the sub-agent does the full doc pass and returns a summary of what it wrote. The Team Lead validates the outputs (§ Validation) and surfaces the Operator Checkpoint in the main context. Steps 2–10 below describe the sub-agent's work.
2. Read `.agent/manifests/run-manifest.template.json`.
3. Resolve all canonical artifacts from the run manifest. If the manifest is missing key paths, use latest-by-timestamp rules.
4. **Inspect existing documentation.** Read `README.md`, `CHANGELOG.md`, and `docs/*.md` if they exist. The Doc Writer updates these in place — preserving structure and prior content — rather than regenerating from scratch.
5. **Read the codebase.** Inspect the implementation target directory (`site/` or as recorded): package.json, folder structure, key source files, routes, components, API endpoints. Understand what was actually built.

### Documentation outputs

6. **README.md** (at product root). The README orients a first-time reader in 5 minutes; it does not teach. Apply the **length budget** (soft target ~150 lines, hard ceiling ~200, validation fails over 250 — see step "Validation" below) and the **strict redirect table** from `09-doc-writer.md` Signature Behaviors.

   **Allowed sections, in order — this is the complete list:**

   1. **H1 + one-sentence tagline** + 1 hero screenshot (if the product has a UI). No subtitle paragraph. Author byline acceptable as a one-liner under H1.
   2. **What this is** — 2–3 sentences MAX. Derived from PRD executive summary, not copied.
   3. **Who it is for** — 1 sentence. Optional. Omit if the audience is obvious from "What this is".
   4. **Screenshots** — only if the product is visual. ≤3 images with a one-line caption each. Gallery scope: hero state + one or two key states. Full state coverage belongs in `docs/screenshots.md` or `docs/architecture.md`.
   5. **Quickstart** — numbered steps. Minimal prose per step (one sentence + a code block). Third-party provider setup gets ONE line + a link out to `docs/integrations/<provider>.md`; the README does not host a wizard for Stripe / Supabase / Auth0 / etc. Test the path against "fresh clone → first successful run" — anything not on that path is not Quickstart.
   6. **Project structure** — 5–10 lines of tree + one-line purpose per directory. No prose.
   7. **Configuration** — env-var table only if it fits in ≤8 rows; otherwise link to `docs/configuration.md`. No "production hardening" notes inline — those go to `docs/operations.md`.
   8. **Where to read more** — links to `docs/architecture.md`, `docs/decisions.md`, `CHANGELOG.md`, and any topic docs the Doc Writer produced (`docs/integrations/`, `docs/operations.md`, `docs/adoption.md`). One line per link, ordered by reader priority.
   9. **License + built-by** — two short lines.

   **Forbidden in README — route to docs/ instead** (see Signature Behaviors redirect table for canonical homes):

   - Third-party provider setup beyond `cp .env.example .env.local` + a single link
   - "Production adopters MUST..." / "Known limitations" / hardening guides / RLS replacement / refund-handling examples
   - ADR rationale ("Tenant-only evaluator (ADR-0011)", "Supabase RLS posture (ADR-0009)") beyond a one-line citation linking to `docs/decisions.md`
   - Roadmap with per-PRD detail — that belongs in `CHANGELOG.md`
   - Multiple adoption paths (primary fork / secondary copy library) — `docs/adoption.md`
   - Code blocks longer than ~15 lines — `docs/architecture.md` or a dedicated topic doc
   - Idempotency-key versioning, signing-secret rotation, webhook retry semantics, tax-flag toggles — all `docs/integrations/<provider>.md`

   **Other README rules:**

   - **Do NOT hardcode test counts** ("219 passing across 32 files"). Counts drift the moment the next iteration adds tests, and Atlas's README drifted twice in 48 hours (219/32 → 241/35 → 252/38) before someone noticed. Either omit the count entirely (preferred — `npm run test` already prints it) or describe the testing surface without numbers ("Vitest + @testing-library/react covering scan engine, surface composition, drawers, and SDK fixtures"). Same rule applies to LOC counts, file counts, and any other metric the next commit will invalidate.
   - **When a section would push past the budget, the section MOVES to `docs/`** — the remaining sections do not get compressed. Bloat compounds: PaywallBlueprint hit 725 lines because every ship report added "one more must-know" paragraph. Refuse the gradient.

   **Companion topic docs** — when content is redirected out of the README per the redirect table, the Doc Writer creates the corresponding topic doc in `docs/` and links to it from the README's "Where to read more" section. Common ones:

   - `docs/integrations/stripe.md` (or `<provider>.md`) — full provider setup, test cards, webhook listener, signing-secret rotation, tax flag, idempotency-key versioning
   - `docs/operations.md` — production hardening, known limitations, "adopters MUST..." copy, RLS replacement, refund handling
   - `docs/configuration.md` — full env-var matrix when it does not fit in 8 README rows
   - `docs/adoption.md` — primary fork / secondary library-copy paths, swap-point walkthroughs
   - `docs/screenshots.md` — full state-coverage screenshot gallery when more than 3 images apply

7. **CHANGELOG.md** (at product root). Create or update with:
   - **If a ship report exists for this run** (rare — only when `/document` is re-run on-demand after a prior `/ship`): add a new entry at the top using the format below.
   - **If no ship report exists yet for this run** (the normal pipeline ordering — `/document` runs before `/ship`): write only the file header and a brief `## [Unreleased]` placeholder noting that `/ship` will prepend the PRD entry. **Do not author a PRD entry from PRD text or task breakdown** — the ship-report classification table is the only authoritative source, and it does not exist at `/document` time. `/ship` step 15a's `full` clause prepends the entry then.
   - Entry format (used by both `/ship` and `/document` when a ship report exists): `## [PRD-NNN] — <date>` with subsections: Added, Changed, Fixed, Deferred
   - Derive entries from the ship report's delivered/partial/deferred/cut classifications
   - Use user-facing language, not internal task IDs
   - Preserve all prior entries

8. **docs/architecture.md**. Create or update with:
   - System overview: what the system does and how it's structured
   - Key components and their responsibilities
   - Data flow (where data comes from, how it moves through the system)
   - Technology choices with rationale (synthesized from ADRs — link to individual ADRs in `project-planning/ADR/` for full context)
   - Keep this high-level and narrative — not a copy of ADRs

9. **docs/decisions.md**. Create or update with:
   - A curated summary table of all ADRs: number, title, status, one-line rationale
   - Grouped by theme (e.g. "Data layer", "Frontend", "Infrastructure")
   - Each row links to the full ADR file in `project-planning/ADR/`
   - This is the "why did we do it this way?" quick reference

9a. **Pack documentation contract — the document brief.** Run
`node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage document --record <product>/project-planning/workflow --md` (the `--record` flag stamps `packs.briefs_resolved[]` as a side effect of composing the brief — `/ship` fails on a pack-declared stage that has neither a stamp nor a reasoned waiver). Load its
skills and apply its additions where each says:

> **The Doc Writer (09) holds no Bash and cannot run that command.** The orchestrator resolves
> the brief and passes it down in the spawn prompt (`platform-pack.md` § 6 — never a second
> resolution path).


- **`additions.readme_sections`** — into `README.md`. Name the SDK package with the version read from
  `package.json`, and cite the scaffold command **actually used** (recorded in the scaffold ADR).
- **`additions.architecture_doc_sections`** — into `docs/architecture.md`. **Link the setup skill by
  NAME as the "if you are rebuilding this from scratch" reference; do NOT copy its body into the doc.**
- **`additions.decisions_doc_groupings`** — theme groupings in `docs/decisions.md`.

An empty brief means the product has no platform documentation contract and the generic doc pass
stands on its own.

10. **Update the run manifest:**
    - **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "documented", agent: "09-doc-writer", outcome: "completed", … }`. On failure, append with `outcome: "failed"` and the error message.
    - Update `updated_at`
    - Update both `run-<timestamp>.json` and `current-run.json`

## Validation

Before finishing, verify:

- `README.md` exists and contains at minimum: description, quickstart, project structure, "where to read more"
- **README line count is within budget.** Run `wc -l products/<slug>/README.md`. Soft target ≤150; soft warn 150–200; **hard fail >250**. On hard fail, the Doc Writer redirects the largest non-essential section(s) to `docs/` per the redirect table in `09-doc-writer.md` Signature Behaviors and re-emits. The Operator Checkpoint records every redirected section under `assumptions` (so the operator can confirm the topic-doc split matches their intent).
- `CHANGELOG.md` exists and has an entry for the current PRD (if a ship report is available)
- `docs/architecture.md` exists and references key ADRs
- `docs/decisions.md` exists and covers all ADRs in `project-planning/ADR/`
- **Companion topic docs match what the README links to.** Every link from the README's "Where to read more" section (and any inline `docs/<topic>.md` link) must resolve to a real file. If the README links to `docs/integrations/stripe.md` but the file does not exist, the Doc Writer creates it; if the file exists but the README does not link to it, the Doc Writer adds the link.
- No planning-internal details leaked into user-facing docs (no manifest paths, no agent references, no workflow status fields)
- Existing documentation content was preserved (updated, not replaced)
- `stage_history` contains an entry for `documented`

## Output rules

- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it **above** the file-paths summary and the "next step" line. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "document"`. Typical sources at `/document`: docs sections where source planning artifacts disagreed and the writer picked one (assumption), screenshot requests deferred because the operator did not supply one (concern), public-facing copy that paraphrased planning artifacts (assumption — confirm the user-facing wording is accurate), README diagrams generated from ADR text without visual review (concern).
- Report the exact file paths written or updated
- State which planning artifacts were used as sources
- If running standalone (no ship report yet), note that CHANGELOG was not updated (nothing shipped yet)
- Recommend next step: **Run `/ship`** to commit, push, and create a PR
