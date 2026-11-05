#!/usr/bin/env node
/**
 * check-xmcloud-build-blueprint.mjs — one source of truth for `xmcloud.build.json`.
 *
 *   node .agent/scripts/check-xmcloud-build-blueprint.mjs            # framework templates
 *   node .agent/scripts/check-xmcloud-build-blueprint.mjs --products # + every real head app
 *   node .agent/scripts/check-xmcloud-build-blueprint.mjs --json
 *
 * Pure Node, no deps, no network. Also imported by validate-framework.mjs § K, so the
 * pre-commit hook gates on it.
 *
 * WHY THIS EXISTS (2026-08-24). The pinned Node version was stated twice and the two
 * copies disagreed: `24.14.1` in the authoring-baseline template and `22.13.0` in a
 * `/provision-sitecoreai` prose snippet labelled "verified-working shape" — while the
 * step's own instruction said to derive the entry from the template. Both readings were
 * compliant, so nine head apps got one value and one got the other, and nothing could
 * see it: no schema, no validator, no test, and no build failure either way. That is
 * rule `88` — a declaration with two homes and no gate comparing them.
 *
 * So the gate is deliberately blunt: the value may appear in the blueprint's own
 * templates and nowhere else under `.agent/`. A stage may CITE the template path; it may
 * not restate the value. Prose cannot be kept in sync by discipline — it has to be
 * impossible to write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');

const BLUEPRINT_DIR = 'packs/platform/content-sdk/templates/xmcloud-build';
const EDITING_HOST_TPL = `${BLUEPRINT_DIR}/editing-host.xmcloud.build.json`;
const CM_ONLY_TPL = `${BLUEPRINT_DIR}/cm-only.xmcloud.build.json`;
const BASELINE_TPL = 'packs/platform/content-sdk/templates/authoring-baseline/xmcloud.build.json';
const BLUEPRINT_DOC = `${BLUEPRINT_DIR}/README.md`;
const PACK_JSON = 'packs/platform/content-sdk/pack.json';

/**
 * Files allowed to carry a `"nodeVersion": "…"` literal. Everything else is drift.
 *
 * The two templates are the real homes. The gate's own machinery is exempt for a
 * different reason: this file and its test must SPELL the pattern to detect and mutate
 * it, and neither is prose an agent ever reads. Keep that list to exactly these two —
 * every other exemption would be re-opening the hole.
 */
const VERSION_HOMES = new Set([
  EDITING_HOST_TPL,
  BASELINE_TPL,
  'scripts/check-xmcloud-build-blueprint.mjs',
  'scripts/__tests__/xmcloud-build-blueprint.test.mjs',
]);

// x.y.z only — the platform wants an exact version, and a loose pattern matches prose.
const NODE_VERSION_LITERAL = /"nodeVersion"\s*:\s*"(\d+\.\d+\.\d+)"/g;

/** Directories a stray-literal scan should never walk. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'goldens']);
const SCAN_EXT = new Set(['.md', '.mdc', '.json', '.mjs', '.js', '.ts', '.sh', '.ps1', '.txt', '.yml', '.yaml']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); continue; }
    if (SCAN_EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

const readJson = (abs) => JSON.parse(fs.readFileSync(abs, 'utf8'));

/**
 * The shape contract, asserted per emitted template. Values come from the Sitecore
 * build-configuration reference (blueprint § 1); `enabled` and `type` are called out
 * because their DEFAULTS (false / "jss") are wrong for a Content SDK editing host, so an
 * omitted key fails silently rather than loudly.
 */
function checkEditingHostShape(json, label, push) {
  const hosts = json.renderingHosts;
  if (!hosts || typeof hosts !== 'object') { push('ERROR', `${label}: no renderingHosts object`); return null; }
  const keys = Object.keys(hosts);
  if (keys.length !== 1) { push('ERROR', `${label}: expected exactly one rendering host, found ${keys.length}`); return null; }
  const h = hosts[keys[0]];
  if (h.enabled !== true) push('ERROR', `${label}: enabled must be true — it defaults to FALSE, so the host builds nothing`);
  if (h.type !== 'sxa') push('ERROR', `${label}: type must be "sxa" (default is "jss") — got ${JSON.stringify(h.type)}`);
  if (h.buildCommand !== 'build') push('ERROR', `${label}: buildCommand must be "build" — got ${JSON.stringify(h.buildCommand)}`);
  if (h.runCommand !== 'next:start') push('ERROR', `${label}: runCommand must be "next:start" — got ${JSON.stringify(h.runCommand)}`);
  if (typeof h.jssDeploymentSecret !== 'string' || h.jssDeploymentSecret.length < 32) push('ERROR', `${label}: jssDeploymentSecret must be a 32+ character string`);
  if (typeof h.nodeVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(h.nodeVersion)) push('ERROR', `${label}: nodeVersion must be an exact x.y.z version — got ${JSON.stringify(h.nodeVersion)}`);
  if ('authoringPath' in json) push('ERROR', `${label}: an editing-host deployable ships rendering code only — drop authoringPath (blueprint § 2)`);
  if (json.postActions?.actions?.scsModules) push('ERROR', `${label}: scsModules belongs to the CM deployable, not the editing host (blueprint § 2)`);
  return { key: keys[0], host: h };
}

export function checkBlueprint(repoRoot = REPO_ROOT) {
  const findings = [];
  const push = (severity, message) => findings.push({ severity, area: 'xmcloud-build', message });
  const agentDir = path.join(repoRoot, '.agent');
  const abs = (rel) => path.join(agentDir, rel);

  // PACK-SCOPED. Everything below lives inside platform/content-sdk/, so a composition without
  // that pack legitimately has none of it — a core or marketplace-only export, for instance.
  // Erroring there would report a Sitecore-shaped defect against a tree that contains no Sitecore,
  // which is the same class as rules leaking into the core export.
  //
  // Absent pack => nothing to check, and that is a resolved answer rather than a silent skip: the
  // caller gets zero findings because zero apply. A pack that IS present and incomplete still errors.
  if (!fs.existsSync(abs(PACK_JSON))) {
    return { findings, pinned: null, scanned: 0, skipped: 'platform:content-sdk not present in this tree' };
  }
  for (const rel of [BLUEPRINT_DOC, EDITING_HOST_TPL, CM_ONLY_TPL, BASELINE_TPL]) {
    if (!fs.existsSync(abs(rel))) { push('ERROR', `missing: .agent/${rel}`); return { findings, pinned: null, scanned: 0 }; }
  }

  // 1. The pin, read from the editing-host template — the file the pipeline copies.
  const eh = readJson(abs(EDITING_HOST_TPL));
  const ehEntry = checkEditingHostShape(eh, EDITING_HOST_TPL, push);
  const pinned = ehEntry?.host?.nodeVersion ?? null;
  if (ehEntry && ehEntry.key !== '<EDITING_HOST_NAME>') push('ERROR', `${EDITING_HOST_TPL}: the rendering-host key must stay the <EDITING_HOST_NAME> token — a real name here ships as a default nobody edits`);
  if (ehEntry && ehEntry.host.path !== './') push('ERROR', `${EDITING_HOST_TPL}: path must be "./" (topology A, repo per deployable)`);

  // 2. CM-only shape.
  const cm = readJson(abs(CM_ONLY_TPL));
  if (Object.keys(cm.renderingHosts ?? { x: 1 }).length !== 0) push('ERROR', `${CM_ONLY_TPL}: renderingHosts must be {} — the head-app repo owns the entry in topology A`);
  if (cm.authoringPath !== './authoring') push('ERROR', `${CM_ONLY_TPL}: authoringPath must be "./authoring"`);

  // 3. The topology-B baseline must agree on the pin. It is a different SHAPE, never a
  //    different VERSION — that distinction is the whole defect this file gates.
  const baseline = readJson(abs(BASELINE_TPL));
  const bKeys = Object.keys(baseline.renderingHosts ?? {});
  if (bKeys.length !== 1) push('ERROR', `${BASELINE_TPL}: expected one rendering host, found ${bKeys.length}`);
  else if (pinned && baseline.renderingHosts[bKeys[0]].nodeVersion !== pinned) {
    push('ERROR', `${BASELINE_TPL}: nodeVersion ${JSON.stringify(baseline.renderingHosts[bKeys[0]].nodeVersion)} disagrees with the pin ${JSON.stringify(pinned)} — bump both in one commit (blueprint § 4)`);
  }
  // 3a. Topology B is now a shape a RUN can select (`pack.repo_topology`), not just a shape the
  //     template happens to ship in — so its two discriminating properties are gated like A's.
  //     Without this the monorepo path had no done-test at all: the value was selectable and the
  //     file it emits was checked only for its Node pin.
  if (bKeys.length === 1) {
    const bHost = baseline.renderingHosts[bKeys[0]];
    if (bKeys[0] !== '<EDITING_HOST_NAME>') push('ERROR', `${BASELINE_TPL}: the rendering-host key must stay the <EDITING_HOST_NAME> token — a real name here ships as a default nobody edits`);
    if (bHost.path !== './sites/<SITE_NAME>') push('ERROR', `${BASELINE_TPL}: path must be "./sites/<SITE_NAME>" (topology B, monorepo) — found ${JSON.stringify(bHost.path)}`);
    if (baseline.authoringPath !== './authoring') push('ERROR', `${BASELINE_TPL}: authoringPath must be "./authoring" — in topology B ONE descriptor covers both deployables, so dropping it leaves the CM half unbuilt`);
  }
  // 3b. The topology declaration and the templates must name each other. A variant pointing at a
  //     template that does not exist — or at the WRONG one — resolves into a brief that tells an
  //     agent to copy a file it cannot find, or to emit topology A's shape for a monorepo run.
  {
    const rt = readJson(abs(PACK_JSON)).repo_topology;
    if (rt && typeof rt === 'object') {
      const want = { 'repo-per-deployable': EDITING_HOST_TPL, monorepo: BASELINE_TPL };
      for (const [value, expected] of Object.entries(want)) {
        if (!(rt.values ?? []).includes(value)) continue;
        const got = rt.variants?.[value]?.repo_setup?.deployable_baseline?.xmcloud_build_json?.template;
        if (typeof got !== 'string') { push('ERROR', `${PACK_JSON}: repo_topology.variants.${value} declares no build-descriptor template`); continue; }
        if (!fs.existsSync(path.join(repoRoot, got))) push('ERROR', `${PACK_JSON}: repo_topology.variants.${value} template → ${got} does not exist`);
        else if (!got.endsWith(expected.split('/').pop())) push('ERROR', `${PACK_JSON}: repo_topology.variants.${value} names ${got}, but that topology emits ${expected}`);
      }
    }
  }

  // 4. The pack declaration, which is what reaches an agent via the stage brief.
  const pack = readJson(abs(PACK_JSON));
  const decl = pack.repo_setup?.deployable_baseline?.xmcloud_build_json;
  if (!decl || typeof decl !== 'object') push('ERROR', `${PACK_JSON}: repo_setup.deployable_baseline.xmcloud_build_json must be an object declaring template/blueprint/node_version`);
  else {
    if (decl.node_version !== pinned) push('ERROR', `${PACK_JSON}: declares node_version ${JSON.stringify(decl.node_version)} but the template pins ${JSON.stringify(pinned)}`);
    for (const k of ['template', 'blueprint']) {
      const p = decl[k];
      if (typeof p !== 'string') { push('ERROR', `${PACK_JSON}: xmcloud_build_json.${k} is missing`); continue; }
      if (!fs.existsSync(path.join(repoRoot, p))) push('ERROR', `${PACK_JSON}: xmcloud_build_json.${k} → ${p} does not exist`);
    }
  }

  // 5. STRAY LITERALS. The check the old arrangement lacked.
  const files = walk(agentDir);
  let scanned = 0;
  for (const file of files) {
    scanned++;
    const rel = path.relative(agentDir, file).split(path.sep).join('/');
    if (VERSION_HOMES.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(NODE_VERSION_LITERAL)) {
      push('ERROR', `.agent/${rel}: restates "nodeVersion": "${m[1]}". The blueprint (${BLUEPRINT_DOC}) is the only home — cite the template path instead.`);
    }
  }
  // Floor assertion (rule 88): a scan that walked nothing reports clean over everything.
  if (scanned < 50) push('ERROR', `stray-literal scan walked only ${scanned} files under .agent/ — the corpus is missing, so a green result here means nothing`);

  return { findings, pinned, scanned };
}

/**
 * Opt-in: score the REAL head apps against the pin. Off by default — products live
 * behind an external mount that may be absent, and a missing workspace is not a
 * framework defect.
 */
export async function checkProducts(pinned) {
  const findings = [];
  const push = (severity, message) => findings.push({ severity, area: 'xmcloud-build', message });
  let root;
  try {
    const mod = await import('./resolve-products-root.mjs');
    const r = mod.resolveProductsRoot();
    root = typeof r === 'string' ? r : r.root ?? r.path;
  } catch (e) {
    push('WARN', `products root did not resolve (${e.message}) — skipped`);
    return findings;
  }
  const headApps = path.join(root, 'head-application');
  if (!fs.existsSync(headApps)) { push('WARN', 'no head-application group on disk — skipped'); return findings; }
  let checked = 0;
  for (const project of fs.readdirSync(headApps, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const app of fs.readdirSync(path.join(headApps, project.name), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const file = path.join(headApps, project.name, app.name, 'xmcloud.build.json');
      if (!fs.existsSync(file)) continue;
      checked++;
      const label = `${project.name}/${app.name}`;
      let json;
      try { json = readJson(file); } catch (e) { push('ERROR', `${label}: unparseable xmcloud.build.json (${e.message})`); continue; }
      for (const [key, h] of Object.entries(json.renderingHosts ?? {})) {
        if (h.nodeVersion !== pinned) push('WARN', `${label}: renderingHosts.${key}.nodeVersion is ${JSON.stringify(h.nodeVersion)}, pin is ${JSON.stringify(pinned)}`);
        if (h.enabled !== true) push('WARN', `${label}: renderingHosts.${key}.enabled is not true`);
        if (app.name !== 'cm' && key.toLowerCase() !== app.name.toLowerCase()) {
          push('WARN', `${label}: rendering-host key "${key}" does not match the app folder — verify it equals the editing-host name passed to \`editinghost create -n\` (blueprint § 3.1); a mismatch is invisible on the public host and shows as an all-missing layout in Pages`);
        }
      }
    }
  }
  if (!checked) push('WARN', 'no head-app xmcloud.build.json found — nothing scored');
  return findings;
}

if (process.argv[1]?.endsWith('check-xmcloud-build-blueprint.mjs')) {
  const argv = process.argv.slice(2);
  const { findings, pinned, scanned } = checkBlueprint();
  if (argv.includes('--products')) findings.push(...(await checkProducts(pinned)));
  const errors = findings.filter((f) => f.severity === 'ERROR');
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ pinned, scanned, findings }, null, 2));
  } else if (!argv.includes('--quiet') || findings.length) {
    console.log(`xmcloud.build.json blueprint — pin ${pinned}, ${scanned} files scanned`);
    for (const f of findings) console.log(`  ${f.severity === 'ERROR' ? 'ERROR' : f.severity === 'WARN' ? 'warn ' : 'info '} ${f.message}`);
    if (!findings.length) console.log('  clean');
  }
  process.exit(errors.length ? 1 : 0);
}
