---
name: 'nano-flow 重构与 dsh 迁移'
description: '把 nano-flow 插件重构、dsh 领域文档生成与旧 plans 迁移收进同一个 Plan。'
status: in_progress
---

# nano-flow 重构与 dsh 迁移

## 目标

用一个 Plan 记录两条工作线：nano-flow 插件重构，以及 dsh 旧领域文档与旧 plans 的迁移。此前分散的“生成并迁移 dsh 领域文档”和“迁移 dsh 旧 plans”两个 Plan 已归档，内容合并到这里。后续同域的 nano-flow 插件增强（Note 面板、Plan 轨迹日志）也落在本 Plan。

## 范围

- nano-flow 插件：文档格式、工具面、提示词注入、索引生成、篇幅限制与预设行为。
- dsh 领域文档：CONTEXT、questions、adr、workflows 的生成与旧文档适配。
- dsh 旧 plans：17 个旧 Plan 从 `story/spec/notes.json` 迁到 `spec + note`。
- 插件增强：会话内 Note 面板（007）、`plan/log.jsonl` 轨迹日志（009）、轮转保留分组与置顶（010）、`/rotate` 命令与轮转输入标注（012）、note 状态先行约束（013）、nano-flow 预设改用 PTC 模式（014）。
- 轮转 seed 内容与手动入口（030 → 031/032）：触发时机不变；seed 末尾先自动校验结论、再上一轮 assistant 最终文本的 `<rotation-last-output>` 块，用户原文用 `<rotation-prior-input>` 包裹放在消息最末；删除手动 `/rotate`，客户端在根上下文订阅导航选择切换视图。
- 不迁移其他域（common、nano-flow、etf、music、video）；不删除 `.tmp` 原文。

## 结果

- note 001 完成插件重构。
- note 002 完成 dsh 领域文档生成与旧 dsh 文档迁移。
- note 003 完成 17 个 dsh 旧 plans 迁移。
- note 004 把生成的 `CONTEXT-MAP.md` 从工作区根迁到 `.agents/domains/`（版本 0.5.11）。
- note 005 修正旧 Plan 的 119 条失效相对链接：46 条重指、73 条死链降为纯文本。
- note 006 把固定提示词改名为 `prompts/system.md`，段名改 `nano-flow:system`，顺带消除被当成 `AGENTS.md` 注入的副作用。
- note 007 新增会话内 Note 面板：`conversation.input.dock` + 宿主路由快照 + 客户端 5s 轮询；行内为「中文状态名 + note 名称」（已验收）。
- note 008 定位并修复 `nano-flow/notes` 事件导致的历史加载失败：补 `ignorable` 止血，面板数据改走宿主路由；用户已确认历史加载正常（`completed`）。
- note 009 实现 Plan 轨迹日志：每轮 compact 记录追加到 `<plan>/log.jsonl`，宿主事件订阅 + 持久化回填；011 用按轮 pending 缓冲修掉绑定轮记录不完整（web 形态已验），009/011 均 `completed`。
- note 010 修复轮转丢分组与置顶：新会话继承旧会话的工作区槽位与置顶状态（0.5.23；2026-11-08 手动 `/rotate` live 取证：新会话在 kxh-kit 的 `sessionIds` 索引 2、`pinnedSessionIds` 首位，旧会话已 detach；用户目视确认侧栏分组/位置/置顶均保留）。
- note 012 新增 `/rotate` 命令与自动轮转的 `<rotation-prior-input>` XML 标注；客户端按轮转记录切到新会话（0.5.24；命令路径 2026-11-08 live 取证：seed 与 `buildSeed` 逐字一致、旧行隐藏、已切到新会话；自动路径与手动共用同一引擎，XML 包裹由单测锁定，按用户「手动有，自动就有」采纳，live 采样留作残余风险）。
- note 013 给 nano-flow 提示词加「状态先行」约束：先落 note YAML 头再补正文，Note 看板及时刷新（0.5.24；live 已验注入条款与「5s 现算 YAML 头」数据面，`completed`）。
- note 014 把 nano-flow 预设从标准模式改为 PTC 模式基准：加 `tool-presentation(mode: ptc)` 行，模型经 `run_code` 调工具（0.5.25；live 已验本会话只有 `run_code`，`completed`）。
- `nano_flow_check` 通过；插件已安装 0.5.25 → 0.5.26 → 0.5.27（desktop 与 web profile 都是 0.5.27）。
- note 015 修 Note 看板与 Plan 绑定脱节：宿主路由先查绑定表（未绑定返回 null）、面板默认折叠、绑定改由 `nano_flow_check` 执行时经宿主 facade 写入（0.5.27；web 形态已 live 验收）。
- note 011 绑定轮修复在 web 形态 live 通过：`log.jsonl` 新增会话段头 + 完整 turn（user/assistant/tools/usage/seq）。
- note 016 验收「轮转后」的轨迹日志：新会话段头 + turn 1/2 完整（`user` 以 seed 开头、19/24 次工具、usage 五项、seq 连续），旧会话 5 轮未重写（0.5.27，`completed`）。
- note 017 轮转后自动跑一次 `nano_flow_check`：宿主在 seed 投递前执行校验并把结论写进 seed，同时给新会话写绑定，Note 看板不必等模型调工具就出现（0.5.28，单测 96 例通过；2026-11-08 重启后手动 `/rotate` live 验收通过，`completed`）。
- note 018 恢复 Plan 时开头自动跑一次 `nano_flow_check`：同一目的（校验 + 建看板绑定），约束写进 `prompts/system.md` 的恢复条款（0.5.29，单测 97 例通过，已装入两个 profile；2026-11-08 重启后新会话 live 验收通过，`completed`）。
- note 019 定义 dream 机制设计：L0=compact log、L1=note 结论、L2=领域文档+`## 相关`互链（链+原因）、L3=guide（默认 13 KB，面板配置）；五 pass + 游标幂等 + check 门禁 + git commit；触发走 DSH 自动化任务（默认每日 08:00）。
- note 020 迁移 legacy 领域文档：common/etf/music/nano-flow/video 的 CONTEXT/questions/adr/workflows 适配成 YAML + 三位编号；`nano_flow_check` 通过、0 死链；旧 10 个 plans 与 music 截图留在 `.tmp`，另开 note 迁移。
- note 021 迁移 legacy 旧 plans：10 个 Plan 的 story/spec/notes.json → spec + 53 条 note；117 条死链重写为 0；旧 active Plan 归档（note 等验收）；music 截图按用户要求忽略。
- note 022 实现互链契约与 check 扩展：页面文末 `## 相关`（目标存在、原因非空、必须是最后章节）、GUIDE 预算（默认 13 KB，进设置面板）、system.md 互链契约；`vp check` 与 301 例测试通过。
- note 023 新增 `prompts/dream.md`（自动化任务指令，首行 `[nano-flow:dream]`）+ system.md 入口第 5 条 + nano-flow 预设挂载 `dsh-tool-schedule`；0.5.30 装入两个 profile。
- note 024 把访问信号、晋升排序与剪枝规则写进 dream.md；2026-11-08 20:16 首轮 dream 运行验收通过：GUIDE 从空到 2.7 KB、访问信号「spec 被读 32 次」、CONTEXT 纠错、ADR 007 与发布 workflow（`completed`；剪枝留待后续轮次）。
- note 025 删除 dsh-toolkit 的 kaizen skill，把知识归属与工作流规则并入 dream.md；0.5.31 装入两个 profile，skill 列表 6→5。
- note 026 dream 并行化：dream.md 按域 spawn subagent（一次 ≤4），子 agent 只写本域，common/guide/check/commit/游标由父会话收口；0.5.32 装入两个 profile。
- note 027 修复索引链接编码：check 的 `linkTarget` 只转义 ASCII 不安全字符、中文原样；工作区 46 个索引已重生成，0.5.33 装入两个 profile。
- note 028 轮转自动绑定改为继承轮转前会话的 Plan（与工作区 active Plan 数量无关）；无绑定或目录失效时跳过并在 seed 说明；ADR 008、0.5.34 装入两个 profile。
- note 029 非轮转恢复也能绑定：`nano_flow_check` 带 `plan` 时跨 active/reference/archived 定位并绑定；`system.md` 恢复条款改为已知 Plan 时带 `plan`；0.5.35 装入两个 profile。

## 当前进度

note 001–030 全部完成。031（删手动 rotate + 自动切视图）与 032（seed 携带上一轮输出）在 0.5.36 落地；2026-11-09 真机轮转暴露两处问题——客户端切视图挂在会话面板轮询上来不及（宿主动作是归档，客户端会立刻卸载面板），改为客户端根级订阅导航选择；用户要求 seed 先写校验结论、末尾放输出块，原文再用 `<rotation-prior-input>` 包住。修复在 **0.5.37**：`vp check` 与 `vp test src` 全绿，两个 profile 装入同一版本；Spec / Standards 两路审查的发现已逐项处理。剩余只有真机验收（需重启宿主后触发一次轮转）。

dream 首轮 2026-11-08 20:16 跑通（提交 `c3e85d3a`、游标 `lastSeq: 271`，详见 024）；`nano-flow dream` 自动化任务每日 08:00（`schedule-413189d2`、preset `nano-flow`，详见 023）。轮转会话没有 `agent-preset/selected` 事件、日志在 `turn/end` 落盘（详见 016）；legacy 迁移见 020/021，旧 Plan 在 `plans/archived/`，原文留在 `.tmp/nano-flow-legacy/`。

note 030（轮转时机与 seed 内容调整）定案：触发时机不变（queue 消息时判压）、删除手动 `/rotate`（只留自动触发）。2026-11-09 用户修订 seed 形态：seed 先写恢复要求与自动校验结论，末尾放 `<rotation-last-output>`（上一轮 assistant 最终文本，8192 B 保尾）；本次触发原文重新用 `<rotation-prior-input>` 包裹，紧跟输出块之后（回退了 030 最初「不再套 XML」的决定）。031/032 于 0.5.36 实现，0.5.37 修复视图不切换并调整 seed 顺序。

## 恢复入口

先读 `notes_index.md`；插件细节在 001，领域文档在 002，旧 plans 映射与截断在 003，`CONTEXT-MAP.md` 位置修正在 004，旧 Plan 链接校正在 005，提示词改名在 006，Note 面板在 007，历史加载失败在 008，Plan 轨迹日志的设计、拷问与 live 验收在 009，轮转分组/置顶修复在 010，绑定轮修复在 011，`/rotate` 命令与 XML 标注在 012，状态先行约束在 013，PTC 模式切换在 014，绑定贯通 Note 面板在 015，轨迹日志的轮转验收在 016，轮转后自动校验与 seed 前绑定在 017，恢复 Plan 开头自动校验在 018，dream 设计在 019，legacy 领域文档迁移在 020，旧 plans 迁移在 021，互链与 check 扩展在 022，dream 指令与自动化接入在 023，访问信号与剪枝验收在 024，kaizen 并入 dream 在 025，dream 并行化在 026。dream 首轮 live 记录在 024；索引链接中文修复在 027，轮转绑定继承旧会话 Plan 在 028，恢复时显式 Plan 绑定在 029，轮转时机与 seed 内容调整在 030，删手动 rotate 与自动切视图在 031，seed 携带上一轮输出在 032。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [031-删除手动rotate并自动切视图](031-删除手动rotate并自动切视图.md) | 删除 /rotate 命令与手动路径，客户端在根上下文订阅导航选择，自动轮转归档旧会话后视图自动切到新会话。 | blocked | 等待宿主重启装入 0.5.37 后触发一次自动轮转，真机确认视图自动切到新会话且旧行消失 | 宿主重启后触发一次自动轮转，确认视图自动切到新会话、旧行消失；之后置 completed | 012-rotate命令与轮转输入标注, 030-轮转时机与种子内容调整, 032-轮转seed携带上一轮输出 |
| [032-轮转seed携带上一轮输出](032-轮转seed携带上一轮输出.md) | seed 末尾先写恢复要求与校验结论、再放上一轮 assistant 最终文本的 XML 块；用户原文用 `<rotation-prior-input>` 包裹放在消息最末。 | blocked | 等待宿主重启装入 0.5.37 后做一次自动轮转，真机确认新会话首条消息里 seed 顺序（校验结论 → 输出块 → 原文块）正确 | 宿主重启后触发一次自动轮转，读新会话首条消息确认 seed 顺序与包裹；之后置 completed | 012-rotate命令与轮转输入标注, 030-轮转时机与种子内容调整, 031-删除手动rotate并自动切视图 |
