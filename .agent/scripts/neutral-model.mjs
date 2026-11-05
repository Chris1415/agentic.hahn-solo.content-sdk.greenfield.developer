#!/usr/bin/env node
/**
 * neutral-model.mjs — the /migrate neutral content model: validate it, and adapter #1 (scrape).
 *
 *   node .agent/scripts/neutral-model.mjs --from-content-dump <content-dump.json> --out <neutral-model.json>
 *   node .agent/scripts/neutral-model.mjs --round-trip <content-dump.json>   # exit 0 iff lossless
 *   node .agent/scripts/neutral-model.mjs --validate <neutral-model.json>
 *
 * The scrape adapter is a CONVERTER over the clone harness's `content-dump.json`, not a change to
 * /source-analysis: the clone flow keeps writing exactly what it writes today (brief Decision 20),
 * and the round trip proves the neutral model loses nothing of it. Schema (editor support):
 * `.agent/templates/neutral-model.schema.json`. Pure Node, no deps.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = 1;
const CHANNEL_KINDS = ['scrape', 'serialization', 'item-service', 'authoring-api', 'db-restore', 'repo'];
const TIERS = ['inferred', 'extracted'];
// Rung 0 (code only) has no running system: a fact from a live channel there would be invented.
const CODE_ONLY_KINDS = ['serialization', 'repo'];

/** content-dump.json → neutral model. Every scraped fact is tier `extracted` for text, from channel `scrape`. */
export function fromContentDump(dump, { ref = null } = {}) {
  const pages = Object.entries(dump.pages ?? {}).map(([slug, page]) => {
    const { url, title, sections, ...rest } = page;
    return {
      id: slug,
      url,
      item_id: null,
      title: title ?? null,
      language: null,
      sections: sections ?? [],
      provenance: { channel: 'scrape', tier: 'extracted' },
      // Everything else the dump carries rides along unchanged, with its key order, so the
      // round trip is byte-identical rather than merely equivalent.
      scrape: { key_order: Object.keys(page), extra: rest },
    };
  });
  return {
    neutral_model_version: VERSION,
    source: { system: 'scrape', variant: null, xdb: null, rung: 1, entry: dump.entry ?? null },
    channels: [{ id: 'scrape', kind: 'scrape', captured_at: null, ref }],
    pages,
    content_types: [],
    items: [],
    renderings: [],
    media: [],
    redirects: [],
    customizations: [],
    findings: [],
    id_map: {},
    scrape: { dump_key_order: Object.keys(dump), extra: Object.fromEntries(Object.entries(dump).filter(([k]) => k !== 'entry' && k !== 'pages')) },
  };
}

/** neutral model → content-dump.json, from the scrape-channel facts only. */
export function toContentDump(model) {
  const pages = {};
  for (const p of model.pages ?? []) {
    if (p.provenance?.channel !== 'scrape') continue;
    const known = { url: p.url, title: p.title, sections: p.sections };
    const all = { ...p.scrape?.extra, ...known };
    const order = p.scrape?.key_order ?? Object.keys(all);
    const page = {};
    for (const k of order) if (k in all) page[k] = all[k];
    pages[p.id] = page;
  }
  const body = { ...model.scrape?.extra, entry: model.source?.entry, pages };
  const order = model.scrape?.dump_key_order ?? ['entry', 'pages'];
  const out = {};
  for (const k of order) if (k in body) out[k] = body[k];
  return out;
}

/** Structural validation — returns a list of problems (empty = valid). */
export function validateModel(m) {
  const bad = [];
  if (!m || typeof m !== 'object') return ['not an object'];
  if (m.neutral_model_version !== VERSION) bad.push(`neutral_model_version must be ${VERSION}`);
  if (!m.source || typeof m.source.system !== 'string') bad.push('source.system missing');
  if (![0, 1, 2, 3].includes(m.source?.rung)) bad.push('source.rung must be 0 | 1 | 2 | 3');
  if (!Array.isArray(m.channels) || m.channels.length === 0) bad.push('channels must be a non-empty array');
  const channelIds = new Set();
  for (const c of m.channels ?? []) {
    if (!c.id) bad.push('a channel has no id');
    if (!CHANNEL_KINDS.includes(c.kind)) bad.push(`channel ${c.id}: kind "${c.kind}" not one of ${CHANNEL_KINDS.join('|')}`);
    if (m.source?.rung === 0 && !CODE_ONLY_KINDS.includes(c.kind)) bad.push(`channel ${c.id}: kind "${c.kind}" needs a running site, and rung 0 has none (allowed: ${CODE_ONLY_KINDS.join('|')})`);
    channelIds.add(c.id);
  }
  if (!Array.isArray(m.pages)) bad.push('pages must be an array');
  const ids = new Set();
  for (const p of m.pages ?? []) {
    if (!p.id || !p.url) bad.push(`page ${p.id ?? '?'}: id and url required`);
    if (ids.has(p.id)) bad.push(`page ${p.id}: duplicate id`);
    ids.add(p.id);
    if (!channelIds.has(p.provenance?.channel)) bad.push(`page ${p.id}: provenance.channel "${p.provenance?.channel}" names no declared channel`);
    if (!TIERS.includes(p.provenance?.tier)) bad.push(`page ${p.id}: provenance.tier must be inferred | extracted`);
  }
  return bad;
}

export const roundTrips = (dump) => JSON.stringify(toContentDump(fromContentDump(dump)), null, 2) === JSON.stringify(dump, null, 2);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const read = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
  if (arg('from-content-dump')) {
    const src = arg('from-content-dump');
    const model = fromContentDump(read(src), { ref: src });
    const problems = validateModel(model);
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    if (!roundTrips(read(src))) { console.error('x round trip is lossy — refusing to write a model that cannot regenerate its source'); process.exit(1); }
    const out = arg('out') ?? 'neutral-model.json';
    writeFileSync(out, JSON.stringify(model, null, 2));
    console.log(`✓ ${out} — ${model.pages.length} page(s), rung 1 (scrape), round trip lossless`);
  } else if (arg('round-trip')) {
    const ok = roundTrips(read(arg('round-trip')));
    console.log(ok ? '✓ lossless' : 'x lossy');
    process.exit(ok ? 0 : 1);
  } else if (arg('validate')) {
    const problems = validateModel(read(arg('validate')));
    console.log(problems.length ? problems.map((p) => `x ${p}`).join('\n') : '✓ valid');
    process.exit(problems.length ? 1 : 0);
  } else {
    console.error('usage: --from-content-dump <f> [--out <f>] | --round-trip <f> | --validate <f>');
    process.exit(2);
  }
}
