> **This is the COMPLETE framework glossary, not a filtered one.**
> This export is `content-sdk.greenfield.developer` (platform:content-sdk).
> Terms below that belong to **platform:marketplace, method:clone, audience:marketer, source:sitecore-xm-xp** describe compositions this export does
> **not** carry — they are retained deliberately, because core prose cites them and a
> filtered glossary would break references that are correct. Read them as background, not
> as instructions for this flow.

# Framework Glossary

Single source of truth for terms invented by this framework. Pipeline commands and agent identity files reference these concepts by their natural names (e.g. `§ 4c`, "soft cap", `STATUS.md`, "design-polish") instead of redefining them inline — this file is the canonical definition each one points back to.

**Out of scope.** This glossary does **not** define Sitecore SDK terms (Mode A / Mode B, ClientSDK, extension point, BYOC, draftMode, pages.context, params-wrapper trap, Edge context, iframe handshake). Those are owned by the `sitecore:*` skills (e.g. `marketplace-sdk-client`, `marketplace-sdk-lifecycle`). PRDs and ADRs cite the skill, not this file.

**This file defines TERMINOLOGY — it is NOT an execution rulebook, and nothing forces an agent to read it.** Enforceable execution rules (what an agent MUST do, when a run stops, what a gate fires) live where they are **guaranteed to load**: the `alwaysApply: true` `.mdc` rules under `.agent/rules/` and each command's own **Output rules** / step list. Where an entry here summarizes a rule's behavior (e.g. § "Operator Gate", § "Delivery loop"), **the rule and the command playbook are the source of truth** and this entry is a convenience pointer that may lag — read the cited rule/command before acting on a behavior described here. Do not encode a NEW execution rule only in this glossary; put it in an `alwaysApply` rule or a command, then point here.

---

## Pack (platform · method · audience · source)

A **declarative folder holding one domain's knowledge**, under `.agent/packs/<kind>/<id>/`. Packs are the third leg of the framework's separation: *agents are identities, commands are tasks, **packs are domains***. Before them, domain had no home and leaked into both — measured at **100 `platform_target` references across 32 files**, plus a "generic" agent layer that was in fact Content-SDK-shaped.

A run resolves **one value per dimension** — `platform` (what you build ON: content-sdk / marketplace / **none**), `method` (where the spec comes FROM: greenfield / **clone**), `audience` (who operates it: **developer** / marketer). The bolded values are the **nulls**: they inject nothing and have no directory, so all-null = the generic pipeline. Resolution happens at **intake step 0** by the ladder **inherit → detect → ask** (§ "Pack resolution (M0)"). 10 of 12 combinations are runnable; `marketplace × clone` is declared `incompatible_with` and refused. A fourth dimension, `source` (null **none**), exists only for `/migrate` and is additive only — § "Source pack".

A pack declares five things — **`skills`** (with a load policy: `always` / `mandatory_when` / `when_relevant`), **`additions`** (items appended to a list core owns), **`hooks`** (ordered steps at a named **anchor**), **`overrides`** (replace a stage body or template), and **`slots`** (a named value a stage renders inline, e.g. `scaffold`, `definition_of_done`). A pack may also **own** stages and agents, which then live inside it — `platform:content-sdk` owns seven stages (six pipeline stages + the on-demand `/doctor`) and agents 13 + 14; `method:clone` owns `/source-analysis` and agent 99. A pack-owned agent is a **first-class agent**: same frontmatter contract, same registry, same mirror; only its location differs.

**Two ownership rules carry the combinatorial safety, and neither is optional.** *One owner per **slot**, per stage* and *one owner per **scope dial***. The original design claimed collisions were "impossible by construction" because each kind may override a disjoint **range of stages** — true for whole stage bodies, **false for slots inside a stage both kinds legitimately touch** (`/implement` is exactly that case). Contract: **`.agent/packs/README.md`**. Enforcement: `.agent/scripts/resolve-packs.mjs`, run over every runnable combination by `validate-framework.mjs` § J.

**A pack may never add a gate token.** It may contribute a stage that *carries* `go_live`; it can never invent a token or a stop the operator cannot untick (§ "Operator Gate"). The conditional `model` token is core-owned; a source pack only states when it applies.

## Pack resolution (M0)

The **step-0 intake moment** that resolves the run's composition — one value per dimension — *before* the scope dial and *before* the discovery grill. Contract: **`.agent/commands/project/platform-pack.md`**.

**Ladder, first hit wins:** *inherit* (the product's last manifest) → *inherit-legacy* (derive from `platform_target` on a pre-pack manifest) → *detect* (each pack's own `detect.signals`, where a `strong` signal alone resolves and `corroborating` signals alone never do) → *ask* (ONE `AskUserQuestion`). **An existing product never re-answers it**, and **ambiguity stops rather than guessing** — two strong signals from different packs is an ask, not a coin flip.

**Why step 0 and not step 3.** The scope dial used to be asked *before* the platform was known, which is backwards: `content_authoring` is **defined** in terms of the platform and survived only because its `auto` value defers evaluation. `imagery` and `ui_variants` had no such escape.

M0 records `packs{}` only — the legacy `platform_target` field is **retired (2026-08-23)** and is written by nothing. Rung 2 still READS it off a pre-packs manifest, which is the migration path. A divergence between the two was bug in M0, never a new capability. `/rubber-ducky` is excluded — a premature platform lock contradicts divergent exploration, so Ducky may record a *hint* and the intake command resolves it.

## Pack brief

**The generated text a stage reads** in place of restating a platform's lists inline:

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --stage <s> --md
```

It is produced on every invocation, which is the point: **two hand-maintained lists drift by construction** — `08-developer.md` conceded exactly that (*"commands name these too — prefer the invoking command's list"*) — and one generated list cannot. An empty brief means the composition is null and the stage runs generically; that is a resolution, not a missing pack.

**The split it enforces: core owns the mechanism, the pack owns the data.** The clearest case is `/test` — core owns the route-crawl, destination-distinctness, motion-ON, responsive and containment assertions; the pack owns only the **harness** (how to reach the surface). Before packs, "these assertions are surface-agnostic" was true but unactionable, because the only way to run them for a second platform was to duplicate the block and let the copies drift.

**What a brief cannot do:** a `when:` predicate is **model-evaluated prose**, not an executable condition. Only `load: always` and file existence are machine-checkable. Packs make predicates visible and reviewable in one place; they do not make them run.

## § 4c — Implementation execution contract

Section 4c of the task breakdown. Seven subsections (`4c-1` through `4c-7`) the Lead Developer (06) fills so the Developer (08) has everything needed without opening upstream docs.

| Subsection | Purpose |
|---|---|
| 4c-1 | Non-negotiable technical boundaries (one bullet per constraint, ADR refs) |
| 4c-2 | ADR one-liners — the decision restated in one line per affected ADR |
| 4c-3 | Stack / tooling specifics (package manager, test runner, build command, scaffold command) |
| 4c-4 | UI implementation notes (tokens, typography, spacing, copy, POC path) |
| 4c-5 | File / module structure and naming conventions |
| 4c-6 | Integration / API contracts (SDK keys, request/response shapes, `.d.ts` paths per rule `40-sdk-contracts.mdc`) |
| 4c-7 | Parity / rebuild pointers (or `N/A — greenfield`) |

**Gate rule.** Each subsection must be filled or explicitly `N/A — <reason>`. Blanks block handoff to QA (07). The full template lives in `.agent/commands/project/dev-flow/templates/task-breakdown.template.md`.

## Output verbosity

Mid-turn **chat narration** control — `minimal` (silence between tools; results-only; escalate when blocked) vs `verbose` (short progress OK when an operator is watching). Distinct from the **slim context chain** (which cuts *input* tokens) and from rule `72`'s decision-grade envelope (which cuts *handoff* size). Rule `73-output-verbosity.mdc`.

Resolved per spawn from: spawn-prompt override → `scope_dial.output_verbosity` (`auto`/`minimal`/`verbose`) → `fully_autonomous` force-minimal → agent frontmatter `output_verbosity:` pin. Team Lead injects `Output Level: <minimal|verbose>` on every specialist spawn. Artifacts on disk are never shrunk; only transcript chatter is.

## Slim context chain

The discipline that downstream agents load only the inputs mandated for their stage — not the accumulated context of prior stages. Enforced structurally by sub-agent isolation: each specialist runs in its own context with only its mandated input file paths. The full input table per agent lives in `.agent/WORKFLOW.md` § "Slim context chain (token discipline)". Developer (08) in `/implement` loads **prd-minimal + enriched task breakdown only** — never full PRD, architecture, or UI specs.

## Interrogation protocol (the grill)

The shared question-asking contract for the two operator-facing spec stages — **`/create-prd` discovery** and **`/challenge-prd` critical review**. Both are an interrogation, not a questionnaire: **one question at a time**, each derived from the previous answer, pushing back on every hedge, until nothing unresolved would change what gets built. Source of truth: **`.agent/commands/project/interrogation-protocol.md`** (both commands `depends_on` it; agent 02 cites it).

- **Runs inside the spawned specialist**, never the orchestrator (rule `72`) — so the PM's pinned `model`/`effort` applies and the orchestrator never carries a 12-turn dialogue. Every question carries **2–4 options** that are the PM's own competing hypotheses, each option's description naming the downstream consequence, plus the auto-supplied free-text "Other" — and **exactly one question per turn**. Two channels deliver it: `AskUserQuestion` when the spawned agent holds the tool, otherwise **relay** — the agent emits one fully-formed question (options and all) to the orchestrator, which passes it to the operator verbatim and returns the answer. Frontmatter `tools:` is a declaration of intent, not a runtime guarantee, so the channel is checked at spawn time rather than assumed; relay is a first-class path (the Research Sidecar works that way by design) and changes nothing else about the loop.
- **Depth is counted in questions, not rounds** — `scope_dial.rigor` sets the budget: `light` 3–5, `standard` 8–12, `thorough` 20+ uncapped. The count is a **floor, not a target**. Replaces the pre-2026-08-03 "1–3 rounds" pacing, where a round was a batch of grouped questions in one message — the mechanic that made a spec stage feel like one prompt in, one document out.
- **Push-back is mandatory.** A hedge is re-asked narrower (max 2) and then logged as an Assumption carrying its consequence; a concrete-but-unjustified answer is challenged once (*"what breaks if we do Y?"*).
- **Ends on** the budget, the **dry test** (two consecutive answers that change nothing), or the standing `Enough — stop asking` option offered once the level's floor is met.
- **The ledger** at `project-planning/plans/interrogation-<stage>-<timestamp>.md` (Tier 3, gitignored) holds `Nailed down` / `Still fuzzy` / `Explicitly deferred` / `Transcript`, appended after every answer. The constructive spawn that writes or merges the spec reads it **by path** — the orchestrator never relays the Q&A. Makes an abandoned grill resumable.
- **Every question carries a recommendation.** The PM's own answer goes first, suffixed `(Recommended)`, with the reason in its description. A stage that surfaces problems without proposing answers pushes the analytical work back onto the operator, which is the opposite of the point.
- **Does not run** only when there is genuinely nobody to answer — `autonomy: fully_autonomous` (every gate off = zero human interaction by definition) — or on `work_item_type: bug`, an explicit `skip discovery` / `skip critical review`, or an operator batch request. **A single gate token being off is NOT one of these.** `gates.spec: false` removes the *stop* at that stage; it says nothing about whether the operator is present, and treating it as absence silently converts a spec review into a monologue. When the grill genuinely cannot run, every gap becomes a labelled Assumption — never a fabricated answer.
- The cold-read analysis runs on **Sonnet** (`model: "sonnet"` at spawn) and the grill runs on the PM's own Opus pin, so the two are always separate spawns. Under `dual_review: on` or `fable`, only the **cold-read analysis** doubles; exactly one grill runs against the arbitrated gap list.

## Research Sidecar

The on-demand inline research delegate (agent `03-research-sidecar`). Requested by Rubber Ducky (01) during `/rubber-ducky` or Product Manager (02) during `/create-prd` discovery and critical review when a fuzzy claim, library question, or market datum needs grounding in current sources without polluting the caller's context. **Spawned by whoever holds the `Agent` tool — normally the orchestrator, since neither 01 nor 02 has it** (`01` = Read/Write/Edit/Glob/Grep/AskUserQuestion/TaskCreate; `02` adds WebFetch/WebSearch but no `Agent`); the requesting agent states the `topic` + `question` + `depth` and the orchestrator runs it and relays the synthesis back. Neither agent may guess from training data because it cannot reach the sidecar itself. Bounded to a single `topic` + `question` per invocation under a `depth` dial (`quick` / `standard` / `deep`). Returns a short, decision-grade synthesis inline (Bottom line / Key findings / Sources / Caveats / Confidence) — or a `NEED_CLARIFICATION` envelope when the question is too underspecified to answer. **A tool, not a stage** — does not write under `project-planning/`, does not append `stage_history`, does not block the pipeline. Distinct from the scheduled research pipeline in a separate research repo. When the sidecar returns `NEED_CLARIFICATION`, the calling agent relays the questions to the user (the sidecar has no `AskUserQuestion` access by design).

## prd-minimal

A trimmed PRD addressed to the Developer (08). Same numeric ID as the source PRD (e.g. `prd-minimal-001.md` for `prd-001.md`). Contains the goal, non-negotiables, in/out of scope, success criteria, and constraints — not the discovery, alternatives, or rationale. Together with the enriched task breakdown it is the Developer's complete input set.

**Mechanical extraction (schema 7+).** `prd-minimal-NNN.md` is **NOT hand-written** in parallel with the full PRD. The full PRD's `## 1.5 Developer slice` section (between `<!-- PRD_MINIMAL_BEGIN -->`/`END` markers) is the authoritative source; `/create-prd` step 14 mechanically extracts that span at the close of the command (strip markers + PRD-side heading + blockquote, demote subheadings one level, prepend the prd-minimal frontmatter, OVERWRITE the file). Any later edit to the full PRD (`/architect` post-architecture sync, `/challenge-prd` revisions) re-runs the extraction. Hand-edits to `prd-minimal-NNN.md` are lost on the next sync — edit the full PRD's Developer slice section instead. Templates: `.agent/commands/project/dev-flow/templates/prd.template.md` (carries the marked-up source span) and `.agent/commands/project/dev-flow/templates/prd-minimal.template.md` (frontmatter contract for the extracted file).

## Work item type

The intake discriminator (`work_item_type` in the run manifest, schema 8+) that selects which **weight** of the one shared pipeline a piece of work runs through. Three types, two axes: an **intent** axis (is the desired behavior already supposed to exist?) and a **magnitude** axis (how much new behavior?).

| Type | Intent | Command | ID / branch | Operator gates | Stages skipped | Definition-of-done backbone |
|------|--------|---------|-------------|----------------|----------------|------------------------------|
| **bug** | Fix broken behavior | `/create-bug` | `BUG-NNN` / `bug-NNN` | `final` + `go_live` (planning gates inert) + two valves | architect, UI, heavy task-breakdown | the RED regression test (written first) |
| **frd** | Add bounded capability | `/create-frd` | `FRD-NNN` / `frd-NNN` | `build`/`final` + `go_live` (`spec`/`design` inert) | architect + UI (unless ADR-worthy / UI scope) | acceptance criteria (no-regression variant for chores) |
| **prd** | Build (multi-phase) | `/create-prd` | `PRD-NNN` / `prd-NNN` | all five tokens apply (`spec` · `design` · `build` · `final` · `go_live`) | none | per-phase acceptance criteria |

Gates are **tokens, not stage counts** — every planned stop belongs to one of the five in `scope_dial.gates` (§ "Operator Gate"), so any of them can be unticked. A stage with no token (`/architect`, `/task-breakdown`, `/implement`, `/code-review`, `/ship`, …) closes **soft** for every weight; it may escalate on a critical trigger or an operator-named `extra_stops` entry, but it never holds a standing stop. Corrected 2026-07-30, when `/task-breakdown` still claimed a hard close it had no token for.

**Keystone principle — same artifact slots, different fill.** All three types produce the same slots: intake doc → minimal block → task breakdown. `canonical_artifacts.prd` / `prd_minimal` are the universal **spec** / **spec-minimal** slots regardless of type (they hold `frd-*` / `bug-*` paths for those types). Because the slots are uniform, the Architect / Lead Developer / QA / Developer contracts are **unchanged** — a bug just fills the slots thinly (task breakdown = T001 write RED test, T002 make it green). Chore-shaped work (refactor, dependency bump, tech-debt) **folds into FRD** with the no-regression DoD variant; there is no separate chore type (revisit only if chores get filed standalone often).

**Classification.** Confident on bug-vs-rest (a semantic test: "is the behavior already supposed to work?"); humble on FRD-vs-PRD (a fuzzy magnitude judgment). The explicit `/create-*` commands skip classification (the operator already decided); a natural-language description triggers a propose-and-confirm classification (not too aggressive — the operator confirms or overrides). External-source intake (the phase-2 adapter layer over the same engine) is **mostly built**: both the **local-file source** (intake queue `tasks.md`) and the **GitHub-issue source** (`/triage --source github`) are live (see § "Intake queue", § "Triage"); only the **autonomous trigger** remains.

## Type promotion

Re-classifying a work item **upward** (bug → frd → prd) when it turns out bigger than its type. **Promotion is re-classify + enrich, never restart.** The originating intake doc's content carries forward (a bug's repro/current/expected become the FRD's problem/acceptance-criteria; the minimal block survives), `work_item_type` flips, and a `stage_history` `{ stage: "promoted", outcome: "superseded", one_line: "…" }` entry preserves the lineage. Two triggers fire promotion: the **not-contained valve** in `/create-bug` (root cause is a design flaw, not a contained fix) and the **scope-balloon trigger** in `/create-frd` (multi-phase, ≥3 new SDK surfaces, needs an architecture blueprint, or blows the soft cap with coupled scope). Promotion is the safety net that prevents the bug path from "fixing" the wrong thing and the FRD path from silently ballooning into an under-planned PRD.

## Deliverable vs execution unit

The rule that decides whether growing scope becomes **more specs** or **more tranches**: a **work item (PRD / FRD / bug) is a complete deliverable; a tranche is a unit of execution.** Complexity is divided by tranches *inside* one spec by default — a spec is done when the thing it promised works, not when a phase of it works.

**The default INVERTED on 2026-09-25: an MVP cut first, phasing as the fallback.** It was *"phase inside one spec, never split by default"*, and that rule optimised for the wrong thing. **A tranche is a checkpoint for the builder; it is not a deliverable for the operator.** Ordered phases inside one spec give N places for an agent to look and **zero shippable artefacts** until the end, so the operator's only real question — *"is this what I wanted?"* — can only be answered after the money is spent.

So `/architect` § 2b-i now runs a **deliverable sizing gate** over four signals — `adrs_new` ≥ 5, `components` ≥ 10, `content_types_related` ≥ 3, `tranches_projected` ≥ 15 — and under `scope_dial.delivery_shape: mvp-first` (the default) proposes the **smallest cut that is shippable AND live** as PRD-000, with the remainder named as follow-on PRDs in a **program** (§ "Program"). The spec still carries the **full vision** — that is precisely what the follow-on members are cut from, and losing it is the failure the old rule was protecting against.

**Phasing is still correct where the phases are genuinely not independently shippable** — then they are tranches of one deliverable and the shippability test below says so. The ≥3-new-SDK-surface heuristic (`/create-prd`) and the soft length caps (§ "Soft length caps") still propose **phases inside the current spec**, recorded in the spec's `## Execution tranches` section (PRD § 12a / FRD § 4a) and expanded into the task breakdown's § 5, each phase closed by a probe (§ "Probe") or a real-tenant smoke (§ "Smoke gate") before the next opens.

**The cost of the inversion, stated honestly:** more PRDs pay the per-run overhead (discovery, ADRs, task breakdown, provisioning) more than once. It is still the right trade because members after the first **inherit** the CM, the repo, the provisioning and the architecture — only PRD-000 is expensive.

**Measured basis (a prior run's PRD-000, 2026-09-22 → 09-25):** 23 components, 6 cross-related content types, 29 tranches, 17 ADRs — over every threshold, three of them by roughly 3×, and no heuristic in the pipeline said a word because the only one that fired (≥5 ADRs) proposed *phases*. 3.25 calendar days and 22.3 h of engaged agent time produced nothing the operator could judge until the end, at which point they said, verbatim: *"This execution already runs a while and I have literally no idea if it is great, what I want, or something else."* Four Criticals in that build were found by **looking at the running site** and none by a mechanical gate — which is an argument for an early deliverable, not for more gates.

**Splitting requires the shippability test.** A spec may be split into multiple specs only when **every** proposed piece independently passes all three legs:

1. **Standalone value** — it delivers something a user can actually use on its own (or an explicitly *named* non-user consumer: another system, an operator workflow, a published package). "Later phases will use it" is not a consumer.
2. **Standalone ship** — it can run through `/ship` (and `/publish` on content runs) and leave the product coherent and non-broken.
3. **Standalone truth** — its README / CHANGELOG / ship report describe a true, complete capability, not a fragment awaiting siblings.

If any piece fails any leg, it is **not** a spec — it is a tranche of the current one. Agents propose and state the verdict per leg; the **operator decides** and may always override a failed test, recorded as `notes.split_override: "<reason>"` in the run manifest so `/ship` can flag the bundled-fragment risk.

**A confirmed split becomes a program** (§ "Program") — never a bare "the next `/create-prd` picks up surface B". Rationale (2026-08-03): the prior behavior wrote phase A only and parked the rest in that PRD's § 15 Future Opportunities, so nothing recorded how many specs the whole idea needed or what each delivered, and `/ship` presented phase 1 of 3 as a finished product.

## Program

A named group of work items that together deliver **one** idea, created when and only when a spec is split (§ "Deliverable vs execution unit"). It exists so the operator can answer two questions at any moment without opening a spec: **what does each item deliver**, and **how many items complete the whole**.

Recorded in **every** member's run manifest under `notes.program` (`id` · `title` · `total` · `index` · `deliverable` · `members[]`; see `.agent/manifests/README.md` § "Program") and rendered by `STATUS.md` § "Programs" as an `N of M` roll-up (§ "Status index"). `/ship` reads it and marks a member ship **`phase N of M — not feature-complete`** in the ship report and PR body whenever siblings remain unshipped.

A program is **flat and finite** — no nesting, no open-ended "further phases TBD". If the member count is genuinely unknown, the work was not ready to split: phase it inside one spec instead. Members may be added later, but `total` and `members[]` must then be updated across **every** member's manifest — a member advertising a stale count is the exact failure this concept exists to prevent.

## Intake queue (`tasks.md`)

The per-product **work-item queue** at `project-planning/tasks.md` (committed) — the structured place known work is parked between sessions. Each entry is **one prospective pipeline run**, typed `bug | feature | prd` (feature = the FRD weight; see § "Work item type"), with the fields its create command needs to seed without re-interrogation (bug → what's broken + repro + current/expected; feature → user value + scope bound; prd → problem + goal). Entries carry `id` (`TASK-NNN`, stable) · `status` (`todo → in_progress → done` / `blocked` / `wont_do`) · `priority` · `source` (`local | github#N`) · `spawned_as` (the `bug-/frd-/prd-NNN` + branch, written on promotion). Picked up by **`/triage`** (see § "Triage"). Template: `.agent/commands/project/dev-flow/templates/tasks.template.md`.

**Four things it is NOT.** (1) It is **not** the research **`initiatives.md`** (see § "Initiative register") — those are JPD-altitude *bets*; a chosen initiative is *promoted into* the queue as a concrete work item. (2) It is **not** a granular subtask list — granular tasks (`T001…`) live in the task-breakdown produced *after* `/create-*`; one queue entry yields one intake doc. (3) Unlike `STATUS.md` (auto-generated, do-not-edit) it is **operator/automation-written and may be hand-edited** — `/triage` only updates `status` / `spawned_as` in place. The queue is the **local-file source** of the external-source intake adapter; a **GitHub-issue source** is also live (`/triage --source github`), and an autonomous trigger (T4) is the remaining tranche.

## Triage

The on-demand intake **picker** command (`/triage`) — the front door to the engine. It reads a product's intake queue (§ "Intake queue"), lists the open `todo` items, takes the chosen one (operator pick, or `<TASK-NNN>` arg, or top-priority), and **routes it by `type` into the matching weight** — `/create-bug | /create-frd | /create-prd` — seeded from the entry body so nothing is retyped. Routing always goes **through `/create-*`**, never straight to `/implement`, so the same-slots principle and the operator-gate model (§ "Operator Gate") are preserved. `/triage` plans nothing itself; it dispatches and writes the entry's `status` / `spawned_as` back in place. Two sources are live: `local` (the `tasks.md` queue) and `github` (issues via `gh`, typed by a label-map + propose-and-confirm classifier fallback — policy A). An **`--auto` mode** makes it the unattended **T4 local trigger** (notify-only by default; `--execute` runs the full pipeline to a PR; bugs-first, one-at-a-time, never auto-merge) for a local scheduler that reuses this machine's auth + cloned repos + toolchain (`scripts/triage-auto.ps1`). Soft-gated interactively; unattended under `--auto`.

## Architecture baseline

`project-planning/baseline.md` — a consolidated summary of stable architectural decisions promoted from accumulated ADRs. `/architect` proposes promotion when the product accumulates ≥5 ADRs; the operator confirms. Promoted ADRs are **not deleted** — they stay in `project-planning/ADR/` as source of truth; the baseline is the readable constitution. Downstream agents (Lead Developer, Developer, QA) read `baseline.md` in lieu of opening every inherited ADR; task-breakdown § 4c-2 lists only ADRs not yet in the baseline (delta ADRs). Refresh on subsequent thresholds is an audit-trail event recorded in `stage_history` as `{ stage: "baseline_promoted", agent: "04-software-architect" }`. Manifest path: `canonical_artifacts.baseline`. See `.agent/manifests/README.md` § "Architecture baseline".

## Status index

`project-planning/STATUS.md` — per-product work-item roll-up auto-generated at `/create-prd` kickoff and `/ship` close. Table of items (id / type / title / status / stage / smoke / PR / manifest) so the operator can read cross-item state without globbing `current-run.json`, plus a **`## Programs`** section that groups split items into their program with an `N of M` progress line and one "delivers" line per member (§ "Program") — the operator's big-picture view when one idea spans several specs. `/status` portfolio mode reads STATUS.md when present, falls back to `current-run.json` otherwise. Manifest path: `canonical_artifacts.status_index`. See `.agent/manifests/README.md` § "Status index". Do NOT hand-edit — overwritten on next regeneration.

## Soft length caps

Advisory length thresholds on planning artifacts. **Not hard enforcement** — exceeding the cap is a planning signal: scope is too broad and should be **phased**, OR stable inherited material should be promoted into a baseline. The agent surfaces the cap as a decision point; the operator may override for one run by ignoring the proposal.

Per § "Deliverable vs execution unit", an over-cap artifact proposes **phases inside the current spec** first; a split into a second spec is the exception and must pass the shippability test.

| Artifact | Soft cap | When exceeded |
|----------|----------|---------------|
| PRD (`prd-NNN.md`) | ~400 lines (frontmatter excluded) | PM proposes phasing the PRD via § 12a Execution tranches; mirror SDK-surface and ADR-density heuristics. Split only on a passed shippability test |
| Architecture (`architecture-<ts>.md`) | ~400 lines | Architect proposes phased tranches (`/architect` § 2b-i) OR baseline promotion (`/architect` baseline-promotion gate, schema 7+) |
| Task breakdown (`task-breakdown-<ts>.md`) | ~800 lines | Lead Dev proposes coarser tranche grouping or a phase boundary in § 5; the breakdown is a function of spec scope |
| UI variant (POC track) | ~200 lines | UI Designer compresses — re-prose-ing visuals the POC already shows is the failure mode |
| UI variant (no-POC track) | ~400 lines | (rare; only when `ui_variants: skip` is overridden) |

The caps were calibrated against a 9-product / ~25-PRD audit (2026-05-20) where typical per-PRD planning footprint was ~5,800 lines and ~40% of that was redundancy. Caps are not enforced by hooks — they live in artifact template frontmatter comments and agent identity Signature Behaviors. The agent surfaces the cap proactively; the operator can always override.

## Tranche

A bounded, independently-meaningful **slice of a plan** — a group of tasks delivered and verified together before the next slice starts. Tranches are how the framework structures non-trivial work: a plan is an *ordered sequence of tranches*, not a flat task list. **The tranche is the framework's unit of divide-and-conquer** — growing complexity buys more tranches inside one spec, not more specs (§ "Deliverable vs execution unit"). Encoded in the task breakdown's § 5 Execution order (tasks grouped into ordered tranches, mirrored in § 0 Planned delivery order) and outlined upstream in the spec's `## Execution tranches` section (PRD/FRD) and the architecture plan. The governing discipline is **probe-first** (rule `70-probe-and-tranche.mdc`): when any tranche rests on an assumption or unknown that a later tranche depends on, a **probe tranche** (see § "Probe", marked 🔍) is sequenced FIRST to confirm the assumption before dependent build work commits. Origin: operator working style ("plans always tranche; assumptions/uncertainties get a testing tranche first") — a cheap real-world probe beats weeks of building on a wrong assumption.

**Component-vertical tranches (the default decomposition).** For build work, decompose the plan **by component first, then by additional logic** — one tranche per component (each a full **vertical slice**: the component and *all its items*, never a horizontal layer split across many components), followed by cross-cutting **"additional-logic"** tranches (navigation, theming, routing, app-level wiring). Each component tranche is a **delivery-loop unit** (see § "Delivery loop") — implemented, code-reviewed, and tested as a whole before the next component starts, giving the operator granular per-component progress. This applies to **every composition** (generalized 2026-07-06 from the Content-SDK-only per-rendering tranching); on Content SDK each Sitecore rendering is naturally one component tranche. A 🔍 probe tranche still leads when a component rests on a load-bearing unknown.

## Probe

A cheap, throwaway **reality-check** that confirms or refutes an assumption against the real world BEFORE build work depends on it. One command (`/probe`), two modes:

- **knowledge** — a library / version / concept claim → routed to the **Research Sidecar (03)** for source-grounded verification (npm, GitHub releases, `.d.ts`, official docs). No code run.
- **empirical** — an API / tenant / data / runtime claim → routed to the **Developer (08)** as a constrained **throwaway spike**: disposable code in a scratch dir (`project-planning/probes/scratch/`), hit the real endpoint/tenant, capture the wire, return a verdict. Never touches product code.

Verdict is **confirmed / refuted / needs-more**, with evidence (and the captured wire for empirical probes). Used two ways: **standalone** (`/probe` in freeform, or any time an assumption surfaces) and as a **probe tranche** — one or more 🔍 special tranches at the front of an architecture / implementation plan (see § "Tranche").

**Persistence + operator confirm.** When a product/run context exists, `/probe` persists `project-planning/probes/probe-NNN.md` and records the verdict; in pure freeform it stays inline (or `write_to`). Gating is **soft with an operator confirm-to-proceed**: a probe never silently hard-stops, but after a plan's probe tranche(s) run, the operator is **notified of every verdict in the Operator Checkpoint and explicitly confirms whether to move forward** before dependent tranches proceed. A `refuted` verdict surfaces three exits as recommendations — **cancel** (killing work on a refuted assumption is a SUCCESS, not a failure), **promote/split** (re-scope per § "Type promotion"), or **redesign** — and the operator drives the call. A probe is the **proactive** generalization of three existing disciplines: `30-tdd.mdc`'s RED test (test-time cousin), the Architect's wire-level-evidence behavior (reactive cousin), and the bug RED regression test (contained cousin) — verify before you build, not after it breaks.

## Doctor (health check)

The on-demand, **read-only** health check of one SitecoreAI environment, site or page: `/doctor`, backed by the `sitecoreai-health-check` skill (`scripts/doctor.mjs`). It composes checks across four instruments that each see one truth — Authoring (master), Edge **live** (published), the browser (what a visitor gets) and the Monitoring API (CM and editing-host logs); Edge preview is never evidence of publication. Output is one report ranked **P0-P3** (finding → evidence → remediation, Pages / Content Editor links where an item id exists) with **UNKNOWN** (an instrument failed: never clean, exit 1) and **SKIPPED** (missing credential, out of scope, not implemented: always listed with its reason) kept apart from passes. Not a stage: no gate token, no pack brief, no `stage_history`, never crosses `go_live`; remediation is always a separate command. A **reverse drift** finding (master broken, Edge good) means **do not republish**. Its four gate scripts are the `/publish` context, media, crawl and robots gates (one implementation, rule `88`); `check-estate-parity.mjs` is the instrument for moving a site to another tenant. Contract: `.agent/packs/platform/content-sdk/stages/doctor.md` (pack-owned, so it ships only with `platform:content-sdk`).

## Delivery loop

The per-component build cycle: **`/implement` → `/code-review` → `/test`, iterated until clean, one component tranche at a time.** It is how the build phase runs for every pipeline run (every composition) once the task breakdown is component-vertical (see § "Tranche"). Rule `71-delivery-loop.mdc`.

**One component, fully delivered, before the next.** The Developer (08) takes a **component tranche** — the component and *all its items* (Content SDK: datasource/parameters templates, rendering + ComponentQuery, the React component + SDK field components, component-map registration, variants, tests; a generic app: the module + its types, wiring, and tests) — implements it, then it is code-reviewed and tested **as a unit**. Only when that tranche exits clean does the next component tranche start. Cross-cutting **"additional-logic" tranches** (navigation, theming, routing, app-level wiring) run *after* the per-component tranches, through the same loop.

**Exit criteria (well-defined).** A component tranche is *done* when BOTH hold:
- `/code-review` reports **no unfixed Critical or Major** finding (minors may be deferred), AND
- `/test` is **green** — full suite passes, lint + build clean, and any required smoke for the tranche is `passed` (not `pending` / `failed`).

**Loop-back is always to the Developer (08).** A failing gate never advances — a code-review Critical/Major or a test failure routes the tranche **back to `/implement`** (the Developer fixes), then `/code-review` and `/test` re-run for that tranche. The loop is **bounded to 5 cycles**; if a tranche is still not clean after the fifth implement → review → test pass, the run **escalates to the operator** (a hard stop naming the blocking findings) rather than looping indefinitely.

**Parallel tranches — opt-in by proof (2026-07-29).** Component tranches run **sequentially by default**. A set MAY run **concurrently** — one triad each, in **isolated git worktrees** — but only when the Lead Developer **declared** it in § 5 *and* the orchestrator re-verified all five eligibility checks: no pending 🔍 probe (probes are absolutely blocking and run first, alone), no `Depends on` path, disjoint § 4c-5 file sets (generated `.sitecore/*` exempt), no shared mutable state (config, barrels, **or shared live-tenant items** like Available Renderings), and nameable evidence. Any doubt → sequential. The orchestrator owns **the join**: merge → regenerate the maps once over the full component set → apply deferred shared-tenant writes serially → lint/build → review/test. A join merge conflict means the test was wrong: stop and finish sequentially. Worktrees are mandatory because concurrent Developers in one tree race on `index.lock` and interleave commits even with disjoint files. Replaces the pre-2026-07-29 per-task "parallel groups" model, which was unreachable (it disqualified `tdd` breakdowns, and mandatory QA enrichment makes every pipeline breakdown `tdd`). Full mechanics: rule `71-delivery-loop.mdc` § "Parallel tranches".

**Autonomous within the phase; tracked, not stopped.** Per operator working style, the build phase runs hands-off — the loop does **not** stop between components. It emits **per-component progress** (a `stage_history` entry and/or a task-status update as each component goes review-clean + test-green) so the operator has *granular tracking of how the implementation is doing while it is being built*. The three hard gates (§ "Operator Gate") are unchanged; the delivery loop lives entirely inside the (soft) implement → review → test span.

**Cadence dial — `scope_dial.delivery_loop` (`per_component` default | `once`).** The operator chooses *when the **test** leg runs*, set at `/create-prd` kickoff (overridable per-run with the `loop=` slash arg on `/implement`). **The dial moves the QA leg only (2026-07-29) — `/code-review` runs per tranche in both cadences**, because review is diff-local and cheap (batching it saves nearly nothing and lets a defect sit under N tranches of new work) while QA is integration-scoped and expensive (O(tranches × full-build) is the real cost driver). **`per_component`** (default, best outcome) is the per-component triad described above — review + test after each tranche, every component proven green on a small diff, at higher time + token cost. **`once`** delivers each tranche as a **{Developer → Code-Reviewer} pair** (implement → review its diff → bounded-5 loop-back → **commit + record at review-clean**) and defers only `/test`: after every tranche is review-clean, a **single** `/test` runs over the whole build, with bounded (3-cycle) whole-build loop-back — cheaper and faster, at the cost of cross-component regressions surfacing late. This is the same review-local / QA-integrated split `parallel` makes across the merge, so `once` and `parallel` converge. The dial is a cost/quality lever, **not** a review gate (it adds/removes no operator stop), and is **inert on single-tranche runs** (they are one pass either way). Absent/legacy ⇒ `per_component`. Full mechanics: rule `71-delivery-loop.mdc` § "Cadence dial".

**Relationship to the commands.** `/code-review` and `/test` already auto-fix findings via the Developer (08); the delivery loop makes that explicit, **per-component** (or once at the end, per the cadence dial), and adds the bounded loop-back + exit criteria. In a single-tranche run (small FRD, bug, freeform) the loop collapses to one implement → review → test pass — the current behavior. Orchestrated by the Team Lead (00); honored by 06/08 when the task breakdown defines component tranches.

## Preview-first delivery (publish-last)

The discipline that **all build-and-content work runs against the Sitecore *preview* surface, and publishing is deferred to a single final `/publish` step.** During `/implement`, `/test`, `/author-content`, and `/test-content` the head app and the audits read **preview** (unpublished) content — nothing is published to the LIVE Edge. Publishing is **not** interleaved into those stages; it is the very last action of the whole run.

**Why.** Publishing mid-build couples every iteration to a live-Edge round-trip and makes "is this live?" ambiguous. Working preview-first keeps implementation and content iteration fast and reversible; the run goes live **once**, deliberately, at the end — when the code is shipped AND the content is authored + audited.

**Where publishing lives now.** `/ship` ships **code only** (editing-host + Vercel deploy against the **preview** context, commit, PR) — it does **not** publish. The content phase (`/discover-components` → `/author-content` ⇄ `/test-content`) authors + audits against preview. **`/publish`** (the final step, Content SDK / Sitecore only) then publishes **everything** (layout items + authored content + media), pulls the authored items into `cm/` for git durability, and re-deploys the editing host + Vercel with the **LIVE** Edge context (the 200-not-302 media gate lives here now, since it depends on published content). Command: `.agent/packs/platform/content-sdk/stages/publish.md`.

**Integration boundary.** The `/publish` live publish is outward-facing and **operator-confirmed** (the framework's confirm-outward-facing-actions discipline). Moving the LIVE-context redeploy + media gate out of `/ship` into `/publish` is a real change to Sitecore deploy behavior — verify it on the next live Content SDK run before trusting it.

**Surfaces (where each phase *looks*).** Preview-first also fixes *which surface* each phase verifies on, so "is it live?" is never ambiguous:
- **`/implement`** (code on the feature branch, not yet merged) → **localhost** (`npm run dev`) reading the **preview** context. The editing host builds from `main`, so it won't carry this branch's new components until the `/ship` merge — build-phase verification is local. **One exception, owned by `/test`:** a Cache Components app also gets the served-HTML guard on its branch's **Vercel Preview** deployment before anything reaches production, and on the production deployment at merge and before any promote, because local `next start` never runs Vercel's PPR resume invocation (rule `85`; content-sdk pack `served-html-preview-proof`; measured 2026-10-15).
- **`/author-content` ⇄ `/test-content`** (code merged, editing host redeployed on preview) → the **editing-host preview/edit surface** (`get_page_preview_url`) reading the **preview** context — unpublished authored content is visible there. **Not Vercel.**
- **`/publish`** (go-live) → **Vercel**, pinned to the **LIVE** context id, is the **single live surface** and the only place the go-live check runs. `/publish` owns the one go-live Vercel redeploy, which replaces the pages the build cached before any content was published; because the pipeline owns that redeploy, the operator does **not** redeploy Vercel by hand (this avoids the deploy-alias clobber where two redeploys fight over the production alias). Later publishes reach the site by the run's freshness mechanism: **on-demand revalidation** (§ below) or, for a plain-template app, a redeploy or the revalidate window.

Before the first `/publish`, Vercel (LIVE context) legitimately shows empty/stale content — that is publish-last **by design, not a bug**.

**A Vercel *Preview* deployment is not the preview surface.** The names collide and the distinction is load-bearing: Vercel's `preview` env **target** is where any branch/PR build reads its variables, but what it builds is still the **live** surface — the preview surface in this pipeline is the editing host (bullet 2 above). So the five head-app variables go on **all three Vercel targets (`production`, `preview`, `development`) carrying the same LIVE context id**; only presence differs, never the value. Two consequences, both measured 2026-08-31 across the nine head apps:
- **Production-only breaks the branch build.** A Vercel target inherits nothing from another, and `SITECORE_EDGE_CONTEXT_ID` is read at build time, so a production-only project fails every Preview deployment — including the PR `/ship` opens — while `vercel --prod` stays green, which is why no gate that looks only at production can see it. Development was empty on **9 of 9**; Preview was absent on **4 of 9**, and the five that had it had been hand-fixed weeks after ship.
- **Seeding the Preview target with the *preview* context id is worse than leaving it empty.** It builds green and serves unpublished content at a URL that looks live — a second lenient surface, and precisely the rule `85` false-pass shape. Contract + the scriptable loop: `/publish` § "Standing up the delivery surface" step 3.


**The cost of preview-first.** Verifying everything on the lenient surface means a whole defect class cannot be seen before `/publish` — see § "Divergence class (preview vs live)" and rule `85-preview-live-divergence.mdc`. Preview-first is still right; it just obliges one strict-side assertion per divergent contract.

**Publish is live-scoped.** Uploaded media resolves from the CM on **preview** with no publish (measured on a prior run, 2026-08-09 — 9 heroes linked via `updateItem` rendered on preview, `publishItem` never called); the publish is required for the **live** surface only. Auditing imagery is therefore never a reason to cross the `go_live` gate. Corrected in the skills that stated it universally (the imagery recipe, `sitecoreai-graphql-schemas`).

**The blind side.** Preview and LIVE Edge do not resolve identically — see § "Divergence class (preview vs live)". `/ship` names the open claims in the ship report under `## Unverifiable until /publish`; `/publish` step 6a settles the route-form class with a mandatory anonymous link-crawl (real browser after hydration, never `curl -L`). Preview-green is not live-green — a run shipped with 4 of 21 internal links 404-ing, every one green on preview.

## Delivery visibility

Whether a Content SDK run's **delivery surface** (the live Vercel site) is a **`public`** website or a **`private`** one, declared as `variables.delivery_visibility` by `platform:content-sdk` (default `public`) and re-defaulted by a composition through `variable_defaults` — `method:clone` sets `private` (2026-09-30), because a public copy of someone else's site is duplicate content search and AI answer engines can rank against the original. `private` means all four of: an access gate on every path (401 + `noindex` anonymously), `RobotsContent: Disallow: /` (seeded at `/provision-sitecoreai` § 7e), `noindex` on every page, and the gate's secret on all three host targets. The gate is proven on a local build before the publish and asserted on the first production deployment before any other gate — that deployment cannot precede the publish, since a prerendering build fails on LIVE until the site exists. Under `private`, `/publish` § 6b **inverts** (anonymous `/robots.txt` → 401; authenticated body contains `Disallow: /`) and § 6a crawls **authenticated** — the declared contract, not a deviation. Whatever the visibility, **never put a Vercel target on the PREVIEW context on a URL anyone outside the team can reach** (§ "Preview-first delivery" → Surfaces). Stages read the variable; none tests "is this a clone?". Contract: `.agent/packs/platform/content-sdk/stages/publish.md` § "Delivery visibility".

## On-demand revalidation (OSR)

How a Content SDK head app shows a publish **without a redeploy**: Experience Edge calls an **OnUpdate webhook** (Edge Admin API, Edge administration client) with the published item ids, and the app's `POST /api/revalidate` route turns them into the same cache tags its `'use cache'` reads stamped. It needs the `nextjs-app-router-cache-components` template (the plain template has no route) and an SDK carrying upstream #619/#620/#623 — on 2.4.x a refresh "works" only as a sitewide purge. The alternative is **redeploy-on-publish**. The choice is `variables.freshness`: asked at intake, it selects the scaffold template (under `osr`, `variables.osr_sdk_line` records stable vs an exact canary pin), and `/architect` ratifies it as an ADR. An existing app keeps its template, and OSR there is a migration tranche. Then `/provision-sitecoreai` § 6b mints the Edge client, `/ship` sets `SITECORE_REVALIDATE_SECRET` on all three Vercel targets, `/publish` § 4a registers the webhook only after the route's controls pass and proves it on a second publish with an unrelated page still cached. **The platform does have a publish webhook — in the Edge Admin API, not the Publishing API.** Skills: `content-sdk-app-router-cache-components-and-osr`, `sitecoreai-edge-admin-webhooks`.

## Tracking consent

The **standard acceptance criterion** (operator, 2026-10-01) that every Content SDK head app ships a connected consent gate, because a stock head app tracks (Bootstrap analytics plugin, `CdpPageView`, `PersonalizeProxy` cookies) and the SDK has no consent API. **No consent** → no tracking cookies, no edge-platform beacons, no proxy decision (default variant); **grant** → tracking starts without a reload; **withdrawal** → `sc_cid` / `sc_cid_personalize` wiped. Own first-party banner (authorable, rule `86`), IAB-style categories necessary / functional / analytics / marketing, marketing requires analytics. Proven with a real-UA browser test of four states — a headless UA is classified as a bot and passes vacuously. Skill: `content-sdk-tracking-consent`; carried by the content-sdk pack at `/architect`, `/task-breakdown`, `/implement` and `/test`, and gated by `audit-tracking-consent.mjs` (static wiring, `/implement` tranche exit and `/test`) plus the skill's real-UA acceptance spec as mandatory `/test` evidence.

## Integrated search

**SitecoreAI search experiences**: the index is a **search source** (content: items of chosen templates, refreshed by a reindex; site: a site's published pages; push: documents sent through the Ingestion API), queried from the head app with the Edge context id at `edge-platform…/v1/search` (`@sitecore-content-sdk/nextjs/search` hooks, or the server `SearchService`). Distinct from standalone **Sitecore Search** (CEC, `rfk`, customer key), from **CM Solr** item search (the `Search Index` in org health) and from Edge GraphQL `search(where:)`. Source setup is UI-only; the config read API needs a scope no automation client carries; a manual reindex wipes pushed documents; search is disabled in Preview, so it verifies only on a published page. Declared per run as `variables.search` (`none` by default). Skills: `content-sdk-search`, `sitecoreai-search-sources`.

## Atom · Low-code component · Hosted component

Content SDK Atoms, **beta only** (`beta.atoms` stamp, behind 2.4.0; `variables.sdk_line`, default `stable`). An **atom** is code: a Zod-typed catalog entry plus a React renderer, registered through `SitecoreProvider atomsConfig` and never the component map, living in `src/atoms/`. A **low-code component** is content: a json-render Document stored in MMS and referenced by a rendering's `ComponentRef` param; it is invisible to serialization. A **hosted component** is the Components API `type: Hosted`, i.e. the CM template `Foundation/JavaScript Services/HostedJsonRendering`. Not the same as FEaaS components, which Sitecore's docs also call "low code". Skill: `content-sdk-app-router-atoms`.

## Language version · Orphan language version

A **language version** is an item's first version in a language; a numbered version is version N+1 within one language. Authoring `addItemVersion` and MCP `add_language_to_page` create it **empty** (every versioned field blank, `__Final Renderings` empty). An **orphan language version** is a version in a language the environment does not define: Edge **preview serves it, a publish cannot**, and adding the language later makes every orphan publishable on the next all-language publish (measured 2026-10-02 on one site's de-DE). A language census compares item versions with the environment language list, never one of them alone. Declared per run as `variables.languages`; skill: `sitecoreai-localization`; gate: `language-census.mjs`, doctor check W3.

## Language fallback

Two switches, both needed and both off by default: the **environment** setting (`ExperienceEdge.EnableItemLanguageFallback`, an App_Config patch, i.e. a CM deploy under rule 20) and the per-site **host flags** (`enableItemLanguageFallback` / `enableFieldLanguageFallback`). With the environment switch off, Edge ignores a language's Fallback Language and the item's "Enable item fallback" checkbox: preview returns `null` for the page and the **key** for a dictionary phrase. The Content SDK adds no fallback of its own: a missing language version is a 404.

## Dictionary (Sitecore)

The site-scoped key/phrase store (`Dictionary` folder, entry template with a shared `Key` and an unversioned `Phrase`), delivered by Edge `siteInfo.dictionary(language)` and read through `getDictionary` / next-intl. Rule `86` names it the third authorable home for fixed UI microcopy, beside the datasource and a settings item. **Edge returns the key as the value** for anything untranslated (missing version, empty phrase, an undefined language), so `value === key` is the only missing-translation signal and code keeps a literal default; `total` counts entries, not translations. A dictionary publish needs the Dictionary item with subitems (or the site root); on the 2026-10-02 test environment every site's live dictionary was empty while master had entries. Skills: `content-sdk-app-router-dictionary-and-i18n`, `sitecoreai-localization`.

## Site template

An item of data template **Solution template** (`{1B2DFD3B-…}`) that the Create Site dialog lists through Authoring GraphQL `solutionTemplates`. It is found by template id wherever it sits, and lists immediately. Its `Site Modules` name the **setup roots** (`HeadlessSiteSetupRoot`) whose actions build a new site: `AddItem`, `ExecuteScript`, `PostSetupStep`. A custom template = Empty's 15 OOTB modules + its own root. "Skatepark" is the built-in **Basic** template. Built and verified with the `sitecoreai-site-template` skill.

## Page blueprint

A branch template in a collection's `Branches/Project/<collection>` folder that "Create a page" offers through insert options. A marketer gets a prefilled page: `$name` is expanded and datasources are page-local (`local:/Data/…`). Use it for campaign and landing pages inside an existing site; use a **site template** when the requirement needs its own hostname, navigation or brand. Built with `sitecoreai-site-template` (`build-blueprint.mjs`).

## Divergence class (preview vs live)

Any **contract the preview and live Edge contexts do not share** — so a check on one is not evidence for the other. Preview is the **permissive** side, and it is where the entire pipeline verifies (rule `71`, preview-first), which makes these defects structurally invisible until `/publish`.

Measured classes: **route-path form** (live's `site.routes` index carries only the slugified item path; preview also resolves the percent-encoded form), **media resolution** (preview renders media from the CM with no publish; live requires the publish), **cache/tag semantics** (ISR windows and `revalidateTag` against a single-process local `next start` vs a multi-instance deployment). **The list is open** — routing, media, cache, auth scoping, item resolution and host/header handling are all candidates.

**Consequence.** A preview-side assertion is not go-live coverage, and it can *pin* the defect as the expected value: a prior run (2026-08-11) shipped four dead links past 658 tests, four reviews and a full `/test`, while `scripts/smoke-prod-routes.mjs` asserted the broken percent-encoded URL and passed. Where a contract can differ, one assertion against the strict surface is mandatory — environment-bound and manual is fine. Rule: `85-preview-live-divergence.mdc`; test-side clause: `30-tdd.mdc` § "Environment-scoped assertions".

## Auto-archive

**Retired (was schema 7).** Superseded by **Artifact durability tiering** — see the next entry. Nothing moves to `project-planning/archive/` at any stage, and `notes.archive_skip` is retired with it. Legacy `archive/` folders stay on disk and in git history.

## Artifact durability tiering

Every run produces artifacts with very different half-lives. Tiering decides which become the **committed** documentation surface. It changes nothing about what a stage *produces* — the pipeline still generates and reads everything mid-run. `gitignore != delete`.

- **Tier 1 — durable record (TRACKED).** The intent → decisions → outcome story a future run or reader needs: the **spec** (`prd`/`frd`/`bug-NNN.md`), **ADRs** + `baseline.md`, the **ship report**, **probe findings** + `captures/` + `spike-notes/` + `smoke/`, `source-analysis/`, `STATUS.md`, `tasks.md`, the per-run `workflow/run-<id>.json`, and — **since 2026-08-12** — `plans/code-review-*.md` + `plans/test-report-*.md`.
- **Tier 2 — compiler output (untracked).** `*-minimal-NNN.md`, mechanically extracted from the spec.
- **Tier 3 — run-scoped working material (untracked).** `task-breakdown-<ts>.md` (+ pre-QA snapshot), `qa-report.md`, `plans/interrogation-*.md`, `architecture/`, `brain-dumps/`, `ui-design/`, `design-prototypes/`. Superseded by shipped code + ADRs + the ship report.

**Code-review and test reports were promoted out of Tier 3 (2026-08-12, rule `87-comment-economy`).** They had been tiered out as "superseded by shipped code", which was wrong in one specific way: they carry *why* a Critical was fixed a given way, which alternative was rejected, and what was measured — none of which the shipped code states. Denied that home, agents wrote the reasoning into **source-file headers** instead, producing 183 files with a 25+ line header essay (8,477 lines) and two head apps carrying more comment than code. The tiering had, in effect, relocated the durable record into `.tsx` files where it bloated every reader's context and no gate could see it. The verbosity cost of tracking them is real and accepted as the cheaper side of that trade. Companion destination: **`docs/build-decisions.md`**, the component-grained record ADRs are the wrong grain for (one decision per ADR, architecture-scoped) — appended by `/code-review`, pointed at from source by a one-line comment, and deliberately **not** `docs/decisions.md`, which `/document` regenerates wholesale.
- **Tier 4 — mutable machine state (untracked).** `workflow/current-run.json` — byte-identical to the latest `run-<id>.json`, which *is* tracked.

**Enforcement is declarative:** `project-planning/.gitignore`, seeded at `/create-prd` step 4a. `/ship` step 15b **verifies** it (backfilling for older products); it moves nothing and rewrites no `canonical_artifacts.*` path, so paths written by a producing stage stay valid permanently.

**Why this replaced the sweep.** Moving scaffolding to `archive/` did not reduce commit noise — a `git mv` is a delete plus an add of identical bytes — and the archive grew to 60% of a mature product's planning bytes. The move rules also drifted from their own contract (the sweep archived ship reports its "NEVER swept" list named, and buried probe findings among superseded test reports). A `.gitignore` cannot drift that way. Full contract: `.agent/manifests/README.md` § "Artifact durability tiers".

**Probe promotion** (`/ship` § 15b-promote) is the companion rule: a probe finding is a fact about the *world*, not about the run, so it is promoted to an ADR (design constraint) or a skill/memory entry (platform fact) rather than left to decay in one product's planning folder.

## Products root / mount point

**`products/` is a logical MOUNT POINT, not necessarily a directory in this repo** (2026-08-15). Resolution order: `AGENTIC_PRODUCTS_ROOT` (env) → `.agent/workspace.json` `{ "products_root": … }` (gitignored — a machine fact) → `<repo>/products`. The resolver is `.agent/scripts/resolve-products-root.mjs` (PowerShell twin `Resolve-ProductsRoot.ps1`); never re-derive the root by joining `cwd` and `'products'`.

The design that makes this cheap: **stored paths never change.** `product_root`, `cm_code_base` and every `canonical_artifacts` entry keep the *logical* form `products/<group>/<slug>/…`, and only the prefix is rewritten at read time. That is why the change required **zero manifest migration**, and why a manifest stays readable on a machine whose root differs. Re-basing stored paths onto the root — the obvious alternative — would rewrite every manifest in every product and make each one machine-bound.

Three invariants: **`products/_root/` is pinned to the repo** (it is this repo's own *tracked* planning surface, not a product, so it never travels with the mount and a `_root/` inside an external mount is never read); **a configured-but-missing root is an ERROR, never a silent fallback** (a fallback is indistinguishable from an empty workspace); and **slim-context agents resolve nothing** — the manifest carries derived, per-machine `products_root_abs` / `product_root_abs` beside the logical fields, so the Developer (08) is handed absolute paths and never has to know a mount exists. Full contract: `.agent/commands/project/product-workspace.md` § 1a.

## Repo topology (`repo_topology`)

**How a platform's deployables map onto git repos — an OPERATOR choice, asked once per repo at intake, not a framework default.** Declared as `pack.repo_topology`: a plain string when the platform has one fixed answer, or an object `{ default, values, operator_selectable, resolved_at, records, variants }` when the operator picks. Recorded in the run manifest as `repo_topology`, and **inherited** by every later run in the same workspace — the topology belongs to the repo, not to the run, so a second run (a sibling head app, an FRD, a bug) never re-asks.

Content SDK offers two, and **both are current** — a `sites/` nesting is not legacy; only a *flat* product is:

| | `repo-per-deployable` *(default)* | `monorepo` |
|---|---|---|
| Repos | `cm/` + one per head app | one, rooted at `cm/` |
| Head app | sibling of `cm/` | `cm/sites/<head-app-slug>/` |
| Descriptors | two — CM (`renderingHosts: {}`) + head app (`path: "./"`) | **one**, at the repo root (`authoringPath` + `path: "./sites/<name>"`) |
| Branches | `prd-NNN` | `<head-app-slug>/prd-NNN` (N head apps, one repo) |
| `cm_code_base` | `<project_root>/cm` | `<project_root>/cm` — unchanged |

**`variants` is what makes the key more than decoration.** Each value carries a patch that `resolve-packs.mjs --topology <v>` deep-merges over `workspace` + `repo_setup`, so a stage brief states **one** resolved answer and **no stage branches on the topology itself** — branching would be the second resolution path `platform-pack.md` § 6 forbids. Pass `--topology` on **every** resolution in a run: omit it and the brief silently returns the *default*, so a `monorepo` run reads the other topology's layout, git root, branch rule and build descriptor while every gate reports green.

The failure this exists to end (BACKLOG item 22): the key was in the schema for a year, both packs declared the string `repo-per-deployable`, the authoring baseline *shipped* in monorepo shape, and **no stage could ever resolve a second value** — declared, buildable, and unreachable. Rule `88`'s exact shape. Gated now by `checkPackShape` (a value with no variant, a default outside `values`, a patch on a key no brief carries), `check-xmcloud-build-blueprint.mjs` § 3a/3b, and `__tests__/resolve-packs.test.mjs`. Contract: `.agent/packs/README.md`; layouts: `.agent/commands/project/product-workspace.md` § 1b-i.

## Manifest SoT (source of truth)

`project-planning/workflow/current-run.json` is the canonical resolver for artifact paths. Agents read `canonical_artifacts.prd`, `canonical_artifacts.task_breakdown`, etc. — they do not file-search. When the manifest is absent or an entry is `null`, fall back per `.agent/WORKFLOW.md` ("latest-by-timestamp" rules). Template: `.agent/manifests/run-manifest.template.json`. Schema v2 includes `stage_history` for fold-back recovery.

## Stage history & fold-back

`stage_history` is an append-only array in the run manifest recording each stage entry with `{ stage, agent, entered_at, exited_at, outcome, one_line, deliverables[], escalations[], error, notes }` (schema 7+; schema 6 used freeform `notes` prose). Outcomes: `completed`, `failed`, `skipped`, `superseded`, `partial`. **Fold-back** is the recovery pattern when a stage fails: the run is rewound to the last `completed` entry, the failed artifact is left in place for inspection, and the user decides whether to retry, skip, or escalate. Specified in `.agent/manifests/README.md` § "Stage history and error recovery".

**Authoring rules (schema 7+).**
- `one_line` is the at-a-glance summary `/status` and downstream agents read. ≤140 chars. State the **stage** that happened, not the artifact's contents.
- `deliverables[]` lists every file the stage wrote or updated by repo-relative path. Empty array is fine when the stage produced no files.
- `escalations[]` mirrors operator-attention items raised at this stage (forensic slice; top-level `operator_attention[]` stays the cross-product SoT).
- `notes` is an escape hatch — keep it ≤2 sentences. Prefer `one_line` + structured fields.

## POC clickdummy

**The POC's visual layer needs an owner.** A task breakdown decomposes by *behaviour*; a stylesheet is not a behaviour, so nothing allocates it and no structural assertion misses it — a `className` renders identically whether or not a rule exists for it. `/task-breakdown` therefore requires an explicit § 5 task whose output is the ported visual layer, plus a § 8 pixel capture-and-compare per tranche. Observed without it: zero component CSS through three tranches and 517 passing tests.

A static HTML/CSS prototype in `project-planning/design-prototypes/poc-vN-prdNNN/` produced by the UI Designer (05) during `/architect`. The path is **PRD-scoped**: `N` is the variant number (1–3) and `NNN` is the zero-padded PRD ID (e.g. `poc-v1-prd003/`). PRD-scoping prevents the cross-PRD overwriting bug where each new PRD's POC stomped the prior one at the bare `project-planning/design-prototypes/poc-vN/` path (F1 from PRD-003, 2026-05-09). Canonical visual reference for look-and-feel — when § 4c-4 text and the clickdummy disagree on visual details, the clickdummy wins. Path resolved from `ui_design.selected_poc_path` in the run manifest. The Developer (08) **may** open POC HTML/CSS during `/implement` even though it is otherwise outside the slim context.

## Design ledger

The measured, append-only record of every design the estate has shipped or considered — `designs/ledger.json` in the **`designs/`** sibling repo, written only by `.agent/scripts/designs-ledger.mjs` (`backfill` from each shipped head app's `globals.css`; `append` per design-gate variant, picked *and* rejected, with the operator's reason). Values are OKLCH read from the token file, never agent-typed. It exists because convergence was invisible: measured 2026-09-11, six of seven shipped head apps sat in one warm-paper ground cluster at ΔE_OK 0.009 and five of seven carried a serif display, while the only per-run memory was `ui_design.selected_poc_path` — no stage ever read what a sibling run had shipped.

Consumed at `/design` step 2 through `check`: a token plan whose ground / ink / accent sit in an occupied band on **≥ 2 axes** is rejected at the review-for-genericness pass and re-planned; a display-family repeat is a WARN the plan must answer. Bands are **per axis and calibrated on the estate** (ground by ΔE or hue band, ink by ΔE, accent by hue family) — a single radius cannot be right, since two sites are 0.009 apart on ground and 0.176 apart on accent and are the same style either way. Brand-forced constants are exempt (recorded in the spec). An empty ledger is exit 2, not PASS. The ledger is the spine of the design *library* — entries seeded toward registers the estate has never built, consumed by copy-and-fit into `poc-v1-prdNNN/`. What it cannot see: outside the band is not the same as distinctive; that is the tell list's job.

## Self-report verification

Discipline that every sub-agent (architect, UI designer, lead developer, QA specialist, developer) **MUST** apply before declaring outputs complete. The Team Lead orchestrates downstream gates from sub-agent final reports — a discrepancy between what the report claims and what the working tree contains breaks downstream sequencing.

For every file path a sub-agent lists in its final report:

- **Existence check** — confirm the file exists at the claimed path (`ls`, `Read`, or filesystem call).
- **Content check** — confirm the claimed change is present (grep for the new content, or `git diff` vs the prior commit on the branch).
- **mtime check** — confirm the file's modification time is newer than the sub-agent's run start. Catches the "I described it but didn't write it" class of drift.

If any check fails, fix the gap **before reporting**. Do NOT report outputs that aren't actually on disk.

Origin: the architect's final report claimed "ADR-NNNN § Decision step 4 amended" but the file's mtime predated the architect run by ~20 minutes — the file was never actually amended. The Team Lead caught the discrepancy on a manual mtime check. Self-report verification is the structural fix.

## Smoke gate

Minimal acceptance test gate that must pass before declaring a stage complete. Shape varies by product and stage (jest-axe scan, Playwright visual diff vs POC, manual host-frame walkthrough, and — for any rendered site — the **rendered-surface audit**: a whole-site 200 crawl plus a desktop containment assertion, `/test` § 1d-ii steps 2b/6b), but the gate role is constant: a structural check the run cannot bypass silently. Smoke results are recorded in the manifest under `smoke_outcomes` (added per a prior product's framework learnings, 2026-04-27). A skipped or deferred smoke is recorded as a `WARN` outcome, never a silent pass.

The rendered-surface audit exists because the other shapes are all blind to it: data-flow guards, markup/a11y review and HTTP-status smoke can every one pass on a site with no page gutter and every detail page unreachable by clicking (a prior run's PRD-000, 2026-07-30 — shipped and merged with 26 of 32 routes 404). Run it against **localhost on preview**; the editing host 403s unauthenticated and `/api/editing/render` 302s into OIDC, so it cannot be driven headlessly.

## Host-frame smoke (Marketplace apps)

A Marketplace-app variant of the smoke gate: visual comparison of the live iframe inside the user-supplied Cloud Portal URL against the approved POC clickdummy on five axes (layout, typography, color, component anatomy, state fidelity). Standalone-localhost rendering does not substitute — Marketplace apps depend on host-supplied `XMC.host`, `XMC.context`, theme, locale, auth and render blank outside the host. Recipe: `marketplace-sdk-host-frame-testing`. Inputs (host URL + app origin) are user-supplied; missing inputs record `deferred — host URL not supplied` with `WARN` verdict.

## Pipeline mode vs Freeform mode

Two operating modes for `/implement`:
- **Pipeline mode** — the default. A run manifest with `canonical_artifacts.task_breakdown` exists; Developer reads `prd_minimal + task_breakdown` and follows § 5 execution order.
- **Freeform mode** — vibe-coding. No task breakdown; user supplies a text prompt as the spec. Developer inspects the codebase, infers the composition (recorded in the run manifest as `notes.composition_detected_from: codebase`), implements directly. `/code-review` and `/test` still run against the resulting runbook.

## Design-polish cycle

Post-MVP refinement phase that iterates on visual fidelity, accessibility, and a11y-smoke findings without changing scope. Runs as a separate branch (e.g. `design-polish-1`) layered on a shipped PRD. Not a planning track — uses the same `/implement` → `/code-review` → `/test` → `/ship` loop.

## Escalation protocol

When a Developer (08) (or any downstream agent) hits a gap that would require guessing — § 4c is incomplete, a task is ambiguous, an API contract doesn't match reality — the agent writes a structured escalation block (gap type, blocked task, which § 4c subsection, what's needed) and stops work on the blocked task. Other unblocked tasks may continue. Full protocol: `.agent/WORKFLOW.md` § "Escalation protocol". Loading upstream docs as a workaround is **not** an escalation — that breaks slim context.

## Pre-QA snapshot (`task_breakdown_pre_qa`)

Conditional snapshot of the Lead Developer's task breakdown before QA (07) edits in place. **Default: skip.** Produced only when a human reviewer will read the Lead-Dev → QA diff (interactive runs). Autonomous / dogfood / batched runs leave the slot `null` — a snapshot no human reads is pure write-amplification (a dogfood rerun, 2026-05-02).

**Distinct from the task-breakdown stop.** The snapshot setting controls whether the diff *file* is written; whether the run *pauses* for review before QA enrichment is governed by the top-level gate model — `/task-breakdown` is a **soft** gate (auto-continues) unless the operator added a task-breakdown stop to `scope_dial.extra_stops` (§ "Operator Gate"). The two are independent — e.g. snapshot=on while the run still auto-continues, useful when an asynchronous reviewer reads the diff later. Default: no file, no pause. Per F3 (PRD-003 friction-log-20260509).

## Skill-load reuse

Within a single session, once a skill has been loaded by an agent, downstream agents in the same session **must not** re-invoke it. They cite the already-loaded content by **name**. Re-streaming the same skill twice per session is waste. Re-invoke only when a different purpose genuinely needs it. Skills are assumed discovered — refer by name only; do not cite install paths or a "canonical home."

### Skill naming

Refer to skills by bare name (e.g. `marketplace-sdk-client`). Do not embed filesystem paths or plugin-repo locations in agents, commands, or artifacts.

## Operator Checkpoint

The fixed-format block every dev-flow command writes at the **top** of its final user-facing handoff message — above the "what I did" narrative. Exists because critical attention items (assumptions made, concerns, open questions) buried inline in long handoff summaries are easy to miss between stage gates. Inverts the pyramid: signal first, audit trail last. Makes the operator's job structural rather than vigilant.

**Required sections** (rendered in this order; sections with no entries render `— none`):

```markdown
## Operator Checkpoint — <command>

**Decisions needed**
- <item the operator must answer before the next stage proceeds>

**Assumptions made**
- <thing the agent assumed without explicit confirmation; flag for verification>

**Concerns / risks**
- <known risk the agent could not eliminate — SDK-shape uncertainty, fixture provenance gap, fidelity-untested tooling, etc.>

**Open questions**
- <thing the agent could not answer and the operator has not been asked>
```

**Position rule.** First block in the final assistant message. The audit-trail narrative ("Files written: …", "Stages run: …", "Recommended next step: …") goes **below** this block, not above.

**Empty rule.** A checkpoint with all four sections at `— none` is still emitted — the absence is itself a signal that the stage genuinely had no open items. Do not omit the block.

**Severity tagging (optional but recommended).** Prefix high-impact items with `[BLOCKER]`, `[WARN]`, or `[INFO]`. A `[BLOCKER]` in "Decisions needed" means the next stage cannot proceed until answered. Items without a tag default to `[INFO]`.

**Mirroring rule (manifest schema 6+).** When the command writes a run manifest update, mirror each non-empty item into the manifest's top-level `operator_attention[]` array with `{ stage, severity, kind, item, raised_at, resolved_at }` so `/status` can roll up unresolved items across products. Resolution: do not edit prior entries in place — append a new entry with `kind: resolved` and `references: <prior raised_at>`. See `.agent/manifests/README.md` § "Operator attention" for the entry contract.

**Per-stage mirror (manifest schema 7+).** In addition to the top-level array, copy each non-empty Operator Checkpoint item into the matching `stage_history` entry's `escalations[]` so a forensic query like "what concerns did `/architect` raise?" is answerable without re-walking the top-level array. The top-level `operator_attention[]` remains the cross-product SoT; `escalations[]` is the per-stage forensic slice.

**Source of items.** The block aggregates signals the agent already surfaces today but currently buries inline:

- "Decisions needed" — pending `AskUserQuestion` answers, branch-of-flow gates (e.g. an operator-added task-breakdown stop via `scope_dial.extra_stops`), unresolved choices.
- "Assumptions made" — anything stamped `[inferred]` (per `source-analyst` convention), assumed SDK shapes lacking a `.d.ts` citation or captured-fixture provenance, defaults applied because the operator skipped a question.
- "Concerns / risks" — failing/pending smoke entries, unmerged predecessor branches (stacked PRDs), Marketplace runs missing host-frame smoke, known fidelity gaps.
- "Open questions" — items the agent could not resolve and the operator has not yet been asked (e.g. a manifest field with no value and no way to default).

**Scope.** Mandatory for: `/create-prd` (after the PRD is written), `/challenge-prd` (after the review + merge), `/architect`, `/task-breakdown`, `/implement`, `/code-review`, `/test`, `/document`, `/ship`. Optional for `/rubber-ducky` (its concept brief already enumerates Open Questions). Not applicable to read-only / setup commands (`/prime`, `/status`, `/create-rules`, cleanup commands).

## Scope dial

The per-run configuration set **once, upfront** at `/create-prd` kickoff via **three `AskUserQuestion` calls** (the tool caps at 4 questions/call — a planning batch of 4, an autonomy + build-cost batch of 4, and an imagery + reference + verbosity + dual-review batch of 4). The answers persist as `scope_dial` in the run manifest and are inherited by every downstream command; each can still be overridden per-stage. Replaces the old per-stage prompts.

| Dial | Values | Effect |
|------|--------|--------|
| `rigor` | `light` / `standard` / `thorough` | Depth of the **grill** at both Discovery and Critical review — a **question budget** (3–5 / 8–12 / 20+ uncapped), not a round count. See § "Interrogation protocol" |
| `track` | `full` / `minimal` | `/architect` track — minimal skips the architecture blueprint file |
| `ui_variants` | `skip` / `1` / `2` / `3` | Default UI proposal count at `/architect`. **Not asked at kickoff since 2026-09-25** — `/design` asks the real question, so the kickoff slot went to `delivery_shape`; resolves from `ui=` or defaults to `1` |
| `delivery_shape` | `mvp-first` (default) / `all` | Is PRD-000 the **MVP** or the **whole vision**? The spec carries the full vision either way — this decides how much of it is ONE deliverable. `/architect` § 2b-i measures four signals (`adrs_new` ≥ 5, `components` ≥ 10, `content_types_related` ≥ 3, `tranches_projected` ≥ 15) and **records all four on every run, under both values**. Under `mvp-first`, crossing any threshold proposes an MVP cut + named follow-on PRDs (program block, `1 of M`); under `all` it records the cut it *would* have proposed in `operator_attention` and continues. **The dial never suppresses the measurement** — a dial that turns off the number is how an operator stops being able to tell a big run from a small one. Under `fully_autonomous` the default is applied and logged, never stopped on. Slash `shape=` |
| `docs_at_ship` | `auto-lite` / `full` / `none` | `/ship` doc emission — auto-lite is inline 1-paragraph README + CHANGELOG; full requires `/document` to run before `/ship`; none skips docs |
| `delivery_parallelism` | `serial` (default) \| `parallel` *(experimental)* | How many component tranches build at once. `serial` = one at a time (Developer → review → QA → next). `parallel` = independent tranches run their **{Developer → Code-Reviewer}** pair simultaneously in isolated git worktrees; when every tranche is review-clean they merge back, the `.sitecore` maps regenerate once, deferred shared-tenant writes apply serially, and then **ONE QA (07) runs over the integrated whole** (full suite + lint + build) before the operator gate. The triad splits across the merge because review is diff-local (valid in isolation) while QA is integration-dependent (a worktree's partial maps would validate a codebase that never ships). **Safety is not a dial** — an unprovable set runs serially regardless, and 🔍 probes always block. Inert on single-tranche runs. Rule `71` § "Parallel tranches". |
| `delivery_loop` | `per_component` / `once` | Build-phase **test-leg cadence** (rule 71). **`/code-review` is per tranche in BOTH values** — only QA moves. `per_component` (default, best outcome) = full triad, review + test after each component tranche; `once` = {Developer→Code-Reviewer} pair per tranche (commit at review-clean), then **one** `/test` over the whole build (cheaper). Inert on single-tranche runs. Override per-run with `loop=` on `/implement` |
| `gates` | pick-any of `spec` / `design` / `build` / `final` / `go_live` (all default on) + `extra_stops[]` | Operator stop-points (pick-any multi-select). A stage's hard stop fires iff its token is on. `build` = end-of-build review of the **Components Preview** page at `/test` close (content-sdk runs; inert on non-content, which review at `final`). All on = `autonomy: auto_3_gates` (default); none on = `fully_autonomous` (zero human interaction — live publish + real-tenant boundaries run unattended). Genuine blockers still stop. See § "Operator Gate" for the gate ladder. |
| `content_authoring` | `auto` / `yes` / `no` | Gates the Content SDK content phase (`/discover-components` → `/author-content` ⇄ `/test-content` → `/publish`). `auto` = runs iff content-sdk; `no` = skip it, `/ship` is terminal |
| `imagery` | `mood` / `none` | How `/author-content` fills empty Image fields — `mood` = Claude-generated abstract/decorative SVG (no cost); `none` = leave empty |
| `output_verbosity` | `auto` / `minimal` / `verbose` | Mid-turn chat narration (rule `73`). Asked at kickoff (Call 3); `auto` (Recommended) = keep each agent's frontmatter pin; `minimal`/`verbose` force that level everywhere. `fully_autonomous` + `auto` still forces minimal. Slash: `verbosity=` |
| `dual_review` | `off` (default) / `on` / `fable` | Whether `/code-review` and `/challenge-prd` run a **second, independent reviewer** next to the standard one, with **07 QA arbitrating** the merged findings. The primary reviewer is Sonnet in both commands. `off` = a single reviewer. `on` = the second reviewer runs on **Opus 5.5** (about $0.50 per code review). `fable` = the second reviewer runs on **Fable**, an explicit opt-in at about 2.5× the cost of an Opus review. Measured basis: on the 5.0 generation, Sonnet and Fable each false-cleared a real defect the other caught, and the pair missed nothing. On the 5.5 / 5.1 generation that effect did not reproduce: every pairing reached the same coverage, and Sonnet 5.5 alone matched the best pair. So `on` is cheap insurance, not measured extra recall. Weigh it against a bounded-5 loop-back (a full re-spawn + re-review + re-test). Slash: `dual_review=`. |
| `external_reference` | `prohibited` / `cite` / `free` | Whether the run may consult peer products in this repo for reference patterns — `cite` (default) logs each borrow; `prohibited` = STOP-and-ask; `free` = no logging |

## Source pack

The fourth pack dimension, `.agent/packs/source/<id>/`, read by `/migrate`: what a run can read **besides the public site** — a backend, a code repo. First instance: `source:sitecore-xm-xp` (variants `mvc` → presentation `clone`, `headless` → `port`; `xdb` capability flag). Resolved with `resolve-packs.mjs … --source <id>`; the null is `none`.

**Additive only, enforced by the resolver.** A source pack may not claim a slot, set a dial, override anything (templates included), own a stage, re-default a variable or declare a pack-level key. It must name `requires` (packs that must all be active) and a closed `composes_with`; any other combination is refused. `runnableCombinations()` stays a triple, so the brief goldens never see this dimension — source compositions come from `sourceCombinations()`. Proof: `.agent/scripts/__tests__/source-axis-is-additive.test.mjs` (identity for every combination × stage with and without `source: none`, mutants for each forbidden key, and "adding a source pack never removes a brief line").

## Neutral content model

The `/migrate` intermediate layer: **source facts with provenance**, from any adapter, in one shape (`neutral-model.json`; schema `.agent/templates/neutral-model.schema.json`; gate `.agent/scripts/neutral-model.mjs --validate`). Every fact carries a `channel` (scrape / serialization / item-service / authoring-api / db-restore / repo) and a `tier` (`inferred` / `extracted`). It holds facts only — the SitecoreAI-native **target mapping** derived from it through the transformation catalog is a separate artifact (`target-mapping.json`), so optimisation never overwrites what the source said. Adapter #1 is a converter over the clone harness's `content-dump.json` that refuses to write a model whose round trip is lossy.

## Access ladder

How `/migrate` decides what a run can know. It asks three questions (live site, backend, source code; each may be "not available") and `feasibility.mjs` measures the answers into a verdict: **full**, **to-model-gate** or **not-doable**. **Rung 0** — code only (a serialization repo, or the site's Sitecore installation packages; no running instance, no URL) → the source pack's extractor reads the repo (`extract.mjs --serialization`) or the packages (`extract.mjs --packages`); there is nothing to scrape, so the look comes from a visual-truth ladder (archived replay → compiled theme CSS + code-derived structure, structure only → operator-supplied); a Helix / plain-MVC repo then recreates through the Helix layout path (placements hung on the views that render their keys, header / footer synthesized as partial designs); an SXA or SCS-only repo stops at the MODEL gate. **Rung 1** — URL only → `/source-analysis` exactly as today (clone = migrate on the lowest rung). **Rung 2** — + source system + backend access → the source pack's extraction per data class (developer items from serialization, content from a read API on master — ItemService REST with a CM login by default, Authoring GraphQL when enabled, DB restore as last resort). **Rung 3** — + code access → data-to-markup binding, front-end assets, portability inventory. Each rung only adds facts or corrects inferred ones; disagreements become drift findings at the MODEL gate (precedence: look ← scrape, stored data ← backend, binding ← code).

## Content architecture

**The target is `.agent/packs/platform/content-sdk/reference/sitecoreai-target-architecture.md`** (2026-10-29): what a modern SitecoreAI project looks like, backend (headless SXA collection / site / data scopes / presentation) and head app (Content SDK App Router), each rule marked proven / documented / starter / open, plus a legacy-to-modern map and a gap register. **Modernize means mapping onto that reference**, not "use stock components wherever possible": Sitecore's own guidance and starter build purpose-named project components (clones with parameters and variants) and use stock ones where they fit. The paragraph below describes what `modernize.mjs` implements today; the reference's gap register (G1–G13) lists where it falls short.

The `/migrate` choice between keeping a source's content model and adopting SitecoreAI's own (asked at intake with the access questions, recorded as `migrate.content_architecture`, confirmed at the MODEL gate as `D-architecture`). **preserve** recreates the source's components, datasource templates and layout renderings as generated items. **modernize** maps every rendering that has a stock equivalent onto it: pure grid layouts (one key per column) become Column Splitter / Container (a Container keeps its source wrapper, a contained splitter its frame, as a `Layout` style), content and link lists become Promo / RichText / LinkList (several source renderings on one stock component become its variants), page-bound title, body and menus become Title / PageContent / Navigation, page-local `_Local` folders become the page's `Data` (SXA Page Data). The look stays the source's: the head app renders the stock component names in the site's markup. Rows without an equivalent stay as preserve writes them. Mechanism: `.agent/packs/source/sitecore-xm-xp/scripts/modernize.mjs` (proposal, the recreate / reconcile pre-pass, field transforms).

## Operator Gate

What a dev-flow command does **after** it has emitted its Operator Checkpoint and "files written" summary. Defines whether the command stops and waits for explicit operator approval before the pipeline advances, or auto-completes and lets the operator decide when to fire the next command. Distinct from the Operator Checkpoint: the checkpoint is the **what** (surfaced items); the gate is the **what happens next**.

> **Source of truth = the command playbooks + rule `71-delivery-loop.mdc`, not this entry.** Each dev-flow command encodes its own gate mode in its **Output rules** (guaranteed to load when the command runs); the build phase's autonomy + the single end-of-build `build` gate are owned by rule `71` (`alwaysApply`). This section is the shared *vocabulary* for those rules. It exists because gate behavior buried only here was missed on a real run (a build over-stopped mid-loop to have the operator eyeball the test page, before code-review/QA — exactly the failure this pointer guards against). When the two disagree, the command + rule win.

**The conditional `model` token (2026-10-10).** Core-owned, and it exists only on a `/migrate` run with an active source pack (§ "Source pack"): default on, it fires at `/migrate` close before any target write, so the operator approves the target mapping and every drift finding. A run without a source pack has no such token, and its gate set is unchanged.

There are exactly two gate modes — every dev-flow command picks one in its frontmatter / Output rules:

| Mode | Behavior | Where it applies |
|------|----------|------------------|
| **hard** | STOP. End the final assistant message with an explicit "Reply **YES** to proceed to `<next-command>`, or describe changes." Do not "recommend next step" passively. Wait for an operator reply before considering the cycle ready to advance. | The **default gates** (below): `/challenge-prd` close (spec), `/design` close (clickdummy), the **build review** (`build` — `/test` close on a content-sdk run, presenting the Components Preview page), and `/test-content` close (final rendered output; `/test` for non-content runs, which is where those runs present the Components Preview page). A stage that doesn't run in a branch drops its gate. |
| **soft** | Auto-complete. After the Operator Checkpoint and summary, end with a one-line recommendation: "Recommended next: `/<next-command>`." Do **not** stop and wait — the operator runs the next command when ready. **Exception (critical triggers):** if the Operator Checkpoint contains any `[BLOCKER]`-tagged item, OR any of the command-specific critical triggers listed in its Output rules fired, the command MUST escalate to a hard stop for that run: end with "STOP — `<reason>`. Reply **YES** to override and proceed anyway, or address the issue first." | Every other stage — `/architect`, `/task-breakdown`, `/provision-sitecoreai`, `/implement`, `/code-review`, `/test`, `/discover-components`, `/author-content`, `/ship`, `/publish`. The operator stays in the loop only when a critical trigger or `[BLOCKER]` fires. `/publish`'s **live publish** is additionally an operator-confirmed integration boundary (an outward-facing action), even though its gate is soft. |

**Critical triggers (what makes a soft gate escalate).** Each command names its own list in its Output rules. Canonical examples:

- `/architect` — SDK contract verification failed; Marketplace + UI run produced no winning POC selection; an ADR was deferred with "decide later" on a load-bearing choice.
- `/implement` — the pre-completion validation gate fired (lint / build / git-status untracked-file hard stop); any escalation the Developer could not resolve from § 4c.
- `/code-review` — a Critical or Major finding could not be auto-fixed (the operator must decide a non-trivial trade-off); an SDK-contract grep hit landed and the fix touches code outside the PRD scope.
- `/test` — any `pending|failed` smoke entry; Release readiness is `Not ready`; Marketplace host-frame smoke was deferred (host URL not supplied). (When `/test` is the branch's *final* gate — non-content runs — it is HARD, not soft.)
- `/ship` — ship status is `incomplete`; any `[BLOCKER]` item from upstream stages survived to ship.

(`/test-content` is no longer listed here — it is one of the three **hard** gates above.)

## External reference

The `scope_dial.external_reference` policy — whether a run may consult **other head apps / products in this repo** (peer products) for reference implementations. Set at `/create-prd` kickoff (Call 2), inherited by every build/authoring agent, enforced by rule `20-boundaries`.

- **`prohibited`** — build only from THIS product's own code + the sanctioned shared knowledge (the `sitecore:*` skills, `node_modules` `.d.ts` per rule `40`, the shared `cm/`). If a sibling product would solve a wall, **STOP and ask the operator** — never peek. Makes a run a genuinely independent build.
- **`cite-required`** (default) — reference is allowed, but every borrowed peer-product pattern is **logged** (to `operator_attention` / the run report: what + from where), and a **reliance count** (references / verbatim ports) is reported at `/ship`, so a run's independence stays auditable.
- **`free`** — reference siblings freely, no logging.

Governs **peer-product code ONLY**. It never restricts the `sitecore:*` skills, `node_modules` `.d.ts`, or the shared `cm/` — those are the product's legitimate scope, not "another repo". Motivation: a sibling reference is often the fastest, highest-quality path (SDK shapes, the CM host, an auth pattern), but heavy uncited reliance turns a "new build" into an undisclosed re-skin (one run's PRD-000 leaned on a sibling app heavily) — the dial makes that a conscious, measured, upfront choice.

**Configurable operator stops — pick-any, asked once, default gates (2026-07-07; `build` added 2026-07-16).** A run advances hands-off; the operator is stopped only where human judgement is load-bearing and a wrong call is expensive to unwind. **With no opinion**, a non-content PRD run has **three hard review gates** (`spec` · `design` · `final`) plus the outward-boundary confirm; a **content-sdk run** adds the `build` gate (end-of-build Components Preview review) between `design` and `final`, since its build phase finishes long before the post-authoring `final` gate. The build phase itself stays autonomous either way — the `build`/`final` gate is the *only* operator stop during/after the build, never a per-component or mid-loop one (rule `71-delivery-loop.mdc`):

| # | Hard gate | Gate token | Why |
|---|-----------|------------|-----|
| 1 | **`/challenge-prd` close** — the spec, *after* it has been critically reviewed and the answers merged | `spec` | don't build on a misaligned PRD. **Moved here from `/create-prd` close on 2026-07-29** when the critical review was split into its own stage: `/create-prd` writes the spec and closes soft, auto-chaining into `/challenge-prd`, which reviews → merges → gates. The gate confirms a *challenged* spec, not a freshly-drafted one. When the operator says `skip critical review` the chain does not fire and `/create-prd` inherits this gate. FRD runs chain too but close **soft** (their one hard gate stays at `/task-breakdown`). |
| 2 | **`/design` close** — the visual (clickdummy) | `design` | design taste is the operator's; lock it before implementation copies it |
| 3 | **`/test` close on a content-sdk run** — the built components on the **Components Preview** page | `build` | the operator's single end-of-build look at the *real rendered components + all variants* before the content phase begins; the build phase is otherwise autonomous — **no per-component or mid-build operator stops** (rule `71-delivery-loop.mdc`). Inert on non-content runs (their built output is reviewed at the `final` gate below, at `/test`). |
| 4 | **`/test-content` close** — the final rendered output | `final` | the last look before the run goes live at `/publish` (non-content runs use **`/test`** as this final gate, before `/ship` — where it also presents the Components Preview page) |
| — | **outward/real-world boundary confirm** — `/provision-sitecoreai`, first real-tenant write in `/implement`, the Components Preview fixture composition in `/test` (QA 07), live writes in `/author-content` / `/test-content`, and the `/publish` go-live | `go_live` | a live/real-tenant mutation is hard to reverse; confirm before touching the real world (default on) |

**The gate set is operator-configurable at kickoff (`scope_dial.gates`).** The four tokens above are the **source of truth**: a stage's hard stop fires **iff its token is `true`**. All four default `true` (= today's behavior, `autonomy: auto_3_gates`). The operator **picks any subset** — keep some, drop others — and MAY also add extra stops (`scope_dial.extra_stops`, soft stages promoted to hard). Dropping **all** of them (empty gate set, no extra stops) is **`fully_autonomous`**: the run goes end-to-end with **zero human interaction** — the live `/publish` and every real-tenant boundary proceed **unattended**. **Genuine blockers are not gates and always stop** regardless of the set — a stage that cannot complete (build/publish-job failure), the bug **can't-reproduce / not-contained** valves, and any `[BLOCKER]`-tagged Operator Checkpoint item — because there is no autonomous path past a hard failure, so it is surfaced. See `.agent/manifests/README.md` § "Scope dial" for the field shapes.

**Content phase after ship (2026-07-06).** For Content SDK runs, the content phase (`/discover-components` → `/author-content` ⇄ `/test-content`) runs **after `/ship`**, and `/publish` is the final step (see § "Preview-first delivery"). `/ship` (code-only) stays soft; `/test-content` is the branch's hard gate #3; `/publish` is soft but its live publish is operator-confirmed. Non-content runs are unchanged (end at `/ship`, with `/test` as the final hard gate).

**Everything else is soft** — `/create-prd` (chains into `/challenge-prd`, which holds the `spec` gate), `/architect`, `/task-breakdown`, `/provision-sitecoreai`, `/implement`, `/code-review`, `/test`, `/discover-components`, `/author-content`, `/ship`, `/publish` auto-complete + recommend the next step; they escalate to a hard stop only on a **critical trigger** (above) or a `[BLOCKER]` checkpoint item. A stage that does not run in a branch (e.g. `/design` when `ui_variants: skip`; `/test-content` / `/publish` outside the Content SDK branch) simply **drops its gate** — lighter weights collapse toward autonomous (frd ≈ spec + final gate; bug = 0 planned + the valves below).

**Ask ONCE, upfront.** `/create-prd` kickoff (the scope-dial `AskUserQuestion` batch) confirms the run's autonomy: **default = these 3 gates + the outward-boundary confirm, hands-off between them**. The operator picks which gates stay on (pick-any, down to zero = `fully_autonomous`) and MAY add stops, but **do not add stops by default** — over-stopping is the failure mode this replaces (the schema-8 work-item gate ladder stopped too often; the old `/task-breakdown` hard gate is now SOFT). The **bug valves** remain as conditional escalations of the otherwise-autonomous bug path even under `fully_autonomous`: **can't-reproduce** (no concrete RED test → STOP and ask) and **not-contained** (root cause is a design flaw → STOP and promote, § "Type promotion"). SDK-touching bugs still require a real-tenant smoke before `/ship`.

**Content authoring is a kickoff dial too (`scope_dial.content_authoring`).** Whether the Content SDK **content phase** (`/discover-components` → `/author-content` ⇄ `/test-content` → `/publish`) runs at all is set upfront: `auto` (default — runs iff the active platform pack declares this dial), `yes` (force it), or `no` (skip it — `/ship` is terminal and the content-phase commands are not recommended). When the content phase runs, `scope_dial.imagery` (`mood` default / `none`) sets how `/author-content` fills empty Image fields (see § "Content test").

**Output verbosity is a kickoff dial too (`scope_dial.output_verbosity`).** Controls **mid-turn chat narration** (not artifacts on disk, not the rule-72 final envelope). Asked in `/create-prd` Call 3 (Narration). Values: `auto` (Recommended — each agent keeps its frontmatter pin: execution `minimal`, planning `verbose`) · `minimal` (force silence everywhere) · `verbose` (force progress narration everywhere). When `autonomy` is `fully_autonomous` and the dial is `auto`/unset, every spawn is forced `minimal` (nobody is watching). Team Lead injects `Output Level: <minimal|verbose>` on every specialist spawn. Rule `73-output-verbosity.mdc`. Slash override: `verbosity=`. Distinct from slim context (input tokens) and from rule `72` (handoff size).

**Probe-tranche confirm (rule `70-probe-and-tranche.mdc`).** Independent of the work-item gate ladder: when a plan contains 🔍 **probe tranche(s)** (see § "Probe" / § "Tranche"), the run pauses after they execute for an explicit operator **go/no-go** — every verdict (confirmed / refuted / needs-more) is surfaced in the Operator Checkpoint and the operator confirms whether dependent tranches proceed. Probing is soft everywhere else, but this boundary is a mandatory confirm: a `refuted` verdict is not auto-fatal, yet moving past it is the operator's explicit call (cancel / promote-split / redesign). The Team Lead (00) enforces this during orchestrated runs; the Developer (08) honors it when `/implement` reaches a probe tranche.

**Freeform mode.** Gate policy is irrelevant in freeform (`/implement`, `/code-review`, `/test` standalone). The operator chains commands by hand. Soft-gate "recommended next" hints are still emitted as a courtesy; hard stops still fire on critical triggers.

**Position rule.** The gate verdict is the **last line(s)** of the final assistant message — after the Operator Checkpoint (top) and the files-written / status summary (middle). Hard-stop runs use a YES prompt; clean soft-gate runs use a one-line "Recommended next" hint; escalated soft-gate runs use the STOP / override phrasing.

## Components Preview

The dedicated Sitecore page tree a Content SDK build composes to **prove every component renders** and to give the operator **one ergonomic end-of-build review surface**. Under `Home`, a `Components Preview` root page; under it **one subpage per component**, and on each subpage **all of that component's variants** composed and labelled (structural components get their inner placeholders filled with sample children; header/footer-placeholder components sit in their real band). Content is **throwaway** — the Preview proves the component + its Sitecore rendering schema render; it is never the real authored content (the real pages are composed + authored once in the content phase — see § "Content test" and rule `80-content-sdk-headapp.mdc` § 0b).

- Built during `/implement` (assembly), one subpage per component as the components land; it is the surface the **`build` gate** (§ "Operator Gate") presents for the operator's single end-of-build approval.
- Reused by `/discover-components` in the content phase (idempotent skip-if-exists) to re-capture screenshots for the Components Map — the same tree, not a second one.
- **Renamed 2026-07-16** from the earlier flat "Components Test" page — same purpose, now a per-component/all-variants tree so the operator review and the completeness ("0 empty slots") gate both read cleanly. Source of truth for structure = rule `80` § 0b + `discover-components.md`; this entry is the vocabulary.

## Authorability

**Whether an author can find a component's content and change it** — as distinct from whether the component renders. A rendering is *authorable* when every human-readable value it displays arrives on the `fields` prop (from its own datasource or the context item), renders through an SDK field component, and is therefore inline-editable in the Pages canvas.

**Authorability is a shipping requirement, not polish** — a component that renders perfectly and cannot be edited is a CMS component that has opted out of the CMS.

**Five mechanisms break it, and all five render correctly:** a **plain string** (value fetched outside `fields`, so no editing metadata), a **bypassed `fields` prop** (the component does its own read against a fixed path — the systemic one, chosen once and inherited by every component after it), a **partial guard** (bare `hasValue` hides an empty field from the author), **unmount-on-empty** (no click target in the canvas), and a **`ComponentQuery` that replaces the payload** (metadata stripped).

**Nothing else in the pipeline can see it.** Unit tests mocking `fields` pass identically whether or not the component reads them; the build, lint, type-check, code review and the rendered-surface smoke are all blind. A prior run's PRD-000 shipped **17 of 21 renderings entirely un-editable** past 704 unit tests, 88 e2e tests, four code reviews and a full `/test` — plus six renderings carrying a Datasource Template they ignore, so an author could attach a datasource, fill it, save it, and nothing happened.

**Where content genuinely is not datasource-shaped** (live feeds, computed scores, catalogue aggregates), the exception is **per field, never per component**, it is named in the task breakdown's § 4c, and the source must be **discoverable from the authoring UI** — an author who sees a component with no fields has no way to guess that a settings singleton drives it.

**Fixed UI microcopy** (aria-labels, empty states, form labels) has three homes: the datasource, a settings item, or the **Sitecore Dictionary** (§ "Dictionary (Sitecore)"). A JSX literal is none of them.

Gate: `node .agent/scripts/audit-component-authorability.mjs --app <head-app>` at every delivery-loop exit (a **floor**, not proof — one real Pages-canvas check per component is still required). Two of its axes only warn: `literal-microcopy` and, for beta.atoms catalogs, `atom-plain-string`. Rule: `86-component-authorability.mdc`; editing-safe mechanics: rule `80` §§ 3, 5, 8.

## Commit message convention

Every commit the framework authors — the canonical `/ship` commit (`10-ship.md` § 16), incremental commits during `/implement`, and any freeform commit-and-push — carries a message that explains **why** the change was made, not just **what** files moved. The diff already shows the *what*; a message that only restates it ("updated X, adapted Y") is noise. The message's job is to record the **motivation**: the problem or goal that drove the change and, for a fix, the behavior it repairs.

**Shape.**

- **Subject** — one line, Conventional-Commits form `type(scope): summary`. `type` ∈ `feat | fix | docs | refactor | test | chore | perf | build`, chosen by intent (`fix` for a bug, `feat` for delivered capability, etc.); `scope` = the product slug (or affected area); `summary` = imperative and outcome-first ("add per-user seat limits", not "edit seats.ts").
- **Body** — a short rationale paragraph (1–4 sentences, prose) answering: **why** was this needed (the problem, reason, or goal) and — for a fix — **what it fixes** / the behavior before vs after. Add non-obvious *what* only when the diff doesn't make it clear (a design choice, a tricky mechanism); never a file-by-file enumeration. Put references and status on their own trailing lines: the work-item id (`PRD-003` / `FRD-007` / `BUG-012`) and, at `/ship`, `Ship status: <shipped | shipped_with_caveats | incomplete>`.

**Length guardrails (hard rule).**

- **Subject max = 72 characters** (recommended window: 50-68). If auto-generated text exceeds 72, shorten the outcome phrase until it fits.
- **Body max = 4 non-empty rationale lines/sentences** (excluding trailing reference/status lines). Long bullet lists belong in the PR body, ship report, changelog, or planning artifacts, not the commit message.
- Commit messages that violate these limits are considered non-compliant with this convention, even if the content itself is accurate.

**Enforcement + helper.**

- The `.githooks/commit-msg` hook enforces these rules at commit time when `core.hooksPath` is set to `.githooks`.
- Use `/commit-message` when composing manually — it drafts a compliant message from staged/working changes and validates it with `.agent/scripts/validate-commit-msg.mjs` before returning it.

**Source the "why" — don't invent it.** Pull the rationale from the artifact that already states it: a **bug**'s current-vs-expected behavior, an **FRD**'s user value, a **PRD**'s problem statement / phase goal, or (freeform) the user's prompt intent. If a change genuinely has no reason beyond "it was requested," state the reason it was requested.

**Illustration** (anti-pattern → convention):

```
✗  feat(billing): update dashboard and seats files

✓  feat(billing): enforce per-user seat limits

   Free-tier accounts could invite unlimited members, bypassing the
   paid-seat model and leaking premium features to a whole org on one
   subscription. Gate invitations on the plan's seat count and surface
   an upgrade prompt when the limit is hit.

   PRD-003
   Ship status: shipped
```

## Content test (`/test-content` vs the in-loop Content QA gate)

The content counterpart of `/test`. **`/test-content`** is the **authoritative, independent** audit of authored content **as it renders** — the words plus **page structure** (right components / order / completeness + content-resilience: oversized/many/empty) and **look-and-feel** (the rendered page vs the POC / Components Map / design-eye yardstick). It runs the **same loop as `/test`**: QA Specialist (07) audits with fresh eyes → Content Author (14) fixes → 07 re-audits the critical fixes → report + a `content_tested` `stage_history` entry → **hard gate #3 → `/publish`**. It sits in the Content SDK branch (which runs the content phase **after `/ship`**, 2026-07-06) between `/author-content` and `/publish`.

It is **distinct from** the **in-loop Content QA gate** that runs *inside* `/author-content` (agent 07, content-review mode): that one is the author's fast same-session self-check on the four content axes (brand · voice-register fit · factual accuracy · channel format), so a standalone / freeform author run still ships clean. `/test-content` is the fresh reviewer who did not write it, and it **adds** the structure + look-and-feel + imagery axes.

**Brand kit (prepared seam, not yet wired).** `/test-content` carries an **optional brand-conformance axis**: supply a **Sitecore native brand kit** (Marketer MCP `list_brandkits` / `get_brandkit_by_id`) or an **operator-provided brand-kit file** and the audit checks against it; supply none (today's default) and the axis is **skipped + noted**. Adding a brand kit later *adds* the axis; it does not replace the yardstick.

**The content loop (formalized 2026-07-06).** `/author-content` ⇄ `/test-content` is a **bounded loop with QA (07) as the sole arbiter** of "good enough." The content tester (07) judges the rendered result on its own merits — matching / on-brand content, structure completeness, content-resilience, look-and-feel, imagery — and *its* verdict, not the author's, decides whether the content is ready. Any Critical/Major finding **or** a "not good enough" verdict loops back to the Content Author (14) for a fix pass; the loop is **bounded to 3 cycles**, then escalates to the operator. The content phase now runs **after `/ship`** (the code is already shipped) — `/discover-components` → `/author-content` ⇄ `/test-content` → `/publish` — and works **preview-only**: no publishing happens inside the loop; the single global publish is deferred to `/publish` (see § "Preview-first delivery"). `/test-content` remains **hard gate #3** (§ "Operator Gate") — the final look before the run goes live at `/publish`.

**Naming note.** The symmetric rename of `/test` → `/test-implementation` (to pair with `/test-content`) is **deferred** — see `.agent/BACKLOG.md`.

## Image commissioning (Content Author image pass)

When the Content Author (14) composes a Sitecore page and a component's **Image field is empty**, it fills it at the run's `scope_dial.imagery` tier rather than leave the CSS fallback. It derives a per-slot **image brief** — subject / style / mood / composition / aspect — from the copy it just wrote + the PRD/FRD + the spec's visual identity + the slot's role, and lands it: upload to the Media Library, link the `mediaId` onto the Image field via the Marketer MCP (`update_fields_on_item`), and **verify it renders**. A set field is **not** proof the image shows — a component's CSS can mask it (a hero's decorative orb hid a correctly-set HeroImage); `/test-content`'s **imagery** axis checks *field-set ≠ visibly-rendered*. **Brand-kit-derived palette is a deferred seam.**


## Structure component · Slot component

**Structure components** are the OOTB SitecoreAI Page Structure renderings an author nests in Pages to build layout: **Container**, **Column Splitter**, **Row Splitter** (JSS set; the MVC set is unusable by a head app). Each exposes **dynamic placeholders**, delivered by Edge as `container-{*}` / `column-N-{*}` / `row-N-{*}` with the instance id in `DynamicPlaceholderId`, and sizes its parts with **grid parameters** (`GridParameters`, `ColumnWidthN`), class names from the site's grid definition. A **slot component** is a project rendering wired the same way (one Placeholder Settings item per slot, `IsRenderingsWithDynamicPlaceholders=true`) for a layout the grid cannot express, with author-picked presets. The scaffold ships neither. **Fit tier**: each head app declares per component where it may go (`chrome` Partial Designs only, `section` top-level at 12 only, `wide` at least 6/12, `flexible` any column of 240 px or more) in `src/lib/layout/component-fit.ts`; a column placeholder does not know its width, so fit belongs to the component, and `lint-layout.mjs` checks it. Skill: `content-sdk-layout-composition`.

## Collection class

A component that shows many items belongs to one of four **collection classes**, decided by who authors the rows and where: **owned rows** (authored on this component: a container datasource with row children, delivered by a rendering `ComponentQuery` with `jsonValue` fields, rows added in Pages through Manage items), **derived view** (rows are other pages: a cached server-side Edge fetch, edited at source), **curated reference** (a Multilist of items that live elsewhere) and **shared library** (a large folder: never in layout data, ids first, then fetch the subset shown). Content resolvers are not supported with Edge runtime publishing, so none of the four uses one. Skill: `content-sdk-collection-data-model` (bundles `probe-list-delivery.mjs`); building owned rows: `content-sdk-list-component`.

## Placeholder restriction policy

Sitecore placeholders carry an **allowed-renderings** set (placeholder settings): a given placeholder only permits certain renderings, and placing a disallowed one yields an invalid / uneditable layout in Pages. When the Content Author (14) manages content on a Sitecore page (via the Marketer MCP, in `/author-content` and the `/test-content` fix loop), it reads that set **per placeholder** with **`get_allowed_comps_by_ph(pageId, placeholder)`** — the same call `/discover-components` uses to fill structural placeholders.

Whether to *respect* the set is the **operator's call**, asked once at `/author-content` (Sitecore channel only — freeform / blog / website have no placeholders) and persisted as **`content_policy.enforce_placeholder_restrictions`** in the run manifest (`/test-content` inherits it; absent ⇒ enforce, the safe default):

- **Enforce (default — "follow the rules"):** compose only from a placeholder's allowed set; a desired-but-disallowed rendering is **substituted** with an allowed alternative or **surfaced to the operator**, never force-placed. `/test-content` treats an out-of-allowed-set placement as a **Major** structure finding.
- **Ignore ("add renderings as you think"):** the operator waived the rule; the author composes by best-fit judgement **but records each out-of-allowed-set placement as a deviation** so `/test-content` and the operator can see it. `/test-content` records it as an **accepted deviation**, not a failure.

Mechanics live in the `sitecoreai-content-composition` skill § Step 1.5.

## Brand voice and identity

The spec section that says whose voice the content is written in: brand and surface, source, audience, voice attributes, tone by surface, vocabulary, claims allowed, register default, an example, visual identity. It lives in a PRD's § 11a, an FRD's optional § 5a (which may say `**Inherited from:** prd-NNN.md`) and a marketer brief; the Developer slice mirrors one line of it. `sitecoreai-brand-voice` owns the template and writes to it. **A voice comes from a written source, never from the agent's taste:** `/author-content` stops and asks when `check-brand-voice-section.mjs` finds it missing or empty, under every gate set. The script judges presence; `/challenge-prd` also flags a vague one.

**Register** is how it sounds, the brand is whose voice it is: **brand** (default for site copy), **marketing**, **technical-neutral**.


## Initiative register (`initiatives.md`)

The **cross-repo handoff** into this build pipeline — a per-repo register of JPD-altitude **initiatives** (bets / directions). Produced in a separate research repo; a chosen initiative is promoted **into delivery here** via `/create-prd` or `/create-frd`. Distinct from the build **intake queue** (§ "Intake queue", `tasks.md`): an initiative is a *bet*, a queue entry is a concrete *work item*. Full authoring contract lives in the research repo's glossary.

