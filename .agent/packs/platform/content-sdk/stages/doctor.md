---
name: doctor
intent: verification
writes:
  - products/<group>/<product-slug>/project-planning/plans/doctor-report-<date>.md (+ .json), or the directory given by out=
depends_on:
  - .agent/glossary.md
  - .agent/commands/project/product-workspace.md
  - .agent/packs/platform/content-sdk/agents/13-devops-engineer.md
  - .agent/agents/team/07-qa-specialist.md
  - .claude/skills/sitecoreai-health-check/SKILL.md
---

# /doctor — Read-only health check of a SitecoreAI environment, site or page

## Goal

Answer "is this site healthy?" with one prioritized report (P0-P3, finding → evidence → remediation) across the four instruments that each see one truth: Authoring (master), Edge live (published), the browser (what a visitor gets) and the Monitoring API (CM and editing-host logs). Glossary § "Doctor (health check)".

**On-demand, not a pipeline stage.** It holds no gate token, resolves no pack brief, writes no `stage_history`, and **never crosses `go_live`**: everything it does is a read. Remediation is always a separate command (`/create-bug`, `/probe`, `/publish`, a `tasks.md` entry). A `products/throwaway/` product may run it, because it does not write to the tenant.

## Inputs

Free-form `key=value` args, all optional:

| Arg | Meaning |
|---|---|
| `product=products/<group>/<slug>` | resolve the target from the run manifest `provisioning.*` (CM env id, site, delivery URL, `variables.delivery_visibility`) through `.agent/scripts/resolve-products-root.mjs` |
| `org=<label>` | credential label: `SITECORE_DEPLOY_<LABEL>_ADMIN_CLIENT_*` and `SITECORE_EDGE_<LABEL>_CLIENT_*` |
| `env=<cmEnvId>` | the CM environment (never an editing-host id) |
| `site=<siteName>` | site scope (default when given) |
| `url=<live delivery url>` | the delivery surface (Vercel production alias) |
| `scope=env\|site\|page`, `page=/route`, `lang=<code>` | scope selection (skill § Step 1) |
| `visibility=public\|private` | overrides the manifest value; private needs the access-gate cookie in `DOCTOR_GATE_COOKIE` |
| `checks=<ids or families>` | `binding ops eh delivery census graph crawl logs`, or ids such as `D2,D6` |
| `out=<dir>` | report directory (default: the product's `project-planning/plans/`, else the session scratchpad) |

With no product and no `env=`/`url=`, ask once for the target (env id + site, or a URL) and stop there.

## Agents

- **DevOps Engineer (13)** runs the instruments: one `Agent(subagent_type: "devops-engineer")` call that loads the `sitecoreai-health-check` skill and runs `scripts/doctor.mjs`. It operates the Deploy, Monitoring and Edge reads it already owns at `/provision-sitecoreai` and `/publish`.
- **QA Specialist (07)** arbitrates: a fresh `Agent(subagent_type: "qa-specialist")` reads the JSON report and confirms or adjusts severities and the `may_be_intentional` calls against the run's intent (for example, an unset editing secret on a delivery-only surface, or drafts under Components Preview). 07 never re-runs the instruments.
- The orchestrator holds paths only (rule `72`): it passes the report path between the two and reads back the ranked summary.

## Steps

1. **Resolve the target.** `product=` → read `provisioning.cm_environment_id`, the site name, `provisioning.delivery_surface.url` and `variables.delivery_visibility` from the manifest. Otherwise use the args. Pick the credential label from the estate the CM belongs to; never borrow another estate's client.
2. **State the plan (no stop).** Print the scope, the check families, the credential matrix the run will use (names, never values) and the expected cost (≈ 3 minutes and 260 calls for a ~50-route site with a 60-page crawl). This is information, not a gate: the run is read-only.
3. **Run (13).** Under Git Bash:
   ```sh
   MSYS_NO_PATHCONV=1 node .claude/skills/sitecoreai-health-check/scripts/doctor.mjs \
     --org <label> --env-file <repo>/.env --env <cmEnvId> --site <SiteName> --url <live-url> \
     [--visibility private] [--scope page --page /route] [--lang en,de-DE] [--checks ...] --out <out-dir>
   ```
   Pass `--lang` from `variables.languages` (default first) on a multi-language site: the census runs per language and W3 (missing language versions, orphan languages, live dictionary keys absent or equal to the key) checks exactly those; without `--lang`, W3 checks every environment and version language.
   Set `PLAYWRIGHT_MODULE` to an installed `playwright` package when the cwd has none; without it the crawl degrades to server HTML and says so. Exit 0 clean, 1 findings at P1+ or UNKNOWN, 2 harness error (X0 binding failed: stop and report the binding problem, nothing else is trustworthy).
4. **Arbitrate (07).** Severity review over the JSON: confirm each P0/P1, mark policy findings, and group findings sharing one root cause.
5. **Present.** Begin with the Operator Checkpoint block (glossary § "Operator Checkpoint"), then P0 first: one line per finding with its owner and the report path. List UNKNOWN and SKIPPED counts explicitly; they are not clean. If the report carries the **Do not republish** banner (reverse drift), say so first.
6. **Hand off.** The operator picks findings; each becomes a `/create-bug` (code), a `tasks.md` intake entry (content/ops), or a `/probe` when the finding is uncertain. `/doctor` itself changes nothing.

## Output rules

- Never paste raw log lines, header values or context ids into the conversation; quote the report, which is redacted.
- Use `--redact` for any copy that leaves the team (it masks hosts, env/org/project ids and the tenant name).
- A SKIPPED check is reported with its reason; never fold it into a pass.
