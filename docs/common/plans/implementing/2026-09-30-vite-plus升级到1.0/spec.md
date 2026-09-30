---
status: completed
---

# Vite+ 升级到 1.0

## 问题

工作区统一工具链停留在 `vite-plus@0.2.6`（`vite` 别名指向 `@voidzero-dev/vite-plus-core@0.2.6`，`vitest@^4.1.10`），与已发布的 Vite+ 1.0.0（内置 Vitest 5.0.1、tsdown 0.23）存在两个大版本差距。需要把工作区对齐到 1.0.0，且不破坏 14 个包的应用、测试与库构建行为。关联 US-001 / US-002 / US-003。

## 方案

以官方迁移工具为主线，一版一版把工作区从 0.2.6 推到 1.0.0：

1. **用目标 CLI 跑迁移**：不先用旧 local CLI，改为 `pnpm dlx --package=vite-plus@1.0.0 vp migrate --no-interactive`（或先 `vp upgrade` 全局 CLI 再 `vp migrate`）。已存在 Vite+ 项目走默认 upgrade 流程，不加 `--full`，避免重跑 hooks / editor / agent 首次设置。
2. **依赖对齐**：迁移把 `vite-plus` 钉到具体 1.0.0、`vite` 别名指向同版 core、清理不再需要的 `vitest` 直接依赖、把 `@vitest/*` 对齐到内置 5.0.1，并同步 catalog / overrides。
3. **源码改写**：`vitest` / `vitest/*` 导入改写为 `vite-plus/test*`；`vite.config.*`、`vitest.config.*` 中的 `vite` / `vitest/config` 改写为 `vite-plus`；模块增强（`declare module 'vitest'` / `'@vitest/browser*'`）保留上游身份。
4. **pack 适配**：`pack` 块按 tsdown 0.23 迁移，插入 `deps.resolveDepSubpath: true` / `attw.profile: 'strict'` 兼容项并带注释。
5. **基线验证**：`vp install` → `vp check` → 各包 `vp test --run --coverage` → `vp run -r build`；逐条处理迁移 BLOCK/REVIEW。
6. **兼容设置复核**：基线通过后，按 `vitest-v5` 指南逐项尝试移除生成的 v4 兼容设置，能移除才移除，不能验证就保留并记录。

## 已排除的备选

- **手工逐项改版本号**：不走 `vp migrate`。理由：会漏掉导入改写、pack 选项映射、overrides 重排与 vitest direct-required 判定，且无法复用官方迁移规则；文档明确推荐迁移工具。
- **`vp migrate --full`**：理由：会重跑 hooks / editor / agent / lint 首次设置，本次只升级版本，不需要重设项目。
- **用旧 local CLI（`node_modules/.bin/vp`，0.2.6）跑迁移**：理由：文档明确禁止；旧 CLI 的迁移规则落后，且会把目标版本钉错。
- **跳过 `vitest` 兼容设置、直接采用 v5 默认**：理由：未验证前直接切默认会改变 mock 清理、inline project 继承、browser locator、coverage 阈值等语义，风险不可控。

## 实施决策

- **目标版本**：`vite-plus@1.0.0`（含 `@voidzero-dev/vite-plus-core@1.0.0`）、内置 `vitest@5.0.1`。
- **迁移命令**：`pnpm dlx --package=vite-plus@1.0.0 vp migrate --no-interactive`，从工作区根执行（catalog、overrides、lockfile 均在根）。是否同时 `vp upgrade` 全局 CLI 见「待定」。
- **pnpm 管理键**：迁移会把 override 键改为显式 `@*` 范围（`vite@*`、`vitest@*`），保留 `catalog:` 引用；`vite` / `vitest` 的 catalog 值改为具体版本。
- **diff-viewer jest-dom 类型**：jest-dom 6.10/7.0 的 vitest 增强按 `Assertion<T>` 声明，与 v5 的 `Assertion<R, T>` 不一致；且 `vite-plus/test` 解析到的 vitest peer 实例与本地 `vitest` 不同，模块增强无法跨实例合并（实测：`declare module "vitest"` 仅对 `import { expect } from "vitest"` 生效，对 `vite-plus/test` 无效；`vite-plus` 的 `node_modules/vitest` 指向 `@types/node@25` 实例，app 的指向 `@24`）。最终采用注入全局 `Chai` 命名空间：v5 的 `Assertion` 通过映射类型继承 `Chai.Assertion`，已实测 `vite-plus/test` 生效。
- **package-local vitest 判定**：浏览器模式（`apps/etf-dashboard`）与保留上游 `vitest` 引用的包（`apps/diff-viewer`）按规则保留 local `vitest`，其余包允许迁移移除直接依赖。
- **兼容设置策略**：第一轮验证保留迁移插入的全部 v4 兼容设置；通过后再逐项移除。

## 工作环境

- 工作区根：`C:/Users/kxh/kxh-awesome/projects/kxh-kit`；pnpm workspace（`apps/*`、`packages/*`）。
- pnpm 11.22.0，Node 24.21.0；registry 可达 npmjs（`npm view vite-plus` 已验证）。
- 全局 `vp` 位于 `C:/Users/kxh/AppData/Local/vite-plus/bin/vp`，当前 `0.3.1`；工作区 `node_modules/.bin/vp` 当前 `0.2.6`。
- 门禁：根 `package.json` 的 `ready` = `vp check && vp run -r --no-cache test && vp run -r build`。
- 无 CI；无 eslint / prettier / tsdown 独立配置，格式化与 lint 全部经由 `vp check`。

## 范围

- 依赖声明、catalog、overrides、lockfile 对齐到 Vite+ 1.0.0。
- 迁移工具产生的源码 / 配置改写（导入、脚本、pack、staged、hooks 相关键）。
- 迁移后按门禁验证并复核兼容设置。

## 非范围

- 升级业务依赖版本（React、Vite 插件等非工具链依赖）；除非升级后无法解析。
- 业务功能改动。
- 新增 CI、编辑器或 agent 首次设置（`--full` 内容）。
- 删除仍被使用的依赖（例如 `vitest-browser-react` 实际被 etf-dashboard 浏览器测试导入，须保留）。

## 执行约束

- 模式：manual（改动大、跨全部业务域、需要用户确认基线与提交）。用户已于 2026-09-30 确认第 1 轮 Q1–Q4。
- **已确认决策**：目标 `1.0.0`；升级全局 `vp` CLI 到 1.0.0；在当前 `main` 工作区完成、门禁通过后提交；先保留 v4 兼容设置跑通基线，再逐项复核移除。
- 不动业务代码语义；迁移工具产生的改写之外的最小修复才可改源码。
- 质量门禁最小集合：`vp install`、`vp check`、逐包 `vp test --run --coverage`、`vp run -r build`；迁移报告 BLOCK 必须清零，REVIEW 逐条有结论。
- 不弱化断言、不减少测试集、不随意下调覆盖率阈值。
- 不在用户确认前 commit / push。
- 文档更新遵循 `/domain skill`，代码交付遵循 `/code-delivery skill`。

## 待定

- **diff-viewer Vite 内部补丁**：`virtual:@vite/env` 与 `/vite/dist/client/env.mjs` 的 shim 在 Vite 8.1 / Rolldown 下是否仍需保留，需实测。恢复条件：迁移后跑 client 测试时取证。
- **兼容设置清理深度**：已确认先保留跑通基线，再逐项复核；具体哪几项能移除取决于实测。恢复条件：基线通过后按指南评估。
- **全局 CLI 升级结果**：`vp upgrade` 能否直接到 1.0.0 需实测（若不行则回退到 `pnpm dlx` 迁移路径）。恢复条件：执行 upgrade 时取证。

## 上下文

- [story](story.md)、[note 01 调查与迁移方案](01-调查与迁移方案.md)、[note 02 执行迁移](02-执行迁移.md)、[note 03 验证与兼容复核](03-验证与兼容复核.md)
- [common CONTEXT](../../../CONTEXT.md)、[ADR-0001 发布包生产依赖不使用 catalog 协议](../../../adr/0001-发布包生产依赖不使用catalog协议.md)
- 公告与迁移文档见 story 上下文
- 代码基线：`main @ 9b4ef89f`（2026-09-30 核对）

## 当前进度

- 2026-09-30：完成现场调查（见 note 01）；用户确认第 1 轮 Q1–Q4 全部推荐。Plan 迁入 `implementing`。
- 2026-09-30：note 02 完成：全局 CLI 升级、`vp migrate`（0 BLOCK / 68 REVIEW / 195 files rewritten）、依赖安装、迁移后手工修正；`vp check` 全绿。
- 2026-09-30：note 03 完成：三关门禁 + 覆盖率全绿；迁移插入的 v4 兼容设置全部移除（含 1 处 locator 局部修复）；68 条 REVIEW 逐条结论；`.node-version = 24.21.0`。
- 2026-09-30：按 code review 两位审查者意见收口：URL 取值改用窄化辅助函数、`ISafeAny` 收口、`.vitest/` 忽略合并到根、删除空 `test: {}`、修正文档事实错误与证据引用。
- 未完成：commit（待最终复验）。

## 恢复入口

1. 先读 story 与 spec（本文件），再读 note 01 的「决策与证据」与「拷问记录」。
2. 核对现场事实：`git status` 应干净；`pnpm-workspace.yaml` catalog 仍为 `vite-plus: 0.2.6`；`vp --version`。
3. 用户已确认第 1 轮 Q1–Q4；按 [note 02 执行迁移](02-执行迁移.md) 的下一步执行 `vp upgrade` → `vp migrate --no-interactive`。
4. 前置条件：Node `^22.18.0 || ^24.11.0 || >=26.0.0`；npm registry 可达。
5. 停止条件：迁移报告出现 BLOCK 或 `vp install` 失败时停止并取证。

## Notes

| #   | Notes                                  | 状态      | 阻塞于 | 下一步                   |
| --- | -------------------------------------- | --------- | ------ | ------------------------ |
| 01  | [调查与迁移方案](01-调查与迁移方案.md) | completed | —      | 输出已并入本 spec        |
| 02  | [执行迁移](02-执行迁移.md)             | completed | —      | 已交付（含手工修正）     |
| 03  | [验证与兼容复核](03-验证与兼容复核.md) | completed | 02     | 已交付（含兼容设置移除） |
