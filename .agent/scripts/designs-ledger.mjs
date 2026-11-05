#!/usr/bin/env node
/**
 * designs-ledger.mjs — the MEASURED spine of the design library (`designs/`).
 *
 *   node .agent/scripts/designs-ledger.mjs backfill [--designs <dir>] [--json] [--quiet]
 *   node .agent/scripts/designs-ledger.mjs render   [--designs <dir>] [--quiet]
 *   node .agent/scripts/designs-ledger.mjs check    --ground <css> --ink <css> --accent <css> [--display <family>] [--composition <class>] [--json] [--quiet]
 *   node .agent/scripts/designs-ledger.mjs census   [--designs <dir>] [--json] [--quiet]        # composition classes across the library
 *   node .agent/scripts/designs-ledger.mjs append   --id <id> --product <slug> --variant vN --ground <css> --ink <css> --accent <css>
 *                                                   --display <family> [--body <family>] --picked yes|no --reason "<one line>"
 *
 * WHY THIS EXISTS. Measured 2026-09-11 across seven shipped head apps:
 * six of seven sit in ONE light-ground cluster at ΔE_OK 0.009 (warm paper, hue 81–91°),
 * five of seven carry a serif display, seven of seven name the text token `ink`, and the
 * accent converges by hue family (five of seven at h 34–72°). Nothing in the pipeline
 * could see it, because no stage reads what a sibling run shipped — the only per-run
 * memory is `ui_design.selected_poc_path`. This script is that memory: an append-only
 * `ledger.json` of what was built (backfilled from `globals.css`, never agent-typed) plus
 * a `check` verb that turns "do not converge" from prose in `04b-design.md` into a
 * verdict with an exit code (rule 88 — a gate must be able to fail).
 *
 * COLOUR MATHS. sRGB → OKLab per Björn Ottosson (https://bottosson.github.io/posts/oklab/),
 * no dependencies; `oklch()`, `#rrggbb`, `rgb()` / `rgba()` (alpha composited over the row's
 * ground) are the accepted literals. Colours are compared in OKLab (ΔE_OK = Euclidean).
 *
 * BANDS ARE PER AXIS AND CALIBRATED ON THE ESTATE — never one radius. A single ε cannot be
 * right: two sites of one style sit 0.009 apart on ground while their accents are 0.176
 * apart (green vs ochre — still the same hue *family* to an eye). So:
 *   ground  occupied ⇔ ΔE ≤ 0.010, OR both chromatic (C ≥ 0.004) and |Δh| ≤ 15° and |ΔL| ≤ 0.03
 *           (pure white is 0.016–0.040 from the six warm papers: the discriminator is HUE, and
 *            an achromatic white is genuinely free)
 *   ink     occupied ⇔ ΔE ≤ 0.030
 *   accent  occupied ⇔ both chromatic (C ≥ 0.05) and |Δh| ≤ 15°, or both achromatic and ΔE ≤ 0.05
 *   display family repeat — reported, WARN only (seven families cannot serve an unbounded library)
 *   composition — a SECOND MEASURED AXIS (2026-09-17): the hero's composition class, read from
 *           every `designs/sites/<brand>/<variation>/entry.json` `composition` field (the library is
 *           the corpus that converged, not the seven shipped apps). Occupied ⇔ the class already
 *           holds > COMPOSITION.share (30%) of classified entries. Why: the 2026-09-16 contact sheet
 *           showed ~60% of 84 heroes in ONE layout (headline left + one object right) while colour
 *           and type diverged — the ledger fixed what it measured and nothing else. A census under
 *           COMPOSITION.floor entries cannot fail (reported as thin), or an early batch would be
 *           judged on itself.
 * Verdict: FAIL when ≥ 2 colour axes are occupied by *any* ledger row, OR the composition
 * class is over its share; otherwise PASS, with
 * the occupied axes and the display repeat listed so the review-for-genericness pass has
 * something concrete to answer. Leave-one-out over the seven shipped apps is the
 * calibration fixture (see __tests__/designs-ledger.test.mjs): the converged six FAIL
 * against each other and the outliers pass — a threshold that made those two sites
 * "different" would be wrong.
 *
 * WHERE `designs/` IS. `--designs <dir>` → `AGENTIC_DESIGNS_ROOT` → `.agent/workspace.json`
 * `designs_root` → `<repo>/../designs` (a sibling of `project/`, its own git repo — like
 * `work/`). A CONFIGURED root that does not exist is an ERROR (exit 2), never a silent
 * fallback — the same rule as the products root, for the same reason: an empty ledger and a
 * missing ledger must not read the same.
 *
 * Exit codes: 0 ok / PASS · 1 check FAIL · 2 usage, unreadable input, or a missing root.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLogical, resolveProductsRoot, findRepoRoot } from './resolve-products-root.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// colour
// ---------------------------------------------------------------------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const unlin = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function srgbToOklab(r, g, b) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

const hexToRgb = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Parse a CSS colour literal to OKLab. `ground` (OKLab-less rgb triple) composites alpha. */
export function parseColor(value, groundRgb = [1, 1, 1]) {
  const v = String(value).trim();
  let m;
  if ((m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i))) return srgbToOklab(...hexToRgb(v));
  if ((m = v.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i))) {
    let [r, g, b] = [m[1], m[2], m[3]].map((x) => +x / 255);
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? +m[4].slice(0, -1) / 100 : +m[4];
    if (a < 1) {
      const [gr, gg, gb] = groundRgb;
      [r, g, b] = [
        unlin(lin(r) * a + lin(gr) * (1 - a)),
        unlin(lin(g) * a + lin(gg) * (1 - a)),
        unlin(lin(b) * a + lin(gb) * (1 - a)),
      ];
    }
    return srgbToOklab(r, g, b);
  }
  if ((m = v.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.%]+)?\s*\)$/i))) {
    const L = m[1].endsWith('%') ? +m[1].slice(0, -1) / 100 : +m[1];
    const C = +m[2], h = +m[3];
    const hr = (h * Math.PI) / 180;
    return { L, a: C * Math.cos(hr), b: C * Math.sin(hr) };
  }
  if ((m = v.match(/^oklab\(\s*([\d.]+%?)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i))) {
    const L = m[1].endsWith('%') ? +m[1].slice(0, -1) / 100 : +m[1];
    return { L, a: +m[2], b: +m[3] };
  }
  throw new Error(`unparsed colour literal: ${v}`);
}

export const toLCH = ({ L, a, b }) => {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: +L.toFixed(4), C: +C.toFixed(4), h: C < 0.004 ? null : +h.toFixed(1) };
};
export const deltaE = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
const dHue = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const fromLCH = ({ L, C, h }) => { const hr = ((h ?? 0) * Math.PI) / 180; return { L, a: C * Math.cos(hr), b: C * Math.sin(hr) }; };

// ---------------------------------------------------------------------------
// bands (see header)
// ---------------------------------------------------------------------------
export const BANDS = {
  ground: { dE: 0.010, hue: 15, dL: 0.03, chroma: 0.004 },
  ink: { dE: 0.030 },
  accent: { hue: 15, chroma: 0.05, achromaticDE: 0.05 },
};

export const COMPOSITIONS = ['text-object', 'type-only', 'centered', 'full-bleed', 'instrument', 'grid', 'poster', 'list-first', 'split', 'canvas'];
export const COMPOSITION = { share: 0.30, floor: 20 };

/** Every `sites/<brand>/<variation>/entry.json` that declares a composition → [{ id, composition, status }]. */
export function readCompositions(root) {
  const sitesDir = path.join(root, 'sites');
  const out = [];
  if (!fs.existsSync(sitesDir)) return out;
  for (const brand of fs.readdirSync(sitesDir).sort()) {
    const bd = path.join(sitesDir, brand);
    if (!fs.statSync(bd).isDirectory()) continue;
    for (const v of fs.readdirSync(bd).sort()) {
      const f = path.join(bd, v, 'entry.json');
      if (!fs.existsSync(f)) continue;
      try {
        const e = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
        if (e.composition) out.push({ id: `${brand}/${v}`, composition: String(e.composition), status: e.status ?? 'candidate' });
      } catch { /* an unreadable entry is the catalog's problem, not the census's */ }
    }
  }
  return out;
}

/** Distribution of composition classes over the census (controls excluded — they are fixtures, not the library). */
export function censusOf(entries) {
  const rows = entries.filter((e) => e.status !== 'control');
  const counts = {};
  for (const e of rows) counts[e.composition] = (counts[e.composition] ?? 0) + 1;
  const total = rows.length;
  const classes = Object.entries(counts).map(([k, n]) => ({ composition: k, count: n, share: total ? +(n / total).toFixed(3) : 0, known: COMPOSITIONS.includes(k) })).sort((a, b) => b.count - a.count);
  return { total, classes };
}

/**
 * Is this composition class already over its share of the library?
 * { verdict:'PASS'|'FAIL', share, count, total, thin } — thin = census below the floor, cannot fail.
 */
export function checkComposition(cls, entries, opts = {}) {
  if (!COMPOSITIONS.includes(cls)) throw new Error(`unknown composition "${cls}" — one of ${COMPOSITIONS.join(', ')}`);
  const share = opts.share ?? COMPOSITION.share, floor = opts.floor ?? COMPOSITION.floor;
  const c = censusOf(entries);
  const row = c.classes.find((x) => x.composition === cls);
  const count = row ? row.count : 0;
  const s = c.total ? count / c.total : 0;
  const thin = c.total < floor;
  const over = !thin && s > share;
  return { verdict: over ? 'FAIL' : 'PASS', composition: cls, count, total: c.total, share: +s.toFixed(3), limit: share, thin,
    why: thin ? `census has ${c.total} classified entries (< ${floor}) — too thin to judge` : over ? `"${cls}" already holds ${(s * 100).toFixed(0)}% of ${c.total} classified entries (> ${share * 100}%)` : `"${cls}" holds ${(s * 100).toFixed(0)}% of ${c.total} (≤ ${share * 100}%)` };
}

export function occupied(axis, plan, row) {
  // plan/row are LCH ({L,C,h}) for one axis
  const P = fromLCH(plan), R = fromLCH(row);
  const dE = deltaE(P, R);
  if (axis === 'ground') {
    if (dE <= BANDS.ground.dE) return { hit: true, dE, why: `ΔE ${dE.toFixed(3)} ≤ ${BANDS.ground.dE}` };
    if (plan.C >= BANDS.ground.chroma && row.C >= BANDS.ground.chroma && plan.h != null && row.h != null
      && dHue(plan.h, row.h) <= BANDS.ground.hue && Math.abs(plan.L - row.L) <= BANDS.ground.dL) {
      return { hit: true, dE, why: `same hue band (Δh ${dHue(plan.h, row.h).toFixed(0)}° ≤ ${BANDS.ground.hue}°, ΔL ${Math.abs(plan.L - row.L).toFixed(3)})` };
    }
    return { hit: false, dE };
  }
  if (axis === 'ink') {
    return dE <= BANDS.ink.dE ? { hit: true, dE, why: `ΔE ${dE.toFixed(3)} ≤ ${BANDS.ink.dE}` } : { hit: false, dE };
  }
  if (axis === 'accent') {
    const pc = plan.C >= BANDS.accent.chroma, rc = row.C >= BANDS.accent.chroma;
    if (pc && rc && dHue(plan.h, row.h) <= BANDS.accent.hue) return { hit: true, dE, why: `same accent hue family (Δh ${dHue(plan.h, row.h).toFixed(0)}° ≤ ${BANDS.accent.hue}°)` };
    if (!pc && !rc && dE <= BANDS.accent.achromaticDE) return { hit: true, dE, why: `both achromatic, ΔE ${dE.toFixed(3)} ≤ ${BANDS.accent.achromaticDE}` };
    return { hit: false, dE };
  }
  throw new Error(`unknown axis ${axis}`);
}

/**
 * Check a token plan against every ledger row (light theme). Returns
 * { verdict: 'PASS'|'FAIL', axes: { ground:[hits], ink:[hits], accent:[hits] }, displayRepeats:[ids], nearest:[...] }.
 */
export function checkPlan(plan, rows) {
  const axes = { ground: [], ink: [], accent: [] };
  const displayRepeats = [];
  const nearest = [];
  for (const row of rows) {
    const rl = row.light;
    if (!rl) continue;
    let sum = 0;
    for (const axis of ['ground', 'ink', 'accent']) {
      if (!plan[axis] || !rl[axis]) continue;
      const o = occupied(axis, plan[axis], rl[axis]);
      sum += o.dE * o.dE;
      if (o.hit) axes[axis].push({ id: row.id, why: o.why, dE: +o.dE.toFixed(4) });
    }
    nearest.push({ id: row.id, distance: +Math.sqrt(sum).toFixed(4) });
    if (plan.display_family && row.display_family && plan.display_family === row.display_family) displayRepeats.push(row.id);
  }
  nearest.sort((a, b) => a.distance - b.distance);
  const occupiedAxes = Object.entries(axes).filter(([, hits]) => hits.length).map(([k]) => k);
  const verdict = occupiedAxes.length >= 2 ? 'FAIL' : 'PASS';
  return { verdict, occupiedAxes, axes, displayRepeats, nearest: nearest.slice(0, 3) };
}

// ---------------------------------------------------------------------------
// designs root
// ---------------------------------------------------------------------------
export function resolveDesignsRoot(opts = {}) {
  const repoRoot = path.resolve(opts.repoRoot || findRepoRoot(HERE));
  const env = opts.env || process.env;
  let configured = null, source = 'default';
  if (opts.designs) { configured = opts.designs; source = 'flag'; }
  else if (typeof env.AGENTIC_DESIGNS_ROOT === 'string' && env.AGENTIC_DESIGNS_ROOT.trim()) { configured = env.AGENTIC_DESIGNS_ROOT.trim(); source = 'env'; }
  else {
    const ws = path.join(repoRoot, '.agent', 'workspace.json');
    if (fs.existsSync(ws)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(ws, 'utf8').replace(/^﻿/, ''));
        if (typeof cfg.designs_root === 'string' && cfg.designs_root.trim()) { configured = cfg.designs_root.trim(); source = 'workspace.json'; }
      } catch (e) { return { error: `unreadable ${ws}: ${e.message}` }; }
    }
  }
  const root = configured ? path.resolve(repoRoot, configured.replace(/^~(?=$|[\\/])/, process.env.USERPROFILE || process.env.HOME || '~')) : path.resolve(repoRoot, '..', 'designs');
  const exists = fs.existsSync(root) && fs.statSync(root).isDirectory();
  const error = exists ? null : `designs root does not exist or is not a directory: ${root} (source: ${source}) — rename/create it or set AGENTIC_DESIGNS_ROOT`;
  return { root, source, configured, exists, error, repoRoot };
}

// ---------------------------------------------------------------------------
// extraction from a shipped app's token file
// ---------------------------------------------------------------------------
function readBlock(css, selector) {
  const idx = css.indexOf(selector);
  if (idx < 0) throw new Error(`selector not found: ${JSON.stringify(selector)}`);
  const open = css.indexOf('{', idx);
  let depth = 0, i = open;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) break; }
  }
  return css.slice(open + 1, i);
}
function findVar(text, name) {
  // a declaration may follow a newline, the block's `{`, or a `;` on the same line
  const re = new RegExp('(^|[\\n{;])[ \\t]*' + name.replace(/[-]/g, '\\-') + '[ \\t]*:[ \\t]*([^;]+);');
  const m = text.match(re);
  return m ? m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim() : null;
}
function readVar(block, name, cssAll) {
  let v = findVar(block, name);
  if (v == null) throw new Error(`var ${name} not found in block`);
  const ref = v.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (ref) { v = findVar(cssAll, ref[1]); if (v == null) throw new Error(`unresolved ${ref[1]}`); }
  return v;
}

/** Extract one app's rows from its token file per a `sources.json` entry. */
export function extractApp(app, ctx) {
  const abs = resolveLogical(app.file, ctx);
  if (!fs.existsSync(abs)) throw new Error(`${app.id}: token file missing: ${abs}`);
  const css = fs.readFileSync(abs, 'utf8').replace(/^﻿/, '').split('\r\n').join('\n');
  const out = { id: app.id, kind: 'shipped', product: app.id, source: { file: app.file, theme_default: app.theme_default ?? null },
    display_family: app.display_family ?? null, body_family: app.body_family ?? null, display: app.display ?? null, body: app.body ?? null };
  for (const theme of ['light', 'dark']) {
    const spec = app[theme];
    if (!spec) continue;
    const block = readBlock(css, spec.selector);
    const raw = {};
    for (const role of ['ground', 'ink', 'rule', 'accent']) if (spec[role]) raw[role] = readVar(block, spec[role], css);
    const groundRgb = raw.ground && /^#/.test(raw.ground) ? hexToRgb(raw.ground) : [1, 1, 1];
    out[theme] = {};
    for (const [role, v] of Object.entries(raw)) out[theme][role] = { css: v, ...toLCH(parseColor(v, groundRgb)) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// ledger io
// ---------------------------------------------------------------------------
const ledgerPath = (root) => path.join(root, 'ledger.json');
export function readLedger(root) {
  const p = ledgerPath(root);
  if (!fs.existsSync(p)) return { schema: 1, rows: [] };
  const j = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
  if (!Array.isArray(j.rows)) throw new Error(`${p}: no rows[]`);
  return j;
}
function writeLedger(root, ledger) {
  fs.writeFileSync(ledgerPath(root), JSON.stringify(ledger, null, 2) + '\n');
}

/** Upsert shipped rows (re-extracted at each /ship); variant rows are append-only. */
function upsertShipped(ledger, row, now) {
  const i = ledger.rows.findIndex((r) => r.kind === 'shipped' && r.id === row.id);
  const stamped = { ...row, recorded_at: now };
  if (i < 0) { ledger.rows.push(stamped); return 'added'; }
  const prev = ledger.rows[i];
  const same = JSON.stringify({ ...prev, recorded_at: null }) === JSON.stringify({ ...stamped, recorded_at: null });
  if (same) return 'unchanged';
  ledger.rows[i] = { ...stamped, previous: { recorded_at: prev.recorded_at, light: prev.light, dark: prev.dark } };
  return 'updated';
}

// ---------------------------------------------------------------------------
// render ledger.md
// ---------------------------------------------------------------------------
const f3 = (x) => (x == null ? '—' : x.toFixed(3));
const fh = (x) => (x == null ? '—' : `${Math.round(x)}°`);
const hueBin = (h) => (h == null ? 'achromatic' : `${Math.floor(h / 30) * 30}–${Math.floor(h / 30) * 30 + 30}°`);

export function renderLedger(ledger) {
  const rows = ledger.rows;
  const L = [];
  L.push('# Design ledger — GENERATED by `.agent/scripts/designs-ledger.mjs render`; do not hand-edit', '');
  L.push(`${rows.length} row(s): ${rows.filter((r) => r.kind === 'shipped').length} shipped app(s), ${rows.filter((r) => r.kind === 'variant').length} design-gate variant(s). Light-theme OKLCH (L / C / h). Bands: ground ΔE ≤ ${BANDS.ground.dE} or same hue ±${BANDS.ground.hue}°; ink ΔE ≤ ${BANDS.ink.dE}; accent hue ±${BANDS.accent.hue}°.`, '');
  L.push('| id | kind | ground L/C/h | ink L/C/h | accent L/C/h | display | body | theme | picked | source |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const c = (x) => (x ? `${f3(x.L)} / ${f3(x.C)} / ${fh(x.h)}` : '—');
    L.push(`| ${r.id} | ${r.kind} | ${c(r.light?.ground)} | ${c(r.light?.ink)} | ${c(r.light?.accent)} | ${r.display_family ?? '—'} | ${r.body_family ?? '—'} | ${r.source?.theme_default ?? '—'} | ${r.picked ?? '—'} | ${r.source?.file ?? r.product ?? '—'} |`);
  }
  // spent bands
  const bin = (get) => { const m = new Map(); for (const r of rows) { const k = get(r); if (k == null) continue; m.set(k, [...(m.get(k) ?? []), r.id]); } return [...m.entries()].sort((a, b) => b[1].length - a[1].length); };
  L.push('', '## Spent bands (what the next plan should NOT land in)', '');
  L.push('**Ground hue (light):** ' + bin((r) => r.light?.ground ? hueBin(r.light.ground.h) : null).map(([k, v]) => `${k} ×${v.length} (${v.join(', ')})`).join(' · '));
  L.push('', '**Accent hue (light):** ' + bin((r) => r.light?.accent ? hueBin(r.light.accent.h) : null).map(([k, v]) => `${k} ×${v.length} (${v.join(', ')})`).join(' · '));
  L.push('', '**Display family:** ' + bin((r) => r.display_family).map(([k, v]) => `${k} ×${v.length} (${v.join(', ')})`).join(' · '));
  L.push('', '**Theme default:** ' + bin((r) => r.source?.theme_default).map(([k, v]) => `${k} ×${v.length}`).join(' · '));
  // nearest neighbour per row (9-D light)
  L.push('', '## Nearest neighbour (light ground+ink+accent, ΔE_OK)', '');
  for (const r of rows) {
    if (!r.light?.ground) continue;
    const plan = { ground: r.light.ground, ink: r.light.ink, accent: r.light.accent, display_family: r.display_family };
    const res = checkPlan(plan, rows.filter((x) => x.id !== r.id));
    const n = res.nearest[0];
    L.push(`- **${r.id}** → ${n ? `${n.id} at ${n.distance}` : '—'}; leave-one-out verdict **${res.verdict}** (occupied: ${res.occupiedAxes.join(', ') || 'none'}${res.displayRepeats.length ? `; display repeats ${res.displayRepeats.join(', ')}` : ''})`);
  }
  L.push('', '> A leave-one-out FAIL on a shipped app is the measured convergence, not a defect in that app — it is the reason this ledger exists.', '');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v !== undefined && !v.startsWith('--')) { o[k] = v; i++; } else o[k] = true; }
    else o._.push(a);
  }
  return o;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verb = args._[0];
  const quiet = !!args.quiet, asJson = !!args.json;
  const say = (s) => { if (!quiet) console.log(s); };
  const now = new Date().toISOString();

  if (!verb || !['backfill', 'render', 'check', 'append', 'census'].includes(verb)) {
    console.error('usage: designs-ledger.mjs backfill|render|check|append|census [--designs <dir>] [--json] [--quiet]');
    process.exit(2);
  }
  const d = resolveDesignsRoot({ designs: args.designs });
  if (d.error) { console.error(`ERROR ${d.error}`); process.exit(2); }

  if (verb === 'backfill') {
    const srcPath = path.join(d.root, 'sources.json');
    if (!fs.existsSync(srcPath)) { console.error(`ERROR ${srcPath} missing — the backfill needs the alias map`); process.exit(2); }
    const sources = JSON.parse(fs.readFileSync(srcPath, 'utf8').replace(/^﻿/, ''));
    if (!Array.isArray(sources.apps) || sources.apps.length === 0) { console.error('ERROR sources.json declares no apps — an empty backfill would read as "nothing shipped"'); process.exit(2); }
    const ctx = resolveProductsRoot();
    if (ctx.error) { console.error(`ERROR ${ctx.error}`); process.exit(2); }
    const ledger = readLedger(d.root);
    const result = { added: [], updated: [], unchanged: [], failed: [] };
    for (const app of sources.apps) {
      try { result[upsertShipped(ledger, extractApp(app, ctx), now)].push(app.id); }
      catch (e) { result.failed.push({ id: app.id, error: e.message }); }
    }
    if (result.failed.length === sources.apps.length) { console.error(`ERROR every source failed to extract:\n${result.failed.map((x) => `  ${x.id}: ${x.error}`).join('\n')}`); process.exit(2); }
    ledger.schema = 1;
    ledger.bands = BANDS;
    writeLedger(d.root, ledger);
    fs.writeFileSync(path.join(d.root, 'ledger.md'), renderLedger(ledger));
    if (asJson) console.log(JSON.stringify({ root: d.root, ...result, rows: ledger.rows.length }, null, 2));
    else {
      say(`designs ledger: ${d.root}/ledger.json — ${ledger.rows.length} row(s); +${result.added.length} added, ${result.updated.length} updated, ${result.unchanged.length} unchanged${result.failed.length ? `, ${result.failed.length} FAILED` : ''}`);
      for (const x of result.failed) console.error(`  FAILED ${x.id}: ${x.error}`);
    }
    process.exit(result.failed.length ? 1 : 0);
  }

  if (verb === 'render') {
    const ledger = readLedger(d.root);
    fs.writeFileSync(path.join(d.root, 'ledger.md'), renderLedger(ledger));
    say(`rendered ${d.root}/ledger.md (${ledger.rows.length} rows)`);
    process.exit(0);
  }

  const planFrom = () => {
    const plan = {};
    for (const axis of ['ground', 'ink', 'accent']) {
      if (!args[axis] || args[axis] === true) { console.error(`ERROR --${axis} <css colour> is required`); process.exit(2); }
      try { plan[axis] = { css: args[axis], ...toLCH(parseColor(args[axis])) }; }
      catch (e) { console.error(`ERROR --${axis}: ${e.message}`); process.exit(2); }
    }
    if (args.display && args.display !== true) plan.display_family = String(args.display);
    if (args.body && args.body !== true) plan.body_family = String(args.body);
    return plan;
  };

  if (verb === 'census') {
    const c = censusOf(readCompositions(d.root));
    if (asJson) console.log(JSON.stringify(c, null, 2));
    else {
      say(`composition census: ${c.total} classified entries${c.total < COMPOSITION.floor ? ` (thin — below the ${COMPOSITION.floor} floor, check cannot fail)` : ''}`);
      for (const x of c.classes) say(`  ${x.composition.padEnd(12)} ${String(x.count).padStart(3)}  ${(x.share * 100).toFixed(0).padStart(3)}%${x.share > COMPOSITION.share ? '  OVER' : ''}${x.known ? '' : '  (not in the vocabulary)'}`);
    }
    process.exit(0);
  }

  if (verb === 'check') {
    const ledger = readLedger(d.root);
    if (ledger.rows.length === 0) { console.error('ERROR ledger has zero rows — run `backfill` first; a check against nothing cannot fail'); process.exit(2); }
    const plan = planFrom();
    const res = checkPlan(plan, ledger.rows);
    let comp = null;
    if (args.composition && args.composition !== true) {
      try { comp = checkComposition(String(args.composition), readCompositions(d.root)); }
      catch (e) { console.error(`ERROR --composition: ${e.message}`); process.exit(2); }
      plan.composition = comp.composition;
    }
    const verdict = res.verdict === 'FAIL' || (comp && comp.verdict === 'FAIL') ? 'FAIL' : 'PASS';
    if (asJson) console.log(JSON.stringify({ plan, ...res, composition: comp, verdict }, null, 2));
    else {
      say(`${verdict} — occupied axes: ${[...res.occupiedAxes, ...(comp && comp.verdict === 'FAIL' ? ['composition'] : [])].join(', ') || 'none'}; nearest: ${res.nearest.map((n) => `${n.id} (${n.distance})`).join(', ')}`);
      for (const [axis, hits] of Object.entries(res.axes)) for (const h of hits) say(`  ${axis}: ${h.id} — ${h.why}`);
      if (res.displayRepeats.length) say(`  WARN display family "${plan.display_family}" repeats ${res.displayRepeats.join(', ')} — say why no other face`);
      if (comp) say(`  composition: ${comp.why}${comp.thin ? ' (WARN)' : ''}`);
    }
    process.exit(verdict === 'FAIL' ? 1 : 0);
  }

  if (verb === 'append') {
    for (const k of ['id', 'product', 'variant', 'picked', 'reason']) if (!args[k] || args[k] === true) { console.error(`ERROR --${k} is required`); process.exit(2); }
    if (!['yes', 'no'].includes(args.picked)) { console.error('ERROR --picked must be yes|no'); process.exit(2); }
    const ledger = readLedger(d.root);
    if (ledger.rows.some((r) => r.id === args.id)) { console.error(`ERROR row "${args.id}" already exists — the ledger is append-only; use a new id (e.g. <product>/prd-NNN/v2@2)`); process.exit(2); }
    const plan = planFrom();
    const row = { id: args.id, kind: 'variant', product: args.product, variant: args.variant, picked: args.picked, reason: args.reason,
      display_family: plan.display_family ?? null, body_family: plan.body_family ?? null, recorded_at: now,
      light: { ground: plan.ground, ink: plan.ink, accent: plan.accent } };
    ledger.rows.push(row);
    writeLedger(d.root, ledger);
    fs.writeFileSync(path.join(d.root, 'ledger.md'), renderLedger(ledger));
    say(`appended ${args.id} (${args.picked === 'yes' ? 'picked' : 'rejected'}) — ${ledger.rows.length} rows`);
    process.exit(0);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
