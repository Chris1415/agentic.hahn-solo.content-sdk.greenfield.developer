# Pack contract (v1) — platform · method · audience · source

> **Status: TRANCHE 2 — `/implement` and `/test` READ these packs.** Three `pack.json` files declare
> **today's behaviour verbatim** for both stages, and both commands now resolve a brief instead of
> restating a platform's lists inline. **No file has moved** (that is tranche 5) and **no behaviour
> changed** — a deviation from the original command prose is a bug in the pack, not an improvement.

**Agents are identities. Commands are tasks. Packs are domains.** Today domain has no home, so it
leaks into both — 100 `platform_target` references across 32 files.

---

## Layout

```
.agent/packs/
  README.md          ← this file (the contract)
  pack.schema.json   ← editor support, NOT the gate (see below)
  platform/  content-sdk/   pack.json
             marketplace/   pack.json
  method/    clone/         pack.json
  audience/  marketer/      pack.json + templates/
  source/    sitecore-xm-xp/ pack.json   ← /migrate only; additive (see Dimensions)
```


**The schema file is not the gate, and cannot be.** Every rule that matters here is *cross-pack* —
one owner per slot, one owner per dial, `extends` resolving to the same kind, `incompatible_with`
refusing a composition — and none of them exist until two packs are composed. JSON Schema validates
one document at a time, so it can only check shape.

| Layer | Enforces |
|---|---|
| `pack.schema.json` | shape of a single file (editor completion) |
| **`.agent/scripts/resolve-packs.mjs`** | **the real rules** — load, compose, conflict |
| `__tests__/resolve-packs.test.mjs` | that the rules can still fail (every guard has a mutant) |
| `validate-framework.mjs` § J | runs the above over every runnable combination |
| `__tests__/extraction-coverage.test.mjs` | **gate 1** — every token that left a core command is still findable in its declared home |

```sh
node .agent/scripts/resolve-packs.mjs --check        # every combination
node .agent/scripts/__tests__/resolve-packs.test.mjs      # 54 assertions, mutation-tested
node .agent/scripts/__tests__/extraction-coverage.test.mjs # 72 — gate 1: nothing was silently dropped
```

**Kind-first, not `platform/`-flat.** The plan doc carried both shapes; kind-first is canonical
because there are three dimensions and `method:clone` is not a platform. `.agent/platforms/<pack>/`
is superseded.

**The nulls have no directory.** `platform:none` · `method:greenfield` · `audience:developer` inject
nothing; all three null = today's generic pipeline. A missing directory is the null, so there is no
empty pack to maintain.

---

## Dimensions

```
platform:  what you BUILD ON            content-sdk | marketplace | none
method:    where the SPEC comes from    greenfield  | clone
audience:  WHO operates it              developer   | marketer
```

A run picks one value per dimension. 3 × 2 × 2 = 12, of which **10 are runnable** —
`marketplace × clone` is declared `incompatible_with` and the validator refuses it.

```
source:    what ELSE a /migrate run reads   none | sitecore-xm-xp
```

`source` is a fourth dimension with a different contract (2026-10-10): **additive only**. A source
pack may not claim a slot, set a dial, override anything (templates included), own a stage,
re-default a variable or declare a pack-level key — `checkPackShape` ERRORs on each. It must declare
`requires` (all must be active) and a closed `composes_with` (any other active pack is refused).
`runnableCombinations()` stays the triple above, so the brief goldens never see `source`;
`sourceCombinations()` enumerates the declared source compositions and `--check` composes them.
Proof: `.agent/scripts/__tests__/source-axis-is-additive.test.mjs`.

---

## What a pack declares

Round 2 of the probes said "four kinds". Writing three real packs shows that is the right model for
**merge semantics** but not an exhaustive taxonomy of a pack's *contents*. A pack declares **five**
things:

| | What | Merge semantics |
|---|---|---|
| **`skills`** | which skills a stage loads, with a load policy | union; `mandatory_when` wins over `when_relevant` |
| **`additions`** | items appended to a list the **core** owns | concatenate, pack order |
| **`hooks`** | ordered steps at a **named anchor** | concatenate, pack order |
| **`overrides`** | replace a stage body or a template file | **exactly one owner** — two active packs → validator ERROR |
| **`slots`** | a named typed value a stage renders (`scaffold`, `definition_of_done`, `constraints`, `generated_artifacts`, …) | **exactly one owner per slot** — see *Slot ownership* |
| **`derives_instead_of_asking`** | intake questions a pack answers itself, each naming the question it suppresses verbatim | **concatenate**, each entry tagged `declared_by` — the one stage declaration exempt from one-owner (2026-09-30). An audience pack derives what its operator cannot judge, `method:clone` what the source site already answers; a clone × marketer run needs both. Every other unrecognised stage key keeps one owner |

Plus **top-level declarations** that are not per-stage: `detect` · `variables` · `workspace` ·
`repo_setup` · `repo_topology` · `rules` · `incompatible_with` · `dials` · `stages[]`.

**`repo_topology` is the one pack-level key that can be an OPERATOR CHOICE.** A plain string
(`"repo-per-deployable"`) means the platform has one fixed answer. The object form —
`{ default, values, operator_selectable, resolved_at, records, variants }` — means the operator
picks per repo, and **`variants` carries what each choice CHANGES**: a per-value patch, deep-merged
by `resolve-packs.mjs --topology <v>` over the pack's own `workspace` / `repo_setup`, so a brief
carries **one** resolved answer. That merge is the point: **a stage must never branch on the
topology itself** — reading the value and picking its own layout is the second resolution path
`platform-pack.md` § 6 forbids. `checkPackShape` therefore ERRORs on a listed value with no
variant, a `default` outside `values`, a patch aimed at a key no brief carries, and
`operator_selectable` with fewer than two values. Without those, a declared choice that reaches
no stage validates perfectly green — which is the state this key sat in for a year (BACKLOG 22).
Glossary: § "Repo topology".

**Anything else a stage declares carries through verbatim** as a per-stage `declaration`, with
provenance and the same one-owner rule — `visual_harness`, `requires_smoke`, `owns_final_gate`,
`fixture_gates`, `blocking_inputs` are all of this shape. This is deliberate: a merger that drops
what it does not recognise produces a brief missing exactly the thing the pack was written to say,
and **nothing reports it**. The first three keys ever added this way all vanished before the fix.

### `slots` is the fifth kind, and it was not optional

`scaffold`, `definition_of_done` and `constraints` are none of the other four: not a skill list, not
an append to a core-owned list, not an ordered step sequence, and not a whole-body replacement. They
are **named values a stage renders inline**. Trying to force them into `overrides` would mean
overriding `/implement` wholesale to change one sentence, which defeats the point.

### `variables` — packs need run-scoped values, not just constants

`content-sdk` interpolates `{router}` into 11 skill names; `marketplace` selects its scaffold command
by `mode`. Both are resolved per run (detected or asked), not fixed by the pack. A pack therefore
declares the *variable and how to resolve it*, and may interpolate it.

### `pack_level_scope` — which STAGES carry a pack-level key

A pack-level declaration (`workspace`, `repo_setup`, `repo_topology`, `gate_presentation`, …) is one
answer per pack, and by default it is rendered into **every** stage brief. That default is
deliberate: before 2026-08-24 these keys were structurally absent from every brief and the stage
prose citing them resolved to nothing, so **default-in** is the safe direction — the failure mode of
default-out is silently dropping law.

But default-in has a cost, and the rendered-brief baseline made it visible: `content-sdk` was
emitting its whole `repo_topology` + `repo_setup` block into all 19 core stages, `/research` and
`/probe` included, so every non-default topology variant differed from its default by the *same
constant 33 lines*.

```json
"pack_level_scope": {
  "repo_topology": ["create-prd", "create-frd", "create-bug", "implement", "ship",
                    "discover-sitecoreai", "provision-sitecoreai", "publish"],
  "repo_setup":    ["…same…"]
}
```

Absent = every stage. Union across packs (like `rules[]`, unlike slots): a stage either pack admits
gets the key. `resolve-packs.mjs` ERRORs on a scope over a key the pack does not declare, over a key
that is not pack-level, or naming a stage that is neither core nor pack-owned — and **WARNs when the
list covers every known stage**, because that reads as a deliberate narrowing while narrowing
nothing.

> **Derive the list, never reason it.** Grep the stage bodies for the key. A first draft of the
> list above was picked by judgement and would have dropped **`publish`**, which really does read
> `repo_setup.topology` to choose the Vercel Root Directory; meanwhile `architect`, `code-review`
> and `test` cite it only to *pass* `--topology` on the resolve line — they need the flag, not the
> block. `workspace` is deliberately unscoped: it carries the container path, which nearly every
> stage needs.

---

## Who may override what

| Kind | May override |
|------|--------------|
| `platform` | build / deploy / release **stages** |
| `method` | intake / spec / design **stages** |
| `audience` | **templates only — never a stage body** |
| `source` | **nothing** — additions, skills, hooks, constraints and new declaration keys only |

**This range table is necessary but NOT sufficient, and tranche 1 proved it.** The ranges make two
packs overriding the same *stage body* impossible. They do **not** stop two packs claiming the same
**slot** on a stage both legitimately touch — `method:clone` and `platform:content-sdk` both have a
stake in `/implement`, which the plan itself states (*"Both touch `/implement`"*).
F4 and the rule that closes it:

### Slot ownership — one owner per slot, per stage

Same shape as the existing one-owner-per-dial rule.

| Slot | Owner | Other kinds contribute via |
|------|-------|----------------------------|
| `scaffold` | `platform` | — |
| `definition_of_done` | `platform` | `additions.definition_of_done_addenda[]` |
| `generated_artifacts` | `platform` | — |
| `preflight_credentials` | `platform` | — (it is a slot, never an anchor) |
| `constraints` | *any — concatenates* | (a list, so no conflict) |
| `exit_criteria` | `method` | `additions.exit_criteria_addenda[]` |
| `workspace` · `repo_setup` | `platform` | — |

The validator errors when two active packs declare the same owned slot.

### Scope-dial ownership (unchanged from the plan)

| Dial | Owner |
|------|-------|
| `ui_variants` · `rigor` | `method` |
| `content_authoring` · `imagery` · `delivery_loop` · `delivery_parallelism` | `platform` |
| `gates` · `output_verbosity` · `docs_at_ship` · `external_reference` · `track` | `audience` |

**Owned by a kind ≠ set by the active pack of that kind.** `ui_variants` and `rigor` are `method`-owned,
and `method:greenfield` sets neither — so on a greenfield run they take engine defaults with nobody
asked. That is invisible under `audience:marketer`, whose `never_surface` includes the scope dial. The
audience pack **cannot** fix it by claiming them (one-owner; `resolve-packs --check` rejects it — tried
2026-08-27). Recorded in `audience/marketer/pack.json` → `derived_disclosure.unowned_note` as an open
gap rather than papered over, because a disclosure sentence for a value no pack sets would be a promise
nobody is keeping.

### `derived_disclosure` — an audience that HIDES a decision must be able to say what it decided

An `audience` pack whose `vocabulary.never_surface` includes *"the scope dial"* declares
**`derived_disclosure`**: one plain-language sentence per decision it makes without asking, keyed by the
dial name or the `derives_instead_of_asking` `derive` string, with **`null`** meaning *"no
operator-visible consequence"* (a declared answer, not a gap — the `overrides_section_map.null_means`
convention). It is a `PACK_LEVEL_KEY`, so it reaches the intake stage **through the brief** — the stage
that renders it is the one forbidden from opening `pack.json` (platform-pack.md § 6).

**Voice rule:** disclose the *experience*, never the mechanism — "you will be shown two designs", not
`ui_variants: 2`. If a sentence needs the mechanism to make sense, `null` is the honest answer.

Enforced by `__tests__/derived-disclosure-contract.test.mjs` in **both** directions: an undisclosed
decision fails, **and** an entry naming a decision the pack no longer makes fails (a dial renamed out
from under its sentence leaves prose that still renders and still reads as true). It also asserts the
renderer exists — the named template must carry the `<!-- BEGIN/END derived-disclosure -->` markers —
because a well-formed map with no consumer is the `pack.rules[]` defect a second time.

*Why it exists:* `never_surface` and `derives_instead_of_asking` are each correct and together mean the
run is shaped by decisions the operator is never told about; `derives_instead_of_asking` records them in
the pack, for readers of the pack, who are not the operator. Measured on a prior run, 2026-08-27.

---

## Hook anchors — SEVEN

`discovery.questions` · `tranche_exit` · **`tranche_join`** · `integration_assertions` ·
`test_fixture_setup` · `ship.pre_commit` · `ship.post_pr`

Two changes from the plan's list of eight:

- **`tranche_join` added** — the parallel-tranche join is a distinct anchor from tranche exit. A
  worktree cannot run integration-scoped work, so map regeneration and deferred shared-tenant
  writes land at the join, not at exit (F8).
- **`scaffold` and `preflight_credentials` removed** — they are **slots**, not anchors, and a name
  cannot be both. A slot is data the stage applies at a point it already owns; an anchor is an
  ordered list the stage splices in. Listing a name in both leaves a pack no way to know where to
  declare it and a command no way to know where to read it.

**Both directions are enforced.** Declaring a slot name under `hooks` errors; declaring an anchor as
a bare stage key errors too — the latter would fall through to `declarations` and never reach the
brief's hook section, so the command would read `hooks.<anchor>` and silently find nothing. That
mistake was made in two real packs the hour the rule landed.

---

## `extends` — same kind only

```
content-sdk (abstract)
├── content-sdk-next      scaffold: create-content-sdk-app
├── content-sdk-dotnet
└── content-sdk-angular
```

Merge is boring: `additions` concatenate · scalars and slots override · templates override.

**Land it in the tranche-1 schema.** `extends` changes merge semantics and touches every pack's
resolution, so retrofitting means reopening every `pack.json`. (A *dimension*, by contrast, is cheap
to add later — it changes slot resolution plus one validator rule. That is why `audience` is a
documented seam here and not a built one.)

---

## What is machine-checkable, and what is not

**Load-bearing, and it bounds the whole test protocol.** A pack's contents split three ways:

| | Example | Checkable? |
|---|---|---|
| **Structural** | `skill` names resolve · `file:` paths exist · one owner per slot · `extends` resolves · `incompatible_with` respected | **Yes** — validator |
| **Declared-set** | *which* skills a stage may load, all hook steps, all assertions | **Yes** — golden snapshot diff |
| **Predicates** | `when: "the tranche creates or modifies ANY Sitecore schema"` | **No** — model-evaluated prose |

So a golden snapshot compares the **declared** set, never the **resolved** one. A pack that declares
a skill with an unreachable predicate looks identical to one that loads it every time. Predicates
are prose in a data slot — the packs make them *visible and reviewable in one place*, which is the
gain; they do not make them executable.

---

## Brief coverage — a resolved brief leaves a stamp

A stage brief is only worth what a stage actually reads, and until 2026-09-02 nothing recorded
whether a stage had resolved one. `platform:marketplace`'s first end-to-end run resolved **5 of the
9** stages its pack declares content for: `/code-review` and `/test` were driven as hand-written
sub-agent prompts rather than as the stage commands, so their briefs were never composed — skipping
`/test`'s `live-walkthrough` axis (declared MANDATORY before `shipped`), its `blocking_inputs`, and
`/code-review`'s two CRITICAL-severity SDK skills. Nothing failed.

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage <s> \
  --record <product>/project-planning/workflow --md          # composes AND stamps
node .agent/scripts/check-brief-coverage.mjs --workflow <product>/project-planning/workflow
```

- **`--record` stamps `packs.briefs_resolved[] = { stage, at, composition, active, topology }`**
  through `manifest-write.mjs` — array-append, both manifest files, no clobber. It lives **inside
  the composition path**, so a stamp cannot exist unless the brief was really composed; an agent
  cannot assert it. It refuses to stamp a composition that produced an ERROR finding, because a
  stamp over a broken brief would make the gate green on exactly the runs it exists to catch.
- **`check-brief-coverage.mjs` fails** when a pack-declared stage carries neither a stamp nor a
  **reasoned** `packs.briefs_waived[] = { stage, reason }` entry. `/ship` runs it as an exit
  criterion. A stage that legitimately never ran is waived by name — silence becomes one line. A
  waiver with no reason is rejected.
- **The declared-stage list is derived from the composition**, never hand-kept, so a pack that gains
  a stage is covered the day it gains it.
- **It measures composition, not obedience.** Coverage cannot know whether a brief was *followed* —
  only whether it was ever *asked for*. It closes the "never asked" hole and not the "asked and
  ignored" one. Say so rather than letting a green run be read as the stronger claim.

## Status vocabulary

`status: "declares-today"` — the pack states current behaviour verbatim, for snapshot comparison.
Nothing reads it. Any deviation from the command prose is a **bug in the pack**, not an improvement.
