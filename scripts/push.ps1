# File: skhpsv2/scripts/push.ps1
# Timestamp: 2026-06-08 20:10 UTC+8
# Purpose: Stable interactive push tool for skhpsv2.
# Rules:
# - Repo root must NOT have .clasp.json.
# - Apps Script lives under apps-script/.
# - clasp deploy always uses config.json api.deploymentId with: clasp deploy -i <deploymentId>.
# - This script does NOT create a new Apps Script deployment id.
# - This script does NOT rewrite config.json api.webAppUrl.

param(
  [ValidateSet("menu", "status", "git", "frontend", "backend", "full")]
  [string]$Mode = "menu"
)

$ErrorActionPreference = "Stop"

try {
  chcp 65001 | Out-Null
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
  $OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {
  # Ignore encoding setup failures.
}

function Get-RepoRoot {
  $here = (Resolve-Path $PSScriptRoot).Path

  if (Test-Path (Join-Path $here ".git")) {
    return $here
  }

  $parent = (Resolve-Path (Join-Path $here "..")).Path

  if (Test-Path (Join-Path $parent ".git")) {
    return $parent
  }

  throw "Cannot find Git repo root. Please run inside skhpsv2."
}

$repoRoot = Get-RepoRoot
Push-Location $repoRoot

function Ask-Default {
  param(
    [string]$Question,
    [string]$Default
  )

  $promptText = $Question + " [" + $Default + "]"
  $answer = Read-Host $promptText

  if ([string]::IsNullOrWhiteSpace($answer)) {
    return $Default
  }

  return $answer.Trim()
}

function Test-Yes {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  $v = $Value.Trim().ToUpperInvariant()
  return @("Y", "YES", "1", "TRUE") -contains $v
}

function Stop-IfBadRepo {
  if (!(Test-Path ".\.git")) {
    throw "Current folder is not Git repo root."
  }

  if (Test-Path ".\.clasp.json") {
    throw "Invalid repo layout: root .clasp.json is not allowed. Apps Script config should be under apps-script/."
  }

  if (!(Test-Path ".\config.json")) {
    throw "config.json not found."
  }
}

function Get-CurrentBranch {
  $branch = (git branch --show-current).Trim()

  if ([string]::IsNullOrWhiteSpace($branch)) {
    throw "Cannot get current Git branch."
  }

  return $branch
}

function Show-Status {
  Stop-IfBadRepo

  Write-Host ""
  Write-Host "==== skhpsv2 status ====" -ForegroundColor Cyan
  Write-Host "Repo   : $repoRoot"
  Write-Host "Branch : $(Get-CurrentBranch)"

  Write-Host ""
  Write-Host "Git status:" -ForegroundColor Cyan
  git status --short

  Write-Host ""
  Write-Host "Important files:" -ForegroundColor Cyan

  if (Test-Path ".\config.json") {
    Write-Host "config.json: OK" -ForegroundColor Green
  } else {
    Write-Host "config.json: missing" -ForegroundColor Red
  }

  if (Test-Path ".\version.json") {
    Write-Host "version.json: OK" -ForegroundColor Green
  } else {
    Write-Host "version.json: missing" -ForegroundColor Yellow
  }

  if (Test-Path ".\apps-script") {
    Write-Host "apps-script folder: OK" -ForegroundColor Green
  } else {
    Write-Host "apps-script folder: missing" -ForegroundColor Yellow
  }

  if (Test-Path ".\apps-script\.clasp.json") {
    Write-Host "apps-script/.clasp.json: OK" -ForegroundColor Green
  } else {
    Write-Host "apps-script/.clasp.json: missing" -ForegroundColor Yellow
  }

  if (Test-Path ".\.clasp.json") {
    Write-Host "root .clasp.json: INVALID" -ForegroundColor Red
  } else {
    Write-Host "root .clasp.json: OK, not found" -ForegroundColor Green
  }

  Write-Host ""
}

function Save-VSCodeTabs {
  $answer = Ask-Default "Save all VS Code tabs now? Y/N" "Y"

  if (!(Test-Yes $answer)) {
    Write-Host "Skip VS Code save all." -ForegroundColor Yellow
    return
  }

  if (Get-Command code -ErrorAction SilentlyContinue) {
    try {
      code --reuse-window --command workbench.action.files.saveAll | Out-Null
      Start-Sleep -Milliseconds 800
      Write-Host "VS Code save all command sent." -ForegroundColor Green
    } catch {
      Write-Host "VS Code save all failed. Continue anyway." -ForegroundColor Yellow
    }
  } else {
    Write-Host "code CLI not found. Skip save all." -ForegroundColor Yellow
  }
}

function New-AutoCommitMessage {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  return "update skhpsv2 $stamp"
}

function Ask-CommitMessage {
  $auto = New-AutoCommitMessage

  Write-Host ""
  Write-Host "Commit message:"
  Write-Host "1. Auto: $auto"
  Write-Host "2. Manual"
  Write-Host ""

  $choice = Read-Host "Input 1/2, Enter = 1"

  if ([string]::IsNullOrWhiteSpace($choice)) {
    return $auto
  }

  if ($choice.Trim() -eq "2") {
    $manual = Read-Host "Commit message"

    if (![string]::IsNullOrWhiteSpace($manual)) {
      return $manual.Trim()
    }
  }

  return $auto
}

function Update-VersionJson {
  $versionPath = Join-Path $repoRoot "version.json"

  if (!(Test-Path $versionPath)) {
    Write-Host "version.json not found. Skip version update." -ForegroundColor Yellow
    return
  }

  $json = Get-Content $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json

  if (!($json.PSObject.Properties.Name -contains "version")) {
    Write-Host "version field not found. Skip version update." -ForegroundColor Yellow
    return
  }

  $current = [string]$json.version

  if ($current -notmatch 'v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)') {
    Write-Host "Cannot parse current version: $current" -ForegroundColor Yellow
    return
  }

  $major = [int]$Matches.major
  $minor = [int]$Matches.minor
  $patch = [int]$Matches.patch

  Write-Host ""
  Write-Host "Current version: $current" -ForegroundColor Cyan
  Write-Host "Version bump:"
  Write-Host "1. patch, default"
  Write-Host "2. minor"
  Write-Host "3. major"
  Write-Host "4. none"
  Write-Host ""

  $choice = Read-Host "Input 1/2/3/4, Enter = 1"

  if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = "1"
  }

  $choice = $choice.Trim().ToLowerInvariant()

  if ($choice -eq "1" -or $choice -eq "patch") {
    $patch++
  } elseif ($choice -eq "2" -or $choice -eq "minor") {
    $minor++
    $patch = 0
  } elseif ($choice -eq "3" -or $choice -eq "major") {
    $major++
    $minor = 0
    $patch = 0
  } elseif ($choice -eq "4" -or $choice -eq "none") {
    Write-Host "version.json not updated." -ForegroundColor Yellow
    return
  } else {
    Write-Host "Unsupported version option. Skip version update." -ForegroundColor Yellow
    return
  }

  $envName = "prod"

  if ($json.PSObject.Properties.Name -contains "env") {
    if (![string]::IsNullOrWhiteSpace([string]$json.env)) {
      $envName = [string]$json.env
    }
  }

  $timestamp = Get-Date -Format "yyyyMMddHHmm"
  $newVersion = "$envName v$major.$minor.$patch-$envName-$timestamp"

  $json.version = $newVersion

  if ($json.PSObject.Properties.Name -contains "updatedAt") {
    $json.updatedAt = (Get-Date -Format "yyyy-MM-dd HH:mm") + " UTC+8"
  }

  $json |
    ConvertTo-Json -Depth 20 |
    Set-Content $versionPath -Encoding UTF8

  Write-Host ""
  Write-Host "version.json updated:" -ForegroundColor Green
  Write-Host "  $current"
  Write-Host "  -> $newVersion"
}

function Get-DeploymentIdFromConfig {
  $configPath = Join-Path $repoRoot "config.json"
  $config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

  $deploymentId = ""

  if ($config.api) {
    if (($config.api.PSObject.Properties.Name -contains "deploymentId") -and ![string]::IsNullOrWhiteSpace([string]$config.api.deploymentId)) {
      $deploymentId = [string]$config.api.deploymentId
    } elseif (($config.api.PSObject.Properties.Name -contains "webAppUrl") -and ([string]$config.api.webAppUrl -match "/s/([^/]+)/exec")) {
      $deploymentId = $Matches[1]
    }
  }

  if ([string]::IsNullOrWhiteSpace($deploymentId)) {
    throw "Cannot find api.deploymentId in config.json."
  }

  return $deploymentId
}

function Sync-AppsScriptConfig {
  Write-Host ""
  Write-Host "==== Sync Apps Script config ====" -ForegroundColor Cyan

  $syncClasp = Join-Path $repoRoot "scripts\sync-clasp-from-config.ps1"
  $syncAppConfig = Join-Path $repoRoot "scripts\sync-appscript-config-from-config.ps1"

  if (Test-Path $syncClasp) {
    & $syncClasp
    if ($LASTEXITCODE -ne 0) {
      throw "sync-clasp-from-config.ps1 failed."
    }
  } else {
    Write-Host "sync-clasp-from-config.ps1 not found. Skip." -ForegroundColor Yellow
  }

  if (Test-Path $syncAppConfig) {
    & $syncAppConfig
    if ($LASTEXITCODE -ne 0) {
      throw "sync-appscript-config-from-config.ps1 failed."
    }
  } else {
    Write-Host "sync-appscript-config-from-config.ps1 not found. Skip." -ForegroundColor Yellow
  }
}

function Invoke-Clasp {
  param(
    [bool]$DoPush,
    [bool]$DoDeploy,
    [string]$DeployDescription
  )

  if (!$DoPush -and !$DoDeploy) {
    Write-Host "Skip clasp." -ForegroundColor Yellow
    return
  }

  $appsScriptDir = Join-Path $repoRoot "apps-script"

  if (!(Test-Path $appsScriptDir)) {
    throw "apps-script folder not found."
  }

  if (!(Test-Path (Join-Path $appsScriptDir ".clasp.json"))) {
    throw "apps-script/.clasp.json not found."
  }

  if (!(Get-Command clasp -ErrorAction SilentlyContinue)) {
    throw "clasp command not found."
  }

  Push-Location $appsScriptDir

  try {
    if ($DoPush) {
      Write-Host ""
      Write-Host "==== clasp push ====" -ForegroundColor Cyan
      clasp push
    }

    if ($DoDeploy) {
      Write-Host ""
      Write-Host "==== clasp deploy -i ====" -ForegroundColor Cyan
      $deploymentId = Get-DeploymentIdFromConfig

      Write-Host "Deployment ID from config.json:"
      Write-Host "  $deploymentId"

      clasp deploy -i $deploymentId -d "$DeployDescription"
    }
  }
  finally {
    Pop-Location
  }
}

function Invoke-GitCommitPullPush {
  param(
    [string]$CommitMessage,
    [bool]$DoPullBeforePush,
    [bool]$DoPush
  )

  $branch = Get-CurrentBranch

  Write-Host ""
  Write-Host "==== Git status ====" -ForegroundColor Cyan
  git status --short

  $changes = git status --porcelain

  if ($changes) {
    Write-Host ""
    Write-Host "==== Git add / commit ====" -ForegroundColor Cyan
    git add -A
    git commit -m "$CommitMessage"
  } else {
    Write-Host "No Git changes to commit." -ForegroundColor Green
  }

  if ($DoPullBeforePush) {
    Write-Host ""
    Write-Host "==== Git pull --rebase ====" -ForegroundColor Cyan
    git pull --rebase origin $branch
  }

  if ($DoPush) {
    Write-Host ""
    Write-Host "==== Git push ====" -ForegroundColor Cyan

    $upstream = ""
    try {
      $upstream = (git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null).Trim()
    } catch {
      $upstream = ""
    }

    if ([string]::IsNullOrWhiteSpace($upstream)) {
      git push -u origin $branch
    } else {
      git push
    }
  } else {
    Write-Host "Skip Git push." -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "==== Done ====" -ForegroundColor Green
  git status --short
}

function Invoke-Workflow {
  param(
    [ValidateSet("git", "frontend", "backend", "full")]
    [string]$Workflow
  )

  Stop-IfBadRepo

  Write-Host ""
  Write-Host "==== skhpsv2 push ====" -ForegroundColor Cyan
  Write-Host "Repo     : $repoRoot"
  Write-Host "Branch   : $(Get-CurrentBranch)"
  Write-Host "Workflow : $Workflow"

  Save-VSCodeTabs

  $doVersion = $true
  $doClaspPush = $false
  $doClaspDeploy = $false
  $doGitPull = $true
  $doGitPush = $true

  if ($Workflow -eq "backend" -or $Workflow -eq "full") {
    $doClaspPush = $true
    $doClaspDeploy = $true
  }

  Write-Host ""
  Write-Host "Default actions:" -ForegroundColor Yellow
  Write-Host "version.json       : $doVersion"
  Write-Host "clasp push         : $doClaspPush"
  Write-Host "clasp deploy -i    : $doClaspDeploy"
  Write-Host "git pull --rebase  : $doGitPull"
  Write-Host "git push           : $doGitPush"
  Write-Host ""

  $custom = Ask-Default "Change actions? Y/N" "N"

  if (Test-Yes $custom) {
    $defVersion = if ($doVersion) { "Y" } else { "N" }
    $defClaspPush = if ($doClaspPush) { "Y" } else { "N" }
    $defClaspDeploy = if ($doClaspDeploy) { "Y" } else { "N" }
    $defGitPull = if ($doGitPull) { "Y" } else { "N" }
    $defGitPush = if ($doGitPush) { "Y" } else { "N" }

    $doVersion = Test-Yes (Ask-Default "Update version.json? Y/N" $defVersion)
    $doClaspPush = Test-Yes (Ask-Default "Run clasp push? Y/N" $defClaspPush)
    $doClaspDeploy = Test-Yes (Ask-Default "Run clasp deploy -i? Y/N" $defClaspDeploy)
    $doGitPull = Test-Yes (Ask-Default "Run git pull --rebase before push? Y/N" $defGitPull)
    $doGitPush = Test-Yes (Ask-Default "Run git push? Y/N" $defGitPush)
  }

  if ($doVersion) {
    Update-VersionJson
  } else {
    Write-Host "Skip version.json update." -ForegroundColor Yellow
  }

  $commitMessage = Ask-CommitMessage

  $deployDescription = $commitMessage

  if ($doClaspDeploy) {
    $deployDescription = Ask-Default "clasp deploy description" $commitMessage
  }

  Write-Host ""
  Write-Host "==== Confirm ====" -ForegroundColor Cyan
  Write-Host "Workflow           : $Workflow"
  Write-Host "Commit message     : $commitMessage"
  Write-Host "version.json       : $doVersion"
  Write-Host "clasp push         : $doClaspPush"
  Write-Host "clasp deploy -i    : $doClaspDeploy"
  if ($doClaspDeploy) {
    Write-Host "deploy description : $deployDescription"
  }
  Write-Host "git pull --rebase  : $doGitPull"
  Write-Host "git push           : $doGitPush"
  Write-Host ""

  $confirm = Ask-Default "Run now? Y/N" "Y"

  if (!(Test-Yes $confirm)) {
    Write-Host "Canceled." -ForegroundColor Yellow
    return
  }

  if ($doClaspPush -or $doClaspDeploy) {
    Sync-AppsScriptConfig
    Invoke-Clasp -DoPush:$doClaspPush -DoDeploy:$doClaspDeploy -DeployDescription $deployDescription
  }

  Invoke-GitCommitPullPush -CommitMessage $commitMessage -DoPullBeforePush:$doGitPull -DoPush:$doGitPush
}

function Show-Menu {
  while ($true) {
    Write-Host ""
    Write-Host "==== skhpsv2 push menu ====" -ForegroundColor Cyan
    Write-Host "Repo: $repoRoot"
    Write-Host ""
    Write-Host "1. Status only"
    Write-Host "2. Git push only: version + commit + pull --rebase + push"
    Write-Host "3. Frontend push: same as Git push only"
    Write-Host "4. Backend push: clasp push + clasp deploy -i + git push"
    Write-Host "5. Full push: frontend + Apps Script backend"
    Write-Host "6. Open VS Code"
    Write-Host "0. Exit"
    Write-Host ""

    $choice = Read-Host "Input number"

    switch ($choice) {
      "1" { Show-Status }
      "2" { Invoke-Workflow -Workflow "git" }
      "3" { Invoke-Workflow -Workflow "frontend" }
      "4" { Invoke-Workflow -Workflow "backend" }
      "5" { Invoke-Workflow -Workflow "full" }
      "6" { code . }
      "0" { return }
      default { Write-Host "Input 0-6." -ForegroundColor Yellow }
    }
  }
}

try {
  Stop-IfBadRepo

  if ($Mode -eq "status") {
    Show-Status
  } elseif ($Mode -eq "git") {
    Invoke-Workflow -Workflow "git"
  } elseif ($Mode -eq "frontend") {
    Invoke-Workflow -Workflow "frontend"
  } elseif ($Mode -eq "backend") {
    Invoke-Workflow -Workflow "backend"
  } elseif ($Mode -eq "full") {
    Invoke-Workflow -Workflow "full"
  } else {
    Show-Menu
  }
}
finally {
  Pop-Location
}