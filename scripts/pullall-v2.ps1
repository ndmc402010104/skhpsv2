param(
  [ValidateSet("safe","force")]
  [string]$Mode = "safe",

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

try {
  Write-Host "==== skhpsv2 pullall-v2 ====" -ForegroundColor Cyan
  Write-Host "Repo: $repoRoot"
  Write-Host "Mode: $Mode"

  if (-not (Test-Path ".\.git")) {
    throw "錯誤：目前不是 Git repo 根目錄。"
  }

  if (Test-Path ".\.clasp.json") {
    throw "錯誤：skhpsv2 根目錄不應該有 .clasp.json。Apps Script 後端應在 apps-script 子資料夾。"
  }

  $branch = (git branch --show-current).Trim()

  if (-not $branch) {
    throw "錯誤：無法取得目前 Git branch。"
  }

  Write-Host "Branch: $branch"

  if ($Mode -eq "safe") {
    $status = git status --short

    if ($status) {
      Write-Host ""
      Write-Host "safe 模式停止：目前有未提交變更。" -ForegroundColor Yellow
      Write-Host "請先 commit / stash，或改用：.\scripts\pullall-v2.ps1 -Mode force"
      Write-Host ""
      git status --short
      exit 1
    }

    Write-Host ""
    Write-Host "==== git fetch / pull --ff-only ====" -ForegroundColor Cyan
    git fetch origin --prune
    git checkout main
    git pull --ff-only origin main
  }
  else {
    Write-Host ""
    Write-Host "force 模式：會丟掉本機未提交變更並重設到 origin/main。" -ForegroundColor Red
    $confirm = Read-Host "輸入 FORCE 才繼續"

    if ($confirm -ne "FORCE") {
      Write-Host "已取消。" -ForegroundColor Yellow
      exit 0
    }

    git fetch origin --prune
    git checkout main
    git reset --hard origin/main
    git clean -fd
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