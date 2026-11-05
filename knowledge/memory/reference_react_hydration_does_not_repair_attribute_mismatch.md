---
name: reference_react_hydration_does_not_repair_attribute_mismatch
description: React does not repair ATTRIBUTE mismatches during production hydration — route-derived attributes on statically prerendered pages never self-correct on a cold load
metadata: 
  node_type: memory
  type: reference
---

On a **statically prerendered** page in a **production** build, React does **not** repair attribute
mismatches between server markup and the client render. It assumes they agree and only warns in dev.
Element-level differences *do* get repaired; attribute-level ones do not — which is what makes this
so quiet.

**Symptom (a prior run, 2026-08-07):** the nav's `aria-current` / `is-current` never appeared on a
cold load of a static page in production. Correct in `next dev`, correct after any client-side
navigation, wrong only on a direct hit.

**The evidence was on the SERVER side**, which is why client instrumentation kept coming up clean —
`usePathname()` resolved correctly from the first render, and that was irrelevant. A fresh production
build shipped `aria-current` on **zero of 11** prerendered pages: at build time the component
computes `isCurrent === false` for every route, so the attribute is simply absent from the HTML, and
hydration never adds it.

**Remedy:** a deliberate **dual write** — declarative JSX *plus* a post-hydration `useEffect` writing
the attribute via a ref. Both halves are load-bearing; do not "tidy" the duplication away. The JSX
stays the source of truth for tests, SSR markup and future refactors; the effect is what survives
hydration.

**Generalises:** anything rendering from the current route on a statically generated page bakes its
*not-current* branch into the HTML. If the difference is an attribute, it never self-corrects.

**Residual, unfixed by the remedy:** the static HTML still ships without the markup, so
pre-hydration, no-JS and crawler views never see it.

**Check for it by grepping the build output**, not the running app:
`grep -c 'aria-current' .next/server/app/**/*.html`.
