---
status: in_progress
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

- [x] 不再有周期调度：代码中无 `UPDATE_INTERVAL`/`scheduleUpdate`/`nextUpdateAt`，测试断言启动后不产生任何定时切换，实例版本保持不变。
- [x] `start` 每次解析通道版本；查询或安装失败时回退 `state.json` 缓存版本仍启动，`status.error` 与日志记录原因。
- [x] `update` 有新版时安装并写入 `state.json`（`version`+`tag`）；运行中实例的 `version` 与 `pid` 不变，`status.prepared` 显示新版本。
- [x] `update` 无新版时不安装、不重启；未运行的实例执行 `update` 后 `status.state` 仍为 `stopped`。
- [x] 通道按端口记忆：`start --tag alpha` 之后裸 `update`/`start` 仍用 `alpha`；`status.tag` 显示当前通道；缺 `tag` 的旧 `state.json` 视为 `latest`。
- [x] `--tag` 校验：合法标签名接受，semver 形态与非法字符在本地报错；未知通道由 npm 报错。
- [x] `start` 启动新版失败时回退上一可运行版本并报告 `Rolled back`；回退也失败时 `failed` 且不留残留进程。
- [x] CLI 帮助含 `update [--port N] [--tag T]`；未知命令与多余参数仍报错。
- [x] README 删除 13 小时自动更新段落，补充 `update` 语义（只准备不启动）、`--tag` 与通道记忆、离线回退说明。
- [x] `pnpm --filter dsh-keep-alive check`、`test`、`test:coverage` 通过，四指标 ≥80%。

## 上下文

- [执行契约](spec.md)。
- [前置](01-版本准备按tag参数化.md)。
- 设计记录：工作区 `.flow/quest/2026-09-09-dsh-alive显式更新与tag支持.md`。

## 下一步

/code-delivery；等待 01 completed。

## 交付记录

交付物：`src/contract.ts`（`tagSchema`、`start`/`update` 请求、`status` 增加 `tag`/`prepared` 并删除 `nextUpdateAt`）；`src/runtime/versions.ts`（`readRecordedState`/`saveRecordedState` 校验磁盘记录、`prepareVersion` 统一「解析→比较→记录」不变量、`preparedMessage` 统一日志文案）；`src/runtime/instance.ts`（删除调度与抑制状态、`start(launch, tag)` 先准备后停机、`update(launch, tag)` 只准备不启动、回退候选优先正在运行的版本、`status` 从 `state.json` 恢复通道）；`src/commands.ts`（`update` 命令、旧版 supervisor 识别/接管与等待、无 supervisor 时 CLI 内直接准备并记日志、`stoppedStatus`）；`src/main.ts`（`--tag` 解析与 `resolveTag` 通道记忆、`update` 命令与帮助文本、switch 分派）；测试重写为 `src/runtime/channel.test.ts` 并扩展 `commands.test.ts`/`versions.test.ts`/`instance.test.ts`/`transport.test.ts`/`testing/fixture.ts`；README 重写「版本与发布通道」段。

验证证据：`pnpm --filter dsh-keep-alive check` 通过（24 文件格式、21 文件无 lint/类型问题）；`test` 9 文件 44 项全通过；`test:coverage` statements 91.34%、branches 87.50%、functions 89.09%、lines 92.66%，四指标 ≥80%；`check-domain.mjs .` 通过。双轴审查两轮：首轮 Spec 轴 1 项阻塞（旧版 supervisor 接管未等待其退出、未校验回复来源）已修复并重审确认；两轮共 20 项 judgement 建议，已处理 N1（探活后退出落回拉起）、N3（崩溃恢复重写记录已写入 spec）、N4（先准备后停机）、N5（旧版替身改为闸门式，可证伪等待）、N6（非法磁盘通道、回退优先序、回退与状态写入同时失败三处用例）、F2/F4/F6/F9（日志文案共用、日志失败不抛出、`prepared` 口径、类型注解），其余（F1/F3/F5 部分/F7/F8）为形态建议并已记录。提交见 Flow receipt。

## 验证记录

- 显式更新语义：`channel.test.ts` 12 项覆盖 start 按通道启动、update 安装但不重启（`pid`/`version` 不变、`os.versions` 不增长）、无变化不动作、通道切换即使版本相同也落盘、未运行时只准备、安装失败不改变状态、版本检查失败回退缓存并保留原通道、启动新版失败回退、回退优先正在运行版本、`state.json` 丢失仍回退、回退与状态写入同时失败。
- 命令层：`commands.test.ts` 13 项覆盖选项解析（`--port`/`--tag`/重复/未知/semver 拒绝）、通道记忆、无 supervisor 时 CLI 内直接更新且不启动实例、新建 supervisor 从 `state.json` 恢复、旧版 supervisor 的 update 拒绝与 start 接管（闸门式替身证明等待）、真实 Windows CLI 起停与 3080 占用保护。
- 未触碰 3080 运行实例：`缺省端口指向被占用的 3080` 用例断言 start 前后 `snapshot(3080).owners` 一致。
