# File: skhpsv2/scripts/push-v2.ps1
# Timestamp: 2026-06-08 15:33 UTC+8
# Purpose: One-stop skhpsv2 push workflow. GitHub Pages frontend push, then ALWAYS Apps Script backend clasp push + deploy unless -SkipAppScriptDeploy is explicitly used.
# Flow:
# 1. Ask version bump and commit message upfront.
# 2. Update version.json.
# 3. Git add / commit / push.
# 4. Push Apps Script backend from apps-script/ and deploy to the configured Web App deployment ID.
# Notes:
# - Root folder is GitHub Pages frontend area.
# - Apps Script files stay under apps-script/.
# - .clasp.json must stay under apps-script/.
# - ASCII-only script text to avoid PowerShell encoding damage.

param(
  [string]$Message = "",
  [ValidateSet("ask","none","patch","minor","major")]
  [string]$Bump = "ask",
  [string]$EnvName = "prod",
  [string]$DeploymentId = "AKfycbyzyZp2PSHLjl3Kjvuy8uhwmBZbfeWwBXA-UjYQvzh_-m1_aDxvaIvlsT_BXwkc3v1oWg",
  [switch]$DeployAppScript,
  [switch]$SkipAppScriptDeploy
)

$ErrorActionPreference = "Stop"
$env:GIT_TERMINAL_PROMPT = "0"

function Read-Choice {
  param(
    [string]$Prompt,
    [hashtable]$Choices,
    [string]$Default
  )

  while ($true) {
    $answer = Read-Host $Prompt

    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $Default
    }

    $key = $answer.Trim().ToLower()

    if ($Choices.ContainsKey($key)) {
      return $Choices[$key]
    }

    Write-Host "Invalid input. Valid options: $($Choices.Keys -join ', ')" -ForegroundColor Yellow
  }
}

function Read-YesNo {
  param(
    [string]$Prompt,
    [bool]$Default = $false
  )

  $suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }

  while ($true) {
    $answer = Read-Host "$Prompt $suffix"

    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $Default
    }

    if ($answer -match "^[Yy]") {
      return $true
    }

    if ($answer -match "^[Nn]") {
      return $false
    }

    Write-Host "Please enter Y or N." -ForegroundColor Yellow
  }
}

function Get-SemverParts {
  param([string]$Version)

  if ($Version -match "^v?(\d+)\.(\d+)\.(\d+)") {
    return @{
      Major = [int]$Matches[1]
      Minor = [int]$Matches[2]
      Patch = [int]$Matches[3]
    }
  }

  return @{
    Major = 0
    Minor = 1
    Patch = 0
  }
}

function Ensure-JsonProperty {
  param(
    [object]$Object,
    [string]$Name,
    [object]$Value
  )

  if (-not $Object.PSObject.Properties[$Name]) {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
  }
}

function Ensure-Environment {
  param(
    [object]$Root,
    [string]$Name,
    [string]$Label,
    [string]$Repo,
    [string]$Version
  )

  if (-not $Root.environments.PSObject.Properties[$Name]) {
    $Root.environments | Add-Member -NotePropertyName $Name -NotePropertyValue ([pscustomobject]@{
      label = $Label
      repo = $Repo
      version = $Version
    }) -Force
  }
}

function Read-VersionJson {
  param([string]$RepoRoot)

  $versionPath = Join-Path $RepoRoot "version.json"

  if (-not (Test-Path $versionPath)) {
    $initial = [pscustomobject]@{
      project = "skhpsv2"
      repoRole = "prod"
      current = [pscustomobject]@{
        env = "prod"
        label = "prod"
        version = "v0.1.0-prod-000000000000"
      }
      environments = [pscustomobject]@{}
    }

    $json = $initial | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($versionPath, $json, $utf8NoBom)
  }

  try {
    return Get-Content $versionPath -Raw | ConvertFrom-Json
  }
  catch {
    throw "version.json is invalid JSON. Please repair it before push: $versionPath"
  }
}

function Get-CurrentVersion {
  param(
    [object]$Data,
    [string]$EnvName
  )

  Ensure-JsonProperty -Object $Data -Name "project" -Value "skhpsv2"
  Ensure-JsonProperty -Object $Data -Name "repoRole" -Value $EnvName
  Ensure-JsonProperty -Object $Data -Name "current" -Value ([pscustomobject]@{})
  Ensure-JsonProperty -Object $Data -Name "environments" -Value ([pscustomobject]@{})

  Ensure-Environment -Root $Data -Name "prod" -Label "prod" -Repo "skhpsv2" -Version "v0.1.0-prod-000000000000"
  Ensure-Environment -Root $Data -Name "dev" -Label "dev" -Repo "dev-skhpsv2" -Version "not-created"
  Ensure-Environment -Root $Data -Name "local" -Label "local" -Repo "skhpsv2" -Version "v0.1.0-local-000000000000"

  if (-not $Data.environments.PSObject.Properties[$EnvName]) {
    throw "Unsupported EnvName: $EnvName. Use prod/dev/local."
  }

  $currentVersion = ""

  if ($Data.current -and $Data.current.PSObject.Properties["version"] -and $Data.current.version) {
    $currentVersion = [string]$Data.current.version
  }

  if ([string]::IsNullOrWhiteSpace($currentVersion)) {
    $currentVersion = [string]$Data.environments.$EnvName.version
  }

  if ([string]::IsNullOrWhiteSpace($currentVersion) -or $currentVersion -eq "not-created" -or $currentVersion -eq "not-released") {
    $currentVersion = "v0.1.0-$EnvName-000000000000"
  }

  return $currentVersion
}

function Update-VersionJson {
  param(
    [string]$RepoRoot,
    [object]$Data,
    [string]$EnvName,
    [string]$Bump
  )

  $versionPath = Join-Path $RepoRoot "version.json"
  $currentVersion = Get-CurrentVersion -Data $Data -EnvName $EnvName
  $parts = Get-SemverParts -Version $currentVersion

  $major = [int]$parts.Major
  $minor = [int]$parts.Minor
  $patch = [int]$parts.Patch

  switch ($Bump) {
    "patch" {
      $patch += 1
    }
    "minor" {
      $minor += 1
      $patch = 0
    }
    "major" {
      $major += 1
      $minor = 0
      $patch = 0
    }
    default {
      # none: keep semver, refresh timestamp only
    }
  }

  $stamp = Get-Date -Format "yyyyMMddHHmm"
  $newVersion = "v$major.$minor.$patch-$EnvName-$stamp"

  if ($EnvName -eq "dev") {
    $label = "dev"
    $repo = "dev-skhpsv2"
  }
  elseif ($EnvName -eq "local") {
    $label = "local"
    $repo = "skhpsv2"
  }
  else {
    $label = "prod"
    $repo = "skhpsv2"
  }

  $Data.repoRole = $EnvName

  $Data.current = [pscustomobject]@{
    env = $EnvName
    label = $label
    version = $newVersion
  }

  $Data.environments.$EnvName = [pscustomobject]@{
    label = $label
    repo = $repo
    version = $newVersion
  }

  if ($EnvName -eq "prod") {
    $Data.environments.local = [pscustomobject]@{
      label = "local"
      repo = "skhpsv2"
      version = "v$major.$minor.$patch-local-$stamp"
    }

    if (-not $Data.environments.dev.version) {
      $Data.environments.dev.version = "not-created"
    }
  }

  $json = $Data | ConvertTo-Json -Depth 10
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($versionPath, $json, $utf8NoBom)

  return $newVersion
}

function Invoke-AppsScriptDeploy {
  param(
    [string]$RepoRoot,
    [string]$DeploymentId,
    [string]$Description
  )

  $appScriptDir = Join-Path $RepoRoot "apps-script"

  if (-not (Test-Path $appScriptDir)) {
    throw "apps-script folder not found: $appScriptDir"
  }

  if (-not (Test-Path (Join-Path $appScriptDir ".clasp.json"))) {
    throw ".clasp.json not found under apps-script. Do not put it in repo root."
  }

  Push-Location $appScriptDir

  try {
    Write-Host ""
    Write-Host "Apps Script push + deploy" -ForegroundColor Cyan
    Write-Host "Apps Script dir: $appScriptDir"
    Write-Host "Deployment ID: $DeploymentId"
    Write-Host ""

    clasp status
    clasp push

    if ([string]::IsNullOrWhiteSpace($Description)) {
      $Description = "auto deploy from push-v2"
    }

    clasp deploy -i $DeploymentId -d $Description

    Write-Host ""
    Write-Host "Apps Script deploy completed." -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  Write-Host ""
  Write-Host "=============================="
  Write-Host "skhpsv2 push workflow"
  Write-Host "=============================="
  Write-Host "Repo root: $repoRoot"
  Write-Host ""

  if (Test-Path ".clasp.json") {
    throw "Root .clasp.json detected. Keep Apps Script files under apps-script/, not repo root."
  }

  $data = Read-VersionJson -RepoRoot $repoRoot
  $currentVersion = Get-CurrentVersion -Data $data -EnvName $EnvName
  $parts = Get-SemverParts -Version $currentVersion

  if ($Bump -eq "ask") {
    Write-Host "Current version: $currentVersion" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Version bump:"
    Write-Host "  [0] none  keep semver, refresh timestamp"
    Write-Host "  [1] patch v$($parts.Major).$($parts.Minor).$($parts.Patch) -> v$($parts.Major).$($parts.Minor).$([int]$parts.Patch + 1)"
    Write-Host "  [2] minor v$($parts.Major).$($parts.Minor).$($parts.Patch) -> v$($parts.Major).$([int]$parts.Minor + 1).0"
    Write-Host "  [3] major v$($parts.Major).$($parts.Minor).$($parts.Patch) -> v$([int]$parts.Major + 1).0.0"
    Write-Host ""

    $Bump = Read-Choice `
      -Prompt "Input 0/1/2/3, default 0" `
      -Choices @{
        "0" = "none"
        "n" = "none"
        "none" = "none"
        "1" = "patch"
        "p" = "patch"
        "patch" = "patch"
        "2" = "minor"
        "m" = "minor"
        "minor" = "minor"
        "3" = "major"
        "a" = "major"
        "major" = "major"
      } `
      -Default "none"
  }

  $previewParts = Get-SemverParts -Version $currentVersion
  $previewMajor = [int]$previewParts.Major
  $previewMinor = [int]$previewParts.Minor
  $previewPatch = [int]$previewParts.Patch

  switch ($Bump) {
    "patch" { $previewPatch += 1 }
    "minor" {
      $previewMinor += 1
      $previewPatch = 0
    }
    "major" {
      $previewMajor += 1
      $previewMinor = 0
      $previewPatch = 0
    }
    default { }
  }

  $previewStamp = Get-Date -Format "yyyyMMddHHmm"
  $previewVersion = "v$previewMajor.$previewMinor.$previewPatch-$EnvName-$previewStamp"

  if ([string]::IsNullOrWhiteSpace($Message)) {
    $defaultMessage = "Update skhpsv2 $previewVersion"
    $inputMessage = Read-Host "Commit message, default '$defaultMessage'"
    if ([string]::IsNullOrWhiteSpace($inputMessage)) {
      $Message = $defaultMessage
    }
    else {
      $Message = $inputMessage
    }
  }

  # Default rule for skhpsv2:
  # Always push + deploy Apps Script backend after Git push.
  # Use -SkipAppScriptDeploy only for emergency frontend-only pushes.
  if ($SkipAppScriptDeploy) {
    $shouldDeploy = $false
  }
  else {
    $shouldDeploy = $true
  }

  Write-Host ""
  Write-Host "Plan" -ForegroundColor Cyan
  Write-Host "  Env          : $EnvName"
  Write-Host "  Version bump : $Bump"
  Write-Host "  New version  : $previewVersion"
  Write-Host "  Commit msg   : $Message"
  Write-Host "  Deploy GAS   : $shouldDeploy (default always deploy unless -SkipAppScriptDeploy)"
  Write-Host ""

  $confirm = Read-YesNo -Prompt "Start workflow now?" -Default $true
  if (-not $confirm) {
    Write-Host "Cancelled."
    exit 0
  }

  $newVersion = Update-VersionJson -RepoRoot $repoRoot -Data $data -EnvName $EnvName -Bump $Bump

  git status

  $changes = git status --porcelain

  if (-not [string]::IsNullOrWhiteSpace($changes)) {
    git add .
    git commit -m $Message
    git push
  }
  else {
    Write-Host ""
    Write-Host "No Git changes to commit." -ForegroundColor Green
  }

  if ($shouldDeploy) {
    Invoke-AppsScriptDeploy -RepoRoot $repoRoot -DeploymentId $DeploymentId -Description $Message
  }
  else {
    Write-Host "Skip Apps Script deploy."
  }

  Write-Host ""
  Write-Host "=============================="
  Write-Host "Done"
  Write-Host "=============================="
}
finally {
  Pop-Location
}