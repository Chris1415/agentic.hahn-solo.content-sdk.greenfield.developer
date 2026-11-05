---
name: test
intent: verification
writes:
  - products/<product-slug>/project-planning/plans/test-report-<timestamp>.md
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/commands/project/platform-pack.md
  - .agent/agents/team/07-qa-specialist.md
  - .agent/agents/team/08-developer.md
  - .agent/commands/project/templates/qa.template.md
  - .agent/manifests/run-manifest.template.json
---

# /test — Comprehensive testing with automated fixes

## Pipeline position

This command is part of the development pipeline: `/prime` → `/rubber-ducky` → `/create-prd` → `/challenge-prd` → `/architect` → `/task-breakdown` → `/implement` → `/code-review` → **`/test`** → `/ship` (`/document` is on-demand, not in the canonical sequence)

**Git context:** This command runs on the feature branch. Uses `git diff` against the default branch to detect affected routes and files for testing.

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts` under that product.

## Goal

Execute a **comprehensive, critical testing pass** — both automated and manual verification — against the implementation. The QA Specialist (07) acts as a hostile tester trying to break the product. Every finding is then **fixed by the Developer Agent (08)**. This replaces the need for separate verify and QA commands by combining automated checks, manual verification, visual testing, and regression analysis in one pass.

## Mode detection (mirrors `/implement`)

| Condition | Mode | Behavior |
|-----------|------|----------|
| `current-run.json` has `implementation.mode == pipeline` AND `canonical_artifacts.task_breakdown` exists | **Pipeline** | Test against PRD acceptance criteria + § 9-10 test contract from task breakdown. Run `smoke_outcomes` gate per "Smoke outcomes and ship gating". |
| `current-run.json` has `implementation.mode == freeform` OR `prd_minimal` is null | **Freeform** | Test against the freeform task-breakdown stub's § 0 + § 1 + § 8 (formerly the runbook's role). Skip PRD-acceptance checks (no PRD). Focus on: automated suite passes, no regressions, new-behavior coverage, lint + build clean. `smoke_outcomes` is advisory only — populate from § 8 hints if any, otherwise leave empty. |
| No manifest at all | **Error** | Surface to user: "no run manifest found — run `/implement` first or pass an explicit task-breakdown path." |

The QA Specialist (07) and Developer (08) sub-agent prompts must include the resolved mode so they know whether to enforce PRD-acceptance gates.

## When to run

- **After `/code-review`** — as the final quality gate before release.
- **On demand** — any time you need a full test pass.

## Delivery loop role (rule `71-delivery-loop.mdc`)

`/test` is the **third leg of the delivery loop** (`.agent/glossary.md` § "Delivery loop") and the point where a component tranche's **exit criteria** are decided. When the Team Lead drives a **component-vertical** run, this command is invoked **scoped to one component tranche** and its outcome routes the loop:

- **Green** (full suite + lint + build pass, and any required tranche smoke is `passed`) AND `/code-review` left no unfixed Critical/Major → the tranche is **done**; the loop advances to the **next component tranche** (or, after the last component + additional-logic tranches, to the **end-of-build operator review** — see below — then `/ship`).

**End-of-build operator review (the one build-phase gate).** When this `/test` is the **end-of-build pass** (no further component / additional-logic tranches remain), it is the operator's **single** look at the whole build — presented on whatever review surface the composition's fixture produced (for a Content SDK run, the **Components Preview** page: one subpage per component, all variants — `.agent/glossary.md` § "Components Preview", and the content-sdk pack's `test` stage for the platform detail). Whether this close carries the **`build`** or the **`final`** token is decided by the `owns_final_gate` question in Output rules, not by a platform name. **Mid-loop `/test` passes** (more tranches remain, `per_component` cadence) are **soft** — never stop to have the operator eyeball the Preview page between components (rule `71`).
- **Any failure** (a test failure, or a Critical/Major that cannot be fixed cleanly in-loop) → the tranche **loops back to `/implement`** — the Developer (08) fixes, then the tranche re-reviews + re-tests.
- The loop is **bounded to 5 cycles** across implement → review → test for a tranche; the Team Lead escalates to the operator on the fifth non-green pass rather than looping indefinitely.

**Cadence — `scope_dial.delivery_loop` (rule `71` § "Cadence dial"). This command IS the dial** — it is the only leg that moves (`/code-review` stays per tranche in both cadences). The above describes the default **`per_component`** cadence (this command decides each component tranche's exit). Under **`once`**, `/test` runs a **single time over the whole build** after every component tranche is implemented **and code-reviewed clean** — the exit criteria (green suite + lint + build + any required smoke, and no unfixed Critical/Major) are evaluated for the **whole build** at once, and a failure loops back to a whole-build `/implement` fix (bounded 5). That single pass is the run's **integration gate**: it is the only real test pass, so do not scope it down — components that reviewed clean in isolation still break each other through regenerated `.sitecore` maps, shared types, routing, and theme tokens. Same exit logic, wider scope. **`parallel` runs the same shape** (one QA post-merge) regardless of this dial.

**Apply every `constraint` in the pack brief** — they bind this stage for the whole pass. Where a platform is preview-first, that means testing against the preview surface and **never publishing to make a test pass**; the published/live smoke belongs to the final `/publish` step. In a single-tranche / freeform run the loop collapses to one pass — the current behavior.

## Inputs

Resolve sources from `project-planning/workflow/current-run.json` → `canonical_artifacts` when the manifest exists. If the manifest is missing or an entry is absent, use latest in each directory; for PRD use the **latest PRD** (see `.agent/WORKFLOW.md`: highest `prd-NNN.md`, else latest-by-timestamp).

Use:
- PRD (or prd-minimal)
- architecture blueprint **or** ADRs (`project-planning/ADR/`) when `canonical_artifacts.architecture` is **`null`**
- task breakdown (§ 4c for compliance checks; § 8 What Needs To Be Tested for the global project-level test reference; § 9-10 for TDD + per-task test contract)
- **legacy schema-6 implementation runbook** (when present, `canonical_artifacts.implementation_runbook` set): supplements the task breakdown — its "What Needs To Be Tested" section overlaps with breakdown § 8
- **code review report** (when present): verify that all critical/major findings were actually fixed
- QA report (`project-planning/plans/qa-report.md`) when `canonical_artifacts.qa_report` is a path; when **`null`**, derive scope from the task breakdown only (its § 8 is the global test reference)
- POC clickdummy (`ui_design.selected_poc_path`) for visual comparison when available
- project commands and boundaries from `project-planning/plans/prime.md`, `AGENTS.md`, and relevant rules if present

**Freeform runs:** When `implementation.mode` is `freeform` in the manifest, the test pass still works — use the freeform task-breakdown stub's § 0 + § 1 + § 8 as the primary reference. Skip PRD-based acceptance criteria checks (there is no PRD). Focus on: automated test suite passes, no regressions, new behavior has test coverage, lint + build clean.

## Non-negotiables
- Treat the aligned documents as the source of truth.
- Never invent requirements, edge cases, or acceptance criteria that are not supported by the facts.
- If the source docs materially conflict, stop the test flow, list the conflicts, and ask for alignment before continuing.
- Prefer running documented validation commands over guessing.
- When a check cannot be executed, say so clearly and explain why.

## Process

### Phase 1: QA Specialist reviews and tests

**Spawn sub-agent: QA Specialist.** Spawn an isolated sub-agent. Prompt must include: read `.agent/agents/team/07-qa-specialist.md` for identity (spawn it via `Agent(subagent_type: "qa-specialist")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). **Task:** Execute a comprehensive, adversarial test pass against the implementation. You are trying to break it — find every bug, regression, and deviation from the spec.

**1a. Align the facts**
- Read the available source documents and extract the agreed scope, user flows, constraints, acceptance criteria, risks, and dependencies.
- Identify missing information or contradictions before testing.
- **Requirement coverage gate (mandatory in pipeline mode):** Read the task breakdown's **§ 10a Requirement-to-test evidence map**. For every row, verify coverage status is one of `covered`, `manual-only`, `not applicable`, or operator-accepted `deferred`. Update § 10a statuses as tests pass. Any row still `pending` after the test pass is a **Major** finding unless the operator explicitly accepts deferral in writing (record in the test report). Scale expectations by `work_item_type`: PRD = all user stories/ACs; FRD = all acceptance criteria; bug = RED test + named smoke steps.

**1b. Execute automated validation**
- Run the **full test suite** (unit, UI/component, E2E) using commands from prime.md, the runbook, or package.json scripts.
- Run lint, build, and any other validation commands specified by the source docs.
- If no explicit commands are documented, run the safest relevant project checks from the repo context.
- Capture the command, result, and important failures.

**1c. Execute manual verification**
- Verify implemented behavior against the aligned facts, not assumptions.
- Check user-facing flows, error states, empty states, permissions, data handling, and cross-feature regressions.
- For API or backend work: verify contracts, auth, input validation, failure behavior, and integration touchpoints.
- For UI work: verify usability, copy and state consistency, loading and error handling, and responsive behavior.

**1d. Visual testing (when UI exists)**

**Read the pack brief for this stage — it names the harness, the fixture and the extra axes:**

```sh
node .agent/scripts/resolve-packs.mjs --platform <p> --method <m> --audience <a> --stage test \
  --topology <the run's repo_topology, when the platform offers a choice> \
  --record <product>/project-planning/workflow --md
```

> **`--record` is not optional and it is not a separate step.** The stamp is written by the
> resolver itself, as a side effect of composing the brief, so it exists only if the brief was
> really resolved — an agent cannot assert it without doing the work. `/ship` fails when a
> pack-declared stage has neither a stamp nor a reasoned waiver
> (`.agent/scripts/check-brief-coverage.mjs`). Cause, 2026-09-02: the first full marketplace run
> resolved 5 of 9 declared stages and nothing could see the other four — including `/test`'s
> MANDATORY `live-walkthrough` axis and `/code-review`'s two CRITICAL-severity SDK skills.


> **Who runs this matters.** `resolve-packs.mjs` needs Bash, and the Product Manager (02),
> Lead Developer (06) and Doc Writer (09) **do not hold it**. Where this stage spawns one of
> them, the **orchestrator resolves the brief and passes it down in the spawn prompt** — the
> same relay the interrogation protocol already uses when a spawned agent lacks
> `AskUserQuestion`. Frontmatter `tools:` is intent, not a runtime guarantee: **check, don't
> assume.** A spawned agent that cannot run the command must say so and use the relayed brief,
> never reconstruct a composition by reading `pack.json` files — that is the second resolution
> path `platform-pack.md` § 6 forbids, and a real run hit exactly this on 2026-08-24.


**Skill-load reuse rule:** for skills `/implement` or `/code-review` already loaded earlier in the session, cite already-loaded content by name rather than re-invoking. Re-streaming the same skill within a single session is waste. Only invoke what `/test` specifically needs that prior stages did not load — the brief's `MANDATORY when` entries are the usual `/test`-only ones.

**1d-i. Harness — the brief's `visual_harness` declaration.**

- **`host_frame`** — the app cannot boot standalone and a direct localhost hit is **not** an acceptable substitute. Load the brief's mandatory harness skill first, gather every `blocking_inputs` entry (applying `blocking_inputs_policy` — **stop and ask**, never guess and never fall back to a standalone render), run every `hooks.test_fixture_setup` step, then execute `visual_steps[]` in order.
- **`standalone_build`** (the default when nothing is declared) — § 1d-ii below.

**Hook steps marked `agent_cannot_do_this` are operator-side by nature** — hand them to the operator, and record skipping one as a finding under the category the step names (usually `procedure`). Most smoke-time observability bugs are procedure gaps, not framework gaps: the instrumentation can be perfectly correct while a cached bundle makes the whole session untrustworthy.

**1d-0. Fixture setup — the brief's `hooks.test_fixture_setup`.**

Where the composition declares a fixture, **the tree you are about to test must exist first, and you do not build it.** A hook step naming a `spawn` target means exactly that: spawn that sub-agent (its pinned `model`/`effort` apply — rule `72`; include `Output Level: <minimal|verbose>` per rule `73`), pass it the step's `loads[]` skills by name and its `task` verbatim. **You did not build it — that separation is the point**, and it is why the auditor and the author are different agents.

Then apply every `fixture_gates[]` entry **before** trusting anything the fixture shows. Each names what it asserts and why a green run without it is misleading; a failing gate is a **finding**, not something to accept. Report the step's `known_traps_report_do_not_work_around[]` if they fire — working around them hides the handoff defect that produced them.

**1d-ii. Mechanical assertions — EVERY UI run, BOTH harnesses.** Use Playwright to verify the implemented UI:

> **Promoted to core 2026-08-22.**
> Assertions **2b, 2c, 5b, 6 and 6b are surface-agnostic** and were previously reachable only on the
> `standalone_build` harness — so **a `host_frame` run skipped all five**. Both live precedents below
> (26 of 32 routes 404-ing; all seven nav links → `/`) are failure modes an iframe app has too.
>
> **The assertion is core's; only how you REACH the surface is the pack's.** Under `host_frame`,
> drive everything through `page.frameLocator(...)` per the harness skill and treat the app's
> registered extension-point routes as the route set. Under `standalone_build`, drive the served
> build directly. **A harness that makes an assertion genuinely impossible is a finding, not a
> silent skip** — record it with the reason under category `coverage`.
1. **Reach the surface. `standalone_build`: serve a FRESH production build, not a reused dev server.** (`host_frame`: the surface is the running host — § 1d-i already opened it, and its blocking inputs and preflight apply instead of this step.) Run the project's build then start (`npm run build && npm run start`), or point Playwright's `webServer` at a freshly built server. Do NOT verify against a leftover `next dev` / already-running server, and beware `playwright.config` `reuseExistingServer: true` — a stale process squatting on the baseURL port makes the WHOLE suite silently test old code and report a false green. Kill leftover servers on the port first; "green" must mean green against the built artifact.
2. Navigate key routes — determine affected routes from the task breakdown or git diff.

   **2b. Route-reachability crawl (mandatory, whole-site — NOT the affected subset).** Step 2's subset is scoped by the diff; it cannot find a page nobody linked correctly. **Crawl from the surface root and assert every discovered internal link returns 200.** One BFS inside `browser_evaluate` covers the whole site in a single call. **Under `host_frame`** the root is the app inside the frame and the route set is its registered extension-point routes — an iframe app reaches its own routes exactly the same way, and a route nobody linked correctly is just as invisible there:
   ```js
   // fetch each URL, DOMParser the HTML, enqueue unseen same-origin hrefs, record status
   ```
   Report every non-200 as its own row. **Any non-200 reachable from a rendered link is a Critical finding** — the page is unreachable by clicking regardless of whether it renders fine when hit directly. Assert the crawl's route COUNT against the expected page inventory too: a crawl that finds fewer routes than the CMS reports pages means links are missing entirely, not merely broken.

   *Live precedent (a prior run's PRD-000, 2026-07-30):* product CTAs linked the Sitecore **datasource** item path (`/Data/Catalogue/.../item-1`) instead of the page path. Those items carry no layout, so **26 of 32 routes 404'd** while the catalogue rendered clean, the cards looked clickable, and every gate stayed green. The ship report claimed "32/32 routes live". A crawl would have caught it in one call.

   **2c. A 200 is NOT proof a link goes anywhere (destination-distinctness).** The crawl above proves links *resolve*; it says nothing about whether they resolve somewhere *correct*. A link to `/` returns 200 from any page, so a whole navigation can be dead while the crawl reports a perfect score. Add two cheap assertions over the **rendered** nav, not the crawl:
   - **No non-trivial set of navigation links may share one destination.** Group every `<nav>`/header/footer link by resolved href; two or more nav links pointing at the same route (the site root especially) is a **Critical** finding unless deliberate (e.g. a logo home-link plus one "Home" item — name the exemption explicitly).
   - **An href of `/` on a non-home page is suspect by default.** Treat it as a stub until proven intentional. The same applies to `#`, `javascript:void(0)`, and an href equal to the current page.

   *Live precedent (same run, found hours after 2b was written):* **all seven header nav links — both axes — pointed at `/`.** The two family terms and all five room-type terms landed on the homepage. Every one returned **200**, so the 2b crawl passed clean; unit tests asserted `role="link"` and tab-reachability, both true of a dead link. The hrefs were mirrored from the POC clickdummy, where every nav link is a stub pointing at `index.html`. **A clickdummy's stubbed interactions are not a routing specification** — when the POC stubs an interaction, that is precisely where a real destination has to be specified elsewhere, and precisely where nobody looks.
3. Take snapshots using Playwright's `browser_snapshot` and `browser_take_screenshot` for each route.
4. Compare against reference:
   - **With POC:** Open the POC HTML file(s) alongside the implemented page. Compare layout, spacing, typography, colors, interactive states. **The POC is the correctness ground truth.** Screenshot baselines generated from the implementation itself are **regression-only** — "matches my own baseline" never proves "matches the design" (and if the baseline was captured from a broken render, it locks the bug in). Diff against the POC (or require the operator eyeball below) for *correctness*, not just a self-baseline.

     **Serve the POC and diff computed geometry, not just eyeballs.** Run the clickdummy on its own local port and read `getComputedStyle` on both sides for the same landmark (heading, first content block, rail): compare `x`, `width`, `max-width`, `padding`. "x=90 in the POC, x=0 in the app" is a one-glance finding that a side-by-side eyeball reliably misses, because a page with no gutter still looks deliberate in isolation.
   - **Without POC — this is a COVERAGE GAP, not a licence to check less.** A page type rendering components with no POC counterpart means those components were designed mid-build against no contract, and they are empirically the ones that come out worst. Record it as a **Major** finding under category `coverage` naming the page type and components, then still run every mechanical assertion below (2b, 5, 5b, 6, 6b) — those need no POC. Do not silently drop to smoke level.
5. Smoke checks (always):
   - No JavaScript console errors
   - No layout crashes or blank sections
   - Key interactive elements are visible and clickable

   **5b. Behavioral reality checks (mandatory — assert the OUTCOME a user sees, not a proxy).** Most false-greens come from gates that test a *proxy* — props render, pixels match a self-made baseline, reduced-motion "looks fine", `goto` works — which stays true even when the page is broken for a real user. Assert the lived outcome:
   - **Motion-ON visibility.** Run in DEFAULT motion — do NOT force `prefers-reduced-motion` for these checks. The reduced-motion CSS path commonly force-shows content (`opacity:1 !important`), which hides scroll-reveal / animation bugs. After load + a full scroll of each route, assert NO content is left invisible (e.g. zero `[data-reveal]`-style elements stuck at computed `opacity:0`; no empty bands).
   - **Client-side navigation, not just `goto`.** For App-Router / SPA UIs, REACH each route by clicking the real nav link (soft navigation), not only `page.goto()`. Soft-nav keeps the layout — and any once-mounted controllers/effects — alive, so behavior that re-runs on a full load can silently fail to re-run on a click. Assert content is visible after a settle-then-scroll on each clicked-to route.
   - **Both themes** when a theme toggle exists: repeat the visibility checks in light AND dark.
   Each failure here is at least a **Major** finding (**Critical** when content is entirely invisible). Land these as a committed E2E spec (a `reveal`/`smoke` spec) so they guard against regression, not just this run.
6. **Responsive verification (mandatory for any UI work — no escape hatch; under `host_frame`, resize the HOST and assert the app reflows inside its frame).** A "no responsive design in scope" claim is itself a finding when the page renders multi-column grids, sidebars, or padding > 2rem. Drive every affected route through Playwright at three viewports: **375×812 (small phone)**, **768×1024 (tablet)**, and **1280×800 (desktop baseline)**. For each viewport, capture a clipped screenshot and assert the following hard contracts on the page's actual computed layout:
   - **No horizontal scroll**: `document.documentElement.scrollWidth <= window.innerWidth + 1` (1px tolerance for sub-pixel rounding). A horizontal scrollbar at 375px is a **Critical** finding.
   - **No multi-column grids still side-by-side at ≤768px**: any element with `getComputedStyle(el).gridTemplateColumns` resolving to two-or-more non-empty tracks at 375px is a **Major** finding unless the grid intentionally uses `auto-fit minmax(min(100%, …))` (which collapses by definition).
   - **No fixed-width sidebars at ≤1023px**: TableOfContents-style sidebars and any other `<aside>` / `.sidebar` / TOC-class element must be `display: none` or stacked above content at ≤1023px. Side-by-side TOC under 1024px is a **Major** finding.
   - **Padding budget at 375px**: total horizontal padding on the main content container should not exceed 3rem (48px). Inline `padding: '... 4rem ...'` on a non-`<section>` element with no `@media` override is a recurring trap (`site/AGENTS.md` documents the canonical fix pattern: stable className + `@media (max-width: 768px)` rule with `!important`).
   - **No overflowing text at 375px**: scan for `el.scrollWidth > el.clientWidth` on h1/h2/h3 and any `[data-testid$="-title"]`. Overflowing headlines are a **Major** finding.
   Findings discovered here go into the `Findings` section of the test report **and** populate a dedicated `Mobile responsive` subsection of `Visual Testing` with one row per viewport per route. A `WARN`/`FAIL` row at 375px on any in-scope route blocks status promotion to `tested` until either the bug is fixed in Phase 2 or the user explicitly accepts the deviation in writing (recorded in the test report's "Fixes Applied" or "Findings" section). Skipping responsive verification because "the page looks fine on the developer's monitor" is itself a Major finding under category `procedure` — desktop fidelity does not generalise.
   **6b. Containment assertion at DESKTOP width (mandatory — the responsive contracts above cannot see this). Under `host_frame`, assert containment against the IFRAME viewport, not the browser window** — the extension point declares the bounds the app must live within, and an app flush to its frame edges is the same defect at a smaller scale.

    Every contract in step 6 is a *narrow*-viewport test, and each one passes on a page whose content is flush to both viewport edges: edge-to-edge content produces no horizontal scroll, no side-by-side grid, no padding overrun. Containment must therefore be asserted separately, at **1440×1024 and again at ≥2000px wide** (the wider the viewport, the more obvious an uncontained page becomes — and operator monitors are wide):
   - **Content is inset like the chrome.** Read the computed `x` of the header's inner bar and of the first content landmark in `<main>`. They must agree within a few px. A content landmark at `x≈0` while the header sits at `x≈90` is a **Critical** finding — the page has no gutter.
   - **The container resolves.** Walk the ancestor chain from a heading to `<body>` and assert some ancestor carries a real `max-width` + `margin: auto`. `max-width: none` at every level means no container exists. **Check the computed value, not the source** — an undefined custom property makes `max-width: var(--x)` invalid at computed-value time and it silently becomes `none`, so the CSS reads correct while the page renders uncontained.
   - **Prose fills its container.** No text component may resolve to a `max-width` dramatically narrower than its container (a `56ch` cap inside a 1244px container renders at 483px and leaves ~60% of the page empty). Flag any text block under ~55% of container width as a **Major** finding. Deliberate narrow components (logo, drawings, side panels) are exempt — name them explicitly rather than blanket-exempting.
   - **Sections are separated.** In Sitecore Content SDK, every component of a page renders flat into ONE unclassed placeholder div, so no component can space itself against its neighbours — spacing must come from the components themselves, and it is routine for only *some* to carry it. Assert a non-zero gap between adjacent top-level components; a section eyebrow colliding with the previous section's last line is a **Major** finding.

   *Live precedent (the same run):* `globals.css` had **no `main` rule at all**. The container pattern existed but was used by five chrome selectors only, so header and footer sat correctly inset while every content component on every page ran edge-to-edge. Tests, guard, code review, QA, smoke and `/ship` were all green. Nothing measured geometry.
7. Stop the dev server when visual testing is complete (`standalone_build` only — `host_frame` leaves the operator's browser session alone).

**1d-iii. Extra axes — the brief's `additions.test_axes[]`.** Run every axis the composition contributes, **on top of** the mechanical assertions above — a pack axis ADDS to the core floor, it never replaces it. Each carries its own `severity_on_fail`; apply it as written rather than downgrading a platform's axis to a smoke note. A `MAJOR even when the standalone render is clean` verdict is deliberate — a surface the product actually ships into is not proven by the surface it is convenient to test.

Load any skill the axis names first (the brief marks them `MANDATORY when`), since those skills exist precisely to enumerate failure modes that do not surface on a plain localhost hit.

**Skip condition** — apply the brief's `skip_condition` where the composition declares one; it says what a missing prerequisite means for THAT harness.

> **BLOCKED and EXCLUDED are two different states and they take two different records.** A prerequisite that is *missing but obtainable* is **`pending`** — "deferred pending `<the input>`" — and the run stays `tested_pending_smoke` awaiting a future resolution. A prerequisite the run **structurally cannot obtain** (no registration will happen, no tenant will be written, by operator decision) is **`excluded`** — "unrunnable by design — `<the decision, and who made it>`" — and it is **not a critical trigger**, because a premise of the run is not a defect in it.
>
> **Never file an excluded leg as pending.** "Deferred pending X" asserts a resolution the run has already ruled out; it is a false statement, it halts an intentionally unattended run on one of its own premises, and it leaves `tested_pending_smoke` permanently terminal for a run that completed exactly as specified. Measured 2026-09-03 (F-4): every escape in a shipped pack keyed on *"input not supplied"*, so a by-design exclusion had **no truthful record available**.
>
> **`excluded` is not a pass.** It records that a check could never run — an absence of evidence, honestly stated. It never counts toward a green result and never upgrades a status: such a run may reach `shipped_with_caveats` at best, with the exclusion named as the caveat, and may not reach `shipped`.

Otherwise: if the harness cannot start — no dev server command found (`standalone_build`), a `blocking_inputs` entry not supplied (`host_frame`), or the project has no UI (pure library/API) — skip visual testing and note it in the report. A missing blocking input is a **`WARN`-level test report entry, not a silent skip**: record that visual testing was deferred, and name what was missing.

**1e. Regression check**
- Confirm that existing functionality was not broken.
- Check that no previously-passing tests now fail.
- If E2E tests exist, confirm critical user flows still work end-to-end.

**1f. Verify code review fixes**
- When a code review report exists, verify that all critical and major findings marked as "fixed" are actually resolved in the code.

### Phase 2: Developer fixes findings

**Spawn sub-agent: Developer.** Spawn an isolated sub-agent. Prompt must include: read `.agent/agents/team/08-developer.md` for identity (spawn it via `Agent(subagent_type: "developer")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73). **Task:** Fix all critical and major findings from the QA test report.

For each finding:
1. Apply the code fix
2. Run lint and build to confirm no regressions
3. Run the specific test(s) related to the fix
4. Record the fix in the test report

After all fixes: run the **full test suite** again to confirm no regressions were introduced.

### Phase 3: Re-test critical fixes

If Phase 2 introduced significant code changes, the QA Specialist does a **targeted re-test** of the fixed areas only (not a full re-run). Confirm each fix actually resolves the finding.

### Phase 4: Update the run manifest

- Record the test report path under `canonical_artifacts` (or in `notes` if no canonical slot exists yet).
- Update `updated_at`.
- **Populate `smoke_outcomes`** (manifest schema_version 4+). Read the PRD's release plan and the task breakdown's § 8 What Needs To Be Tested (or legacy runbook's "What Needs To Be Tested" when present). For each named manual smoke step (real-tenant install, third-party integration verification, deploy-then-curl checks, etc.), add an entry keyed by task ID or step label with `outcome: "pending"` and a one-line `description`. If smoke was performed inline during this `/test` pass, flip the outcome to `passed`/`failed`/`skipped` and record `evidence` + `notes`. See `.agent/manifests/README.md` "Smoke outcomes and ship gating".
- **Initialize `smoke_outcomes` from the brief's `smoke_gating` declaration**, where the composition has one. It says WHAT to open an entry for and what the operator must confirm to clear it. Apply its variants: a platform with no live surface to smoke against still declares how the human eyeball becomes the gate, and **that variant is the whole point** — without it, a visual product with no published tenant reaches `/ship` with no visual gate at all.
- **Status transition** based on `smoke_outcomes` and the brief's **`requires_smoke`** declaration:
  - `requires_smoke: true` AND any `smoke_outcomes` entry is `pending` → set status to `tested_pending_smoke`. Tell the user the run cannot transition to `shipped` until smoke is recorded; suggest re-running `/test` with smoke outcomes or manually editing `smoke_outcomes` in the manifest. (A composition with no pack declaring it has no real-tenant surface to smoke against, so a pending entry cannot arise from the platform.)
  - All `smoke_outcomes` entries `passed` (or no smoke required) → set status to `tested`.
  - Any `smoke_outcomes` entry `failed` → set status to `tested` (the test pass itself completed) but note the failed smoke prominently in the test report so `/ship` enforces the gate.
- **Append `stage_history` entry** per `.agent/manifests/README.md` (Stage history and error recovery): `{ stage: "tested", agent: "07-qa-specialist", outcome: "completed", … }`. On failure, append with `outcome: "failed"` and the error message.
- Update both `run-<timestamp>.json` and `current-run.json`.

### Phase 5: Friction nudge

Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt before reporting completion. One nudge per `/test` run total. Default-skip.

## Output: `project-planning/plans/test-report-<timestamp>.md`

```markdown
# Test Report — <timestamp>

**Tester:** QA Specialist (07)
**Scope:** <what was tested>
**Overall result:** PASS | PASS WITH CAVEATS | NOT READY

## Automated Checks
| Check | Result | Details |
|-------|--------|---------|
| Lint | PASS/FAIL | <error count, warning count> |
| Build | PASS/FAIL | <error summary if failed> |
| Unit tests | PASS/FAIL | <passed/failed/skipped counts> |
| Component tests | PASS/FAIL/N/A | <passed/failed/skipped counts> |
| E2E tests | PASS/FAIL/N/A | <passed/failed/skipped counts> |

## Requirement Coverage (§ 10a)
| Requirement / AC / RED test | Coverage status | Evidence |
|-----------------------------|-----------------|----------|
| *from task breakdown § 10a* | covered / manual-only / not applicable / deferred | test file, smoke outcome, or manual procedure |

## Manual Verification
| Area | Result | Details |
|------|--------|---------|
| <user flow / feature> | PASS/FAIL | <description> |

## Visual Testing
| Route/Page | Result | Details |
|------------|--------|---------|
| <route> | PASS/FAIL/WARN/SKIPPED | <description> |

**POC comparison:** <Compared against project-planning/design-prototypes/poc-vN-prdNNN/ | No POC available — smoke test only>
**Console errors:** <count or "none">

<!-- Also include every block the pack brief lists under additions.report_blocks -->

## Findings
### Critical (must fix before release)
<numbered list, or "None">

### Major (should fix before release)
<numbered list, or "None">

### Minor (acceptable risk)
<numbered list, or "None">

## Fixes Applied
<numbered list of findings fixed by Developer Agent, with before/after summary>

## Release Readiness Assessment
- **Status:** Ready | Ready with caveats | Not ready
- **Caveats:** <list if any>
- **Remaining risks:** <list if any>

## Summary
<1-3 sentence assessment of overall quality and readiness>
```

## Validation

Before finishing, verify:
- The test report exists at the correct path
- **§ 10a requirement coverage:** Every in-scope row from the task breakdown § 10a is reflected in the test report's Requirement Coverage section with a final coverage status and evidence pointer — no silent `pending` rows
- All automated checks were run (or explicitly noted as skipped with reason)
- All critical and major findings have been fixed by the Developer Agent
- Full test suite passes after fixes
- Lint and build pass after fixes
- The run manifest is updated with the test report path
- `stage_history` contains an entry for `tested`
- Release readiness is clearly stated
- **Every `additions.validation` entry in the pack brief holds.** These are the platform's own release conditions and they are not satisfied by a convenient substitute — a harness declared `host_frame` is not satisfied by a standalone-localhost render, whatever it shows.

- **Manifest pointers recorded — `node .agent/scripts/assert-manifest-pointers.mjs --workflow <product>/project-planning/workflow --stage test` exits 0.**
  Producing the artifact is only half the stage; the other half is recording **where it went**. This gate reads the pointer, not the file — it catches a pointer written into a slot that does not exist, a required slot left `null`, a missing `stage_history` entry, and a `resolved` `operator_attention[]` item with nothing to check.
  Four such misses happened in a single run and **none of them failed anything**: the artifacts were on disk and the manifest was valid JSON. The damage lands on the NEXT stage — one of them would have handed `/implement` no task breakdown at all.
  **RECORD the exit code — do not merely claim it.** Append `{ stage: "test", exit: <code>, at: "<iso>" }` to `notes.gates.manifest_pointers[]` via `manifest-write.mjs`. A non-zero exit may be overridden, but only with an `override_reason` on the same entry; `/ship` ERRORs on a silent failure and on an empty array. Measured 2026-09-02: a bug shipped through a `/ship` where this gate exits 1 — nothing recorded whether it had been run, skipped or overridden, which made a prose exit criterion indistinguishable from no criterion at all. Products are separate git repos, so no hook here can see their manifests; the manifest is the only surface both sides share.

## Output rules
- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it **above** the test summary and the release-readiness verdict. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "test"`. Typical sources at `/test`: smoke entries marked `pending` (each one is a `[BLOCKER]` decision for the operator), visual testing deferred because a `blocking_inputs` entry was not supplied (concern), visual diffs with WARN verdict but operator-acceptable (decision), `skipped` automated checks with a reason (assumption — operator-acceptable), accessibility findings the operator must triage (decision), live-walkthrough findings discovered mid-run (concern). Every `pending|failed` smoke entry MUST appear as a checkpoint item — never let smoke-pending state sit only inside `smoke_outcomes`.
- Report the test results summary (pass/fail counts)
- Report findings by severity and which were fixed
- State the release readiness assessment
- Keep the report factual and traceable to the aligned documents
- Separate confirmed defects from open questions or untestable areas
- **Operator gate — the end-of-build review; the token comes from the brief, not from a platform name.** Read `owns_final_gate`: **true** means an active pack contributes a downstream stage carrying `final`, so this close resolves to **`build`**; **false** means nothing downstream carries it, so this close IS the **`final`** gate. The declaration's own note says it outright — *"No platform name is needed to decide that."* per `.agent/glossary.md` § "Operator Gate". This gate fires **only on the end-of-build `/test` pass** (no further component / additional-logic tranches remain); **mid-loop `/test` passes are always SOFT** (`per_component` cadence — never stop between components, rule `71`). At the end-of-build pass, present the review surface the composition's fixture produced — for a Content SDK run the **Components Preview** page, per the content-sdk pack's `test` stage.
  **Which token this is depends on one question, and it names no platform:** *is there an ACTIVE downstream stage declaring `gate: final`?* An active pack that `owns_final_gate` contributes one (for a content phase, that is `/test-content`); a pack whose phase is deactivated by a scope dial contributes nothing.
  - **Yes — a downstream stage owns `final`:** `/test` is the **`build` gate** (end-of-build look before `/ship` + the phase that follows; the downstream stage is the separate `final` gate, so this is *not* the last look). Governed by **`gates.build`**.
  - **No:** `/test` is the **`final` gate** — the last look before `/ship`. Governed by **`gates.final`**.

  > This replaces a two-branch `platform_target` test whose second branch carried an awkward *"OR a content-sdk run with `content_authoring == no`"* clause. That clause **disappears rather than moving**: a deactivated pack stage is not active, so `/test` becomes the final gate automatically.
  - **In both cases:** the governing token **on** (default) → HARD: end with *"Build is review-clean and test-green — the Components Preview page shows every component + variant. Reply **YES** to proceed to `/ship`, or describe changes."* and wait. The governing token **off** (`fully_autonomous` / custom) → SOFT: "Recommended next: `/ship`".
  - **Critical triggers escalate to a hard stop regardless of the gate token:** (a) any `pending` or `failed` smoke entry; (b) Release readiness is `Not ready`; (c) any `additions.critical_triggers` entry from the pack brief fired — e.g. visual smoke deferred for a missing blocking input; (d) any Critical or Major finding could not be fixed; (e) any `[BLOCKER]`-tagged item in the Operator Checkpoint. When triggered, end with: *"STOP — `<reason>`. Reply **YES** to override and proceed to `/ship` anyway (will likely produce `shipped_with_caveats`), or address the issue first."*
