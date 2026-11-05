# Manifests

This folder holds the **run manifest template** used by the agent workflow.

- **`run-manifest.template.json`** — Schema for `products/<product-slug>/project-planning/workflow/run-<timestamp>.json` and `current-run.json`. Commands that create or update the run manifest use this template (e.g. `product_slug`, `product_root`, `canonical_artifacts`, `source`, `implementation`). **`canonical_artifacts` paths are repo-relative** and include the `products/<slug>/project-planning/` prefix. Resolve the product first via `.agent/commands/project/product-workspace.md`. There are no “latest” or alias files—only timestamped artifacts and optional fallback by latest timestamp in each directory under that product.

## Writing a manifest — through the helper, never by hand

**Every manifest write goes through `node .agent/scripts/manifest-write.mjs`.** Do not read a manifest, mutate the object, and write the whole file back — that is a wholesale clobber of everything another agent added between your read and your write. Several agents write the same manifest during a run, so this is not hypothetical: on 2026-08-11 an agent set `provisioning` by replacing the object and **two of its three keys vanished** (`editing_host` and `superseded_editing_host` erased, only `editing_host_freshness` survived). Nothing failed; it surfaced only because someone re-read a field they expected to still be there. The same shape silently truncates `stage_history` and `operator_attention`, which are contractually append-only.

The helper reads, **deep-merges a patch**, and writes **both** `run-<id>.json` and `current-run.json` from one buffer, then re-reads them to assert they are byte-identical. Patch semantics: objects merge key by key (unmentioned keys survive), **arrays append** (so `stage_history` / `operator_attention` grow), scalars replace. `--replace <dot.path>` is the escape hatch for a list that genuinely is rewritten (e.g. `scope_dial.extra_stops`).

```sh
node .agent/scripts/manifest-write.mjs --workflow <product>/project-planning/workflow <<'JSON'
{ "status": "tested",
  "next_action": "run /ship",
  "stage_history": [ { "stage": "tested", "agent": "07-qa-specialist", "entered_at": "…", "exited_at": "…",
                       "outcome": "completed", "one_line": "…", "deliverables": [], "escalations": [], "error": null } ] }
JSON
```

The patch is JSON on stdin (or `--patch-file`) rather than `--set path=value`, because real writes are nested objects and whole array elements, and a heredoc quotes identically from PowerShell and Git Bash. `updated_at` is refreshed automatically (`--no-touch` opts out). Other flags: `--manifest <file>` instead of `--workflow`, `--verify` (check the pair, write nothing), `--dry-run`, `--json`, `--quiet`.

**Use the heredoc, or `--patch-file <ABSOLUTE path>` — never a shell redirect from `/tmp`.** `/tmp` resolves to two different directories here (Node reads it under the drive root, Git Bash under the user temp dir), so a patch written from Node and read back through `< /tmp/x.json` is a *different* file — absent, or a **stale** one of the same name that is non-empty and valid JSON. Nothing downstream can tell: arrays append by design, so the result is a plausible duplicate `stage_history` entry at exit 0 (measured twice in one run, 2026-09-26/27). A heredoc has no path to disagree about; `--patch-file` hands resolution to Node, the runtime that wrote the file, and refuses a file older than 300 s at process start (`--allow-stale-patch` opts out). On success the patch source and a short content hash are printed beside the merge log.

**A divergence between the pair is a hard stop** (exit 1) naming the differing top-level keys — it means someone wrote one file without the other, so one of them is missing real work. Fold the difference into `run-<id>.json` (the tracked copy is the source of truth) and re-run; `--force-mirror` accepts `run-<id>.json` as truth and overwrites the mirror. Formatting-only drift self-heals. Self-test: `node .agent/scripts/__tests__/manifest-write.test.mjs`.

## Schema versioning

**`schema_version`:** Integer field at the manifest root. Current version: **8** (adds the top-level `work_item_type` discriminator for the three intake types — PRD / FRD / bug). Bump this when the manifest structure changes. Commands reading a manifest should check `schema_version` and handle older versions gracefully. Manifests without `schema_version` are implicitly version **1**; version **2** did not include `product_root`; version **3** added `product_slug`, `product_root`, repo-relative `canonical_artifacts` under `products/<slug>/project-planning/`; version **4** added `smoke_outcomes` block + `tested_pending_smoke` status; version **5** added top-level `scope_dial` block; version **6** added top-level `operator_attention[]` array; version **7** structured `stage_history` entries, removed `canonical_artifacts.implementation_runbook`, added `canonical_artifacts.baseline` + `canonical_artifacts.status_index` + the `archive` guidance block.

### Schema 8 (2026-06-08) — work item types

- **`work_item_type` is ADDED** (top-level, required for new runs): `prd` | `frd` | `bug`. The keystone discriminator for the three intake entry points — `/create-prd` (PRD-weight), `/create-frd` (feature-weight), `/create-bug` (bug-weight). Every downstream command reads it to choose the weight-preset, the operator-gate count, and which stages to skip. See `.agent/glossary.md` § "Work item type" and § "Operator Gate" (gate ladder).
- **Same artifact slots, different fill.** `canonical_artifacts.prd` / `prd_minimal` are the universal **spec** / **spec-minimal** slots regardless of type. For an FRD they hold `frd-NNN.md` / `frd-minimal-NNN.md`; for a bug, `bug-NNN.md` / `bug-minimal-NNN.md`. The slot names stay `prd` / `prd_minimal` so downstream read paths (especially Developer-08's `prd_minimal + task_breakdown`) are byte-for-byte unchanged. Every type still produces the same three slots — intake doc → minimal block → task breakdown — so the Architect / Lead Developer / QA / Developer contracts do not change; bug just fills them thinly (task breakdown = "make the RED test green").
- **Definition-of-done backbone is mandatory in all three types.** The shared, verifiable "how we'll know it's done" block: PRD → per-phase acceptance criteria; FRD → acceptance criteria (with a no-regression variant for chore-shaped work folded into FRD); bug → the RED regression test (written first, shown as proof the bug is real and understood).
- **Operator gates — default autonomous, 3 gates (2026-07-02):** a full run stops only at **`/challenge-prd` close** (spec — moved from `/create-prd` close 2026-07-29 when the critical review became its own stage), **`/design` close** (clickdummy), and **`/test-content` close** (final rendered output; `/test` for non-content runs); everything else is soft. `/create-prd` asks once upfront whether to run with these 3 gates (default) or add more — over-stopping is the failure mode this replaced (task-breakdown is now soft). A `bug` keeps its two valves — **can't-reproduce → stop and ask**, and **not-contained → promote** to FRD/PRD; SDK-touching bugs still require a real-tenant smoke before ship. See `.agent/glossary.md` § "Operator Gate".
- **Type promotion** is re-classify + enrich, never restart. Flipping `work_item_type` upward (bug → frd → prd) enriches the existing intake doc in place and carries the minimal block forward; record a `stage_history` entry `{ stage: "promoted", outcome: "superseded", … }`.
- **Numbering:** per-product namespaces `PRD-NNN` / `FRD-NNN` / `BUG-NNN`; branches `prd-NNN` / `frd-NNN` / `bug-NNN`. `STATUS.md` and `/status` roll up all three families.

The Schema 7 → 8 migration is forward-only: existing manifests retain their version and downstream commands treat a missing `work_item_type` as `prd` (the only type that existed before schema 8). New runs and re-runs use schema 8.

### Schema 7 (2026-05-20) — key changes

- **`stage_history` is structured.** Prose `notes` essays are replaced by `{ outcome, one_line, deliverables[], escalations[], error, notes }`. `notes` survives as a short escape-hatch field (≤2 sentences) but the at-a-glance signal lives in `one_line` and the audit detail lives in `deliverables[]` / `escalations[]`. New `outcome` values: `superseded` and `partial`. See "Stage history" below for the full contract.
- **`canonical_artifacts.implementation_runbook` is REMOVED.** Schema 7 folds the runbook's three load-bearing sections (target directory, canonical inputs, planned delivery order) into the task breakdown's new § 0 Quick orientation. `/implement` no longer produces a separate runbook file; `/code-review`, `/test`, `/ship`, `/document` resolve those inputs from the task breakdown. Schema-6 manifests with a populated `implementation_runbook` field are honored read-only — do not produce new ones.
- **`canonical_artifacts.baseline` is ADDED.** Optional path to `project-planning/baseline.md` — a promoted architecture baseline that consolidates stable ADRs after the 5-ADR threshold. `/architect` proposes promotion; the operator confirms. `null` until promotion runs. See "Architecture baseline" below.
- **`canonical_artifacts.status_index` is ADDED.** Path to `project-planning/STATUS.md` — the per-product PRD index auto-generated at `/create-prd` kickoff and `/ship` close. Replaces hand-globbing the manifest for cross-PRD state. `/status` portfolio mode reads STATUS.md when present, falls back to `current-run.json` otherwise.
- **`archive` guidance block is ADDED.** Documented the auto-archive rule for superseded planning artifacts: files in flat artifact folders not referenced by `canonical_artifacts.*` and not the highest-NNN in their family moved to `project-planning/archive/` at the start of each stage write. **⚠️ RETIRED at schema 8** — superseded by "Artifact durability tiers" below. Historical note only; do not implement.
- **prd-minimal is MECHANICALLY EXTRACTED, not parallel-authored.** The PRD template now carries a delimited `<!-- PRD_MINIMAL_BEGIN -->...END` block; `/create-prd` extracts that span verbatim into `prd-minimal-NNN.md` at the close. PM authors only inside the markers; manual edits to `prd-minimal-NNN.md` get overwritten on the next extraction. See "prd-minimal extraction" below.

The Schema 6 → 7 migration is forward-only: existing manifests retain schema 6 and downstream commands handle both shapes. New runs and re-runs use schema 7.

## Scope dial

**`scope_dial`:** Top-level object set during `/create-prd` kickoff (schema_version 5+). Records the operator's chosen planning rigor and shape so downstream commands can inherit defaults without re-asking the operator at every gate.

| Field | Values | Effect |
|-------|--------|--------|
| `rigor` | `light` \| `standard` \| `thorough` | Default level for Discovery (in `/create-prd`) and Critical review (in `/challenge-prd` — the review is no longer inline in `/create-prd` as of 2026-07-29). Per-stage explicit overrides still win; FRD runs derive `light` for the review regardless. |
| `track` | `full` \| `minimal` | `/architect` planning track. `minimal` skips the architecture blueprint file (`canonical_artifacts.architecture: null`); ADRs capture all decisions. |
| `ui_variants` | `skip` \| `1` \| `2` \| `3` | Default UI proposal count at `/architect`. Operator can still override per-run. |
| `docs_at_ship` | `auto-lite` \| `full` \| `none` | Default docs behavior at `/ship`. `auto-lite` = `/ship` emits a 1-paragraph README + CHANGELOG entry inline. `full` = `/document` runs as a separate stage before `/ship`. `none` = no docs written by automation. |
| `gates` | object of 5 booleans (all default `true`) | **Pick-any operator stops** — the SOURCE OF TRUTH for which review-stops pause the run. A stage's hard stop fires iff its token is `true`. Tokens: `spec` (`/challenge-prd` close — the reviewed spec; `/create-prd` inherits it only when the operator skips the review), `design` (`/design` winner-pick/confirm), `build` (END-OF-BUILD review at `/test` close — the single look at the whole implementation via the **Components Preview** page; fires on content-sdk runs, inert on non-content runs which review the build at `final`), `final` (`/test` for non-content OR `/test-content` for content — the last look), `go_live` (confirm before ANY outward/real-world mutation — `/provision-sitecoreai`, `/implement`'s first real-tenant write, **`/test`'s Components Preview fixture composition (QA 07)**, `/author-content` + `/test-content` live writes, and the `/publish` go-live). The build phase is autonomous — `build`/`final` is the ONLY operator stop during/after the build, never a per-component or mid-build one (rule `71-delivery-loop.mdc`). |
| `delivery_parallelism` | `serial` (default) \| `parallel` *(experimental — see rule `71` § "Known limitations"; degrades to sequential, never to corruption)* | How many component tranches build at once. `serial` = one at a time — Developer → code-review → QA for a tranche, then the next tranche. `parallel` = independent tranches run their {Developer → Code-Reviewer} pair concurrently in isolated git worktrees; once **all** are review-clean they merge back, the `.sitecore` maps regenerate once, deferred shared-tenant writes apply serially, and **one QA runs over the integrated whole** (full suite + lint + build). **Safety is not a dial** — an unprovable set runs serially regardless, and 🔍 probe tranches always block and run first, alone. Inert on single-tranche runs. Asked at `/create-prd` Call 2; slash `concurrency=`. Rule `71` § "Parallel tranches". |
| `extra_stops` | `[]` \| list of stage labels | Operator-named ADDITIONAL soft-stage stops promoted to hard (e.g. `architect`, `task-breakdown`, `provision-sitecoreai`, `implement`). |
| `autonomy` | `auto_3_gates` \| `custom` \| `fully_autonomous` | DERIVED label (not source of truth): `auto_3_gates` = all gates `true` + no extra_stops (default); `fully_autonomous` = all gates `false` + no extra_stops (**truly zero** — nothing pauses, live publish + real-tenant boundaries run unattended); `custom` = any other combination. Genuine blockers (stage-cannot-complete, bug valves, `[BLOCKER]` items) still stop even under `fully_autonomous` — those are error handling, not review gates. |
| `content_authoring` | `auto` (default) \| `yes` \| `no` | Gates the Content SDK content phase (`/discover-components` → `/author-content` ⇄ `/test-content` → `/publish`). `auto` = runs iff `platform_target == content-sdk`; `yes` = force it; `no` = skip it (`/ship` is terminal; content-phase commands not recommended). |
| `imagery` | `mood` (default) \| `none` | Empty-Image-field commissioning tier for `/author-content` (Sitecore channel), meaningful only when content authoring runs. operator-review gate); `mood` = Claude-generated abstract/decorative SVG/gradient imagery (no external service, no cost); `none` = leave Image fields empty (CSS fallback). |
| `output_verbosity` | `auto` (default) \| `minimal` \| `verbose` | Mid-turn chat narration (rule `73-output-verbosity.mdc`) — not artifacts on disk. Asked at `/create-prd` Call 3. `auto` = each agent keeps its frontmatter pin (execution `minimal`, planning `verbose`) **unless** `autonomy` is `fully_autonomous`, which forces `minimal` on every spawn. `minimal` / `verbose` force that level everywhere. Team Lead injects `Output Level: …` on every spawn. Slash: `verbosity=`. |

When the dial was not asked (legacy resume, `skip scope dial`, or unset on schema_version < 5), record `notes.scope_dial: defaulted` (or `skipped`) and downstream commands fall back to: `rigor=standard, track=full, ui_variants=1, docs_at_ship=auto-lite, gates=all-true incl. build (autonomy auto_3_gates), content_authoring=auto, imagery=mood, output_verbosity=auto`. A legacy `gates` object missing the `build` token treats it as `true` (default).

## Content policy (schema 8+)

**`content_policy`:** Top-level object set at `/author-content` kickoff for the **Sitecore channel only** (the only channel with placeholders) and inherited by `/test-content`. Distinct from `scope_dial` (which is set far earlier at `/create-prd` and covers the whole run); content policy is a content-phase decision that can also be made in a standalone / freeform authoring run.

| Field | Values | Effect |
|-------|--------|--------|
| `enforce_placeholder_restrictions` | `true` (default) \| `false` | `true` — the Content Author (14) composes only from each placeholder's allowed-renderings set (`get_allowed_comps_by_ph`); a disallowed rendering is substituted or surfaced, never force-placed; `/test-content` flags an out-of-allowed-set placement as a **Major** structure finding. `false` — the author composes by best-fit regardless of the allowed set but records every out-of-allowed-set placement as a **deviation**; `/test-content` records it as an accepted deviation. |

Absent/null (non-content runs, legacy manifests) ⇒ treated as `true` (the safe default). See `.agent/glossary.md` § "Placeholder restriction policy".

## Stage history and error recovery

**`stage_history`:** Array of stage transition records. Each entry captures when a stage was entered, which agent handled it, when it exited, what it produced, and whether it completed cleanly. This enables:

- **Resuming failed runs:** If a stage fails, the manifest records the failure. The next invocation can read `stage_history`, find the last failed stage, and resume from there instead of restarting.
- **Audit trail:** Full lineage of who did what, when, and what they produced.
- **`/status` cross-product roll-up:** `one_line` + `deliverables[]` + `escalations[]` are queryable; downstream agents can ask "what concerns did `/architect` raise?" or "what files did the QA pass touch?" without parsing prose.
- **`implementation.resumed_from_stage`:** When resuming a failed run, set this to the stage name being retried so agents know this is a continuation, not a fresh start.

**Canonical stage names** (the `stage` field in each entry). Every dev-flow command writes one or more entries when its stage completes (or is skipped); commands that spawn multiple specialists write one entry per specialist:

| Command | Stage(s) written | Agent(s) |
|---------|------------------|----------|
| `/create-prd` | `discovery` (only when discovery ran or was skipped), `discovery_summary`, `spec_ready` | `02-product-manager` |
| `/challenge-prd` | `spec_challenged` (+ a `spec_ready` / `outcome: "superseded"` entry when the review revised the spec) | `02-product-manager` |
| `/architect` | `architecture_ready`, `ui_ready` (with `outcome: "skipped"` when the user declined UI) | `04-software-architect`, `05-ui-designer` |
| `/task-breakdown` | `plan_ready`, `qa_ready` | `06-lead-developer`, `07-qa-specialist` |
| `/implement` | `implemented` (on exit) | `08-developer` |
| `/code-review` | `code_reviewed` | `08-developer` |
| `/test` | `tested` | `07-qa-specialist` |
| `/document` | `documented` | `09-doc-writer` |
| `/ship` | `shipped`, `doc_audit`, `tiering_verified` | `02-product-manager` |

Plus the stages written outside the core dev-flow. These were in wide use for a month while **no file under `.agent/` prescribed them** — `/publish`, `/test-content` and the content-sdk ship close-out named theirs, and the other pack stages named none, so each run invented one. That is what produced **65 distinct stage names across 16 Content SDK runs**; the runs were filling a hole, not being careless.

| Command | Stage(s) written | Agent(s) |
|---------|------------------|----------|
| `/create-prd`, `/architect` | `promoted`, `adr_density_check`, `baseline_promoted` | `02-product-manager`, `04-software-architect` |
| `/probe` | `probe` | varies (`03` knowledge / `08` empirical) |
| `/provision-sitecoreai` | `provisioned` | `13-devops-engineer` |
| `/discover-components` | `components_discovered` | `07-qa-specialist` |
| `/author-content` | `content_authored` | `14-content-author` |
| `/test-content` | `content_tested` | `07-qa-specialist` |
| `/publish` | `published` | `13-devops-engineer` |
| (content-sdk ship close-out) | `content_sdk_closeout` | `13-devops-engineer` |
| (post-merge verification) | `merged` | `08-developer` |
| `/source-analysis` (method:clone) | `source_ready` | `99-source-analyst` |
| `/resume` | `resumed` | `00-team-lead` |

**The set is CLOSED and mechanically enforced** by `assert-manifest-pointers.mjs` (`history-stage`). A command name is not a stage name: `implement`, `code-review`, `test`, `ship`, `provisioning`, `test-content` and friends are ERRORs that name the canonical spelling. An unprescribed name is a WARN. **Adding a name means prescribing it at the stage that writes it** — a name that lives only in the enum is the orphaned-declaration shape rule `88` exists to catch.

**Per-tranche detail goes in the optional `tranche` field, never in `stage`.** One build encoded 30 tranche names into `stage` (`tranche_2_app_shell` … `code_reviewed_phase3_close`). The journal is genuinely valuable and is not being suppressed — but with it in the `stage` field, "did `/test` pass on this run?" became unanswerable across the portfolio. Write `{ stage: "code_reviewed", tranche: "C7-faq", … }` instead.

**`implementation_in_progress` is a legal stage name** (it is in the template enum and in the gate's `implement` contract) and is the most common name in the corpus — 30 entries. This paragraph used to say the opposite: that in-progress state lives *only* in `implementation.status` and `stage_history` records only completed/skipped/failed transitions. Both readings were defensible from the framework's own files, which is why both are in the data. Settled 2026-09-02 in favour of the one the template and the gate already blessed. `implementation.status` (`in_progress` / `completed` / `failed`) remains the **resume** signal; `implementation_in_progress` entries are the per-tranche audit trail and should carry a `tranche`.

**Schema-8 intake stages.** `/create-frd` and `/create-bug` write the same `spec_ready` stage entry that `/create-prd` does (the spec slot is type-agnostic). When a work item is **promoted** (bug → frd → prd), append a `{ stage: "promoted", agent: "02-product-manager", outcome: "superseded", one_line: "<BUG-N promoted to FRD-M — reason>" }` entry on the originating item before re-entering the heavier intake — the audit trail preserves that the new item descends from the old one.

**Entry contract (schema 7).** Every `stage_history` entry MUST contain:

- `stage` — one of the canonical names above (string)
- `agent` — agent id from `.agent/flows.json` `agent_registry` (e.g. `"02-product-manager"`)
- `entered_at` — ISO-8601 timestamp captured when the stage started in this command
- `exited_at` — ISO-8601 timestamp captured when the stage finished
- `outcome` — `"completed"` | `"failed"` | `"skipped"` | `"superseded"` | `"partial"`
- `one_line` — ≤140-character at-a-glance summary of what happened. NOT a sentence about the artifact's content — a sentence about the **stage**. `"PRD-002 discovery; 4 questions + operator picked fake-premium direction"` is right; `"Wrote PRD-002 with 11 bento cards"` is the artifact, not the stage.
- `deliverables[]` — array of repo-relative file paths the stage wrote or updated. Empty array when the stage produced no files (e.g. discovery-only stages that defer artifact writing).
- `escalations[]` — array of attention items raised AT this stage, mirroring the top-level `operator_attention[]` entries by content. Empty array is fine. Forensic field — the top-level array is the SoT for cross-product roll-ups.
- `error` — `null` on success/skip; error message string on failure
- `notes` — optional free-form ESCAPE HATCH. Keep ≤2 sentences. Prefer `one_line` + structured fields.

`outcome` values:

| Value | Meaning |
|-------|---------|
| `completed` | Stage finished as intended; deliverables[] populated when the stage writes files. |
| `failed` | Stage hit an unrecoverable error; `error` populated; downstream is blocked until resumed or skipped. |
| `skipped` | Stage was explicitly bypassed (e.g. `skip discovery`, UI declined). Empty `deliverables[]`. |
| `superseded` | A later stage replaced this stage's outputs (e.g. PRD revision after critical review, or task-breakdown re-run after a § 4c gap). Audit trail preservation; the earlier entry stays in place. |
| `partial` | Stage completed but with caveats (e.g. some tasks deferred to a follow-up, smoke pending). `one_line` states what's incomplete. |

**The enum is CLOSED. No stage may introduce its own values — put the nuance in `one_line`.** Enforced by `assert-manifest-pointers.mjs` (`history-outcome`), which names the legal replacement rather than only rejecting the value.

Measured 2026-09-02: **11 of 16 Content SDK runs carried an illegal `outcome`** — `confirmed`, `confirmed_with_changes`, `blocked`, `bundled`, `done`, `paused`, `in_progress`, `closed_soft`, `completed_with_caveats`, `pass-with-carried-items`. **The most common cause was not agent drift — it was this file disagreeing with another one.** `02-create-prd.md` instructed `outcome: "confirmed" | "confirmed_with_changes" | "skipped"` for the `discovery_summary` entry, values this enum never contained, so every PRD run dutifully violated it. Corrected in both files the same day.

The confirmation detail was never lost and does not need an outcome value to carry it: `discovery_summary: confirmed | confirmed_with_changes | skipped` already lives in manifest `notes`, and `one_line` states it at a glance. Map the observed values as: `confirmed`/`confirmed_with_changes`/`done`/`bundled`/`closed_soft` → `completed`; `blocked` → `failed` (+ `error`); `paused`/`in_progress`/`completed_with_caveats`/`pass-with-carried-items` → `partial`.

Append-only: never edit or remove prior entries. A re-run of a stage adds a new entry rather than modifying the old one. The most recent entry for a given `stage` represents its current state.

**Schema-6 back-compat.** Schema-6 entries have a single freeform `notes` paragraph instead of structured fields. Readers should treat schema-6 `notes` as the `one_line` equivalent and skip the structured fields. Writers do NOT retro-fit schema-6 entries to schema 7 — entries from older runs stay in their original shape.

**`status` additions:** Two new status values — `failed` (a stage encountered an unrecoverable error) and `paused` (a stage is waiting for user input or external resolution). When status is `failed`, check the last `stage_history` entry for the `error` field.

## prd-minimal extraction (schema 7+)

**`prd-minimal-NNN.md` is mechanically generated from the full PRD**, not authored in parallel. Eliminates the drift class where the full PRD and prd-minimal disagreed on goal, non-negotiables, or success criteria.

**How it works.** The PRD template carries a delimited block:

```markdown
<!-- PRD_MINIMAL_BEGIN -->
## 1.5 Developer slice (extracted to prd-minimal-NNN.md)

> The Product Manager authors this section as the authoritative Developer-08 brief.
> /create-prd extracts everything between PRD_MINIMAL_BEGIN/END verbatim into
> `prd-minimal-NNN.md` at the close of the command. Manual edits to
> prd-minimal-NNN.md will be overwritten on the next extraction.

### Problem (one short paragraph)

### Goal (one short paragraph)

### Non-negotiables (bullets)

### In scope / out of scope (very short)

### Success criteria (3–7 bullets)

### Key constraints & assumptions

### Handoff
<!-- PRD_MINIMAL_END -->
```

**Authoring rule.** The PM writes the Developer slice inside the markers and only inside the markers. The full-PRD sections around it can reference it (`see § 1.5 for the implementation-facing summary`) but do not duplicate it.

**Extraction rule.** At the close of `/create-prd` (and any subsequent revision pass during `/architect` or `/challenge-prd`), the command:

1. Reads `prd-NNN.md`, locates the `PRD_MINIMAL_BEGIN`/`END` markers.
2. Strips the leading `<!-- PRD_MINIMAL_BEGIN -->` comment and trailing `<!-- PRD_MINIMAL_END -->`.
3. Strips the leading heading `## 1.5 Developer slice (extracted to prd-minimal-NNN.md)` (it's a PRD-side marker, not part of the slice).
4. Strips the explanatory blockquote (the `> The Product Manager authors…` note).
5. Demotes the section subheadings (e.g. `### Problem` → `## Problem`) so the extracted file reads cleanly.
6. Prepends the `prd-minimal` frontmatter from `prd-minimal.template.md`.
7. Writes the result to `prd-minimal-NNN.md`, overwriting any prior content.

**`/architect`'s refresh hook** runs the same extraction whenever the PRD was edited during planning, so prd-minimal stays in sync without manual maintenance.

## Architecture baseline (schema 7+)

**`canonical_artifacts.baseline`:** Optional path to `project-planning/baseline.md` — a consolidated summary of stable architectural decisions promoted from accumulated ADRs.

**Why this exists.** Long-running products accumulate ADRs (one product reached 18 ADRs by PRD-002; 15 of them inherited from PRD-000/001). A new PRD's reader needed to consume ~700 lines of historical decisions before reading the 3 ADRs that actually changed in the new run. The baseline pulls the stable decisions out of the ADR pile into one ~150-line constitution.

**Promotion gate.** `/architect` runs a baseline-promotion check before completing. When the product has **≥5 ADRs** and no `baseline.md` exists (or the existing one references fewer than the current ADR count minus 5), the architect proposes promotion:

```
Architect proposes baseline promotion:
  - ADRs to promote (stable, foundational): <list>
  - ADRs to keep separate (recent or specific): <list>
  - Baseline file: project-planning/baseline.md

Promote (Y) / skip this run (n) / promote a custom subset (s) ?
```

The operator confirms. On `Y`, the architect writes `baseline.md` summarising the promoted ADRs (one paragraph each: Context one-liner, Decision, lasting Consequences). Promoted ADRs are NOT deleted — they stay in `project-planning/ADR/` as the source of truth; the baseline is the readable summary.

**Reading the baseline.** Downstream agents (Lead Developer, Developer, QA) read `baseline.md` when present in lieu of opening every inherited ADR. New ADRs are filed for **delta** decisions — choices that depart from or add to the baseline. The task-breakdown § 4c-2 "ADR one-liners" subsection only lists ADRs not yet in the baseline, plus any baseline-bound rules the task touches.

**Refresh.** The architect re-promotes (overwrites `baseline.md`) when additional ADRs accumulate beyond the threshold and the operator confirms. Baseline rewrites are an audit-trail event — `stage_history` records `{ stage: "baseline_promoted", agent: "04-software-architect", deliverables: ["…/baseline.md"], one_line: "Promoted N ADRs into baseline; <count> ADRs remain in ADR/" }`.

## Status index (schema 7+)

**`canonical_artifacts.status_index`:** Path to `project-planning/STATUS.md` — per-product PRD roll-up auto-generated at `/create-prd` kickoff and `/ship` close.

**Why this exists.** Today `/status` (portfolio mode) reads each product's `current-run.json` and reconstructs cross-PRD state by hand. With three or more PRDs per product, even single-product mode required cross-referencing `stage_history`, `smoke_outcomes`, and friction logs. STATUS.md replaces that with a static table the operator can read directly:

```markdown
# Project Status — <product slug>

_Auto-generated by /create-prd kickoff + /ship close. Do not hand-edit;
edits are overwritten on next regeneration._

Generated: <ISO-8601>
Repo: <remote URL or "(local only)">

| PRD | Title | Status | Stage | Smoke | PR | Manifest |
|-----|-------|--------|-------|-------|-----|----------|
| 000 | Foundation | shipped | shipped | passed | #1 | run-20260513T093404Z.json |
| 001 | Stripe integration | shipped | shipped | passed | #4–7 | run-20260515T081454Z.json |
| 002 | Bento dashboard | shipped | shipped | passed | #8–11 | run-20260517T223000Z.json |

## Open items
- (none)

## Last activity
- 2026-05-18 — PRD-002 shipped (4 PRs merged)
```

**Generators.** Two commands write STATUS.md:

1. `/create-prd` kickoff — at PRD-NNN+1 boot. Before writing the new PRD, scan PRDs 0…NNN: for each, read the matching `run-*.json` (resolved from PRD's `run_manifest` frontmatter) and project status / stage / smoke / PR. Append a row for the new PRD with status `in_progress`.
2. `/ship` close — after the new manifest is persisted with `status: shipped|shipped_with_caveats|incomplete`. Refresh the row for this PRD; update `## Last activity`.

The file is overwritten each generation. The operator does not edit it. `/cleanup-project-planning` can delete the file to force regeneration.

STATUS.md also renders a **`## Programs`** section when any manifest carries `notes.program` (below). Full cell contract + generation rules: `.agent/commands/project/templates/status-md.template.md`.

## Program (`notes.program`)

**Set when — and only when — one idea was split across several work items** (`.agent/glossary.md` § "Deliverable vs execution unit" / § "Program"). The default for a large idea is *phases inside one spec*; a split is the exception and must pass the three-leg shippability test first. A standalone item has no `notes.program`, and inventing one is a defect.

**Written to EVERY member's manifest** — first by the `/create-prd` run that confirms the split, then inherited (with its own `index` and refreshed member statuses) by each sibling's `/create-prd`.

```json
"notes": {
  "program": {
    "id": "aloft-booking",
    "title": "Conscious-travel flight booking",
    "total": 3,
    "index": 1,
    "deliverable": "Search + results for one carrier, no booking",
    "members": [
      { "id": "PRD-001", "title": "Search & results",  "deliverable": "Search + results for one carrier, no booking", "status": "in_progress" },
      { "id": "PRD-002", "title": "Booking & payment", "deliverable": "End-to-end booking with Stripe checkout",       "status": "planned" },
      { "id": "PRD-003", "title": "Trip management",   "deliverable": "Post-booking changes, cancellation, receipts",  "status": "planned" }
    ]
  },
  "split_override": "operator accepted a failed `value` leg on PRD-002"
}
```

| Field | Rule |
|-------|------|
| `id` | `<product-slug>-<short-slug>`; stable for the life of the program |
| `title` | One line naming the whole idea |
| `total` | **Finite and known.** If the member count cannot be named, the work was not ready to split — phase it inside one spec instead |
| `index` | This item's 1-based position; unique within the program |
| `deliverable` | What **this** item delivers on its own, ≤ 100 chars. If it can only be phrased as "groundwork for the next one", the shippability test failed |
| `members[]` | One entry per planned item — including siblings that have **no manifest yet** (`status: "planned"`, `id` reserved or `null`). Rendering only the written members is the blindness this block exists to remove |
| `members[].status` | `planned` \| `in_progress` \| `shipped` \| `shipped_with_caveats` \| `cancelled` |

**Consistency is load-bearing.** `total` and `members[]` must match across every member's manifest; a member advertising a stale count is the exact failure mode this prevents. When a member is added or cancelled, update **all** members. STATUS.md renders the highest `total` on disagreement and raises a `[warn]` open item.

**Readers.** `STATUS.md` § Programs (the `N of M` roll-up); `/ship` step 10b (the `phase N of M — not feature-complete` banner in the ship report, PR body, and CHANGELOG entry); `/status` portfolio mode via STATUS.md.

**`notes.split_override`** — a sibling field, set at `/create-prd` only when the operator chose to split despite a failed shippability leg. `/ship` surfaces it under "What hurt this run".

## Auto-archive — RETIRED (was schema 7)

**Nothing archives anything, at any stage.** Both triggers are gone, replaced by declarative "Artifact durability tiers" below:

- **Supersession archiving** — moved a superseded `architecture-*.md` / `task-breakdown-*.md` / `ui-design-*.md` / `brain-dump-*.md` into `archive/` at the next stage write. Every family it moved is now untracked, so the move had no git-visible effect — pure disk churn.
- **Post-ship sweep** (`/ship` step 15b) — moved the completed run's scaffolding into `archive/`. A `git mv` is a delete plus an add of identical bytes, so it *increased* commit noise rather than reducing it, and grew the committed tree without bound.

**`notes.archive_skip` is retired** with them — it had nothing left to suppress. Commands may still read the flag from a legacy manifest; they must ignore it.

**Why it was replaced.** Measured on a mature product (1 PRD + 16 FRDs): `archive/` reached **60% of all planning bytes** and was touched in 36 of the last 40 commits. Worse, the move rules drifted from their own contract — the sweep was observed archiving `ship-report-<ts>.md` despite step 15b's "Durable — NEVER swept" list naming it explicitly, and it buried 12 probe/smoke findings (the highest-value artifacts a run produces) alongside superseded test reports. A declarative `.gitignore` cannot drift that way.

**Legacy folders.** Existing `archive/` folders are left on disk and stay in git history. `/ship` § 15b-promote rescues durable artifacts out of them (`*probe*`, `*smoke*`, `*capture*`, `*spike*`, `ship-report-*` → back to `plans/`) before the folder is untracked.

## Artifact durability tiers (schema 8+)

Every run produces artifacts with very different half-lives. Tiering decides which ones become the **committed** documentation surface. **Production is unchanged** — the pipeline still generates and reads everything it needs mid-run. `gitignore != delete`: every untracked artifact still exists on disk.

| Tier | Artifacts | Committed? |
|------|-----------|-----------|
| **1 — Durable record** | spec (`prd`/`frd`/`bug-NNN.md`), `ADR/adr-*.md` + `ADR/README.md`, `baseline.md`, `plans/ship-report-<ts>.md`, `plans/*probe-findings*.md`, `captures/`, `spike-notes/`, `smoke/`, `source-analysis/`, `STATUS.md`, `tasks.md`, `workflow/run-<id>.json` | **tracked** |
| **2 — Compiler output** | `*-minimal-NNN.md` — mechanically extracted from the spec | untracked |
| **3 — Run-scoped working material** | `interrogation-<stage>-<ts>.md` (the grill ledger), `task-breakdown-<ts>.md` (+ `task_breakdown_pre_qa`), `qa-report.md`, `test-report-<ts>.md`, `code-review-<ts>.md`, `architecture/`, `brain-dumps/`, `ui-design/`, `design-prototypes/` | untracked |
| **4 — Mutable machine state** | `workflow/current-run.json` | untracked |

**Enforcement.** `project-planning/.gitignore`, seeded at `/create-prd` step 4a from `.agent/templates/project-planning-seed/.gitignore`. `/ship` step 15b **verifies** it (and backfills it for products that predate it) — it does not move files. `/create-prd` step 0 additionally **appends** `plans/interrogation-*.md` to an existing file that predates 2026-08-03, so the grill ledger is tiered on products seeded before it existed.

**Why tier.** The durable record is the intent → decisions → outcome story a future run or reader needs (and that an AI reads to track product history). The scaffolding is working material the pipeline consumes during the run but that shipped code + ADRs + the ship report supersede; committing it makes every planning diff noise and leaves artifacts to go stale against the code.

**Why Tier 2 is untracked.** A `*-minimal` file is compiler output. Committing it means every spec edit produces two diffs of the same content. Cross-machine `/implement` resume is the one thing it costs — judged near-zero frequency, and `git add -f` covers a genuinely handed-off run.

**Why Tier 4 is untracked.** `current-run.json` is **byte-identical** to the latest `workflow/run-<id>.json`, which *is* tracked — verified by `diff` on a mature product, where the mutable copy had 40 commits against the immutable one's 2. Untracking it loses zero information: the content is already committed under the run-id name, and "which run is live" is derivable as latest-by-timestamp — the fallback `/status` already documents and implements.

**Stable paths.** Because nothing moves, `canonical_artifacts.*` values are written once by the producing stage and stay valid permanently. No stage rewrites them to an archive location (the retired sweep rewrote five per ship purely to keep `/document` resolving).

**`stage_history`.** `/ship` appends `{ stage: "tiering_verified", agent: "02-product-manager", outcome: "completed", … }`; `/create-prd` appends `{ stage: "tiering_backfilled", … }` only when it had to create the file.

## QA task breakdown snapshots

**`canonical_artifacts.task_breakdown_pre_qa`:** Path to a copy of the task breakdown *before* QA Specialist (07) edits it. Set by the `/task-breakdown` command before invoking QA. This provides a clean diff between the Lead Developer's original and the QA-enriched version. Value is `null` when QA enrichment hasn't happened yet or when the pre-QA snapshot is intentionally omitted.

## Existing field reference

**`canonical_artifacts.architecture` and `canonical_artifacts.qa_report`:** Use a **string path** when that artifact exists. Use **`null`** for the **minimal planning track** (no separate architecture blueprint and/or no standalone `qa-report.md`). When a value is `null`, do not fall back to “latest file in folder”—the artifact was intentionally omitted. See `.agent/WORKFLOW.md` (Minimal vs full planning track).

**`ui_design`:** For new runs, use the **object** in `run-manifest.template.json`: `proposal_count` (1–3), `divergence`, `variant_paths` (paths to `ui-design-<timestamp>-vN.md` files), and optional `selected_variant_path`. **Legacy:** some older `current-run.json` files store **`ui_design` as a single string path** to one UI file—commands should accept both shapes when resolving the selected UI spec.

**`task_breakdown_style`:** Template values `standard|tdd`. The Lead Developer (06) typically leaves **`standard`** until **QA (07)** enforces test-first ordering in the task breakdown; then the manifest may record **`tdd`**.

**`canonical_artifacts.prd_minimal`:** Repo-relative path to `products/<product-slug>/project-planning/specs/prd-minimal-NNN.md` (same numeric id as the canonical PRD). Written after the PRD is revised post–critical review (see `.agent/WORKFLOW.md`, **Slim context chain**). **Developer (08)** uses **`prd_minimal` + enriched `task_breakdown`** as primary inputs—not the full PRD or architecture file. If `prd_minimal` is missing on a legacy manifest, `/implement` may fall back to the full PRD once and the manifest should be updated.

**`deploy_project_name` / `project_slug` / `project_root` / `cm_code_base` (content-sdk two-level, schema 8+):** Present only for `platform_target == content-sdk` head-app runs. They name the **Deploy project (= one CM server)** the head app belongs to, while `product_slug` + `product_root` point at the **head app** itself — the pipeline-run workspace where `project-planning/` lives. The project folder (`products/head-application/<project-slug>/`) holds the shared `cm/` plus one or more **sibling head apps**; `deploy_project_name` preserves the verbatim Deploy name (spaces/caps allowed, e.g. `Acme Web Platform`) since the folder is space-free; `cm_code_base` is `<project_root>/cm` for a NEW CM or the operator's existing CM path for an EXISTING one. All head apps under a project share one `cm_code_base` + one Deploy project. See `product-workspace.md` § 1b-i / § 3. Leave `null` for marketplace / personal / legacy-flat products.

**`products_root_abs` / `product_root_abs` (derived, per-machine — added 2026-08-15):** Absolute mirrors of the products root and of `product_root`, as resolved on the machine that last touched the run. They exist because **`products/` is a logical mount point** (`product-workspace.md` § 1a): the trees may live on another disk or share, while `product_root` and every `canonical_artifacts` path stay in the portable `products/<group>/<slug>/…` form.

- **The logical fields remain authoritative.** Never store an absolute path in `product_root`, `cm_code_base`, or a `canonical_artifacts` entry — that is precisely what would make a manifest unreadable on another machine, and it is what the mount design exists to avoid. Verified 2026-08-15: 24 of 24 `canonical_artifacts` paths across four untouched real manifests resolved through an external mount with **zero edits**.
- **These two are disposable.** Rewrite them whenever the resolved root disagrees, and never trust a value carried over from a different machine.
- **Their only job is slim context.** Developer (08) loads `prd-minimal` + task breakdown and never reads `product-workspace.md`, so it must not be asked to resolve a mount — the orchestrator hands it absolutes derived from these fields. A slim-context agent holding a logical path with no absolute counterpart has hit an **upstream gap**, and should escalate rather than guess.

Absent on schema ≤ 8 manifests written before 2026-08-15; treat `null` as "resolve it and fill it in".

## Smoke outcomes and ship gating

**`smoke_outcomes`:** Object keyed by task ID (or freeform step label) recording the outcome of each manual smoke step required by the PRD's release plan. Added in `schema_version` 4.

**Why this exists.** One product's v0.1 ran the full pipeline cleanly (`/code-review` → `/test` → `/document` → `/ship` all green) and shipped broken on the first real-tenant install. Root cause analysis showed the pipeline had no stage that ran the artifact in its target runtime before declaring closure. The PRD named manual smoke steps (T037/T038) but `/ship` happily marked the run `shipped_with_caveats` without tracking whether the caveats were ever resolved.

**Entry shape.** Each key is a task ID (`T037`) or descriptive step label (`real-tenant-install`). The value records:

| Field | Meaning |
|-------|---------|
| `required_by` | Where the smoke step was named — usually a PRD section path or `manual` |
| `description` | One-line description of what the smoke verifies |
| `outcome` | `pending` (not yet attempted), `passed`, `failed`, `skipped` (with reason in `notes`) |
| `recorded_at` | ISO-8601 timestamp of the outcome record (or `null` while pending) |
| `evidence` | Screenshot path, URL, console transcript reference — or `null` |
| `notes` | Freeform; especially for operator preconditions discovered during smoke |

**When entries are written.**

1. **`/test`** populates `smoke_outcomes` with one entry per manual smoke step named in the PRD's release plan, all initially `outcome: "pending"`. If `platform_target` is `marketplace` or `content-sdk`, this is mandatory — the test pass cannot transition to `tested` while pending entries exist; status becomes `tested_pending_smoke` instead.
2. **The user (or `/test` when smoke is performed inline)** updates each entry with the actual outcome — `passed` flips with evidence, `failed` flips with notes on what broke, `skipped` requires a `notes` reason.
3. **`/ship`** reads `smoke_outcomes` before deciding ship status:
   - All entries `passed` → `shipped` is allowed.
   - Any entry `pending` or `failed` → status is forced to `shipped_with_caveats` and the ship report's "Open follow-ups" section MUST list each non-passing entry.
   - All entries `skipped` with explicit reasons → `shipped_with_caveats` (skipped smoke is still a caveat).

**Status flow.**

```
implemented → tested_pending_smoke → tested → shipped
                       ↓
              (smoke records resolved)
                       ↓
                     tested
```

When `platform_target` is `other`, smoke gating is advisory — `/test` may still set status directly to `tested` if no manual smoke is named.

**Operator-precondition learnings.** When a smoke step uncovers an operator-side precondition (e.g. "Sites.Host.targetHostname must be populated"), the precondition belongs in two places: (1) the relevant skill catalog (e.g. `xmc.md` notes), promoted via `/cleanup-friction`, and (2) the product's `SMOKE_TEST.md` as Section 0 ("Backend prerequisites").

## Operator attention

**`operator_attention`:** Top-level append-only array of attention items raised by dev-flow commands at their handoff points. Added in `schema_version` 6. Machine-readable mirror of the **Operator Checkpoint** block (see `.agent/glossary.md` § "Operator Checkpoint"); the checkpoint is the human-facing handoff, this array is the cross-product roll-up `/status` reads.

**Why this exists.** Long handoff narratives bury critical items (assumptions made, concerns, open questions) inline. The operator wants signal first, audit trail second. The checkpoint block solves the in-message problem; this array solves the cross-product problem — "are there unresolved attention items in any of my eight in-flight products?" answered without re-opening every manifest by hand.

**Entry shape.**

| Field | Meaning |
|-------|---------|
| `stage` | Command or stage name where the item was raised (`create-prd`, `challenge-prd`, `architect`, `task-breakdown`, `implement`, `code-review`, `test`, `document`, `ship`) |
| `severity` | `blocker` (next stage cannot proceed) \| `warn` (run can continue, operator should know) \| `info` (FYI) |
| `kind` | `decision` \| `assumption` \| `concern` \| `question` \| `resolved` — maps 1:1 to the checkpoint sections |
| `item` | One-line description matching the checkpoint bullet text |
| `raised_at` | ISO-8601 timestamp when the item was raised |
| `resolved_at` | ISO-8601 timestamp when resolved, or `null` while open |
| `references` | Optional — prior `raised_at` this entry resolves, or an artifact path |

**The shape above is BINDING and mechanically enforced** by `assert-manifest-pointers.mjs` (`attention-shape`): `stage` / `severity` / `item` missing is an ERROR, an undeclared key is a WARN. Measured 2026-09-02: **six different shapes were in use**, all six inside one manifest alone — `{stage,severity,note}`, `{at,detail,severity,topic}`, `{at,impact,kind,stage,summary}`, `{detail,severity,stage,title,type}` and `{item,severity,stage}` alongside the declared one. This section has always called the array the cross-product roll-up SoT; against six shapes no reader could roll anything up, and nothing was looking. The key is `references` (plural) — the check tested `reference` until the same date, so a correctly-formed entry was reported as unreferenced.

**Append-only.** Never edit a prior entry in place. To mark an item resolved, append a new entry with `kind: "resolved"` and `references: <prior raised_at>`. The most recent entry referencing a given `raised_at` represents its current state; `/status` treats any `decision|assumption|concern|question` entry whose `raised_at` does not appear in a later `resolved` entry's `references` as **open**.

**Who writes.** Each dev-flow command that emits an Operator Checkpoint block at handoff also mirrors its non-empty items into this array before writing `current-run.json`. Empty checkpoint sections do not produce entries. The mirror happens at the same point in the command's flow as the existing `stage_history` append.

**Who reads.**

- `/status` (default mode) — counts open entries per product and surfaces an `ATTN:N` flag on the portfolio row (split by severity when ≥1 blocker exists).
- `/status <slug>` (single-product mode) — prints the full open-entry list grouped by severity, then a collapsed resolved log.
- `/ship` — reads the open list to (1) include unresolved blockers in the ship report's "Open follow-ups", and (2) prevent transition to `shipped` (force `shipped_with_caveats`) when any `severity: blocker` entry is still open.

## Gate records (`notes.gates`)

**`notes.gates.<gate-name>[]`** — append-only record of a mechanical gate a stage ran, and what it returned. Entry shape: `{ stage, exit, at, override_reason? }`.

Today exactly one gate is recorded, `manifest_pointers` (`assert-manifest-pointers.mjs`). Every stage that runs it appends its result; `/ship` **ERRORs** when the array is empty, and when any entry carries a non-zero `exit` with no `override_reason`.

**Why this exists.** Nine dev-flow commands cite that script in their Validation block as an *"exits 0"* criterion. On 2026-09-02 a bug shipped through a `/ship` where it exits **1** — and nothing in the manifest said whether the gate had been run and ignored, or never run at all. A prose exit criterion with no record is indistinguishable from no criterion, which is rule `88`'s shape applied to a gate rather than to a declaration. An override stays perfectly legal; it simply cannot be silent.

**Why in the manifest rather than a hook.** Products are separate git repos with their own remotes — this repo's `.githooks/pre-commit` cannot see a product's manifest, so a hook-based gate would cover exactly the population that does not need it. The manifest is the only surface both sides share.

## Friction log

**Purpose.** A per-run, append-only record of "what didn't go well" — small cuts that the pipeline currently swallows without learning from them. Examples: agent had to be nudged to use Blok, scaffold step asked the same question twice, POC invented hex tokens, QA tried to test on localhost despite Marketplace target. The friction log turns these into structured signals that feed `/cleanup-friction` and the skill CATALOGs' patch queues.

**Where it lives.** One file per run alongside the manifest:

```
products/<product-slug>/project-planning/workflow/friction-log-<run_id>.md
```

The path is registered in `canonical_artifacts.friction_log` in the run manifest. The same `run_id` that the manifest uses (per the timestamp rule in each command) is reused for the file name — so friction log and run manifest line up one-to-one.

**Configuration.** The `friction_log` block in the run manifest controls capture:

```json
"friction_log": {
  "path": "products/<product-slug>/project-planning/workflow/friction-log-<run_id>.md",
  "min_severity": "medium",
  "enabled": true
}
```

- **`min_severity`** — `low` | `medium` | `high` | `critical`. Entries below this threshold are not written. Default is `medium` — silence on cosmetic noise, capture anything that required a nudge or rework. Adjust per-run (or per-product by editing the run-manifest template) without touching commands or agent files.
- **`enabled`** — set `false` to suppress the friction log entirely for a run (e.g. throwaway experiments). Default `true`.

**Severity scale.**

| Severity | Meaning |
|----------|---------|
| `low` | Cosmetic — wording quirk, minor template drift, single typo in an artifact. |
| `medium` | One nudge needed — agent had to be re-prompted, a small course-correction landed, a skill was incomplete but workable. |
| `high` | Multiple nudges or rework — same correction repeated, sub-agent produced wrong artifact and had to redo, planning gap discovered mid-stage. |
| `critical` | Stage failed, wrong artifact shipped, or user explicitly stopped the run to fix process. |

**Write triggers (when to append a friction entry).**

1. **Agent self-flag** — an agent had to course-correct mid-stage (re-read instructions, redo work, switch approach after starting). Severity `medium`+.
2. **User correction** — the user said "no", "don't", "stop", "stick to X", "you're not doing Y" — record the correction with the trigger phrase. Severity reflects how many nudges were needed (one = `medium`, repeated = `high`, full stop = `critical`).
3. **Stage failure** — whenever a `stage_history` entry is appended with `outcome: "failed"`, also append a friction entry quoting the same error.
4. **Skill mismatch** — an agent loaded a skill but found it incomplete, outdated, or wrong for the situation. Severity `medium`+ — these are the entries that drive CATALOG patch candidates.

**Entry format (markdown, append-only).** New entries go at the bottom of the file. Never edit or remove past entries — supersede them with a follow-up entry referencing the original timestamp.

```markdown
## <ISO-8601 timestamp> — <command> § <section> (<agent-or-stage>)
**Severity:** low|medium|high|critical
**Observed by:** <Team Lead | self-flag from agent NN | user-correction | stage-failure>
**What happened:** <one-paragraph factual description, no blame, no speculation>
**User correction (if any):** "<verbatim trigger phrase from the user>"
**Skill / command at fault:** <repo-relative path or null>
**Suggested patch target:** <"add X rule to Y" | "extend skill Z with W" | null>
**Status:** open | promoted-to-<patch-id> | superseded-by-<timestamp>
```

**Read triggers.**

- `/ship` reads the run's friction log and includes a "What hurt this run" summary in the ship report; offers to promote any `open` entries to CATALOG patch candidates before commit.
- `/cleanup-friction` sweeps friction logs across all products, groups by skill / command / agent, and routes promoted entries into the right patch queue (skill CATALOG, command file, or agent file).

**Who writes.** The **Team Lead** (00) is the primary writer in orchestrated commands — they observe sub-agent behavior and user corrections directly. Sub-agents may also self-flag by surfacing a friction note in their handoff back to the Team Lead, which the Team Lead transcribes into the log. Direct invocations (no Team Lead in the loop) write their own entries when applicable.

**File initialization.** The first command in a run that needs to write a friction entry creates the file with this header (blank entry list afterward):

```markdown
# Friction Log — <run_id>

**Run manifest:** `<canonical_artifacts path>`
**Product:** `<product-slug>`
**Min severity captured:** `<min_severity>`

---
```

If the file already exists for this `run_id`, append directly — never overwrite.
