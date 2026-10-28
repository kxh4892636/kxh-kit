# fake-IP 解析经代理声明修正

本机 mihomo（Clash Party）以 TUN + fake-IP 模式提供 DNS：全域域名解析到保留网段 `198.18.0.0/15`（本机实测 `www.weather.com.cn` → `198.18.1.197`），真实解析由代理内核在连接时完成。DSH 的 `web-fetch-http` 在**未走代理**时把本地解析结果钉住，并对整组答案做公网单播校验，`198.18.0.0/15` 被判为非公网 → `WEB_BLOCKED_URL`，请求在连接前被拒。

修正落点是**代理声明**而非校验逻辑：在 harness home `~/.dsh/.env` 写入 `HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:7890`。DSH 启动器的环境层只受理 harness home `.env` 中的四个代理名（`dsh-app-boot` 的 `HOME_LAYER_PROXY_NAMES`），解析后由 `dsh-http-proxy` 安装进程级策略；此时 `web-fetch-http` 走 `requestVia()`，不再本地解析，域名交给代理解析——SSRF 防护保持原样。

## Considered Options

- **harness home `.env` 声明代理（选定）**：官方支持的落盘位置，进程级策略与子进程环境同时生效；不改 DSH 包、不改全机 DNS。
- **放宽 SSRF 校验放行 `198.18.0.0/15`**：把防护开成通用口子，且需改上游安装包（非本域产物）。
- **关闭 mihomo fake-IP 模式**：改变全机解析行为，影响其他程序。
- **只把代理写进启动 shell**：DSH 由外部终端拉起，shell 环境不落盘、重启即失效。

## Consequences

- 生效时机是**进程启动时**：修改 `.env` 后必须重启 DSH 实例，运行中的进程不会重新读取。
- `dsh-web-fetch-http` 在代理路由下不做地址钉住，因此「本地解析与连接目标不一致」类问题（含 fake-IP、DNS 污染）都由代理侧承担，排障入口随之移到 mihomo 规则。
- 代理只声明 `HTTP_PROXY`/`HTTPS_PROXY`，不写 `NO_PROXY`：绕过列表由 `dsh-http-proxy` 自动并入 loopback 条目，局域网直连由 mihomo 规则决定。
- `198.18.0.0/15` 被拒是设计内行为而非缺陷；同类报错应先确认「本机 DNS 是否返回保留网段」与「`.env` 是否声明代理」，再怀疑目标站点。

## 2026-10-28 复核与范围收敛

- desktop `0.2.1-rc.3` 仍按本篇执行：`dsh/lib/profile-boot-*.js` 的 `runProfile()` 在组合并挂载插件之前调用 `installProxyFromEnvironment`，来源为 launch environment（进程 env > 调用目录 `.env` > `~/.dsh/.env`），home 层仅放行四个代理名，项目 `.env` 写代理名会被拒启动。
- 仍不读操作系统代理：本机 Windows 系统代理已开（`ProxyEnable=1`、`ProxyServer=127.0.0.1:7890`），`~/.dsh/.env` 却缺失，于是 DSH 实际直连——「系统代理开着但 DSH 不走」是预期现象，修法见 [常见问题](../QUESTIONS.md)。
- `.env` 会随 `~/.dsh` 重建或升级消失（本轮再次缺失），重建后需重写；写入内容与解析验证见 QUESTIONS。
- **不做系统代理插件/GUI**（原 `dsh-proxy` 计划已删除）：环境声明已覆盖同一条路由，插件方案只能额外提供「系统代理探测 + 设置面板」，却要维护浏览器半侧、检测通道与宿主版本适配；代价是改代理需要重启，本轮接受该代价。
