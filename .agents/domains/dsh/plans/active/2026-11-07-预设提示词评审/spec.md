# 预设提示词评审

## 目标

评审固定提示词的优化空间并落地定案修订；把 `ready` 改成按依赖关系分组的 todo 列表，补并行执行论述，在会话输入框上方提供可折叠的 ready 面板，并按策略收口 `notes.json` 的访问。后续扩展：恢复已有 Plan 只读、note 增加 `awaiting_verification`（等待验证）状态，以及把 `docs/` 下全部业务域迁到 `.agents/domains`。

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
- note 10 完成（2026-11-07）：`prompt.md`、`read.ts` resume 文案、`rotate.ts` 种子、`skills/do` 与 README 全部改为只读口径；241 测试、`check`、`pack` 通过；desktop profile 装 0.4.2，安装目录与仓库 dist 同哈希；已提交 4f5180b0；用户确认重启后真机验证通过。
- 2026-11-07 第 1 轮拷问（note 02 / 11）：note 02 范围扩到 `docs/` 全部 6 个域，旧 Plan 全部转 `notes.json` DAG（note 13），迁完删除 `docs/`（note 14）；新增 `awaiting_verification` 状态，`complete` 必须先经过它，`ready` 不列但分组内排在可执行项之后（note 12 落地）。
- note 11 定案完成（2026-11-07）：`awaiting_verification` 的状态机、呈现、影响面与测试面。
- note 02 完成（2026-11-07）：6 个域已用 `git mv` 迁到 `.agents/domains`（186 文件无丢失，184 rename + dsh CONTEXT/QUESTIONS 覆盖 stub）；空 `planning` / `implementing` 删除，etf implementing 与 dsh-infinite-story → reference；`CONTEXT-MAP` 与 `notes-guard.ts` 注释已改；workspace 校验通过。`docs/` 只剩空目录，留给 note 14。
- note 13 完成（2026-11-07）：28 个旧 Plan 全部转成 `notes.json`（101 条 note，4 条超限拆分；无限故事 spec 拆册；14 个 Plan 补 story；迁移链接改写；description 修复 1 条）。check-domain 对冻结 Plan 跳过 Markdown 链接校验并补测试；29 个 Plan 逐个 `nano_flow_check plan` 全绿；249 测试通过。
- note 14 完成（2026-11-07）：`docs/` 已删除，`apps/etf`、`apps/music`、`packages/nano-flow` README 的残留引用已改；仓库内不再有 docs 域路径引用；workspace 校验通过。
- 未完成：note 12（等待验证落地，已实现待装）、note 08 的轮转触发验证（需要一条高上下文 queue 消息）。
- 域根：dsh 已切到 `.agents/domains`；其余 5 个域（common / etf / music / nano-flow / pi）仍以 `docs/` 为权威，迁移见 note 02。

## 恢复入口

1. 读本 spec、note 01 的评审清单、note 04 的 `ready` 设计与 note 05 的面板设计。
2. 要动 `notes.json` 的收口：实现与真机验收见 note 07（已完成），边界见 note 06。
3. 要迁移：按 note 02 把 6 个域搬到 `.agents/domains` 并归位生命周期，再按 note 13 把旧 Plan 转成 `notes.json`，最后按 note 14 删除 `docs/` 并改外部引用。
4. 迁移后跑 `nano_flow_check` 的 `workspace`；旧 Plan 逐个跑 `nano_flow_check` 的 `plan`（note 13 验收）。
5. 要验轮转：note 08 仍在等一条高上下文 queue 消息；`$DSH_HOME/toolkit/nano-flow-mount.json` 的 `rotation` stage 可确认宿主侧已挂上。
6. 只读恢复已落地并真机确认（note 10，0.4.2 已装）。
7. 要动等待验证状态：定案见 note 11，落地见 note 12。

## 开放问题

- `docs/` 全量迁移的执行口径：28 个旧 Plan 转 DAG（97 条 note、4 条超限拆条、1 份 spec 拆子文件、约 8 个 Plan 补 story）；规则见 note 13。
- `packages/nano-flow/README.md` 的 Anki 冒烟检查清单外链指向仓库里不存在的文件（git 无历史），note 14 收尾时改指或删除。
- 2026-11-07 02:48 观察到的「本会话没有固定提示词与 `nano_flow_*`」已定位：不是会话创建时机，而是 a6f6b7cc 读 `ctx.agent` 触发注入守卫，预设行静默失效；修复见 note 08 的回归小节。
