---
name: author-content
intent: authoring
writes:
  - <freeform> inline return, or an operator-named markdown file
  - <personal blog / personal website> the channel's content artifact (via its adapter; draft + landing steps until the adapter is wired)
  - <Sitecore> page/datasource content in the target tenant (via Marketer MCP / SitecoreAI Agent + Pages; publish explicit)
depends_on:
  - .agent/packs/platform/content-sdk/agents/14-content-author.md
  - .agent/agents/team/07-qa-specialist.md
  - .agent/commands/project/product-workspace.md
---

# /author-content — Write audience-facing content in a chosen voice, landed in a chosen channel

## What this is

Produce **original, audience-facing content** — a blog post, website copy, Sitecore page content, or general text — written in the **brand's voice** the PRD or spec defines, in a named **register** (brand / marketing / technical-neutral), and **landed properly in a target channel**. Runs the **Content Author (agent 14)**, which loads `sitecoreai-brand-voice`.

## Which voice skill

**`sitecoreai-brand-voice` is the default**: it takes voice and identity from the spec's **"Brand voice and identity"** section (or the Sitecore brand kit or guidelines it names) and sets the register. Registers: **brand** (default for site copy) · **marketing** · **technical-neutral**.


This is NOT documentation (`/document` → Doc Writer), NOT a spec (`/create-prd|frd|bug`), and NOT code (`/implement`). It writes the words and places them.

## Two ways to run it

- **On-demand (default):** "write me a blog post about X", "draft launch copy for Y", "add a general text to my site." Freeform.
- **As the content phase in the Content SDK branch:** the formal stage `… → /test → /ship → /discover-components → /author-content → /test-content → /publish` — the content phase runs **after** `/ship`, against **preview**. It populates the site with **real brand content**, runs the Content Author (14) AND a **Content QA gate** (07), then recommends `/test-content` (the authoritative independent content audit, which in turn recommends `/publish` — the final live step). Resolves the product + run manifest via `product-workspace.md`.
  - **Read the PRD first, then author a small SITE — not one page.** Load the run's PRD (`canonical_artifacts.prd` / `prd-minimal`) to learn the brand, audience, and which pages the site needs, then author **~5 brand-appropriate pages** (typically Home + the key sections the PRD/IA calls for — e.g. Collections / Our Story / Journal / Pricing for a commerce brand, adjusted to the actual brand). For each page: create the page item, compose it from the site's real components (honoring the placeholder-restriction policy), and author its datasource/child content in the chosen register. A single-page result is a miss unless the PRD's scope is genuinely one page.
  - **Run a cross-page reuse pass BEFORE authoring — it decides local vs global datasources.** Once the page set is composed but before the first write, sweep the planned datasources across all pages: content the plan places on **≥2 pages** is authored **once** as a **global** item in that component's folder under the site `Data` node and bound to each placement via `set_component_datasource`; everything else stays **local** under `<Page>/Data`; partial-design chrome is always local to its Partial Design. The MCP has no move primitive, so this cannot be fixed up afterwards — decide in the plan (rule `83` placement bullet; `sitecoreai-content-composition` § 'Local vs global datasources'). Skip the interview in this mode: the PRD + manifest already answer what/where/register/brand (register = the section's *Register default*, else `brand`).

## The interview (always, unless the args already answer it)

Open with an `AskUserQuestion` batch:

| Question | Options |
|----------|---------|
| **What** kind of content? | blog post · website copy · Sitecore page content · general / freeform text |
| **Where** should it land? | freeform (return/file) · the personal blog · the personal website · a Sitecore tenant |
| **Whose brand?** | a named project/client brand: supply or point to the spec section, brand kit or guidelines. No written source means stop and ask (below) |
| **Which register?** | brand (the spec's voice, default) · marketing (launch, benefit-led) · technical-neutral (spec/reference) |

Then capture the **brief**: topic, angle, audience, length, and any source material/links to ground against.

### Sitecore only — placeholder rendering restriction policy

When **where = a Sitecore tenant**, ask **one more** `AskUserQuestion` before composing (skip it for freeform / blog / website — they have no placeholders):

| Question | Options |
|----------|---------|
| **Enforce Sitecore placeholder rendering restrictions?** | **Enforce — follow the rules** (default, recommended): only place renderings the target placeholder actually allows · **Ignore — compose freely**: add renderings as best fits, regardless of the allowed set |

Sitecore placeholders carry an **allowed-renderings** set (placeholder settings). The Content Author reads it **per placeholder** via the Marketer MCP **`get_allowed_comps_by_ph(pageId, placeholder)`** (the same call `/discover-components` uses to fill structural placeholders). See the glossary § "Placeholder restriction policy".

- **Enforce (default):** place only allowed renderings; a desired-but-disallowed component is substituted with an allowed alternative or surfaced to you — never force-placed (a disallowed rendering yields an invalid / uneditable layout in Pages).
- **Ignore:** the author composes by best-fit judgement and still **records each out-of-allowed-set placement** as a deviation, so `/test-content` and you can see what bypassed the rule.

Persist the answer to the run manifest as **`content_policy.enforce_placeholder_restrictions`** (`true` = enforce, `false` = ignore); `/test-content` inherits it. In pure freeform (no manifest) it is a session decision, default **enforce**. An absent flag ⇒ enforce (the safe default).

### Sitecore only — image commissioning (empty Image fields), by `scope_dial.imagery` tier

When composing a Sitecore page leaves a component's **Image field empty**, how the Content Author fills it is set by **`scope_dial.imagery`** (resolved at `/create-prd` kickoff; absent/legacy ⇒ `mood`).

- **`mood` — Claude-generated abstract/decorative imagery (no external service, no per-image cost).** For each empty slot, derive a **mood brief** (palette / texture / motion feel / aspect) from the copy + register, then have the Content Author **generate an abstract/decorative asset as code** — an SVG gradient / geometric / generative-pattern image sized to the slot's aspect (NOT a real subject; atmosphere only). Rasterize if the field needs a bitmap, then upload it with the two-step `uploadMedia` (`sitecoreai-graphql-schemas` § 6b), link the `mediaId` onto the Image field via the **Marketer MCP** (`update_fields_on_item`, `<image mediaid/>`) and **verify it renders on preview**. Needs no external service and no API key. Author the SVG inline.

- **`none` — leave empty Image fields empty.** Do not commission imagery; the component's CSS fallback stands. Note each intentionally-empty slot so `/test-content` does not read it as a miss.

## Channel adapters — what is LIVE vs roadmap

Be explicit; do not pretend to publish where the adapter is not yet wired.

| Channel | Status | Behavior |
|---------|--------|----------|
| **freeform** | **LIVE** | Draft in the chosen register; return inline or write to an operator-named markdown file. |
| **personal blog** | **roadmap (T3)** | Will produce a post in the blog's content format and place it via the blog adapter. *Until wired:* needs the blog-platform probe (the personal-site source is not in the local tree); for now, produce the draft + explicit "how to add this post" instructions. |
| **personal website (general text)** | **roadmap (T3)** | Will write body copy into the website's content slot. *Until wired:* draft + placement instructions. |
| **Sitecore tenant** | **LIVE** (Marketer MCP), **preview only** | **Inventories the site's component palette first** (`sitecoreai-content-composition`), then composes a page from real components (hero / prose / stats / cards / CTA) — honoring the **placeholder-restriction policy** (`get_allowed_comps_by_ph`; enforce by default) — and authors page / datasource / child content via the **Marketer MCP** (load `sitecoreai-agent`, which powers it) **against preview — it does NOT publish** (preview-first; the single global publish is the final `/publish` step, `.agent/glossary.md` § "Preview-first delivery"); media via the 2-step `uploadMedia`. A live write is an **integration boundary** (preview → confirm → author → verify it landed on preview). |

## Entry gate — editing-host freshness (HARD, Content SDK content phase only)

**Skip entirely for freeform / blog / website channels.** For the Content SDK content phase this runs **before step 1** and is a hard stop.

The content phase's whole verification surface is the **editing-host preview** (`get_page_preview_url`) — that is what an author sees in Pages, and what this command's own Validation requires. If the editing host is not serving this run's components, every look-and-feel judgement made here is worthless: the author verifies against a locally rendered page while Pages shows missing components. **This has actually happened** — a host deployed once at provisioning and never redeployed sat 69 commits behind while the local build and Vercel both looked perfect.

**Assert all three before authoring anything:**

1. **The run's code is merged** to the branch the editing host builds (normally `main`). A pushed-but-unmerged feature branch rebuilds the old commit.
2. **The editing host has been deployed since that merge** — read `provisioning.editing_host.deployed_sha` from the run manifest (written by `/ship` step 4a) and confirm it contains this run's work. A green deployment status is not proof the right commit built.
3. **The deployment that ran started AFTER the merge commit** — read the EH environment's most recent deployment record and compare its start time to the merge timestamp. This is what rules out "green, but it built the pre-merge commit". **Do NOT try to prove freshness by fetching a page and grepping the markup:** the editing-host URL **403s** unauthenticated and `/api/editing/render` **302s into the OIDC login** even with the correct secret, so no headless fetch can reach the served markup. The deployment record is the only assertion available to an agent.

**Any assertion failing ⇒ STOP.** Do not author. Surface as a `[BLOCKER]`: *"Editing host is stale (serving `<sha>`, run expects `<sha>`). Run `/ship` step 4a to deploy it, or re-link it if it is upload-mode, before the content phase."* Authoring against a stale host produces content that cannot be visually audited and a `/test-content` pass that means nothing.

Record the assertion outcome in `operator_attention[]` with `stage: "author-content"`.

## Entry gate — brand voice and identity (HARD, pipeline runs)

**Skip for a freeform run with no spec**, where the interview asks instead. For every run that has a spec, this runs before step 1:

```sh
node .agent/scripts/check-brand-voice-section.mjs --spec <canonical_artifacts.prd>
```

**Exit 1 ⇒ STOP and ask. Do not invent a voice.** This is a genuine blocker, so it stops under every gate set, `fully_autonomous` included: surface a `[BLOCKER]` naming the fields it printed, offer to write the section with the operator (template: `sitecoreai-brand-voice`), have the Product Manager add it to the spec, re-run. The only way past without a section is the operator asking for placeholder copy for a build test: then use the technical-neutral register and say the copy is a placeholder. **Exit 2** means the spec path is wrong: fix it, nothing was judged.

Record `{ stage: "author-content", exit: <code>, at: "<iso>" }` in `notes.gates.brand_voice_section[]` via `manifest-write.mjs`. A section a human reads as thin but the script accepts is still your call: if the voice cannot be written from it, stop and ask anyway.

## Steps

0. **Credential pre-flight — before the first live call.** Run the pack's **`stages.implement.preflight_credentials`** pass (`.agent/packs/platform/content-sdk/pack.json`): every `checks[]` entry in one pass, applying each stated `remedy`. It is declared under `implement` only because that is where it was first written; its `applies_to` names this stage. **`go_live`-class — it runs regardless of the gate set.** Skip only for a pure-freeform run that writes nothing live. **Re-run it whenever this stage resumes after a gap** — the Marketer MCP token expires inside a long run and discovering that mid-authoring costs the tranche. Never work around a dead credential silently; flag it for rotation.
1. **Resolve context** (`product-workspace.md`) — detect whether a product + run manifest exist (pipeline step) or this is pure freeform.
2. **Run the interview** (above) unless the args already specify what / where / register / brand. Capture the brief.
3. **Spawn the Content Author (14)** — via `Agent(subagent_type: "content-author")` (applies its pinned `model`/`effort` — rule 72; include `Output Level: <minimal|verbose>` per rule 73) — with the resolved type/channel/register/brand/brief **and the resolved `scope_dial.imagery` tier**. Name the skills the job needs (assumed discovered): the voice skill per § *Which voice skill*; for a **Sitecore page** also `sitecoreai-content-composition`, `sitecoreai-agent` (Marketer MCP) and, at the `mood` tier, `sitecoreai-graphql-schemas` (media upload). For Sitecore chrome fill after Header/Footer components exist, also `content-sdk-website-build-flow` (Partial Design `__Renderings` wire recipe). Inventories the site's component palette first so it composes from real components for structure + look-and-feel — not one flat block. Also pass the **placeholder-restriction policy** (`content_policy.enforce_placeholder_restrictions`): the agent checks each placeholder's allowed set via `get_allowed_comps_by_ph` and composes accordingly — **enforce** = allowed renderings only (substitute or surface a disallowed one); **ignore** = best-fit + log deviations.
4. **Draft** in the chosen register; **name the register** at the top of the output; ground technical claims (skills / WebFetch) and flag anything unverified.
5. **Self-review** against the register + fingerprint and the channel's format (a blog needs a lead + headings + close; marketing copy needs a promise + CTA; Sitecore needs field-shaped content).
6. **Content QA gate — SPAWNED BY THE ORCHESTRATOR, never by agent 14.** The Content Author **returns** its draft and stops; the **orchestrator** then spawns the **QA Specialist (07) in content-review mode** (`Agent(subagent_type: "qa-specialist")` — applies its pinned `model`/`effort`, rule 72) to audit it against the four content axes (brand · voice-register fit · factual accuracy · channel format), and routes findings back to 14 for a fix loop until clean. *Skippable* for a throwaway freeform one-liner; **mandatory** in the Content SDK content phase. This is the **in-loop self-check** — the authoritative independent audit (content + structure + look-and-feel + optional brand kit) is the downstream **`/test-content`** stage.

   🔴 **Why the ownership is stated so precisely.** This step used to read *"spawn the QA Specialist"* addressed to the stage's own executor — but agent 14's frontmatter grants no `Agent` tool, so its assignee **could not perform it**, and a subagent cannot spawn a subagent regardless. The step did not error; it simply never happened, and the loop it describes silently did not exist. Measured cost on a prior run: the POC's own placeholder copy was authored into five live fields as real content and reached `/test-content` before anything caught it. **A contract must be executable by its assignee** — check the agent's granted tools before assigning it an action (`.agent/agents/README.md`), because frontmatter `tools:` is intent, not a runtime guarantee. Orchestrator ownership is also the correct shape independently: it keeps the auditor from being spawned by the author it audits, and matches how `/test-content` already runs.
7. **Land it:**
   - *freeform* → return / save.
   - *Sitecore (preview)* → author the items via the **Marketer MCP**, composing under the **placeholder-restriction policy** (enforce = only renderings `get_allowed_comps_by_ph` allows; ignore = best-fit + logged deviations). A live write is an **integration boundary**: **when `scope_dial.gates.go_live` is on** (default), present a preview, get explicit operator confirmation, author, then **verify it landed on preview**; **when off** (`fully_autonomous`), author unattended — but **still verify it landed on preview** (re-read the item / preview render), never skip verification. **Do NOT publish** — publishing is deferred to the final `/publish` step (`.agent/glossary.md` § "Preview-first delivery"). Never silently mutate a tenant *without at least verifying the write landed*.
   - *committed website* → same integration-boundary gate (preview → confirm → commit → verify).
   - *roadmap channel (blog / website adapter, T3)* → emit the draft + explicit landing steps; say the adapter is pending.

## Pipeline use — the content phase in the Content SDK branch

The Content SDK branch runs the content phase **after `/ship`**: `… → /test → /ship → /discover-components → /author-content → /test-content → /publish`. As that stage, `/author-content` populates the site **against preview** and runs its **in-loop** Content QA self-check, then hands off to **`/test-content`** (the authoritative, independent content audit — content + structure + look-and-feel, with an optional brand-kit axis). The **author ⇄ test-content loop** is bounded with QA (07) as the arbiter of "good enough" (glossary § "Content test"); publishing everything is the final **`/publish`** step:
- **Real brand content** — on-brand body copy for the real pages, in the voice the spec defines, authored into Sitecore via the Marketer MCP.
- **Test pages** — seed representative content so QA / smoke has something to render. Mark test content clearly.
- **Site chrome — decide + place what fills the Header/Footer Partial Designs.** `/provision-sitecoreai` created the **structure** (Header PD + Footer PD + Page Design, linked); **this command owns filling the partials.** Minimum: a **header** component + a **footer** component; add more if it makes sense for the brand (a promo/announcement bar, utility nav). Place those chrome renderings into `headless-header` (Header PD) / `headless-footer` (Footer PD) via the **Marketer MCP / Agent API** so chrome is inherited by every page through the Page Design — **site-wide, never per-page** (rule `80` § 1). The chrome renderings must already exist as registered components in `src/components/` (built during `/implement`); this step is the one-shot placement into the partials.

  **ENFORCED at phase close (see Validation).** Assert the chrome landed **via the Partial Designs** — read `__Renderings` on the Header PD and Footer PD and confirm each carries its chrome rendering (Header + Footer minimum). And assert chrome did **not** land per-page: a header/footer/announcement/promo rendering placed into an **individual page's own** `headless-header` / `headless-footer` instead of via the Page Design is a **hard finding to surface + fix** (move it into the Partial Design), **not** an accepted state — this is an **invariant** (rule `80` § 1), distinct from the enforce/ignore placeholder-restriction *policy* (which governs *which* renderings a placeholder allows, not *where* chrome lives).

- **Additional languages — only when `variables.languages.additional` is non-empty.** Skill: `sitecoreai-localization` § 2 steps 4-7, per extra language: language versions (an added version is EMPTY: fill it or translate it), Dictionary entries in every language, per-language composition (`__Final Renderings` is versioned; always pass `language` to the MCP). Run the rule-83 binding probe once per session, not per language. **Never `delete_content` to remove a language**: it deletes the whole item.

Both run through the **in-loop** Content QA gate (below); the **authoritative** fresh audit is then **`/test-content`** before `/ship`.

## Content QA gate (agent 07, content-review mode) — the author's in-loop self-check

> This is the **in-loop** self-check that runs *inside* `/author-content` (fast, same-session — so a standalone / freeform run still ships clean). It is **not** the authoritative gate: in the Content SDK pipeline the fresh, independent audit is **`/test-content`** (QA Specialist 07 with fresh eyes + Content Author 14 fixes — the content analogue of `/test`), which also covers **page structure** and **look-and-feel** and carries the optional **brand-kit** axis. Keep this in-loop check light; let `/test-content` be the gate.

The content phase does not close on the author's word alone. The **QA Specialist (07)** runs a **content rubric** — the *same* agent that does functional QA, a different command-injected task — against four axes:

- **brand** — the spec's "Brand voice and identity" section, or the brand kit it names: voice attributes, vocabulary, claims allowed
- **voice-register fit** — matches the stated register (loads the voice skill the run named)
- **factual accuracy** — technical claims grounded, not hallucinated
- **channel format** — blog lead/headings/close · marketing promise/CTA · Sitecore field-shaped content

Findings loop back to the Content Author (14) for fixes, same shape as `/test` → Developer. For Sitecore, QA also confirms the content **landed** (re-read), not just that the write call returned.

**Who spawns whom.** The **orchestrator** spawns 07 and routes findings back to 14 — the Content Author never spawns anything, because it holds no `Agent` tool. Read `.agent/agents/README.md` before assigning an action to an agent: if the tool is not in its frontmatter, the instruction is unexecutable and will fail **silently**, not loudly.

## Validation

- The interview was answered (what / where / register / brand) or the args supplied them.
- **The brand-voice entry gate ran** (pipeline runs): `check-brand-voice-section.mjs` exited 0 and its exit is recorded in `notes.gates.brand_voice_section[]`, or the operator explicitly asked for placeholder copy.
- The Content Author loaded the voice skill before writing, and the output names the register **and the source**.
- The output names the register used and flags any ungrounded technical claim.
- **Content QA gate ran** (agent 07, content rubric) and its findings were resolved or explicitly accepted before the phase closed — **mandatory** in the Content SDK content phase; skippable only for a throwaway freeform one-liner.
- **Sitecore channel:** content was authored via the **Marketer MCP** **against preview**; **no publish happened here** (deferred to the final `/publish` step — preview-first); after the write the item / preview render was re-read to confirm it landed. The verification surface is the **editing-host preview** (`get_page_preview_url`), **not Vercel** — Vercel is the LIVE surface, checked only after `/publish` (`.agent/glossary.md` § "Preview-first delivery" → Surfaces).
- **Sitecore channel — datasource placement decided, not defaulted:** the cross-page reuse pass ran before authoring, every datasource has an intended home (local `<Page>/Data` by default · global per-component container on ≥2-page reuse · chrome always local to its Partial Design), and each created item's **actual** path was read back and matches that intent (strays re-created in the right home, rebound with `set_component_datasource`, and deleted).
- **Sitecore channel — placeholder policy applied:** the operator was asked the enforce/ignore question and the answer persisted to `content_policy.enforce_placeholder_restrictions`. Under **enforce**, every placed rendering was in its placeholder's `get_allowed_comps_by_ph` allowed set (disallowed ones substituted or surfaced, never force-placed); under **ignore**, any out-of-allowed-set placement was recorded as a deviation.
- **Sitecore channel — images:** the empty-Image-field fill honored **`scope_dial.imagery`** — `mood` (Claude-generated abstract/decorative SVG) or `none` (left empty, noted); every linked image was landed via the Marketer MCP and **verified to render on preview** (a set field ≠ a visible image); **publish deferred to `/publish`**.
- **Content SDK phase — chrome filled via the Partial Designs (ENFORCED, invariant):** the Header and Footer Partial Designs carry their chrome renderings (Header + Footer minimum) — confirmed by reading `__Renderings` on each PD — so chrome is site-wide through the Page Design. **No header/footer/announcement/promo rendering is placed on an individual page's own `headless-header` / `headless-footer`** (per-page chrome); any found is a **hard finding surfaced + fixed** (relocated into the Partial Design), never accepted. This is separate from the placeholder enforce/ignore policy above.
- No write to a **live** channel without an operator-confirmed preview.
- Roadmap channels (blog / website, T3) emitted a draft + explicit landing steps (no pretend-publish).
- **`stage_history` entry appended** (pipeline runs) — `{ stage: "content_authored", agent: "14-content-author", outcome: "completed" | "partial", one_line: "<n> pages authored in <register>; imagery <tier>; chrome via Partial Designs", deliverables: [...] }`, plus the other seven schema-7 fields (`.agent/manifests/README.md` § "Stage history"). `content_authored` is the canonical name; this stage prescribed none until 2026-09-02, and one run's authoring phase **wrote its `operator_attention[]` items but no history entry at all** — the manifest read as though authoring had never happened until `/test-content` backfilled it.

## Output rules

- **Begin with an Operator Checkpoint** (Decisions / Assumptions / Concerns / Open questions) when run in a product/pipeline context; mirror non-empty items into `operator_attention[]` with `stage: "author-content"`.
- **Operator gate — SOFT, but the content audit is NOT optional for a rendered surface.** A pure freeform *text* return (no rendered page) just returns the content. But **any Sitecore / rendered content surface** — whether authored via this command OR directly / ad-hoc in the main thread — is **not "done" until it has been audited**: run the in-loop Content QA self-check, then run **`/test-content`** (the authoritative independent audit — structure + **imagery completeness** + look-and-feel; it enumerates every Image slot and fails on an empty one). **Do not report the content complete, and do not hand the operator a page to eyeball, before the audit has run and passed** — the operator is the approver, not the QA gate. Ad-hoc authoring that skips the audit routinely surfaces missing header/footer chrome and empty image galleries only at operator review — run the gates every time. A clean `/test-content` then recommends **`/publish`** (the final live step).
- **Hard stop** at a live-channel boundary without confirmation, when the brief asks for claims that cannot be grounded, or (Content SDK phase) when chrome could not be placed via the Partial Designs or per-page chrome was found and could not be relocated — surface it as a `[BLOCKER]` in the Operator Checkpoint.
