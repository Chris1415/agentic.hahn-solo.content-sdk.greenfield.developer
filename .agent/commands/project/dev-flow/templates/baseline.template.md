# Architecture Baseline — <product-slug>

---
document_type: architecture_baseline
artifact_name: baseline.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
promoted_from:
  - project-planning/ADR/adr-NNNN-<slug>.md  # one entry per promoted ADR
consumed_by:
  - Software Architect (04) on subsequent /architect runs — references baseline.md sections, files only delta ADRs
  - Lead Developer (06) — populates task-breakdown § 4c-2 with delta ADRs only (baseline-bound decisions referenced by anchor)
  - Developer (08) — reads baseline.md in lieu of opening every inherited ADR
  - QA Specialist (07) — references baseline.md for inherited architectural constraints during test enrichment
generation: |
  Promoted from accumulated ADRs at /architect's baseline-promotion gate (schema 7+,
  ≥5 ADRs threshold). Refreshed when additional ADRs accumulate beyond the threshold
  and the operator confirms re-promotion. Promoted ADRs are NOT deleted from
  project-planning/ADR/ — they remain the source of truth; this baseline is the
  readable constitution.
---

<!-- Soft target: ~150 lines. One paragraph per promoted decision. -->

## How to read this file

This is a consolidated summary of architectural decisions that survived multiple PRDs. Reading order:

1. The decisions below are the **inherited constitution** for this product. They apply to all subsequent PRDs unless an explicit ADR supersedes a baseline entry.
2. Each entry names the source ADR(s) — open them for full Context + Decision + Consequences when needed. The baseline is the entry point, not the full record.
3. New ADRs filed after promotion are **delta ADRs** — they add to or depart from the baseline. The task breakdown's § 4c-2 lists only the delta ADRs and any baseline anchors a task touches.

## Promoted decisions

Each entry follows the format below.

### <Theme — e.g. "Architecture mode" or "Data layer">

- **Decision:** <one paragraph: what was decided>
- **Why it matters:** <one sentence — the lasting consequence>
- **Source ADRs:** <ADR-NNNN — title>, <ADR-NNNN — title> (clickable in the rendered file)

### Example — Architecture mode

- **Decision:** This product ships as a Marketplace Full-Stack (Mode A + Mode B) app, using `experimental_createXMCClient` for server-side SDK calls on behalf of the logged-in Cloud Portal user. Auth0 PKCE drives the OAuth flow.
- **Why it matters:** Every new PRD that touches a SitecoreAI surface uses the same client; new SDK surfaces extend the existing client rather than introducing a parallel auth path.
- **Source ADRs:** ADR-0005 (initial scaffold), ADR-0013 (migration to 4b)

---

## ADRs NOT in this baseline

The following ADRs remained outside the baseline as of this promotion — they encode delta decisions tied to specific PRDs, not foundational choices:

- ADR-NNNN: <title> — <one-line reason it stayed outside the baseline>

## Re-promotion log

| Date | Promoted-from ADRs | Promoted-by | Notes |
|------|--------------------|-------------|-------|
| <YYYY-MM-DD> | ADR-0001 through ADR-0010 | /architect baseline-promotion gate, run <run_id> | Initial baseline; 5-ADR threshold met after PRD-002 |
