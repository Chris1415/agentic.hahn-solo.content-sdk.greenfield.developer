---
name: start-flow
intent: intake
writes:
  - nothing directly — this command RESOLVES and DISPATCHES; the chosen /create-* writes everything
depends_on:
  - .agent/commands/project/platform-pack.md
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/dev-flow/02-create-prd.md
  - .agent/commands/project/dev-flow/02a-create-frd.md
  - .agent/commands/project/dev-flow/02b-create-bug.md
  - .agent/glossary.md
---

# /start-flow — The front door for NEW work

## What this is

**One entry point for work that arrives as a prompt.** It resolves the pack composition, asks which
weight of the engine to run, and dispatches to `/create-prd`, `/create-frd` or `/create-bug` with
your prompt carried through. It writes nothing itself.

```sh
/start-flow rebuild acme.com as a Content SDK site
/start-flow                       # no prompt: it asks for one
```

**It is the twin of `/triage`, not a replacement.** `/triage` routes work that already exists in a
source (`tasks.md`, GitHub issues) — and by construction it cannot start a **new product**, because
both its sources live *inside* a product. `/start-flow` covers exactly that gap: work described in a
sentence, including work for a product that does not exist yet.

**It is a ROUTER, not a fourth intake weight.** It introduces no artifact, no manifest field and no
second resolution path. Everything it decides, an existing contract already owns.

## Why a router and not a fourth weight

The three weights are a real discrimination (`.agent/glossary.md` § "Work item type") and the
pipeline's keystone is *same artifact slots, different fill*. A fourth door that wrote its own
intermediate artifact would break that for no gain. And a second implementation of pack resolution
would drift from the one in the intake commands — measured as a real failure mode on 2026-08-23,
where one contract with two readers produced two different records.

So: **resolve by delegating, ask what cannot be derived, hand off.**

---

## Steps

### 1. Get the prompt

Use the argument if given. If absent, ask for it in one question — a sentence or two describing the
work. Do not start an interrogation here; the chosen `/create-*` runs the real discovery grill under
its own `rigor` budget.

### 2. Resolve the product

Per `product-workspace.md` § 1a/1b. Two cases:

- **Existing product** — resolve it and read its most recent run manifest.
- **New product** — nothing exists yet. Do not create anything; the chosen `/create-*` owns product
  bootstrap (`/create-prd` § 10a). Carry forward the fact that it is new, since it decides the
  M0 rung below.

### 3. Resolve the composition — DELEGATE to M0

Run the ladder exactly as `.agent/commands/project/platform-pack.md` § 2 defines it: **inherit →
inherit-legacy → detect → ask**. Do not re-implement it and do not shortcut it.

```sh
node .agent/scripts/resolve-packs.mjs --list          # what packs exist
node .agent/scripts/resolve-packs.mjs --check         # every runnable combination
```

A **new** product has nothing to inherit and usually nothing to detect, so it lands on the `ask`
rung — which is the normal, correct outcome here, not a failure.

**Do not persist anything.** M0 resolves at intake step 0 and **persists at step 17**, inside the
`/create-*` run, where the manifest is created from the template. Pass the triple forward; let the
intake command record it.

**The first write goes through the script too.** `manifest-write.mjs` is read-merge-write, so the
intake command seeds the pair with `--init --run-id <id>` rather than hand-writing the JSON:

```sh
node .agent/scripts/manifest-write.mjs \
  --workflow <product>/project-planning/workflow --init --run-id <id> <<'JSON'
{ "work_item_type": "frd", "packs": { } }
JSON
```

**The patch is a HEREDOC, not `< patch.json`.** A patch file crossing a runtime boundary is
the one way this write goes silently wrong: `/tmp` is two different directories here (Node reads
it under the drive root, Git Bash under the user temp dir), so a file written from Node and read
back through a Bash redirect is a *different*, older file — non-empty, valid JSON, and merged
without complaint into a plausible duplicate `stage_history` entry. Measured twice in one run,
2026-09-26/27. A heredoc has no path to disagree about; where a file is genuinely needed, pass
`--patch-file <ABSOLUTE path>` so **Node** resolves it, never a shell redirect.

`--init` seeds from `.agent/manifests/run-manifest.template.json`, applies the patch on top, nulls
every field still holding a `<placeholder>` and names them, and **refuses to seed over an existing
manifest**. Hand-seeding is how a run ends up with a manifest no schema ever checked — seven runs
did it before the flag was wired (it was declared 2026-08-26 and left inert until 2026-08-27).

### 4. Ask — the composition, then the weight

**One `AskUserQuestion` call.** How many questions depends on whether there is anything to inherit;
the weight is **always** one of them.

#### 4a. The composition — ask COLD for a new product, CONFIRM for an existing one

**New product (nothing to inherit, nothing to detect) — ask all three outright.** There is no prior
answer, so presenting a guess as an answer would be inventing one:

| Question | Options |
|---|---|
| **Platform** — what are you building on? | `content-sdk` · `marketplace` · `none` |
| **Method** — where does the spec come from? | `greenfield` · `clone` (rebuilding an existing site) |
| **Audience** — who operates this run? | `developer` · `marketer` |

Offer only combinations `resolve-packs.mjs --check` reports as **runnable** — `marketplace × clone`
is declared incompatible and must not appear as a choice.

**Existing product — show what M0 resolved, and let it be changed in the same question.** One
question, not three: the triple, the **rung** it came from, and its evidence.

> *Composition: `content-sdk × greenfield × developer` — inherited from run `prd-004`.*
> → **Use this** / **Change it**

Name the rung explicitly. An **inherited** value is the one most likely to be silently wrong, because
it is right until the product's shape changes and nothing announces that it has. A **detected** value
should show the signal it matched. *"Change it"* falls through to the three cold questions above.

**Never re-interrogate a settled product.** The ladder exists so an existing product does not
re-answer; asking cold every time would invite a careless click to override a correct inherited value
with a wrong one.

#### 4b. The weight — always asked

Never derived, never defaulted, never skipped — including when the prompt makes it look obvious.

| Option | Use when |
|---|---|
| **Bug** | The behaviour is already supposed to exist and is broken. A contained fix. |
| **Feature (FRD)** | One bounded new capability on a product that already exists. |
| **PRD** | A new product, or a change big enough to need architecture and multiple tranches. |

Give each option the one-line test above, not just its name — the discriminator is *intent × magnitude*
(§ "Work item type"), and an operator picking blind picks by vocabulary instead.

> **Why the weight is always asked.** It could be derived — the prompt usually implies it, and the
> promotion machinery (bug → FRD → PRD) exists precisely to correct a wrong start. That was the
> original design and it was **overruled deliberately by the operator on 2026-08-23**: promotion
> repairs the *artifact*, but the framing has already shaped the discovery grill, the scope dial and
> the branch by the time a valve fires. One question at the door is cheaper than a re-frame, and this
> is a door the operator is standing at anyway.

**Under `fully_autonomous` there is no operator to ask.** In that case do not guess: stop and say the
weight is unresolved. A router that guesses silently is the failure this command was written to
avoid.

### 5. Dispatch

Invoke the chosen command with the prompt, the resolved triple and the product:

- **Bug** → `/create-bug` · **Feature** → `/create-frd` · **PRD** → `/create-prd`

Say which one you are running and why, in one line, before you hand off. Then **stop being the
router** — the intake command owns everything from here, including its own operator gates.

### 6. The weight stays provisional

Choosing at the door does **not** lock it in. Both promotion triggers stay live: `/create-bug`'s
not-contained valve and `/create-frd`'s scope-balloon trigger (§ "Type promotion"). A picked weight
is a starting frame, not a verdict — if the work turns out bigger, promotion carries the content
forward and never restarts.

---

## Output rules

- **Operator gate — SOFT.** This command asks its two questions and dispatches. It holds no gate
  token of its own; the gates belong to the stages it dispatches into (§ "Operator Gate").
- Report in three lines: the composition (and its rung), the weight (and that you asked), and the
  command you are dispatching to.
- **Critical triggers:** no runnable combination for the resolved triple (`--check` says `skip`); an
  ambiguous detect the operator declines to resolve; a weight question that cannot be asked because
  **nobody is reachable**. All three stop rather than guess.

  **"Nobody is reachable" is broader than `fully_autonomous`** (corrected 2026-08-27). This trigger
  was phrased around that one value, which is the exact conflation
  `interrogation-protocol.md` corrected on 2026-08-05 and again on 2026-08-26: a single gate off
  describes an operator who wants fewer interruptions, while an **unattended** run — a harness, CI,
  a scheduled trigger — has gates ON and still nobody to answer. Under the old phrasing such a run
  would stop dead with no sanctioned way to record why. It now stops the same way, but records
  `discovery_mode: "unattended"` and the unasked weight in `operator_attention[]` first.

  **The weight is the one thing this command will not derive** — that is the standing rule, and an
  absent operator does not relax it. A wrong weight silently changes the artifact set, the gate
  count and the stage list, and every one of those looks correct in isolation. Stopping is cheap;
  a bug re-classified as a PRD is not.
