# 檔案位置：專案根目錄/pullall.ps1
# 時間戳記：2026-06-05 16:05 UTC+8
# 用途：換電腦預設拉 push3 產生的 dev/main 最新進度；master 僅供明確拉正式版；wip-current 僅作舊流程 fallback。

param(
  [ValidateSet('auto','master','dev','wip','current')]
  [string]$Mode = 'auto',

  [switch]$WithClaspPull,

  [switch]$NoOpenCode
)

chcp 65001 | Out-Null

[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$ErrorActionPreference = 'Stop'

$script:LastPullSource = ''
$script:DidClaspPull = $false
$script:DevRemoteExists = $false

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & git @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') 失敗"
  }
}

function Read-YesNo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [bool]$Default = $false
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

function Get-CurrentBranchName {
  $branch = (git branch --show-current 2>$null).Trim()

  if ([string]::IsNullOrWhiteSpace($branch)) {
    return ''
  }

  return $branch
}

function Test-GitRemoteExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteName
  )

  $remotes = @(git remote 2>$null)

  if ($LASTEXITCODE -ne 0) {
    return $false
  }

  return $remotes -contains $RemoteName
}

function Test-RemoteRefExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RefName
  )

  git rev-parse --verify $RefName 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Get-OriginDefaultRef {
  $remoteHead = git symbolic-ref refs/remotes/origin/HEAD 2>$null

  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($remoteHead)) {
    return ($remoteHead -replace '^refs/remotes/', '')
  }

  if (Test-RemoteRefExists -RefName 'origin/master') {
    return 'origin/master'
  }

  if (Test-RemoteRefExists -RefName 'origin/main') {
    return 'origin/main'
  }

  throw '無法判斷 origin 預設分支，請確認 GitHub 是 master 還是 main。'
}

function Reset-ToRef {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRef,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Write-Host "覆蓋本機檔案，對齊 $Label：$TargetRef ..." -ForegroundColor Yellow
  Invoke-Git -Arguments @('reset', '--hard', $TargetRef)
  Invoke-Git -Arguments @('clean', '-fd')
  $script:LastPullSource = $TargetRef
}

function Pull-ClaspIfRequested {
  param(
    [bool]$Default = $false
  )

  $shouldPull = $WithClaspPull

  if (-not $WithClaspPull) {
    $shouldPull = Read-YesNo -Message '要從 Apps Script 覆蓋拉回線上檔案嗎？這會執行 clasp pull --force' -Default $Default
  }

  if (-not $shouldPull) {
    Write-Host '已略過 clasp pull --force。' -ForegroundColor Yellow
    $script:DidClaspPull = $false
    return
  }

  Write-Host '從 Apps Script 覆蓋拉回線上檔案...' -ForegroundColor Cyan
  clasp pull --force

  if ($LASTEXITCODE -ne 0) {
    throw 'clasp pull --force 失敗'
  }

  $script:DidClaspPull = $true
}

function Fetch-RemoteIfExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteName,

    [bool]$Required = $false
  )

  if (-not (Test-GitRemoteExists -RemoteName $RemoteName)) {
    if ($Required) {
      throw "找不到 $RemoteName remote。"
    }

    Write-Host "找不到 $RemoteName remote，略過 git fetch $RemoteName --prune。" -ForegroundColor Yellow
    return $false
  }

  Write-Host "抓取 $RemoteName 最新版本..." -ForegroundColor Cyan
  Invoke-Git -Arguments @('fetch', $RemoteName, '--prune')
  return $true
}

Write-Host ''
Write-Host 'SKH Pull Helper' -ForegroundColor Cyan
Write-Host 'auto    = 換電腦預設模式；優先拉 push3 產生的 dev/main 最新進度' -ForegroundColor DarkGray
Write-Host 'dev     = 拉 dev/main，也就是 push3 推送的測試版前端進度' -ForegroundColor DarkGray
Write-Host 'master  = 拉正式主線 origin/master；代表 skhps 正式版來源' -ForegroundColor DarkGray
Write-Host 'wip     = 舊版換電腦備份 origin/wip-current，僅作 fallback' -ForegroundColor DarkGray
Write-Host 'current = 拉目前分支對應遠端' -ForegroundColor DarkGray
Write-Host ''

Write-Host '抓取 GitHub 最新版本...' -ForegroundColor Cyan
Invoke-Git -Arguments @('fetch', 'origin', '--prune')

$script:DevRemoteExists = Fetch-RemoteIfExists -RemoteName 'dev' -Required $false

$currentBranch = Get-CurrentBranchName
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
  Write-Host '目前不在正常分支上，可能是 detached HEAD。' -ForegroundColor Yellow
}
else {
  Write-Host "目前 branch：$currentBranch" -ForegroundColor Yellow
}

$selectedMode = $Mode

if ($selectedMode -eq 'auto') {
  if ($script:DevRemoteExists -and (Test-RemoteRefExists -RefName 'dev/main')) {
    Write-Host ''
    Write-Host '偵測到 dev/main 存在。' -ForegroundColor Yellow
    Write-Host 'auto 模式將拉 push3 產生的測試版 / 換電腦接續進度。' -ForegroundColor Cyan
    $selectedMode = 'dev'
  }
  elseif (Test-RemoteRefExists -RefName 'origin/wip-current') {
    Write-Host ''
    Write-Host '找不到 dev/main，但偵測到舊版 origin/wip-current。' -ForegroundColor Yellow
    Write-Host 'auto 模式將 fallback 拉 origin/wip-current。' -ForegroundColor Cyan
    $selectedMode = 'wip'
  }
  else {
    Write-Host ''
    Write-Host '找不到 dev/main，也找不到 origin/wip-current。' -ForegroundColor Yellow
    Write-Host 'auto 模式無法判斷換電腦最新版來源。' -ForegroundColor Yellow
    Write-Host ''

    $useMaster = Read-YesNo -Message '是否改拉正式主線 origin/master 或 origin/main？' -Default $false
    if ($useMaster) {
      $selectedMode = 'master'
    }
    else {
      $selectedMode = 'current'
    }
  }
}

switch ($selectedMode) {
  'dev' {
    if (-not $script:DevRemoteExists) {
      throw '找不到 dev remote。請確認是否已設定：git remote add dev https://github.com/ndmc402010104/skhps-system-dev.git'
    }

    if (-not (Test-RemoteRefExists -RefName 'dev/main')) {
      throw '找不到 dev/main，請確認 dev remote 是否存在，或是否已執行 push3。'
    }

    Write-Host ''
    Write-Host '模式：dev，拉 dev/main。' -ForegroundColor Cyan
    Write-Host '這是 push3 產生的測試版 / 換電腦接續進度，不代表正式版 skhps。' -ForegroundColor Yellow

    Invoke-Git -Arguments @('checkout', '-B', 'dev-main', 'dev/main')
    Reset-ToRef -TargetRef 'dev/main' -Label 'dev/main'

    # 換電腦接續工作時，預設不要 clasp pull，避免 Apps Script 線上版本覆蓋 GitHub 最新前端。
    Pull-ClaspIfRequested -Default $false
  }

  'wip' {
    if (-not (Test-RemoteRefExists -RefName 'origin/wip-current')) {
      throw '找不到 origin/wip-current。請改用 -Mode dev，或先確認舊電腦是否曾建立 wip-current。'
    }

    Write-Host ''
    Write-Host '模式：wip，拉舊版 origin/wip-current。' -ForegroundColor Cyan
    Write-Host '這是舊流程換電腦備份來源；不代表正式版，也不會更新 skhps.jonaminz.com。' -ForegroundColor Yellow

    Invoke-Git -Arguments @('checkout', '-B', 'wip-current', 'origin/wip-current')
    Reset-ToRef -TargetRef 'origin/wip-current' -Label 'origin/wip-current'

    Pull-ClaspIfRequested -Default $false
  }

  'master' {
    $targetRef = if (Test-RemoteRefExists -RefName 'origin/master') { 'origin/master' } elseif (Test-RemoteRefExists -RefName 'origin/main') { 'origin/main' } else { Get-OriginDefaultRef }
    $targetBranch = ($targetRef -replace '^origin/', '')

    Write-Host ''
    Write-Host "模式：正式主線，拉 $targetRef。" -ForegroundColor Cyan
    Write-Host '這代表 skhps 正式版來源；只有明確指定 -Mode master 才會走這裡。' -ForegroundColor Yellow

    Invoke-Git -Arguments @('checkout', '-B', $targetBranch, $targetRef)
    Reset-ToRef -TargetRef $targetRef -Label $targetRef

    # master 也預設不要 clasp pull，避免 Apps Script 線上檔覆蓋 GitHub 最新前端。
    Pull-ClaspIfRequested -Default $false
  }

  'current' {
    if ([string]::IsNullOrWhiteSpace($currentBranch)) {
      $targetRef = Get-OriginDefaultRef
    }
    else {
      $targetRef = "origin/$currentBranch"

      if (-not (Test-RemoteRefExists -RefName $targetRef)) {
        Write-Host "找不到 $targetRef，改用 origin 預設分支。" -ForegroundColor Yellow
        $targetRef = Get-OriginDefaultRef
      }
    }

    Write-Host ''
    Write-Host "模式：目前分支，拉 $targetRef。" -ForegroundColor Cyan
    Reset-ToRef -TargetRef $targetRef -Label $targetRef

    Pull-ClaspIfRequested -Default $false
  }

  default {
    throw "未知 Mode：$selectedMode"
  }
}

Write-Host ''
Write-Host 'Pull 完成。' -ForegroundColor Green
Write-Host "目前 branch：$(Get-CurrentBranchName)" -ForegroundColor Cyan

if (-not [string]::IsNullOrWhiteSpace($script:LastPullSource)) {
  Write-Host "本次拉回來源：$script:LastPullSource" -ForegroundColor Cyan
}

if ($script:DidClaspPull) {
  Write-Host 'clasp pull --force：已執行。' -ForegroundColor Green
}
else {
  Write-Host 'clasp pull --force：未執行。' -ForegroundColor Yellow
}

if ($script:LastPullSource -eq 'dev/main') {
  Write-Host '這是 push3 產生的測試版 / 換電腦接續進度，不代表正式版 skhps。' -ForegroundColor Yellow
}

if (-not $NoOpenCode) {
  code .
}