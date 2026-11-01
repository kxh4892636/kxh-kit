$ErrorActionPreference = 'Continue'
$log = 'C:\Users\kxh\AppData\Local\Temp\mpv-assoc\restore-ucpd.log'
function W($m) { $m | Out-File -FilePath $log -Append -Encoding utf8; Write-Host $m }

"=== restore UCPD $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
W ("admin: " + (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
W ("exists before: " + (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Services\UCPD'))

W ((sc.exe create UCPD type= filesystem start= system error= normal group= "FSFilter Activity Monitor" binPath= "system32\drivers\UCPD.sys" DisplayName= "@%SystemRoot%\system32\drivers\UCPD.sys,-200" 2>&1 | Out-String) + " exit=$LASTEXITCODE")

$svc = 'HKLM\SYSTEM\CurrentControlSet\Services\UCPD'
W ((reg.exe add $svc /v Description /t REG_SZ /d "@%SystemRoot%\system32\drivers\UCPD.sys,-201" /f 2>&1 | Out-String))
W ((reg.exe add $svc /v FeatureV2 /t REG_DWORD /d 0x134c23ee /f 2>&1 | Out-String))
W ((reg.exe add $svc /v SupportedFeatures /t REG_DWORD /d 0xf /f 2>&1 | Out-String))
W ((reg.exe add $svc /v RCodeCache /t REG_DWORD /d 0x2d /f 2>&1 | Out-String))
W ((reg.exe add "$svc\Instances" /v DefaultInstance /t REG_SZ /d "UCPD - Top Instance" /f 2>&1 | Out-String))
W ((reg.exe add "$svc\Instances\UCPD - Top Instance" /v Altitude /t REG_SZ /d "385250.5" /f 2>&1 | Out-String))
W ((reg.exe add "$svc\Instances\UCPD - Top Instance" /v Flags /t REG_DWORD /d 0 /f 2>&1 | Out-String))
$sec = '01001480A0000000AC000000140000003000000002001C000100000002801400FF010F00010100000000000100000000020070000500000000001400FF010F0001010000000000051200000000001800FF010F0001020000000000052000000020020000000014009D000200010100000000000504000000000014009D000200010100000000000506000000000014009D000200010100000000000503000000010100000000000512000000010100000000000512000000'
W ((reg.exe add "$svc\Security" /v Security /t REG_BINARY /d $sec /f 2>&1 | Out-String))

W "--- verify ---"
W ((reg.exe query $svc /s 2>&1 | Out-String))
W ((sc.exe query UCPD 2>&1 | Out-String))
W ((fltmc.exe filters 2>&1 | Out-String))
