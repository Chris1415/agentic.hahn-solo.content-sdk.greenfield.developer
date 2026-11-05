<#
.SYNOPSIS
  PowerShell twin of .agent/scripts/resolve-products-root.mjs — resolves the
  products root, treating `products/` as a LOGICAL MOUNT POINT.

.DESCRIPTION
  Resolution order (first hit wins):
    1. $env:AGENTIC_PRODUCTS_ROOT
    2. .agent/workspace.json  ->  { "products_root": "..." }   (gitignored: a MACHINE fact)
    3. <repo>/products                                          (the in-repo default)

  A configured root that does not exist is an ERROR, never a silent fallback —
  a silent fallback looks exactly like an empty workspace.

  `products/_root/` is PINNED TO THE REPO (this repo's own tracked planning
  surface, not a product), so it never travels with the mount.

  Both files must stay in step. The Node one is canonical; this exists because
  clone-all.ps1 and the sync scripts are PowerShell and must not shell out to node.

.EXAMPLE
  pwsh .agent/scripts/Resolve-ProductsRoot.ps1                # print the absolute root
.EXAMPLE
  pwsh .agent/scripts/Resolve-ProductsRoot.ps1 -Json
.EXAMPLE
  pwsh .agent/scripts/Resolve-ProductsRoot.ps1 -Path products/personal/showcase
.EXAMPLE
  . .agent/scripts/Resolve-ProductsRoot.ps1 -DotSource        # then: Get-ProductsRoot
#>
[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$Path,
    [switch]$Json,
    [switch]$Check,
    [switch]$DotSource
)

$script:ProductsMount = 'products'
$script:ProductsPinnedToRepo = @('_root')

function Find-AgenticRepoRoot {
    param([string]$StartDir)
    if (-not $StartDir) { $StartDir = $PSScriptRoot }
    $dir = (Resolve-Path -LiteralPath $StartDir).Path
    while ($true) {
        if (Test-Path -LiteralPath (Join-Path $dir '.agent/flows.json')) { return $dir }
        $up = Split-Path -Parent $dir
        if (-not $up -or $up -eq $dir) { return (Resolve-Path -LiteralPath $StartDir).Path }
        $dir = $up
    }
}

function Get-ProductsRoot {
    <#
      Returns a PSCustomObject: Root, Source, Configured, RepoRoot, External,
      Exists, RootName, DefaultRoot, ConfigFile, ErrorMessage.
    #>
    [CmdletBinding()]
    param([string]$RepoRoot)

    $repo = Find-AgenticRepoRoot -StartDir $RepoRoot
    $defaultRoot = Join-Path $repo $script:ProductsMount
    $configFile = Join-Path $repo '.agent/workspace.json'

    $configured = $null
    $source = 'default'
    $err = $null

    if ($env:AGENTIC_PRODUCTS_ROOT -and $env:AGENTIC_PRODUCTS_ROOT.Trim()) {
        $configured = $env:AGENTIC_PRODUCTS_ROOT.Trim()
        $source = 'env'
    }
    elseif (Test-Path -LiteralPath $configFile) {
        try {
            $cfg = Get-Content -LiteralPath $configFile -Raw -Encoding utf8 | ConvertFrom-Json
            if ($cfg.products_root -and "$($cfg.products_root)".Trim()) {
                $configured = "$($cfg.products_root)".Trim()
                $source = 'workspace.json'
            }
        }
        catch { $err = "unparseable .agent/workspace.json: $($_.Exception.Message)" }
    }

    if ($configured) {
        $expanded = $configured
        if ($expanded.StartsWith('~')) {
            $expanded = Join-Path $HOME ($expanded.Substring(1).TrimStart('\', '/'))
        }
        # A relative configured root is relative to the repo root.
        if ([System.IO.Path]::IsPathRooted($expanded)) { $root = [System.IO.Path]::GetFullPath($expanded) }
        else { $root = [System.IO.Path]::GetFullPath((Join-Path $repo $expanded)) }
    }
    else { $root = [System.IO.Path]::GetFullPath($defaultRoot) }

    $exists = (Test-Path -LiteralPath $root -PathType Container)
    if (-not $err -and $configured -and -not $exists) {
        $err = "configured products_root does not exist or is not a directory: $root (source: $source)"
    }

    # StartsWith, not -like: a path may contain wildcard characters ([ ] ? *).
    $repoFull = ([System.IO.Path]::GetFullPath($repo)).TrimEnd('\', '/')
    $external = -not $root.TrimEnd('\', '/').StartsWith($repoFull, [System.StringComparison]::OrdinalIgnoreCase)

    [pscustomobject]@{
        Root         = $root
        Source       = $source
        Configured   = $configured
        RepoRoot     = [System.IO.Path]::GetFullPath($repo)
        External     = $external
        Exists       = $exists
        RootName     = Split-Path -Leaf $root
        DefaultRoot  = [System.IO.Path]::GetFullPath($defaultRoot)
        ConfigFile   = $configFile
        ErrorMessage = $err
    }
}

function Resolve-ProductsLogicalPath {
    <# Map a logical `products/...` (or repo-relative) path onto the filesystem. #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$LogicalPath,
        [pscustomobject]$Context
    )
    if (-not $Context) { $Context = Get-ProductsRoot }
    if ([System.IO.Path]::IsPathRooted($LogicalPath)) { return [System.IO.Path]::GetFullPath($LogicalPath) }

    # @() is load-bearing: a one-segment path ('products') would otherwise be a
    # STRING, and $parts[0] would return its first CHARACTER instead of the segment.
    $parts = @($LogicalPath -replace '\\', '/' -replace '^\./', '' -split '/' | Where-Object { $_ -ne '' })
    if ($parts.Count -eq 0) { return $Context.RepoRoot }

    if ($parts[0] -ne $script:ProductsMount) {
        return [System.IO.Path]::GetFullPath((Join-Path $Context.RepoRoot ($parts -join [System.IO.Path]::DirectorySeparatorChar)))
    }
    if ($parts.Count -ge 2 -and $script:ProductsPinnedToRepo -contains $parts[1]) {
        return [System.IO.Path]::GetFullPath((Join-Path $Context.RepoRoot ($parts -join [System.IO.Path]::DirectorySeparatorChar)))
    }
    $rest = @($parts | Select-Object -Skip 1)
    if ($rest.Count -eq 0) { return $Context.Root }
    return [System.IO.Path]::GetFullPath((Join-Path $Context.Root ($rest -join [System.IO.Path]::DirectorySeparatorChar)))
}

if ($DotSource) { return }

$info = Get-ProductsRoot -RepoRoot $RepoRoot

if ($Path) { Write-Output (Resolve-ProductsLogicalPath -LogicalPath $Path -Context $info) }
elseif ($Json) { Write-Output ($info | ConvertTo-Json -Depth 4) }
else { Write-Output $info.Root }

if ($info.ErrorMessage) { Write-Error "[ERROR] $($info.ErrorMessage)"; exit 1 }
if ($Check -and -not $info.Exists) { Write-Error "[ERROR] products root does not exist: $($info.Root)"; exit 1 }
