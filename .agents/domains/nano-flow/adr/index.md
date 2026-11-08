# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-cli输出仅json](001-cli输出仅json.md) | nnf 执行结果只输出 JSON，错误用 stderr + 非零退出码。 | accepted |
| [002-以单一cli收口内建子命令](002-以单一cli收口内建子命令.md) | 用单一 nnf bin 收口内建子命令，不引入第三方插件。 | accepted |
| [003-cli与受管skill同版发布](003-cli与受管skill同版发布.md) | nano-flow 与 nano-flow-cli 作为受管 skill 随 CLI 同版发布。 | accepted |
| [004-子仓克隆由工作区配置定位](004-子仓克隆由工作区配置定位.md) | workspace 用工作区配置的 path 定位子仓克隆，worktree 基于它生成。 | accepted |
