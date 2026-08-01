---
id: 8ab3ae09-612b-4fd0-985a-179c450331ed
---

# Vite+

## 是什么

- Vite+: Web 工程统一工具链, 一个入口管理运行时, 包管理器, 开发, 构建, 测试, 检查, 格式化, 打包和任务编排;
- `vp`: 全局 CLI, 负责创建项目, 安装依赖, 运行命令, 管理 Node.js 和升级工具链;
- `vite-plus`: 项目内本地依赖, 提供 Vite+ 配置和命令实现;
- 核心思路: 把分散在 Node, pnpm/npm, Vite, Vitest, Oxlint, Oxfmt, tsdown, git hook, CI 中的工程操作收束为统一模型;
- 统一入口: `vp <action>`; 统一配置: `vite.config.ts`; 统一门禁: `vp check`; 统一任务: `vp run`;

## 功能与命令

| 功能       | 命令                        | 底层工具            |
| ---------- | --------------------------- | ------------------- |
| 创建项目   | `vp create`                 | -                   |
| 旧项目迁移 | `vp migrate`                | -                   |
| 安装依赖   | `vp install`                | 自动检测包管理器    |
| 开发服务器 | `vp dev`                    | Vite                |
| 应用构建   | `vp build`                  | Vite + Rolldown     |
| 测试       | `vp test`                   | Vitest              |
| Lint       | `vp lint`                   | Oxlint              |
| 格式化     | `vp fmt`                    | Oxfmt               |
| 综合检查   | `vp check`                  | Oxfmt + Oxlint + TS |
| 库打包     | `vp pack`                   | tsdown              |
| 预览产物   | `vp preview`                | Vite                |
| 任务编排   | `vp run` / `vpr`            | Vite Task           |
| Git hook   | `vp staged`                 | staged 配置         |
| Node 环境  | `vp env`                    | 内置 shim           |
| 升级/移除  | `vp upgrade` / `vp implode` | -                   |

- 测试导入: 从 `vite-plus/test` 导入, 不直接从 `vitest` 导入;
- CI 集成: GitHub Actions 使用 `voidzero-dev/setup-vp`, 流程为 `vp install` → `vp check` → `vp test` → `vp build`;

## 配置

- 配置中心: `vite.config.ts` 同时承载 Vite 原生配置和 Vite+ 扩展配置;

| 配置块                         | 语义                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `server` / `build` / `preview` | Vite 原生                                                      |
| `test`                         | Vitest 测试                                                    |
| `lint`                         | Oxlint, `options.typeAware` / `options.typeCheck` 开启类型感知 |
| `fmt`                          | Oxfmt 格式化                                                   |
| `run.tasks`                    | 任务定义, `dependsOn`, 缓存                                    |
| `pack`                         | tsdown 打包                                                    |
| `staged`                       | 替代 lint-staged 的提交前规则                                  |

- 配置原则: 使用静态 `defineConfig({...})`, 避免函数式/async 配置, 便于 CLI 和 IDE 直接读取;
- Node 版本: `vp env default <version>` 全局, `vp env pin <version>` 项目, `vp env use <version>` 临时;

## 使用边界

| 命令           | 含义                    |
| -------------- | ----------------------- |
| `vp build`     | Vite+ 内置应用构建      |
| `vp run build` | 项目 `build` 脚本或任务 |
| `vp test`      | Vite+ 内置 Vitest 测试  |
| `vp run test`  | 项目 `test` 脚本或任务  |

- 内置命令: 语义稳定, 不可被 `package.json` 脚本覆盖;
- 自定义流程: 放到 `package.json` scripts 或 `run.tasks`, 显式用 `vp run` 执行;
- 当前状态: Vite+ 处于 alpha, 命令和行为可能频繁变化;
