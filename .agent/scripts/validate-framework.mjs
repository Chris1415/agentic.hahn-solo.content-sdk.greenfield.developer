#!/usr/bin/env node
// validate-framework.mjs — Cross-reference integrity check for the agentic framework.
//
// Usage:
//   node .agent/scripts/validate-framework.mjs            # full check, human output
//   node .agent/scripts/validate-framework.mjs --quiet    # only print on failure
//   node .agent/scripts/validate-framework.mjs --json     # machine-readable report
//
// Pure Node (no jq, no npm deps) so it runs identically on Windows / macOS / Linux
// and inside a git pre-commit hook. Exit code 1 if any ERROR is found; WARN/INFO
// never fail the build.
//
// What it checks (the drift classes the manual sync scripts don't):
//   A. flows.json registry/command file paths resolve on disk.
//   B. flows.json internal consistency (agent ids, next[], sequences, gate lists).
//   C. Agent frontmatter vs the README contract + flows.json registry (rules 1-10).
//   D. Each command's frontmatter `depends_on` paths resolve on disk.
//   E. Glossary: explicit "glossary ... § X" citations resolve to a heading.
//   F. Mirror freshness: .claude/agents + .claude|.cursor/commands match what the
//      sync scripts would generate. This is the check the pre-commit hook gates on.
//   K. xmcloud.build.json blueprint: one pinned nodeVersion, no stray literals.
//   M. Skills: every .claude/skills/<name>/SKILL.md holds the Agent Skills contract + repo
//      conventions, and the skill LISTING fits the budget pinned in .claude/settings.json.
//
// Severity model:
//   ERROR — hard integrity break (dangling ref, stale/missing mirror). Fails the run.
//   WARN  — contract drift worth fixing (body-section order, glossary orphans). Advisory.
//   INFO  — observations. Advisory.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveProductsRoot } from './resolve-products-root.mjs';
import { loadPacks, composePacks, runnableCombinations } from './resolve-packs.mjs';
import { checkBlueprint } from './check-xmcloud-build-blueprint.mjs';
import { check as checkVocabulary } from './check-contract-vocabulary.mjs';
import { auditSkills, selfCheck as skillsSelfCheck } from './audit-skills.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');
const AGENT_DIR = path.join(REPO_ROOT, '.agent');
const FLOWS_PATH = path.join(AGENT_DIR, 'flows.json');
const GLOSSARY_PATH = path.join(AGENT_DIR, 'glossary.md');
const TEAM_DIR = path.join(AGENT_DIR, 'agents', 'team');
const PM_DIR = path.join(AGENT_DIR, 'agents', 'product-managers');
const CLAUDE_AGENTS_DIR = path.join(REPO_ROOT, '.claude', 'agents');
const CLAUDE_CMD_DIR = path.join(REPO_ROOT, '.claude', 'commands');
const CURSOR_CMD_DIR = path.join(REPO_ROOT, '.cursor', 'commands');

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const JSON_OUT = args.includes('--json');

const findings = [];
const add = (severity, area, message) => findings.push({ severity, area, message });
const error = (area, msg) => add('ERROR', area, msg);
const warn = (area, msg) => add('WARN', area, msg);
const info = (area, msg) => add('INFO', area, msg);

// ── helpers ──────────────────────────────────────────────────────────────────

const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
// Compare ignoring line-ending differences (git autocrlf on Windows).
const norm = (s) => s.replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// Plugin skills. A pack may cite `<plugin>:<skill>` — a skill that lives in an installed
// Claude Code plugin rather than in .claude/skills/. Two things can go wrong and neither
// is visible from the repo: the plugin is not installed on this machine (the stage brief
// says "load ALWAYS" and loads nothing), or it is installed at a stale body (measured
// 2026-09-11: frontend-design sat on the 41-line 2025 body for 5.5 months while the
// 71-line rewrite waited in the marketplace clone — auto-update never ran). The first is
// an ERROR with the install command; the second is a WARN with the update command.
// ---------------------------------------------------------------------------
const CLAUDE_HOME = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude'));
function installedPlugins() {
  const file = path.join(CLAUDE_HOME, 'plugins', 'installed_plugins.json');
  if (!exists(file)) return { file, plugins: null };
  try { return { file, plugins: JSON.parse(read(file).replace(/^﻿/, '')).plugins ?? {} }; }
  catch (e) { return { file, plugins: null, error: e.message }; }
}
function checkPluginSkill(key, stage, plugin, skill, reg) {
  const cite = `${key}.${stage}: plugin skill "${plugin}:${skill}"`;
  if (!reg.plugins) { warn('packs', `${cite} cannot be verified — ${reg.file} ${reg.error ? `unreadable (${reg.error})` : 'not found'}`); return; }
  const entries = Object.entries(reg.plugins).filter(([k]) => k.startsWith(`${plugin}@`)).flatMap(([k, v]) => (v ?? []).map((e) => ({ ...e, id: k, marketplace: k.slice(plugin.length + 1) })));
  const usable = entries.filter((e) => e.scope === 'user' || (e.scope === 'project' && e.projectPath && path.resolve(e.projectPath) === REPO_ROOT));
  if (!usable.length) {
    // A sandbox that runs no stage and cannot reach the marketplace opts out explicitly. An export vendors
    // its own skills and cannot assume the reader has installed a plugin the pack only recommends (the design
    // stage names one), so there it is a WARN: the stage brief states what to do when the skill is absent.
    const report = process.env.HAHN_SOLO_PLUGIN_CHECK === 'warn' || exists(path.join(REPO_ROOT, 'GENERATED')) ? warn : error;
    report('packs', `${cite} is declared but the plugin is NOT installed for this repo (user scope or project scope = ${REPO_ROOT}). The stage brief would say "load ALWAYS" and load nothing. Fix: claude plugin install ${plugin}@claude-plugins-official`);
    return;
  }
  for (const e of usable) {
    const skillFile = path.join(e.installPath ?? '', 'skills', skill, 'SKILL.md');
    if (!exists(skillFile)) { error('packs', `${cite}: plugin ${e.id} is installed at ${e.installPath} but carries no skills/${skill}/SKILL.md`); continue; }
    const clone = path.join(CLAUDE_HOME, 'plugins', 'marketplaces', e.marketplace, 'plugins', plugin, 'skills', skill, 'SKILL.md');
    if (!exists(clone)) { info('packs', `${cite}: installed (${e.version ?? 'unversioned'}); marketplace clone for ${e.marketplace} not present, freshness unverified`); continue; }
    if (norm(read(skillFile)) !== norm(read(clone))) warn('packs', `${cite}: installed body (${e.version ?? 'unversioned'}) differs from the ${e.marketplace} marketplace clone — the pack is citing a body the stage will not load. Fix: claude plugin update ${e.id}`);
    else info('packs', `${cite}: installed at ${e.version ?? 'unversioned'}, matches the ${e.marketplace} clone`);
  }
}

function listMd(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
}

// Minimal front-matter parser for the fields we need (scalars + simple lists).
// Handles `key: value`, quoted values, folded `key: >` / literal `key: |`
// blocks, and `key:` followed by `  - item` lists.
function parseFrontmatter(text) {
  const lines = norm(text).split('\n');
  if (lines[0].trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return null;
  const body = lines.slice(1, end);
  const out = {};
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const m = line.match(/^([A-Za-z_][\w-]*):[ \t]*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (val === '>' || val === '|') {
      const folded = [];
      while (i + 1 < body.length && /^[ \t]+\S/.test(body[i + 1])) {
        folded.push(body[++i].trim());
      }
      out[key] = folded.join(val === '|' ? '\n' : ' ').trim();
    } else if (val === '') {
      // Possible list.
      const items = [];
      while (i + 1 < body.length && /^[ \t]*-[ \t]+/.test(body[i + 1])) {
        items.push(body[++i].replace(/^[ \t]*-[ \t]+/, '').replace(/^["']|["']$/g, '').trim());
      }
      out[key] = items.length ? items : '';
    } else {
      out[key] = val.replace(/^["']|["']$/g, '').trim();
    }
  }
  return out;
}

// Headings (h1/h2) in document order, with whether the section has body content.
function sectionHeadings(text) {
  const lines = norm(text).split('\n');
  const heads = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = lines[i].match(/^(#{1,2})[ \t]+(.+?)[ \t]*$/);
    if (m) heads.push({ level: m[1].length, title: m[2].trim(), line: i });
  }
  for (let h = 0; h < heads.length; h++) {
    const start = heads[h].line + 1;
    const stop = h + 1 < heads.length ? heads[h + 1].line : lines.length;
    heads[h].hasBody = lines.slice(start, stop).some((l) => l.trim() !== '');
  }
  return heads;
}

const VALID_MODELS = new Set(['opus', 'sonnet', 'haiku', 'fable']);
const VALID_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const VALID_OUTPUT_VERBOSITY = new Set(['minimal', 'verbose']);
const REQUIRED_AGENT_SECTIONS = [
  'Identity',
  'Core Expertise',
  'Inputs Contract',
  'Outputs Contract',
  'Personality and Working Style',
  'Communication Style',
  'Signature Behaviors',
  'Direct Invocation',
];

// Resolve a `.agent/...`-relative (or repo-relative) dependency path, with minimal
// glob support for a trailing `*` in the basename.
function dependencyExists(dep) {
  const clean = dep.replace(/^\.\//, '');
  const abs = path.join(REPO_ROOT, clean);
  if (!clean.includes('*')) return exists(abs);
  const dir = path.dirname(abs);
  if (!exists(dir)) return false;
  const re = new RegExp('^' + path.basename(abs).replace(/[.+]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return fs.readdirSync(dir).some((f) => re.test(f));
}

// ── load flows.json ────────────────────────────────────────────────────────────

function reportAndExit(code) { report(); process.exit(code); }

if (!exists(FLOWS_PATH)) {
  error('flows', `flows.json not found at ${rel(FLOWS_PATH)} — cannot validate.`);
  reportAndExit(1);
}

let flows;
try {
  flows = JSON.parse(read(FLOWS_PATH));
} catch (e) {
  error('flows', `flows.json is not valid JSON: ${e.message}`);
  reportAndExit(1);
}

const registry = flows.agent_registry || {};
const commands = flows.commands || {};
const registryIds = new Set(Object.keys(registry));
const commandIds = new Set(Object.keys(commands));

// ── A. flows.json file paths resolve ────────────────────────────────────────────

for (const [id, agent] of Object.entries(registry)) {
  const abs = path.join(AGENT_DIR, agent.file || '');
  if (!agent.file) error('A.registry', `agent_registry["${id}"] has no file field.`);
  else if (!exists(abs)) error('A.registry', `agent_registry["${id}"].file -> missing: .agent/${agent.file}`);
}

for (const [id, cmd] of Object.entries(commands)) {
  const abs = path.join(AGENT_DIR, cmd.file || '');
  if (!cmd.file) error('A.command', `commands["${id}"] has no file field.`);
  else if (!exists(abs)) error('A.command', `commands["${id}"].file -> missing: .agent/${cmd.file}`);
}

// ── B. flows.json internal consistency ──────────────────────────────────────────

const checkAgentIds = (ids, ctx) => {
  for (const a of ids || []) {
    if (!registryIds.has(a)) error('B.agents', `${ctx} references agent id "${a}" not in agent_registry.`);
  }
};
const checkCommandIds = (ids, ctx) => {
  for (const c of ids || []) {
    if (!commandIds.has(c)) error('B.commands', `${ctx} references command "${c}" not in commands.`);
  }
};

for (const [id, cmd] of Object.entries(commands)) {
  checkAgentIds(cmd.agents, `commands["${id}"].agents`);
  if (cmd.agent_sequence) checkAgentIds(cmd.agent_sequence, `commands["${id}"].agent_sequence`);
  if (cmd.agent_modes) checkAgentIds(Object.keys(cmd.agent_modes), `commands["${id}"].agent_modes`);
  checkCommandIds(cmd.next, `commands["${id}"].next`);
}

const proj = (flows.flows && flows.flows.project) || {};
checkCommandIds(proj.typical_sequence, 'flows.project.typical_sequence');
checkCommandIds(proj.on_demand, 'flows.project.on_demand');
if (proj.gate_policy) {
  checkCommandIds(proj.gate_policy.hard, 'flows.project.gate_policy.hard');
  checkCommandIds(proj.gate_policy.soft, 'flows.project.gate_policy.soft');
}
const setup = (flows.flows && flows.flows.setup) || {};
checkCommandIds(setup.commands, 'flows.setup.commands');

// ── C. Agent frontmatter contract ───────────────────────────────────────────────

// Pack-owned agents (tranche 5). Same frontmatter contract and same mirror as a team
// agent — only the location differs — so they join teamFiles rather than forming a
// third category. Walked one level deep by kind; a FLAT scan finds nothing and reports
// clean, which is the defect measured on Sitecore module discovery.
function listPackAgents() {
  const root = path.join(AGENT_DIR, 'packs');
  if (!exists(root)) return [];
  const out = [];
  for (const kind of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const kindDir = path.join(root, kind.name);
    for (const pack of fs.readdirSync(kindDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      out.push(...listMd(path.join(kindDir, pack.name, 'agents')));
    }
  }
  return out;
}

const packAgentFiles = listPackAgents();
const teamFiles = [...listMd(TEAM_DIR), ...packAgentFiles];
const pmFiles = listMd(PM_DIR);
const knownAgentNames = new Set();

function slugFromFilename(file) {
  return path.basename(file, '.md').replace(/^\d\d-/, '');
}

for (const file of teamFiles) {
  // Derive the registry path from where the file ACTUALLY is, not from an assumed
  // directory — a pack-owned agent lives under packs/<kind>/<id>/agents/ and hardcoding
  // `agents/team/` would report every one of them as not-pointing-back while the
  // registry was correct.
  const relF = path.relative(AGENT_DIR, file).split(path.sep).join('/');
  const fm = parseFrontmatter(read(file));
  if (!fm) { error('C.agent', `${relF}: missing or malformed frontmatter.`); continue; }

  const slug = slugFromFilename(file);
  if (fm.name) knownAgentNames.add(fm.name);

  if (fm.name !== slug) error('C.agent', `${relF}: name "${fm.name}" != filename slug "${slug}".`);
  if (!fm.description) error('C.agent', `${relF}: description is empty.`);
  else if (fm.description.length < 40) warn('C.agent', `${relF}: description looks too short (<40 chars).`);
  if (fm.model && !VALID_MODELS.has(fm.model)) error('C.agent', `${relF}: model "${fm.model}" not in ${[...VALID_MODELS].join('|')}.`);
  if (fm.effort && !VALID_EFFORTS.has(fm.effort)) error('C.agent', `${relF}: effort "${fm.effort}" not in low|medium|high|xhigh|max.`);
  if (fm.output_verbosity && !VALID_OUTPUT_VERBOSITY.has(fm.output_verbosity)) error('C.agent', `${relF}: output_verbosity "${fm.output_verbosity}" not in minimal|verbose.`);

  const rid = String(fm.role_id || '').replace(/"/g, '');
  if (!rid) {
    error('C.agent', `${relF}: role_id missing.`);
  } else {
    const regEntry = registry[rid];
    if (!regEntry) error('C.agent', `${relF}: role_id "${rid}" not in agent_registry.`);
    else {
      if (regEntry.file !== relF) error('C.agent', `${relF}: agent_registry["${rid}"].file = "${regEntry.file}" does not point back.`);
      if (regEntry.type && fm.type && regEntry.type !== fm.type) error('C.agent', `${relF}: type "${fm.type}" != registry type "${regEntry.type}".`);
    }
  }

  // rule 8/9 — required body sections present, in order, non-empty (advisory)
  const h2 = sectionHeadings(read(file)).filter((h) => h.level === 2);
  let cursor = 0;
  for (const required of REQUIRED_AGENT_SECTIONS) {
    const idx = h2.findIndex((h, i) => i >= cursor && h.title === required);
    if (idx === -1) {
      warn('C.sections', `${relF}: missing required section "## ${required}" (or out of order).`);
    } else {
      if (!h2[idx].hasBody) warn('C.sections', `${relF}: section "## ${required}" is empty.`);
      cursor = idx + 1;
    }
  }
}

// PM specializations
for (const file of pmFiles) {
  const relF = `agents/product-managers/${path.basename(file)}`;
  const fm = parseFrontmatter(read(file));
  if (!fm) { error('C.pm', `${relF}: missing or malformed frontmatter.`); continue; }
  if (fm.name) knownAgentNames.add(fm.name);
  const slug = path.basename(file, '.md');
  if (fm.name !== slug) error('C.pm', `${relF}: name "${fm.name}" != filename "${slug}".`);
  if (!fm.extends) error('C.pm', `${relF}: specialization missing 'extends'.`);
  if (!String(fm.role_id || '')) error('C.pm', `${relF}: role_id missing.`);
  if (!read(file).includes('## Base')) warn('C.pm', `${relF}: specialization should have a "## Base" section.`);
}
// resolve extends now that team names are known
for (const file of pmFiles) {
  const fm = parseFrontmatter(read(file));
  if (fm && fm.extends && !knownAgentNames.has(fm.extends)) {
    error('C.pm', `agents/product-managers/${path.basename(file)}: extends "${fm.extends}" does not resolve to a team agent.`);
  }
}

// ── D. command depends_on paths resolve ──────────────────────────────────────────

// Only framework wiring is validated: `.agent/`-prefixed literal paths. Entries are
// first stripped of a trailing " (annotation)". Templated product paths (`<...>`) and
// prose/logical inputs ("PRD (optional: ...)") are runtime concerns, not framework
// references, and are skipped.
for (const [id, cmd] of Object.entries(commands)) {
  const abs = path.join(AGENT_DIR, cmd.file || '');
  if (!cmd.file || !exists(abs)) continue;
  const fm = parseFrontmatter(read(abs));
  if (!fm || !Array.isArray(fm.depends_on)) continue;
  for (const dep of fm.depends_on) {
    const clean = dep.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!clean.startsWith('.agent/') || clean.includes('<')) continue;
    if (!dependencyExists(clean)) error('D.depends_on', `commands["${id}"] (.agent/${cmd.file}) depends_on missing: ${clean}`);
  }
}

// ── E. glossary cross-check ──────────────────────────────────────────────────────

// Normalize a term to a comparable core key: lowercase, drop backticks and
// parenthetical qualifiers, & -> and, collapse whitespace.
const coreKey = (t) =>
  t.toLowerCase().replace(/`/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();

const glossaryTerms = new Set();
if (exists(GLOSSARY_PATH)) {
  for (const h of sectionHeadings(read(GLOSSARY_PATH))) {
    if (h.level === 2) glossaryTerms.add(h.title.replace(/\s+/g, ' ').trim());
  }
  // Collect explicit "glossary ... § X" citations across the whole framework and
  // verify each resolves to a heading. This is the precise, zero-false-positive half
  // of the glossary check.
  //
  // We deliberately do NOT flag "orphan" terms by string-matching heading text against
  // prose: the framework references glossary concepts by natural phrasing ("soft cap",
  // "STATUS.md", "design-polish") rather than literal heading text, and no file uses the
  // "see glossary: § X" citation form — so a name-match orphan test is irreducibly noisy.
  // Truly-dead-term pruning is a periodic manual review, not an automated gate.
  const explicitCites = new Set();
  const scanFile = (p) => {
    if (!exists(p) || !p.endsWith('.md')) return;
    const re = /glossary[^.\n]*?§\s*([^\n.;,)]+)/gi;
    let m;
    const text = norm(read(p));
    while ((m = re.exec(text))) explicitCites.add(m[1].trim());
  };
  const walk = (dir) => {
    if (!exists(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else scanFile(p);
    }
  };
  walk(path.join(AGENT_DIR, 'agents'));
  walk(path.join(AGENT_DIR, 'commands'));
  walk(path.join(AGENT_DIR, 'manifests'));
  scanFile(path.join(AGENT_DIR, 'WORKFLOW.md'));
  scanFile(path.join(REPO_ROOT, 'CLAUDE.md'));

  for (const cited of explicitCites) {
    const ck = coreKey(cited);
    const hit = [...glossaryTerms].some((t) => { const tk = coreKey(t); return tk.includes(ck) || ck.includes(tk); });
    if (!hit && ck.length > 3) warn('E.glossary', `Citation "§ ${cited}" does not resolve to a glossary heading.`);
  }
} else {
  warn('E.glossary', `glossary.md not found at ${rel(GLOSSARY_PATH)}.`);
}

// ── F. mirror freshness ──────────────────────────────────────────────────────────

function wrapperSubdir(cmdFile) {
  if (cmdFile.startsWith('commands/research/')) return 'research';
  if (cmdFile.startsWith('commands/sitecore/')) return 'sitecore';
  return 'project';
}

function expectedWrapper(cmdId, cmdFile, flavor) {
  return [
    `# /${cmdId} — ${flavor} wrapper`,
    '',
    `Read and follow \`.agent/${cmdFile}\` exactly.`,
    '',
    '## Wrapper rules',
    `- \`.agent/${cmdFile}\` is the source of truth.`,
    '- Pass through any slash-command arguments unchanged.',
    '- If this wrapper conflicts with the source command, follow the source command.',
    '- Read any templates or referenced files mentioned by the source command before proceeding.',
    "- Preserve the source command's rules, constraints, writes, validation steps, and output format.",
    '',
    '$ARGUMENTS',
    '',
  ].join('\n');
}

const expectedAgentMirrors = new Set();
for (const file of [...teamFiles, ...pmFiles]) {
  const fm = parseFrontmatter(read(file));
  if (!fm || !fm.name) continue;
  const mirror = path.join(CLAUDE_AGENTS_DIR, `${fm.name}.md`);
  expectedAgentMirrors.add(`${fm.name}.md`);
  if (!exists(mirror)) error('F.mirror', `Missing agent mirror .claude/agents/${fm.name}.md — run sync-agents.sh.`);
  else if (norm(read(mirror)) !== norm(read(file))) error('F.mirror', `Stale agent mirror .claude/agents/${fm.name}.md != canonical ${rel(file)} — run sync-agents.sh.`);
}
for (const f of listMd(CLAUDE_AGENTS_DIR)) {
  const base = path.basename(f);
  if (!expectedAgentMirrors.has(base)) error('F.mirror', `Orphan agent mirror .claude/agents/${base} — no canonical agent (rename/delete not propagated).`);
}

const expectedWrappers = { claude: new Set(), cursor: new Set() };
for (const [id, cmd] of Object.entries(commands)) {
  if (!cmd.file || !exists(path.join(AGENT_DIR, cmd.file))) continue;
  const sub = wrapperSubdir(cmd.file);
  const pairs = [
    [CLAUDE_CMD_DIR, 'Claude', 'claude'],
    [CURSOR_CMD_DIR, 'Cursor', 'cursor'],
  ];
  for (const [baseDir, flavor, key] of pairs) {
    const wp = path.join(baseDir, sub, `${id}.md`);
    expectedWrappers[key].add(path.join(sub, `${id}.md`));
    if (!exists(wp)) error('F.wrapper', `Missing ${flavor} wrapper ${rel(wp)} — run sync-wrappers.sh.`);
    else if (norm(read(wp)) !== norm(expectedWrapper(id, cmd.file, flavor))) error('F.wrapper', `Stale ${flavor} wrapper ${rel(wp)} — run sync-wrappers.sh.`);
  }
}
for (const [baseDir, key] of [[CLAUDE_CMD_DIR, 'claude'], [CURSOR_CMD_DIR, 'cursor']]) {
  for (const sub of ['project', 'research', 'sitecore']) {
    for (const f of listMd(path.join(baseDir, sub))) {
      const relWrap = path.join(sub, path.basename(f));
      if (!expectedWrappers[key].has(relWrap)) warn('F.wrapper', `Orphan wrapper ${rel(f)} — no matching command in flows.json.`);
    }
  }
}

// ── G. spawn subagent_type references resolve to a real agent ───────────────────

// Guards the model/effort regression: a specialist spawn MUST name `subagent_type` =
// the agent's frontmatter `name`, otherwise Claude Code cannot apply the pinned `model:`
// and `effort:` — the sub-agent silently inherits the parent session's model (Opus) and
// effort (see .agent/WORKFLOW.md § "Spawn contract" and rule 72). A `subagent_type` that
// does not resolve to a known team agent (a generic type like "claude"/"general-purpose",
// or a typo) is an ERROR. (Observed: one FRD spawned specialists generically -> all
// sub-agents ran on Opus, losing the sonnet split + the effort dial.)
{
  const spawnRe = /subagent_type:\s*["']([A-Za-z0-9_-]+)["']/g;
  const scanSpawn = (p) => {
    if (!exists(p) || !p.endsWith('.md')) return;
    for (const m of norm(read(p)).matchAll(spawnRe)) {
      if (!knownAgentNames.has(m[1])) {
        error('G.spawn', `${rel(p)}: subagent_type "${m[1]}" does not resolve to a team agent name — the spawn would inherit the parent model/effort (see WORKFLOW.md § "Spawn contract").`);
      }
    }
  };
  const walkCmd = (dir) => {
    if (!exists(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walkCmd(p);
      else scanSpawn(p);
    }
  };
  walkCmd(path.join(AGENT_DIR, 'commands'));
}

// ── H. products root resolves ────────────────────────────────────────────────────
// `products/` is a logical mount point (product-workspace.md § 1a). A configured
// root that does not exist is an ERROR: every product would read as "missing", which
// is indistinguishable from an empty workspace and would be blamed on the pipeline.
{
  const rootInfo = resolveProductsRoot({ repoRoot: REPO_ROOT });
  if (rootInfo.error) {
    error('products-root', rootInfo.error);
  } else if (rootInfo.source === 'default') {
    if (!rootInfo.exists) warn('products-root', `default products root missing: ${rel(rootInfo.root)} (no products cloned yet?)`);
  } else {
    info('products-root', `mounted at ${rootInfo.root} (source: ${rootInfo.source}${rootInfo.external ? ', external to the repo' : ''})`);
    const pinned = path.join(REPO_ROOT, 'products', '_root');
    if (!exists(pinned)) {
      warn('products-root', 'products/_root/ is pinned to the repo but is missing — this repo\'s own planning surface does not travel with the mount');
    }
    const strayRoot = path.join(rootInfo.root, '_root');
    if (exists(strayRoot)) {
      warn('products-root', `${strayRoot} exists inside the external mount but is NEVER read — _root is pinned to the repo (§ 1a rule 1)`);
    }
  }
}

// ── I. tracked git hooks are enabled ─────────────────────────────────────────────
// `core.hooksPath` lives in .git/config, which is NOT cloned — so every fresh clone
// silently starts with the commit gates OFF and nothing says so. Measured 2026-08-15:
// a 10-hour-old clone had .git/hooks holding only the stock .sample files, so neither
// the pre-commit integrity gate nor the commit-msg guardrail had ever run.
// WARN, not ERROR: the check cannot live in the hook it is looking for, so this only
// fires on a manual/`/prime` run — and a missing gate must not block the commit that
// is trying to fix it.
{
  const hooksDir = path.join(REPO_ROOT, '.githooks');
  // The ABSENT case is the one this check exists for, and it used to be the one case it could not
  // report: the whole block sat inside `if (exists(hooksDir))`, so a repo with no tracked hooks at
  // all was skipped silently and the validator printed a clean bill. A check written to catch a
  // missing gate must fire hardest when the gate is missing entirely (rule `88-gates-verify-use`).
  if (!exists(hooksDir)) {
    warn('git-hooks', 'no .githooks/ directory — the tracked commit-msg and pre-commit gates do not exist in this clone, so nothing enforces the commit-message convention or runs this validator before a commit. Everything that cites those gates is describing something that is not here.');
  } else {
    let configured = '';
    try {
      configured = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
        cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      configured = ''; // unset — git exits 1, which is the case we are looking for
    }
    if (configured.replace(/\\/g, '/') === '.githooks') {
      info('git-hooks', 'tracked hooks enabled (core.hooksPath = .githooks)');
    } else if (configured) {
      warn('git-hooks', `core.hooksPath = "${configured}", not .githooks — the tracked pre-commit and commit-msg gates are NOT running. Fix: git config core.hooksPath .githooks`);
    } else {
      warn('git-hooks', 'core.hooksPath is unset — the tracked pre-commit and commit-msg gates are NOT running in this clone (git config is not cloned). Fix: git config core.hooksPath .githooks');
    }
  }
}

// ── J. packs: contract integrity (ADVISORY in tranche 1) ─────────────────────────
// The pack contract is `.agent/packs/README.md`; the rules live in resolve-packs.mjs
// so the validator, the CLI and the golden harness all enforce ONE implementation.
//
// Everything here is WARN until tranche 5, when the packs become load-bearing and the
// same findings flip to ERROR. Two checks matter most:
//   - one owner per slot / per dial ("impossible by
//     construction" property covers stage bodies, NOT slots inside a shared stage)
//   - the done-test: no `platform_target` literal left in a core dev-flow command
{
  const packsRoot = path.join(AGENT_DIR, 'packs');
  if (exists(packsRoot)) {
    const { packs, findings: loadFindings } = loadPacks(packsRoot);
    // TRANCHE 5: no longer advisory. The packs are load-bearing — six stages, three
    // agents and every stage-shaped command resolve through them — so a contract
    // violation is a real break, not a note about a future state.
    for (const x of loadFindings) add(x.severity, 'packs', x.message);

    // Compose every runnable combination — a collision only appears under composition,
    // so checking packs one at a time would report clean over the defect F4 describes.
    const seen = new Set();
    for (const combo of runnableCombinations({ packs })) {
      if (!combo.runnable) continue;
      const { findings: cf } = composePacks(combo, { packs });
      for (const x of cf) {
        const line = `${combo.platform} × ${combo.method} × ${combo.audience}: ${x.message}`;
        if (seen.has(line)) continue;
        seen.add(line);
        add(x.severity, 'packs', line);
      }
    }

    // Skill names must resolve — but only where they CAN. {router}
    // interpolates to `pages` for 11 skills this repo deliberately does not vendor, so
    // an absolute check would fail a correct pack. Non-templated names only, and WARN.
    const skillsDir = path.join(REPO_ROOT, '.claude', 'skills');
    if (exists(skillsDir)) {
      const installed = new Set(fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
      const plugins = installedPlugins();
      for (const { key, pack } of packs.values()) {
        for (const [stage, decl] of Object.entries(pack.stages ?? {})) {
          for (const entry of decl.skills ?? []) {
            if (!entry.skill || entry.skill.includes('{')) continue; // templated — resolved per run
            // `<plugin>:<skill>` is a PLUGIN skill, cited namespaced on purpose — a local
            // bare-name copy would shadow it (measured 2026-09-11 with three `claude -p`
            // sessions). It resolves through installed_plugins.json, not .claude/skills/.
            const ns = entry.skill.match(/^([a-z0-9-]+):([a-z0-9-]+)$/);
            if (ns) { checkPluginSkill(key, stage, ns[1], ns[2], plugins); continue; }
            if (!installed.has(entry.skill)) warn('packs', `${key}.${stage}: skill "${entry.skill}" is not vendored in .claude/skills/ (fine if it ships in a cluster this repo omits)`);
          }
        }
      }
    }

    // A pack's `owns` must agree with flows.json — the registry is what the pipeline
    // ACTUALLY resolves through, so a pack claiming a stage the registry points
    // elsewhere for is fiction that reads as ownership.
    // Path conventions differ BY DESIGN and must be normalized, not unified: inside a
    // pack every path is packs-root-relative (so it reads the same in the pack, in the
    // brief and in an export), while flows.json is `.agent/`-relative
    // like every other registry entry. Comparing them raw reports ten false errors.
    const asAgentRel = (packRel) => `packs/${packRel}`;
    for (const { key, pack } of packs.values()) {
      for (const st of pack.owns?.stages ?? []) {
        const cmd = flows.commands?.[st.command];
        if (!cmd) { error('packs', `${key}: owns.stages "${st.command}" is not a registered command in flows.json`); continue; }
        if (cmd.file !== asAgentRel(st.file)) error('packs', `${key}: owns.stages "${st.command}" declares ${st.file} but flows.json resolves ${cmd.file}`);
      }
      for (const ag of pack.owns?.agents ?? []) {
        const reg = flows.agent_registry?.[ag.role_id];
        if (!reg) { error('packs', `${key}: owns.agents "${ag.role_id}" is not in agent_registry`); continue; }
        if (reg.file !== asAgentRel(ag.file)) error('packs', `${key}: owns.agents "${ag.role_id}" declares ${ag.file} but agent_registry resolves ${reg.file}`);
      }
    }

    // ORPHANED DECLARATIONS — a pack declaring something no stage reads.
    //
    // This is the F1 class, and it is the quietest failure the pack model has: the pack
    // says `workspace.container`, the command never mentions it, the composition resolves
    // clean, every test passes, and the declaration simply does nothing. It survived a
    // whole tranche — including one that claimed to fix it — because no check looked.
    //
    // WARN, not ERROR: declaring ahead of the consumer is a legitimate WIP order. It just
    // must never be silent.
    {
      const DOC = /(_reason|_note|_why|_source|_evidence)$|^(finding|note|why|source|scope|evidence)$/;
      const stageCmd = (stage) => {
        const c = flows.commands?.[stage];
        return c ? path.join(AGENT_DIR, c.file) : null;
      };
      for (const { key, pack } of packs.values()) {
        for (const [stage, decl] of Object.entries(pack.stages ?? {})) {
          const cmdPath = stageCmd(stage);
          if (!cmdPath || !exists(cmdPath)) continue;   // pack-owned stage: it IS the consumer
          // When THIS pack replaces the stage body, its own file is the consumer — the
          // core command is not going to mention a declaration written for its
          // replacement. Read both, so an override does not turn every declaration on
          // that stage into a false orphan.
          const overrideBody = decl.overrides?.stage_body
            ? (exists(path.join(AGENT_DIR, 'packs', decl.overrides.stage_body)) ? read(path.join(AGENT_DIR, 'packs', decl.overrides.stage_body)) : '')
            : '';
          const body = read(cmdPath) + overrideBody;
          for (const name of Object.keys(decl)) {
            if (DOC.test(name)) continue;
            // `hooks` and `overrides` are consumed by the NAME OF THE ANCHOR / TARGET, not
            // by the container key — a stage says "the `ship.pre_commit` anchor", never
            // "hooks". Checking the container word reports a false orphan on a hook that
            // is read correctly.
            if (name === 'hooks' || name === 'overrides') {
              for (const inner of Object.keys(decl[name] ?? {})) {
                if (!body.includes(inner)) warn('packs', `${key}.${stage}.${name}.${inner} is declared but the stage command never mentions it — an orphaned declaration does nothing and reports clean`);
              }
              continue;
            }
            // `skills`, `hooks`, `additions`, `overrides`, `constraints` are read generically
            // by the brief instructions, so their own names appearing is the consumer.
            if (!body.includes(name)) {
              warn('packs', `${key}.${stage}.${name} is declared but the stage command never mentions it — an orphaned declaration does nothing and reports clean`);
            }
          }
        }
      }
    }

    // The done-test — now a RATCHET, not a count.
    //
    // The field is now RETIRED (2026-08-23): M0 does not write it, the manifest template does
    // not carry it, and no stage branches on it. The only live reader is ladder rung 2, which
    // derives a composition from a PRE-PACKS manifest — a one-way migration read.
    //
    // The ratchet stays, at its new floor, because a flat "zero references" rule would fail the
    // build for prose that is *correct*: the remaining lines EXPLAIN the retirement, and a reader
    // who meets the field in an old manifest needs to be able to find that explanation.
    //
    // So each remaining file gets a declared allowance with a reason. Exceeding it, or
    // introducing the literal in a file with no allowance, is an ERROR. The allowance may
    // only ever go DOWN — a file that drops below its number tightens automatically, and
    // the day a file reaches 0 its entry is deleted. A ratchet cannot be gamed by adding
    // a reference somewhere convenient.
    const ALLOWANCE = {
      '02-create-prd.md': [4, 'the retirement notice, plus prose contrasting the old platform_target:other branch with a null composition'],
      '02a-create-frd.md': [1, 'inherits /create-prd § Composition by reference and states the field is not written'],
      '08-test.md': [1, 'the note recording what the gate-token branch USED to say — deliberate history, not a live branch'],
    };
    const devFlowDir = path.join(AGENT_DIR, 'commands', 'project', 'dev-flow');
    if (exists(devFlowDir)) {
      let total = 0;
      for (const name of fs.readdirSync(devFlowDir).filter((n) => n.endsWith('.md'))) {
        const hits = (read(path.join(devFlowDir, name)).match(/platform_target/g) ?? []).length;
        total += hits;
        const [allowed, why] = ALLOWANCE[name] ?? [0, null];
        if (hits > allowed) {
          error('packs', `${name}: ${hits} platform_target reference(s), allowance ${allowed}${why ? ` (${why})` : ' — this file has no allowance; use the pack brief'}. The ratchet only tightens.`);
        } else if (hits < allowed) {
          warn('packs', `${name}: ${hits} platform_target reference(s) but the allowance is still ${allowed} — tighten the ratchet in validate-framework.mjs.`);
        }
      }
      const budget = Object.values(ALLOWANCE).reduce((a, [n]) => a + n, 0);
      info('packs', `${total} platform_target reference(s) in dev-flow, ratchet budget ${budget} — all of it prose ABOUT the retirement, not a live dependency.`);
    }
  }
}

// ── K. xmcloud.build.json: one blueprint, one pinned nodeVersion ─────────────────
// The implementation lives in check-xmcloud-build-blueprint.mjs so the validator, the
// pre-commit hook and the standalone CLI enforce ONE thing. Framework templates only —
// the real head apps are scored on demand with `--products`, because products sit behind
// an external mount and a missing workspace is not a framework defect.
{
  const { findings: bp } = checkBlueprint(REPO_ROOT);
  for (const f of bp) add(f.severity, f.area, f.message);
}

// ── L. contract vocabulary: no file may PRESCRIBE a value its own contract forbids ──
// The manifest gate catches a bad value one corrupted run at a time; this catches the file
// that causes it, before any run exists. Measured 2026-09-02: `02-create-prd.md` prescribed
// `outcome: "confirmed"` and `04-architect.md` prescribed `"split" | "bundled"`, neither of
// which the enum permits — so runs that obeyed their command were non-conformant by
// construction, and 11 of 16 Content SDK manifests carried an illegal outcome.
{
  const { findings: cv, scanned, matches } = checkVocabulary({ repo: REPO_ROOT });
  for (const f of cv) add(f.level, 'contract-vocab', `${f.file}:${f.line} — ${f.msg}`);
  if (!cv.some((f) => f.level === 'ERROR')) {
    info('contract-vocab', `${matches} stage/outcome prescription(s) across ${scanned} file(s) — all legal under the enums they belong to.`);
  }
}

// ── M. skills: SKILL.md contract + the listing budget ─────────────────────────────
// The implementation lives in audit-skills.mjs so the validator, the pre-commit hook and the
// standalone CLI enforce ONE thing. The budget axis is the load-bearing one: Claude Code caps
// the skill listing at contextWindow × 4 × skillListingBudgetFraction and demotes the least-
// used skills to name-only when it overflows — measured 2026-09-16, 24 of 61 skills were
// invisible to the model in a live session while every file-level check was green. A skill
// nobody can trigger is a declaration nothing reads (rule 88).
{
  if (!skillsSelfCheck()) error('skills', 'audit-skills self-check failed — the audit cannot stand behind its own classifier; fix it before trusting any skill finding');
  else {
    const { findings: sk, budget } = auditSkills({ repo: REPO_ROOT });
    for (const f of sk) add(f.severity, 'skills', f.msg);
    if (!sk.some((f) => f.severity === 'ERROR')) info('skills', `${budget.skills} skills hold the SKILL.md contract; listing ${budget.chars}/${budget.budget} chars.`);
  }
}


// ── report ───────────────────────────────────────────────────────────────────────

function report() {
  const errors = findings.filter((f) => f.severity === 'ERROR');
  const warns = findings.filter((f) => f.severity === 'WARN');
  const infos = findings.filter((f) => f.severity === 'INFO');

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: errors.length === 0, counts: { error: errors.length, warn: warns.length, info: infos.length }, findings }, null, 2));
    return;
  }

  const clean = errors.length === 0;
  if (QUIET && clean) return;

  const order = { ERROR: 0, WARN: 1, INFO: 2 };
  const icon = { ERROR: 'x', WARN: '!', INFO: 'i' };
  for (const f of [...findings].sort((a, b) => order[a.severity] - order[b.severity])) {
    console.log(`  ${icon[f.severity]} [${f.severity}] ${f.area}: ${f.message}`);
  }
  console.log('');
  console.log(`Framework validation: ${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info.`);
  if (!clean) {
    console.log('FAILED — fix the errors above. Mirror staleness? run:');
    console.log('  bash .agent/scripts/sync-agents.sh && bash .agent/scripts/sync-wrappers.sh');
  } else {
    console.log('OK — flows.json, agents, commands, glossary, and mirrors are consistent.');
  }
}

report();
process.exit(findings.some((f) => f.severity === 'ERROR') ? 1 : 0);
