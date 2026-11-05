---
name: discover-components
intent: discovery
writes:
  - products/<product-slug>/project-planning/components-information/component-map.md
  - products/<product-slug>/project-planning/components-information/images/<component>[-<variant>].png
  - (live tenant, transient) /sitecore/content/<collection>/<site>/Home/Components Preview/** (per-component subpages; reused from the build phase if present, else built here; kept or torn down per the close gate)
depends_on:
  - .agent/packs/platform/content-sdk/agents/14-content-author.md
  - .agent/commands/project/product-workspace.md
---

# /discover-components — generate a visual Components Map for the Content Author

## What this is

An **optional, upfront discovery step** for the **Content Author (14)** working in a Sitecore site. It produces a persistent **Components Map** — every component's purpose, fields, **variants**, and **how it looks** (a real screenshot) — so the Content Author can decide *when to use which component and which variant* from a content AND a visual/structural point of view. The map is the **preferred input** for `sitecoreai-content-composition` (which falls back to its lightweight inline inventory when the map is absent).

Uses the established variant model + Playwright preview-render capture pattern. Reuses `sitecoreai-content-composition` (the Marketer-MCP write recipe + gotchas) and the Marketer MCP + Playwright.

## Pipeline position (Content SDK)

In the Content SDK branch the content phase runs **after `/ship`**: `/ship → **/discover-components** → /author-content ⇄ /test-content → /publish`. It is the **first step of the content phase** and still optional/on-demand (the Components Map is the preferred input for `/author-content`). Everything here works against **preview** (unpublished content renders in preview — no publish needed); the single global publish is the final `/publish` step (`.agent/glossary.md` § "Preview-first delivery").

**Gated on `scope_dial.content_authoring`.** The content phase (this command + `/author-content` ⇄ `/test-content` + `/publish`) runs only when `content_authoring != no` — `auto` (default) on a content-sdk run, or `yes`. When `content_authoring == no`, the run is terminal at `/ship`; do not run the content phase in-pipeline (this command is still available on-demand for a standalone Components Map).

## Entry gate — editing-host freshness (HARD, in-pipeline runs)

**This command's entire output is a VISUAL map — screenshots of components rendering.** If the editing host is not serving this run's code, every screenshot captures the *previous* deployment and the map is confidently wrong. That is worse than no map: `/author-content` treats it as the preferred input and composes against it.

The failure is silent and asymmetric — the **local build and Vercel can both look perfect while Pages serves the bare scaffold**, because they are different deploy surfaces. An editing host deployed once at provisioning and never redeployed has been observed **69 commits behind** with nothing visibly wrong anywhere else.

**Before capturing anything, assert:**

1. The run's code is **merged** to the branch the editing host builds (normally `main`) — a pushed-but-unmerged branch rebuilds the old commit.
2. The editing host was **deployed since that merge** — `provisioning.editing_host.deployed_sha` in the run manifest (written by `/ship` step 4a) contains this run's work.
3. **The newest deployment's `commitId` equals `git rev-parse origin/main`** — a direct equality against a first-class field on the deployment record, not an inference. A green deployment status alone does not prove the right commit built. Fall back to "deployment started after the merge timestamp" only when `commitId` is absent (manually-triggered deployments), and say which one you used. **Do NOT try to prove this by fetching a page and grepping the markup:** the editing-host URL **403s** unauthenticated and `/api/editing/render` **302s into the OIDC login** even with the correct secret. The deployment record is the only assertion available to an agent.
   - ⚠️ **Filter `GET /api/deployments/v1?environmentId=…` yourself** — the endpoint accepts the parameter and ignores it (measured 2026-08-27, a query scoped to one site returned 10 records of which only 4 were that site's). Keep only `d.environmentId === <ehEnvId>` before taking the newest, or you may assert freshness against a sibling brand's deployment.

**Any failure ⇒ STOP, do not capture.** Surface as a `[BLOCKER]`: *"Editing host is stale — the Components Map would screenshot the previous deployment. Run `/ship` step 4a to deploy it (or re-link it if it is upload-mode) first."*

Skip this gate for a standalone on-demand map against an already-live site the operator names explicitly.

## Output

```
products/<product-slug>/project-planning/components-information/
  component-map.md          # one block per component (durable, text-self-sufficient)
  images/<component>.png    # one screenshot per component (and per variant); LOCAL — *.png is gitignored, regenerable
```

The map is **self-sufficient in words** (look-and-feel described) so it survives a fresh clone where the images aren't present; images are the enrichment.

## Step 0 — Permission gate (mandatory, first)

`/discover-components` **mutates the live tenant** (it builds — or, on a pipeline run, reuses — a **Components Preview** page tree with demo content). **Ask the operator for permission before any write**, naming the site + that it will create/reuse preview pages under Home. No permission → stop.

## Step 0 — Credential pre-flight (before the first live call)

Run the pack's **`stages.implement.preflight_credentials`** pass (`.agent/packs/platform/content-sdk/pack.json`) — every `checks[]` entry in one pass, applying each stated `remedy`. It is declared under `implement` only because that is where it was first written; its `applies_to` names this stage. **`go_live`-class: it runs regardless of the gate set**, because a blocked credential is a genuine blocker, not a review stop.

Re-run it whenever this stage **resumes after a gap** — the Marketer MCP token expires inside a long run, and discovering that mid-capture costs the capture. Never work around a dead credential silently: flag it for rotation.

## Step 1 — Inventory the palette

Per `sitecoreai-content-composition` § Inventory:
- `list_sites` → site id; `get_all_pages_by_site` → page tree; `get_components_on_page` on representative pages → rendering IDs + ComponentQuery (datasource + child field names).
- For each component: `get_component(id)` → datasource template + fields; for child-bearing ones, read a sample datasource (`get_content_item_by_path …/Data/<Component>`) → child template ID + fields.
- **Variants:** read `…/Presentation/Headless Variants/<Component>` → its `Variant Definition` children are the variants (name + id). A component instance's `FieldNames` param selects a variant; empty = default. Components with no grouping are single-variant.
- Classify each component: **content** (Hero, RichText, ValueProps, …) vs **structural / Page Structure** (Container, Column Splitter, Row Splitter, NewsContainer — they expose their own placeholders).

🔴 **The LIVE tenant is the only sanctioned grounding — never a serialized snapshot.** Every read above goes to the tenant on purpose. `cm/authoring/items/**` is a **point-in-time copy** that is only as fresh as the last `ser pull`, and the map describes what is live. On a prior run the map was supplemented from serialized YAML captured *before* a Multilist separator fix, so it faithfully documented the bug and would have taught `/author-content` to re-introduce it across four fields.

**If the Marketer MCP is unavailable, the sanctioned fallback is Authoring GraphQL against the same tenant** (`cm/scripts/agql-token.mjs` → `clientFor(<org>)`), **not** the serialized repo and **not** training-data assumptions about the component set. If neither live path is reachable, **STOP and report** — a map is a durable artifact that downstream stages trust, so producing one from an unverifiable source is worse than producing none. Record the grounding source and its timestamp in the map's header so a reader can tell what it was derived from.

⚠️ A serialized snapshot cannot even reveal this class of defect: SCS writes a *correct* pipe-separated Multilist as one GUID per line, so the on-disk form is identical whether the stored value is right or wrong. Only the live field value distinguishes them.

## Step 2 — Build (or reuse) the "Components Preview" page tree

> **Reuse the build-phase tree when it exists.** On a Content SDK **pipeline** run, `/implement` already built a `Components Preview` tree (one subpage per component, all variants — rule `80-content-sdk-headapp.mdc` § 0b) as the components landed. This is the **same tree** — do NOT create a second one. Idempotently **skip-if-exists** per subpage: reuse existing component subpages, add only any that are missing, then go straight to capture (Step 3). Build the tree from scratch only on a **standalone / on-demand** run where no build-phase tree is present.

> **Build the real tree — even when it feels redundant at small scale.** Do NOT substitute crops of an existing page (e.g. Home) for the isolation pages. The isolation IS the point: one component alone shows its **true default/empty state**, surfaces components that aren't on any existing page, and renders **header/footer-placeholder** components in their real position — none of which a shared render reliably shows. It also proves the process works at the scale you'll actually need it; a shortcut here defeats the reason the step exists — even on a small palette (~10 components), build the isolation tree deliberately rather than cropping an existing page.
>
> **Use the Marketer MCP for the writes** — `create_page` + `add_component_on_page` (attended runs re-auth on 403; the durable REST twin `agent.mjs` is for *unattended* batches only — do not fall back to it just to save your own round-trips). Sibling test pages have no cross-page order dependency, so `create_page` / `add_component_on_page` can be **batched in parallel**; only a single component's *list children* (datasource children) must be created sequentially, each with an explicit, distinct `__Sortorder` — creation order is not sort order (`sitecoreai-content-composition` § Gotchas).

Under Home, create a **`Components Preview`** page; under it, **one subpage per component** (idempotent — skip a subpage that already exists). On each component's subpage, compose **all of that component's variants** (labelled — every variant visible in one scroll, so the operator's end-of-build review reads as one-component-per-page):
- **Content component:** add it (`add_component_on_page`, placeholder `/headless-main`), author **demo content** for all fields; for list components create child items **sequentially, each with an explicit, distinct `__Sortorder`** (100, 200, …) — rows with an empty or equal value resolve in item-NAME order (measured 2026-10-11: two preview grids rendered alphabetically). For a **multi-variant** component, render each variant by **setting `parameters.FieldNames` via the Pages API** (`GET /state?withLayout=true` → set the variant item GUID on the rendering → `POST /layout`) — the Marketer MCP CANNOT set a Headless variant (`set_component_variant` is A/B / personalization). One rendering **instance per variant, stacked on the component's subpage**. See `sitecoreai-content-composition` § Variants.
- **Structural component:** add it, then **fill its inner placeholder(s)** with a couple of sample child components (`get_allowed_comps_by_ph` → pick allowed → add with demo content) so the screenshot shows the structure doing its job — never an empty box.
- **Header / footer-placeholder component** (announcement bar, promo strip, site footer): place it in its **real** placeholder (`/headless-header` / `/headless-footer`), NOT `/headless-main`. Its isolation page's **main canvas will look empty** in the Pages editor (the component renders in the header/footer band, outside the editable main area) — that is expected, NOT a missing component. The **rendered screenshot is the proof**, and the map block must name the placeholder so no one mistakes the empty canvas for absence (e.g. a promo strip in `/headless-header` with an empty-looking main canvas in Pages).
- **Emoji:** BMP symbols only in plain-text fields; HTML hex entities in HTML fields (`sitecoreai-content-composition` § Gotchas).

## Step 3 — Capture (Playwright → preview render → disk)

Per page: navigate Playwright to the page's preview render → `browser_resize` (1440×1024) → `browser_take_screenshot` (fullPage, `filename = images/<component>[-<variant>].png`). Preview shows unpublished content — no publish needed.

- **Render target — prefer the LOCAL dev server.** The cloud editing-host preview URL (`get_page_preview_url`) requires an **authenticated browser session**; an unauthenticated Playwright hits a login redirect. Run the head app locally (`npm run dev`, which reads **Preview** Edge) and navigate to `http://localhost:3000<route>`. Get the exact `<route>` from the preview URL's `route=` query param (e.g. `/Components-Preview/HeroBanner`) — item names map to path segments (space → `-`, casing preserved).
- **Scale note:** capture is `N × (navigate + screenshot)` calls — fine at ~10 components, call-heavy for a large palette. For big palettes add a batch helper (feed N routes → N files in one pass) rather than hand-driving each.
- **After a variant flip, bust the render cache / wait before capturing** — the editing-render endpoint caches, so a freshly-set `FieldNames` may not show immediately.

## Step 4 — Write `component-map.md`

One block per component: **rendering ID · kind (content/structural, flat/list) · use-when · look&feel (described) · variants (name+id, or "single") · datasource fields (name+type) · child template+fields · authoring notes · `![](images/<component>.png)`**. (See the probe slice already at `components-information/component-map.md` for the exact format.)

## Step 5 — Close gate — keep or teardown (operator, every run)

The "Components Preview" tree is scaffolding. **Ask the operator**: keep it as a living styleguide (re-screenshottable — and the surface the operator already reviewed at the build gate) or tear it down (`delete_content`) now that the map + images are saved. Honor the choice. Default policy: **ask each run** whether to keep or tear down.

## Validation

- Permission gate answered before any tenant write.
- `component-map.md` exists with one block per discovered component; each block's look&feel is described in words (not image-only) and references its image.
- Each `images/<component>.png` exists and renders the component (structural ones non-empty — placeholder filled).
- List-component demo children carry distinct `__Sortorder` values and the **rendered** order matches the intended order; emoji BMP-safe.
- Close gate (keep/teardown) was offered.
- **`stage_history` entry appended** — `{ stage: "components_discovered", agent: "07-qa-specialist", outcome: "completed" | "partial", one_line: "<n> components mapped + captured; tree <kept|torn down>", deliverables: [<component-map.md>, <image paths>] }`, plus the other seven schema-7 fields (`.agent/manifests/README.md` § "Stage history"). `components_discovered` is the canonical name; this stage prescribed none until 2026-09-02.

## Output rules

- **Begin with an Operator Checkpoint** (Decisions / Assumptions / Concerns / Open questions); mirror non-empty items into `operator_attention[]` with `stage: "discover-components"`.
- **Operator gate — SOFT**, except the **Step 0 permission gate** and the **Step 5 keep/teardown gate**, which are hard stops.
- Recommended next: `/author-content` for the site (it now has the Components Map as input).
- Don't leave screenshots at the repo root (Playwright's default) — move them into `images/`. Images are local/regenerable; the map is the committed-text record.
