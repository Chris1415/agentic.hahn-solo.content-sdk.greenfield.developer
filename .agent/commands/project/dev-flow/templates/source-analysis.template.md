# Source Analysis

---
document_type: source_analysis
artifact_name: source-analysis-<timestamp>.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
analysis_mode: greenfield | rebuild
clone_scope_mode: none | home_plus_top5_primary_nav | full_website_clone
clone_handover_artifact: <null | project-planning/source-analysis/full-clone-handover-<timestamp>.md>
parity_loop: enabled | disabled
parity_max_runs: <integer|null>
parity_runs_executed: <integer|null>
parity_stop_reason: <stable_pass|max_runs_reached|blocked|null>
parity_scope_urls:
  - <home URL>
  - <top-level nav URL 1>
  - <top-level nav URL 2>
  - <top-level nav URL 3>
  - <top-level nav URL 4>
  - <top-level nav URL 5>
source_inputs:
  - <public URL or source artifact>
assets_bundle: <null | project-planning/source-analysis/assets/<timestamp>>
content_dump: <null | project-planning/source-analysis/assets/<timestamp>/content-dump.json>
consumed_by:
  - Rubber-Ducky-Brainstorm
  - Execute implementation plan
  - Parity Tracker Agent
next_input:
  - brain-dumps/brain-dump-<timestamp>.md
---

## 1. Source Summary

Include **analysis_mode** (greenfield | rebuild) and one line on whether an asset bundle + content dump were produced.

## 2. Route Inventory

## 3. Shared Structure

## 4. Content Inventory

## 5. Interaction Inventory

## 6. Asset And Media Notes

(For rebuild: point to `manifest.json` and `files/`; summarize key assets.)

## 7. Gaps And Uncertainties

## 8. Implementation Notes

## 9. Suggested Next Steps

---

## 10. Deep content map (rebuild only)

**Greenfield:** Write exactly: `*Not applicable — greenfield mode; no parity crawl.*`

**Rebuild:** Per crawled route, document **logical components** and **fields** (all visible strings, CTAs, hrefs, alts, labels). Ground every block in `content-dump.json` (cite route path). Map images to local paths under `assets/<timestamp>/files/` via `manifest.json`.

## 11. Asset bundle index (rebuild only)

**Greenfield:** `*Not applicable.*`

**Rebuild:** Path to bundle folder; file counts; notable assets; failed downloads; note on rights/reuse for store/app distribution.

## 12. Rebuild implementation handoff (rebuild only)

**Greenfield:** `*Not applicable.*`

**Rebuild:** Checklist for implementers: use `content-dump.json` for copy/structure parity; copy or import assets from `files/`; re-run crawl if source updated before release.

---

## 13. Parity loop (not in this artifact)

Write exactly: `*Not applicable here — the parity loop runs at /design (method:clone) and writes its own parity report under source-analysis/parity-report-<timestamp>.md.*`

This section used to carry a four-criterion, flat >95 loop contract. The loop moved to the clone pack's
`/design` override and its criteria were restructured into tiers on 2026-09-04
(`pack.json` → `stages.design.exit_criteria`), so a copy here could only contradict it. Removed
2026-09-30. The admissible captures this document owes the loop are covered in § 11 and the stage's
scroll-to-load step.

---

## 14. Full clone mode contract (rebuild + full_website_clone only)

**Not full clone mode:** `*Not applicable.*`

**full_website_clone mode:**

- Reference handover artifact path: `<clone_handover_artifact>`
- Confirm the downstream planning contract:
  - Architect must load source analysis + content dump + assets bundle + handover artifact.
  - Lead Developer must load source analysis + content dump + assets bundle + handover artifact.
  - Planning may phase delivery, but definition-of-done remains full website clone parity unless the operator explicitly overrides.
- Include route/component/content closure deltas that remain after this analysis run.

---

## Handoff Metadata
- Canonical run manifest:
- Recommended next command:
- Recommended next input file:
