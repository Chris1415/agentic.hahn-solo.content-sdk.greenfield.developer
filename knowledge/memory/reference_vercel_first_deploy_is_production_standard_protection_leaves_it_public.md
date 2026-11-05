---
name: reference-vercel-first-deploy-is-production-standard-protection-leaves-it-public
description: "A new Vercel project's first `vercel deploy` (no --prod) goes to PRODUCTION, and default Standard Protection leaves the production .vercel.app alias public (200)"
metadata:
  node_type: memory
  type: reference
---

Observed 2026-10-01 deploying a static deck on a Hobby scope:

- **The first deploy of a new project is production**, even without `--prod`. It aliased `<project>.vercel.app` immediately.
- **The default protection is "Standard"**: it locks the deployment-specific URLs (302 to `vercel.com/sso-api`) but the production alias answered **200 to anyone**.
- **Fix that worked on Hobby:** `PATCH /v9/projects/<name>?slug=<team>` with `{"ssoProtection":{"deploymentType":"all"}}`. After it, every alias, slide route and media file returned 302.
- **Check with `curl` WITHOUT `-L`** and treat only 401, or a 3xx to `sso-api`, as locked.

**How to apply:** before the first deploy of anything private, create the project and set `deploymentType: "all"` first, or accept a short public window and close it immediately. Always end a deploy with an unauthenticated probe of the production alias.

**Hobby password gate (same day):** native Password Protection needs Pro + an add-on. The free equivalent is a root `middleware.js` with Basic Auth that reads an env var and fails closed with 503 when it is unset. It works on a CLI upload with no framework and no package.json. To make the password the only gate, Vercel Authentication must be OFF. **Switching it off immediately exposes every OLDER deployment built without the middleware (one answered 200).** Delete those first, then probe each remaining deployment URL.
