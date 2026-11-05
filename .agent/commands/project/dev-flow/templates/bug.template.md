# Bug Report

---
document_type: bug
bug_id: BUG-000
artifact_name: bug-NNN.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
source_inputs:
  - <prompt | GitHub issue | ticket reference>
consumed_by:
  - Developer Agent (08) under /implement
next_input:
  - <target-directory> (the fix) + the RED regression test
---

<!-- Soft cap: ~120 lines (frontmatter excluded). A bug is a CONTAINED fix that restores intended behavior. If the root cause is a design flaw, missing capability, or multi-surface change, it is NOT a bug — PROMOTE it to an FRD (or PRD) via the not-contained valve rather than forcing it through the bug path. -->

<!-- A bug is the BUG weight of the shared intake engine. It maps to TDD: "steps to reproduce + expected behavior" IS the RED test spec. The bug path is autonomous (no planned operator gate) with two safety valves: CAN'T REPRODUCE → stop and ask; NOT CONTAINED → promote. Same artifact slots as a PRD/FRD, filled thinly: the Developer slice block below extracts to bug-minimal-NNN.md and the task breakdown is 1–2 tasks ("write the failing test", "make it green"). The marker name PRD_MINIMAL is historical/shared across all three intake types — do not rename it; the extraction logic keys on it. -->

## 1. Summary

<!-- One line: what is broken, observed where. -->

## 1.5 Developer slice (extracted to bug-minimal-NNN.md)

<!-- PRD_MINIMAL_BEGIN -->

> The Product Manager authors this section as the authoritative Developer-08 brief.
> /create-bug extracts everything between PRD_MINIMAL_BEGIN/END verbatim into
> `bug-minimal-NNN.md` at the close of the command. Manual edits to
> `bug-minimal-NNN.md` are overwritten on the next extraction — edit here only.

### What's broken (one short paragraph)

### Steps to reproduce

1. 

### Current behavior (actual)

### Expected behavior (should-be)

### RED regression test spec (the definition of done)

<!-- This is the bug's mandatory DoD backbone. Specify the test that FAILS today and must PASS after the fix: file/location, the assertion, the fixture (independently sourced per rule 30-tdd if SDK-touching). The bug is "done" when this test goes RED→GREEN AND it stays in the suite to guard the regression. If you cannot specify a failing test, that is the CAN'T-REPRODUCE valve → stop and ask the operator. -->

- **Test location:**
- **Asserts:**
- **Fixture / provenance:**

### Fix location hint (if known)

- (File / module suspected. The Developer confirms; this is a pointer, not a mandate.)

### Containment check

- **Contained?** yes / no. If **no** (root cause is a design flaw, needs a new capability, or spans multiple surfaces) → this is NOT a bug. Trigger the **not-contained valve**: promote to FRD/PRD (re-run as `/create-frd` or `/create-prd`), carrying this report's repro/current/expected forward as the problem statement.

### Handoff

- **Full bug report:** `project-planning/specs/bug-NNN.md`
- **Executable contract:** the RED regression test above + the fix.

<!-- PRD_MINIMAL_END -->

## 2. Environment / context

<!-- Where it reproduces: the resolved packs composition, package versions, tenant/host, browser, route. The narrower, the faster the fix. SDK-touching bugs require a real-tenant smoke before ship. -->

## 3. Root-cause hypothesis

<!-- Best current understanding of WHY. Confirmed by the RED test going green on the fix. If the hypothesis reveals a design flaw rather than a contained defect, trigger the not-contained valve (§ 1.5 Containment check). -->

## 4. Regression test (authoritative)

<!-- The full RED-test detail expanded from § 1.5: the exact assertion, the fixture, why it fails today, what makes it pass. Written FIRST (RED) before any fix. -->

## 5. Severity / impact

<!-- Who is affected, how badly, whether a workaround exists. Informs whether the autonomous bug path runs now or queues. -->

## Handoff Metadata
- Canonical run manifest:
- Source input(s):
- Recommended next command: `/implement` (write the RED test → make it green; skips `/architect`, `/task-breakdown` planning weight, and UI)
