# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-历史文本化修复](001-历史文本化修复.md) | `session_read` 在 `0.1.5-rc.1` 宿主上读出 assistant 正文与工具事件文本：assistant 条目的 `text` 不再是空串，`[event tool/call]` 占位行变为带工具名与参数摘要的可读行，`tool/result` 带正文或错误码； | — |
| [002-依赖声明与文档对齐](002-依赖声明与文档对齐.md) | 两个插件的 DSH 相关声明与实际运行的 `latest` 发布通道（`0.1.5-rc.1`）一致：peer 范围改 `^0.1.5-rc.1`，上游 opt-in 工具包 `@deepseek-ai/dsh-tool-session-query` 也随之对齐并留在 `dependen | — |
| [003-合入主分支并推送](003-合入主分支并推送.md) | 本轮改动经 git 离开 worktree 进入主分支：`feat/dsh-plugin-0.1.5` 推送到 `origin`，本地 `main` 快进合入并推送，远端 `main` 含 01、02 的实现与其验证证据。 | 001-历史文本化修复, 002-依赖声明与文档对齐 |
| [004-本地打包安装与真机冒烟](004-本地打包安装与真机冒烟.md) | 本地打包并安装后的 3080 实例在 `0.1.5-rc.1` 上端到端正确：web profile 装的是本轮 `vp pack` 产出的插件 tarball（与工作区解耦，不再是 `file:` 硬链接），全局 `dsh-alive` 是本轮重建的本地版本，工具目录仍含 9 个自有 | 003-合入主分支并推送 |
