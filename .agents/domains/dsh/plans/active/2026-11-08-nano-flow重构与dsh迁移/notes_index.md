# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-nano-flow重构](001-nano-flow重构.md) | 把 nano-flow 重构为 YAML 文档、生成索引、create/check 双工具与预设提示词注入。 | 002-生成并迁移dsh领域文档, 003-迁移dsh旧plans |
| [002-生成并迁移dsh领域文档](002-生成并迁移dsh领域文档.md) | 生成当前 dsh 领域文档，并把 .tmp 旧 dsh 文档适配到 YAML 头 + 三位 name。 | 001-nano-flow重构, 003-迁移dsh旧plans |
| [003-迁移dsh旧plans](003-迁移dsh旧plans.md) | 把 17 个旧 dsh Plan 的 story/spec/notes.json 迁成当前 spec + note 格式。 | 001-nano-flow重构, 002-生成并迁移dsh领域文档 |
| [004-CONTEXT-MAP迁到.agents目录](004-CONTEXT-MAP迁到.agents目录.md) | 把生成的 CONTEXT-MAP.md 从工作区根迁到 .agents/domains/，同步实现、提示词、测试与既有文件。 | 001-nano-flow重构 |
| [005-修正旧Plan失效链接](005-修正旧Plan失效链接.md) | 修正旧 Plan 里 119 条失效相对链接：可映射的重指新路径，死链降为纯文本。 | 004-CONTEXT-MAP迁到.agents目录 |
| [006-固定提示词改名为system](006-固定提示词改名为system.md) | 把固定提示词 prompts/agents.md 改名为 system.md，同步读取路径、段名与文档引用。 | 007-会话内未完成note面板 |
| [007-会话内未完成note面板](007-会话内未完成note面板.md) | 在输入框 dock 展示当前会话绑定 Plan 的未完成 note，样式与 TODO 面板一致。 | 006-固定提示词改名为system, 008-修复notes事件导致会话历史加载失败 |
| [008-修复notes事件导致会话历史加载失败](008-修复notes事件导致会话历史加载失败.md) | nano-flow 会话写入的 nano-flow/notes 事件没有 ignorable 标记，宿主冷读日志时拒绝加载整个会话。 | 007-会话内未完成note面板 |
| [009-Plan轨迹日志](009-Plan轨迹日志.md) | 在每个 Plan 目录追加 log.jsonl，把对应 nano-flow 会话的每轮轨迹（精简）持久化。 | 007-会话内未完成note面板, 008-修复notes事件导致会话历史加载失败 |
| [010-轮转保留分组与置顶](010-轮转保留分组与置顶.md) | 轮转创建的新会话要继承旧会话的工作区分组槽位与置顶状态，不再掉进「未分组」。 | 009-Plan轨迹日志 |
| [011-轨迹日志绑定轮修复](011-轨迹日志绑定轮修复.md) | live 验收发现绑定轮记录不完整；改用按轮 pending 缓冲合并未完成轮事件，待重启复验。 | 009-Plan轨迹日志 |
| [012-rotate命令与轮转输入标注](012-rotate命令与轮转输入标注.md) | 新增 /rotate 命令手动触发轮转（新会话、自动只读恢复、切过去），并把自动轮转时触发的用户输入用 XML 标注为轮转前输入。 | 010-轮转保留分组与置顶, 011-轨迹日志绑定轮修复 |
| [013-note状态先行约束](013-note状态先行约束.md) | nano-flow 系统提示词要求新建或变更 note 时先落 YAML 头再补正文，使 Note 看板及时反映状态。 | 007-会话内未完成note面板 |
| [014-nano-flow预设改PTC模式](014-nano-flow预设改PTC模式.md) | nano-flow 预设从标准模式改为 PTC 模式基准：加 tool-presentation(ptc) 行，模型经 run_code 调用工具。 | 012-rotate命令与轮转输入标注 |
| [015-Plan绑定贯通Note面板](015-Plan绑定贯通Note面板.md) | PTC 下首次工具调用即建立会话↔Plan 绑定；Note 面板只对已绑定会话显示，且默认折叠。 | 007-会话内未完成note面板, 009-Plan轨迹日志, 011-轨迹日志绑定轮修复 |
| [016-轨迹日志轮转验收](016-轨迹日志轮转验收.md) | 轮转后新会话的 log.jsonl 段头、seed 注入与旧会话回填的 live 验收（随 /rotate 一起做）。 | 009-Plan轨迹日志, 010-轮转保留分组与置顶, 012-rotate命令与轮转输入标注 |
| [017-轮转后自动校验Plan并绑定看板](017-轮转后自动校验Plan并绑定看板.md) | 轮转创建新会话后自动执行一次 nano_flow_check：校验 Plan 并建立会话↔Plan 绑定，让 Note 看板立即出现。 | 010-轮转保留分组与置顶, 012-rotate命令与轮转输入标注, 015-Plan绑定贯通Note面板 |
| [018-恢复Plan开头自动校验](018-恢复Plan开头自动校验.md) | 恢复 Plan 时开头自动跑一次 nano_flow_check：校验 Plan 并建立会话↔Plan 看板绑定（同 017 的轮转自动校验），约束写进 prompts/system.md。 | 015-Plan绑定贯通Note面板, 017-轮转后自动校验Plan并绑定看板 |
| [019-dream机制设计](019-dream机制设计.md) | dream 的完整设计：DSH 自动化任务每日 08:00 触发；L0=log.jsonl、L1=note 结论、L2=领域文档+「## 相关」互链、L3=guide（13 KB）；五 pass 与门禁。 | 001-nano-flow重构, 009-Plan轨迹日志, 017-轮转后自动校验Plan并绑定看板, 018-恢复Plan开头自动校验, 020-迁移legacy领域文档, 021-迁移legacy旧plans |
| [020-迁移legacy领域文档](020-迁移legacy领域文档.md) | 把 .tmp/nano-flow-legacy 里 common/etf/music/nano-flow/video 的历史领域文档适配成 YAML + 三位编号并迁入 .agents；旧 plans 与二进制截图不迁。 | 002-生成并迁移dsh领域文档, 019-dream机制设计 |
| [021-迁移legacy旧plans](021-迁移legacy旧plans.md) | 把 common/etf/music/nano-flow/video 的 10 个旧 Plan 从 story/spec/notes.json 迁成 spec + note，并重写内部链接。 | 003-迁移dsh旧plans, 020-迁移legacy领域文档 |
| [022-互链与check扩展](022-互链与check扩展.md) | 实现页面文末「## 相关」互链契约：check 校验目标与原因、GUIDE 预算进设置面板，测试与安装。 | 019-dream机制设计, 020-迁移legacy领域文档 |
| [023-dream指令与自动化接入](023-dream指令与自动化接入.md) | 新增 prompts/dream.md 作为自动化任务指令；nano-flow 预设挂载 schedule 工具；system.md 加 dream 入口与互链契约。 | 019-dream机制设计, 022-互链与check扩展 |
| [024-访问信号与剪枝验收](024-访问信号与剪枝验收.md) | 把访问信号、晋升排序与剪枝规则写进 dream.md；等首次 dream 运行验收实际效果。 | 019-dream机制设计, 023-dream指令与自动化接入 |
| [025-删除kaizen并入dream](025-删除kaizen并入dream.md) | 删除 dsh-toolkit 的 kaizen skill，把知识归属与工作流规则并入 prompts/dream.md，更新引用与测试，发布 0.5.31。 | 019-dream机制设计, 023-dream指令与自动化接入 |
| [026-dream并行化](026-dream并行化.md) | dream.md 增加按业务域 subagent 并行：子 agent 只写本域，common/GUIDE/check/commit/游标由父会话收口；发布 0.5.32。 | 019-dream机制设计, 023-dream指令与自动化接入, 024-访问信号与剪枝验收 |
| [027-索引链接恢复中文](027-索引链接恢复中文.md) | 修复 check 生成的索引把中文转成 %E8… 的问题：只转义 ASCII 不安全字符，链接保持中文；发布 0.5.33。 | 022-互链与check扩展, 024-访问信号与剪枝验收 |
| [028-轮转绑定继承旧会话的Plan](028-轮转绑定继承旧会话的Plan.md) | 轮转后的自动绑定改为继承轮转前会话的 Plan（与工作区 active Plan 数量无关），无绑定或目录失效时跳过；0.5.34。 | 017-轮转后自动校验Plan并绑定看板, 018-恢复Plan开头自动校验, 024-访问信号与剪枝验收 |
| [029-恢复时显式Plan绑定](029-恢复时显式Plan绑定.md) | 非轮转恢复也能绑定：nano_flow_check 带 plan 时跨 active/reference/archived 定位并绑定本会话；system.md 恢复条款改为已知 Plan 时带 plan。 | 018-恢复Plan开头自动校验, 028-轮转绑定继承旧会话的Plan |
