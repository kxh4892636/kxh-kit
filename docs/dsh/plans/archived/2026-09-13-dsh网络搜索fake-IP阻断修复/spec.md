---
status: completed
---

# DSH 网络搜索 fake-IP 阻断修复

## 问题

用户在本机 3080 实例上执行网络抓取时报错：

```text
Error: URL hostname "www.weather.com.cn" resolves to a non-public IP address
```

取证结论：这不是字符串解析缺陷，而是**本机 DNS 形态与 DSH 代理声明缺失的组合**。

- 报错唯一来源是 `@deepseek-ai/dsh-web-fetch-http/lib/index.js:70`：`resolvePublicAddresses()` 对主机名做一次 DNS 解析，任一答案非公网单播（`ipaddr.js` `range() !== "unicast"`）即抛 `WebError(WEB_BLOCKED_URL)`。
- 本机解析实况：`Resolve-DnsName www.weather.com.cn` → `198.18.1.197`（TTL 1s），Mihomo 网卡 DNS 为 `198.18.0.2`——mihomo（Clash Party）以 TUN + fake-IP 模式提供 DNS，全域域名落在保留网段 `198.18.0.0/15`。
- 运行中的 DSH（`dsh.cmd web`，PID 25172）环境里没有任何代理变量；系统代理关闭（`ProxyEnable=0`）、WinHTTP 直连，只有 TUN 本可透明接管，但 SSRF 防护在连接前就拒绝了该地址。

已知约束：DSH 是外部安装包（`0.1.5-rc.1`），本工作区不改上游；用户要求"修正"，即恢复抓取能力，代价允许重启该实例。

## 方案

在 harness home `~/.dsh/.env` 声明 mihomo 混合端口的 HTTP 代理：

```dotenv
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

DSH 启动器（`dsh` bin → `dsh-app-boot` 的 `loadLayeredEnv`）把四个代理名 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` 列为 `HOME_LAYER_PROXY_NAMES`：只受理 harness home 的 `.env`，调用目录的 `.env` 一律拒绝。启动时 `runProfile` 调 `installProxyFromEnvironment(environment)` 安装进程级 `dsh-http-proxy` 策略；此后 `web-fetch-http` 的 `proxyRouteFor(url)` 返回 `proxied: true`，走 `requestVia()`，**不做本地解析与地址钉住**，域名由代理解析——SSRF 防护保持原样，fake-IP 与真实目标不一致的问题由代理侧承担。

生效时机是进程启动：`.env` 只在启动时读取，必须重启该实例。

## 已排除的备选

- **放宽 SSRF 校验放行 `198.18.0.0/15`**：把防护开成通用口子，且改动落在外部安装包（本域不产出上游补丁）。
- **关闭 mihomo 的 fake-IP 模式**：改变全机解析行为，影响其他程序。
- **只把代理写进启动 shell 环境**：DSH 由外部终端（VS Code 集成终端）拉起，shell 环境不落盘、不可复现，重启即失效。
- **只解释不修**：不满足用户"修正"的要求。
- **只写配置、不重启**：修复停留在磁盘上，故障仍在，无任何可复核证据。

## 实施决策

- **配置位置与内容**：`C:\Users\kxh\.dsh\.env`（即 `$DSH_HOME/.env`，`DSH_HOME` 未设置时解析为 `~/.dsh`），两行 `HTTP_PROXY`/`HTTPS_PROXY`；不写 `NO_PROXY`（`dsh-http-proxy` 自动并入 loopback 绕过条目），不写 `ALL_PROXY`（避免给未声明 scheme 的消费者派生出多余路由）。
- **代理地址口径**：`http://127.0.0.1:7890`，即 mihomo 混合端口；`dsh-http-proxy` 只接受 `http:`/`https:` 代理 URL，SOCKS 会被拒绝并打印诊断并退化为直连，因此不取 `socks5://`。
- **验证用生产路径两段取证**（`.cache/env-layer-probe.mjs`，直接调用 DSH 自身的 `loadLayeredEnv` + `installProxyFromEnvironment` + `HttpFetchProvider`）：
  1. `loadLayeredEnv('dsh')` 应把 `HTTPS_PROXY` 解析为 `{source: "user-env", path: "C:\Users\kxh\.dsh\.env"}`；删除该文件后同一调用应返回 `undefined` 并复现原报错。
  2. 带该 snapshot 时 `proxyRouteFor(https://www.weather.com.cn/)` 应为 `proxied: true`，`HttpFetchProvider.fetch` 应返回 200 与页面正文。
- **生效与真机证据**：`.env` 生效必须重启实例。重启不能用 `dsh-alive start`——该命令把 CLI 进程环境整体交给 supervisor，而当前 DSH 为发布代理策略会改写自己的 `HTTP_PROXY`/`HTTPS_PROXY` 并置 `NODE_USE_ENV_PROXY=1`，继承后新实例的代理将来自环境而非 `.env`（也无法用 `.env` 验证）。改用脱离父进程的辅助脚本 `.cache/restart-dsh.ps1`：清除 `*_PROXY`/`NODE_USE_ENV_PROXY`/`NODE_OPTIONS`/`DSH_*`，在 workspace 下以 `dsh.cmd web --host 127.0.0.1 --port 3080 --no-open` 启动，并在同一进程内自检端口可达（HTTP 401 为未认证首页的正常响应），结果写入 `.cache/restart-dsh.log`。该实例此前由 VS Code 集成终端直接拉起，不经保活。
- **重启后复核**：当前会话随重启中断，重启后的抓取复核由用户在恢复的会话中完成，或执行 `node .cache/env-layer-probe.mjs`（应输出 `fetch ok` 与标题 `天气网`）。
- **领域决策**：新增 ADR `docs/dsh/adr/0005-fake-ip解析经代理声明修正.md`；`docs/dsh/CONTEXT.md` 不变（fake-IP 是网络环境术语，不是本域业务语言，按 DOMAIN.md 不进 glossary）。
- **范围外记录**：不把 `.env` 纳入仓库（属用户级运行时配置，不是本工作区产物）；不改 DSH 上游包、不改 mihomo 配置、不新增插件能力。

## 工作环境

- 宿主：本机 3080 实例，DSH `0.1.5-rc.1`，由 VS Code 集成终端 `cmd /c dsh.cmd web` 拉起（PID 25172，父链 `pwsh(13496) → cmd(7364)`）；工作目录 `C:\Users\kxh\kxh-awesome\projects\kxh-kit`。
- DSH 安装：`C:\Users\kxh\AppData\Local\vite-plus\data\js_runtime\node\24.21.0\node_modules\@deepseek-ai\dsh`（`lib/bin.js` → `lib/profile-boot-Dk-7KqJc.js`）。
- 代理：mihomo（Clash Party）监听 `127.0.0.1:7890/7891/7892`，TUN 网卡 `Mihomo` 的 DNS `198.18.0.2`；系统代理关闭，WinHTTP 直连。
- 保活工具：工作区 `packages/dsh-keep-alive`（已构建 `dist/main.mjs`），数据目录 `%LOCALAPPDATA%\dsh-keep-alive\3080`（`state.json` = `{"version":"0.1.5-rc.1","tag":"latest"}`）。
- profile：`~/.dsh/profiles/web`，bundles 含 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 与三个本工作区插件（tarball 安装）。
- 领域文档校验：`node .agents/skills/nano-flow/scripts/check-domain.mjs .`。
- 取证脚本：`.cache/proxy-probe.mjs`（首轮复现）、`.cache/env-layer-probe.mjs`（生产路径两段取证）。

## 范围

- 写入 `~/.dsh/.env` 的代理声明并复核其内容。
- 用 DSH 自身的启动环境层与抓取 provider 取证"无 `.env` 复现 / 有 `.env` 成功"的对照。
- 新增 ADR-0005；维护本 Plan 的 spec 与 Issue 文档。
- 重启 3080 实例使配置生效，并自检端口可达。

## 非范围

- 修改 `@deepseek-ai/dsh-*` 上游包、SSRF 校验逻辑或 `dsh-web-search-deepseek`/web 搜索 provider。
- 修改 mihomo/Clash Party 的 DNS 模式或系统代理设置。
- 新增工作区插件能力、工具或配置项；把 `.env` 纳入仓库。
- 其他端口或其他 DSH 实例的代理策略。
- 更换 DSH 版本或发布通道（重启沿用已缓存的 `0.1.5-rc.1`）。

## 待定

- **保活与 GUI 会话的长期形态**：本轮以脱离父进程的辅助脚本重启，实例仍由外部终端派生的进程组持有（关掉该进程即停服）。恢复条件：需要 `dsh-alive` 保活、登录自启或换端口时另起决定；接管时须先解决"CLI 环境继承 DSH 自身改写的代理变量"这一冲突（见「实施决策」生效段）。
- **其他机器的同类环境**：本决策绑定"本机 mihomo fake-IP + `.env` 声明"这一组合；换机或换代理软件时需重新确认端口与 DNS 形态。
- **`web_search` 上游工具的代理依赖**：本轮只证明了 `web-fetch-http`（模型 `web_fetch` 工具）走代理；`dsh-web-search-deepseek` 走 DeepSeek API 端点，是否需要同样的代理声明未在故障路径内，恢复条件：搜索工具出现网络类报错时再取证。

## 上下文

- [澄清与取证记录](../../../../../.flow/quest/2026-09-13-dsh网络搜索fake-IP阻断修复.md)
- [ADR-0005 fake-IP 解析经代理声明修正](../../../adr/0005-fake-ip解析经代理声明修正.md)
- [ADR-0003 内容搜索经上游 opt-in 工具与索引启用交付](../../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)
- 报错来源：`@deepseek-ai/dsh-web-fetch-http/lib/index.js:55-79`（`resolvePublicAddresses`）、`:495-509`（`requestOnce` 的代理分支）
- 代理策略：`@deepseek-ai/dsh-http-proxy/lib/index.js`（`resolveProxyPolicy`/`proxyRouteFor`/`installProxyFromEnvironment`）
- 环境层：`@deepseek-ai/dsh-app-boot/lib/index.js:1006-1099`（`HOME_LAYER_PROXY_NAMES`/`loadLayeredEnv`）
- 启动链：`@deepseek-ai/dsh/lib/bin.js:141-153`、`lib/profile-boot-Dk-7KqJc.js:280`
- [领域语言](../../../CONTEXT.md)

## Issue

| #   | Issue                                                          | 状态      | 阻塞于 | 下一步         |
| --- | -------------------------------------------------------------- | --------- | ------ | -------------- |
| 01  | [代理声明落盘与生产路径取证](01-代理声明落盘与生产路径取证.md) | completed | —      | /code-delivery |
