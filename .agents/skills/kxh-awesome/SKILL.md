---
name: kxh-awesome
description: kxh-awesome 仓库路由与工程门禁。用于本仓库的代码、依赖或 workspace、构建测试、RPC/proto/codegen、Git hooks 与提交任务；内容变更在触及构建、导航、脚本、生成物或发布时使用。
---

# kxh-awesome

以**影响面**为路由：先确定目标路径与产物类型，再读取事实源、实施并验证。仅在路径归属或生成边界不清楚时读取[仓库地图](references/repository-map.md)。

## 执行流程

### 1. 路由影响面

- **内容**：笔记、报告、知识整理和构建链路外的 Markdown/文本。
- **Node/workspace**：具有 `package.json` 的前端、TypeScript 包、依赖、脚本、Vite+ 配置、构建、测试、格式化和 Git hooks。
- **静态扩展**：`packages/url-network-guard-extension` 的 Manifest V3、后台脚本和 popup；以扩展文件与 Chrome 真实路径为门禁。
- **Go 实现**：Go 模块、服务实现和测试。
- **契约/codegen**：proto、生成配置、生成器或生成客户端；与受影响的 Go/Node 分支叠加。
- **混合**：内容同时影响站点导航、代码示例、生成文档、脚本或发布；叠加所有适用分支。
- **ETF**：`apps/etf-dashboard` 或 `apps/etf-service` 的领域任务同时使用 `/etf`。

**完成标准：** 每项交付物都已对应目标路径、适用分支、事实源，以及“源文件 / 配置 / 运行数据 / 生成物”中的一种类型。

### 2. 读取事实源

- 从仓库根到目标目录读取适用的 `AGENTS.md`。
- Node/workspace 分支读取根与目标包的 `package.json`，并按需要读取 `pnpm-workspace.yaml`、`vite.config.ts`、`tsconfig.json`、`.node-version`。
- 静态扩展分支读取 `manifest.json`、`README.md` 及 manifest 声明的入口文件。
- Go 实现分支读取目标模块的 `go.mod` 与相关源码；契约/codegen 分支再读取 `proto/`、生成脚本与客户端生成配置。
- Vite+ 的可用命令与参数以当前安装的 `vp <command> --help` 为准；脚本名以当前 `package.json` 为准。

**完成标准：** 待使用的每条路径、命令和版本约束都能由当前文件或本地帮助信息证明；每个生成物都已找到源定义与生成入口。

### 3. 在源头实施

- Node/workspace 操作统一从 `vp` 进入；内置构建使用 `vp build`，执行 `package.json` 脚本使用 `vp run <script>`。
- 依赖变更使用 `vp add`、`vp remove`、`vp update` 或 `vp install`。根 catalog 已有依赖时使用 `catalog:`；包内新增依赖保留包内版本，只有任务明确包含共享版本策略时才扩展根 catalog。catalog 变更后运行 `vp install`。
- workspace 包的 `package.json#name` 使用 `@kxh-awesome/<目录名>`。
- RPC 契约变化按“proto → 后端生成代码与文档 → 前端客户端 → 调用方”的**契约链**推进；契约/codegen 分支使用目标目录已检入的生成脚本。
- 手工修改落在源定义；`gen/`、`dist/`、生成客户端、生成文档和 `pnpm-lock.yaml` 由对应工具刷新。

**完成标准：** 所有手改都位于权威源文件；生成物与其生成入口一致；适用的依赖、包名和契约消费者均已覆盖。

### 4. 通过工程门禁

| 影响面 | 最小证据 |
| --- | --- |
| 内容 | 适用的事实、引用、日期、格式和目标 diff 已复核；进入构建链路时叠加对应工程门禁 |
| Node 包 | `vp check --fix <本次变更路径>`，再运行受影响包当前定义的测试、构建脚本中的所有适用项 |
| 静态扩展 | 校验 manifest JSON、权限与声明入口；运行时行为变化通过 Chrome 加载未打包扩展的真实路径验证 |
| Go 实现 | 在受影响模块运行 `go test ./...` |
| 契约/codegen | proto、生成配置或生成器变化时执行所有受影响生成链，审阅生成 diff，并验证消费者 |
| 根配置或共享行为 | 先做针对性检查；当前根 `package.json` 定义 `ready` 时再用 `vp run ready` 扩大验证 |

**完成标准：** 每个适用影响面都有成功证据，或在无法执行时给出具体原因和残余风险。
