# Decisions — <Product Name>

Why this code is shaped the way it is, at **component grain**. Source files link
here instead of carrying the reasoning inline (rule `87-comment-economy.mdc`).

**What belongs here.** A decision a future reader could not recover from the code:
an approach that was **rejected** for a reason the shipped code does not show, a
non-obvious SDK / Edge / browser constraint that forced the shape, or a
measurement that settled a question. Routine implementation gets nothing.

**What does NOT belong here.** Architecture decisions with system-wide
consequences — those are ADRs (`project-planning/ADR/`), one per file. Full
review findings — those live in `project-planning/plans/code-review-*.md`
(tracked). Task status, tranche bookkeeping, or anything `STATUS.md` owns.

**Not to be confused with `docs/decisions.md`**, which is the ADR reader's index
and is **regenerated wholesale by `/document`** — anything written there is
overwritten on the next heavy doc pass. This file is hand-maintained and
append-mostly; `/document` does not touch it.

**Anchors are a contract.** Source comments point at `{#slug}` anchors. Renaming
one silently breaks every pointer, so treat a slug as permanent — add a new entry
and mark the old one superseded rather than rewriting it in place.

---

## Components

### <ComponentName> — <the claim in a few words> {#componentname-slug}

**Decision.** One or two sentences: what the code does, stated as a choice.

**Rejected.** What the obvious approach was and the concrete reason it failed —
the measurement, the error, the constraint. Not "it was cleaner this way".

**Verified.** How it was confirmed: real browser, real tenant, a captured
payload under `project-planning/captures/`, a named test. If it was never
verified independently, say so — an unverified decision recorded as settled is
worse than no entry.

**Trace.** `project-planning/plans/code-review-<timestamp>.md` (optional; for the
full finding-by-finding detail).

---

## Cross-cutting

Decisions that shape more than one component but are still below ADR grain —
a shared helper's contract, a token naming convention, a routing quirk the whole
app has to respect.

### <Topic> {#topic-slug}

Same four parts.
