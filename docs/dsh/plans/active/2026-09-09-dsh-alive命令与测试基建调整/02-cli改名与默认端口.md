---
status: pending
blocked_by: ["01"]
---

# CLI 改名与默认端口

## 交付

用户以 `dsh-alive` 调用工具；`start`/`stop`/`logs` 省略 `--port` 时作用于 3080，`status` 无参数仍列出全部受管端口。

## 范围

改 npm bin 名、帮助文本与错误前缀；`start`/`stop`/`logs` 的端口缺省值；README 同步（命令名、默认端口、开发命令，并纠正不存在的 `pack` 脚本）。不改包名、包目录、状态目录与命名管道名，不加旧命令别名，不改版本号。

## 直接依赖

- 01：测试文件与命令入口已在 vitest 与 `dist/main.mjs` 下稳定，避免同一批测试文件被改两次；消费其 vp 命令与构建产物路径。

## 验收

- [ ] 省略 `--port` 时 `start`/`stop`/`logs` 的目标端口解析为 3080：以受控入口或替身断言，真实 3080 已有运行中实例，不做真实启停。
- [ ] 在隔离 `LOCALAPPDATA` 下对已占用的 3080 执行 `dsh-alive start`（省略 `--port`）返回端口被占用的明确错误，证明默认值确实作用于 3080 且不终止既有实例。
- [ ] `dsh-alive status` 无参数仍列出全部受管端口，带 `--port` 查询单个。
- [ ] `--port` 显式值仍可覆盖；0、65536、非整数与缺值仍报错；帮助文本与错误前缀显示 `dsh-alive`。
- [ ] bin 只有一个条目，旧命令 `dsh-keep-alive` 不再存在。
- [ ] README 命令与开发命令与实际 scripts 一致，`pack` 脚本记录已纠正。
- [ ] 测试覆盖「省略即 3080」与「显式覆盖」两条路径，全部通过，覆盖率仍 ≥80%。
- [ ] 不触碰 `%LOCALAPPDATA%\dsh-keep-alive\3080` 的运行实例。

## 上下文

- [执行契约](spec.md)。
- [前置交付](01-vp与vitest基建迁移.md)。
- 现状：`src/main.ts` 强制 `--port N`；README 记录不存在的 `pack` 脚本。

## 下一步

/code-delivery；等待 01 completed。

## 交付记录

（完成登记前填写交付物与验证证据链接。）
