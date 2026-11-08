---
name: "031-删除手动rotate并自动切视图"
description: "删除 /rotate 命令与手动路径，客户端在根上下文订阅导航选择，自动轮转归档旧会话后视图自动切到新会话。"
status: blocked
reason: 等待宿主重启装入 0.5.37 后触发一次自动轮转，真机确认视图自动切到新会话且旧行消失
related_noted:
  - '012-rotate命令与轮转输入标注'
  - '030-轮转时机与种子内容调整'
  - '032-轮转seed携带上一轮输出'
next_step: "宿主重启后触发一次自动轮转，确认视图自动切到新会话、旧行消失；之后置 completed"
---

# 031-删除手动rotate并自动切视图

## 背景

用户决定：轮转**只能自动触发**；删掉手动 `/rotate`。但客户端唯一的切会话逻辑挂在 `command/executed`（`src/client/index.ts:65-97`），删命令后自动轮转没有视图切换，用户会停在已被物理删除的会话上。用户已确认改为**复用轮询切换**（030 第 4 轮 Q12）。

## 交付

- 删除 `src/nano-flow/rotate-command.ts` 与 `rotate-command.test.ts`；`src/index.ts` 去掉 `registerRotateCommand` 导入与装配。
- `src/nano-flow/rotate.ts`：删除 `RotationEngine.rotate()`、`MANUAL_RETIRE_DELAY_MS` 及只服务手动路径的代码；保留 `redirect`、`replacement`、`retire`、`inheritPlacement`。
- `src/client/index.ts`：删除 `command/executed` → `followRotation`；跟随逻辑移到新的 `rotation-follow.ts`，由 `notes-dock` 的 5s 轮询调用（Nano Flow 会话才有轮转）：读 `fetchNanoFlowRotation()`，当 `rotation.from === 当前会话 id` 时执行 `rememberTombstone` / `hideSessionRow` / `refreshCatalog` / `uiWorkspace.openSession(rotation.to)`。
- `src/nano-flow/prompts/system.md`：删掉 `/rotate` 的提及与"手动轮转"表述。
- 文档口径：`dsh/CONTEXT.md`「会话轮转」、`dsh/adr/008` 里"手动/`/rotate`"表述改为"只有自动触发"。

## 验收

- 插件不再注册 `rotate` 命令；仓库内无 `registerRotateCommand` / `rotation-prior-input` 之外的手动路径残留。
- 单测：轮询发现 `rotation.from === 当前会话` 时调用 `openSession` 并隐藏旧行；无关会话不动。
- `vp check` 与 `vp test src` 通过；两个 profile 装入同一版本。
- live：自动轮转后（可用低阈值 + 一条消息触发）视图切到新会话，旧行消失。

## 交付（2026-11-09）

- 删除 `src/nano-flow/rotate-command.ts` 与 `rotate-command.test.ts`；`src/index.ts` 去掉 `registerRotateCommand` 导入与装配（`rotation.attach()` 直接作为 disposer）。
- `rotate.ts`：删除 `RotationEngine.rotate()`、`MANUAL_RETIRE_DELAY_MS`；引擎只剩 `attach()`。
- 新增 `src/client/rotation-follow.ts`：`followRotation(ctx, sessionId)` 读 `nano-flow/rotation` 路由，`rotation.from === 当前会话` 时记墓碑、摘旧行、刷新目录、`uiWorkspace.openSession(to)`；用 `followed` 集合保证同一会话只切一次。
- `notes-dock.ts`：dock 轮询（5s）里顺带调用 `followRotation`；dock 注册加 `inject: () => ({ ctx })`，拿到 `sessions` / `uiWorkspace`。
- `client/index.ts`：删除 `command/executed` → `followRotation` 与本地 `refreshCatalog`（迁到新模块），保留墓碑与隐藏行逻辑。
- 文案：`prompts/system.md` 去掉 `/rotate` 与"每轮结束"口径；README、CONTEXT、ADR 008 同步为"只能自动触发"；视图切换在 0.5.37 改为根级订阅（面板轮询只作兜底）。

## 验证

- `vp check`：122 文件格式通过；94 文件 lint/类型通过。
- `vp test src`：37 文件 / **309 例**通过（含新增 `client/rotation-follow.test.ts` 4 例：切换、非本会话不动、只跟随一次、路由不可达保持原会话）。
- 构建 + `pnpm pack` 成功；`plugin add` 装入 desktop / web 两个 profile，版本均 **0.5.36**；`dist/client.js`、`dist/nano-flow/scripts/check-domain.mjs` 齐备，`dist/index.mjs` 已无 `rotation-prior-input`。

## 残留

- 真机验收需重启宿主（当前进程仍载 0.5.35）：重启后把 `rotateAt` 调低触发一次自动轮转，确认视图切到新会话、旧行消失。此前的自动路径本来就没有视图切换，属新能力，必须 live 观察。

## 风险

- 轮询最长 5s 才切换；用户可能在这段时间里看到旧会话视图或输入框。先接受，live 观察是否需要缩短间隔。

## 2026-11-09 真机反馈与修复

重启到 0.5.36 后实测一次自动轮转：宿主完成轮转、旧会话已注销，但**视图停在旧会话没有切走**（用户反馈）。取证与结论：

- 宿主 `retire()` 先 `workspaceRegistry.archiveSession(old)`；客户端 `watchNavigation → clearArchivedCurrent` 立刻 `clearMain()` + `selectPanel(null)`，会话视图与 `conversation.input.dock` 一起卸载。挂在 dock 里的 5s `followRotation` 等不到下一 tick（删除窗口只有 150ms），所以永远不切。
- 修复：新增 `installRotationFollow(ctx)`，由客户端根 `ctx.inject(["uiWorkspace"])` 安装，订阅 `uiWorkspace.selection`（持久化键 `dsh.sessions.current`）：选择从旧会话换成空或别的会话时回读 `nano-flow/rotation`，`from` 命中才隐藏旧行、刷新目录并 `openSession(to)`；用户手动切到第三个会话明确不抢导航。store 没有 `subscribe` 时退化 500ms 本地轮询（只读本地，不发请求）。
- dock 里的 `followRotation` 保留为旧宿主兜底；两者共用 `followed` 集合，保证同一旧会话只切一次。
- 单测：`rotation-follow.test.ts` 11 例（根级跟随、不抢用户导航、中途切走放弃、重试打开、目录始终没列到时告警且不记账、无订阅退化轮询，以及原 4 例面板兜底）。
- 两条路径共用 `applyRotation`：先 hide/refresh/guardTombstones，再按 0/600/1800ms 重试 `openSession`；每次打开前重读选择，用户切到第三个会话就放弃；成功后记入 `followed`，失败只 warn。dock 的 5s 轮询由 `rotationFollowInstalled()` 判断——根级跟随装上后不再发请求。
