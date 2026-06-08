$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  $configPath = ".\config.json"

  if (-not (Test-Path $configPath)) {
    throw "找不到 config.json"
  }

  $config = Get-Content $configPath -Raw | ConvertFrom-Json

  if (-not $config.sheets -or -not $config.sheets.mainSpreadsheetId) {
    throw "config.json 缺少 sheets.mainSpreadsheetId"
  }

  $app = if ($config.app) { [string]$config.app } else { "skhpsv2" }
  $env = if ($config.env) { [string]$config.env } else { "prod" }
  $spreadsheetId = [string]$config.sheets.mainSpreadsheetId
  $gid = if ($config.sheets.mainGid) { [string]$config.sheets.mainGid } else { "" }
  $scriptId = if ($config.appsScript -and $config.appsScript.scriptId) { [string]$config.appsScript.scriptId } else { "" }

  New-Item -ItemType Directory -Force -Path ".\apps-script" | Out-Null

  $configGs = @"
const SKHPS_SERVER_CONFIG = {
  app: '$app',
  env: '$env',
  appsScript: {
    scriptId: '$scriptId'
  },
  sheets: {
    mainSpreadsheetId: '$spreadsheetId',
    mainGid: '$gid'
  }
};

function getServerConfig_() {
  return SKHPS_SERVER_CONFIG;
}

function getSpreadsheetId_() {
  if (
    typeof SKHPS_SERVER_CONFIG !== 'undefined' &&
    SKHPS_SERVER_CONFIG &&
    SKHPS_SERVER_CONFIG.sheets &&
    SKHPS_SERVER_CONFIG.sheets.mainSpreadsheetId
  ) {
    return SKHPS_SERVER_CONFIG.sheets.mainSpreadsheetId;
  }

  var props = PropertiesService.getScriptProperties();

  return (
    props.getProperty('SPREADSHEET_ID') ||
    props.getProperty('SHEET_ID') ||
    ''
  );
}
"@

  [System.IO.File]::WriteAllText(
    (Join-Path $repoRoot "apps-script\Config.gs"),
    $configGs,
    [System.Text.UTF8Encoding]::new($true)
  )

  Write-Host "已由 config.json 產生 apps-script\Config.gs" -ForegroundColor Green
}
finally {
  Pop-Location
}