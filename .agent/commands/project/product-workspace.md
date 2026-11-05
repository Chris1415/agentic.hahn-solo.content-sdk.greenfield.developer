# Product workspace (mandatory for all project commands)

All **project** planning and execution artifacts for a product live under the product's directory `<PR>` (resolved in § 1b — products are grouped under `products/<group>/<slug>/`):

`<PR>/project-planning/`   e.g. `products/marketplace/my-app/project-planning/`

Commands refer to paths like `project-planning/plans/prime.md`; that always means:

`<PR>/project-planning/plans/prime.md`

(relative to the repository root; `<PR>` = the resolved product directory, group bucket included).

---

## 1a. Resolve the products ROOT — `products/` is a mount point, not a directory

**`products/` is a LOGICAL MOUNT POINT.** Every stored path (`product_root`, `project_root`, `cm_code_base`, every `canonical_artifacts` entry) and every doc/command reference keeps saying `products/<group>/<slug>` **verbatim** — that is the portable form, and it does not change when the root moves. What changes is only where that prefix lands on disk.

**Resolution order — first hit wins:**

| Priority | Source |
|----------|--------|
| 1 | `AGENTIC_PRODUCTS_ROOT` (environment variable — per-shell override) |
| 2 | `.agent/workspace.json` → `{ "products_root": "…" }` — **gitignored**: a *machine* fact, not a repo fact |
| 3 | `<repo>/products` — the in-repo default |

A configured root may be absolute (`D:\shared\products`, `\\nas\agentic\products`), relative to the repo root (`../products-shared`), or `~`-prefixed. **A configured root that does not exist is an ERROR — never a silent fallback to the default**, because a silent fallback is indistinguishable from an empty workspace.

**Use the shared resolver; never re-derive the root by hand:**

```sh
node .agent/scripts/resolve-products-root.mjs                              # absolute root
node .agent/scripts/resolve-products-root.mjs --json                       # { root, source, external, exists, … }
node .agent/scripts/resolve-products-root.mjs --path products/personal/x   # logical → absolute
node .agent/scripts/resolve-products-root.mjs --to-logical <abs>           # absolute → logical (for storing)
```

PowerShell twin: `.agent/scripts/Resolve-ProductsRoot.ps1` (same flags as `-Path` / `-Json` / `-Check`; dot-source for `Get-ProductsRoot` / `Resolve-ProductsLogicalPath`). Node scripts import `resolveProductsRoot` / `resolveLogical` / `toLogical` from the `.mjs` directly.

**How an agent uses this, in one line:** run the resolver **once** at the start of a command, then for every file operation on a `products/…` path, use `<PRODUCTS_ROOT>/<rest>` instead. If the resolver reports `source: "default"` (the common case), the literal path already works and nothing changes.

**Three rules that keep this honest:**

1. **`products/_root/` is PINNED TO THE REPO.** It is not a product — it is *this* repo's own planning surface, and it is *tracked* (the explicit `.gitignore` exception). `products/_root/…` therefore always resolves under `<repo>/products/_root/…`, whatever the mount points at. The resolver enforces this; do not special-case it yourself. A `_root/` folder sitting inside an external root is never read.
2. **Store the LOGICAL path, resolve at read time.** Never write an absolute machine path into a manifest field that the schema declares logical (`product_root`, `canonical_artifacts.*`). A manifest must stay readable on a machine whose root differs — that is the whole point of the mount. The one sanctioned absolute mirror is `product_root_abs` / `products_root_abs` (§ 3), which is derived, per-machine, and rewritten on every touch.
3. **Slim-context agents resolve NOTHING.** Developer (08) loads `prd-minimal` + task breakdown only and never reads this file, so it must not be asked to resolve a mount. The orchestrator writes `product_root_abs` into the manifest and hands the Developer absolute paths. If you are a slim-context agent and you have only a logical path with no absolute counterpart, that is an **upstream gap** — escalate, do not guess.

**When the root is external** (`external: true`), also remember: the mount is outside the repo's git boundary, so `.gitignore`, `git status`, and repo-wide greps in this repo do **not** see it. Each product remains its own git repo exactly as before — that part is unchanged.

---

**The same file holds this machine's Sitecore facts** (never tracked, never exported): `sitecore_orgs` (label → `orgName` + `tenant`, what a minted token must name), `production_org` (a regex over the org as a manifest spells it), `default_org` and `default_cm`. Template: `.agent/workspace.example.json`. Absent, `assert-tenant.mjs` refuses any org the caller names no tenant for, and every named org reads as production.

## 1. Resolve `product_slug` (always do this first)

Use the **first** match:

| Priority | Source |
|----------|--------|
| a | User message contains `product=<slug>` or `product: <slug>` (case-insensitive key) |
| b | **First slash-argument** after the command name, **only if** it is a valid **slug** (see below) **and** it is **not** a file path: reject if it contains `/`, `\`, ends with `.md`, or matches an existing file path |
| c | **Stop** and ask once: *"Which product are we working on? (folder name under `products/`, e.g. `personal-website`). I will use the product's `project-planning/` for all planning artifacts."* — validate the answer and use it |

**Slug rules:** lowercase letters, digits, hyphens, and single dots (a dotted suffix such as `.acme`); `^[a-z0-9][a-z0-9.-]{0,62}[a-z0-9]$` or `^[a-z0-9]{1,64}$`. Reject `..`, leading/trailing `.`, empty. (For content-sdk this is the **head-app slug** — the scaffold dir name.)

**Project-slug rules (content-sdk project folder, § 1b-i):** space-free; letters (any case), digits, `-`, `.`, `_`; no spaces, no path separators; `^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$`. The verbatim Deploy project name (spaces/caps allowed, e.g. `Acme Site Collection`) is kept only in the manifest as `deploy_project_name`, never as a folder name.

If the user passes `products/foo` or `products/<group>/foo`, extract the **last** path segment as slug `foo`. For a content-sdk two-level path (`products/<group>/<project>/<head-app>` or `<project>/<head-app>`), the **last** segment is the **head-app slug** (the workspace) and the **second-to-last** is the **project slug**.

---

## 1b. Resolve the product directory (group buckets)

**Resolve the products root first (§ 1a).** Every `products/…` probe below is a *logical* path: check for existence at `<PRODUCTS_ROOT>/<rest>`, and record the result in its logical form.

Products are grouped one level deep under **`products/<group>/<slug>/`**. Known groups:

| Group | Holds |
|-------|-------|
| `marketplace` | Marketplace SDK apps (`@sitecore-marketplace-sdk/*`) |
| `head-application` | Content SDK head apps (`@sitecore-content-sdk/*`) |
| `personal` | personal apps/sites/tools |
| `_internal` | framework testbeds / scratch (not real products) |
| `throwaway` | **disposable pipeline runs** — exercising a composition, comparing two audiences on one prompt, a spike, a framework test. Never ships |

**`throwaway` carries rules the other buckets do not.** A throwaway run must **not** provision,
publish, or write to a live tenant, and never gets a git remote — if a stage wants to cross that
boundary, the run is already over. Delete any throwaway product at any time without checking who
depends on it; if deleting one would lose something, it belonged in a real bucket.

> **A platform whose `repo_setup.deployable_baseline` is unconditional cannot be fully satisfied
> here** — the bucket forbids the scaffold the baseline requires. Record the gap in
> `operator_attention[]` and continue; do **not** emit a `[BLOCKER]` for a constraint the bucket
> itself imposes. Two real runs closed with manufactured blockers before this was written.

> **The BUCKET wins the path; the platform's `workspace.layout` is advisory here** (2026-08-27).
> A platform may declare a fixed group folder — `content-sdk` declares
> `products/head-application/<project-slug>/<head-app-slug>` — which is irreconcilable with
> `products/throwaway/<slug>`. **The bucket wins**, because a bucket is a containment boundary and a
> platform cannot opt out of the sandbox it was placed in; a layout that could override it would
> make `throwaway` unenforceable exactly when it matters. Put `project-planning/` flat at the
> product root, record `workspace.layout_deviation` with the layout that was skipped and why, and
> continue.
>
> This is not an edge case: exercising a composition **is** what the bucket is for, so a
> content-sdk run lands here routinely. Before this rule the two contracts simply disagreed and
> nothing adjudicated — one verification run went flat, and another would plausibly have nested,
> with both looking correct.
>
> **The layout is advisory only inside `throwaway`.** In every real bucket the platform's
> `workspace.layout` is binding, because there the two-level shape carries meaning the flat one
> cannot express — one Deploy project, one CM, N head apps (§ 1b-i).

A product may still sit at the legacy flat `products/<slug>/` during migration. **Resolve the product directory `PR` as the first path that exists**, in order:

1. `products/*/*/<slug>` — **content-sdk two-level, `repo-per-deployable`** (group/project/head-app): the slug is a **head app** sibling of `cm/`. When this matches, `PR` = the head-app folder; the **project folder is its parent** (`project_root`), and the shared CM is `<project_root>/cm/`. See § 1b-i.
2. `products/*/*/cm/sites/<slug>` — **content-sdk two-level, `monorepo`**: the slug is a head app **inside** the CM repo. `PR` = that folder; `project_root` = the great-grandparent (`products/<group>/<project>`), and `cm_code_base` = `<project_root>/cm` — the same value as under `repo-per-deployable`, which is the point of rooting the monorepo at `cm/`. See § 1b-i.
3. `products/<group>/<slug>` — scan each known group (glob `products/*/<slug>`). Marketplace/personal products, plus **legacy flat** content-sdk products (cm/ + head app + planning all under one folder).
4. `products/<slug>` — legacy flat / not-yet-grouped.

**Probe 1 and 2 in that order, and do not stop at the first *directory* — stop at the first that holds a `project-planning/`.** Under `monorepo` an operator may also have a stray same-named folder at the sibling position; the workspace is the one with the planning in it. When neither has planning, this is a new product and § 1b-i's placement rules apply.

The discovered path becomes `PR`. **Everything downstream — `PP`, `product_root`, and every `canonical_artifacts` path — is relative to the discovered `PR`, not a hard-coded `products/<slug>`.** For a content-sdk two-level match, also derive `project_root` = the parent of `PR` and `project_slug` = that parent's folder name (§ 3). When creating a brand-new product (no path exists yet), place it under the group matching its kind (Marketplace SDK → `marketplace`; Content SDK head app → `head-application`, inside a `<project-slug>/` project folder per § 1b-i); ask if ambiguous. Do not invent new top-level group folders without operator confirmation.

**Disambiguation:** if a bare slug matches at more than one depth (rare — a head-app slug equal to a flat product slug), prefer the explicit form the operator passes: `products/<group>/<project>/<head-app>` or `<project>/<head-app>` selects the two-level head app; a single segment selects the flat product.

---

## 1b-i. Content SDK layout — project folder = Deploy project = 1 CM, hosting N head apps

A product whose platform declares the two-level topology in `repo_setup.topology` (today: Content SDK) is organised in **two levels** so the folder tree mirrors the cloud reality: **one Deploy project ↔ one CM ↔ many editing hosts (head apps)**. The project folder is the explicit, named layer that ties every head app to its CM server.

**Two repo topologies, both current, chosen by the operator at intake** (`pack.repo_topology`, recorded as `repo_topology` in the manifest — `/create-prd` asks it in the discovery grill as its own **STORAGE** question: *"where does the head app live, relative to that CM — inside it at `cm/sites/`, or beside it?"*). The two-level shape above is the same in both; what differs is **where the head app sits and how many git repos there are**.

**It is asked SECOND, right after the AUTHORING question, and independently of it** (corrected 2026-09-01). It used to be described as asked "alongside the deploy-project and head-app names", and it was: a naming question that smuggled in *new-vs-reuse authoring*, followed by a topology question phrased as a git concern. Two malformed questions over three orthogonal decisions — **authoring** (create a CM or reuse one), **storage** (inside the CM or beside it), and **content model** (own brand namespace, or reuse/fork an existing brand's). All four authoring × storage combinations are valid, and an operator can legitimately answer authoring and content-model in *opposite* directions — reuse the CM, author an own namespace inside it. Measured the same day: a run's folder question offered three options that all spelled `<project>/<head-app>/`, so `cm/sites/` was unofferable and the operator had to **reject** the question rather than answer it. A question whose option set spells only one layout has already answered itself.

**A — `repo-per-deployable`** *(the default)* — the head app is a **sibling of `cm/`**:

```
products/<group>/<project-slug>/     <- the PROJECT folder = ONE Deploy project = ONE CM (untracked container)
  cm/                                  shared CM (authoring) code base — its OWN repo; CM deploy + ser-pull target
  <head-app-slug>/                     a head app (editing host) = the WORKSPACE (PR) for ONE pipeline run; its OWN repo
    project-planning/                    its OWN planning + manifest (workflow/current-run.json)
    src/ … (scaffolded App Router app)   own xmcloud.build.json (path ./)
  <head-app-slug-2>/                   another head app on the SAME CM (sibling, another repo)
    project-planning/
    src/ …
```

**B — `monorepo`** — the head app lives **inside** the CM solution at `sites/`, and `cm/` is the one git repo:

```
products/<group>/<project-slug>/     <- the PROJECT folder (still an untracked container)
  cm/                                <- ONE git repo spanning everything below
    authoring/                         the CM / SCS solution
    sites/<head-app-slug>/             a head app = the WORKSPACE (PR) for ONE pipeline run
      project-planning/                  still its OWN planning + manifest — two head apps never collide
      src/ … (scaffolded App Router app)
    sites/<head-app-slug-2>/           another head app on the SAME CM, in the SAME repo
      project-planning/
      src/ …
    xmcloud.build.json                 ONE descriptor: authoringPath ./authoring + renderingHosts[].path ./sites/<name>
```

**`cm_code_base` is `<project_root>/cm` in BOTH** — that is why the monorepo is rooted at `cm/` rather than at the project folder. Every stage that reads the CM (`ser pull`, the schema audit, the serialization modules, `/publish`) is unchanged by the topology; only the head app moves.

**Neither shape is legacy.** B is what `.agent/packs/platform/content-sdk/templates/authoring-baseline/` ships in (`authoring/` + `sites/.gitkeep` + a root descriptor) and what Sitecore's own `xmcloud-starter-js` uses; A is what the commands transform it into. Until 2026-08-31 the choice was expressible in `pack.json` and unreachable from any stage, and three places here called B *legacy* — which it is not.

- **The project folder** (`<project-slug>`) is named after the **Deploy project**, and is **space-free** — letters/digits/`-`/`.`/`_`, any case; **no spaces** (they break `npx create-content-sdk-app` + `dotnet sitecore` and force quoting in every path). The **verbatim** Deploy project name (which may contain spaces/caps, e.g. `Acme Site Collection`) is preserved in each head app's manifest as `deploy_project_name`. This folder is the unit that owns the CM; every head app inside it is bound to that one CM server.
- **`cm/`** lives at the **project level** (sibling of the head apps), shared by all of them. It exists only for a **NEW** CM (created by `/discover-sitecoreai` as a baseline copy; deployed by `/provision-sitecoreai`). For an **EXISTING** CM there is **no `cm/`** — the CM code base is the operator's existing path, reused in place. A CM env is 1:1 with a CM code base.
- **Each head app is its own workspace `PR`**: its `project-planning/` (specs, ADRs, plans, `workflow/current-run.json`) lives **inside the head-app folder**, NOT at the project level. Two head apps on one CM are two independent pipeline runs whose planning never collides.
- Head apps are each a `<head-app-slug>` (lowercase-hyphen, tooling-safe scaffold dir), placed by the run's topology: **siblings of `cm/`** under `repo-per-deployable`, or **under `cm/sites/`** under `monorepo`. Never directly under `products/`, and never in `site/`.
- **Legacy tolerance:** older content-sdk products are flat — `products/<group>/<slug>/` with `project-planning/` + `cm/` + a head app all under one product folder. Those still resolve (§ 1b). Migrating to the two-level layout is operator-driven (create a `<project-slug>` folder; move `cm/` + the head apps under it; move each head app's planning into the head-app folder); the framework adjusts paths on touch. **A `sites/<name>/` nesting is NOT legacy** — under `monorepo` it is the current, chosen shape; only a *flat* product (no project folder) is.

**Git topology — the run's `repo_topology` decides it.** The `<project-slug>/` project folder is an **untracked container** in both, NOT a git repo.

**A — `repo-per-deployable`:** each deployable inside it is its own repo, mapping 1:1 to a SitecoreAI Deploy deployable and to a build-flow track:

```
products/head-application/<project-slug>/   untracked container (no .git) + a README mapping the repos
  cm/        → git repo  — CM / authoring solution (CMS track; ser-pull target; CM deploy)         [NEW CM only]
  <head-app-slug>/  → git repo  — head app / editing host (head-app track; deployable) + its project-planning/
  <head-app-slug-2>/ → git repo  — sibling head app on the same CM (independent repo)
```

- **`cm/` is its own repo** — created only for a **NEW** CM (when `cm/` is scaffolded by `/discover-sitecoreai` / `/provision-sitecoreai`). For an **EXISTING** CM there is no `cm/` and no new repo — the operator's existing authoring solution repo is reused in place; the new editing host just *connects* to that CM env.
- **Each head app is its own repo**, rooted at the head-app folder (its `project-planning/` lives inside it, so the repo spans planning + the scaffolded editing host). `git init` happens at the **head-app folder**, never the project folder. Branches stay `prd-NNN`/`frd-NNN`/`bug-NNN` (no head-app-slug prefix — separate repos can't collide).
**B — `monorepo`:** one repo at `cm/`, spanning the authoring solution and every head app:

```
products/head-application/<project-slug>/   untracked container (no .git) + a README mapping the repo
  cm/  → THE git repo — authoring solution + every head app + ONE xmcloud.build.json
    authoring/                    CM / SCS solution (CMS track; ser-pull target; CM deploy)
    sites/<head-app-slug>/        head app / editing host (head-app track; deployable) + its project-planning/
    sites/<head-app-slug-2>/      sibling head app — SAME repo
```

- **`cm/` is the only repo.** Both cloud environments — the CM env and each editing host — link to it and read its one root `xmcloud.build.json`, which carries `authoringPath: ./authoring` **and** a `renderingHosts` entry per head app with `path: ./sites/<name>`. **A head app gets no descriptor of its own**; two files declaring the same `renderingHosts` key is what the blueprint's § 3 invariant 3 forbids.
- `git init` happens at **`cm/`**, never at a head-app folder — a nested repo there leaves the whole CM half untracked while both environments deploy from it. Assert `git rev-parse --show-toplevel` **from inside the head-app folder returns `…/cm`**.
- **Branches are PREFIXED** — `<head-app-slug>/prd-NNN` — from the first head app onward, because N head apps share one repo and a second app's `prd-001` would collide. Every branch pattern (stacked detection, `/ship`) carries the prefix, which is also what keeps a sibling head app's in-flight branch out of this run's scan.
- **EXISTING CM:** the repo is the operator's and already exists. The head app is scaffolded into their `sites/`, the root descriptor is **edited in place** (never overwritten from a template — their `postActions`/`scsModules` would be destroyed), no `git init` and no remote question run, and the baseline commit lands in a repo this framework did not create — surface that at the Operator Checkpoint before making it, and never force-push or rewrite their history.

**Both topologies:**

- **`<project-slug>/README.md`** (in the untracked container) is the durable map of the topology: Deploy project name + which topology this project uses + the CM repo (own/external) + every head-app repo *or* the one monorepo + the folder→repo→deployable mapping + clone/recreate steps. It is the only persistent index of the shape (the container itself is gitignored from the agentic parent) — and under `monorepo` it is the only place a reader learns that `sites/` is deliberate rather than an accident.
- The **`repo_topology`** manifest field is the authority for the run. It is asked **once per repo, at first-time repo setup**, and every later run in that workspace inherits it. Where it is absent on a product that plainly has one shape, detect it from disk (`sites/<head-app>/` beside `authoring/` under one git root ⇒ `monorepo`) and record what you found — never let the default win over what is on disk.

- / § 5a.

---

## 1c. Migrate the legacy spec folder (`PRD/` → `specs/`) — incremental, on touch

The spec folder was renamed `PRD/` → `specs/` because it holds PRDs, FRDs, **and** bug reports — "PRD" no longer fits. Migration is **lazy / opportunistic**: there is NO big-bang rename. Every project command resolves the workspace through this file, so run this check here, once `PR` is known (skip for read-only commands that never open a spec, e.g. `/status`):

1. If `PR/project-planning/specs/` exists → already migrated; use `specs/`. Done.
2. Else if `PR/project-planning/PRD/` exists (legacy):
   - Rename it: `git mv "<PR>/project-planning/PRD" "<PR>/project-planning/specs"` (the product is its own git repo). If the folder is untracked so `git mv` fails, fall back to a plain atomic move (Windows: `[IO.Directory]::Move`, NOT `Move-Item` on locked files).
   - **Fix the manifest SoT:** in `PR/project-planning/workflow/current-run.json` and the latest `run-*.json`, rewrite every `/PRD/` path segment to `/specs/` (the `canonical_artifacts.*` spec paths) so reads still resolve. Leave older historical `run-*.json` untouched unless a command actually needs them.
   - Surface it: `[INFO] migrated project-planning/PRD → specs (legacy folder rename)` in the Operator Checkpoint.
3. If BOTH `specs/` and `PRD/` exist (rare — aborted/partial migration): do **not** auto-merge. Leave both, warn `[WARN] both PRD/ and specs/ exist — manual reconcile needed`, and prefer `specs/` for new writes.

**Resolution tolerance (transition only):** when resolving a spec path from a manifest or convention, prefer `specs/`; if the referenced file isn't found there, fall back to the same path under `PRD/`. This keeps an un-migrated product readable even if this step was skipped.

---

## 2. Bootstrap `project-planning` (when needed)

Let:

- `PR` = the product directory resolved in **§ 1b** (`products/<group>/<slug>`, or legacy `products/<slug>`) — repo-relative, no trailing slash
- `PP` = `PR/project-planning`

If `PP` is missing **or** `PP/ADR/template.md` is missing **or** `PP/ADR/` exists but is empty (no `template.md`, no `README.md`, no `adr-*.md`):

1. Create directories:
   `PP/brain-dumps`, `PP/specs`, `PP/ADR`, `PP/architecture`, `PP/ui-design`, `PP/plans`, `PP/source-analysis`, `PP/source-analysis/assets`, `PP/workflow`, `PP/design-prototypes`, `PP/scripts`

2. Copy from `.agent/templates/project-planning-seed/` into `PP/` (preserve `ADR/` subtree) so `ADR/README.md`, `ADR/template.md`, and `ADR/adr-0001-use-adrs-as-architecture-backbone.md` exist when missing.

---

## 3. Run manifest fields

Every `run-*.json` and `current-run.json` under `PP/workflow/` includes:

```json
"product_slug": "<product-slug>",
"product_root": "<PR>"
```

where `<PR>` is the resolved product directory from § 1b — e.g. `products/marketplace/my-app` or `products/personal/my-site` (or legacy `products/<slug>` when not yet grouped). **`product_root` is always the LOGICAL form** (§ 1a rule 2) — it starts with `products/` even when the mount is external.

**Plus two DERIVED absolute mirrors**, written by whichever command touches the manifest (`/create-prd`, `/create-frd`, `/create-bug`, and refreshed by every stage that writes `stage_history`):

```json
"products_root_abs": "<absolute products root as resolved by § 1a on THIS machine>",
"product_root_abs":  "<absolute path to <PR> on THIS machine>"
```

These exist for exactly one reason: **slim-context agents resolve nothing** (§ 1a rule 3). Developer (08) never reads this file, so it must be handed absolute paths. They are **per-machine and disposable** — regenerate them, never trust a stale value from another machine, and never let them replace the logical fields. Write them with `manifest-write.mjs` like any other patch; `--replace` is unnecessary since they are scalars.

When `products_root_abs` disagrees with the root a command just resolved, **rewrite it and continue** (the operator moved the mount, or the run came from another machine); surface `[INFO] products root changed — manifest absolutes refreshed` in the Operator Checkpoint.

**Content-sdk two-level products (§ 1b-i)** additionally carry the project identity, and `product_slug` / `product_root` point at the **head app** (the workspace):

```json
"product_slug": "<head-app-slug>",
"product_root": "products/head-application/<project-slug>/<head-app-slug>",
"project_slug": "<project-slug>",
"project_root": "products/head-application/<project-slug>",
"deploy_project_name": "<verbatim Deploy project name, e.g. Acme Site Collection>",
"cm_code_base": "products/head-application/<project-slug>/cm",
"repo_topology": "repo-per-deployable | monorepo"
```

`cm_code_base` is `<project_root>/cm` for a NEW CM, or the operator's existing CM path for an EXISTING CM (no `cm/` is created then). All head apps under one project share that one `cm_code_base` + one Deploy project. **`cm_code_base` does not change with the topology** — under `monorepo` the same folder is additionally the git root and additionally holds `sites/`.

`product_root` is the only field the topology moves: `…/<project-slug>/<head-app-slug>` under `repo-per-deployable`, `…/<project-slug>/cm/sites/<head-app-slug>` under `monorepo`. **Record `repo_topology` whenever the platform offered a choice, including when the operator took the default** — every stage re-resolves its pack brief with `--topology <this value>`, and an absent field re-defaults silently, so a `monorepo` run would provision, ship and publish against the other topology's paths with every stage reporting green.

> **An EXISTING CM outside the products mount.** Under `monorepo` the workspace is `<cm_code_base>/sites/<head-app-slug>`, and when the operator's CM repo lives outside `products/` that path has no logical form. Store it as the operator gave it, `--to-logical` it where the resolver can (§ 1a), and record an `operator_attention[]` entry naming the out-of-mount root — a `product_root` that does not start with `products/` is legitimate here but will not survive a machine move, and the run should say so rather than look portable.

**Canonical artifact paths** in `canonical_artifacts` are **repo-relative** from the repository root, always starting with `<PR>/project-planning/`, e.g.:

`products/marketplace/my-app/project-planning/specs/prd-000.md`
`products/head-application/<project-slug>/<head-app-slug>/project-planning/specs/prd-000.md`  (content-sdk: `PR` = the head app)

"Repo-relative" here means **relative to the mount point**, not to the filesystem — the `products/` prefix is logical (§ 1a). To open one of these, resolve it: `node .agent/scripts/resolve-products-root.mjs --path <that path>`. Under the default in-repo root the two are identical, which is why every existing manifest keeps working with **zero migration**.

When the template shows `project-planning/...`, expand it to `<PR>/project-planning/...` using the product directory resolved in § 1b for this run.

---

## 4. `/prime` (read-only repo, scoped write)

`/prime` reads the **repository** from the repo root (README, AGENTS, git, optional PRDs). It writes **only**:

`<PR>/project-planning/plans/prime.md`

Resolve the product (§1–§1b–§2) **before** writing.

---

## 5. Switching products

When the user names a different product, use that product’s `project-planning/workflow/current-run.json` (do not merge manifests across products).

---

## 6. Legacy repo-root `project-planning/`

If an old `project-planning/` exists at the repository root, do **not** use it for new work. Offer to migrate into `products/<slug>/project-planning/` or ignore it unless the user explicitly references it.
