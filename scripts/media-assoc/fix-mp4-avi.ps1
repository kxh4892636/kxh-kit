$ErrorActionPreference = 'Continue'
$log = 'C:\Users\kxh\AppData\Local\Temp\mpv-assoc\fix-mp4-avi.log'
function W($m) { $m | Out-File -FilePath $log -Append -Encoding utf8; Write-Host $m }

Add-Type -Path 'C:\Users\kxh\AppData\Local\Temp\mpv-assoc\UserChoice.cs'
$sid  = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mpv  = 'C:\Users\kxh\Pictures\mpv_config-2026.08.12\mpv.exe'
$base = 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\'

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

function Write-UserChoice([string]$ext, [string]$prog) {
    $sub = $base + $ext + '\UserChoice'
    $cu = [Microsoft.Win32.Registry]::CurrentUser
    $k = $cu.CreateSubKey($sub)
    if (-not $k) { return 'create failed' }
    $k.SetValue('ProgId', $prog, [Microsoft.Win32.RegistryValueKind]::String)
    $k.Close()
    for ($i = 0; $i -lt 6; $i++) {
        $ft = [MpvAssoc.UserChoice]::GetUserChoiceLastWrite($ext)
        if ($null -eq $ft) { return 'no filetime' }
        $h = [MpvAssoc.UserChoice]::HashFor($ext, $sid, $prog, $ft.dwHighDateTime, $ft.dwLowDateTime)
        $k = $cu.OpenSubKey($sub, $true); $k.SetValue('Hash', $h, [Microsoft.Win32.RegistryValueKind]::String); $k.Close()
        $ft2 = [MpvAssoc.UserChoice]::GetUserChoiceLastWrite($ext)
        if ($null -eq $ft2) { return 'no filetime2' }
        $n1 = [MpvAssoc.UserChoice]::NormalizeTimestamp($ft)
        $n2 = [MpvAssoc.UserChoice]::NormalizeTimestamp($ft2)
        if ($n1.dwHighDateTime -eq $n2.dwHighDateTime -and $n1.dwLowDateTime -eq $n2.dwLowDateTime) {
            $chk = [MpvAssoc.UserChoice]::HashFor($ext, $sid, $prog, $ft2.dwHighDateTime, $ft2.dwLowDateTime)
            if ($chk -eq $h) { return "ok hash=$h" }
        }
    }
    return 'hash mismatch'
}

"=== fix .mp4/.avi $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
W ("admin: " + (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

foreach ($item in @(@{ Ext='.avi'; Prog='mpv.Video' }, @{ Ext='.mp4'; Prog='mpv.Video' })) {
    $ext = $item.Ext; $prog = $item.Prog
    $sub = $base + $ext + '\UserChoice'
    W "---- $ext ----"
    $before = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($sub)
    if ($before) {
        W ("  before: ProgId=" + $before.GetValue('ProgId') + " Hash=" + $before.GetValue('Hash'))
        $before.Close()
    }

    $done = $false
    for ($attempt = 1; $attempt -le 5 -and -not $done; $attempt++) {
        $rm = -1
        try { $rm = Remove-DenyAce $sub } catch { }
        try { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($sub, $false) } catch { W ("  attempt$attempt delete: " + $_.Exception.Message) }
        $r = ''
        try { $r = Write-UserChoice $ext $prog } catch { $r = 'write threw: ' + $_.Exception.Message }
        $exe = [MpvAssoc.Assoc]::Exe($ext)
        W ("  attempt$attempt denyRemoved=$rm write=$r exe=$exe")
        if ($exe -eq $mpv) { $done = $true }
        Start-Sleep -Milliseconds 400
    }

    Start-Sleep -Seconds 2
    $after = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($sub)
    if ($after) { W ("  after2s: ProgId=" + $after.GetValue('ProgId')); $after.Close() }
    W ("  final exe: " + [MpvAssoc.Assoc]::Exe($ext))
}
"=== done ===" | Out-File -FilePath $log -Append -Encoding utf8
