# mpv 默认播放器关联工具

把 `mpv.exe` 设为当前用户所有视频 / 音频文件的默认打开程序（Windows 10/11，免管理员，纯 HKCU）。

## 文件

| 文件                 | 作用                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserChoice.cs`      | UserChoice 哈希算法实现（`FormatUserChoiceString` + `HashString`），照 Mozilla `WindowsUserChoice.cpp` / PS-SFTA 重写；含 `RegQueryInfoKey` 取键 LastWriteTime、`AssocQueryString` 端到端查询 |
| `Set-MpvDefault.ps1` | 主流程：建 ProgId / Applications / Capabilities，逐扩展写兜底关联 + UserChoice，最后验证                                                                                                      |
| `fix-protected.ps1`  | 被 UCPD 上锁的扩展：移除 Deny SetValue ACE 后写入（需管理员）                                                                                                                                 |
| `fix-mp4-avi.ps1`    | `.mp4` / `.avi` 这类“Deny ACE 被立即加回”的顽固项：删键树重建后再写（需管理员）                                                                                                               |
| `restore-ucpd.ps1`   | 万一为绕过保护删过 UCPD 服务条目，用它按原配置重建（需管理员）                                                                                                                                |

## 用法

```powershell
# 预览（不写注册表，只列扩展清单和当前解析结果）
pwsh -NoProfile -File .\Set-MpvDefault.ps1 -DryRun

# 实际写入
pwsh -NoProfile -File .\Set-MpvDefault.ps1 -MpvPath 'C:\path\to\mpv.exe'
```

脚本处理 `HKCR` 中所有 `PerceivedType=video|audio` 的扩展名，再补齐 mpv/ffmpeg 常见但系统未登记的容器（rmvb、ape、flac、opus、dts、mka…），共约 116 个。

## 原理

Windows 10/11 的“默认程序”真正的存放位置是：

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\<ext>\UserChoice
    ProgId = <ProgId>
    Hash   = <base64，12 字符>
```

`Hash` 是防劫持校验值，算法：

```
input  = tolower( ext + SID + ProgId + %08x(FILETIME.High) + %08x(FILETIME.Low)
                  + "User Choice set via Windows User Experience {D18B6DD5-6124-4341-9318-804003BAFA0B}" )
md5    = MD5(utf16le(input + "\0"))
raw    = 8 字节（h0^h1, h0Acc^h1Acc，两轮 scramble 后取低 8 字节）
Hash   = base64(raw)                       # 形如 "QQVX+X7R8EA="
```

两个必须照抄的细节：

1. **时间戳要做 SystemTime 往返**：`FileTimeToSystemTime`（得到 UTC 分解）→ 秒/毫秒清零 → `SystemTimeToFileTime`（按本地时间再转换）。跳过这一步会差一个时区偏移，hash 永远算不对。
2. **秒以下被算法丢弃**，所以只要 ProgId 与 Hash 写入落在同一分钟，hash 自然自洽；脚本写入后会读回 LastWriteTime 重算校验。

兜底（UserChoice 缺失或失效时使用）：

```
HKCU\Software\Classes\.<ext>        (Default) = mpv.Video | mpv.Audio
HKCU\Software\Classes\.<ext>\OpenWithProgids\<ProgId>   (REG_NONE)
```

## UCPD 拦截

Windows 11 24H2+ 的 `UCPD.sys`（minifilter，Altitude 385250.5）会对**已被 UI 显式设置过的**关联，把 `UserChoice` 键的 ACL 改成：

```
当前用户  SetValue  Deny
```

此时写入返回 `Requested registry access is not allowed.`，且移除 Deny ACE 后驱动会立刻加回。

处理顺序：

1. 普通扩展：直接写（无 Deny ACE）。
2. 被上锁的扩展：以管理员身份 `fix-protected.ps1`，移除 Deny ACE 后立刻写入，多数一次成功。
3. 仍然被拦（如 `.mp4` / `.avi`）：`fix-mp4-avi.ps1` 删键树重建再写，多试几轮即可。
4. 均失败时的兜底：`sc delete UCPD` + 重启后写入 —— 但删除服务条目会削弱系统对关联劫持的防护，`restore-ucpd.ps1` 可重建。

`sc stop UCPD` 无效（返回 1052，驱动不实现停止控制），`fltmc unload UCPD` 也无效（0x801f0010，有实例挂载时不能分离）。

## 验证

```powershell
Add-Type -Path .\UserChoice.cs
[MpvAssoc.Assoc]::Exe('.mp4')       # 应返回 mpv.exe 的完整路径
[MpvAssoc.Assoc]::AppName('.mp4')   # 应返回 "mpv"
```

`AssocQueryString(ASSOCSTR_EXECUTABLE)` 读取的就是 shell 解析结果，与双击行为一致；脚本末尾会对全部扩展跑一遍。
