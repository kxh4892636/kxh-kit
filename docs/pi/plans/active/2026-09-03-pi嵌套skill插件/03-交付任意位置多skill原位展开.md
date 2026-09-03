---
status: completed
blocked_by: ["02"]
---

# 交付任意位置多 skill 原位展开

## 交付

interactive 与 RPC 用户可在一条输入的开头、中间、末尾或跨行位置组合任意数量的已载入 skill；插件按原位置展开全部 marker，并保持任务正文与附件不变。

## 范围

- 实现 skill command 目录适配和 input event 编排。
- 实现独立 marker 边界、左到右原位展开、重复、非递归与共享用户输入。
- 镜像 Pi 原生 skill block，并以每个 skill 自身目录作为 relative resource base。
- 实现 `\/skill:name` 字面量、未知 marker 原样保留和单文件失败隔离 warning；记录开头已知读取失败仍可能追加 Pi 原生 diagnostic 的宿主限制。
- 处理 interactive、RPC、steer/followUp 的 input-hook 路径并保留 images；跳过 extension source。
- 完成 README 使用说明、限制、安装与 `/reload` 流程，并做 extension 级组合测试。
- 不增加 per-skill args、Markdown-aware exclusion、watcher 或 Pi core 改动。

## 直接依赖

- 02：输入展开必须消费最终且确定的 Pi skill 目录；消费其补充路径顺序、声明优先和 reload 契约。

## 验收

- [x] 测试证明一条输入中多个不同或重复 marker 可在任意位置按 occurrence 展开；转义、未知、读取失败、extension source 和 images 符合契约，并通过 Pi extension entry 与嵌套发现结果完成组合验收。

## 上下文

- [Plan](spec.md)
- [Pi 领域语言](../../../CONTEXT.md)
- [独立插件 ADR](../../../adr/0004-以独立插件补充发现与原位展开.md)
- `.temp/pi/packages/coding-agent/src/core/agent-session.ts`
- `.temp/pi/packages/coding-agent/src/core/extensions/types.ts`
- `.temp/pi/packages/coding-agent/src/index.ts`

## 下一步

/code-delivery

## 交付记录

- 交付物：任意位置多 marker 原位展开、独立 Unicode/URL/path 边界、重复与非递归语义、失败隔离、interactive/RPC/steer/followUp/images 编排、组合验收和完整 README。
- Commit：`827f80271`（`feat(coding-agent): expand inline skill markers`）。
- 验证证据：插件 3 个测试文件 10/10 passed；coverage statements 93.87%、branches 83.95%、functions 100%、lines 95.96%；根 `npm run check` passed；`npm pack --dry-run` 仅含 5 个运行时/说明文件；Standards 与 Spec 双轴 review passed；领域决策 Q15=A。
