# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-nano-flow重构](001-nano-flow%E9%87%8D%E6%9E%84.md) | 把 nano-flow 重构为 YAML 文档、生成索引、create/check 双工具与预设提示词注入。 | 002-生成并迁移dsh领域文档, 003-迁移dsh旧plans |
| [002-生成并迁移dsh领域文档](002-%E7%94%9F%E6%88%90%E5%B9%B6%E8%BF%81%E7%A7%BBdsh%E9%A2%86%E5%9F%9F%E6%96%87%E6%A1%A3.md) | 生成当前 dsh 领域文档，并把 .tmp 旧 dsh 文档适配到 YAML 头 + 三位 name。 | 001-nano-flow重构, 003-迁移dsh旧plans |
| [003-迁移dsh旧plans](003-%E8%BF%81%E7%A7%BBdsh%E6%97%A7plans.md) | 把 17 个旧 dsh Plan 的 story/spec/notes.json 迁成当前 spec + note 格式。 | 001-nano-flow重构, 002-生成并迁移dsh领域文档 |
| [004-CONTEXT-MAP迁到.agents目录](004-CONTEXT-MAP%E8%BF%81%E5%88%B0.agents%E7%9B%AE%E5%BD%95.md) | 把生成的 CONTEXT-MAP.md 从工作区根迁到 .agents/domains/，同步实现、提示词、测试与既有文件。 | 001-nano-flow重构 |
| [005-修正旧Plan失效链接](005-%E4%BF%AE%E6%AD%A3%E6%97%A7Plan%E5%A4%B1%E6%95%88%E9%93%BE%E6%8E%A5.md) | 修正旧 Plan 里 119 条失效相对链接：可映射的重指新路径，死链降为纯文本。 | 004-CONTEXT-MAP迁到.agents目录 |
| [006-固定提示词改名为system](006-%E5%9B%BA%E5%AE%9A%E6%8F%90%E7%A4%BA%E8%AF%8D%E6%94%B9%E5%90%8D%E4%B8%BAsystem.md) | 把固定提示词 prompts/agents.md 改名为 system.md，同步读取路径、段名与文档引用。 | 007-会话内未完成note面板 |
| [007-会话内未完成note面板](007-%E4%BC%9A%E8%AF%9D%E5%86%85%E6%9C%AA%E5%AE%8C%E6%88%90note%E9%9D%A2%E6%9D%BF.md) | 在输入框 dock 展示当前会话绑定 Plan 的未完成 note，样式与 TODO 面板一致。 | 006-固定提示词改名为system, 008-修复notes事件导致会话历史加载失败 |
| [008-修复notes事件导致会话历史加载失败](008-%E4%BF%AE%E5%A4%8Dnotes%E4%BA%8B%E4%BB%B6%E5%AF%BC%E8%87%B4%E4%BC%9A%E8%AF%9D%E5%8E%86%E5%8F%B2%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5.md) | nano-flow 会话写入的 nano-flow/notes 事件没有 ignorable 标记，宿主冷读日志时拒绝加载整个会话。 | 007-会话内未完成note面板 |
| [009-Plan轨迹日志](009-Plan%E8%BD%A8%E8%BF%B9%E6%97%A5%E5%BF%97.md) | 在每个 Plan 目录追加 log.jsonl，把对应 nano-flow 会话的每轮轨迹（精简）持久化。 | 007-会话内未完成note面板, 008-修复notes事件导致会话历史加载失败 |
| [010-轮转保留分组与置顶](010-%E8%BD%AE%E8%BD%AC%E4%BF%9D%E7%95%99%E5%88%86%E7%BB%84%E4%B8%8E%E7%BD%AE%E9%A1%B6.md) | 轮转创建的新会话要继承旧会话的工作区分组槽位与置顶状态，不再掉进「未分组」。 | 009-Plan轨迹日志 |
| [011-轨迹日志绑定轮修复](011-%E8%BD%A8%E8%BF%B9%E6%97%A5%E5%BF%97%E7%BB%91%E5%AE%9A%E8%BD%AE%E4%BF%AE%E5%A4%8D.md) | live 验收发现绑定轮记录不完整；改用按轮 pending 缓冲合并未完成轮事件，待重启复验。 | 009-Plan轨迹日志 |
