param(
  [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

chcp 65001 | Out-Null

[Console]::InputEncoding =
  [System.Text.UTF8Encoding]::new()

[Console]::OutputEncoding =
  [System.Text.UTF8Encoding]::new()

$OutputEncoding =
  [System.Text.UTF8Encoding]::new()

Clear-Host

Write-Host ''
Write-Host '==================================' -ForegroundColor Cyan
Write-Host ' New computer setup check' -ForegroundColor Cyan
Write-Host '==================================' -ForegroundColor Cyan
Write-Host ''

function Test-CommandExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  return $null -ne (
    Get-Command $Command -ErrorAction SilentlyContinue
  )
}

function Ask-YesNo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if ($NonInteractive) {
    Write-Host "$Message (skipped: non-interactive mode)" -ForegroundColor Yellow
    return $false
  }

  while ($true) {
    $answer =
      Read-Host "$Message (Y/N)"

    if ($answer -match '^[Yy]') {
      return $true
    }

    if ($answer -match '^[Nn]') {
      return $false
    }

    Write-Host 'Please answer Y or N.' -ForegroundColor Yellow
  }
}

function Add-PathIfExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathToAdd
  )

  if (!(Test-Path -LiteralPath $PathToAdd)) {
    return
  }

  $pathParts =
    ($env:Path -split ';') |
    Where-Object { $_ }

  if ($pathParts -contains $PathToAdd) {
    return
  }

  $env:Path =
    (
      @($env:Path, $PathToAdd) |
      Where-Object { $_ }
    ) -join ';'

  Write-Host "Added to PATH: $PathToAdd" -ForegroundColor Green
}

function Show-ToolVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Command,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Write-Host ''
  Write-Host $Name -ForegroundColor Cyan

  if (!(Test-CommandExists $Command)) {
    Write-Host "Missing: $Command" -ForegroundColor Yellow
    return $false
  }

  & $Command @Arguments
  return $true
}

$paths = @(
  'C:\Program Files\Git\cmd',
  'C:\Program Files\nodejs',
  (Join-Path $env:APPDATA 'npm'),
  'C:\Program Files\PowerShell\7'
)

Write-Host 'Checking PATH...' -ForegroundColor Yellow

foreach ($path in $paths) {
  Add-PathIfExists -PathToAdd $path
}

Write-Host ''
Write-Host '=== Tool checks ===' -ForegroundColor Cyan

$hasPwsh =
  Show-ToolVersion `
    -Name '0. PowerShell 7' `
    -Command 'pwsh' `
    -Arguments @('-v')

if (!$hasPwsh) {
  if (Test-CommandExists 'winget') {
    if (Ask-YesNo 'Install PowerShell 7 with winget?') {
      winget install Microsoft.PowerShell --source winget
      Write-Host 'PowerShell 7 installed. Restart VS Code after this script finishes.' -ForegroundColor Green
    }
  }
  else {
    Write-Host 'winget is not available. Install PowerShell 7 manually if needed.' -ForegroundColor Yellow
  }
}

$hasGit =
  Show-ToolVersion `
    -Name '1. Git' `
    -Command 'git' `
    -Arguments @('--version')

if (!$hasGit) {
  Write-Host 'Install Git for Windows, then rerun this script.' -ForegroundColor Red
}

$hasNode =
  Show-ToolVersion `
    -Name '2. Node.js' `
    -Command 'node' `
    -Arguments @('-v')

if (!$hasNode) {
  Write-Host 'Install Node.js LTS, then rerun this script.' -ForegroundColor Red
}

$hasNpm =
  Show-ToolVersion `
    -Name '3. npm' `
    -Command 'npm' `
    -Arguments @('-v')

if (!$hasNpm) {
  Write-Host 'npm usually comes with Node.js LTS.' -ForegroundColor Red
}

$hasClasp =
  Show-ToolVersion `
    -Name '4. clasp' `
    -Command 'clasp' `
    -Arguments @('-v')

if (!$hasClasp) {
  if ($hasNpm) {
    if (Ask-YesNo 'Install @google/clasp globally with npm?') {
      npm install -g '@google/clasp'
      $hasClasp =
        Test-CommandExists 'clasp'

      if ($hasClasp) {
        Write-Host 'clasp installed.' -ForegroundColor Green
      }
    }
  }
  else {
    Write-Host 'Cannot install clasp because npm is missing.' -ForegroundColor Red
  }
}

Write-Host ''
Write-Host '=== Git repository check ===' -ForegroundColor Cyan

if ($hasGit) {
  try {
    git status
  }
  catch {
    Write-Host 'This folder does not appear to be a valid Git repository.' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '=== Git identity check ===' -ForegroundColor Cyan

if ($hasGit) {
  $gitName =
    git config --global user.name

  $gitEmail =
    git config --global user.email

  if (!$gitName) {
    $defaultName =
      if ($env:USERNAME) { $env:USERNAME } else { 'ndmc4' }

    if ($NonInteractive) {
      $newName =
        $defaultName
    }
    else {
      $newName =
        Read-Host "Git user.name is empty. Enter name [$defaultName]"
    }

    if (!$newName) {
      $newName = $defaultName
    }

    git config --global user.name $newName
    Write-Host "Set git user.name: $newName" -ForegroundColor Green
  }
  else {
    Write-Host "git user.name: $gitName"
  }

  if (!$gitEmail) {
    $defaultEmail =
      'ndmc402010104@gmail.com'

    if ($NonInteractive) {
      $newEmail =
        $defaultEmail
    }
    else {
      $newEmail =
        Read-Host "Git user.email is empty. Enter email [$defaultEmail]"
    }

    if (!$newEmail) {
      $newEmail = $defaultEmail
    }

    git config --global user.email $newEmail
    Write-Host "Set git user.email: $newEmail" -ForegroundColor Green
  }
  else {
    Write-Host "git user.email: $gitEmail"
  }
}
else {
  Write-Host 'Skipping Git identity check because Git is missing.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== Apps Script / clasp check ===' -ForegroundColor Cyan

if ($hasClasp -or (Test-CommandExists 'clasp')) {
  $claspRc =
    Join-Path $env:USERPROFILE '.clasprc.json'

  if (!(Test-Path -LiteralPath $claspRc)) {
    Write-Host "clasp login file not found: $claspRc" -ForegroundColor Yellow

    if (Ask-YesNo 'Run clasp login now?') {
      clasp login
    }
  }

  Write-Host ''
  Write-Host 'Running clasp status...' -ForegroundColor Cyan

  try {
    clasp status
    Write-Host ''
    Write-Host 'clasp is ready.' -ForegroundColor Green
  }
  catch {
    Write-Host ''
    Write-Host 'clasp status failed.' -ForegroundColor Red
    Write-Host 'Try these steps:' -ForegroundColor Yellow
    Write-Host '1. Run: clasp login' -ForegroundColor Yellow
    Write-Host '2. Confirm .clasp.json exists and points to the right Apps Script project.' -ForegroundColor Yellow
    Write-Host '3. Confirm you have permission to the Apps Script project.' -ForegroundColor Yellow
  }
}
else {
  Write-Host 'Skipping Apps Script checks because clasp is missing.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== PowerShell session ===' -ForegroundColor Cyan
Write-Host "PSEdition: $($PSVersionTable.PSEdition)"
Write-Host "PSVersion : $($PSVersionTable.PSVersion)"

Write-Host ''
Write-Host '==================================' -ForegroundColor Green
Write-Host ' Setup check complete' -ForegroundColor Green
Write-Host '==================================' -ForegroundColor Green

Write-Host ''
Write-Host 'Suggested next steps:' -ForegroundColor Cyan
Write-Host '1. Restart VS Code if this script installed or updated tools.' -ForegroundColor Yellow
Write-Host '2. Use PowerShell 7 / pwsh.exe as the VS Code terminal profile.' -ForegroundColor Yellow
Write-Host '3. Run .\pullall.ps1 to sync the project.' -ForegroundColor Green
