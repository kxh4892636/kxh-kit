---
status: completed
blocked_by: ["10"]
---

# 删除旧 Anki 形态

## 交付

Anki CLI 只保留 `nf anki` 一个可执行入口和 `nano-flow-cli` 一个 agent 路由入口；旧包、bin 与 skill 已删除，不存在隐式兼容层。

## 范围

- 在全部 `nf anki` 替代能力通过后，删除 `packages/anki-cli`、`@kxh4892636/anki-cli` package/bin 配置和相关 lockfile 条目。
- 删除 `.agents/skills/anki-cli`；保留并验证受管 `nano-flow-cli` 中的 Anki 路由替代内容。
- 在 `packages/nano-flow` 保留上游 anki-mcp-server 的 MIT 归属、来源说明和安全设计来源，不删除必需 license。
- 清理当前权威文档、scripts 和 package metadata 中对旧可执行入口的引用；已完成 reference plan 和 story 中的历史叙述保留。
- 不创建 `anki-cli` shim、deprecated package 或转发脚本。

## 直接依赖

- 10: 删除前必须同时存在完整 `nf anki` 命令树、受管 `nano-flow-cli` 路由和 skill 生命周期验证；消费其聚合后的替代契约。

## 验收

- [x] `packages/anki-cli`、`.agents/skills/anki-cli`、`anki-cli` bin 与 lockfile package entry 不存在，且没有兼容 shim。
- [x] 除 reference plan、story 原始想法和迁移说明外，全仓检索不再将 `anki-cli` / `@kxh4892636/anki-cli` 作为当前命令、包或 skill 引用。
- [x] `nf anki` 的全部自动化测试仍通过，上游归属与 MIT license 存在于最终包源/产物。
- [x] `node .agents/skills/nano-flow/script/check-domain.mjs .`、`vp run @kxh4892636/nano-flow#test`、`vp run @kxh4892636/nano-flow#build` 和 `vp check` 通过。

## 上下文

- [spec](spec.md)
- [单一 CLI 收口决策](../../../adr/0002-以单一cli收口内建子命令.md)
- [nano-flow-cli 路由 skill](10-nano-flow-cli路由skill.md)
- [Anki 参考 plan](../../reference/2026-08-20-mcp迁移为cli/spec.md)

## 下一步

/implement

## 交付记录

交付物：旧 `packages/anki-cli`、独立 `anki-cli` bin、`.agents/skills/anki-cli` 与 lock importer 已删除；当前冒烟清单改用 `nf anki`，Nano Flow 源与 npm 产物保留上游 MIT license 和可追溯安全设计说明。删除内容仍可从 Git 历史恢复。

验证证据：路径/lock contract、domain check、177 个 Nano Flow 测试与构建通过；npm pack dry-run 包含 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`；全仓 `vp check` 0 error（31 个既有 warning）；dangling commit `fb0d42f14902b9fe258d48bfa7b0bc72774f36c6` 的 Standards/Spec 双轴复审均无 blocker。
