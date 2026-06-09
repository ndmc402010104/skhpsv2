# 檔案位置：skhpsv2/scripts/pullall-v2.ps1
# 時間戳記：2026-06-09 20:56 UTC+8
# 用途：skhpsv2 新電腦/日常同步工具；dev-skhpsv2 是最新工作版，預設從 dev/main 拉回本機；不執行 clasp，不連 Apps Script。
# 工作流：
# - dev remote：最新工作版 / 測試版，https://github.com/ndmc402010104/dev-skhpsv2.git
# - origin remote：正式版 / 穩定版，https://github.com/ndmc402010104/skhpsv2.git
# - 換電腦建議：clone dev-skhpsv2，然後執行本腳本的「修正 remote」。

param(
  [ValidateSet("menu", "status", "safe-dev", "force-dev", "safe-prod", "force-prod", "setup-remotes")]
  [string]$Mode = "menu",

  [switch]$NoOpenCode
)

$ErrorActionPreference = "Stop"

try {
  chcp 65001 | Out-Null
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
  $OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {}

$DevRemote = "dev"
$ProdRemote = "origin"
$Branch = "main"
$DevUrl = "https://github.com/ndmc402010104/dev-skhpsv2.git"
$ProdUrl = "https://github.com/ndmc402010104/skhpsv2.git"

function Get-RepoRoot {
  $here = (Resolve-Path $PSScriptRoot).Path

  if (Test-Path (Join-Path $here ".git")) {
    return $here
  }

  $parent = (Resolve-Path (Join-Path $here "..")).Path

  if (Test-Path (Join-Path $parent ".git")) {
    return $parent
  }

  return $here
}

$repoRoot = Get-RepoRoot
Push-Location $repoRoot

function Test-Yes {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  $v = $Value.Trim().ToUpperInvariant()
  return @("Y", "YES", "1", "TRUE", "是", "好") -contains $v
}

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

function Stop-IfNotRepo {
  if (-not (Test-Path ".\.git")) {
    throw "錯誤：目前不是 Git repo 根目錄。請先 cd 到 skhpsv2 資料夾。若是新電腦，先 clone dev-skhpsv2。"
  }

  if (Test-Path ".\.clasp.json") {
    throw "錯誤：skhpsv2 根目錄不應該有 .clasp.json。Apps Script 應在 apps-script/ 子資料夾。"
  }
}

function Get-RemoteUrl {
  param([string]$Remote)

  try {
    return (git remote get-url $Remote 2>$null).Trim()
  } catch {
    return ""
  }
}

function Set-Or-AddRemote {
  param(
    [string]$Name,
    [string]$Url
  )

  $current = Get-RemoteUrl -Remote $Name

  if ([string]::IsNullOrWhiteSpace($current)) {
    git remote add $Name $Url
    Write-Host "已新增 remote：$Name -> $Url" -ForegroundColor Green
    return
  }

  if ($current -ne $Url) {
    git remote set-url $Name $Url
    Write-Host "已修正 remote：$Name -> $Url" -ForegroundColor Green
    return
  }

  Write-Host "remote $Name：OK" -ForegroundColor Green
}

function Invoke-SetupRemotes {
  Stop-IfNotRepo

  Write-Host ""
  Write-Host "==== 修正 remotes ====" -ForegroundColor Cyan

  $originUrl = Get-RemoteUrl -Remote "origin"
  $devUrlNow = Get-RemoteUrl -Remote "dev"

  # 新電腦常見情境：git clone dev-skhpsv2 後，origin 其實是 dev repo。
  if ($originUrl -eq $DevUrl -and [string]::IsNullOrWhiteSpace($devUrlNow)) {
    Write-Host "偵測到 origin 目前指向 dev-skhpsv2；將 origin 改名為 dev，再新增正式版 origin。" -ForegroundColor Yellow
    git remote rename origin dev
  }

  Set-Or-AddRemote -Name $DevRemote -Url $DevUrl
  Set-Or-AddRemote -Name $ProdRemote -Url $ProdUrl

  Write-Host ""
  Write-Host "目前 remote：" -ForegroundColor Cyan
  git remote -v
}

function Show-Status {
  Stop-IfNotRepo

  Write-Host ""
  Write-Host "==== Git 狀態 ====" -ForegroundColor Cyan
  Write-Host "Repo: $repoRoot"
  Write-Host "Branch: $((git branch --show-current).Trim())"

  Write-Host ""
  Write-Host "Remote：" -ForegroundColor Cyan
  git remote -v

  Write-Host ""
  Write-Host "Local changes：" -ForegroundColor Cyan
  $status = git status --short
  if ($status) {
    git status --short
  } else {
    Write-Host "目前乾淨，沒有未提交變更。" -ForegroundColor Green
  }

  Write-Host ""
  if (Test-Path ".\CNAME") {
    Write-Host "CNAME: $((Get-Content '.\CNAME' -Raw -Encoding UTF8).Trim())"
  } else {
    Write-Host "CNAME: 無" -ForegroundColor Yellow
  }
}

function Stop-IfDirtyForSafeMode {
  $status = git status --porcelain

  if ($status) {
    Write-Host ""
    Write-Host "偵測到未提交變更，safe 模式停止：" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    Write-Host "你可以："
    Write-Host "1. 先 commit 後再 pull"
    Write-Host "2. 確定不要本機變更，改選 force"
    throw "safe pull 已停止，避免覆蓋本機修改。"
  }
}

function Invoke-SafePullTarget {
  param(
    [string]$Remote,
    [string]$Label
  )

  Stop-IfNotRepo
  Invoke-SetupRemotes

  Write-Host ""
  Write-Host "==== Safe pull：$Label ====" -ForegroundColor Cyan
  Write-Host "用途：有未提交變更就停止，不覆蓋你的檔案。"

  Stop-IfDirtyForSafeMode

  git fetch $Remote --prune
  git checkout $Branch
  git pull --ff-only $Remote $Branch

  Write-Host ""
  Write-Host "Safe pull 完成：$Remote/$Branch" -ForegroundColor Green
  git status --short
}

function Invoke-ForcePullTarget {
  param(
    [string]$Remote,
    [string]$Label
  )

  Stop-IfNotRepo
  Invoke-SetupRemotes

  Write-Host ""
  Write-Host "==== Force pull：$Label ====" -ForegroundColor Red
  Write-Host "警告：這會丟掉本機未提交變更，強制同步成 $Remote/$Branch。"

  $confirm = Read-Host "確定要 force？請輸入 FORCE"
  if ($confirm -ne "FORCE") {
    Write-Host "已取消 force pull。" -ForegroundColor Yellow
    return
  }

  git fetch $Remote --prune
  git checkout $Branch
  git reset --hard "$Remote/$Branch"
  git clean -fd

  Write-Host ""
  Write-Host "Force pull 完成：$Remote/$Branch" -ForegroundColor Green
  git status --short
}

function Invoke-CommitShortcut {
  Stop-IfNotRepo
  Invoke-SetupRemotes

  Write-Host ""
  Write-Host "==== Commit 目前變更 ====" -ForegroundColor Cyan
  git status --short

  $status = git status --porcelain
  if (-not $status) {
    Write-Host "沒有東西需要 commit。" -ForegroundColor Green
    return
  }

  $msg = Read-Host "請輸入 commit message"
  if ([string]::IsNullOrWhiteSpace($msg)) {
    Write-Host "commit message 空白，已取消。" -ForegroundColor Yellow
    return
  }

  git add -A
  git commit -m $msg

  $push = Ask-Default "要直接 push 到測試版 dev/main 嗎？Y/N" "Y"
  if (Test-Yes $push) {
    git push $DevRemote "HEAD:$Branch"
  }

  Write-Host ""
  Write-Host "Commit 流程完成。" -ForegroundColor Green
}

function Show-NewComputerHint {
  Write-Host ""
  Write-Host "==== 新電腦建議流程 ====" -ForegroundColor Cyan
  Write-Host "1. 先 clone 最新工作版："
  Write-Host "   git clone $DevUrl skhpsv2"
  Write-Host "2. 進資料夾："
  Write-Host "   cd skhpsv2"
  Write-Host "3. 執行本腳本："
  Write-Host "   .\scripts\pullall-v2.ps1 -Mode setup-remotes"
  Write-Host "4. 之後日常同步預設拉 dev/main。"
}

function Show-Menu {
  while ($true) {
    Write-Host ""
    Write-Host "==== skhpsv2 pullall-v2 ====" -ForegroundColor Cyan
    Write-Host "Repo: $repoRoot"
    Write-Host "工作流：dev/main 是最新工作版；origin/main 是正式穩定版。"
    Write-Host ""
    Write-Host "請選擇："
    Write-Host "1. Safe pull 測試版 dev/main，預設"
    Write-Host "2. Force pull 測試版 dev/main"
    Write-Host "3. 查看目前 Git 狀態"
    Write-Host "4. 修正/建立 remotes"
    Write-Host "5. Safe pull 正式版 origin/main"
    Write-Host "6. Force pull 正式版 origin/main"
    Write-Host "7. Commit 目前變更，可選擇 push 到 dev"
    Write-Host "8. 打開 VS Code"
    Write-Host "9. 顯示新電腦流程"
    Write-Host "0. 離開"
    Write-Host ""

    $choice = Read-Host "輸入數字，Enter = 1 測試版 safe pull"

    if ([string]::IsNullOrWhiteSpace($choice)) {
      $choice = "1"
    }

    switch ($choice.Trim()) {
      "1" { Invoke-SafePullTarget -Remote $DevRemote -Label "測試版 / 最新工作版" }
      "2" { Invoke-ForcePullTarget -Remote $DevRemote -Label "測試版 / 最新工作版" }
      "3" { Show-Status }
      "4" { Invoke-SetupRemotes }
      "5" { Invoke-SafePullTarget -Remote $ProdRemote -Label "正式版 / 穩定版" }
      "6" { Invoke-ForcePullTarget -Remote $ProdRemote -Label "正式版 / 穩定版" }
      "7" { Invoke-CommitShortcut }
      "8" { code . }
      "9" { Show-NewComputerHint }
      "0" { return }
      default { Write-Host "請輸入 0-9。" -ForegroundColor Yellow }
    }
  }
}

try {
  Stop-IfNotRepo

  if ($Mode -eq "status") {
    Show-Status
  }
  elseif ($Mode -eq "safe-dev") {
    Invoke-SafePullTarget -Remote $DevRemote -Label "測試版 / 最新工作版"
  }
  elseif ($Mode -eq "force-dev") {
    Invoke-ForcePullTarget -Remote $DevRemote -Label "測試版 / 最新工作版"
  }
  elseif ($Mode -eq "safe-prod") {
    Invoke-SafePullTarget -Remote $ProdRemote -Label "正式版 / 穩定版"
  }
  elseif ($Mode -eq "force-prod") {
    Invoke-ForcePullTarget -Remote $ProdRemote -Label "正式版 / 穩定版"
  }
  elseif ($Mode -eq "setup-remotes") {
    Invoke-SetupRemotes
  }
  else {
    Show-Menu
  }
}
finally {
  Pop-Location
}