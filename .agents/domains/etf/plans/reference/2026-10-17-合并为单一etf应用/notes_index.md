# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-结构与运行决策（1-2）](001-%E7%BB%93%E6%9E%84%E4%B8%8E%E8%BF%90%E8%A1%8C%E5%86%B3%E7%AD%96%EF%BC%881-2%EF%BC%89.md) | 形成合并后 `apps/etf` 的唯一结构、后端分层、共享边界、脚本与命名结论，供 [合并目录并回归验证](002-结构与运行决策（2-2）.md) 直接执行；关联 US-001、US-002。 | — |
| [002-结构与运行决策（2-2）](002-%E7%BB%93%E6%9E%84%E4%B8%8E%E8%BF%90%E8%A1%8C%E5%86%B3%E7%AD%96%EF%BC%882-2%EF%BC%89.md) | 形成合并后 `apps/etf` 的唯一结构、后端分层、共享边界、脚本与命名结论，供 [合并目录并回归验证](002-结构与运行决策（2-2）.md) 直接执行；关联 US-001、US-002。（续 2） | — |
| [003-合并目录并回归验证（1-2）](003-%E5%90%88%E5%B9%B6%E7%9B%AE%E5%BD%95%E5%B9%B6%E5%9B%9E%E5%BD%92%E9%AA%8C%E8%AF%81%EF%BC%881-2%EF%BC%89.md) | `apps/etf` 成为唯一 ETF 应用：应用根直接分 `client`、`server`、`shared`，工具按 `libs`/`utils` 归位；后端业务域 `market` 内有 handler/service/repository 三层并以依赖注入装配；一条命令启动前后端 | 001-结构与运行决策（1-2） |
| [004-合并目录并回归验证（2-2）](004-%E5%90%88%E5%B9%B6%E7%9B%AE%E5%BD%95%E5%B9%B6%E5%9B%9E%E5%BD%92%E9%AA%8C%E8%AF%81%EF%BC%882-2%EF%BC%89.md) | `apps/etf` 成为唯一 ETF 应用：应用根直接分 `client`、`server`、`shared`，工具按 `libs`/`utils` 归位；后端业务域 `market` 内有 handler/service/repository 三层并以依赖注入装配；一条命令启动前后… | — |
| [005-行情全量同步工作流](005-%E8%A1%8C%E6%83%85%E5%85%A8%E9%87%8F%E5%90%8C%E6%AD%A5%E5%B7%A5%E4%BD%9C%E6%B5%81.md) | 上游适配器返回两个证券的全量历史；新增可复跑的同步 workflow 与 `sync:market` CLI；本地缓存覆盖真实范围；workflow 文档与 ADR 落地。关联 US-001、US-002。 | 003-合并目录并回归验证（1-2） |
| [006-按ETF持久化看板状态](006-%E6%8C%89ETF%E6%8C%81%E4%B9%85%E5%8C%96%E7%9C%8B%E6%9D%BF%E7%8A%B6%E6%80%81.md) | 看板的周期、范围、均线、虚拟均线按 ETF 独立保存到 localStorage；切换标的时恢复对应 ETF 的状态，新标的回退默认值，刷新页面后首个标的仍恢复其状态。 | 003-合并目录并回归验证（1-2） |
