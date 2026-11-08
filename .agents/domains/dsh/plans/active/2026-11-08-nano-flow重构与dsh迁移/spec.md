---
name: 'nano-flow 重构与 dsh 迁移'
description: '把 nano-flow 插件重构、dsh 领域文档生成与旧 plans 迁移收进同一个 Plan。'
status: completed
---

# nano-flow 重构与 dsh 迁移

## 目标

用一个 Plan 记录两条工作线：nano-flow 插件重构，以及 dsh 旧领域文档与旧 plans 的迁移。此前分散的“生成并迁移 dsh 领域文档”和“迁移 dsh 旧 plans”两个 Plan 已归档，内容合并到这里。后续同域的 nano-flow 插件增强（Note 面板、Plan 轨迹日志）也落在本 Plan。

## 范围

- nano-flow 插件：文档格式、工具面、提示词注入、索引生成、篇幅限制与预设行为。
- dsh 领域文档：CONTEXT、questions、adr、workflows 的生成与旧文档适配。
- dsh 旧 plans：17 个旧 Plan 从 `story/spec/notes.json` 迁到 `spec + note`。
- 插件增强：会话内 Note 面板（007）、`plan/log.jsonl` 轨迹日志（009）、轮转保留分组与置顶（010）、`/rotate` 命令与轮转输入标注（012）、note 状态先行约束（013）、nano-flow 预设改用 PTC 模式（014）。
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

## 当前进度

note 001–020 全部完成（001–018 功能/验收，019 dream 设计，020 legacy 领域文档迁移）。018 收尾：2026-11-08 用户重启宿主（desktop 载 0.5.29）后开新会话恢复 Plan 验证——模型开头先调 `nano_flow_check`、Note 看板出现，用户确认「已经验证」；插件 desktop / web profile 均为 0.5.29。019 定稿：L0=`log.jsonl`（compact，轮转不删、只增量）、L1=note 结论、L2=领域文档+`## 相关`互链（链接+原因）、L3=`guide.md`（默认 13 KB，上限进设置面板）；dream 五 pass（纠错/提炼/建链/晋升/剪枝）、游标幂等、check 门禁、每次运行 git commit；触发走 DSH 自动化任务，默认每天 08:00。020 把 common/etf/music/nano-flow/video 的历史领域文档迁成 YAML + 三位编号；`nano_flow_check` 通过、0 死链。旧 10 个 plans 与 music 截图仍在 `.tmp`，plans 迁移另开 note。机制补充：轮转会话没有 `agent-preset/selected` 事件，日志在 `turn/end` 落盘（详见 016）。旧的两个 Plan 归档在 `plans/archived/`；旧 plans 原文保留在 `.tmp/nano-flow-legacy/domains/dsh/plans/`。

## 恢复入口

先读 `notes_index.md`；插件细节在 001，领域文档在 002，旧 plans 映射与截断在 003，`CONTEXT-MAP.md` 位置修正在 004，旧 Plan 链接校正在 005，提示词改名在 006，Note 面板在 007，历史加载失败在 008，Plan 轨迹日志的设计、拷问与 live 验收在 009，轮转分组/置顶修复在 010，绑定轮修复在 011，`/rotate` 命令与 XML 标注在 012，状态先行约束在 013，PTC 模式切换在 014，绑定贯通 Note 面板在 015，轨迹日志的轮转验收在 016，轮转后自动校验与 seed 前绑定在 017，恢复 Plan 开头自动校验在 018，dream 设计在 019，legacy 领域文档迁移在 020。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
