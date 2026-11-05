#!/usr/bin/env node
/**
 * check-agent-tool-reality.mjs — an agent may not declare a tool it cannot hold.
 *
 *   node .agent/scripts/check-agent-tool-reality.mjs [--json] [--quiet]
 *
 * Pure Node, no deps, no network. Imported by validate-framework.mjs, so the pre-commit hook gates
 * on it.
 *
 * WHY THIS EXISTS (2026-09-04). A structural dogfood run proved THREE separate tools absent at
 * runtime inside a spawned subagent — each by CALLING it, not by reading a list:
 *
 *   AskUserQuestion  "No such tool available: AskUserQuestion. AskUserQuestion is not available
 *                     inside subagents." — categorical, not a per-agent grant.
 *   Bash / diff      the spawned reviewer could not run `diff`/`cksum`, so `/challenge-prd` step 9's
 *                    "prove the extraction" was unenforceable from inside it. A COMPLIANT agent
 *                    would have written "verified verbatim" from a read.
 *   Playwright       absent from the roster for the spawned designer, a probe agent AND the
 *                    orchestrator — so the server was not connected at all. NOT proven
 *                    subagent-specific (see the entry's evidence note; the first draft overclaimed
 *                    that and was corrected). The consequence holds either way: the ONE measurement
 *                    `ui-design.template.md:77` names by name — computed contrast ratios — did not
 *                    happen, and NOTHING DETECTED THAT IT DID NOT HAPPEN.
 *
 * The framework already knew the general shape: seven stage commands carry "frontmatter `tools:` is
 * intent, not a runtime guarantee — check, don't assume." Knowing it did not prevent it, because a
 * warning in prose cannot gate a declaration. That is the point of this file.
 *
 * THE DISTINCTION THAT MATTERS IS THE RELAY, NOT THE TOOL.
 * `AskUserQuestion` is unavailable AND has a documented fallback: the orchestrator relays the
 * question. The capability survives; only its channel changes. Playwright has NO fallback — there
 * is no relay for "take a screenshot" — so a stage depending on it has a hole, not a detour.
 *
 *   relay present → WARN. Declaring it is misleading; the work still gets done.
 *   relay absent  → ERROR. The stage's contract names a measurement nothing can produce.
 *
 * Exit codes: 0 clean · 1 an ERROR finding · 2 usage/IO.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');

/**
 * Tools PROVEN unavailable inside a spawned subagent, with how each was proven.
 *
 * Add an entry only after CALLING the tool and capturing the error — never from an assumption that
 * it "probably isn't there". A wrong entry here disables a real capability across the roster.
 */
export const UNAVAILABLE_IN_SUBAGENT = {
  AskUserQuestion: {
    proven_on: '2026-09-03',
    evidence: 'Called with a real question by the spawned Product Manager: "No such tool available: AskUserQuestion. AskUserQuestion is not available inside subagents."',
    relay: '.agent/commands/project/interrogation-protocol.md',
    relay_note: 'The orchestrator relays the question and returns the answer verbatim. The capability survives; only the channel changes.',
  },
  'mcp__plugin_playwright_playwright__': {
    proven_on: '2026-09-04',
    // EVIDENCE DISCIPLINE — this entry says LESS than the first draft did, on purpose.
    //
    // The draft claimed Playwright is "not available inside subagents", copying AskUserQuestion's
    // categorical wording. That was NOT measured. What was measured: it is absent from the runtime
    // roster for the spawned UI Designer, for a probe agent, AND for the orchestrator — so the MCP
    // server is not connected in this session AT ALL, which is a different fact with a different
    // fix. Shipping the stronger claim would have been a false proof of exactly the kind this
    // session already committed once (an estate claim resting on a non-discriminator).
    evidence: 'Absent from the runtime roster for a spawned UI Designer, a spawned probe agent, and the ORCHESTRATOR alike — i.e. the MCP server is not connected in this session. NOT proven to be subagent-specific. Consequence measured either way: the designer could not produce the computed contrast ratios ui-design.template.md:77 requires by name, and nothing detected the absence.',
    relay: null,
    relay_note: 'THERE IS NO RELAY FOR A SCREENSHOT, and — the sharper half — NO AVAILABILITY CHECK EITHER. A stage whose contract names rendered geometry as a mandatory measurement will silently not perform it whenever the server is absent, and a compliant agent reports the stage complete. Either the stage asserts the tool before promising the measurement, or the contract stops naming it.',
  },
};

const AGENT_DIRS = ['.agent/agents/team', '.agent/agents'];

export function agentFiles(root = REPO_ROOT) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 2 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith('.md') && e.name !== 'README.md') out.push(p);
    }
  };
  // Pack-owned agents live one level deep by kind — a flat scan finds nothing and reports clean.
  for (const d of AGENT_DIRS) walk(path.join(root, d), 0);
  for (const kind of ['platform', 'method', 'audience']) {
    const base = path.join(root, '.agent', 'packs', kind);
    if (!fs.existsSync(base)) continue;
    for (const pack of fs.readdirSync(base)) walk(path.join(base, pack, 'agents'), 1);
  }
  return [...new Set(out)].sort();
}

/** The `tools:` line from an agent's frontmatter, as a list. */
export function declaredTools(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const line = fm[1].split(/\r?\n/).find((l) => /^tools:\s*/.test(l));
  if (!line) return null;
  return line.replace(/^tools:\s*/, '').split(',').map((t) => t.trim()).filter(Boolean);
}

export function check({ root = REPO_ROOT } = {}) {
  const findings = [];
  const files = agentFiles(root);

  // Floor: an empty roster must not read as clean.
  if (files.length < 5) {
    findings.push({ severity: 'ERROR', file: null, message: `only ${files.length} agent file(s) discovered — discovery is broken, so this result is meaningless rather than clean.` });
  }

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const tools = declaredTools(file);
    if (!tools) continue;
    for (const [needle, info] of Object.entries(UNAVAILABLE_IN_SUBAGENT)) {
      const hit = tools.find((t) => t === needle || t.startsWith(needle));
      if (!hit) continue;
      const severity = info.relay ? 'WARN' : 'ERROR';
      findings.push({
        severity,
        file: rel,
        tool: hit,
        message: info.relay
          ? `declares "${hit}", which does NOT exist inside a spawned subagent (proven ${info.proven_on}). A relay exists (${info.relay}) so the capability survives — but the declaration is misleading and an agent may plan around a channel it cannot use.`
          : `declares "${hit}", which does NOT exist inside a spawned subagent (proven ${info.proven_on}) and has NO relay. ${info.relay_note} Remove the declaration and move the measurement to the orchestrator, or stop the contract naming it.`,
      });
    }
  }
  return { files: files.length, findings };
}

/**
 * Second axis — a COMMAND may not mandate a tool its routed agent does not hold.
 *
 * The first axis catches an agent DECLARING a tool it cannot hold. This catches the inverse:
 * a command's prose instructing the agent to make a tool call the agent never declared — the
 * instruction is unexecutable and the stage closes green having silently skipped the step.
 * Found 2026-09-07 (dogfood F-3): `/create-prd` told agent 02 to make an `Agent` call it
 * cannot make, while `/rubber-ducky` four sections away already carried the correct relay
 * parenthetical for agent 01. Prose cannot gate a declaration; this can.
 *
 * A mandate is fine when the surrounding text names a RELAY — "whoever holds the tool",
 * "the orchestrator", "relayed" — because then the capability survives and only the channel
 * changes. The relay marker must sit within RELAY_WINDOW characters BEFORE the mandate.
 */
// Deliberately NARROW. A first draft matched every `Agent` mandate in every command and
// produced 25 findings, 24 of them false: `commands[k].agents` names who a command SPAWNS,
// not who EXECUTES it — the orchestrator runs `/research` and holds `Agent`, so a mandate
// there is fine. The proven defect is specifically prose that is loaded INTO a spawned
// agent's own context (the "inline research delegation" section of a spec command) telling
// THAT agent to spawn the research sidecar. Match that shape only; a broad pattern here is
// the "gate that cries wolf" the authorability audit already had to be cured of.
export const MANDATE_PATTERNS = [
  { tool: 'Agent', re: /`Agent`\s+tool\s+call\s+with\s+`subagent_type:\s*"research-sidecar"`/gi },
  { tool: 'Agent', re: /`Agent\(subagent_type:\s*"research-sidecar"/g },
];
// Only commands whose single routed agent is a spec-stage agent that delegates INLINE to 03.
// Orchestrated commands (several agents, or the orchestrator itself) are out of scope.
export const INLINE_DELEGATORS = new Set(['01', '02', '04']);
export const RELAY_MARKERS = /whoever holds|orchestrator|relay/i;
export const RELAY_WINDOW = 220;

function readFlows(root) {
  const f = path.join(root, '.agent', 'flows.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
}

export function checkCommandMandates({ root = REPO_ROOT } = {}) {
  const findings = [];
  const flows = readFlows(root);
  if (!flows || !flows.commands || !flows.agent_registry) {
    findings.push({ severity: 'ERROR', file: '.agent/flows.json', message: 'flows.json has no commands/agent_registry — the command→agent walk cannot run, so this result is meaningless rather than clean.' });
    return { commands: 0, findings };
  }
  let scanned = 0;
  for (const [name, cmd] of Object.entries(flows.commands)) {
    const agents = Array.isArray(cmd.agents) ? cmd.agents : [];
    if (!agents.length || !cmd.file) continue;
    // in scope only when the command's whole body IS one inline-delegating agent's context
    if (agents.length !== 1 || !INLINE_DELEGATORS.has(agents[0])) continue;
    const cmdFile = path.join(root, '.agent', cmd.file);
    if (!fs.existsSync(cmdFile)) continue;
    scanned++;
    // union of tools across every agent the command routes to
    const held = new Set();
    for (const id of agents) {
      const reg = flows.agent_registry[id];
      if (!reg || !reg.file) continue;
      const tools = declaredTools(path.join(root, '.agent', reg.file)) || [];
      for (const t of tools) held.add(t);
    }
    const body = fs.readFileSync(cmdFile, 'utf8');
    for (const { tool, re } of MANDATE_PATTERNS) {
      if (held.has(tool)) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(body))) {
        const before = body.slice(Math.max(0, m.index - RELAY_WINDOW), m.index);
        if (RELAY_MARKERS.test(before)) continue; // a stated relay: the capability survives
        const line = body.slice(0, m.index).split(/\r?\n/).length;
        findings.push({
          severity: 'ERROR',
          file: `.agent/${cmd.file}:${line}`,
          tool,
          message: `command "${name}" mandates a \`${tool}\` call, but none of its agents [${agents.join(', ')}] declares \`${tool}\` and no relay is stated within ${RELAY_WINDOW} chars. The instruction is unexecutable; the stage will close green having skipped it. Either name the relay ("for whoever holds the \`${tool}\` tool — normally the orchestrator") or route the step to an agent that holds it.`,
        });
      }
    }
  }
  if (scanned < 2) {
    findings.push({ severity: 'ERROR', file: '.agent/flows.json', message: `only ${scanned} inline-delegating command(s) walked — discovery is broken, so this result is meaningless rather than clean.` });
  }
  return { commands: scanned, findings };
}

function main(argv) {
  const a = check();
  const c = checkCommandMandates();
  const r = { files: a.files, commands: c.commands, findings: [...a.findings, ...c.findings] };
  const errs = r.findings.filter((f) => f.severity === 'ERROR');
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...r, ok: errs.length === 0 }, null, 2));
    process.exit(errs.length ? 1 : 0);
  }
  if (!argv.includes('--quiet') || errs.length) {
    console.log(`agent-tool reality: ${r.files} agent files, ${r.commands} routed commands scanned`);
    for (const f of r.findings) console.log(`  ${f.severity === 'ERROR' ? 'x' : '!'} [${f.severity}] ${f.file}: ${f.message}`);
    if (!r.findings.length) console.log('ok — no agent declares a tool proven absent in a subagent, and no command mandates a tool its agent lacks.');
  }
  process.exit(errs.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
