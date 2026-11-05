---
name: reference_sitecore_inpage_anchor_link_linktype
description: "Content SDK in-page anchor links — use linktype=\"anchor\", NOT external+#url (which renders http://#x)"
metadata: 
  node_type: memory
  type: reference
---

For a Sitecore General Link that should scroll to an in-page anchor (`#coverage`, `#faq`), author it as **`<link text="…" linktype="anchor" anchor="coverage" />`** — NOT `<link linktype="external" url="#coverage" />`.

An `external` link with `url="#coverage"` gets a scheme prepended by Experience Edge's link parser → the rendered `href` becomes **`http://#coverage`** (a dead link). Verified live on a prior run, 2026-07-13.

Why `anchor` works: the Content SDK React `Link` component (`@sitecore-content-sdk/react` Link.js) builds `href = link.href + querystring + anchor`, but only appends the `#anchor` part when `linktype !== 'anchor'`. For `linktype="anchor"` it uses `link.href` directly — and Edge resolves an anchor-type field's `href` to `#<anchor>`. So `linktype="anchor" anchor="coverage"` → `href="#coverage"`. ✓

The target element still needs a real `id` in the head-app component (e.g. `<section id="coverage">`) — a component `<section>` with no id is a no-op anchor even with the right link. Pairs with [[reference_sitecore_internal_link_without_id_breaks_layout]] (that trap = internal linktype without an id crashes the whole layout; this trap = external+hash renders a scheme-prefixed dead link). Authored via Marketer MCP `update_fields_on_item`.
