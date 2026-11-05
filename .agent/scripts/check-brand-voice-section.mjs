#!/usr/bin/env node
/**
 * check-brand-voice-section.mjs — does this spec say whose voice the content is written in?
 *
 *   node .agent/scripts/check-brand-voice-section.mjs --spec <prd-or-frd.md> [--json]
 *
 * Read-only, no network. Exit 0 = the section exists and its required fields carry real answers.
 * Exit 1 = missing or vague: the caller stops and asks, it never invents a voice. Exit 2 = the
 * spec cannot be read or no --spec was given: nothing was judged.
 *
 * Why a script and not a sentence in a command (rule `88`): `/author-content` used to default to the
 * operator's own voice, so an empty spec produced confident copy in the wrong voice and nothing
 * failed. Three stages run this: `/author-content` before writing a word, `/test-content` before
 * auditing against the section, `/challenge-prd` to rank the gap.
 *
 * An FRD may carry `**Inherited from:** prd-000.md` instead of its own fields. The path resolves
 * against the FRD's own directory, is followed once, and a target that fails fails this spec.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fields a writer or a reviewer cannot work without. The others in the template may be thin. */
export const REQUIRED_FIELDS = ['Brand and surface', 'Source', 'Audience', 'Voice attributes', 'Register default'];
const VAGUE = /^(tbd|tbc|todo|n\/?a|none|unknown|assumption\b|\?+$)/i;
const REGISTERS = /\b(brand|marketing|technical-neutral|personal)\b/i;

/** The section body, or null. A numbered heading (`## 11a. Brand voice and identity`) counts. */
export function findSection(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  // The full section wins over the Developer-slice mirror, which only carries a pointer.
  const headings = lines.map((l, i) => [l.match(/^(#{2,3})\s+(?:[\d.]+[a-z]?\.?\s+)?Brand voice and identity\b/i), i]).filter(([m]) => m);
  let hit = headings.find(([m]) => m[1] === '##') ?? headings[0];
  if (!hit) return null;
  const [m, start] = hit;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s/);
    if (h && h[1].length <= m[1].length) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n').replace(/<!--[\s\S]*?-->/g, '');
}

/** `**Field:** value`, with any continuation lines up to the next field. */
export function fieldValue(section, field) {
  const re = new RegExp(`\\*\\*${field}:\\*\\*([^\\n]*(?:\\n(?!\\s*-\\s*\\*\\*)[^\\n]*)*)`, 'i');
  const m = section.match(re);
  return m ? m[1].trim() : null;
}

const isPlaceholder = (v) => /^<[^>]*>$/s.test(v) || /^\\?<.*\\?>$/s.test(v);

/** @returns {{ ok: boolean, problems: string[], inheritedFrom?: string }} */
export function checkSpec(specPath, { followed = false } = {}) {
  const text = readFileSync(specPath, 'utf8');
  const section = findSection(text);
  if (section === null) return { ok: false, problems: ['no "Brand voice and identity" section'] };
  const inherited = fieldValue(section, 'Inherited from');
  if (inherited && !isPlaceholder(inherited)) {
    if (followed) return { ok: false, problems: [`inherits from a spec that also inherits (${inherited}); name the spec that holds the fields`] };
    const target = resolve(dirname(specPath), inherited.replace(/[`]/g, '').split(/\s/)[0]);
    if (!existsSync(target)) return { ok: false, problems: [`inherits from ${inherited}, which does not exist`], inheritedFrom: target };
    return { ...checkSpec(target, { followed: true }), inheritedFrom: target };
  }
  const problems = [];
  for (const field of REQUIRED_FIELDS) {
    const v = fieldValue(section, field);
    if (v === null) problems.push(`"${field}" is missing`);
    else if (!v || isPlaceholder(v) || VAGUE.test(v)) problems.push(`"${field}" has no real answer ("${v.slice(0, 60)}")`);
  }
  const reg = fieldValue(section, 'Register default');
  if (reg && !isPlaceholder(reg) && !VAGUE.test(reg) && !REGISTERS.test(reg)) problems.push(`"Register default" names no register ("${reg.slice(0, 60)}"): use brand, marketing or technical-neutral`);
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--spec');
  const spec = i >= 0 ? argv[i + 1] : null;
  const asJson = argv.includes('--json');
  if (!spec || !existsSync(spec)) {
    const reason = spec ? `spec not found: ${spec}` : '--spec <path> is required';
    if (asJson) console.log(JSON.stringify({ status: 'error', reason })); else console.error(`ERROR: ${reason}`);
    process.exit(2);
  }
  const r = checkSpec(spec);
  if (asJson) console.log(JSON.stringify({ status: r.ok ? 'ok' : 'missing', spec, ...r }));
  else if (r.ok) console.log(`Brand voice and identity: OK in ${r.inheritedFrom ?? spec}`);
  else {
    console.error(`✖ Brand voice and identity is missing or vague in ${r.inheritedFrom ?? spec}:`);
    for (const p of r.problems) console.error(`   - ${p}`);
    console.error('  Ask the operator and write the section (template: sitecoreai-brand-voice). Never invent a voice.');
  }
  process.exit(r.ok ? 0 : 1);
}
