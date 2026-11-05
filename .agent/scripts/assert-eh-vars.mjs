#!/usr/bin/env node
/**
 * assert-eh-vars.mjs — an editing-host environment must carry NONE of the app's
 * own Edge/site variables before it is deployed.
 *
 *   node .agent/scripts/assert-eh-vars.mjs --env <ehEnvId> --org <org> [--env-file cm/.env] [--json] [--quiet]
 *
 * WHY THIS EXISTS (minimal PRD-000, 2026-09-11).
 *
 * The Deploy platform injects the Edge context and the editing secret into the
 * rendering-host container of an editing host from the CM environment it is bound
 * to. `/provision-sitecoreai` § 5c nevertheless told the pipeline to `variable upsert`
 * SITECORE_EDGE_CONTEXT_ID / NEXT_PUBLIC_* onto that host "so a git build can read
 * them". The upsert is ACCEPTED, the build is GREEN, and then the rollout never starts
 * a container: no RenderingHost log, "Winter is coming…", failed at ~+58 min with
 * postActionStatus 0 and no application error. Five of five API-created editing hosts
 * on one CM failed exactly this way and were blamed on the platform
 * for seventeen days — the Portal-created replacements worked only because a human
 * never runs § 5c. Proven by a one-variable-delta redeploy of the same env + artifact:
 * 58 min failed → 2.3 min Complete.
 *
 * Prose said "assert the list is empty" and prose cannot gate (rule 88) — the previous
 * Validation bullet PRESCRIBED the defect. This script is the gate: exit 1 when any
 * forbidden name is present, whatever its target or case.
 *
 * Read-only. Never logs a token or a secret value.
 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readEnvFile, resolveCredentials, mint } from './assert-tenant.mjs';

const DEPLOY_API = 'https://xmclouddeploy-api.sitecorecloud.io';

/** Names the platform manages on a rendering host; a user copy collides and the pod never schedules. */
export const FORBIDDEN_ON_EDITING_HOST = Object.freeze([
  'SITECORE_EDGE_CONTEXT_ID',
  'NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID',
  'NEXT_PUBLIC_DEFAULT_SITE_NAME',
  'NEXT_PUBLIC_DEFAULT_LANGUAGE',
  'SITECORE_EDITING_SECRET',
]);

/**
 * Pure classifier. `vars` is the Deploy API / CLI `variable list` shape:
 * [{ name, target, secret, value }]. Returns the offending entries (never their values).
 * Case-insensitive on the name and target-agnostic on purpose: the collision is on the
 * container env key, which is case-sensitive at runtime but not at upsert time, and a
 * variable on the wrong target is still a variable nobody should have set.
 */
export function findForbidden(vars) {
  if (!Array.isArray(vars)) throw new TypeError('findForbidden: expected an array of { name, target }');
  const bad = new Set(FORBIDDEN_ON_EDITING_HOST.map((n) => n.toUpperCase()));
  return vars
    .filter((v) => v && typeof v.name === 'string' && bad.has(v.name.trim().toUpperCase()))
    .map((v) => ({ name: v.name, target: v.target ?? null }));
}

export async function listVariables(envId, token, fetchImpl = fetch) {
  const r = await fetchImpl(`${DEPLOY_API}/api/environments/v1/${envId}/variables`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`variable list failed for ${envId} (HTTP ${r.status})`);
  const body = await r.json();
  return Array.isArray(body) ? body : (body?.data ?? []);
}

function parseArgs(argv) {
  const a = { envFile: 'cm/.env', json: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--env') a.env = argv[++i];
    else if (k === '--org') a.org = argv[++i];
    else if (k === '--env-file') a.envFile = argv[++i];
    else if (k === '--json') a.json = true;
    else if (k === '--quiet') a.quiet = true;
    else if (k === '-h' || k === '--help') a.help = true;
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || !a.env || !a.org) {
    console.error('usage: assert-eh-vars.mjs --env <ehEnvId> --org <org> [--env-file cm/.env] [--json] [--quiet]');
    process.exit(a.help ? 0 : 2);
  }
  const bag = readEnvFile(a.envFile);
  const creds = resolveCredentials({ org: a.org, service: 'DEPLOY', env: bag });
  const token = await mint(creds);
  const vars = await listVariables(a.env, token);
  const bad = findForbidden(vars);
  const result = { environment: a.env, variables: vars.length, forbidden: bad, ok: bad.length === 0 };
  if (a.json) console.log(JSON.stringify(result, null, 2));
  else if (!a.quiet || !result.ok) {
    console.log(`editing host ${a.env}: ${vars.length} variable(s), ${bad.length} forbidden`);
    for (const b of bad) console.log(`  FORBIDDEN  ${b.name}  (target ${b.target})`);
    if (!result.ok) {
      console.log('  → delete them (`dotnet sitecore cloud environment variable delete`) before deploying; the platform injects these itself and the rollout never starts a container while they are set.');
    }
  }
  // exitCode, not process.exit(): on Windows an immediate exit while fetch's keep-alive
  // handle is still closing trips a libuv assertion (exit 127) AFTER the verdict printed.
  process.exitCode = result.ok ? 0 : 1;
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
if (isEntry) main().catch((e) => { console.error(e.message); process.exitCode = 2; });
