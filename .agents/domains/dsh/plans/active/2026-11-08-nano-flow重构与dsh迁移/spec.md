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
- note 009 实现 Plan 轨迹日志：每轮 compact 记录追加到 `<plan>/log.jsonl`，宿主事件订阅 + 持久化回填；live 验收发现绑定轮记录不完整，已在 0.5.23 用按轮 pending 缓冲修复（`in_progress`，待重启复验）。
- note 010 修复轮转丢分组与置顶：新会话继承旧会话的工作区槽位与置顶状态（0.5.23，待 live 验证）。
- note 012 新增 `/rotate` 命令与自动轮转的 `<rotation-prior-input>` XML 标注；客户端按轮转记录切到新会话（0.5.24，待 live 验证）。
- note 013 给 nano-flow 提示词加「状态先行」约束：先落 note YAML 头再补正文，Note 看板及时刷新（0.5.24；live 已验注入条款与「5s 现算 YAML 头」数据面，`completed`）。
- note 014 把 nano-flow 预设从标准模式改为 PTC 模式基准：加 `tool-presentation(mode: ptc)` 行，模型经 `run_code` 调工具（0.5.25；live 已验本会话只有 `run_code`，`completed`）。
- `nano_flow_check` 通过；插件已安装 0.5.25，随后装入 0.5.26。
- note 015 修 Note 看板与 Plan 绑定脱节：宿主路由先查绑定表（未绑定返回 null），客户端默认折叠；PTC 下 nano-flow 会话的首个 `tool/call`（含 `run_code`）即绑定（0.5.26，待重启 live）。

## 当前进度

note 001–008、013、014 完成（013/014 已在 0.5.25 重启后 live 验收）。用户发现「新会话也显示 Note 看板」，定位为宿主路由只按「工作区唯一 active Plan」现算、不看绑定，且面板默认展开；同时 PTC 下 `nano_flow_*` 绑定触发不再命中。015 一并修复并装入 **0.5.26**（291 例 + `vp check` 通过）：未绑定会话不出面板、面板默认折叠、nano-flow 会话首个 `tool/call` 即绑定。**需重启宿主**后 live：新会话无面板 → 调用一次工具后绑定出现；随后先复验 009/011（绑定轮完整性、`log.jsonl` 段头），最后执行 `/rotate` 验 010/012。绑定语义按用户答复「遵循 011」：只在首次工具调用时绑定，纯聊天不落 log。mount 诊断的 `rotation` 段来自一个没有 `apply`/`ready` 阶段的进程，不能据此判定当前会话轮转能力，以 `/rotate` 结果为准。本轮同时把本地 `vite-plus` 工具树从 0.1.6 升级到 **0.2.2-rc.1**（与运行宿主一致），后续实现与取证都以它为准。旧的两个 Plan 归档在 `plans/archived/`；旧 plans 原文保留在 `.tmp/nano-flow-legacy/domains/dsh/plans/`。

## 恢复入口

先读 `notes_index.md`；插件细节在 001，领域文档在 002，旧 plans 映射与截断在 003，`CONTEXT-MAP.md` 位置修正在 004，旧 Plan 链接校正在 005，提示词改名在 006，Note 面板在 007，历史加载失败在 008，Plan 轨迹日志的设计、拷问与 live 验收在 009，轮转分组/置顶修复在 010，绑定轮修复在 011，`/rotate` 命令与 XML 标注在 012，状态先行约束在 013，PTC 模式切换在 014。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [010-轮转保留分组与置顶](010-%E8%BD%AE%E8%BD%AC%E4%BF%9D%E7%95%99%E5%88%86%E7%BB%84%E4%B8%8E%E7%BD%AE%E9%A1%B6.md) | 轮转创建的新会话要继承旧会话的工作区分组槽位与置顶状态，不再掉进「未分组」。 | blocked | 等用户执行 /rotate 做 live 验收：需要真实轮转（会退役当前会话），并观察新会话是否仍在原工作区分组与原位置、置顶是否保留 | 用户执行 /rotate 后，在新会话里核对工作区分组槽位与置顶是否继承 | 009-Plan轨迹日志 |
| [012-rotate命令与轮转输入标注](012-rotate%E5%91%BD%E4%BB%A4%E4%B8%8E%E8%BD%AE%E8%BD%AC%E8%BE%93%E5%85%A5%E6%A0%87%E6%B3%A8.md) | 新增 /rotate 命令手动触发轮转（新会话、自动只读恢复、切过去），并把自动轮转时触发的用户输入用 XML 标注为轮转前输入。 | blocked | 等用户执行 /rotate 做 live 验收（命令、客户端切换）；自动轮转的 XML 标注需要阈值触发的真实轮转，尚未造出 | 用户执行 /rotate 后核对：命令被接受、客户端切到新会话、新会话拿到 seed；XML 标注待自动轮转时验 | 010-轮转保留分组与置顶, 011-轨迹日志绑定轮修复 |
| [015-Plan绑定贯通Note面板](015-Plan%E7%BB%91%E5%AE%9A%E8%B4%AF%E9%80%9ANote%E9%9D%A2%E6%9D%BF.md) | PTC 下首次工具调用即建立会话↔Plan 绑定；Note 面板只对已绑定会话显示，且默认折叠。 | blocked | 等宿主重启加载 0.5.26 后做 live 验收：新会话不显示看板、首次工具调用后出现且默认折叠 | 用户重启宿主后，新开 Nano Flow 会话确认无看板；调用一次工具（含 run_code 内的 nano-flow 工具）后确认绑定写入、看板出现且折叠 | 007-会话内未完成note面板, 009-Plan轨迹日志, 011-轨迹日志绑定轮修复 |
| [009-Plan轨迹日志](009-Plan%E8%BD%A8%E8%BF%B9%E6%97%A5%E5%BF%97.md) | 在每个 Plan 目录追加 log.jsonl，把对应 nano-flow 会话的每轮轨迹（精简）持久化。 | in_progress | — | 重启 0.5.26 后调用一次工具，确认绑定表出现本会话、log.jsonl 写出段头与绑定轮；再验 /rotate 后新段头 | 007-会话内未完成note面板, 008-修复notes事件导致会话历史加载失败 |
| [011-轨迹日志绑定轮修复](011-%E8%BD%A8%E8%BF%B9%E6%97%A5%E5%BF%97%E7%BB%91%E5%AE%9A%E8%BD%AE%E4%BF%AE%E5%A4%8D.md) | live 验收发现绑定轮记录不完整；改用按轮 pending 缓冲合并未完成轮事件，待重启复验。 | in_progress | — | 重启 0.5.26 后核对绑定表出现本会话，再读 log.jsonl 确认绑定轮含完整 user/assistant/tools/usage/seq | 009-Plan轨迹日志 |
