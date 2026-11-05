# Product Requirements Document

---
document_type: prd
prd_id: PRD-000
artifact_name: prd-000.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
source_inputs:
  - project-planning/brain-dumps/brain-dump-<timestamp>.md
consumed_by:
  - Software Architect Agent
next_input:
  - project-planning/architecture/architecture-<timestamp>.md
---

<!-- Soft cap: ~400 lines (frontmatter excluded). Exceeding the cap means scope is too broad to plan as one undifferentiated block — propose PHASES in § 12a Execution tranches rather than balloon this one. A PRD is a complete deliverable; a tranche is the unit of execution (glossary § "Deliverable vs execution unit"). Splitting into a follow-up PRD requires the three-leg shippability test and writes a program block. The Developer slice block below is mechanically extracted into prd-minimal-NNN.md at /create-prd close — author it as the authoritative implementation brief. -->

<!-- PRD numbering: PRD-000 = holistic view of the whole app (greenfield starting point). Subsequent PRDs are PRD-001, PRD-002, ... ascending. Follow-up tasks use the latest PRD unless specified otherwise. -->

## 1. Executive Summary

## 1.5 Developer slice (extracted to prd-minimal-NNN.md)

<!-- PRD_MINIMAL_BEGIN -->

> The Product Manager authors this section as the authoritative Developer-08 brief.
> /create-prd extracts everything between PRD_MINIMAL_BEGIN/END verbatim into
> `prd-minimal-NNN.md` at the close of the command. Manual edits to
> `prd-minimal-NNN.md` are overwritten on the next extraction — edit here only.

### Problem (one short paragraph)

### Goal (one short paragraph)

### Non-negotiables (bullets)

- (Stack, security, parity, accessibility, or scope limits that must survive planning.)

### In scope / out of scope (very short)

- **In scope:**
- **Out of scope:**

### Success criteria (3–7 bullets)

### Key constraints & assumptions

- (Only items the implementer must not violate; reference ADR ids when relevant, e.g. ADR-0004.)

### Brand voice and identity (one line, when the run has content or a UI)

- (Brand, register default, and "full section: § 11a". Lets slim-context agents write microcopy in the right voice without opening the full PRD.)

### Handoff

- **Full PRD:** `project-planning/specs/prd-NNN.md` (for humans and upstream agents only — not loaded by agent 08 in normal flow.)
- **Executable contract:** `project-planning/plans/task-breakdown-<timestamp>.md` after QA (07) enrichment.

<!-- PRD_MINIMAL_END -->

## 2. Problem Statement

## 3. Goals and Success Metrics

## 4. Target Users

## 5. Product Scope

### In Scope

### Out of Scope

## 6. User Stories

## 7. Functional Requirements

## 8. Non-Functional Requirements

## 9. Technical Considerations

## 10. Data Model Overview

## 11. UX Considerations

## 11a. Brand voice and identity

<!-- Required when the run authors content or has a UI; otherwise write "Not applicable" and delete the fields. Same fields as the sitecoreai-brand-voice template. /author-content stops without a real answer (check-brand-voice-section.mjs), and /challenge-prd flags a vague one. Never invent a voice: a field nobody has decided stays TBD. -->

- **Brand and surface:** <whose site this is, and which sites or pages this covers>
- **Source:** <brand kit or brand context id, guidelines link, or "defined here">
- **Audience:** <who reads it, and what they already know>
- **Voice attributes:** <three to five, each with a line on what it means in practice>
- **Tone by surface:** <for example hero: confident; forms: plain; errors: calm>
- **Vocabulary:** <words to use, and words to avoid>
- **Claims allowed:** <facts, numbers and names that may be stated, and what needs sign-off>
- **Register default:** <brand, marketing or technical-neutral>
- **Example:** <two or three sentences that sound right>
- **Visual identity:** <palette, typography and imagery direction, or where they are defined>

## 12. Release Plan

## 12a. Execution tranches (probe-first)

<!-- High-level tranche outline — the ordered slices this PRD ships in. Detail lives in the task breakdown § 5; this is the strategic shape. Rule 70-probe-and-tranche: any tranche resting on a load-bearing, unverified assumption (SDK shape, tenant/data behavior, external API, fidelity of a migration/scrape) gets a 🔍 PROBE tranche sequenced FIRST. A refuted probe is a valid stopping point — cancel / split / redesign. Omit this section only when there are no load-bearing assumptions and the work is genuinely flat. -->

- 🔍 **Tranche 0 (probe — when an assumption is load-bearing):** \<the assumption to confirm via `/probe` before any dependent build commits\>
- **Tranche 1:** \<first build slice\>
- **Tranche 2:** \<…\>

<!-- PHASED VARIANT — use this shape instead when the PRD was PHASED (≥3 new SDK surfaces per /create-prd's SDK-surface heuristic, or ≥5 new ADRs per /architect § 2b-i). Phases group tranches and each closes with a verification before the next opens. This is how a large idea stays ONE deliverable (glossary § "Deliverable vs execution unit") — do not split it into several PRDs unless every piece passed the shippability test. -->

| Phase | Scope (SDK surface / concern cluster) | Tranches | Exit verification | Unblocks |
|-------|--------------------------------------|----------|-------------------|----------|
| 1 | \<surface A\> | 🔍 T0 probe, T1, T2 | \<probe verdict / real-tenant smoke\> | phase 2 |
| 2 | \<surface B\> | T3, T4 | \<…\> | phase 3 |
| 3 | \<surface C\> | T5 | \<…\> | ship |

**This PRD is complete when all phases are delivered** — a shipped phase is progress, not the deliverable.

## 13. Risks and Mitigations

## 14. Open Questions

## 15. Future Opportunities

<!-- If this PRD is one member of a PROGRAM (the idea was split across several specs after passing the shippability test), mirror the member list here as a "### Program members (planned)" subsection — id, title, and the one-line deliverable for each. The run manifest's notes.program is the source of truth and STATUS.md § Programs renders from it; this mirror just keeps the spec self-describing. Omit entirely for standalone PRDs. -->

## Handoff Metadata
- Canonical run manifest:
- Source concept brief:
- Recommended next command:
- Recommended next input file:
