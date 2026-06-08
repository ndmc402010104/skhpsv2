param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  Write-Host ""
  Write-Host "skhpsv2 GitHub Pages push"
  Write-Host "Repo root: $repoRoot"
  Write-Host ""

  if (Test-Path ".clasp.json") {
    throw "Root .clasp.json detected. Keep Apps Script files under apps-script/, not repo root."
  }

  $versionScript = Join-Path $PSScriptRoot "Update-VersionJson.ps1"

  if (-not (Test-Path $versionScript)) {
    throw "Update-VersionJson.ps1 not found: $versionScript"
  }

  & $versionScript -EnvName "prod"

  git status

  $changes = git status --porcelain
  if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host ""
    Write-Host "No changes to commit."
    exit 0
  }

  if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = Read-Host "Commit message"
  }

  if ([string]::IsNullOrWhiteSpace($Message)) {
    throw "Commit message is required."
  }

  git add .
  git commit -m $Message
  git push

  Write-Host ""
  Write-Host "skhpsv2 push completed."
}
finally {
  Pop-Location
}