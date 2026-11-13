---
name: 'nano-flow 功能与链路梳理'
description: '按功能模块清点 dsh-toolkit 的 nano-flow 实现：装配、会话注入、规划工具、文档校验、轨迹与轮转、dream、宿主路由，并串成端到端链路。'
status: completed
---

# nano-flow 功能与链路梳理

把 `packages/dsh-toolkit/src/nano-flow` 的现状（0.5.50，2026-11-13 工作区源码）按功能模块逐项列举，并把模块之间的调用链路串起来。目的只有一个：后续改这块代码时能按章节检索到「谁写哪个文件、谁读哪个服务、失败怎么降级」，不必重读全部源码。

本次是只读梳理，不改实现；结论只写工作事实，不写改进建议。

## 范围

代码面：

| 区域 | 路径 |
| --- | --- |
| 主目录 | `packages/dsh-toolkit/src/nano-flow/` |
| 入口与根半 | `src/index.ts`、`src/nano-flow/assembly/` |
| 宿主边界 | `src/contract.ts`、`src/host/{nano-flow-facade,nano-flow-settings,toolkit-routes}.ts`、`src/host/tools/nano-flow.ts` |
| 客户端 | `src/client/{notes-dock,rotation-follow}.ts` |

不覆盖：nested-skill、undo、office-skills 三个开关（除它们与 nano-flow 共用 registry / 路由的地方）。

## 模块地图

六目录 + 一个资产层，章节与目录一一对应：

| 章节 | 模块 | 目录/文件 | 一句话 |
| --- | --- | --- | --- |
| [001](./001-装配与预设入口.md) | 装配与入口 | `assembly/`、`src/index.ts` | 一个包两个入口：根半挂工具集，预设半挂提示词与四个工具 |
| [002](./002-会话与提示词注入.md) | 会话层 | `session/` | 定位资产、拼固定提示词与每轮上下文、给工具提供运行期 |
| [003](./003-规划工具集.md) | 规划工具 | `planning/{plan,create,bind,notes}.ts` | create/bind 两个工具与 Plan 发现、面板快照 |
| [004](./004-文档校验与索引生成.md) | 文档校验 | `documents/` | 规则、自动修复、七类生成物 |
| [005](./005-轨迹日志与上下文轮转.md) | 轨迹与轮转 | `planning/plan-log*.ts`、`session/rotate.ts` | 每轮写 log.jsonl；压力触顶换会话并过继绑定 |
| [006](./006-dream扫描与随包skill.md) | dream 与 skill | `dream/`、`skills.ts` | 游标扫描、五段维护提示词、随包 provider |
| [007](./007-宿主路由与面板设置链路.md) | 宿主面 | `host/*`、`client/*`、`contract.ts` | 六个路由、设置存储、Note 面板与轮转跟随 |
| [008](./008-端到端链路清单.md) | 链路 | 全模块 | 十个场景的调用顺序与降级行为 |

## 两条挂载路径

入口只有一个文件（`dist/index.mjs`），靠配置分叉：

```text
apply(ctx, {nanoFlowOnly?: true})
├─ false/缺省 → createRuntime + registry（nested-skill / undo-turn / office-skills / nano-flow 四个开关）
│                + 六个 HTTP 路由 + 会话轮转 + Plan 轨迹服务
└─ true        → applyNanoFlow：提示词段、nano-flow:input 上下文、四个 nano_flow_* 工具、随包 skill provider
```

预设行用绝对 URL（`new URL("./index.mjs", import.meta.url)`）指向同一个入口，因此预设半跑在预设的 standing mount 作用域里，根半跑在宿主根上下文里。两半之间只有两条通道：`toolkitNanoFlow` 服务（设置、绑定、会话记账）与磁盘文件（绑定表、设置文件、`log.jsonl`、领域文档）。

## 核心不变量

1. **Plan 是唯一权威状态**：note 的状态决定 spec 状态（派生），面板与轨迹都按绑定表定位 Plan，不改 Plan 内容。
2. **绑定只有一个写者**：`nano_flow_bind` 与轮转过继写 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`；面板快照与轨迹服务只读。
3. **生成物只由校验写**：`CONTEXT-MAP.md`、各 `index.md`、`notes_index.md`、spec 的「## 追踪 Note」都由 `check-domain.mjs` 生成。
4. **具体数字不写进提示词**：篇幅上限一律来自设置文件，经 `--limits` 传给校验脚本。
5. **失败不阻断主流程**：轮转、轨迹、面板、设置读取全部走「失败只 warn / 回落默认值」。

## 事实与证据

- 版本：`packages/dsh-toolkit/package.json` 0.5.50。
- 源码行数（不含测试与资产）：nano-flow 约 3.6k 行 TS + 1.6k 行 mjs 校验脚本。
- 随包资产：`prompts/`（4 个）、`templates/`（12 个）、`skills/`（6 个）、`scripts/check-domain.mjs`、`scripts/dream-scan.mjs`（发布布局）。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
