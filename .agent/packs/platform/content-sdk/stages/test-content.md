---
name: test-content
intent: verification
writes:
  - products/<product-slug>/project-planning/plans/content-test-report-<timestamp>.md
  - products/<product-slug>/project-planning/workflow/run-<timestamp>.json
  - products/<product-slug>/project-planning/workflow/current-run.json
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/packs/platform/content-sdk/stages/author-content.md
  - .agent/agents/team/07-qa-specialist.md
  - .agent/packs/platform/content-sdk/agents/14-content-author.md
  - .agent/manifests/run-manifest.template.json
---

# /test-content — Fresh, independent audit of authored content + page structure + look-and-feel

## What this is

The **content counterpart of `/test`**. Where `/test` (the implementation test) is a fresh adversarial pass over the *code*, `/test-content` is a fresh adversarial pass over the **authored content as it actually renders** — the words, the **page structure** (which components, in what order, complete or not), and the **look-and-feel** of the composed page. It is the content-phase analogue of how `/test` sits after `/implement`: `/author-content` writes and self-checks; `/test-content` audits it with **fresh eyes** and loops fixes back.

**Same loop as `/test`, bounded:** QA Specialist (07) runs an adversarial audit → Content Author (14) fixes the findings → 07 re-audits the critical fixes → manifest + report → **hard gate #3 → `/publish`**. The **author ⇄ tester loop** is **bounded to 3 cycles** with **QA (07) as the sole arbiter** of "good enough" (glossary § "Content test"); a 3rd non-clean pass escalates to the operator.

This is **not** `/author-content`'s in-loop Content QA gate (which is the author's own fast self-check, in the same agent that just wrote the content). `/test-content` is the **authoritative, independent** pass — the reviewer who did not write it.

> **Brand kit (prepared, not yet wired).** `/test-content` carries an **optional brand-conformance axis** as a deliberate seam: when a brand kit is supplied — either a **Sitecore native brand kit** (Marketer MCP `list_brandkits` / `get_brandkit_by_id`) or an **operator-provided brand-kit file** — the audit adds a brand-conformance check against it. When none is supplied (the default today), that axis is **skipped and noted** — everything else still runs. Adding a brand kit later *adds* the axis; it does not replace the yardstick below.

## Pipeline position

Content SDK branch (content phase after ship): `… → /test → /ship → /discover-components → /author-content → **/test-content** → /publish`.

`/test-content` runs **after** `/author-content` (the content has been authored / landed **on preview**) and **before** `/publish` (the final live step). Like `/author-content`, it is content-phase + on-demand — it is **not** part of the generic (non-content) `typical_sequence`.

**Git context:** runs on the feature branch; for a Content SDK run the authored items are live in the tenant **on preview** (pulled into the CM + published at `/publish`).

## Mandatory — product workspace

Read and apply `.agent/commands/project/product-workspace.md` **first**. Resolve `products/<product-slug>/project-planning/workflow/current-run.json` and all `canonical_artifacts` under that product.

## Mode detection (mirrors `/test`)

| Condition | Mode | Behavior |
|-----------|------|----------|
| `current-run.json` resolves a product AND this pack is active (or a Sitecore channel was authored) | **Pipeline** | Audit the **rendered** page(s) — structure + look-and-feel against the yardstick — plus the content axes. The authored Sitecore items are the subject. |
| `author-content` ran in **freeform** (no rendered page — a returned/markdown draft) | **Freeform** | Audit the authored text against the **content + structure** axes only (no live render). Look-and-feel reduces to document structure (lead/headings/close, scannability). |
| No authored content can be located | **Error** | Surface: "no authored content found — run `/author-content` first, or pass an explicit path to the authored artifact / Sitecore page." |

The QA Specialist (07) and Content Author (14) sub-agent prompts MUST include the resolved mode.

## When to run

- **After `/author-content`** — as the content quality gate before `/publish`.
- **On demand** — any time you want a fresh, independent look at already-authored content/pages.

## Credential pre-flight (before the first live read)

Run the pack's **`stages.implement.preflight_credentials`** pass (`.agent/packs/platform/content-sdk/pack.json`) — every `checks[]` entry in one pass, applying each stated `remedy`. It is declared under `implement` only because that is where it was first written; its `applies_to` names this stage. **`go_live`-class — runs regardless of the gate set.** Skip only for a freeform audit of a markdown draft that touches no tenant.

**Re-run it whenever this stage resumes after a gap** (MCP tokens expire inside a long run). An audit that silently loses tenant access mid-pass reports on what it managed to read, which is indistinguishable from a clean result.

## Inputs

Resolve from `project-planning/workflow/current-run.json` → `canonical_artifacts` when present; otherwise latest-by-timestamp / operator-supplied path.

Use:
- **The authored content** — the Sitecore page(s) + datasource/child items authored by `/author-content` (pipeline), or the returned/markdown draft (freeform).
- **The brief + register + brand context** that `/author-content` worked from (content type, audience, the chosen register, whose brand) — needed to judge voice-register fit and channel format.
- **The yardstick for structure + look-and-feel** (in priority order, use what exists):
  1. **Selected UI design / POC clickdummy** — `ui_design.selected_poc_path` / `selected_variant_path` (the visual ground truth).
  2. **The Components Map** from `/discover-components` — `project-planning/components-information/component-map.md` (per-component purpose, variants, and how each looks) — the richest structural/visual reference for a Sitecore site.
  3. **The content-resilience contract** — Pages-authored components must hold up under **oversized / many / empty** author content (auto-fit, `min-width:0`, ellipsis/clamp), not just the happy path. Oversized + empty are part of the contract, not edge cases.
  4. **Design-eye heuristics** — spacing, hierarchy, rhythm, theme correctness — when no POC/map exists.
- **The applicable brand kit** — *optional*: a Sitecore native brand kit (`get_brandkit_by_id`) or an operator-provided file. Absent → skip the brand axis (note it).
- **The spec's "Brand voice and identity" section** and `sitecoreai-brand-voice`: the yardstick for voice-register fit. Run `node .agent/scripts/check-brand-voice-section.mjs --spec <canonical_artifacts.prd>` first. Exit 1 on a run with a spec is a **Critical** finding: there is no written voice to audit against, so `/author-content`'s gate was skipped; route it back to the operator instead of auditing against taste.

## Non-negotiables

- Treat the brief + register + selected design (and brand kit, if any) as the source of truth for what the content was *supposed* to be.
- Never invent brand rules, voice requirements, or design intent that the inputs do not support.
- A **fresh-eyes** audit: 07 judges the result on its own merits against the yardstick — it does not rubber-stamp the author's self-check.
- Prefer rendering and **looking** over reasoning about the markup. For a Sitecore page, capture the real preview render; do not audit look-and-feel from the layout JSON alone.
- A **live re-write** during the fix loop (re-authoring Sitecore content) is an **integration boundary**: preview → operator-confirm → write → **verify it landed** (re-read the item / published page). Never silently mutate a tenant.

## Process

### Phase 0: Capture the rendered subject (pipeline only)

Mechanical capture — not judgment, so it is fine for the Content Author (14) tooling to perform it. Render the authored page(s) so 07 can audit pixels, not just markup:

- Resolve the page(s) authored by `/author-content` (from the run manifest / the author's report).
- Get the preview render: Marketer MCP `get_page_preview_url` → Playwright `browser_navigate` → `browser_resize` (desktop 1440×1024 **and** mobile 375×812) → `browser_take_screenshot` (fullPage); or `get_page_screenshot` where a clean cloud shot is available. **Bust the editing-render cache / wait** after any recent change before capturing (the editing-render endpoint caches). The audit surface is the **editing-host preview** (glossary § "Preview-first delivery" → Surfaces); the live look on **Vercel** is deferred to `/publish`'s go-live check — `/test-content` audits preview, not the live site.
- Save evidence to `products/<product-slug>/content-test-evidence/<page>-<viewport>-<timestamp>.png`.
- Also pull the page's **structure**: `get_components_on_page` (rendering list + order) and the authored field/child values, so the structure audit has the real composition. For each populated placeholder, also pull its **allowed set** (`get_allowed_comps_by_ph`) so the structure audit can check placeholder-restriction compliance against `content_policy.enforce_placeholder_restrictions`.
- **Chrome evidence for the structure axis:** read `__Renderings` on the **Header** and **Footer** Partial Designs (`…/Presentation/Partial Designs/Header` + `…/Footer`) to confirm chrome is placed there, and capture each audited page's own `headless-header` / `headless-footer` (from its layout / `get_components_on_page`) to detect **per-page chrome** — so the structure axis can enforce chrome-via-Partial-Design (rule `80` § 1).
- **Imagery inventory for the imagery axis (completeness evidence):** enumerate **every Image field on every authored page** — walk each page's components + child datasources and, for each Image field, record whether it is **set** (carries a `mediaid`) and whether a real `<img src>` for it appears in the **delivered / preview HTML**. Hand 07 this per-slot inventory so the imagery axis runs as a **completeness** check, not a spot-check — an empty or non-rendering slot cannot hide behind the ones that happened to be looked at.

**Freeform:** no render — the subject is the returned/markdown draft itself.

### Phase 1: QA Specialist — fresh content audit

**Spawn sub-agent: QA Specialist (07), content-review mode.** Prompt must include: read `.agent/agents/team/07-qa-specialist.md` for identity (spawn it via `Agent(subagent_type: "qa-specialist")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73); you are auditing **authored content as it renders**, not code; you did **not** write it — judge it fresh against the yardstick. Provide the captured screenshots + structure + brief + register + yardstick paths (+ brand kit if any) + the resolved mode.

Audit against these axes (the four content axes + the three `/test-content` adds + the optional brand axis):

- **brand** — the spec's "Brand voice and identity" section, or the brand kit it names: voice attributes, vocabulary, claims allowed.
- **voice-register fit** — matches the section's voice attributes and the stated register, loading the voice skill the run named. It could not belong to a different brand with the name swapped out, and every claim is one the section allows. No generic-AI tells.
- **factual accuracy** — technical/product claims grounded, not hallucinated.
- **channel format** — blog: lead/headings/close; marketing: promise/CTA; Sitecore page: field-shaped, component-appropriate content.
- **structure** *(added by `/test-content`)* — are the **right components** used, in a sensible **order**, with a complete composition (no orphan/empty renderings, no missing hero/CTA/sections the brief implies)? Does it match the selected design / Components Map intent? Is the composition **content-resilient** — does it survive oversized, many, and empty values, or does it overflow/collapse? **Placeholder-restriction compliance** — is every placed rendering in its placeholder's allowed set (`get_allowed_comps_by_ph`)? Read `content_policy.enforce_placeholder_restrictions`: under **enforce** (default), an out-of-allowed-set placement is a **Major** finding; under **ignore**, it is a **recorded (accepted) deviation** (note it, don't fail on it). See glossary § "Placeholder restriction policy". **Chrome placement (invariant — rule `80` § 1):** verify **chrome renders site-wide through the Page Design's Partial Designs, not per-page** — the Header/Footer Partial Designs carry the header/footer (and any promo/announcement/utility) renderings, and **no individual page carries a header/footer/announcement/promo rendering in its own `headless-header` / `headless-footer`**. Any per-page chrome placement is a **Major structure finding** (not gated by the enforce/ignore policy — chrome-via-Partial-Design is always required).
- **look-and-feel** *(added by `/test-content`)* — does the **rendered** page read well against the POC/UI-design + Components Map: spacing, hierarchy, typography, theme correctness, no broken layout, no horizontal scroll at 375px, images sized/cropped sensibly? Compare side-by-side with the yardstick on layout / typography / color / component anatomy / state fidelity.
- **imagery** *(added by `/test-content`)* — **enumerate every Image field on every authored page** (from the Phase-0 imagery inventory) and check: **(a0) completeness** — the slot is **filled with a real image**, not empty and not a CSS fallback. An **unset / empty Image slot is a Major finding by default** — the no-defer definition-of-done requires every slot authored **unless the operator explicitly deferred that specific slot in writing**; a silently-empty slot **fails the axis** — empty detail galleries and similar multi-slot pages must not reach operator review unfilled unless explicitly deferred. **(a) field-set ≠ visibly-rendered** — a set image actually **renders visibly** on the page (not masked / hidden by component CSS, and not a broken / 404 media reference). **(b) subject + mood fit** — the image suits the page's subject and the register / tone (not generic stock, not off-topic), and carries **no competitor / invented brand marks** (badges, logos, third-party product or tyre branding from the generator). **(c) technical fitness** — right **aspect** for the slot (not distorted / awkwardly cropped), acceptable resolution, no baked-in text / watermark. A slot that is **empty**, **set but not visible**, off-subject, or carrying a foreign brand mark is a **Major** finding. **Brand-palette conformance of images is DEFERRED** (folds into the brand axis when the brand kit lands).
- **languages** *(only when `variables.languages.additional` is non-empty)* — run `node .claude/skills/sitecoreai-localization/scripts/language-census.mjs --site <site> --cm <cm-host> --edge-context-env <PREVIEW context env var> --strict` on preview: every page has a version in every locale the spec mirrors, every Dictionary key has a non-empty phrase per locale (on Edge, value === key means untranslated), and every routed page resolves per locale. A missing version or an untranslated key on a mirrored locale is a **Major** finding; an orphan language (versions in a language the environment does not define) is **Critical** (preview serves it, a publish cannot).
- **brand conformance** *(optional seam — only if a brand kit is supplied)* — colors / type / tone / vocabulary / do-and-don't against the supplied brand kit. **Absent → record `brand axis: skipped (no brand kit supplied)` and move on.**

**When the brief surfaces `parity_harness`** (a `method:clone` composition), the look-and-feel axis is ALSO measured, per authored page, against the source with that harness — the copy `/design` placed under `<site-reference>/parity/`, pointed at the built site. Its blocking findings are look-and-feel findings; a reasoned waiver (source nondeterminism, operator exclusions) is recorded in the report, never silently applied. Measured 2026-09-29 on the sitecore.com clone: the per-page parity gate at this stage root-caused a grid breakpoint (the source switches 1→2→3 columns at 640/1024px, the build went straight to 3 at 768px) that displaced 12 of 20 anchors on one page at tablet width.

Record findings by severity (**Critical** / **Major** / **Minor**) with the axis, the page/section, the evidence (screenshot path or quoted text), and a concrete fix. For Sitecore, also confirm the content **actually landed** (re-read), don't trust the write call.

### Phase 2: Content Author — fix findings

**Spawn sub-agent: Content Author (14).** Prompt must include: read `.agent/packs/platform/content-sdk/agents/14-content-author.md` for identity (spawn it via `Agent(subagent_type: "content-author")` so its pinned `model`/`effort` apply — rule 72; include `Output Level: <minimal|verbose>` per rule 73); load the voice skill the run named, `sitecoreai-brand-voice` by default (and `sitecoreai-content-composition` for Sitecore). **Task:** fix all Critical and Major findings from the content audit.

For each finding:
1. Apply the fix — re-write copy in-register, re-compose/re-order components, fix the field-shaped content, swap an ill-fitting variant.
2. For Sitecore: re-author via the **Marketer MCP** — a live re-write is an **integration boundary**: **when `scope_dial.gates.go_live` is on** (default), preview → operator-confirm → write → **re-read to verify it landed on preview**; **when off** (`fully_autonomous`), re-author unattended but **still re-read to verify it landed** (never skip verification). **No publish** — publishing is the final `/publish` step (preview-first, `.agent/glossary.md` § "Preview-first delivery").
3. Record the fix in the content-test report.

### Phase 3: Re-audit critical fixes

If Phase 2 made significant changes, 07 does a **targeted re-audit** of the fixed areas only (re-capture the render for those pages first — bust the cache). Confirm each fix actually resolves the finding and introduced no regression in look-and-feel.

### Phase 4: Update the run manifest

- Record the content-test report path under `canonical_artifacts.content_test_report` (or in `notes` if no slot is desired).
- **Append a `stage_history` entry**: `{ stage: "content_tested", agent: "07-qa-specialist", outcome: "completed" | "failed", one_line: "<n> findings; <m> fixed; brand axis <ran|skipped>", deliverables: [<report path>, <evidence paths>] }`.
- Mirror any unresolved Critical/Major finding, any unverified live write, and a `skipped` brand axis into `operator_attention[]` with `stage: "test-content"`.
- Update `updated_at`. Write both `run-<timestamp>.json` and `current-run.json`.

### Phase 5: Friction nudge

Run the friction-log gate prompt per `.agent/WORKFLOW.md` § Friction-log gate prompt before reporting completion. One nudge per `/test-content` run. Default-skip.

## Output: `project-planning/plans/content-test-report-<timestamp>.md`

```markdown
# Content Test Report — <timestamp>

**Auditor:** QA Specialist (07), content-review mode (fresh pass)
**Fixer:** Content Author (14)
**Scope:** <page(s) / artifact audited> · **Mode:** pipeline | freeform
**Register / brand:** <register> · <brand, and the section or brand kit the voice came from>
**Yardstick:** <POC | Components Map | content-resilience contract | design-eye>
**Brand axis:** ran (against <kit>) | skipped (no brand kit supplied)
**Overall result:** PASS | PASS WITH CAVEATS | NOT READY

## Structure & Composition
| Page / section | Components (order) | Result | Details |
|----------------|--------------------|--------|---------|
| <page> | <list> | PASS/FAIL/WARN | completeness · resilience (oversized/empty) · placeholder compliance (policy: enforce/ignore) · chrome via Partial Designs (no per-page chrome) |

## Look-and-Feel
| Page | Viewport | Result | Details (vs yardstick) |
|------|----------|--------|------------------------|
| <page> | desktop / mobile | PASS/FAIL/WARN | layout · type · color · spacing · theme |

**Evidence:** <screenshot paths>

## Content Axes
| Axis | Result | Details |
|------|--------|---------|
| brand | PASS/FAIL | |
| voice-register fit | PASS/FAIL | |
| factual accuracy | PASS/FAIL | |
| channel format | PASS/FAIL | |
| imagery | PASS/FAIL/N-A | field-set-≠-visible · subject/mood fit · aspect (brand-palette deferred; N/A if no image slots) |
| brand conformance | PASS/FAIL/SKIPPED | <kit, or "no brand kit supplied"> |

## Findings
### Critical (must fix before ship)
<numbered, or "None">
### Major (should fix before ship)
<numbered, or "None">
### Minor (acceptable)
<numbered, or "None">

## Fixes Applied
<numbered list of findings fixed by the Content Author, with before/after summary; for Sitecore, "re-read confirms landed">

## Release Readiness
- **Status:** Ready | Ready with caveats | Not ready
- **Caveats / remaining risks:** <list if any>

## Summary
<1-3 sentence assessment of content + structure + look-and-feel readiness>
```

## Validation

Before finishing, verify:
- The content-test report exists at the expected path.
- The render was captured (pipeline) and embedded, or the report records why it could not be (freeform / no preview).
- All eight axes were assessed (brand · voice-register · accuracy · channel-format · structure · look-and-feel · imagery) and the brand-conformance axis was either **run** against a supplied kit or explicitly **skipped (no brand kit supplied)** — never silently omitted.
- **Imagery completeness (gate):** every Image slot on every audited page was **enumerated** (Phase-0 inventory) and is either **filled + visibly rendering**, or **explicitly operator-deferred in writing** — a silently-empty Image slot is a **Major** finding that **fails** the imagery axis (the no-defer definition-of-done). "Some images present" is not a pass.
- All Critical and Major findings were fixed by the Content Author, or explicitly accepted by the operator in writing (recorded in the report).
- For Sitecore: every fix was **re-read to confirm it landed**; no live write happened without an operator-confirmed preview.
- **Placeholder-restriction compliance** was checked against `content_policy.enforce_placeholder_restrictions`: under enforce, out-of-allowed-set placements were raised as Major findings; under ignore, they were recorded as accepted deviations (never silently omitted).
- **Chrome placement (structure axis, invariant)** was verified: the Header/Footer Partial Designs carry the chrome renderings and **no audited page carries a header/footer/announcement/promo rendering in its own `headless-header` / `headless-footer`**. Any per-page chrome was raised as a **Major structure finding** (rule `80` § 1) — not silently passed, and not subject to the enforce/ignore policy.
- The run manifest has a `content_tested` `stage_history` entry; unresolved findings + a skipped brand axis are mirrored into `operator_attention[]`.

## Output rules

- **Begin the final assistant message with an Operator Checkpoint block** per `.agent/glossary.md` § "Operator Checkpoint". Place it above the report-path summary and the readiness verdict. Mirror every non-empty item into `operator_attention[]` (schema 6+) with `stage: "test-content"`. Typical sources: an unresolved Critical/Major content finding (a `[BLOCKER]` decision), a live re-write that could not be verified landed (concern), a `skipped` brand axis (assumption — operator-acceptable), a look-and-feel WARN the operator accepts (decision), POC/Components-Map drift discovered during the audit (concern).
- Report the report path + the evidence paths.
- Report findings by severity and which were fixed.
- State the release readiness assessment; keep it factual and traceable to the brief / design / brand kit.
- **Operator gate — the `final` gate (default HARD when `scope_dial.gates.final` is on)** per `.agent/glossary.md` § "Operator Gate" — `/test-content` is the content branch's **final** look at the rendered output before the run goes live at `/publish`. **When `gates.final` is on** (default): a clean pass ends the final message with *"Content is ready. Reply **YES** to proceed to `/publish` (publish everything to LIVE + persist the authored content), or describe changes."* — stop and wait, do not soften into a passive recommendation. **When `gates.final` is off** (custom / `fully_autonomous`): SOFT — a clean pass ends with "Recommended next: `/publish`" and proceeds autonomously. **Keep the stop and name the blocker regardless of the gate** (a YES / autonomy does not silently clear these) when: (a) any Critical or Major content finding could not be fixed; (b) release readiness is `Not ready`; (c) a live Sitecore re-write could not be verified landed on preview; (d) any `[BLOCKER]`-tagged Operator Checkpoint item — end with: *"STOP — `<reason>`. Address it before `/publish`, or reply **YES** to accept the caveat and publish anyway."*
