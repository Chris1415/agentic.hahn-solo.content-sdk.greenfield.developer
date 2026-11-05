---
name: discover-sitecoreai
intent: discovery
writes:
  - products/head-application/<project-slug>/cm/ (NEW CM: baseline copy from .agent/packs/platform/content-sdk/templates/authoring-baseline/ + token-replaced names + CM-only xmcloud.build.json + disabled Project serialization module + nuget.config with the Sitecore feed; created at the PROJECT level — shared by all sibling head apps, product-workspace.md § 1b-i)
  - products/head-application/<project-slug>/<head-app-slug>/project-planning/architecture/sitecore-inventory-<timestamp>.md (content_model — EXISTING only; PR = the head-app workspace)
  - <operator CM code path>/**/*.module.json (a new detokenized serialization module — EXISTING CM only)
  - products/head-application/<project-slug>/<head-app-slug>/project-planning/workflow/run-<timestamp>.json (canonical_artifacts.content_model + provision_plan)
  - products/head-application/<project-slug>/<head-app-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/rules/81-existing-site-discovery.mdc
  - .agent/agents/team/08-developer.md
---

# /discover-sitecoreai — Scenario assessment + (existing) content-model read (BEFORE /architect)

## Pipeline position

Runs **before `/architect`** for runs on this platform (this stage ships only with this pack, so the condition is the pack itself). `/source-analysis` is an optional pre-step only when the operator explicitly requested URL rebuild parity extraction. This stage is read-only + scenario assessment. It produces (a) a **provision plan** the later `/provision-sitecoreai` executes, and (b) for an existing site, the **content-model inventory** the Architect designs against. Symmetric with `/provision-sitecoreai` (formerly `/discover-source`).

- **`frd` / `bug` / non-Sitecore** → not applicable.

## Scenario interview (always, first)

Open with an operator `AskUserQuestion` batch and align behavior to the answers:

| Question | yes | no |
|----------|-----|----|
| Project + environment exist? | gate for env-client cred; CM code base exists | `/provision` creates it |
| Collection exists? | — | `/provision` creates it |
| Site exists? | — | `/provision` creates it |
| Components exist? | pull + inventory them | built later in `/implement` |

Emit a **provision plan** (the create-or-skip cascade: project → environment → collection → site → components) into the manifest. **Full content-model read happens only when a CM + content already exist;** otherwise discovery records the plan and stops.

## CM code base resolution (the env ↔ code-base coupling)

A CM (authoring) environment is **1:1 with a CM code base** — the SCS authoring solution deployed to it and that serialization pulls from. Resolve it; don't always create it:

- **EXISTING CM** → the operator provides the **path to the existing CM code base**. Add a **new serialization module** there (structured from the baseline `authoring/items/example.module.json`), token-replaced with the **verified** real collection/site names. Pull through it. **Do NOT create a `cm/` folder.**
- **NEW (no CM)** → **`/discover-sitecoreai` creates the `cm/` baseline copy** as the new CM code base, **at the PROJECT level** (`products/head-application/<project-slug>/cm/` = `<project_root>/cm`, shared by every head app under the project — product-workspace.md § 1b-i): copy the reference baseline into `<project_root>/cm/` with **`cp -r .agent/packs/platform/content-sdk/templates/authoring-baseline/. <project_root>/cm/`** (the trailing `/.` is load-bearing — a glob silently skips `.config/` and `.sitecore/` and the SCS config never arrives), token-replace the planned collection/site names (`<EDITING_HOST_NAME>` / `<SITE_NAME>` / `<SITE_COLLECTION_NAME>` — see the template's `README.md`), then **settle the build descriptor ACCORDING TO THIS RUN'S `repo_topology`** (manifest; `/create-prd` asked it at intake — the two answers want opposite actions here and the baseline ships in B shape):

  - **`repo-per-deployable`** (default) → write the **CM-only `xmcloud.build.json`** by copying `.agent/packs/platform/content-sdk/templates/xmcloud-build/cm-only.xmcloud.build.json` over the baseline's topology-B file (never retype it — the blueprint at `templates/xmcloud-build/README.md` is the single source of truth for every shape this pack emits). This overwrite **IS** the topology-A transform; the head app gets its own descriptor at its own root.
  - **`monorepo`** → **do NOT overwrite it.** Keep the baseline's `xmcloud.build.json` as shipped — it is already topology B — and token-replace `<EDITING_HOST_NAME>` / `<SITE_NAME>` / `<SITE_COLLECTION_NAME>` so `renderingHosts.<key>.path` reads `./sites/<SITE_NAME>` beside `authoringPath: "./authoring"`. One descriptor, at the repo root, covering both deployables. Also keep `sites/` (the template's `sites/.gitkeep` exists for exactly this) — the head app is scaffolded into it.

  Then **disable the Project serialization module** (`authoring/items/example.module.json` → `.disabled`) for the initial deploy, and ensure `nuget.config` carries the Sitecore feed. There is nothing to pull yet (nothing exists on the cloud) so no read happens — but **the local CM code base IS created here**. `/provision-sitecoreai` later **reuses** this `cm/` (it does not re-create it). **No cloud instance is created at discover.**

## Why this exists (the load-bearing reason)

The **Architect cannot design a faithful port without the real component contract** — the existing renderings, datasource field **types + exact casing**, and resolver patterns. Without it `/architect` encodes `[ASSUMED]` shapes and the SDK-contract gate is unsatisfiable. The **PM/PRD stays at product altitude** (what site, for whom, which pages, NEW vs EXISTING) and does NOT carry this depth — that is `/discover-sitecoreai`'s job, consumed by `/architect`.

## Mechanics — this command owns discovery

This command **is** the Content SDK discovery stage (aligned with rule `81-existing-site-discovery`). It does not delegate orchestration to a skill. **Domain skills to load when classifying renderings / inventory shapes:** `content-sdk-resolver-patterns`; for NEW-vs-EXISTING content-model direction and two-track framing, `content-sdk-website-build-flow`. The steps below are the contract.

## Steps

1. **Resolve workspace + run the scenario interview** (`product-workspace.md`). Confirm this pack is active in the run manifest's `packs` block; if not, stop and report the misroute — a stage body that only ships with its pack should never be executing otherwise. For content-sdk the workspace `PR` = the **head-app folder** and `project_root` = its **parent project folder** (§ 1b-i): the `cm/` baseline is created at `project_root` (shared), while planning + manifest live at `PR`. Record the provision plan.

2. **NEW (nothing exists):** **create the local `cm/` baseline at the project level** — `cp -r .agent/packs/platform/content-sdk/templates/authoring-baseline/. <project_root>/cm/` (`products/head-application/<project-slug>/cm/`, shared by all head apps; the trailing `/.` is load-bearing — a glob skips `.config/` and `.sitecore/`), token-replace the planned collection/site names, settle `xmcloud.build.json` per this run's `repo_topology` (CM-only copy under `repo-per-deployable`; the baseline's own file kept as shipped under `monorepo` — see § NEW above), disable the Project serialization module (`authoring/items/example.module.json` → `.disabled`) for the initial deploy, and ensure `nuget.config` carries the Sitecore feed. Then record the full-cascade provision plan and skip the cloud read (no content to pull — the component model is derived from the static app at `/architect`). **No cloud instance is created here** (`/provision-sitecoreai` deploys this `cm/` and creates the cloud cascade). Recommend `/architect`. **Stop here for new sites.**

3. **EXISTING CM:**
   - **Resolve the CM code base** — operator provides its path. The **.NET `sitecore.cli`** must be available there; if the CM code lacks `.config/dotnet-tools.json` or a `nuget.config` with the **Sitecore feed** (`https://nuget.sitecore.com/...` + `<clear/>`), add them (else plugin restore fails — F5). **Two CLIs:** the head app's Node `sitecore-tools` does NOT serialize; pull = the .NET `dotnet sitecore … ser` (F3).
   - **Login + connect:** `dotnet sitecore cloud login` (operator completes the browser device flow), `cloud environment connect --environment-id <cmEnvId> -aw`. `.sitecore/user.json` holds tokens — confirm it is gitignored.
   - 🔍 **VERIFY real tree names BEFORE finalizing the serialization module** (F6 — the critical gotcha): operator-typed `SITE_COLLECTION_NAME`/`SITE_NAME` can be wrong (`aurora` vs `auroras`), and the content-collection name vs the `Project` templates/renderings namespace are *assumed equal* but not guaranteed. Run a shallow discovery pull (`ItemAndChildren` on `/sitecore/content`, `/sitecore/templates/Project`, `/sitecore/layout/Renderings/Project`) to read the ACTUAL names; reconcile with the operator's input.
   - **Add the serialization module + pull:** in the operator's CM code path, add a new `*.module.json` (from the baseline `example.module.json` template) with the **verified** names substituted; `dotnet sitecore … ser pull`.
   - **Generate the content-model inventory** at `project-planning/architecture/sitecore-inventory-<timestamp>.md`: every rendering (componentName, datasource template, parameters template, resolver GUID / ComponentQuery, identified pattern per `content-sdk-resolver-patterns`) + **per datasource template, its fields with Sitecore field TYPE + exact casing** + routes/placeholders + Headless Variants. Record `canonical_artifacts.content_model`.

4. **Operator gate (soft):** present the inventory + provision plan; confirm against the tenant before `/architect`.

## Validation

- Scenario interview answered; `provision_plan` recorded in the manifest.
- **EXISTING:** real collection/project/site names verified against the tree before the serialization module is written; the module was added to the **operator's CM code path** (NOT a new `cm/`); `ser pull` populated items; `sitecore-inventory-<timestamp>.md` exists and is recorded as `canonical_artifacts.content_model` (renderings + per-datasource field types/casing).
- `.sitecore/user.json` is gitignored (tokens not committed).

## Output rules

- **Begin with an Operator Checkpoint** (Decisions / Assumptions / Concerns / Open questions). Mirror non-empty items into `operator_attention[]` with `stage: "discover-sitecoreai"`.
- **Operator gate — SOFT.** Clean run ends with "Recommended next: `/architect`" (which consumes `content_model`); `/provision-sitecoreai` later executes the provision plan.
- Escalate to a hard stop on: tenant/repo access refused, plugin restore unfixable, or an operator name mismatch the operator hasn't resolved. A refuted-access outcome is a legitimate stop — cancel / redesign, per rule `70`.
