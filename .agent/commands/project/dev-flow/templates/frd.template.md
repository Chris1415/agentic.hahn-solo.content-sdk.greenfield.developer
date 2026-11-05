# Feature Requirement Definition

---
document_type: frd
frd_id: FRD-000
artifact_name: frd-NNN.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
source_inputs:
  - <prompt | brain-dump path | ticket reference>
consumed_by:
  - Lead Developer Agent (task breakdown)
next_input:
  - project-planning/plans/task-breakdown-<timestamp>.md
---

<!-- Soft cap: ~150 lines (frontmatter excluded). An FRD is a bounded, single-change feature. If it needs phases, multiple SDK surfaces, or an architecture blueprint, it is a PRD — promote it (re-run as /create-prd) rather than balloon this doc. -->

<!-- An FRD is the FEATURE weight of the shared intake engine. Same artifact slots as a PRD (intake doc → minimal block → task breakdown), filled leaner. Default skips /architect and UI design; runs autonomously (task-breakdown is a soft gate — it auto-continues). The Developer slice block below is mechanically extracted into frd-minimal-NNN.md exactly like a PRD's. The marker name PRD_MINIMAL is historical/shared across all three intake types — do not rename it; the extraction logic keys on it. -->

## 1. Summary

<!-- One short paragraph: what capability is being added/extended, and the user/business outcome it serves ("so that …"). -->

## 1.5 Developer slice (extracted to frd-minimal-NNN.md)

<!-- PRD_MINIMAL_BEGIN -->

> The Product Manager authors this section as the authoritative Developer-08 brief.
> /create-frd extracts everything between PRD_MINIMAL_BEGIN/END verbatim into
> `frd-minimal-NNN.md` at the close of the command. Manual edits to
> `frd-minimal-NNN.md` are overwritten on the next extraction — edit here only.

### Problem (one short paragraph)

### Goal (one short paragraph)

### Non-negotiables (bullets)

- (Stack, security, parity, accessibility, or scope limits that must survive planning.)

### In scope / out of scope (very short)

- **In scope:**
- **Out of scope:**

### Acceptance criteria (the definition of done — 3–7 bullets, each independently verifiable)

<!-- This is the FRD's mandatory DoD backbone. Every FRD ships with acceptance criteria the test pass and /ship can check against. For chore-shaped work (refactor / dependency bump / tech-debt folded into the FRD), use the NO-REGRESSION variant: "Existing suite stays green; build green; <internal quality X> improved; user-observable behavior unchanged" — and add a characterization test if none guards the touched surface. -->

- 

### Key constraints & assumptions

- (Only items the implementer must not violate; reference ADR ids when relevant.)

### Handoff

- **Full FRD:** `project-planning/specs/frd-NNN.md` (for humans and upstream agents only — not loaded by agent 08 in normal flow.)
- **Executable contract:** `project-planning/plans/task-breakdown-<timestamp>.md` after QA (07) enrichment.

<!-- PRD_MINIMAL_END -->

## 2. Problem / motivation

<!-- Why now? What is awkward, missing, or manual today that this feature fixes. -->

## 3. Acceptance criteria (authoritative)

<!-- The same criteria as § 1.5, expanded where a bullet needs detail (example inputs, edge cases, observable outcome). § 1.5 stays terse; this section is where a reviewer reads the full intent. -->

## 4. Scope

### In scope

### Out of scope

## 4a. Execution tranches (probe-first)

<!-- Usually one or two tranches for a bounded FRD. Rule 70-probe-and-tranche: if any tranche rests on a load-bearing, unverified assumption (SDK/tenant shape, external behavior, migration fidelity), put a 🔍 PROBE tranche FIRST (`/probe`) — it stops for operator go/no-go before dependent work. A refuted probe is a valid stop (cancel / promote to PRD / redesign). Omit this section only when there is no load-bearing assumption. -->

- 🔍 **Tranche 0 (probe — only if an assumption is load-bearing):** \<assumption to confirm via `/probe`\>
- **Tranche 1:** \<the feature slice\>

## 5. Constraints & assumptions

<!-- Decisions vs assumptions clearly separated and labeled. -->

## 5a. Brand voice and identity

<!-- Only for an FRD that authors site content or changes copy; otherwise delete this section. Either inherit, or fill the same fields as the PRD's § 11a. check-brand-voice-section.mjs follows the inheritance once. -->

- **Inherited from:** <prd-NNN.md, when the PRD's section still holds>

## 6. Technical considerations

<!-- Brief. An FRD usually does NOT need ADRs. Record one ONLY when a real, consequence-bearing decision exists (then /architect may run for this one item). If none: "No ADR-worthy decision — straight to task breakdown." -->

## 7. Risks

## 8. Open questions

## Handoff Metadata
- Canonical run manifest:
- Source input(s):
- Recommended next command: `/task-breakdown` (skips `/architect` unless § 6 flagged an ADR-worthy decision)
