---
name: '001-vite-plus大版本升级'
description: '工作区统一工具链（vite-plus，内置 vite/vitest/tsdown）跨大版本升级时：先用目标版本 CLI 迁移，再按门禁逐项复核兼容设置。'
---

# 001-vite-plus大版本升级

## 触发条件

要把工作区根 catalog 的 `vite-plus`（连带 `vite` → `vite-plus-core`、`vitest`、`@vitest/*`、tsdown）跨大版本对齐时，例如 0.2.6 → 1.0.0（内置 Vitest 5、tsdown 0.23）。只动单个包的小版本调整不必走这套。

## 步骤

1. **取证目标版本**：`npm view vite-plus` 确认 dist-tag；核对运行时下限（1.0.0 要求 Node `^22.18.0 || ^24.11.0 || >=26.0.0`）与 `git status` 干净。
2. **升级全局 CLI**：`vp upgrade <version>`，用 `vp --version` / `vp toolchain --global` 核对内置组件版本。
3. **用目标 CLI 迁移**（在工作区根，catalog / overrides / lockfile 都在根）：

   ```bash
   vp migrate --no-interactive --no-hooks --no-agent --no-editor
   ```

   不要用旧 local CLI（`node_modules/.bin/vp`）跑迁移，迁移规则落后且会把目标版本钉错；不加 `--full`，避免重跑 editor / agent / hooks 首次设置。
4. **审查迁移产物**：`0 BLOCK` 才继续；每条 REVIEW 记结论（覆盖率文件集、`expect.poll` 超时、类构造器 mock、未 await 断言、Node 运行时）。核对 catalog / overrides 重键、`vitest` 直接依赖是否可移除、`pack` 块插入的 tsdown 兼容项（如 `deps.resolveDepSubpath: true`）。
5. **手工收尾**（迁移工具不会做）：
   - 改了包内 skill 的脚本后重新生成 manifest（`node script/generate-skill-manifest.mjs`），否则内容哈希与已生成 manifest 不一致；
   - 新 lint 规则报错按语义修正（不 disable）；
   - 各处新增的 `.vitest/` 忽略合并成根 `.gitignore` 一条（无前导斜杠，匹配任意层级），删掉兼容设置后残留的空 `test: {}`。
6. **过门禁**：`vp check` → `vp run -r --no-cache test` → `vp run -r --no-cache test:coverage` → `vp run -r build`。先**保留**迁移插入的全部 Vitest v4 兼容设置（`clearMocks`、`sharedViteServer`、内联项目 `extends`、`browser.locators.exact`），门禁全绿后再逐项尝试移除：每项给移除/保留 + 依据 + 验证命令，不靠猜。
7. **记录遗留**：未评估的默认值变化（如 `resolveDepSubpath` 新默认）、需要 `nnf self skill update` 同步的安装副本，写进 note 的遗留限制。

## 已知坑

- 内置 Vitest 主版本升级会改 mock 清理、inline project 继承、browser locator 匹配、覆盖率阈值口径的语义；直接吃新默认等于同时改测试语义，风险不可控。
- 格式化器升级会重排大量与本次升级无关的文件（纯格式）——属预期副作用，别当业务改动审。
- 迁移会改写测试导入为 `vite-plus/test*`；依赖上游 vitest 身份的模块增强（`declare module 'vitest'`）不会跟着迁移，类型可能成批报错。
- 0.2.6 → 1.0.0 实测：`vp migrate` 改写 195 个文件，`0 BLOCK / 68 REVIEW`，全局 CLI 从 0.3.1 升到 1.0.0。

## 相关

- [002-覆盖率门槛在哪跑](../../questions/002-覆盖率门槛在哪跑.md) — 第 6 步的覆盖率门槛按各包配置判，不套用统一数字。
- [003-commit时文件被自动改写](../../questions/003-commit时文件被自动改写.md) — 门禁通过后提交时，暂存文件会被 `vp check --fix` 再改一次。
