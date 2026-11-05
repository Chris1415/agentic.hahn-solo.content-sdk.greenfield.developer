# `xmcloud.build.json` — the blueprint

**This directory is the single source of truth for every `xmcloud.build.json` this pack emits.**
Copy a template, replace its tokens, change nothing else. Do **not** hand-write the file from
prose, and do **not** restate a `nodeVersion` in a command, an agent identity file or a runbook —
`__tests__/xmcloud-build-blueprint.test.mjs` fails the build on a stray literal.

Why this exists: the version was stated in two places that disagreed (`24.14.1` in the authoring
baseline, `22.13.0` in a `/provision-sitecoreai` prose snippet labelled *"verified-working shape"*),
and § 4 told the agent to derive from the first and then printed the second. Nine of ten head apps
took one path and one took the other, and no gate could see it — rule `88`'s shape exactly.

---

## 1. What the file is

The build descriptor SitecoreAI Deploy reads at the root of a **deployable** to learn
what to build and how. One file per deployable repo. It is read by the platform's build container,
not by the app — nothing in `next build` consults it.

**Official reference:** [The SitecoreAI build configuration](https://doc.sitecore.com/sai/en/developers/sitecoreai/the-sitecoreai-build-configuration.html)
· sample: [`Sitecore/xmcloud-starter-js`](https://github.com/Sitecore/xmcloud-starter-js/blob/main/xmcloud.build.json)
· [Accelerate cookbook sample](https://developers.sitecore.com/learn/accelerate/xm-cloud/appendix-ii/example-code/xmcloud-build-json).

### Top-level properties

| Property | What it does |
|---|---|
| `renderingHosts` | Map of rendering-host name → build config. **The key is the identity** — see § 3. |
| `authoringPath` | Relative path of the authoring (CM) code. Default `./authoring`. Present **only** on a deployable that carries authoring code — it is what stops an authoring change from redeploying the editing host and vice versa. |
| `postActions` | Operations run after deployment (§ 2). |
| `deployItems` | Serialization item modules to deploy. Not used by this pack — we deploy modules via `postActions.actions.scsModules`. |
| `buildTargets` | .NET projects/solutions to build. Not used by this pack. |
| `transforms` | XDT transform paths. Not used by this pack. |

### `renderingHosts.<key>` properties

| Property | Default | What this pack sets |
|---|---|---|
| `path` | — | `"./"` on a head-app repo (topology A); `"./sites/<SITE_NAME>"` in the monorepo shape (topology B) |
| `nodeVersion` | — | the pinned version, § 4 |
| `jssDeploymentSecret` | — | 32+ char shared secret; the same value across this workspace |
| `enabled` | `false` | **`true`** — the default is off, so an omitted key silently builds nothing |
| `type` | `"jss"` | **`"sxa"`** — Content SDK head apps are SXA-type |
| `buildCommand` | `"build"` | `"build"` (explicit) |
| `runCommand` | `"next:start"` | `"next:start"` (explicit) |
| `packageManager` | `"npm"` | not set — every head app here is npm. Set it only for a pnpm deployable. |

## 2. `postActions`

`postActions.actions` may carry `warmUpCm` (URL list), `scsModules` (SCS modules to deploy),
`populateSchema` / `reindex` (index name lists — empty array means *all*), and `publish`
(`path`, `languages`, `itemIds`, `targets`, `republish`, `publishSubItems`). Default task timeout
is 30 minutes, overridable with `taskTimeOut`.

**An editing-host deployable ships rendering code only** — it gets no `authoringPath` and no
`scsModules`. Both belong to the CM deployable.

## 3. Invariants

1. **`renderingHosts.<key>` MUST equal the editing-host name** — the exact string passed to
   `cloud editinghost create -n <name>`, and the same string bound to the site-grouping
   `RenderingHost` field (`/provision-sitecoreai` § 7d). A mismatch means the deploy cannot bind
   the rendering host; the failure is silent on the public head app and shows up as an all-missing
   layout in Pages. Match the **case** too.
2. **`enabled: true` is mandatory.** The property defaults to `false`.
3. **One descriptor per deployable.** In topology A (repo per deployable, this pack's default) the
   CM repo's file has `renderingHosts: {}` and the head-app repo's file has the entry. In topology
   B (monorepo) a single file carries both. Never both files carrying the same entry.
4. **`main` must carry this file from the first commit** — a git-linked editing host builds `main`,
   and a missing descriptor deadlocks the first deploy with `The file xmcloud.build.json is not
   found` (`pack.json` → `repo_setup.deployable_baseline`).

## 4. Pinned `nodeVersion` — `24.22.1`

**The rule is a constraint, not a free constant.** Sitecore's documentation: *"The major version of
Node.js used by hosts and starters and the one used by Content SDK must match."* So this pin is
derived from what the head apps actually run — it cannot be bumped in isolation. A **patch** bump
inside the same major (a security release) is the exception that may lead the starter: the rule
constrains the major, and SitecoreAI Deploy installs whatever exact version the file names.

| Evidence | Value | Checked |
|---|---|---|
| `Sitecore/xmcloud-starter-js` `main` → `renderingHosts.nextjsstarter.nodeVersion` | `24.14.1` | 2026-08-24 |
| Local toolchain (`node -v`) | `v24.14.0` | 2026-08-24 |
| Head apps: `next` / `@sitecore-content-sdk/nextjs` | `^16.2.0` / `^2.3.0` | 2026-08-24 |
| [Node.js Oct 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): fixed 24.x line (CVE-2026-111497 Brotli RCE + 3 more High) | `24.22.1` | 2026-10-22 |
| SitecoreAI Deploy accepts it: editing-host build log `Node version: v24.22.1`, 17 hosts across 10 repos | `24.22.1` | 2026-10-22 |
| Starter re-checked: still `24.14.1` upstream, so this pin deliberately leads it by a patch | `24.14.1` | 2026-10-22 |

**To bump:** change it in `editing-host.xmcloud.build.json`, `cm-only.xmcloud.build.json` (no
rendering host — nothing to change), `../authoring-baseline/xmcloud.build.json`, and
`pack.json` → `repo_setup.deployable_baseline.xmcloud_build_json.node_version`, in one commit.
The test asserts all of them agree; it will not let you land a partial bump. Re-check the starter
repo first — a pin that no longer matches the head app's Node major is worse than a stale one.

> The Angular starter in the same upstream file sits on `22.22.0` + `packageManager: "pnpm"`. That
> is a different app on a different Node major, not a competing answer for ours.

## 5. Templates in this directory

| File | Emitted at | Tokens |
|---|---|---|
| `editing-host.xmcloud.build.json` | head-app repo root — `/create-prd` § 10a-4b (seed), `/provision-sitecoreai` § 4 (verify + correct the key) | `<EDITING_HOST_NAME>` |
| `cm-only.xmcloud.build.json` | `<project_root>/cm/` — `/discover-sitecoreai` (NEW CM), topology A | none |

Topology B emits **neither** of the two above: it keeps `../authoring-baseline/xmcloud.build.json`
as shipped (tokens `<EDITING_HOST_NAME>` / `<SITE_NAME>` / `<SITE_COLLECTION_NAME>`) at the repo
root, and the head app gets **no descriptor at all** — see that template's `README.md`
§ "Two supported topologies". Which one a run emits comes from its `repo_topology`
(`pack.repo_topology`, asked at intake); it is not a property of this directory.

## 6. Gate

`node --test .agent/scripts/__tests__/xmcloud-build-blueprint.test.mjs` asserts:

- every template parses, and carries the required properties with the documented values;
- the three `nodeVersion` occurrences and the `pack.json` declaration are **identical**;
- **no other `"nodeVersion"` literal exists anywhere under `.agent/`** — the defect that started
  this. A stage may cite the template path; it may not restate the value.
