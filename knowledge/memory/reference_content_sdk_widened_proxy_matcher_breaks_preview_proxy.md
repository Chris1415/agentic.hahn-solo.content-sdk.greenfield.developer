---
name: reference_content_sdk_widened_proxy_matcher_breaks_preview_proxy
description: "Widening a Content SDK proxy.ts matcher to /api/* (e.g. for an access gate) makes PreviewProxy 403 Pages' /api/editing/config on the editing host — \"Preview content is not found or access is denied\"; PreviewProxy has no skip option"
metadata:
  node_type: memory
  type: reference
---

Measured 2026-10-06 on a prior run (fix: a `SkippablePreviewProxy` wrapper).

- **Symptom.** Pages shows "Connection to your rendering host … failed … (403) Forbidden". Opening `<eh>/api/editing/config?secret=…` in a browser returns `{"html":"Preview content is not found or access is denied"}`, the SDK `PreviewProxy` message.
- **Cause.** The scaffold matcher excludes `api/`, `robots`, `sitemap`, `_next/`, `healthz`, `sitecore/api/`, `-/`. Widening it, as that run's ADR did so the access gate sees every path, lets `PreviewProxy` run on `/api/editing/*`.
  - It only acts when `process.env.SITECORE` is set, which means **only on the platform editing host**.
  - There it treats the route as a page, finds none, and answers 403.
  - Local, preview and Vercel checks can never see it.
- **Fix.** `PreviewProxy` has NO `skip` option, unlike the other SDK proxies. Wrap the instance `handle` with the same old-matcher skip.
- **Red herrings, measured.**
  - Editing secret: EH and CM `obtain-editing-secret` values differ on ALL 17 envs in the org, including working ones.
  - Curl from outside: every EH answers a Cloudflare 9-byte `Forbidden` to non-Pages traffic, so it can't discriminate.
  - CM redeploy: a git-linked CM refuses `--upload` with `NotAuthenticatedException`, and the CLI still exits 0.

**How to apply:** when a gated head app breaks Pages, open the config URL in the browser first. It names the layer in one request.
