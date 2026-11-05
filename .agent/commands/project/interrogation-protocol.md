# Interrogation protocol — the grill

**Shared contract.** Loaded by `/create-prd` (discovery mode) and `/challenge-prd` (critical mode). Both stages are an **interrogation**, not a questionnaire: one question at a time, each derived from the last answer, pushing back on anything vague, until nothing unresolved would change what gets built.

Added 2026-08-03. Before it, both stages budgeted depth in **rounds** — a round being a batch of grouped questions delivered in one message. A batch is a form to fill in, and the operator answers it the way people answer forms: fast, shallow, and once. The prose in `02-product-manager.md` said "relentless"; the pacing tables said "1–2 rounds"; the concrete table won. This file replaces rounds with **questions** and specifies the loop.

## Who runs it

**The spawned specialist subagent runs the grill itself** — `Agent(subagent_type: "product-manager")` in `discovery` or `critical` mode. Not the orchestrator. The subagent's pinned `model`/`effort` (opus / medium since 2026-09-25) is what makes the questions sharp, and rule `72` keeps the orchestrator out of a 12-turn dialogue it would otherwise carry in context.

### The operator channel — check it before you start

Every question must ship with 2–4 concrete candidate answers. That is the constraint with the payoff: the PM cannot ask a lazy open-ended question it has not thought about. Design the options accordingly (below). **This holds regardless of which channel carries the question.**

**There are two channels, and which one you get is a runtime fact, not a choice.** Check at spawn time which of these you actually have, and do not assume:

| Channel | When | How the grill runs |
|---|---|---|
| **`AskUserQuestion`** | You have the tool | Ask directly, one question per call, one entry in `questions`. The straightforward path. |
| **Relay via the orchestrator** | You do **not** have the tool (the common case for a spawned subagent — the harness typically substitutes `SendMessage`) | Emit **one** question at a time to the orchestrator with its 2–4 options and their consequence descriptions fully written out. The orchestrator relays it to the operator **verbatim** and relays the answer back. Then continue the loop exactly as specified. |

**The relay path is a first-class path, not a degraded one** — the same contract already governs the Research Sidecar (03), which has no `AskUserQuestion` by design. Everything else in this protocol is unchanged on either channel: one question at a time, anchored to the last answer, pushed on when hedged, ledger appended after every answer.

**Do not silently downgrade when relaying.** The two failure modes seen in practice, both of which defeat the protocol:
- **Batching because relaying feels expensive.** Sending three questions per relay turn to save round-trips is the exact anti-pattern this protocol exists to prevent (see Anti-patterns). Relay cost is the orchestrator's problem, not a reason to batch.
- **Losing the options.** A relayed question stripped to bare prose forces the orchestrator to invent the candidate answers, which puts words in the operator's mouth and destroys the audit trail. Ship the full option set every time.

**Frontmatter `tools:` is a declaration of intent, not a runtime guarantee.** Several agent identities list `AskUserQuestion` and still do not receive it when spawned. Verify, then pick the channel.

**State lives on disk, not in the subagent's head** (rule `72`). The grilling subagent appends to a **ledger** after every answer; the downstream constructive spawn reads that ledger **by path**. The orchestrator never carries the Q&A.

## The loop

For each question:

1. **Pick the highest-value unknown.** The one whose answer would change the most downstream work — scope, an acceptance criterion, an ADR, a tranche boundary. Cheap to ask now, expensive to get wrong later.
2. **Sanity-check it is worth asking.** *If this answer flipped, would a downstream artifact change?* If no, do not ask it. A question that cannot change anything is padding, and padding is what makes an operator start skimming.
3. **Anchor it to the thread.** Open with one clause naming the answer it builds on — *"You said the map is per-site, so:"*. The operator sees a stream of cards with no running transcript; the anchor is what makes the grill feel adaptive instead of random.
4. **Ask exactly one question** via a single `AskUserQuestion` call with **one entry** in `questions`. Never two questions in one call. Never a numbered list inside one question's text.
5. **Read the answer, then decide: accept or push.**
   - **Concrete and justified** → log it as a Decision, move to the next unknown.
   - **Hedged** — "probably", "maybe", "we'll see", "something like", "whatever makes sense", "flexible", "TBD", "later", "I don't know" → **push**: re-ask the *same* point, narrowed to the smallest sub-question that can actually be decided, with options that force a commitment. Max **2** pushes per point; then log it as an explicit **Assumption** naming what breaks if it is wrong, and move on.
   - **Concrete but unjustified** → push **once** on the reasoning: *"You said X — what breaks if we do Y instead?"* This is the relentless part, and it is where a grill earns its cost. An answer that survives one challenge is worth writing into a spec; one that has never been challenged is a preference wearing a requirement's clothes.
6. **Append to the ledger** before asking the next question.

## Designing the options

The 2–4 options are the PM's **competing hypotheses**, not a menu:

- **Spread them across the real answer space.** Genuinely different answers with genuinely different consequences. `Yes / No / Maybe` is a non-answer; so is one plausible option plus two straw men.
- **Every `description` states the consequence** — what changes downstream if this is the answer ("scopes the map to one site; a second site needs its own run"). The operator is picking a future, not a word.
- **Never pad to 4.** Two real options beat four where two are filler.
- **"Other" is auto-supplied** and is the free-text escape — never spend an option slot on it.
- **Every question carries a recommendation.** The PM's own answer goes **first**, suffixed `(Recommended)`, and its description says **why** — not just what it does. This is not optional politeness: a stage that surfaces a problem without proposing an answer has pushed the analytical work back onto the operator, who is the one person in the loop who did not just spend a full context window reading the artifact. If you genuinely have no view, that is itself information — say so in the question text and explain what would break the tie, rather than silently dropping the marker.
- **Name the cost of the recommendation.** The recommended option's description should concede what it gives up, so the operator can disagree on the merits instead of having to reverse-engineer the trade-off. A recommendation with no stated downside reads as a foregone conclusion and stops being a question.
- **Do not offer an option the spec has already decided.** Re-asking a settled question is how a grill loses authority.

## Budget — questions, not rounds

Read from `scope_dial.rigor`; a `level=` / `discovery-level=` slash arg or a stage-specific message signal overrides.

| Level | Questions | Coverage |
|-------|-----------|----------|
| **light** | **3–5** | Blockers only — the answers without which implementation would guess. |
| **standard** *(default)* | **8–12** | Scope/MVP, user value, acceptance criteria, key constraints, top risks. Lighter on NFRs and edge cases — flag if missing, do not exhaust. |
| **thorough** | **20+, uncapped** | Every dimension, until dry. |

**The minimum is a floor, not a target.** At `standard`, closing after 3 questions is a failed grill; the level was chosen deliberately.

**Stop early when dry:** two consecutive answers that change nothing in the ledger — no new Decision, no new Assumption, no narrowed scope — end the grill even with budget left. Never ask filler to reach a count.

**The escape option.** Once the level's **minimum** is met, every subsequent question carries a final option — label `Enough — stop asking`, description *"Close the grill, log what's still open as assumptions, and write it up."* One click out, always visible, costs no extra turn. `AskUserQuestion` caps at 4 options, so from that point on the question carries **at most 3 real hypotheses** plus the escape. Below the minimum, do not offer it (the operator can still type "stop" via Other, and that is honored immediately).

## The ledger

`products/<slug>/project-planning/plans/interrogation-<stage>-<timestamp>.md`, where `<stage>` is `discovery` or `challenge`. Written by the grilling subagent, **appended after every answer** so an abandoned grill is resumable and a crashed one loses nothing.

```markdown
# Interrogation — <stage> · <spec or idea> · level <level>

## Nailed down
- **<point>** — <the decision, in requirement-grade words>  _(Q3)_

## Still fuzzy
- **<point>** — <assumption recorded>; breaks if: <consequence>  _(Q7, pushed 2×)_

## Explicitly deferred
- **<point>** — out of scope for this run because <reason>  _(Q9)_

## Transcript
- **Q1** <question> → <answer, verbatim or close>
```

Tier 3 (run-scoped working material) — ignored by `project-planning/.gitignore`. The durable record is the spec the answers merge into.

## Handoff

The grilling subagent returns the standard ≤5-line envelope (rule `72`) plus the **ledger path**. The constructive spawn that merges the answers reads the ledger **by path** — the orchestrator passes the path and never the Q&A. `Nailed down` items become spec text; `Still fuzzy` items become labelled Assumptions in the spec **and** `operator_attention[]` entries; `Explicitly deferred` items become Out-of-scope / Future Opportunities.

## When the grill does NOT run

Never fabricate answers to keep it running — that is the existing prohibition on inventing stakeholder resolutions, and it applies here first.

| Condition | Behavior |
|-----------|----------|
| **No operator watching** — `autonomy: fully_autonomous` **only** (every gate off = zero human interaction by definition) | The grill cannot run; there is nobody to answer. The PM does the cold analysis, records **every** unresolved item as an explicit Assumption in the spec with its consequence, and mirrors each into `operator_attention[]`. Zero questions asked. |
| **No operator REACHABLE** — the run is unattended (a harness, CI, a scheduled trigger) while `gates` are on | Same behaviour as the row above — cold analysis, every unresolved item an explicit Assumption, **zero questions asked** — but it is NOT the same STATE, and the manifest must say so. Record `discovery_mode: "unattended"` and `discovery_questions_asked: 0`. Do **not** set `autonomy: fully_autonomous`: the gates are on and the operator has not waived them, so every downstream stop still applies and the run halts at the first one. |

### `discovery_mode` — the field that makes a fabricated grill visible

Every run records one of three values, and `discovery_questions_asked` beside it:

| Value | Means | `questions_asked` |
|---|---|---|
| `interactive` | the grill ran; a human answered | the real count |
| `relayed` | the spawned agent held no `AskUserQuestion`, so the orchestrator relayed each question to a human | the real count |
| `unattended` | nobody was reachable; every answer is an Assumption | **0** |

**`unattended` with a non-zero count is a contradiction and must fail validation.** Before this
field existed, a fabricated ledger and a real interrogation were indistinguishable on the
manifest — both read `discovery: completed, discovery_questions: 13` — and `/create-prd`
Validation checks the COUNT against the rigor floor, which fabrication satisfies perfectly. Six
separate runs reported this; each wrote its own free-text note because no field existed, which
is what a missing rule looks like.

**An `unattended` run is not licence to invent.** It is licence to STOP asking and start
recording: each unanswered dimension becomes a labelled Assumption with its consequence, and
the spec says NOT SPECIFIED where a value would otherwise be guessed. The prohibition at the
top of this section is unchanged and absolute.

### The scope dial is covered too

**This section governs the SCOPE DIAL as well as the grill.** They are different mechanisms — the
grill is one-question-at-a-time, the dial is a fixed set of `AskUserQuestion` calls at kickoff — and
until 2026-08-27 only the grill had an unattended branch. A run with nobody to answer fell back to
`/create-prd`'s *"Greenfield default"* clause, which is scoped to **a legacy run resumption** and
says nothing about this case. Two verification runs improvised their own dial and neither recorded
that it had.

Unattended, the dial resolves without asking, in this order:

1. **Pack presets win** — a dial an active pack declares is answered by the pack. Not an assumption:
   reading a contract is not inventing.
2. **Filtered dials stay dropped** — `null` with the reason, per the M1 filter.
3. **Everything else takes the documented default**, recorded as `scope_dial_source: "unattended_defaults"`
   in `notes`, with the defaulted keys listed.

**Record the act, not just the values.** A dial that was defaulted because nobody was reachable and
a dial the operator explicitly accepted are different facts, and a downstream stage that cannot tell
them apart will treat a guess as a decision.

### The one thing an Assumption cannot cover

Every unresolved dimension degrades into a labelled Assumption — **except a value that must exist on
disk before the spec can be written.** You cannot write a file to an assumption. `workspace.naming`
is the case: the product folder, the `git init` and the spec write all need a real path, which is
why the platform resolves it *before* git setup.

Split it by blast radius, because the two halves are not the same risk. **Which name sits in which
half is declared by the active platform pack** (`workspace.naming.local` / `.tenant_facing`), never
assumed here — a Marketplace app has no Deploy project, and a Content SDK head app has no Cloud
Portal app name:

| Half | Unattended behaviour |
|---|---|
| **Local** — folder path, project root, branch, slugs | **Derive from the run slug** and record `workspace.naming_source: "derived_from_slug"`. A folder is local and renameable; the run cannot proceed without one. |
| **Tenant-facing** — whatever the pack lists | **Never derived. Left `null`,** with an `operator_attention[]` entry. These propagate into tenant state that a later rename does not undo. |

**When the run stops is the pack's answer too — `workspace.naming.required_at`:**

| Value | Unattended behaviour |
|---|---|
| `go_live` | Plan, spec and build proceed. The null name blocks at the `go_live` gate, before the first real-tenant mutation. |
| `before_scaffold` | Plan freely — spec, ADRs, design and the task breakdown all survive a later rename. **STOP before `/implement`**, with an `operator_attention[]` blocker naming the unresolved names. |
| `intake` | **STOP at intake.** Record the composition, `discovery_mode`, and an `operator_attention[]` **blocker** naming the unresolved names. Do not spec, do not branch, do not scaffold. Reserve this for a name that is written to DISK before the spec exists — the Content SDK editing-host name lands in `xmcloud.build.json` before the first commit, which is the case the carve-out was written for. |

**A stop is only ever about the names still UNRESOLVED.** Names the operator supplied at the door resolve normally, whatever `required_at` says — verified 2026-08-28 by a run that supplied them and correctly proceeded. And **the `throwaway` bucket already neutralises the permanence risk** (it forbids the provisioning and registration that make a name permanent), so a stop there is the manufactured blocker `product-workspace.md` § 1b exists to prevent: record the gap and continue.


**Both platforms shipped today declare `intake`, and this section asserted `go_live` for everyone
until 2026-08-27** — that a null tenant-facing name "blocks exactly where it should and nowhere
earlier". Two verification runs measured it false, independently: Content SDK needs the editing-host
name for `xmcloud.build.json` before the first commit, and Marketplace needs the Cloud Portal app
name before the first `ClientSDK.init()`. An unattended run in a real bucket would have specced,
branched and built against a name it was forbidden to choose, then deadlocked at a deploy it could
not fix — while `/create-prd` Validation escalated the same absence to a `[BLOCKER]` with no way to
clear it. Only the `throwaway` bucket's scaffold ban hid this.

The correction is the one the gate token already taught: **core keeps the mechanism, the pack states
the fact.** Core cannot know when a platform's name becomes permanent, and asserting a universal is
exactly how this went wrong.

> **A single gate token being off is NOT "no operator watching."** Corrected 2026-08-05, after a live run
> where `gates.spec: false` silently switched the `/create-prd` discovery grill off on a greenfield brand
> that had no name yet — the operator was demonstrably present, having just answered twelve scope-dial
> questions, and had to override the protocol by hand to get a spec worth building from.
>
> **A gate token controls whether the pipeline STOPS. It says nothing about whether the operator EXISTS.**
> The two were conflated because `fully_autonomous` implies both, but the implication does not run
> backwards: `gates.spec: false` with any other gate on describes an operator who wants fewer interruptions,
> not an absent one. Treating it as absence converts a spec stage into a monologue and hands the build a
> pile of unvalidated assumptions — the precise failure the grill exists to prevent.
>
> **The grill therefore runs under every gate configuration except `fully_autonomous`** (and the other rows
> of this table). What the gate token still governs is the **stop at the stage's close** — grill, then close
> soft. The two decisions are independent and must stay that way.
| **`work_item_type: bug`** | No grill. Bug intake is capture, not discovery. |
| **`skip discovery` / `skip critical review`** | No grill for that stage; record the skip in manifest `notes` as today. |
| **Operator asks to batch** — "just ask everything at once", "give me the list", "batch them" | Honor it: deliver one message with all remaining questions grouped under headings, take one consolidated reply, merge. The pre-2026-08-03 behavior, on explicit request only. |
| **Operator picks `Enough — stop asking` or types a stop** | Close immediately, log the remainder as open assumptions, proceed to write-up. Do not ask "are you sure". |

## Anti-patterns

- **Batching.** Two questions in one `AskUserQuestion` call, or a numbered list inside one question's text. This is the single failure the protocol exists to prevent.
- **Pre-generating the question list** from the doc in one pass and reading it out. Question N+1 comes from answer N or it is not an interrogation.
- **Accepting a hedge.** "We'll figure it out later" is not an answer; it is a deferred decision that must be logged as one, with a consequence, after being pushed on.
- **Asking what the input already answered.** Read the brain-dump / spec / prior ledger first; a grill that re-asks settled points trains the operator to skim.
- **Padding to the budget.** The dry test exists precisely to allow an honest early close.
- **Sycophantic acknowledgement between questions.** No "great answer" — the next question is the acknowledgement.
- **Asking two reviewers to grill the same operator.** Under `dual_review: on` (or `fable`) only the *analysis* doubles; exactly one grill runs (see `/challenge-prd`).
