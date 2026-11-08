# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-CLI-kernel与本地npm包](001-CLI-kernel%E4%B8%8E%E6%9C%AC%E5%9C%B0npm%E5%8C%85.md) | 一个可本地打包、安装和运行的 `@kxh4892636/nano-flow` 包，以 deep CLI kernel 统一内建子命令的 options、help、JSON、错误和预演契约。 | — |
| [002-Skill目录与版本检测](002-Skill%E7%9B%AE%E5%BD%95%E4%B8%8E%E7%89%88%E6%9C%AC%E6%A3%80%E6%B5%8B.md) | 使用者可通过 `nf self skill list` 查看 CLI 包内 skill，并通过 `check --name` 判定指定目标的安装状态。 | 001-CLI-kernel与本地npm包 |
| [003-Skill安装生命周期](003-Skill%E5%AE%89%E8%A3%85%E7%94%9F%E5%91%BD%E5%91%A8%E6%9C%9F.md) | 使用者可安全地安装、更新和卸载单个或全部受管 skill，并在真实变更前预演整批操作。 | 002-Skill目录与版本检测 |
| [004-从npm更新nano-flow](004-%E4%BB%8Enpm%E6%9B%B4%E6%96%B0nano-flow.md) | 使用者显式执行 `nf self update` 时，可检测并安装 npm 中的 CLI 版本，然后将已安装受管 skill 同步到同版；失败时保留原可用状态。 | 003-Skill安装生命周期 |
| [005-Anki纵切与牌组操作](005-Anki%E7%BA%B5%E5%88%87%E4%B8%8E%E7%89%8C%E7%BB%84%E6%93%8D%E4%BD%9C.md) | `nf anki` 的首个完整纵切：使用者可通过命名 options 列出、查看、创建和移动牌组/卡片，从 CLI 穿过 AnkiConnect port 获得与原 Anki CLI 等价的 JSON 结果。 | 001-CLI-kernel与本地npm包 |
| [006-Anki笔记与笔记类型操作](006-Anki%E7%AC%94%E8%AE%B0%E4%B8%8E%E7%AC%94%E8%AE%B0%E7%B1%BB%E5%9E%8B%E6%93%8D%E4%BD%9C.md) | `nf anki` 完整承载笔记和笔记类型的查询、创建、修改和删除能力，所有业务输入均通过命名 option 表达。 | 005-Anki纵切与牌组操作 |
| [007-Anki卡片与复习操作](007-Anki%E5%8D%A1%E7%89%87%E4%B8%8E%E5%A4%8D%E4%B9%A0%E6%93%8D%E4%BD%9C.md) | `nf anki` 承载卡片查询、呈现、评分、同步和交互式复习闭环，复习会话通过 CLI kernel 的输入/事件 interface 运行。 | 005-Anki纵切与牌组操作 |
| [008-Anki标签媒体与统计操作](008-Anki%E6%A0%87%E7%AD%BE%E5%AA%92%E4%BD%93%E4%B8%8E%E7%BB%9F%E8%AE%A1%E6%93%8D%E4%BD%9C.md) | `nf anki` 承载标签、媒体和统计能力，保留媒体安全与统计聚合语义，并为 AnkiConnect 与本地文件写入提供可判定预演。 | 005-Anki纵切与牌组操作 |
| [009-Anki-GUI操作](009-Anki-GUI%E6%93%8D%E4%BD%9C.md) | `nf anki gui` 承载现有 11 条 Anki GUI 操作，使用者可查询 GUI 状态或驱动 Anki 界面，无需使用旧 `anki-cli` 入口。 | 005-Anki纵切与牌组操作 |
| [010-nano-flow-cli路由skill](010-nano-flow-cli%E8%B7%AF%E7%94%B1skill.md) | 受管 `nano-flow-cli` skill 可识别 Nano Flow CLI 任务并路由到正确的 `self` 或 `anki` 子命令；现有 Anki agent 能力在新 skill 中拥有完整替代形态。 | 003-Skill安装生命周期, 004-从npm更新nano-flow, 005-Anki纵切与牌组操作, 006-Anki笔记与笔记类型操作, 007-Anki卡片与复习操作, 008-Anki标签媒体与统计操作, 009-Anki-GUI操作 |
| [011-删除旧Anki形态](011-%E5%88%A0%E9%99%A4%E6%97%A7Anki%E5%BD%A2%E6%80%81.md) | Anki CLI 只保留 `nf anki` 一个可执行入口和 `nano-flow-cli` 一个 agent 路由入口；旧包、bin 与 skill 已删除，不存在隐式兼容层。 | 010-nano-flow-cli路由skill |
| [012-本地包全链路验收](012-%E6%9C%AC%E5%9C%B0%E5%8C%85%E5%85%A8%E9%93%BE%E8%B7%AF%E9%AA%8C%E6%94%B6.md) | 一个可从本地 `.tgz` 安装的完整 `nf` 产物，使用者可从安装后的 bin 发现命令、管理两个受管 skill、预演写操作并通过假 AnkiConnect 运行 Anki 操作。 | 004-从npm更新nano-flow, 011-删除旧Anki形态 |
