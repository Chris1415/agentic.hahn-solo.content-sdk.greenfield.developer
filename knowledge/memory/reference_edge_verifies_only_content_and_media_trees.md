---
name: reference_edge_verifies_only_content_and_media_trees
description: Edge item(path:) can confirm a Sitecore rename only under /sitecore/content and /sitecore/Media Library — templates/renderings/settings return MISSING for every name
metadata: 
  node_type: memory
  type: reference
---

When verifying whether a Sitecore collection/site rename went through, the
preview Edge context (`item(path: "...", language: "en")`) is authoritative for
only two trees:

- `/sitecore/content/**` — ✅ confirms renames
- `/sitecore/Media Library/Project/**` — ✅ confirms renames

`/sitecore/templates/**`, `/sitecore/Layout/Renderings/**`,
`/sitecore/Layout/Placeholder Settings/**` and `/sitecore/system/Settings/**`
return **MISSING for both the old and the new name**, because Edge never
publishes those trees at all. That is *not* evidence the rename skipped them —
it is no evidence either way. Settling them requires Authoring GraphQL against
the CM.

Practical consequence for a serialization module (`*.module.json`), whose
includes span all of these: an Edge probe can only ever verify ~3 of the 8
typical includes. Do not repoint the rest by inference — a wrong path turns
`ser push` into a tree-duplicating hazard (`CreateUpdateAndDelete` will happily
*create* the missing tree).

Also: `sitecore.json` globs `authoring/items/**/*.module.json`, so a bare
`dotnet sitecore ser push` with no `-i` loads **every** module including stale
ones. Parking a bad module as `*.module.json.QUARANTINED` takes it out of the
glob without deleting anything.

Found 2026-08-04 while cleaning up an incomplete site rename.
