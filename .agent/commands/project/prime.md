---
name: prime
intent: analysis
writes:
  - products/<product-slug>/project-planning/plans/prime.md
depends_on:
  - .agent/commands/project/product-workspace.md
rules:
  - READ_ONLY
---

# /prime — Read-only reconnaissance

## Step 0 — Choose context (always do this first)

Before anything else, present the user with a numbered list of available contexts:

1. **Root (agentic framework)** — the agent organization itself (`.agent/`, commands, skills, templates, flows.json)
2. **Product: `<slug>`** — one entry per directory found under `products/`

**Scan `products/` dynamically** via the Bash tool (NOT a hardcoded list). Products are grouped one level deep under `products/<group>/<slug>/` (groups: `marketplace`, `head-application`, `personal`, `_internal`), with some still at the legacy flat `products/<slug>/` during migration. Enumerate **both levels** — e.g. `ls -1 products/*/ products/` — and treat each `<group>/<slug>` directory as a candidate product workspace, plus any legacy flat `<slug>`. **Do not list the bare group buckets themselves as products, and never list `products/_root/` — it is the reserved output bucket for the Root (framework) context (Path A writes its `prime.md` there), not a product.** Slugs may include dots (e.g. `personal-website.acme`), hyphens, and digits. Do not filter or skip entries based on naming. See `product-workspace.md` § 1b for the canonical resolution order.

If `products/` is empty or missing, say so explicitly and offer only the Root option. Do not invent or recall product names from memory — always re-scan the filesystem.

Example prompt (build the numbered list from the actual scan results):

> Which context should I analyze?
> 1. **Root** — agentic framework (agents, commands, skills, config)
> 2. <first-slug-found>
> 3. <second-slug-found>
> ...

Wait for the user's answer before proceeding. If the user already specified a context (e.g. `product=personal-website`, or “root”, or “the framework”), skip the question and use that.

---

### Path A — Root (agentic framework)

The root context treats the **agentic framework itself** as the subject of reconnaissance. There is no product workspace to resolve.

Read-only, because `/prime` is reconnaissance and its findings must not be mixed with changes:
- Do not implement anything.
- Do not modify existing files elsewhere.
- Only allowed write: create or overwrite **`products/_root/project-planning/plans/prime.md`** (bootstrap `products/_root/project-planning/plans/` if needed).

**Steps (must follow in order):**

1) **Identify framework purpose**
   - Read the repo-root `README.md` and `CLAUDE.md`
   - Read `.agent/WORKFLOW.md` for orchestration model
   - Read `git log -n 20 --oneline` for recent changes

2) **Map framework structure**
   - `.agent/agents/` — agent identity files (team + PMs)
   - `.agent/commands/` — command definitions (project + research)
   - `.agent/rules/` — guardrail files
   - `.agent/scripts/` — utility scripts
   - `.agent/manifests/`, `.agent/templates/` — templates
   - `flows.json` — command registry
   - Wrapper directories: `.claude/commands/`, `.cursor/commands/`
   - `products/` — list existing product workspaces (slug + one-line purpose if CLAUDE.md or prime.md exists)

3) **Detect tooling**
   - Wrapper sync script and how to run it
   - Any linting, validation, or CI for the framework itself
   - MCP servers or external integrations referenced in settings

4) **Determine runnable commands**
   - List all slash commands from `flows.json` grouped by track (project dev, research, PM)
   - Note the typical sequence from CLAUDE.md
   - Note the wrapper sync command

5) **Find boundaries and red lines**
   - `.env` and secrets
   - `products/` contents (owned by individual projects, not the framework)
   - Generated wrapper directories (`.claude/commands/`, `.cursor/commands/`)

**Output: `products/_root/project-planning/plans/prime.md`** (strict format; overwrite when re-running)
- Framework purpose (2-3 lines)
- **Recent context (from git):** summary of recent commits
- Agent roster summary (ID, role, one-liner)
- Command inventory (grouped by track, with brief description)
- Framework structure map (bullets)
- Tooling & scripts (bullets)
- Product workspaces found (slug + status)
- Boundaries (Never / Ask-first)
- Unknowns + how to resolve (bullets)

---

### Path B — Product workspace

Read and apply `.agent/commands/project/product-workspace.md`: resolve **which product** (`products/<product-slug>/`), bootstrap `project-planning/` if needed. The product slug is already known from Step 0 — pass it directly, do not re-ask.

The only file this command may write is **`products/<product-slug>/project-planning/plans/prime.md`**.

Read-only, because `/prime` is reconnaissance and its findings must not be mixed with changes:
- Do not implement anything.
- Do not modify existing files elsewhere.
- Only allowed write: create or overwrite `products/<product-slug>/project-planning/plans/prime.md`. The file is updated in place when re-running.

## Goal
Create a short, accurate report so the next commands can operate with minimal guessing.

## Steps (must follow in order)
1) Identify project purpose
- Read the product's own `CLAUDE.md` (at `products/<product-slug>/CLAUDE.md`) if present
- Read the product's `README.md` if present
- Read any existing PRD docs under `products/<product-slug>/project-planning/specs/` if present
- Read existing prime report if present (to compare / update)
- **Read git history** scoped to the product: run `git log -n 20 --oneline -- products/<product-slug>/` and optionally `git log -n 5 -p --stat -- products/<product-slug>/` to see recent changes within this product. If the product has its own repo root or source code outside `products/`, detect and scan that too.

2) Map repository structure
- List top-level folders and key subfolders **within the product workspace**
- Call out “core code” vs “configs” vs “generated/vendor” vs “project-planning artifacts”

3) Detect stack & tooling
- Language/runtime (Node, Python, etc.)
- Package manager (pnpm/npm/yarn/uv/pip)
- Test runner (jest/vitest/pytest/etc.)
- Lint/format (eslint/prettier/ruff/black/etc.)

4) Determine runnable commands (exact commands, not vague)
- Install deps
- Run dev server
- Build
- Lint
- Test: unit (e.g. `npm run test`), UI/component (if separate), E2E (if present, e.g. `npm run test:e2e`); document where tests live (e.g. `**/*.test.ts`, `e2e/`)

5) Find boundaries and red lines
- Secrets/env files
- CI/infra folders
- Generated/vendor outputs
- Any files the agent should “ask first” before touching

## Output: `products/<product-slug>/project-planning/plans/prime.md` (strict format; overwrite this file when re-running)
- Purpose (2-3 lines)
- **Recent context (from git):** Brief summary of recent commits and what was done (e.g. “Phase 1 implemented; last commit: feat(site): home + FAQ”). Helps downstream commands and re-runs understand current state.
- Stack summary (bullets)
- Commands (copy/paste ready), including **Test** commands (unit, UI, E2E if applicable)
- **Testing**: test runner, where tests live (e.g. `src/**/*.test.ts`, `e2e/`), and exact test commands so the QA plan and implementation can add tests in the right place
- Repo map (bullets)
- Boundaries (Never / Ask-first)
- Unknowns + how to resolve (bullets)
- Suggested next command:
  - run `/rubber-ducky` for discovery, then `/create-prd` for the PRD
  - or go directly to `/create-prd` if the idea is already clear
  - then `/architect` → `/task-breakdown` → `/implement` → `/code-review` → `/test`