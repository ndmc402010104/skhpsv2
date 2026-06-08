param(
  [string]$CommitMessage = "",
  [switch]$ManualCommitMessage,
  [switch]$NoClaspDeploy,
  [switch]$NoClaspPush,
  [switch]$NoPullBeforePush,
  [switch]$NoOpenCode
)

$ErrorActionPreference = "Stop"

try {
  chcp 65001 | Out-Null
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
  $OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

function Ask-Default {
  param(
    [string]$Prompt,
    [string]$Default
  )

  $answer = Read-Host "$Prompt [$Default]"

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

  $v = $Value.Trim().ToUpper()
  return @("Y", "YES", "1", "TRUE") -contains $v
}

function Get-ConfigDeploymentId {
  $configPath = Join-Path $repoRoot "config.json"

  if (!(Test-Path $configPath)) {
    throw "config.json not found."
  }

  $config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

  $deploymentId = ""

  if (
    $config.api -and
    ($config.api.PSObject.Properties.Name -contains "deploymentId") -and
    -not [string]::IsNullOrWhiteSpace([string]$config.api.deploymentId)
  ) {
    $deploymentId = [string]$config.api.deploymentId
  } elseif (
    $config.api -and
    ($config.api.PSObject.Properties.Name -contains "webAppUrl") -and
    ([string]$config.api.webAppUrl -match "/s/([^/]+)/exec")
  ) {
    $deploymentId = $Matches[1]
  }

  if ([string]::IsNullOrWhiteSpace($deploymentId)) {
    throw "Missing api.deploymentId in config.json, and cannot parse deployment id from api.webAppUrl."
  }

  return $deploymentId
}
function New-AutoCommitMessage {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  return "update skhpsv2 $stamp"
}

function Update-VersionJson {
  $versionPath = Join-Path $repoRoot "version.json"

  if (!(Test-Path $versionPath)) {
    Write-Host "version.json not found. Skip version update." -ForegroundColor Yellow
    return
  }

  $json = Get-Content $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json

  if (-not ($json.PSObject.Properties.Name -contains "version")) {
    Write-Host "version field not found. Skip version update." -ForegroundColor Yellow
    return
  }

  $currentVersion = [string]$json.version

  if ($currentVersion -notmatch 'v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)') {
    Write-Host "Cannot parse current version: $currentVersion. Skip version update." -ForegroundColor Yellow
    return
  }

  $major = [int]$Matches.major
  $minor = [int]$Matches.minor
  $patch = [int]$Matches.patch

  Write-Host ""
  Write-Host "Current version: $currentVersion" -ForegroundColor Cyan
  Write-Host "Version bump:" -ForegroundColor Yellow
  Write-Host "  1) major"
  Write-Host "  2) minor"
  Write-Host "  3) patch"
  Write-Host "  4) none"
  Write-Host ""

  $choice = Read-Host "Input 1/2/3/4. Enter = none"

  if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = "4"
  }

  $choice = $choice.Trim().ToLower()
  $bumpName = "none"

  if ($choice -eq "1" -or $choice -eq "major") {
    $major++
    $minor = 0
    $patch = 0
    $bumpName = "major"
  } elseif ($choice -eq "2" -or $choice -eq "minor") {
    $minor++
    $patch = 0
    $bumpName = "minor"
  } elseif ($choice -eq "3" -or $choice -eq "patch") {
    $patch++
    $bumpName = "patch"
  } elseif ($choice -eq "4" -or $choice -eq "none") {
    $bumpName = "none"
  } else {
    Write-Host "Unsupported version option: $choice. Skip version update." -ForegroundColor Yellow
    return
  }

  if ($bumpName -eq "none") {
    Write-Host "version.json not updated." -ForegroundColor Yellow
    return
  }

  $envName = "prod"

  if ($json.PSObject.Properties.Name -contains "env" -and -not [string]::IsNullOrWhiteSpace([string]$json.env)) {
    $envName = [string]$json.env
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

  Write-Host "version.json updated: $currentVersion -> $newVersion" -ForegroundColor Green
}

function Get-DeploymentIdFromText {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  if ($Text -match '(AKfy[a-zA-Z0-9_-]+)') {
    return $Matches[1]
  }

  return ""
}

function Update-ConfigWebAppUrl {
  param([string]$DeploymentId)

  if ([string]::IsNullOrWhiteSpace($DeploymentId)) {
    throw "Cannot update config.json because deployment id is empty."
  }

  $configPath = Join-Path $repoRoot "config.json"

  if (!(Test-Path $configPath)) {
    throw "config.json not found."
  }

  $newUrl = "https://script.google.com/macros/s/$DeploymentId/exec"

  $config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

  if (-not $config.api) {
    $config | Add-Member -MemberType NoteProperty -Name "api" -Value ([pscustomobject]@{})
  }

  $oldUrl = ""
  if ($config.api.PSObject.Properties.Name -contains "webAppUrl") {
    $oldUrl = [string]$config.api.webAppUrl
    $config.api.webAppUrl = $newUrl
  } else {
    $config.api | Add-Member -MemberType NoteProperty -Name "webAppUrl" -Value $newUrl
  }

  $config |
    ConvertTo-Json -Depth 20 |
    Set-Content $configPath -Encoding UTF8

  Write-Host ""
  Write-Host "==== config.json api.webAppUrl updated ====" -ForegroundColor Cyan
  Write-Host "Old: $oldUrl"
  Write-Host "New: $newUrl"

  return $newUrl
}

function Test-WebAppAllowedActions {
  param([string]$WebAppUrl)

  if ([string]::IsNullOrWhiteSpace($WebAppUrl)) {
    return
  }

  Write-Host ""
  Write-Host "==== Test deployed allowedActions ====" -ForegroundColor Cyan

  try {
    $testUrl = $WebAppUrl + "?action=__debug_unknown_action__&ts=" + [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $response = Invoke-RestMethod -Uri $testUrl -Method Get
    $response.allowedActions
  } catch {
    Write-Host "AllowedActions test failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

try {
  Write-Host "==== skhpsv2 push ====" -ForegroundColor Cyan
  Write-Host "Repo: $repoRoot"

  if (-not (Test-Path ".\.git")) {
    throw "Not a Git repo root."
  }

  $branch = (git branch --show-current).Trim()

  if (-not $branch) {
    throw "Cannot get current Git branch."
  }

  Write-Host "Branch: $branch"

  Write-Host ""
  Write-Host "==== VS Code save all ====" -ForegroundColor Cyan

  $saveAllAnswer = Ask-Default "Save all VS Code tabs now? Y/N" "Y"

  if (Test-Yes $saveAllAnswer) {
    if (Get-Command code -ErrorAction SilentlyContinue) {
      try {
        code --reuse-window --command workbench.action.files.saveAll | Out-Null
        Start-Sleep -Milliseconds 800
        Write-Host "VS Code save all command sent." -ForegroundColor Green
      } catch {
        Write-Host "VS Code save all command failed. Continue anyway." -ForegroundColor Yellow
      }
    } else {
      Write-Host "VS Code CLI not found. Skip save all." -ForegroundColor Yellow
    }
  } else {
    Write-Host "Skip VS Code save all." -ForegroundColor Yellow
  }

  $appsScriptDir = Join-Path $repoRoot "apps-script"

  Write-Host ""
  Write-Host "==== Input settings ====" -ForegroundColor Yellow

  Update-VersionJson

  if (-not $CommitMessage) {
    if ($ManualCommitMessage) {
      $CommitMessage = Read-Host "Commit message"
    } else {
      $autoMessage = New-AutoCommitMessage
      $mode = Ask-Default "Commit message mode: A=auto, M=manual" "A"

      if ($mode.ToUpper() -eq "M") {
        $CommitMessage = Read-Host "Commit message"
      } else {
        $CommitMessage = $autoMessage
      }
    }
  }

  if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    $CommitMessage = New-AutoCommitMessage
  }

  $pullAnswer = if ($NoPullBeforePush) { "N" } else { Ask-Default "Run git pull --rebase before push? Y/N" "Y" }
  $claspPushAnswer = if ($NoClaspPush) { "N" } else { Ask-Default "Run clasp push? Y/N" "Y" }
  $claspDeployAnswer = if ($NoClaspDeploy) { "N" } else { Ask-Default "Run clasp deploy? Y/N" "Y" }

  $deployDescription = ""

  if (Test-Yes $claspDeployAnswer) {
    $deployDescription = Ask-Default "clasp deploy description" $CommitMessage
  }

  Write-Host ""
  Write-Host "==== Confirm settings ====" -ForegroundColor Cyan
  Write-Host "Commit message       : $CommitMessage"
  Write-Host "Git pull --rebase    : $pullAnswer"
  Write-Host "clasp push           : $claspPushAnswer"
  Write-Host "clasp deploy         : $claspDeployAnswer"
  if ($deployDescription) {
    Write-Host "deploy description   : $deployDescription"
  }

  $confirm = Ask-Default "Run now? Y/N" "Y"

  if (-not (Test-Yes $confirm)) {
    Write-Host "Canceled." -ForegroundColor Yellow
    exit 0
  }

  Write-Host ""
  Write-Host "==== Sync Apps Script config ====" -ForegroundColor Cyan

  $syncClasp = Join-Path $repoRoot "scripts/sync-clasp-from-config.ps1"
  if (Test-Path $syncClasp) {
    & $syncClasp
    if ($LASTEXITCODE -ne 0) {
      throw "sync-clasp-from-config.ps1 failed"
    }
  } else {
    Write-Host "sync-clasp-from-config.ps1 not found. Skip." -ForegroundColor Yellow
  }

  $syncAppConfig = Join-Path $repoRoot "scripts/sync-appscript-config-from-config.ps1"
  if (Test-Path $syncAppConfig) {
    & $syncAppConfig
    if ($LASTEXITCODE -ne 0) {
      throw "sync-appscript-config-from-config.ps1 failed"
    }
  } else {
    Write-Host "sync-appscript-config-from-config.ps1 not found. Skip." -ForegroundColor Yellow
  }

  $newWebAppUrl = ""

  if ((Test-Yes $claspPushAnswer) -or (Test-Yes $claspDeployAnswer)) {
    if (-not (Test-Path $appsScriptDir)) {
      throw "apps-script folder not found."
    }

    $claspConfigPath = Join-Path $appsScriptDir ".clasp.json"

    if (-not (Test-Path $claspConfigPath)) {
      throw "apps-script/.clasp.json not found."
    }

    if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) {
      throw "clasp command not found."
    }

    Push-Location $appsScriptDir

    try {
      if (Test-Yes $claspPushAnswer) {
        Write-Host ""
        Write-Host "==== clasp push ====" -ForegroundColor Cyan
        clasp push
      }

      if (Test-Yes $claspDeployAnswer) {
        Write-Host ""
        Write-Host "==== clasp deploy ====" -ForegroundColor Cyan

        $deploymentId = Get-ConfigDeploymentId
        Write-Host "Deployment ID from config.json: $deploymentId"
        clasp deploy -i $deploymentId -d "$deployDescription" 2>&1
Push-Location $appsScriptDir
      }
    }
    finally {
      Pop-Location
    }
  }

  Write-Host ""
  Write-Host "==== Git status ====" -ForegroundColor Cyan
  git status --short

  $changes = git status --short

  if ($changes) {
    Write-Host ""
    Write-Host "==== Git add / commit ====" -ForegroundColor Cyan
    git add -A
    git commit -m "$CommitMessage"
  } else {
    Write-Host "No Git changes to commit." -ForegroundColor Green
  }

  if (Test-Yes $pullAnswer) {
    Write-Host ""
    Write-Host "==== Git pull --rebase ====" -ForegroundColor Cyan
    git pull --rebase origin $branch
  }

  Write-Host ""
  Write-Host "==== Git push ====" -ForegroundColor Cyan

  $upstream = ""
  try {
    $upstream = (git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null).Trim()
  } catch {}

  if ($upstream) {
    git push
  } else {
    git push -u origin $branch
  }

  Write-Host ""
  Write-Host "==== Done ====" -ForegroundColor Green
  git status --short

  if (-not $NoOpenCode) {
    if (Get-Command code -ErrorAction SilentlyContinue) {
      code .
    }
  }
}
finally {
  Pop-Location
}


