# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-cli输出仅json](001-cli%E8%BE%93%E5%87%BA%E4%BB%85json.md) | nnf 执行结果只输出 JSON，错误用 stderr + 非零退出码。 | accepted |
| [002-以单一cli收口内建子命令](002-%E4%BB%A5%E5%8D%95%E4%B8%80cli%E6%94%B6%E5%8F%A3%E5%86%85%E5%BB%BA%E5%AD%90%E5%91%BD%E4%BB%A4.md) | 用单一 nnf bin 收口内建子命令，不引入第三方插件。 | accepted |
| [003-cli与受管skill同版发布](003-cli%E4%B8%8E%E5%8F%97%E7%AE%A1skill%E5%90%8C%E7%89%88%E5%8F%91%E5%B8%83.md) | nano-flow 与 nano-flow-cli 作为受管 skill 随 CLI 同版发布。 | accepted |
| [004-子仓克隆由工作区配置定位](004-%E5%AD%90%E4%BB%93%E5%85%8B%E9%9A%86%E7%94%B1%E5%B7%A5%E4%BD%9C%E5%8C%BA%E9%85%8D%E7%BD%AE%E5%AE%9A%E4%BD%8D.md) | workspace 用工作区配置的 path 定位子仓克隆，worktree 基于它生成。 | accepted |
