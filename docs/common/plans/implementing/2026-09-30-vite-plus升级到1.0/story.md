# Vite+ 升级到 1.0

## 原始想法

「阅读 https://voidzero.dev/posts/announcing-vite-plus-1-0, 将工作区的 vite+ 升级到最新型版本」

## 角色

- **kxh4892636（维护者）**：在 kxh-kit pnpm monorepo 维护 14 个 workspace 包与统一工具链；工具链版本漂移会同时影响所有业务域的 check/test/build，希望把工作区对齐到 Vite+ 1.0.0。

## 故事

### US-001 工具链依赖对齐到 Vite+ 1.0

作为维护者，我希望把根 catalog、overrides 与各包的 `vite-plus` / `vite` / `vitest` / `@vitest/*` 声明对齐到 1.0.0，以便整个工作区共享同一套经测试的工具链版本。

- [ ] `pnpm-workspace.yaml` 中 `vite-plus`、`vite`(→`@voidzero-dev/vite-plus-core`)、`vitest`、`@vitest/browser-playwright`、`@vitest/coverage-v8` 与 1.0.0 目标一致，`overrides` 与 `peerDependencyRules` 同步
- [ ] `packages/dsh-opencode-session` 的裸 `vitest: ^4.1.10` 收敛到统一版本
- [ ] `vp install` 成功并刷新 `pnpm-lock.yaml`

### US-002 源码与配置迁移到 1.0 接口

作为维护者，我希望测试与配置的导入改用 `vite-plus` / `vite-plus/test*`、pack 配置适配 tsdown 0.23，以便代码在 1.0 下可运行。

- [ ] 测试与测试支撑文件的 `vitest` / `@vitest/*` 导入迁移到 `vite-plus/test*`；`declare module 'vitest'` 等模块增强保留上游身份
- [ ] 4 个 `vitest.config.ts` 的 `defineConfig` 来源与插件迁移
- [ ] 6 个 `pack` 块适配 tsdown 0.23，插入的兼容项按文档保留或复核后移除
- [ ] `apps/diff-viewer` 的 `vite` 导入（`vite.config.ts`、`scripts/dev.mjs`、`scripts/build-renderer.mjs`）在 `vite`→core 别名下仍可用

### US-003 迁移后基线验证

作为维护者，我希望迁移后用工作区门禁验证，以便确认升级未破坏行为。

- [ ] `vp check` 通过
- [ ] 各包 `vp test --run --coverage` 通过，覆盖率不低于仓库阈值
- [ ] `vp run -r build` / `vp pack` 通过
- [ ] 迁移报告中的 BLOCK / REVIEW 项逐条有结论
- [ ] Vitest v4 兼容设置逐项复核，保留或移除均有依据

## 约束与澄清

- 2026-09-30 用户原始表述：阅读 1.0 公告并把工作区 vite+ 升到最新版；这是一次明确的执行授权。
- 目标版本经 registry 查证：`vite-plus` dist-tag `latest = 1.0.0`；工作区现为 `0.2.6`。
- 基线与现场：`main @ 9b4ef89f`，`git status` 干净。
- 运行时：pnpm 11.22.0 / Node 24.21.0，满足 1.0 要求的 `^22.18.0 || ^24.11.0 || >=26.0.0`。
- 无 `.github` CI 工作流；门禁只在本地执行。
- 待确认（见 [note 01](01-调查与迁移方案.md) 拷问记录）：是否同步升级全局 `vp` CLI；提交与分支策略；兼容设置的清理取舍。

## 迷雾

- `apps/diff-viewer/vitest.config.ts` 依赖 Vite 内部路径（`/vite/dist/client/env.mjs`、`\0virtual:@vite/env`），在 Vite 8.1 / Rolldown 下是否仍成立未验证。
- `apps/etf-dashboard` 浏览器模式（Playwright provider + `vitest/browser`）在 Vitest 5 下的行为未验证。
- `vitest-browser-react` 被 `apps/etf-dashboard` 的 5 个浏览器测试导入（`render`/`renderHook`），非死依赖；其 `^2.2.0` 与 Vitest 5 的兼容性由迁移后浏览器测试通过验证。

## 上下文

- [1.0 公告](https://voidzero.dev/posts/announcing-vite-plus-1-0)
- 迁移文档：[Migrate](https://viteplus.dev/guide/migrate)、[Migration Rules](https://viteplus.dev/guide/migrate-rules)、[Upgrade to Vitest 5](https://viteplus.dev/guide/vitest-v5)、[Update Vite+](https://viteplus.dev/guide/upgrade-project)
- [spec](spec.md)、[note 01 调查与迁移方案](01-调查与迁移方案.md)、[note 02 执行迁移](02-执行迁移.md)、[note 03 验证与兼容复核](03-验证与兼容复核.md)
- [common CONTEXT](../../../CONTEXT.md)
