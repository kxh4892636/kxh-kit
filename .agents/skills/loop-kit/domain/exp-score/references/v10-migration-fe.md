# Experience Score V10 Migration

体验分 V9 迁移 V10 与 V10 开发强制门禁。复用历史代码、迁移旧页面、调整 V10 import 或提交 V10 改动前，应用本文件。

## V9 迁移 V10

V10 需要复用历史代码时，先迁移再引用：

- 纯函数、类型、通用 hook：迁到 `src/v10/common` 或 `packages/experience-score/src/common`。
- 外部服务、API、SDK、storage：迁到 `src/v10/libs` 或 `packages/experience-score/src/libs`。
- 页面内业务用例、业务 UI、状态编排：迁到 `src/v10/features`。
- 双端共享领域能力：迁到 `packages/experience-score/src/features/<domain>`。

迁移保持最小切片，优先兼容原行为，不顺手重构无关历史代码。

从历史 `experience-score-components` 或旧页面迁移时：

1. 先确认该能力是否仍需要 PC/H5 双端复用。
2. 复用业务逻辑时迁入 `packages/experience-score/src/features` 或 `libs`，不要让 V10 直接依赖历史目录。
3. 历史 `isH5`、`isPc` 口径迁移为 `deviceType: 'H5' | 'PC'`。
4. 历史 `registerMap` 类端差异能力不要直接照搬；先判断是否应拆成 context 字段、adapter、端型组件或端应用薄适配。
5. 迁移完成后检查 Kit 导出、端应用 import 和双端静态检查。

## V10 固定工作流

1. 变更前先识别目标文件所在层级：`app`、`pages`、`features`、`libs`、`common` 或 Kit `index.ts`。
2. 变更中按依赖矩阵选择落点和 import，不要先写业务再补救边界。
3. 复用历史代码前先判断是否需要迁移到 V10 或 Kit，禁止从 V10 直接引用历史源码目录。
4. 变更后检查本次 touched files 的 import 是否违反依赖方向。
5. 有条件时执行 `pnpm biome check <file-path>` 或 `pnpm lint:changed`。

## V10 开发强制门禁

提交前必须逐项通过以下门禁；任一项失败时，先修复再继续：

- `src/v10/**` 没有引用同应用历史源码目录。
- `common` 没有依赖 `app`、`pages`、`features`、`libs`。
- `libs` 没有依赖 `features`、`pages`、`app`。
- `features` 没有反向依赖 `pages`。
- `packages/experience-score/src` 没有依赖 H5/PC 端应用实现。
- `packages/experience-score/src/index.ts` 只做稳定导出。
- 双端共享逻辑优先沉淀到 Kit，单端差异留在端应用 V10。
- PC V10 没有新增非 `@ecom/aurora` 的端 UI 组件库。
- H5 V10 没有新增非 `@ecom/aurora-mobile-biz` 的端 UI 组件库。
- 图表没有新增 `@visactor/react-vchart` 之外的图表库。
- 网络请求和埋点改动已分别应用 [api-fe.md](api-fe.md) 和 [tracking-fe.md](tracking-fe.md)。
