---
name: create-prd
intent: product_spec
writes:
  - products/<product-slug>/project-planning/specs/prd-NNN.md
  - products/<product-slug>/project-planning/specs/prd-minimal-NNN.md
  - products/<product-slug>/project-planning/ADR/adr-*.md
  - products/<product-slug>/project-planning/ADR/README.md
  - products/<product-slug>/project-planning/plans/interrogation-discovery-<timestamp>.md (the grill ledger)
  - products/head-application/<project-slug>/<head-app-slug>/** (content-sdk first-time repo setup only — § 10a-4b scaffolds the deployable baseline: generator output + xmcloud.build.json + .env.example + .gitignore, committed and pushed to `main` before `prd-NNN` branches. Under the `monorepo` topology the same tree lands at products/head-application/<project-slug>/cm/sites/<head-app-slug>/**, and the descriptor at the repo root instead — the brief's resolved `workspace.layout` + `repo_setup` name both)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/platform-pack.md
  - .agent/commands/project/interrogation-protocol.md
  - .agent/agents/team/02-product-manager.md
  - .agent/commands/project/dev-flow/templates/prd.template.md
  - .agent/commands/project/dev-flow/templates/prd-minimal.template.md
  - .agent/commands/project/templates/status-md.template.md
  - .agent/manifests/run-manifest.template.json
---

# /create-prd — Run the Product Manager PRD Creator agent directly

> **Intake type (schema 8+):** `/create-prd` is the **PRD weight** of a shared three-type intake engine. It sets `work_item_type: prd` and runs the full ceremony (the 3 default gates — spec / clickdummy / content — plus architecture + optional UI, autonomous between). For a bounded single feature use **`/create-frd`** (skips architecture + the design gate); for a contained fix of broken behavior use **`/create-bug`** (autonomous, RED-test-first). All three share this command's git/manifest/extraction mechanics. See `.agent/glossary.md` § "Work item type".

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **before** parsing slash arguments. **Resolve the product (`product_slug`) first** using `product=` or an unambiguous first token; **do not** treat a valid product slug as a brain-dump path. If the first argument is a path to `.md` or contains `/`, it is a file input, not the product — **ask** the user. All `project-planning/...` paths are under **`products/<product-slug>/project-planning/`**.

## Step 0 — pack resolution (M0)

Read and apply `.agent/commands/project/platform-pack.md`, **before the scope dial below**. Resolve
one value per dimension — `platform` / `method` / `audience` — by the ladder **inherit → detect →
ask**, and record the triple in the run manifest at step 17.

**Silent in the common case.** An existing product inherits and asks nothing. A new product with a
clear signal detects and confirms at the step-3 summary. Only a new *and* ambiguous product costs
**one** `AskUserQuestion` with two slots. Never guess between two strong signals — ask.

> **Packs are LOAD-BEARING** (since tranche 5, 2026-08-22). M0 records `packs{}` **and** every
> stage-shaped command resolves a brief from it; six stages and three agents live inside packs, and
> the validator errors on a contract violation rather than advising. The dial-filtering and grill-set
> effects in `platform-pack.md` § 5 are live.
>
> **The legacy `platform_target` field is RETIRED (2026-08-23).** M0 no longer writes it and no stage
> reads it for behaviour. It survives in exactly one place — ladder **rung 2**, which derives a
> composition from it when a *pre-packs* manifest is all that exists (`platform-pack.md` § 2). That is
> a one-way migration read, not a source of truth, and every run that touches such a product writes a
> proper `packs` block on top.

## Pack brief — the platform's skills, slots and hooks for this stage

**Resolve the composition and read the brief. Do not restate a platform's list here.**

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage create-prd --md
```

**Resolve the brief TWICE when the platform offers a repo topology.** A brief carrying
`repo_topology` with more than one value prints *Offered: … · chosen by default* — that is the
brief telling you the answer is the operator's and has not been given yet. The first resolution
(above, no `--topology`) is what you read to know the question exists and to phrase it; the
**second**, after the discovery grill has an answer, re-resolves with it:

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> \
     --stage create-prd --topology <the run's repo_topology> --md
```

The second brief's `workspace` and `repo_setup` come back **already resolved for that answer** —
the layout, the git root, the branch-naming rule and the build descriptor all differ between
topologies. **Never branch on the topology in this file.** A stage that reads the value and picks
its own layout is the second resolution path `platform-pack.md` § 6 forbids, and it is how
`/create-prd` came to hardcode `repo-per-deployable` while the pack said the choice existed
(BACKLOG item 22). Pass `--topology` on every later resolution in this run too, and carry the
value forward in the manifest so downstream stages resolve the same brief you did.

**The topology belongs to the REPO, not to the run — so ask it once PER REPO.** The discriminator is
**whether this run creates a new deployable or extends an existing one**, not whether the *project*
already exists:

| This run | Behaviour |
|---|---|
| Creates a **NEW deployable** (a new head app) — even a sibling in a project that already has ten | **ASK.** Under `repo-per-deployable` a new head app *is a new repo*, so its topology is genuinely open: the operator may give it its own repo, or put it in the CM monorepo at `cm/sites/<head-app-slug>/`. Nothing on disk answers this, because the thing being shaped does not exist yet. |
| Extends an **EXISTING deployable** (an FRD or bug against a head app that already has a tree) | **INHERIT** from the product's manifest and do not re-ask — that repo is already shaped, and a different answer would describe a layout that does not exist on disk. |

If a run finds an existing repo whose shape **contradicts** the recorded value — or finds no recorded
value at all on a deployable that clearly has one shape — **detect it from disk** and record what you
found, with a `[WARN]` naming the disagreement. Detection is for reconciling a tree that already
exists; it is **never** a substitute for asking about one that does not.

**Detect from the two real discriminators**: `renderingHosts` non-empty in the CM's descriptor, and
`sites/<head-app-slug>/` present beside `authoring/` under one git root ⇒ `monorepo`. **`authoringPath`
is NOT a discriminator** — it is present in *both* `cm-only.xmcloud.build.json` and the topology-B
authoring baseline, so a reader citing it as evidence has cited nothing.

> **Measured 2026-08-31 (hello-sitecore).** This paragraph previously read *"a second run in an
> existing workspace (a sibling head app, an FRD, a bug) inherits … never resolve it by re-asking"*.
> A run adding an eleventh head app to a shared project therefore **suppressed the pack's own topology
> question**, recorded `repo-per-deployable` as *detected*, scaffolded, committed a baseline and cut a
> branch — and only found out at `/architect` that the operator had wanted `cm/sites/`. The clause was
> written for a run landing **inside** an existing repo and silently swallowed the case where a run
> **creates** one. A recap line saying *"detected from disk"* is not the same as being offered A or B,
> and confirming a recap is not answering a question that was never asked.

> **Who runs this matters.** `resolve-packs.mjs` needs Bash, and the Product Manager (02),
> Lead Developer (06) and Doc Writer (09) **do not hold it**. Where this stage spawns one of
> them, the **orchestrator resolves the brief and passes it down in the spawn prompt** — the
> same relay the interrogation protocol already uses when a spawned agent lacks
> `AskUserQuestion`. Frontmatter `tools:` is intent, not a runtime guarantee: **check, don't
> assume.** A spawned agent that cannot run the command must say so and use the relayed brief,
> never reconstruct a composition by reading `pack.json` files — that is the second resolution
> path `platform-pack.md` § 6 forbids, and a real run hit exactly this on 2026-08-24.


The composition is the triple M0 resolved at § Step 0 (`.agent/commands/project/platform-pack.md`).
With every dimension at its null the brief is empty and this stage behaves exactly as it always has.

This file cites *"the brief's `scaffold.command`"*, *"the brief's `repo_setup.topology`"* and
`hooks.discovery.questions` throughout — but until 2026-08-23 it never said **how to obtain the
brief**, so every one of those citations pointed at something the reader had no instruction to
produce. Every other stage-shaped command carried this block; the intake weights did not.

## Goal
Create a persisted PRD from a concept brief, a raw product description, or **both** — but **only after** the Product Manager has interrogated the idea thoroughly through discovery. The PM does not silently accept the input and write; the PM first questions the stakeholder relentlessly until mutual clarity is reached, then writes a PRD that is already free of the uncertainties resolved during discovery.

**Rubber Ducky is optional and separate:** Run `/rubber-ducky` first if you want a structured concept brief; otherwise pass a **prompt only** or **prompt + brain-dump path** to this command.

## Inputs
- Optional slash-command arguments (any order, as the user provides them):
  - **File path** to `project-planning/brain-dumps/brain-dump-*.md` (or another markdown brief) → use as concept-brief input.
  - **Raw text** (remainder of args or quoted string) → use as direct product/feature description or as **additional context** when a brain-dump path is also present.
- **Default source resolution** when no path is given: read `project-planning/workflow/current-run.json` and use `canonical_artifacts.brain_dump` if present. If the manifest is missing or that entry is absent, use the file in `project-planning/brain-dumps/` whose name has the latest timestamp.
- **Prompt-only:** If there is **no** brain-dump path and **no** usable manifest/latest brain-dump, treat all non-path arguments (or the user’s message) as the **sole** PRD input. If nothing usable exists, ask the user for a concept brief path or a raw product description before continuing.

## Input combination rules
| Situation | PRD source |
|-----------|------------|
| Path to brain-dump only | Sole input |
| Text only (no path, no manifest brain_dump) | Sole input (prompt-only) |
| Brain-dump path + extra text | Combined: brief is primary; extra text is constraints, deltas, or focus |
| Manifest `brain_dump` + user adds text in args | Combined unless user says to ignore manifest |

Record `prd_input_mode` in the run manifest: `prompt_only`, `brain_dump_only`, or `combined`.

## Timestamp rule
- If `project-planning/workflow/current-run.json` exists and references a canonical brain-dump artifact, reuse that `run_id`.
- Otherwise, if the chosen source file name includes a timestamp in the form `*-<timestamp>.md`, reuse that timestamp for the PRD outputs.
- Otherwise, resolve a fresh timestamp for this run.

## Scope dial (combined kickoff prompt)

Before any discovery, resolve a single **scope dial** that governs the rest of this run's planning rigor. The dial replaces the previous per-stage prompts (separate discovery-level, criticism-level, planning-track, UI-variant-count questions) with one combined kickoff. Per-stage overrides are still honored — the dial sets defaults, not hard locks.

**Selecting the dial.** Resolve in priority order:

1. If the user passed any of `rigor=<level>`, `track=<full|minimal>`, `ui=<skip|1|2|3>`, `docs=<auto-lite|full|none>`, `loop=<per_component|once>`, `shape=<mvp-first|all>`, `concurrency=<serial|parallel>`, `gates=<spec,design,build,final,go_live | none | all>`, `content=<auto|yes|no>`, `imagery=<mood|none>`, `xref=<prohibited|cite|free>`, `verbosity=<auto|minimal|verbose>`, `dual_review=<off|on|fable>` in slash arguments, take those.
2. If the user message contains clear equivalents ("light planning", "minimal track", "no UI", "skip docs", "review once / test at the end / loop per component", "build components in parallel / one at a time", "run fully autonomous / no gates", "no content authoring", "no images / mood images", "quiet agents / minimal narration", "verbose agents / watch mode"), take those.
3. If the user message includes `skip scope dial` (or clear equivalent), use defaults: `rigor=standard, track=full, ui=1, docs=auto-lite, loop=per_component, shape=mvp-first, concurrency=serial, gates=all (autonomy auto_3_gates), content=auto, imagery=mood, xref=cite, verbosity=auto, dual_review=off`. Record `scope_dial: defaulted` in run manifest `notes`.
4. **If nobody is reachable** (an unattended run — a harness, CI, a scheduled trigger — or
   `fully_autonomous`), do **not** ask. **Still run the M1 pack filter below** — it is what produces
   `dials_preset_by_pack` and `dials_dropped_by_pack_filter`, and **Persistence** requires both on
   every path. Then, per `.agent/commands/project/interrogation-protocol.md` § *"The scope dial is
   covered too"*: take `preset` verbatim, record `dropped` as `null` with its reason, and give every
   dial in `ask` its documented default, recording `notes.scope_dial_source: "unattended_defaults"`
   with the defaulted keys listed. Skip only the `AskUserQuestion` calls — **not the filter**.

   Do **not** fall back to the *Greenfield default* clause below: it is scoped to a legacy run
   resumption and says nothing about an absent operator. Where it is the only place a default is
   written — `architecture_budget` — take that value and say so in `notes`.

   (This step said "skip to Persistence" for one day, on 2026-08-27. That routed around the M1 block
   in step 5, whose only run-trigger reads *"before composing any `AskUserQuestion` call"* — vacuous
   when you compose none — while Persistence still demanded the two keys M1 alone produces. A fix
   for a rule `88` defect that reproduced it one step over.)

5. Otherwise, **pack-filter the dial first (M1), then ask what survives.**

   **M1 — pack filter. Run this before composing any `AskUserQuestion` call:**

   ```sh
   node .agent/scripts/resolve-packs.mjs \
     --platform <p> --method <m> --audience <a> --dials
   ```

   It returns three buckets, and they partition the dial exactly:

   - **`ask`** — build the `AskUserQuestion` calls from **this list only**. Take the question text
     for each from the catalogue below. **Re-batch to fit** — the tool caps at 4 per call, so a
     filtered dial is often two calls, not three. Do not pad a call back to four by adding a
     question the filter removed.
   - **`preset`** — an active pack has already answered it. Take `value` verbatim, do **not** ask,
     and record `from` as provenance. The operator never sees these.
   - **`dropped`** — no active pack owns the stage that consumes it. Record it as **`null`** with
     the reason, **never as a defaulted value**: "nobody could answer this" and "the operator chose
     the default" are different facts, and only one of them is safe for a downstream stage to act
     on.

   **Why this exists.** `platform-pack.md` § 5 has always mandated this. Until 2026-08-27 it was a
   sentence nowhere enacted — the dial script below hardcoded `content_authoring` and `imagery`, so
   a `platform: none` run asked a plain-Node-CLI operator about the Sitecore content phase and
   image generation. The drop is derived from `owns.stages`, so **no platform is named** and a pack
   that starts owning `/author-content` gets the dials back for free. Gated by
   `.agent/scripts/__tests__/dial-pack-filter.test.mjs`.

   **The catalogue below is question TEXT, not a script.** Some entries name pack-owned stages
   (`/author-content`, `/publish`) — that is correct, because the filter only lets them reach an
   operator when a pack owning those stages is active.

   Use these exact questions for whatever survives the filter:

   **Call 1 — planning rigor & delivery shape (4 questions):**
   - **Plan rigor** — sets how hard the **grill** runs at discovery AND critical review (both are one-question-at-a-time interrogations — `.agent/commands/project/interrogation-protocol.md`). Options: `Light` (3–5 questions, blockers only), `Standard (Recommended)` (8–12 questions, scope/stories/risks), `Thorough` (20+, every dimension, until dry). You can end any grill early with its `Enough — stop asking` option.
   - **Planning track** — Options: `Full (Recommended)` (PRD + ADRs + architecture blueprint + optional UI), `Minimal` (PRD + ADRs only — no separate architecture file). The `minimal` track sets `canonical_artifacts.architecture` to `null` at `/architect` time.
   - **Delivery shape** (header `Delivery shape`) — should this spec aim at the **smallest thing that ships and goes live**, or at the whole vision in one deliverable? Options: `MVP first (Recommended)` (**the default**. The PRD still carries the FULL vision — that is what the follow-on PRDs get cut from — but `/architect` sizes the build and, if it crosses a threshold, proposes an MVP cut with the remainder named as follow-on PRDs and PRD-000 recorded as member 1 of a program), `Build it all` (one deliverable, however large; `/architect` still **measures and records** the size and what it would have cut, it just does not propose the cut). Persist as `scope_dial.delivery_shape`. Slash `shape=<mvp-first|all>`. **The dial never suppresses the measurement** — see `/architect` § 2b-i.
     > **Why this replaced the old kickoff `UI variants` question (2026-09-25).** All three calls were at the 4-question cap, so a thirteenth dial meant a fourth round of questions on every run — a real tax on small ones. `ui_variants` was the weakest of the twelve: it only set a *default* for a count that `/design` asks properly anyway, so dropping it from kickoff costs a default, not an answer. It still resolves from the `ui=<skip|1|2|3>` slash arg and defaults to `1`. Conflating two dials into one question was rejected — that is the malformed-question shape `clone-field-contract.test.mjs` § 1a exists to catch.
   - **Docs at ship** — Options: `Auto-lite (Recommended)` (`/ship` emits a 1-paragraph README + CHANGELOG entry), `Full` (`/document` runs the heavy doc pass before `/ship`), `None` (no docs written by automation).

   **Call 2 — autonomy & build cost (4 questions):**
   - **Operator stop-points (gates)** — **`multiSelect: true`** (pick-any). Present the four checkpoints, **all pre-selected by default**: `PRD review (spec)`, `Design clickdummy (design)`, `Rendered-output review — end-of-build Components Preview + final output (build + final)`, `Live/real-tenant boundary confirm — provisioning + /publish go-live (go_live)`. The third checkpoint drives **both** the `build` token (the single end-of-build look at the whole implementation via the Components Preview page, at `/test` close — content-sdk runs only, inert otherwise) **and** the `final` token (the last look — `/test-content` for content, `/test` for non-content); ticking it sets both `true`, unticking sets both `false` (split them per-token via the `gates=` slash arg if you truly need to). The operator **keeps the ones they want** and unticks the rest. **Keeping all = the recommended default** (hands-off between them). **Unticking all = fully autonomous** — zero human interaction, the live publish + real-tenant writes proceed unattended (genuine blockers still stop; glossary § "Operator Gate"). The operator may also name **extra stops** via the free-text "Other" (e.g. `after /architect`, `after /task-breakdown`) → `extra_stops`. **Do NOT untick gates by default** — over-stopping *and* under-stopping are both operator choices; with no opinion, keep all four.
   - **Build loop cadence** (header `Loop cadence`) — should the build-phase **test** pass run after each component, or once at the end? (Code review runs per component either way.) Options: `Per component (Recommended)` (review **and** test after EACH component/feature tranche, looping back to the Developer before the next component starts — best quality, every component proven green on a small diff; costs more time + tokens), `Test once at the end` (each component is still implemented **and code-reviewed** on its own, then a single test pass over the whole build — cheaper + faster, but cross-component regressions surface late). **Default = per component** (the better outcome). This dial is **inert on single-component runs** (a bug / small FRD / freeform run is one pass either way). Persist as `scope_dial.delivery_loop`.
   - **Content authoring** — does this run include an audience-facing **content phase** (`/discover-components` → `/author-content` ⇄ `/test-content` → `/publish`)? Options: `Auto (Recommended)` (runs iff this turns out a Content SDK / Sitecore run; inert otherwise), `Yes — author content`, `No — code only` (skip the content phase; `/ship` is terminal).
   - **Developer concurrency** (header `Concurrency`) — how many component tranches are built at once? Options: `Serial (Recommended)` (one tranche at a time — a single Developer implements it, then code-review, then QA, then the next tranche is picked up; smallest blast radius, simplest to follow, the standing default), `Parallel — EXPERIMENTAL` (independent tranches run **simultaneously in isolated git worktrees** — each gets its own Developer **and** its own code-review, concurrently; when every tranche is review-clean they are **merged back**, the maps regenerate once, and then **one QA pass runs over the integrated whole** — full suite + lint + build — before the operator gate. Review is diff-local so it parallelizes at full signal; QA is integration-dependent, so it runs once on the real merged build rather than N times against partial worktrees). **Serial is preselected** — it is the standing default and the safe answer. **`Parallel` is EXPERIMENTAL and unexercised** — no run has yet spawned a concurrent tranche set (rule `71` § "Known limitations"). It is safe to try because every unresolved case **degrades to sequential, never to corruption**: the Lead Developer catches shared-file and shared-item dependencies while splitting tasks, so a build that cannot be proven independent simply runs in a line — today's behavior. Known today: a multi-component Content SDK run usually degrades to sequential anyway (shared placeholder settings), and any tranche adding an npm dependency collides on `package.json` + lockfile. **Persist as `scope_dial.delivery_parallelism`** (`serial` | `parallel`). **Safety is not a dial:** `parallel` never overrides the rule-`71` eligibility proof — a tranche set that cannot be proven independent runs serially no matter what is chosen here, and 🔍 probe tranches are always blocking and run first, alone. Inert on single-tranche runs.

   **Call 3 — content imagery, reference, verbosity & dual review (4 questions):**
   - **Imagery** (how `/author-content` fills empty Image fields — only applies if content authoring runs) — Options: `Mood images — Claude-generated` (abstract/decorative SVG/gradient imagery, no external service, no per-image cost), `No images` (leave Image fields empty; CSS fallback).
   - **External reference** — may this run consult **other head apps / products in this repo** (e.g. sibling head apps under the same `<project-slug>`) for reference patterns? Options: `Cite-required (Recommended)` (reference allowed, but every borrowed pattern is logged to the run manifest + a reliance count is reported at `/ship` — so the run's independence stays auditable), `Prohibited` (build only from THIS app's own code; if a sibling would solve a wall, STOP and ask the operator — never peek), `Free` (reference siblings freely, no logging). Governs **peer-product** code ONLY — it never restricts the sanctioned `sitecore:*` skills, `node_modules` `.d.ts` (rule `40`), or the shared `cm/`. See rule `20-boundaries` + `.agent/glossary.md` § "External reference".
   - **Agent narration (output verbosity)** (header `Narration`) — mid-turn chat chatter during the run (not artifacts on disk). Options: `Auto — role defaults (Recommended)` (each agent keeps its frontmatter pin: execution roles stay quiet, planning/discovery stay readable; `fully_autonomous` still forces quiet everywhere), `Minimal — quiet everywhere` (results-only / escalate-when-blocked on every spawn — cheapest when watching cost), `Verbose — progress everywhere` (short progress OK on every stage — useful when debugging a stuck run). Persist as `scope_dial.output_verbosity`. Slash `verbosity=` still overrides.
   - **Second reviewer** (header `Dual review`): should `/code-review` and `/challenge-prd` run a **second, independent reviewer** next to the standard Sonnet one, with **07 QA arbitrating** the merged findings? Options:
     - `Off — single reviewer (Recommended)`: no added cost. **The default.**
     - `On — add an Opus second reviewer`: roughly **$0.50 per code review**.
     - `Fable — add a Fable second reviewer`: roughly 2.5× the cost of the Opus reviewer.

     Measured: on the 5.5 generation every pairing reached the same coverage, and Sonnet alone matched the best pair. The second reviewer is therefore insurance, not measured extra recall. Weigh it against a bounded-5 delivery-loop iteration, which costs a full re-spawn + re-review + re-test. Persist as `scope_dial.dual_review` (`off` | `on` | `fable`). Slash `dual_review=` still overrides.

**Persistence.** Record the resolved dial in the run manifest as a top-level `scope_dial` block (schema_version 5+; includes `gates`, `content_authoring`, `imagery`, `delivery_loop`, and related fields).

**Record what the filter did, not just what the operator said.** Alongside `scope_dial`, write:

- `notes.dials_dropped_by_pack_filter` — `{ "<dial>": "<why>" }` for every entry in `dropped`. The
  dial itself is `null` in `scope_dial`. A reader must be able to tell a dropped dial from a
  defaulted one **without re-resolving the composition**.
- `notes.dials_preset_by_pack` — `{ "<dial>": "<pack key>" }` for every entry in `preset`, so a
  value the operator never saw is attributable later.

Without both, `imagery: null` is indistinguishable from `imagery` never having been reached, and the
next stage has no way to know which.

```json
"scope_dial": {
  "rigor": "light|standard|thorough",
  "track": "full|minimal",
  "ui_variants": "skip|1|2|3",
  "docs_at_ship": "auto-lite|full|none",
  "delivery_loop": "per_component|once",
  "delivery_shape": "mvp-first|all",
  "delivery_parallelism": "serial|parallel",
  "autonomy": "auto_3_gates|custom|fully_autonomous",
  "gates": { "spec": true, "design": true, "build": true, "final": true, "go_live": true },
  "extra_stops": [],
  "content_authoring": "auto|yes|no",
  "imagery": "mood|none",
  "external_reference": "prohibited|cite|free",
  "output_verbosity": "auto|minimal|verbose",
  "dual_review": "off|on|fable"
}
```

Set `gates` from the multi-select (a ticked checkpoint = `true`); the third checkpoint sets **both** `build` and `final`. Derive `autonomy`: all five `true` + no `extra_stops` → `auto_3_gates` (the "3" is legacy shorthand for the review gates — `build` joins them on content-sdk runs and is inert elsewhere, so effective review-stops stay ~3); all five `false` + no `extra_stops` → `fully_autonomous`; anything else → `custom`. `delivery_loop` is independent of `autonomy` — it sets the build-loop cadence, not a review stop; default `per_component` when unset. `output_verbosity` comes from Call 3 (default `auto` = keep each agent's frontmatter pin); slash `verbosity=` / message signal still override; when `autonomy` is `fully_autonomous` and the dial is `auto`, every spawn is forced `minimal` (rule `73`).

**Inheritance and override.** Downstream commands read `scope_dial` to set defaults but accept per-stage override:
- `/architect` — uses `scope_dial.track` to decide full vs minimal; uses `scope_dial.ui_variants` as the default count when asking the UI question. The user can still override at `/architect` time.
- `/design` — hard-stops for the operator to pick a POC winner **iff `gates.design`**; when off (custom / fully_autonomous) it auto-selects the top-scored POC (or v1) and continues.
- `/task-breakdown` — **soft gate** (auto-continues, no top-level stop) UNLESS the operator listed a task-breakdown stop in `scope_dial.extra_stops`.
- `/implement`, `/provision-sitecoreai`, `/author-content`, `/test-content`, `/publish` — the outward/real-world boundary confirm (first real-tenant write, provisioning, live writes, the go-live publish) fires **iff `gates.go_live`**; when off it proceeds unattended. Genuine blockers (a stage that cannot complete) still stop.
- `/implement` (+ `/code-review`, `/test`) — reads `scope_dial.delivery_loop` to set the build-loop cadence (rule `71-delivery-loop.mdc`), which moves the **test leg only** (`/code-review` runs per tranche in both): `per_component` (default) runs code-review + test after each component tranche; `once` reviews each tranche as it lands (commit at review-clean) then runs a single `/test` over the whole build. Inert on single-tranche runs. Overridable per-run with the `loop=<per_component|once>` slash arg on `/implement`.
- `/test` — the **end-of-build** review of the Components Preview page. When an **active downstream stage declares `gate: final`** (a pack that `owns_final_gate`, with its phase not switched off by a dial) it is the **`build`** gate (hard **iff `gates.build`**); otherwise `/test` is the last look before a terminal `/ship` and is the **`final`** gate (hard **iff `gates.final`**). Either way the stop is only the **end-of-build** `/test` pass — mid-loop `/test` passes (`per_component` cadence) never stop.
- `/test-content` (content final) — the final-look hard stop fires **iff `gates.final`**.
- `/ship` — uses `scope_dial.docs_at_ship` for docs; recommends the content phase **iff `scope_dial.content_authoring != no`** and the run is content-sdk (or `content_authoring == yes`).
- `/author-content` — uses `scope_dial.imagery` to decide the empty-Image-field fill tier (`mood` / `none`).
- **All build/authoring agents** (`/architect`, `/task-breakdown`, `/implement`, `/code-review`, `/author-content`, …) read `scope_dial.external_reference` and honor it per rule `20-boundaries`: `prohibited` = never read a peer product's repo (STOP-and-ask if a sibling would solve a wall); `cite-required` = log each borrowed peer-product pattern to `operator_attention` / the run report (what + from where) and report the reliance count at `/ship`; `free` = no logging. Never restricts the `sitecore:*` skills, `node_modules` `.d.ts`, or the shared `cm/`.
- **All pipeline spawns** — Team Lead / orchestrator resolves `scope_dial.output_verbosity` per rule `73-output-verbosity.mdc` and injects `Output Level: <minimal|verbose>` into every specialist spawn prompt (execution agents pin `minimal` under `auto`; `fully_autonomous` forces `minimal` everywhere).
- `/create-prd` itself — uses `scope_dial.rigor` for both Discovery level and Criticism level, and hard-stops at its own close **iff `gates.spec`** (default on). Both stages still honor explicit `skip discovery` / `skip critical review` user signals.

**Greenfield default.** When `scope_dial` is missing on a legacy run resumption (no manifest, no slash args, no message signal), default to `{ rigor: standard, track: full, ui_variants: 1, docs_at_ship: auto-lite, delivery_loop: per_component, delivery_shape: mvp-first, autonomy: auto_3_gates, gates: { spec: true, design: true, build: true, final: true, go_live: true }, extra_stops: [], content_authoring: auto, imagery: mood, external_reference: cite, architecture_budget: mindful, output_verbosity: auto }` and record `scope_dial: defaulted` in `notes`.

## Composition — resolved at step 0, recorded here

**Resolution happens at step 0 / M0** (2026-08-22), before the scope dial. That is the ordering the
dial always needed: `content_authoring` is **defined** in terms of the platform and survived the old
ordering only because its `auto` value defers evaluation.

**Persistence:** record the `packs` block at step 17. Nothing else — the legacy `platform_target`
field is retired and M0 does **not** write it (2026-08-23).

**A null composition short-circuits nothing by name.** With no pack active there is simply no brief,
so platform-specific gates have nothing to contribute. That is the same outcome the old
`platform_target: other` branch produced — reached without the pipeline knowing any platform's name,
which was the entire point of the refactor.

## Workspace naming — the brief's `workspace` declaration

Where the active platform declares `workspace.naming`, resolve the names **when it says** — typically
at the discovery-summary checkpoint, once the composition is confirmed, and **before git setup**.
Ask its `asks`, compute its `derives`, show the derived paths back for confirmation, and record its
`records` on the manifest.

**The timing is the whole point:** the folder, the git init and the spec write all have to land at
the right path, so resolving this later means moving all three. A platform that declares no
`workspace.naming` uses the flat product root and this section is inert.

**Ask the operator** (single `AskUserQuestion`; skip whichever is already unambiguous from an existing folder, the manifest, or slash args):
- **SitecoreAI / Deploy project name** — the human-readable name the Deploy project is (or will be) created under, e.g. `Acme Site Collection`. For a NEW project this is what `/provision-sitecoreai` later passes to `cloud project create -n`. For an EXISTING project (adding a head app to a CM that already exists), name the project to reuse — offer the current `products/head-application/*/` project folders as choices.
- **Head app (site / editing host) name** — this run's head app, e.g. `Acme Marketing Site`.

**Derive the slugs mechanically — do not ask for them:**
- `deploy_project_name` = the **verbatim** project name, spaces/caps preserved (carried for `/provision-sitecoreai`).
- `project_slug` = **dash-case** of the project name: lowercase → spaces/underscores to `-` → drop anything outside `[a-z0-9.-]` → collapse repeated `-` → trim leading/trailing `-` (`Acme Site Collection` → `acme-site-collection`). Must satisfy the project-slug rule (§ 1).
- `head_app_slug` = dash-case of the head-app name (`Acme Marketing Site` → `acme-marketing-site`).
- `project_root` = `products/head-application/<project_slug>`; `product_root` (the workspace `PR`) = `<project_root>/<head_app_slug>`; `cm_code_base` = `<project_root>/cm` (NEW CM) or the operator's existing CM path (EXISTING).

**Show the derived paths back** before creating anything — e.g. *"Deploy project `Acme Site Collection` → folder `products/head-application/acme-site-collection/`; head app → `…/acme-marketing-site/`. OK?"* — so the operator can correct the auto-slug. **EXISTING project:** reuse its `project_slug` + `cm/`; only the new `head_app_slug` folder is created. Record `deploy_project_name`, `project_slug`, `project_root`, `cm_code_base`, plus the head-app `product_slug` (= `head_app_slug`) / `product_root` in the manifest (step 18). These flow to `/discover-sitecoreai` (creates `cm/` at `project_root`) and `/provision-sitecoreai` (creates the Deploy project from `deploy_project_name`).

## Discovery phase (before PRD writing)

The Product Manager does **not** jump straight to writing a PRD from the raw input. Before writing, the PM enters **discovery mode** — an **interrogation** at a chosen **depth level**, scoped further by whether a concept brief (brain-dump) already exists, and closing with a **discovery summary** confirmation before constructive mode begins.

### Mandatory — the interrogation protocol

**Read and apply `.agent/commands/project/interrogation-protocol.md`.** Discovery is a grill: one question at a time, each derived from the last answer, pushing back on every hedge, until nothing unresolved would change what gets built. The protocol owns the loop (the `AskUserQuestion` shape, option design, the push-back rule, the ledger, the escape option, and when the grill does not run). This section owns what is *specific* to discovering a new idea: the level's coverage, the input-driven scope rules, and the summary checkpoint.

Changed 2026-08-03. Before it, discovery budgeted "2–3 rounds" — a round being a batch of questions in one message — which is why a `/create-prd` invocation felt like one prompt in, one spec out.

### Discovery level

Discovery runs at one of three depth levels. The level scopes both **coverage** (which dimensions get probed) and the **question budget**. See `.agent/agents/team/02-product-manager.md` *Discovery mode* for the canonical level table.

| Level | Coverage | Questions |
|-------|----------|-----------|
| **light** | Blockers only: must-have features, scope boundary, target user, top constraints. **Skip** deep probing of priorities, edge cases, NFRs unless obviously broken. | **3–5** |
| **standard** *(default)* | Scope/MVP, must-haves, target users, key constraints, technologies, top risks. Lighter on edge cases and NFRs. | **8–12** |
| **thorough** | Every dimension: problem framing, user value, scope, features, tech, priorities, constraints, edge cases, NFRs, integrations. | **20+, uncapped until dry** |

The **dry test** and the `Enough — stop asking` escape option apply at every level (protocol § "Budget").

**Selecting the level:**
- **Default: read from `scope_dial.rigor`** (set during the scope-dial kickoff). When the dial is set, that level applies to both discovery and critical review — **do not re-ask**.
- Explicit `discovery-level=light|standard|thorough` (or `low|medium|high`) in slash arguments overrides `scope_dial.rigor` for this stage only.
- A stage-specific signal in the user's message ("go thorough on discovery, light on critical review") overrides `scope_dial.rigor` for the named stage only.
- If `scope_dial.rigor` is unset (legacy resumption, dial explicitly skipped), fall back to `standard`.
- Map `low → light`, `medium → standard`, `high → thorough`. Record the chosen level in run manifest `notes` as `discovery_level: <level>`.

### Discovery scope rules (input-driven, applied within the chosen level)

| Input situation | Discovery scope |
|-----------------|-----------------|
| **Prompt only** (no brain-dump) | **Full discovery within level.** Explore the idea from scratch: what, why, for whom, features, tech, priorities, constraints. Probe to the depth the level requires. |
| **Brain-dump provided** | **Gap-focused discovery within level.** The concept brief already captures the high-level idea, decisions, assumptions, and open questions from a Rubber Ducky session. Do **not** re-explore the fundamentals — read the brain-dump, accept its Decisions as confirmed, and focus discovery on: (1) resolving the brief's **Open Questions** and **Assumptions**, (2) driving high-level items to **requirement-level precision**, (3) probing edge cases, priorities, NFRs the brief did not address — to the depth the level requires. This is convergent refinement, not divergent exploration. |
| **Brain-dump + extra text** | **Gap-focused discovery within level**, scoped further by the extra text (constraints, deltas, focus areas). |

The Rubber Ducky session is loose and divergent — "what could this be?" The PM discovery is targeted and convergent — "what exactly are we building?" When a brain-dump exists, the PM builds on what the Rubber Ducky already explored rather than starting over.

### Brand voice and identity (when the run authors content or has a UI)

**Ask for it, at every rigor level, when the run authors content (`content_authoring` is not `no` and an active pack owns `/author-content`) or has a UI (`ui_variants` is not `skip`).** It is a blocker-level dimension inside the budget, not an extra question round: whose brand this is, the source (a Sitecore brand kit or brand context, guidelines, or "defined here"), who reads it, three to five voice attributes, tone by surface, words to use and avoid, claims allowed, the register default, a short example, and the visual identity. It lands in the PRD's **§ 11a** with the same fields as the `sitecoreai-brand-voice` template, mirrored in one line in the Developer slice. Push back on an adjective list with nothing behind it: "friendly and modern" could be any brand. Under `fully_autonomous`, write the section's fields as `TBD` and raise an `operator_attention[]` entry: **never invent a voice**, because `/author-content`'s entry gate stops on it (`check-brand-voice-section.mjs`).

### Discovery behavior

- **Purpose:** Reach a shared, unambiguous understanding of what should be built — features, technologies, priorities, what matters, what can be ignored, edge cases, constraints — at the depth the chosen level requires.
- **Behavior:** Per the interrogation protocol — **one question per `AskUserQuestion` call**, each anchored to the previous answer, options that are competing hypotheses with their downstream consequence stated. Do not accept vague or hand-wavy answers: push back (max 2) until each answer is concrete enough to become a requirement, then log the remainder as an explicit Assumption with its consequence. Push **once** on any answer that is concrete but never justified — *"you said X; what breaks if we do Y?"*
- **Pacing:** The level's question budget, not rounds. Continue until the level's in-scope dimensions are resolved, the **dry test** fires (two consecutive answers that change nothing in the ledger), the budget is exhausted, or the stakeholder takes the escape option.
- **Ledger:** `plans/interrogation-discovery-<timestamp>.md`, appended after every answer. It is what the constructive spawn reads to write the PRD — the orchestrator never carries the Q&A (rule `72`).
- **Explicit skip:** If the user's message includes **`skip discovery`** (or clear equivalent), proceed directly to PRD writing. Record `discovery: skipped` in run manifest `notes`. Skipping discovery also skips the discovery summary.
- **No operator watching:** under `autonomy: fully_autonomous` **only** there is nobody to grill. Ask nothing, and record every unresolved dimension as a labelled Assumption in the PRD plus an `operator_attention[]` entry. Never fabricate answers. **`gates.spec: false` is NOT this condition** — it removes the stop at the stage's close, not the operator (protocol § "When the grill does NOT run"). Grill, then close soft.

## Discovery summary checkpoint

Once discovery concludes (or `light` finishes its single cluster), the PM produces a short **discovery summary** in chat **before** PRD writing begins:

- **Confirmed decisions** — one bullet each, derived from stakeholder answers
- **Open assumptions** — items the PRD will label as such, not as decisions
- **Deferred / out of scope** — items deliberately set aside
- **Composition** — the resolved `platform` / `method` / `audience` triple. State it explicitly in the recap so the operator confirms it (M0 resolved it silently in the common case, and this is where a *detected* answer gets human eyes on it). **When the platform declares `workspace.naming`, resolve it here** — right after the operator confirms the recap and **before** git setup (step 10). See *Workspace naming* above.
- **Detected SDK surfaces** — when the active platform declares `complexity_triggers.sdk_surfaces`, list every distinct SDK surface the idea touches (e.g. `xmc.authoring.graphql`, `xmc.preview`, `xmc.sites`, `ai.generateBrandReview`, `agent.create_page_with_components`). One bullet per surface.

Then ask the stakeholder to confirm, correct, or extend the recap. **Do not** start PRD writing in the same response — wait for confirmation. This is a cheap insurance pass against misinterpretation, not a second discovery round; keep it tight (under ~15 bullets typical, more only if `thorough`).

### SDK surface heuristic — 3+ surfaces means PHASE (not split)

When the discovery summary lists **three or more new SDK surfaces** (i.e. surfaces this product has not shipped against before; surfaces from a prior shipped PRD do not count), the PM **must** propose **phasing** the work — one SDK surface per phase, with a **probe or real-tenant smoke gate between phases**. Reason: each new SDK surface is a separate failure cliff (response-shape drift, auth scope mismatches, params-wrapper traps, mode-A vs mode-B regressions), and bundling them produces RED tests that pass against shared fiction until the first real-tenant install reveals which surface broke.

**Phases live inside ONE PRD by default.** The phase boundary — not a second PRD — is what carries the smoke protection. Per `.agent/glossary.md` § "Deliverable vs execution unit", **a PRD is a complete deliverable; a tranche is the unit of execution.** Phasing keeps the operator's big picture intact (one spec = one finished thing) while still buying the failure-cliff isolation. Splitting into multiple PRDs is the **exception**, gated below.

**How to propose the phasing (default path):**
1. List the SDK surfaces grouped by likely phase ordering (least-coupled first).
2. State proposed phase boundaries **as tranches**: Phase 1 (surface A) → 🔍 probe/smoke → Phase 2 (surface B) → 🔍 probe/smoke → Phase 3 (surface C).
3. Tell the stakeholder: *"This idea touches N SDK surfaces. I'll phase it inside one PRD — one surface per phase with a real-tenant probe between each. The PRD stays the deliverable; you get N verified checkpoints inside it."*
4. Write the **whole** PRD covering all N surfaces, and record the phase plan in **§ 12a Execution tranches (probe-first)** — one row per phase with its surface, its exit smoke, and what it unblocks. Record `notes.sdk_surface_split: phased` plus `notes.sdk_surface_phases: N`.
5. `/task-breakdown` expands each phase into component-vertical tranches under § 5 in that order; the probe tranches stay blocking and run first within their phase.

**Split escape hatch — requires the shippability test.** Split into multiple PRDs **only** when the stakeholder asks for it, or when the PM judges that each phase is genuinely a standalone product increment. Either way the PM must run the three-leg shippability test from `.agent/glossary.md` § "Deliverable vs execution unit" and **state the verdict per leg, per proposed piece**:

```
SHIPPABILITY TEST — proposed split into M PRDs

PRD-N   <name>
  value  PASS/FAIL — <who uses it on its own>
  ship   PASS/FAIL — <product coherent after /ship?>
  truth  PASS/FAIL — <does its README/CHANGELOG describe a complete capability?>
PRD-N+1 <name>
  ... (same three legs)

Verdict: SPLIT OK (all legs pass, every piece) | PHASE INSTEAD (piece <X> fails <leg>)
```

- **Any leg fails on any piece → do not split.** Phase it inside one PRD per the default path above. The operator may override anyway (their call, per `.agent/glossary.md` § "Operator Gate" — agents propose, the operator decides); record `notes.split_override: "<operator reason>"` so `/ship` flags the bundled-fragment risk.
- **All legs pass on every piece → the split becomes a PROGRAM.** Do not write phase A and leave the rest in prose. Before writing the first PRD:
  1. Assign a program id (`<product-slug>-<short-slug>`, e.g. `aloft-booking`) and a one-line program title.
  2. Write the **program block** into `notes.program` of this run's manifest (see § *Run manifest* below and `.agent/manifests/README.md` § "Program"): `id`, `title`, `total` (M — the FULL count, not "at least"), `index` (this PRD's position, 1-based), `deliverable` (one line: what THIS PRD delivers on its own), and `members[]` — one entry per planned PRD with `id` (`PRD-NNN`, reserved now), `title`, `deliverable`, `status` (`planned` for not-yet-written siblings).
  3. Mirror the same member list into this PRD's **§ 15 Future Opportunities** as a *"Program members (planned)"* subsection so the spec is self-describing too — but the manifest is the source of truth; `STATUS.md` renders § "Programs" from it.
  4. When a sibling is later opened via `/create-prd`, it inherits the program block, sets its own `index`, flips its own member `status`, and **`total` must match across every member** — a member advertising a stale count is the failure this exists to prevent.
- **`total` must be finite and known.** If the PM cannot name M, the work is not ready to split: phase it inside one PRD instead.

**Skip the heuristic** when no active pack declares `complexity_triggers.sdk_surfaces` (nothing with surfaces is in scope), or when the counted surfaces fall below that trigger's `threshold`. The threshold and the action are the pack's, not this command's — a platform whose surfaces are cheap to add may set a different number, and the failure-cliff this protects against is platform-shaped.

- **Continuation:** When the stakeholder replies, fold corrections/additions into the in-flight understanding, then proceed to PRD writing (step 6).
- **Explicit skip:** If the user's message includes **`skip discovery summary`** (or clear equivalent, including `skip discovery` which implies it), skip the recap and proceed directly. Record `discovery_summary: skipped` in run manifest `notes`.
- **No questions asked branch:** If the level is `light` and discovery resolved without any actual stakeholder Q&A (e.g. the brain-dump fully covered blockers), still produce a 3-bullet recap and ask for a one-line confirmation — it is the cheapest gate in the pipeline.

### Sitecore-aware discovery (when the idea touches Sitecore)

**Where the brief declares `overrides.templates.spec`, write the spec from THAT template** instead of
the default. A brief is a genuinely shorter document than a PRD, not a renamed one — the
interrogation that fills it is unchanged, and the same Product Manager writes it.

**When the brief overrides `templates.spec`, resolve every section name through its
`overrides_section_map` before writing.** This file names sections by number — the phase plan
goes to § 12a, the minimal block to § 1.5, Validation lists fifteen — and all of those belong to
the DEFAULT template. Under a swap they may not exist.

- A mapped name → write to the mapped heading.
- A `null` → this template has no counterpart. Write to the declared `fallback` and say so in
  the Operator Checkpoint. **Do not invent a heading, and do not skip the content**: two runs
  had a phase plan and nowhere to put it, and put it somewhere different each time.
- `validation_exemptions` names which Validation checks do not apply and what replaces them.
  An exemption is a declared answer with a reason, never a check quietly passing.

**Where the brief declares `derives_instead_of_asking`, DERIVE those answers — do not ask them.** Read its `derives_instead_of_asking_contract` for the semantics: each entry NAMES the platform question it suppresses, and the resolver has already REMOVED that question from the pool — the brief lists what it dropped under *Questions SUPPRESSED by an active derive*. So the suppression is done for you; what remains yours is to derive the value and **show it back at the summary checkpoint**, which is the only correction opportunity the operator gets. A `suppresses` naming a question no pack asks is an ERROR, not a no-op — it means the question was reworded and the suppression silently stopped applying.
That list exists because the operator for that composition cannot judge the answers (an audience
pack), or because the source already answers them (`method:clone`, whose entries carry a
`derived_value` the brief prints as *default:*) — not because the questions stopped mattering. An
operator who volunteers a different answer overrides the derive. Show each derived value back at the summary checkpoint so a wrong
inference is correctable rather than invisible.

Load the brief's `create-prd` skills **before the second discovery cluster** — each `MANDATORY when`
entry says when — and use what they surface as the **basis for discovery questions**, not as an
afterthought. Add the brief's `hooks.discovery.questions` to the grill; a `method` pack that declares
`replaces_greenfield_question_set` **replaces** the greenfield set rather than adding to it. **Read its companion `replaces_greenfield_question_set_detail` and honour the `drops[]` list:** the replacement is not an equal swap, and each dropped dimension names what it costs. Where a drop matters for this run, either ask it anyway or record the gap in the spec as NOT SPECIFIED — never invent a value for a dimension nobody was asked about. (Measured on a clone run: the swap is 4-for-6; *target users* and *top risks* are dropped outright, and the first is where "who authors this site afterwards" would have been asked.) Otherwise, under the
same `rigor` budget. The skills name the trade-offs a spec on that platform cannot leave unspecified.

**The questions themselves are the pack's, not this file's.** Until 2026-08-23 this section also listed
four of them inline — app architecture, extension points, auth model, and the router choice. All four
were already declared by the packs that own them, so the list was a second copy of data with a single
owner, and the two would have drifted the first time a platform changed its mind. A question here that
the brief does not carry is a **gap in the pack**, to be fixed there.

Some questions `resolve` a `variables` entry (a router, a scaffold mode). Those answers are not merely
recorded — they are substituted into the brief's own `scaffold.command` and skill names later in this
run, so an unanswered one leaves a literal `{placeholder}` in a command. Treat every answer as a
Decision (not an Assumption) once confirmed, and record `sitecore_discovery: completed` in run manifest
`notes` when this branch ran.

Once discovery is complete, all confirmed answers feed directly into the PRD — the document should contain no uncertainties that were already resolved in the conversation.

## Inline research delegation

Discovery and critical review both depend on grounded facts — library versions, vendor APIs, pricing models, regulatory constraints, the 2026 state of patterns and competitors. When a question would require reading multiple sources or verifying a date-sensitive claim, the PM **must** delegate to the **Research Sidecar (`research-sidecar`)** via the `Agent` tool rather than going on a multi-page web search inline. The sidecar keeps the PM context focused on the spec. See `.agent/glossary.md` § "Research Sidecar".

**When to delegate (during this command).**
- **Discovery mode:** the stakeholder asks "what do paywall providers look like in 2026?" or "is Next.js 16 stable enough to depend on?" → delegate before answering. Do **not** answer date-sensitive questions from training data.
- **Constructive mode:** a specific requirement needs a pinned version, an SDK shape, an API contract, or a pricing tier confirmed → delegate `quick`, fold into Technical Considerations.
- **Critical mode:** a claim in the PRD reads suspiciously confident on a date-sensitive fact ("the standard pattern is X", "this library handles Y") → delegate `quick` to verify before flagging or accepting.

**Invocation shape** (for whoever holds the `Agent` tool — normally the orchestrator, since agent 02 does not; the PM raises the question and the orchestrator spawns the sidecar and relays the synthesis back, exactly as `/rubber-ducky` already states for agent 01). A single `Agent` tool call with `subagent_type: "research-sidecar"` and a self-contained prompt:

```
topic: <short subject name>
question: <the specific decision-grade question>
depth: quick | standard | deep   # standard is the default
context: <one sentence — the PRD section / discovery thread this informs>
word_budget: ~300                 # optional soft cap
```

**Depth picker for /create-prd:**
- `quick` — most calls. Single fact, version pin, single-source verification.
- `standard` *(default)* — when the answer shapes a real PRD section (e.g. "what are the top three payment providers we should consider, and what trade-offs?").
- `deep` — reserve for `thorough`-rigor runs where a single decision (e.g. SDK provider, hosting target, auth model) carries the run.

**Handling the response.**
- The sidecar returns inline Markdown with `Bottom line / Key findings / Sources / Caveats / Confidence`. Fold the Bottom line into the discovery answer / PRD section. Carry one or two source URLs into the PRD's **Technical Considerations** or **References** so the spec is auditable.
- If the sidecar returns a **`NEED_CLARIFICATION`** envelope, **stop, do not assume**: relay its `Q1 / Q2 / …` to the stakeholder **as the next grill questions — one per `AskUserQuestion` call**, not as a pasted list (or as the next critical-review challenge). The sidecar has no `AskUserQuestion` access — relay is the contract.
- A sidecar `Confidence: low` finding becomes an **Assumption** in the PRD, not a **Decision**, and surfaces in the Operator Checkpoint at the end of the command.

**Operator Checkpoint surfacing.** When a sidecar call materially shaped a PRD decision (chose a provider, pinned a version, ruled out an approach), mirror it into the final `operator_attention[]` array as appropriate:
- Sidecar `Confidence: high` + clean Caveats → no checkpoint entry needed; the source URL in the PRD is enough.
- Sidecar `Confidence: medium`, or material Caveats → record as a **Concern** with the topic and the caveat ("paywall provider pricing per Sidecar brief; provider X's enterprise tier requires direct sales contact — unconfirmed").
- Sidecar `Confidence: low`, or `NEED_CLARIFICATION` answered with stakeholder best-guess → record as an **Assumption** ("Selected provider X based on Sidecar quick brief; user said 'go with X for now', not independently verified pricing").

**Do not delegate** product decisions, scope calls, acceptance criteria, MVP framing, or stakeholder synthesis — those are the PM's own job. Delegate only the **factual grounding** that those decisions rest on.

**Persistence.** Sidecar calls are inline-only by default. If a sidecar synthesis was long enough that you want it preserved for downstream stages (architect / lead developer benefit from the same grounding), pass `write_to: storage/reports/sidecar/<YYYY-MM-DD>-<slug>.md`. Do **not** write the sidecar response under `project-planning/` — it is not a canonical artifact, and downstream agents read the PRD / ADRs, not sidecar synthesis files.

## Critical review — a chained stage, not an inline step

**The critical review does NOT run inside this command.** It is owned by **`/challenge-prd`**, which this command **auto-chains** into at its close (see *Output rules*). `/create-prd` writes the spec; `/challenge-prd` challenges it, merges the answers, and carries the `spec` gate. Split on 2026-07-29 so each command owns one task and the review gets its own `stage_history` entry (it previously had none, so a crash mid-review was unresumable).

- **Auto-chained, not optional.** `/challenge-prd` is part of the canonical sequence for a PRD run — the Team Lead invokes it at this command's close **without asking**. It is *"if needed"* only in the sense that the operator can decline it explicitly (below). Do **not** present it as a suggestion the operator must opt into; an optional review is a review that does not happen.
- **Explicit skip:** If the user's message includes **`skip critical review`** (or a clear equivalent), do **not** chain. Record `critical_review: skipped` in run manifest `notes`, and this command's close becomes the `spec` gate instead (per *Output rules*).
- **Criticism level** is resolved by `/challenge-prd` itself (from `scope_dial.rigor`, a `level=` arg, or a message signal) — do not resolve or ask for it here.
- **Do not**, in the same assistant response that writes the PRD, also start architecture or declare the run complete. The PRD → prd-minimal → ADRs → manifest sequence (steps 14–19) finishes this command; the review is the next stage.

## Steps

0. **Durability-tiering backfill (schema 8+).** Ensure `project-planning/.gitignore` exists; if the product predates it, copy it from `.agent/templates/project-planning-seed/.gitignore` and `git rm -r --cached` the newly-ignored paths. If the file **already exists but lacks** `plans/interrogation-*.md` (any product seeded before 2026-08-03), append that line — the grill ledger is Tier 3 run-scoped working material, superseded by the spec its answers merge into. Before doing so on a legacy product, rescue anything durable the retired sweep left in `archive/` (`*probe*`, `*smoke*`, `*capture*`, `*spike*`, `ship-report-*` → back to `plans/`) — see `/ship` § 15b-promote. Append a `stage_history` entry `{ stage: "tiering_backfilled", agent: "00-team-lead", ... }` only when the file had to be created.

   **Supersession auto-archive is RETIRED (was schema 7).** This step used to sweep superseded `brain-dump-*.md` / `source-analysis-*.md` into `archive/`. Every family it moved is now untracked by the tiering `.gitignore`, so the move was pure disk churn with no git-visible effect. Specs were already exempt (**PRDs are NEVER archived** — every `prd-NNN.md` stays in the flat `specs/` folder under the highest-NNN-by-family rule), and run manifests under `workflow/` were always exempt. Nothing is moved at any stage now; `notes.archive_skip` is retired with it.

0a. **Refresh `project-planning/STATUS.md` (schema 7+).** Per `.agent/commands/project/templates/status-md.template.md`'s "Generation rules" block. Scan existing PRDs (`prd-NNN.md` files), resolve each PRD's run manifest, project the table row (status / stage / smoke / PRs / manifest). For the NEW PRD being kicked off, add a row with `status: in_progress` and the next available NNN. Write `project-planning/STATUS.md`, overwriting any prior content. Record `canonical_artifacts.status_index` in the run manifest. If this is the very first PRD (PRD-000), the file gets just the new PRD row plus header.

1. **Resolve scope dial and discovery level.**

   **1a. Scope dial.** Resolve it **exactly as the *Scope dial* section above specifies** — that section is the contract; this step is the pointer, and must not restate its mechanics. In order: slash args → message signals → **the M1 pack filter (`--dials`)** → the unattended branch if nobody is reachable → otherwise `AskUserQuestion` calls built from the filter's `ask` list, **re-batched to fit** (the tool caps at 4 per call, so a filtered dial is often two calls, not three). Record the resolved dial at manifest top-level `scope_dial`, plus `notes.dials_preset_by_pack` and `notes.dials_dropped_by_pack_filter` on **every** path. Skip the prompt if the user requested `skip scope dial` or `skip discovery` (the latter implies a minimal-rigor run; record `scope_dial: defaulted` in `notes`).

   > This step used to enumerate the dials and hardcode *"the **three** `AskUserQuestion` calls (batch of 4, 4, 3)"*. It listed 10 of 12 dials — omitting `delivery_parallelism` and `dual_review` — and its own arithmetic summed to 11, matching neither the catalogue nor itself. It also had no unattended branch. Both 2026-08-27 fixes landed in the narrative section above and never reached the numbered step an agent actually executes, which is why it now points instead of restating: **a second copy of a list is a second thing to forget.**

   **1b. Discovery level.** Resolve per *Selecting the level* (above): default from `scope_dial.rigor`; explicit slash arg or stage-specific message signal overrides. Skip resolution if the user said `skip discovery`. Record `discovery_level: <level>` in run manifest `notes`.
2. **Invoke: Product Manager (discovery mode) — the grill.** Spawn via `Agent(subagent_type: "product-manager")` (applies its pinned `model`/`effort` — rule 72). Read `.agent/agents/team/02-product-manager.md` to adopt the Product Manager role, personality, and working style. **Mode: discovery** at the **chosen depth level** (see *Discovery level* and `02-product-manager.md` *Discovery mode* table). Pass **paths, not contents**: the brain-dump path when one exists, the raw prompt, the resolved level + its question budget, and the **ledger path** to write (`plans/interrogation-discovery-<timestamp>.md`).
   - **Task: apply `.agent/commands/project/interrogation-protocol.md` in full.** Interrogate the idea one question at a time — what should be built, which features matter, what technologies apply, what is important, what can be ignored, edge cases, constraints — within the level's coverage. Order by decision value; follow the thread when an answer opens a bigger gap than the next planned question. Push back on every hedge (max 2) and once on every unjustified answer. Append to the ledger after each answer.
   - **Read the input first.** With a brain-dump present, its Decisions are already settled — grill the **Open Questions** and **Assumptions**, not the fundamentals (see *Discovery scope rules*). Re-asking a settled point trains the operator to skim.
   - Return the ≤5-line envelope plus the **ledger path** and the final question count.
   - **Skip this step** if the user requested `skip discovery`, or if no operator is watching (`fully_autonomous` **only** — **not** `gates.spec: false`, which removes the close-stop and nothing else) — in the latter case record every open dimension as a labelled Assumption instead.
3. **Discovery summary checkpoint.** After the grill closes (budget exhausted, dry, or the operator's escape), produce the **"here's what I heard"** recap in chat per *Discovery summary checkpoint* above — built from the ledger's `Nailed down` / `Still fuzzy` / `Explicitly deferred` sections: confirmed decisions, open assumptions, deferred/out-of-scope items. **End this assistant response** with the recap and a request to confirm, correct, or extend it. Do not write the PRD in the same response. **Skip this step** if the user requested `skip discovery` or `skip discovery summary`; record `discovery_summary: skipped` in run manifest `notes` accordingly. When the stakeholder replies with confirmation/corrections, fold them into the in-flight understanding and continue to step 4. Record `discovery_summary: confirmed` (or `confirmed_with_changes`) in run manifest `notes`.
4. Read `.agent/commands/project/dev-flow/templates/prd.template.md`.
5. Read `.agent/manifests/run-manifest.template.json`.
6. Resolve the selected source input(s) from explicit arguments, canonical run manifest, and/or latest-by-timestamp in `project-planning/brain-dumps/`. Apply **Input combination rules** above.
7. Read the selected source file(s) and incorporate any inline prompt text.
8. **Invoke: Product Manager (constructive mode).** Pass **paths only** — the resolved input(s) and the **discovery ledger path** from step 2; the sub-agent reads the ledger itself, the orchestrator never carries the Q&A (rule `72`). **Task:** Transform the resolved input(s) — enriched by the ledger and the confirmed discovery summary — into a complete PRD. Map the ledger per the protocol's *Handoff*: **Nailed down** → requirement text; **Still fuzzy** → labelled Assumptions carrying their named consequence; **Explicitly deferred** → Out of scope / Future Opportunities. **Mode: constructive** — build the spec; apply the detail, rigor, and structure that a Senior PM with full domain expertise brings to requirements writing. Use `.agent/commands/project/dev-flow/templates/prd.template.md` for the output structure. Incorporate every confirmed answer from discovery — the PRD should contain no uncertainties that were already resolved. Apply PRD numbering rules and artifact contract described in this command.
9. Generate the PRD using the section order and structure defined in the PRD template (15 sections: Executive Summary, Problem Statement, Goals and Success Metrics, Target Users, Product Scope, User Stories with Acceptance Criteria, Functional Requirements, Non-Functional Requirements, Technical Considerations, Data Model Overview, UX Considerations, Brand voice and identity (§ 11a, when the run authors content or has a UI; otherwise state "not applicable" under the heading), Release Plan, Risks and Mitigations, Open Questions, Future Opportunities).
10. **Git setup — repository check and branch creation.** Before writing the PRD file, ensure the product has a git repository and create the feature branch. This is the earliest point where the branch name (`prd-NNN`) is known.

   **10a. Repository check.** Resolve the product root — for most products `products/<group>/<product-slug>`. Where the brief declares `repo_setup.topology`, apply it verbatim; its `rule` says whether the product root is itself a repo or an untracked container of several, and its `git_root_check` says where to run the check from:

   **Read the topology off the brief you resolved with `--topology`; do not derive it.** Where the platform offers several, the brief's `repo_topology` line names the resolved one and `repo_setup.topology` already describes *that* one. Content SDK offers two, and both are current:

   - **`repo-per-deployable`** — **`cm/` → its own repo** (the CM / authoring solution; `ser pull` target, CM deploy `--working-dir cm/`; shared by every head app on this CM — the **CMS track**) and **`<head_app_slug>/` → its own repo** (the head app / editing host, deployable `--working-dir <head_app_slug>/`, **plus this run's `project-planning/`** — the **head-app track**). Each sibling head app is an independent repo.
   - **`monorepo`** — **one repo at `cm/`** spanning `authoring/` **and** `sites/<head_app_slug>/` for every head app, with **one** root `xmcloud.build.json` carrying both `authoringPath` and `renderingHosts`. Both cloud environments — the CM env and the editing host — link to this same repo and read that one descriptor. This run's `project-planning/` still lives inside its own head-app folder (`sites/<head_app_slug>/project-planning/`), so two head apps in one repo remain two independent runs whose manifests never collide.

   This command sets up only the repo the brief's `repo_setup.topology.intake_sets_up` names — that is where the spec + planning land. Any sibling repo is set up where its own tree is created.

   **`monorepo` + an EXISTING CM: the repo is the operator's and already exists.** The brief's `repo_setup.topology.existing_cm` is binding, and its three deviations are not optional: no `git init` and **no remote question** (both already answered); the root `xmcloud.build.json` is **edited in place** to add one `renderingHosts` entry, never overwritten from a template (the operator's `postActions` / `scsModules` would be destroyed); and the baseline commit lands **in a repo this framework did not create** — say so at the Operator Checkpoint before making it, mirror it into `operator_attention[]`, and never force-push or rewrite their history. The § 10a table below reads *"product root is inside a git repo → continue to 10b"* for exactly this case: the repo check passes, and first-time repo setup is correctly skipped.

   **NEW vs EXISTING CM (which repos exist) — READ IT, do not re-derive it.** The answer is `variables.authoring_mode` (`new` | `reuse`), resolved at intake by the platform's **AUTHORING** discovery question and recorded on the manifest as `authoring_mode`. Take it from there; do **not** infer it from whether a `cm/` folder happens to exist on disk. Declared 2026-09-01 because three stages — this one, `/discover-sitecoreai` and `/provision-sitecoreai` — each branched on "NEW vs EXISTING CM" while no question asked it and no field recorded it, so all three inferred a *provisioning* decision from a directory listing. The variable carries **no default**, deliberately: both answers are irreversible in opposite directions (`new` consumes tenant surface that must later be torn down; `reuse` writes into an estate other people depend on), so an unanswered `authoring_mode` is a stop, not a fallback.
   - **NEW CM + new head app:** two repos total — create the head-app repo now (here), and the `cm/` repo at provision time. The `<project_slug>/README.md` lists both.
   - **EXISTING CM + new head app:** the CM already has its own repo (the operator's existing authoring solution) — **do NOT create or touch it**; the new editing host simply *connects* to that existing CM env (`cloud editinghost create --cm-environment-id <cmId>`). Only the head-app repo is created (here). The `<project_slug>/README.md` records the existing CM repo as an external reference.

   **Container README (reproducibility).** Where the brief declares `repo_setup.topology.project_readme`, write/update it at the declared path with the declared contents, on its declared `when`. It is the human map of "this project = N repos in these folders" — and because the container itself is untracked, it is the **only durable index of the topology**.

   | Situation | Action |
   |-----------|--------|
   | Product root **is** inside a git repo (own or parent) | Continue to 10b |
   | Product root has **no** git repo (first PRD, freshly created folder) | Run the **first-time repo setup** below, then continue to 10b |

   **First-time repo setup (no existing git repo):**

   1. **Resolve the git-remote strategy — asked ONCE, upfront** (single `AskUserQuestion`, header `Git remote`; skip if a `remote=<url|local|create>` slash arg or a clear message signal already set it). Prompt: *"No git repo at the product root. How should the remote be handled?"* — Options: **`Provide a URL`** (you paste the clone URL of a pre-created empty repo), **`Stay local`** (git init + local commits only — no remote, no push/PR; wire one later), **`Create it for me`** (I run `gh repo create` matching the sibling head-app naming + visibility, then wire + push). Record the choice in the run manifest under `implementation.git_remote`.
   2. **Act on the strategy:**
      - **`url`:** prompt for the clone URL (*"paste the clone URL for the empty repo — no README/.gitignore/license — e.g. `https://github.com/<owner>/<slug>.git`"*); validate the shape (SSH/HTTPS GitHub); re-prompt if malformed. Record `implementation.remote_url`.
      - **`local`:** no remote. Set `implementation.remote_url = null`. Skip the wire+push in step 6 below; `/ship` will commit locally and skip push/PR (records `git_remote: local-only` in the ship report).
      - **`create`:** confirm `gh auth status` is logged in; derive `<owner>/<slug>` from the **sibling convention** (the shared `cm/` remote's owner + the head-app naming pattern — e.g. `<head-app-slug>` → `<brand>-brand` when siblings follow that pattern); run `gh repo create <owner>/<slug> --private` (or `--public` to **match the sibling head-app's visibility`) as an **empty** repo (no `--add-readme`/`--gitignore`). Record `implementation.remote_url` = the created URL. **This is the sanctioned exception to the old "never `gh repo create`" rule — it fires ONLY under the operator-chosen `create` strategy, matching sibling naming/visibility.**
   3. Initialize locally at the product root: `git init`, then `git branch -M main` to pin the default branch.
   4. Ensure a `.gitignore` exists **before** the first `git add` (at minimum: `node_modules/`, `.env`, `.env.local`, `.next/`, `dist/`, `build/`, `.DS_Store`). If one does not exist at the product root, create a sensible default for the stack.

   4a. **Seed `project-planning/.gitignore` (artifact durability tiering) — also before the first `git add`.** Copy `.agent/templates/project-planning-seed/.gitignore` to `<product-root>/project-planning/.gitignore`. Ordering is load-bearing: if the first commit tracks the working material, untracking it later needs a `git rm --cached` migration.

   **Copy the whole seed with `cp -r .agent/templates/project-planning-seed/. <product-root>/project-planning/`** — note the trailing `/.`, which copies dotfiles. A glob (`seed/*`) silently skips `.gitignore` and the tiering never takes effect.

   The file scopes the ignore patterns *inside* `project-planning/`, so they stay relative and self-contained and travel with the seed rather than living as prose duplicated into every product's root `.gitignore`. Tier 1 (spec / ADRs / `baseline.md` / ship reports / probe findings / `STATUS.md` / `tasks.md` / `run-*.json`) is tracked; Tiers 2-4 (minimals, task breakdowns, code-review + test reports, architecture, brain-dumps, UI variants, POCs, `current-run.json`) are produced and read exactly as before but never committed. Contract: `.agent/manifests/README.md` § "Artifact durability tiers".

   4b. **Deployable baseline on `main` — the brief's `repo_setup.deployable_baseline`.** A `null` declaration (with its reason) means nothing builds from `main` on this platform and this substep is inert. Where it is declared, scaffold it **when its `when` says** — before the first commit and before the work-item branch is cut — because `main` must be buildable from the moment the repo exists.

   Read its `failure_if_skipped` before deciding to defer: on at least one platform the first deploy **deadlocks**, and neither obvious workaround recovers it. This is a do-it-now step, not a tidy-up.

   Run the canonical scaffold **literally** — the brief's `scaffold.command` (or `scaffold.commands[<value>]` when the slot declares `command_by`: the value of that variable this discovery recorded, with any `{variable}` placeholder substituted from the recorded value; an unresolved one is a STOP), via the skill its `command_source` names (rule `50-scaffold`: never hand-write `package.json` / `next.config.*`) — into the repo folder alongside the `project-planning/` seeded above:

   Do **not** transcribe the command from this file or from memory. The brief resolves whatever `variables` the discovery questions set, and a pinned generator token drifts past the model's training cutoff — which is the entire reason rule `50-scaffold` exists.

   **Then run the brief's `scaffold.post_assertions` before committing.** They are the platform's own done-tests for its generator — typically that the expected source layout exists *and its alternative does not*, because the two are silently interchangeable at the command line and produce apps that differ structurally. **HARD STOP and report** on any outcome they do not sanction; never hand-edit config or move files to convert one layout into another. If the tool refuses a non-empty target, scaffold into a temp dir and move the app files in **beside** `project-planning/` — never delete or overwrite planning. Then make `main` actually deployable:

   - **The platform's build descriptor**, per `repo_setup.deployable_baseline`. Its `what` names the files and its `xmcloud_build_json`-class keys carry the exact shape, including any name inside the descriptor that **must match a value resolved elsewhere in this run**. Resolve such a name **now** rather than guessing it — the declaration's `failure_if_skipped` states what a mismatch costs, and on at least one platform it deadlocks the first deploy with no workaround.
   - **`.env.example`** — variable **names only, never values** (rule `20-boundaries`). Keep the scaffold's own file if it emitted one.
   - **`.gitignore`** — the scaffold's is authoritative; extend it only if it misses `.env.local` / `.next/` / `node_modules/`.

   **Scaffold ordering — resolved, one answer.** The scaffold **moves earlier, to here.** Downstream, it is a **verify-not-rerun** step: the platform's provisioning stage finds the app already scaffolded and only asserts it — correcting any environment-coupled name in the build descriptor against the real value it creates — and `/implement`'s *Scaffold execution gate* likewise asserts rather than re-runs when the app is already present. The generator runs **once per deployable**, at first-time repo setup. A platform declaring `repo_setup.deployable_baseline: null`, and any run reaching § 10a with an existing repo, are unaffected — this step is inert for them.

   5. `git add .`, then create the first commit with a message that follows the commit-message convention (the `commit-msg` hook will block non-compliant messages such as `Initial commit`). If needed, run `/commit-message type=chore scope=<product-slug> context="initialize repository"` to draft a compliant message. **When 4b ran, this is the baseline commit** — pristine generator output plus `xmcloud.build.json`, `.env.example`, `.gitignore` and the `project-planning/` seed, nothing hand-written. Subject it `feat(scaffold): <generator> baseline for <head_app_slug>` so `/ship` § 18 can identify it.
   6. **If a remote was set (`url`/`create`):** `git remote add origin <remote_url>` then `git push -u origin main`. If the push fails (auth, repo not empty, name collision), stop and surface the error to the stakeholder. **If `local`:** skip — no remote wired, and that is expected. **`main` now carries a deployable baseline**, so `prd-NNN` (§ 10b-ii) branches from something a git-linked editing host can build. Second benefit, and the reason it is worth doing even off Sitecore: the eventual `/ship` PR is **the feature work** instead of the app's entire history — on a real run the scaffold was 69 files / 11,313 insertions inside a 264-file PR.

   **Run `git init` at the product root (`products/<group>/<product-slug>/`), NOT at `site/` or any implementation subdirectory.** The product root holds both `project-planning/` and the implementation code — the git history should span both so planning artifacts, ADRs, task breakdowns, and source code share one commit lineage. A repo initialized inside `site/` strands `project-planning/` outside version control and breaks every downstream stage's ability to correlate planning changes with code changes. **Content SDK (two-level) — the git root is the brief's, not this file's.** Run the brief's `repo_setup.topology.git_root_check` verbatim and assert its stated result; the two topologies put the root in different places and a wrong one is silent:

- **`repo-per-deployable`:** init at the **head-app folder** `products/head-application/<project_slug>/<head_app_slug>/` (NOT the project folder — that is an untracked container). Its `project-planning/` lives inside it, so the head-app repo spans planning + the scaffolded editing host. The `cm/` repo is a **separate** repo (own lineage), created when `cm/` is scaffolded.
- **`monorepo`:** init at **`products/head-application/<project_slug>/cm/`** — the one repo spanning `authoring/` and `sites/<head_app_slug>/`. `git rev-parse --show-toplevel` **from inside the head-app folder must return `…/cm`**. If it returns the head-app folder, a nested repo was created by mistake and the entire CM half is outside version control — a `[BLOCKER]`, not a warning, because both cloud environments deploy from that repo. On an EXISTING CM this init does not run at all (the repo exists).

**Branch naming comes from the brief's `repo_setup.topology.branch_naming`.** `repo-per-deployable` keeps `prd-NNN` unprefixed — separate repos cannot collide. `monorepo` prefixes it (`<head_app_slug>/prd-NNN`), because N head apps share one repo and the second one's `prd-001` would otherwise collide with the first's. Apply the prefix from the **first** head app onward, not once a second appears: a rule that depends on how many head apps exist today changes meaning the day someone adds one.

   **10b. Branch creation.** Derive the branch name from the PRD number just resolved in step 9: `PRD-003` → branch `prd-003` (lowercase, hyphenated). **Then apply the brief's `repo_setup.topology.branch_naming`** — under a `monorepo` topology the name is prefixed (`<head_app_slug>/prd-003`). Let `<BR>` be the resulting name and `<PFX>` its prefix (empty under `repo-per-deployable`); every branch pattern in § 10b-i and § 10b-ii below is `<PFX>prd-*` / `<PFX>frd-*` / `<PFX>bug-*`, so stacked detection scans **this head app's** branches and not a sibling head app's in the same repo.

   **10b-i. Stacked-branch detection (cross-family predecessor in flight).** Before creating the new branch, detect whether work this run depends on lives on an **in-flight** (unmerged) branch — and scan **all three work-item families** (`prd-*`, `frd-*`, `bug-*`), NOT just the same family prefix. An FRD or bug very often stacks on an unmerged **PRD** (a feature/fix built on a PRD that has not merged to the default branch); the old same-family-only rule (`prd-(NNN-1)`) silently defaulted to `main` and **dropped the dependency** — losing the code the new work is built on. Always scan cross-family unmerged branches before defaulting to the default branch.

   1. **Enumerate candidate predecessor branches across all families.** List local (`git branch --list '<PFX>prd-*' '<PFX>frd-*' '<PFX>bug-*'`) and remote (`git ls-remote --heads origin '<PFX>prd-*' '<PFX>frd-*' '<PFX>bug-*'`) work-item branches, excluding the branch being created this run. Under a `monorepo` topology the prefix is what keeps a **sibling head app's** in-flight branch out of this scan — it is unmerged and recent, so an unprefixed pattern would propose it as this run's base and stack the new work on another app's code. Skip detection when this run's branch already exists with prior commits (resume case).
   2. **Filter to unmerged.** For each candidate, run `git merge-base --is-ancestor <branch> origin/main` (or `origin/master`; fall back to the local default branch when there is no remote): return code `1` = unmerged (a candidate base), `0` = already merged (ignore). If **no** unmerged candidate exists, **skip stacked detection** — this is a fresh branch off the default branch.
   3. **Propose the predecessor.** The unmerged candidate with the most recent commit (`git for-each-ref --sort=-committerdate 'refs/heads/<PFX>(prd|frd|bug)-*'`) is the default proposed base. When the same-family immediate predecessor (`<family>-(NNN-1)`) is among the unmerged set, prefer it as the proposal (it is the strongest stacking signal).
   4. **If an unmerged predecessor was found**, ask the user via `AskUserQuestion` (header `Base branch`):
      - **Branch from `<proposed-base>` (Recommended for stacked work)** — pick this when the new work depends on code that landed in that branch and is not yet merged (this includes the **cross-family** case, e.g. an FRD on an unmerged PRD). Expect a clean rebase once the base merges first.
      - **Branch from the default branch** — pick this when the new work is independent of every in-flight branch. Risk: merge conflicts later if a predecessor changes shared files.
   5. Record the chosen base in run manifest `notes.base_branch` (e.g. `base_branch: prd-002` or `base_branch: main`). When stacked, also append `notes.stacked_on: <proposed-base>` (which may be a different family, e.g. `stacked_on: prd-000` for an FRD run).

   **10b-ii. Create the branch.** Use the resolved base branch:

   - Stacked (`base_branch: <PFX>prd-(NNN-1)`): `git checkout <PFX>prd-(NNN-1) && git pull && git checkout -b <BR>`
   - Off main: `git checkout main && git pull && git checkout -b <BR>`
   - If the branch already exists (resumed run or iterated PRD): `git checkout <BR>`

   Record `branch_name` in the run manifest under `implementation`.

   All subsequent writes in this command (PRD file, prd-minimal, ADRs, manifests) land on this branch. All downstream commands (`/architect`, `/task-breakdown`, `/implement`, `/code-review`, `/test`, `/document`, `/ship`, and optional `/source-analysis`) continue on the same branch.

11. Write the PRD to `project-planning/specs/prd-NNN.md` only (no "latest" copy), per agent numbering rules (PRD-000, PRD-001, …).
12. **Do NOT run the critical review here.** It is a separate chained stage — see *Critical review — a chained stage, not an inline step* above and `/challenge-prd`. Continue straight to step 14; the chain fires at this command's close (*Output rules*).
13. *(PRD revision from critical-review answers is owned by `/challenge-prd` — its steps 7–9 merge the answers, re-extract `prd-minimal`, and adjust ADRs. Nothing to do here.)*
14. **PRD minimal — mechanical extraction (schema 7+):** **Do not hand-write a parallel doc.** The full PRD's `## 1.5 Developer slice` section (between the `<!-- PRD_MINIMAL_BEGIN -->` and `<!-- PRD_MINIMAL_END -->` markers in the PRD template) is the authoritative Developer-08 brief. Generate `prd-minimal-NNN.md` mechanically from that span:

    14a. Verify the PRD has the markers. If a freshly-authored PRD is missing them, the PM in constructive mode (step 8) failed to use the template — surface the gap and re-prompt; do not invent the section. (If extracting from an older, pre-schema-7 PRD without markers: hand-write the prd-minimal one last time using the legacy template, then add the markers to the full PRD on the next revision.)

    14b. Read the PRD; locate the byte range between `<!-- PRD_MINIMAL_BEGIN -->` and `<!-- PRD_MINIMAL_END -->`.

    14c. Strip from the extracted span:
    - The leading `<!-- PRD_MINIMAL_BEGIN -->` line (and its trailing newline)
    - The trailing `<!-- PRD_MINIMAL_END -->` line
    - The PRD-side heading `## 1.5 Developer slice (extracted to prd-minimal-NNN.md)` if present in the span
    - The explanatory blockquote `> The Product Manager authors this section…` (and any other PRD-author guidance the template carries before the first content heading)

    14d. Demote the section subheadings one level so the extracted file reads cleanly: `### Problem` → `## Problem`, `### Goal` → `## Goal`, `### Non-negotiables` → `## Non-negotiables`, etc.

    14e. Read `.agent/commands/project/dev-flow/templates/prd-minimal.template.md` (the type-agnostic minimal contract, schema 8+) and prepend **the frontmatter BLOCK ONLY** — the `---` … `---` span — to the extracted content. **Not the file**: the template opens with a comment and an `# Spec Minimal` heading, so a literal prepend of the whole file puts the `---` off line 1 and yields a document with no valid frontmatter. This step said "prepend its frontmatter" until 2026-08-27, and the correction lived only as a comment *inside the template* — so the command kept saying the wrong thing and relied on the reader opening the template first. Resolve the type-parametric placeholders for a PRD run: `document_type: prd_minimal`, `artifact_name: prd-minimal-NNN.md`, `pairs_with_spec: project-planning/specs/prd-NNN.md`; plus `generated_at` / `run_manifest`. (`/create-frd` and `/create-bug` resolve the same placeholders to their `frd_minimal` / `bug_minimal` values.)

    14f. Write the result to `project-planning/specs/prd-minimal-NNN.md` — **OVERWRITES** any prior content. Record `canonical_artifacts.prd_minimal` in the run manifest.

    **Re-extraction rule.** Any later command that edits the full PRD (`/challenge-prd` after merging review answers, `/architect`) re-runs the extraction on its close so `prd-minimal-NNN.md` stays in sync. Manual edits to `prd-minimal-NNN.md` are lost on the next sync — this is intentional; the full PRD is the single source.
15. **ADRs from PRD (when it makes sense):** Read `project-planning/ADR/README.md` and existing ADRs. For each **distinct** architectural or major technical decision not already recorded, create **a separate ADR** (one primary decision per file when practical — see ADR README). Use `project-planning/ADR/template.md` and update the index. Create only what the **written PRD** requires — the review has not run yet, so decisions it may surface are `/challenge-prd`'s to add (its step 8 adjusts ADRs when the merged answers change an architectural commitment).
16. Create or update:
   - `project-planning/workflow/run-<timestamp>.json`
   - `project-planning/workflow/current-run.json`
17. Fill metadata and handoff fields so they reference:
   - the source concept brief path(s) and `prd_input_mode`
   - `/architect` as the default next stage
   - `/source-analysis` only when the operator explicitly provided URL(s) and asked for rebuild parity extraction before planning
   - the planning artifacts produced downstream (architecture/task-breakdown/qa-report; plus source-analysis when that optional stage runs)
18. In the run manifest, record:
   - **`work_item_type: prd`** (schema 8+ — the intake discriminator; `/create-frd` and `/create-bug` set `frd` / `bug`)
   - canonical `brain_dump` path when one was used
   - canonical `prd` path
   - canonical **`prd_minimal`** path
   - `prd_input_mode`
   - `branch_name`
   - `implementation.git_remote` (`url|local|create` — the remote strategy chosen at § 10a) + `implementation.remote_url` when first-time repo setup ran in § 10a (the provided/created URL, or `null` for `local`)
   - **`scope_dial`** — top-level object with `rigor`, `track`, `ui_variants`, `docs_at_ship`, `delivery_loop`, `delivery_parallelism`, `autonomy`, `gates` (`spec`/`design`/`build`/`final`/`go_live` booleans), `extra_stops`, `content_authoring`, `imagery`, `external_reference`, `output_verbosity` (or `notes.scope_dial: defaulted` / `notes.scope_dial: skipped` when not asked)
   - **`packs`** — the resolved triple `{ platform, method, audience }` plus `resolved_by` and its evidence (step 0 / M0). The nulls are recorded EXPLICITLY — `"platform": "none"` says *resolved, and the answer is none*, which an absent key cannot say
   - **`packs.briefs_resolved[]` — stamp this stage's brief once the manifest exists.** The two resolutions above run *before* `--init`, so they cannot record; re-run the resolver here with the final answers to stamp it:
     ```sh
     node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage create-prd \
       --topology <the run's repo_topology, when the platform offers a choice> \
       --record <product>/project-planning/workflow --md >/dev/null
     ```
     Every later stage passes `--record` on its own single resolution. The stamp is written by the resolver as a side effect of composing the brief, so it cannot be asserted without doing the work, and `/ship` fails on a pack-declared stage that has neither a stamp nor a reasoned `packs.briefs_waived[]` entry (`.agent/scripts/check-brief-coverage.mjs`)
   - **`packs`** — `{ platform, method, audience, resolved_by, resolved_at, signals[] }` per `platform-pack.md` § 3. Record the **nulls explicitly** (`"platform": "none"`) — an absent key cannot say *resolved, and the answer is none*
   - **workspace identity** (when the platform declares `workspace.naming`, per *Workspace naming* / `product-workspace.md` § 3): every field its `records` list names, plus `product_slug` / `product_root` set to the run workspace
   - **`repo_topology`** — the resolved value, when the platform's brief offers more than one (`repo_topology.records` names the field). Record it **even when the operator took the default**, and record which it was: every downstream stage re-resolves its brief with `--topology <this value>`, so an absent field silently re-defaults and a `monorepo` run would deploy, ship and publish against repo-per-deployable paths. A single value in the brief means the platform is fixed and there is nothing to record.
   - `discovery: completed | skipped` when applicable
   - `discovery_level: light | standard | thorough` when discovery ran
   - `discovery_questions: <count>` and `discovery_ledger: <path>` when the grill ran
   - `discovery_summary: confirmed | confirmed_with_changes | skipped` when applicable
   - `critical_review: skipped` **only** when the operator said `skip critical review` (so the chain did not fire). When the chain fires, `/challenge-prd` records `critical_review: completed` + `critical_review_level` itself — do not pre-write them here.
   - `notes.base_branch` — resolved base branch from § 10b-i (`prd-(NNN-1)` for stacked, `main` otherwise)
   - `notes.stacked_on: prd-(NNN-1)` when the run is stacked on an in-flight predecessor
   - `notes.sdk_surface_split` — `phased | split | n/a` per the SDK-surface heuristic outcome (`phased` = default path, one PRD with § 12a phases; `split` = shippability test passed and a program was written). Legacy values `confirmed` / `declined` are read-only history.
   - `notes.sdk_surface_phases: N` — phase count when `sdk_surface_split == phased`
   - `notes.split_override: "<reason>"` — **only** when the operator split despite a failed shippability leg; `/ship` reads it to flag the bundled-fragment risk
   - **`notes.program`** — the program block (`id`, `title`, `total`, `index`, `deliverable`, `members[]`) whenever this PRD is one member of a split idea, whether written here or inherited from a sibling. See `.agent/manifests/README.md` § "Program". Absent for standalone PRDs
   - current workflow status

19. **Append `stage_history` entries** per `.agent/manifests/README.md` (Stage history and error recovery). Capture timestamps when each stage actually started and finished; do not invent times.
   - If discovery ran: append `{ stage: "discovery", agent: "02-product-manager", outcome: "completed", … }`. If discovery was skipped, append the same entry with `outcome: "skipped"`.
   - If discovery summary ran: append `{ stage: "discovery_summary", agent: "02-product-manager", outcome: "completed" | "skipped", one_line: "discovery summary confirmed[ with changes — <what changed>]", … }`. **`outcome` is the closed five-value enum** — until 2026-09-02 this line prescribed `confirmed` / `confirmed_with_changes`, which `.agent/manifests/README.md` never permitted, so **every PRD run wrote an illegal value while correctly following this file**. The confirmation detail is not lost: it stays in `notes.discovery_summary` (line 673 above) and in `one_line`.
   - Always append `{ stage: "spec_ready", agent: "02-product-manager", outcome: "completed", … }` after the PRD and prd-minimal are written. On failure, append `outcome: "failed"` with `error` set and stop.

## Validation
Before finishing, verify:
- The product root is inside a git repository
- The current git branch is `<BR>` matching the PRD number — including the topology's prefix where `repo_setup.topology.branch_naming` declares one
- **The git root is where the topology says it is (§ 10a).** Run the brief's `repo_setup.topology.git_root_check` and assert its stated result. Under `monorepo` a `git rev-parse --show-toplevel` that returns the head-app folder instead of the repo root is a **[BLOCKER]** — a nested repo leaves the whole CM half untracked, and both cloud environments deploy from that repo.
- **`repo_topology` is recorded in the manifest** whenever the brief offered more than one value, whether the operator chose or took the default. Absent, every downstream stage silently re-defaults, so a `monorepo` run would provision, ship and publish against repo-per-deployable paths while every one of those stages reported green.
- **Deployable baseline on `main` (content-sdk first-time repo setup, § 10a-4b):** `main` carries the scaffold commit — the build descriptor present **at the target the brief's `repo_setup.deployable_baseline.xmcloud_build_json.target` names** (the head-app root under `repo-per-deployable`; the **repo root**, and nowhere else, under `monorepo`) with `renderingHosts.<key>` equal to the editing-host name, `src/app/` present and `src/pages/` absent, `.env.example` values-free — and `<BR>` branches from it (`git merge-base --is-ancestor main <BR>`). A `main` holding planning artifacts only is a **[BLOCKER]**: it deadlocks the first git-linked editing-host deploy. Under `monorepo`, a **second** descriptor at `sites/<head_app_slug>/` is also a finding, not a harmless duplicate — two files declaring the same `renderingHosts` key is what the blueprint's § 3 invariant 3 forbids. Inert for non-content-sdk products and for runs that found an existing repo (which includes every `monorepo` + EXISTING-CM run).
- The PRD file exists (`prd-NNN.md`)
- **`prd-minimal-NNN.md`** exists and matches the same **NNN**; manifest **`prd_minimal`** is set
- Every required PRD section is present
- **The discovery grill ran one question at a time** — one `AskUserQuestion` call per question, never two in a call and never a numbered list inside one — and the **question count meets the level's floor** (light 3–5 / standard 8–12 / thorough 20+), or it closed early on the dry test / the operator's escape / a documented "grill does NOT run" condition, and that reason is recorded
- **The ledger exists** at `plans/interrogation-discovery-<timestamp>.md`, and the constructive spawn was given its **path**, not its contents — **unless `discovery_mode == "unattended"`**, where no grill ran and no ledger can exist; then `canonical_artifacts.interrogation_ledger` is `null` and `notes.discovery` says `skipped_unattended`. This bullet was unconditional until 2026-08-27: the "grill does NOT run" escape sits on the PRECEDING bullet and never extended to it, so an unattended run faced a check it could not pass and could not waive. Both verification runs reported it independently
- Assumptions are clearly labeled, each carrying its named consequence. When a ledger exists, every `Still fuzzy` item became one; under `unattended` there is no ledger, and the obligation is instead that **every** unresolved dimension is a labelled Assumption or an explicit NOT SPECIFIED
- Each feature has at least one user story and acceptance criteria
- Handoff metadata points to `/architect` as the default next step (or `/source-analysis` only for explicit URL rebuild runs)
- Both run-manifest files exist and point to the canonical **PRD** and **`prd_minimal`** paths
- `branch_name` is recorded in the run manifest
- Discovery reached **one of three** terminal states, and `discovery_mode` says which: completed with real stakeholder interaction at a resolved level (`interactive` / `relayed` — `discovery_level` recorded in `notes`), explicitly skipped by the operator, or **`unattended`** with `discovery_questions_asked: 0`. Until 2026-08-27 this bullet was binary — completed **or** explicitly skipped — and an unattended run satisfied neither branch while `discovery_mode` already existed to name the third
- Discovery summary was confirmed by the stakeholder (with or without changes), explicitly skipped, or **not reachable** — `discovery_summary: skipped_unattended` when `discovery_mode == "unattended"`; when ran, `discovery_summary` is recorded in manifest `notes`
- The critical review was **not** run inline; either `/challenge-prd` is being chained at close, or the operator said `skip critical review` and `critical_review: skipped` is recorded in manifest `notes`
- **`scope_dial`** is recorded at the manifest top level. Every dial is in exactly one state: **resolved** (asked or preset by a pack — `notes.dials_preset_by_pack` names the pack), **dropped** by the M1 filter (`null` + `notes.dials_dropped_by_pack_filter` naming the stage no active pack owns), or **defaulted/skipped** in `notes`. A `null` from the pack filter is NOT a missing value — this bullet demanded `content_authoring` / `imagery` be "resolved" and predates the filter that legitimately nulls them
- **`packs`** is recorded with all three dimensions and `resolved_by`; the legacy `platform_target` is NOT written
- **Workspace naming** (when the platform declares `workspace.naming`): every field in its `records` list is on the manifest, `product_root` matches the declared `layout` — **or `workspace.layout_deviation` records why not** (a bucket beats a pack layout; `product-workspace.md` § 1b) — and the auto-derived slugs were shown to the operator for confirmation. Under `unattended` the tenant-facing names are whatever the operator supplied at the door, and `null` only where nobody did — `workspace.naming_source` records which (`derived_from_slug` for the local half, `operator_supplied` where names were given, `null` with a note where the platform declares no naming block at all). The `required_at` stop fires **only on the names that are still unresolved**: `intake` stops before the spec, `before_scaffold` lets planning run and stops before `/implement`, `go_live` stops at the gate. This bullet had two branches until 2026-08-28 — attended-confirmed, or unattended-with-nulls-and-a-stop — and a run that was unattended WITH supplied names satisfied neither, so it failed either way while behaving correctly
- **Stacked-PRD detection** ran for PRD-N where N > 0 and the predecessor branch exists; `notes.base_branch` is recorded
- **SDK-surface heuristic** ran when the platform declares `complexity_triggers.sdk_surfaces` and the count reached its `threshold`; `notes.sdk_surface_split` is recorded. When no active pack declares it, record `notes.sdk_surface_split: "not_declared_by_active_packs"` — **not** "nothing with surfaces is in scope", which is false for any platform whose whole surface is an SDK. When the outcome was `phased`, the PRD's **§ 12a Execution tranches** actually contains the phase rows (one per surface, each with its exit probe/smoke) — a `phased` note with an empty § 12a is a failed run
- **Split discipline** — if this run split the idea into multiple PRDs, the three-leg shippability test was stated per proposed piece, `notes.program` is written with a **finite** `total` and one `members[]` entry per planned PRD, and § 15 mirrors the member list. If a leg failed and the operator split anyway, `notes.split_override` carries their reason
- No unsolicited review notes file was created
- If the PRD introduced architectural commitments, matching **isolated** ADRs exist or you explicitly recorded why none were needed
- `stage_history` contains entries for `spec_ready` and (when applicable) `discovery`, `discovery_summary`

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage create-prd` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "create-prd", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Output rules
- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Decisions needed / Assumptions made / Concerns / Open questions, in that order, with `— none` when empty. Place it **before** any file-path summary or "next step" narrative. Mirror every non-empty item into the manifest's `operator_attention[]` array (schema 6+) before writing `current-run.json`. Typical sources at `/create-prd`: stakeholder decisions deferred during discovery (assumptions), Open Questions the PRD itself defers (questions), a `sdk_surface_split: split` outcome (**concern** — state `this is PRD <index> of <total> in program <id>; the product is not complete until all <total> ship`), a `notes.split_override` (concern — a shippability leg failed), `scope_dial: defaulted` (assumption), `critical_review: skipped` (concern — the spec is going to planning unchallenged). Critical-review findings are raised by `/challenge-prd`, not here.
- Report the exact file paths written
- State **prd_input_mode** and which source document(s) were used
- Mention whether the source was resolved from the run manifest, explicit path, latest timestamp in `project-planning/brain-dumps/`, or prompt-only
- If the selected input is not detailed enough for a reliable PRD, stop and ask focused follow-up questions
- **Operator gate — SOFT; this command auto-chains into `/challenge-prd`, which carries the `spec` gate.** Per `.agent/glossary.md` § "Operator Gate". The PRD is written but **not yet challenged**, so this is not the handoff the operator confirms — the review stage is. Do **not** stop here and do **not** ask whether to run the review.
  - **Default (chain fires):** end with a one-line "Next: `/challenge-prd` (critical review of the spec just written)" and **invoke it** — the Team Lead spawns the stage per rule `72`. The `spec` gate fires at *that* command's close.
  - **When the operator said `skip critical review`:** the chain does not fire, so **this command inherits the `spec` gate**. Apply it exactly as `/challenge-prd` would — **HARD when `scope_dial.gates.spec` is on** (default): end with *"PRD ready for planning. Reply **YES** to proceed to `/architect`, or describe changes to the PRD / ADRs first. If you want a URL rebuild blueprint first, say so and run `/source-analysis` before `/architect` (choose `full_website_clone` mode when exact full clone parity is the target)."* Stop and wait; the hard stop applies even with all four checkpoint sections at `— none`. **When `gates.spec` is off** (`fully_autonomous`): end with "Recommended next: `/architect`" and proceed.
  - **Either path:** escalate to a hard stop on any `[BLOCKER]` Operator Checkpoint item.
