#requires -Version 7.0
<#
    将 mpv.exe 设为当前用户所有视频 / 音频文件的默认打开程序。
    原理：
      1) 在 HKCU\Software\Classes 建立 ProgId（mpv.Video / mpv.Audio）与 Applications\mpv.exe；
      2) 在每个扩展名下写入兜底关联（HKCU\Software\Classes\.ext 默认值 + OpenWithProgids）；
      3) 写入 Explorer 的 UserChoice（含 Windows 校验用 Hash），这是 Win10/11 真正的"默认程序"位置；
      4) 用 AssocQueryString 做端到端验证。
    全程只写 HKCU，不需要管理员权限。
#>
param(
    [string]$MpvPath = 'C:\Users\kxh\Pictures\mpv_config-2026.08.12\mpv.exe',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'UserChoice.cs')

if (-not (Test-Path -LiteralPath $MpvPath)) { throw "mpv.exe not found: $MpvPath" }
$MpvPath = (Get-Item -LiteralPath $MpvPath).FullName

$Sid        = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$ProgVideo  = 'mpv.Video'
$ProgAudio  = 'mpv.Audio'
$MpvDir     = Split-Path -Parent $MpvPath

# ---------------------------------------------------------------- 扩展名清单
# 视频：系统 PerceivedType=video 的全部条目 + ffmpeg/mpv 常见但系统未登记的容器
$VideoExt = @(
    '.3g2', '.3gp', '.3gp2', '.3gpp', '.amv', '.asf', '.avi', '.av1', '.bik', '.divx',
    '.dvr-ms', '.evo', '.f4p', '.f4v', '.flv', '.h264', '.h265', '.hevc', '.ivf',
    '.m1v', '.m2p', '.m2t', '.m2ts', '.m2v', '.m4v', '.mkv', '.mod', '.mov', '.mp2v',
    '.mp4', '.mp4v', '.mpe', '.mpeg', '.mpg', '.mpv', '.mpv2', '.mts', '.mxf', '.nsv',
    '.ogm', '.ogv', '.ogx', '.rm', '.rmvb', '.roq', '.smk', '.svi', '.tod', '.trp',
    '.ts', '.tts', '.uvu', '.vob', '.vp9', '.vro', '.webm', '.wm', '.wmv', '.wtv', '.y4m'
)
# 音频：PerceivedType=audio 的全部条目 + 常见无损/有损格式 + 播放列表
$AudioExt = @(
    '.aac', '.ac3', '.adt', '.adts', '.aif', '.aifc', '.aiff', '.alac', '.amr', '.ape',
    '.au', '.aub', '.caf', '.cda', '.dff', '.dsf', '.dts', '.dtshd', '.eac3', '.ec3',
    '.flac', '.it', '.kar', '.lpcm', '.m3u', '.m3u8', '.m4a', '.m4b', '.m4p', '.m4r',
    '.mid', '.midi', '.mka', '.mp2', '.mp3', '.mpa', '.mpc', '.mpga', '.oga', '.ogg',
    '.opus', '.pls', '.rmi', '.s3m', '.shn', '.snd', '.spx', '.tak', '.tta', '.voc',
    '.w64', '.wav', '.weba', '.wma', '.wv', '.xm'
)
# 系统登记为 audio/video，但属于 Windows Media 元文件（mpv 不解析，保留原关联）
$SkipExt = @('.dtcp-ip', '.asx', '.wax', '.wmx', '.wpl', '.wvx')

# 动态补齐：本机 HKCR 中 PerceivedType 为 video/audio 但清单里没有的扩展名
foreach ($k in Get-ChildItem 'Registry::HKEY_CLASSES_ROOT' -ErrorAction SilentlyContinue) {
    $name = $k.PSChildName
    if (-not $name.StartsWith('.')) { continue }
    $pt = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue).PerceivedType
    if ($pt -eq 'video') { $VideoExt += $name }
    elseif ($pt -eq 'audio') { $AudioExt += $name }
}

$VideoExt = $VideoExt | ForEach-Object { $_.ToLowerInvariant() } | Where-Object { $_ -notin $SkipExt } | Select-Object -Unique | Sort-Object
$AudioExt = $AudioExt | ForEach-Object { $_.ToLowerInvariant() } | Where-Object { $_ -notin $SkipExt } | Select-Object -Unique | Sort-Object

# ---------------------------------------------------------------- 注册表辅助
function Set-RegDefault([string]$path, [string]$value) {
    if (-not $DryRun) {
        if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
        Set-ItemProperty -Path $path -Name '(default)' -Value $value
    }
}
function Set-RegValue([string]$path, [string]$name, $value, [string]$type = 'String') {
    if ($DryRun) { return }
    if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
    if ($type -eq 'None') {
        $k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(($path -replace '^HKCU:\\', ''))
        $k.SetValue($name, [byte[]]@(), [Microsoft.Win32.RegistryValueKind]::None)
        $k.Close()
    } else {
        New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $type -Force | Out-Null
    }
}

function New-MpvProgId([string]$progId, [string]$perceived, [string]$friendly) {
    $b = "HKCU:\Software\Classes\$progId"
    Set-RegDefault $b $friendly
    Set-RegValue   $b 'FriendlyTypeName' $friendly
    Set-RegValue   $b 'PerceivedType' $perceived
    Set-RegDefault "$b\DefaultIcon" ('"{0}",0' -f $MpvPath)
    Set-RegDefault "$b\shell\open\command" ('"{0}" "%1"' -f $MpvPath)
    Set-RegValue   "$b\shell" 'FriendlyAppName' 'mpv'
}

function Set-ExtFallback([string]$ext, [string]$progId) {
    $k = "HKCU:\Software\Classes\$ext"
    Set-RegDefault $k $progId
    Set-RegValue   $k 'PerceivedType' $(if ($progId -eq $ProgAudio) { 'audio' } else { 'video' })
    Set-RegValue   "$k\OpenWithProgids" $progId $null 'None'
    Set-RegValue   "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithProgids" $progId $null 'None'
}

function Set-UserChoice([string]$ext, [string]$progId) {
    if ($DryRun) { return [pscustomobject]@{ Ok = $true; Err = '' } }
    $fe = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext"
    try {
        if (-not (Test-Path $fe)) { New-Item -Path $fe -Force | Out-Null }

        # 新版系统可能存在的 UserChoiceLatest 优先于 UserChoice，必须移除以确保生效
        $latest = "$fe\UserChoiceLatest"
        if (Test-Path $latest) { Remove-Item -LiteralPath $latest -Recurse -Force }

        $uc = "$fe\UserChoice"
        if (-not (Test-Path $uc)) { New-Item -Path $uc -Force | Out-Null }
        Remove-ItemProperty -LiteralPath $uc -Name 'Hash' -ErrorAction SilentlyContinue
        Set-ItemProperty -LiteralPath $uc -Name 'ProgId' -Value $progId

        # Hash 依赖 UserChoice 键的 LastWriteTime（秒以下被算法丢弃，因此同分钟内写入即自洽）
        for ($i = 0; $i -lt 8; $i++) {
            $ft = [MpvAssoc.UserChoice]::GetUserChoiceLastWrite($ext)
            if ($null -eq $ft) { break }
            $h = [MpvAssoc.UserChoice]::HashFor($ext, $Sid, $progId, $ft.dwHighDateTime, $ft.dwLowDateTime)
            Set-ItemProperty -LiteralPath $uc -Name 'Hash' -Value $h

            $ft2 = [MpvAssoc.UserChoice]::GetUserChoiceLastWrite($ext)
            if ($null -eq $ft2) { break }
            $n1 = [MpvAssoc.UserChoice]::NormalizeTimestamp($ft)
            $n2 = [MpvAssoc.UserChoice]::NormalizeTimestamp($ft2)
            if ($n1.dwHighDateTime -eq $n2.dwHighDateTime -and $n1.dwLowDateTime -eq $n2.dwLowDateTime) {
                $check = [MpvAssoc.UserChoice]::HashFor($ext, $Sid, $progId, $ft2.dwHighDateTime, $ft2.dwLowDateTime)
                if ($check -eq $h) { return [pscustomobject]@{ Ok = $true; Err = '' } }
            }
        }
        return [pscustomobject]@{ Ok = $false; Err = 'hash-not-selfconsistent' }
    } catch {
        return [pscustomobject]@{ Ok = $false; Err = $_.Exception.Message }
    }
}

# ---------------------------------------------------------------- 1) ProgId
if (-not $DryRun) {
    New-MpvProgId $ProgVideo 'video' 'mpv 视频文件'
    New-MpvProgId $ProgAudio 'audio' 'mpv 音频文件'

    # Applications\mpv.exe —— 让 "打开方式" 列表里稳定出现 mpv
    $app = 'HKCU:\Software\Classes\Applications\mpv.exe'
    Set-RegDefault "$app\shell\open\command" ('"{0}" "%1"' -f $MpvPath)
    Set-RegDefault "$app\DefaultIcon" ('"{0}",0' -f $MpvPath)
    Set-RegValue   $app 'FriendlyAppName' 'mpv'
    Set-RegValue   $app 'ApplicationCompany' 'mpv'
    foreach ($e in ($VideoExt + $AudioExt)) { Set-RegValue "$app\SupportedTypes" $e $null 'None' }

    # 注册"默认应用"面板识别（设置 → 应用 → 默认应用 → mpv）
    $cap = 'HKCU:\Software\MPV\mpv\Capabilities'
    Set-RegValue $cap 'ApplicationName' 'mpv'
    Set-RegValue $cap 'ApplicationDescription' 'mpv 播放器'
    Set-RegValue $cap 'ApplicationIcon' ('"{0}",0' -f $MpvPath)
    foreach ($e in $VideoExt) { Set-RegValue "$cap\FileAssociations" $e $ProgVideo }
    foreach ($e in $AudioExt) { Set-RegValue "$cap\FileAssociations" $e $ProgAudio }
    $ra = 'HKCU:\Software\RegisteredApplications'
    if (-not (Test-Path $ra)) { New-Item -Path $ra -Force | Out-Null }
    Set-ItemProperty -Path $ra -Name 'mpv' -Value 'Software\MPV\mpv\Capabilities'

    # App Paths，便于 ShellExecute("mpv") 与命令行直接调用
    $ap = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\mpv.exe'
    Set-RegDefault $ap $MpvPath
    Set-RegValue   $ap 'Path' $MpvDir
}

# ---------------------------------------------------------------- 2) 逐个扩展
$report = @()
foreach ($e in $VideoExt) {
    $prog = $ProgVideo
    Set-ExtFallback $e $prog
    $r = Set-UserChoice $e $prog
    $report += [pscustomobject]@{ Ext = $e; Kind = 'video'; ProgId = $prog; UserChoiceWrite = $r.Ok; Err = $r.Err }
}
foreach ($e in $AudioExt) {
    $prog = $ProgAudio
    Set-ExtFallback $e $prog
    $r = Set-UserChoice $e $prog
    $report += [pscustomobject]@{ Ext = $e; Kind = 'audio'; ProgId = $prog; UserChoiceWrite = $r.Ok; Err = $r.Err }
}

# ---------------------------------------------------------------- 3) 通知 shell 刷新
if (-not $DryRun) {
    Add-Type -Namespace W -Name Sh -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);
'@ -ErrorAction SilentlyContinue
    [W.Sh]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)  # SHCNE_ASSOCCHANGED
}

# ---------------------------------------------------------------- 4) 端到端验证
$verify = foreach ($e in ($VideoExt + $AudioExt)) {
    $exe = [MpvAssoc.Assoc]::Exe($e)
    [pscustomobject]@{
        Ext  = $e
        Exe  = $exe
        App  = [MpvAssoc.Assoc]::AppName($e)
        Ok   = ($exe -eq $MpvPath)
    }
}

"mpv           : $MpvPath"
"video exts    : $($VideoExt.Count)"
"audio exts    : $($AudioExt.Count)"
"skipped exts  : $($SkipExt -join ' ')"
"UserChoice 失败: $(@($report | Where-Object { -not $_.UserChoiceWrite }).Count)"
@($report | Where-Object { -not $_.UserChoiceWrite }) | Select-Object Ext, Kind, Err | Format-Table -AutoSize | Out-String -Width 160
"端到端验证通过: $(@($verify | Where-Object Ok).Count) / $($verify.Count)"
$bad = @($verify | Where-Object { -not $_.Ok })
if ($bad.Count) { $bad | Format-Table -AutoSize | Out-String -Width 160 }
