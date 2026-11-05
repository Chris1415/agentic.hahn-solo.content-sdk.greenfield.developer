# Authoring baseline — SitecoreAI CM solution

The reference **SCS authoring solution** copied into a project's CM code base when a run
provisions a **NEW CM**. There is no CLI scaffold for this half (the head app has
`create-content-sdk-app`; the authoring solution does not), which is why it lives here as a
template rather than being generated.

**Consumed by:** `/discover-sitecoreai` (NEW CM — creates `<project_root>/cm/`) and
`/provision-sitecoreai` (fallback when discover was skipped).

---

## Copying it

```sh
cp -r .agent/packs/platform/content-sdk/templates/authoring-baseline/. <project_root>/cm/
```

**The trailing `/.` is load-bearing.** This template has `.config/` and `.sitecore/` at its root;
a glob (`authoring-baseline/*`) silently skips both and the SCS config never arrives. Same trap
already documented for `project-planning-seed` (`02-create-prd.md` § 10a-4).

---

## Tokens to replace

| Token | Becomes | Appears in |
|-------|---------|------------|
| `<EDITING_HOST_NAME>` | the editing-host name | `xmcloud.build.json` → `renderingHosts.<key>` |
| `<SITE_NAME>` | the site / head-app name | `xmcloud.build.json` → `renderingHosts.<key>.path`; `example.module.json` → `site.path` |
| `<SITE_COLLECTION_NAME>` | the site collection name | `xmcloud.build.json` → `postActions.actions.scsModules.modules`; `example.module.json` → `namespace` + every include path |

**`<EDITING_HOST_NAME>` is a three-way-matched identifier.** The same string must appear in all
three places or the deploy cannot bind the rendering host, and Pages renders every component as
"missing" while the live head app looks fine (editor-only trap — `/provision-sitecoreai` § 7d):

```
xmcloud.build.json  →  renderingHosts.<key>
CLI                 →  dotnet sitecore cloud editinghost create -n <name>
Sitecore item       →  <COLLECTION>/<SITE>/Settings/Site Grouping/<SITE> → RenderingHost field
```

`jssDeploymentSecret` is **not** a token — it is the known-working value, carried verbatim and
also quoted in `/provision-sitecoreai` § 4. Leave it alone.

---

## Serialization completeness (`example.module.json`)

**The site include opts subtrees OUT, never in.** It defaults to `ItemAndDescendants` and carries
no `*: Ignored` rule, so anything an author adds under the site is serialized without a config
change. Add a `rules[]` entry only to change a subtree's **push policy** — never to make a subtree
visible, because the entry you forget to add is the content you silently lose.

This inverted the older shape, which listed six subtrees and ignored the rest. Measured on the
shared CM (2026-08-12), that shape cost:

- **`/home` pinned to `SingleItem`** — a brand seeded from this template serialized the home item
  and **none of its pages**. Every live brand had been hand-corrected to `ItemAndDescendants`,
  so the defect survived in the template while looking fixed everywhere it mattered.
- **`/Media` and `/Settings` under-scoped** (`SingleItem` / `ItemAndChildren`), dropping
  grandchildren — one site's `Settings/Booking Funnel` has seven `Funnel Step` children that only
  survive because that brand had been widened by hand.

Push policy, applied per include:

| Class | Operations | Why |
|-------|-----------|-----|
| Dev items — settings, templates, branches, renderings, placeholder settings, `/Presentation` | `CreateUpdateAndDelete` | A removed template or rendering must disappear on the target. |
| Content + media — the site tree, `/sitecore/Media Library/Project/<Collection>` | `CreateAndUpdate` | A push must never delete an authored page, datasource or image. |
| Environment-coupled — `/Settings/Site Grouping` | `CreateOnly` | Carries THIS tenant's hostnames. Lands once on a fresh target and is never overwritten. |
| Media `/<Site>/System` — capped at `ItemAndChildren` | `CreateAndUpdate` | The platform writes a new item for every auto-captured page/site thumbnail under `System/<h>/<h>/<h>/<h>/`, and they were being committed as base64 blobs (632 files, ~14 MB, removed 2026-09-28). The cap keeps the custom dashboard card `System/thumbnail_<siteId>` (`/publish` step 6c) and drops the auto-captures. |

**Rendering hosts are NOT serialized — at any scope, any push policy.** A
`/sitecore/system/Settings/Services/Rendering Hosts/<name>` item holds three absolute editing-host
URLs belonging to one tenant, so committing one puts environment state in git. `CreateOnly` was
tried and does not mitigate it: on a fresh instance it still *creates* the item with the dead URLs
and then refuses to correct them (observed 2026-08-13 — a new tenant inherited a foreign
org's `-eh` host verbatim). The binding is environment state and is set at provisioning:
`/provision-sitecoreai` § 7d writes the site-grouping `RenderingHost` field, which names the host
by **string**, so no serialized host item is needed for a target instance to bind correctly.

`cm/scripts/assert-module-scope.mjs` enforces the scope boundary before any push: includes must
sit under the collection's prefixes, no include may claim anything under
`/sitecore/system/Settings/Services/Rendering Hosts`, and an off-convention root must be
declared in that module as `"//allowedExtraPaths": [...]` with the reason beside it. Path matching
is case-insensitive — Sitecore resolves paths that way, and a case-sensitive comparison had made
`audit-sitecore-schema.mjs` report zero items for an entire brand.

---

## Two supported topologies

The template ships in **topology B** shape. Topology A is what the commands transform it into. The
operator picks one per repo at intake (`repo_topology`); **neither is legacy**.

| | **A — repo per deployable** *(default)* | **B — monorepo** |
|---|---|---|
| Repos | `cm/` + one per head app | one repo, rooted at `cm/` |
| Head app lives | sibling of `cm/` under `<project_root>` | `sites/<head-app>/` inside this solution |
| Branches | `prd-NNN` (separate repos can't collide) | `<head-app>/prd-NNN` (they share one repo) |
| `cm_code_base` | `<project_root>/cm` | `<project_root>/cm` — unchanged, which is why the monorepo is rooted here |
| `renderingHosts` (CM file) | emptied → `{}` | keeps its entry |
| `renderingHosts[].path` | n/a in the CM file | `"./sites/<SITE_NAME>"` (as shipped) |
| Head-app `xmcloud.build.json` | separate file at head-app root, `path: "./"` | none — one file covers both |
| `authoringPath` | `"./authoring"` (CM file) | `"./authoring"` (same file as renderingHosts) |

**Topology A transform** (what `/discover-sitecoreai` does when the run chose `repo-per-deployable`): overwrite this file with
`../xmcloud-build/cm-only.xmcloud.build.json`, and give the head app its own
`xmcloud.build.json` copied from `../xmcloud-build/editing-host.xmcloud.build.json`. **Copy those
templates — do not derive a shape from this file by hand.** Deriving is what produced two
disagreeing `nodeVersion` values across nine head apps; the blueprint
(`../xmcloud-build/README.md`) is now the single source of truth for every shape this pack emits.

**Topology B** keeps this file as shipped: token-replace and leave both `renderingHosts` and
`authoringPath` in place. `sites/` is preserved in the template (`sites/.gitkeep`) precisely so
this stays available.

> **Status: both are selectable (2026-08-31).** `pack.repo_topology` carries the choice as
> `{ default, values, variants }`, `/create-prd`'s discovery grill **asks it at intake**, and the
> run records `repo_topology`. Every stage then resolves its brief with `--topology <value>` and
> gets `workspace` + `repo_setup` already merged for that answer — **no stage branches on the
> topology itself**. A → this file is overwritten by `../xmcloud-build/cm-only.xmcloud.build.json`;
> B → this file is kept as shipped. Closes BACKLOG item 22, which had recorded B as *buildable and
> unreachable*: the key existed, both packs declared the string `repo-per-deployable`, and no stage
> could ever resolve a second value.

---

## Also done per copy

- **Disable the Project serialization module** for the initial deploy:
  `authoring/items/example.module.json` → `.disabled`
- **Verify `nuget.config`** carries the Sitecore feed
- `authoring/items/items/` is an empty SCS output directory — git does not track empty
  directories, so it is absent from this template and recreated by the CLI on first pull

---

## Pinned versions — bump deliberately

These are frozen in the template and **will drift**. Rule `50-scaffold.mdc` prohibits hand-writing
pinned config from training data for exactly this reason; the authoring half has no canonical
scaffold command, so the pins live here instead — recorded so a bump is a visible one-line diff
rather than a silent copy.

| What | Version | Where |
|------|---------|-------|
| `Sitecore.DevEx.Extensibility.Serialization` | `6.0.23` | `sitecore.json` → `plugins` |
| `Sitecore.DevEx.Extensibility.Publishing` | `6.0.23` | `sitecore.json` → `plugins` |
| `Sitecore.DevEx.Extensibility.Indexing` | `6.0.23` | `sitecore.json` → `plugins` |
| `Sitecore.DevEx.Extensibility.ResourcePackage` | `6.0.23` | `sitecore.json` → `plugins` |
| `Sitecore.DevEx.Extensibility.XMCloud` | `1.1.120` | `sitecore.json` → `plugins` |
| Sitecore CLI | see `.config/dotnet-tools.json` | `.config/dotnet-tools.json` |
| Node (rendering host build) | see the blueprint | `../xmcloud-build/README.md` § 4 — pinned once, asserted across all three templates |

**Before bumping:** check whether `dotnet sitecore init` + `dotnet sitecore plugin add` now
generate the `sitecore.json` / `.sitecore/schemas/` half at current versions. If they do, those
5 files should be generated per project instead of frozen here, and only the `authoring/` .NET
solution stays a template. That probe is tracked in `.agent/BACKLOG.md`.

---

## Provenance

Derived from the SitecoreAI starter's authoring half. Previously carried on an absolute machine path
outside the repo, referenced from `13-devops-engineer.md`,
`/discover-sitecoreai` and `/provision-sitecoreai` — moved here 2026-08-11, closing WS-B/B1 of
`.agent/framework-decoupling-plan.md`.

The `renderingHosts` key shipped as the literal `solo-website` (the SitecoreAI Starter site name that
root `CLAUDE.md` warns against cloning) and is now the `<EDITING_HOST_NAME>` token — it never
survives either topology, and a plausible-looking real name invites leaving it in place.
