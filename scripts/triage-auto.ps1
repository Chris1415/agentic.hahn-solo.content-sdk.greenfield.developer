# triage-auto.ps1 — local autonomous intake trigger (intake-pipeline T4, local-first).
#
# A scheduler (Windows Task Scheduler) invokes this on a cadence; it runs `/triage --auto`
# headless via the Claude Code CLI, reusing THIS machine's gh/git auth, cloned product
# repos, and toolchain. (The T4 probe confirmed those are local-machine-bound — a cloud
# trigger would instead need a PAT + full environment reconstruction.)
#
# CONTEXT — important: Claude Code resolves the agentic framework (CLAUDE.md, .agent/, the
# /triage command) from its WORKING DIRECTORY. This script self-locates to the agentic repo
# root (the parent of this scripts/ folder) before calling `claude`, so it works no matter
# where it is launched from — the scheduler, another directory, or by hand. You do NOT need
# to set -WorkingDirectory on the scheduled task; the script handles it.
#
# Shell: this box runs Windows PowerShell 5.1 (powershell.exe). The examples below use it;
# if you install PowerShell 7, swap `powershell.exe` -> `pwsh` (the script is 5.1-compatible).
#
# SAFETY: defaults to NOTIFY-ONLY (reports eligible items, routes nothing). Pass -Execute to
# actually run the pipeline to a PR. Bugs-only, max 1 per run by default.
#
# ── Run it MANUALLY (from any directory) ────────────────────────────────────────────
#   powershell.exe -NoProfile -File "<repo>\scripts\triage-auto.ps1" -Source github -Repo <owner>/<repo> -Product <slug>
#   powershell.exe -NoProfile -File "<repo>\scripts\triage-auto.ps1" -Source local  -Product <slug>      # local tasks.md
#   ...add -Execute to run the pipeline; add -DryRun to print the composed command and exit (no claude).
#   (Quote multi-type filters: -Types "bug,feature". The script also tolerates -Types bug,feature.)
#
# ── Register a scheduled task (you choose cadence + mode) ────────────────────────────
#   $repo = "C:\path\to\your-clone"
#   Register-ScheduledTask -TaskName "triage-auto-<slug>" `
#     -Trigger (New-ScheduledTaskTrigger -Daily -At 7am) `
#     -Action  (New-ScheduledTaskAction -Execute "powershell.exe" `
#                 -Argument "-NoProfile -File `"$repo\scripts\triage-auto.ps1`" -Source github -Repo <owner>/<repo> -Product <slug>") `
#     -Description "Autonomous intake (notify-only). Append -Execute to -Argument when ready to run the pipeline."
#   Run on demand:  Start-ScheduledTask     -TaskName "triage-auto-<slug>"
#   Remove:         Unregister-ScheduledTask -TaskName "triage-auto-<slug>" -Confirm:$false
# ────────────────────────────────────────────────────────────────────────────────────

param(
  [ValidateSet("github", "local")]
  [string]$Source  = "github",   # where to read tasks from
  [string]$Repo    = "",         # owner/name (github source); blank = product's origin remote
  [string]$Product = "",         # product slug (routes the pick into the right product workspace)
  [string]$Types   = "bug",      # eligibility filter; comma-separated, e.g. "bug,feature"
  [int]   $Max     = 1,          # max items processed this run
  [switch]$Execute,              # omit = notify-only (safe default)
  [switch]$DryRun                # print the composed command + context, then exit (no claude call)
)

$ErrorActionPreference = "Stop"

# Repo root = parent of this scripts/ folder. Self-locating so manual + scheduled runs match.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

# Normalize --types into a clean comma list (tolerates "bug,feature", "bug feature", arrays).
$typeList = (($Types -split '[,\s]+' | Where-Object { $_ }) -join ',')
if (-not $typeList) { $typeList = "bug" }

# Compose the --auto argument line, then an explicit headless instruction.
# NOTE: headless `claude -p` does NOT resolve slash commands like `/triage` (verified —
# it returns "Unknown command"). Slash commands are a REPL feature. So we instruct claude
# to read + follow the command FILE directly — exactly what the interactive /triage
# wrapper does ("Read and follow .agent/commands/project/triage.md ... $ARGUMENTS").
$argParts = @("--auto", "--source", $Source, "--types", $typeList, "--max", "$Max")
if ($Execute) { $argParts += "--execute" }
if ($Repo)    { $argParts += @("--repo", $Repo) }
if ($Product) { $argParts += "product=$Product" }
$argline = ($argParts -join " ").Trim()
$cmd = "Unattended autonomous run, no operator present. Read and follow " +
       ".agent/commands/project/triage.md EXACTLY, applying these arguments: $argline. " +
       "Do not ask questions; honor the notify-only default unless --execute is present."

$mode  = if ($Execute) { "EXECUTE (pipeline -> PR)" } else { "notify-only" }
$stamp = Get-Date -Format "o"
$logLine = "[triage-auto] $stamp | cwd=$repoRoot | mode=$mode | args=$argline"
Write-Host $logLine

# Append to a run log so scheduled (console-less) runs are inspectable.
$logDir = Join-Path $repoRoot "storage\triage-auto-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Add-Content -Path (Join-Path $logDir "triage-auto.log") -Value $logLine

if ($DryRun) { Write-Host "[triage-auto] -DryRun: not invoking claude."; exit 0 }

# Headless Claude Code. Requires `claude` on PATH + this machine's gh/git auth.
& claude -p $cmd
exit $LASTEXITCODE
