#!/usr/bin/env node
/**
 * audit-skills.mjs — score every vendored skill against (a) the Agent Skills / Claude Code
 * SKILL.md contract and (b) this repo's own conventions, and assert the skill LISTING fits
 * the budget Claude Code actually applies.
 *
 *   node .agent/scripts/audit-skills.mjs [--json] [--quiet] [--repo <dir>]
 *
 * Read-only, no network. Exit 1 on any ERROR, 2 when the self-check fails (a score the
 * script cannot stand behind is not printed), 0 otherwise.
 *
 * Why the budget axis is the load-bearing one (measured 2026-09-16, Claude Code 2.1.261):
 * the skill listing sent to the model is capped at `contextWindow × 4 bytes/token ×
 * skillListingBudgetFraction` (default 0.01 → 8,000 chars on a 200k session), each
 * description at `skillListingMaxDescChars` (default 1,536). Over budget, the CLI sorts by
 * usage priority and demotes the LEAST-USED skills to name-only — they still exist on disk
 * and still pass every file-level check, but the model can no longer trigger them. This repo's
 * 61 skills totalled 32k chars against that 8k, so 24 were name-only in a live session and
 * nothing said so. The fraction is now pinned in `.claude/settings.json`; this script reads
 * the same key and fails when the estate outgrows it, so the next 20 skills cannot silently
 * push the first 20 back into the dark.
 *
 * Also read by `validate-framework.mjs` (§ M), so the pre-commit hook gates on it.
 */
import { readdirSync, readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Maintainer-only modules (see export-flow.mjs): absent in a public export, where no third-party or
// personal skill ships and there is no canonical clone to compare against.
let NO_PUBLISH = new Set();
let isPersonalSkill = (name) => name.startsWith('solo-');
let resolveSkillsRepo = () => ({ path: null });
let resolvePersonalSkillsRepo = () => ({ path: null });
const absentInExport = (e) => { if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e; };
try { ({ NO_PUBLISH } = await import('./no-publish.mjs')); } catch (e) { absentInExport(e); }
try { ({ resolveSkillsRepo, resolvePersonalSkillsRepo, isPersonalSkill } = await import('./resolve-skills-repo.mjs')); } catch (e) { absentInExport(e); }

// Private tokens (2026-09-18): the list is denylisted from public exports, where the axis is
// simply not applicable, so it is imported dynamically — see private-tokens.mjs.
let findPrivateToken = null;
try { ({ findPrivateToken } = await import('./private-tokens.mjs')); } catch (e) { absentInExport(e); }

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = resolve(HERE, '..', '..');

// Claude Code SKILL.md frontmatter keys (docs.claude.com → Skills → frontmatter reference).
// Unknown keys are a WARN: the CLI ignores them, but a typo'd `allowed_tools` silently grants
// nothing, which is the kind of quiet no-op this audit exists to surface.
export const KNOWN_KEYS = new Set([
  'name', 'description', 'license', 'allowed-tools', 'metadata', 'disable-model-invocation',
  'user-invocable', 'argument-hint', 'model', 'context', 'agent', 'hooks', 'paths', 'version',
  'compatibility', 'effort',
]);
// `<cluster>-<skill>` — the prefix is the plugin the skill ships in (CLAUDE.md § Sitecore skills).
// Longest prefix wins, so `content-sdk-app-router-*` is listed before `content-sdk-*`.
export const CLUSTER_PREFIXES = ['content-sdk-app-router-', 'content-sdk-', 'sitecoreai-', 'marketplace-sdk-', 'blok-', 'setup-', 'solo-'];
export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const XML_RE = /<[^>]+>/;
// Claude Code defaults, read from the binary. Overridable per repo in .claude/settings.json.
export const DEFAULTS = { budgetFraction: 0.01, maxDescChars: 1536, contextWindow: 200000, bytesPerToken: 4 };
export const LIMITS = { nameMax: 64, descMax: 1024, descWarn: 500, bodyWarnLines: 500, bodyWarnTokens: 5000, compatMax: 500 };

const norm = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');

/** Minimal frontmatter parser: top-level scalars, one level of nesting, simple lists. */
export function parseFrontmatter(text) {
  const t = norm(text);
  const lines = t.split('\n');
  if (lines[0].trim() !== '---') return { fm: null, body: t, error: 'no frontmatter opener on line 1' };
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  if (end === -1) return { fm: null, body: t, error: 'frontmatter never closed' };
  const fm = {}; const order = []; let cur = null;
  const unq = (v) => v.replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1').trim();
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^([A-Za-z_][\w-]*):[ \t]*(.*)$/);
    if (top) {
      const [, k, v] = top; order.push(k); cur = null;
      if (v === '') { fm[k] = {}; cur = k; }
      else if (/^[>|]-?$/.test(v)) {
        const parts = [];
        while (i + 1 < end && /^[ \t]+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
        fm[k] = parts.join(v.startsWith('|') ? '\n' : ' ').trim();
      } else fm[k] = unq(v);
      continue;
    }
    const nested = line.match(/^[ \t]+([A-Za-z_][\w-]*):[ \t]*(.*)$/);
    if (nested && cur && !Array.isArray(fm[cur])) { fm[cur][nested[1]] = nested[2] === '' ? {} : unq(nested[2]); continue; }
    const item = line.match(/^[ \t]*-[ \t]+(.*)$/);
    if (item && cur) { if (!Array.isArray(fm[cur])) fm[cur] = []; fm[cur].push(unq(item[1])); }
  }
  return { fm, order, body: lines.slice(end + 1).join('\n'), error: null };
}

/** Read `.claude/settings.json` for the two listing knobs; defaults when absent. */
export function readListingSettings(repo) {
  const p = join(repo, '.claude', 'settings.json');
  let s = {};
  try { s = JSON.parse(norm(readFileSync(p, 'utf8'))); } catch { /* absent or unparseable → defaults */ }
  return {
    budgetFraction: typeof s.skillListingBudgetFraction === 'number' ? s.skillListingBudgetFraction : DEFAULTS.budgetFraction,
    maxDescChars: typeof s.skillListingMaxDescChars === 'number' ? s.skillListingMaxDescChars : DEFAULTS.maxDescChars,
    pinned: typeof s.skillListingBudgetFraction === 'number',
  };
}

/** Listing cost of one entry, mirroring the CLI: name + 4 + min(desc, cap). */
export const entryChars = (name, desc, cap = DEFAULTS.maxDescChars) => name.length + 4 + Math.min(desc.length, cap);

/**
 * Audit one skill directory. Returns findings [{ severity, code, msg }] plus the fields the
 * budget axis needs. `siblings` is the set of sibling skill names (for cross-skill refs).
 */
export function auditSkill(dir, name, { siblings = new Set(), thirdParty = NO_PUBLISH.has(name), canonical = null, privateScan = findPrivateToken } = {}) {
  const F = [];
  const err = (code, msg) => F.push({ severity: 'ERROR', code, msg });
  const warn = (code, msg) => F.push({ severity: 'WARN', code, msg });
  const out = { name, findings: F, desc: '', bodyLines: 0, thirdParty };

  const entries = existsSync(dir) ? readdirSync(dir) : [];
  const hit = entries.find((x) => x.toLowerCase() === 'skill.md');
  if (!hit) { err('skill-md-missing', 'no SKILL.md'); return out; }
  if (hit !== 'SKILL.md') err('skill-md-case', `file is ${hit}; must be spelled SKILL.md`);
  const raw = readFileSync(join(dir, hit), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) warn('bom', 'UTF-8 BOM before the frontmatter opener');
  const { fm, order, body, error } = parseFrontmatter(raw);
  if (!fm) { err('frontmatter', error); return out; }

  // name — spec: required, [a-z0-9-], ≤ 64, no XML tags; repo: equals the folder.
  const n = fm.name;
  if (n == null || n === '' || typeof n !== 'string') err('name-missing', 'name is missing or not a scalar');
  else {
    if (!NAME_RE.test(n)) err('name-charset', `name "${n}" is not lowercase [a-z0-9] with single interior hyphens`);
    if (n.length > LIMITS.nameMax) err('name-length', `name is ${n.length} chars; max ${LIMITS.nameMax}`);
    if (n !== name) err('name-folder', `name "${n}" does not equal folder "${name}"`);
  }
  // description — spec: required, non-empty, ≤ 1024, no XML tags. Repo: WARN over 500 —
  // a description is a trigger, not a table of contents (see budget rationale above).
  const d = fm.description;
  if (d == null || d === '' || typeof d !== 'string') err('desc-missing', 'description is missing or empty');
  else {
    out.desc = d;
    if (d.length > LIMITS.descMax) err('desc-length', `description is ${d.length} chars; max ${LIMITS.descMax}`);
    else if (d.length > LIMITS.descWarn && !thirdParty) warn('desc-long', `description is ${d.length} chars; over ${LIMITS.descWarn} it is restating the body — make it what · when · not`);
    if (XML_RE.test(d)) err('desc-xml', 'description contains an XML-like <tag>; use a bare placeholder instead');
  }
  for (const k of order ?? []) if (!KNOWN_KEYS.has(k)) warn('unknown-key', `unknown frontmatter key "${k}"`);
  // spec: compatibility is 1–500 chars if present; metadata is a map of string → STRING (a nested
  // map — the old `metadata.upstream: { repo, commit, path }` — is not spec-valid; flatten to
  // `upstream_repo` etc.).
  if (typeof fm.compatibility === 'string' && fm.compatibility.length > LIMITS.compatMax) err('compat-length', `compatibility is ${fm.compatibility.length} chars; max ${LIMITS.compatMax}`);
  if (fm.metadata && typeof fm.metadata === 'object') for (const [k, v] of Object.entries(fm.metadata)) if (typeof v !== 'string') err('metadata-nested', `metadata.${k} is not a string (spec: string → string map) — flatten it to ${k}_<field> keys`);
  for (const k of ['user-invocable', 'disable-model-invocation']) if (k in fm && !['true', 'false'].includes(String(fm[k]))) err('bool-key', `${k} must be true or false`);

  // body — non-empty; > 500 lines is the progressive-disclosure smell (move detail to references/).
  const bodyLines = body.split('\n');
  out.bodyLines = bodyLines.length;
  if (!bodyLines.some((l) => l.trim())) err('body-empty', 'body is empty');
  else if (bodyLines.length > LIMITS.bodyWarnLines && !thirdParty) warn('body-long', `body is ${bodyLines.length} lines; over ${LIMITS.bodyWarnLines} move lookup tables / worked examples into references/`);
  // spec tier 2: the whole body loads on activation, < 5,000 tokens recommended. Lines under-count
  // long prose (create-component was 227 lines / 6,883 tokens), so the token estimate is the gate
  // that matters; chars/4 is the same estimate the CLI's own budget arithmetic uses.
  const bodyTokens = Math.round(body.length / 4);
  out.bodyTokens = bodyTokens;
  if (bodyTokens > LIMITS.bodyWarnTokens && !thirdParty) warn('body-tokens', `body is ~${bodyTokens} tokens; the spec recommends < ${LIMITS.bodyWarnTokens} on activation — move lookup material into references/`);

  // relative references in the body must resolve. Intra-skill (`references/x.md`) → inside this
  // skill; cross-skill ("the `foo` skill's `references/x.md`") → inside that sibling, and a
  // sibling in ANOTHER cluster is a WARN because a consumer installing one cluster gets a
  // dangling pointer. Only prose that names a sibling is treated as cross-skill; a bare
  // `references/x.md` two lines under a sibling mention is still intra-skill.
  const bodyNoCode = body.replace(/```[\s\S]*?```/g, '');
  const refRe = /(?:the `([a-z0-9-]+)` skill'?s? `|`(?:\.\/)?)((?:references|reference|scripts|assets|templates|examples)\/[A-Za-z0-9_./-]+?)`/g;
  const seen = new Set();
  for (const m of bodyNoCode.matchAll(refRe)) {
    const [, sibling, rel] = m;
    const key = `${sibling ?? ''}|${rel}`; if (seen.has(key)) continue; seen.add(key);
    const cleanRel = rel.replace(/\/+$/, '');
    if (sibling) {
      if (!siblings.has(sibling)) { warn('cross-skill-ref', `references \`${rel}\` in skill "${sibling}", which is not vendored here`); continue; }
      const target = join(dir, '..', sibling, cleanRel);
      if (!existsSync(target)) err('dangling-ref', `references \`${rel}\` in skill "${sibling}" but it does not exist there`);
      else if (clusterOf(sibling) !== clusterOf(name)) warn('cross-cluster-ref', `references \`${rel}\` in skill "${sibling}" (cluster ${clusterOf(sibling)}) — dangling for a consumer who installs only ${clusterOf(name)}`);
    } else if (!existsSync(join(dir, cleanRel))) {
      // `scripts/out/` and the like are generated payload ignored by a .gitignore INSIDE the skill —
      // at the root or nested (`scripts/.gitignore` listing `out/`). The first draft read only the
      // root file and passed locally solely because the generated folder happened to exist on disk;
      // the export (which does not carry generated payload) caught it.
      if (!gitignoredInside(dir, cleanRel)) err('dangling-ref', `body references \`${rel}\` which does not exist in this skill`);
    }
  }

  // Skill NAMES cited in prose must exist somewhere a consumer can install them: vendored here,
  // or published in the canonical marketplace (asked when its clone is present; skipped, with an
  // INFO at the tree level, when it is not). A name in neither is a dangling pointer —
  // `setup-content-sdk` cited "the 14 `content-sdk-pages-router-*` skills" for a cluster that
  // holds 11 (2026-09-18). Brace forms (`content-sdk-{app,pages}-router-x`) are expanded.
  // Cross-CLUSTER name mentions are deliberate routing here (setup → sitecoreai) and are NOT
  // flagged: a WARN on every one of them would be the gate that cries wolf.
  if (canonical) {
    const nameRe = /`((?:content-sdk-app-router|content-sdk|sitecoreai|marketplace-sdk|blok|setup|solo)-[a-z0-9{},-]+)`/g;
    const seenNames = new Set();
    for (const m of bodyNoCode.matchAll(nameRe)) {
      for (const cand of expandBraces(m[1])) {
        if (cand === name || seenNames.has(cand) || !NAME_RE.test(cand) || NOT_SKILL_NAMES.has(cand)) continue;
        seenNames.add(cand);
        if (!siblings.has(cand) && !canonical.has(cand)) warn('dangling-skill-ref', `cites skill \`${cand}\`, which is neither vendored here nor published in the canonical marketplace`);
      }
    }
  }

  // A public skill citing a personal one is a dead pointer for every marketplace consumer: the
  // personal plugin is private (split 2026-11-04). Not conditional on a clone, because the answer
  // does not depend on what is published.
  if (!thirdParty && !isPersonalSkill(name)) {
    for (const m of bodyNoCode.matchAll(/`(solo-[a-z0-9-]+)`/g)) {
      if (NOT_SKILL_NAMES.has(m[1])) continue;
      err('public-cites-personal', `cites \`${m[1]}\`, a private personal skill a marketplace consumer cannot install`);
      break;
    }
  }

  // Private tokens — a tenant id, a brand slug, a workspace path — in any text file of an OWN
  // skill. Third-party skills are exempt (vendored verbatim, never published by us), and so are
  // personal skills, whose repo is private. ERROR, because the marketplace mirror is the one
  // channel the export sweep never sees. The other half of the personal exemption:
  // check-skill-drift fails when a personal skill appears in the public repo.
  if (!thirdParty && !isPersonalSkill(name) && privateScan) {
    for (const rel of walkText(dir)) {
      const hit = privateScan(readFileSync(join(dir, rel), 'utf8'));
      if (hit) { err('private-token', `${rel}:${hit.line} carries "${hit.token}" — ${hit.why}; keep the date and the count, drop the name or the path`); break; }
    }
  }

  // repo conventions
  if (thirdParty) {
    const up = join(dir, '.upstream.json');
    if (!existsSync(up)) err('upstream-missing', 'third-party skill (NO_PUBLISH) without .upstream.json');
    else {
      try {
        const j = JSON.parse(norm(readFileSync(up, 'utf8')));
        for (const k of ['upstream', 'commit', 'path', 'license']) if (!j[k]) err('upstream-field', `.upstream.json lacks "${k}"`);
      } catch (x) { err('upstream-parse', `.upstream.json unparseable: ${x.message}`); }
    }
  } else {
    if (!CLUSTER_PREFIXES.some((c) => name.startsWith(c))) err('cluster-prefix', `name carries no cluster prefix (${CLUSTER_PREFIXES.join(' | ')}) and is not in NO_PUBLISH`);
    const meta = fm.metadata && typeof fm.metadata === 'object' ? fm.metadata : {};
    if (!meta.author) warn('author', 'metadata.author missing');
    if (!meta.version && !fm.version) warn('version', 'no metadata.version — the mirror workflow bumps it on every edit');
    if (!fm.license) warn('license', 'license missing');
  }
  return out;
}

// Backticked tokens that look like a `<cluster>-…` skill name and are not one: the SitecoreAI
// starter repo, the scaffold's package name, and the cluster names themselves.
const NOT_SKILL_NAMES = new Set(['solo-website', 'content-sdk-nextjs-app-router', 'content-sdk-nextjs', 'content-sdk-app-router', 'content-sdk-pages-router', 'marketplace-sdk', 'sitecoreai-apis']);
/** `a-{b,c}-d` → [a-b-d, a-c-d]; nested / multiple groups expand recursively. */
export function expandBraces(s) {
  const m = s.match(/^([^{]*)\{([^{}]*)\}(.*)$/);
  if (!m) return [s];
  return m[2].split(',').flatMap((alt) => expandBraces(`${m[1]}${alt.trim()}${m[3]}`));
}
/** Every text file inside a skill (generated payload and binaries skipped), skill-relative. */
const WALK_SKIP = new Set(['node_modules', 'out', 'dist', '.git']);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|wasm|mp4|mp3|webm|glb|gltf|bin|exe|dll)$/i;
export function walkText(root) {
  const out = [];
  const rec = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!WALK_SKIP.has(e.name)) rec(join(dir, e.name), r); }
      else if (!BINARY_EXT.test(e.name)) out.push(r);
    }
  };
  if (existsSync(root)) rec(root, '');
  return out.sort();
}
/** Skill names published in the canonical marketplace clone (plugins/<cluster>/skills/<name>), or null when the clone is absent. */
export function canonicalNames(canonDir) {
  if (!canonDir) return null;
  const plugins = join(canonDir, 'plugins');
  if (!existsSync(plugins)) return null;
  const out = new Set();
  for (const cluster of readdirSync(plugins)) {
    const skills = join(plugins, cluster, 'skills');
    if (!existsSync(skills)) continue;
    for (const n of readdirSync(skills)) if (existsSync(join(skills, n, 'SKILL.md'))) out.add(n);
  }
  return out;
}

/** Is skill-relative `rel` covered by a .gitignore at the skill root or any ancestor directory inside the skill? */
export function gitignoredInside(skillDir, rel) {
  const segs = rel.split('/').filter(Boolean);
  // git semantics, reduced to what a skill needs: a rule WITHOUT a slash (`out/`, `node_modules`)
  // matches that name at any depth below the .gitignore that holds it; a rule WITH a slash
  // (`scripts/out`) matches that path relative to its .gitignore.
  for (let i = 0; i < segs.length; i++) {
    const gi = join(skillDir, ...segs.slice(0, i), '.gitignore');
    if (!existsSync(gi)) continue;
    const rules = norm(readFileSync(gi, 'utf8')).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.replace(/^\//, '').replace(/\/$/, ''));
    const below = segs.slice(i);
    for (const rule of rules) {
      if (rule.includes('/') ? below.join('/').startsWith(rule) : below.includes(rule)) return true;
    }
  }
  return false;
}

export function clusterOf(name) { return CLUSTER_PREFIXES.find((c) => name.startsWith(c))?.replace(/-$/, '') ?? '(none)'; }

/**
 * Audit the whole vendored tree. Returns { findings, skills, budget }.
 * `findings` carry `area: 'skills'` and a `skill` where applicable, shaped for the validator.
 */
export function auditSkills({ repo = DEFAULT_REPO, skillsDir = join(repo, '.claude', 'skills'), canonicalDir = resolveSkillsRepo({ repoRoot: repo }).path, personalDir = resolvePersonalSkillsRepo({ repoRoot: repo }).path } = {}) {
  const findings = [];
  const skills = [];
  const present = existsSync(skillsDir);
  const names = present ? readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  const siblings = new Set(names);
  // Published in EITHER repo counts: a personal skill may cite one never vendored here (the debrief trio).
  const canonical = canonicalNames(canonicalDir);
  for (const n of canonicalNames(personalDir) ?? []) canonical?.add(n);
  if (names.length && !canonical) findings.push({ severity: 'INFO', area: 'skills', code: 'skill-refs-unresolved', msg: `canonical marketplace clone not found${canonicalDir ? ` at ${canonicalDir}` : ''} — cited skill names were not checked against what is published (set sitecore_skills_repo in .agent/workspace.json or SITECORE_SKILLS_REPO)` });
  for (const name of names) {
    const r = auditSkill(join(skillsDir, name), name, { siblings, canonical });
    skills.push(r);
    for (const f of r.findings) findings.push({ severity: f.severity, area: 'skills', skill: name, code: f.code, msg: `${name}: ${f.msg}` });
  }
  // floor — "found nothing" must never render as "all clean"
  // A tree with NO .claude/skills/ directory is a composition that vendors nothing (a core-only
  // export) — not applicable, say so. A directory that EXISTS and is empty is a wiped working tree.
  if (!present) findings.push({ severity: 'INFO', area: 'skills', code: 'skills-absent', msg: 'no .claude/skills/ directory — nothing vendored, audit not applicable' });
  else if (names.length === 0) findings.push({ severity: 'ERROR', area: 'skills', code: 'floor', msg: '.claude/skills/ exists but holds no skills — a wiped or half-copied tree, never a clean one' });

  // budget — the vendored set alone against the budget this repo pins. User-scope plugins and
  // ~/.claude/skills are per-machine and deliberately out of scope; the headroom WARN is the
  // margin left for them.
  const settings = readListingSettings(repo);
  const budget = Math.floor(DEFAULTS.contextWindow * DEFAULTS.bytesPerToken * settings.budgetFraction);
  const chars = skills.reduce((a, s) => a + entryChars(s.name, s.desc, settings.maxDescChars), 0) + Math.max(0, skills.length - 1);
  const headroom = budget - chars;
  const b = { budget, chars, headroom, fraction: settings.budgetFraction, pinned: settings.pinned, maxDescChars: settings.maxDescChars, skills: skills.length };
  if (names.length) {
    if (chars > budget) findings.push({ severity: 'ERROR', area: 'skills', code: 'budget-over', msg: `skill listing is ${chars} chars against a ${budget}-char budget (fraction ${settings.budgetFraction} × 200k × 4) — the least-used skills become name-only and cannot be model-triggered; shorten descriptions or raise skillListingBudgetFraction in .claude/settings.json` });
    else if (headroom < budget * 0.15) findings.push({ severity: 'WARN', area: 'skills', code: 'budget-headroom', msg: `skill listing is ${chars} of ${budget} chars (${Math.round(headroom / budget * 100)}% headroom) — user-scope plugins share this budget` });
    else findings.push({ severity: 'INFO', area: 'skills', code: 'budget', msg: `skill listing ${chars} of ${budget} chars (fraction ${settings.budgetFraction}${settings.pinned ? ', pinned in .claude/settings.json' : ', CLI DEFAULT — pin it'}), ${skills.length} skills` });
    if (!settings.pinned && chars > Math.floor(DEFAULTS.contextWindow * DEFAULTS.bytesPerToken * DEFAULTS.budgetFraction)) findings.push({ severity: 'ERROR', area: 'skills', code: 'budget-unpinned', msg: `skillListingBudgetFraction is not set in .claude/settings.json and the listing (${chars}) exceeds the CLI default (${DEFAULTS.contextWindow * DEFAULTS.bytesPerToken * DEFAULTS.budgetFraction})` });
  }
  return { findings, skills, budget: b };
}

// ── self-check: a positive and a negative sample per axis, or exit 2 ────────────────
export function selfCheck() {
  const mk = (over) => ({ ...{ name: 'x-skill', description: 'fine', body: '# T\n\nline\n' }, ...over });
  const render = (s) => `---\nname: ${s.name}\ndescription: "${s.description}"\n---\n${s.body}`;
  const cases = [
    ['name-charset', mk({ name: 'X_Skill' }), true], ['name-charset', mk(), false],
    ['desc-length', mk({ description: 'a'.repeat(1025) }), true], ['desc-length', mk({ description: 'a'.repeat(1024) }), false],
    ['desc-xml', mk({ description: 'use <topic> here' }), true], ['desc-xml', mk({ description: 'use TOPIC here' }), false],
    ['body-long', mk({ body: 'x\n'.repeat(501) }), true], ['body-long', mk({ body: 'x\n'.repeat(400) }), false],
    ['dangling-ref', mk({ body: 'see `references/missing.md`\n' }), true], ['dangling-ref', mk({ body: 'see ```\n`references/in-code.md`\n```\n' }), false],
    ['dangling-skill-ref', mk({ body: 'see `sitecoreai-nope`\n' }), true, { canonical: new Set(['sitecoreai-real']) }],
    ['dangling-skill-ref', mk({ body: 'see `sitecoreai-real` and `sitecoreai-{real,other}`\n' }), false, { canonical: new Set(['sitecoreai-real', 'sitecoreai-other']) }],
    ['private-token', mk({ body: 'tenant fixturetenant00\n' }), true, { privateScan: (t) => (/fixturetenant00/.test(t) ? { token: 'fixturetenant00', why: 'test', line: 1 } : null) }],
    ['private-token', mk({ body: 'one brand, 11 of 34\n' }), false, { privateScan: (t) => (/fixturetenant00/.test(t) ? { token: 'fixturetenant00', why: 'test', line: 1 } : null) }],
    ['private-token', mk({ name: 'solo-x', body: 'tenant fixturetenant00\n' }), false, { privateScan: (t) => (/fixturetenant00/.test(t) ? { token: 'fixturetenant00', why: 'test', line: 1 } : null) }],
    ['public-cites-personal', mk({ name: 'sitecoreai-x', body: 'pair with `solo-fixture`\n' }), true],
    ['public-cites-personal', mk({ name: 'solo-x', body: 'pair with `solo-fixture`\n' }), false],
    ['public-cites-personal', mk({ name: 'sitecoreai-x', body: 'not the `solo-website` starter\n' }), false],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'audit-skills-self-'));
  let ok = true;
  try {
    for (const [code, s, expect, extra = {}] of cases) {
      const d = join(dir, s.name); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'SKILL.md'), render(s));
      const r = auditSkill(d, s.name, { thirdParty: false, privateScan: null, ...extra });
      const hit = r.findings.some((f) => f.code === code);
      if (hit !== expect) { ok = false; console.error(`self-check FAILED: ${code} expected=${expect} got=${hit}`); }
      rmSync(d, { recursive: true, force: true });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return ok;
}
// ── CLI ──────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const AS_JSON = args.includes('--json');
  const QUIET = args.includes('--quiet');
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx >= 0 ? resolve(args[repoIdx + 1]) : DEFAULT_REPO;
  if (!selfCheck()) { console.error('audit-skills: self-check failed — refusing to report a score it cannot stand behind'); process.exit(2); }
  const { findings, skills, budget } = auditSkills({ repo });
  const errors = findings.filter((f) => f.severity === 'ERROR');
  const warns = findings.filter((f) => f.severity === 'WARN');
  if (AS_JSON) { console.log(JSON.stringify({ ok: errors.length === 0, counts: { error: errors.length, warn: warns.length }, budget, findings }, null, 2)); process.exit(errors.length ? 1 : 0); }
  if (!QUIET || errors.length) {
    const bySkill = new Map();
    for (const f of findings) if (f.skill) { if (!bySkill.has(f.skill)) bySkill.set(f.skill, []); bySkill.get(f.skill).push(f); }
    for (const [skill, fs] of bySkill) { console.log(`  ${skill}`); for (const f of fs) console.log(`     ${f.severity.padEnd(5)} ${f.code.padEnd(18)} ${f.msg.replace(`${skill}: `, '')}`); }
    for (const f of findings.filter((x) => !x.skill)) console.log(`  ${f.severity.padEnd(5)} ${f.code.padEnd(18)} ${f.msg}`);
    console.log(`\n  ${skills.length} skills — ${skills.filter((s) => !s.findings.length).length} clean, ${errors.length} ERROR, ${warns.length} WARN; listing ${budget.chars}/${budget.budget} chars`);
  } else if (QUIET) console.log(`Skill audit: ${skills.length} skills, 0 ERROR, ${warns.length} WARN; listing ${budget.chars}/${budget.budget} chars.`);
  process.exit(errors.length ? 1 : 0);
}
