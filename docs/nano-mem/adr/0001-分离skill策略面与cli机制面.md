---
status: accepted
---

# 分离 skill 策略面与 CLI 机制面

Nano Mem 作为独立业务域拥有记忆生命周期、`nano-mem` skill 与 `nnm` CLI，不归入 Nano Flow 或 Common。skill 利用 agent 上下文负责原子记忆提炼、语义冲突判断与调用时机；CLI 不调用 LLM 或外部服务，只提供确定性的存储、检索和生命周期机制。

`nnm` 包同时分发 `nano-mem` 受管 skill，并通过 `nnm self skill status|install|update|uninstall` 管理它。`nnm self update` 默认更新 CLI 至最新稳定版，也可选择版本或 tag；它以可预演、失败回滚的事务同步已安装 skill，本地修改只有在显式 `--force` 时才允许覆盖。

## Considered Options

- 把提炼和冲突处理放入 CLI：会引入模型依赖，使本地命令失去确定性。
- 把 Nano Mem 归入 Nano Flow：两者没有 Flow、Anki 或 receipt 等业务依赖。
- 分离安装 skill 与 CLI 版本：会允许不兼容的策略面和机制面长期并存。

## Consequences

- agent 能力决定语义提炼质量，CLI 只保证给定操作的确定结果。
- Nano Mem 复用 Common 的受管 skill 与 skill 安装状态，因此在 Context Map 中声明 `Nano Mem → Common`。
