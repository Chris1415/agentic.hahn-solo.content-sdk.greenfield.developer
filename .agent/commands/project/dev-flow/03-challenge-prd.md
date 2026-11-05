---
name: challenge-prd
intent: review_and_align
writes:
  - products/<product-slug>/project-planning/specs/prd-NNN.md (revised in place from review answers)
  - products/<product-slug>/project-planning/specs/prd-minimal-NNN.md (re-extracted when the Developer slice changed)
  - products/<product-slug>/project-planning/ADR/adr-*.md (added/adjusted when answers change an architectural commitment)
  - products/<product-slug>/project-planning/plans/interrogation-challenge-<timestamp>.md (the grill ledger)
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/interrogation-protocol.md
  - .agent/agents/team/02-product-manager.md
  - .agent/manifests/run-manifest.template.json
---

# /challenge-prd — the spec review stage (critical review + merge)

## Pipeline position

**Canonical stage for a PRD run**, auto-chained from `/create-prd`: `/create-prd` → **`/challenge-prd`** → `/architect`. This command **carries the `spec` gate**.

Split out of `/create-prd` on 2026-07-29. Previously the review ran inline as `/create-prd` steps 12–13, which buried a distinct task (critical mode, fresh subagent) inside an already 9-job command, left the review with **no `stage_history` entry** (so a crash mid-review was unresumable), and orphaned the merge — this file's own hard rule 5 assigned it to "the calling command," which does not exist on a direct invocation.

**This command owns the whole review→merge cycle:** it reviews, takes the operator's answers, **merges them into the PRD**, re-extracts `prd-minimal`, adjusts ADRs, records its stage, and gates.

**It also serves the on-demand re-challenge** — same steps, invoked by hand:

- After a PRD has been **revised heavily** since its initial review (scope creep, new constraints landed mid-architecture, new ADRs invalidated assumptions).
- Before starting a **new phase** when a stacked PRD depends on an older PRD whose constraints may have drifted.
- When a **stale PRD** is resumed weeks or months later and you want a fresh-mind read.
- When you want a **second opinion** at a different criticism level than the original.

**FRD runs (`work_item_type: frd`) chain here too**, at a derived-light level and with a **soft** close — see *Work-item weight* below. Bug runs do not chain (they are autonomous by design).

Continue to `/architect` by default. Run `/source-analysis` first only when the operator explicitly provides URL(s) and requests rebuild parity extraction.

## Work-item weight

Read `work_item_type` from the run manifest. Same review, three weights:

| Type | Level | Close |
|------|-------|-------|
| **prd** | from `scope_dial.rigor` (default `standard`) | **HARD** when `gates.spec` is on — this is the `spec` gate. Next: `/architect`. |
| **frd** | derived **`light`** unless the operator overrides (contradictions, missing acceptance criteria, ambiguous scope only) | **SOFT** — an FRD's operative gates are `build`/`final` (its `/test` or `/test-content` close) plus `go_live`; planning runs unattended. Next: `/task-breakdown`. |
| **bug** | n/a — does not chain | n/a |

The FRD weight replaces `/create-frd`'s former inline "light critical review" step. Do **not** add a gate to an FRD run; its gate topology is unchanged.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve PRD paths under **`products/<product-slug>/project-planning/`** (manifest `canonical_artifacts` or `project-planning/specs/`).

## Goal
Execute the **Product Manager — Critical Reviewer** agent to **rigorously examine** the spec for uncertainties, ambiguities, and gaps, and **grill the operator on them one question at a time** until every section is crisp enough that no reader has to guess intent. The goal is **clarity**, not destruction: find what is fuzzy, question it, and push toward specificity.

## Mandatory — the interrogation protocol

**Read and apply `.agent/commands/project/interrogation-protocol.md`.** This stage is an **interrogation**, not a review report the operator answers in bulk. The protocol owns the loop (one question per `AskUserQuestion` call, next question derived from the last answer, push back on every hedge, budget in questions, the ledger, the escape option, and the conditions under which the grill does not run). This file owns what is *specific* to challenging a written spec: severity, the cold-read stance, and the merge.

Changed 2026-08-03. Before it, this command produced a **grouped report of challenges** and stopped for a consolidated reply — hard rules 1–2 said "structure with clear headings … one round then wait", and even offered a one-shot "deliver all rounds in a single reply" path. That is a form, and the operator answered it like a form. The findings still get grouped and reported — but at the **close**, as the summary of a dialogue that already happened, not as the opening move.

## Hard rules (non-negotiable)

1. **Grill, do not report.** The spec's gaps are surfaced **one question at a time** per the interrogation protocol, each anchored to the answer before it. Do **not** open with a headed list of challenges; the headed list is the **closing summary**. Batching is honored only on the operator's explicit request (protocol § "When the grill does NOT run").
2. **Depth is counted in questions, not rounds** — see *Criticism level* below. A `standard` review that closes after three questions has not happened.
3. **Do not** create `products/<product-slug>/project-planning/specs/critical-review-notes-*.md` **unless** the stakeholder **explicitly** asks to persist notes. (The grill **ledger** under `plans/` is written unconditionally and is a different artifact — it is run-scoped working material, not persisted review notes.)
4. **Do not** invent Q&A or "resolutions" in files as a substitute for real stakeholder answers.
5. **This command merges its own answers** (steps 7–9), **from the ledger, by path**. After substantive answers, **merge** them into the spec and **adjust ADRs** when architectural commitments change — **one primary decision per ADR** where practical. The review is not done when the questions are asked; it is done when the answers are in the document. (Before 2026-07-29 this rule punted the merge to "the calling command," which left it unowned on a direct invocation.) The orchestrator passes the **ledger path** to the constructive spawn — never the Q&A itself (rule `72`; a 12-question grill relayed inline is exactly the context bloat that rule exists to prevent).
6. **The review is not a rubber stamp on exit.** An unresolved **blocker-severity** challenge (see *Severity* below) keeps the stop even when the operator says "review complete" — surface it, name it, and let the operator accept it explicitly. Everything else may close.

## Dual review (`scope_dial.dual_review`)

**Default `off`: a single reviewer.** The analysis pass runs on Sonnet (step 3).

When `dual_review` is `on` or `fable`, run the **cold-read gap analysis** (step 3) **twice,
independently**, in the same turn:

- the standard pass, with `model: "sonnet"`;
- a second pass: under **`on`** it is spawned **without** a model override, so it runs on the PM's own
  Opus pin; under **`fable`** it is spawned with `model: "fable"`, as an explicit opt-in.

Give both passes the identical brief, and show neither one the other's findings. **Neither asks the
operator anything.** Each returns a ranked, severity-tagged gap list and stops.

**07 QA arbitrates** the merge:

- Dedupe findings that name the same gap.
- Resolve disagreements against the spec, not by vote.
- A gap raised by only one reviewer is not weaker for that.
- The evidence behind the pairing:
  - In the 5.0-generation round, Fable alone caught two gaps the other reviewer missed entirely.
  - On the 5.5 generation, an Opus + Sonnet pair covered everything the best single pass did, and
    Fable added nothing.

The arbitrated list is what the **single grill** (step 4) works from and what merges back into the spec.
Both raw reports are kept.

**Only the analysis doubles — the grill never does.** Two reviewers interrogating the same operator
would ask overlapping questions and burn the budget twice for one answer set. Exactly one grill runs,
against the arbitrated list.

Fire this only when `dual_review` is `on` or `fable`. On `off`, run exactly one analysis pass (on Sonnet) and change nothing else.

## Presenting the findings — triage first, then one at a time, each with a recommendation

The analysis (one reviewer, or two arbitrated under `dual_review`) produces a **consolidated ranked
list**. That list is **never dumped on the operator**. A thirty-finding table is a form, and the operator
answers a form the way anyone does — fast, shallow, once. Added 2026-08-05 after a live run surfaced 32
findings and had no specified way to put them to the operator.

**Step 1 — triage the list into three buckets before asking anything.** This is the part that keeps the
grill short enough to stay sharp:

| Bucket | Who resolves it | Behavior |
|---|---|---|
| **Self-resolvable** — a sequencing error, an internal inconsistency, a plain factual error, a wrong literal | The pipeline | **Fix it. Do not ask.** Report what you fixed and why at the close. Asking the operator to adjudicate your own bookkeeping wastes the budget on the questions that matter. |
| **Verifiable** — a claim about a live tenant, an SDK shape, a real file | A read, not an opinion | **Go and read it.** A tenant fact beats document archaeology every time; two docs disagreeing is not an operator decision, it is an unread source. Only escalate if the read is blocked. |
| **Genuine operator decision** — scope, priority, product trade-off, anything where the answer is a preference the pipeline has no standing to hold | The operator | **Grill it, one at a time**, per below. |

Only the third bucket becomes questions. In the run that motivated this section, six blockers triaged to
**three** operator decisions, two self-resolvable, and one that became decidable as a consequence of an
answer already given — so the operator was asked three questions instead of six.

**Step 2 — put each remaining finding to the operator as its own question**, per the interrogation
protocol's loop. Each carries, in this order:

1. **What is wrong**, in one or two sentences, quoting the spec where it helps.
2. **Why it matters** — the concrete downstream consequence, named.
3. **The recommendation FIRST**, suffixed `(Recommended)`, with its reasoning **and the cost it concedes**.
4. **Two or three genuine alternatives**, each with its own consequence — not straw men.

**Re-triage after every answer.** An answer routinely collapses a later finding: it may resolve it
outright, make it self-resolvable, or void it entirely. Re-check the remaining list each time and drop
what no longer needs asking — say so at the close rather than asking a question whose answer is already
determined.

**Never fabricate a resolution.** A finding the operator did not answer stays open: it becomes a labelled
Assumption carrying its consequence, never an invented decision. This is the same prohibition as the
protocol's, and it is the one that matters most here, because a merged spec looks equally finished either
way.

## Severity

Challenges carry a severity so the close can distinguish "three wording nits" from "this spec cannot be implemented as written." Without it there is no way to express a blocking finding — the rest of the pipeline (`/code-review`, `/test`, `/test-content`) has had Critical/Major/Minor all along; the spec review had nothing.

| Severity | Meaning | Effect at close |
|----------|---------|-----------------|
| **blocker** | A contradiction, an undecidable scope boundary, or a missing acceptance criterion that would make implementation guess. Two engineers would build different things. | Tag the Operator Checkpoint item `[BLOCKER]`. **Keeps the stop** even under `gates.spec: false` / `fully_autonomous`, and even if the operator says "review complete" — until they accept it in writing. |
| **major** | Real ambiguity or an untested assumption worth resolving, but implementation could proceed on a stated assumption. | Recorded; does not block. Unresolved ones become "Decisions needed" / "Concerns". |
| **minor** | Wording, polish, nice-to-have specificity. | Recorded; never blocks. |

Assign a severity to **every** challenge raised. `light` reviews cover blockers only by definition.

## Criticism level

Critical review runs at one of three depth levels. The level scopes both **coverage** (which sections get probed) and the **question budget** (how long the grill runs). Budgets are the interrogation protocol's; the coverage column is this stage's.

| Level | Coverage | Questions |
|-------|----------|-----------|
| **light** | Blockers only: contradictions, missing scope boundaries, ambiguity in must-have features that would stop implementation. **Skip** deep probing of success metrics, NFRs, edge cases, future opportunities unless obviously broken. | **3–5** |
| **standard** *(default)* | Scope/MVP, user stories, acceptance criteria, key risks, technical considerations. Lighter touch on success metrics and NFRs — flag if missing or unmeasurable, do not exhaust. | **8–12** |
| **thorough** | Every section: problem, goals, success metrics, scope, user stories, ACs, NFRs, technical considerations, data model, UX, release plan, risks, open questions. Surface cross-section contradictions. | **20+, uncapped until dry** |

The **dry test** and the `Enough — stop asking` escape option apply at every level (protocol § "Budget"). A grill that closes early because two consecutive answers changed nothing is a success; one that pads to hit a count is not.

**Selecting the level:**
- **Default: read from `scope_dial.rigor`** (set during `/create-prd` kickoff). When the dial is set in the run manifest, that level applies — **do not re-ask**.
- If the user passed `level=light|standard|thorough` (or `low|medium|high`) in the slash arguments, that overrides `scope_dial.rigor` for this re-challenge run.
- A stage-specific signal in the user's message ("light re-challenge") overrides for this stage only.
- If `scope_dial.rigor` is unset (legacy / dial skipped), **ask the user via `AskUserQuestion`** before reading the PRD: header `Crit level`, four options — `Light`, `Standard (Recommended)`, `Thorough`, plus the auto-supplied "Other" — with concise descriptions.
- Map `low → light`, `medium → standard`, `high → thorough`.

## Tone and attitude

You are a **critical clarity-seeker**, not a pessimist. You approach the PRD as a sharp, experienced colleague with a **fresh mind** — you have not seen the discovery conversation or the drafting process. You read the document cold and question everything that is not self-evidently clear:

- **Uncertainties:** Where does the PRD say "should," "might," "could consider," or leave options open without deciding?
- **Ambiguities:** Where could two reasonable engineers read the same sentence and build different things?
- **Gaps:** What is missing — edge cases, error states, integration points, migration paths, rollback plans?
- **Untested assumptions:** What does the PRD assume is true without evidence or stakeholder confirmation?
- **Contradictions:** Where do two sections disagree or where does scope creep past what the goals justify?

You are **not** trying to kill the idea. You are trying to make the spec so precise that implementation can proceed without interpretation.

## Inputs
- **Optional first argument:** Path to a PRD file. If omitted, resolve from `project-planning/workflow/current-run.json` → `canonical_artifacts.prd`. If the manifest is missing or that entry is absent, use the **latest PRD** (see `.agent/WORKFLOW.md`: prefer `prd-NNN.md` with highest N; else latest-by-timestamp).
- **Optional `level=` argument:** `level=light|standard|thorough` (or `low|medium|high`). When present, skip the level prompt.
- **Optional prompt (all remaining arguments or a single quoted string):** Focus lens (e.g. "focus on security and timeline"). Prioritize that lens in the gap ranking — so the grill starts there — while still covering the level's other in-scope sections within the question budget.

## When to run
- **Canonically — auto-chained from `/create-prd` (PRD) or `/create-frd` (FRD).** Not operator-triggered; the Team Lead invokes it at the intake command's close unless the operator said `skip critical review`. See *Pipeline position*.
- **Re-challenge after material spec changes:** When the spec has been revised since its review (e.g. scope creep, new constraints, new ADRs).
- **Resumed stale PRD:** When work resumes weeks/months later and you want a fresh-mind read.
- **Second opinion:** When you want a different criticism level than the original review used.

## Steps
1. **Resolve the spec path and weight.** Resolve the spec from the first argument, run manifest `canonical_artifacts.prd` (the universal spec slot — holds the FRD on an FRD run), or the latest spec in `project-planning/specs/`. If none exists, tell the user and ask for a path or to create a spec first. Read `work_item_type` from the manifest (default `prd`) — it sets the weight per *Work-item weight*.
2. **Resolve criticism level.** `prd`: from `scope_dial.rigor`; `frd`: derived **`light`**. A `level=` slash arg or a message signal overrides either. Only if `scope_dial.rigor` is unset **and** no override was given, ask via `AskUserQuestion` (header `Crit level`, options: `Light`, `Standard (Recommended)`, `Thorough`). Record `critical_review_level: <level>` in run manifest `notes`.
3. **Cold-read gap analysis — spawn sub-agent: Product Manager (critical mode), fresh context. No questions asked yet.** Spawn an isolated sub-agent via `Agent(subagent_type: "product-manager", model: "sonnet")`. The `sonnet` override applies to this analysis pass only: on the 5.5 generation, Sonnet out-scored the PM's Opus pin on this cold-read (11.0–12.0 vs 9.3 of 12). The pinned `effort` still applies (rule `72`; include `Output Level: <minimal|verbose>` per rule `73`). Prompt must include: read `.agent/agents/team/02-product-manager.md` for identity; **mode: critical**; the resolved level; the spec **path** (the sub-agent reads it — the orchestrator does not, per rule `72`); the focus prompt when one was given. **Task:** read the spec with a fresh, independent mind — you did not write it and have not seen the discovery conversation — and produce a **ranked gap list**: uncertainties, ambiguities, gaps, untested assumptions, contradictions. **Return the list and stop; do not ask the operator anything in this step.**
   - **Assign a severity (`blocker` / `major` / `minor`) to every gap** per *Severity* above. This is what lets the close distinguish a blocking finding from a nit — do not omit it.
   - **Rank by decision value** — the gap whose resolution would change the most downstream work first. This ranking is the grill's running order, so it matters more than the grouping.
   - Scope coverage to the level (`light` = blockers only; `standard` = scope/stories/ACs/risks; `thorough` = every section + cross-section contradictions). Lead with the focus lens when one was given, while still covering the level's in-scope sections.
   - **Do not** summarize the spec — find what is fuzzy in it.
   - **Brand voice and identity.** When the run authors content or has a UI, the **orchestrator** first runs `node .agent/scripts/check-brand-voice-section.mjs --spec <spec>` (the PM holds no Bash) and passes its printed problems into this prompt. Exit 1 is a gap: **blocker** when `content_authoring` is not `no` (`/author-content` will stop on it), **major** when only a UI is at stake. The script catches a missing or empty section; the analysis must also flag a **vague** one: voice attributes that could describe any brand, no vocabulary to avoid, claims with no source. Not applicable: skip it and say so.
   - **`dual_review: on` or `fable`:** run this step twice, with neither pass seeing the other:
     - the `sonnet` pass above;
     - a second pass. Under `on` it has no model override (the PM's Opus pin). Under `fable` it passes `model: "fable"`.

     Then have **07 QA arbitrate** the two lists into one ranked list, per *Dual review* above. The grill in step 4 runs **once**, against the arbitrated list.
4. **Run the grill — spawn sub-agent: Product Manager (critical mode) with the ranked list.** Spawn `Agent(subagent_type: "product-manager")` again, passing: the spec **path**, the ranked gap list from step 3, the resolved level and its question budget, and the **ledger path** to write (`plans/interrogation-challenge-<timestamp>.md`). **Task: apply `.agent/commands/project/interrogation-protocol.md` in full** — walk the ranked list, one `AskUserQuestion` call per question, each anchored to the previous answer, pushing back on every hedge and once on every unjustified answer, appending to the ledger after each. Work top-down by decision value, but **follow the thread**: an answer that opens a bigger gap than the next-ranked item reorders the list. That deviation is the point of a grill — a fixed list read out in order is the questionnaire this replaced.
   - **Triage the arbitrated list first** per § *Presenting the findings* — fix the self-resolvable, read the verifiable, and grill only the genuine operator decisions, re-triaging after every answer. Each question leads with the **recommendation** and its conceded cost.
   - **Skip this step entirely** when the protocol's "grill does NOT run" conditions apply (`autonomy: fully_autonomous`, `skip critical review`, batch requested). **`gates.spec: false` is NOT one of them** — it removes the *stop* at this command's close, not the operator, so the grill still runs and the close is simply soft (corrected 2026-08-05; the old wiring turned a spec review into a monologue whenever the operator opted out of the stop). Under genuine **no operator watching**, every gap from step 3 becomes a labelled Assumption in the spec plus an `operator_attention[]` entry — zero questions, zero fabricated answers.
   - Return the ≤5-line envelope plus the **ledger path** and the final question count.
   - **Always two spawns.** Steps 3 and 4 always run as separate spawns. The analysis runs on `sonnet`. The grill keeps the PM's own Opus pin, because the grill was not measured. Under `dual_review` the split is doubly required: the grill runs against the *arbitrated* list, so it cannot start before 07 QA has merged both analyses.
     - Before 2026-09-29, `off` allowed one combined analyze-then-grill spawn, to save a re-read of the spec. That was retired when the analysis moved to Sonnet.
5. **No round bookkeeping.** The grill is one continuous dialogue inside one sub-agent — there is no round 2 to spawn, and no carry-forward problem to solve (the pre-2026-08-03 design re-spawned a memoryless reviewer per round and had to re-feed it the prior Q&A to stop it re-asking answered questions). If the operator later asks for another pass, that is a fresh `/challenge-prd` invocation.
6. **Persisted notes (optional only):** if and **only if** the operator explicitly asks to save notes, write `project-planning/specs/critical-review-notes-<timestamp>.md`.
7. **Merge the answers into the spec (this command owns it — hard rule 5).** **Spawn sub-agent: Product Manager (constructive mode)** — `Agent(subagent_type: "product-manager")`, per rule `72` the orchestrator never authors the artifact itself. Pass **paths only**: the spec path, the **ledger path** from step 4, and the resolved severities. The sub-agent reads the ledger itself; the orchestrator never carries the Q&A. **Task:** edit `prd-NNN.md` (or `frd-NNN.md`) in place to incorporate the clarifications — scope, success metrics, risks, Open Questions, technical considerations, acceptance criteria. Map the ledger sections per the protocol's *Handoff*: **Nailed down** → spec text in requirement-grade words; **Still fuzzy** → labelled Assumptions carrying their named consequence; **Explicitly deferred** → Out of scope / Future Opportunities. If the grill closed early with no substantive changes, do a light consistency pass only. Return the ≤5-line minimal report naming which sections changed. **Skip** when the review was declined or produced nothing to merge.
8. **Adjust ADRs when an answer moved an architectural commitment.** In the same constructive spawn: read `project-planning/ADR/README.md` + existing ADRs; add a new ADR for each **distinct** decision the answers settled that is not already recorded, and supersede (never silently rewrite) any ADR the answers invalidated — **one primary decision per ADR** where practical, per `project-planning/ADR/template.md`, updating the index. Skip when nothing architectural moved.
9. **Re-extract the minimal block (schema 7+).** If step 7 changed the spec's `## 1.5 Developer slice` section (between `<!-- PRD_MINIMAL_BEGIN -->`/`END` markers), re-run the mechanical extraction defined in `/create-prd` step 14 (strip markers + PRD-side heading + blockquote, demote subheadings one level, prepend the minimal frontmatter, **OVERWRITE** `prd-minimal-NNN.md` / `frd-minimal-NNN.md`). Skip when the slice was untouched. The full spec's Developer slice is the single source — hand-edits to the minimal file are lost on extraction.
10. **Update the run manifest.** Record `critical_review: completed` (or `declined`), `critical_review_level`, `critical_review_questions: <count>`, and `critical_review_ledger: <path>` in `notes`. Refresh `canonical_artifacts.prd_minimal` if step 9 rewrote it. Mirror every unresolved challenge into `operator_attention[]` with `stage: "challenge-prd"` and `severity` mapped from *Severity* (`blocker` → `blocker`, `major`/`minor` → `warn`/`info`). Update `updated_at`; write both `run-<timestamp>.json` and `current-run.json`.
11. **Append `stage_history` entry** per `.agent/manifests/README.md`: `{ stage: "spec_challenged", agent: "02-product-manager", outcome: "completed" | "skipped", one_line: "<level> review; N challenges (B blocker / M major); merged into <spec>", deliverables: [<spec path>, <minimal path when re-extracted>, <ADR paths when written>], escalations: [<unresolved blocker one-liners>] }`. When the spec was revised, also append `{ stage: "spec_ready", outcome: "superseded" }` against the prior entry so the audit trail preserves that the reviewed spec replaced the drafted one.
12. **Friction nudge.** Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt before reporting completion. One nudge per run. Default-skip.

## Validation
Before finishing, verify:
- A criticism level was resolved (from `scope_dial.rigor`, the FRD derivation, an arg, or a prompt) before review began.
- The spec was read and examined substantively at the chosen level (not superficially for `standard`/`thorough`; not over-extended for `light`).
- **The grill ran one question at a time** — one `AskUserQuestion` call per question, never two questions in a call and never a numbered list inside one. The **only** exceptions are an explicit operator batch request or a "grill does NOT run" condition, and the reason is recorded.
- **The question count meets the level's floor** (light 3–5 / standard 8–12 / thorough 20+), or the grill closed early on the **dry test** or the operator's escape and that is stated. Padding to the count is a failure, not a pass.
- **Every hedged answer was pushed on** (max 2) before being logged as an Assumption, and every unjustified answer was challenged once.
- **The ledger exists** at `plans/interrogation-challenge-<timestamp>.md` with `Nailed down` / `Still fuzzy` / `Explicitly deferred` / `Transcript`, and the merge spawn was given its **path**, not its contents.
- **Every gap carries a severity** (`blocker` / `major` / `minor`) — an unseverity'd finding cannot gate anything.
- **Brand voice and identity was checked** when the run authors content or has a UI: the script ran, and a missing or vague section is on the gap list.
- **The answers were merged** — the spec on disk reflects the operator's clarifications (step 7), or the review produced nothing to merge and that is stated.
- **`prd-minimal` is in sync** — re-extracted when the Developer slice changed, untouched otherwise.
- ADRs were added/superseded when an answer moved an architectural commitment, or nothing architectural moved.
- No unsolicited notes file was created.
- If a focus prompt was given, it drove prioritization within the level's scope.
- The run manifest carries `critical_review` + `critical_review_level` in `notes`, a `spec_challenged` `stage_history` entry, and every unresolved challenge mirrored into `operator_attention[]`.

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage challenge-prd` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "challenge-prd", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Output rules
- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". The review produces the raw material — every unresolved challenge becomes a "Decisions needed" or "Concerns / risks" item; every assumption the spec makes without justification becomes an "Assumptions made" item. **Tag every unresolved `blocker`-severity challenge `[BLOCKER]`.** Place the block **before** the headed review sections. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "challenge-prd"`.
- Report which spec was used **and the criticism level** (e.g. *"Reviewed `prd-003.md` at level: standard — 11 questions."*), plus the gap count by severity and what was merged.
- **The headed summary is the close, not the open.** After the grill, deliver the findings grouped under clear headings (`### Goals & metrics`, `### Scope / MVP`, `### User stories`, `### NFRs & tech`, `### Risks & release`) — each with its severity and how the operator's answer resolved it (or that it stayed open). This is the report the pre-2026-08-03 command used to lead with; it reads as a record of a dialogue rather than a form to fill in.
- **Operator gate — the `spec` gate. HARD when `scope_dial.gates.spec` is on (default) and `work_item_type == prd`.** Per `.agent/glossary.md` § "Operator Gate". This command is where the `spec` gate fires (it moved here from `/create-prd` close on 2026-07-29) — the spec has now been written *and* challenged, and is about to drive every downstream stage.
  - **`gates.spec` on + `prd`:** end with *"PRD reviewed and updated. Reply **YES** to proceed to `/architect`, or describe further changes to the PRD / ADRs. If you want a URL rebuild blueprint first, say so and run `/source-analysis` before `/architect` (choose `full_website_clone` mode when exact full clone parity is the target)."* Stop and wait — do not soften into a passive recommendation. The hard stop applies even with all four checkpoint sections at `— none`; the gate is a deliberate handoff confirmation, not a function of remaining open items.
  - **`gates.spec` off** (`fully_autonomous`) **or `work_item_type == frd`:** SOFT — end with "Recommended next: `/architect`" (PRD) or "Recommended next: `/task-breakdown` (architecture skipped — feature weight)" (FRD) and proceed autonomously.
  - **Either path — keep the stop and name it** when any **unresolved `blocker`-severity challenge** remains, or any `[BLOCKER]` checkpoint item is present: *"STOP — `<blocking challenge>`. Resolve it, or reply **YES** to accept it and proceed anyway."* Autonomy removes review stops, not blocking findings.
- On-demand re-challenge outside a managed run (no manifest): skip steps 10–11, deliver the review + merge, and close soft.
