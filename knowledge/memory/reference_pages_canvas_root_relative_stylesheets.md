---
name: reference-pages-canvas-root-relative-stylesheets
description: "Pages canvas + SitecoreAI editing host: public/ assets (stylesheets, fonts) are 403'd by the host's preview protection; only bundled /_next/static reaches the canvas — import CSS, keep font/image urls relative so Next bundles them, CORS on /_next/static/media (a migrated site, 2026-10-25)"
metadata:
  node_type: memory
  type: reference
---

Measured 2026-10-25 on a migrated site's head app, on a SitecoreAI editing host:

1. A `<link href="/site/styles/x.css">` from `public/` was lost in the Pages canvas. The page rendered unstyled while the components still worked.
2. After importing the CSS (bundled to `/_next/static/chunks`), styling came back, but every `url("/fonts/...")` failed. The editing host answered `403 {"html":"Preview content is not found or access is denied"}`: its preview protection lets `/_next/static/*` and the editing API through and blocks **any other path, including `public/`**. A CORS header on `/fonts` did not help.
3. **Fix:** move the fonts and images next to the CSS in `src/styles/` and write the urls relative (`url("./fonts/x.woff")`). Next then emits them hashed under `/_next/static/media`. Add `Access-Control-Allow-Origin: *` on `/_next/static/media/:path*` in `next.config.ts` `headers()`, because Pages loads the fonts cross-origin.

**How to apply:** any head app that ships its own assets (a migrated theme, icon fonts, static images) must bundle them. Nothing the canvas needs may live in `public/`. `next start` locally and a direct hit on the editing-host URL hide the problem; only the Pages canvas with DevTools open shows the 403s.
