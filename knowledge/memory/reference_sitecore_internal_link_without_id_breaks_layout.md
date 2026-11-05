---
name: reference_sitecore_internal_link_without_id_breaks_layout
description: "A Sitecore General Link field authored as linktype='internal' with only a url= (no resolvable item id=) BREAKS the whole page's layout resolution — getPage returns a page with undefined layout.sitecore.route → the head app 404s (not just that link). Fix: use linktype='external' for URL-string links (renders url verbatim, no item resolution), or supply a real id=. Isolated live on a prior run, 2026-07-12."
metadata: 
  node_type: memory
  type: reference
---

**Live-diagnosed on a prior run, 2026-07-12** (Home compose, 8-rendering spine).

Authoring a General Link field via the Marketer MCP as
`<link text="…" linktype="internal" url="/help" />` — an **internal** link with a
`url=` path but **no resolvable `id=`** — makes the Content SDK layout service
**fail to resolve the ENTIRE page layout**: `client.getPage(path, {site,locale})`
returns a page whose `layout.sitecore.route` is `undefined`, the route's
`page.tsx` hits `notFound()`, and the whole page **404s** — not just the one link.
One bad internal link poisons the whole layout.

**Bisection that found it (the method):** a single-rendering page rendered 200;
adding a rendering whose datasource carried an internal-no-id link → 404. Removing
the datasource (empty `s:ds`) → 200 again. So it was the datasource CONTENT, not
the rendering/layout XML. Reading the link field showed
`linktype="internal" url="/help"` with no `id`.

**Fix:** for URL-string links (site-relative paths like `/help`, `/coverage`),
author them as **`linktype="external"`** — external links render the `url`
verbatim and need NO item resolution, so the layout service never chokes. Only
use `linktype="internal"` when you supply a real target `id=` (a resolvable item
GUID). `<link text="…" linktype="external" url="/help" />` is the safe form for
first-pass authoring where the target pages don't exist yet.

**Not to be confused with** the OTHER 404 class (raw-`createItem` pages that don't
route) or a stale-cookie 404 in local development. This one is
content-level: a bad link field value inside an otherwise-valid layout.

Also learned in the same
session: a `__Final Renderings` placement's `uid` should be DISTINCT from its
`s:id` (the MCP always mints a fresh uid); reusing the rendering GUID as the uid
was a red herring here but is still the correct convention.
