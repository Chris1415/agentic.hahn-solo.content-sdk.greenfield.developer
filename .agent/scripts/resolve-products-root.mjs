#!/usr/bin/env node
/**
 * resolve-products-root.mjs — the ONE place that answers "where do products live?".
 *
 * `products/` is a LOGICAL MOUNT POINT, not a directory. Every stored path
 * (`canonical_artifacts`, `product_root`, `cm_code_base`) and every doc reference
 * keeps saying `products/<group>/<slug>` verbatim; this resolver rewrites that
 * prefix at read time. That is what makes a manifest portable across machines
 * whose roots differ, and what keeps ~450 prose references literally true.
 *
 * Resolution order (first hit wins):
 *   1. AGENTIC_PRODUCTS_ROOT           (env — per-shell override, wins over everything)
 *   2. .agent/workspace.json           { "products_root": "..." }  (gitignored: a MACHINE fact)
 *   3. <repo>/products                 (the in-repo default)
 *
 * A configured root that does not exist is an ERROR, never a silent fallback to
 * the default — a silent fallback would read as "no products found" and look
 * exactly like an empty workspace.
 *
 * `products/_root/` is PINNED TO THE REPO. It is not a product: it is this repo's
 * own planning surface and it is *tracked* (the explicit .gitignore exception).
 * It must not travel with the mount, so `products/_root/...` always resolves under
 * <repo>/products/_root regardless of where the mount points.
 *
 * CLI
 *   node .agent/scripts/resolve-products-root.mjs                     # print the absolute root
 *   node .agent/scripts/resolve-products-root.mjs --json              # full resolution record
 *   node .agent/scripts/resolve-products-root.mjs --path products/personal/x
 *   node .agent/scripts/resolve-products-root.mjs --to-logical <abs>
 *   node .agent/scripts/resolve-products-root.mjs --check             # exit 1 if unusable
 *   flags: --repo <dir>  --quiet
 *
 * Library
 *   import { resolveProductsRoot, resolveLogical, toLogical, findRepoRoot } from './resolve-products-root.mjs'
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Subfolders of the mount point that always stay in the repo, whatever the mount is. */
export const PINNED_TO_REPO = ['_root'];

/** The logical prefix. Never change this without changing every manifest ever written. */
export const MOUNT = 'products';

export const WORKSPACE_FILE = path.join('.agent', 'workspace.json');

/** Walk up from `startDir` to the nearest directory that looks like this framework repo. */
export function findRepoRoot(startDir = HERE) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.agent', 'flows.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(startDir); // no marker — caller's dir is as good as it gets
    dir = up;
  }
}

const expandHome = (p) =>
  p.startsWith('~') ? path.join(os.homedir(), p.slice(1).replace(/^[\\/]/, '')) : p;

/**
 * The per-machine file as parsed JSON. `{}` when absent or unparseable: a caller reading a safety
 * value from it fails closed on the missing key, and resolveProductsRoot reports the parse error.
 */
export function readWorkspaceFile(repoRoot = findRepoRoot()) {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, WORKSPACE_FILE), 'utf8').replace(/^\uFEFF/, '')) ?? {}; }
  catch { return {}; }
}

function readWorkspaceConfig(repoRoot) {
  const file = path.join(repoRoot, WORKSPACE_FILE);
  if (!fs.existsSync(file)) return { file, present: false, value: null, error: null };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    const value = raw && typeof raw.products_root === 'string' ? raw.products_root.trim() : null;
    return { file, present: true, value: value || null, error: null };
  } catch (e) {
    return { file, present: true, value: null, error: `unparseable ${WORKSPACE_FILE}: ${e.message}` };
  }
}

/**
 * Resolve the products root.
 * @returns {{root:string, source:'env'|'workspace.json'|'default', configured:string|null,
 *            repoRoot:string, external:boolean, exists:boolean, rootName:string,
 *            defaultRoot:string, configFile:string, error:string|null}}
 */
export function resolveProductsRoot(opts = {}) {
  const repoRoot = path.resolve(opts.repoRoot || findRepoRoot());
  const env = opts.env || process.env;
  const defaultRoot = path.join(repoRoot, MOUNT);

  const cfg = readWorkspaceConfig(repoRoot);
  const envValue = typeof env.AGENTIC_PRODUCTS_ROOT === 'string' && env.AGENTIC_PRODUCTS_ROOT.trim()
    ? env.AGENTIC_PRODUCTS_ROOT.trim()
    : null;

  let source = 'default';
  let configured = null;
  if (envValue) { source = 'env'; configured = envValue; }
  else if (cfg.value) { source = 'workspace.json'; configured = cfg.value; }

  // A relative configured root is relative to the repo root, so a checked-out
  // sibling folder (`../products-shared`) is expressible without an absolute path.
  const root = configured
    ? path.resolve(repoRoot, expandHome(configured))
    : defaultRoot;

  let error = cfg.error;
  const exists = fs.existsSync(root) && fs.statSync(root).isDirectory();
  if (!error && configured && !exists) {
    error = `configured products_root does not exist or is not a directory: ${root} (source: ${source})`;
  }

  return {
    root,
    source,
    configured,
    repoRoot,
    external: path.relative(repoRoot, root).startsWith('..') || path.parse(root).root !== path.parse(repoRoot).root,
    exists,
    rootName: path.basename(root),
    defaultRoot,
    configFile: cfg.file,
    error,
  };
}

/** Same as resolveProductsRoot but throws instead of returning an `error`. */
export function requireProductsRoot(opts = {}) {
  const r = resolveProductsRoot(opts);
  if (r.error) throw new Error(r.error);
  return r;
}

const splitLogical = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').split('/').filter(Boolean);

/**
 * Map a LOGICAL path (`products/<group>/<slug>/...`, or any repo-relative path)
 * onto the filesystem. Absolute inputs pass through untouched.
 */
export function resolveLogical(logicalPath, ctx = null) {
  const r = ctx && ctx.root ? ctx : resolveProductsRoot();
  const raw = String(logicalPath ?? '');
  if (!raw) return r.repoRoot;
  if (path.isAbsolute(raw)) return path.normalize(raw);

  const parts = splitLogical(raw);
  if (parts[0] !== MOUNT) return path.join(r.repoRoot, ...parts);          // not under the mount
  if (PINNED_TO_REPO.includes(parts[1])) return path.join(r.repoRoot, ...parts); // _root stays home
  return path.join(r.root, ...parts.slice(1));
}

/**
 * Inverse of resolveLogical: an absolute path becomes the portable `products/...`
 * (or repo-relative) form that belongs in a manifest. Forward slashes always —
 * a stored path is data, not a Windows path.
 */
export function toLogical(absPath, ctx = null) {
  const r = ctx && ctx.root ? ctx : resolveProductsRoot();
  const abs = path.resolve(String(absPath ?? ''));
  const post = (rel) => rel.split(path.sep).join('/');

  const underMount = path.relative(r.root, abs);
  if (underMount && !underMount.startsWith('..') && !path.isAbsolute(underMount)) {
    return `${MOUNT}/${post(underMount)}`;
  }
  if (path.resolve(r.root) === abs) return MOUNT;

  const underRepo = path.relative(r.repoRoot, abs);
  if (!underRepo) return '.';
  if (!underRepo.startsWith('..') && !path.isAbsolute(underRepo)) return post(underRepo);

  return post(abs); // outside both — hand it back as-is
}

/** Directory names under the mount that are group buckets, not products. */
// NOTE: nothing imports this. It is a declaration with no consumer — the same shape rule
// 88-gates-verify-use exists to catch, found while adding the throwaway bucket (2026-08-24).
// Left in place because it IS the documented list; wire it to a check before trusting it.
export const BUCKETS = ['marketplace', 'head-application', 'personal', '_internal', 'throwaway'];

/**
 * Directory names directly under the mount that are NOT products and must be
 * skipped by every portfolio scan. `_root` is this repo's own planning surface
 * (pinned to the repo, § 1a rule 1) — it has a `project-planning/` tree, so a
 * naive "has planning ⇒ is a product" scan counts it, and the portfolio then
 * gains or loses a row purely because the mount moved.
 */
export const NOT_A_PRODUCT = new Set([...PINNED_TO_REPO, '.claude', '.git', 'node_modules']);

// ---------------------------------------------------------------------------- CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(n);
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

  const r = resolveProductsRoot({ repoRoot: val('--repo') });
  const quiet = flag('--quiet');

  if (flag('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else if (val('--path') !== undefined) {
    console.log(resolveLogical(val('--path'), r));
  } else if (val('--to-logical') !== undefined) {
    console.log(toLogical(val('--to-logical'), r));
  } else if (!quiet) {
    console.log(r.root);
  }

  if (r.error) {
    console.error(`[ERROR] ${r.error}`);
    process.exit(1);
  }
  if (flag('--check') && !r.exists) {
    console.error(`[ERROR] products root does not exist: ${r.root}`);
    process.exit(1);
  }
}
