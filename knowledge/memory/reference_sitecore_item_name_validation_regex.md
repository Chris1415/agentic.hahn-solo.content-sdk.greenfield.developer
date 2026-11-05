---
name: Sitecore ItemNameValidation regex — parens only allowed around digits
description: Sitecore Authoring's `createItem` mutation rejects any item name that doesn't match the `ItemNameValidation` setting. The regex allows word chars, spaces, dashes, dollar signs — but parens are ONLY allowed at the END of the name and ONLY around digits (the version-disambiguator pattern like `My Item (2)`). Names like `Foo (auto-delete safe)` or `My Map (draft)` are rejected silently from the caller's POV — the SDK wrapper sees `data.createItem === null` and returns `ok: false` with no exception. Captured 2026-05-20 from the Sitecore Authoring API rejecting a probe's map name.
type: reference
---
## The exact regex Sitecore enforces

```
^[\w\*\$][\w\s\-\$]*(\(\d{1,}\)){0,1}$
```

Decomposed:
- **Start:** word char (`[A-Za-z0-9_]`), `*`, or `$`
- **Middle:** zero or more of: word char, space, dash, dollar sign
- **Optional end:** `(N)` where N is one or more digits

Controlled by the `ItemNameValidation` setting in Sitecore configuration; the value can theoretically be overridden per-tenant but in practice every SitecoreAI tenant ships this default.

## What's accepted

- `Black Friday` ✓
- `PRD-004 T1 Probe AUTO-DELETE-SAFE` ✓
- `My Item (2)` ✓ (version-disambiguator)
- `_test_capture_1778525974480_no_id` ✓ (underscores are word chars)
- `$siteLang` ✓ (starts with `$`, then word chars)

## What's rejected

- `PRD-004 T1 Probe (auto-delete safe)` ✗ — parens contain non-digits
- `My Map (draft)` ✗ — same reason
- `Foo / Bar` ✗ — slash is not allowed
- `Item @ Home` ✗ — `@` is not allowed
- `(2) My Item` ✗ — parens must be at end, not start
- `My (2) Item` ✗ — parens must be at end, not middle

## The silent-rejection trap

`createItem` does NOT throw on validation failure. The GraphQL response shape is:

```json
{
  "errors": [
    {
      "message": "An item name must satisfy the pattern: ^[\\w\\*\\$][\\w\\s\\-\\$]*(\\(\\d{1,}\\)){0,1}$ (controlled by the setting ItemNameValidation)",
      "locations": [...],
      "path": ["createItem"]
    }
  ],
  "data": {
    "createItem": null
  }
}
```

A typical write wrapper reads `result.data?.data?.createItem?.item?.itemId` — when the createItem is `null`, the wrapper sees undefined `itemId` and returns `{ ok: false, itemId: undefined }`. The `errors` array is silently dropped.

**Two consequences:**

1. Any wrapper that silently returns `ok: false` on `itemId === undefined` will mask the real cause. Either log `result.data?.errors` to the console alongside, or surface the errors array in the wrapper's return.
2. Probes, fixtures, and any other programmatic item creation MUST sanitize the name against this regex before calling `createItem`. Don't trust operator-supplied names verbatim.

## Defensive name-builder pattern

When authoring items programmatically, normalize the name first:

```typescript
function sanitizeSitecoreItemName(raw: string): string {
  // Strip parens that don't wrap digits, replace disallowed chars with hyphens
  return raw
    .replace(/\(([^)]*)\)/g, (_, content) => /^\d+$/.test(content) ? `(${content})` : `-${content}-`)
    .replace(/[^\w\s\-\$\*]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}
```

For programmatic / throwaway items: prefer **plain alphanumeric + dashes + spaces** with no parens at all. Keeps cross-tenant portability with no edge cases.

## When this bites

- Programmatically creating items with operator-visible names (probes, fixtures, imports, automation tooling)
- Templates or features that synthesize names from descriptions (e.g. "Auto-saved (draft)")
- Migration scripts importing items from systems that allow richer names

## Diagnosis recipe

When `createItem` returns silently with no `itemId`:

1. Open browser DevTools → Network → find the GraphQL POST to `xmc.authoring.graphql`
2. Look at the response body — `errors` array will name the exact constraint
3. If the wrapper hides it, modify the wrapper to log `result.data?.errors` to console alongside the ok-check

This pattern of "Sitecore returns errors but the SDK wrapper silently returns ok=false" applies to ALL Authoring mutations (`createItem`, `updateItem`, `deleteItem`, `renameItem`). Any new wrapper should at minimum log the errors array when it would have otherwise returned `ok: false`.

## How this was discovered

A probe (2026-05-20). The probe was authoring a throwaway map called `"PRD-004 T1 Probe (auto-delete safe)"`. `createItem` returned ok=false silently. Trail: normalized templateId (didn't help) → enabled `discoverRedirectMapTemplateId` (template id confirmed correct) → added `console.error` of the raw SDK response → operator pasted the response → error message revealed the `ItemNameValidation` regex. Total time-to-diagnose: ~3 iterations. Adding errors-array logging to all write wrappers up front would have cut this to 1.
