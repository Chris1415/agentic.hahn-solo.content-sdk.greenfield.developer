#!/usr/bin/env node
/**
 * Head-app shape audit — four axes, two bands, derived from the estate rather than asserted.
 *
 *   node .agent/scripts/audit-headapp-shape.mjs --app <head-app-dir> [--json] [--quiet]
 *   node .agent/scripts/audit-headapp-shape.mjs --app <dir> --warn 250 --nogo 450
 *
 * Read-only. No network, no tenant auth, no build.
 *
 * WHY THE BANDS ARE WHAT THEY ARE. Measured 2026-09-02 across 134 components in seven shipped
 * head apps (colocated tests excluded, scaffold infrastructure excluded):
 *
 *     min 25 · p25 81 · MEDIAN 114 · p75 171 · p90 243 · p95 313 · max 673
 *
 * So `warn` sits just above p90 and fires on ~10% of components; `no-go` sits between p95 and the
 * max and fires on ~3%. A first draft used 150/300, which would have put five of seven APPS in the
 * hard band — the "a gate that cries wolf gets ignored, and then the real defects hide in the noise
 * it generated" failure the authorability audit already recorded. **A warn is a question, not a
 * verdict:** "no, this is genuinely one thing" is a correct answer, and belongs in the waiver file
 * with its reasoning, which is what makes it reviewable later.
 *
 * THE AXES, and what each is really looking for:
 *
 *   component-size            a component large enough to be worth asking about (warn) or large
 *                             enough that it is probably several components (no-go). The four in
 *                             the estate's no-go band are a gallery, a finder, a catalog and a
 *                             comparison table — every one an "app inside a component".
 *   lib-outweighs-components  the app has more supporting machinery than product. Fires on 1 of 7,
 *                             and that one is also the least authorable app in the estate (67%).
 *   stray-in-components       ANY file under `src/components/` is auto-registered as a Sitecore
 *                             rendering by `sitecore-tools generate-map`. A types file, a query
 *                             module or a `__tests__/` folder parked there silently becomes a
 *                             rendering (or a variant). Measured: one app ships a 15-file
 *                             `src/components/__tests__/`.
 *   reimplemented-sdk-handler a hand-written API route that duplicates a handler the SDK already
 *                             exports. Measured: one app hand-wrote 178 LOC for `api/revalidate`
 *                             where the official starter uses ~15 via
 *                             `createSitecoreRevalidateRouteHandler` — and has since absorbed a
 *                             Next 16.3 breaking change the SDK wrapper would have carried.
 *                             The handler list is DERIVED from the installed SDK, never restated
 *                             here: a hardcoded list drifts against the package it describes.
 *
 * WHAT THIS DOES NOT MEASURE. Volume, not correctness. A short wrong component passes; a large
 * genuinely-irreducible one warns. It cannot see whether a component is authorable (that is
 * `audit-component-authorability.mjs`) or whether its comments earn their place (that is
 * `audit-comment-density.mjs`). Green here means "the shape is unremarkable", never "this is good".
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const argOf = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const AS_JSON = argv.includes('--json');
const QUIET = argv.includes('--quiet');
const TARGET = argOf('--app');
const WARN_AT = Number(argOf('--warn', '250'));
const NOGO_AT = Number(argOf('--nogo', '450'));
const IGNORE_FILE = '.headapp-shape-ignore.json';

/** Scaffold-owned component folders. Ours to leave alone — they arrive from create-content-sdk-app. */
const SCAFFOLD_COMPONENTS = new Set(['content-sdk', 'partial-design-dynamic-placeholder', 'byoc']);
const CODE = /\.(tsx?|jsx?)$/;
const IS_TEST = (n) => /\.(test|spec)\./.test(n);

/* --------------------------------------------------------------- helpers */

const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '.sitecore') continue;
    const p = join(dir, e.name);
    e.isDirectory() ? walk(p, acc) : (CODE.test(e.name) && acc.push(p));
  }
  return acc;
};
const lines = (f) => { try { return readFileSync(f, 'utf8').split(/\r?\n/).length; } catch { return 0; } };
const locOf = (files) => files.filter((f) => !IS_TEST(basename(f))).reduce((n, f) => n + lines(f), 0);

/**
 * A file inside a component folder that is NEITHER the component nor a colocated test.
 * Deliberately permissive about the component's own spellings — the point is to catch a `types.ts`
 * or a `__tests__/` folder, not to legislate a naming scheme.
 */
function straysIn(compName, files, root) {
  const allowed = new Set([`${compName}.tsx`, `${compName}.ts`, `index.ts`, `index.tsx`]);
  // `<Name>.<Variant>.tsx` is the CANONICAL variant convention — the SDK resolves a variant from
  // `params.FieldNames` to a named export and generate-map merges them into one map entry
  // (`content-sdk-app-router-component-variants`). It is correct code, and an earlier draft of this
  // axis reported five of them across four apps as defects. A gate that fires on the documented
  // happy path is worse than no gate: it teaches the reader to disable it.
  const variant = new RegExp(`^${compName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\.[A-Za-z0-9]+\\.(tsx?|jsx?)$`);
  return files.filter((f) => {
    const b = basename(f);
    if (IS_TEST(b)) return false;
    if (relative(root, f).split(sep).includes('__tests__')) return false;
    return !allowed.has(b) && !variant.test(b);
  });
}

/**
 * The SDK's own route-handler exports, read from the installed package. Returns null when the
 * package is absent — a null is reported as "axis not evaluated", never as a pass, because a
 * missing input that reads as clean is the defect this whole file exists to argue against.
 */
function sdkRouteHandlers(appDir) {
  const pkg = join(appDir, 'node_modules', '@sitecore-content-sdk', 'nextjs');
  if (!existsSync(pkg)) return null;
  const names = new Set();
  for (const f of walk(join(pkg, 'dist')).concat(walk(join(pkg, 'types')))) {
    if (!/route-handler|index\.d\.ts$/.test(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/\bcreate([A-Za-z]*?)RouteHandler\b/g)) names.add(m[1]);
  }
  return names;
}

/** `llms-txt` → `llmstxt`, so a handler named `LlmsTxt` matches its route folder. */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/* ----------------------------------------------------------------- audit */

export function auditApp(appDir) {
  const src = join(appDir, 'src');
  const compRoot = join(src, 'components');
  const findings = [];

  // ── axis 1 + 3: per component ──
  const components = [];
  if (existsSync(compRoot)) {
    for (const e of readdirSync(compRoot, { withFileTypes: true })) {
      if (SCAFFOLD_COMPONENTS.has(e.name)) continue;
      if (e.isFile()) {
        if (!CODE.test(e.name) || IS_TEST(e.name)) continue;
        const p = join(compRoot, e.name);
        components.push({ name: basename(e.name).replace(CODE, ''), loc: lines(p), strays: [] });
        continue;
      }
      // A `__tests__/` (or any `_`-prefixed) folder parked here is NOT a component — it is the
      // trap itself. Scoring it as one produced a nonsense "component of 2169 LOC" finding that
      // buried the real one. Report it once, on its own axis.
      if (e.name.startsWith('_')) {
        const n = walk(join(compRoot, e.name)).length;
        findings.push({ axis: 'test-folder-in-components', level: 'defect', subject: e.name, value: n,
          detail: `${n} file(s) in src/components/${e.name}/. Everything under src/components is auto-registered by generate-map, so this folder is itself a Sitecore rendering and its files become its variants. Move it out of src/components (e.g. to src/__tests__ or tests/).` });
        continue;
      }
      const dir = join(compRoot, e.name);
      const files = walk(dir);
      components.push({
        name: e.name,
        loc: locOf(files),
        strays: straysIn(e.name, files, dir).map((f) => relative(appDir, f)),
      });
    }
  }

  for (const c of components) {
    if (c.loc >= NOGO_AT) {
      findings.push({ axis: 'component-size', level: 'defect', subject: c.name, value: c.loc,
        detail: `${c.loc} LOC (no-go band ≥ ${NOGO_AT}). No component should be this large — split it, or record why it cannot be split.` });
    } else if (c.loc >= WARN_AT) {
      findings.push({ axis: 'component-size', level: 'warn', subject: c.name, value: c.loc,
        detail: `${c.loc} LOC (warn band ≥ ${WARN_AT}; estate median is 114). Can this be simplified or split? "No, it is genuinely one thing" is a valid answer — put it in ${IGNORE_FILE} with the reason.` });
    }
    if (c.strays.length) {
      findings.push({ axis: 'stray-in-components', level: 'defect', subject: c.name, value: c.strays.length,
        detail: `${c.strays.length} file(s) under src/components/ that are neither the component nor a colocated test — each is auto-registered as a Sitecore rendering or variant: ${c.strays.join(', ')}` });
    }
  }

  // ── axis 2: app-level mass ──
  const compLoc = locOf(walk(compRoot));
  const libLoc = locOf(walk(join(src, 'lib')));
  if (compLoc > 0 && libLoc > compLoc) {
    findings.push({ axis: 'lib-outweighs-components', level: 'warn', subject: 'src/lib', value: libLoc,
      detail: `src/lib is ${libLoc} LOC against src/components ${compLoc} (${(libLoc / compLoc).toFixed(1)}×). The app carries more supporting machinery than product — worth asking which of it is domain logic that belongs in a component, and which duplicates the platform.` });
  }

  // ── axis 4: a route the SDK already ships ──
  const handlers = sdkRouteHandlers(appDir);
  const apiRoot = join(src, 'app', 'api');
  let axis4 = 'evaluated';
  if (handlers === null) axis4 = 'not evaluated — @sitecore-content-sdk/nextjs is not installed';
  else if (existsSync(apiRoot)) {
    for (const e of readdirSync(apiRoot, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const route = join(apiRoot, e.name);
      const files = walk(route);
      if (!files.length) continue;
      const body = files.map((f) => readFileSync(f, 'utf8')).join('\n');
      if (/@sitecore-content-sdk\/nextjs\/route-handler/.test(body)) continue;
      const match = [...handlers].find((h) => h && norm(h).includes(norm(e.name)));
      if (!match) continue;
      findings.push({ axis: 'reimplemented-sdk-handler', level: 'warn', subject: `api/${e.name}`,
        value: locOf(files),
        detail: `${locOf(files)} hand-written LOC, and the SDK exports create${match}RouteHandler for this route. Re-check whether the wrapper covers the need — a hand-rolled equivalent also inherits every upstream breaking change by hand.` });
    }
  }

  return { components, compLoc, libLoc, axis4, findings };
}

/* ------------------------------------------------------------ self-check */

/**
 * Positive AND negative sample per axis, run unconditionally. A scanner that has silently stopped
 * detecting cannot be allowed to report a clean app — and a self-check behind a flag is a
 * self-check nobody runs.
 */
function selfCheck() {
  const fails = [];
  const ck = (label, actual, expected) => { if (actual !== expected) fails.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

  ck('norm folds llms-txt to match LlmsTxt', norm('llms-txt'), norm('LlmsTxt'));
  ck('norm keeps distinct routes distinct', norm('robots') === norm('sitemap'), false);

  const S = { name: 'Hero', root: '/x' };
  const strays = straysIn(S.name, ['/x/Hero.tsx', '/x/types.ts', '/x/Hero.test.tsx'], S.root);
  ck('stray detected', strays.length, 1);
  ck('the stray is the types file', basename(strays[0]), 'types.ts');
  ck('the component itself is not a stray', straysIn('Hero', ['/x/Hero.tsx'], '/x').length, 0);
  ck('a colocated test is not a stray', straysIn('Hero', ['/x/Hero.test.tsx'], '/x').length, 0);
  ck('a client presenter is not a stray', straysIn('Hero', ['/x/Hero.client.tsx'], '/x').length, 0);
  ck('an index barrel is not a stray', straysIn('Hero', ['/x/index.ts'], '/x').length, 0);
  ck('a __tests__ folder file is not a stray',
    straysIn('Hero', [join('/x', '__tests__', 'a.ts')], '/x').length, 0);
  // The variant convention, both directions — this is the axis's most dangerous false positive.
  ck('a <Name>.<Variant>.tsx file is NOT a stray',
    straysIn('Hero', ['/x/Hero.Compact.tsx'], '/x').length, 0);
  ck('a sub-component that is not a variant IS a stray',
    straysIn('MediaGallery', ['/x/LightboxViewer.tsx'], '/x').length, 1);
  ck('another component\'s variant spelling is still a stray',
    straysIn('Hero', ['/x/Promo.Card.tsx'], '/x').length, 1);

  // Both sides of both bands, so a threshold that silently moved cannot pass.
  ck('warn band is below the no-go band', WARN_AT < NOGO_AT, true);
  ck('estate median would not warn', 114 >= WARN_AT, false);
  ck('the estate p95 component would warn', 313 >= WARN_AT, true);
  ck('the estate p95 component would NOT be no-go', 313 >= NOGO_AT, false);
  ck('the largest measured component is no-go', 673 >= NOGO_AT, true);

  ck('scaffold components are exempt', SCAFFOLD_COMPONENTS.has('content-sdk'), true);
  ck('an ordinary component is not exempt', SCAFFOLD_COMPONENTS.has('Hero'), false);
  ck('test files are excluded from LOC', IS_TEST('Hero.test.tsx'), true);
  ck('source files are not', IS_TEST('Hero.tsx'), false);

  if (fails.length) {
    console.error('AUDIT SELF-CHECK FAILED — the scanner cannot be trusted:');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(2);
  }
}
selfCheck();

/* ------------------------------------------------------------------- run */

// Compare resolved paths, not the basename: `audit-headapp-shape.test.mjs` ALSO starts with
// `audit-headapp-shape`, so a prefix check made importing this module run the CLI and print usage
// instead of running the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!TARGET) {
    console.error('Usage: node audit-headapp-shape.mjs --app <head-app-dir> [--json] [--quiet] [--warn N] [--nogo N]');
    process.exit(2);
  }
  if (!existsSync(TARGET) || !statSync(TARGET).isDirectory()) {
    console.error(`No such app directory: ${TARGET}`);
    process.exit(2);
  }

  let waivers = { components: {}, axes: {}, routes: {} };
  const wf = join(TARGET, IGNORE_FILE);
  if (existsSync(wf)) {
    try { waivers = { components: {}, axes: {}, routes: {}, ...JSON.parse(readFileSync(wf, 'utf8').replace(/^﻿/, '')) }; }
    catch (e) { console.error(`Bad ${IGNORE_FILE}: ${e.message}`); process.exit(2); }
  }
  const waiverFor = (f) => {
    const bag = f.axis === 'component-size' || f.axis === 'stray-in-components' ? waivers.components
      : f.axis === 'reimplemented-sdk-handler' ? waivers.routes : waivers.axes;
    const key = f.axis === 'reimplemented-sdk-handler' ? f.subject.replace(/^api\//, '')
      : f.axis === 'lib-outweighs-components' ? f.axis : f.subject;
    const w = bag?.[key];
    if (!w) return null;
    if (!w.reason || !String(w.reason).trim()) {
      console.error(`${IGNORE_FILE}: waiver "${key}" has no reason. A waiver is a gate you turned off; its reasoning is the only thing left to review.`);
      process.exit(2);
    }
    return w;
  };

  const res = auditApp(TARGET);
  const waived = [], live = [];
  for (const f of res.findings) (waiverFor(f) ? waived : live).push(f);
  const defects = live.filter((f) => f.level === 'defect');
  const warns = live.filter((f) => f.level === 'warn');

  const usedKeys = new Set(res.findings.map((f) => (f.axis === 'reimplemented-sdk-handler' ? f.subject.replace(/^api\//, '') : f.axis === 'lib-outweighs-components' ? f.axis : f.subject)));
  const stale = [...Object.keys(waivers.components ?? {}), ...Object.keys(waivers.axes ?? {}), ...Object.keys(waivers.routes ?? {})]
    .filter((k) => !usedKeys.has(k));

  if (AS_JSON) {
    console.log(JSON.stringify({
      summary: {
        app: TARGET, components: res.components.length, componentsLoc: res.compLoc, libLoc: res.libLoc,
        warnAt: WARN_AT, nogoAt: NOGO_AT, defects: defects.length, warnings: warns.length,
        waived: waived.length, staleWaivers: stale.length, sdkHandlerAxis: res.axis4,
      },
      findings: live, waived, staleWaivers: stale,
    }, null, 2));
    process.exit(defects.length ? 1 : 0);
  }

  if (!QUIET || defects.length) {
    console.log(`Head-app shape — ${TARGET}`);
    console.log(`  ${res.components.length} component(s) · src/components ${res.compLoc} LOC · src/lib ${res.libLoc} LOC`);
    console.log(`  ${defects.length} defect(s) · ${warns.length} warning(s) · ${waived.length} waived · bands warn ≥ ${WARN_AT}, no-go ≥ ${NOGO_AT}`);
    if (res.axis4 !== 'evaluated') console.log(`  ! reimplemented-sdk-handler: ${res.axis4}`);
    for (const f of [...defects, ...warns]) {
      console.log(`\n  [${f.level === 'defect' ? 'NO-GO ' : 'warn  '}] ${f.axis} · ${f.subject}`);
      console.log(`      ${f.detail}`);
    }
    if (stale.length) console.log(`\n  stale waiver(s) — the finding is gone, remove the entry: ${stale.join(', ')}`);
    if (!defects.length && !warns.length) console.log('\n  Nothing remarkable. (Shape only — this says nothing about authorability or correctness.)');
  }
  process.exit(defects.length ? 1 : 0);
}
