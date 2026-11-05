# UI Design Specification

---
document_type: ui_design_spec
artifact_name: ui-design-<timestamp>-vN.md (N = 1 for single proposal; 1–3 for multi-variant runs)
generated_at: <ISO-8601 timestamp>
run_manifest: project-planning/workflow/run-<timestamp>.json
source_inputs:
  - project-planning/specs/prd-NNN.md
  - project-planning/architecture/architecture-<timestamp>.md (optional)
consumed_by:
  - Execute implementation plan / Engineering
  - QA
---

<!--
Soft cap: ~200 lines when a POC clickdummy will be produced (the typical path; see § 3b
of /architect). Soft cap: ~400 lines when the spec ships WITHOUT a POC (rare).

When a POC will be produced, this spec is the INTENT + DELTA-FROM-POC contract — NOT a
re-description of every visual surface. The POC HTML is the visual source of truth; the
spec captures: design intent, what diverges from inherited baseline, the state coverage
matrix, accessibility notes, and the implementation hooks the Lead Developer needs.

Spec length over 200 lines (POC-track) usually means the writer is re-prose-ing visuals
that the POC already shows. Compress; reference the POC by frame/element instead.
-->

## 1. Design intent (≤ 60 words)

- **Named direction:** (one-line aesthetic / mood label, e.g. "Editorial cadence — asymmetric masonry")
- **Why this direction:** (one sentence — what the user / brand / data shape demands)
- **Divergence from other variants this run:** (one sentence — what makes this variant different from sibling variants; references their named directions)

## 2. Inherited baselines (do not redescribe — link)

State which design-baseline this variant inherits and IS NOT redescribing. Common references:
- **Blok semantic tokens** (Marketplace apps): colors / typography / spacing / radius / shadows / sizes / breakpoints / semantic. See `blok-theming`.
- **Theme contract:** light / dark / system.
- **Accessibility floor:** WCAG 2.1 AA per the framework default.

Anything in the inherited baseline does **not** appear in this spec unless this variant departs from it. Departures get an explicit subsection in § 3.

## 3. Direction deltas (what this variant CHANGES from the baseline)

For each delta (typography pairing, spacing scale override, custom radius, motion library, layout system that goes beyond Blok primitives, etc.):

- **What changes:** (one-line)
- **Why:** (one-line justification tied to § 1 intent)
- **Where it lands in the POC:** (e.g. "see POC frame `screen-1.html` § hero")
- **Implementation hook for Lead Developer:** (e.g. "`--accent-h: 285deg` overrides default `--primary` hue at `:root[data-theme='editorial']`")

If this variant has zero deltas, write `— None; this variant is a pure composition of the inherited baseline.`

## 4. State coverage matrix

Required for every interactive surface. The POC ships per-state frames; this matrix is the audit trail.

| Surface | Default | Hover | Focus | Loading | Error | Empty | Disabled | POC frame |
|---------|---------|-------|-------|---------|-------|-------|----------|-----------|
| (e.g. Subscribe button) | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✓ | `screen-1.html § subscribe-cta` |

✓ = covered in POC; n/a = does not apply; ✗ = gap (must fix before handoff).

## 5. Responsive behavior

One row per breakpoint that has distinct behavior. Reference POC frames; do not redescribe the layout.

| Breakpoint | Behavior summary | POC frame |
|------------|------------------|-----------|
| Mobile (≤768px) | (one-line — e.g. "single-column stack; topbar collapses to hamburger") | `screen-1-mobile.html` |
| Tablet (769–1023px) | (one-line) | `screen-1-tablet.html` |
| Desktop (≥1024px) | (one-line — usually the canonical reference) | `screen-1.html` |

## 6. Accessibility notes

- **Contrast verifications run on the POC:** list pairings + computed ratios (the POC's CSS resolves tokens to real values; capture the actual numbers, not the design-system claims).
- **Keyboard flow:** does the POC's tab order match a logical read order? Note any focus traps or escape patterns.
- **Reduced-motion handling:** does the POC respect `prefers-reduced-motion: reduce`? Which animations fall back?
- **Screen-reader anatomy:** any non-obvious aria patterns the POC uses (live regions, role="alertdialog", etc.).

## 7. Open questions and handoff

- **Open questions:** (decisions deferred to operator at variant-selection time, e.g. "Confirm chart library — Recharts vs lightweight SVG before Tranche A")
- **Recommended next step:**
- **Handoff metadata:** source PRD/architecture paths, next command, POC folder path

## 8. POC reference

*(Added after the user selects this variant as the winner. Not present in non-winning variants.)*

- **Winning clickdummy:** `project-planning/design-prototypes/poc-vN-prdNNN/`
- **Selection rationale:** (user's stated reason or "selected by user")
- **Visual source of truth:** The HTML clickdummy is the canonical visual reference for implementation. When this design spec's text and the clickdummy diverge, the clickdummy wins for look-and-feel decisions. The Lead Developer cites POC frames in task-breakdown § 4c-4.

---

## Legacy (no-POC) addendum — DELETE this block when a POC is being produced

The sections below are only required when this variant ships WITHOUT a POC clickdummy (rare; usually only when `ui_variants: skip` is overridden mid-run with a single-variant text-only spec). When a POC is produced, the matrix + frame references above replace these sections.

### Component and pattern spec (no-POC track only)

- **Component inventory:** (components, props, variants, usage)
- **Key copy + microcopy:** (button labels, empty-state strings, error messages)

### Critical user flows (no-POC track only)

- **Flow name:** (steps, decision points, success / failure paths)
