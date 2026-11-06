# 预设提示词评审

## 目标

评审固定提示词的优化空间并落地定案修订；把 `ready` 改成按依赖关系分组的 todo 列表，补并行执行论述，在会话输入框上方提供可折叠的 ready 面板，并按策略收口 `notes.json` 的访问。

## 取证口径

- 目标：`packages/dsh-toolkit/src/nano-flow/prompt.md`（210 行 / 12,956 B；`dist/nano-flow/prompt.md` 同名同大小；作为固定系统提示按字面量注入，无变量）。
- 对照：`src/nano-flow/tools/read.ts`、`write.ts`、`check.ts`、`src/contract.ts` 默认上限、`src/nano-flow/scripts/check-domain.mjs`、随包 `skills/ask`、`do`、`kaizen`、`README.md`、`docs/dsh/CONTEXT.md`。
- 结论：有优化空间，重点在「触发条件缺失」与「重复」，不是细节密度。

## 结论摘要

详见 note 01（29 条评审）、note 04（`ready` 分组）与 note 05（GUI 面板）。P0 是 Plan 初始化触发、模式优先级、story/spec 契约、域根对齐、ask 护栏位置，以及删除工具清单与空节；P1 是其余重复与模糊表述；P2 是结构与体量。

## 当前进度

- note 01 完成（评审 29 条）。
- note 03 完成：`prompt.md` 按定案改写；ask / do skill、README、`runtime.test`、`assets.lock.json` 同步；9 个 markdown 改为 ASCII 标点；209 测试、构建、安装与新会话验证通过。
- note 04 完成：`dag.ts` 的 `todoGroups` 按 blocked_by 连通分量分组、组内拓扑排序；`ready` 输出未完成 notes 的组列表；`prompt.md` 新增「并行执行」小节；211 测试与构建通过。首版按依赖层分组已按用户口径纠正为「有依赖关系的 note 在同一组」。
- note 05 完成：宿主路由 `/api/toolkit/nano-flow-ready`、`readNanoFlowReady` 读取器、客户端 `conversation.input.dock` 的 `ReadyPanel`（默认折叠、3s 轮询、focus 刷新）；用户已确认真机显示。首次诊断出宿主 live session header 的 `agentPreset` 不可靠，已改为宿主只解析工作区/Plan、客户端按 projection 的 `agentPreset` 判断。219 测试与构建通过。
- note 06 完成（决策 A）：`notes.json` 访问收口采用 `tools.guard` + 包装 `ctx.fs`，保留 shell 等旁路并写明不是安全边界。
- note 08 实施完成（待真机验证）：轮转时机改为用户发送 queue 消息时，包装 `sessionController.prompt`；达到阈值后新会话拿到「种子 + 本次用户内容」，旧会话删除；`used` 用 `projectedTokens ?? pressureTokens`；224 测试与构建通过；已安装，待重启后下一次 queue 消息验证。
- note 07 实施完成（待真机验证）：`src/host/notes-guard.ts` 两道闸门——`tools.guard` 拦参数里的显式路径（`file_path`/`path`/`target`，以及 `command`/`script` 里的字面路径），`ctx.fs` 包装按已解析 target 拦六个内容读写方法；入口在根插件 `ctx.inject(["tools","fs"])`；237 测试、`vp check`、构建通过；README 与 `docs/dsh/QUESTIONS.md` 已记录「策略不是安全边界」。
- note 08 回归修复（2026-11-07 03:1x）：a6f6b7cc 在预设行里读 `ctx.agent`，触发 cordis 的 inject 守卫（`cannot get property "agent" without inject`），整条预设行失效——固定提示词、`nano_flow_*`、随包 skill 与轮转一起消失，重启后那次 queue 消息因此没轮转。轮转已搬到宿主半（根插件包装 `sessionController.prompt`，按日志最后一条 `agent-preset/selected` 判定会话）；新增 `nano-flow-mount.json` 挂载诊断；用临时 profile 本地复现并验证（stages: entry/apply/ready/rotation），241 测试通过；已重装。
- 重启后核对（2026-11-07 03:3x）：本会话恢复 `nano_flow_*` 与固定提示词；`nano-flow-mount.json` 的 stages 四项齐全（entry via preset / apply / ready 13,041 B / rotation 的 tokenMeter、sessions、workspaceRegistry、workingDirectory 均 true）。
- note 07 完成（真机已验证）：`read` Plan 的 `notes.json` 被拒（提示只用 `nano_flow_*`），`pwsh` 的字面路径命令同样被拒，`grep` 搜 `notes.json` 与读其它文件不受影响，`nano_flow_read` / `nano_flow_write` 正常。
- 已打包并安装到 desktop profile：安装目录的 `dist/index.mjs` 与仓库 dist 同哈希（9A380331…60A7）；重启宿主后生效。
- note 09 完成（2026-11-07）：恢复已有 Plan 改为严格只读（不写 Plan、不执行 note），报告后用户第一条消息放行；轮转种子同步只读口径。四处口径与改动点见 note 09。
- note 10 实施完成（2026-11-07，待真机）：`prompt.md`、`read.ts` resume 文案、`rotate.ts` 种子、`skills/do` 与 README 全部改为只读口径；241 测试、`check`、`pack` 通过；desktop profile 装 0.4.2，安装目录与仓库 dist 同哈希；已提交 16dbbb95。
- 未完成：note 02（已按用户决定暂缓）、note 08 的轮转触发验证（需要一条高上下文 queue 消息）、note 10 的重启真机确认。
- 域根：dsh 已切到 `.agents/domains`，其 `CONTEXT.md` 与 `QUESTIONS.md` 目前是指向 `docs/dsh` 的迁移指针；旧 Plan 与 ADR 仍在原位，迁移见 note 02。

## 恢复入口

1. 读本 spec、note 01 的评审清单、note 04 的 `ready` 设计与 note 05 的面板设计。
2. 要动 `notes.json` 的收口：实现与真机验收见 note 07（已完成），边界见 note 06。
3. 要清账：按 note 02 选策略，把 `docs/dsh` 的域文档与旧 Plan 迁到新布局，处理相对链接。
4. 迁移后跑 `nano_flow_check` 的 `workspace`。
5. 要验轮转：note 08 仍在等一条高上下文 queue 消息；`$DSH_HOME/toolkit/nano-flow-mount.json` 的 `rotation` stage 可确认宿主侧已挂上。
6. 只读恢复已落地（note 10，0.4.2 已装）；重启后确认新会话只读恢复、报告后放行，见 note 10 的待真机项。

## 开放问题

- `docs/dsh` 的旧 Plan 保留为 Markdown 历史，还是迁到新布局（需处理相对链接）？2026-11-07 用户决定先不动：note 02 保持 pending，等 note 07 / 08 的真机验证做完再定策略。
- 2026-11-07 02:48 观察到的「本会话没有固定提示词与 `nano_flow_*`」已定位：不是会话创建时机，而是 a6f6b7cc 读 `ctx.agent` 触发注入守卫，预设行静默失效；修复见 note 08 的回归小节。
