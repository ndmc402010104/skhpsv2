# 檔案位置：skhpsv2/pullall-v2.ps1
# 時間戳記：2026-06-08 19:35 UTC+8
# 用途：skhpsv2 新電腦/日常同步互動式 pull 工具；只處理 GitHub origin/main，不執行 clasp，不連 Apps Script。

param(
  [ValidateSet("menu","safe","force","status")]
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

$repoRoot = $PSScriptRoot
Push-Location $repoRoot

function Stop-IfNotRepo {
  if (-not (Test-Path ".\.git")) {
    throw "錯誤：目前不是 Git repo 根目錄。請先 cd 到 skhpsv2 資料夾。"
  }

  if (Test-Path ".\.clasp.json") {
    throw "錯誤：skhpsv2 根目錄不應該有 .clasp.json。Apps Script 應在 apps-script/ 子資料夾。"
  }
}

function Show-Status {
  Write-Host ""
  Write-Host "==== Git 狀態 ====" -ForegroundColor Cyan
  git status --short

  $status = git status --porcelain
  if (-not $status) {
    Write-Host "目前乾淨，沒有未提交變更。" -ForegroundColor Green
  }
}

function Invoke-SafePull {
  Stop-IfNotRepo

  Write-Host ""
  Write-Host "==== Safe pull ====" -ForegroundColor Cyan
  Write-Host "用途：有未提交變更就停止，不覆蓋你的檔案。"

  $status = git status --porcelain
  if ($status) {
    Write-Host ""
    Write-Host "偵測到未提交變更，safe 模式停止：" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    Write-Host "你可以："
    Write-Host "1. 先 commit 後再 pull"
    Write-Host "2. 確定不要本機變更，改選 force"
    return
  }

  git fetch origin --prune
  git checkout main
  git pull --ff-only origin main

  Write-Host ""
  Write-Host "Safe pull 完成。" -ForegroundColor Green
  git status --short
}

function Invoke-ForcePull {
  Stop-IfNotRepo

  Write-Host ""
  Write-Host "==== Force pull ====" -ForegroundColor Red
  Write-Host "警告：這會丟掉本機未提交變更，強制同步成 GitHub origin/main。"

  $confirm = Read-Host "確定要 force？請輸入 FORCE"
  if ($confirm -ne "FORCE") {
    Write-Host "已取消 force pull。" -ForegroundColor Yellow
    return
  }

  git fetch origin --prune
  git checkout main
  git reset --hard origin/main
  git clean -fd

  Write-Host ""
  Write-Host "Force pull 完成。" -ForegroundColor Green
  git status --short
}

function Invoke-CommitShortcut {
  Stop-IfNotRepo

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

  git add .
  git commit -m $msg

  $push = Read-Host "要直接 push 到 origin/main 嗎？輸入 Y 執行"
  if ($push -eq "Y" -or $push -eq "y") {
    git push origin main
  }

  Write-Host ""
  Write-Host "Commit 流程完成。" -ForegroundColor Green
}

function Show-Menu {
  while ($true) {
    Write-Host ""
    Write-Host "==== skhpsv2 pullall-v2 ====" -ForegroundColor Cyan
    Write-Host "Repo: $repoRoot"
    Write-Host ""
    Write-Host "請選擇："
    Write-Host "1. 查看目前 Git 狀態"
    Write-Host "2. Safe pull：安全更新，不覆蓋未提交變更"
    Write-Host "3. Force pull：強制更新，丟掉本機未提交變更"
    Write-Host "4. Commit 目前變更，可選擇 push"
    Write-Host "5. 打開 VS Code"
    Write-Host "0. 離開"
    Write-Host ""

    $choice = Read-Host "輸入數字"

    switch ($choice) {
      "1" { Show-Status }
      "2" { Invoke-SafePull }
      "3" { Invoke-ForcePull }
      "4" { Invoke-CommitShortcut }
      "5" { code . }
      "0" { return }
      default { Write-Host "請輸入 0-5。" -ForegroundColor Yellow }
    }
  }
}

try {
  Stop-IfNotRepo

  if ($Mode -eq "status") {
    Show-Status
  }
  elseif ($Mode -eq "safe") {
    Invoke-SafePull
  }
  elseif ($Mode -eq "force") {
    Invoke-ForcePull
  }
  else {
    Show-Menu
  }
}
finally {
  Pop-Location
}