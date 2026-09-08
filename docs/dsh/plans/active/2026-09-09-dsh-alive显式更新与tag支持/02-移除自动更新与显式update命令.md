---
status: pending
blocked_by: ["01"]
---

# 移除自动更新与显式 update 命令

## 交付

`dsh-alive` 不再后台自动更新：`start` 每次检查当前通道版本并按需更新后启动；新增 `update` 只准备版本、不启动也不重启；`--tag` 支持 `latest`、`alpha`、`next` 等标签并按端口记忆；`status` 显示当前通道与已就绪未生效的版本。

## 范围

`src/contract.ts`、`src/runtime/instance.ts`、`src/commands.ts`、`src/main.ts` 的语义改造与 README 同步：移除周期调度与 `nextUpdateAt`、新增 `update` 命令与 `start` 版本检查、通道记忆与状态字段、保留失败回退。不含真实 npm 通道切换冒烟与领域文档（03）。

## 直接依赖

- 01：`start`/`update` 需要按 tag 解析并安装版本；消费其 `installTag` 与 `InstanceIo.prepare` 契约。

## 验收

- [ ] 不再有周期调度：代码中无 `UPDATE_INTERVAL`/`scheduleUpdate`/`nextUpdateAt`，测试断言启动后不产生任何定时切换，实例版本保持不变。
- [ ] `start` 每次解析通道版本；查询或安装失败时回退 `state.json` 缓存版本仍启动，`status.error` 与日志记录原因。
- [ ] `update` 有新版时安装并写入 `state.json`（`version`+`tag`）；运行中实例的 `version` 与 `pid` 不变，`status.prepared` 显示新版本。
- [ ] `update` 无新版时不安装、不重启；未运行的实例执行 `update` 后 `status.state` 仍为 `stopped`。
- [ ] 通道按端口记忆：`start --tag alpha` 之后裸 `update`/`start` 仍用 `alpha`；`status.tag` 显示当前通道；缺 `tag` 的旧 `state.json` 视为 `latest`。
- [ ] `--tag` 校验：合法标签名接受，semver 形态与非法字符在本地报错；未知通道由 npm 报错。
- [ ] `start` 启动新版失败时回退上一可运行版本并报告 `Rolled back`；回退也失败时 `failed` 且不留残留进程。
- [ ] CLI 帮助含 `update [--port N] [--tag T]`；未知命令与多余参数仍报错。
- [ ] README 删除 13 小时自动更新段落，补充 `update` 语义（只准备不启动）、`--tag` 与通道记忆、离线回退说明。
- [ ] `pnpm --filter dsh-keep-alive check`、`test`、`test:coverage` 通过，四指标 ≥80%。

## 上下文

- [执行契约](spec.md)。
- [前置](01-版本准备按tag参数化.md)。
- 设计记录：工作区 `.flow/quest/2026-09-09-dsh-alive显式更新与tag支持.md`。

## 下一步

/code-delivery；等待 01 completed。

## 交付记录

完成登记前填入并保留：交付物与验证证据链接。
