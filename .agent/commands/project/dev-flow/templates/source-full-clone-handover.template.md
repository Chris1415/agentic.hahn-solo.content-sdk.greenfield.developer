# Full Clone Handover

---
document_type: source_full_clone_handover
artifact_name: full-clone-handover-<timestamp>.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
source_analysis_artifact: project-planning/source-analysis/source-analysis-<timestamp>.md
content_dump: project-planning/source-analysis/content-dump.json
assets_bundle: project-planning/source-analysis/assets/<timestamp>
clone_scope_mode: full_website_clone
consumed_by:
  - /architect
  - /task-breakdown
next_input:
  - project-planning/architecture/architecture-<timestamp>.md
---

## 1. Clone Objective (non-negotiable)

State the exact clone objective and what "done" means for this run family:
- full website route parity
- full component parity (structure + behavior)
- content parity within legal replacement boundaries
- clickdummy parity as visual contract

## 2. Mandatory Inputs For Planning

These inputs are mandatory for Architect and Lead Developer in full clone mode:

- source-analysis markdown (`source-analysis-<timestamp>.md`)
- route/content dump (`content-dump.json`)
- asset bundle (`assets/<timestamp>/manifest.json` and files)
- this handover file

## 3. Coverage Ledger Snapshot

Summarize current source coverage for planning:

- total discovered routes
- routed coverage table (covered / missing / blocked)
- component inventory summary (discovered render patterns)
- content inventory confidence
- asset inventory confidence

## 4. Planning Constraints

Mandatory constraints for `/architect` and `/task-breakdown`:

- do not redefine "done" to subset parity without explicit operator override
- phased delivery is allowed, but every phase must point to full clone closure
- each phase must carry explicit route/component/content closure deltas
- unresolved gaps must be listed as explicit backlog items, not hidden assumptions

## 5. Route And Template Closure Plan Input

Provide route/template grouping to seed planning tranches:

- foundational global shell routes
- landing templates
- detail templates
- utility/system routes

For each group, list key risks and blocking unknowns.

## 6. Component Closure Plan Input

Provide component-grouping hints for component-vertical tranches:

- global chrome
- hero/cta families
- grid/listing families
- form and conversion surfaces
- media-heavy sections

For each group, include parity-critical details and known data-shape risks.

## 7. Open Gaps Requiring Upstream Decisions

Explicitly list unresolved gaps where planning needs operator/architect decisions.

## 8. Handoff Acceptance Checklist

- [ ] Clone objective explicitly states full website clone parity.
- [ ] All four mandatory planning inputs are referenced with paths.
- [ ] Coverage ledger is present and quantified.
- [ ] Route closure and component closure inputs are both present.
- [ ] Open gaps are explicit (no hidden assumptions).
