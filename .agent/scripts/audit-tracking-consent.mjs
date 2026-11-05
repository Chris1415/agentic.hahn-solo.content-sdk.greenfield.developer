#!/usr/bin/env node
/**
 * Tracking-consent wiring audit — the static half of the `content-sdk-tracking-consent` standard.
 *
 *   node .agent/scripts/audit-tracking-consent.mjs --app <head-app-dir> [--json] [--quiet]
 *
 * Read-only. No network, no build, no tenant. Exit 0 = pass, 1 = unwaived finding, 2 = usage /
 * self-check / bad waiver.
 *
 * WHAT IT DECIDES. Does the app TRACK, and if so is the consent gate wired at every point the
 * skill names? An app that does not track passes. A tracking app must pass all five points:
 *
 *   bootstrap          every `initContentSdk(` call is guarded by an analytics-consent read, and an
 *                      init inside a `useEffect` re-runs on grant (a hook-sourced consent value in
 *                      the deps). Guarding at the mount site (`{analytics && <Bootstrap/>}`) counts.
 *   events             every call of `pageView` / `event` / `identity` / `form` imported from
 *                      `@sitecore-content-sdk/events` (named or namespace) sits in a file with a
 *                      consent guard; inside a `useEffect`, the same re-run-on-grant rule applies.
 *   personalize-proxy  `new PersonalizeProxy({ skip })` — `skip` must read consent (inline, a
 *                      same-file function, or an import from a consent-aware module), or be `() => true`.
 *   withdrawal         a cookie deletion (`Max-Age=0`, `maxAge: 0`, epoch `expires`, `cookies.delete(`)
 *                      lives in a file naming both `sc_cid` and `sc_cid_personalize`, and the function
 *                      that performs it is CALLED somewhere (rule 88: a deleter nothing calls is no gate).
 *   banner             a component under `src/components/` whose path names consent or cookie, that
 *                      writes consent; when `.sitecore/component-map*.ts` exists it must list it.
 *
 * THE HEURISTICS (why renamed helpers still pass). It looks for the consent READ, never for the
 * skill's identifiers. A "consent read" is (a) a call of an identifier whose name contains
 * `consent` or `allows`, (b) a call of anything imported from a CONSENT-AWARE local module (one that
 * itself contains a consent read, resolved transitively through relative, `src/`-baseUrl and `@/`
 * imports), or (c) a cookie / localStorage read on a statement that names consent. A read GUARDS
 * when it is negated, sits in an `if (`, `&&`, `||`, `?` or comparison, or is assigned to a variable
 * that is itself used that way, and it counts only inside the same top-level declaration as the call
 * (a gated trackIdentity cannot vouch for an ungated trackEvent beside it). Comments are stripped first: the stock CdpPageView says "consent"
 * in a comment and must still fail. Test files (`*.test.*`, `*.spec.*`, `__tests__/`, `test-utils/`)
 * are not scanned. The BYOC bridge (`import * as Events` handed to FEAAS as a value) is not a call.
 *
 * WHAT IT CANNOT SEE: whether the banner is placed (footer Partial Design), whether the cookie is
 * written with the right Domain, whether the SDK actually stays silent. That is the runtime half:
 * the skill's real-UA Playwright spec (states A-D), which the content-sdk `/test` stage mandates.
 * Green here means "wired", never "proven".
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, resolve } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POINTS = ['bootstrap', 'events', 'personalize-proxy', 'withdrawal', 'banner'];
export const IGNORE_FILE = '.consent-audit-ignore.json';

const CODE = /\.(tsx?|jsx?|mjs)$/;
const IS_TEST_PATH = (rel) => /\.(test|spec)\.[^/]+$/.test(rel) || /(^|\/)(__tests__|test-utils|__mocks__)\//.test(rel);
const SDK_PKG = /^@sitecore-content-sdk\//;
const EVENT_SINKS = new Set(['pageView', 'event', 'identity', 'form']);
const CONSENT_NAME = /consent|allows/i;
const COOKIE_READ = /document\.cookie|cookies\.get\s*\(|localStorage\.getItem\s*\(/;
const DELETE_RE = /max-age=0\b|maxAge\s*:\s*0\b|expires=Thu, 01 Jan 1970|new Date\(0\)|cookies\.delete\s*\(/gi;

/* ------------------------------------------------------------- source helpers */

/** Strip // and block comments while keeping string and template literals (their text is evidence). */
export function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, end < 0 ? src.length : end + 2);
      out += chunk.replace(/[^\n]/g, ' ');
      i += chunk.length; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Index of the bracket closing the one at `open` (string-aware enough for code with comments stripped). */
function closeOf(s, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  let q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === ']' || c === '}') { if (stack.pop() !== c) return -1; if (!stack.length) return i; }
  }
  return -1;
}

/** `{ local: { source, imported } }` — imported is 'default', '*', or the exported name. */
export function parseImports(code) {
  const map = {};
  for (const m of code.matchAll(/import\s+(?!type\s)([^;'"`]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const [, clause, source] = m;
    const ns = clause.match(/\*\s+as\s+([\w$]+)/);
    if (ns) map[ns[1]] = { source, imported: '*' };
    const def = clause.match(/^\s*([\w$]+)\s*(,|$)/);
    if (def) map[def[1]] = { source, imported: 'default' };
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      for (let part of named[1].split(',')) {
        part = part.trim().replace(/^type\s+/, '');
        if (!part) continue;
        const [imp, loc] = part.split(/\s+as\s+/).map((x) => x.trim());
        map[loc || imp] = { source, imported: imp };
      }
    }
  }
  return map;
}

/** Resolve an import specifier to a key of `files`, or null for packages / unknowns. */
function resolveSpec(fromRel, spec, files) {
  let base;
  if (spec.startsWith('.')) base = posix.join(posix.dirname(fromRel), spec);
  else if (spec.startsWith('@/') || spec.startsWith('~/')) base = `src/${spec.slice(2)}`;
  else if (SDK_PKG.test(spec)) return null;
  else base = `src/${spec}`;
  for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js']) {
    if (files.has(base + ext)) return base + ext;
  }
  return null;
}

/** Name of the function declared nearest before `pos` (the enclosing function, heuristically). */
function enclosingFn(code, pos) {
  const head = code.slice(0, pos);
  let best = null, at = -1;
  for (const re of [/function\s+([\w$]+)\s*\(/g, /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>/g]) {
    for (const m of head.matchAll(re)) if (m.index > at) { at = m.index; best = m[1]; }
  }
  return best;
}

/* -------------------------------------------------------------------- model */

function buildModel(files) {
  const mods = new Map();
  for (const [rel, raw] of files) {
    const code = stripComments(raw);
    mods.set(rel, { rel, code, imports: parseImports(code), test: IS_TEST_PATH(rel) });
  }
  for (const m of mods.values()) {
    m.localDeps = {};
    for (const [loc, { source }] of Object.entries(m.imports)) {
      const r = resolveSpec(m.rel, source, files);
      if (r) m.localDeps[loc] = r;
    }
  }
  // Consent-aware fixed point: a module with a direct consent read, or importing one.
  const direct = (m) => /\b[\w$]*(?:consent|allows)[\w$]*\s*\(/i.test(m.code)
    || m.code.split(/[;\n]/).some((st) => COOKIE_READ.test(st) && /consent/i.test(st));
  for (const m of mods.values()) m.aware = direct(m);
  for (let changed = true; changed;) {
    changed = false;
    for (const m of mods.values()) {
      if (m.aware) continue;
      if (Object.values(m.localDeps).some((d) => mods.get(d)?.aware)) { m.aware = true; changed = true; }
    }
  }
  for (const m of mods.values()) {
    m.isConsentName = (n) => CONSENT_NAME.test(n) || (m.localDeps[n] && mods.get(m.localDeps[n])?.aware);
    analyseConsent(m);
  }
  return mods;
}

const GUARD_BEFORE = /(?:!|&&|\|\||\?|[!=]==?|\bif\s*\(|\breturn|=>)\s*$/;

/** Consent variables (hook-sourced or not) and the POSITIONS of every consent guard in the file. */
function analyseConsent(m) {
  const { code } = m;
  m.consentVars = new Map(); // name -> { hook }
  m.guards = [];
  for (const call of code.matchAll(/([\w$]+)\s*\(/g)) {
    const name = call[1];
    if (!m.isConsentName(name)) continue;
    const before = code.slice(Math.max(0, call.index - 80), call.index);
    if (/function\s+$/.test(before)) continue; // a definition, not a read
    const assign = before.match(/(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:await\s+)?$/);
    if (assign) { m.consentVars.set(assign[1], { hook: /^use/.test(name) }); continue; }
    if (GUARD_BEFORE.test(before)) m.guards.push(call.index);
    if (/^use/.test(name)) {
      // allows(useConsent(), 'x') assigned: the outer call is consent-named and carries the var.
      const outer = before.match(/(?:const|let|var)\s+([\w$]+)\s*=\s*[\w$]+\s*\(\s*$/);
      if (outer) m.consentVars.set(outer[1], { hook: true });
    }
  }
  for (const sm of code.matchAll(/[^;\n]+/g)) {
    const st = sm[0];
    if (!(COOKIE_READ.test(st) && /consent/i.test(st))) continue;
    const a = st.match(/(?:const|let|var)\s+([\w$]+)\s*=/);
    if (a) m.consentVars.set(a[1], { hook: false });
    else if (/\bif\s*\(|&&|\|\||!|\breturn\b/.test(st)) m.guards.push(sm.index);
  }
  // Derived variables: const ok = analytics && !preview.
  for (let changed = true; changed;) {
    changed = false;
    for (const d of code.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*([^;\n]+)/g)) {
      if (m.consentVars.has(d[1])) continue;
      const src = [...m.consentVars.keys()].find((v) => new RegExp(`\\b${v}\\b`).test(d[2]));
      if (src) { m.consentVars.set(d[1], { hook: m.consentVars.get(src).hook }); changed = true; }
    }
  }
  for (const v of m.consentVars.keys()) m.guards.push(...guardSites(code, v));
}

export const usedAsGuard = (code, v) => guardSites(code, v).length > 0;

/** Positions where variable `v` takes part in a boolean guard (negation, if, &&, ||, ?, comparison). */
function guardSites(code, v) {
  const e = v.replace(/\$/g, '\\$');
  return [
    `!\\s*${e}\\b`,
    `\\b${e}\\s*(?:&&|\\|\\||\\?(?!\\.)|[!=]==?)`,
    `(?:&&|\\|\\||[!=]==?)\\s*${e}\\b`,
    `\\bif\\s*\\(\\s*${e}\\s*\\)`,
  ].flatMap((src) => [...code.matchAll(new RegExp(src, 'g'))].map((x) => x.index));
}

const DECL_LINE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class)\b/;

/**
 * The top-level declaration containing `pos`: from the last depth-0 line opening a declaration to the
 * next one. A guard counts only inside it, so a gated trackIdentity cannot vouch for an ungated
 * trackEvent in the same file.
 */
function topLevelSpan(code, pos) {
  const starts = [0];
  let depth = 0, q = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === '\n' && depth === 0 && DECL_LINE.test(code.slice(i + 1, i + 40))) starts.push(i + 1);
  }
  let s = 0, e = code.length;
  for (const st of starts) { if (st <= pos) s = st; else { e = st; break; } }
  return [s, e];
}
const gatedAt = (m, pos) => { const [s, e] = topLevelSpan(m.code, pos); return m.guards.some((g) => g >= s && g < e); };

/** useEffect spans: { start, end, deps: string[] | null }. */
function effects(code) {
  const out = [];
  for (const m of code.matchAll(/\buseEffect\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = closeOf(code, open);
    if (close < 0) continue;
    const args = code.slice(open + 1, close);
    const dm = args.match(/,\s*\[([^\]]*)\]\s*,?\s*$/);
    out.push({ start: open, end: close, deps: dm ? dm[1].split(',').map((s) => s.trim()).filter(Boolean) : null });
  }
  return out;
}

/** Re-run on grant: a hook-sourced consent var in the deps (or no deps array at all). */
function rerunsOnGrant(m, pos) {
  const eff = effects(m.code).find((e) => pos > e.start && pos < e.end);
  if (!eff) return true;
  const hookVars = [...m.consentVars].filter(([, v]) => v.hook).map(([k]) => k);
  if (!hookVars.length) return false;
  return eff.deps === null || eff.deps.some((d) => hookVars.includes(d.replace(/[?.].*$/, '')));
}

/** Calls of `wanted` names bound to an import from an @sitecore-content-sdk/* package. */
function sdkCalls(m, wanted, { ctor = false } = {}) {
  const hits = [];
  for (const [loc, { source, imported }] of Object.entries(m.imports)) {
    if (!SDK_PKG.test(source)) continue;
    if (imported === '*') {
      for (const w of wanted) {
        for (const c of m.code.matchAll(new RegExp(`\\b${loc}\\.${w}\\s*\\(`, 'g'))) hits.push({ name: w, pos: c.index });
      }
    } else if (wanted.has(imported)) {
      const re = new RegExp(`${ctor ? '\\bnew\\s+' : '(?<![\\w$.])'}${loc.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
      for (const c of m.code.matchAll(re)) {
        if (/(function|import)\s+$/.test(m.code.slice(Math.max(0, c.index - 12), c.index))) continue;
        hits.push({ name: imported, pos: c.index });
      }
    }
  }
  return hits;
}

/** Bootstrap gated at its mount site: `{x && <Bootstrap .../>}` with x a consent read in the importer. */
function gatedAtMount(mods, rel) {
  for (const m of mods.values()) {
    if (m.test) continue;
    for (const [loc, dep] of Object.entries(m.localDeps)) {
      if (dep !== rel) continue;
      for (const j of m.code.matchAll(new RegExp(`<${loc}\\b`, 'g'))) {
        const before = m.code.slice(Math.max(0, j.index - 120), j.index);
        const cond = before.match(/([\w$]+)(?:\([^)]*\))?\s*(?:&&|\?)\s*\(?\s*$/);
        if (cond && (m.consentVars.has(cond[1]) || m.isConsentName(cond[1]))) return true;
      }
    }
  }
  return false;
}

/* -------------------------------------------------------------------- audit */

/**
 * @param {Map<string,string>} files  app-relative POSIX path -> source (src/** only)
 * @param {{ componentMaps?: string[] }} opts  bodies of .sitecore/component-map*.ts, when present
 */
export function auditSources(files, opts = {}) {
  const mods = buildModel(files);
  const live = [...mods.values()].filter((m) => !m.test);
  const findings = [];
  const signals = [];
  const add = (point, subject, detail) => findings.push({ point, subject, detail });

  // ── bootstrap + events sinks ──
  for (const m of live) {
    for (const c of sdkCalls(m, new Set(['initContentSdk']))) {
      signals.push(`initContentSdk in ${m.rel}`);
      const g = gatedAt(m, c.pos);
      if (!g && !gatedAtMount(mods, m.rel)) {
        add('bootstrap', m.rel, 'initContentSdk runs with no analytics-consent read guarding it. Gate the INIT, not only the page view: an ungated init still mints a guest (create.json) and sets sc_cid (skill § 1).');
      } else if (g && !rerunsOnGrant(m, c.pos)) {
        add('bootstrap', m.rel, 'the init is gated, but its useEffect does not re-run on grant: no hook-sourced consent value in the deps. Measured: a mid-session grant then sends nothing until a hard reload (state D). Read consent with a hook and add it to the deps (skill § 1).');
      }
    }
    for (const c of sdkCalls(m, EVENT_SINKS)) {
      signals.push(`${c.name}() in ${m.rel}`);
      if (!gatedAt(m, c.pos)) {
        add('events', m.rel, `${c.name}() is called with no consent read guarding it. Route custom events through a consent-checked helper (trackEvent / trackIdentity) and gate CdpPageView on analytics (skill § 2).`);
      } else if (!rerunsOnGrant(m, c.pos)) {
        add('events', m.rel, `${c.name}() is gated inside a useEffect that does not re-run on grant (no hook-sourced consent value in its deps), so a grant does not send the CURRENT page's view (state D, skill § 2).`);
      }
    }
  }
  const dedupe = new Set();
  for (let i = findings.length - 1; i >= 0; i--) {
    const k = `${findings[i].point}|${findings[i].subject}`;
    if (dedupe.has(k)) findings.splice(i, 1); else dedupe.add(k);
  }

  // ── personalize proxy ──
  for (const m of live) {
    for (const c of sdkCalls(m, new Set(['PersonalizeProxy']), { ctor: true })) {
      signals.push(`PersonalizeProxy in ${m.rel}`);
      const open = m.code.indexOf('(', c.pos);
      const close = closeOf(m.code, open);
      const opts = close > 0 ? m.code.slice(open + 1, close) : '';
      const sk = opts.match(/\bskip\s*:\s*([\s\S]*?)(?=,\s*[\w$]+\s*:|,?\s*\}\s*$)/);
      const value = sk ? sk[1].trim() : '';
      let ok = false;
      if (/^\(\s*[\w$]*\s*\)\s*=>\s*true$/.test(value)) ok = true; // personalization switched off
      else if (/=>/.test(value)) ok = [...value.matchAll(/([\w$]+)\s*\(/g)].some((x) => m.isConsentName(x[1])) || /consent/i.test(value) && COOKIE_READ.test(value);
      else if (/^[\w$]+$/.test(value)) {
        if (m.localDeps[value]) ok = !!mods.get(m.localDeps[value])?.aware;
        else {
          const def = m.code.match(new RegExp(`(?:const|let|var|function)\\s+${value}\\b[\\s\\S]*?(?:;\\s*\\n|\\n\\}\\s*\\n|\\n\\n)`));
          ok = !!def && ([...def[0].matchAll(/([\w$]+)\s*\(/g)].some((x) => x[1] !== value && m.isConsentName(x[1])) || (/consent/i.test(def[0]) && COOKIE_READ.test(def[0])));
        }
      }
      if (!ok) add('personalize-proxy', m.rel, `PersonalizeProxy skip is ${value ? `\`${value.slice(0, 60)}\`` : 'absent'}, which does not read the consent cookie. skip runs before initPersonalizeServer and the Edge lookup, so it is the only consent-capable control: \`skip: (req) => !allows(parseConsent(req.cookies.get(CONSENT_COOKIE)?.value), 'marketing')\` (skill § 3).`);
    }
  }

  const tracks = signals.length > 0;
  if (!tracks) return { tracks, signals, findings: [] };

  // ── withdrawal ──
  const hasName = (code, n) => new RegExp(`['"\`]${n}['"\`]`).test(code);
  const delFiles = live.filter((m) => hasName(m.code, 'sc_cid') || hasName(m.code, 'sc_cid_personalize'));
  const deleters = [];
  for (const m of delFiles) {
    for (const d of m.code.matchAll(DELETE_RE)) {
      const fn = enclosingFn(m.code, d.index);
      if (fn) deleters.push({ rel: m.rel, fn });
    }
  }
  const named = ['sc_cid', 'sc_cid_personalize'].filter((n) => delFiles.some((m) => hasName(m.code, n) && deleters.some((d) => d.rel === m.rel)));
  const called = deleters.filter(({ rel, fn }) => live.some((m) => {
    if (m.rel !== rel && m.localDeps[fn] !== rel) return false;
    const calls = [...m.code.matchAll(new RegExp(`(?<![\\w$.])${fn}\\s*\\(`, 'g'))]
      .filter((x) => !/(function|const|let|var)\s+$/.test(m.code.slice(Math.max(0, x.index - 10), x.index)));
    return calls.length > 0;
  }));
  if (!deleters.length) add('withdrawal', '(app)', 'nothing deletes sc_cid / sc_cid_personalize. The SDK never does (measured: sc_cid survives withdrawal for 400 d in Chromium). Delete both on every save without analytics, for host-only, apex, www and the full host (skill § 4).');
  else if (named.length < 2) add('withdrawal', deleters[0].rel, `the cookie deletion names only ${named.join(', ') || 'neither tracking cookie'}; both sc_cid and sc_cid_personalize must be deleted (skill § 4).`);
  else if (!called.length) add('withdrawal', deleters[0].rel, `the deletion in ${[...new Set(deleters.map((d) => d.fn))].join(', ')} is never called. A deleter nothing calls is no gate (rule 88); call it from the save path on every save without analytics (skill § 4).`);

  // ── banner ──
  const banners = live.filter((m) => /^src\/components\//.test(m.rel) && /consent|cookie/i.test(m.rel.slice('src/components/'.length))
    && ([...m.code.matchAll(/([\w$]+)\s*\(/g)].some((x) => m.isConsentName(x[1])) || /document\.cookie\s*=/.test(m.code)));
  if (!banners.length) {
    add('banner', '(app)', 'no consent banner component: nothing under src/components/ named for consent or cookies that writes consent. The banner is an authorable Sitecore rendering (skill § The banner, rule 86).');
  } else if (opts.componentMaps?.length) {
    const names = banners.map((b) => b.rel.split('/')[2].replace(CODE, ''));
    const mapped = names.filter((n) => opts.componentMaps.some((body) => new RegExp(`['"]${n}['"]`).test(body)));
    if (!mapped.length) add('banner', banners[0].rel, `the banner component (${names.join(', ')}) is not in .sitecore/component-map*.ts, so layout cannot render it. Regenerate the map (sitecore-tools project component generate-map).`);
  }

  return { tracks, signals, findings };
}

export function readApp(appDir) {
  const files = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (CODE.test(e.name)) files.set(relative(appDir, p).split(sep).join('/'), readFileSync(p, 'utf8'));
    }
  };
  walk(join(appDir, 'src'));
  const componentMaps = ['component-map.ts', 'component-map.client.ts']
    .map((f) => join(appDir, '.sitecore', f)).filter(existsSync).map((f) => readFileSync(f, 'utf8'));
  return { files, componentMaps };
}

export function auditApp(appDir) {
  const { files, componentMaps } = readApp(appDir);
  return auditSources(files, { componentMaps });
}

/**
 * Waivers: `{ "points": { "<point>": {reason}, "<point>:<app-relative file>": {reason} } }`.
 * A point key waives that point everywhere; a point:file key waives one finding.
 */
export function applyWaivers(findings, waivers = {}) {
  const pts = waivers.points ?? {};
  for (const [k, w] of Object.entries(pts)) {
    if (!POINTS.includes(k.split(':')[0])) throw new Error(`waiver "${k}" names no known point (${POINTS.join(', ')})`);
    if (!w || !String(w.reason ?? '').trim()) throw new Error(`waiver "${k}" has no reason. A waiver is a gate you turned off; its reasoning is the only thing left to review.`);
  }
  const live = [], waived = [], used = new Set();
  for (const f of findings) {
    const key = pts[`${f.point}:${f.subject}`] ? `${f.point}:${f.subject}` : pts[f.point] ? f.point : null;
    if (key) { waived.push({ ...f, reason: pts[key].reason }); used.add(key); } else live.push(f);
  }
  return { live, waived, stale: Object.keys(pts).filter((k) => !used.has(k)) };
}

/* ---------------------------------------------------------------- self-check */

/** Positive AND negative sample per point, run unconditionally: a scanner that stopped detecting must not report clean. */
function selfCheck() {
  const fails = [];
  const ck = (label, actual, expected) => { if (actual !== expected) fails.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
  const pointsOf = (files) => auditSources(new Map(Object.entries(files))).findings.map((f) => f.point).sort().join(',');

  ck('comments are stripped, strings kept', stripComments("a // consent\nb = '//x' /* allows( */"), "a \nb = '//x'              ");
  ck('a guard by negation', usedAsGuard('if (!analytics) return;', 'analytics'), true);
  ck('a deps entry is not a guard', usedAsGuard('}, [siteName, analytics]);', 'analytics'), false);

  const init = "import { initContentSdk } from '@sitecore-content-sdk/nextjs';\n";
  const store = { 'src/lib/c.ts': "export const useAllows = (c) => readConsent(c);\nexport const hasConsentClient = (c) => readConsent(c);\n" };
  const stockBoot = `${init}useEffect(() => { initContentSdk({}); }, [siteName]);`;
  const gatedBoot = `${init}import { useAllows } from 'lib/c';\nconst a = useAllows('analytics');\nuseEffect(() => { if (!a) return; initContentSdk({}); }, [siteName, a]);`;
  const onceBoot = `${init}import { hasConsentClient } from 'lib/c';\nuseEffect(() => { if (!hasConsentClient('analytics')) return; initContentSdk({}); }, [siteName]);`;
  ck('ungated init -> bootstrap', pointsOf({ 'src/Bootstrap.tsx': stockBoot }).includes('bootstrap'), true);
  ck('gated init -> no bootstrap finding', pointsOf({ ...store, 'src/Bootstrap.tsx': gatedBoot }).includes('bootstrap'), false);
  ck('gate read once, no dep -> bootstrap (state D)', pointsOf({ ...store, 'src/Bootstrap.tsx': onceBoot }).includes('bootstrap'), true);
  ck('a renamed helper from a consent-aware module gates',
    pointsOf({ ...store, 'src/lib/p.ts': "import { useAllows } from './c';\nexport const useOk = () => useAllows('analytics');\n",
      'src/Bootstrap.tsx': `${init}import { useOk } from 'lib/p';\nconst a = useOk();\nuseEffect(() => { if (!a) return; initContentSdk({}); }, [a]);` }).includes('bootstrap'), false);

  const ev = "import { event } from '@sitecore-content-sdk/events';\n";
  ck('ungated event() -> events', pointsOf({ 'src/lib/t.ts': `${ev}export const t = (d) => event(d);` }).includes('events'), true);
  ck('gated event() -> no events finding', pointsOf({ ...store, 'src/lib/t.ts': `${ev}import { hasConsentClient } from './c';\nexport const t = (d) => { if (!hasConsentClient('analytics')) return null; return event(d); };` }).includes('events'), false);
  ck('a guard in a sibling function does not vouch for an ungated one', pointsOf({ ...store, 'src/lib/t.ts': `${ev}import { hasConsentClient } from './c';\nexport const a = (d) => event(d);\nexport const b = (d) => { if (!hasConsentClient('marketing')) return null; return event(d); };` }).includes('events'), true);
  ck('a namespace import handed over as a value is not a sink', pointsOf({ 'src/byoc/index.tsx': "import * as Events from '@sitecore-content-sdk/events';\nset({ eventsSDK: Events });" }), '');

  const px = (skip) => ({ 'src/proxy.ts': `import { PersonalizeProxy } from '@sitecore-content-sdk/nextjs/proxy';\nimport { allows, parseConsent } from './lib/c';\nconst p = new PersonalizeProxy({ sites, skip: ${skip} });` });
  ck('skip: () => false -> personalize-proxy', pointsOf(px('() => false')).includes('personalize-proxy'), true);
  ck('skip reads consent -> no finding', pointsOf({ ...store, ...px("(req) => !allows(parseConsent(req.cookies.get('site_consent')?.value), 'marketing')") }).includes('personalize-proxy'), false);

  const del = "const NAMES = ['sc_cid', 'sc_cid_personalize'];\nexport function clearCookies(n) { document.cookie = `${n}=; Max-Age=0`; }\n";
  ck('a deleter nobody calls -> withdrawal', pointsOf({ 'src/Bootstrap.tsx': stockBoot, 'src/lib/s.ts': del }).includes('withdrawal'), true);
  ck('a called deleter -> no withdrawal finding', pointsOf({ 'src/Bootstrap.tsx': stockBoot, 'src/lib/s.ts': `${del}export function saveConsent() { clearCookies(NAMES); }` }).includes('withdrawal'), false);
  ck('no banner -> banner', pointsOf({ 'src/Bootstrap.tsx': stockBoot }).includes('banner'), true);
  ck('a non-tracking app passes', pointsOf({ 'src/components/Hero/Hero.tsx': 'export default () => null;' }), '');

  if (fails.length) {
    console.error('AUDIT SELF-CHECK FAILED — the scanner cannot be trusted:');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(2);
  }
}
selfCheck();

/* ----------------------------------------------------------------------- run */

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
  const TARGET = argOf('--app');
  const AS_JSON = argv.includes('--json');
  const QUIET = argv.includes('--quiet');
  if (!TARGET) { console.error('Usage: node audit-tracking-consent.mjs --app <head-app-dir> [--json] [--quiet]'); process.exit(2); }
  if (!existsSync(TARGET) || !statSync(TARGET).isDirectory()) { console.error(`No such app directory: ${TARGET}`); process.exit(2); }

  let waivers = {};
  const wf = join(TARGET, IGNORE_FILE);
  if (existsSync(wf)) {
    try { waivers = JSON.parse(readFileSync(wf, 'utf8').replace(/^﻿/, '')); }
    catch (e) { console.error(`Bad ${IGNORE_FILE}: ${e.message}`); process.exit(2); }
  }
  const res = auditApp(TARGET);
  let w;
  try { w = applyWaivers(res.findings, waivers); } catch (e) { console.error(`${IGNORE_FILE}: ${e.message}`); process.exit(2); }

  if (AS_JSON) {
    console.log(JSON.stringify({
      summary: { app: TARGET, tracks: res.tracks, verdict: w.live.length ? 'FAIL' : 'PASS', findings: w.live.length, waived: w.waived.length, staleWaivers: w.stale.length },
      signals: res.signals, findings: w.live, waived: w.waived, staleWaivers: w.stale,
    }, null, 2));
    process.exit(w.live.length ? 1 : 0);
  }
  if (!QUIET || w.live.length) {
    console.log(`Tracking consent — ${TARGET}`);
    if (!res.tracks) console.log('  PASS — the app does not track (no initContentSdk, Sitecore events call or PersonalizeProxy).');
    else {
      console.log(`  tracks: ${res.signals.length} signal(s) · ${w.live.length} finding(s) · ${w.waived.length} waived`);
      for (const f of w.live) console.log(`\n  [FAIL] ${f.point} · ${f.subject}\n      ${f.detail}`);
      if (!w.live.length) console.log('  PASS — wired at all five points. Static only: the real-UA acceptance spec (states A-D) is the proof.');
    }
    if (w.stale.length) console.log(`\n  stale waiver(s) — the finding is gone, remove the entry: ${w.stale.join(', ')}`);
  }
  process.exit(w.live.length ? 1 : 0);
}
