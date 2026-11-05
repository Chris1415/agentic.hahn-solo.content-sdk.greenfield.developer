#!/usr/bin/env node
/**
 * check-contract-vocabulary.mjs — does the framework PRESCRIBE a value its own contract forbids?
 *
 *   node .agent/scripts/check-contract-vocabulary.mjs [--json] [--quiet]
 *
 * WHY THIS EXISTS.
 *
 * On 2026-09-02 a read of 16 Content SDK run manifests found 11 of them carrying an illegal
 * `stage_history.outcome`. The obvious reading — agents being sloppy — was wrong. The most
 * common offender, `confirmed` / `confirmed_with_changes`, was PRESCRIBED verbatim by
 * `02-create-prd.md` for the `discovery_summary` entry, while `manifests/README.md` never
 * permitted it. Every PRD run violated the enum *while correctly following its command*.
 *
 * A gate over the manifests catches that eventually, one corrupted run at a time. This catches
 * it in the file that causes it, before any run exists — which is the only place the cost is
 * near zero. `04-architect.md` was carrying the identical defect (`outcome: "split" | "bundled"`
 * on an `adr_density_check` entry) and this script found it on its first execution.
 *
 * THE HARD PART IS CONTEXT, NOT MATCHING.
 *
 * Three different manifest fields are spelled `stage`, and two are spelled `outcome`:
 *
 *   stage_history[].stage          canonical stage vocabulary  (implemented, code_reviewed, …)
 *   operator_attention[].stage     COMMAND name                (create-prd, ship, author-content)
 *   notes.gates.<g>[].stage        COMMAND name                (same convention as above)
 *   stage_history[].outcome        completed|failed|skipped|superseded|partial
 *   smoke_outcomes.<k>.outcome     pending|passed|failed|skipped
 *
 * So a naive scan flags `stage: "ship"` and `outcome: "pending"` — both correct — and would be
 * abandoned within a day. Every match is classified by the field it belongs to, and anything
 * that cannot be classified is reported as UNCLASSIFIED rather than guessed either way: a
 * checker that silently picks a vocabulary is how false confidence gets built.
 *
 * Enums are IMPORTED from assert-manifest-pointers.mjs, never restated. A second copy of an
 * enum is the very drift this script exists to detect.
 *
 * Read-only. No network. Exit 1 on any ERROR, 0 otherwise.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_STAGES, STAGE_ALIASES, LEGAL_OUTCOMES, OUTCOME_ALIASES } from './assert-manifest-pointers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const AGENT = join(REPO, '.agent');

/** `smoke_outcomes` has its own vocabulary — see manifests/README.md § "Smoke outcomes". */
const SMOKE_OUTCOMES = new Set(['pending', 'passed', 'failed', 'skipped', 'blocked']);

/**
 * Files whose job is to DESCRIBE the vocabulary (including the retired spellings) rather than to
 * prescribe it. Same ratchet shape as the `platform_target` budget: prose ABOUT a retirement
 * legitimately names the retired value, and a flat zero-references rule fails the documentation
 * that explains the rule. Keep this list SHORT and reasoned — every entry is a blind spot.
 */
const DESCRIPTIVE_FILES = new Set([
  '.agent/manifests/README.md',          // defines both enums; quotes the illegal values it retired
]);

/** Explicit, reasoned allowances. `reason` is mandatory — a blank one is rejected. */
const ALLOWANCES = [
  // (empty — added only with a stated reason, never to silence a real finding)
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'goldens'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * Which manifest field does this match belong to?
 *
 * Decided from the matched line first, then a small preceding window — these prescriptions are
 * written as single-line JSON-ish snippets ("Append a `stage_history` entry `{ stage: …`"), so the
 * marker is almost always on the line itself. Nearest marker on the line wins; `stage_history`
 * beats the others when several appear, because that is the restrictive vocabulary and a wrong
 * guess in that direction produces a visible false positive rather than a silent miss.
 */
function classify(line, prev) {
  const hay = line + '\n' + prev;
  if (/stage_history/.test(line)) return 'stage_history';
  if (/smoke_outcomes/.test(line)) return 'smoke_outcomes';
  if (/operator_attention|notes\.gates|Operator Checkpoint/.test(line)) return 'command_scoped';
  if (/stage_history/.test(hay)) return 'stage_history';
  if (/smoke_outcomes/.test(hay)) return 'smoke_outcomes';
  if (/operator_attention|notes\.gates/.test(hay)) return 'command_scoped';
  return null;
}

export function check({ repo = REPO, agentDir = AGENT, floors = true } = {}) {
  const findings = [];
  const add = (level, code, file, line, msg) => findings.push({ level, code, file, line, msg });
  let scanned = 0, matches = 0;

  for (const abs of walk(agentDir)) {
    const rel = relative(repo, abs).replace(/\\/g, '/');
    if (DESCRIPTIVE_FILES.has(rel)) continue;
    scanned++;
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);

    for (const [i, line] of lines.entries()) {
      const prev = lines.slice(Math.max(0, i - 3), i).join('\n');
      const at = i + 1;
      const allowed = (code, value) =>
        ALLOWANCES.some((a) => a.file === rel && a.line === at && a.code === code && a.value === value && a.reason?.trim());

      // ── outcome: "x"  (including alternation: outcome: "a" | "b") ──────────
      for (const m of line.matchAll(/outcome"?\s*:\s*((?:"[a-z_-]+"\s*\|?\s*)+)/gi)) {
        const values = [...m[1].matchAll(/"([a-z_-]+)"/gi)].map((v) => v[1]);
        const ctx = classify(line, prev);
        matches++;
        for (const v of values) {
          if (allowed('outcome', v)) continue;
          if (ctx === 'stage_history') {
            if (LEGAL_OUTCOMES.has(v)) continue;
            const canon = OUTCOME_ALIASES[v];
            add('ERROR', 'illegal-outcome', rel, at,
              `prescribes stage_history outcome "${v}", which the enum forbids` +
              (canon ? ` — use "${canon}" and put the nuance in one_line.` : '.') +
              ` A command that prescribes an illegal value makes every run that obeys it non-conformant.`);
          } else if (ctx === 'smoke_outcomes') {
            if (SMOKE_OUTCOMES.has(v)) continue;
            add('ERROR', 'illegal-outcome', rel, at,
              `prescribes smoke_outcomes outcome "${v}" (legal: ${[...SMOKE_OUTCOMES].join(' | ')}).`);
          } else if (!LEGAL_OUTCOMES.has(v) && !SMOKE_OUTCOMES.has(v)) {
            // Illegal under BOTH vocabularies — the classification does not matter.
            add('ERROR', 'illegal-outcome', rel, at,
              `prescribes outcome "${v}", which is illegal under both the stage_history and smoke_outcomes vocabularies.`);
          } else {
            add('WARN', 'unclassified', rel, at,
              `outcome "${v}" could not be tied to a field (no stage_history / smoke_outcomes marker nearby) — ` +
              `legal somewhere, so not failed; name the field on the line to make it checkable.`);
          }
        }
      }

      // ── stage: "x" ─────────────────────────────────────────────────────────
      for (const m of line.matchAll(/stage"?\s*:\s*"([a-z_-]+)"/gi)) {
        const v = m[1];
        const ctx = classify(line, prev);
        matches++;
        if (allowed('stage', v)) continue;
        if (ctx === 'stage_history') {
          if (CANONICAL_STAGES.has(v)) continue;
          const canon = STAGE_ALIASES[v];
          add('ERROR', 'illegal-stage', rel, at,
            `prescribes stage_history stage "${v}"` +
            (canon ? ` — the canonical name is "${canon}".` : `, which no canonical vocabulary contains.`) +
            ` Prescribe the name at the stage that writes it, or use a canonical one.`);
        } else if (ctx === 'command_scoped') {
          // operator_attention.stage / notes.gates[].stage are COMMAND names by contract.
          continue;
        } else if (!CANONICAL_STAGES.has(v) && !STAGE_ALIASES[v]) {
          add('WARN', 'unclassified', rel, at,
            `stage "${v}" could not be tied to a field and is not a known stage or command name.`);
        }
      }
    }
  }

  // Floor — an empty corpus, a broken walk or a regex that matches nothing must NOT read as clean.
  // Disabled only for fixture runs, which are deliberately tiny; the suite asserts the floors
  // separately against an empty tree, or "floors exist" would itself be an untested claim.
  if (floors) {
    if (scanned < 20) add('ERROR', 'floor', '-', 0, `only ${scanned} markdown file(s) scanned under .agent/ — the walk is broken.`);
    if (matches < 30) add('ERROR', 'floor', '-', 0, `only ${matches} vocabulary prescription(s) matched — the patterns are broken.`);
  }

  return { findings, scanned, matches };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1]?.replace(/\\/g, '/').endsWith('check-contract-vocabulary.mjs')) {
  const asJson = process.argv.includes('--json');
  const quiet = process.argv.includes('--quiet');
  const { findings, scanned, matches } = check();
  const errors = findings.filter((f) => f.level === 'ERROR');

  if (asJson) {
    console.log(JSON.stringify({ scanned, matches, findings, ok: !errors.length }, null, 2));
  } else if (!quiet || errors.length) {
    for (const f of findings) console.log(`  ${f.level}  [${f.code}] ${f.file}:${f.line} — ${f.msg}`);
    console.log(`\n  contract vocabulary: ${scanned} file(s), ${matches} prescription(s), ${errors.length} error(s), ${findings.length - errors.length} warning(s)`);
  }
  process.exit(errors.length ? 1 : 0);
}
