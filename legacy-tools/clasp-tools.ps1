$ErrorActionPreference = 'Stop'

function Invoke-Clasp {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [string]$WorkingDirectory
  )

  if ($WorkingDirectory) {
    Push-Location -LiteralPath $WorkingDirectory
  }

  try {
    $output = & clasp @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    if ($WorkingDirectory) {
      Pop-Location
    }
  }

  if ($exitCode -ne 0) {
    throw ($output -join "`n")
  }

  if ($output) {
    Write-Host ($output -join "`n")
  }
}

function Resolve-ProjectPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,

    [Parameter(Mandatory = $true)]
    [string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    $path = Join-Path $RootPath $candidate

    if (Test-Path -LiteralPath $path) {
      return $path
    }
  }

  return Join-Path $RootPath $Candidates[0]
}

function Get-ProjectConfigPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath
  )

  $directPath = Join-Path $RootPath 'Config.js'

  if (Test-Path -LiteralPath $directPath) {
    return $directPath
  }

  $found = Get-ChildItem -Path $RootPath -Filter 'Config.js' -File -Recurse |
    Where-Object {
      $_.FullName -notlike '*\.git\*' -and
      $_.FullName -notlike '*\.vscode\*'
    } |
    Select-Object -First 1

  if ($found) {
    return $found.FullName
  }

  return $directPath
}

function Get-ProjectReadmePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath
  )

  return Resolve-ProjectPath `
    -RootPath $RootPath `
    -Candidates @('README.md','README.html')
}

function Test-ChangedFileName {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Files,

    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  foreach ($file in $Files) {
    $leaf = Split-Path $file -Leaf

    if ($Names -contains $leaf) {
      return $true
    }
  }

  return $false
}

function Join-CodePointString {
  param(
    [Parameter(Mandatory = $true)]
    [int[]]$CodePoints
  )

  return -join (
    $CodePoints |
    ForEach-Object {
      [char]$_
    }
  )
}

function Join-HexCodePointString {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Hex
  )

  return -join (
    $Hex -split '\s+' |
    Where-Object { $_ } |
    ForEach-Object {
      [char]([Convert]::ToInt32($_, 16))
    }
  )
}

function New-ReadmeBullet {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Hex
  )

  return '- ' + (Join-HexCodePointString -Hex $Hex)
}

function New-ReadmeBulletText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text
  )

  $trimmed = $Text.Trim()

  if ($trimmed.StartsWith('- ')) {
    return $trimmed
  }

  return '- ' + $trimmed
}

function Get-ReadmeChangedFiles {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath
  )

  $output = & git -C $RootPath status --short --untracked-files=all 2>$null

  if ($LASTEXITCODE -ne 0 -or -not $output) {
    return @()
  }

  $ignored = @(
    '.clasp.json',
    '.vscode/.clasp.json',
    'Config.js',
    'README.html',
    'README.md'
  )

  $files = [System.Collections.Generic.List[string]]::new()

  foreach ($line in $output) {
    if ($line -notmatch '^..\s+(.+)$') {
      continue
    }

    $path = $Matches[1].Trim()

    if ($path -match '\s+->\s+(.+)$') {
      $path = $Matches[1].Trim()
    }

    $path = $path.Trim('"').Replace('\','/')
    $leaf = Split-Path $path -Leaf

    if (
      $ignored -contains $path -or
      $ignored -contains $leaf
    ) {
      continue
    }

    $files.Add($path)
  }

  return $files |
    Sort-Object -Unique
}

function Get-CurrentAppVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath
  )

  $configPath = Get-ProjectConfigPath -RootPath $RootPath

  if (-not (Test-Path -LiteralPath $configPath)) {
    return $null
  }

  $configLines = Get-Content -Path $configPath -Encoding UTF8

  return Get-ConfigConstValue -Lines $configLines -Name 'APP_VERSION'
}

function Get-VersionParts {
  param(
    [AllowEmptyString()]
    [string]$Version
  )

  if ($Version -match '^(\d+)\.(\d+)\.(\d+)-\d{12}$') {
    return [pscustomobject]@{
      Major = [int]$Matches[1]
      Minor = [int]$Matches[2]
      Patch = [int]$Matches[3]
      Found = $true
    }
  }

  return [pscustomobject]@{
    Major = 0
    Minor = 5
    Patch = 0
    Found = $false
  }
}

function New-AppVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,

    [ValidateSet('major','minor','patch','none')]
    [string]$Bump = 'patch'
  )

  $currentVersion = Get-CurrentAppVersion -RootPath $RootPath
  $parts = Get-VersionParts -Version $currentVersion

  switch ($Bump) {
    'major' {
      $parts.Major++
      $parts.Minor = 0
      $parts.Patch = 0
    }
    'minor' {
      $parts.Minor++
      $parts.Patch = 0
    }
    'patch' {
      if ($parts.Found) {
        $parts.Patch++
      }
      else {
        $parts.Minor++
        $parts.Patch = 0
      }
    }
    'none' {
      if (-not $parts.Found) {
        $parts.Minor++
        $parts.Patch = 0
      }
    }
  }

  $timestamp = Get-Date -Format 'yyyyMMddHHmm'

  return "$($parts.Major).$($parts.Minor).$($parts.Patch)-$timestamp"
}

function Get-ReadmeUpdateBullets {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,

    [ValidateSet('dev','prod')]
    [string]$ReleaseType = 'dev',

    [string[]]$Notes = @()
  )

  $noteBullets = @(
    $Notes |
      Where-Object { $_ -and $_.Trim() } |
      ForEach-Object { New-ReadmeBulletText -Text $_ }
  )

  if ($noteBullets.Count -gt 0) {
    return $noteBullets
  }

  $files = @(
    Get-ReadmeChangedFiles -RootPath $RootPath
  )

  if ($files.Count -eq 0) {
    return @()
  }

  $bullets = [System.Collections.Generic.List[string]]::new()

  if (Test-ChangedFileName -Files $files -Names @('AdminMeeting.html','AdminMeetingScript.html')) {
    $bullets.Add(
      (New-ReadmeBullet '6539 5584 6668 6703 7BA1 7406 8868 683C 7684 7DE8 8F2F 63D0 793A 3001 0052 0057 0044 0020 6B04 5BEC 8207 522A 9664 64CD 4F5C')
    )
  }

  if (Test-ChangedFileName -Files $files -Names @('BackendPeople.js','MeetingRawData.js')) {
    $bullets.Add(
      (New-ReadmeBullet '62C6 5206 539F 59CB 8CC7 6599 8207 5F8C 53F0 7DAD 8B77 8CC7 6599 4F86 6E90 FF0C 652F 63F4 4F86 6E90 4EE3 78BC')
    )
  }

  if (Test-ChangedFileName -Files $files -Names @('Staff.js')) {
    $bullets.Add(
      (New-ReadmeBullet '540C 6B65 7C3D 5230 55AE 540D 55AE 6392 5E8F 8207 0020 0053 0074 0061 0066 0066 002E 006A 0073 0020 8077 7D1A 898F 5247')
    )
  }

  if (Test-ChangedFileName -Files $files -Names @('clasp-tools.ps1','push.ps1','watch-push.ps1','update-version.ps1','tasks.json')) {
    $bullets.Add(
      (New-ReadmeBullet '66F4 65B0 7248 672C 865F 3001 0052 0045 0041 0044 004D 0045 0020 65E5 8A8C 3001 0070 0075 0073 0068 0020 8207 0020 0064 0065 0070 006C 006F 0079 0020 81EA 52D5 5316')
    )
  }

  if (Test-ChangedFileName -Files $files -Names @('Calendar.js','MeetingAdmin.js')) {
    $bullets.Add(
      (New-ReadmeBullet '6539 5584 884C 4E8B 66C6 4F86 6E90 8207 6703 8B70 6E05 55AE 8F09 5165')
    )
  }

  if (Test-ChangedFileName -Files $files -Names @('Route.js','Front.js','Admin.js','QR.js','Sign.js')) {
    $bullets.Add(
      (New-ReadmeBullet '540C 6B65 6E2C 8A66 7248 FF0F 6B63 5F0F 7248 5C0E 89BD 3001 8DEF 7531 8207 7248 672C 6A19 7C64')
    )
  }

  if ($bullets.Count -eq 0) {
    $bullets.Add(
      (New-ReadmeBullet '66F4 65B0 5C08 6848 884C 70BA 8207 652F 63F4 6A94 6848')
    )
  }

  return $bullets.ToArray()
}

function Update-ReadmeVersionLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [ValidateSet('dev','prod')]
    [string]$ReleaseType = 'dev',

    [string]$SourceVersion,

    [string[]]$Notes = @()
  )

  $readmePath = Get-ProjectReadmePath -RootPath $RootPath

  if (-not (Test-Path -LiteralPath $readmePath)) {
    throw 'Cannot find README.md or README.html'
  }

  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  $content = [System.IO.File]::ReadAllText($readmePath, [System.Text.Encoding]::UTF8)
  $lineEnding = if ($content -match "`r`n") { "`r`n" } else { "`n" }
  $normalized = $content -replace "`r`n", "`n"

  $prodText = Join-CodePointString @(0x6B63,0x5F0F,0x7248)
  $sourceText = Join-CodePointString @(0x4F86,0x6E90,0xFF1A)
  $updateText = Join-CodePointString @(0x66F4,0x65B0,0xFF1A)
  $versionLogAnchor = (Join-CodePointString @(0x0023,0x0020,0x7248,0x672C,0x65E5,0x8A8C))
  $latestVersionAnchor = (Join-CodePointString @(0x0023,0x0023,0x0020,0x6700,0x65B0,0x7248,0x672C))

  if ($ReleaseType -eq 'prod') {
    $title = "$prodText v$Version"
  }
  else {
    $title = "v$Version"
  }

  $escapedTitle = [regex]::Escape($title)

  if ($normalized -match "(?m)^$escapedTitle\s*$") {
    return $false
  }

  $anchorIndex = $normalized.IndexOf($versionLogAnchor)

  if ($anchorIndex -lt 0) {
    throw 'Cannot find README version log section'
  }

  $latestIndex = $normalized.IndexOf($latestVersionAnchor, $anchorIndex)

  if ($latestIndex -lt 0) {
    throw 'Cannot find README latest version section'
  }

  $separator = "---`n"
  $separatorIndex = $normalized.IndexOf($separator, $latestIndex)

  if ($separatorIndex -lt 0) {
    throw 'Cannot find README latest version separator'
  }

  $insertAt = $separatorIndex + $separator.Length

  $entryLines = [System.Collections.Generic.List[string]]::new()

  $entryLines.Add('')
  $entryLines.Add($title)
  $entryLines.Add('')

  if ($ReleaseType -eq 'prod') {
    $entryLines.Add($sourceText)

    if ($SourceVersion) {
      $entryLines.Add("v$SourceVersion")
    }
    else {
      $entryLines.Add("v$Version")
    }

    $entryLines.Add('')
  }

  $entryLines.Add($updateText)
  $entryLines.Add('')

  $bullets =
    Get-ReadmeUpdateBullets `
      -RootPath $RootPath `
      -ReleaseType $ReleaseType `
      -Notes $Notes

  if ($bullets.Count -eq 0) {
    $bullets = @(
      New-ReadmeBulletText -Text '更新專案行為與支援檔案'
    )
  }

  foreach ($bullet in $bullets) {
    $entryLines.Add($bullet)
  }

  $entryLines.Add('')
  $entryLines.Add('---')
  $entryLines.Add('')

  $entry = $entryLines -join "`n"
  $updated = $normalized.Insert($insertAt, $entry)
  $updated = $updated -replace "`n", $lineEnding

  [System.IO.File]::WriteAllText($readmePath, $updated, $utf8NoBom)

  return $true
}

function Get-ConfigConstValue {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string[]]$Lines,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $line = $Lines[$i]

    if ($line -match "^\s*const\s+$Name\s*=\s*'([^']*)'\s*;\s*$") {
      return $Matches[1]
    }

    if ($line -match "^\s*const\s+$Name\s*=\s*$") {
      for ($j = $i + 1; $j -lt $Lines.Count; $j++) {
        if ($Lines[$j] -match "'([^']*)'") {
          return $Matches[1]
        }

        if ($Lines[$j] -match '^\s*const\s+\w+\s*=') {
          break
        }
      }
    }
  }

  return $null
}

function Set-ConfigConstValue {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string[]]$Lines,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value,

    [string]$InsertAfterName
  )

  $updatedLines = [System.Collections.Generic.List[string]]::new()
  $found = $false

  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $line = $Lines[$i]

    if ($line -match "^\s*const\s+$Name\s*=") {
      $updatedLines.Add("const $Name =")
      $updatedLines.Add("'$Value';")
      $found = $true

      if (
        $i + 1 -lt $Lines.Count -and
        $Lines[$i + 1] -match "^\s*'[^']*'\s*;\s*$"
      ) {
        $i++
      }

      continue
    }

    $updatedLines.Add($line)
  }

  if ($found) {
    return $updatedLines.ToArray()
  }

  if (-not $InsertAfterName) {
    throw "Cannot find $Name in Config.js"
  }

  $insertedLines = [System.Collections.Generic.List[string]]::new()
  $inserted = $false
  $insideInsertTarget = $false

  foreach ($line in $updatedLines) {
    $insertedLines.Add($line)

    if ($line -match "^\s*const\s+$InsertAfterName\s*=") {
      $insideInsertTarget = $true
      continue
    }

    if ($insideInsertTarget -and $line -match ";\s*$") {
      $insertedLines.Add("const $Name =")
      $insertedLines.Add("'$Value';")
      $inserted = $true
      $insideInsertTarget = $false
    }
  }

  if (-not $inserted) {
    throw "Cannot insert $Name after $InsertAfterName in Config.js"
  }

  return $insertedLines.ToArray()
}

function Get-ClaspHeadDeploymentId {
  param(
    [string]$WorkingDirectory
  )

  if ($WorkingDirectory) {
    Push-Location -LiteralPath $WorkingDirectory
  }

  try {
    $output = & clasp list-deployments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    if ($WorkingDirectory) {
      Pop-Location
    }
  }

  if ($exitCode -ne 0) {
    return $null
  }

  foreach ($line in $output) {
    if ($line -match '^\s*-\s+(\S+)\s+@HEAD\b') {
      return $Matches[1]
    }
  }

  return $null
}

function Sync-AppVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [ValidateSet('dev','prod')]
    [string]$DefaultEnv = 'dev'
  )

  $configPath = Get-ProjectConfigPath -RootPath $RootPath
  $claspPath = Join-Path $RootPath '.clasp.json'
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)

  $configLines = Get-Content -Path $configPath -Encoding UTF8
  $scriptId = Get-ConfigConstValue -Lines $configLines -Name 'SCRIPT_ID'
  $deploymentId = Get-ConfigConstValue -Lines $configLines -Name 'DEPLOYMENT_ID'
  $devDeploymentId = Get-ConfigConstValue -Lines $configLines -Name 'APP_DEV_DEPLOYMENT_ID'
  $entryUrl = Get-ConfigConstValue -Lines $configLines -Name 'APP_ENTRY_URL'
  $devUrl = Get-ConfigConstValue -Lines $configLines -Name 'APP_DEV_URL'

  if (-not $scriptId) {
    throw 'Cannot find SCRIPT_ID in Config.js'
  }

  if ($deploymentId) {
    $entryUrl = "https://script.google.com/macros/s/$deploymentId/exec"

    $configLines = Set-ConfigConstValue `
      -Lines $configLines `
      -Name 'APP_ENTRY_URL' `
      -Value $entryUrl
  }

  if (-not $entryUrl) {
    throw 'Cannot find APP_ENTRY_URL in Config.js'
  }

  if (-not $devDeploymentId) {
    $devDeploymentId = Get-ClaspHeadDeploymentId -WorkingDirectory $RootPath
  }

  if ($devDeploymentId) {
    $devUrl = "https://script.google.com/macros/s/$devDeploymentId/dev"

    $configLines = Set-ConfigConstValue `
      -Lines $configLines `
      -Name 'APP_DEV_DEPLOYMENT_ID' `
      -Value $devDeploymentId `
      -InsertAfterName 'DEPLOYMENT_ID'
  }

  if (-not $devUrl) {
    throw 'Cannot find APP_DEV_URL in Config.js'
  }

  $configLines = Set-ConfigConstValue `
    -Lines $configLines `
    -Name 'APP_VERSION' `
    -Value $Version

  $configLines = Set-ConfigConstValue `
    -Lines $configLines `
    -Name 'APP_DEFAULT_ENV' `
    -Value $DefaultEnv `
    -InsertAfterName 'APP_DEV_DEPLOYMENT_ID'

  $configLines = Set-ConfigConstValue `
    -Lines $configLines `
    -Name 'APP_DEV_URL' `
    -Value $devUrl `
    -InsertAfterName 'APP_ENTRY_URL'

  [System.IO.File]::WriteAllLines($configPath, $configLines, $utf8NoBom)

  $claspConfig = @{
    scriptId = $scriptId
    rootDir = '.'
  } | ConvertTo-Json -Depth 5

  [System.IO.File]::WriteAllText($claspPath, $claspConfig, $utf8NoBom)

  return [pscustomobject]@{
    Version = $Version
    Description = "v$Version"
    ScriptId = $scriptId
    DeploymentId = $deploymentId
    DevDeploymentId = $devDeploymentId
    EntryUrl = $entryUrl
    DevUrl = $devUrl
    DefaultEnv = $DefaultEnv
  }
}
