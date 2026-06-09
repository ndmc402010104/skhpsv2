# 檔案位置：skhpsv2/scripts/push.ps1
# 時間戳記：2026-06-09 21:05 UTC+8
# 用途：skhpsv2 中文 push 工具；dev 為最新工作版，prod 為穩定正式版；支援前端 GitHub 與 Apps Script 後端部署。
# 規則：
# - dev-skhpsv2 = 最新工作版 / 測試版 / 換電腦優先抓。
# - skhpsv2 = 正式穩定版 / 測好才推。
# - 預設 Enter = 推測試版 dev。
# - Apps Script 後端只放在 apps-script/。
# - skhpsv2 根目錄不可有 .clasp.json。
# - clasp deploy 一律讀 config.json 的 api.deploymentId，使用 clasp deploy -i，不建立新的 deployment。
# - 不自動改 config.json api.webAppUrl。
# - 目前 dev/prod 前端共用同一支 Apps Script deployment；推後端會影響 dev/prod 兩邊前端可呼叫到的 API。

param(
  [ValidateSet(
    "menu",
    "status",
    "git-dev",
    "git-prod",
    "git-both",
    "backend-dev",
    "backend-prod",
    "backend-both",
    "backend-only",
    "setup-remotes"
  )]
  [string]$Mode = "menu"
)

$ErrorActionPreference = "Stop"

try {
  chcp 65001 | Out-Null
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
  $OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {}

$Targets = @{
  dev = [ordered]@{
    Key = "dev"
    Env = "dev"
    Label = "測試版 dev-skhpsv2"
    Remote = "dev"
    RemoteBranch = "main"
    ExpectedUrl = "https://github.com/ndmc402010104/dev-skhpsv2.git"
    ExpectedCName = "dev-skhps.jonaminz.com"
  }
  prod = [ordered]@{
    Key = "prod"
    Env = "prod"
    Label = "正式版 skhpsv2"
    Remote = "origin"
    RemoteBranch = "main"
    ExpectedUrl = "https://github.com/ndmc402010104/skhpsv2.git"
    ExpectedCName = "skhps.jonaminz.com"
  }
}

function Get-RepoRoot {
  $here = (Resolve-Path $PSScriptRoot).Path
  if (Test-Path (Join-Path $here ".git")) { return $here }

  $parent = (Resolve-Path (Join-Path $here "..")).Path
  if (Test-Path (Join-Path $parent ".git")) { return $parent }

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
  if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
  return $answer.Trim()
}

function Test-Yes {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
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
  if ([string]::IsNullOrWhiteSpace($branch)) { throw "無法取得目前 Git branch。" }
  return $branch
}

function Get-RemoteUrl {
  param([string]$Remote)
  try { return (git remote get-url $Remote 2>$null).Trim() } catch { return "" }
}

function Set-RemoteIfMissingOrWrong {
  param([hashtable]$Target)

  $remote = [string]$Target.Remote
  $expected = [string]$Target.ExpectedUrl
  $actual = Get-RemoteUrl -Remote $remote

  if ([string]::IsNullOrWhiteSpace($actual)) {
    Write-Host "新增 remote：$remote -> $expected" -ForegroundColor Cyan
    git remote add $remote $expected
    return
  }

  if ($actual -ne $expected) {
    Write-Host "修正 remote：$remote" -ForegroundColor Yellow
    Write-Host "  原本：$actual"
    Write-Host "  改成：$expected"
    git remote set-url $remote $expected
  }
}

function Confirm-RemoteTarget {
  param([hashtable]$Target)

  $remote = [string]$Target.Remote
  $expected = [string]$Target.ExpectedUrl
  $actual = Get-RemoteUrl -Remote $remote

  if ([string]::IsNullOrWhiteSpace($actual)) {
    throw "找不到 remote：$remote。請先執行 setup-remotes 或手動設定：git remote add $remote $expected"
  }

  if ($actual -ne $expected) {
    Write-Host "" -ForegroundColor Yellow
    Write-Host "警告：$($Target.Label) remote URL 與預期不同。" -ForegroundColor Yellow
    Write-Host "目前：$actual" -ForegroundColor Yellow
    Write-Host "預期：$expected" -ForegroundColor Yellow
    $answer = Ask-Default "仍要繼續？Y/N" "N"
    if (!(Test-Yes $answer)) {
      throw "已取消，請先修正 remote：git remote set-url $remote $expected"
    }
  }
}

function Setup-Remotes {
  Stop-IfBadRepo
  Set-RemoteIfMissingOrWrong -Target $Targets.dev
  Set-RemoteIfMissingOrWrong -Target $Targets.prod
  Write-Host "" -ForegroundColor Cyan
  Write-Host "Remote 已設定：" -ForegroundColor Green
  git remote -v
}

function Get-CNameValue {
  if (!(Test-Path ".\CNAME")) { return "" }
  return (Get-Content ".\CNAME" -Raw -Encoding UTF8).Trim()
}

function Set-CNameForTarget {
  param([hashtable]$Target)

  $expected = [string]$Target.ExpectedCName
  [System.IO.File]::WriteAllText(
    (Join-Path $repoRoot "CNAME"),
    $expected + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "CNAME -> $expected" -ForegroundColor Green
}

function Read-JsonFile {
  param([string]$Path)
  if (!(Test-Path $Path)) { return $null }
  return Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Object
  )

  $Object |
    ConvertTo-Json -Depth 50 |
    Set-Content $Path -Encoding UTF8
}

function Set-ConfigEnvForTarget {
  param([hashtable]$Target)

  $configPath = Join-Path $repoRoot "config.json"
  $config = Read-JsonFile -Path $configPath
  if ($null -eq $config) { throw "找不到 config.json。" }

  $targetEnv = [string]$Target.Env

  if ($config.PSObject.Properties.Name -contains "env") {
    $config.env = $targetEnv
  } else {
    $config | Add-Member -NotePropertyName "env" -NotePropertyValue $targetEnv
  }

  Write-JsonFile -Path $configPath -Object $config
  Write-Host "config.json env -> $targetEnv" -ForegroundColor Green
}

function Get-VersionParts {
  param([string]$VersionText)

  if ($VersionText -match 'v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)') {
    return [ordered]@{
      Major = [int]$Matches.major
      Minor = [int]$Matches.minor
      Patch = [int]$Matches.patch
    }
  }

  return [ordered]@{
    Major = 0
    Minor = 1
    Patch = 0
  }
}

function Update-VersionJsonForTarget {
  param(
    [hashtable]$Target,
    [switch]$AskVersion
  )

  $versionPath = Join-Path $repoRoot "version.json"
  if (!(Test-Path $versionPath)) {
    Write-Host "找不到 version.json，略過版本更新。" -ForegroundColor Yellow
    return
  }

  $json = Read-JsonFile -Path $versionPath
  $targetEnv = [string]$Target.Env
  $current = ""

  if ($json.PSObject.Properties.Name -contains "version") {
    $current = [string]$json.version
  }

  $parts = Get-VersionParts -VersionText $current
  $major = [int]$parts.Major
  $minor = [int]$parts.Minor
  $patch = [int]$parts.Patch

  $choice = "4"

  if ($AskVersion) {
    Write-Host "" -ForegroundColor Cyan
    Write-Host "目前版本：$current" -ForegroundColor Cyan
    Write-Host "版本更新："
    Write-Host "1. patch：小修改，版號 +0.0.1，並更新時間"
    Write-Host "2. minor：新增功能，版號 +0.1.0，並更新時間"
    Write-Host "3. major：大改版，版號 +1.0.0，並更新時間"
    Write-Host "4. none：不改版號，只更新時間，預設"
    Write-Host ""

    $choice = Read-Host "輸入 1/2/3/4，Enter = 4 none"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "4" }
    $choice = $choice.Trim().ToLowerInvariant()
  }

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
    Write-Host "不支援的選項，視為 none。" -ForegroundColor Yellow
  }

  $timestamp = Get-Date -Format "yyyyMMddHHmm"
  $updatedAt = (Get-Date -Format "yyyy-MM-dd HH:mm") + " UTC+8"
  $newVersion = "$targetEnv v$major.$minor.$patch-$targetEnv-$timestamp"

  if ($json.PSObject.Properties.Name -contains "env") {
    $json.env = $targetEnv
  } else {
    $json | Add-Member -NotePropertyName "env" -NotePropertyValue $targetEnv
  }

  if ($json.PSObject.Properties.Name -contains "version") {
    $json.version = $newVersion
  } else {
    $json | Add-Member -NotePropertyName "version" -NotePropertyValue $newVersion
  }

  if ($json.PSObject.Properties.Name -contains "updatedAt") {
    $json.updatedAt = $updatedAt
  } else {
    $json | Add-Member -NotePropertyName "updatedAt" -NotePropertyValue $updatedAt
  }

  Write-JsonFile -Path $versionPath -Object $json

  Write-Host "version.json -> $newVersion" -ForegroundColor Green
}

function Prepare-FrontendTargetState {
  param(
    [hashtable]$Target,
    [switch]$AskVersion
  )

  Write-Host "" -ForegroundColor Cyan
  Write-Host "==== 套用前端目標狀態：$($Target.Label) ====" -ForegroundColor Cyan
  Set-CNameForTarget -Target $Target
  Set-ConfigEnvForTarget -Target $Target
  Update-VersionJsonForTarget -Target $Target -AskVersion:$AskVersion
}

function Show-Status {
  Stop-IfBadRepo

  Write-Host ""
  Write-Host "==== 目前狀態 ====" -ForegroundColor Cyan
  Write-Host "專案：$repoRoot"
  Write-Host "分支：$(Get-CurrentBranch)"

  Write-Host ""
  Write-Host "Remote：" -ForegroundColor Cyan
  git remote -v

  Write-Host ""
  Write-Host "CNAME：" -ForegroundColor Cyan
  $cname = Get-CNameValue
  if ([string]::IsNullOrWhiteSpace($cname)) { Write-Host "沒有 CNAME 檔" -ForegroundColor Yellow } else { Write-Host $cname }

  Write-Host ""
  Write-Host "config/version：" -ForegroundColor Cyan
  try {
    $config = Read-JsonFile -Path (Join-Path $repoRoot "config.json")
    Write-Host "config.env：$($config.env)"
    Write-Host "api.webAppUrl：$($config.api.webAppUrl)"
  } catch {
    Write-Host "config.json 讀取失敗：$($_.Exception.Message)" -ForegroundColor Red
  }

  try {
    $version = Read-JsonFile -Path (Join-Path $repoRoot "version.json")
    Write-Host "version.env：$($version.env)"
    Write-Host "version：$($version.version)"
    Write-Host "updatedAt：$($version.updatedAt)"
  } catch {
    Write-Host "version.json 讀取失敗或不存在。" -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "Git 變更：" -ForegroundColor Cyan
  $status = git status --short
  if ($status) { git status --short } else { Write-Host "乾淨，沒有未提交變更。" -ForegroundColor Green }

  Write-Host ""
  Write-Host "Apps Script：" -ForegroundColor Cyan
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
  param([string]$Prefix)
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  if ([string]::IsNullOrWhiteSpace($Prefix)) { $Prefix = "update skhpsv2" }
  return "$Prefix $stamp"
}

function Ask-CommitMessage {
  param([string]$Prefix)
  $auto = New-AutoCommitMessage -Prefix $Prefix

  Write-Host ""
  Write-Host "Commit 訊息：" -ForegroundColor Cyan
  Write-Host "直接 Enter = 使用自動訊息"
  Write-Host "有輸入文字 = 使用你輸入的內容"
  Write-Host ""

  $manual = Read-Host "Commit message，Enter = $auto"
  if ([string]::IsNullOrWhiteSpace($manual)) { return $auto }
  return $manual.Trim()
}

function Get-DeploymentIdFromConfig {
  $configPath = Join-Path $repoRoot "config.json"
  $config = Read-JsonFile -Path $configPath
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
    if ($LASTEXITCODE -ne 0) { throw "sync-clasp-from-config.ps1 失敗。" }
  } else {
    Write-Host "找不到 sync-clasp-from-config.ps1，略過。" -ForegroundColor Yellow
  }

  if (Test-Path $syncAppConfig) {
    & $syncAppConfig
    if ($LASTEXITCODE -ne 0) { throw "sync-appscript-config-from-config.ps1 失敗。" }
  } else {
    Write-Host "找不到 sync-appscript-config-from-config.ps1，略過。" -ForegroundColor Yellow
  }
}

function Invoke-ClaspDeploy {
  param([string]$DeployDescription)

  $appsScriptDir = Join-Path $repoRoot "apps-script"

  if (!(Test-Path $appsScriptDir)) { throw "找不到 apps-script 資料夾。" }
  if (!(Test-Path (Join-Path $appsScriptDir ".clasp.json"))) { throw "找不到 apps-script/.clasp.json。" }
  if (!(Get-Command clasp -ErrorAction SilentlyContinue)) { throw "找不到 clasp 指令，請先安裝或登入 clasp。" }

  Write-Host "" -ForegroundColor Yellow
  Write-Host "注意：目前 dev/prod 前端共用同一支 Apps Script deployment。" -ForegroundColor Yellow
  Write-Host "這次 clasp deploy 會更新同一個 Web App endpoint，dev/prod 都會打到更新後的後端。" -ForegroundColor Yellow
  Write-Host "" -ForegroundColor Yellow

  $confirm = Ask-Default "確定要 deploy Apps Script？Y/N" "Y"
  if (!(Test-Yes $confirm)) { throw "已取消 Apps Script deploy。" }

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

function Invoke-GitCommitIfNeeded {
  param([string]$CommitMessage)

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
}

function Invoke-GitPushTarget {
  param([hashtable]$Target)

  Confirm-RemoteTarget -Target $Target

  $remote = [string]$Target.Remote
  $branch = [string]$Target.RemoteBranch

  Write-Host ""
  Write-Host ("推送到 " + $Target.Label + "：" + $remote + "/" + $branch) -ForegroundColor Cyan
  git push $remote HEAD:$branch
}

function Invoke-GitSingleTargetWorkflow {
  param(
    [hashtable]$Target,
    [switch]$WithAppsScript
  )

  Stop-IfBadRepo
  Save-VSCodeTabs

  Write-Host ""
  if ($WithAppsScript) {
    Write-Host "==== 推 Apps Script + GitHub：$($Target.Label) ====" -ForegroundColor Cyan
  } else {
    Write-Host "==== 只推 GitHub：$($Target.Label) ====" -ForegroundColor Cyan
  }

  Write-Host "目前分支：$(Get-CurrentBranch)"
  Write-Host "目標：$($Target.Remote)/$($Target.RemoteBranch)"
  Write-Host "CNAME：$($Target.ExpectedCName)"
  Write-Host "env：$($Target.Env)"

  Prepare-FrontendTargetState -Target $Target -AskVersion
  $prefix = if ($WithAppsScript) { "backend + frontend $($Target.Env)" } else { "frontend $($Target.Env)" }
  $commitMessage = Ask-CommitMessage -Prefix $prefix
  $deployDescription = $commitMessage

  if ($WithAppsScript) {
    $deployDescription = Ask-Default "Apps Script deploy description" $commitMessage
  }

  Write-Host ""
  Write-Host "最後確認：" -ForegroundColor Cyan
  Write-Host "流程：$(if ($WithAppsScript) { 'Apps Script + GitHub' } else { '只推 GitHub' })"
  Write-Host "目標：$($Target.Label)"
  Write-Host "Commit：$commitMessage"
  if ($WithAppsScript) { Write-Host "Deploy description：$deployDescription" }
  Write-Host ""

  $confirm = Ask-Default "確定執行？Y/N" "Y"
  if (!(Test-Yes $confirm)) {
    Write-Host "已取消。" -ForegroundColor Yellow
    return
  }

  if ($WithAppsScript) {
    Invoke-ClaspDeploy -DeployDescription $deployDescription
  }

  Invoke-GitCommitIfNeeded -CommitMessage $commitMessage
  Invoke-GitPushTarget -Target $Target

  Write-Host ""
  Write-Host "==== 完成 ====" -ForegroundColor Green
  git status --short
}

function Invoke-GitBothWorkflow {
  param([switch]$WithAppsScript)

  Stop-IfBadRepo
  Save-VSCodeTabs

  Write-Host ""
  if ($WithAppsScript) {
    Write-Host "==== Apps Script + dev/prod 兩邊 GitHub ====" -ForegroundColor Cyan
  } else {
    Write-Host "==== dev/prod 兩邊 GitHub ====" -ForegroundColor Cyan
  }

  Write-Host "兩邊都 push 會產生 target-specific commit："
  Write-Host "1. 先套 dev CNAME/env/version -> commit -> push dev/main"
  Write-Host "2. 再套 prod CNAME/env/version -> commit -> push origin/main"
  Write-Host "3. 最後把本機切回 dev CNAME/env/version -> commit -> push dev/main"
  Write-Host ""

  $confirmBoth = Ask-Default "確定要兩邊都推？Y/N" "N"
  if (!(Test-Yes $confirmBoth)) {
    Write-Host "已取消。" -ForegroundColor Yellow
    return
  }

  if ($WithAppsScript) {
    $deployDescription = Ask-Default "Apps Script deploy description" (New-AutoCommitMessage -Prefix "backend deploy")
    Invoke-ClaspDeploy -DeployDescription $deployDescription
  }

  Prepare-FrontendTargetState -Target $Targets.dev -AskVersion
  $msgDev = Ask-CommitMessage -Prefix "frontend dev"
  Invoke-GitCommitIfNeeded -CommitMessage $msgDev
  Invoke-GitPushTarget -Target $Targets.dev

  Prepare-FrontendTargetState -Target $Targets.prod -AskVersion
  $msgProd = Ask-CommitMessage -Prefix "release prod"
  Invoke-GitCommitIfNeeded -CommitMessage $msgProd
  Invoke-GitPushTarget -Target $Targets.prod

  Write-Host ""
  Write-Host "把本機工作狀態切回 dev，避免之後換電腦/繼續開發抓到 prod CNAME。" -ForegroundColor Cyan
  Prepare-FrontendTargetState -Target $Targets.dev
  Invoke-GitCommitIfNeeded -CommitMessage (New-AutoCommitMessage -Prefix "restore dev state")
  Invoke-GitPushTarget -Target $Targets.dev

  Write-Host ""
  Write-Host "==== 完成：本機已回到 dev 工作狀態 ====" -ForegroundColor Green
  git status --short
}

function Invoke-BackendOnlyWorkflow {
  Stop-IfBadRepo
  Save-VSCodeTabs

  Write-Host ""
  Write-Host "==== 只 deploy Apps Script，不推 GitHub ====" -ForegroundColor Cyan
  Write-Host "注意：不建議常用，因為 apps-script/ 程式碼可能沒有同步 commit 到 dev repo。"
  $deployDescription = Ask-Default "Apps Script deploy description" (New-AutoCommitMessage -Prefix "backend deploy")

  $confirm = Ask-Default "確定只 deploy Apps Script？Y/N" "N"
  if (!(Test-Yes $confirm)) {
    Write-Host "已取消。" -ForegroundColor Yellow
    return
  }

  Invoke-ClaspDeploy -DeployDescription $deployDescription
  Write-Host "Apps Script deploy 完成。GitHub 未推送。" -ForegroundColor Green
}

function Show-Menu {
  while ($true) {
    Write-Host ""
    Write-Host "==== skhpsv2 push ====" -ForegroundColor Cyan
    Write-Host "專案：$repoRoot"
    Write-Host "目前分支：$(Get-CurrentBranch)"
    Write-Host ""
    Write-Host "請選擇："
    Write-Host "1. 推測試版 dev-skhpsv2，預設；只推 GitHub 前端"
    Write-Host "2. 推正式版 skhpsv2；只推 GitHub 前端"
    Write-Host "3. 測試版 + 正式版都 push；只推 GitHub 前端"
    Write-Host "4. 推 Apps Script 後端 + 測試版 dev-skhpsv2，常用於後端測試"
    Write-Host "5. 推 Apps Script 後端 + 正式版 skhpsv2，正式發布才用"
    Write-Host "6. 推 Apps Script 後端 + 測試版 + 正式版，少用"
    Write-Host "7. 只 deploy Apps Script，不推 GitHub，不建議常用"
    Write-Host "8. 看狀態"
    Write-Host "9. 修正 remotes"
    Write-Host "0. 離開"
    Write-Host ""

    $choice = Read-Host "輸入數字，Enter = 1 測試版"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

    switch ($choice.Trim()) {
      "1" { Invoke-GitSingleTargetWorkflow -Target $Targets.dev }
      "2" { Invoke-GitSingleTargetWorkflow -Target $Targets.prod }
      "3" { Invoke-GitBothWorkflow }
      "4" { Invoke-GitSingleTargetWorkflow -Target $Targets.dev -WithAppsScript }
      "5" { Invoke-GitSingleTargetWorkflow -Target $Targets.prod -WithAppsScript }
      "6" { Invoke-GitBothWorkflow -WithAppsScript }
      "7" { Invoke-BackendOnlyWorkflow }
      "8" { Show-Status }
      "9" { Setup-Remotes }
      "0" { return }
      default { Write-Host "請輸入 0-9。" -ForegroundColor Yellow }
    }
  }
}

try {
  Stop-IfBadRepo

  if ($Mode -eq "status") {
    Show-Status
  } elseif ($Mode -eq "setup-remotes") {
    Setup-Remotes
  } elseif ($Mode -eq "git-dev") {
    Invoke-GitSingleTargetWorkflow -Target $Targets.dev
  } elseif ($Mode -eq "git-prod") {
    Invoke-GitSingleTargetWorkflow -Target $Targets.prod
  } elseif ($Mode -eq "git-both") {
    Invoke-GitBothWorkflow
  } elseif ($Mode -eq "backend-dev") {
    Invoke-GitSingleTargetWorkflow -Target $Targets.dev -WithAppsScript
  } elseif ($Mode -eq "backend-prod") {
    Invoke-GitSingleTargetWorkflow -Target $Targets.prod -WithAppsScript
  } elseif ($Mode -eq "backend-both") {
    Invoke-GitBothWorkflow -WithAppsScript
  } elseif ($Mode -eq "backend-only") {
    Invoke-BackendOnlyWorkflow
  } else {
    Show-Menu
  }
}
finally {
  Pop-Location
}