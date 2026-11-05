---
name: status
intent: analysis
writes: []
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/manifests/run-manifest.template.json
---

# /status — Portfolio overview across all products

## Goal

Surface, at a glance, the current state of every product in `products/`: where each is in the pipeline, which gates are open, where smoke is still pending, and which runs have gone quiet. Pure read-only — `/status` writes nothing.

This command exists because the framework supports multiple products in flight at once (e.g. one product stacking PRDs while another's smoke is paused) and there is no other way to ask *"what is open across the portfolio?"* without manually opening many `current-run.json` files.

## When to run

- **At the start of a session** to remember where you left off.
- **Before starting new work** to confirm nothing is paused mid-pipeline.
- **Before shipping** to confirm sibling products didn't accumulate stale follow-ups.

## Modes

| Invocation | Behavior |
|------------|----------|
| `/status` | Portfolio table — one row per product under `products/` |
| `/status <product-slug>` | Single-product detail view with full `stage_history`, all `smoke_outcomes` rows, friction-log entries since last ship |
| `/status --stale` | Filter: only products with last activity > 14 days |
| `/status --paused` | Filter: only products whose latest manifest `status` is `paused`, `tested_pending_smoke`, or has open `pending`/`failed` smoke entries |
| `/status --attention` | Filter: only products with ≥1 open `operator_attention[]` entry. Add `--blockers` to narrow to entries with `severity: blocker` only |

## Inputs

- **Primary source (schema 7+):** `products/*/project-planning/STATUS.md` per product. Read it directly when present — the table + open-items + last-activity blocks are the rendered roll-up.
- **Fallback (schema-6 runs OR products with STATUS.md missing/stale):** Read-only scan of `products/*/project-planning/workflow/current-run.json` per product. Read the **most recent** `run-*.json` when `current-run.json` is missing.
- Read `git rev-parse --abbrev-ref HEAD` (best-effort) inside each product's git repo to surface the current branch when it differs from the manifest's `implementation.branch_name`.

If a product has no `project-planning/workflow/` directory or no manifest at all, surface it as `no-planning — freeform-only or untracked`.

**Staleness check.** STATUS.md is considered stale when `current-run.json.updated_at > STATUS.md mtime + 2 days` OR when `current-run.json` references a PRD row that does not appear in STATUS.md. Stale STATUS.md is supplemented with manifest reads; flag the row with `STATUS-STALE` in FLAGS. `/status` does NOT rewrite STATUS.md — only `/create-prd` kickoff and `/ship` close do.

## Steps

1. **Resolve the products root first** — `node .agent/scripts/resolve-products-root.mjs` — and glob under **that** path. `products/` is a mount point (`product-workspace.md` § 1a), so a literal `products/*/*/` glob finds nothing when the operator has relocated it, and `/status` would report an empty portfolio instead of a configuration fact. Report the resolved root in the header line when `source` is not `default`.

   **List candidate products.** Products are grouped one level deep under `products/<group>/<slug>/` (groups: `marketplace`, `head-application`, `personal`, `_internal`), with some still at the legacy flat `products/<slug>/` during migration. Enumerate **both**: glob `products/*/*/` (group/slug) **and** `products/*/` (legacy flat), excluding hidden folders (`.claude`, `.git`, etc.), the group buckets themselves, and **`_root`** (pinned to the repo — this repo's own planning surface, not a product). A directory is a product only if it contains (or can contain) a `project-planning/` tree — a bare group bucket is not a product. See `product-workspace.md` § 1b for the canonical resolution order.

2. **For each product, resolve manifest state.** Read `<PR>/project-planning/workflow/current-run.json` (where `<PR>` is the resolved product directory, group bucket included — e.g. `products/marketplace/my-app/`). If absent, fall back to the latest `run-*.json` by timestamp. If both are absent, mark the product `no-planning`.

3. **Extract per-product fields:**
   - `status` (manifest top-level)
   - `implementation.branch_name`, `implementation.mode` (pipeline vs freeform)
   - Latest `stage_history` entry — `stage`, `agent`, `outcome`, `exited_at`
   - `smoke_outcomes` — count of entries by outcome (`pending` / `passed` / `failed` / `skipped`)
   - `operator_attention[]` — count of **open** entries by severity (`blocker` / `warn` / `info`). An entry is **open** when its `kind` is one of `decision|assumption|concern|question` AND no later entry has `kind: "resolved"` with `references` equal to that entry's `raised_at`. Manifests on schema < 6 have no `operator_attention` array — treat as zero open items.
   - `canonical_artifacts.friction_log` and whether the file exists with > 0 entries
   - `ui_design.selected_poc_path` and whether the folder exists
   - `packs` — the resolved composition (`platform` / `method` / `audience`). Manifests predating the packs carry only the legacy `platform_target`; show that instead when `packs` is absent, and mark the row as legacy rather than blank
   - `updated_at` (ISO-8601) — convert to "N days ago" relative to today

4. **Detect drift signals (per row, set boolean flags):**
   - `STALE` — `updated_at` is more than 14 days old
   - `STATUS-STALE` — `STATUS.md` exists but `current-run.json.updated_at > STATUS.md mtime + 2 days` (the index hasn't been regenerated since the last manifest update); informational, not blocking
   - `NO-STATUS` — `STATUS.md` is missing on a schema-7 product (auto-generated by `/create-prd` kickoff or `/ship` close); informational
   - `PAUSED` — `status` ∈ {`paused`, `tested_pending_smoke`} OR any `smoke_outcomes` outcome is `pending` or `failed`
   - `ATTN:N` — total open `operator_attention[]` entries; **when at least one is `severity: blocker`, render as `ATTN:N!` with the trailing `!`** so the operator sees the blocker signal in the portfolio table at a glance. Suppress the flag when N == 0.
   - `NO-FRICTION` — friction-log path is null or file doesn't exist (informational, not an error)
   - `NO-POC` — UI design produced variants but `project-planning/design-prototypes/` folder is missing or empty (informational)
   - `BRANCH-DRIFT` — current git branch ≠ manifest `implementation.branch_name` (best-effort; suppress when not in a git repo)
   - `NO-IMPLEMENTATION` — `site/` is empty / contains only `node_modules` / no source files

5. **Render the portfolio table** (default mode):

   ```
   PRODUCT                            STATUS                   STAGE              BRANCH        LAST     FLAGS
   personal-blog.acme                 shipped                  shipped            prd-006       2d ago
   sample-app.acme                   shipped_with_caveats     shipped            prd-005       1d ago   PAUSED:smoke=2 ATTN:3
   extension-trail                    tested_pending_smoke     tested             prd-001       3d ago   PAUSED:smoke=4 ATTN:5!
   component-atlas                    shipped_with_caveats     shipped            prd-001      11d ago   STALE-soon ATTN:2
   clipboard-helper                   shipped_with_caveats     shipped            design-polish-1 16d ago STALE NO-IMPLEMENTATION
   page-capture                       shipped_with_caveats     shipped            prd-001      20d ago   STALE NO-IMPLEMENTATION
   internal-cockpit.acme              no-git-repo              tested             —             21d ago   STALE
   ```

   Columns:
   - **PRODUCT** — product slug (the `<group>/<slug>` path under `products/`, or legacy flat `<slug>`)
   - **STATUS** — manifest `status`
   - **STAGE** — last `stage_history.stage`
   - **BRANCH** — manifest `implementation.branch_name` (suffix `*` if BRANCH-DRIFT)
   - **LAST** — `updated_at` as "N days ago"
   - **FLAGS** — space-separated tags: `STALE`, `PAUSED:smoke=N`, `ATTN:N` (trailing `!` when ≥1 blocker), `NO-FRICTION`, `NO-POC`, `NO-IMPLEMENTATION`, `BRANCH-DRIFT`

   Sort: most-recently-touched first. **Secondary sort**: rows with `ATTN:N!` (blocker present) float above same-day rows without a blocker.

6. **For single-product mode** (`/status <slug>`), additionally print:
   - Full `stage_history` table (stage, agent, outcome, entered_at → exited_at)
   - All `smoke_outcomes` rows with their `description`, `outcome`, `recorded_at`, `notes`
   - **Open operator-attention list** — every open `operator_attention[]` entry, grouped by severity (`blocker` first, then `warn`, then `info`). For each: `[severity] stage › kind › item (raised <N days> ago)`. When the array is empty or schema_version < 6, print `Operator attention: — none open`. Follow with a collapsed resolved-log line: `Resolved this run: N items` (no detail unless `--verbose` is set).
   - Last 5 entries from the friction log (if present)
   - Open follow-ups extracted from the latest ship report (if present): scan `project-planning/plans/ship-report-*.md` (latest by timestamp) for `## Open follow-ups` section

7. **For `--stale` / `--paused` / `--attention` filters**, render the same portfolio table but show only rows matching the filter. `--attention --blockers` further narrows to rows where at least one open entry has `severity: blocker`.

## Output rules

- Default mode renders ≤30 lines — fits in one screen.
- Single-product mode renders ≤80 lines.
- Never modify any file. If a manifest is malformed (parse error), report the malformed row but continue scanning the others.
- Show absolute paths only on demand (single-product mode); the portfolio table uses slugs and filenames only.
- If `products/` is empty, output `no products found — start with /create-prd` and stop.

## Validation

- Every product folder under `products/<group>/` (and any legacy flat `products/<slug>/`), excluding `.claude`/other dotfolders and the bare group buckets themselves, is represented in the portfolio table.
- Products with no manifest are surfaced with `no-planning` status, not silently dropped.
- Date arithmetic uses the current date from the conversation context, not a frozen value.
- The command did not write any files.
