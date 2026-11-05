---
name: cleanup-project-planning
intent: maintenance
writes:
  - products/<product-slug>/project-planning/** (deletes artifacts; may update ADR/README.md index)
depends_on:
  - .agent/commands/project/product-workspace.md
rules: []
---

# /cleanup-project-planning — Reset project planning for a fresh start

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Cleanup applies **only** to **`products/<product-slug>/project-planning/`** for the resolved product.

## Goal

Remove all generated project-planning artifacts for that product so you can start from scratch. Directory structure and process docs (ADR template, ADR-0001) are kept.

## What gets removed

All paths below are under **`products/<product-slug>/project-planning/`** for the resolved product.

| Location | Removed |
|----------|---------|
| `project-planning/brain-dumps/` | All `*.md` files |
| `project-planning/specs/` | All `*.md` files |
| `project-planning/architecture/` | All `*.md` files |
| `project-planning/source-analysis/` | All `*.md` files; entire `assets/` tree if present (keeps README.md if present) |
| `project-planning/plans/` | All files (e.g. prime.md, task-breakdown-*.md, qa-report.md; legacy implementation-runbook-*.md from schema-6 runs) |
| `project-planning/archive/` | Entire subtree (legacy — auto-archive retired at schema 8; no stage writes here any more). **Rescue durable artifacts first** — `*probe*`, `*smoke*`, `*capture*`, `*spike*`, `ship-report-*` belong back in `plans/` (see `/ship` § 15b-promote). |
| `project-planning/STATUS.md` | Removed (auto-regenerated at next `/create-prd` / `/ship`; schema 7+) |
| `project-planning/baseline.md` | Removed (re-promoted from ADRs at next `/architect` when threshold is met; schema 7+) |
| `project-planning/ui-design/` | All `*.md` files |
| `project-planning/workflow/` | `run-*.json`, `current-run.json` (keeps README.md if present). Note `current-run.json` is **untracked** by default under durability tiering (schema 8+), so removing it shows no git diff — delete it from disk anyway. |
| `project-planning/ADR/` | All `adr-*.md` **except** `adr-0001-use-adrs-as-architecture-backbone.md` |
| `project-planning/design-prototypes/` | All files (e.g. `*.html`, `README.md`) |

## What is kept

- `project-planning/README.md`
- `project-planning/ADR/README.md`, `project-planning/ADR/template.md`, `project-planning/ADR/adr-0001-use-adrs-as-architecture-backbone.md`
- **`project-planning/scripts/`** — entire tree (e.g. source-rebuild-crawl and its contents) is never removed
- Any `README.md` inside subdirectories that are otherwise cleaned (e.g. source-analysis, workflow)
- Directory structure (empty dirs remain)

## Steps (must follow in order)

1. **List** every file under `products/<product-slug>/project-planning/` that will be deleted (by scanning the directories above). Present a short summary to the user (e.g. "Will remove: 3 PRDs, 1 architecture doc, 1 run manifest, …").
2. **Confirm** with the user: "Proceed with cleanup? (yes/no)". If the user does not confirm (e.g. says no or asks to cancel), stop and do not delete anything.
3. **Delete** each file that falls under "What gets removed" above. Do not delete any file under "What is kept".
4. **Update** `products/<product-slug>/project-planning/ADR/README.md`: set the Index table to only the row for ADR-0001 (remove any other ADR rows). If no other ADRs existed, leave the index as is.
5. **Summarize** what was removed so the user can run `/prime` and then the planning flow again.

## Output

- No new files are created. Only deletions and the optional ADR index update.
- After cleanup, the next step is typically `/prime` then `/create-prd` → `/architect` → `/task-breakdown` → `/implement`.
