---
name: "012-rotate命令与轮转输入标注"
description: "新增 /rotate 命令手动触发轮转（新会话、自动只读恢复、切过去），并把自动轮转时触发的用户输入用 XML 标注为轮转前输入。"
status: completed
related_noted:
  - '010-轮转保留分组与置顶'
  - '011-轨迹日志绑定轮修复'
next_step: "已验收：命令路径 live 通过；自动路径靠「同一引擎 + 单测覆盖 XML 包裹」采纳（用户：手动有，自动就有）"
---

# 012-rotate命令与轮转输入标注

## 需求（用户确认）

1. 新增 `/rotate` 命令，手动触发轮转。
2. 自动轮转（用户消息把压力顶过阈值）时，新会话里那条用户输入要用 XML 包住，明确是「轮转前用户的输入」。
3. `log.jsonl` 不入 git，只在本地保存。

## 已确认的行为

- `/rotate`：建新会话 → 自动切到新会话 → 新会话先跑一次只读恢复（seed 作为首条消息，助手报告进度与可推进队列）。
- 旧会话与自动轮转一致：归档并删除会话日志。
- 命令只在 nano-flow 会话可用；其它会话返回错误文案。

## 设计

**宿主：轮转引擎可复用**

- `rotate.ts` 抽出 `createRotation(options)`：`attach()`（压力路径，现逻辑）与 `rotate(session)`（命令路径：create + 继承分组/置顶 + seed prompt + retire）。
- 自动路径把 `request.content` 包成 `<rotation-prior-input>` 文本块夹在 seed 之后，并加一句说明；命令路径只发 seed。
- 每次轮转记录 `{from, to, at}`（内存 + route），供客户端切换。

**宿主：命令与路由**

- 根插件用 `ctx.commands.register({ name: 'rotate', ... })` 注册；handler 从 `invocation.agent.session` 取会话，校验 nano-flow 预设与无参数。
- 新路由 `TOOLKIT_NANO_FLOW_ROTATION_PATH`（GET）返回最近一次轮转的 `{from, to, at} | null`。

**客户端：切到新会话**

- 客户端订阅 `command/executed`；`name === 'rotate'` 时读取轮转路由，`uiWorkspace.openSession(to)` 并刷新会话目录/隐藏旧行（复用 underturn 的 tombstone 手法）。

## 验收

- 单元测试：引擎的 XML 包裹与 seed 内容、命令 handler 的参数/预设校验、路由形状、客户端在 rotate 事件后调用 openSession。
- 构建安装 0.5.24，重启宿主后：nano-flow 会话输入 `/rotate` → 新会话出现在原分组/置顶位置并自动打开，旧会话从列表消失，新会话已开始只读恢复。
- 自动轮转触发时，新会话的首条用户内容包在 `<rotation-prior-input>` 里。

## 实现（0.5.24）

- `rotate.ts`：抽出 `createRotation(options)` → `attach()` / `rotate(session, signal)`；`attachRotation` 变成兼容包装。自动路径内容为 `[seed, 说明, <rotation-prior-input>, ...用户内容, </rotation-prior-input>]`；命令路径只发 seed。新增 `onRotated(from,to)` 回调。
- `rotate-command.ts`：注册 `/rotate`，校验无参数、会话存在、`selectedPreset === nano-flow`；成功文案「已轮转到新会话，正在执行只读恢复。」。
- `index.ts`：轮转块创建引擎、挂 prompt 包装并注册命令；runtime 记录最近一次轮转。
- `host/toolkit-routes.ts` + `contract.ts`：新增 `GET /api/toolkit/nano-flow/rotation` 返回 `{rotation: {from,to,at} | null}`。
- 客户端：`fetchNanoFlowRotation`；订阅 `command/executed`，`rotate` 时读路由、把旧会话记为 tombstone 隐藏、刷新会话目录并 `uiWorkspace.openSession(to)`。
- 测试：`rotate.test.ts` 新增 XML 包裹、`wrapPriorInput`、命令路径；新增 `rotate-command.test.ts` 4 例；路由测试新增 rotation 路由。**288 例通过**（37 文件）；`vp check` 123 文件格式 + 94 文件 lint/类型通过。
## 验收（2026-11-08 手动 /rotate，0.5.27）

用户在 `session-17660661` 执行 `/rotate`，产出 `session-cad2849e`：

- **seed 逐字一致**：新会话首条输入 = `buildSeed`（`rotate.ts:149-153`）的三段拼接，plan 引用 `dsh/active/2026-11-08-nano-flow重构与dsh迁移` 正是单 active Plan 分支；没有 `<rotation-prior-input>` → 走命令路径（自动路径在 `rotate.ts:325` 会把旧输入包进该标签）。
- **切换生效**：旧会话行被隐藏（`$DSH_HOME/toolkit/state.json` 的 `hiddenSessionIds` 含 `session-17660661`），新会话已接收用户输入（本轮「go」），说明客户端 `command/executed` → 读 rotation 路由 → `openSession(to)` 链路走通。
- **旧会话清理**：已从工作区 detach、不在 archived/pinned 集合，落盘日志目录已删除。

## 验收结论（2026-11-08）

- 手动 `/rotate`：live 通过（见上节），覆盖 create → `inheritPlacement` → seed prompt → retire 全链路。
- 自动轮转：与手动共用 `replacement()` / `inheritPlacement()` / `retire()`，差异只在压力闸门与内容拼接（`rotate.ts:314` 的阈值判断、`:325` 的 `wrapPriorInput`）。这两处由单测覆盖：`rotate.test.ts:139-149` 断言 XML 顺序，`rotate.test.ts:182-201` 断言重定向到新会话、seed 在前、用户内容夹在标签内、旧会话不再收到 prompt。
- 门禁：`vp test src/nano-flow` 13 文件 / **93 例通过**（2026-11-08 18:35 本地）。
- 采纳依据：用户答复「手动有，自动就有」——同一引擎已 live 验，自动路径剩余差异仅内容拼接且被单测锁住。残余风险登记如下：真实宿主里的自动轮转（阈值触发那一跳 + XML 在 UI 中的呈现）未做端到端采样；若日后出现异常，先按「调低 `rotateAt` 复现」的办法取证（`rotateAt` 缓存在插件内存，必须经面板 `update` 才生效）。
