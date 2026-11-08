# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-依赖声明对齐](001-依赖声明对齐.md) | 两个插件的兼容性声明与 profile 实际装入的版本一致：DSH 相关 peer 范围与上游 opt-in 工具包依赖指向 `^0.1.2-rc.1`（当前 DSH `latest` 发布通道；`@deepseek-ai/cordis`、`@deepseek-ai/schemaster | — |
| [002-inject与stateOf修复](002-inject与stateOf修复.md) | `dsh-session-manager` 的子会话读取路径在真实宿主上可用：插件经 `ctx.get` 获取可选服务（不再直读未声明的 ctx 属性），`stateOf` 调用顺序与返回形状都与 `dsh-session-projection` 契约一致（live 读 host sta | — |
| [003-重装重启与真机冒烟](003-重装重启与真机冒烟.md) | 两个插件在重启后的 `0.1.2-rc.1` 宿主上端到端正确：profile 装入 `0.1.2-rc.1` 版上游工具包，9 个自有工具与 5 个上游搜索工具可用，已存在子会话的 `session_read` 成功，任意深度 skill 发现仍生效。 | 001-依赖声明对齐, 002-inject与stateOf修复 |
