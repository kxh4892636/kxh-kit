# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-拷问与方案定案](001-%E6%8B%B7%E9%97%AE%E4%B8%8E%E6%96%B9%E6%A1%88%E5%AE%9A%E6%A1%88.md) | 把 story 与 spec 的待定项收敛为有证据的决策：撤回的落地机制、入口命名、开关权威位置、旧包迁移、版本号。产出写回 [spec.md](spec.md) 与 [story.md](story.md)。 | — |
| [002-包重命名与工具注册表](002-%E5%8C%85%E9%87%8D%E5%91%BD%E5%90%8D%E4%B8%8E%E5%B7%A5%E5%85%B7%E6%B3%A8%E5%86%8C%E8%A1%A8.md) | `packages/dsh-nested-skill` 变为 `packages/dsh-toolkit`（包名 `@kxh4892636/dsh-toolkit`、版本 `0.2.0`），宿主半提供工具注册表、逐工具开关状态持久化与宿主 HTTP 路由，嵌套 skill 发现作为首个工 | 001-拷问与方案定案 |
| [003-客户端bundle与toolkit面板](003-%E5%AE%A2%E6%88%B7%E7%AB%AFbundle%E4%B8%8Etoolkit%E9%9D%A2%E6%9D%BF.md) | 插件带上浏览器半：向 root 作用域 `sidebar.panellist` 注册 `toolkit` 图标行、向 `main` 注册同 key 面板；面板列出全部工具并提供独立开关，读写宿主 `api/toolkit/state`。对应 US-002。 | 001-拷问与方案定案 |
| [004-撤回工具](004-%E6%92%A4%E5%9B%9E%E5%B7%A5%E5%85%B7.md) | 会话 composer 工具栏、模型选择器左侧出现「撤回」按钮（工具关闭时不出现）；点击弹确认，确认后：停掉正在执行的一轮、把会话回到上一轮结束的状态、把本轮用户输入回填输入框、删除原会话。对应 US-004。 | 001-拷问与方案定案, 002-包重命名与工具注册表, 003-客户端bundle与toolkit面板 |
| [005-打包安装与真机验证](005-%E6%89%93%E5%8C%85%E5%AE%89%E8%A3%85%E4%B8%8E%E7%9C%9F%E6%9C%BA%E9%AA%8C%E8%AF%81.md) | `@kxh4892636/dsh-toolkit@0.2.0` 打包为 tgz，装进 desktop profile，替换掉旧的 `@kxh4892636/dsh-nested-skill`，并在真实宿主里验收四条用户故事。 | 002-包重命名与工具注册表, 003-客户端bundle与toolkit面板, 004-撤回工具 |
| [006-屏蔽自带office技能](006-%E5%B1%8F%E8%94%BD%E8%87%AA%E5%B8%A6office%E6%8A%80%E8%83%BD.md) | `@kxh4892636/dsh-toolkit` 新增工具 `office-skills`（「移除 dsh 自带 office 技能」，默认关闭）。开启后 | 002-包重命名与工具注册表 |
| [007-撤回语义收敛与彻底删除](007-%E6%92%A4%E5%9B%9E%E8%AF%AD%E4%B9%89%E6%94%B6%E6%95%9B%E4%B8%8E%E5%BD%BB%E5%BA%95%E5%88%A0%E9%99%A4.md) | 在真机试用反馈上把「撤回」和工具集的行为收敛到最终语义：工具默认全关、弹窗与图标对齐宿主原生样式、撤回后原文回填输入框、原会话被彻底删除（连记账与归档占位一起清掉）。对应 US-002、US-004。 | 004-撤回工具 |
