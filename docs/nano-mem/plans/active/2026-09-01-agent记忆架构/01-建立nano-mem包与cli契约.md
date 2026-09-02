---
status: completed
blocked_by: []
---

# 建立 Nano Mem 包与 CLI 契约

## 交付

开发者可以在工作区构建并执行只有 `nnm` bin 的 Nano Mem 包，并获得稳定的 JSON、帮助、版本和错误契约，为后续每条记忆能力提供同一个 public seam。

## 范围

- 从零创建 `packages/nano-mem`，接入 pnpm workspace、根 TypeScript project references、Vite Plus build/check/test。
- 建立 Commander 命令树、JSON envelope、pretty、stdin、退出码和领域错误映射。
- 建立可注入 clock、路径、进程执行器和数据库 factory 的 composition root，但不提前实现记忆或 self 业务。
- 创建最小 README、LICENSE、THIRD_PARTY_NOTICES 与包文件白名单。

## 直接依赖

- 无。

## 验收

- [x] `pnpm --filter @kxh4892636/nano-mem check`、`test` 和 `build` 成功，构建产物只暴露 `nnm`。
- [x] `nnm --help`、`nnm --version` 和未知命令分别产生约定的 stdout/stderr JSON 与退出码，`--pretty` 不改变字段。
- [x] CLI 文本输入 seam 覆盖位置参数、stdin、二者冲突和空输入，后续命令无需另建解析协议。
- [x] package tarball 只包含声明的发布文件，不包含源码、测试、临时数据库或工作区路径。

## 交付记录

- 交付物：`packages/nano-mem`、根 TypeScript project reference 与 pnpm lock importer。
- 验证证据：包级 `check`、`build`、25 个测试全部通过；coverage 为 statements 99.12%、branches 96.29%、functions 95.83%、lines 99.06%。
- 分发验证：tarball 仅含 `dist`、README、LICENSE、THIRD_PARTY_NOTICES 与 `package.json`；构建后的 help/version/未知命令 smoke 分别返回 0/0/2。
- 全仓验证：串行 build 通过；串行 test 除既有 Windows Git/MSYS `MapViewOfFileEx` 基线故障外通过，Nano Mem 测试全部通过。
- 审查：以 `5cd31ee6e96f294586db0a0daa00d5071c7ac5fc` 为 fixed point 的 Standards 与 Spec 双轴复审均为 0 findings。

## 上下文

- [spec.md](spec.md)
- [story.md](story.md)
- [Nano Mem 领域语言](../../../CONTEXT.md)
- [ADR 0001](../../../adr/0001-分离skill策略面与cli机制面.md)

## 下一步

/code-delivery
