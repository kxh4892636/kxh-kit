# Common 常见问题

## 发布包的 `dependencies` 能写 `catalog:` 吗？

- 适用条件与现象：在 `packages/*/package.json` 的 `dependencies`、`peerDependencies` 或 `optionalDependencies` 中写 `catalog:`；`npm pack` 出的 tarball 保留该写法，安装方报 `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "catalog:"`。
- 原因：`catalog:` 只由 pnpm 自己的打包路径改写为具体版本，`npm pack` 原样写入。
- 解决方法：会被安装方解析的字段写显式版本区间（如 `^2.9.0`）；`devDependencies` 仍可使用 `catalog:`。新增发布包时补一条 `npm pack` + `npm install` 的验证。
- 验证：`npm pack` 后检查 tarball 内 `package.json` 的 `dependencies` 不含 `catalog:`；`packages/nano-flow/test/distribution.spec.ts` 覆盖该路径。
- 来源：[ADR 0001](adr/0001-发布包生产依赖不使用catalog协议.md)。

## 覆盖率门槛是多少，应该在哪跑？

- 适用条件与现象：验收要求「覆盖率达标」，但根 `vite.config.ts` 没有阈值，且不同包报出的门槛不一致。
- 原因：阈值写在各包自己的 `vitest.config.ts` 或 `vite.config.ts` 的 `test.coverage.thresholds`：`nano-flow` 为 90，`pi-*` 与 `dsh-nested-skill` 为 80；根配置只负责 fmt、lint 与提交钩子。
- 解决方法：在目标包内执行 `vp test --run --coverage`；全仓验收使用根 `vp run -r --no-cache test`。以目标包配置为准，不套用其他包的数字。
- 验证：coverage 报告不因阈值失败，且四项指标均达到该包配置值。
- 来源：[vitest.config.ts](../../packages/nano-flow/vitest.config.ts)、[vite.config.ts](../../packages/dsh-nested-skill/vite.config.ts)。

## 为什么 commit 时文件被自动改写？

- 适用条件与现象：`git commit` 输出 `Running tasks for staged files… vp check --fix`，提交后工作区文件或暂存内容发生变化。
- 原因：根 `vite.config.ts` 的 `staged: { "*": "vp check --fix" }` 在提交前对暂存文件执行格式化与 lint 修复，并重新暂存。
- 解决方法：以钩子修复后的结果为准；提交后再看一次 `git status` 确认没有残留改动，不要重复手动格式化。需要保留未格式化内容时不要暂存该文件。
- 验证：`git show --stat HEAD` 与 `git status --short` 一致，且没有未暂存的额外改动。
- 来源：[vite.config.ts](../../vite.config.ts)。
