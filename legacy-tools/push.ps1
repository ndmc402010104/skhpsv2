# 檔案位置：專案根目錄/push.ps1
# 時間戳記：2026-06-06 10:23 UTC+8
# 用途：累加式四段部署腳本；1 只跑 Apps Script，2=1+測試版前端，3=1+2+本地確認，PROD=1+2+3+正式版；主選單輸入 PROD 即確認正式上線；README 後集中輸入測試版 commit，正式版 commit 使用預設值不再詢問；GitHub Pages 發布會同步 version.json。
# 階段：1=push app script，2=1+2 push dev-skhps，3=1+2+3 本地確認不部署正式版，PROD=1+2+3+正式版 deploy skhps。

param(
  [ValidateSet('ask','commit-only','backup-wip','dev-app','dev-skhps','dev-app-backup','dev-all','release','skhps','all','push','push-github','deploy')]
  [string]$Action = 'ask',

  [ValidateSet('ask','major','minor','patch','none')]
  [string]$Bump = 'ask',

  [string[]]$Note = @(),

  # 非互動模式可直接指定測試版 Git commit message，避免 Read-Host 無法吃 pipeline stdin。
  [string]$DevCommitMessage = '',

  # 非互動模式可直接指定本地 commit-only Git commit message。
  [string]$LocalCommitMessage = '',

  [switch]$NoSaveAllPrompt,

  [switch]$NoReadmePrompt,

  [switch]$NoGitHubPrompt,

  # 非互動模式需要直接部署正式 Apps Script API 時才使用。
  [switch]$DeployProdAppScript,

  # 若真的需要保留 Git worktree metadata，才加這個參數；本專案部署流程預設不使用 worktree。
  [switch]$SkipWorktreeMetadataRepair
)

chcp 65001 | Out-Null

[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'clasp-tools.ps1')

$rootPath = $PSScriptRoot


# 讓 Git 在腳本流程中不要跳出互動式 retry prompt；真正錯誤直接失敗，避免卡住一直問 y/n。
$env:GIT_TERMINAL_PROMPT = '0'

function Remove-GitMetadataDirectoryNoPrompt {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $true
  }

  Write-Host "清除 Git worktree metadata：$Path" -ForegroundColor Yellow

  # 若路徑內有雲端 placeholder / reparse point，先要求保留本機，再移除常見防刪屬性。
  try {
    & attrib +P -U $Path /S /D 2>$null | Out-Null
  }
  catch {
    # attrib 在非雲端路徑可能沒有作用，忽略。
  }

  Start-Sleep -Milliseconds 300

  try {
    & attrib -R -S -H $Path /S /D 2>$null | Out-Null
  }
  catch {
    # 忽略，下一步用 rmdir 實際刪除。
  }

  # 先刪 reparse point 標記，避免 Git/PowerShell 把它當一般目錄遞迴刪除時卡住。
  try {
    $items = @(Get-ChildItem -LiteralPath $Path -Force -Recurse -ErrorAction SilentlyContinue)
    foreach ($item in $items) {
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        & fsutil reparsepoint delete $item.FullName 2>$null | Out-Null
      }
    }

    $self = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($self -and (($self.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
      & fsutil reparsepoint delete $self.FullName 2>$null | Out-Null
    }
  }
  catch {
    # 沒權限或非 reparse point 時忽略，交給 rmdir。
  }

  & cmd.exe /c "rmdir /s /q `"$Path`"" 2>$null

  if (Test-Path -LiteralPath $Path) {
    Write-Host "仍無法清除：$Path" -ForegroundColor Red
    return $false
  }

  return $true
}

function Repair-GitWorktreeMetadata {
  if ($SkipWorktreeMetadataRepair) {
    return
  }

  $worktreesRoot = Join-Path $rootPath '.git\worktrees'

  if (-not (Test-Path -LiteralPath $worktreesRoot)) {
    return
  }

  Write-Host ""
  Write-Host "偵測到 .git\worktrees；本部署腳本不使用 Git worktree，先清理失效 metadata，避免 Git 反覆詢問 retry。" -ForegroundColor Yellow

  $activeCount = 0
  $failedCount = 0
  $entries = @(Get-ChildItem -LiteralPath $worktreesRoot -Force -Directory -ErrorAction SilentlyContinue)

  foreach ($entry in $entries) {
    $gitdirFile = Join-Path $entry.FullName 'gitdir'
    $looksActive = $false

    if (Test-Path -LiteralPath $gitdirFile) {
      try {
        $gitdirTarget = (Get-Content -LiteralPath $gitdirFile -Raw -ErrorAction Stop).Trim()
        if (-not [string]::IsNullOrWhiteSpace($gitdirTarget) -and (Test-Path -LiteralPath $gitdirTarget)) {
          $looksActive = $true
        }
      }
      catch {
        $looksActive = $false
      }
    }

    if ($looksActive) {
      $activeCount++
      Write-Host "保留疑似仍有效的 worktree metadata：$($entry.Name)" -ForegroundColor DarkYellow
      continue
    }

    if (-not (Remove-GitMetadataDirectoryNoPrompt -Path $entry.FullName)) {
      $failedCount++
    }
  }

  if ($activeCount -eq 0) {
    $remaining = @(Get-ChildItem -LiteralPath $worktreesRoot -Force -ErrorAction SilentlyContinue)
    if ($remaining.Count -eq 0) {
      if (-not (Remove-GitMetadataDirectoryNoPrompt -Path $worktreesRoot)) {
        $failedCount++
      }
    }
  }

  if ($failedCount -gt 0) {
    throw "仍有 Git worktree metadata 無法清除。為避免 Git 跳出 y/n retry prompt，已停止；請先用系統管理員 PowerShell 清除 .git\worktrees 後再重跑。"
  }
}

function Test-CommandExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Read-MenuChoice {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [Parameter(Mandatory = $true)]
    [hashtable]$Choices,

    [Parameter(Mandatory = $true)]
    [string]$Default
  )

  while ($true) {
    $answer = Read-Host $Message

    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $Default
    }

    $key = $answer.Trim().ToLower()

    if ($Choices.ContainsKey($key)) {
      return $Choices[$key]
    }

    Write-Host "請輸入其中一個選項：$($Choices.Keys -join ', ')；或直接按 Enter 使用預設值。" -ForegroundColor Yellow
  }
}

function Read-YesNo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [bool]$Default = $true
  )

  $suffix = if ($Default) { '[Y]' } else { '[N]' }

  while ($true) {
    $answer = Read-Host "$Message $suffix"

    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $Default
    }

    if ($answer -match '^[Yy]') {
      return $true
    }

    if ($answer -match '^[Nn]') {
      return $false
    }

    Write-Host '請輸入 Y 或 N。' -ForegroundColor Yellow
  }
}

function Request-ManualSaveBeforeContinue {
  Write-Host "無法自動儲存，請先在 VS Code 手動儲存檔案。" -ForegroundColor Yellow

  $continue = Read-Host "手動儲存後按 Enter 繼續；輸入 N 取消"

  if ($continue -match '^[Nn]$') {
    Write-Host "已取消" -ForegroundColor Red
    exit 1
  }
}

function Save-AllOpenFiles {
  if ($NoSaveAllPrompt) {
    return
  }

  Write-Host ""

  if (-not (Read-YesNo -Message "要先儲存所有 VS Code 開啟中的檔案嗎？" -Default $true)) {
    return
  }

  if (Test-CommandExists -Name 'code') {
    try {
      code --reuse-window --command workbench.action.files.saveAll

      if ($LASTEXITCODE -ne 0) {
        throw "VS Code 儲存全部指令失敗。"
      }

      Start-Sleep -Milliseconds 800

      Write-Host "已送出 VS Code 儲存全部指令" -ForegroundColor Green
    }
    catch {
      Request-ManualSaveBeforeContinue
    }
  }
  else {
    Write-Host "找不到 code 指令，所以無法自動執行 VS Code 儲存全部。" -ForegroundColor Yellow
    Request-ManualSaveBeforeContinue
  }
}

function Invoke-ClaspCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Push-Location -LiteralPath $rootPath

  try {
    $output = & clasp @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }

  if ($exitCode -ne 0) {
    throw ($output -join "`n")
  }

  if ($output) {
    Write-Host ($output -join "`n")
  }

  return @($output)
}

function Get-ClaspVersionNumberFromOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Output
  )

  foreach ($line in $Output) {
    if ($line -match '(?i)\bversion\s+(\d+)\b') {
      return $Matches[1]
    }
  }

  foreach ($line in $Output) {
    if ($line -match '\b(\d+)\b') {
      return $Matches[1]
    }
  }

  throw "無法從 clasp 輸出解析 Apps Script version number：$($Output -join ' ')"
}

function Format-ReadmeVersionText {
  param(
    [string]$Version
  )

  if ([string]::IsNullOrWhiteSpace($Version)) {
    return ''
  }

  $value = $Version.Trim()

  if ($value -match '^v') {
    return $value
  }

  return "v$value"
}

function Update-ReadmeCurrentVersions {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ReadmePath,

    [string]$GasDevVersion,

    [string]$WebDevVersion,

    [string]$WebProdVersion
  )

  if (-not (Test-Path -LiteralPath $ReadmePath)) {
    Write-Host "找不到 README.md，略過當前版本號更新。" -ForegroundColor Yellow
    return $false
  }

  $content = Get-Content -Path $ReadmePath -Raw -Encoding UTF8
  $updated = $content

  if (-not [string]::IsNullOrWhiteSpace($GasDevVersion)) {
    $gasDevText = Format-ReadmeVersionText -Version $GasDevVersion
    $updated = [regex]::Replace(
      $updated,
      '(?m)^app script測試版\s*[:：]\s*.*$',
      "app script測試版: $gasDevText"
    )
  }

  if (-not [string]::IsNullOrWhiteSpace($WebDevVersion)) {
    $webDevText = Format-ReadmeVersionText -Version $WebDevVersion
    $updated = [regex]::Replace(
      $updated,
      '(?m)^測試版\s*[:：]\s*.*$',
      "測試版: $webDevText"
    )
  }

  if (-not [string]::IsNullOrWhiteSpace($WebProdVersion)) {
    $webProdText = Format-ReadmeVersionText -Version $WebProdVersion
    $updated = [regex]::Replace(
      $updated,
      '(?m)^正式版\s*[:：]\s*.*$',
      "正式版: $webProdText"
    )
  }

  if ($updated -cne $content) {
    Set-Content -Path $ReadmePath -Value $updated -Encoding UTF8
    Write-Host "README 當前版本號已更新。" -ForegroundColor Green
    return $true
  }

  Write-Host "README 當前版本號未變更。" -ForegroundColor DarkGray
  return $false
}

function Test-GitRemoteExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteName
  )

  if (-not (Test-CommandExists -Name 'git')) {
    throw "找不到 git 指令。"
  }

  Push-Location -LiteralPath $rootPath

  try {
    $remotes = @(git remote)
  }
  finally {
    Pop-Location
  }

  return $remotes -contains $RemoteName
}

function Get-GitCurrentBranch {
  Push-Location -LiteralPath $rootPath

  try {
    $branch = (git branch --show-current).Trim()
  }
  finally {
    Pop-Location
  }

  if ([string]::IsNullOrWhiteSpace($branch)) {
    return '(detached HEAD)'
  }

  return $branch
}

function Get-GitHeadSha {
  Push-Location -LiteralPath $rootPath

  try {
    $headSha = (git rev-parse HEAD).Trim()
  }
  finally {
    Pop-Location
  }

  if ([string]::IsNullOrWhiteSpace($headSha)) {
    throw "無法讀取本機 HEAD。"
  }

  return $headSha
}

function Show-GitSnapshot {
  if (-not (Test-CommandExists -Name 'git')) {
    Write-Host "找不到 git 指令，略過 Git 狀態顯示。" -ForegroundColor Yellow
    return
  }

  Push-Location -LiteralPath $rootPath

  try {
    Write-Host ""
    Write-Host "==========================" -ForegroundColor Cyan
    Write-Host "Git 狀態" -ForegroundColor Cyan
    Write-Host "==========================" -ForegroundColor Cyan

    $branch = Get-GitCurrentBranch
    Write-Host "目前 branch: $branch" -ForegroundColor Yellow

    Write-Host ""
    Write-Host "remote -v:" -ForegroundColor Yellow
    git remote -v

    Write-Host ""
    Write-Host "git status --short:" -ForegroundColor Yellow
    git status --short
  }
  finally {
    Pop-Location
  }
}

function Invoke-GitCommitIfNeeded {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DefaultMessage,

    [string]$CommitMessage = '',

    [switch]$NoPrompt,

    [bool]$AllowSkip = $true
  )

  if ($NoGitHubPrompt) {
    Write-Host ""
    Write-Host "NoGitHubPrompt 已啟用，略過 Git commit。" -ForegroundColor Yellow
    return $false
  }

  if (-not (Test-CommandExists -Name 'git')) {
    throw "找不到 git 指令，無法 commit。"
  }

  Write-Host ""
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "Git commit" -ForegroundColor Cyan
  Write-Host "=========================="

  $finalCommitMessage = [string]$CommitMessage

  if (-not $NoPrompt -and [string]::IsNullOrWhiteSpace($finalCommitMessage)) {
    $skipText = if ($AllowSkip) { '，輸入 skip 略過 commit' } else { '' }
    $finalCommitMessage = [string](Read-Host "Git commit message（直接按 Enter 使用 '$DefaultMessage'$skipText）")
  }
  elseif ($NoPrompt) {
    Write-Host "使用預設 commit message：$DefaultMessage" -ForegroundColor DarkGray
  }

  if ($AllowSkip -and $finalCommitMessage.Trim().ToLower() -eq 'skip') {
    Write-Host "已略過 Git commit。" -ForegroundColor Yellow
    return $false
  }

  if ([string]::IsNullOrWhiteSpace($finalCommitMessage)) {
    $finalCommitMessage = $DefaultMessage
  }

  Push-Location -LiteralPath $rootPath

  try {
    git add .

    if ($LASTEXITCODE -ne 0) {
      throw "git add 失敗。"
    }

    # 等待檔案系統完成前一輪寫入，避免剛寫完版本/CNAME 就立刻讀 staged 狀態。
    Start-Sleep -Seconds 1

    $stagedFiles = git diff --cached --name-only

    if ($LASTEXITCODE -ne 0) {
      throw "無法讀取已 staged 的 git 變更。"
    }

    if (-not $stagedFiles) {
      Write-Host "沒有 staged 變更，略過 commit；後續仍可 push 目前 HEAD。" -ForegroundColor Yellow
      return $false
    }

    git commit -m $finalCommitMessage

    if ($LASTEXITCODE -ne 0) {
      throw "git commit 失敗。"
    }

    Start-Sleep -Seconds 2

    Write-Host "Git commit completed: $finalCommitMessage" -ForegroundColor Green
    return $true
  }
  finally {
    Pop-Location
  }
}

function Invoke-GitPush {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteName,

    [Parameter(Mandatory = $true)]
    [string]$RefSpec,

    [Parameter(Mandatory = $true)]
    [string]$SiteName,

    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [switch]$ForceWithLease
  )

  if ($NoGitHubPrompt) {
    Write-Host "NoGitHubPrompt 已啟用，略過 $SiteName Git push。" -ForegroundColor Yellow
    return
  }

  if (-not (Test-GitRemoteExists -RemoteName $RemoteName)) {
    if ($RemoteName -eq 'dev') {
      Write-Host "尚未設定 dev remote。" -ForegroundColor Red
      Write-Host "請先執行：" -ForegroundColor Yellow
      Write-Host "git remote add dev https://github.com/ndmc402010104/skhps-system-dev.git" -ForegroundColor Cyan
    }
    elseif ($RemoteName -eq 'origin') {
      Write-Host "尚未設定 origin remote，正式版無法推送。" -ForegroundColor Red
    }
    else {
      Write-Host "尚未設定 $RemoteName remote。" -ForegroundColor Red
    }

    throw "找不到 Git remote: $RemoteName"
  }

  Push-Location -LiteralPath $rootPath

  try {
    Write-Host ""
    if ($ForceWithLease) {
      Write-Host "推送 $SiteName：git push --force-with-lease $RemoteName $RefSpec" -ForegroundColor Cyan
      git push --force-with-lease $RemoteName $RefSpec
    }
    else {
      Write-Host "推送 $SiteName：git push $RemoteName $RefSpec" -ForegroundColor Cyan
      git push $RemoteName $RefSpec
    }

    if ($LASTEXITCODE -ne 0) {
      throw "$SiteName 推送失敗。"
    }

    Write-Host "$SiteName 推送完成：$SiteUrl" -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
}

function Confirm-GitRemoteRefMatchesHead {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteName,

    [Parameter(Mandatory = $true)]
    [string]$BranchName,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [string]$ExpectedSha
  )

  Push-Location -LiteralPath $rootPath

  try {
    if ([string]::IsNullOrWhiteSpace($ExpectedSha)) {
      $ExpectedSha = (git rev-parse HEAD).Trim()

      if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ExpectedSha)) {
        throw "無法讀取本機 HEAD。"
      }
    }

    $remoteLine = git ls-remote $RemoteName "refs/heads/$BranchName"

    if ($LASTEXITCODE -ne 0) {
      throw "無法讀取遠端 $RemoteName/$BranchName。"
    }

    if ([string]::IsNullOrWhiteSpace($remoteLine)) {
      throw "找不到遠端分支 $RemoteName/$BranchName。"
    }

    $remoteSha = (($remoteLine -split '\s+')[0]).Trim()

    if ($remoteSha -ne $ExpectedSha) {
      throw "$Label 驗證失敗：遠端 $($remoteSha.Substring(0, 7))，預期 $($ExpectedSha.Substring(0, 7))。"
    }

    Write-Host "$Label 已驗證：$RemoteName/$BranchName = $($ExpectedSha.Substring(0, 7))" -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
}


function Invoke-BackupWipToOrigin {
  param(
    [string]$SourceRef = 'HEAD',

    [string]$ExpectedSha
  )

  Write-Host ""
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "[3] 換電腦用備份 origin/wip-current" -ForegroundColor Cyan
  Write-Host "=========================="
  Write-Host "備份 $SourceRef 到 origin/wip-current；不更新任何網站。" -ForegroundColor Yellow

  Invoke-GitPush `
    -RemoteName 'origin' `
    -RefSpec "$($SourceRef):wip-current" `
    -SiteName 'origin/wip-current 工作進度備份' `
    -SiteUrl 'GitHub origin/wip-current' `
    -ForceWithLease

  Confirm-GitRemoteRefMatchesHead `
    -RemoteName 'origin' `
    -BranchName 'wip-current' `
    -Label '換電腦用備份' `
    -ExpectedSha $ExpectedSha

  Write-Host ""
  Write-Host "換電腦時可執行：" -ForegroundColor Green
  Write-Host "git fetch origin" -ForegroundColor Cyan
  Write-Host "git checkout -B wip-current origin/wip-current" -ForegroundColor Cyan
}

function Confirm-ProdPushOrExit {
  param(
    [bool]$AlreadyConfirmed = $false
  )
  Write-Host ""
  Write-Host "你即將推送正式版 skhps.jonaminz.com。" -ForegroundColor Red
  Write-Host "正式版只能從 master 分支推送。" -ForegroundColor Yellow

  $branch = Get-GitCurrentBranch

  if ($branch -ne 'master') {
    throw "目前分支是 '$branch'，正式版只能從 master 分支推送。請先手動確認 master 已包含要上線內容，再切回 master。"
  }

  if ($AlreadyConfirmed) {
    Write-Host "PROD 已在主選單確認，不再二次詢問。" -ForegroundColor Green
    return
  }

  $confirm = Read-Host "請輸入 PROD 才繼續"

  if ($confirm -ne 'PROD') {
    throw "未輸入 PROD，已取消正式版推送。"
  }
}

function Invoke-UpdateDressingFrontForConfig {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $dressingFrontPath = Join-Path $rootPath '敷料領用登錄系統\DressingFront.html'

  if (-not (Test-Path -LiteralPath $dressingFrontPath)) {
    Write-Host "找不到 DressingFront.html，略過 API URL 自動更新。" -ForegroundColor Yellow
    return
  }

  $dfContent = Get-Content -Path $dressingFrontPath -Raw -Encoding UTF8
  $dfNewContent = $dfContent

  # 自動寫入真實的 Apps Script API 部署網址。
  # dev-skhps 使用 dev DeploymentId；skhps 使用 EntryUrl / prod config。
  if ($Config.DeploymentId) {
    $realUrl = "https://script.google.com/macros/s/$($Config.DeploymentId)/exec"
    $dfNewContent = [regex]::Replace(
      $dfNewContent,
      "(APP_ENTRY_URL\s*=\s*')https://script\.google\.com/macros/s/[^/']+/exec(')",
      "`${1}$realUrl`$2"
    )
    $dfNewContent = [regex]::Replace(
      $dfNewContent,
      "(APP_PROD_URL\s*=\s*')https://script\.google\.com/macros/s/[^/']+/exec(')",
      "`${1}$($Config.EntryUrl)`$2"
    )
  }

  if ($dfContent -cne $dfNewContent) {
    Set-Content -Path $dressingFrontPath -Value $dfNewContent -Encoding UTF8
    Write-Host "Updated API URL in DressingFront.html." -ForegroundColor Green
  }
}

function Update-CnameForEnv {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev','prod')]
    [string]$DefaultEnv
  )

  $cnamePath = Join-Path $rootPath 'CNAME'
  $cname = if ($DefaultEnv -eq 'prod') {
    'skhps.jonaminz.com'
  }
  else {
    'dev-skhps.jonaminz.com'
  }

  Set-Content -Path $cnamePath -Value $cname -Encoding ascii -NoNewline
  Write-Host "CNAME synced for env=$DefaultEnv：$cname" -ForegroundColor Green
}

function Update-EnvironmentVersionConstants {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [bool]$UpdateGasDevVersion = $false,

    [bool]$UpdateWebDevVersion = $false,

    [bool]$UpdateWebProdVersion = $false
  )

  $configPath = Join-Path $rootPath '共用設定檔\Config.js'
  $footerPath = Join-Path $rootPath '共用設定檔\EnvironmentFooter.js'

  if (Test-Path -LiteralPath $configPath) {
    $configLines = Get-Content -Path $configPath -Encoding UTF8

    if ($UpdateGasDevVersion) {
      $configLines = Set-ConfigConstValue -Lines $configLines -Name 'SKH_GAS_DEV_VERSION' -Value $Version
    }

    if ($UpdateWebDevVersion) {
      $configLines = Set-ConfigConstValue -Lines $configLines -Name 'SKH_WEB_DEV_VERSION' -Value $Version
    }

    if ($UpdateWebProdVersion) {
      $configLines = Set-ConfigConstValue -Lines $configLines -Name 'SKH_WEB_PROD_VERSION' -Value $Version
    }

    [System.IO.File]::WriteAllLines($configPath, $configLines, [System.Text.UTF8Encoding]::new($false))
  }

  if (Test-Path -LiteralPath $footerPath) {
    $content = Get-Content -Path $footerPath -Raw -Encoding UTF8
    $updated = $content

    if ($UpdateGasDevVersion) {
      $updated = [regex]::Replace($updated, "(gasDev:[\s\S]*?version:')v?[^']+(')", "`${1}v$Version`$2")
    }

    if ($UpdateWebDevVersion) {
      $updated = [regex]::Replace($updated, "(webDev:[\s\S]*?version:')v?[^']+(')", "`${1}v$Version`$2")
    }

    if ($UpdateWebProdVersion) {
      $updated = [regex]::Replace($updated, "(webProd:[\s\S]*?version:')v?[^']+(')", "`${1}v$Version`$2")
    }

    if ($updated -cne $content) {
      Set-Content -Path $footerPath -Value $updated -Encoding UTF8
    }
  }
}

function Invoke-SyncVersionForEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DefaultEnv,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [string]$ReadmePath,

    [bool]$UpdateGasDevVersion = $false,

    [bool]$UpdateWebDevVersion = $false,

    [bool]$UpdateWebProdVersion = $false,

    [bool]$UpdateCname = $true
  )

  $appConfig = Sync-AppVersion `
    -RootPath $rootPath `
    -Version $Version `
    -DefaultEnv $DefaultEnv

  Update-EnvironmentVersionConstants `
    -Version $appConfig.Version `
    -UpdateGasDevVersion $UpdateGasDevVersion `
    -UpdateWebDevVersion $UpdateWebDevVersion `
    -UpdateWebProdVersion $UpdateWebProdVersion

  if ($UpdateCname) {
    Update-CnameForEnv -DefaultEnv $DefaultEnv
  }

  $gasDevVersionForReadme = if ($UpdateGasDevVersion) { $appConfig.Version } else { $null }
  $webDevVersionForReadme = if ($UpdateWebDevVersion) { $appConfig.Version } else { $null }
  $webProdVersionForReadme = if ($UpdateWebProdVersion) { $appConfig.Version } else { $null }

  Update-ReadmeCurrentVersions `
    -ReadmePath $ReadmePath `
    -GasDevVersion $gasDevVersionForReadme `
    -WebDevVersion $webDevVersionForReadme `
    -WebProdVersion $webProdVersionForReadme | Out-Null

  Invoke-UpdateDressingFrontForConfig -Config $appConfig

  Write-Host "APP_VERSION synced for env=$DefaultEnv：v$($appConfig.Version)" -ForegroundColor Green
  Write-Host "Synced .clasp.json scriptId to $($appConfig.ScriptId)" -ForegroundColor DarkGray

  return $appConfig
}

function Update-VersionManifestForPublish {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prod', 'gasDev')]
    [string]$Env,

    [Parameter(Mandatory = $true)]
    [object]$Version
  )

  $helperPath = Join-Path $rootPath 'scripts\Update-VersionManifest.ps1'

  if (-not (Test-Path -LiteralPath $helperPath)) {
    throw "找不到 version manifest helper：$helperPath"
  }

  $versionItems = @($Version)
  $versionText = [string]$versionItems[0]

  if ([string]::IsNullOrWhiteSpace($versionText)) {
    throw '更新 version.json 失敗：Version 是空值'
  }

  Write-Host "DEBUG version manifest helperPath = [$helperPath]" -ForegroundColor Cyan
  Write-Host "DEBUG version manifest env        = [$Env]" -ForegroundColor Cyan
  Write-Host "DEBUG version manifest version    = [$versionText]" -ForegroundColor Cyan
  Write-Host "DEBUG version manifest count      = [$($versionItems.Count)]" -ForegroundColor Cyan

  $psExe = (Get-Command pwsh -ErrorAction SilentlyContinue).Source

  if ([string]::IsNullOrWhiteSpace($psExe)) {
    $psExe = (Get-Command powershell -ErrorAction Stop).Source
  }

  & $psExe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $helperPath `
    -EnvName $Env `
    -Version $versionText

  if ($LASTEXITCODE -ne 0) {
    throw "更新 version.json 失敗：$Env v$versionText"
  }
}

function Invoke-DevAppScript {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  Write-Host ""
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "[1] dev-app script" -ForegroundColor Cyan
  Write-Host "=========================="
  Write-Host "Pushing source files to Apps Script dev project"

  Invoke-Clasp -Arguments @('push') -WorkingDirectory $rootPath

  Write-Host "dev-app script push completed with version $($Config.Description)" -ForegroundColor Green

  Update-VersionManifestForPublish -Env 'gasDev' -Version $Config.Version
}

function Invoke-ProdAppScriptDeploy {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  if (-not $Config.DeploymentId) {
    throw 'Config.js 找不到 DEPLOYMENT_ID，無法部署正式 Apps Script API。'
  }

  $description = $Config.Description

  Write-Host ""
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "正式 Apps Script API deployment" -ForegroundColor Cyan
  Write-Host "=========================="
  Write-Host "Creating Apps Script version $description"

  $versionOutput = Invoke-ClaspCapture -Arguments @('version', $description)
  $versionNumber = Get-ClaspVersionNumberFromOutput -Output $versionOutput

  Write-Host "Updating deployment $($Config.DeploymentId) to version $versionNumber"

  Invoke-Clasp `
    -Arguments @(
      'deploy',
      '-i',
      $Config.DeploymentId,
      '-V',
      [string]$versionNumber,
      '-d',
      $description
    ) `
    -WorkingDirectory $rootPath

  Write-Host "Apps Script prod deploy completed with $description at version $versionNumber" -ForegroundColor Green
}

Repair-GitWorktreeMetadata
Save-AllOpenFiles
Show-GitSnapshot

Write-Host ""
Write-Host "==========================" -ForegroundColor Cyan
Write-Host "目前版本狀態" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan

try {
  $currentVersionBeforePush = Get-CurrentAppVersion -RootPath $rootPath

  Write-Host ""
  Write-Host "開發版(APP_VERSION)" -ForegroundColor Yellow
  Write-Host "  v$currentVersionBeforePush" -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "開發版(APP_VERSION)" -ForegroundColor Yellow
  Write-Host "  讀取失敗：$($_.Exception.Message)" -ForegroundColor Red
}

try {
  $previewReadmePath = Join-Path $rootPath 'README.md'

  if (Test-Path -LiteralPath $previewReadmePath) {
    $previewReadme = Get-Content -Path $previewReadmePath -Raw -Encoding UTF8

    $previewGasDevVersion = ([regex]::Match($previewReadme, '(?m)^app script測試版\s*[:：]\s*(.+)$')).Groups[1].Value.Trim()
    $previewWebDevVersion = ([regex]::Match($previewReadme, '(?m)^測試版\s*[:：]\s*(.+)$')).Groups[1].Value.Trim()
    $previewWebProdVersion = ([regex]::Match($previewReadme, '(?m)^正式版\s*[:：]\s*(.+)$')).Groups[1].Value.Trim()

    if ([string]::IsNullOrWhiteSpace($previewGasDevVersion)) {
      $previewGasDevVersion = 'README 未填'
    }

    if ([string]::IsNullOrWhiteSpace($previewWebDevVersion)) {
      $previewWebDevVersion = 'README 未填'
    }

    if ([string]::IsNullOrWhiteSpace($previewWebProdVersion)) {
      $previewWebProdVersion = 'README 未填'
    }

    Write-Host ""
    Write-Host "README紀錄版本" -ForegroundColor Yellow
    Write-Host "  app script測試版 : $previewGasDevVersion" -ForegroundColor Cyan
    Write-Host "  測試版           : $previewWebDevVersion" -ForegroundColor Cyan
    Write-Host "  正式版           : $previewWebProdVersion" -ForegroundColor Cyan
  }
  else {
    Write-Host ""
    Write-Host "README紀錄版本" -ForegroundColor Yellow
    Write-Host "  找不到 README.md" -ForegroundColor Red
  }
}
catch {
  Write-Host ""
  Write-Host "README版本讀取失敗：$($_.Exception.Message)" -ForegroundColor Red
}

if ($env:APP_VERSION_BUMP) {
  $Bump = $env:APP_VERSION_BUMP
}

# 舊參數相容：
# push        -> dev-app script
# push-github -> dev-app script + dev-skhps
# deploy      -> skhps；並預設啟用正式 Apps Script API deploy
$legacyDeployRequested = $false
$devSkhpsDeployBranch = 'main'
$prodConfirmedByMainMenu = $false

switch ($Action) {
  'push' {
    $Action = 'dev-app'
  }
  'push-github' {
    $Action = 'dev-skhps'
  }
  'dev-all' {
    $Action = 'dev-skhps'
  }
  'dev-app-backup' {
    $Action = 'backup-wip'
  }
  'all' {
    $Action = 'backup-wip'
  }
  'skhps' {
    $Action = 'release'
  }
  'deploy' {
    $Action = 'release'
    $legacyDeployRequested = $true
  }
}

if ($Action -eq 'ask') {
  Write-Host ""
  Write-Host "累加式四段部署目標（不自動切分支、不自動 merge、不使用 worktree）：" -ForegroundColor Cyan
  Write-Host "[1] push app script"
  Write-Host "    = 儲存 + 同步 dev Apps Script + clasp push；不 git commit、不 git push"
  Write-Host "[2] 加上 push dev-skhps.jonaminz.com"
  Write-Host "    = 1 + git commit + git push --force-with-lease dev HEAD:$devSkhpsDeployBranch"
  Write-Host "[3] 本地確認，不部署 skhps 正式版"
  Write-Host "    = 1 + 2 + 確認本地已 commit；不推 origin/master、不 deploy skhps、不問備份"
  Write-Host "[PROD] deploy skhps 正式版"
  Write-Host "    = 1 + 2 + 3 + 正式版；在這裡輸入 PROD 就是確認正式上線；正式版 commit 固定使用預設值"
  Write-Host "[0] 取消"

  $actionChoices = @{
    '1' = 'dev-app'
    'dev-app' = 'dev-app'
    'app' = 'dev-app'
    'gas' = 'dev-app'

    '2' = 'dev-skhps'
    'dev-skhps' = 'dev-skhps'
    'dev-all' = 'dev-skhps'
    'dev' = 'dev-skhps'
    'test' = 'dev-skhps'

    '3' = 'backup-wip'
    'backup' = 'backup-wip'
    'backup-wip' = 'backup-wip'
    'local' = 'backup-wip'
    'save' = 'backup-wip'
    'wip' = 'backup-wip'
    'switch' = 'backup-wip'
    'daily' = 'backup-wip'
    'commit' = 'commit-only'
    'commit-only' = 'commit-only'

    # 正式版確認改在主選單完成：輸入 PROD 直接跑正式版，不再稍後再問一次 PROD。
    'prod' = 'release'
    'release' = 'release'
    'skhps' = 'release'

    '0' = 'cancel'
    'cancel' = 'cancel'
  }

  while ($true) {
    $answer = Read-Host "請選擇 [1]；正式版請輸入 PROD"

    if ([string]::IsNullOrWhiteSpace($answer)) {
      $Action = 'dev-app'
      break
    }

    $key = $answer.Trim().ToLower()

    if ($actionChoices.ContainsKey($key)) {
      $Action = $actionChoices[$key]
      if ($key -eq 'prod') {
        $prodConfirmedByMainMenu = $true
      }
      break
    }

    Write-Host "請輸入 1、2、3、PROD 或 0；正式版請輸入 PROD。" -ForegroundColor Yellow
  }
}

if ($Action -eq 'cancel') {
  Write-Host "已取消。" -ForegroundColor Yellow
  exit 0
}

# 累加式語意：
# 1 = dev-app
# 2 = 1 + dev-skhps
# 3 = 1 + 2 + local checkpoint，不 deploy 正式版
# 4 = 1 + 2 + 3 + 4 release
$needsDevApp = $Action -in @('dev-app','dev-skhps','backup-wip','release')
$needsDevSkhps = $Action -in @('dev-skhps','backup-wip','release')
$needsBackupWip = $Action -in @('backup-wip','release')
$needsSkhps = $Action -eq 'release'
$needsLocalCommitOnly = $Action -eq 'commit-only'
$needsAnyGit = $needsDevSkhps -or $needsBackupWip -or $needsSkhps -or $needsLocalCommitOnly

if ($Bump -eq 'ask') {
  Write-Host ""
  $Bump = Read-MenuChoice `
    -Message "要更新哪種版本？P=patch 小修，M=minor 新功能，A=major 大改，N=none 不升版 [N]" `
    -Choices @{
      'p' = 'patch'
      'patch' = 'patch'
      'm' = 'minor'
      'minor' = 'minor'
      'a' = 'major'
      'major' = 'major'
      'n' = 'none'
      'none' = 'none'
    } `
    -Default 'none'
}

$defaultReadme = $Bump -in @('minor','major')
$writeReadme = $false

if (-not $NoReadmePrompt) {
  Write-Host ""
  $writeReadme = Read-YesNo -Message "要寫入 README 版本日誌嗎？none/patch 預設 N，minor/major 預設 Y" -Default $defaultReadme
}

if ($writeReadme -and -not ($Note -and ($Note -join '').Trim())) {
  Write-Host ""
  $noteText = Read-Host "README 版本日誌要寫什麼？（留空 = 自動摘要）"

  if (-not [string]::IsNullOrWhiteSpace($noteText)) {
    $Note = @($noteText)
  }
}

$sourceVersion = Get-CurrentAppVersion -RootPath $rootPath
$version = if (($needsDevApp -or $needsSkhps) -or ($needsBackupWip -and $Bump -ne 'none') -or ($needsLocalCommitOnly -and $Bump -ne 'none')) {
  New-AppVersion -RootPath $rootPath -Bump $Bump
}
else {
  $sourceVersion
}
$readmePath = Join-Path $rootPath 'README.md'

# 集中輸入 commit 訊息：README 問完後一次問完，不要流程跑到一半才一直卡住等輸入。
$devCommitMessage = [string]$DevCommitMessage
$localOnlyCommitMessage = [string]$LocalCommitMessage

if ($needsDevSkhps -and -not $NoGitHubPrompt -and [string]::IsNullOrWhiteSpace($devCommitMessage)) {
  $defaultDevCommitMessage = "Bump dev-skhps to v$version"
  Write-Host ""
  $devCommitMessage = [string](Read-Host "測試版 Git commit message（直接按 Enter 使用 '$defaultDevCommitMessage'，輸入 skip 略過測試版 commit）")
}

if ($needsLocalCommitOnly -and -not $NoGitHubPrompt -and [string]::IsNullOrWhiteSpace($localOnlyCommitMessage)) {
  Write-Host ""
  $localOnlyCommitMessage = [string](Read-Host "本地 Git commit message（直接按 Enter 使用 'Save local work'，輸入 skip 略過 commit）")
}

$devConfig = $null
$prodConfig = $null

if ($needsDevApp) {
  $devConfig = Invoke-SyncVersionForEnv `
    -DefaultEnv 'dev' `
    -Version $version `
    -ReadmePath $readmePath `
    -UpdateGasDevVersion $true `
    -UpdateWebDevVersion $needsDevSkhps `
    -UpdateCname $needsDevSkhps

  if ($writeReadme) {
    $readmeUpdated = Update-ReadmeVersionLog `
      -RootPath $rootPath `
      -Version $version `
      -ReleaseType 'dev' `
      -SourceVersion $sourceVersion `
      -Notes $Note

    if ($readmeUpdated) {
      Write-Host "README version log updated with $($devConfig.Description)"
    }
    else {
      Write-Host "README already contains $($devConfig.Description)"
    }
  }
  else {
    Write-Host "README version log skipped."
  }

  Invoke-DevAppScript -Config $devConfig
}

if ($needsDevSkhps) {
  $defaultMsg = if ($devConfig) {
    "Bump dev-skhps to v$($devConfig.Version)"
  }
  else {
    "Update dev-skhps"
  }

  if ($devConfig) {
    Update-VersionManifestForPublish -Env 'dev' -Version $devConfig.Version
  }

  Invoke-GitCommitIfNeeded -DefaultMessage $defaultMsg -CommitMessage $devCommitMessage | Out-Null
  $devPushSha = Get-GitHeadSha

  Write-Host ""
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "[2] 推送 dev-skhps.jonaminz.com" -ForegroundColor Cyan
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "只推 dev remote 的單一部署分支：$devSkhpsDeployBranch；不切分支、不碰 origin/master。" -ForegroundColor Yellow

  Invoke-GitPush `
    -RemoteName 'dev' `
    -RefSpec "$($devPushSha):$devSkhpsDeployBranch" `
    -SiteName 'dev-skhps' `
    -SiteUrl 'https://dev-skhps.jonaminz.com' `
    -ForceWithLease

  Confirm-GitRemoteRefMatchesHead `
    -RemoteName 'dev' `
    -BranchName $devSkhpsDeployBranch `
    -Label "dev-skhps $devSkhpsDeployBranch" `
    -ExpectedSha $devPushSha
}

if ($needsBackupWip) {
  Write-Host ""
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "[3] 本地確認，不部署 skhps 正式版" -ForegroundColor Cyan
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "已完成 [1] dev-app 與 [2] dev-skhps；目前 HEAD 已 commit。" -ForegroundColor Green
  Write-Host "本階段不推 origin/master、不 deploy skhps、不建立 worktree、不問備份。" -ForegroundColor Yellow

  if ($needsSkhps) {
    Write-Host "接著執行 [4] deploy skhps 正式版。" -ForegroundColor Green
  }
  else {
    Write-Host "到此停止：未 deploy skhps 正式版。" -ForegroundColor Green
  }
}

if ($needsLocalCommitOnly) {
  if ($writeReadme) {
    $readmeUpdated = Update-ReadmeVersionLog `
      -RootPath $rootPath `
      -Version $version `
      -ReleaseType 'dev' `
      -SourceVersion $sourceVersion `
      -Notes $Note

    if ($readmeUpdated) {
      Write-Host "README version log updated for local commit."
    }
    else {
      Write-Host "README already contains v$version."
    }
  }
  else {
    Write-Host "README version log skipped."
  }

  Invoke-GitCommitIfNeeded -DefaultMessage "Save local work" -CommitMessage $localOnlyCommitMessage | Out-Null
  Write-Host ""
  Write-Host "已完成 commit-only；未部署。" -ForegroundColor Green
}

if ($needsSkhps) {
  Confirm-ProdPushOrExit -AlreadyConfirmed $prodConfirmedByMainMenu

  $prodConfig = Invoke-SyncVersionForEnv `
    -DefaultEnv 'prod' `
    -Version $version `
    -ReadmePath $readmePath `
    -UpdateWebProdVersion $true `
    -UpdateCname $true

  if ($writeReadme) {
    $readmeUpdated = Update-ReadmeVersionLog `
      -RootPath $rootPath `
      -Version $version `
      -ReleaseType 'prod' `
      -SourceVersion $sourceVersion `
      -Notes $Note

    if ($readmeUpdated) {
      Write-Host "README version log updated with $($prodConfig.Description)"
    }
    else {
      Write-Host "README already contains $($prodConfig.Description)"
    }
  }
  else {
    Write-Host "README version log skipped."
  }

  if ($DeployProdAppScript) {
    Invoke-ProdAppScriptDeploy -Config $prodConfig
  }
  else {
    Write-Host "略過正式 Apps Script API deployment；只 deploy skhps 前端。若真的要部署後端，請用 -DeployProdAppScript。" -ForegroundColor Yellow
  }

  Update-VersionManifestForPublish -Env 'prod' -Version $prodConfig.Version

  Invoke-GitCommitIfNeeded -DefaultMessage "Release skhps v$($prodConfig.Version)" -NoPrompt -AllowSkip $false | Out-Null
  $prodPushSha = Get-GitHeadSha

  Write-Host ""
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "[4] 推送 skhps 正式版" -ForegroundColor Cyan
  Write-Host "==========================" -ForegroundColor Cyan
  Write-Host "只推 origin/master；不自動 merge、不切分支。" -ForegroundColor Yellow

  Invoke-GitPush `
    -RemoteName 'origin' `
    -RefSpec "$($prodPushSha):master" `
    -SiteName 'skhps' `
    -SiteUrl 'https://skhps.jonaminz.com'

  Confirm-GitRemoteRefMatchesHead `
    -RemoteName 'origin' `
    -BranchName 'master' `
    -Label '正式版 master' `
    -ExpectedSha $prodPushSha
}

if ($Action -eq 'commit-only') {
  Write-Host ""
  Write-Host "已完成 commit-only 流程，未部署。" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================" -ForegroundColor Cyan
Write-Host "完成" -ForegroundColor Green
Write-Host "==========================" -ForegroundColor Cyan
