# Pack resolution (mandatory for all intake commands)

Every run resolves **one value per dimension**, once, at **step 0 of intake** — before the scope
dial and before the discovery grill. The resolved triple is recorded in the run manifest and
**inherited unchanged** by every downstream stage.

```
platform:  what you BUILD ON            content-sdk | marketplace | none
method:    where the SPEC comes from    greenfield  | clone
audience:  WHO operates it              developer   | marketer
```

The contract for what a pack may declare is **`.agent/packs/README.md`**. This file is the
**resolution** contract: when the question is asked, how it is answered, and what is recorded.

> **STATUS — LOAD-BEARING** (since tranche 5, 2026-08-22). Resolution is recorded **and read**: every
> stage-shaped command resolves a brief from the triple, six stages and three agents live inside
> packs, and the validator errors on a contract violation. The § 5 effects below are live, not
> planned. **The legacy `platform_target` field is RETIRED (2026-08-23)** — M0 does not write it and
> no stage reads it for behaviour. It survives only at rung 2 below, as a one-way migration read.

---

## 1. Why step 0 and not step 3

The platform was once resolved at the **discovery-summary checkpoint** — *after* the scope dial had
already been asked. That ordering was backwards and it showed:

- `content_authoring` is *defined* in terms of the platform, and survived only because its `auto`
  value defers evaluation.
- `imagery` and `ui_variants` have no such escape. Under `method: clone`, `ui_variants` is
  structurally meaningless — the source site **is** the design.

So the dial asks platform-dependent questions before the platform is known. Moving resolution to
step 0 lets the dial be **pack-filtered** (see § 5) instead of asking questions that cannot apply.

---

## 2. The ladder — inherit → detect → ask

**First hit wins. An existing product never re-answers this.**

| # | Source | When it fires |
|---|--------|---------------|
| 1 | **Inherit** — `packs` in the product's most recent run manifest | any run against an existing product |
| 2 | **Inherit (legacy)** — derive from `platform_target` in the most recent manifest | pre-pack manifests: `content-sdk` → `platform:content-sdk`, `marketplace` → `platform:marketplace`, `other` → `platform:none`; `source.analysis_mode == "rebuild"` → `method:clone` |
| 3 | **Detect** — the active packs' `detect.signals` against the codebase | new product with an existing tree |
| 4 | **Ask** — ONE `AskUserQuestion`, two slots | new product, no signal, or an ambiguous detect |

**Detection is per-pack data, never a hardcoded list.** Each pack declares its own
`detect.signals[]` with a `confidence` of `strong` or `corroborating`. A `strong` signal alone
resolves; **`corroborating` signals alone never do** — `.sitecore/` or `sitecore.config.ts` without
a Content SDK dependency is not enough.

**Ambiguity stops, it does not guess.** Two `strong` signals from different packs (both SDKs in one
`package.json`), or a strong signal whose scaffold artifacts are missing → **ask**. Never pick the
first match.

---

## 3. What gets recorded

Written by M0 via `manifest-write.mjs` (never a hand-dumped manifest copy):

```json
{
  "packs": {
    "platform": "content-sdk",
    "method": "greenfield",
    "audience": "developer",
    "resolved_by": "inherit | inherit-legacy | detect | ask",
    "resolved_at": "intake-step-0",
    "signals": ["package.json has @sitecore-content-sdk/*"]
  }
}
```

**Nothing else is written.** The legacy `platform_target` field was a transitional duplicate of
`packs.platform` and is **retired (2026-08-23)** — M0 does not write it, no stage branches on it, and
the manifest template no longer carries it. **Rung 2 above still READS it**, which is the whole
migration path: a product whose last run predates the packs resolves its composition from that field
once, and the run writes a proper `packs` block on top. A read for migration is not a source of truth.

**The nulls are recorded explicitly**, never omitted — `"platform": "none"` means *resolved, and the
answer is none*, which an absent key cannot say.

---

## 4. `/rubber-ducky` is excluded

Divergent exploration would be contradicted by a premature platform lock, and the idea may genuinely
not have one yet. Ducky may record a **hint** into the brain-dump; the intake command resolves it.
An intake command reading a Ducky hint treats it as a *detect* signal, never as an inherit.

---

## 5. What resolution changes downstream

| Moment | Effect |
|--------|--------|
| **M1 — scope dial** | pack-filtered: drop dials no active pack can use (`ui_variants` under `method:clone`; `content_authoring` + `imagery` off Content SDK) and apply any `pack.dials` preset. Net: **fewer** questions, not more |
| **M2 — discovery grill** | platform packs **add** questions to the set; `method:clone` **replaces** the greenfield set. Same `rigor` budget either way |
| **M3 — summary checkpoint** | the confirmation now covers platform + method too |
| **M4–M8** | unchanged — the same five gate tokens |

**A pack may never add a gate token.** It may add a stage that *carries* `go_live`; it can never
invent a sixth token or a stop the operator cannot untick (locked decision 7).

---

## 6. Tooling

```sh
node .agent/scripts/resolve-packs.mjs --list                              # what exists
node .agent/scripts/resolve-packs.mjs --platform content-sdk --method clone --audience developer --stage implement --json
node .agent/scripts/resolve-packs.mjs --check                             # every combination
node .agent/scripts/resolve-packs.mjs --platform content-sdk --method greenfield --audience developer --stage ship --topology monorepo --md
```

**`--topology` — pass the run's recorded value on EVERY resolution, at every stage.** Where a
platform declares `repo_topology` with more than one value, the operator chose one at intake and it
is in the manifest as `repo_topology`. The resolver merges that choice into `workspace` and
`repo_setup` and hands back **one** resolved answer — the layout, the git root, the branch-naming
rule and the build descriptor all differ between topologies. Omit the flag and the brief silently
resolves the *default*, so a `monorepo` run reads repo-per-deployable paths while every gate stays
green. **A stage must never branch on the topology itself**: read the resolved `workspace` /
`repo_setup` and apply them verbatim. Reading `repo_topology` and picking your own layout is the
second resolution path § 6 forbids — and it is exactly how `/create-prd` and `/provision-sitecoreai`
came to hardcode `repo-per-deployable` while the pack said the choice existed (BACKLOG item 22).
A single-valued (string) declaration means the platform is fixed; passing `--topology` against one
is an ERROR, not a no-op.

> **Who runs this matters.** `resolve-packs.mjs` needs Bash, and the Product Manager (02),
> Lead Developer (06) and Doc Writer (09) **do not hold it**. Where this stage spawns one of
> them, the **orchestrator resolves the brief and passes it down in the spawn prompt** — the
> same relay the interrogation protocol already uses when a spawned agent lacks
> `AskUserQuestion`. Frontmatter `tools:` is intent, not a runtime guarantee: **check, don't
> assume.** A spawned agent that cannot run the command must say so and use the relayed brief,
> never reconstruct a composition by reading `pack.json` files — that is the second resolution
> path `platform-pack.md` § 6 forbids, and a real run hit exactly this on 2026-08-24.


The resolver is the **one** implementation of the merge rules — the validator (§ J), the CLI and the
golden harness all call it. Do not re-derive a composition by reading `pack.json` files by hand.

**10 combinations are runnable, `marketplace × clone` is refused** (`incompatible_with` — cloning a
public website into a Cloud Portal extension app is not a coherent target). All four packs exist, so
**all 10 are live** — `audience:marketer` shipped in tranche 8 and this line previously said the real
count was 6.
