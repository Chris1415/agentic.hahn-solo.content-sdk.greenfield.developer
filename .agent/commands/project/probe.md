---
name: probe
intent: probe
writes: []
depends_on:
  - .agent/agents/team/03-research-sidecar.md
  - .agent/agents/team/08-developer.md
  - .agent/rules/70-probe-and-tranche.mdc
---

# /probe — Reality-check an assumption before you build on it

## Goal

Confirm or refute a single **load-bearing assumption** against the real world and return a verdict (**confirmed / refuted / needs-more**) with evidence. A probe is cheap; building on a wrong assumption is not (rule `70-probe-and-tranche.mdc`). Use `/probe` standalone whenever an assumption surfaces in freeform, OR as the executor of a 🔍 **probe tranche** at the front of an architecture / implementation plan.

See `.agent/glossary.md` § "Probe" and § "Tranche" for the full contract.

## Two modes

| Mode | Claim shape | Executor | What it does |
|------|-------------|----------|--------------|
| **knowledge** | library / version / concept ("Next 16 replaced `middleware` with `proxy.ts`") | Research Sidecar (03) | source-grounded verification (npm, GitHub, `.d.ts`, docs) — no code run |
| **empirical** | API / tenant / data / runtime ("this tenant's Edge endpoint returns field X") | Developer (08) | constrained throwaway spike: disposable code in a scratch dir, hit the real thing, capture the wire |

Mode is auto-detected from the claim and overridable with `mode=`.

## Inputs

Free-form args, parsed in this order:

1. **Explicit flags** (any subset):
   - `mode=knowledge|empirical` — overrides auto-detection.
   - `target=<endpoint | tenant | file | url>` — the concrete thing to probe (empirical).
   - `write_to=<repo-relative path>` — override the default persistence location.
   - `context="<one sentence>"` — why you're asking (shapes the probe and the verdict).
2. **Remaining free text** — the **assumption stated as a falsifiable claim**. If the operator gave a vague topic instead of a claim, ask one question to turn it into a falsifiable statement before probing.
3. **No args** — ask: *"What assumption should I probe? State it as a claim I can confirm or refute, and (optional) the target — an endpoint, tenant, file, or library."* Wait; do not spawn on a half-formed claim.

## Steps

1. **Parse + classify.** Resolve the claim, `mode` (auto-detect if absent), `target`, `context`. A claim about a named library/version/concept → `knowledge`; a claim about a live endpoint/tenant/data/runtime → `empirical`. When genuinely ambiguous, ask one clarifying question rather than guessing the mode.
2. **Resolve product/run context.** Per `product-workspace.md`, detect whether a product + run manifest exist (so the verdict can persist). In pure freeform with no product, the probe is inline unless `write_to` is given.
3. **Route to the executor — exactly one Agent call:**
   - **knowledge** → `Agent(subagent_type: "research-sidecar", …)` with the claim as the `question` and an explicit instruction to return a **confirm / refute / needs-more verdict** (not just a synthesis). Honor the sidecar's `NEED_CLARIFICATION` envelope when the claim is too vague.
   - **empirical** → `Agent(subagent_type: "developer", …)` with a **throwaway-spike task contract**: (a) write disposable probe code under `products/<slug>/project-planning/probes/scratch/` (or a temp dir in freeform) — NEVER under `site/` or any product source; (b) run it against `target`; (c) capture the wire (request + raw response, headers, status) verbatim; (d) return the verdict + the captured evidence; (e) leave no probe code in the product tree.
4. **Collect the verdict.** confirmed / refuted / needs-more + evidence (+ captured wire for empirical).

   **Every verdict also carries `path_verified` (rule `70` § "A probe must exercise the CALL PATH THAT SHIPS").** Before recording `confirmed`, state the probe's transport + credential and the widest input class it sent, and compare both against what the app will actually do:
   - **`shipping`** — the probe used the same route and credential the app uses, and the decision does not generalise past what was sent.
   - **`contract_only`** — anything else. An out-of-band bearer token where the app is portal-brokered; a server call where the app calls from the browser; one instance of a category where the app will send the whole category. **`contract_only` is still a useful verdict — it is not a licence to build the dependent tranche unguarded.** Name the residual gap and how the plan closes it, normally by making the first real call EARLY rather than at the end.

   Measured cost of not doing this (a Marketplace build, 2026-09-01/02): a bearer-token probe and a types gate both passed while `sitecoreContextId` — optional in the types, required at runtime — was missing from every portal-brokered call; and a `pages.context` probe that only ever passed a **page** id was generalised into a decision that shipped a **datasource** id, producing a live error page. Both CRITICAL, both `confirmed` at the time.
5. **Persist (when a run context exists).** Write `products/<slug>/project-planning/probes/probe-NNN.md` (claim, mode, target, verdict, evidence, recommendation, ISO timestamp). In freeform, honor `write_to` or stay inline.
6. **Surface + confirm (the operator gate).** Render the verdict prominently. When run as a probe tranche (a plan depends on this), put the verdict in the **Operator Checkpoint** and end with an explicit **go/no-go**:
   - `confirmed` → "Recommended: proceed to the dependent tranche."
   - `refuted` → surface the three exits as recommendations — **cancel** (a success outcome), **promote/split**, or **redesign** — and ask the operator to confirm the call. Do NOT auto-proceed.
   - `needs-more` → state what additional probe would resolve it; ask whether to run it.
   Standalone freeform probes still report the verdict but do not force a stop.

## When to use this vs. neighbors

| Situation | Use |
|-----------|-----|
| An assumption is load-bearing and you haven't seen it true against the real thing | `/probe` |
| You want a decision-grade synthesis of an open question (no verdict needed) | `/research` (Research Sidecar) |
| You need to prove your OWN code's behavior | a RED test (`30-tdd.mdc`), not a probe |
| Something already broke in runtime and you need the wire | the Architect's wire-level-evidence step (`/architect`) |

## Validation

- Exactly one routing `Agent` call (one sidecar OR one developer-spike — never both, never nested).
- Empirical probe wrote NO code under `site/` or product source — only the scratch/probes dir; nothing left behind in the product tree.
- The verdict is one of confirmed / refuted / needs-more, with evidence (and captured wire for empirical).
- **The verdict carries `path_verified: shipping | contract_only`**, with the probe's transport + credential and its input class named. A `confirmed` with no `path_verified` is incomplete — that omission is exactly how two CRITICALs shipped past a green probe.
- A `refuted` probe run as a tranche ended with an operator go/no-go, not a silent proceed.
- If a run context existed, `probe-NNN.md` exists at the claimed path.

## Output rules

- Lead with the **verdict**, then the evidence. Do not bury it.
- A refuted assumption is a **win**, not a failure — frame cancel/split/redesign as legitimate, even preferred, outcomes (rule 70).
- Do NOT let an empirical probe's throwaway spike code land in the product source tree.
- Do NOT continue past a refuted probe tranche without explicit operator confirmation.
