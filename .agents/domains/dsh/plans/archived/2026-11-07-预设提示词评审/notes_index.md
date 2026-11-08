# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-评审prompt.md的优化空间](001-评审prompt.md的优化空间.md) | prompt.md 评审意见 29 条：9 项行为缺口、17 项重复与模糊、3 项结构格式，P0–P2 排序。 | — |
| [002-迁移docs全部域到.agents-domains](002-迁移docs全部域到.agents-domains.md) | 把 docs/ 下 6 个域搬到 .agents/domains 并归位生命周期，更新 CONTEXT-MAP 与 notes-guard 注释。 | — |
| [003-按评审清单修订prompt.md](003-按评审清单修订prompt.md.md) | 把 note 01 的 P0/P1 清单落到 prompt.md，并同步 README 与 ask skill；构建安装后验证。 | 001-评审prompt.md的优化空间 |
| [004-ready按DAG分组并补并行执行论述](004-ready按DAG分组并补并行执行论述.md) | 让 ready 按依赖关系分组输出未完成 notes，并在 prompt 写并行执行与串行写入约束。 | 003-按评审清单修订prompt.md |
| [005-输入框上方的ready面板](005-输入框上方的ready面板.md) | 在输入框上方加可折叠的 Nano Flow ready 列表面板，含宿主路由与客户端 dock。 | — |
| [006-notes.json的访问收口](006-notes.json的访问收口.md) | 评估插件层强制 notes.json 只经 nano_flow_* 读写的可行性、旁路与保证级别。 | — |
| [007-notes.json访问收口实施](007-notes.json访问收口实施.md) | 用 tools.guard 与 ctx.fs 包装，拒绝非 nano_flow_* 工具对 Plan notes.json 的显式读写。 | 006-notes.json的访问收口 |
| [008-轮转只在首次turn-end检查](008-轮转只在首次turn-end检查.md) | 轮转阈值未触发：0.618 是 61.8%，且 rotated 标记在压力检查前就写入了。 | — |
| [009-恢复已有Plan时只读的定案](009-恢复已有Plan时只读的定案.md) | 恢复已有 Plan 时严格只读、报告后放行；轮转种子同步只读口径（4 项决定已确认）。 | — |
| [010-落地恢复只读条款](010-落地恢复只读条款.md) | 按 note 09 改 prompt.md、resume 文案、轮转种子、do skill 与 README，并构建安装真机验证。 | 009-恢复已有Plan时只读的定案 |
| [011-等待验证状态定案](011-等待验证状态定案.md) | note 增加 awaiting_verification 状态：in_progress→等待验证→completed，complete 必须经过；ready 不列、分组内排后。 | — |
| [012-落地等待验证状态](012-落地等待验证状态.md) | 改 dag/check/write/read/面板/prompt 支持 awaiting_verification，构建安装后把 note 08 置为等待验证。 | 011-等待验证状态定案 |
| [013-旧Plan转notes.jsonDAG](013-旧Plan转notes.jsonDAG.md) | 把 28 个旧 Plan、97 条 Markdown note 转成 notes.json DAG：拆超限、补 story、抽 evidence，逐 Plan 校验。 | 002-迁移docs全部域到.agents-domains |
| [014-docs收尾与外部引用](014-docs收尾与外部引用.md) | 删除 docs/ 并改 apps/etf、apps/music、packages/nano-flow README 的残留引用，最后跑 workspace 校验。 | 002-迁移docs全部域到.agents-domains, 013-旧Plan转notes.jsonDAG |
