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

  return @("Y", "YES", "是", "1", "TRUE") -contains $Value.ToUpper()
}

function New-AutoCommitMessage {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  return "update skhpsv2 $stamp"
}

try {
  Write-Host "==== skhpsv2 push ====" -ForegroundColor Cyan
  Write-Host "Repo: $repoRoot"

  if (-not (Test-Path ".\.git")) {
    throw "錯誤：目前不是 Git repo 根目錄。"
  }

  $branch = (git branch --show-current).Trim()

  if (-not $branch) {
    throw "錯誤：無法取得目前 Git branch。"
  }

  Write-Host "Branch: $branch"

  $appsScriptDir = Join-Path $repoRoot "apps-script"
  $hasAppsScriptDir = Test-Path $appsScriptDir
  $hasClaspConfig = Test-Path (Join-Path $appsScriptDir ".clasp.json")

  Write-Host ""
  Write-Host "==== 一次輸入本次設定 ====" -ForegroundColor Yellow

  if (-not $CommitMessage) {
    if ($ManualCommitMessage) {
      $CommitMessage = Read-Host "Commit message"
    } else {
      $autoMessage = New-AutoCommitMessage
      $mode = Ask-Default "Commit message 模式：A=自動產生，M=手動輸入" "A"

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

  $pullAnswer = if ($NoPullBeforePush) { "N" } else { Ask-Default "Push 前先 git pull --rebase" "Y" }
  $claspPushAnswer = if ($NoClaspPush) { "N" } else { Ask-Default "先 clasp push Apps Script" "Y" }
  $claspDeployAnswer = if ($NoClaspDeploy) { "N" } else { Ask-Default "執行 clasp deploy" "Y" }

  $deployDescription = ""

  if (Test-Yes $claspDeployAnswer) {
    $deployDescription = Ask-Default "clasp deploy description" $CommitMessage
  }

  Write-Host ""
  Write-Host "==== 本次設定確認 ====" -ForegroundColor Cyan
  Write-Host "Commit message       : $CommitMessage"
  Write-Host "Git pull --rebase    : $pullAnswer"
  Write-Host "clasp push           : $claspPushAnswer"
  Write-Host "clasp deploy         : $claspDeployAnswer"
  if ($deployDescription) {
    Write-Host "deploy description   : $deployDescription"
  }

  $confirm = Ask-Default "確認執行" "Y"

  if (-not (Test-Yes $confirm)) {
    Write-Host "已取消。" -ForegroundColor Yellow
    exit 0
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
    Write-Host "沒有 Git 變更需要 commit。" -ForegroundColor Green
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

  if ((Test-Yes $claspPushAnswer) -or (Test-Yes $claspDeployAnswer)) {
    if (-not $hasAppsScriptDir) {
      throw "錯誤：找不到 apps-script 資料夾，無法執行 clasp。"
    }

    if (-not $hasClaspConfig) {
      throw "錯誤：找不到 apps-script\.clasp.json，無法執行 clasp。"
    }

    if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) {
      throw "錯誤：找不到 clasp 指令。請確認已安裝 @google/clasp 並已登入。"
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
        clasp deploy -d "$deployDescription"
      }
    }
    finally {
      Pop-Location
    }
  }

  Write-Host ""
  Write-Host "==== 完成 ====" -ForegroundColor Green
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