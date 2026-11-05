---
name: reference_sitecore_local_datasource_must_live_in_page_data_folder
description: "A local datasource's parent is always <Page>/Data — create_content_item does NOT auto-create that folder, so local items parented to the page land bare and nothing complains"
metadata: 
  node_type: memory
  type: reference
---

**INVARIANT: a LOCAL datasource's parent is `<Page>/Data`, never the page item
itself** — for every mechanism (`add_component_on_page`, `create_content_item`,
raw `createItem`, and a `moveItem` demoting a global datasource to local).
`<Page>/Data` is a real item, template **`Page Data`
`{1C82E550-EBCD-4E5D-8ABD-D50D0809541E}`** — create it on demand, then parent to it.

**The trap — only `add_component_on_page` auto-creates the `Data` folder.**
`create_content_item` parents exactly where you point it, so
`create_content_item(parentId: <the PAGE>)` drops the datasource **bare under the
page** with no error. You fall into that path whenever `set_component_datasource`
is unavailable — it **422s on renderings created via raw AGQL** —
because the flow degrades to `create_content_item` + a raw layout-level attach.
That is exactly how **one site shipped 35 datasources bare under their pages**
(found 2026-08-05, by the operator reading the content tree).

**Why nothing caught it:** pages rendered, build and tests were green, and a
rendering-level schema audit scored 15/15 clean — because each rendering's
`Datasource Location` read the literal `./Data`, pointing at a folder that never
existed. No automated signal exists for this; **audit placement explicitly.**

**Fixing it is safe but is a live content mutation.** `moveItem` preserves the
item GUID and layout datasource references are by GUID, so references survive
(git recorded that relocation as 129 *renames*). Canary one page,
re-assert the route, then roll.

**Verify by asserting the PARENT, not existence** — "the item exists" and "the
field is non-empty" both pass on the broken placement.

Baked into rule `83` (placement bullet), rule `80` § 8, and the
`sitecoreai-content-composition` skill (v0.5.0). Reusable checker:
`audit-sitecore-schema.mjs`.
