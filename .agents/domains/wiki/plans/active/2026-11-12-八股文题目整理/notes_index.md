# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-抓取全站tag题目快照](001-抓取全站tag题目快照.md) | 写 apps/wiki/scripts/topk.mjs 的 fetch 步骤，把 11 个全站 tag 的题目与次数落成仓库内 JSON 快照，并记录 tag 元数据。 | — |
| [002-排查差额题目来源](002-排查差额题目来源.md) | 查清站点宣称 1736 题与公开接口 849 题之间的 887 题能否从其它入口、旧快照、面经原文或站点静态资源补齐，结论与证据写回 spec。 | — |
| [003-生成按tag分组的markdown](003-生成按tag分组的markdown.md) | 从快照生成 apps/wiki/docs/020-八股文梳理 下 11 个 tag markdown：文件内去重、次数降序、每行 `次数 - 题目`。 | — |
| [004-站点接入与构建校验](004-站点接入与构建校验.md) | 让 11 个 tag 文件在 wiki 侧栏正确排序、MDX 不报错，跑通 pnpm build 并本地起站抽查页面。 | — |
