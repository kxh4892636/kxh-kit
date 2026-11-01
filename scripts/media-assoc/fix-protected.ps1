$ErrorActionPreference = 'Continue'
$log = 'C:\Users\kxh\AppData\Local\Temp\mpv-assoc\fix-protected.log'
function W($m) { $m | Out-File -FilePath $log -Append -Encoding utf8; Write-Host $m }

Add-Type -Path 'C:\Users\kxh\AppData\Local\Temp\mpv-assoc\UserChoice.cs'
$sid  = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mpv  = 'C:\Users\kxh\Pictures\mpv_config-2026.08.12\mpv.exe'
$base = 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\'

$targets = @(
    @{ Ext = '.avi';  Prog = 'mpv.Video' }, @{ Ext = '.mp4';  Prog = 'mpv.Video' },
    @{ Ext = '.mp4v'; Prog = 'mpv.Video' }, @{ Ext = '.mod';  Prog = 'mpv.Video' },
    @{ Ext = '.tts';  Prog = 'mpv.Video' }, @{ Ext = '.wm';   Prog = 'mpv.Video' },
    @{ Ext = '.aac';  Prog = 'mpv.Audio' }, @{ Ext = '.adt';  Prog = 'mpv.Audio' },
    @{ Ext = '.adts'; Prog = 'mpv.Audio' }, @{ Ext = '.m3u';  Prog = 'mpv.Audio' },
    @{ Ext = '.m4a';  Prog = 'mpv.Audio' }, @{ Ext = '.mp2';  Prog = 'mpv.Audio' },
    @{ Ext = '.mpa';  Prog = 'mpv.Audio' }, @{ Ext = '.wma';  Prog = 'mpv.Audio' }
)

function Remove-DenyAce([string]$subKeyPath) {
    $rights = [System.Security.AccessControl.RegistryRights]::ChangePermissions -bor [System.Security.AccessControl.RegistryRights]::ReadPermissions
    $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($subKeyPath, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, $rights)
    if (-not $k) { return -1 }
    $sec = $k.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    $n = 0
    foreach ($r in @($sec.GetAccessRules($true, $true, [System.Security.Principal.NTAccount]))) {
        if ($r.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Deny) { [void]$sec.RemoveAccessRule($r); $n++ }
    }
    $k.SetAccessControl($sec); $k.Close()
    return $n
}

"=== fix-protected $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
W ("admin: " + (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
W "--- fltmc filters before ---"
W ((fltmc.exe filters 2>&1 | Out-String))

W "--- unload UCPD ---"
W ((fltmc.exe unload UCPD 2>&1 | Out-String) + " exit=$LASTEXITCODE")
Start-Sleep -Milliseconds 500
W ((fltmc.exe filters 2>&1 | Out-String))

W "--- rewrite ---"
foreach ($t in $targets) {
    $ext = $t.Ext; $prog = $t.Prog
    $sub = $base + $ext + '\UserChoice'
    $rp  = "HKCU:\$($sub -replace '\\','\')"
    $denyRemoved = -1
    try { $denyRemoved = Remove-DenyAce $sub } catch { }

    $ok = $false; $err = ''
    try {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($sub, $true)
        if ($key) {
            $key.SetValue('ProgId', $prog, [Microsoft.Win32.RegistryValueKind]::String)
            $key.Close()
            for ($i = 0; $i -lt 6; $i++) {
                $ft = [MpvAssoc.UserChoice]::GetUserChoiceLastWrite($ext)
                if ($null -eq $ft) { break }
                $h = [MpvAssoc.UserChoice]::HashFor($ext, $sid, $prog, $ft.dwHighDateTime, $ft.dwLowDateTime)
                $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($sub, $true)
                $key.SetValue('Hash', $h, [Microsoft.Win32.RegistryValueKind]::String)
                $key.Close()
                $ft2 = [MpvAssoc.UserChoice]::GetUserChoiceLastWrite($ext)
                if ($null -eq $ft2) { break }
                $n1 = [MpvAssoc.UserChoice]::NormalizeTimestamp($ft)
                $n2 = [MpvAssoc.UserChoice]::NormalizeTimestamp($ft2)
                if ($n1.dwHighDateTime -eq $n2.dwHighDateTime -and $n1.dwLowDateTime -eq $n2.dwLowDateTime) {
                    $chk = [MpvAssoc.UserChoice]::HashFor($ext, $sid, $prog, $ft2.dwHighDateTime, $ft2.dwLowDateTime)
                    if ($chk -eq $h) { $ok = $true; break }
                }
            }
        } else { $err = 'open failed' }
    } catch { $err = $_.Exception.Message }

    $exe = [MpvAssoc.Assoc]::Exe($ext)
    W ("{0,-7} denyRemoved={1,-2} write={2,-5} exe={3} {4}" -f $ext, $denyRemoved, $ok, $exe, $err)
}

W "--- reload UCPD ---"
W ((fltmc.exe load UCPD 2>&1 | Out-String) + " exit=$LASTEXITCODE")
Start-Sleep -Milliseconds 500
W ((fltmc.exe filters 2>&1 | Out-String))

W "--- verify after reload ---"
foreach ($t in $targets) {
    $exe = [MpvAssoc.Assoc]::Exe($t.Ext)
    W ("{0,-7} {1} {2}" -f $t.Ext, $(if ($exe -eq $mpv) { 'OK  ' } else { 'FAIL' }), $exe)
}
"=== done ===" | Out-File -FilePath $log -Append -Encoding utf8
