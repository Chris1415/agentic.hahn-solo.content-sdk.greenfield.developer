---
name: reference_sitecore_text_field_no_html_entities
description: "Content SDK <Text encode> double-encodes HTML entities — put LITERAL chars in plain-text fields via the Marketer MCP, entities only in RichText"
metadata: 
  node_type: memory
  type: reference
---

When authoring Sitecore content via the Marketer MCP (`update_fields_on_item`), the encoding you use depends on how the head-app component renders the field — verify by reading the component source, not by guessing.

- **Plain-text fields rendered via the Content SDK `<Text>` component** (single-line / multi-line Text templates): `<Text>` defaults to `encode=true` (confirmed in `@sitecore-content-sdk/react/types/components/Text.d.ts` — "If false, HTML-encoding of the field value is disabled"). So the SDK HTML-encodes the stored value. If you store `&amp;` / `&mdash;` / `&rsquo;`, the `&` gets re-encoded and the browser shows the LITERAL text `&amp;`. **Store the literal Unicode character instead** — `&`, `—` (U+2014 em-dash), `'` (U+2019). The em-dash and curly quotes are BMP chars and survive the MCP write (the 4-byte-emoji corruption trap does NOT apply to them — see the `sitecoreai-content-composition` skill).
- **Components that render a Text field's value as a raw React string child** (e.g. a headline split into words for a flourish, like a hero headline) have the SAME problem — React renders `Let&rsquo;s` as literal characters. Use the literal char.
- **RichText fields rendered via `<RichText>`** output raw HTML, so entities are CORRECT there (`&mdash;` → —). Only use entities in true RichText/HTML fields.

Trap hit live on a prior run's Home authoring (2026-07-13): first pass put `&amp;`/`&mdash;`/`&rsquo;` in Eyebrow/Title/Description/Intro/Answer/Quote/Headline — all `<Text>`-rendered — which would have shown literal entities. Fixed by re-authoring with literal chars. Field names are also case-sensitive (read the item first).
