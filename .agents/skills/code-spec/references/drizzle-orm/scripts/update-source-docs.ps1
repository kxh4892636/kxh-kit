param(
  [string]$DownloadUrl = "https://codeload.github.com/drizzle-team/drizzle-orm-docs/zip/refs/heads/main",
  [string]$ZipPrefix = "drizzle-orm-docs-main/src/content/docs/"
)

$ErrorActionPreference = "Stop"

$skillRoot = Split-Path -Parent $PSScriptRoot
$referencesRoot = Join-Path $skillRoot "references"
$docsDest = Join-Path $referencesRoot "source-docs"
$stage = Join-Path $referencesRoot ".source-docs-new"
$old = Join-Path $referencesRoot ".source-docs-old"

function Assert-UnderSkillRoot {
  param([string]$Path)
  $resolvedRoot = [System.IO.Path]::GetFullPath($skillRoot)
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify path outside skill root: $resolvedPath"
  }
}

Assert-UnderSkillRoot $docsDest
Assert-UnderSkillRoot $stage
Assert-UnderSkillRoot $old

if (Test-Path $stage) {
  Remove-Item -Recurse -Force $stage
}
if (Test-Path $old) {
  Remove-Item -Recurse -Force $old
}

New-Item -ItemType Directory -Force -Path $stage | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

$client = [System.Net.Http.HttpClient]::new()
$bytes = $client.GetByteArrayAsync($DownloadUrl).GetAwaiter().GetResult()
$stream = [System.IO.MemoryStream]::new($bytes)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read)

try {
  foreach ($entry in $zip.Entries) {
    if (-not $entry.FullName.StartsWith($ZipPrefix)) {
      continue
    }

    $relative = $entry.FullName.Substring($ZipPrefix.Length)
    if ([string]::IsNullOrWhiteSpace($relative)) {
      continue
    }

    $target = Join-Path $stage ($relative -replace "/", [System.IO.Path]::DirectorySeparatorChar)
    Assert-UnderSkillRoot $target

    if ($entry.FullName.EndsWith("/")) {
      New-Item -ItemType Directory -Force -Path $target | Out-Null
      continue
    }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::Open($target, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
      $entryStream.CopyTo($fileStream)
    }
    finally {
      $fileStream.Dispose()
      $entryStream.Dispose()
    }
  }
}
finally {
  $zip.Dispose()
  $stream.Dispose()
  $client.Dispose()
}

$fileCount = (Get-ChildItem -Recurse -File $stage | Measure-Object).Count
if ($fileCount -lt 1) {
  throw "No docs were extracted from $DownloadUrl with prefix $ZipPrefix"
}

if (Test-Path $docsDest) {
  Rename-Item -Path $docsDest -NewName ".source-docs-old"
}
Move-Item -Path $stage -Destination $docsDest
Remove-Item -Recurse -Force $old

Write-Host "Updated Drizzle source docs: $fileCount files"
