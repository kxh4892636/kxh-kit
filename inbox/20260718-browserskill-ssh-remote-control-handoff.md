# BrowserSkill SSH 远程控制交接

## 目标

支持以下工作方式：

- 客户端安装 BrowserSkill 浏览器扩展。
- 客户端通过 SSH 登录远程服务器。
- 远程服务器执行 `bsk` CLI。
- 远程 `bsk` 操作客户端已登录的浏览器。

后续会话应先决定是仅验证现有能力，还是为 Tencent/BrowserSkill 设计并实现正式的远程模式。

## 已确认的上游事实

本次阅读基于 Tencent/BrowserSkill commit `e16b37aaa0cb5996ca77eeeb4e57ea40bc678efa`。

当前链路：

```text
bsk CLI -> 本地 IPC -> daemon <- WebSocket 127.0.0.1:52800 <- 浏览器扩展
```

- `bsk daemon start` 默认 WebSocket 端口是 `52800`。
- 扩展的 daemon URL 在构建时默认为 `ws://127.0.0.1:52800`，运行时切换端口尚未接通。
- daemon 的 WebSocket 只监听 IPv4 loopback。
- CLI 与 daemon 在 Unix 上通过 UDS 通信，在 Windows 上通过 named pipe 通信。
- 普通 CLI 命令会尝试自动启动本机 daemon。
- 扩展断线后会重连，但 daemon 会清理由该浏览器连接拥有的 sessions；恢复连接后不能假定旧 session 仍有效。

源码依据：

- [仓库与当前架构](https://github.com/Tencent/BrowserSkill#how-it-works)
- [扩展默认 WebSocket 地址](https://github.com/Tencent/BrowserSkill/blob/e16b37aaa0cb5996ca77eeeb4e57ea40bc678efa/apps/extension/wxt.config.ts#L60-L66)
- [扩展建立 WebSocket](https://github.com/Tencent/BrowserSkill/blob/e16b37aaa0cb5996ca77eeeb4e57ea40bc678efa/apps/extension/src/entrypoints/background.ts#L34-L37)
- [daemon loopback listener](https://github.com/Tencent/BrowserSkill/blob/e16b37aaa0cb5996ca77eeeb4e57ea40bc678efa/crates/bsk-cli/src/daemon/start.rs#L180-L219)
- [CLI IPC 客户端](https://github.com/Tencent/BrowserSkill/blob/e16b37aaa0cb5996ca77eeeb4e57ea40bc678efa/crates/bsk-cli/src/ipc_client.rs#L1-L8)

## 可立即验证的零代码方案

现有版本无需修改代码即可使用 SSH local forwarding。扩展仍连接客户端 `127.0.0.1:52800`，SSH 将字节流转发到远程 daemon：

```text
客户端扩展
  -> 127.0.0.1:52800
  -> SSH -L
  -> 服务器 127.0.0.1:52831
  -> 远程 bsk daemon
  <- 本地 IPC <- 远程 bsk CLI
```

客户端 PowerShell：

```powershell
# 仅当客户端本机正在运行 bsk daemon 时需要先释放 52800
bsk daemon stop

ssh.exe `
  -o ExitOnForwardFailure=yes `
  -o ServerAliveInterval=30 `
  -o ServerAliveCountMax=3 `
  -L 127.0.0.1:52800:127.0.0.1:52831 `
  user@server
```

随后在远程 shell 中：

```bash
bsk daemon start --port 52831
bsk doctor
bsk browsers
bsk session start --json
bsk navigate --session <SESSION_ID> https://example.com
```

必须使用 `-L`，因为当前连接发起方是客户端浏览器扩展。客户端端口固定为 `52800`；远程端口可选其他值以避免服务器端口冲突。

限制：

- 客户端本地 daemon 与远程模式不能同时占用 `52800`。
- 一份固定端口的扩展不能同时连接多个远程服务器。
- `ExitOnForwardFailure=yes` 能检测本地监听失败，但不能证明远程 daemon 已启动。
- SSH 断开后需要重新创建 BrowserSkill session。
- 服务端 sshd 必须允许 TCP forwarding。
- 只绑定 `127.0.0.1`；不要使用 `0.0.0.0`、`*` 或 `-g`。

OpenSSH 依据：

- [`ssh -L` / `ssh -R`](https://man.openbsd.org/ssh.1)
- [`ExitOnForwardFailure`](https://man.openbsd.org/ssh_config.5#ExitOnForwardFailure)

## 正式产品方案

正式支持时，推荐让 daemon 和扩展始终留在客户端，仅把 CLI 控制面开放给远程服务器：

```text
浏览器扩展 <-> 客户端 daemon
                      ^
                      | 认证的 loopback 控制网关
                      | SSH -R
                      |
                 远程 bsk CLI
```

该方案优于把扩展连接到远程 daemon：

- 本地与远程 CLI 可以共存。
- 扩展完全不感知 SSH 或远程模式。
- 浏览器 session 生命周期仍由客户端 daemon 统一管理。
- Windows named pipe 和 Unix UDS 保持为本地 adapter，不需要跨 SSH 转发。
- SSH、安全凭据和 endpoint 选择集中在控制面模块，不散落到每个 CLI command。

建议接口：

```rust
enum ControlTarget {
    Local,
    Remote(RemoteTarget),
}

trait ControlClient {
    async fn connect(target: ControlTarget) -> Result<Self>;
    async fn call(&mut self, request: RequestFrame) -> Result<ResponseFrame>;
}
```

建议实现：

1. 保留当前 UDS/Windows named pipe，作为 `ControlTarget::Local` adapter。
2. 客户端 daemon 或 companion process 创建只监听 `127.0.0.1:0` 的控制网关。
3. 新增客户端命令，例如 `bsk remote ssh user@server`。
4. 该命令建立 `ssh -R 127.0.0.1:<remote-port>:127.0.0.1:<client-gateway-port>`。
5. 远程 `bsk` 选择 remote target 后连接 forwarded endpoint，且不得自动启动远程机器自己的 daemon。
6. 控制网关复用现有 JSON-line RPC dispatch，不复制 browser/session/navigation 业务逻辑。
7. 使用随机 256-bit 临时 capability；通过 stdin 或权限为 `0600` 的运行时文件传递，不放入 argv、环境变量或日志。
8. SSH 进程退出、TTL 到期或显式 revoke 时，客户端立即撤销 capability 并拒绝新连接。

建议先做 token-authenticated loopback bridge；SSH 已提供链路加密和服务端身份验证，不必在 v1 同时引入公网 relay、TLS 证书体系或通用 transport plugin。

## 安全与隐私边界

- 不要把 daemon WebSocket 或控制网关绑定到公网/LAN 地址。
- 当前 daemon 的 Origin 检查只验证值是否形似 Chrome extension ID；源码仍有真正 extension-id allowlist/pairing 的 TODO。
- 当前扩展握手没有 capability/token，因此不能把现有 WebSocket 端口直接当成已认证的远程控制接口。
- 远程服务器和远程账号必须被视为拥有临时的完整浏览器控制能力；页面内容、DOM、截图和操作结果会到达远程进程。
- 正式发布前必须更新隐私说明。当前政策声明扩展只与本机 daemon 通信且数据不离开设备，与远程模式不兼容。

依据：

- [当前 Origin 检查及 pairing TODO](https://github.com/Tencent/BrowserSkill/blob/e16b37aaa0cb5996ca77eeeb4e57ea40bc678efa/crates/bsk-cli/src/daemon/ws.rs#L36-L57)
- [当前隐私政策](https://github.com/Tencent/BrowserSkill/blob/e16b37aaa0cb5996ca77eeeb4e57ea40bc678efa/apps/extension/PRIVACY.md#L11-L17)

## 推荐的下一步

1. 在一台真实客户端和一台测试服务器上执行 `ssh -L` PoC。
2. 记录扩展连接、`bsk browsers`、创建 session、导航、SSH 断开与恢复的证据。
3. PoC 成功后，为正式方案补充需求边界和威胁模型，并决定 remote target 的配置与 CLI UX。
4. 在 BrowserSkill fork 中从 `ipc_client` / `business_rpc` 的 endpoint seam 开始实现 `ControlTarget`，避免先改扩展。
5. 覆盖认证失败、版本不兼容、SSH 断开、撤销、并发调用、大响应以及 Windows named-pipe adapter 测试。

当前 `D:\projects\kxh-awesome` 只保存本交接文档；BrowserSkill 上游源码没有在此仓库修改。

## Suggested skills

- `/grill-with-docs`：在 BrowserSkill fork 中确认产品边界、CLI UX、授权主体和失效语义，并留下 `CONTEXT.md`/ADR。
- `/code-design`：确定 `ControlTarget`、控制网关与 transport adapter 的深模块接缝。
- `/tdd`：从 endpoint selection、认证和 SSH 断开行为开始 test-first 实现。
- `/browser-skill`：使用已登录浏览器执行真实 PoC 和回归路径。
- `/verifying`：验证本地门禁、SSH 实链路、跨平台行为和安全失败路径。
- `/code-review`：实现完成后并行检查 Standards 与 Spec。
