# dsh网络搜索fake-IP阻断修复

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 dsh网络搜索fake-IP阻断修复

用户在本机 3080 实例上执行网络抓取时报错：

```text
Error: URL hostname "www.weather.com.cn" resolves to a non-public IP address
```

取证结论：这不是字符串解析缺陷，而是**本机 DNS 形态与 DSH 代理声明缺失的组合**。

- 报错唯一来源是 `@deepseek-ai/dsh-web-fetch-http/lib/index.js:70`：`resolvePublicAddresses()` 对主机名做一次 DNS 解析，任一答案非公网单播（`ipaddr.js` `range() !== "unicast"`）即抛 `WebError(WEB_BLOCKED_URL)`。
- 本机解析实况：`Resolve-DnsName www.weather.com.cn` → `198.18.1.197`（TTL 1s），Mihomo 网卡 DNS 为 `198.18.0.2`——mihomo（Clash Party）以 TUN + fake-IP 模式提供 DNS，全域域名落在保留网段 `198.18.0.0/15`。
- 运行中的 DSH（`dsh.cmd web`，PID 25172）环境里没有任何代理变量；系统代理关闭（`ProxyEnable=0`）、WinHTTP 直连，只有 TUN 本可透明接管，但 SSRF 防护在连接前就拒绝了该地址。

已知约束：DSH 是外部安装包（`0.1.5-rc.1`），本工作区不改上游；用户要求"修正"，即恢复抓取能力，代价允许重启该实例。
