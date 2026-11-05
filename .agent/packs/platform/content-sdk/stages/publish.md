---
name: publish
intent: closure
writes:
  - Sitecore publish job (layout items + authored content + media → LIVE Edge, via the Publishing REST API)
  - products/head-application/<project-slug>/cm/authoring/items/** (ser pull of authored items; committed for git durability)
  - editing host + Vercel re-deploy on the LIVE SITECORE_EDGE_CONTEXT_ID
  - Experience Edge OnUpdate webhook → the head app's /api/revalidate (OSR apps only; Edge Admin API)
  - site thumbnail (Sites API upload-thumbnail; screenshot of the live home page)
  - git commit (authored content persisted) + PR update
  - products/<product-slug>/project-planning/plans/publish-report-<timestamp>.md
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/packs/platform/content-sdk/agents/13-devops-engineer.md
  - .agent/manifests/run-manifest.template.json
---

# /publish — Go live: publish everything, persist authored content, deploy on the LIVE context

## What this is

The **final step of the Content SDK / Sitecore branch** — the **one place anything goes live**. Everything upstream (`/implement`, `/test`, `/author-content`, `/test-content`) worked against **preview**; `/publish` publishes **everything** at once, pulls the authored content into the repo for durability, and re-deploys the head app + Vercel on the **LIVE** Edge context.

This is the **publish-last** half of **preview-first / publish-last** (`.agent/glossary.md` § "Preview-first delivery"). It is Content SDK / Sitecore only — generic, Marketplace, and non-Sitecore runs are terminal at `/ship` and never reach `/publish`.

**A live publish is an outward-facing integration boundary** — it is **operator-confirmed** before it fires. Nothing here happens silently.

**Helper scripts that may be missing from your checkout.** The steps below cite `scripts/sitecore-publish.mjs` (step 2) and `scripts/sitecore-site-thumbnail.mjs` (the thumbnail step). They belong to the source repository this flow is generated from, are tied to the estate they were written for, and are **not shipped in a public export**. Where they are absent, make the same call directly: the `sitecoreai-publishing` skill describes the Publishing REST API (publish **scoped items or a scoped root, never the whole environment unscoped**: the endpoint has no site scoping), and the `sitecoreai-sites` skill describes the Sites API that sets a site's thumbnail. The checks themselves (media, live templates, link crawl, robots) are scripts of the `sitecoreai-health-check` skill and do ship.

## Pipeline position

Content SDK branch: `… → /test → /ship → /discover-components → /author-content ⇄ /test-content → **/publish**`.

`/publish` runs **after** `/ship` (the code is already shipped, deployed against preview, and PR'd) and **after** the content phase (`/test-content` passed — hard gate #3, the final look). It is the last command in the run.

**Why this order.** `/ship` ships code; the content phase authors + audits content against preview; **this command owns the final live step** — publish everything, ser-pull authored items into `cm/`, LIVE-context redeploy, and the media gate (see Steps below).

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts` under that product. Content SDK products use the two-level layout, at the path this run's `repo_topology` gives — `products/head-application/<project-slug>/<head-app-slug>/` under `repo-per-deployable`, `products/head-application/<project-slug>/cm/sites/<head-app-slug>/` under `monorepo`. **The CM code base is the same either way**: the project-level `cm/` (NEW CM) or the operator's existing CM code path (EXISTING CM) — so every step below that touches the CM (the ser pull, the module, the commit of authored items) is topology-independent. Only the head-app path and the upload deploy's `--working-dir` move.

## Preconditions (verify before doing anything)

- this pack is active (or a Sitecore channel was authored). If not, stop: *"`/publish` is Content SDK / Sitecore only. This run is terminal at `/ship`."*
- `/ship` has run for this run (`stage_history` has a `shipped` entry; the code is deployed against the preview context and the PR exists).
- `/test-content` has passed (`stage_history` has a `content_tested` entry with no unresolved Critical/Major, or the operator accepted the caveats in writing). If content was never authored/audited, stop and recommend `/author-content` → `/test-content` first.
- The **LIVE** `SITECORE_EDGE_CONTEXT_ID` is known (from `provisioning.*` in the manifest, or ask the operator). This is the context id whose Edge serves **published** content.
- **A delivery surface exists** — `provisioning.delivery_surface` is recorded (`/ship` step 6 asserts it). Check this **before** publishing, not after: without a public URL the § 6a link-crawl and § 6b robots gates **cannot run at all**, and the run can only ever close `partial`. The editing host does not substitute — it `403`s anonymously by design. If the slot is missing or `kind: "none"` and the operator expects a live site, **stop here and settle it first**: standing up a delivery surface is a decision about a public web presence on the operator's account, not a step to take unilaterally mid-publish. (Measured 2026-08-27: a prior run reached this stage with no Vercel project; the tenant publish and media gate passed, two of three live gates were unrunnable, and the run closed partial pending an operator decision. Another, 2026-08-26, closed the same way.)
  **When the operator confirms, follow § "Standing up the delivery surface" below** — do not improvise it. Stopping without a procedure is how the last two runs each spent a stop on the same unanswered question.

## Delivery visibility — read it before any live gate

Every live gate below branches on **`variables.delivery_visibility`** (`public` | `private`), resolved at intake and printed in this stage's brief under `variables`. The platform default is `public`; a method pack may re-default it (`variable_defaults` — `method:clone` sets `private`, because a public copy of someone else's site is duplicate content search and AI answer engines can rank against the original). The manifest records the run's value at `variables.delivery_visibility`; an operator override at intake wins. **Read the variable, never infer it from the method** — "is this a clone?" is a second resolution path.

| | `public` | `private` |
|---|---|---|
| Delivery surface | anonymous visitors | an access gate on **every** path incl. `/robots.txt` + `/sitemap.xml` (app-level password gate: 401 + `X-Robots-Tag: noindex` anonymously, signed cookie after the password; or the host's deployment protection) |
| `RobotsContent` | `Allow: /` (seeded at provision § 7e) | `User-agent: *` / `Disallow: /`, published |
| `noindex` | — | on every page, so a leaked authenticated render still carries it |
| § 6a link-crawl | anonymous | **authenticated** through the gate — an anonymous crawl of a private site measures the gate, not the links |
| § 6b robots gate | anonymous 200, body has **no** `Disallow: /` | anonymous `/robots.txt` → **401**; authenticated body **contains** `Disallow: /` |
| § 6c thumbnail | anonymous capture | **still required** — captured authenticated (`--auth-cookie`), the gate stays closed |

Under `private` these are the **declared contract**, not deviations to log. Measured 2026-09-29/30 on the sitecore.com clone: before the variable existed, the run could only close by recording both inverted gates as operator deviations against its own pack. The gate's secret (e.g. `SITE_PASSWORD`) lives in the host's env vars on all three targets, never in the repo; rotating it invalidates issued cookies.

🔴 **Whatever the visibility: never put a Vercel target on the PREVIEW Edge context on a URL anyone outside the team can reach.** On 2026-09-28 a clone's public production URL served unpublished preview content for a day by operator override, before anything was gated. The preview surface is the editing host (glossary § "Preview-first delivery" → Surfaces).

## Pre-flight — live-leg auth (fail fast, before anything fires)

Before the DevOps sub-agent does any live work, verify **every** credential the publish leg needs **in one pass**, and **stop with the exact re-auth command** if any is stale — do not discover an expired token three steps into a go-live — stale credentials often fail *separately* on the Marketer MCP token, the Sitecore CLI deploy token, and a dead repo-root deploy client. Check, and stop with the fix if any fails:

- **Sitecore CLI deploy token** — `dotnet sitecore cloud environment list` (or `environment info -id <envId>`) returns without an auth error. Stale → operator runs `dotnet sitecore cloud login` (device flow; **surface the code**).
- **Deploy-client validity** — the client used for the CLI / Deploy API authenticates (not a 401). A dead repo-root client → use the run's known-good CM client as the workaround and **flag the dead client for rotation** (an Operator Checkpoint item — never silently proceed on a mystery credential).
- **Vercel CLI** — `vercel whoami` succeeds and the target project is linked (or link it, backing up `.env.local` first — `vercel link` clobbers env vars).

Only when all pass does the publish proceed. Record which credentials were refreshed in the publish report.

## Sub-agent orchestration

The publish work is **DevOps Engineer (13)** — it operates the Publishing REST API, the Sitecore CLI (`ser pull`), and the Deploy / Vercel deploys. Spawn the DevOps Engineer (13) as an isolated sub-agent via `Agent(subagent_type: "devops-engineer")` (applies its pinned `model`/`effort` — rule 72) per `.agent/WORKFLOW.md` § "Sub-agent orchestration model"; the operator-facing confirm gate and the git commit / PR update are Team Lead work in the main context. Load the `sitecoreai-publishing` skill (Publishing REST), `sitecoreai-cli-cloud-workflow` (ser pull) and `sitecoreai-health-check` (its scripts are the context, media, live-template, crawl and robots gates of steps 4-6b), and on an OSR app `sitecoreai-edge-admin-webhooks` + `content-sdk-app-router-cache-components-and-osr` (step 4a); reuse any already-loaded in-session skills rather than re-invoking (glossary § "Skill-load reuse").

## Steps

1. **Confirm the publish (operator gate — `go_live`).** Read `scope_dial.gates.go_live` (default `true`). **When `go_live` is on** (default): present the publish plan and **stop for explicit confirmation** — this is the outward-facing boundary:
   - The target: collection / site, and the LIVE context id the site will serve on.
   - The scope: **full-site publish** (default — layout items + all authored content + media) or a bounded subtree (operator override).
   - The consequence: the site goes **live** to anonymous visitors.
   - OSR apps: the OnUpdate Edge webhook registration (step 4a) — a real-tenant mutation, confirmed here with the publish.
   - End with: *"Reply **YES** to publish everything to LIVE, or describe a narrower scope."* Do **not** proceed without a YES.

   **When `go_live` is off** (the operator dropped it / `fully_autonomous`): proceed **unattended** with the default full-site publish scope — no confirmation pause. Still record the auto-fired publish in the report and the Operator Checkpoint. A **genuine blocker** (publish job fails, media gate cannot reach 200, live site does not resolve) still stops the run — autonomy removes the *confirmation*, not the *error handling*. **First-run exception:** on the very first live Content SDK run through the new ship/publish split (see § "First-run boundary check"), keep the confirm even if `go_live` is off, and say so — an unproven boundary is verified attended once before it is trusted autonomously.

2. **Publish this run's scope (Publishing REST API).** Once confirmed, create the publish job via the Publishing REST API (`sitecoreai-publishing` / `scripts/sitecore-publish.mjs`) — the Marketer MCP has **no publish tool**. Publish **everything this site needs** — layout items, authored content items, and media — to the LIVE Edge. Poll the job to terminal; capture the job id + outcome. On failure, surface the job error and stop (do not proceed to the deploy — an unpublished site would 404 on the live context).
   - **"Everything" means everything THIS SITE needs — never the whole environment.** The endpoint has no site scoping: an unscoped job publishes every item on the CM, and this CM is shared across brands with other sessions authoring concurrently, so it would ship their unfinished drafts live. `scripts/sitecore-publish.mjs` therefore **refuses to run without `--items` / `--root`**, prints the resolved scope, and needs `--yes` when non-interactive. Name the roots (children are included by default):
     ```sh
     node scripts/sitecore-publish.mjs --cm <project>/cm --yes \
       --tenant <expected-cm-tenant-name> \
       --items <site-content-root-guid>,<site-layout-renderings-guid>,<site-media-folder-guid>
     ```
     Use `--dry-run` first to read the payload back. `--entire-environment` exists, names every brand it would publish, and is **not** what a per-site go-live wants.
   - **A root with children reaches build-only trees.** `--root <Home>` (children on by default) also publishes `Home/Components Preview`. To publish a whole site without it, list the site's serialized item ids in a file (every yml id under the brand module minus the excluded subtree) and pass `--items-file <file> --no-children --no-related`. Measured 2026-10-06: six sites moved to another tenant this way, 0 failed, scaffolding never published. Expect language-variant deletes in the job statistics when a locale is added.
   - **`--tenant` is MANDATORY with `--yes`, and it is not bureaucracy.** The Publishing endpoint is **global** — it carries no tenant, environment id or host, so the target CM is resolved **entirely from the bearer token**. A credential belonging to another estate does not error: it publishes *that* estate and returns a clean `Completed` with a normal-looking job id. Nothing in the response is wrong-looking. `cm/.env` can hold several estates' clients side by side (unsuffixed + `_ACME` + `_OTHER`), and the **unsuffixed pair wins the lookup chain while naming no estate** — so reading the file tells you nothing about where you are about to publish. Near-miss 2026-08-27: a go-live picked up the unsuffixed pair, which authenticates as a different org's tenant; it was caught by hand, not by any gate. The script now asserts the token's own tenant claim against `--tenant` and aborts on mismatch (exit 2, nothing fired), refuses `--yes` without it, and warns when an ambiguous unsuffixed pair is in play. Resolve the expected tenant from the CM host (`xmc-<tenant>.sitecorecloud.io`) — do not copy it from a sibling run.
   - **Layout items note**: `/sitecore/layout` items must be published to Edge for the site to resolve — they are **not** covered by the content root, so include them as their own scope entry, not just content pages.
   - **Page types / templates the site's items use — publish them too.** A site's page types often live in the COLLECTION's template folder (`/sitecore/templates/Project/<Collection>/...`), outside every site root and outside `/sitecore/layout`, so a site-scoped publish leaves them out. LIVE Edge then names each item of that type `UnknownTemplate`, while preview (it reads master) shows the real name. Anything keyed on the template name breaks on live only. Measured 2026-10-31: a head app chose its site look from the Home template name and fell back to the plain look on live, on every route, with every other gate green. List the templates the site's items use (Authoring `item { template { fullName } }`) and name each one (with its `__Standard Values`) as its own scope entry, never the shared folder: the folder also holds sibling sites' page types. Step 5a proves it.

2a. **Scope hygiene — exclude seeded scaffolding, sweep scaffold residue.** Before the job fires, check the resolved item list twice:
   - **Nothing under `<site>/Home/Components Preview/**`.** That tree is build-phase scaffolding identified by its path (rule `80` § 0b-i); publishing it puts throwaway content on a public site under a real brand. Watch the indirect route too — a `--root` on an ancestor with `publishChildren` reaches it without ever naming it. It should already be torn down at `/test-content` close; if it is still there, that is a finding, not a thing to quietly publish.
   - **Sweep EVERY `Data` folder for site-template residue**, not just the page's own. The `Basic`/SXA templates seed sample datasources (lorem ipsum, *"Latest Streetwear"*, a *"Made by Sitecore"* link) into real `Data` folders, so they are **not** caught by the path rule above. Seven were found and deleted by hand on a prior run, across two folders — after the content phase had already passed.

2b. **Languages — only when `variables.languages.additional` is non-empty.** Publish **every locale in one place** (one job, all languages listed), never a language at a time from different callers. **Before an all-language publish on a shared CM, run the orphan-language check** (`language-census.mjs` on this site, and name any other site with versions in a language just added): adding an environment language makes every existing version in it publishable, so a site-wide publish can push a sibling brand's untranslated versions live (measured 2026-10-02: one site's de-DE versions became publishable the moment de-DE was added). Skill: `sitecoreai-localization`.

3. **Persist authored content into the repo (ser pull → commit).** The content authored in Phases `/author-content` / `/test-content` lives in the live tenant; capture it into the CM code base for git durability (content is not durable until re-pulled).
   - Use the **collection's isolated module** created at provision (`cm/authoring/items/<collection-slug>.module.json`, namespace `Project.<COLLECTION>`, distinct `items.path` — ONE per collection; sites sharing a collection share it). If it is missing (a run provisioned before this was standard, or an EXISTING CM), create it first — mirror a sibling collection's include set retargeted, with a **distinct per-collection `items.path`** so it cannot collide with *other collections*. Verify the collection-level paths exist first (`get_content_item_by_path`, `failOnNotFound:false`).
   - **Run the project-LOCAL CLI: `dotnet tool run sitecore …`** — it can only resolve the local tool manifest. A global `sitecore.cli` install shadows the project's pinned local tool; measured 2026-09-29, a global 5.2.109 could not load the Serialization/Publishing plugins, `ser pull` failed, and `cm/` drifted from the tenant until the local tool was used. Other lines in this file say `dotnet sitecore …` for brevity; run them the same way.
   - **`dotnet sitecore … ser pull -i "Project.<COLLECTION>"`** — the final content pull, **always scoped** to the collection's module (the second of two pulls; the baseline was pulled at provision). On a shared `cm/`, **never** run an unscoped pull / `ser validate --fix` / `pull --force`: they flag *other collections'* files for deletion (`> Fix will delete file`) — read any delete list before applying. Items flow CM→repo via **pull, never push**. Confirm `.sitecore/user.json` stays gitignored.
   - Commit the pulled items to the CM repo with a convention-compliant message (`.agent/glossary.md` § "Commit message convention"; use `/commit-message` for drafting) — the *why* is "persist the live-authored content into the repo so the site is reproducible from source."

4. **Re-deploy on the LIVE context (editing host + Vercel) — verify mode from the environment, NOT the manifest.** Now that content is published, ensure both surfaces serve the LIVE context so pages prerender against published Edge (rule `80` § 7). **Read the actual deploy topology first — the manifest can be stale** (e.g. the manifest claimed upload-mode while the editing host was actually git-linked, and the Vercel prod env was already on LIVE, not preview as assumed).
   - **Editing host — branch on the deploy mode.** `dotnet sitecore cloud environment info -id <ehId>` reveals it. **Git-linked** (`deployOnCommit`, carries `repositoryBranch`): merging this run's PR to `main` already auto-deployed the head-app code — do **NOT** run an upload deploy; confirm the deployment succeeded and move on. **Upload-mode**: `cloud editinghost deploy --environment-id <ehId> --upload --working-dir <the deployable root>` — the folder holding the `xmcloud.build.json` that declares this host: the head-app folder under `repo-per-deployable`, the **repo root** (`<cm_code_base>`) under `monorepo`. **Set no Edge variable on the host for this:** the platform injects its Edge context, and a same-named upsert breaks the rollout (`/provision-sitecoreai` § 5c); run `assert-eh-vars.mjs --env <ehId>` before the deploy, and it must exit 0. Only Vercel's context is ours to pin. Write the observed mode back to `provisioning.editing_host.deploy_mode`.
   - **Vercel is the single LIVE surface — verify, then redeploy.** Confirm that `SITECORE_EDGE_CONTEXT_ID` (+ `NEXT_PUBLIC_…`) is the **LIVE** context id (pinned at provision/ship) **on all three targets — `production`, `preview` and `development`** (§ "Standing up the delivery surface" step 3). Read the values back per target with `vercel env pull --environment=<target> <scratch-path>`; `vercel env ls` shows `Encrypted` and so proves presence only, never that Preview holds the live id rather than the preview one. Then let the context gate compare them with the Deploy API's ids (values are compared, never printed):
     ```sh
     node .claude/skills/sitecoreai-health-check/scripts/check-edge-context.mjs --org <org> --env <cm-env-id> --site <site-name>        --app-env-file <scratch>/production.env --app-env-file <scratch>/preview.env --app-env-file <scratch>/development.env
     ```
     Exit 0 = the LIVE id serves the site's home route and every target carries it. Exit 1 = a blocker (a target on the **preview** id is P0; an empty or foreign id is P1); exit 2 = the gate could not decide (Deploy or Edge unreachable) and is not a pass. Delete the scratch files afterwards. If all three are already LIVE (the intended wiring), do **NOT** re-link or re-push env — that only risks clobbering `.env.local`. Correct only what is actually wrong or missing (back up `.env.local` first, and never let `env pull` default its output path).
   - **`/publish` OWNS the one go-live Vercel redeploy.** Trigger exactly **one** redeploy here. Every page the build cached was rendered before this publish, so it holds pre-content output (404 entries included, which carry no item tag any publish can reach); the redeploy replaces them with published content. Because the pipeline owns this single redeploy, **the operator does not redeploy Vercel by hand** — that is what avoids the deploy-alias clobber (two redeploys fighting over the production alias). If the operator has already redeployed, **use their deployment**; do not force a second one over it.
   - **Cache Components apps: served-HTML guard on the new deployment, before anything else counts as live.** Run `check-served-html.mjs` (skill `content-sdk-app-router-cache-components-and-osr`, Verify step 0, same paths and `--expect-404` set as `/test`) against the redeploy's own URL. Exit 1 = promote the previous production deployment back and stop with a `[BLOCKER]`; do not run step 4a or any delivery gate on it. Measured 2026-10-15: a migrated app served every page cut at ~21 KB in production while every local gate was green.
   - **After go-live, freshness follows the publish-freshness ADR.** A **plain-template** app (no OSR) shows a later publish only when its revalidate window elapses or the app is redeployed: redeploy-on-publish stays its mechanism. An **OSR** app does not need a redeploy per publish: the platform **does** have a publish webhook (the Experience Edge Admin API, not the Publishing API), and step 4a wires it.
   - **This is the step moved out of `/ship`.** `/ship` deployed the editing host against **preview** and linked Vercel on **LIVE**; the LIVE-context redeploy belongs here because it depends on published content.

4a. **Register the OnUpdate Edge webhook — OSR apps only (`go_live`; name it in the step-1 plan).** Skip with a one-line note when `variables.freshness` is `redeploy`. Skills: `sitecoreai-edge-admin-webhooks` (§ 4–5) and `content-sdk-app-router-cache-components-and-osr` (Verify).
   - **Controls first — no pass, no webhook.** Run `revalidate-controls.mjs` against `https://<production-domain>/api/revalidate` (the production domain, never a per-deployment URL or preview; pass the bypass if protected). Expect no-secret `401`, wrong-secret `401`, OnUpdate rows `200`. **Edge retries a non-2xx immediately: one publish against a receiver answering 401 sent 10 deliveries in 7 s and auto-disabled the webhook (live, 2026-10-02).** So the secret is proven before the webhook exists. Whether `POST /webhooks` honours `disabled: true` is unverified; until it is, create only after the controls pass.
   - **Create** with the Edge administration client (`/provision-sitecoreai` § 6b): `webhooks list` (duplicate check on `uri`; one webhook per head app per environment, owner in `label`) → `webhooks create --mode OnUpdate --method POST --uri <production-domain>/api/revalidate --header x-revalidate-secret=env:SITECORE_REVALIDATE_SECRET [--header x-vercel-protection-bypass=env:VERCEL_AUTOMATION_BYPASS_SECRET]` dry run, then `--yes`. **OnUpdate only:** OnEnd fired three times per publish, two before Edge had the content, and carries no rows. **Never** a CM webhook (its payload has no `updates`, and `publish:end` fires before Edge is live).
   - **Verify on a SECOND publish, by content marker.** The first authorised POST after a deploy can refresh everything even on a broken setup, so judge the next real publish (the first post-go-live edit, or a reversible marker edit reverted with a third publish). Wait for the webhook's newest `lastRuns` entry (`success: true`, `disabled` false) — **budget about 3 minutes**: publish start → webhook took 86–175 s while Edge was fresh at 23–60 s. Then assert the edited page shows the new marker **and an UNRELATED page stays cached** (`x-vercel-cache: HIT`). An unrelated page going `STALE` means a sitewide purge (the 2.4.0 defect), not item-level OSR: record it as a concern and keep the redeploy fallback. A verification that cannot run now is recorded in `operator_attention[]` as "OSR end-to-end unverified", never folded into a pass.
   - **Record** `provisioning.edge_webhook = { id, uri, executionMode: "OnUpdate", verified: true|false }` via `manifest-write.mjs` (no header values: `GET` echoes secrets, redact every read). If the controls fail or the webhook auto-disables, fix the receiver (or fall back to redeploy-on-publish and record it); re-enabling does not clear the old `lastRuns`.

5. **Media gate (anonymous published delivery — moved here from `/ship`).** After the LIVE-context deploy, run the shared gate (the same script the `/doctor` health check runs):
   ```sh
   node .claude/skills/sitecoreai-health-check/scripts/check-media-delivery.mjs --url <vercel-live-url> [--pages /,<a page with images>]
   ```
   It harvests the media URLs from the served pages and asserts each **unfollowed** anonymous GET is **200, not 302**, with a non-HTML type, from the Edge media host.
   - Correct (published, LIVE context): `edge.sitecorecloud.io/<tenant>/media/…`.
   - Broken (preview context / unpublished): a `302 → app.sitecorecloud.io` or `xmc-…sitecorecloud.io/-/media`, or media served from the CM host. If broken, the deploy is still on the preview context or the media was not published — fix the context vars + republish + redeploy.
   - Exit 0 pass, 1 `[BLOCKER]`, 2 unknown (no media found on the given pages, or unreachable): pass `--pages` with a page that renders an image; unknown is never folded into a pass. The browser half of the check (images that fail to load after hydration) is reported by the § 6a crawl.

5a. **Live-template gate — no item of the site reads `UnknownTemplate` on LIVE Edge.** Walks the site root on the LIVE context id (the Dictionary subtree is skipped):
   ```sh
   node .claude/skills/sitecoreai-health-check/scripts/check-live-templates.mjs --root /sitecore/content/<Collection>/<site> --context-id <LIVE context id>
   ```
   "Template with id … was not found" is a P2 advisory, not a blocker: fields, layout and routes work, but one such item fails a whole list query that reads `template{}`, so check the head app keys its walks on a signature field instead. Exit 0 pass, 1 `[BLOCKER]` (each finding names the item; publish its template per step 2, then republish the item so the head app re-reads it), 2 unknown (root absent on live, wrong context id, Edge error): never a pass. Preview cannot run this check: it reads master and always knows the template.

6. **Final live check on the Vercel LIVE URL (the go-live gate).** After the go-live redeploy, load the **Vercel production URL** as its real reader — an anonymous visitor under `public`, an authenticated one through the access gate under `private`: pages resolve (no `<MissingComponent>`, no 404 on the home route), authored content shows, media renders, **no console errors**. **Vercel is the single live surface** (the editing host is the preview/authoring surface — glossary § "Preview-first delivery" → Surfaces); this anonymous check is the real go-live smoke. If content looks stale, suspect the cache before the publish — confirm the redeploy landed (and, on an OSR app, read the webhook's `lastRuns` after waiting about 3 minutes) **before** concluding a publish problem (the classic "was it publish or the cache?" tangle).

   **6a. Live link-crawl — MANDATORY, not a spot check.** Starting from the live URL, crawl **every internal link** and assert each one resolves. This is the only place a broken route can be caught: preview resolves both the raw and the slugified route form while **live Edge resolves only the slugified one** (rule `85-preview-live-divergence`; `.agent/glossary.md` § "Divergence class (preview vs live)"), so a dead link is **by definition invisible upstream**. A run went live with **4 of 21 internal links 404-ing** — all green on preview, none catchable before this step.

   Run the shared crawler (Playwright from the cwd or `PLAYWRIGHT_MODULE`; `--require-browser` makes a run without a browser exit 2, never a pass):
   ```sh
   node .claude/skills/sitecoreai-health-check/scripts/crawl-live-links.mjs --url <vercel-live-url> --visibility <public|private> --require-browser      [--auth-cookie "<gate cookie>"] [--max-pages 200]
   ```
   Exit 0 = every internal link resolved (it prints `N/N internal links resolved`, the number for the report), no MissingComponent, robots meta matching the visibility; exit 1 = a `[BLOCKER]` with the failing hrefs and their referring pages; exit 2 = could not decide. The script implements the three non-negotiables below, each of which has already produced a false pass:
   - **As the real reader.** Under `public`, crawl as an unauthenticated visitor. Under `private`, crawl **authenticated** through the access gate (log in once in the browser context, then crawl) — the real reader of a private site is an authenticated one, and an anonymous crawl there only proves every path returns 401.
   - **A real browser, after hydration.** Drive it with Playwright and collect hrefs from the hydrated DOM. Client components emit links that never appear in the server HTML, so **`curl` cannot see them** — this is how one run's `/stories` links were nearly missed. Collect the full set first (home + every page reached from it), then assert each.
   - **Never `curl -L`.** With Vercel SSO on, following the redirect lands on the login page and returns a **false 200**. Assert the status of the *unfollowed* response, or read the browser's own navigation result.

   **Any 404 is a `[BLOCKER]`** — record the failing hrefs, their referring pages, and the resolved live path, and stop. Do not close the run with a known dead internal link on a live site.

   **6b. `/robots.txt` gate — the site must be crawlable (`public`) or provably closed (`private`).** Run the shared gate; it implements both branches below and exits 0 pass / 1 `[BLOCKER]` / 2 unknown (a `private` run without the gate cookie is unknown, not a pass):
   ```sh
   node .claude/skills/sitecoreai-health-check/scripts/check-live-robots.mjs --url <vercel-live-url> --visibility <public|private> [--auth-cookie "<gate cookie>"]
   ```
   Under `private` the gate INVERTS: assert anonymous `/robots.txt` returns **401** (the access gate answers first), then fetch it **authenticated** and assert the body **contains** `Disallow: /`. Either failing is a `[BLOCKER]` — a private site that serves a crawlable robots body is one misconfigured gate away from being indexed. The rest of this step describes the `public` case. Fetch `<live-url>/robots.txt` anonymously and assert **200** and that the body does **not** contain `Disallow: /`. This is a one-request check that catches the single most silent go-live defect there is: the site Settings item's `RobotsContent` field defaults to **empty**, and empty does not mean "no robots.txt" — Sitecore composes `User-agent: *\nDisallow: /` server-side and Edge serves it at a clean 200, so the site launches invisible to search with every other gate green. `/provision-sitecoreai` step 7e seeds the default, and this is the live-surface confirmation that it survived to the public domain (and that the head app's `/robots.txt` rewrite + route handler are actually wired — an unwired route is a 404 here, which is *also* a fail).

   A `Disallow: /` body or a non-200 is a **`[BLOCKER]`**. Fix at the source — set `RobotsContent` on `<COLLECTION>/<SITE>/Settings`, not by hard-coding a `public/robots.txt`, which would shadow the CMS-managed value and put it beyond the author's reach.

   **Then PUBLISH the Settings item and re-check — corrected 2026-08-14.** This step previously said no publish was needed and that a fix here was "a re-check, not a re-publish", on the evidence that preview and live returned identical `siteInfo.robots`. They were identical because every site measured had an **empty** field, so both contexts served the same composed default — identical-when-broken proves nothing about identical-when-fixed. Measured after an actual write: preview `Allow: /`, live still `Disallow: /`. Since this gate runs on the **live** domain, the old guidance made the blocker unclearable: you would fix the field, re-check, and still fail. Sequence: write the field → publish that item → re-fetch `<live-url>/robots.txt`.

   ⚠️ Sitecore auto-appends a `Sitemap:` line pointing at the **CM host**, not the public domain. The gate prints it as an advisory (D8), not a blocker: note it in the report.

   **6c. Site thumbnail: the last write before handover — ALWAYS, for every visibility (operator, 2026-10-06).** Only after 6/6a/6b pass, so the site is known to look right. Under `delivery_visibility: private` pass the gate cookie (`--auth-cookie "<name>=<value>"` or env `SITE_GATE_COOKIE`; set on the capture context only, never logged) — never open the gate to take the picture. A site with a consent banner or any first-view overlay needs `--dismiss "<selector>"`: a card showing a cookie dialog is not the site, the script waits up to `--dismiss-timeout` ms (8000) for it, since a hydrated banner mounts after networkidle, and warns when it never appeared, and the script resets scroll after the click (a dismiss scrolled the header off on a prior run). **Look at the PNG before uploading** (`--dry-run` first): the CSS-rule floor proves styles applied, not that the header and hero are in frame. Set the site's dashboard card to a screenshot of the **live home page**:
   ```sh
   node scripts/sitecore-site-thumbnail.mjs --site <site-name|id> --url <vercel-live-url> \
     --app <head-app-dir> --org <org> --tenant <expected-cm-tenant-name> \n     [--dismiss "<consent-accept-selector>"] [--auth-cookie "<gate cookie>"] [--dry-run]
   ```
   The platform's auto-generated thumbnail is a 600×600 capture that lands **without CSS**: real content as raw monospace text. It stays that way until something replaces it. The script asserts the tenant before capturing anything. It then captures anonymously at a 1440×796 viewport, saved at 800×442 (the card crops to 400×221), and **rejects an unstyled capture** (< 50 applied CSS rules; measured 391 styled vs 0 with CSS blocked). It also rejects a non-200 and a cross-host redirect (Vercel SSO). Then it uploads via the Sites API and reads the result back: `autogenerated: false`, a `thumbnail_<siteId>` url, and stored bytes equal to the uploaded bytes. Pass `--out <product>/project-planning/captures/site-thumbnail-<date>.png` to keep the image beside the report. **The upload limit is 1 MB** (`400 "Thumbnail size is more than 1MB"`, nothing written), so the script steps down in width if a capture is too large. No publish is needed, because the thumbnail is a CM dashboard asset. The item `<site media>/System/thumbnail_<siteId>` is serialized by the brand module's `/System` rule (capped at `ItemAndChildren`, so auto-captures stay out of git). Step 3's pull ran before this step, so the new thumbnail is committed on the next scoped pull. A failure here is **not** a `[BLOCKER]`: the site is live either way. Record it in the report and in `operator_attention[]`.

6c. **Conditional live gates (strict surface, rule 85).**
   - **Languages** (`variables.languages.additional` non-empty): `language-census.mjs` against the LIVE context (`edge-route-missing`, `edge-dict-absent`), then the live crawl per locale asserting `<html lang>` per locale and hreflang alternates on a multi-language site.
   - **Search** (`variables.search` not `none`): the operator reindexes the content source after the publish; then `probe-search.mjs --expect-results` against the LIVE context is a gate. `no search index found` = the source is missing on this environment, not a code defect.
   - **Atoms** (`variables.sdk_line == beta.atoms`): once a real Document exists, an MMS 200 with a non-JSON content type next to the media gate (an `application/json` body renders null on the beta).

7. **Write the publish report + update the manifest.**
   - Write `project-planning/plans/publish-report-<timestamp>.md`: publish job id + outcome, ser-pull item count + commit, editing-host + Vercel deploy ids, media-gate result (200 / fixed), the 5a live-template result (items walked, `UnknownTemplate` count), live-URL smoke result, **the link-crawl result from 6a (`N/N internal links resolved`, or the failing hrefs with their referring pages)**, and **the 6b `/robots.txt` result (status + whether the body allows crawling)**, and **the 6c site-thumbnail result (uploaded url + capture path, or why it was skipped or failed)**, and the **freshness mechanism** (OSR: webhook id, controls result, second-publish verdict; otherwise redeploy-on-publish).
   - Record `smoke_outcomes.publish` (published-delivery + media gate + live smoke) in the manifest.
   - **Append `stage_history` entry** per `.agent/manifests/README.md`: `{ stage: "published", agent: "13-devops-engineer", outcome: "completed" | "failed", one_line: "published <scope>; ser pull N items; media <200|fixed>; live smoke <result>", deliverables: [<publish report>, <cm item paths>] }`. On failure, `outcome: "failed"` with the error; leave the run resumable.
   - Update `updated_at`; write both `run-<timestamp>.json` and `current-run.json`.

8. **Update the PR.** The authored-content commit (step 3) lands on the branch; push it and add a comment/section to the existing PR noting the site is live (publish job id, live URL, media-gate result). Do not open a new PR — this run's PR was created by `/ship`.

9. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt. One nudge per `/publish` run. Default-skip.

## Standing up the delivery surface (Vercel) — operator-confirmed, never unilateral

No stage creates a public surface. `/provision-sitecoreai` creates the *editing* host, which is the authoring surface and `403`s anonymously by design. Every live head app here got its Vercel project **by hand, outside the pipeline** — so the step exists in practice and nowhere in the contract, and two consecutive runs reached `/publish` with no public URL and closed `partial`.

**The confirmation stays.** Creating a public website on the operator's account is an outward-facing act; this section says *how*, not *whether*. Ask first, naming the project and the URL it will produce.

**Auth is a CLI session, not a token.** `vercel whoami` — if it fails, ask the operator to run `! vercel login` (interactive, browser). Same model as `dotnet sitecore login` and the Marketer MCP. Never store a `VERCEL_TOKEN` in a file.

Grounded on nine shipped projects, verified 2026-08-28:

1. **Name** `<site-slug>-brand`. A product whose slug already reads as a brand may drop the suffix.
2. **Create + link, from the head-app repo root:**
   ```sh
   vercel link --yes --project <site-slug>-brand      # writes .vercel/project.json
   vercel git connect                                 # picks up the repo's own origin
   ```
   **Root Directory is `.`** — each head app is its **own repo** (`repo_setup.topology`: one repo per deployable), so this is *not* the monorepo/subfolder case and needs no root-directory override. Framework preset resolves to **Next.js**; Node **24.x**, which must match the `xmcloud.build.json` `nodeVersion` pin — if they diverge, the editing host and the public host run different majors.
   **Under `monorepo` (head apps in `cm/sites/<app>`, one repo) the project differs in three ways**, proven on one multi-site estate (2026-10-14) and the four migrated sites (2026-10-15): (a) **Root Directory `sites/<app>`**, set when the project is created; (b) an **ignored build step** `git diff --quiet HEAD^ HEAD -- .`, so a push builds only the project whose folder changed; (c) **CLI deploys run from the REPO ROOT** — from inside `sites/<app>` Vercel appends the root directory again and fails on a doubled path. The ignored build step also cancels an API- or CLI-triggered go-live deploy of an unchanged commit (all four migrated sites came back `CANCELED`): clear it for the one go-live redeploy, then restore it. Creating the projects through the REST API (`POST /v11/projects` with `rootDirectory`, `gitRepository`, `environmentVariables` on all three targets) avoids `vercel link`'s `.env.local` clobber entirely.
3. **Set the five variables — on ALL THREE Vercel targets (`production`, `preview`, `development`), same value each.** The set every working sibling carries:
   ```
   SITECORE_EDGE_CONTEXT_ID              <- the LIVE context id, NOT preview
   NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID  <- same value
   NEXT_PUBLIC_DEFAULT_SITE_NAME
   NEXT_PUBLIC_DEFAULT_LANGUAGE
   SITECORE_EDITING_SECRET               <- org/estate-scoped, like the context id
   ```

   🔴 **`SITECORE_EDITING_SECRET` is ORG- and PROJECT-dependent — it is not a per-site value and there is no global default.** Like the Edge context id it belongs to the estate the CM lives in, so **derive it from a sibling site sharing this run's live context id**, never from another estate's app. Getting it from the wrong estate is the same class of error as pairing a publish token with the wrong tenant. **A head app's own `.env.local` is NOT a reliable source** — it is legitimately left **empty** there (the deployed *editing host* receives its value from the SitecoreAI platform variables, so local rendering never needs it), and an empty value is silently useless: piped into `vercel env add` it makes the CLI fall through to an **interactive prompt** and the variable is never written. Treat empty as absent and resolve the value from the estate.

   🔴 **Production-only is the observed defect — every Vercel PREVIEW deployment then fails to build.** A Vercel *Preview* deployment (any branch push, and every PR this pipeline opens) resolves env vars from the **Preview** target, which inherits **nothing** from Production. `SITECORE_EDGE_CONTEXT_ID` is read at build time, so the branch build dies outright — while `vercel --prod` stays green, which is why this survives every gate that only ever looks at production. Measured 2026-08-31 across the nine head apps: **Development was empty on 9 of 9**, Preview absent on 4 of 9, and the five that did have Preview had it only because someone hand-fixed it weeks after ship — the pipeline never wrote it.

   **All three targets carry the LIVE context id — identical values; only presence differs.** A Vercel Preview deployment is a *branch* build of the **live** surface, not a preview surface: the preview surface is the editing host (glossary § "Preview-first delivery" → Surfaces). Seeding the Preview target with the **preview** context id is therefore forbidden for the same reason ship-close-out § 2 forbids a preview-context Vercel — it manufactures a second lenient surface that renders unpublished content at a URL that looks live, which is exactly the rule `85` false-pass shape (a branch deploy passes, the production URL 404s).

   ```sh
   for target in production preview development; do
     printf '%s' "$LIVE_CONTEXT_ID" | vercel env add SITECORE_EDGE_CONTEXT_ID "$target" --force
   done
   ```
   **One call per target — the bare `vercel env add <name>` "all Environments" form is INTERACTIVE** (it prompts for the targets) and hangs a non-interactive run; the target argument is what makes it scriptable. `--force` makes a re-run idempotent instead of failing on an existing key. Verified against Vercel CLI 50.1.6.

   ⚠️ **Vercel is the LIVE surface** (glossary § "Preview-first delivery" → Surfaces). Seeding it with the **preview** context id produces a site that builds green and serves unpublished content — the failure looks like a publishing problem and is not one.
   **Under `delivery_visibility: private`, the gate ships in the CODE and its secret on all three targets BEFORE the first production deploy** — never deploy first and protect after. But a prerendering App Router build cannot deploy before the publish: `generateStaticParams` throws `IV-007 Site "<site>" does not exist` on the LIVE context until the site is published, so the first *successful* production deploy is the post-publish go-live one (a prior run, 2026-10-06). Order: (a) prove the gate on a local `next start` of the exact build to deploy, with the gate env loaded — anonymous `/`, `/robots.txt`, `/sitemap.xml` and a deep route → **401** + `X-Robots-Tag: noindex`; authenticated `/` → 200 + noindex meta; (b) publish (step 2); (c) the one `vercel --prod`; (d) assert the same 401s **on that deployment first**, before any other gate runs or the URL is shared. Any anonymous 200 is a `[BLOCKER]`. A pre-publish deploy that fails IV-007 never gets the alias, so it serves nothing.
4. **Deploy** `vercel --prod`, wait for terminal, capture the production URL.
5. **Record** `provisioning.delivery_surface` = `{ kind: "vercel", project, url, node_version, visibility }` (`visibility` = the resolved `delivery_visibility`) via `manifest-write.mjs`, so the precondition above resolves on the next run and `/ship` step 6 has something to assert.
6. **Only now are the live gates runnable** — § 6a link-crawl, § 6b robots, the media gate and the anonymous render check all need this URL. Re-run them; do not fold a previously-`N/A` gate into a green count without actually running it (rule `85`).

**This is an integration boundary.** First time through, run it attended and capture the real output — the CLI's project defaults are read from the repo, not from this document, and a wrong Root Directory or a preview context id both produce a *green build serving the wrong thing*.

## First-run boundary check

Splitting the LIVE-context redeploy + media gate out of `/ship` (which now deploys against **preview**) into `/publish` is a **real change to Sitecore deploy behavior** — treat the first live Content SDK run through this order as an **integration boundary** (operator working style): run it attended, capture the actual wire (publish job response, media-gate HTTP status, live-URL render), and confirm the preview-ship → live-publish split behaves as designed **before** trusting it for autonomous runs. Record the outcome in the publish report and, if anything diverges, a friction-log entry + a memory update.

## Validation

Before finishing, verify:
- The publish was **operator-confirmed** before it fired (step 1 YES recorded).
- The Publishing REST job reached a terminal **success** state; layout items + content + media were in scope.
- The authored items were **ser-pulled into the CM code base and committed** (git durability); `.sitecore/user.json` stayed gitignored.
- The editing host was re-deployed with `assert-eh-vars.mjs` at exit 0 (no Edge variable set on it), and Vercel was re-deployed on the **LIVE** context id (both `SITECORE_EDGE_CONTEXT_ID` and `NEXT_PUBLIC_…`); `check-edge-context.mjs` exited 0 over the three pulled Vercel targets.
- The **media gate** passed: `check-media-delivery.mjs` exit 0 (200 anonymous, unfollowed, `edge.sitecorecloud.io/…/media`), and the § 6a browser crawl reported no image failing to load.
- **OSR apps only (step 4a):** the revalidate controls passed **before** the OnUpdate webhook was created; `provisioning.edge_webhook` is recorded; the second-publish check showed the new marker with an unrelated page still `HIT`, or "OSR end-to-end unverified" is in `operator_attention[]`. Non-OSR apps record the redeploy as their freshness mechanism.
- The live URL resolves for an anonymous visitor (go-live smoke), recorded in `smoke_outcomes.publish`.
- **`/robots.txt` (6b) matched `delivery_visibility`.** `private`: anonymous 401, authenticated body contains `Disallow: /`, every page `noindex`. `public`: returned 200 and does not `Disallow: /` on the live domain — asserted anonymously, recorded in the publish report. An empty `RobotsContent` field serves a crawler-blocking document at a clean 200, so "the page loads fine" proves nothing here.
- **The live link-crawl (6a) ran and every internal link resolved** — anonymous (`public`) or authenticated through the gate (`private`), in a real browser after hydration, **no `curl -L`**. Record the link count checked and the pass/fail split in the publish report and in `smoke_outcomes.publish`. Any 404 is a `[BLOCKER]`; the run does not close with one open. A crawl that was skipped, curl-based, or run pre-hydration does **not** satisfy this — it is exactly the shape that produced false passes.
- **The site thumbnail (6c) was set from the live home page** — under either visibility, overlays dismissed, PNG inspected — and read back as `autogenerated: false`. A failure is recorded in `operator_attention[]`; it is not a blocker, but "skipped" is not an outcome.
- `stage_history` has a `published` entry; the publish report exists; the PR was updated (not re-created).

## Output rules

- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it above the report-path summary and the live-URL line. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "publish"`. Typical sources at `/publish`: a media gate that needed a context-fix + republish (concern), a publish job that partially failed (a `[BLOCKER]` decision), the first-run boundary check itself (concern — attended verification of the new ship/publish split), any content that would not render live after publish (concern).
- Report the publish job id + outcome, the ser-pull commit, the deploy ids, the media-gate result, the **link-crawl result (`N/N internal links resolved`)**, the **`/robots.txt` result**, and the **live URL**.
- **Operator gate — SOFT, with a `go_live`-conditional publish confirm.** The stage gate is soft (the run is complete after `/publish`). The **live publish in step 1 is a hard operator confirm when `scope_dial.gates.go_live` is on** (default; outward-facing boundary — never auto-fired); **when `go_live` is off** (`fully_autonomous` / operator-dropped) the publish fires **unattended** (except the first-run boundary check, which stays attended once). **Critical triggers that escalate the close to a hard stop regardless of `go_live`:** (a) the publish job failed or partially failed; (b) the media gate could not reach 200 anonymous; (c) the live site does not resolve for an anonymous visitor, **or the 6a link-crawl found any internal 404** (invisible on preview by construction — it can only surface here); (d) **the 6b `/robots.txt` gate failed** — under `public`, a non-200 or a body containing `Disallow: /` means the site is live but excluded from search; under `private`, an anonymous 200 or an authenticated body without `Disallow: /` means a private site is one step from being indexed; (e) any `[BLOCKER]`-tagged Operator Checkpoint item. When triggered, end with: *"STOP — `<reason>`. The site is not cleanly live; address `<action>` before considering the run published."* A clean run ends with the live URL and *"This run is fully shipped and live."*
