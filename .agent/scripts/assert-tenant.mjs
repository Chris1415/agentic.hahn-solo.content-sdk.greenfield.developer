/**
 * assert-tenant.mjs — the one way to get a Sitecore token you can name the target of.
 *
 * WHY THIS EXISTS (a prior run, 2026-08-27).
 *
 * Two estates can exist in two orgs and be near-indistinguishable, as on the machine
 * where this was measured.
 *
 * They carry the SAME item GUIDs (one was serialized from the other, and SCS
 * preserves GUIDs) and the SAME client scopes. XM Apps and the Deploy API both
 * resolve the tenant from the TOKEN and ignore `?environmentId=`. So pointing one
 * org's credential at the other's work succeeds — auth passes, scope passes, the item
 * ids resolve, the job returns HTTP 200 — and writes to the wrong estate. Nothing
 * anywhere reports it. That is not hypothetical: `scripts/sitecore-publish.mjs`
 * shipped with a credential fallback chain that resolved the wrong org by default.
 *
 * THE DESIGN. An item GUID is not a discriminator. An environment id is not a
 * discriminator. The token's own `tenant_name` claim is the only one. So rather
 * than store a host next to a credential and hope they stay paired, this module
 * DERIVES the host from the claim of the token it just minted:
 *
 *     CM_HOST = https://xmc-<tenant_name>.sitecorecloud.io
 *
 * The pair cannot diverge, because there is only one value. A wrong pairing stops
 * being something to detect and becomes something you cannot express.
 *
 * (`cm/scripts/agql-token.mjs` is the shape this replaces: one org's hardcoded host
 * beside that org's credential — correct, but generically named, so importing its
 * `CM_HOST` silently gave you that org. That is why a per-brand fork of it had to
 * exist.)
 *
 * KEY NAMING. Credentials are read as `SITECORE_<SERVICE>_CLIENT_ID_<ORG>` — a
 * pure template, no unsuffixed default. Unsuffixed keys in a `cm/.env` name one
 * org without saying which; they are retained for legacy callers and deliberately not
 * read here, because an unlabelled default is the whole defect.
 *
 * Never logs a client id, a secret, or a token.
 */

import { readFileSync, existsSync } from 'node:fs';
import { readWorkspaceFile } from './resolve-products-root.mjs';

const CLAIM = 'https://auth.sitecorecloud.io/claims/';
const TOKEN_URL = 'https://auth.sitecorecloud.io/oauth/token';

/**
 * Org label → the tenant and org we expect it to name, from the gitignored `.agent/workspace.json`
 * (`sitecore_orgs`), because they are one machine's facts. Empty by default, so every call that
 * has no explicit expectation REFUSES. An entry missing either value is dropped: half a pairing
 * is not an expectation.
 */
export function knownOrgsFrom(workspace) {
  const orgs = workspace?.sitecore_orgs;
  if (!orgs || typeof orgs !== 'object') return {};
  return Object.fromEntries(Object.entries(orgs)
    .filter(([, v]) => typeof v?.tenant === 'string' && v.tenant && typeof v?.orgName === 'string' && v.orgName)
    .map(([k, v]) => [k.toLowerCase(), { orgName: v.orgName, tenant: v.tenant }]));
}
export const KNOWN_ORGS = knownOrgsFrom(readWorkspaceFile());

export class TenantMismatch extends Error {}

/** Decode a JWT payload. Does not verify the signature — we are reading our own token. */
export function decodeClaims(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new TypeError('not a JWT');
  }
  const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
}

export const tenantOf = (token) => decodeClaims(token)[CLAIM + 'tenant_name'] ?? null;
export const orgNameOf = (token) => decodeClaims(token)[CLAIM + 'org_name'] ?? null;
export const orgIdOf = (token) => decodeClaims(token)[CLAIM + 'org_id'] ?? null;

/**
 * Derive the CM host from a tenant name. The `xmc-` prefix is part of the
 * HOSTNAME and absent from the claim — conflating the two makes a correct gate
 * fail closed on a typo, which is a real thing that happened during a prior run.
 */
export const cmHostFor = (tenant) => `https://xmc-${tenant}.sitecorecloud.io`;
export const agqlEndpointFor = (tenant) => `${cmHostFor(tenant)}/sitecore/api/authoring/graphql/v1`;

/**
 * Fail closed unless the token names `expected`. Throws with BOTH values —
 * a gate that says only "mismatch" sends you looking in the wrong place.
 */
export function assertTenant(token, expected) {
  if (!expected) throw new TenantMismatch('no expected tenant supplied — refusing to assert nothing');
  const got = tenantOf(token);
  if (got == null) {
    throw new TenantMismatch(
      `token carries NO tenant_name claim (org-scoped client, org=${orgNameOf(token) ?? '?'}) — expected ${expected}`
    );
  }
  if (got !== expected) {
    throw new TenantMismatch(`TENANT MISMATCH — token names "${got}", expected "${expected}". Refusing.`);
  }
  return got;
}

/** Parse a dotenv file. Strips a UTF-8 BOM (PowerShell writes one by default). */
export function readEnvFile(path) {
  if (!existsSync(path)) throw new Error(`no env file at ${path}`);
  const out = {};
  for (const line of readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Resolve an org-suffixed credential pair. No fallback to an unsuffixed key and
 * no fallback across services: falling back from the CM client to the deploy
 * client is a second chance to pick a differently-scoped credential, which is
 * exactly how the defect stayed invisible.
 */
export function resolveCredentials({ org, service = 'CM', env }) {
  const ORG = String(org || '').toUpperCase();
  const SVC = String(service).toUpperCase();
  if (!ORG) throw new Error('resolveCredentials: `org` is required — there is no default org');
  const idKey = `SITECORE_${SVC}_CLIENT_ID_${ORG}`;
  const secretKey = `SITECORE_${SVC}_CLIENT_SECRET_${ORG}`;
  const id = env[idKey];
  const secret = env[secretKey];
  if (!id || !secret) {
    throw new Error(
      `missing ${idKey} / ${secretKey}. Credentials are org-suffixed; there is deliberately no ` +
      `unsuffixed default (an unlabelled default is a defect).`
    );
  }
  return { id, secret, idKey };
}

export async function mint({ id, secret }, fetchImpl = fetch) {
  const r = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: id, client_secret: secret,
      audience: 'https://api.sitecorecloud.io',
    }),
  });
  const body = await r.json().catch(() => ({}));
  // Deliberately does not echo the response — it can carry credential detail.
  if (!body.access_token) throw new Error(`token mint failed (HTTP ${r.status})`);
  return body.access_token;
}

/**
 * THE ONE CALL. Mint for an org, assert the tenant, and hand back the token and
 * the host DERIVED FROM IT. `expectTenant` defaults to the KNOWN_ORGS entry (the
 * workspace file); pass
 * it explicitly (e.g. from the run manifest's `provisioning.cm_tenant`) whenever
 * you have it, so the assertion tracks the run rather than this file.
 */
export async function cmFor(org, { envPath, env, expectTenant, service = 'CM', fetchImpl = fetch, knownOrgs = KNOWN_ORGS } = {}) {
  const bag = env ?? readEnvFile(envPath);
  const creds = resolveCredentials({ org, service, env: bag });
  const token = await mint(creds, fetchImpl);
  const expected = expectTenant ?? knownOrgs[String(org).toLowerCase()]?.tenant;
  if (!expected) {
    throw new TenantMismatch(
      `org "${org}" is not in KNOWN_ORGS (sitecore_orgs in .agent/workspace.json) and no expectTenant was supplied — refusing to proceed unnamed`
    );
  }
  const tenant = assertTenant(token, expected);
  return {
    token, tenant,
    org: String(org).toLowerCase(),
    orgName: orgNameOf(token),
    CM_HOST: cmHostFor(tenant),
    AGQL_ENDPOINT: agqlEndpointFor(tenant),
  };
}

/**
 * Fail closed unless the token names `expectedOrg` (by `org_name`).
 *
 * The ORG-level counterpart to `assertTenant`. A deploy client is org-scoped and
 * carries NO `tenant_name` claim, so asserting a tenant on one always fails — the
 * right assertion there is the org. Kept separate rather than folded into one
 * lenient "assert whatever is present" helper: a gate that quietly downgrades
 * from tenant to org when the tenant is missing is a gate that passes a
 * differently-scoped credential, which is the same shape again.
 */
export function assertOrg(token, expectedOrgName) {
  if (!expectedOrgName) throw new TenantMismatch('no expected org supplied — refusing to assert nothing');
  const got = orgNameOf(token);
  if (got !== expectedOrgName) {
    throw new TenantMismatch(`ORG MISMATCH — token names "${got ?? '(none)'}", expected "${expectedOrgName}". Refusing.`);
  }
  return got;
}

/**
 * Mint an ORG-scoped token (deploy family by default) and assert the org.
 * Returns no CM host — an org token does not name a tenant, and inventing one
 * here would be exactly the unfounded pairing this module exists to prevent.
 */
export async function orgFor(org, { envPath, env, expectOrgName, service = 'DEPLOY', fetchImpl = fetch, knownOrgs = KNOWN_ORGS } = {}) {
  const bag = env ?? readEnvFile(envPath);
  const token = await mint(resolveCredentials({ org, service, env: bag }), fetchImpl);
  const expected = expectOrgName ?? knownOrgs[String(org).toLowerCase()]?.orgName;
  if (!expected) {
    throw new TenantMismatch(`org "${org}" is not in KNOWN_ORGS (sitecore_orgs in .agent/workspace.json) and no expectOrgName was supplied — refusing to proceed unnamed`);
  }
  return { token, org: String(org).toLowerCase(), orgName: assertOrg(token, expected), orgId: orgIdOf(token) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// node .agent/scripts/assert-tenant.mjs --org <org> --env <path/to/.env> [--json]
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('assert-tenant.mjs')) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const org = arg('--org');
  const envPath = arg('--env');
  const asJson = argv.includes('--json');

  if (!org || !envPath) {
    console.error('usage: assert-tenant.mjs --org <org> --env <path/to/.env> [--expect <tenant>] [--service CM|DEPLOY] [--json]');
    process.exit(2);
  }
  try {
    const service = arg('--service', 'CM').toUpperCase();
    // A deploy client is org-scoped and names no tenant — assert the org instead.
    const r = service === 'CM'
      ? await cmFor(org, { envPath, expectTenant: arg('--expect'), service })
      : await orgFor(org, { envPath, expectOrgName: arg('--expect'), service });
    const { token, ...safe } = r;   // never print the token
    if (asJson) console.log(JSON.stringify(safe, null, 2));
    else {
      console.log(`  PASS  org=${safe.org} (${safe.orgName})`);
      if (safe.tenant) console.log(`        tenant ${safe.tenant}`);
      if (safe.CM_HOST) console.log(`        host   ${safe.CM_HOST}`);
      if (!safe.tenant) console.log(`        (org-scoped ${service} client — names no tenant, by design)`);
    }
    process.exit(0);
  } catch (e) {
    console.error(`  FAIL  ${e.message}`);
    process.exit(1);
  }
}
