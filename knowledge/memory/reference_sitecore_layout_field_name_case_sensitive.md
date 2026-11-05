---
name: layout-field-name-keys-are-case-sensitive
description: "Sitecore layout/Edge delivers fields keyed by their EXACT name; head-app components must read the exact casing or get null — the \"field is managed but renders nothing\" symptom"
metadata: 
  node_type: memory
  type: reference
---

Sitecore layout data (Experience Edge / Layout Service) delivers a rendering's/route's `fields` as a map keyed by the field's **exact template name**, and head-app components read them by that key — **case-sensitive in every SDK** (TS Content SDK = JS object access `fields['DropTree']`; .NET = ordinal dictionary). A component reading `fields["Droptree"]` when the authored field is `DropTree` gets **null** and renders nothing — the classic "the field is managed but shows nothing / (none)" symptom, with **no error**.

**Why:** field keys come straight from the Sitecore template field names; there is no normalization anywhere in the delivery path. Trap: the Edge `item.field(name:)` GraphQL accessor IS case-insensitive, so a probe with the wrong casing still resolves and can fool you — but the layout `fields` map you actually consume at render is matched case-sensitively.

**How to apply:**
- Read fields by the EXACT authored name (`DropTree` ≠ `Droptree`).
- Keep field casing consistent within a template — mixed `Droplist`/`Droplink` (lowercase) + `DropTree` (capital T) is a footgun.
- When a managed field renders empty, suspect a name/casing mismatch FIRST. Confirm the real key from the layout `fields` map (or `item.fields { name }`), not from `field(name:)` (case-insensitive — it will falsely resolve).
- Confirmed 2026-06-16 on the .NET Content SDK `FieldTypeProbe` (`DropTree` rendered "(none)" until the casing matched).
