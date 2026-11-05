# Autonomous intake — trigger options (intake-pipeline T4)

Every trigger below is just a **front-end to the same engine**: it runs
`/triage --auto` on a cadence (or on an event), which reads a source (GitHub issues
or the local `tasks.md`), picks eligible items by policy, and — in `--execute` mode —
runs the full pipeline (`/create-* → /implement → /code-review → /test → /ship`) to a
reviewable PR. The triggers are **interchangeable**; pick by how/where you want it to run.

> **Safety default everywhere:** start **notify-only** (reports what it *would* pick up,
> routes nothing; silent on 0 eligible). Add `--execute` only once you trust the cadence.
> Bugs-first (`--types bug`, the only 0-gate type), one-at-a-time (`--max 1`), never
> auto-merge — the opened PR is always the human gate.

## At a glance

| # | Trigger | Unattended (no live session)? | Local context (gh auth, cloned repos, toolchain)? | Latency | Setup | Secrets |
|---|---------|:--:|:--:|---------|-------|---------|
| 1 | **OS Task Scheduler → local `claude`** | ✅ | ✅ | poll (cron) | small | none |
| 2 | **`CronCreate` / `/loop`** (in-session) | ❌ needs a live Claude REPL | ✅ | poll (cron) | **zero** | none |
| 3 | **Cloud routine** (`/schedule` → claude.ai) | ✅ | ❌ cloud env | poll (cron) | medium | **PAT** |
| 4 | **GitHub Action / webhook** | ✅ | ❌ CI env | **event (seconds)** | large | API key + token |

**Quick pick:**
- Runs while you're away, on this machine, no secrets → **#1 (Task Scheduler)** — recommended default.
- Just try the cadence, zero infra, while you work → **#2 (`CronCreate`)**.
- Must run when your machine is **off** → **#3 (cloud routine)**.
- Want pickup the **instant** an issue is filed → **#4 (GitHub Action)**.

---

## Option 1 — OS Task Scheduler → local `claude` (recommended default)

Windows Task Scheduler runs `scripts/triage-auto.ps1`, which self-locates to the repo
root and invokes `claude -p` headless with an instruction to **read + follow**
`.agent/commands/project/triage.md` with the args (headless `claude -p` does **not**
resolve slash commands — see **Gotchas** below).

**Pros:** truly unattended; reuses this machine's `gh`/git auth + cloned `products/` +
toolchain (zero secrets, zero env rebuild); the pipeline runs exactly as it does
interactively; runs/logs are local and inspectable (`storage/triage-auto-logs/`).
**Cons:** the machine must be on (and the task set to run whether or not you're logged in);
Windows-specific; one task per product/repo.

```powershell
$repo = "C:\path\to\your-clone"
Register-ScheduledTask -TaskName "triage-auto-my-product" `
  -Trigger (New-ScheduledTaskTrigger -Daily -At 7am) `
  -Action  (New-ScheduledTaskAction -Execute "powershell.exe" `
              -Argument "-NoProfile -File `"$repo\scripts\triage-auto.ps1`" -Source github -Repo <owner>/<repo> -Product my-product") `
  -Description "Autonomous intake (notify-only). Append -Execute to -Argument when ready."
# Run on demand: Start-ScheduledTask -TaskName "triage-auto-my-product"
# Remove:        Unregister-ScheduledTask -TaskName "triage-auto-my-product" -Confirm:$false
```
Manual run (any directory): `powershell.exe -NoProfile -File "<repo>\scripts\triage-auto.ps1" -Source github -Repo <owner/name> -Product <slug>` (add `-Execute` / `-DryRun`).

---

## Option 2 — `CronCreate` / `/loop` (in-session, zero setup)

A cron job inside the current Claude Code session re-runs the `/triage --auto` prompt.
Great for **dogfooding the cadence** with no infrastructure.

**Pros:** zero setup, zero secrets, full local context; in-memory and reversible;
cross-platform (any Claude session).
**Cons:** fires **only while a Claude REPL is running and idle** — close Claude and
nothing fires (so not truly unattended); recurring jobs **auto-expire after 7 days**;
`durable:true` survives restarts but still needs a session alive to fire.

Ask Claude (or it sets this up for you): *"CronCreate every hour: `/triage --auto --source github --repo <r> product=<slug>` (notify-only)."* Equivalent cron: `7 * * * *`.

---

## Option 3 — Cloud routine (`/schedule` → claude.ai, machine-independent)

A claude.ai "routine" (via the `/schedule` skill / `RemoteTrigger` API) runs the prompt
in the cloud on a cron schedule; results land on a claude.ai URL.

**Pros:** truly unattended **and machine-independent** — runs when your laptop is off;
managed in claude.ai (list/update/run).
**Cons:** the cloud env has **no local context** → you must provision a **PAT** (repo
scope) and the routine must **clone the repo + `npm install` per run** (slower, more
setup); interactively-authenticated tools/MCP may be absent; output is on claude.ai, not
your local logs; private-repo + any Sitecore/SDK creds must be supplied to the cloud.

Setup sketch: `/schedule` a routine whose prompt is *"clone <repo>, then **read and follow `.agent/commands/project/triage.md`** with args `--auto --execute --source github --repo <r> --types bug`"*, with a `GH_TOKEN` (PAT, repo scope) provided to the routine. (Same headless rule — instruct it to follow the command file, don't pass `/triage`.) Treat as the **cloud upgrade** once #1 is trusted.

---

## Option 4 — GitHub Action / webhook (event-driven, lowest latency)

A workflow fires on `issues` events and runs the pipeline headless in CI — pickup within
seconds of an issue being opened/labeled, instead of waiting for the next poll.

**Pros:** lowest latency (event-driven); native to the GitHub source; runs in GitHub's
infra; fully auditable in the Actions tab.
**Cons:** heaviest setup; only the **github** source (no local `tasks.md`); needs headless
Claude Code in CI with an **API key** + a **token**, a runner with node + the product
checkout, and CI env reconstruction per run; cost + maintenance.

Skeleton (**requires validation before use** — headless-Claude-in-CI auth is the open part):
```yaml
# .github/workflows/triage-auto.yml  (in the PRODUCT repo)
name: triage-auto
on:
  issues:
    types: [labeled]        # e.g. only when a `bug` label is added
jobs:
  triage:
    if: github.event.label.name == 'bug'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      # - install the Claude Code CLI + the agentic framework checkout here (TODO)
      - run: claude -p "Read and follow .agent/commands/project/triage.md with arguments: --auto --execute --source github --repo ${{ github.repository }} --types bug --max 1. Unattended; do not ask."
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GH_TOKEN }}   # repo scope: read issues, push, open PR, close issue
```

---

## Notes that apply to all options

- **Driver is shared** — improving `/triage --auto` (eligibility, de-dupe, guardrails)
  improves every trigger at once.
- **Source close-out** is handled by `/ship` (local entry → `## Closed`; github issue →
  closed), keyed on the manifest `intake` block `/triage` records — no matter which
  trigger fired.
- **Honesty** — Marketplace items ship `shipped_with_caveats` with deferred host-frame
  smoke (no tenant unattended); never a fabricated pass.

---

# Operating it day-to-day

## The trust rollout (do not skip stages)

1. **notify-only** *(where you start)* — it reports eligible items, routes/writes nothing.
   Watch a few cycles; confirm it surfaces the right things and stays silent on 0.
2. **execute, bugs only** — it runs the pipeline to a **PR**; you review + merge. Bugs only,
   because they have 0 operator gates (FRD/PRD would stall unattended).
3. **widen** — more `--types`, higher `--max`, more products/repos; or add a cloud trigger.

## Flip notify-only → execute

- **Task Scheduler:** re-register with `-Execute` appended to the action argument:
  ```powershell
  $repo = "C:\path\to\your-clone"
  $arg  = "-NoProfile -File `"$repo\scripts\triage-auto.ps1`" -Source github -Repo <owner>/<repo> -Product <slug> -Types bug -Execute"
  Register-ScheduledTask -TaskName "triage-auto-<slug>" -Force `
    -Action  (New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg) `
    -Trigger (New-ScheduledTaskTrigger -Daily -At "07:57")
  ```
- **CronCreate:** `CronDelete <id>`, then create a new job whose prompt includes `--execute`.
- **Manual:** add `-Execute` to the `triage-auto.ps1` call.

## What happens on an execute pickup

1. Routes the item via `/create-bug` → branch `bug-NNN`.
2. Runs `/implement → /code-review → /test → /ship` (green-before-push: suite + build).
3. Opens a **PR** — never merges (your review is the gate).
4. Closes out the source: github issue closed + PR-linked; local `tasks.md` entry → `## Closed`.
5. Marketplace items ship `shipped_with_caveats` (host-frame smoke deferred — no tenant unattended).

## Where to see what it did

- **Local log:** `storage/triage-auto-logs/triage-auto.log` (one line per run: timestamp · mode · args).
- **Desktop notification** when eligible > 0 (silent on 0 — check the log to confirm it fired).
- The **PR** (execute) + the closed issue / `## Closed` queue entry.
- Cloud routine (if added later): the claude.ai routine URL.

## Pause / stop / remove

| Trigger | Pause | Remove |
|---|---|---|
| Task Scheduler | `Disable-ScheduledTask -TaskName "triage-auto-<slug>"` | `Unregister-ScheduledTask -TaskName "triage-auto-<slug>" -Confirm:$false` |
| CronCreate | — | `CronDelete <id>` (also dies when the Claude session ends) |

## Add another product/repo

Register another task (or cron) with different `-Repo` / `-Product` / `-Source` — one per repo.

## Guardrails (always on, every trigger)

Bugs-first (0 gates) · one-at-a-time (`--max 1`) · **never auto-merge** (PR is the gate) ·
valves STOP + notify (can't-reproduce / not-contained — never guesses a fix) · honest
`shipped_with_caveats`.

# Gotchas & troubleshooting

- **Headless slash commands don't resolve.** `claude -p "/triage …"` → `Unknown command: /triage`
  (slash commands are a REPL feature). The script + every recipe here instruct claude to **read and
  follow the command file** with the args instead. If you hand-write an invocation, do the same.
- **`claude` not found in the task.** It must be on PATH for the task's user (it's at
  `%APPDATA%\npm\claude.ps1`). If the scheduled run can't find it, use the full path in the wrapper.
- **"Runs only when logged on."** A default-registered task runs while you're logged in. For
  run-while-logged-off, re-register with stored credentials (`-User` / `-Password`), or use the cloud
  routine (option 3) instead.
- **0 eligible → silence is correct.** notify-only stays quiet on 0 by design; the run still logged.
- **SessionEnd hook noise.** A nested headless run triggers your SessionEnd hook,
  which may error harmlessly (`|| true`). Ignore — it does not affect the triage result.
- **`no stdin data received in 3s` warning.** Harmless; the run proceeds without piped stdin.
