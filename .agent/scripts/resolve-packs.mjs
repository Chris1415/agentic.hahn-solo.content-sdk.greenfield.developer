#!/usr/bin/env node
/**
 * resolve-packs.mjs — load, validate and compose platform / method / audience packs.
 *
 *   node .agent/scripts/resolve-packs.mjs --list
 *   node .agent/scripts/resolve-packs.mjs --platform content-sdk --method clone --json
 *   node .agent/scripts/resolve-packs.mjs --check          # every runnable combination
 *   node .agent/scripts/resolve-packs.mjs --platform content-sdk --method greenfield \
 *        --audience developer --stage create-prd --topology monorepo --md
 *                                                          # the run's recorded topology, resolved
 *
 * Pure Node (no deps) so it runs identically on Windows / macOS / Linux and inside
 * the pre-commit hook. Imported by validate-framework.mjs § J.
 *
 * The contract this enforces is `.agent/packs/README.md`. Two rules are the whole
 * point of the module and neither is checkable by reading one file:
 *
 *   - ONE OWNER PER SLOT, per stage. 
 *     The disjoint-range rule stops two packs replacing the same stage BODY, but not two
 *     packs claiming the same SLOT on a stage both legitimately touch. That gap was
 *     found by writing two packs that both wanted /implement's definition_of_done.
 *   - ONE OWNER PER DIAL, and it must be the owning KIND.
 *
 * Severity is deliberately caller-set: tranche 1 is advisory (WARN), tranche 5 flips
 * the same findings to ERROR. See `escalate` in the exported API.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');
export const PACKS_ROOT = path.join(REPO_ROOT, '.agent', 'packs');

export const CONTRACT_VERSION = 1;
export const KINDS = ['platform', 'method', 'audience', 'source'];

/** The nulls. A missing directory IS the null — there is no empty pack to maintain. */
export const NULLS = { platform: 'none', method: 'greenfield', audience: 'developer', source: 'none' };

/**
 * `source` is the /migrate axis: what a run can read BESIDES the public site (backend, code).
 * It is ADDITIVE ONLY (brief Decision 20): no slots, no dials, no overrides, no owned stages, no
 * pack-level keys — and it must name the packs it requires and the closed set it composes with.
 * Absent (the null) means exactly today's behaviour; `runnableCombinations()` stays a triple loop
 * so the brief goldens never see this dimension. Source compositions: `sourceCombinations()`.
 */
const SOURCE_FORBIDDEN_TOP = ['owns', 'dials', 'variable_defaults', 'pack_level_scope'];

/**
 * Ordered-injection anchors. The plan listed 8; this is 7 + `tranche_join`.
 *
 * `scaffold` and `preflight_credentials` are NOT here — they are SLOTS. A name cannot be both: a slot is data the stage applies at a fixed point it
 * already owns, an anchor is an ordered list the stage splices in. Listing a name in
 * both leaves a pack no way to know where to declare it and a command no way to know
 * where to read it, and the two would silently diverge. Enforced below.
 */
export const ANCHORS = [
  'discovery.questions', 'tranche_exit', 'tranche_join', 'integration_assertions',
  'test_fixture_setup', 'ship.pre_commit', 'ship.post_pr',
];

/** One owner per slot (README § Slot ownership). `constraints` is absent by design — it is a list and concatenates. */
export const SLOT_OWNER = {
  scaffold: 'platform',
  definition_of_done: 'platform',
  generated_artifacts: 'platform',
  preflight_credentials: 'platform',
  workspace: 'platform',
  repo_setup: 'platform',
  exit_criteria: 'method',
};

/** One owner per scope-dial field (README § Scope-dial ownership). */
export const DIAL_OWNER = {
  ui_variants: 'method', rigor: 'method',
  content_authoring: 'platform', imagery: 'platform',
  delivery_loop: 'platform', delivery_parallelism: 'platform',
  gates: 'audience', output_verbosity: 'audience', docs_at_ship: 'audience',
  external_reference: 'audience', track: 'audience',
};

/**
 * Which STAGE consumes each scope dial. `null` = the core pipeline consumes it, so it is always
 * askable. A named stage means the dial is answerable only when some active pack OWNS that stage.
 *
 * This is what makes M1 pack-filtered (platform-pack.md § 5). Until 2026-08-27 the filter existed
 * only as a sentence in platform-pack.md and `/create-prd` never carried it, so a `platform: none`
 * run was scripted to ask a plain-Node-CLI operator about the Sitecore content phase and image
 * generation. Measured by the control run that day. Deriving the drop from `owns.stages` rather than
 * from a platform name is the point: no pack is named here, and a pack that starts owning
 * `author-content` gets the dials back for free.
 *
 * The table is hand-maintained, which is the shape rule `88` warns about — so
 * `__tests__/dial-pack-filter.test.mjs` asserts every named consumer is either a core stage or
 * declared in some pack's `owns.stages[].command`. A typo here fails the suite instead of silently
 * making a dial unaskable forever.
 */
export const DIAL_CONSUMER = {
  content_authoring: 'author-content',
  imagery: 'author-content',
  ui_variants: null,
  rigor: null,
  track: null,
  docs_at_ship: null,
  delivery_loop: null,
  delivery_parallelism: null,
  gates: null,
  output_verbosity: null,
  external_reference: null,
  dual_review: null,
};

/** Stages the core pipeline always provides — a dial pointing at one of these is never dropped. */
export const CORE_STAGES = [
  'prime', 'rubber-ducky', 'create-prd', 'challenge-prd', 'create-frd', 'create-bug',
  'architect', 'design', 'task-breakdown', 'implement', 'code-review', 'test', 'ship',
  'document', 'status', 'triage', 'start-flow', 'probe', 'research',
];

/**
 * The M1 scope-dial plan for a composition: which dials to ASK, which a pack has already answered
 * (PRESET), and which cannot apply at all (DROPPED).
 *
 * Returns `{ ask, preset, dropped }`. `/create-prd` builds its `AskUserQuestion` calls from `ask`,
 * takes `preset` values verbatim with provenance, and records `dropped` as `null` in the manifest
 * with the reason — never as a defaulted value, because "nobody could answer this" and "the
 * operator chose the default" are different facts and only one of them is safe to act on.
 */
export function dialPlan(composition, { packs } = loadPacks()) {
  const ownedStages = new Set();
  for (const key of composition.active ?? []) {
    const entry = [...packs.values()].find((p) => p.key === key);
    for (const s of entry?.pack?.owns?.stages ?? []) ownedStages.add(s.command);
  }
  const ask = [];
  const preset = {};
  const dropped = {};
  for (const [dial, consumer] of Object.entries(DIAL_CONSUMER)) {
    if (consumer && !CORE_STAGES.includes(consumer) && !ownedStages.has(consumer)) {
      dropped[dial] = { records_as: null, why: `no active pack owns /${consumer}` };
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(composition.dials ?? {}, dial)) {
      preset[dial] = { value: composition.dials[dial], from: dialSource(composition, dial, packs) };
      continue;
    }
    ask.push(dial);
  }
  return { ask, preset, dropped };
}

/** Which active pack declared this dial — provenance for a preset the operator never saw. */
function dialSource(composition, dial, packs) {
  for (const key of composition.active ?? []) {
    const entry = [...packs.values()].find((p) => p.key === key);
    if (entry?.pack?.dials && Object.prototype.hasOwnProperty.call(entry.pack.dials, dial)) return key;
  }
  return 'unknown';
}

/** Slots whose value may be null ONLY with a `<slot>_reason` sibling. */
const NULLABLE_SLOTS = Object.keys(SLOT_OWNER);

/**
 * WHO MAY OVERRIDE WHAT (README § Who may override what) — declared since tranche 1 and
 * unenforced until tranche 8, because `audience` was the kind it actually binds and it
 * did not exist yet.
 *
 * The ranges are disjoint, which is what makes two packs overriding one stage impossible
 * BY CONSTRUCTION for stage bodies. (Slots inside a stage are a separate rule — F4.)
 *
 * `audience` may override TEMPLATES ONLY. That restriction is not tidiness: `method`
 * already owns overrides across intake/spec/design, so an audience pack overriding a
 * stage there would collide and force `incompatible_with: [method:clone]` — foreclosing
 * marketer × clone, the most plausible non-developer scenario there is.
 */
const OVERRIDE_RANGE = {
  platform: ['implement', 'code-review', 'test', 'ship', 'document', 'publish', 'provision-sitecoreai', 'discover-sitecoreai', 'discover-components', 'author-content', 'test-content'],
  method: ['create-prd', 'create-frd', 'create-bug', 'challenge-prd', 'architect', 'design', 'task-breakdown', 'source-analysis'],
  audience: [],   // templates only — see checkOverrideRange
  source: [],     // nothing, templates included — see the source-kind block in checkPackShape
};

/** Stage keys the merger handles explicitly; everything else carries through as a declaration. */
const HANDLED_STAGE_KEYS = new Set(['skills', 'additions', 'hooks', 'constraints', 'overrides']);

/**
 * Stage declarations that CONCATENATE across packs instead of having one owner. Each entry is
 * tagged with the pack that declared it. `derives_instead_of_asking` joined 2026-09-30: an
 * audience pack derives what its operator cannot judge, a method pack derives what its source
 * already answers (the clone intake), and both suppress questions in the same /create-prd pool.
 * One-owner would force a clone run to choose between them — the two are additive by nature.
 */
const CONCAT_DECLARATIONS = new Set(['derives_instead_of_asking']);

/** Documentation keys — carried with provenance, never conflict-checked. */
const DOC_KEY = /(_reason|_note|_why|_source)$|^(finding|note|why|source|scope)$/;

const f = (severity, area, message) => ({ severity, area, message });

// ── load ─────────────────────────────────────────────────────────────────────────

/**
 * Read every pack.json under packsRoot. Structural findings only — nothing
 * cross-pack, because a single pack is valid or not on its own terms.
 */
export function loadPacks(packsRoot = PACKS_ROOT) {
  _packsRoot = packsRoot;
  const packs = new Map();
  const findings = [];
  if (!fs.existsSync(packsRoot)) return { packs, findings };

  for (const kind of KINDS) {
    const kindDir = path.join(packsRoot, kind);
    if (!fs.existsSync(kindDir)) continue;
    for (const id of fs.readdirSync(kindDir).sort()) {
      const file = path.join(kindDir, id, 'pack.json');
      if (!fs.existsSync(file)) continue;

      let pack;
      try {
        pack = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        findings.push(f('ERROR', 'packs', `${kind}/${id}/pack.json does not parse: ${e.message}`));
        continue;
      }

      const key = `${kind}:${id}`;
      // The directory is the identity. A pack.json disagreeing with where it sits is
      // ambiguous about which one wins, so neither is trusted.
      if (pack.kind !== kind) findings.push(f('ERROR', 'packs', `${key}: declares kind "${pack.kind}" but sits under ${kind}/`));
      if (pack.id !== id) findings.push(f('ERROR', 'packs', `${key}: declares id "${pack.id}" but its directory is "${id}"`));
      if (pack.contract !== CONTRACT_VERSION) {
        findings.push(f('ERROR', 'packs', `${key}: contract ${JSON.stringify(pack.contract)} — this resolver implements ${CONTRACT_VERSION}`));
      }
      if (Object.prototype.hasOwnProperty.call(NULLS, kind) && id === NULLS[kind]) {
        findings.push(f('ERROR', 'packs', `${key}: "${id}" is the null of the ${kind} dimension — a null injects nothing and must NOT have a directory`));
      }

      findings.push(...checkPackShape(key, pack));

      // A claimed rule that does not exist is the dangerous half of pack-scoped rules.
      // Rules default IN — unclaimed means core, so a typo in rules[] does not fail loudly;
      // it just means no pack claims that filename, and the REAL rule keeps shipping while
      // the pack believes it owns it. Only an existence check surfaces that.
      // Derived from packsRoot, not the repo root, so a fixture root checks ITS own rules dir.
      // Skipped entirely when there is no sibling rules/ — a fixture that does not model rules
      // must not fail on them. The suite covers the firing path with a fixture that HAS one.
      const rulesDir = path.join(packsRoot, '..', 'rules');
      for (const r of fs.existsSync(rulesDir) ? pack.rules ?? [] : []) {
        if (!fs.existsSync(path.join(rulesDir, r))) {
          findings.push(f('ERROR', 'packs', `${key}: rules[] claims "${r}" which does not exist in .agent/rules/ — a claim on a non-existent rule scopes nothing and hides the real rule's true scope`));
        }
      }
      packs.set(key, { key, kind, id, dir: path.join(kindDir, id), pack });
    }
  }

  // extends must resolve, and to the SAME kind (README § extends).
  for (const { key, kind, pack } of packs.values()) {
    if (!pack.extends) continue;
    const target = pack.extends.includes(':') ? pack.extends : `${kind}:${pack.extends}`;
    if (!packs.has(target)) findings.push(f('ERROR', 'packs', `${key}: extends "${pack.extends}" which does not resolve`));
    else if (packs.get(target).kind !== kind) findings.push(f('ERROR', 'packs', `${key}: extends "${target}" of a different kind — inheritance is same-kind only`));
  }

  // `owns` must be TRUE, not aspirational (tranche 5). A pack claiming a stage whose
  // file is missing, or an agent whose registry entry points elsewhere, reads as
  // "this pack owns its stages" while the pipeline still resolves them from core.
  for (const { key, pack } of packs.values()) {
    for (const s of pack.owns?.stages ?? []) {
      if (!s.file) { findings.push(f('ERROR', 'packs', `${key}: owns.stages "${s.command}" has no file`)); continue; }
      if (!fs.existsSync(path.join(packsRoot, s.file))) findings.push(f('ERROR', 'packs', `${key}: owns.stages "${s.command}" → ${s.file} does not exist`));
    }
    for (const a of pack.owns?.agents ?? []) {
      if (!a.file || !fs.existsSync(path.join(packsRoot, a.file))) findings.push(f('ERROR', 'packs', `${key}: owns.agents "${a.role_id}" → ${a.file} does not exist`));
    }
  }

  // incompatible_with must name real packs, or the composition check silently never fires.
  for (const { key, pack } of packs.values()) {
    for (const other of pack.incompatible_with ?? []) {
      if (!/^[a-z]+:[a-z0-9-]+$/.test(other)) findings.push(f('ERROR', 'packs', `${key}: incompatible_with "${other}" is not "kind:id"`));
      else if (!packs.has(other)) findings.push(f('WARN', 'packs', `${key}: incompatible_with "${other}" does not resolve to a pack`));
    }
  }

  return { packs, findings };
}

/**
 * Where a pack's relative `body:` / `file:` paths resolve FROM.
 * They are written packs-root-relative (`platform/content-sdk/stages/x.md`) so a path
 * reads the same in the pack, in the brief and in an export — a pack-dir-relative path
 * would silently mean something different in each.
 */
let _packsRoot = PACKS_ROOT;
const packsRootOf = () => _packsRoot;

/** When an unresolved tenant-facing name stops the run. Ordered earliest-to-latest. */
export const REQUIRED_AT = ['intake', 'before_scaffold', 'go_live'];

/**
 * The `workspace{}` slots the run manifest actually has. Read from the template rather than
 * hardcoded, so the two cannot drift — a pack naming a tenant-facing field with no slot has
 * nowhere to record the name it calls permanent.
 */
const MANIFEST_WORKSPACE_SLOTS = (() => {
  try {
    const tpl = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.agent', 'manifests', 'run-manifest.template.json'), 'utf8'));
    return new Set(Object.keys(tpl.workspace ?? {}).filter((k) => !k.startsWith('//')));
  } catch { return new Set(); }
})();

function checkPackShape(key, pack) {
  const out = [];
  if (pack.kind === 'source') {
    for (const k of SOURCE_FORBIDDEN_TOP) {
      if (pack[k] !== undefined) out.push(f('ERROR', 'packs', `${key}.${k}: a source pack is additive only and may not declare "${k}" (brief Decision 20)`));
    }
    for (const k of PACK_LEVEL_KEYS) {
      if (pack[k] !== undefined) out.push(f('ERROR', 'packs', `${key}.${k}: a source pack may not declare pack-level "${k}" — that key has a platform owner (brief Decision 20)`));
    }
    for (const list of ['requires', 'composes_with']) {
      const v = pack[list];
      if (!Array.isArray(v) || v.length === 0) out.push(f('ERROR', 'packs', `${key}.${list} must be a non-empty array of "kind:id" — a source pack names exactly what it runs with, and an unknown combination is refused`));
      else for (const x of v) if (!/^[a-z]+:[a-z0-9-]+$/.test(x)) out.push(f('ERROR', 'packs', `${key}.${list} "${x}" is not "kind:id"`));
    }
    for (const r of pack.requires ?? []) {
      if (!(pack.composes_with ?? []).includes(r)) out.push(f('ERROR', 'packs', `${key}.requires "${r}" is missing from composes_with — a required pack the allowlist refuses is unrunnable`));
    }
    for (const [stage, decl] of Object.entries(pack.stages ?? {})) {
      if (decl?.overrides !== undefined) out.push(f('ERROR', 'packs', `${key}.${stage}.overrides: a source pack may not override anything, templates included (brief Decision 20)`));
      for (const slot of Object.keys(SLOT_OWNER)) {
        if (Object.prototype.hasOwnProperty.call(decl ?? {}, slot)) out.push(f('ERROR', 'packs', `${key}.${stage}.${slot}: a source pack may not claim slot "${slot}" (owned by kind "${SLOT_OWNER[slot]}") — add to it via additions instead`));
      }
    }
  }
  // `workspace.naming` decides whether an unattended run stops before it has written anything.
  // It was entirely unschema'd and unenforced until 2026-08-28 — `pack.schema.json` typed
  // `workspace` as a bare object, nothing mentioned `required_at`, and its only readers were two
  // prose sentences. A pack could declare `required_at: "banana"` and every gate stayed green.
  {
    const n = pack.workspace?.naming;
    if (n) {
      if (n.required_at !== undefined && !REQUIRED_AT.includes(n.required_at)) {
        out.push(f('ERROR', 'packs', `${key}.workspace.naming.required_at "${n.required_at}" is not one of ${REQUIRED_AT.join(' | ')} — this value decides whether an unattended run stops before writing anything`));
      }
      if (n.required_at !== undefined && !n.required_at_why) {
        out.push(f('WARN', 'packs', `${key}.workspace.naming.required_at has no "required_at_why" — a stop that costs an operator four stages must say what makes the name permanent that early`));
      }
      for (const list of ['tenant_facing', 'local']) {
        if (n[list] !== undefined && !Array.isArray(n[list])) {
          out.push(f('ERROR', 'packs', `${key}.workspace.naming.${list} must be an array of field names`));
        }
      }
      // A tenant-facing name with nowhere to be recorded is the defect that let one run repurpose
      // `brand_name` for a Cloud Portal app name — and left the field `required_at` is NAMED after
      // unrecordable in the manifest the rule checks.
      if (Array.isArray(n.tenant_facing) && n.tenant_facing.length && MANIFEST_WORKSPACE_SLOTS.size) {
        const homeless = n.tenant_facing.filter((x) => !MANIFEST_WORKSPACE_SLOTS.has(x));
        if (homeless.length) {
          out.push(f('ERROR', 'packs', `${key}.workspace.naming.tenant_facing names ${homeless.join(', ')} with no slot in run-manifest.template.json workspace{} — a name the pack calls permanent must have somewhere to be recorded`));
        }
      }
    }
  }
  // `repo_topology` in OBJECT form is an operator choice, and a choice that changes nothing is
  // decorative — the exact state BACKLOG item 22 recorded for a whole year: the key was in the
  // schema, both packs declared it, and no stage could ever reach a second value. So every listed
  // value must carry a `variants` patch, and every patch must name a key a brief actually carries.
  {
    const rt = pack.repo_topology;
    if (rt && typeof rt === 'object') {
      const values = Array.isArray(rt.values) ? rt.values : [];
      if (!values.includes(rt.default)) {
        out.push(f('ERROR', 'packs', `${key}.repo_topology.default "${rt.default}" is not in values [${values.join(', ')}] — the fallback must be a choice the operator could also have made`));
      }
      const variants = rt.variants ?? {};
      for (const v of values) {
        if (!variants[v]) {
          out.push(f('ERROR', 'packs', `${key}.repo_topology declares value "${v}" with no variants["${v}"] — a selectable value that patches nothing cannot change where anything lands (rule 88)`));
        }
      }
      for (const [v, patch] of Object.entries(variants)) {
        if (!values.includes(v)) {
          out.push(f('ERROR', 'packs', `${key}.repo_topology.variants["${v}"] is not in values [${values.join(', ')}] — an unreachable patch`));
          continue;
        }
        for (const k of Object.keys(patch ?? {})) {
          if (isDocKey(k)) continue;
          if (!PACK_LEVEL_KEYS.includes(k)) {
            out.push(f('ERROR', 'packs', `${key}.repo_topology.variants["${v}"] patches "${k}", which no brief carries — the patch would resolve into nothing`));
          }
        }
      }
      if (rt.operator_selectable && values.length < 2) {
        out.push(f('ERROR', 'packs', `${key}.repo_topology is operator_selectable with fewer than two values — there is nothing to ask`));
      }
      if (rt.resolved_at !== undefined && !REQUIRED_AT.includes(rt.resolved_at)) {
        out.push(f('ERROR', 'packs', `${key}.repo_topology.resolved_at "${rt.resolved_at}" is not one of ${REQUIRED_AT.join(' | ')}`));
      }
    }
  }
  // A top-level key that is neither structural, nor documentation, nor carried by the brief is
  // DECLARED WITH NO CHANNEL: the only way to read it is opening pack.json, which § 6 forbids.
  // `gate_presentation` sat like that with a records_as and a manifest slot pointing at nothing.
  // The allowlist is hand-maintained; this is what stops the next addition from going inert.
  for (const k of Object.keys(pack)) {
    if (STRUCTURAL_PACK_KEYS.has(k) || isDocKey(k) || PACK_LEVEL_KEYS.includes(k)) continue;
    out.push(f('ERROR', 'packs', `${key}.${k} is declared at pack level but no brief carries it — add it to PACK_LEVEL_KEYS in resolve-packs.mjs, or a stage can only reach it by opening pack.json (platform-pack.md § 6 forbids that second resolution path)`));
  }
  // `pack_level_scope` narrows which stages carry a pack-level key. Three ways to get it wrong,
  // all silent: scoping a key the pack does not declare, naming a stage that does not exist, and
  // listing EVERY stage — which reads as a deliberate narrowing while changing nothing (rule 88).
  // A pack-OWNED stage lives in `owns.stages[]`, not in `stages{}` — the latter is the pack's
  // contribution to a CORE stage. Omitting `owns` rejected `publish` and `provision-sitecoreai`,
  // two of the very readers this scope exists to keep.
  const knownStages = new Set([
    ...CORE_STAGES,
    ...Object.keys(pack.stages ?? {}),
    ...(pack.owns?.stages ?? []).map((s) => s.command).filter(Boolean),
  ]);
  for (const [k, stages] of Object.entries(pack.pack_level_scope ?? {})) {
    if (!Array.isArray(stages) || stages.length === 0) {
      out.push(f('ERROR', 'packs', `${key}.pack_level_scope.${k} must be a non-empty array of stage names — an empty scope would silently hide the key from every stage`));
      continue;
    }
    if (!PACK_LEVEL_KEYS.includes(k)) {
      out.push(f('ERROR', 'packs', `${key}.pack_level_scope.${k} scopes a key that is not a pack-level key — it narrows nothing`));
    } else if (pack[k] === undefined) {
      out.push(f('ERROR', 'packs', `${key}.pack_level_scope.${k} scopes "${k}", which this pack does not declare — a scope with no subject`));
    }
    for (const s of stages) {
      if (!knownStages.has(s)) out.push(f('ERROR', 'packs', `${key}.pack_level_scope.${k} names stage "${s}", which is neither a core stage nor one this pack owns`));
    }
    if (stages.length >= knownStages.size) {
      out.push(f('WARN', 'packs', `${key}.pack_level_scope.${k} lists every known stage — it reads as a deliberate narrowing and narrows nothing. Drop it, or drop the stages that do not read it`));
    }
  }

  for (const [stage, decl] of Object.entries(pack.stages ?? {})) {
    // A null slot must say WHY, or it is indistinguishable from a pack that forgot
    // to declare it.
    for (const slot of NULLABLE_SLOTS) {
      if (!Object.prototype.hasOwnProperty.call(decl, slot)) continue;
      if (decl[slot] !== null) continue;
      if (decl[`${slot}_reason`] === undefined) {
        out.push(f('WARN', 'packs', `${key}.${stage}.${slot} is null with no "${slot}_reason" — "this platform has none" must be distinguishable from an omission`));
      }
    }
    for (const anchor of Object.keys(decl.hooks ?? {})) {
      if (SLOT_OWNER[anchor] !== undefined) {
        out.push(f('ERROR', 'packs', `${key}.${stage}.hooks: "${anchor}" is a SLOT, not an anchor — declare it directly on the stage`));
      } else if (!ANCHORS.includes(anchor)) {
        out.push(f('ERROR', 'packs', `${key}.${stage}.hooks: "${anchor}" is not a known anchor (${ANCHORS.join(' · ')})`));
      }
    }
    // The mirror of the rule above: an ANCHOR declared as a bare stage key would fall
    // through to `declarations` and never reach the brief's hook section — the command
    // reads `hooks.<anchor>` and would find nothing, silently.
    for (const anchor of ANCHORS) {
      if (Object.prototype.hasOwnProperty.call(decl, anchor)) {
        out.push(f('ERROR', 'packs', `${key}.${stage}.${anchor} is an ANCHOR declared as a bare key — nest it under "hooks" or the stage will never read it`));
      }
    }
    // Same class again: `dials` is TOP-LEVEL and resolved once per run. Inside a stage
    // it falls through to `declarations` and is never read as a dial — and because the
    // scope dial is asked ONCE at intake, a per-stage dial could not be honoured even
    // if it were read.
    // A scaffold command must be RUNNABLE AS WRITTEN (rule 50: run it literally).
    //
    // `npx shadcn@latest add quickstart-with-client-side-xmc.json` looks canonical and is
    // not: the registry URL is part of the command, and without it the call either fails
    // to resolve or resolves against a different registry. Core carried that truncated
    // form from before the extraction, the extraction reproduced it faithfully, and the
    // coverage gate passed because the FILENAME token was still present. Nothing looked
    // at whether the command would actually run.
    {
      const cmds = [decl.scaffold?.command, ...Object.values(decl.scaffold?.commands ?? {})].filter((c) => typeof c === 'string');
      for (const cmd of cmds) {
        if (/\b(add|install)\s+[^\s]+\.json(\s|$)/.test(cmd) && !/https?:\/\//.test(cmd)) {
          out.push(f('ERROR', 'packs', `${key}.${stage}.scaffold: "${cmd}" adds a bare registry filename with no URL — not runnable as written, and rule 50 requires running it literally`));
        }
      }
    }
    // A scaffold selected by a variable: a value with no command, or a command no value
    // reaches, silently scaffolds the wrong template; an undeclared {placeholder} cannot resolve.
    {
      const sc = decl.scaffold;
      if (sc?.command_by !== undefined) {
        const name = /^variables\.([a-z_]+)$/.exec(sc.command_by)?.[1];
        const v = name ? pack.variables?.[name] : undefined;
        if (!v) {
          out.push(f('ERROR', 'packs', `${key}.${stage}.scaffold.command_by "${sc.command_by}" names no variable this pack declares`));
        } else if (Array.isArray(v.values)) {
          const keys = Object.keys(sc.commands ?? {});
          for (const val of v.values) if (!keys.includes(val)) out.push(f('ERROR', 'packs', `${key}.${stage}.scaffold: ${sc.command_by} value "${val}" has no commands["${val}"] — that answer scaffolds nothing`));
          for (const k of keys) if (!v.values.includes(k)) out.push(f('ERROR', 'packs', `${key}.${stage}.scaffold.commands["${k}"] is not a value of ${sc.command_by} — unreachable`));
        }
        if (sc.command !== undefined) out.push(f('ERROR', 'packs', `${key}.${stage}.scaffold declares both command and command_by — two answers to which command runs`));
      }
      for (const cmd of Object.values(sc?.commands ?? {})) {
        for (const [, ph] of String(cmd).matchAll(/\{([a-z_]+)\}/g)) {
          if (!pack.variables?.[ph]) out.push(f('ERROR', 'packs', `${key}.${stage}.scaffold: placeholder {${ph}} names no declared variable — the command can never be run literally`));
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(decl, 'dials')) {
      out.push(f('ERROR', 'packs', `${key}.${stage}.dials — dials are top-level and resolved once per run; a stage-level dial is never read`));
    }
    // A `body:` or `file:` path that does not exist is the case: the composition
    // resolves clean, the brief names a file, and the stage opens nothing. Declared-
    // but-unwritten is a legitimate WIP state — it just must not read as complete.
    for (const [anchor, steps] of Object.entries(decl.hooks ?? {})) {
      for (const step of Array.isArray(steps) ? steps : [steps]) {
        if (!step?.body) continue;
        if (!fs.existsSync(path.join(packsRootOf(key), step.body))) {
          out.push(f('ERROR', 'packs', `${key}.${stage}.hooks.${anchor}: body "${step.body}" does not exist — a hook naming a missing file injects nothing and reports clean`));
        }
      }
    }
    for (const [target, file] of Object.entries(decl.overrides ?? {})) {
      // The RANGE rule. A `templates.*` target is a file swap and is always legal for the
      // kinds that may do it; anything else is a stage-body override and must fall inside
      // this kind's range.
      const isTemplate = target.startsWith('templates.');
      if (pack.kind === 'audience' && !isTemplate) {
        out.push(f('ERROR', 'packs', `${key}.${stage}.overrides.${target}: an audience pack may override TEMPLATES ONLY — a stage override here would collide with method's range and foreclose composing with it`));
      } else if (!isTemplate && !OVERRIDE_RANGE[pack.kind].includes(stage)) {
        out.push(f('ERROR', 'packs', `${key} (${pack.kind}) may not override stage "${stage}" — outside its range (${OVERRIDE_RANGE[pack.kind].join(' · ') || 'none'})`));
      }
      if (typeof file !== 'string') continue;
      if (!fs.existsSync(path.join(packsRootOf(key), file))) {
        out.push(f('WARN', 'packs', `${key}.${stage}.overrides.${target}: "${file}" does not exist — declared but unwritten (fine as WIP; it must never read as complete)`));
      }
    }
    for (const entry of decl.skills ?? []) {
      const policy = entry.load;
      if (!['always', 'mandatory_when', 'when_relevant'].includes(policy)) {
        out.push(f('ERROR', 'packs', `${key}.${stage}.skills["${entry.skill}"]: load "${policy}" is not always|mandatory_when|when_relevant`));
      }
      // A conditional load with no stated condition is a load policy nobody can apply.
      if ((policy === 'mandatory_when' || policy === 'when_relevant') && !entry.when && !entry.topic) {
        out.push(f('WARN', 'packs', `${key}.${stage}.skills["${entry.skill}"]: ${policy} with neither "when" nor "topic" — the predicate is unstated`));
      }
    }
  }
  for (const dial of Object.keys(pack.dials ?? {})) {
    if (dial === 'why') continue;
    const owner = DIAL_OWNER[dial];
    if (!owner) out.push(f('WARN', 'packs', `${key}: declares unknown scope dial "${dial}"`));
    else if (owner !== pack.kind) out.push(f('ERROR', 'packs', `${key}: sets dial "${dial}" but that dial is owned by kind "${owner}"`));
  }
  return out;
}

// ── compose ──────────────────────────────────────────────────────────────────────

/**
 * Compose one selection into the resolved view a stage would read.
 * `selection` is { platform, method, audience }; omit or pass the null name to skip.
 */
/**
 * Deep-merge a topology variant over a pack-level declaration. Objects merge key-by-key; anything
 * else REPLACES. Replacement is the point for arrays and scalars — a monorepo's `layout` is not the
 * repo-per-deployable layout plus something, it is a different path, and concatenating the two
 * would produce a value neither topology asked for.
 */
function mergePatch(base, patch) {
  if (patch === null) return null;
  if (Array.isArray(patch) || typeof patch !== 'object') return patch;
  const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) out[k] = mergePatch(out[k], v);
  return out;
}

export function composePacks(selection, { packs } = loadPacks(), { stage = null, topology = null } = {}) {
  const findings = [];
  const active = [];

  for (const kind of KINDS) {
    const id = selection[kind];
    if (!id || id === NULLS[kind]) continue;
    const key = `${kind}:${id}`;
    if (!packs.has(key)) { findings.push(f('ERROR', 'packs', `composition names "${key}" but no such pack exists`)); continue; }
    active.push(packs.get(key));
  }

  // incompatible_with is symmetric in effect: either side declaring it refuses the pair.
  for (const a of active) {
    for (const b of active) {
      if (a === b) continue;
      if ((a.pack.incompatible_with ?? []).includes(b.key)) {
        findings.push(f('ERROR', 'packs', `composition ${a.key} + ${b.key} is declared incompatible: ${a.pack.incompatible_reason ?? 'no reason given'}`));
      }
    }
  }

  // A source pack runs only in the combinations it names: every `requires` active, and every other
  // active pack inside its closed `composes_with`. Anything else is refused, never resolved silently.
  for (const s of active.filter((p) => p.kind === 'source')) {
    for (const r of s.pack.requires ?? []) {
      if (!active.some((p) => p.key === r)) findings.push(f('ERROR', 'packs', `composition with ${s.key} lacks required pack ${r} — refused`));
    }
    for (const p of active) {
      if (p !== s && !(s.pack.composes_with ?? []).includes(p.key)) findings.push(f('ERROR', 'packs', `composition ${s.key} + ${p.key} is not in ${s.key}.composes_with — an unknown combination is refused`));
    }
  }

  const composition = { active: active.map((p) => p.key), dials: {}, stages: {} };

  // Dials — one owner per dial, enforced across active packs.
  const dialBy = {};
  for (const p of active) {
    for (const [dial, value] of Object.entries(p.pack.dials ?? {})) {
      if (dial === 'why') continue;
      if (dialBy[dial]) findings.push(f('ERROR', 'packs', `dial "${dial}" is set by both ${dialBy[dial]} and ${p.key} — one owner per dial`));
      else { dialBy[dial] = p.key; composition.dials[dial] = value; }
    }
  }

  const stages = stage ? [stage] : [...new Set(active.flatMap((p) => Object.keys(p.pack.stages ?? {})))];
  for (const st of stages) {
    const slotBy = {};
    const merged = { slots: {}, skills: [], additions: {}, hooks: {}, constraints: [], overrides: {}, declarations: {}, notes: {} };

    for (const p of active) {
      const decl = p.pack.stages?.[st];
      if (!decl) continue;

      // Slots — one owner per slot.
      for (const slot of Object.keys(SLOT_OWNER)) {
        if (!Object.prototype.hasOwnProperty.call(decl, slot)) continue;
        if (decl[slot] === null) continue; // an explicit "none" claims nothing
        if (slotBy[slot]) {
          findings.push(f('ERROR', 'packs', `${st}: slot "${slot}" is claimed by both ${slotBy[slot]} and ${p.key} — one owner per slot`));
          continue;
        }
        if (SLOT_OWNER[slot] !== p.kind) {
          findings.push(f('ERROR', 'packs', `${st}: ${p.key} claims slot "${slot}", which is owned by kind "${SLOT_OWNER[slot]}"`));
          continue;
        }
        slotBy[slot] = p.key;
        merged.slots[slot] = decl[slot];
      }

      // Everything else concatenates, in pack order.
      merged.skills.push(...(decl.skills ?? []).map((s) => ({ ...s, from: p.key })));
      merged.constraints.push(...(decl.constraints ?? []).map((c) => ({ ...c, from: p.key })));
      for (const [anchor, steps] of Object.entries(decl.hooks ?? {})) {
        (merged.hooks[anchor] ??= []).push(...(Array.isArray(steps) ? steps : [steps]));
      }
      for (const [list, items] of Object.entries(decl.additions ?? {})) {
        (merged.additions[list] ??= []).push(...(Array.isArray(items) ? items : [items]));
      }
      // A stage BODY override still has the one-owner rule, and the range table on top.
      for (const [target, file] of Object.entries(decl.overrides ?? {})) {
        if (merged.overrides[target]) findings.push(f('ERROR', 'packs', `${st}: override "${target}" claimed twice`));
        else merged.overrides[target] = { file, from: p.key };
      }

      // Everything ELSE carries through verbatim. A composed view that silently drops
      // whatever the resolver does not recognise is the exact failure the goldens exist
      // to catch: the pack declares `visual_harness`, the brief omits it, and nothing
      // says so. Unknown keys are DATA, not noise — carry them, and conflict-check them
      // like any other single-valued declaration.
      for (const [key, value] of Object.entries(decl)) {
        if (HANDLED_STAGE_KEYS.has(key) || SLOT_OWNER[key] !== undefined) continue;
        if (DOC_KEY.test(key)) { merged.notes[`${p.key}.${key}`] = value; continue; }
        if (CONCAT_DECLARATIONS.has(key) && Array.isArray(value)) {
          const tagged = value.map((e) => (e && typeof e === 'object' ? { ...e, declared_by: p.key } : e));
          const prev = merged.declarations[key];
          merged.declarations[key] = prev
            ? { value: [...prev.value, ...tagged], from: `${prev.from} + ${p.key}` }
            : { value: tagged, from: p.key };
          continue;
        }
        if (merged.declarations[key]) {
          findings.push(f('ERROR', 'packs', `${st}: declaration "${key}" is claimed by both ${merged.declarations[key].from} and ${p.key} — one owner per declaration`));
          continue;
        }
        merged.declarations[key] = { value, from: p.key };
      }
    }
    composition.stages[st] = merged;
  }

  // Pack-level declarations, collected once for the whole composition. One owner each, same
  // rule as slots — two platforms both declaring a workspace would be a genuine conflict, and
  // it is reported rather than last-write-wins.
  composition.packLevel = {};
  // Provenance, keyed the same way. Skills and declarations carry `from`; pack-level keys did not,
  // so the brief printed `## gate_presentation _(pack-level)_` with no owner. A run attributed it
  // to the platform, its spawned PM repeated the error, and recovering the truth took three extra
  // resolver invocations — a tool the PM is contractually not given. Added 2026-08-27.
  composition.packLevelFrom = {};
  // Which STAGES each pack-level key reaches. Absent = all of them (the 2026-08-24 default, kept
  // deliberately: default-out silently drops law). Union across packs, like `rules[]` and unlike
  // slots — if two packs both scope a key, a stage either pack admits gets it.
  composition.packLevelScope = {};
  for (const p of active) {
    for (const key of PACK_LEVEL_KEYS) {
      const value = p.pack[key];
      if (value === undefined) continue;
      if (composition.packLevel[key] !== undefined) {
        findings.push(f('ERROR', 'packs', `pack-level "${key}" is declared by more than one active pack — one owner per declaration`));
        continue;
      }
      composition.packLevel[key] = value;
      composition.packLevelFrom[key] = p.key;
    }
    for (const [key, stages] of Object.entries(p.pack.pack_level_scope ?? {})) {
      if (!Array.isArray(stages)) continue;
      composition.packLevelScope[key] = [...new Set([...(composition.packLevelScope[key] ?? []), ...stages])];
    }
    // The scaffold slot lives on `implement` but intake reads it (§ 10a-4b). Lifted here so a
    // non-implement brief can surface it without the reader parsing pack.json by hand.
    const sc = p.pack.stages?.implement?.scaffold;
    if (sc !== undefined && composition.scaffoldSlot === undefined) composition.scaffoldSlot = sc;

    // A declaration whose PRODUCER and CONSUMER are different stages must reach BOTH briefs, or the
    // consumer's condition can never be true. `scaffold` above is the hardcoded first instance;
    // `also_surface_on` generalises it — and it must live out here, beside that one, because a
    // stage filter (`--stage X`) makes `stages` a single-element list, so the consumer's
    // composition never walks the producer's stage at all.
    //
    // Found 2026-09-02 by rendering the CONSUMER's own brief and getting zero hits:
    // `/task-breakdown` gated on "when the brief declares `sdk_call_inventory`" while only the
    // `/architect` brief carried it. That is the decorative-declaration defect committed inside
    // the fix for it — and the contract test did not see it, because asserting that the consumer
    // FILE mentions the key passes whether or not the condition can ever hold.
    for (const [home, decl] of Object.entries(p.pack.stages ?? {})) {
      for (const [key, value] of Object.entries(decl ?? {})) {
        const on = value?.also_surface_on;
        if (!Array.isArray(on) || on.length === 0) continue;
        for (const target of on) {
          ((composition.surfaced ??= {})[target] ??= {})[key] = { value, from: p.key, home };
        }
      }
    }
  }

  // RESOLVE repo_topology to exactly ONE answer, and enact what that answer changes.
  //
  // The brief must never hand a stage two topologies and a rule for choosing between them — that is
  // the second resolution path `platform-pack.md` § 6 forbids, and it is how `/create-prd` and
  // `/provision-sitecoreai` came to hardcode repo-per-deployable while the pack said the choice
  // existed. So the selected variant is merged HERE, and `packLevel.repo_topology` is downgraded
  // from the declaration to the resolved string. Everything downstream reads `workspace` /
  // `repo_setup` exactly as before and is topology-correct without knowing the mechanism exists.
  {
    const decl = composition.packLevel.repo_topology;
    if (decl !== undefined) {
      const obj = (decl && typeof decl === 'object') ? decl : null;
      const values = obj ? obj.values : [decl];
      const fallback = obj ? obj.default : decl;
      let selected = fallback;
      if (topology !== null && topology !== undefined) {
        if (!values.includes(topology)) {
          // Never fall back silently: an unrecognised topology means the run recorded a value this
          // pack cannot honour, and resolving it to the default would emit a brief describing a
          // layout the operator did not pick — while every gate downstream stayed green.
          findings.push(f('ERROR', 'packs', `repo_topology "${topology}" is not offered by ${composition.packLevelFrom.repo_topology ?? 'the active pack'} — it offers ${values.map((v) => `"${v}"`).join(' | ')}`));
        } else {
          selected = topology;
        }
      }
      composition.packLevel.repo_topology = selected;
      composition.topology = {
        selected,
        default: fallback,
        values,
        operator_selectable: Boolean(obj?.operator_selectable),
        chosen_by: (topology && values.includes(topology)) ? 'run' : 'default',
        resolved_at: obj?.resolved_at ?? null,
        records: obj?.records ?? null,
        from: composition.packLevelFrom.repo_topology ?? null,
      };
      for (const [k, patch] of Object.entries(obj?.variants?.[selected] ?? {})) {
        if (isDocKey(k)) continue;
        composition.packLevel[k] = mergePatch(composition.packLevel[k], patch);
      }
    } else if (topology !== null && topology !== undefined) {
      findings.push(f('ERROR', 'packs', `--topology "${topology}" was passed but no active pack declares repo_topology — nothing would apply it`));
    }
  }

  // APPLY variable_defaults. A pack may re-default a variable ANOTHER pack owns, without owning
  // it: `variables` stays one-owner (the platform declares the values and the readers), while the
  // composition decides which value is the sensible default. First instance, 2026-09-30:
  // content-sdk owns `delivery_visibility` (public | private, default public) and method:clone
  // re-defaults it to private — a clone of someone else's site must never be publicly reachable
  // or indexable. The alternative was every stage testing "is this a clone?", which is a second
  // resolution path (platform-pack.md § 6). Rules: the value must be one the owner declares; two
  // packs re-defaulting one variable differently is an ERROR; a variable no LOADED pack declares
  // is an ERROR (a typo would otherwise be a silent no-op); one declared only by an INACTIVE pack
  // is skipped — clone composes with platform:none, which has no delivery surface to gate.
  {
    const setBy = {};
    for (const p of active) {
      for (const [name, spec] of Object.entries(p.pack.variable_defaults ?? {})) {
        if (/(_why|_note|_reason)$|^(why|note)$/.test(name)) continue;
        const value = spec && typeof spec === 'object' ? spec.value : spec;
        const owned = composition.packLevel.variables?.[name];
        if (!owned) {
          const declaredSomewhere = [...packs.values()].some((pk) => pk.pack.variables?.[name]);
          if (!declaredSomewhere) {
            findings.push(f('ERROR', 'packs', `${p.key}: variable_defaults names "${name}", which no pack declares under "variables" — a typo here is a silent no-op`));
          }
          continue;
        }
        if (Array.isArray(owned.values) && !owned.values.includes(value)) {
          findings.push(f('ERROR', 'packs', `${p.key}: variable_defaults sets ${name}=${JSON.stringify(value)}, not one of ${JSON.stringify(owned.values)}`));
          continue;
        }
        if (setBy[name] && setBy[name].value !== value) {
          findings.push(f('ERROR', 'packs', `variable "${name}" is re-defaulted by both ${setBy[name].from} (${JSON.stringify(setBy[name].value)}) and ${p.key} (${JSON.stringify(value)})`));
          continue;
        }
        setBy[name] = { value, from: p.key };
        // Copy, never mutate: packLevel.variables IS the owner's loaded object, shared by every
        // other composition built from the same load.
        composition.packLevel.variables = {
          ...composition.packLevel.variables,
          [name]: {
            ...owned, default: value, default_set_by: p.key, owner_default: owned.default,
            ...(spec && typeof spec === 'object' && spec.why ? { default_why: spec.why } : {}),
          },
        };
      }
    }
  }

  // ENACT derives_instead_of_asking. An audience pack that derives a value must remove the
  // platform question that asks for it — otherwise the brief hands the agent a question and a
  // contradicting instruction, and each run resolves it differently (measured: 3 of 3 content-sdk
  // hook questions collided with a marketer derive, and two runs answered differently).
  //
  // Matching is by the VERBATIM question text the derive names, which is why the contract requires
  // it. A `suppresses` that matches nothing is an ERROR, not a silent no-op: it means the question
  // was reworded and the suppression quietly stopped applying — the failure this whole mechanism
  // exists to prevent.
  for (const st of Object.keys(composition.stages)) {
    const stage = composition.stages[st];
    const derives = [];
    for (const p of active) {
      for (const d of p.pack.stages?.[st]?.derives_instead_of_asking ?? []) {
        if (d && typeof d === 'object' && d.suppresses) derives.push({ ...d, from_pack: p.key });
      }
    }
    if (!derives.length) continue;
    const pool = stage.hooks?.['discovery.questions'];
    if (!Array.isArray(pool)) continue;
    const suppressed = [];
    for (const d of derives) {
      const i = pool.findIndex((q) => (q?.q ?? '') === d.suppresses);
      if (i === -1) {
        // Two different reasons the question is absent, and only one is a defect:
        //   (a) the pack that ASKS it is not in this composition — nothing to suppress, fine.
        //       An audience pack composes with several platforms and names each one's questions.
        //   (b) NO pack anywhere asks it verbatim — the question was reworded, and the suppression
        //       silently stopped applying. That is the failure this mechanism exists to prevent.
        // Distinguish by looking at every LOADED pack, not just the active ones.
        // Only the OWNING pack can answer "was this reworded?". If it is not in this tree at
        // all — a subset export ships one platform, not both — the question is absent for a
        // reason that is not a defect, and erroring there is the check assuming every pack is
        // present. If the owner IS here and does not ask it verbatim, the wording drifted and
        // the suppression silently stopped applying: that is the real failure.
        const owner = d.suppresses_from ? packs.get(d.suppresses_from) : null;
        const scope = owner ? [owner] : [...packs.values()];
        const ownerPresent = d.suppresses_from ? !!owner : true;
        const askedSomewhere = scope.some((pk) =>
          Object.values(pk.pack.stages ?? {}).some((s) =>
            (s?.hooks?.['discovery.questions'] ?? []).some((q) => (q?.q ?? '') === d.suppresses)));
        if (ownerPresent && !askedSomewhere) {
          findings.push(f('ERROR', 'packs', `${st}: ${d.from_pack} declares suppresses "${d.suppresses}" and NO pack asks that question verbatim — the question was reworded and the suppression silently stopped applying`));
        }
        continue;
      }
      suppressed.push({ ...pool[i], suppressed_by: d.from_pack, derived_as: d.derive, derived_value: d.derived_value });
      pool.splice(i, 1);
    }
    if (suppressed.length) stage.suppressed_questions = suppressed;
  }

  return { composition, findings };
}

/**
 * Render a composed stage as a markdown BRIEF — the surface a command reads.
 *
 * This is how a stage "reads a pack": the command says *run this and apply the output*,
 * instead of restating the platform's list inline where it drifts. Generated on every
 * invocation, so it cannot go stale the way two hand-maintained lists do (the exact
 * drift 08-developer.md concedes: "commands name these too — prefer the invoking
 * command's list").
 */
// Pack-level declarations a STAGE legitimately needs. These live at the top of a pack, not
// inside stages{}, because they are one answer per pack rather than per stage — but commands
// cite them AS BRIEF CONTENT. `/create-prd` alone reads `repo_setup.topology`,
// `repo_setup.deployable_baseline`, `scaffold.command` and `workspace.naming`; before this
// they were structurally absent from every brief, so the citations resolved to nothing and the
// only way to obtain them was to read pack.json by hand — which platform-pack.md § 6 forbids.
//
// On marketplace the damage was nil (deployable_baseline is null anyway). On content-sdk the
// step that reads it is the one whose own text says skipping it deadlocks the first deploy
// with no workaround. Found 2026-08-24 by a throwaway run, not by any gate.
/**
 * Pack-level keys the brief CARRIES. A key not listed here reaches no stage, so the only way to
 * read it is opening `pack.json` — which `platform-pack.md` § 6 forbids as the second resolution
 * path. `gate_presentation` was in exactly that state until 2026-08-27: declared, with a
 * `records_as` and a matching manifest slot, and no channel between them. The marketer run had to
 * read it out of band and say so.
 *
 * Adding a key here is half the fix. The other half is `checkPackShape`, which now ERRORs on any
 * non-structural top-level key that is absent from this list — the allowlist is hand-maintained,
 * and a hand-maintained allowlist with nothing asserting completeness is rule `88`'s exact shape.
 */
export const PACK_LEVEL_KEYS = [
  'workspace', 'repo_setup', 'variables', 'repo_topology', 'gate_presentation',
  // The platform's contribution to the marketer gate's machine half. Split out 2026-08-27: the
  // website checks (route crawl, robots gate, live link-crawl) were in the AUDIENCE pack's flat
  // list, so they shipped to Marketplace and to `platform:none`, where they cannot be performed —
  // while being declared blocking. They now belong to the platform that can run them.
  'gate_presentation_checks',
  // The audience's read-back of what it decided WITHOUT asking. It must reach the intake stage
  // through the brief, because the stage that renders it into "Decided for you" is exactly the
  // stage forbidden from opening pack.json (platform-pack.md § 6). Added 2026-08-27; the gate above
  // caught it as decorative on the first run, which is the gate doing its job.
  'derived_disclosure',
];

/** Top-level keys the RESOLVER consumes directly, or that are pack metadata. Never brief payload. */
const STRUCTURAL_PACK_KEYS = new Set([
  '$schema', 'id', 'kind', 'contract', 'version', 'title', 'status', 'scope', 'who',
  'composes_with', 'incompatible_with', 'activates_when', 'detect', 'dials', 'stages',
  'owns', 'rules', 'manifest_fields', 'gate_policy', 'variable_defaults',
  // `extends` is same-kind inheritance, resolved by loadPacks before any brief is rendered — so it
  // is structural, not payload. Omitting it here made the new gate fail resolve-packs' own
  // inheritance fixture, which is the gate working: it found a key it did not know about and said
  // so, rather than guessing.
  'extends',
  // Written by export-flow.mjs when it prunes an `incompatible_with` entry whose pack is not in
  // the export. Bookkeeping about the export, not payload for a stage — and it exists ONLY inside
  // a generated tree, so the gate first fired on it during an export self-test rather than here.
  // That is the self-test earning its cost: the source repo could never have surfaced this.
  'incompatible_with_pruned',
  // Which stages each pack-level key reaches. Structural, not payload: it governs the rendering of
  // other keys and is itself never rendered. Absent = every stage (V-F03, 2026-09-04).
  'pack_level_scope',
  // A source pack's hard dependencies (every listed pack must be active). Resolver-consumed.
  'requires',
]);

/** Documentation keys — prose for a human reading the pack, carried by nothing and required by nothing. */
const isDocKey = (k) => /^(why|note|vocabulary)$/.test(k) || /(_note|_reason|_why|_detail)$/.test(k)
  || /^evidence(_|$)/.test(k);
export function renderStageBrief(composition, stage) {
  const m = composition.stages?.[stage];
  const L = [];
  L.push(`# Pack brief — /${stage}`);
  L.push('');
  L.push(composition.active.length ? `**Active packs:** ${composition.active.join(' + ')}` : '**Active packs:** none — the generic pipeline applies, inject nothing.');
  // Dials are not all scalars. `gates` is an object of five booleans, and interpolating it
  // directly printed `[object Object]` — the brief told the reader nothing about the very
  // dial the audience pack exists to set. Long prose values (a `_why`) are summarised rather
  // than dumped inline: the header is a summary line, and the full value renders below.
  if (Object.keys(composition.dials).length) {
    const fmt = (v) => {
      if (v && typeof v === 'object') return JSON.stringify(v);
      const s = String(v);
      return s.length > 60 ? `${s.slice(0, 57)}…` : s;
    };
    L.push(`**Dial presets:** ${Object.entries(composition.dials).map(([k, v]) => `\`${k}: ${fmt(v)}\``).join(' · ')}`);
  }
  if (!m || !composition.active.length) { L.push(''); L.push('_No pack contributions for this stage._'); return L.join('\n'); }

  const always = m.skills.filter((s) => s.load === 'always');
  const mandatory = m.skills.filter((s) => s.load === 'mandatory_when');
  const relevant = m.skills.filter((s) => s.load === 'when_relevant');
  if (m.skills.length) {
    L.push('', '## Skills');
    if (always.length) L.push('', '**Load ALWAYS:**', ...always.map((s) => `- \`${s.skill}\`${s.why ? ` — ${s.why}` : ''}`));
    if (mandatory.length) L.push('', '**MANDATORY when the condition holds (not "as relevant"):**', ...mandatory.map((s) => `- \`${s.skill}\` — **when:** ${s.when}${s.why ? `\n  ${s.why}` : ''}`));
    if (relevant.length) L.push('', '**Load when relevant to the work in hand — not the whole catalogue:**', ...relevant.map((s) => `- \`${s.skill}\`${s.topic ? ` (${s.topic})` : ''}${s.when ? ` — when: ${s.when}` : ''}`));
    if (m.skills.some((s) => s.skill.includes('{'))) L.push('', '> `{var}` interpolates from the run\'s resolved variables (e.g. `{router}` → `app`).');
  }

  // Does this stage carry a given pack-level key? Absent scope = every stage, which preserves the
  // 2026-08-24 fix (keys were structurally absent from every brief and their citations resolved to
  // nothing). Default-IN on purpose: the failure mode of default-out is silently dropping law.
  //
  // Scoping was added 2026-09-04 after the rendered-brief baseline made it visible that the
  // topology block was emitted into all 19 stages, `/research` and `/probe` included. The reader
  // list is MEASURED, never guessed: a first draft picked 6 stages by reasoning and would have
  // dropped `publish`, which really does read `repo_setup.topology` to decide the Vercel root
  // directory. `architect` / `code-review` / `test` mention it only to PASS `--topology` on the
  // resolve line — they need the flag, not the block.
  const carries = (key) => {
    const scope = composition.packLevelScope?.[key];
    return !Array.isArray(scope) || stage === null || scope.includes(stage);
  };

  // The resolved topology, stated BEFORE the declarations it already patched — a reader who sees
  // `workspace.layout` first and this second would reasonably wonder which one won. Nothing below
  // is topology-conditional: the merge already happened.
  if (composition.topology && carries('repo_topology')) {
    const t = composition.topology;
    L.push('', `## repo_topology — RESOLVED: \`${t.selected}\`  _(pack-level${t.from ? ` — declared by \`${t.from}\`` : ''})_`, '');
    if (t.values.length > 1) {
      L.push(`Offered: ${t.values.map((v) => (v === t.selected ? `**${v}**` : v)).join(' | ')} · default \`${t.default}\` · chosen by **${t.chosen_by === 'run' ? 'this run' : 'default (the run recorded none)'}**`);
      if (t.operator_selectable) {
        L.push('', `> The operator picks this${t.resolved_at ? ` at **${t.resolved_at}**` : ''}${t.records ? `, recorded as \`${t.records}\`` : ''}. **\`workspace\` and \`repo_setup\` below are ALREADY resolved for \`${t.selected}\`** — apply them verbatim; do not branch on the topology yourself.`);
      }
    } else {
      L.push(`Fixed — this platform offers one topology.`);
    }
  }
  // Pack-level declarations, rendered per contributing pack so provenance survives. A stage
  // that does not use them simply ignores them; a stage that CITES them now finds them.
  for (const key of PACK_LEVEL_KEYS) {
    if (key === 'repo_topology' && composition.topology) continue; // rendered above, with its provenance
    const contributed = composition.packLevel?.[key];
    if (contributed === undefined) continue;
    if (!carries(key)) continue;
    const owner = composition.packLevelFrom?.[key];
    L.push('', `## ${key}  _(pack-level${owner ? ` — declared by \`${owner}\`` : ''})_`, '', '```json', JSON.stringify(contributed, null, 2), '```');
  }
  // The scaffold slot is declared on `implement` but READ at intake (§ 10a-4b writes the
  // deployable baseline). Surfacing it on every stage is wrong; surfacing it nowhere left the
  // intake citation dangling. So: show it wherever a pack declares it, tagged with its home.
  if (stage !== 'implement' && composition.scaffoldSlot !== undefined) {
    L.push('', '## scaffold  _(declared on `implement`, cited here by /create-prd § 10a-4b)_', '',
      '```json', JSON.stringify(composition.scaffoldSlot, null, 2), '```');
  }

  // Declarations produced by ANOTHER stage that THIS stage consumes. Tagged with their home so the
  // reader knows who writes the thing they are being told to read, and skipped when this stage
  // declares the key itself (one section, not two).
  for (const [key, s] of Object.entries(composition.surfaced?.[stage] ?? {})) {
    if (m.declarations?.[key]) continue;
    L.push('', `## ${key}  _(declared on \`${s.home}\` by \`${s.from}\` — surfaced here because this stage consumes it)_`,
      '', '```json', JSON.stringify(s.value, null, 2), '```');
  }

  if (m.suppressed_questions?.length) {
    L.push('', '## Questions SUPPRESSED by an active derive', '');
    for (const q of m.suppressed_questions) {
      const dv = q.derived_value === undefined ? ''
        : ` → default: ${typeof q.derived_value === 'string' ? q.derived_value : JSON.stringify(q.derived_value)}`;
      L.push(`- ~~${q.q}~~ — **not asked.** ${q.suppressed_by} derives it (${q.derived_as}${dv}).`);
    }
    L.push('', '> These are removed from the pool, not merely de-prioritised. Deriving is the point: an');
    L.push('> audience pack derives what its operator cannot judge, a method pack what its source already');
    L.push('> answers. Show each derived value back');
    L.push('> at the summary checkpoint so a wrong inference is correctable rather than invisible.');
  }

  for (const [slot, value] of Object.entries(m.slots)) {
    L.push('', `## ${slot}`, '', '```json', JSON.stringify(value, null, 2), '```');
  }
  for (const [key, { value, from }] of Object.entries(m.declarations)) {
    L.push('', `## ${key}  _(${from})_`, '', typeof value === 'object' && value !== null ? ['```json', JSON.stringify(value, null, 2), '```'].join('\n') : String(value));
  }
  if (m.constraints.length) {
    L.push('', '## Constraints');
    for (const c of m.constraints) L.push(`- **${c.id}** — ${c.text}${c.why ? ` _(${c.why})_` : ''}`);
  }
  for (const [anchor, steps] of Object.entries(m.hooks)) {
    L.push('', `## Hook: \`${anchor}\``, '', '```json', JSON.stringify(steps, null, 2), '```');
  }
  for (const [list, items] of Object.entries(m.additions)) {
    L.push('', `## Additions → core's \`${list}\``, '', '```json', JSON.stringify(items, null, 2), '```');
  }
  if (Object.keys(m.overrides).length) {
    L.push('', '## Overrides');
    for (const [t, o] of Object.entries(m.overrides)) L.push(`- \`${t}\` ← ${o.file} _(${o.from})_`);
  }
  return L.join('\n');
}

/**
 * The INHERIT rungs of the M0 ladder, executed (platform-pack.md § 2, rungs 1 and 2).
 *
 * Rung 1 reads a `packs` block. Rung 2 derives one from a PRE-PACK manifest — and rung 2
 * is not a nicety: every product in an existing workspace has a pre-pack manifest, so
 * without it they would all fall through to detect, and a detect that disagrees with
 * history would silently re-classify a shipped product.
 *
 * Returns `null` when neither rung applies, so the caller falls through to detect. A miss
 * is a resolution step, not an error.
 */
export function inheritComposition(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;

  // Rung 1 — an explicit block. An existing product never re-answers this.
  const p = manifest.packs;
  if (p && typeof p === 'object' && p.platform) {
    return {
      outcome: 'inherit',
      platform: p.platform,
      method: p.method ?? NULLS.method,
      audience: p.audience ?? NULLS.audience,
      // Only when recorded: a run without a source must inherit the exact triple it always did.
      ...(p.source && p.source !== NULLS.source ? { source: p.source } : {}),
    };
  }

  // Rung 2 — derive from the fields a pre-pack run recorded.
  const target = manifest.platform_target;
  if (!target) return null;
  const platform = target === 'other' ? NULLS.platform : target;
  const method = manifest.source?.analysis_mode === 'rebuild' ? 'clone' : NULLS.method;
  return { outcome: 'inherit-legacy', platform, method, audience: NULLS.audience };
}

/**
 * The DETECT rung of the M0 ladder, executed (platform-pack.md § 2).
 *
 * Detect is the one predicate class in the contract that is mechanical, so it is the one
 * that must not be graded by hand. Returns either a resolution or an explicit refusal —
 * and **a refusal is a correct outcome**, not a failure: two strong signals from
 * different packs means ASK, never pick the first match.
 *
 * `corroborating` signals alone NEVER resolve. `sitecore.config.ts` in a repo with no
 * Sitecore dependency is someone's leftover file, not a platform.
 */
export function detectPlatform(dir, { packs } = loadPacks()) {
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const pkg = readJson(path.join(dir, 'package.json'));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };

  const evaluate = (m) => {
    if (!m) return false;
    switch (m.kind) {
      case 'dependency_prefix': return Object.keys(deps).some((d) => d.startsWith(m.value));
      case 'path_exists': return fs.existsSync(path.join(dir, m.value));
      case 'path_exists_and_not': return fs.existsSync(path.join(dir, m.value)) && !fs.existsSync(path.join(dir, m.not));
      default: return false;
    }
  };

  const hits = [];
  for (const p of packs.values()) {
    if (p.kind !== 'platform') continue;
    const sigs = p.pack.detect?.signals ?? [];
    const strong = sigs.filter((s) => s.confidence === 'strong' && evaluate(s.match));
    const corroborating = sigs.filter((s) => s.confidence === 'corroborating' && evaluate(s.match));
    if (strong.length) hits.push({ id: p.id, strong: strong.map((s) => s.test), corroborating: corroborating.map((s) => s.test) });
    else if (corroborating.length) hits.push({ id: p.id, strong: [], corroborating: corroborating.map((s) => s.test), insufficient: true });
  }

  const resolved = hits.filter((h) => !h.insufficient);
  if (resolved.length > 1) {
    return { outcome: 'ask', reason: `${resolved.length} platforms match on a strong signal — ambiguity STOPS, it never guesses`, candidates: resolved.map((h) => h.id), signals: hits };
  }
  if (resolved.length === 1) {
    const pack = packs.get(`platform:${resolved[0].id}`);
    const variables = {};
    for (const [name, spec] of Object.entries(pack.pack.variables ?? {})) {
      const hit = (spec.detect ?? []).find((d) => evaluate(d.match));
      if (hit) variables[name] = hit.value;
      else if (spec.default != null) variables[name] = spec.default;
    }
    return { outcome: 'detect', platform: resolved[0].id, variables, signals: hits };
  }
  const corroboratingOnly = hits.filter((h) => h.insufficient);
  if (corroboratingOnly.length) {
    return { outcome: 'ask', reason: 'only corroborating signals matched, and corroborating signals alone never resolve', candidates: corroboratingOnly.map((h) => h.id), signals: hits };
  }
  return { outcome: 'none', platform: 'none', signals: [] };
}

/** Every runnable combination, for --check and for the golden harness. */
export function runnableCombinations({ packs } = loadPacks()) {
  const values = (kind) => [NULLS[kind], ...[...packs.values()].filter((p) => p.kind === kind).map((p) => p.id)];
  const out = [];
  for (const platform of values('platform')) {
    for (const method of values('method')) {
      for (const audience of values('audience')) {
        const sel = { platform, method, audience };
        const { findings } = composePacks(sel, { packs });
        const blocked = findings.some((x) => x.severity === 'ERROR' && x.message.includes('incompatible'));
        out.push({ ...sel, runnable: !blocked });
      }
    }
  }
  return out;
}

/**
 * Every combination a source pack declares itself runnable in: its `requires`, plus each optional
 * `composes_with` pack of a kind `requires` does not already fill (one at a time, and none).
 * Deliberately separate from runnableCombinations(), whose triple loop the brief goldens enumerate.
 */
export function sourceCombinations({ packs } = loadPacks()) {
  const out = [];
  for (const s of [...packs.values()].filter((p) => p.kind === 'source')) {
    const sel = { ...NULLS, source: s.id };
    for (const r of s.pack.requires ?? []) { const [k, id] = r.split(':'); sel[k] = id; }
    const required = new Set((s.pack.requires ?? []).map((r) => r.split(':')[0]));
    const optional = (s.pack.composes_with ?? []).filter((c) => !required.has(c.split(':')[0]));
    for (const extra of [null, ...optional]) {
      const combo = { ...sel };
      if (extra) { const [k, id] = extra.split(':'); combo[k] = id; }
      const { findings } = composePacks(combo, { packs });
      out.push({ ...combo, runnable: !findings.some((x) => x.severity === 'ERROR') });
    }
  }
  return out;
}

/** Re-label findings for the tranche that is calling. Tranche 1 is advisory. */
export function escalate(findings, { to = 'WARN', areas = ['packs'] } = {}) {
  return findings.map((x) => (areas.includes(x.area) && x.severity === 'ERROR' ? { ...x, severity: to, message: `${x.message} [advisory until tranche 5]` } : x));
}

// ── CLI ──────────────────────────────────────────────────────────────────────────

/**
 * Stamp `packs.briefs_resolved[]` for the stage just composed.
 *
 * Written through `manifest-write.mjs` rather than by writing the file here: that helper is the
 * only sanctioned writer (read → deep-merge → write BOTH files), and array-append is exactly the
 * semantics this needs, so two stages resolving in parallel cannot clobber each other's stamp.
 *
 * Refuses to stamp a composition that produced an ERROR finding. A stamp asserts "this stage got
 * a valid brief"; recording one over a broken composition would make the coverage gate green on
 * precisely the runs it exists to catch.
 */
function recordBrief(argv, arg, composition, findings) {
  const stage = arg('stage');
  const workflow = arg('record');
  if (!stage) { console.error('x --record needs --stage <name>: a brief is stamped per stage, and an unnamed stamp cannot be checked for coverage.'); process.exit(2); }
  if (!workflow || workflow.startsWith('--')) { console.error('x --record needs the run\'s workflow directory: --record <product>/project-planning/workflow'); process.exit(2); }
  if (findings.some((x) => x.severity === 'ERROR')) {
    console.error(`x --record refused for stage "${stage}": the composition produced ERROR findings, so there is no valid brief to stamp.`);
    process.exit(1);
  }
  const triple = {
    platform: arg('platform') ?? NULLS.platform,
    method: arg('method') ?? NULLS.method,
    audience: arg('audience') ?? NULLS.audience,
  };
  const patch = {
    packs: {
      briefs_resolved: [{
        stage,
        at: new Date().toISOString(),
        composition: `platform:${triple.platform} × method:${triple.method} × audience:${triple.audience}`
          + (arg('source') && arg('source') !== NULLS.source ? ` × source:${arg('source')}` : ''),
        active: composition?.active ?? [],
        topology: arg('topology') ?? composition?.topology?.selected ?? null,
      }],
    },
  };
  const writer = path.join(REPO_ROOT, '.agent', 'scripts', 'manifest-write.mjs');
  const res = spawnSync(process.execPath, [writer, '--workflow', workflow, '--quiet'], {
    input: JSON.stringify(patch), encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(`x --record failed to stamp stage "${stage}" (manifest-write exit ${res.status}):`);
    console.error((res.stderr || res.stdout || '').trim());
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const { packs, findings: loadFindings } = loadPacks();

  if (argv.includes('--list')) {
    for (const p of packs.values()) console.log(`${p.key.padEnd(24)} ${p.pack.title ?? ''}`);
  }

  let all = [...loadFindings];
  if (argv.includes('--check')) {
    for (const combo of runnableCombinations({ packs })) {
      const { findings } = composePacks(combo, { packs });
      all.push(...findings.filter((x) => !x.message.includes('incompatible')));
      if (!argv.includes('--json')) console.log(`  ${combo.runnable ? 'run ' : 'skip'} platform:${combo.platform} × method:${combo.method} × audience:${combo.audience}`);
    }
    for (const combo of sourceCombinations({ packs })) {
      const { findings } = composePacks(combo, { packs });
      all.push(...findings);
      if (!argv.includes('--json')) console.log(`  ${combo.runnable ? 'run ' : 'FAIL'} platform:${combo.platform} × method:${combo.method} × audience:${combo.audience} × source:${combo.source}`);
    }
  } else if (arg('platform') || arg('method') || arg('audience') || arg('source')) {
    const { composition, findings } = composePacks(
      { platform: arg('platform'), method: arg('method'), audience: arg('audience'), source: arg('source') },
      { packs }, { stage: arg('stage'), topology: arg('topology') ?? null },
    );
    all.push(...findings);
    // --dials is the M1 scope-dial plan. It is its own flag rather than a brief section because
    // the dial is resolved ONCE at intake, not per stage, and /create-prd must be able to ask for
    // it without naming a stage.
    if (argv.includes('--dials')) {
      console.log(JSON.stringify(dialPlan(composition, { packs }), null, 2));
      process.exit(findings.some((x) => x.severity === 'ERROR') ? 1 : 0);
    }
    // --record stamps `packs.briefs_resolved[]` in the run manifest. It lives HERE, as a side
    // effect of actually composing the brief, and not as a separate step an agent is told to
    // perform — a stamp an agent can write without resolving is a claim, and this run's whole
    // failure mode was four stages whose briefs were never resolved with nothing able to see it.
    // It must run before the --md branch, which exits.
    if (argv.includes('--record')) recordBrief(argv, arg, composition, findings);
    if (argv.includes('--json')) console.log(JSON.stringify(composition, null, 2));
    else if (argv.includes('--md')) { console.log(renderStageBrief(composition, arg('stage'))); process.exit(findings.some((x) => x.severity === 'ERROR') ? 1 : 0); }
  }

  const seen = new Set();
  const unique = all.filter((x) => { const k = `${x.severity}|${x.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
  // Findings and the summary go to STDERR when stdout carries a payload (--json / --md), so the
  // payload stays parseable and pipeable. Without a payload they stay on stdout, where a human
  // running --check or --list expects to read them.
  const diag = (argv.includes('--json') || argv.includes('--md')) ? console.error : console.log;
  for (const x of unique) diag(`  ${x.severity === 'ERROR' ? 'x' : '!'} [${x.severity}] ${x.area}: ${x.message}`);
  const errs = unique.filter((x) => x.severity === 'ERROR').length;
  diag(`\npacks: ${packs.size} loaded, ${errs} error(s), ${unique.length - errs} warning(s).`);
  process.exit(errs > 0 ? 1 : 0);
}
