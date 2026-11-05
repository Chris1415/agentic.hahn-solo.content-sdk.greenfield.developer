#!/usr/bin/env node
/**
 * check-template-base-chain.mjs — assert every project template's base chain actually
 * RESOLVES in the live template engine.
 *
 *   node .agent/scripts/check-template-base-chain.mjs --brand <b> --cm products/head-application/<project>/cm --org <org>
 *   node .agent/scripts/check-template-base-chain.mjs --brand <b> --cm <cm-dir> --org <org> --tenant <tenant> --json
 *
 * `--cm <path>` names the CM code base (its `authoring/items/` and `.env` are read). A
 * `products/…` path resolves through the products-root resolver, an absolute path is taken as
 * is, anything else is relative to the cwd. Default: `default_cm` in .agent/workspace.json, else
 * `--cm` is required. One shared CM was the only one this script knew until 2026-09-30, when a
 * clone with its OWN CM had to skip the check (the path was hardcoded).
 *
 * `--org` names the credentials (`SITECORE_CM_CLIENT_ID_<ORG>`). Without `--tenant` the expected
 * tenant comes from `sitecore_orgs` in .agent/workspace.json; an org in neither place is refused.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS CANNOT BE A DISK CHECK, AND WHY THAT IS THE WHOLE POINT
 *
 * `__Base template` is a multi-value field. Live Sitecore stores it PIPE-delimited
 * and its template engine is strictly `|`-delimited. A value joined with newlines
 * instead resolves to NOTHING — `baseTemplates` comes back empty — and the item
 * silently loses every inherited field.
 *
 * The symptom is nasty because almost everything still works: the item's OWN fields
 * read fine over the Authoring API, the component renders, and inline editing works
 * on the canvas. What breaks is anything built by TEMPLATE-ENGINE AGGREGATION over
 * the base chain — most visibly, the Pages Content pane renders EMPTY, and the
 * Content Editor prints raw GUIDs where template names should be.
 *
 * **Sitecore Content Serialization is LOSSY for this field.** It writes the value as
 * a YAML block scalar, one GUID per line, and re-joins on push. So a CORRECT
 * pipe-delimited live value and a BROKEN newline-delimited live value serialize to
 * BYTE-IDENTICAL YAML:
 *
 *     Hint: __Base template
 *     Value: |
 *       {1930BBEB-7805-471A-A3BE-4858AC7CF696}
 *       {44A022DB-56D3-419A-B43B-E27E4D8E9C41}
 *
 * Measured 2026-08-28: that block is what BOTH one site's `Hero Media Band` (live value
 * pipe-delimited, 18 base templates resolve) and another site's `OpeningBanner` (live
 * value newline-delimited, ZERO resolve) look like on disk.
 *
 * Two consequences, and the second one is a trap:
 *
 *   1. `audit-sitecore-schema.mjs` reads disk, so it is STRUCTURALLY INCAPABLE of
 *      seeing this defect. That is not a bug in it. Its `bases()` splits on
 *      `/[|\n]+/` and MUST stay lenient — tightening it to `|`-only would flag every
 *      correctly-serialized brand on the CM as broken. **Do not "fix" that parser.**
 *      This script is the check that belongs live.
 *
 *   2. The defect is introduced by writing the field over RAW AGQL with the wrong
 *      separator, bypassing SCS's join. `ser push` of the same on-disk state produces
 *      a CORRECT value — which means a broken tenant can look fine in git forever.
 *
 * Read-only. Needs CM credentials (it asks the live engine, which is the point).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Exit: 0 all chains resolve · 1 at least one is broken · 2 usage / auth / no CM / no templates found.
 */
import { existsSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cmFor, TenantMismatch } from './assert-tenant.mjs';
import { resolveProductsRoot, resolveLogical, readWorkspaceFile } from './resolve-products-root.mjs';
import { projectTemplates, checkTemplates, report } from '../../.claude/skills/content-sdk-component-review/scripts/check-template-base-chain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

/** `--org`, then the shell, then the machine's default. Never a built-in org: an unlabelled default is a defect. */
export const orgFrom = ({ cli, env, workspace }) => cli || env || workspace?.default_org || null;
/** One machine's default CM, from .agent/workspace.json. Absent, `--cm` is required. */
export const defaultCmFrom = (workspace) => (typeof workspace?.default_cm === 'string' && workspace.default_cm.trim()) || null;

/**
 * Resolve `--cm` to an absolute directory. `products/…` goes through the products-root resolver
 * (never `cwd + products`, which breaks the moment the mount is relocated); absolute passes
 * through; any other relative path is relative to the cwd, like every other CLI path.
 */
export function resolveCmDir(cmArg, { products, cwd = process.cwd() } = {}) {
  if (!cmArg) return null;
  const raw = String(cmArg).replace(/\\/g, '/');
  if (isAbsolute(raw)) return resolvePath(raw);
  if (raw === 'products' || raw.startsWith('products/')) return resolveLogical(raw, products);
  return resolvePath(cwd, raw);
}

const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;
if (IS_MAIN) await main();

async function main() {

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);

const BRAND = arg('brand', null);
const workspace = readWorkspaceFile(REPO);
const CM_ARG = arg('cm', defaultCmFrom(workspace));
const ORG = orgFrom({ cli: arg('org', null), env: process.env.SITECORE_CM_ORG, workspace });
const TENANT = arg('tenant', null);
const AS_JSON = flag('json');
const QUIET = flag('quiet');

const out = (s) => { if (!AS_JSON && !QUIET) console.log(s); };
const die = (code, ...lines) => { for (const l of lines) console.error(l); process.exit(code); };

if (!BRAND) {
  die(2, 'Usage: check-template-base-chain.mjs --brand <brand-slug> --cm <cm-dir> --org <org> [--tenant <tenant>] [--json] [--quiet]',
    '',
    '  Asserts every project template of <brand> resolves a non-empty base chain in the',
    '  LIVE template engine. A disk check cannot do this — see the header comment.');
}
if (!ORG) die(2, '[ERROR] No org named: pass --org <org>, set SITECORE_CM_ORG, or set default_org in .agent/workspace.json.');
if (!CM_ARG) die(2, '[ERROR] No CM named: pass --cm <dir>, or set default_cm in .agent/workspace.json.');

// ── discover the brand's template ids from the serialized module (offline, no auth) ──
// Discovery is offline on purpose: it needs no credentials and it fails loudly when the
// brand slug is wrong, rather than authenticating and then querying nothing.
const products = resolveProductsRoot({ repoRoot: REPO });
if (products.error) die(2, `[ERROR] ${products.error}`);
const CM_DIR = resolveCmDir(CM_ARG, { products });
if (!existsSync(CM_DIR)) {
  die(2, `[ERROR] No CM code base at ${CM_DIR} (from ${CM_ARG}).`);
}
const templates = projectTemplates(join(CM_DIR, 'authoring', 'items'), BRAND);
if (!templates.length) {
  die(2, `No project templates found for brand "${BRAND}" under ${join(CM_DIR, 'authoring', 'items')}.`,
    'A zero-template run must not exit 0 — an empty set would report "all chains resolve" and mean nothing.');
}

out(`Checking ${templates.length} project template(s) for "${BRAND}" against the LIVE template engine…`);

// ── live: the binding is this repo's (org-suffixed credentials + tenant assertion, --tenant or KNOWN_ORGS);
// discovery, the query and the error-vs-defect verdict are the skill's, so there is one check.
let cm;
try {
  cm = await cmFor(ORG, { envPath: join(CM_DIR, '.env'), expectTenant: TENANT ?? undefined });
} catch (e) {
  if (e instanceof TenantMismatch) die(2, `Refusing to run: ${e.message}`);
  die(2, `Could not authenticate against org "${ORG}": ${e.message}`);
}
out(`  tenant: ${cm.tenant}`);

const results = await checkTemplates(templates, { endpoint: cm.AGQL_ENDPOINT, token: cm.token });
process.exit(report(results, { brand: BRAND, tenant: cm.tenant, asJson: AS_JSON, quiet: QUIET }));
}
