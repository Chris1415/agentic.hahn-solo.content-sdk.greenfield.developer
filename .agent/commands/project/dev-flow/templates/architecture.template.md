# Architecture Blueprint

---
document_type: architecture_blueprint
artifact_name: architecture-<timestamp>.md
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
source_inputs:
  - project-planning/specs/prd-NNN.md
  - project-planning/baseline.md (when promoted; inherited architecture baseline)
consumed_by:
  - Lead Developer Execution Planner
next_input:
  - project-planning/plans/task-breakdown-<timestamp>.md
---

<!-- Soft cap: ~400 lines (frontmatter excluded). Exceeding the cap means too many architectural concerns are bundled — propose phase split per /architect § 2b-i ADR-density gate, or promote stable baseline sections into project-planning/baseline.md per schema 7+ promotion gate. Feature PRDs (PRD-001+) should ship a feature-scoped delta, not a re-draft of the whole system. -->

> **When a `baseline.md` exists**, do NOT redescribe inherited decisions. Reference the baseline (`see baseline.md § Data layer`) and document only the delta this PRD introduces. The architecture file becomes thinner with each promotion cycle.

## 1. Architecture Overview

**Architecture budget:** `<lean|mindful|deliberate>` — record the run's chosen budget and how it constrained this blueprint.

**Simplicity contract:** Every new abstraction, boundary, service layer, queue, cache, state store, or dependency introduced in this document must name the concrete requirement or risk it serves. Items that only serve hypothetical future work belong in PRD § Future Opportunities, not here.

## 2. System Components

## 3. Architecture Diagram (Textual)

## 4. Data Model

## 5. API Design

## 6. Infrastructure & Deployment

## 7. Technology Stack

## 8. Security Considerations

## 9. Risks & Tradeoffs

## 10. Open Questions

## 11. Key decisions (for ADRs)

*Optional but recommended.* List each **fundamental architectural decision** that should be recorded as an ADR (technology choices, deployment model, security approach, major patterns). One line per decision; the planning flow will create ADRs from these and from sections 6–8 above.
- (e.g. Use Next.js App Router for frontend)
- (e.g. Deploy to Vercel with serverless functions)
- (e.g. JWT-based auth with refresh tokens)

## Handoff Metadata
- Canonical run manifest:
- Source PRD:
- Recommended next command:
- Recommended next input file:
