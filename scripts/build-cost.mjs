#!/usr/bin/env node
// build-cost.mjs — Per-product build ECONOMICS from Claude Code transcripts.
//
// Answers "what did building this product cost" in five dimensions, straight from the
// same transcript JSONL (main sessions + nested sub-agent
// transcripts under <session>/subagents/). Designed to run at /ship close so every build
// self-documents its economics — and re-runnable any time for a portfolio sweep.
//
// DIMENSIONS (per product):
//   tokens          input + cache-write(5m/1h) + cache-read + output, per model, summed
//                   across the root session AND every sub-agent transcript, DEDUPED BY
//                   message identity — the transcript writes one line per content block and
//                   repeats the same `usage` on each, so per-line summing inflated every
//                   figure by the turn's block count (measured 1.94x on one run: $5,644 -> $2,690).
//                   Corrected 2026-08-25; figures published before then are ~2x high.
//   API cost        those tokens priced at published per-token rates (RATES below), with
//                   the prompt-cache multipliers (read 0.1x, 5m-write 1.25x, 1h-write 2x).
//                   This is the metered-API-equivalent — accurate whether you pay per-token
//                   or (on a subscription) as the value the flat fee absorbed.
//   cache savings   the same tokens priced with NO caching (every read/write at full input)
//                   minus the actual — shows how much prompt caching saved.
//   engaged time    active work: sum of gaps between transcript events, each capped at 5min
//                   (strips idle). idle = calendar span - engaged.
//   operator        genuine human-typed turns (harness envelopes AND inter-agent teammate
//                   messages filtered out — see HARNESS) + a lower-bound hands-on estimate.
//
// ATTRIBUTION: a session is counted for this product if it references the product's
//   file path (`.../<slug>`) at least MIN_HITS times — immune to MEMORY.md brand
//   name-drops (which name the brand but never the path). For a single-product audit this
//   is "every session that substantially touched this product"; a session shared across two
//   products (e.g. component reuse) counts for both. That is the right scope for a per-build
//   /ship report; for a de-duplicated PORTFOLIO roll-up, dominant-bucket attribution is used
//   instead (not this script's job).
//
// WINDOWING (--since/--until): attribution still uses the WHOLE session's text (so a session
//   is credited to the right product), but tokens/time/turns are counted only from events
//   whose timestamp falls in [since, until). This isolates ONE pipeline run (e.g. a single
//   FRD) or ONE phase inside a run from the product-cumulative total — an event that starts
//   before the window and a straddling multi-day session both contribute only their in-window
//   slice. Dates are ISO (`2026-07-20` or `2026-07-20T08:00`).
//
// USAGE:
//   node scripts/build-cost.mjs --slug <product-folder>            # markdown block (default)
//   node scripts/build-cost.mjs --slug my-site --json               # machine-readable JSON
//   node scripts/build-cost.mjs --slug my-site --month-usd 90       # subscription context
//   node scripts/build-cost.mjs --slug my-site --since 2026-07-20 --until 2026-07-22   # one run
//   node scripts/build-cost.mjs --slug my-site --by-session         # per-session breakdown table
//   flags: --project <encoded-dir> | --cwd <path> (override transcript store),
//          --min-hits N (default 25), --sub-engaged-hpm N (subscription proration basis, default 160),
//          --since <iso> --until <iso> (event-level time window), --by-session (per-session rows)
//
// RATES are a cached snapshot — UPDATE when Anthropic pricing changes (see the note by RATES).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProductsRoot } from '../.agent/scripts/resolve-products-root.mjs';

// ---- published per-1M-token USD rates (snapshot: 2026-09-29) --------------------------
// Default: read = 0.1x input; 5m cache-write = 1.25x input; 1h cache-write = 2x input.
// Opus 5.5 and Fable 5.1 have cheaper cache reads (0.05x / 0.025x).
// UPDATE THIS TABLE when pricing changes; everything downstream derives from it.
const RATES = {
  'claude-fable-5-1':           { in: 10, out: 50, read: 0.25, w5: 12.5, w1: 20 },
  'claude-fable-5-1[1m]':       { in: 10, out: 50, read: 0.25, w5: 12.5, w1: 20 },
  'claude-opus-5-5':            { in: 4, out: 20, read: 0.2,  w5: 5,    w1: 8 },
  'claude-opus-5-5[1m]':        { in: 4, out: 20, read: 0.2,  w5: 5,    w1: 8 },
  'claude-sonnet-5-5':          { in: 2, out: 10, read: 0.2,  w5: 2.5,  w1: 4 },
  'claude-fable-5':             { in: 10, out: 50, read: 1,   w5: 12.5, w1: 20 },
  'claude-fable-5[1m]':         { in: 10, out: 50, read: 1,   w5: 12.5, w1: 20 },
  'claude-opus-5':              { in: 5, out: 25, read: 0.5,  w5: 6.25, w1: 10 },
  'claude-opus-5[1m]':          { in: 5, out: 25, read: 0.5,  w5: 6.25, w1: 10 },
  'claude-opus-4-8':            { in: 5, out: 25, read: 0.5,  w5: 6.25, w1: 10 },
  'claude-opus-4-7':            { in: 5, out: 25, read: 0.5,  w5: 6.25, w1: 10 },
  'claude-sonnet-5':            { in: 3, out: 15, read: 0.3,  w5: 3.75, w1: 6 },  // intro 2/10 through 2026-08-31
  'claude-sonnet-4-6':          { in: 3, out: 15, read: 0.3,  w5: 3.75, w1: 6 },
  'claude-haiku-4-5-20251001':  { in: 1, out: 5,  read: 0.1,  w5: 1.25, w1: 2 },
  'claude-haiku-4-5':           { in: 1, out: 5,  read: 0.1,  w5: 1.25, w1: 2 },
};
const rateFor = (m) => RATES[m] || null;

// ---- args -----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const getFlag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const has = (name) => argv.includes(name);
const slug = getFlag('--slug');
if (!slug) {
  console.error('usage: node scripts/build-cost.mjs --slug <product-folder> [--month-usd 90] [--json] [--min-hits 25] [--sub-engaged-hpm 160] [--since <iso>] [--until <iso>] [--by-session]');
  process.exit(1);
}
const monthUsd = Number(getFlag('--month-usd') || 90);
const minHits = Number(getFlag('--min-hits') || 25);
const subHpm = Number(getFlag('--sub-engaged-hpm') || 160);   // assumed engaged agent-hours per subscription month
const asJson = has('--json');
const bySession = has('--by-session');
const sinceRaw = getFlag('--since');
const untilRaw = getFlag('--until');
const sinceMs = sinceRaw ? Date.parse(sinceRaw) : -Infinity;
const untilMs = untilRaw ? Date.parse(untilRaw) : Infinity;
if (sinceRaw && Number.isNaN(sinceMs)) { console.error(`--since not a valid date: ${sinceRaw}`); process.exit(1); }
if (untilRaw && Number.isNaN(untilMs)) { console.error(`--until not a valid date: ${untilRaw}`); process.exit(1); }
const windowed = sinceRaw != null || untilRaw != null;
const inWindow = (ts) => ts >= sinceMs && ts < untilMs;

// ---- locate the transcript store --------------
const targetCwd = getFlag('--cwd') || process.cwd();
const encodeCwd = (p) => p.replace(/[\\/:.]/g, '-');
const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
const projectDir = path.join(projectsRoot, getFlag('--project') || encodeCwd(targetCwd));
if (!fs.existsSync(projectDir)) {
  console.error(`No transcript directory found at:\n  ${projectDir}`);
  if (fs.existsSync(projectsRoot)) {
    console.error('Available project transcript dirs:');
    for (const d of fs.readdirSync(projectsRoot)) console.error(`  ${d}`);
    console.error('\nRe-run with --project <one-of-the-above> or --cwd <project-path>.');
  }
  process.exit(1);
}

// ---- attribution + operator-turn detection --------------------------------------------
// DOMINANT-site attribution: a session counts for this product only if it is the MOST-
// referenced SITE path in that session. Prevents double-counting a session that reused
// another product's components (e.g. site A reused site B components -> site A sessions
// reference /site-b too, but /site-a dominates, so they count for site A only).
//
// Site folder names are enumerated from products/ on disk (robust to the Content SDK
// two-level layout products/head-application/<project>/<site> and to project names with
// spaces, which regex path-parsing can't handle). Each candidate is matched as a path
// segment `[/\\]<site>(?![\w-])`: `\b` would let /my-site match inside /my-site-campaigns.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PRODUCT_BUCKETS = new Set(['marketplace', 'personal', 'head-application', '_internal']);
const NOT_A_SITE = new Set(['cm', 'project-planning', 'node_modules']);   // universal subfolders, not sites
function listSiteFolders(productsRoot) {
  const out = new Set();
  if (!fs.existsSync(productsRoot)) return out;
  for (const bucket of fs.readdirSync(productsRoot, { withFileTypes: true })) {
    if (!bucket.isDirectory() || !PRODUCT_BUCKETS.has(bucket.name)) continue;   // skip _root, .claude, etc.
    const bpath = path.join(productsRoot, bucket.name);
    if (bucket.name === 'head-application') {
      for (const proj of fs.readdirSync(bpath, { withFileTypes: true })) {
        if (!proj.isDirectory()) continue;
        for (const app of fs.readdirSync(path.join(bpath, proj.name), { withFileTypes: true })) {
          if (app.isDirectory() && !NOT_A_SITE.has(app.name)) out.add(app.name);   // sibling head apps (not cm)
        }
      }
    } else {
      for (const p of fs.readdirSync(bpath, { withFileTypes: true })) if (p.isDirectory() && !NOT_A_SITE.has(p.name)) out.add(p.name);
    }
  }
  return out;
}
// products/ is a logical mount point (product-workspace.md § 1a) — never join it by hand.
const productsRootInfo = resolveProductsRoot({ repoRoot: targetCwd });
if (productsRootInfo.error) { console.error(`[ERROR] ${productsRootInfo.error}`); process.exit(1); }
const candidates = listSiteFolders(productsRootInfo.root);
candidates.add(slug);   // always include the target (works even if its folder was moved/removed)
const candRes = [...candidates].map((c) => [c, new RegExp(`[\\\\/]${escapeRe(c)}(?![\\w-])`, 'gi')]);
function dominantSite(texts) {
  const tally = {};
  for (const [c, re] of candRes) {
    let n = 0;
    for (const t of texts) n += (t.match(re) || []).length;
    if (n) tally[c] = n;
  }
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return { top: top ? top[0] : null, hits: tally[slug] || 0 };
}
// role:user entries that are NOT the operator typing (harness envelopes + inter-agent messages).
const HARNESS = /^\s*(<task-notification|<command-name|<command-message|<local-command|<bash-|<system-reminder|<user-prompt-submit|Caveat:|\[Request interrupted|\[The user|Another Claude session sent a message|Base directory for this skill|\[Image:|<teammate-message|The following is the result|<skill|This session is being continued from a previous conversation)/;
// Only the MAIN transcript holds operator turns: a sub-agent's role:user lines are its spawn
// prompt and coordinator messages, and isMeta marks injected skill/command bodies. Counting
// them read 62 turns for ~11 typed (one run's FRD, 2026-10-27).
function isHumanPrompt(o, isMain = true) {
  if (!isMain || o.isSidechain || o.isMeta || o.isCompactSummary) return false;
  if (o.type !== 'user' || !o.message) return false;
  const c = o.message.content;
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    if (c.every(b => b && b.type === 'tool_result')) return false;
    text = c.filter(b => b && b.type === 'text').map(b => b.text).join(' ');
  } else return false;
  text = text.trim();
  if (!text || HARNESS.test(text) || text.startsWith('<')) return false;
  return true;
}

// ---- cost math (defined up-front so per-session rows can price themselves) --------------
const cachedCost = (mods) => Object.entries(mods).reduce((c, [m, b]) => {
  const r = rateFor(m); return r ? c + (b.in * r.in + b.out * r.out + b.read * r.read + b.w5 * r.w5 + b.w1 * r.w1) / 1e6 : c;
}, 0);
const fullPriceCost = (mods) => Object.entries(mods).reduce((c, [m, b]) => {
  const r = rateFor(m); return r ? c + ((b.in + b.w5 + b.w1 + b.read) * r.in + b.out * r.out) / 1e6 : c;
}, 0);
const sonnet5Intro = (mods) => {   // savings if the intro rate (2/10) applied to sonnet-5
  const b = mods['claude-sonnet-5']; if (!b) return 0;
  const std = (b.in * 3 + b.out * 15 + b.read * 0.3 + b.w5 * 3.75 + b.w1 * 6) / 1e6;
  const intro = (b.in * 2 + b.out * 10 + b.read * 0.2 + b.w5 * 2.5 + b.w1 * 4) / 1e6;
  return std - intro;
};
const tokTot = (mods) => Object.values(mods).reduce((a, b) => a + b.in + b.out + b.read + b.w5 + b.w1, 0);
const outTot = (mods) => Object.values(mods).reduce((a, b) => a + b.out, 0);
function addTokens(dest, u, m) {
  const b = dest[m] || (dest[m] = { in: 0, out: 0, read: 0, w5: 0, w1: 0 });
  b.in += u.input_tokens || 0; b.out += u.output_tokens || 0; b.read += u.cache_read_input_tokens || 0;
  const cc = u.cache_creation || {};
  let w5 = cc.ephemeral_5m_input_tokens || 0, w1 = cc.ephemeral_1h_input_tokens || 0;
  const ccTot = u.cache_creation_input_tokens || 0;
  if (w5 + w1 === 0 && ccTot > 0) w1 = ccTot;   // fallback: unsplit cache-write -> treat as 1h
  b.w5 += w5; b.w1 += w1;
}
function mergeTokens(dest, src) { for (const [m, b] of Object.entries(src)) addTokens.call(null, dest, { input_tokens: b.in, output_tokens: b.out, cache_read_input_tokens: b.read, cache_creation: { ephemeral_5m_input_tokens: b.w5, ephemeral_1h_input_tokens: b.w1 } }, m); }

// ---- collect main-session transcripts + their sub-agent dirs ---------------------------
const mains = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
const ENG_CAP = 5 * 60 * 1000, OP_CAP = 10 * 60 * 1000;

const models = {};        // global model -> {in,out,read,w5,w1} (in-window)
const sessionRows = [];   // per-session summary (for --by-session)
let sessionsCounted = 0, hits = 0;
let first = Infinity, last = -Infinity, engMs = 0, opMs = 0, opTurns = 0;

for (const main of mains) {
  const sid = main.replace(/\.jsonl$/, '');
  const files = [path.join(projectDir, main)];
  const sub = path.join(projectDir, sid, 'subagents');
  if (fs.existsSync(sub)) for (const sf of fs.readdirSync(sub)) if (sf.endsWith('.jsonl')) files.push(path.join(sub, sf));

  // pass 1: is THIS site the dominant one in the session (and >= minHits)? (whole-session text)
  const texts = files.map(fp => { try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; } });
  const { top, hits: sessionHits } = dominantSite(texts);
  if (sessionHits < minHits || top !== slug) continue;  // must be the top-referenced site

  // pass 2: aggregate in-window tokens + timing for this attributed session
  const smodels = {};
  const events = [];
  // usage is a property of the MESSAGE, not of a content block. One API response is written
  // to the transcript as one line PER BLOCK (thinking, text, and one per tool_use), and every
  // one of those lines carries the SAME `message.usage` object. Summing per line therefore
  // multiplies a turn by its block count — measured 1.94x over this store (8.45B -> 4.35B),
  // which silently inflated every token, cost and cache figure this script has ever printed.
  // Dedup on message.id (the API's own message identity), falling back to requestId then uuid.
  // Session-scoped, not global: a message id repeating across two sessions was measured at
  // 1 of 64,418 (~0 tokens), so a global set would buy nothing and make --by-session rows
  // depend on scan order. Marked seen only when actually counted, so a turn whose blocks
  // straddle a --since/--until edge is still counted exactly once.
  const seenMsg = new Set();
  for (const [fi, t] of texts.entries()) for (const line of t.split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
    const tsOk = !Number.isNaN(ts) && inWindow(ts);
    const u = o.message && o.message.usage;
    // token entries: gate by window when a window is set (skip usage lacking a usable ts)
    if (u && (!windowed || tsOk)) {
      const mid = o.message.id || o.requestId || o.uuid;
      if (!mid || !seenMsg.has(mid)) {
        if (mid) seenMsg.add(mid);
        addTokens(smodels, u, o.message.model || '?');
      }
    }
    if (tsOk) events.push({ t: ts, human: isHumanPrompt(o, fi === 0) });
  }
  if (!events.length && tokTot(smodels) === 0) continue;  // nothing in-window -> not counted

  sessionsCounted++; hits += sessionHits;
  mergeTokens(models, smodels);

  events.sort((a, b) => a.t - b.t);
  let sEngMs = 0, sOpTurns = 0, lastNonHuman = null;
  for (let i = 0; i < events.length; i++) {
    if (i > 0) sEngMs += Math.min(events[i].t - events[i - 1].t, ENG_CAP);
    if (events[i].human) { sOpTurns++; if (lastNonHuman != null) opMs += Math.min(events[i].t - lastNonHuman, OP_CAP); }
    else lastNonHuman = events[i].t;
  }
  engMs += sEngMs; opTurns += sOpTurns;
  const sFrom = events.length ? events[0].t : NaN, sTo = events.length ? events[events.length - 1].t : NaN;
  if (events.length) { first = Math.min(first, sFrom); last = Math.max(last, sTo); }
  sessionRows.push({ sid: sid.slice(0, 8), from: sFrom, to: sTo, engagedH: sEngMs / 3.6e6, opTurns: sOpTurns, tokens: tokTot(smodels), out: outTot(smodels), cost: cachedCost(smodels) });
}

if (sessionsCounted === 0) {
  console.error(`No sessions found referencing "${slug}" (>= ${minHits} path hits)${windowed ? ' in the requested window' : ''} in ${projectDir}.`);
  process.exit(2);
}

// ---- cost math ------------------------------------------------------------------------
const totTok = tokTot(models);
const outTok = outTot(models);
const apiCost = cachedCost(models);
const noCache = fullPriceCost(models);
const introSave = sonnet5Intro(models);
const elapsedH = (last - first) / 3.6e6;
const engagedH = engMs / 3.6e6;
const idleH = Math.max(0, elapsedH - engagedH);
const operatorH = opMs / 3.6e6;
const subShare = engagedH * (monthUsd / subHpm);   // prorated subscription cost (assumption: subHpm engaged h/month)

// A model with no RATES row contributes $0 while its tokens still count. That must be LOUD in
// the headline, not a caveat below the table: a lower bound read as a total is the defect.
const unpricedModels = Object.entries(models)
  .filter(([m, b]) => !rateFor(m) && (b.in + b.out + b.read + b.w5 + b.w1) > 0)
  .map(([m, b]) => ({ model: m, tokens: b.in + b.out + b.read + b.w5 + b.w1 }));
if (unpricedModels.length) {
  console.error(`[WARN] build-cost: ${unpricedModels.length} unpriced model(s) — ${unpricedModels.map((u) => u.model).join(', ')} — counted at $0; the API cost is a LOWER BOUND. Add a RATES row.`);
}

const report = {
  slug, generatedAt: new Date(last).toISOString(), sessions: sessionsCounted, pathHits: hits,
  window: { from: new Date(first).toISOString(), to: new Date(last).toISOString(), elapsedDays: +(elapsedH / 24).toFixed(2),
    since: sinceRaw || null, until: untilRaw || null },
  timeHours: { engaged: +engagedH.toFixed(1), idle: +idleH.toFixed(0), operator: +operatorH.toFixed(1) },
  operatorTurns: opTurns,
  tokens: { total: totTok, output: outTok, byModel: models },
  costUsd: {
    api: +apiCost.toFixed(0),
    apiSonnet5Intro: introSave > 0.5 ? +(apiCost - introSave).toFixed(0) : null,
    fullPriceNoCache: +noCache.toFixed(0),
    cacheSavedUsd: +(noCache - apiCost).toFixed(0),
    cacheSavedPct: +((1 - apiCost / noCache) * 100).toFixed(0),
    subscriptionShare: +subShare.toFixed(0),
    subscriptionMonthUsd: monthUsd,
    // Non-empty ⇒ `api` is a floor, not a total.
    unpricedModels,
    apiIsLowerBound: unpricedModels.length > 0,
  },
};
if (bySession) report.bySession = sessionRows.sort((a, b) => a.from - b.from).map(s => ({ ...s, from: new Date(s.from).toISOString(), to: new Date(s.to).toISOString(), engagedH: +s.engagedH.toFixed(1), cost: +s.cost.toFixed(0) }));

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

// ---- markdown block (paste into ship report + STATUS.md) ------------------------------
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const B = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + ' B' : (n / 1e6).toFixed(0) + ' M';
const modelLine = Object.entries(models).filter(([m]) => rateFor(m)).sort((a, b) => cachedCost({ [b[0]]: b[1] }) - cachedCost({ [a[0]]: a[1] }))
  .map(([m, b]) => `${m} ${usd(cachedCost({ [m]: b }))}`).join(' · ');
const windowNote = windowed ? ` · window ${sinceRaw || '(start)'} → ${untilRaw || '(end)'}` : '';

// ---- accuracy caveats -----------------------------------------------------------------
// Two ways this report can silently understate spend. Both are emitted as visible caveats
// rather than swallowed, because a $0 line reads as "cheap", not as "unmeasured".
const caveats = [];
// (1) A model with no RATES row contributes 0 to every cost figure while still counting
//     tokens (cachedCost/fullPriceCost skip it, modelLine filters it out). Add the row.
const unpriced = Object.entries(models).filter(([m, b]) => !rateFor(m) && (b.in + b.out + b.read + b.w5 + b.w1) > 0);
if (unpriced.length) {
  caveats.push(`**Unpriced model(s) excluded from cost:** ${unpriced.map(([m]) => `\`${m}\``).join(', ')} — tokens counted, cost shown as $0. Add a \`RATES\` row in \`scripts/build-cost.mjs\`.`);
}
// (2) Measured 2026-07-31: on claude-fable-5,
//     usage.output_tokens under-reports tool_use-heavy assistant messages by ~32x — a
//     29,014-char Write was recorded as 3 output tokens. The generated content IS in the
//     transcript; only the accounting is wrong, so this cannot be corrected from here.
const fableTok = Object.entries(models).filter(([m]) => m.startsWith('claude-fable-')).reduce((t, [, b]) => t + b.out, 0);
if (fableTok > 0) {
  caveats.push('**Fable output tokens under-report.** `usage.output_tokens` on `claude-fable-*` undercounts tool-call messages (~32x observed). Output cost below is a **floor**, not an estimate.');
}

const tick = '`';
const apiHeadline = unpricedModels.length
  ? `**≥ ${usd(apiCost)}** — **LOWER BOUND: excludes unpriced ${unpricedModels.map((u) => `${tick}${u.model}${tick} (${B(u.tokens)} tokens)`).join(', ')}**`
  : `**${usd(apiCost)}**`;

const out = `### Build economics (auto-generated — \`scripts/build-cost.mjs --slug ${slug}\`)

_${sessionsCounted} session(s) · ${report.window.from.slice(0, 10)} → ${report.window.to.slice(0, 10)} (${report.window.elapsedDays} days)${windowNote} · generated from Claude Code transcripts_

| Dimension | Value |
|---|---|
| Elapsed (calendar) | ${report.window.elapsedDays} days |
| Engaged agent time | ${report.timeHours.engaged} h |
| Idle (nights / laptop-off / waiting) | ~${report.timeHours.idle} h |
| Operator turns (human) | ${opTurns} |
| Operator time (est., lower bound) | ~${report.timeHours.operator} h |
| Total tokens (≈96% cache reads) | ${B(totTok)} |
| Output (generated) tokens | ${B(outTok)} |
| **API-equivalent cost** | ${apiHeadline}${introSave > 0.5 ? ` (${usd(apiCost - introSave)} at Sonnet-5 intro)` : ''} |
| — at full price if no caching | ${usd(noCache)} → **caching saved ${usd(noCache - apiCost)} (${report.costUsd.cacheSavedPct}%)** |
| Subscription share (@ ${usd(monthUsd)}/mo ÷ ${subHpm} eng-h/mo) | ~${usd(subShare)} |

Per-model API cost: ${modelLine}${bySession ? `

| Session | From | To | Eng h | Turns | Tokens | Out | API $ |
|---|---|---|---|---|---|---|---|
${report.bySession.map(s => `| ${s.sid} | ${s.from.slice(0, 16).replace('T', ' ')} | ${s.to.slice(0, 16).replace('T', ' ')} | ${s.engagedH} | ${s.opTurns} | ${B(s.tokens)} | ${B(s.out)} | ${usd(s.cost)} |`).join('\n')}` : ''}

${caveats.length ? `\n> ⚠️ ${caveats.join('\n>\n> ⚠️ ')}\n` : ''}
<sub>API cost = metered-equivalent at published rates (Opus 5.5 \$4/\$20, Sonnet 5.5 \$2/\$10, Fable 5.1 \$10/\$50; 1h-write 2× / 5m-write 1.25×; rate snapshot 2026-09-29 — update in \`scripts/build-cost.mjs\` on pricing changes). On a flat subscription the marginal metered cost is \$0; "subscription share" is a prorated estimate (adjust \`--sub-engaged-hpm\`). Operator time is a lower bound (compose/approve gaps only, not watching).${windowed ? ' Windowed: attribution uses the whole session; tokens/time/turns count only events in [since, until).' : ''} Attribution: sessions where \`${slug}\` is the dominant (most-referenced) product, ≥ ${minHits} path hits — a session shared with another product is assigned to whichever it worked on most.</sub>`;

console.log(out);
