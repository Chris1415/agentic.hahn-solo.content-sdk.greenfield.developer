# Tasks — <product>

<!--
INTAKE QUEUE for this product. One file per product at project-planning/tasks.md (committed).
Each entry = ONE prospective pipeline run (a bug, a feature→FRD, or a prd). `/triage` reads this
file, offers the next `todo`, and routes the chosen item into /create-bug | /create-frd | /create-prd.

THIS IS NOT:
- The research `initiatives.md` — those are JPD-altitude BETS the research pipeline proposes.
  Promote an initiative INTO this file as a concrete work item (its initiative id becomes the
  task's source). See `.agent/glossary.md` § "Initiative register" and § "Intake queue".
- A granular subtask list — granular tasks (T001, T002, …) live in the task-breakdown produced
  AFTER /create-*. One entry here yields one intake doc, not many tasks.

UNLIKE STATUS.md this file is operator/automation-WRITTEN and may be hand-edited. `/triage`
updates `status` / `spawned_as` in place when it picks an item; on ship the entry moves to ## Closed.

ENTRY FIELDS
- id        — TASK-NNN, stable, never reused. Resolve NNN as highest existing + 1.
- type      — bug | feature | prd   (feature maps to the FRD weight; see § "Work item type")
- status    — todo → in_progress → done   ( / blocked / wont_do )
- priority  — high | medium | low
- source    — local | github#<issue-number>
- created   — YYYY-MM-DD (absolute date)
- spawned_as — the bug-/frd-/prd-NNN artifact + branch, written by /triage on promotion (— until then)

Then a type-specific body (see the per-type skeletons below — keep only the one that matches `type`).
-->

## Open

<!-- ────────────────────────────────────────────────────────────────────────
EXAMPLE — bug entry (delete this block; copy the skeleton for real entries)

### TASK-001 — Example list drops the last row on reload
- **type:** bug · **status:** todo · **priority:** high
- **source:** local · **created:** 2026-06-20 · **spawned_as:** —

**What's broken:** a settings table shows N-1 rows after a hard refresh.
**Steps to reproduce:** 1. open /settings  2. add a row  3. hard-refresh.
**Current:** last row missing. **Expected:** all rows persist.
**Env / route:** content-sdk, /settings, tenant `example-tenant`.
**Root-cause hypothesis (optional):** off-by-one in the page-fetch loop.
──────────────────────────────────────────────────────────────────────── -->

### TASK-NNN — <title>
- **type:** bug · **status:** todo · **priority:** <high|medium|low>
- **source:** local · **created:** <YYYY-MM-DD> · **spawned_as:** —

<!-- bug body — seeds /create-bug capture:
**What's broken:** …
**Steps to reproduce:** 1. … 2. …
**Current:** … **Expected:** …
**Env / route:** composition (platform/method/audience), versions, tenant/host, route
**Root-cause hypothesis (optional):** …

feature body — seeds /create-frd discovery:
**User value:** as <who> I want <what> so that <why>.
**Scope bound:** in: … · out: …
**Acceptance hint:** the one observable that proves it works.

prd body — seeds /create-prd discovery:
**Problem:** …
**Goal:** …
**Rough scope / phases:** …
**Why now:** …
-->

## Closed

<!-- Picked-up items land here once shipped (or marked wont_do), newest first.
Keep the one-liner + the spawned_as link so the queue stays an audit trail.

### TASK-000 — <title>   (done → bug-003 @ branch bug-003, 2026-06-19)
-->
