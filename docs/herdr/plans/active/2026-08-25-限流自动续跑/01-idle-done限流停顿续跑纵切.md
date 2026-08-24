---
status: completed
blocked_by: []
---

# `idle`/`done` 限流停顿续跑纵切

## 交付

操作者可以本地 link 插件并手工调用 `scan-now` action；插件扫描当前 Herdr session 的所有 agent，对每个具有当前限流证据的 `idle` 或 `done` 停顿至多提交一次 `go on`，重复调用、`done → idle` 聚焦变化与进程重启不会重复发送。

## 范围

- 创建 `packages/herdr-limit-resume` TypeScript/ESM package、构建配置、`herdr-plugin.toml` 和 `scan-now` action。
- 建立可替换的 Herdr NDJSON socket 端口与假 socket server，覆盖 Windows named pipe/Unix socket 共用协议层。
- 实现全 session agent list、本地 `idle`/`done` 状态过滤、规范化 `detection` 快照末尾 55 Unicode code point 匹配。
- 实现发送前 `agent.get`/read revision 二次确认，并通过 `agent.prompt` 严格提交 `go on`。
- 实现按 session 分片的成功指纹原子持久化、活动状态解除和无敏感正文的结构化诊断。
- 不处理 `blocked`，不接入自动状态事件、跨进程 handler 锁或 30 秒 worker。

## 直接依赖

无。

## 验收

- [x] 假 Herdr socket 集成测试证明：跨 workspace 的 matching `idle` 与 matching `done` 都只收到一次 `agent.prompt("go on")`，`working`/`unknown`、缺 token、过期 occupant/revision 与读取失败均不发送。
- [x] 匹配测试覆盖 Unicode 空白规范化、按 code point 截取恰好 55 字符、`limit` 大小写不敏感、token 落在窗口外不命中。
- [x] 再次手工扫描、`done → idle` 变化和重建进程状态存储时，同一 terminal/区域指纹都至多发送一次；观察到 `working`/`unknown` 后，同一文本的新停顿可再次发送。
- [x] Herdr error、畸形响应、断连与超时被隔离到单 agent，并留下不包含终端正文的诊断。
- [x] `corepack pnpm --filter @kxh4892636/herdr-limit-resume check`、`test`、`build` 通过。
- [x] `herdr plugin link packages/herdr-limit-resume --disabled` 成功，`plugin list` 不含 manifest warning；验证后 unlink，不删除工作区文件。
- [x] `node .agents/skills/loop-x/script/check-domain.mjs .` 通过。

## 上下文

- [spec](spec.md)
- [用户故事](story.md)
- [Herdr Socket API](https://herdr.dev/docs/socket-api/)

## 下一步

/implement

## 阻塞记录

无。

## 交付记录

- 交付物: Herdr socket 端口、手工 `scan-now` action、55 Unicode code point 检测、发送前身份复核、跨进程成功指纹和脱敏诊断。
- 验证证据: 包级 `check`、18 个 fake-socket 集成测试、`build` 与领域校验通过；disabled link/list/unlink smoke 成功且 manifest 无 warning；双轴审查发现均已修复，Standards/Spec 复核通过。
