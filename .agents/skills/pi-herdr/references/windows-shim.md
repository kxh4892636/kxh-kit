# Windows npm shim 启动

在 Windows PowerShell pane 中，Herdr `agent start` 可能让 `Start-Process -FilePath <kind>` 命中 npm 生成的无扩展名 POSIX shim，而不是 `<kind>.cmd`，从而返回 `%1 不是有效的 Win32 应用程序`。

## 识别

先确认目标 pane 已回到 shell，避免把第二个 agent 发进仍被占用的 pane：

```bash
herdr agent get <pane-id>
herdr pane process-info --pane <pane-id>
herdr pane read <pane-id> --source recent-unwrapped --lines 80
```

如果 `agent get` 已成功，先验证返回的 kind、pane ID 与预期所有权；只在全部匹配时使用或命名，否则不修改 occupant 并停止。只有 `process-info` 表明 foreground PID/process group 与 pane 的真实 shell 一致、argv 也是交互 shell，且不存在 live agent 时才能继续；`cmd.exe /d /c <kind>.cmd ...` wrapper 仍在前台时不算 shell prompt。

用 `where.exe <kind>` 检查 shim。首个候选无扩展名、同时存在 `<kind>.cmd` 时，直接使用本页 fallback；已经出现 Win32 错误时，等待并重新读取 `agent get`、`process-info` 与 pane 输出，确认 agent 未延迟启动且 pane 已回到真实 shell 后再使用。kind 必须来自 `herdr agent start --help` 的 supported kind list，参数必须已通过目标 CLI 的 `--help` 验证。

## 启动

通过 Herdr 向 pane 运行显式 `.cmd` shim。Pi 示例：

```bash
herdr pane run <pane-id> "cmd.exe /d /c pi.cmd --model <provider/model> --thinking <level>"
```

需要 ephemeral session 时追加 `--no-session`；创建指定 Pi session ID 时追加 `--session-id <uuid>`；恢复时追加 `--session <path-or-id>`。对用户提供的值分别进行调用方 shell、目标 PowerShell 和 `cmd.exe /c` 所需的 argv-safe quoting；name、kind、model、thinking 与 session ID 均先按各 CLI 契约验证，不能把自由文本拼进命令。

轮询识别结果，直到 `herdr agent get <pane-id>` 成功或达到 deadline。识别后再命名并等待 ready：

```bash
herdr agent rename <pane-id> <name>
herdr agent wait <name> --timeout 30000
herdr agent get <name>
```

最终必须同时满足：agent kind 正确、name 正确、pane ID 未变化，且状态为 `idle` 或可继续输入的 `done`。`blocked` 需要读取 UI 并交给用户；`unknown` 与超时都不是成功。

fallback 失败时保留 pane，不自动重复启动。返回 `process-info`、最近输出和 pane ID，供用户决定重试或关闭。
