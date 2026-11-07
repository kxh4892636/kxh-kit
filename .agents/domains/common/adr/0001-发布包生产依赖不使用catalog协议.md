# 发布包的生产依赖不使用 `catalog:` 协议

pnpm 的 `catalog:` 协议只在 pnpm 自己的打包/发布路径上被改写为具体版本；`npm pack` 会把它原样写进 tarball，安装方执行 `npm install` 时报 `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "catalog:"`。本仓库的发布产物同时被两条路径消费——`packages/nano-flow/test/distribution.spec.ts` 用 `npm pack` + `npm install --global` 验证安装产物——因此凡会被安装方解析的依赖字段（`dependencies`、`peerDependencies`、`optionalDependencies`）必须写显式版本区间；`devDependencies` 仍可用 `catalog:`，因为安装 tarball 时不解析它们。

## Considered Options

- **生产依赖写显式版本（选定）**：两条打包路径都能安装；代价是与 catalog 的单一版本源脱钩。
- **发布统一走 pnpm（`pnpm pack` / `pnpm publish`）**：`catalog:` 会被改写，但任何人都可能用 `npm pack` 打包，distribution 用例也会因此失败。
- **在打包步骤后处理改写 `catalog:`**：需要额外的脚本与校验，收益不抵成本。

## Consequences

- `pnpm-workspace.yaml` 的 catalog 只服务 `devDependencies` 与工作区内共享版本；为生产依赖保留 catalog 条目会成为陷阱，因此删除了未被任何 `catalog:` 引用消费的 `yaml` 条目。
- `packages/dsh-keep-alive` 的 `zod` 由 `catalog:` 改为显式 `4.5.4`（与 catalog 同版本）；`nano-flow`、`dsh-nested-skill` 的 `yaml` 保持显式 `^2.9.0`。
- 该问题不会被 `vp check` 或单元测试发现，只有 distribution 用例（`npm pack` + `npm install`）能覆盖；新增发布包时应同步补一条同口径验证。
