---
name: create-frd
intent: feature_spec
writes:
  - products/<product-slug>/project-planning/specs/frd-NNN.md
  - products/<product-slug>/project-planning/specs/frd-minimal-NNN.md
  - products/<product-slug>/project-planning/ADR/adr-*.md (only when § 6 flags an ADR-worthy decision)
  - products/<product-slug>/project-planning/plans/interrogation-discovery-<timestamp>.md (the grill ledger)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/platform-pack.md
  - .agent/commands/project/interrogation-protocol.md
  - .agent/commands/project/dev-flow/02-create-prd.md
  - .agent/agents/team/02-product-manager.md
  - .agent/commands/project/dev-flow/templates/frd.template.md
  - .agent/commands/project/dev-flow/templates/prd-minimal.template.md
  - .agent/commands/project/templates/status-md.template.md
  - .agent/manifests/run-manifest.template.json
---

# /create-frd — Feature Requirement Definition (the FEATURE weight of the intake engine)

## What this is

`/create-frd` is the **feature weight** of the same intake engine `/create-prd` drives. A Feature Requirement Definition is a **single, bounded change** — extend X, add support for Y, a scoped enhancement — that does not warrant the full PRD ceremony (multi-phase architecture, UI variants, two operator gates). Same Product Manager (02), same artifact slots (intake doc → minimal block → task breakdown), filled leaner.

**When to use FRD vs PRD vs bug.** See `.agent/glossary.md` § "Work item type". Short version: a fix for broken behavior → `/create-bug`; a bounded new capability → `/create-frd`; a multi-phase / multi-SDK-surface / new-product-surface build → `/create-prd`. Classification is fuzzy on the FRD↔PRD line — if this command discovers the work is actually multi-phase or needs an architecture blueprint, **promote** it (see § Promotion).

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **before** parsing slash arguments. Resolve `product_slug` first. All `project-planning/...` paths are under `products/<product-slug>/project-planning/`.

## Inheritance from /create-prd (do not duplicate)

This command **reuses** `/create-prd`'s mechanics verbatim — read `02-create-prd.md` for the full text and apply these sections as-written, with the deltas noted:

- **§ Timestamp rule** — identical.
- **§ Step 0 — pack resolution (M0)** — identical contract (`platform-pack.md`), but **inherit-only in practice**: an FRD is always a bounded feature on an existing product, so rung 1 (or rung 2 for a pre-pack manifest) always hits. **Never ask.** If neither rung resolves, the product has no prior run and the work item is mis-weighted — say so rather than starting a fresh detect.
- **§ Composition** — identical: the triple resolved at step 0 is recorded as `packs`; the legacy `platform_target` field is retired and is not written.
- **§ Inline research delegation** — identical (delegate fuzzy facts to the Research Sidecar).
- **§ Steps 0 / 0a (durability-tiering backfill + STATUS.md refresh)** — identical, but scan the `frd-NNN.md` family for numbering and add the new FRD row to `STATUS.md`. (Step 0's former auto-archive sweep is retired — see `/create-prd` § 0.)
- **§ Step 10 (Git setup — repo check + branch + stacked detection)** — identical, except the branch name is **`frd-NNN`** (not `prd-NNN`), derived from the FRD number resolved below. The inherited **`<PFX>` topology prefix applies here too** (`<head_app_slug>/frd-NNN` under a `monorepo` topology): an FRD always runs in an existing repo, so it **inherits `repo_topology` from the manifest and never re-asks** — the topology belongs to the repo, not the run. Run the inherited stacked-detection sub-step (10b-i) **as written** — it scans **all three families** (`prd-*` / `frd-*` / `bug-*`) for an unmerged predecessor. An FRD **frequently stacks on an unmerged PRD** (a feature built on a PRD that has not merged), so do NOT restrict the scan to the `frd-*` family — the cross-family case is the common one. Fall back to a fresh branch off `main` only when no unmerged work-item branch exists.
- **§ Step 14 (prd-minimal mechanical extraction)** — identical mechanism, applied to the FRD: extract the `<!-- PRD_MINIMAL_BEGIN -->…END` span from `frd-NNN.md` into **`frd-minimal-NNN.md`**, prepend the `prd-minimal.template.md` frontmatter (resolve `document_type: frd_minimal`, `artifact_name: frd-minimal-NNN.md`). The marker name stays `PRD_MINIMAL` (shared across all three types).
- **§ Operator Checkpoint output rules** — identical block at the top of the final message.

## Scope dial — DERIVED from type, not asked

An FRD does not run the scope-dial kickoff prompt. Derive the dial from the type and record it; the operator may override any field with slash args (`rigor=`, `track=`, `ui=`, `docs=`, `gates=`, `content=`, `imagery=`, `verbosity=`) or a message signal:

```json
"scope_dial": { "rigor": "light", "track": "minimal", "ui_variants": "skip", "docs_at_ship": "auto-lite", "autonomy": "auto_3_gates", "gates": { "spec": true, "design": true, "build": true, "final": true, "go_live": true }, "extra_stops": [], "content_authoring": "auto", "imagery": "mood", "output_verbosity": "auto" }
```

An FRD has no `spec`/`design` review gate of its own (it skips `/architect`+UI), so those tokens are inert for it, and `/task-breakdown` closes soft like every other untokened stage. The operative gates are `go_live` plus the end-of-build review: which token that close carries comes from the brief's `owns_final_gate`, exactly as at `/test` — **true** and the `/test` close is `build` with a downstream stage carrying `final`; **false** and the `/test` close IS `final`. The operator may still set `gates` (e.g. `gates=none` for a fully autonomous fix) or `content=no`. Override `output_verbosity` with `verbosity=minimal|verbose|auto` (rule `73`).

`track: minimal` means **`/architect` is skipped by default** — no architecture blueprint file. UI design is skipped. Override only when § 6 (Technical considerations) surfaces a genuine ADR-worthy decision or the feature has real UI scope; then the operator may run `/architect` for this one item.

## Numbering

`FRD-NNN` is a **separate per-product namespace** from `PRD-NNN` and `BUG-NNN`. The first FRD is `FRD-001` (there is no holistic FRD-000). Resolve the next `NNN` as `highest existing frd-NNN + 1`.

## Discovery — light and gap-focused

Run discovery in **`light`** mode (per `02-product-manager.md` *Discovery mode* table) unless the operator overrides `rigor`. Discovery is a **grill** — `.agent/commands/project/interrogation-protocol.md`, one question per `AskUserQuestion` call — at light's **3–5 question** budget. An FRD is scoped, so it confirms blockers only: the exact change, the acceptance criteria, the scope boundary, the top constraint. (A 3–5 question grill is compatible with the FRD's unattended *gate* topology: unattended means no hard stop at a stage close, not that the operator is never asked anything. The grill still collapses to zero questions under `fully_autonomous`.) When a brain-dump or ticket is supplied, run gap-focused discovery on its open items only. Close with the standard discovery-summary recap (3–6 bullets) and wait for confirmation before writing — the cheapest gate in the pipeline. `skip discovery` is honored.

## Acceptance criteria — mandatory DoD backbone

The FRD's definition of done is its **acceptance criteria** (§ 1.5 minimal block + § 3 expanded). Every FRD ships with 3–7 independently verifiable criteria the `/test` pass and `/ship` check against. For **chore-shaped work** folded into an FRD (refactor, dependency bump, tech-debt), use the **no-regression variant**: "existing suite stays green; build green; <internal quality X> improved; user-observable behavior unchanged" + a characterization test if the touched surface is unguarded. Do not let an FRD reach handoff without acceptance criteria.

## Steps

1. **Archive + STATUS refresh** — per `/create-prd` steps 0 / 0a, scanning the `frd-NNN.md` family.
2. **Resolve scope dial (derived, § above) and discovery level (`light`).** Record `work_item_type: frd` and the derived `scope_dial` in the run manifest.
3. **Invoke Product Manager (discovery mode, `light`) — the grill.** Per `02-product-manager.md` + `.agent/commands/project/interrogation-protocol.md`; 3–5 questions, one per `AskUserQuestion` call, ledger at `plans/interrogation-discovery-<timestamp>.md`. Skip if `skip discovery` or no operator is watching.

   **Resolve the pack brief for this stage and fold its `hooks.discovery.questions` into the pool** — `node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage create-prd --record <product>/project-planning/workflow --md` (pass `--record` only once the manifest exists — if this resolution runs before `--init`, stamp it at the manifest-write step instead, as `/create-prd` § 18 does), using the triple M0 resolved at § Step 0. This weight ran a platform-blind grill until 2026-08-23: `/create-prd` folded the brief in and the lighter weights did not, so an FRD on a platform never asked that platform's own blocking question. Three rules carry over unchanged from `/create-prd`:

   > **The Product Manager (02) holds no Bash and cannot run that command.** The orchestrator
   > resolves the brief and passes it down in the spawn prompt — the same relay the
   > interrogation protocol uses when a spawned agent lacks `AskUserQuestion`. A spawned agent
   > must never reconstruct a composition by reading `pack.json` by hand (`platform-pack.md` § 6).


   - A `method` pack declaring `replaces_greenfield_question_set` **replaces** the generic set rather than adding to it.
   - Where the brief declares `derives_instead_of_asking`, **derive** — do not ask — and show the derived value back at the summary checkpoint so a wrong inference is correctable rather than invisible.
   - A question that `resolves` a `variables` entry is not merely recorded: the value is substituted into the brief's own commands and skill names downstream. On this weight those are normally **inherited** from the product's first run rather than re-answered, so ask only when the inherited value is absent or the change invalidates it.

   **The `light` budget (3–5) still caps the grill** — the pack's questions join the pool, they do not extend it. An FRD is scoped, so blockers win: a platform question that cannot change this feature's shape is not a blocker and does not displace one that can.
   **An FRD that authors site content or changes copy** fills the template's § 5a: either `**Inherited from:** prd-NNN.md` when the PRD's section still holds, or the full fields when this feature has its own voice. Otherwise delete § 5a. `/author-content` stops without it (`check-brand-voice-section.mjs`).
4. **Discovery summary checkpoint.** Recap + wait for confirmation. Skip per `skip discovery` / `skip discovery summary`.
5. Read `.agent/commands/project/dev-flow/templates/frd.template.md`.
6. Resolve and read the source input(s) (prompt / brain-dump / ticket reference).
7. **Invoke Product Manager (constructive mode).** Build the FRD into `frd-NNN.md` using the FRD template — Summary, the § 1.5 Developer slice (inside the markers, with acceptance criteria), Problem, Acceptance criteria (expanded), Scope, Constraints, Technical considerations, Risks, Open questions. Incorporate every confirmed discovery answer. **Respect the ~150-line soft cap** — exceeding it is the promotion signal (§ Promotion).
8. **Git setup** — per `/create-prd` step 10, branch **`frd-NNN`**.
9. Write the FRD to `project-planning/specs/frd-NNN.md`.
10. **Critical review — do NOT run it inline.** It is a chained stage owned by **`/challenge-prd`**, which this command auto-invokes at its close (see *Output rules*) at derived-**`light`** weight: contradictions, missing acceptance criteria, ambiguous scope only. Skip the chain on `skip critical review` (record `critical_review: skipped`). The chain adds **no gate** — `/challenge-prd` closes SOFT on an FRD run, and so does `/task-breakdown`; an FRD's operative stops are the end-of-build review (`build`/`final`) and `go_live`.
11. **Extract `frd-minimal-NNN.md`** — per `/create-prd` step 14 mechanics.
12. **ADRs — only if § 6 flagged a real decision.** Most FRDs create none. If one exists, create the isolated ADR and note that `/architect` may run for this item.
13. **Manifests** — write `run-<timestamp>.json` + `current-run.json`. Record `work_item_type: frd`, `scope_dial` (derived), `packs`, `branch_name`, canonical `prd`/`prd_minimal` slots (= the FRD paths), `prd_input_mode`, discovery/critical-review outcomes, `notes.base_branch`. Append `stage_history` `spec_ready` entry.

## Validation

- `work_item_type: frd` recorded; current branch is `frd-NNN`.
- `frd-NNN.md` and `frd-minimal-NNN.md` exist with matching NNN; manifest `prd`/`prd_minimal` slots point at them.
- **Acceptance criteria present** in § 1.5 and § 3 (the mandatory DoD backbone).
- `scope_dial` recorded (derived or overridden); `packs` recorded.
- Discovery summary confirmed or skipped; `stage_history` has a `spec_ready` entry.
- Handoff metadata points to `/task-breakdown` (and notes `/architect` is skipped unless an ADR-worthy decision exists).

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage create-frd` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, and a missing `stage_history` entry.
  **This weight had no such gate until 2026-09-02**, and it is the weight that needed it most: of 57 typed manifests on disk, 30 are FRD and 14 are bug against 13 PRD, so the check was wired into the minority path while FRD intake closed with nothing asserting that `/task-breakdown` and `/implement` could find the spec at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "create-frd", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array.

## Promotion

If discovery or constructive work reveals the item is **actually a PRD** — multiple phases, ≥3 new SDK surfaces (per `/create-prd` § SDK-surface heuristic), needs an architecture blueprint, or blows the ~150-line cap with genuinely coupled scope — **stop and promote**: tell the operator "this is bigger than a feature; recommend re-running as `/create-prd`", carry the FRD's problem/scope/criteria forward as the PRD input, and record a `stage_history` `{ stage: "promoted", outcome: "superseded", one_line: "FRD-NNN promoted to PRD — <reason>" }` entry. Do not silently balloon the FRD.

## Output rules

- **Begin with the Operator Checkpoint block** (per `.agent/glossary.md` § "Operator Checkpoint"), then the files-written summary.
- **Operator gate — SOFT; auto-chain into `/challenge-prd`** (per `.agent/glossary.md` § "Operator Gate"). `/create-frd` close does NOT stop, and neither does the chained review or `/task-breakdown` on an FRD run — an FRD's whole planning span is unattended; its operative stops are the end-of-build review (`build`/`final`) and `go_live`. End with "Next: `/challenge-prd` (light review of the FRD just written)" and invoke it; `/challenge-prd` then hands off with "Recommended next: `/task-breakdown` (architecture skipped — feature weight)." When the operator said `skip critical review`, the chain does not fire — end with the `/task-breakdown` recommendation directly. Escalate to a hard STOP only if a `[BLOCKER]` checkpoint item or the promotion trigger fired.
