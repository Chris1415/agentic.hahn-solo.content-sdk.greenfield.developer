---
name: reference_sitecore_nested_placeholder_needs_full_path_ph
description: "Edge delivers a nested (dynamic) placeholder's children only when the child's layout s:ph is the FULL PATH (/headless-main/container-1); the bare key — which the Marketer MCP add_component_on_page writes — renders an empty zone"
metadata:
  node_type: memory
  type: reference
---

Measured 2026-10-03 on a prior run's tenant, in a dedicated probe.

- Child placement `s:ph="container-1"` (bare zone key) → Edge layout shows the parent's `placeholders["container-1"]` **empty**. This is the form the Marketer MCP `add_component_on_page` writes, and the form all 15 attempts of that run's component used.
- Child placement `s:ph="/headless-main/container-1"` (full path) → the child renders inside the parent with fields fully resolved. One variable changed between known-bad and confirmed captures, on the OOTB `Container`.
- Also required on a custom parent: the JSON Rendering's **`Placeholders`** (Layout Service Placeholders) field must reference the Placeholder Settings item — without it Edge emits no `placeholders` key at all.
- On a custom parent (a news list component, 2026-10-05) the full-path `s:ph` alone was NOT enough: the parent placement also needed a `DynamicPlaceholderId` parameter, i.e. a Parameters Template inheriting IDynamicPlaceholder (an ADR in that run). All three together: Placeholders field + DynamicPlaceholderId + full-path child `s:ph`.
- The MCP cannot write the full-path form → write it with Authoring GraphQL `updateItem` on the page's `__Renderings` / `__Final Renderings` (allowed under rule 83: the MCP has no tool for it).

**Why:** that run first concluded "headless delivery never expands nested placeholders" and switched its mega nav and footer to their own fetch — that conclusion was wrong; the key form was the cause.
**How to apply:** before abandoning a nested-placeholder design, check the child `s:ph` is full-path and the parent's `Placeholders` field is set.
