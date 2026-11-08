# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-评审prompt.md的优化空间](001-%E8%AF%84%E5%AE%A1prompt.md%E7%9A%84%E4%BC%98%E5%8C%96%E7%A9%BA%E9%97%B4.md) | prompt.md 评审意见 29 条：9 项行为缺口、17 项重复与模糊、3 项结构格式，P0–P2 排序。 | — |
| [002-迁移docs全部域到.agents-domains](002-%E8%BF%81%E7%A7%BBdocs%E5%85%A8%E9%83%A8%E5%9F%9F%E5%88%B0.agents-domains.md) | 把 docs/ 下 6 个域搬到 .agents/domains 并归位生命周期，更新 CONTEXT-MAP 与 notes-guard 注释。 | — |
| [003-按评审清单修订prompt.md](003-%E6%8C%89%E8%AF%84%E5%AE%A1%E6%B8%85%E5%8D%95%E4%BF%AE%E8%AE%A2prompt.md.md) | 把 note 01 的 P0/P1 清单落到 prompt.md，并同步 README 与 ask skill；构建安装后验证。 | 001-评审prompt.md的优化空间 |
| [004-ready按DAG分组并补并行执行论述](004-ready%E6%8C%89DAG%E5%88%86%E7%BB%84%E5%B9%B6%E8%A1%A5%E5%B9%B6%E8%A1%8C%E6%89%A7%E8%A1%8C%E8%AE%BA%E8%BF%B0.md) | 让 ready 按依赖关系分组输出未完成 notes，并在 prompt 写并行执行与串行写入约束。 | 003-按评审清单修订prompt.md |
| [005-输入框上方的ready面板](005-%E8%BE%93%E5%85%A5%E6%A1%86%E4%B8%8A%E6%96%B9%E7%9A%84ready%E9%9D%A2%E6%9D%BF.md) | 在输入框上方加可折叠的 Nano Flow ready 列表面板，含宿主路由与客户端 dock。 | — |
| [006-notes.json的访问收口](006-notes.json%E7%9A%84%E8%AE%BF%E9%97%AE%E6%94%B6%E5%8F%A3.md) | 评估插件层强制 notes.json 只经 nano_flow_* 读写的可行性、旁路与保证级别。 | — |
| [007-notes.json访问收口实施](007-notes.json%E8%AE%BF%E9%97%AE%E6%94%B6%E5%8F%A3%E5%AE%9E%E6%96%BD.md) | 用 tools.guard 与 ctx.fs 包装，拒绝非 nano_flow_* 工具对 Plan notes.json 的显式读写。 | 006-notes.json的访问收口 |
| [008-轮转只在首次turn-end检查](008-%E8%BD%AE%E8%BD%AC%E5%8F%AA%E5%9C%A8%E9%A6%96%E6%AC%A1turn-end%E6%A3%80%E6%9F%A5.md) | 轮转阈值未触发：0.618 是 61.8%，且 rotated 标记在压力检查前就写入了。 | — |
| [009-恢复已有Plan时只读的定案](009-%E6%81%A2%E5%A4%8D%E5%B7%B2%E6%9C%89Plan%E6%97%B6%E5%8F%AA%E8%AF%BB%E7%9A%84%E5%AE%9A%E6%A1%88.md) | 恢复已有 Plan 时严格只读、报告后放行；轮转种子同步只读口径（4 项决定已确认）。 | — |
| [010-落地恢复只读条款](010-%E8%90%BD%E5%9C%B0%E6%81%A2%E5%A4%8D%E5%8F%AA%E8%AF%BB%E6%9D%A1%E6%AC%BE.md) | 按 note 09 改 prompt.md、resume 文案、轮转种子、do skill 与 README，并构建安装真机验证。 | 009-恢复已有Plan时只读的定案 |
| [011-等待验证状态定案](011-%E7%AD%89%E5%BE%85%E9%AA%8C%E8%AF%81%E7%8A%B6%E6%80%81%E5%AE%9A%E6%A1%88.md) | note 增加 awaiting_verification 状态：in_progress→等待验证→completed，complete 必须经过；ready 不列、分组内排后。 | — |
| [012-落地等待验证状态](012-%E8%90%BD%E5%9C%B0%E7%AD%89%E5%BE%85%E9%AA%8C%E8%AF%81%E7%8A%B6%E6%80%81.md) | 改 dag/check/write/read/面板/prompt 支持 awaiting_verification，构建安装后把 note 08 置为等待验证。 | 011-等待验证状态定案 |
| [013-旧Plan转notes.jsonDAG](013-%E6%97%A7Plan%E8%BD%ACnotes.jsonDAG.md) | 把 28 个旧 Plan、97 条 Markdown note 转成 notes.json DAG：拆超限、补 story、抽 evidence，逐 Plan 校验。 | 002-迁移docs全部域到.agents-domains |
| [014-docs收尾与外部引用](014-docs%E6%94%B6%E5%B0%BE%E4%B8%8E%E5%A4%96%E9%83%A8%E5%BC%95%E7%94%A8.md) | 删除 docs/ 并改 apps/etf、apps/music、packages/nano-flow README 的残留引用，最后跑 workspace 校验。 | 002-迁移docs全部域到.agents-domains, 013-旧Plan转notes.jsonDAG |
