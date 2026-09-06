param([string]$Go = 'go')
$ErrorActionPreference = 'Stop'
if (-not (Get-Command $Go -ErrorAction SilentlyContinue)) {
    $Go = Join-Path $env:LOCALAPPDATA 'Programs/Go1.26.8/go/bin/go.exe'
}
Push-Location $PSScriptRoot
try {
    & $Go run github.com/akavel/rsrc@v0.10.2 -manifest app.manifest -o rsrc_windows_amd64.syso
    if ($LASTEXITCODE -ne 0) { throw 'Manifest 编译失败' }
    & $Go build -trimpath -ldflags '-H=windowsgui -s -w' -o dist/dsh-manager.exe .
    if ($LASTEXITCODE -ne 0) { throw 'Go 构建失败' }
    Get-Item -LiteralPath dist/dsh-manager.exe | Select-Object FullName, Length
} finally { Pop-Location }
