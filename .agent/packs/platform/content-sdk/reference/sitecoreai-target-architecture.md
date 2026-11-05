# SitecoreAI target architecture: what "modern SitecoreAI" means

**The standing reference** for what a new SitecoreAI project looks like: the backend content architecture (headless SXA) and the head app (Content SDK, Next.js App Router). Every build and every migration is compared against it.
- **Build:** create to it.
- **Migration:** map each legacy element onto it (§ 4).
- Where a case is not covered: research it (Sitecore docs MCP first), record the answer here, and escalate to the operator when the docs and our measurements do not settle it (§ 0).

Compiled 2026-10-29 from four sources. Evidence files are in the session that wrote it; the durable citations are inline.

**Status marks** on every rule:
- **[P]** proven on our CM, with the run named
- **[D]** documented by Sitecore (doc.sitecore.com/sai or developers.sitecore.com Accelerate), URL in § 9
- **[S]** seen in Sitecore's own starter (`Sitecore/xmcloud-starter-js` @ `ecc1476`: 3 site templates, 55 JSON renderings, 2,406 serialized items)
- **[O]** open: undocumented or contradictory, probe before relying on it

A rule may carry several marks. A rule marked only [D] or [S] is believed, not proven on our CM.

## 0. How to use this reference

1. **Classify the source**: identify every element of the solution in front of you (page types, components, data, layout, settings, features).
2. **Map each element through § 4** (legacy pattern → modern target). Take the target as written.
3. **Not covered, or [O]:** research it in the Sitecore docs MCP (`search_sitecore_knowledge_sources`), then the starter repo, then a read-only look at a stock site on our CM. Add the answer here with its mark.
4. **Escalate to the operator** when:
   - the sources disagree;
   - the modern target would change what visitors see;
   - the choice is a product decision (e.g. drop a feature, change URLs);
   - or the target needs a capability the framework does not have yet (§ 6).
   Present the options with the evidence; never pick silently.
5. **Operator decision (2026-10-29): no stock (OOTB / skate-park) CONTENT components.** Every content component is a purpose-named PROJECT component, cloned from the stock one so it keeps the base templates. Title, PageContent, RichText, Promo, LinkList, Navigation and Image all become e.g. Page Title, Page Body, Teaser, Call To Action, Menu With Links, Primary Menu, Logo. Each has its own datasource template (based on the stock one, so field ids are kept), parameters template and headless variants. **Structure stays stock:** Container, Column Splitter and Row Splitter are the page-structure system authors lay out with.
6. **Modernize ≠ "map everything to stock components".** The modern target is headless SXA conventions:
   - purpose-named project components (cloned, with parameters, variants and per-component data folders);
   - presentation in designs;
   - data placed by scope.
   Stock components are used where they fit: structure, Title, PageContent, Navigation, LinkList, Image, and simple RichText. Sitecore explicitly advises against building most of the layout from generic Promo / RichText / PageContent [D: recommendations-using-renderings]. The starter's 55 renderings are almost all project components [S].

## 1. Principles

1. **Headless SXA is mandatory.** Non-SXA sites are unsupported, and SXA components do not work outside SXA sites [D: SXA FAQs, Accelerate content audit].
2. **Never modify OOTB items; never put custom items in SXA- or Sitecore-controlled branches.** They are overwritten on update. Custom items go in Project folders per collection [D: recommendations-extending-sxa].
3. **Presentation lives in designs, not template standard values.**
   - Partial designs carry the shared structure; page designs combine partials; page branches give flexible pages [D: recommendations-structuring-pages].
   - The starter's template standard values hold NO `__Renderings` [S].
   - (Measured on Habitat 2026-10-29: no page-template standard values carry layout; pages hold their own: § 6 G7.)
4. **Data by scope, local by default.**
   - Single-use content goes in the page's `Data` folder.
   - Reusable content goes in the site `Data` folder, grouped per component type.
   - Cross-site content goes in a shared site [D][S][P: two prior runs, Habitat page-local moves].
5. **Site-relative everything.** Datasource Locations and field Sources use tokens (`$site`, `$sharedSites`, `$home`, `$siteMedia` …), never hard-pinned paths [D: general-query-syntax][S][P: rule 84].
6. **Reproducible by construction.** Developer items are serialized per collection. New sites come from site templates / setup modules, not hand-built trees [D: serialization][S: 3 site templates with setup modules].
7. **Authorable or it is not done.** Every authored value arrives on `fields` and renders through an SDK field component (rule 86) [P].

## 2. Backend: headless SXA content architecture

### 2.1 Collection, module, Project folders

- **Hierarchy:**
  - A site collection (tenant) is mandatory, even for one site.
  - Templates, renderings and shared content are reusable only within one collection [D: create-a-headless-site-collection-and-site].
  - Use one collection per brand with its own content team; regional sites that share content sit in one collection [D: Accelerate site-management].
- **Module:** creating a collection creates its headless module at `/sitecore/system/Settings/Project/<collection>`. Custom components and setup scaffolding hang off it [D][S: setup modules under `Settings/Project/click-click-launch`].

| What | Path (per collection) | Marks |
|---|---|---|
| Templates | `/sitecore/templates/Project/<collection>/…` | [D][S][P] |
| Branch templates | `/sitecore/templates/Branches/Project/<collection>/…` | [D][S] |
| Renderings | `/sitecore/layout/Renderings/Project/<collection>/<Group>/<Name>` | [D][S][P] |
| Placeholder settings | `/sitecore/layout/Placeholder Settings/Project/<collection>/…` | [D][S][P] |
| Layouts (custom only; keep the Headless Layout) | `/sitecore/layout/Layouts/Project/<collection>` | [D] |
| Media | `/sitecore/media library/Project/<collection>/{shared, <site>}` | [D][P] |
| Site content | `/sitecore/content/<collection>/<site>` | [D][P] |

Our own convention adds a `<Site>` level inside the Project folders for organisation (rule 80 § 0). That is not isolation: renderings and templates stay collection-scoped (rule 84) [P].

### 2.2 The site tree

| Node | Purpose | Marks |
|---|---|---|
| `Home` | the pages; start item of the site | [D][P] |
| `Media` | a VIRTUAL scoped view of media folders (`Additional Children`). Never upload into it | [D] |
| `Data` | reusable datasources, one subfolder per component type, each a `<Component> Folder` item whose `__Masters` inserts that datasource template | [D][S: 24–32 subfolders per site][P] |
| `Dictionary` | per-site phrases; read via GraphQL; untranslated key returns the KEY | [D][P: Habitat 150 entries] |
| `Presentation/Available Renderings` | the Page builder toolbox, grouped. A component missing here cannot be added by authors | [D][S][P as failure: one site, 7 of 21] |
| `Presentation/Headless Variants/<Component>/<Variant>` | author-selectable presentations; variant item name = named export | [D][S: 144 variants][P] |
| `Presentation/Page Branches` | preconfigured flexible pages (landing pages) with local data copies, offered by insert rule | [D][S][O on our CM] |
| `Presentation/Page Designs` | page design items + the template → design mapping | [D][P] |
| `Presentation/Partial Designs` | shared layout fragments (header, footer, page-type sections) with a unique `Signature` | [D][S][P] |
| `Presentation/Placeholder Settings` | site-level placeholder restrictions; partial designs need `Partial Design/<name>` (key `sxa-<signature>`) | [D][P] |
| `Presentation/Styles` | style groups + styles, each listing the renderings allowed to use it | [D][S][P] |
| `Presentation/Enumerations` | option items for parameter droplists (`Value` field), referenced by `$site/Presentation/Enumerations/…` | [S][P: create-component skill] |
| `Settings` | site settings: Robots, Error Handling, sitemap config, Redirects, Standard Values, Shared Site Settings | [D] |
| `Settings/Site Grouping/<site>` | host name, start item, language, rendering host, analytics identifier (POS), item language fallback | [D][P] |

### 2.3 Templates

- **Page templates MUST inherit `Page`** `{3F8A6A5D-7B1A-4566-8CD4-0A50F3030BD8}` (`/sitecore/templates/Foundation/Experience Accelerator/Multisite/Content/Page`) [D].
  - The collection has its own `Page` template; page types (Home, Landing, Detail, Article, Product …) inherit it [S][P].
- **Reusable underscore bases** compose page fields: `_Title Base`, `_Image Base`, `_Summary Base`, `_Navigation Base`, `_Site Metadata` (extends `_Open Graph Base`), `_Indexing Base`, `_Common Taxonomy Base` [S]. Prefer them to one wide page template.
- **Datasource templates:**
  - Under `Project/<collection>/Components/<Group>/`. Bases: Standard template + the headless datasource base (`44a022db…` in the starter) [S]. Rule 80: `_PerSiteStandardValues` on standard datasources; list containers add the publishing-grouping bases [P].
  - Each has a `<Name> Folder` template whose standard values `__Masters` insert the datasource template and the folder itself (dashed GUIDs) [S][P].
- **Field Source** uses tokens: Image `query:$siteMedia`, Rich Text `query:$xaRichTextProfile`, General Link `query:$linkableHomes`, lists `query:./*[@@templatename='X']` or `$site/…` [D][S][P].
- **Workflow defaults** on standard values: datasource templates and page templates carry `__Default workflow` [S] (Basic Workflow for pages, Basic Datasource Workflow for datasources [D]).
- **Standard values hold defaults only, never presentation** (§ 1.3).

### 2.4 Where data goes (decision table)

| Content is … | Put it … | Reference it by | Marks |
|---|---|---|---|
| about the page itself (title, summary, metadata, nav title, product facts) | a page field (via an underscore base) | the component reads the context page (PageContent-type, no datasource) | [D][S] |
| used by one page only | the page's `Data` folder (`Page Data` folder template) | `page:/Data/<item>` (always under the page); workflow follows only page-relative datasources | [D][P] |
| part of a partial design (header logo, footer columns) | under the partial design's own `Data` | `local:/Data/<item>` (inside a partial, `local:` resolves under the partial) | [D][S: `local:/Data/Global Footer`][P: rule 80 chrome is local to the partial] |
| reused across pages of one site | site `Data/<Component type folder>` | Datasource Location query, below | [D][S][P] |
| reused across sites of one collection | a SHARED site's `Data` | the `$sharedSites` half of the same query | [D][S][O on our CM] |
| reused across collections | not supported. Duplicate, or use a delegated area / clone | — | [D] |

**Datasource Location** on every reusable rendering is two-part, site then shared [D][S][P: recreate already writes it]:

```
query:$site/*[@@name='Data']/*[@@templatename='<Folder template>']|query:$sharedSites/*[@@name='Data']/*[@@templatename='<Folder template>']
```

Accelerate asks for BOTH a local and a site-level location per rendering [D]. Page-local auto-creation is the rendering's `IsAutoDatasourceRendering=true` / the Component wizard's "auto-create under page" [D][S].

**Datasource categories** (which pattern a component is) [D: data-sources]:
- no datasource (Navigation)
- optional datasource that defaults to the page (Title, PageContent)
- single fixed datasource (site-wide singleton)
- reusable (Datasource Location + Template set)

### 2.5 Components (rendering definitions)

- **Create by cloning:**
  - With a datasource → clone **Promo**. Without one → clone **PageContent**.
  - Use Scripts › Clone Rendering into the collection's Project module, with "make a copy" on the Parameters and Datasource tabs [D: Accelerate creating-new-components].
  - Alternative: the Component wizard for components unlike any stock one [D].
  - Our `content-sdk-create-component` skill clones over Authoring GraphQL [P].
- **Name by purpose** (Teaser, Call to Action), not generic. PascalCase component names, camelCase fields [D].
- **Rendering fields:**

| Field | Value | Marks |
|---|---|---|
| Template | `Json Rendering` `{04646A89-996F-4EE7-878A-FFDBF1F0EF0D}` | [S][P] |
| `componentName` | = component-map key | [S][P] |
| Datasource Template | a template or branch-template PATH | [S][P] |
| Datasource Location | the two-part query | [S][P] |
| Parameters Template | linked by dashed GUID | [S][P] |
| `OtherProperties` | `IsRenderingsWithDynamicPlaceholders=true`; `IsAutoDatasourceRendering=true` where needed | [S][P] |
| `Open Properties after Add` | set | [S] |
| `__Icon` | set | [S][P] |

- **Data shape:**
  - Flat → Datasource Content Resolver.
  - List / children → a GraphQL `ComponentQuery` (`$datasource`, `$language`, `jsonValue`), the resolver cleared. A resolver wins over a query.
  - Not every list is owned rows: a view derived from other pages and a large shared library are fetched server-side (cached, revalidated on publish), a curated set is a Multilist. Decide the class first (`content-sdk-collection-data-model`). Content resolvers are not supported with Edge runtime publishing [D].
  - [S: 23 of 55 use ComponentQuery][P: rule 80]. Custom content resolvers are unsupported [D].
- **Parameters template bases:**
  - Docs: `Base Rendering Parameters` (= IStyling + IComponentVariant + Grid Parameters) + `IDynamicPlaceholder` + `IRenderingId`; `_PerSiteStandardValues` only when site-specific standard values are needed [D].
  - Starter: Standard Rendering Parameters + two headless bases (`5c74e985…`, `44a022db…`) [S].
  - Ours (rule 80): the 4-base set cloned from Promo Parameters [P: three prior runs]. Measured on Habitat: `3db3eb10` + `4247aad4` + `44a022db` + `5c74e985`, the same set as the starter's older parameters templates [P][S].
  - **[O] G2:** which base supplies `Styles` / `FieldNames` / `GridParameters` on our 4-base set has never been written down. Reconcile against a live Promo Parameters read before the next schema change.
- **Parameters vs fields:** parameters carry presentation (colour scheme, orientation, height, columns), as droplists over `Presentation/Enumerations`. Fields carry content [S][P].
- **Variants vs siblings vs parameters:**
  - Same data, different markup → a headless variant.
  - Different data → a sibling component.
  - A small presentational switch → a parameter (skill `content-sdk-variants-vs-siblings`) [D][S][P].
- **Register:**
  - Add the rendering to the site's Available Renderings group [D][S].
  - Set placeholder restrictions (`Allowed Controls`) where a slot only takes certain components [D][S].

### 2.6 Presentation

- **Layout:**
  - The Headless Layout has three root placeholders: `headless-header`, `headless-main`, `headless-footer`. Do not change it [D][P].
  - Devices are not a SitecoreAI concept: responsive front end only.
- **Partial designs** hold the structure that is fixed per page type: header, footer, article skeleton.
  - Components placed directly on a page design do NOT render. Partials in one page design need distinct `Signature`s [D][P].
  - Partials carry their own local data [S].
  - On our CM a partial renders only with its `Placeholder Settings/Partial Design/<name>` item, and the CM caches partial content until an environment restart [P: rule-0 recreate notes].
- **Page designs** combine partials and are mapped to page templates (`Presentation/Page Designs` → TemplatesMapping / Designing section). A single page may name its own design [D][P].
- **Page branches** are for flexible pages (landing pages, campaign pages): the page gets local copies of components and data, offered through an insert rule, published before use. Prefer site-specific page branches over standard values for modifiable presentation [D][S: landing pages ship with page Data][O on our CM].
- **Extension points:** place an empty Container (or a component with an empty placeholder) in a partial design and restrict what it takes [D].
- **Structure**, two documented forms:
  1. Stock `Container` / `Row Splitter` / `Column Splitter` with grid parameters (`EnabledPlaceholders`, `ColumnWidthN`). Keys `container-{id}`, `column-{n}-{id}`, `row-{n}-{id}`, at most 8 [D][P: 232 routes measured].
  2. Project container components with fixed slots (starter: `Container 50 50` → `container-fifty-left-{*}` / `-right-{*}`) [S].
  - Docs prefer grid settings over splitters where a component can carry the grid itself [D].
  - Layout XML must carry the RESOLVED dynamic key (`column-1-1`); the literal `{*}` form places nothing [P].
- **Dynamic placeholders:**
  - Every nested placeholder is dynamic (`<key>-{*}` settings item, `IsRenderingsWithDynamicPlaceholders`).
  - Static nested keys were declared but delivered empty on our CM [P: Habitat 2026-10-24].
  - Legacy JSS `{GUID}-N` placeholders are unsupported [D].
- **Styles** are per site, offered per rendering; Edge delivers the class names in `params.Styles` [D][P].
- **Headless variants:**
  - `FieldNames` in the layout = the variant item GUID, and the Layout Service turns it into the name.
  - Once any variant exists, an omitted `FieldNames` means the FIRST child, so always create an explicit `Default` [P].
  - The starter ships `Default` variants for all its variant-capable components [S].

### 2.7 Multisite and sharing

- **Scope:** renderings and templates are collection-scoped. Available Renderings, Headless Variants, page and partial designs, Placeholder Settings and Styles are site-scoped (rule 84) [P].
- **Shared site:** select it in the collection's `Sharing` section. Other sites then use its datasources, page and partial designs, styles and variants (Accelerate adds available renderings, page branches, placeholder settings, redirect maps, page templates) [D][O on our CM].
- Delegated areas share pages; cloning duplicates a site [D].
- Cross-site linking via linkable sites (`$linkableHomes`) [D].

### 2.8 Languages

- **Add a language:** add it under `/sitecore/system/Languages`, enable it per site, then do a full site publish [D][P partly: sitecoreai-localization].
- **Fallback:** item and field language fallback need `Enable item language fallback` on the site grouping. Edge fallback is off without the environment setting (decision `D-fallback`) [D][P].
- **Dictionary:** per site; share it by setting `Fallback Domain` on other sites' Dictionary item [D]. Publish `/Dictionary` with subitems, because a single entry does not refresh Edge [P].
- **Content languages:** each language is a real version. Our `__Revision` presence = version (ItemService answers 200 for any language) [P].

### 2.9 Site settings (`Settings` + Site Grouping)

| Setting | Where / how | Marks |
|---|---|---|
| robots.txt | `Settings` › Robots › `Robots content`. EMPTY serves `User-agent: * / Disallow: /`. Sitemap line added automatically | [D][P: 5 of 6 sites shipped Disallow] |
| sitemap | SXA-generated (`siteInfo.sitemap`); head app route handler | [D][P head side][O: CM-host Sitemap line trap] |
| error pages | create 404 / 500 pages; `Settings` › Error Handling links (or Channels › Error pages); republish site root; App Router supports per-site | [D][O on our CM] |
| redirects | Redirect item under a page or a redirect map; republish site root; set target hostname + scheme on site definitions; served via `siteInfo.redirects` + `RedirectsProxy` | [D][O on our CM] |
| rendering host | Site Grouping `RenderingHost`; module include `CreateOnly` so pushes do not reset it | [P] |
| analytics identifier | assign per site language (API assigns only; created in the portal) | [P] |

### 2.10 Platform features that replace XP-era ones

| Need | SitecoreAI | XP-era thing it replaces | Marks |
|---|---|---|---|
| personalization | embedded personalization: page / component variants for audiences in Page builder; "headless experiences" (personalization = 1 variant, A/B/n = 2–6), phased rollout | XP rules engine, profile cards / patterns, conditional renderings | [D][P partly: skills; migrate parks it] |
| A/B testing | component / page A/B in Page builder | XP content testing | [D] |
| analytics / events | Content SDK events + consent (our skill) | xDB / xConnect | [D partial][P: consent skill] |
| search | SitecoreAI integrated search: content / site sources (phased rollout) + Content SDK search UI | Content Search / Solr / Coveo | [D][P read-only] |
| forms | SitecoreAI Forms + `Form` rendering | WFFM, Sitecore Forms (Experience Forms) | [D][O: no recipe yet] |
| workflow | Basic Workflow (pages) + Basic Datasource Workflow | custom workflows | [D][P: migrate rebuilds workflows] |
| delivery | Experience Edge (preview / live), publishing API, Edge webhooks, OSR | CD servers, HTML cache | [D][P] |
| AI context | AI Config items (FAQ, Services, Summary) in the site, for SitecoreAI's agents / llms.txt | — | [S][O] |

### 2.11 Serialization

- **Module grain:** one SCS module per collection (namespace `Project.<collection>`), and each site adds an include [D][P].
- **What to serialize:** developer-created items (templates, branches, renderings, placeholder settings, layouts, modules, the site root, Presentation, Settings, Data containers, Dictionary). Media folders, never media assets [D].
- **Push operations:**
  - Dev items: `CreateUpdateAndDelete`.
  - Content: `CreateAndUpdate`, or `CreateOnly` for author-owned items.
  - Site Grouping: `CreateOnly`.
  - Home: `SingleItem` `CreateOnly`.
  - [D: Accelerate template.module.json][P].
- **IAR vs post-deploy:** Items as Resources for developer-owned items; post-deploy `scsModules` for author-managed content. A database edit overrides an IAR item [D].

## 3. Head app: Content SDK, Next.js App Router

- **Version line:** `@sitecore-content-sdk/nextjs` `latest` = **2.5.0** (2026-10-29), `legacy` = 2.4.1; `create-content-sdk-app` `latest` = 2.4.2 (npm, read 2026-10-29). SDK 2.x needs Next 16; OSR needs ≥ 2.2. 2.5.0 changes the OSR request body (no `tags[]`) and adds JSON-LD [D][O: re-run the OSR controls before moving our floor].
- **Scaffold literally:** `npx create-content-sdk-app@latest --template nextjs-app-router` (`nextjs-app-router-cache-components` for OSR; `nextjs` = Pages Router; `angular`). Never hand-write `package.json` / `next.config.*` (rule 50) [D][P].
- **App structure:**
  - `src/app/[site]/[locale]/[[...path]]/page.tsx` + `[site]/layout.tsx`
  - `api/editing/{config,render}`, `sitemap`, `robots` route handlers
  - `sitecore.config.ts` + `src/lib` SitecoreClient
  - generated `.sitecore/` (component-map server + client, `sites.json`, `metadata.json`)
  - `src/proxy.ts` chain
  - [S][D][P]
- **Proxy chain:** preview → bot tracking → locale → multisite → redirects → personalize. The starter lags this (no bot tracking): copy the TEMPLATE, not the starter [D][P].
- **Components:**
  - One folder per component.
  - Named exports per headless variant (`Default` + the variant item names). The SDK renders `component[params.FieldNames]` with NO fallback: a variant must be its own export, never an internal switch.
  - Props in a sidecar `*.props.ts`.
  - The component map is generated and never edited. `'use client'` components land in both maps [S][P].
  - Only author-facing components are exported from the components folder; helpers and atoms live elsewhere [D].
- **Fields:** render every authored value through `Text` / `RichText` / `Image` / `Link` / `DateField` from `@sitecore-content-sdk/nextjs` (never `/react`), editing-safe (`isEditing || hasValue`) [P: rule 80, 86].
- **Placeholders:**
  - `AppPlaceholder` with the server component map for nested slots.
  - Structure components use the resolved dynamic keys.
  - `PartialDesignDynamicPlaceholder` is part of the stock set [S][P].
- **Styles and grid:** apply `params.styles` and the grid classes verbatim, and guard against an undefined `styles` (the starter prints `undefined`) [S][P: layout-composition skill].
- **Data:**
  - One `getPage(path, { site, locale })` per route; `draftMode()` → `getPreview` / `getDesignLibraryData`.
  - Dictionary via `getDictionary` + next-intl.
  - Component-level GraphQL for lists.
  - **[O] G9:** is `getComponentData` still needed in App Router? The starter's skate-park calls it; our skill says no.
  - **[O] G10:** `useSitecore()` vs the `page` prop. The docs prefer the `page` prop and Server Components.
- **Rendering and caching:**
  - Default SSG/ISR from the App Router template.
  - On-demand revalidation only via the Cache Components template + an Edge webhook (`content-sdk-app-router-cache-components-and-osr`).
  - A Cache Components app needs a Vercel Preview served-HTML proof before production (rule 85) [P].
- **SEO / ops:**
  - sitemap and robots route handlers;
  - error pages from the site's Error Handling (`getErrorPage`);
  - metadata from page fields;
  - consent-gated analytics (mandatory when tracking);
  - [P][D].
- **Deployment:**
  - `xmcloud.build.json` `renderingHosts` (type `sxa`) for the editing host.
  - The public host on Vercel with the LIVE Edge context id for both env vars.
  - Never set the app's `.env.local` names on an editing-host environment [P].

## 4. Modernization map: legacy pattern → modern target

| Legacy (XP / XM / JSS) | Modern SitecoreAI target | Decide at the MODEL gate? |
|---|---|---|
| non-SXA site (Helix MVC, WebForms, XSLT) | headless SXA collection + site; components as JSON renderings in Project | no (mandatory) |
| `<site>` config definitions | collection + site + Site Grouping | no |
| Helix Foundation / Feature / Project layering of templates | Project/<collection>/{Components/<Group>, Site, …} + underscore bases | no |
| page template with layout on standard values | page template on `Page` + page design (+ partial designs); layout off standard values | yes (G7: our recreate still writes SV layout) |
| hard-wired chrome (controller / XSLT / `sc:XslFile` / `Html.Sitecore().Rendering`) | header / footer partial designs with local data | no |
| grid / column sublayouts | stock Container + Column Splitter (grid params), or project containers | yes (which form) |
| generic content blocks (teaser, CTA, text+image) | purpose-named clones of Promo with variants; stock Promo / RichText only for genuinely generic content | yes |
| page title / body / nav / link lists / image | stock Title / PageContent / Navigation / LinkList / Image | no |
| breadcrumb | project component (no stock breadcrumb) | no |
| rendering variants (SXA MVC), alternative sublayouts | headless variants (named exports) | no |
| rendering parameters / CSS classes | parameters template with enumerations; Styles | no |
| datasource used by one page | page `Data` folder, `page:` | no |
| `Global` / shared content folder | site `Data/<Component> Folder`, or a shared site | yes (site vs shared) |
| microsites / sister sites | sites in one collection (+ shared site) | yes |
| landing / campaign pages | page branches | yes |
| devices (mobile / print) | none: responsive front end | no (finding) |
| XP personalization rules / profiles / patterns | embedded personalization (page / component variants for audiences) | yes (rebuild or park) |
| XP content tests | Page builder A/B | yes |
| WFFM / Sitecore Forms | SitecoreAI Forms + Form rendering | yes (rebuild or drop) |
| Content Search / Solr search pages | integrated search sources + Content SDK search UI | yes |
| xDB / xConnect, goals in code, FXM | Content SDK events + consent; FXM has no equivalent | yes (drop or replace) |
| commerce (uCommerce, XC) | none in SitecoreAI; external commerce via BYOC / integration | yes |
| custom pipelines / code-behind logic | head-app code, or component GraphQL; never CM code | case by case |
| dictionary | site Dictionary | no |
| redirects modules | redirect items / maps | no |
| custom 404 / 500 | Error Handling pages | no |
| robots / sitemap modules | Settings Robots + SXA sitemap | no |
| workflows | Basic Workflow / Basic Datasource Workflow (or rebuilt definitions) | yes (when custom) |
| languages + fallback | site languages + Site Grouping fallback + Edge fallback setting | yes (D-fallback) |

## 5. Where our migrations stand against this reference

| Site | Source | What it became | Gap to the reference |
|---|---|---|---|
| Lighthouse ×4 (XP 10.4 SXA MVC) | SXA already | recreated 1:1 SXA-to-headless (designs, partials, variants, styles carried) | Presentation largely conforms. Check Available Renderings (G1) and page-template SV layout (G7). |
| Habitat (9.0 Helix MVC, Unicorn) | non-SXA | 1:1 legacy (`HabitatLegacy`) + modernized (`Habitat`, live) | Validation 2026-10-29 (read-only, serialized CM): G1 confirmed (no custom component offered to authors), G7 refuted (layout is per page, chrome in partials, as prescribed), G2 a Sitecore-shipped base set. Still open: G8 (stock Promo / RichText vs purpose-named clones), the T3 visual compare, the Page builder authoring check. |
| OfficeCore (9.3, XSLT + WebForms, packages) | non-SXA | not recreated yet | Needs most of § 4: partial designs for the hard-wired chrome, page branches for landing pages, microsites as sites, personalization, search, forms, devices dropped. |

## 6. Gap register: framework vs reference

| # | Gap | Effect | Status |
|---|---|---|---|
| G1 (fix approved 2026-10-29) | `recreate.mjs` never registers renderings in Available Renderings | **confirmed 2026-10-29** on the serialized CM: `Habitat` offers only the 13 stock renderings of site creation; 44 of its 53 placed renderings (every project one) are not offered, `HabitatLegacy` 72 of 72 — authors cannot add any custom component in Page builder | **defect**, fix in recreate + regenerate |
| G2 | parameters base set: docs (Base Rendering Parameters + IDynamicPlaceholder + IRenderingId) vs our 4-base Promo clone vs starter bases | Habitat's 44 / 72 parameters templates all use one 4-base set (`3db3eb10` + `4247aad4` + `44a022db` + `5c74e985`), identical to the starter's OLDER parameters templates; the starter's newer ones use Standard Rendering Parameters `8ca06d6a` + `5c74e985` + `44a022db` | partly resolved: a Sitecore-shipped pattern; map the GUIDs to names with one live read |
| G3 | page branches not used by any recreate | landing pages lose flexible-page authoring | open |
| G4 | shared site never configured or used | cross-site content duplicated | open |
| G5 | error pages, redirect maps on the CM side not handled | 404/500 and redirects fall back to head-app defaults | open |
| G6 | forms have no recipe | forms dropped in every migration | open |
| G7 | ~~migrated page templates carry layout on standard values~~ | **refuted 2026-10-29**: 0 page-template standard values with layout on either Habitat site; each of the 52 pages holds its own layout and header / footer come from partial designs, as the reference prescribes. What remains open is per-page-type page designs beyond header / footer and page branches (G3) | closed |
| G8 | modernize maps generic content onto stock Promo / RichText rather than purpose-named clones | Habitat: 13 source renderings on stock Promo ×5 variants (97 placements), LinkList ×2, Navigation ×2, Title ×2, PageContent, RichText | **decided 2026-10-29: build purpose-named project clones for all stock CONTENT mappings; structure stays stock.** Framework: `recreate.mjs` `stock_mode: clone` (default), `clone_names` at the gate. Habitat re-recreate pending. |
| G9 | `getComponentData` in App Router (starter calls it, skill says no) | data-strategy ambiguity | open, knowledge probe |
| G10 | `useSitecore()` vs `page` prop | component style ambiguity | open, follow docs (page prop) until probed |
| G11 | SDK 2.5.0 (OSR body without `tags[]`, JSON-LD) not yet adopted | floor at 2.4.1 | open, re-run OSR controls |
| G12 | hard-pinned Datasource Location (rule 84) has no mechanical gate | silent cross-site datasource lookups | open |
| G13 | AI Config items (FAQ / Services / Summary) unknown to the framework | SitecoreAI agent context missing on built sites | open, knowledge probe |

## 7. Validation queue (next)

1. **Habitat modernize vs this reference** (the operator's ask, 2026-10-29):
   - read-only CM checks for G1, G2, G7;
   - the never-recorded T3 visual compare and Page builder authoring check;
   - a G8 review of which stock mappings should become purpose-named clones.
2. **OfficeCore mapping through § 4**, with the decisions it raises put to the operator at the MODEL gate.

## 8. Glossary links

Glossary § "Content architecture" (preserve vs modernize) now points here: **modernize = map onto this reference**, not "use stock components wherever possible".

## 9. Sources

- Site items and tree: https://doc.sitecore.com/sai/en/developers/sitecoreai/content-modeling-and-presentation/sitecoreai-for-developers/content-editor-items.html · create-a-headless-site-collection-and-site.html
- Data sources and prefixes: …/content-modeling-and-presentation/data-sources.html · …/data-sources/use-a-prefix-to-set-the-data-source-context.html · …/best-practices/recommendations--working-with-data-sources-and-media.html
- Query tokens: …/data-templates/sitecore-query/general-query-syntax.html
- Components: https://developers.sitecore.com/learn/accelerate/sitecoreai/implementation/developer-experience/creating-new-components · …/pre-development/developer-considerations/component-design-best-practices · doc …/components/walkthrough--building-a-simple-custom-component.html · …/use-the-component-wizard-to-create-a-custom-component.html · …/copy-and-customize-a-component.html · …/best-practices/recommendations--using-renderings.html · …/recommendations--extending-sxa.html
- Variants: …/components/create-a-variant-for-a-component.html
- Designs and branches: …/best-practices/recommendations--structuring-pages.html · users …/build-pages/building-page-templates-and-branches.html · …/create-and-configure-a-page-branch.html · users …/page-designs-and-page-branches/create-and-assign-a-page-design-in-the-content-editor.html
- Sharing: …/sharing-content/share-data-sources-and-presentation-between-sites.html · Accelerate site-management
- SEO / errors / redirects: …/search-engine-optimization--seo-/configure-the-robots-txt-file.html · …/sites/configure-a-custom-static-error-page.html · users …/redirect-urls.html · Edge query examples (siteInfo)
- Personalization: users …/headless-personalization-and-abn-testing.html
- Serialization: Accelerate setup-content-serialization · Accelerate template-module-json
- Layout response: …/content-rendering/layout-query-and-response.html
- Starter: `xmcloud-starter-js` @ `ecc1476` (`authoring/items`, `examples/*`)
- Framework evidence: rules 80, 84, 85, 86; `.agent/framework-reference.md` (migrate, rung 0, modernize, Habitat, Lighthouse)
