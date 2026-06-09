# 檔案位置：skhpsv2/scripts/push.ps1
# 時間戳記：2026-06-09 13:45 UTC+8
# 用途：skhpsv2 簡化中文 push 工具；平常推 GitHub，必要時同步 Apps Script 後端；none 會保留版號但刷新版本時間。
# 規則：
# - skhpsv2 根目錄不可有 .clasp.json。
# - Apps Script 後端只放在 apps-script/。
# - clasp deploy 一律讀 config.json 的 api.deploymentId，使用 clasp deploy -i。
# - 不建立新的 Apps Script deployment。
# - 不自動改 config.json api.webAppUrl。

param(
  [ValidateSet("menu", "status", "git", "backend")]
  [string]$Mode = "menu"
)

$ErrorActionPreference = "Stop"

try {
  chcp 65001 | Out-Null
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
  $OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {}

function Get-RepoRoot {
  $here = (Resolve-Path $PSScriptRoot).Path

  if (Test-Path (Join-Path $here ".git")) {
    return $here
  }

  $parent = (Resolve-Path (Join-Path $here "..")).Path

  if (Test-Path (Join-Path $parent ".git")) {
    return $parent
  }

  throw "找不到 Git repo 根目錄。請確認你在 skhpsv2 專案內。"
}

$repoRoot = Get-RepoRoot
Push-Location $repoRoot

function Ask-Default {
  param(
    [string]$Question,
    [string]$Default
  )

  $answer = Read-Host ($Question + " [" + $Default + "]")

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
  return @("Y", "YES", "1", "TRUE", "是", "好") -contains $v
}

function Stop-IfBadRepo {
  if (!(Test-Path ".\.git")) {
    throw "目前位置不是 Git repo 根目錄。"
  }

  if (Test-Path ".\.clasp.json") {
    throw "錯誤：skhpsv2 根目錄不應該有 .clasp.json。Apps Script 應放在 apps-script/。"
  }

  if (!(Test-Path ".\config.json")) {
    throw "找不到 config.json。"
  }
}

function Get-CurrentBranch {
  $branch = (git branch --show-current).Trim()

  if ([string]::IsNullOrWhiteSpace($branch)) {
    throw "無法取得目前 Git branch。"
  }

  return $branch
}

function Show-Status {
  Stop-IfBadRepo

  Write-Host ""
  Write-Host "==== 目前狀態 ====" -ForegroundColor Cyan
  Write-Host "專案：$repoRoot"
  Write-Host "分支：$(Get-CurrentBranch)"

  Write-Host ""
  Write-Host "Git 變更：" -ForegroundColor Cyan
  $status = git status --short

  if ($status) {
    git status --short
  } else {
    Write-Host "乾淨，沒有未提交變更。" -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "檔案檢查：" -ForegroundColor Cyan

  if (Test-Path ".\config.json") {
    Write-Host "config.json：OK" -ForegroundColor Green
  } else {
    Write-Host "config.json：找不到" -ForegroundColor Red
  }

  if (Test-Path ".\version.json") {
    Write-Host "version.json：OK" -ForegroundColor Green
  } else {
    Write-Host "version.json：找不到，會略過版本更新" -ForegroundColor Yellow
  }

  if (Test-Path ".\apps-script\.clasp.json") {
    Write-Host "apps-script/.clasp.json：OK" -ForegroundColor Green
  } else {
    Write-Host "apps-script/.clasp.json：找不到，不能推 Apps Script" -ForegroundColor Yellow
  }

  if (Test-Path ".\.clasp.json") {
    Write-Host "根目錄 .clasp.json：錯誤，不應存在" -ForegroundColor Red
  } else {
    Write-Host "根目錄 .clasp.json：OK，沒有誤綁" -ForegroundColor Green
  }

  Write-Host ""
}

function Save-VSCodeTabs {
  $answer = Ask-Default "要先儲存所有 VS Code 分頁嗎？Y/N" "Y"

  if (!(Test-Yes $answer)) {
    Write-Host "略過 VS Code 全部儲存。" -ForegroundColor Yellow
    return
  }

  if (Get-Command code -ErrorAction SilentlyContinue) {
    try {
      code --reuse-window --command workbench.action.files.saveAll | Out-Null
      Start-Sleep -Milliseconds 800
      Write-Host "已送出 VS Code 全部儲存。" -ForegroundColor Green
    } catch {
      Write-Host "VS Code 全部儲存失敗，繼續執行。" -ForegroundColor Yellow
    }
  } else {
    Write-Host "找不到 code 指令，略過 VS Code 全部儲存。" -ForegroundColor Yellow
  }
}

function New-AutoCommitMessage {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  return "update skhpsv2 $stamp"
}

function Ask-CommitMessage {
  $auto = New-AutoCommitMessage

  Write-Host ""
  Write-Host "Commit 訊息：" -ForegroundColor Cyan
  Write-Host "直接 Enter = 使用自動訊息"
  Write-Host "有輸入文字 = 使用你輸入的內容"
  Write-Host ""

  $manual = Read-Host "Commit message，Enter = $auto"

  if ([string]::IsNullOrWhiteSpace($manual)) {
    return $auto
  }

  return $manual.Trim()
}


function Update-VersionJson {
  $versionPath = Join-Path $repoRoot "version.json"

  if (!(Test-Path $versionPath)) {
    Write-Host "找不到 version.json，略過版本更新。" -ForegroundColor Yellow
    return
  }

  $json = Get-Content $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json

  if (!($json.PSObject.Properties.Name -contains "version")) {
    Write-Host "version.json 沒有 version 欄位，略過。" -ForegroundColor Yellow
    return
  }

  $current = [string]$json.version

  if ($current -notmatch 'v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)') {
    Write-Host "無法解析目前版本：$current，略過。" -ForegroundColor Yellow
    return
  }

  $major = [int]$Matches.major
  $minor = [int]$Matches.minor
  $patch = [int]$Matches.patch

  $envName = "prod"

  if ($json.PSObject.Properties.Name -contains "env") {
    if (![string]::IsNullOrWhiteSpace([string]$json.env)) {
      $envName = [string]$json.env
    }
  } elseif ($current -match '^(?<env>[A-Za-z0-9_-]+)\s+v') {
    $envName = $Matches.env
  }

  Write-Host ""
  Write-Host "目前版本：$current" -ForegroundColor Cyan
  Write-Host "版本更新："
  Write-Host "1. patch：小修改，版號 +0.0.1，並更新時間"
  Write-Host "2. minor：新增功能，版號 +0.1.0，並更新時間"
  Write-Host "3. major：大改版，版號 +1.0.0，並更新時間"
  Write-Host "4. none：不改版號，只更新時間，預設"
  Write-Host ""

  $choice = Read-Host "輸入 1/2/3/4，Enter = 4 none"

  if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = "4"
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
    Write-Host "選擇 none：保留 v$major.$minor.$patch，只更新 version 時間。" -ForegroundColor Yellow
  } else {
    Write-Host "不支援的選項，略過版本更新。" -ForegroundColor Yellow
    return
  }

  $timestamp = Get-Date -Format "yyyyMMddHHmm"
  $updatedAt = (Get-Date -Format "yyyy-MM-dd HH:mm") + " UTC+8"
  $newVersion = "$envName v$major.$minor.$patch-$envName-$timestamp"

  $json.version = $newVersion

  if ($json.PSObject.Properties.Name -contains "updatedAt") {
    $json.updatedAt = $updatedAt
  } else {
    $json | Add-Member -NotePropertyName "updatedAt" -NotePropertyValue $updatedAt
  }

  $json |
    ConvertTo-Json -Depth 20 |
    Set-Content $versionPath -Encoding UTF8

  Write-Host ""
  Write-Host "version.json 已更新：" -ForegroundColor Green
  Write-Host "  $current"
  Write-Host "  -> $newVersion"
  Write-Host "  updatedAt：$updatedAt"
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
    throw "config.json 找不到 api.deploymentId。"
  }

  return $deploymentId
}

function Sync-AppsScriptConfig {
  Write-Host ""
  Write-Host "==== 同步 Apps Script 設定 ====" -ForegroundColor Cyan

  $syncClasp = Join-Path $repoRoot "scripts\sync-clasp-from-config.ps1"
  $syncAppConfig = Join-Path $repoRoot "scripts\sync-appscript-config-from-config.ps1"

  if (Test-Path $syncClasp) {
    & $syncClasp
    if ($LASTEXITCODE -ne 0) {
      throw "sync-clasp-from-config.ps1 失敗。"
    }
  } else {
    Write-Host "找不到 sync-clasp-from-config.ps1，略過。" -ForegroundColor Yellow
  }

  if (Test-Path $syncAppConfig) {
    & $syncAppConfig
    if ($LASTEXITCODE -ne 0) {
      throw "sync-appscript-config-from-config.ps1 失敗。"
    }
  } else {
    Write-Host "找不到 sync-appscript-config-from-config.ps1，略過。" -ForegroundColor Yellow
  }
}

function Invoke-ClaspDeploy {
  param([string]$DeployDescription)

  $appsScriptDir = Join-Path $repoRoot "apps-script"

  if (!(Test-Path $appsScriptDir)) {
    throw "找不到 apps-script 資料夾。"
  }

  if (!(Test-Path (Join-Path $appsScriptDir ".clasp.json"))) {
    throw "找不到 apps-script/.clasp.json。"
  }

  if (!(Get-Command clasp -ErrorAction SilentlyContinue)) {
    throw "找不到 clasp 指令，請先安裝或登入 clasp。"
  }

  Sync-AppsScriptConfig

  Push-Location $appsScriptDir

  try {
    Write-Host ""
    Write-Host "==== clasp push ====" -ForegroundColor Cyan
    clasp push

    Write-Host ""
    Write-Host "==== clasp deploy -i ====" -ForegroundColor Cyan
    $deploymentId = Get-DeploymentIdFromConfig

    Write-Host "使用 config.json deploymentId："
    Write-Host "  $deploymentId"

    clasp deploy -i $deploymentId -d "$DeployDescription"
  }
  finally {
    Pop-Location
  }
}

function Invoke-GitPush {
  param([string]$CommitMessage)

  $branch = Get-CurrentBranch

  Write-Host ""
  Write-Host "==== Git 狀態 ====" -ForegroundColor Cyan
  git status --short

  $changes = git status --porcelain

  if ($changes) {
    Write-Host ""
    Write-Host "==== Git add / commit ====" -ForegroundColor Cyan
    git add -A
    git commit -m "$CommitMessage"
  } else {
    Write-Host "沒有 Git 變更需要 commit。" -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "==== Git pull --rebase ====" -ForegroundColor Cyan
  git pull --rebase origin $branch

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

  Write-Host ""
  Write-Host "==== 完成 ====" -ForegroundColor Green
  git status --short
}

function Invoke-GitOnlyWorkflow {
  Stop-IfBadRepo

  Write-Host ""
  Write-Host "==== 只推 GitHub ====" -ForegroundColor Cyan
  Write-Host "適用：HTML / CSS / JS / 前端設定 / 文件"
  Write-Host "不會執行 clasp，不會碰 Apps Script。"

  Save-VSCodeTabs
  Update-VersionJson
  $commitMessage = Ask-CommitMessage

  Write-Host ""
  Write-Host "最後確認：" -ForegroundColor Cyan
  Write-Host "流程：只推 GitHub"
  Write-Host "Commit：$commitMessage"
  Write-Host "Apps Script：不處理"
  Write-Host ""

  $confirm = Ask-Default "確定執行？Y/N" "Y"

  if (!(Test-Yes $confirm)) {
    Write-Host "已取消。" -ForegroundColor Yellow
    return
  }

  Invoke-GitPush -CommitMessage $commitMessage
}

function Invoke-BackendWorkflow {
  Stop-IfBadRepo

  Write-Host ""
  Write-Host "==== 推後端 + GitHub ====" -ForegroundColor Cyan
  Write-Host "適用：有修改 apps-script/ 後端。"
  Write-Host "會執行：clasp push、clasp deploy -i、Git commit/pull/push。"

  Save-VSCodeTabs
  Update-VersionJson
  $commitMessage = Ask-CommitMessage
  $deployDescription = Ask-Default "Apps Script deploy description" $commitMessage

  Write-Host ""
  Write-Host "最後確認：" -ForegroundColor Cyan
  Write-Host "流程：推 Apps Script 後端 + GitHub"
  Write-Host "Commit：$commitMessage"
  Write-Host "Deploy description：$deployDescription"
  Write-Host ""

  $confirm = Ask-Default "確定執行？Y/N" "Y"

  if (!(Test-Yes $confirm)) {
    Write-Host "已取消。" -ForegroundColor Yellow
    return
  }

  Invoke-ClaspDeploy -DeployDescription $deployDescription
  Invoke-GitPush -CommitMessage $commitMessage
}

function Show-Menu {
  while ($true) {
    Write-Host ""
    Write-Host "==== skhpsv2 push ====" -ForegroundColor Cyan
    Write-Host "專案：$repoRoot"
    Write-Host ""
    Write-Host "請選擇："
    Write-Host "1. 看狀態"
    Write-Host "2. 只推 GitHub：前端 / CSS / HTML / JS 用"
    Write-Host "3. 推後端：Apps Script + GitHub"
    Write-Host "0. 離開"
    Write-Host ""

    $choice = Read-Host "輸入數字"

    switch ($choice) {
      "1" { Show-Status }
      "2" { Invoke-GitOnlyWorkflow }
      "3" { Invoke-BackendWorkflow }
      "0" { return }
      default { Write-Host "請輸入 0-3。" -ForegroundColor Yellow }
    }
  }
}

try {
  Stop-IfBadRepo

  if ($Mode -eq "status") {
    Show-Status
  } elseif ($Mode -eq "git") {
    Invoke-GitOnlyWorkflow
  } elseif ($Mode -eq "backend") {
    Invoke-BackendWorkflow
  } else {
    Show-Menu
  }
}
finally {
  Pop-Location
}