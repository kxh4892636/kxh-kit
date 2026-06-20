---
name: agents-update
description: |
  维护、创建、迁移、重构和审查任意仓库中的 AGENTS.md / Agent instructions。凡是用户要求更新 AGENTS.md、创建项目级 Agent 规则、迁移 AGENT.md 到 AGENTS.md、梳理分层 Agent 指令、调整根层/项目层职责，或询问 Agent 文件应该包含什么内容时，都必须使用本 skill。该 skill 适用于单体项目、monorepo、文档仓库、模板仓库、插件/扩展仓库和混合内容仓库。
---

# agents-update

维护仓库内 `AGENTS.md` 的目标是让 Agent 快速获得正确边界：当前目录是什么、该读哪些事实、该避免哪些误操作、如何验证结果。规则文件应服务执行，不应变成泛泛的工程宣言、过期目录地图或某个仓库习惯的硬编码副本。

## 触发后先做什么

1. 先确认仓库根目录。优先使用 `git rev-parse --show-toplevel`；如果不是 Git 仓库，就以用户指定目录或当前工作目录为边界。
2. 查找现有规则文件：`rg --files -g 'AGENTS.md' -g 'AGENT.md' -g 'CLAUDE.md' -g 'CONTRIBUTING*' -g 'README*'`。
3. 读取当前目录最近的 Agent 规则，再读取仓库根层规则；如果用户指定了目标目录，只读取该目标路径相关规则。
4. 判断任务是新增、迁移、更新、审查还是删除 Agent 规则。
5. 只读取与目标目录相关的事实文件：项目 manifest、构建配置、路由入口、API/schema、测试入口、生成脚本、发布配置、README 或贡献说明。
6. 把事实、假设、判断分开；无法从仓库确认的内容不要写成规则。

## 先发现仓库约定

不要把当前会话里的仓库结构当成通用事实。维护任意仓库的 Agent 规则时，先回答这些问题：

- 文件命名：仓库使用 `AGENTS.md`、`AGENT.md`、`CLAUDE.md`，还是多种文件并存？
- 层级：只有根层，还是根层 + 项目层，或还存在领域/分区层？
- 项目单元：哪些目录是可独立维护的 app、package、service、template、plugin、extension、docs site？
- 工具链：命令来自 `package.json`、`Makefile`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`Taskfile.yml`、CI 配置，还是自定义脚本？
- 生成物：哪些目录或文件由工具生成，不能手写？
- 验证边界：改规则文件时需要什么最小验证；改代码/配置时需要什么工程验证？

如果用户给出明确的命名或分层决策，以用户决策为准；否则沿用仓库已有约定，不主动引入新层级。

## 分层规则

通用默认建议是两层：

- 根层：`/AGENTS.md`
- 项目层：独立项目目录下的 `AGENTS.md`

但这只是默认方案，不是硬性规则。对于任意仓库：

- 已有清晰约定时，延续已有命名和层级。
- 用户要求统一命名时，再迁移旧文件。
- 用户要求移除分区层时，不要创建中间层。
- 仓库确实有多个互不相同的领域并且用户同意时，才添加分区层。
- 迁移 `AGENT.md` 到 `AGENTS.md` 前，先确认仓库或用户希望统一到复数命名。

## 根层应该写什么

根层只写稳定的全局规则：

- 仓库性质：这是单体应用、monorepo、库、服务、模板、文档站、插件/扩展，还是混合仓库。
- 协作约束：Git remote、分支/提交信息、代码所有权、贡献流程等已确认规则。
- 任务分流：工程任务、内容任务、混合任务分别如何读取上下文和验证。
- 工具链：仓库实际使用的包管理器、构建工具、测试工具、格式化/lint 工具和脚本入口。
- 顶层目录说明：顶级目录的职责和默认处理方式。
- 全局生成物和危险区：锁文件、生成目录、构建产物、迁移文件、外部同步目录等。

根层不要写：

- 每个项目的详细技术栈。
- 过时或未验证的目录地图。
- 强制全仓库检查的高成本默认动作。
- 项目特有命令、路由、接口、生成物。
- 未经验证的技术栈、端口、服务依赖或发布流程。

## 项目层应该写什么

项目层只写该项目特有事实。默认章节如下；按项目类型保留有用章节，不写空章节：

```markdown
# 项目名

## 技术栈与架构入口

## 关键模块

## 依赖关系

## 项目命令

## 生成物

## 验证方式
```

前端项目额外添加：

```markdown
## 路由
```

后端项目额外添加：

```markdown
## 路由/接口
```

## 关键模块怎么写

关键模块应回答两个问题：Agent 改代码前必须先看哪里，哪些边界不能绕过。

优先写这些内容：

- 入口模块：应用启动入口、路由注册入口、插件主入口、CLI 入口。
- 契约模块：RPC schema、proto、package exports、extension manifest、shared types。
- 调用链边界：前端 route/page -> api/hooks；后端 route -> service -> repository/db。
- 状态与缓存：TanStack Query hooks、Zustand store、服务端缓存、数据源封装。
- 配置模块：env schema、runtime config、Docusaurus config、extension permission。
- 外部依赖封装：HTTP/RPC client、数据库 client、第三方数据源 parser。
- 测试锚点：对应的 `*.test.ts`、`tests/`、`e2e/`。
- 禁止绕过的模块：例如前端只依赖公开 client/schema，不直接 import 后端内部 app；调用方只依赖 package exports，不穿透 `src/internal`。

不要把 `AGENTS.md` 写成完整目录树。每个项目通常只保留 5-10 个真正影响修改路径的模块。

## 前端路由章节

前端【路由】必须写真实路由，而不是抽象描述：

- 路由入口文件。
- 当前已有路径。
- 每个路径对应的页面组件或 lazy route。
- 根布局和 `Outlet` 在哪里。
- 文档站写页面目录、docs 目录、sidebar/nav 配置和插件路由关系，不套 SPA 路由模板。

## 后端接口章节

后端【接口】必须写公开契约：

- HTTP/RPC 路径。
- 对其他项目导出的 RPC/type/schema/client 入口。
- proto service 和 method。
- 健康检查或文档路由。
- 请求/响应 schema 的源头。

不要把内部 service 函数误写成对外接口，除非它通过路由、RPC、exports 或 proto 对外暴露。

## 依赖关系章节

- 依赖的其他服务。
- 同仓库或 workspace 内其他应用、包、服务、模板或插件。
- 类型依赖，例如 `tsconfig references`。
- 生成依赖，例如 API client 由 proto/openapi/schema 生成。
- 构建依赖，例如 package exports、link workspace、path dependency、Make target、Docker compose service。
- 运行时依赖，例如数据库、缓存、外部 API、浏览器扩展权限、本地文件。

依赖关系必须从 manifest、配置、实际 import、公开 client、schema、生成配置或运行脚本确认，不要凭目录名猜。

## 生成物与验证

常见生成物默认只读：

- `dist/`
- `build/`
- `gen/`
- `src/api/gen/`
- `.docusaurus/`
- lockfile，例如 `pnpm-lock.yaml`、`package-lock.json`、`yarn.lock`、`Cargo.lock`、`poetry.lock`
- `*.tsbuildinfo`
- framework/cache 输出，例如 `.next/`、`.nuxt/`、`.turbo/`、`coverage/`

维护 Agent 规则文件后至少运行：

```powershell
rg --files -g 'AGENTS.md' -g 'AGENT.md' -g 'CLAUDE.md'
git diff --check
```

如果任务只改 Agent Markdown 规则，不默认运行项目构建、测试或全仓库检查。只有当规则修改伴随代码、配置、脚本、导航、生成物或 package metadata 变化时，才按影响面运行工程验证。

工程验证命令必须来自仓库事实，例如：

- Node 项目：`package.json#scripts`、workspace 配置或仓库指定工具。
- Go 项目：`go test ./...`、`go test ./cmd/...` 或项目 README 指定命令。
- Python 项目：`pyproject.toml`、`tox.ini`、`pytest.ini`、Makefile 或 README 指定命令。
- Rust 项目：`cargo test`、`cargo check` 或 workspace 指定命令。
- 文档站：构建、链接检查或站点生成命令。

## 编辑原则

- 使用 `apply_patch` 编辑仓库文件。
- 保留用户已有无关改动，不做清理式重写。
- 不要为了“统一风格”大改无关项目层内容。
- 新增规则前先验证项目事实，过期规则要删除或改成当前事实。
- 规则要短、具体、可执行；避免空泛价值观和重复父层规则。
- 不要把一个仓库的工具链、目录名、端口、命名习惯移植到另一个仓库。
- 如果用户已经手动修改了 `AGENTS.md` 或 skill 内容，先读取并围绕现有文本做增量修改，不覆盖用户意图。

## 完成标准

一次 `AGENTS.md` 维护任务完成时，应能证明：

- 文件命名符合用户决策或仓库已确认规则；只有明确决定统一时，才要求全部使用 `AGENTS.md`。
- 根层只含全局规则，项目层只含项目事实。
- 层级设计来自用户决策或仓库事实，而不是默认套模板。
- `rg --files -g 'AGENTS.md' -g 'AGENT.md' -g 'CLAUDE.md'` 输出符合预期。
- `git diff --check` 通过。
