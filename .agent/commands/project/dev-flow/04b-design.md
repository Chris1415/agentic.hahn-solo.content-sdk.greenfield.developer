---
name: design
intent: planning
writes:
  - products/<product-slug>/project-planning/ui-design/ui-design-<timestamp>-v1.md (and -v2, -v3 when multiple proposals)
  - products/<product-slug>/project-planning/design-prototypes/poc-v1-prdNNN/ (and poc-v2-prdNNN/, poc-v3-prdNNN/ — HTML clickdummies per UI variant)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/agents/team/05-ui-designer.md
  - .agent/commands/project/dev-flow/templates/ui-design.template.md
  - .agent/manifests/run-manifest.template.json
---

# /design — UI design + POC clickdummies (after /architect, before /task-breakdown)

## Pipeline position

Standalone stage extracted from `/architect`: `… → /create-prd → /architect → **/design** → /task-breakdown → …`. The Architect designs the system; `/design` realizes it visually. Runs on the same feature branch. **Optional** — skip when the work has no UI scope (the operator declines, or `scope_dial.ui_variants == skip`) — **unless a pack replaces the stage body**, in which case it always runs; see step 0.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. All `project-planning/...` paths are under **`products/<product-slug>/project-planning/`**.

## Work item type routing

Read `work_item_type` (missing = `prd`). **`prd`/`frd`:** run when UI scope exists. **`bug`:** not applicable — stop and report the misroute.

## Inputs (slim context)

- Run manifest `canonical_artifacts.architecture` (full track) or the PRD (minimal track) + selected ADRs — for the design constraints.
- `canonical_artifacts.content_model` (an existing-site rebuild, per the architect brief's `existing_site_rebuild`) — the design must fit the real datasource field types.
- `scope_dial.ui_variants` (`skip` / `1` / `2` / `3`) and `ui_design.divergence` if already set.
- The reused `run_id`/timestamp from `current-run.json`.

## Sub-agent orchestration

Per `.agent/WORKFLOW.md`: the Team Lead spawns the **UI Designer (05)** as isolated sub-agent(s) with only the inputs above. Each writes its artifact and completes; the Team Lead validates and presents at the gate.

## Steps

0. **FIRST — does a pack REPLACE this stage?** Read the brief's `overrides.stage_body`. If it is
   present, **open that file and follow it instead of every step below** — including the skip
   logic in step 1. Do not read `scope_dial.ui_variants` at all on this path.

   > **This check is step 0 because it used to be step 2, and the skip-exit in step 1 reached it
   > first.** A `method` pack that replaces this stage also presets `ui_variants: skip` — correctly,
   > since there is nothing to diverge from when the design is derived from an existing artifact.
   > Following the command in order therefore SKIPPED the stage and silently dropped the
   > replacement: its loop, its bound and its gate. `ui_variants: skip` means *"do not produce
   > divergent variants"*, never *"do not run this stage"* — and where a pack replaces the body,
   > the stage very much runs. Measured by a real clone run, 2026-08-25.

   **The gate token comes from the brief's `carries_gate`, not from this file.** A replaced stage
   still closes on a token — the operator's judgement moves to a different artifact, it does not
   disappear — but *which* token is the replacement's to declare.

1. **Resolve count + divergence.** Read `scope_dial.ui_variants`. If unset, ask: "Do you want UI design specification(s)?" If yes: how many **proposals** (1/2/3) and how **fundamentally different** (subtle / moderate / radical → `ui_design.divergence`). Then ask as many follow-up questions as needed to align on a strong visual direction (audience, devices, brand, accessibility, references). **If declined — and only when step 0 found no `overrides.stage_body`:** append `stage_history` `{ stage: "ui_ready", agent: "05-ui-designer", outcome: "skipped" }`, leave `ui_design.variant_paths` empty, and recommend `/task-breakdown`. **A replaced stage is never skipped**, whatever the dial says.

2. **Spawn UI Designer.** Prompt: read `.agent/agents/team/05-ui-designer.md` for identity (spawn it via `Agent(subagent_type: "ui-designer")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). **Task:** produce implementable UI design specification(s). Apply the count + divergence. Use `.agent/commands/project/dev-flow/templates/ui-design.template.md` per variant (intent + delta-from-baseline; ~200-line soft cap when a POC accompanies it: § 1 named direction ≤60 words, § 2 inherited baselines (reference, don't redescribe), § 3 direction deltas, § 4 state-coverage matrix with POC frame refs, § 5 responsive, § 6 a11y verified on the POC, § 7 open questions). The POC HTML is the visual source of truth — do not re-prose visuals. Use web search to ground inspiration; summarize, don't copy.

   *(The pack-override check moved to **step 0** — it has to precede the dial read, not follow it.)*

   **The gate token comes from the brief's `carries_gate`, not from this file.** A replaced stage
   still closes on a token — the operator's judgement moves to a different artifact, it does not
   disappear — but *which* token is the replacement's to declare. Hardcoding `design` here would be
   right by luck today and wrong the first time a pack replaces a stage that carries a different
   one. A replacement that declares no token **may not invent a stop**: it closes soft
   (locked decision 7 — a pack never adds a gate token).

   **Design-system enforcement — the design brief.** Run `node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage design --record <product>/project-planning/workflow --md` (the `--record` flag stamps `packs.briefs_resolved[]` as a side effect of composing the brief — `/ship` fails on a pack-declared stage that has neither a stamp nor a reasoned waiver) and put its skills + constraints in the sub-agent prompt. Where the composition mandates a design system, name every component by its real registry slug, reference real semantic tokens (**no invented hex**), treat divergence as composition/layout/motion variation **inside** that token system, and call out missing primitives explicitly. A design-system mandate is waived only by an architecture-stage opt-out, and the opt-out is recorded.

   > The UI Designer (05) does hold Bash, so it can resolve this itself. Where an orchestrator
   > has already resolved the brief, pass it down rather than resolving twice.


   **Design ledger — the plan is reviewed against what the estate already shipped (2026-09-11).** Before any HTML, each UI Designer writes the compact token plan (light ground / ink / accent as `oklch()` literals, display + body family class) and runs `node .agent/scripts/designs-ledger.mjs check --ground <css> --ink <css> --accent <css> --display <family>` against `designs/ledger.json` (the measured, append-only record of every shipped head app and every prior design-gate variant — `designs/ledger.md` is its readable view; `designs/` is the sibling of `project/`, see root `CLAUDE.md` § Configuration). **A plan whose ground / ink / accent sit in an occupied band on ≥ 2 axes is REJECTED (exit 1) at the review-for-genericness pass and re-planned; a display-family repeat is a WARN the plan must answer with why no other face.** Why a script and not a sentence: measured across the seven shipped apps, six of seven sit in one warm-paper ground cluster at ΔE_OK 0.009 and five of seven carry a serif display, and *no* stage could see it — the only per-run memory was `selected_poc_path`. The bands are per axis and calibrated on that estate (two sites of one style must read as *the same*; the cream + terracotta cliché must fail on all three axes). Brand-forced constants (a real brand's mandated colour) are exempt from the check — record the exemption in the spec's § 1. An empty ledger exits 2, not PASS: run `backfill` first.

   **Apply every `constraint` in the brief as a first-class design dimension** — not as a footnote. Where a platform says empty fields, missing optional fields and author-overlong strings are first-class, a design that only shows the happy path is incomplete; where editor chrome attaches at runtime, component edges need breathing room the mockup must actually show.

   **Skill roles + variant leads (when the brief declares `skill_roles`, 2026-09-11).** The design skills in the brief are ROLES, not a catalogue to skim: `spine` (the process and the tell list; wins conflicts), `direction`, `taste_preflight`, `product_polish`, `motion_build`, `critic`, `ledger`. Put the brief's `skill_roles` block in every UI Designer prompt verbatim, including `precedence` — two of the skills contradict each other and one contradicts rule 86, and an agent that loads them flat follows whichever it read last. **For 2 or 3 variants, divergence comes from METHOD, not from adjectives:** assign each variant the lead the brief's `variant_leads` names (v1 spine / subject-grounded · v2 impeccable seeded world roll, index 3..7, the seed recorded · v3 taste dials + one named palette family, or `product_polish` as lead on a product-UI archetype). Same spine, same constraints, same ledger check, same critic for all of them; the lead is recorded in the variant spec § 1. Without a `skill_roles` declaration (a platform whose pack mandates a design system, e.g. Blok), none of this applies — the design system is the lead.

   **Multi-proposal (parallel):** for **2** or **3**, spawn separate isolated UI Designer sub-agents in parallel — one per variant (v1/v2/v3), same inputs, different variant assignment (and different `skill_roles.variant_leads` lead, above) — each writing `ui-design-<timestamp>-vN.md`. All run simultaneously (blocking). Update manifest `ui_design`: `proposal_count`, `divergence`, `variant_paths[]`. **Then output:** "UI design specs are complete — building the clickable HTML prototypes now." **Do not stop and wait** — the specs are an intermediate artifact, not the thing the operator approves. The stage's single operator stop is the **winner pick** in step 5 (the `design` gate), so that unticking `gates.design` genuinely yields an unattended stage. Escalate here only on a `[BLOCKER]` (e.g. no variant could be written).

3. **POC clickdummies (mandatory when proposals exist).** For **every** variant, create a self-contained HTML clickdummy openable via `file://` (no build step).

   **Output:** `project-planning/design-prototypes/poc-vN-prdNNN/` under the product root (`NNN` = zero-padded PRD ID — prevents cross-PRD overwrite). Each folder ≥ `index.html` + assets. **Parallel:** spawn one sub-agent per POC, each reading its spec and writing its `poc-vN/` folder (blocking). Validate each folder has `index.html`.

   **Design-system-grounded POCs:** each POC sub-agent loads the brief's design-system skills before writing HTML/CSS. Pull real theme tokens (registry stylesheet, or copied token values carrying a source comment), use the real token names (**never fabricated hex**), use the system's typography, and mirror real component anatomy. Visual fidelity to the mandated system must be unmistakable.

   **Fidelity:** faithful to typography/colors/spacing/hierarchy, layout + responsive (desktop + mobile), key screens + navigation flow (clickable), component states (hover/active/empty). **Per-action post-states (one frame per click target)** — generic labels ("drilldown drawer") are forbidden when a surface has >1 click target; each distinct target gets its own named frame (a conflated label can wire the wrong click target to the wrong drawer). Interactive logic / real data / APIs are out of scope.

   **Click-targets enumeration (mandatory):** each POC ships `click-targets.md` next to `index.html` enumerating every clickable element → its post-state frame (Screen | Element | Click → | Post-state file). Generic post-state labels forbidden. The Lead Developer reads it at `/task-breakdown`; QA verifies each row during smoke.

4. **Critic + variant scoring.** Spawn a **FRESH** agent — never a UI Designer that authored a variant — as the critic: the Product Manager (02) in evaluation mode (`Agent(subagent_type: "product-manager")`) or a fresh 05. When the brief declares `skill_roles`, the critic loads the `critic` role's skills (impeccable `critique` + `audit`, `review-animations`, the taste tell list, the spine's tell list) and works every POC through them **plus** the mechanical checks (every href resolves, both theme blocks, the brief's constraints visible in frames, `designs-ledger.mjs check` on the shipped tokens), emitting findings `{axis, where, what, fix}` and a verdict per variant: **accept | fix | rebuild**. A `fix` verdict loops once to the variant's author with the findings; a `rebuild` re-runs the token plan with the same lead. With 2+ variants the critic also scores each 1–10 on visual harmony, theme consistency, mobile responsiveness, accessibility, implementation feasibility and outputs a ranked table + recommended winner — the score is advisory; the findings are not.

5. **Handoff — the `design` gate (winner pick).** Present each variant (named direction, POC path, one-line aesthetic; include the critic table if run). **This is the stage's single operator stop, and it fires iff `scope_dial.gates.design` is on** (default on — the operator ticks/unticks it in the `/create-prd` kickoff gate multi-select):

   - **`gates.design` ON (default) — HARD.** Ask: "Open each `index.html`. Which wins — v1/v2/v3? Or changes?" **Stop and wait** for the pick.
   - **`gates.design` OFF** (custom / `fully_autonomous`) — **auto-select** the top-scored POC from step 4 (or `v1` when unscored), record `notes.design_winner_autoselected: <variant>` plus the reason (score or default), mirror it into `operator_attention[]` as an assumption, and continue **without stopping**.

   After the pick (operator's or auto-selected):
   1. Record `ui_design.selected_variant_path` + `ui_design.selected_poc_path`.
   2. Populate the winning spec's **§ 8. POC reference** (winning clickdummy path; selection rationale; "the HTML clickdummy is the canonical visual source of truth — when spec text and clickdummy diverge, the clickdummy wins; the Lead Developer cites POC frames in task-breakdown § 4c-4").
   3. Apply any requested changes to **both** the winning POC and spec.
   4. Append `stage_history` `{ stage: "ui_ready", agent: "05-ui-designer", outcome: "completed" }`.
   4a. **Append one ledger row PER VARIANT** — the winner *and* every rejected one, with the operator's one-line reason (a rejection reason is the only calibration data that matches the operator's taste, and a rejected direction is a spent band too): `node .agent/scripts/designs-ledger.mjs append --id <product>/prd-NNN/vN --product <slug> --variant vN --picked yes|no --reason "<operator's words>" --ground <css> --ink <css> --accent <css> --display <family> --body <family>` (values from the variant's POC stylesheet — measured, never re-typed from the spec). The ledger is append-only; a re-pick after change requests is a new id (`…/vN@2`). Record `notes.design_ledger_rows: [<ids>]` in the manifest so `/ship` can see the stage wrote them.
   5. **Output:** "Design direction locked. The winning clickdummy at `project-planning/design-prototypes/poc-vN-prdNNN/` is the visual source of truth. Recommended next: `/task-breakdown`." **Do not stop a second time** — the winner pick above already *was* the `design` gate, and asking twice in one stage is the over-stopping the gate model exists to prevent. (When the operator's pick came with change requests, apply them, re-present the revised POC, and confirm that revision — that is the same single gate iterating, not a new one.)

6. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md`. Default-skip.

## Validation

- When UI proposals were produced: POC clickdummies exist in `project-planning/design-prototypes/poc-vN-prdNNN/` (each ≥ `index.html` + `click-targets.md`), a winner is selected (operator pick under `gates.design`, else auto-selected + recorded in `notes`), `ui_design.selected_poc_path` is set, and the winning spec's § 8 is populated. Variant spec length respects the ~200-line soft cap.
- **Design-system conformance (where the composition mandates one, absent an opt-out):** each spec references ≥1 real registry slug + real semantic tokens (no invented hex); each POC pulls the theme tokens and uses the real token names. Opt-out recorded if chosen.
- `stage_history` has a `ui_ready` entry (`completed` when produced, `skipped` when declined).

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage design` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "design", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Output rules

- **Begin with an Operator Checkpoint** per `.agent/glossary.md`. Mirror non-empty items into `operator_attention[]` with `stage: "design"` (e.g. variants selected without opening the POC → concern; deferred Blok-conformance items → concern).
- **Operator gate — `design` gate (default HARD: operator picks the POC winner).** `/design` is the `design` gate (glossary § "Operator Gate"). **When `scope_dial.gates.design` is on** (default), the operator must **pick the winning POC** before continuing — locking design taste before implementation copies it — then it recommends `/task-breakdown`. **When `gates.design` is off** (custom / `fully_autonomous`), **auto-select the top-scored POC** (or `v1` if unscored), record the auto-pick in `ui_design.selected_poc_path` + a `notes` entry, and continue with "Recommended next: `/task-breakdown`". **Critical triggers → hard stop regardless of the gate:** (a) UI proposals produced but *none* is selectable (all failed validation); (b) a design-system conformance hard-fail on a run whose composition mandates one, with no recorded opt-out; (c) any `[BLOCKER]` Operator-Checkpoint item.
- If the user asks to redo, repeat the stage interactively and overwrite the artifact.
