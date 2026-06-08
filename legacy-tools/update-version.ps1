param(
  [ValidateSet('major','minor','patch','none')]
  [string]$Bump = 'none',

  [string[]]$Note = @()
)

$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'push.ps1') `
  -Action deploy `
  -Bump $Bump `
  -Note $Note
