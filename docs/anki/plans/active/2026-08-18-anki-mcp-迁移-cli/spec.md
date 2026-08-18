---
status: pending
---

# Anki MCP 迁移为 CLI

## 问题

用户在本机 Anki 安装 AnkiConnect add-on 后，希望不经过 MCP，直接用 CLI 通过 AnkiConnect 控制 Anki，达到 anki-mcp-server 现有全部工具相同的效果。

已知约束：

- 覆盖上游全部工具（README 声称 42 个；代码实为 **48 个**：37 essential + 11 GUI，以代码为准）；
- 一次性子命令形态，结果输出 JSON；
- 媒体安全校验（MIME 白名单、SSRF 拦截、文件名净化）与 MCP 原样对等；
- 验收门禁：单元测试（mock AnkiConnect）+ 真实 Anki 冒烟。

## 方案

在本 workspace `packages/` 下新建独立的 `@kxh4892636/anki-cli` 包（TypeScript / ESM / Node ≥22.12 / vite-plus 构建，bin 为 `anki-cli`），直接调用 AnkiConnect HTTP API（默认 `http://localhost:8765`），以分组子命令暴露全部工具能力。不引入 NestJS / MCP SDK；以 `.temp/anki-mcp-server` 的 tool 实现为行为对等基准做移植。

## 已排除的备选

- fork anki-mcp-server 加 CLI 入口：引入 NestJS + MCP SDK 全套依赖；用户选择独立轻量实现。
- 薄封装（CLI 内部经 stdio 调 MCP server）：每次调用都有进程启动开销。
- Python 等其他运行时：本工作区统一 TypeScript/Node 工具链。

## 实施决策

三层结构：

- **AnkiConnect client**：唯一向 8765 发请求的模块，`invoke<T>(action, params)`；Node 内置 fetch（不引 ky）；内建 read-only 检查（WRITE_ACTIONS 集合）、超时、apiKey，行为参照 `src/mcp/clients/anki-connect.client.ts`。
- **tool 函数层**：每个工具一个模块，Zod schema 在 CLI 层重新声明（上游 schema 内联在装饰器中、未导出，按代码移植）；卡片渲染、统计、HTML 清洗等纯函数参照 `src/mcp/utils/` 移植。
- **命令分发层**：commander 分组子命令（kebab-case）：`deck` / `note` / `tag` / `media` / `model` / `stats` / `review` / `gui` 八组；输出归一化——成功 JSON 到 stdout，错误 JSON 到 stderr 并以非零码退出。

横切决策：

- 配置：`ANKI_CONNECT_URL`（默认 `http://localhost:8765`）、`ANKI_CONNECT_API_VERSION`（6）、`ANKI_CONNECT_API_KEY`、`ANKI_CONNECT_TIMEOUT`（5000），全局 flag `--anki-connect`，与上游一致。
- read-only：`--read-only` / `READ_ONLY`，在 client 层拦截写操作，与上游一致。
- 破坏性操作（`deleteNotes`、`clearUnusedTags`、`deleteMediaFile`、`removeModelField`）：需显式 `--yes`，对应上游参数级 `confirmDeletion`。
- 媒体安全：MIME 白名单、URL 私网/回环拦截、文件名净化原样移植；`MEDIA_ALLOWED_TYPES` / `MEDIA_IMPORT_DIR` / `MEDIA_ALLOWED_HOSTS` 同上游。
- 依赖最小化：仅 zod + commander；日志走 stderr。
- 进度上报：上游 tool 代码中已无 progress 调用（仅遗留测试），CLI 不实现。

## 工作环境

- 本 workspace：pnpm 11 workspace、vite-plus（`vp pack` / `vp check`）、Node ≥22.12、ESM；新包落 `packages/anki-cli`。
- 用户本机：Anki + AnkiConnect add-on（localhost:8765），冒烟验收用；写操作在专用测试 deck `anki-cli-smoke` 中执行并清理。
- 行为对等基准：`.temp/anki-mcp-server`（ankimcp/anki-mcp-server，commit `8b82692`）。

## 范围

- 48 个工具（37 essential + 11 GUI）的 CLI 对等实现，含参数校验、错误处理、read-only 模式、媒体安全校验。

## 非范围

- MCP 协议及其 stdio / HTTP / tunnel 三种 transport；
- tunnel / ngrok / 远程访问、OAuth 登录；
- 交互式复习会话（复习流程以一次性子命令串行完成）；
- 修改上游仓库（`.temp/anki-mcp-server` 只读参考）。

## 待定

（无）

## 上下文

- 域术语表：../../CONTEXT.md
- 上游仓库：https://github.com/ankimcp/anki-mcp-server
- 本地参考实现：`.temp/anki-mcp-server`（只读）

## Issue

| #   | Issue                                  | 状态    | 阻塞于 | 下一步     |
| --- | -------------------------------------- | ------- | ------ | ---------- |
| 01  | [骨架与牌组管理](01-骨架与牌组管理.md) | pending | —      | /implement |
| 02  | [笔记管理](02-笔记管理.md)             | pending | 01     | /implement |
| 03  | [标签管理](03-标签管理.md)             | pending | 01     | /implement |
| 04  | [媒体管理](04-媒体管理.md)             | pending | 01     | /implement |
| 05  | [模型与模板管理](05-模型与模板管理.md) | pending | 01     | /implement |
| 06  | [统计](06-统计.md)                     | pending | 01     | /implement |
| 07  | [复习流程](07-复习流程.md)             | pending | 01     | /implement |
| 08  | [GUI 工具](08-gui-工具.md)             | pending | 01     | /implement |
