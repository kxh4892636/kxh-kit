---
name: "004-CONTEXT-MAP迁到.agents目录"
description: "把生成的 CONTEXT-MAP.md 从工作区根迁到 .agents/domains/，同步实现、提示词、测试与既有文件。"
status: completed
reason:
related_noted:
  - '001-nano-flow重构'
next_step: '等待用户重启宿主验收；插件已装 0.5.11'
---

# 004-CONTEXT-MAP迁到.agents目录

## 背景

`prompts/agents.md` 与 README 的目录布局都把 `CONTEXT-MAP.md` 放在 `.agents/domains/`（与 `GUIDE.md` 同级），但实现写到工作区根：`check-domain.mjs` 用 `path.join(rootDir, "CONTEXT-MAP.md")`，`create.ts` 用 `join(workspace, "CONTEXT-MAP.md")`。结果是文档与产物不一致，恢复会话按提示词去 `.agents/domains/` 找不到索引。

用户裁决：以文档为准，改实现，`CONTEXT-MAP.md` 落在 `.agents` 下面。

## 交付

- 实现：`check-domain.mjs` 写 `.agents/domains/CONTEXT-MAP.md`，链接以该目录为基准（`./<domain>/CONTEXT.md`）；`create.ts` 模板落到同一路径。
- 提示词：`prompts/agents.md` 与 `rotate.ts` 的恢复种子补上显式路径。
- 测试：`check-domain.test.ts`、`runtime.test.ts` 断言新路径与新链接格式。
- 既有文件：工作区根的 `CONTEXT-MAP.md` 迁到 `.agents/domains/` 并由新实现重新生成。
- 版本：`@kxh4892636/dsh-toolkit` 0.5.10 → 0.5.11，构建后装进 desktop profile。

## 验收

- `pnpm --filter @kxh4892636/dsh-toolkit test` 与 `check` 通过。
- `nano_flow_check` 通过，且只在 `.agents/domains/` 下生成 `CONTEXT-MAP.md`；根目录不再生成。
- 安装后 desktop profile 的 `dsh-toolkit` 版本为 0.5.11，包内 `check-domain.mjs` 含新路径。宿主重启后提示词里的路径与实际产物一致（需用户重启验收）。

## 验证证据

- 测试 237 项通过（32 文件）；`vp check` 113 文件格式与 lint 全过。
- `nano_flow_check`：领域文档校验通过；工作区根已无 `CONTEXT-MAP.md`，`.agents/domains/CONTEXT-MAP.md` 存在，链接为 `./dsh/CONTEXT.md`。
- desktop profile 已装 0.5.11，`dist/nano-flow/scripts/check-domain.mjs` 含 `path.join(domainsRoot, CONTEXT_MAP_FILE)`，`dist/nano-flow/prompts/agents.md` 写有 `.agents/domains/CONTEXT-MAP.md`。
- 锚点：`vite-plus` 测试与 `vp check` 覆盖新路径；`runtime.test.ts` 断言 create 后 map 落在 `.agents/domains/` 且根目录没有。

## 遗留

- 旧 reference / archived Plan 里的 `CONTEXT-MAP.md`、`ADR`、`CONTEXT` 相对链接仍按迁移前布局书写，未随本次修改；需要时另立 note 统一校正。
- `packages/nano-flow/skills/nano-flow/scripts/check-domain.mjs` 是旧格式的独立副本（lifecycle `planning/implementing`），与本实现无关，未改动。
- 宿主重启后提示词才生效，本轮以内不重启。
