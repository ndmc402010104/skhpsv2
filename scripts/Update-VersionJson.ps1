param(
  [string]$EnvName = "prod"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$versionPath = Join-Path $repoRoot "version.json"

if (-not (Test-Path $versionPath)) {
  throw "version.json not found: $versionPath"
}

$data = Get-Content $versionPath -Raw | ConvertFrom-Json

if (-not $data.PSObject.Properties["project"]) {
  $data | Add-Member -NotePropertyName project -NotePropertyValue "skhpsv2" -Force
}

if (-not $data.PSObject.Properties["repoRole"]) {
  $data | Add-Member -NotePropertyName repoRole -NotePropertyValue $EnvName -Force
}

if (-not $data.PSObject.Properties["current"]) {
  $data | Add-Member -NotePropertyName current -NotePropertyValue ([pscustomobject]@{}) -Force
}

if (-not $data.PSObject.Properties["environments"]) {
  $data | Add-Member -NotePropertyName environments -NotePropertyValue ([pscustomobject]@{}) -Force
}

function Ensure-Env {
  param(
    [object]$Root,
    [string]$Name,
    [string]$Label,
    [string]$Repo,
    [string]$Version
  )

  if (-not $Root.environments.PSObject.Properties[$Name]) {
    $Root.environments | Add-Member -NotePropertyName $Name -NotePropertyValue ([pscustomobject]@{
      label = $Label
      repo = $Repo
      version = $Version
    }) -Force
  }
}

Ensure-Env -Root $data -Name "prod" -Label "prod" -Repo "skhpsv2" -Version "v0.1.0-prod-000000000000"
Ensure-Env -Root $data -Name "dev" -Label "dev" -Repo "dev-skhpsv2" -Version "not-created"
Ensure-Env -Root $data -Name "local" -Label "local" -Repo "skhpsv2" -Version "v0.1.0-local-000000000000"

if (-not $data.environments.PSObject.Properties[$EnvName]) {
  throw "Unsupported EnvName: $EnvName"
}

$currentVersion = ""

if ($data.current -and $data.current.PSObject.Properties["version"] -and $data.current.version) {
  $currentVersion = [string]$data.current.version
}

if ([string]::IsNullOrWhiteSpace($currentVersion)) {
  $currentVersion = [string]$data.environments.$EnvName.version
}

if ([string]::IsNullOrWhiteSpace($currentVersion) -or $currentVersion -eq "not-created" -or $currentVersion -eq "not-released") {
  $currentVersion = "v0.1.0-$EnvName-000000000000"
}

if ($currentVersion -match '^v?(\d+)\.(\d+)\.(\d+)') {
  $major = [int]$matches[1]
  $minor = [int]$matches[2]
  $patch = [int]$matches[3]
} else {
  $major = 0
  $minor = 1
  $patch = 0
}

Write-Host ""
Write-Host "Current version: $currentVersion"
Write-Host ""
Write-Host "Select version bump:"
Write-Host "  [0] none  keep semver, refresh timestamp"
Write-Host "  [1] patch"
Write-Host "  [2] minor"
Write-Host "  [3] major"
Write-Host ""

$choice = Read-Host "Input 0/1/2/3, default 0"

switch ($choice) {
  "1" { $patch += 1 }
  "2" {
    $minor += 1
    $patch = 0
  }
  "3" {
    $major += 1
    $minor = 0
    $patch = 0
  }
  default { }
}

$stamp = Get-Date -Format "yyyyMMddHHmm"
$newVersion = "v$major.$minor.$patch-$EnvName-$stamp"

if ($EnvName -eq "prod") {
  $label = "prod"
  $repo = "skhpsv2"
} elseif ($EnvName -eq "dev") {
  $label = "dev"
  $repo = "dev-skhpsv2"
} else {
  $label = "local"
  $repo = "skhpsv2"
}

$data.repoRole = $EnvName

$data.current = [pscustomobject]@{
  env = $EnvName
  label = $label
  version = $newVersion
}

$data.environments.$EnvName = [pscustomobject]@{
  label = $label
  repo = $repo
  version = $newVersion
}

if ($EnvName -eq "prod") {
  $data.environments.local = [pscustomobject]@{
    label = "local"
    repo = "skhpsv2"
    version = "v$major.$minor.$patch-local-$stamp"
  }
}

$json = $data | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($versionPath, $json, $utf8NoBom)

Write-Host ""
Write-Host "version.json updated: $newVersion"
Write-Host ""