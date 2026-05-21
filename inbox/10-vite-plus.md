---
id: 8ab3ae09-612b-4fd0-985a-179c450331ed
---

# Vite+

## 概念

### 定义

- Vite+: Web 工程统一工具链, 用一个入口管理运行时、包管理器、开发服务器、构建、测试、检查、格式化、打包和任务编排;
- `vp`: Vite+ 的全局 CLI, 负责创建项目、安装依赖、运行命令、管理 Node.js、执行任务和升级工具链;
- `vite-plus`: 项目内本地依赖, 提供 Vite+ 配置、命令实现和工具集成能力;
- 核心目标: 把分散在 Node、pnpm/yarn/npm/bun、Vite、Vitest、Oxlint、Oxfmt、tsdown、task runner、git hook、CI 中的工程操作收束为统一模型;

### 两层模型

| 层级          | 角色     | 作用                                      |
| ------------- | -------- | ----------------------------------------- |
| 全局层 `vp`   | 入口工具 | 管理命令入口、Node.js 环境、包管理器代理  |
| 项目层 Vite+  | 本地能力 | 读取 `vite.config.ts`, 执行项目内工具行为 |

- 全局层: 解决“开发者机器上怎么运行”的问题;
- 项目层: 解决“当前项目用什么规则运行”的问题;
- 分层收益: 全局入口稳定, 项目规则随仓库版本化;

## 为什么使用

### 工具链碎片化

- 传统前端项目: 常同时维护 `vite.config.ts`、`vitest.config.ts`、ESLint 配置、Prettier 配置、tsdown 配置、lint-staged 配置、package manager 配置和 CI 缓存配置;
- 认知成本: 开发者需要知道每个工具的入口、配置文件、命令差异和版本兼容边界;
- 迁移成本: 工具替换或升级时, 命令、配置、IDE、CI、hook 往往要分别改造;
- 协作成本: 同一个动作在本地、CI、编辑器、git hook 中可能走不同工具链, 容易出现结果不一致;

### Vite+ 的抽象

- 统一入口: 常用操作先问 `vp`, 再由 Vite+ 分发给底层工具;
- 统一配置: 尽量把工程规则放进 `vite.config.ts`, 减少多配置文件漂移;
- 统一环境: Node.js 版本、包管理器、依赖安装由 `vp` 协调;
- 统一校验: `vp check` 聚合 format、lint、type-check, 形成默认质量门禁;
- 统一任务: `vp run` 把 package scripts、配置任务、workspace 依赖图和缓存放进同一执行模型;

### 适用场景

- 新项目: 需要从一开始统一开发、测试、构建、检查、CI 和 hook 入口;
- 旧项目迁移: 希望从 ESLint/Prettier/Vitest/Vite/tsdown 等分散配置迁移到单一配置面;
- Monorepo: 需要按依赖顺序递归执行任务、筛选 workspace package、缓存重复任务结果;
- 团队协作: 需要让本地、编辑器、提交前检查、CI 尽量共享同一套规则;
- 工具链治理: 需要降低脚本膨胀、配置漂移和包管理器差异带来的维护成本;

## 设计理念

### 一入口

- 命令心智: `vp <action>` 是开发者面对工程系统的主要入口;
- 内置命令: `vp dev`、`vp build`、`vp test`、`vp check` 等代表稳定语义, 不被 `package.json` 脚本覆盖;
- 脚本命令: `vp run <script>` 专门执行 `package.json` 脚本或 Vite+ 任务;
- 语义边界: `vp build` 表示 Vite+ 内置构建, `vp run build` 表示项目自定义 build 脚本;

### 一配置

- 配置中心: `vite.config.ts` 同时承载 Vite 原生配置和 Vite+ 扩展配置;
- 标准块: `server`、`build`、`preview` 保留 Vite 语义;
- 扩展块: `test`、`lint`、`fmt`、`run`、`pack`、`staged` 承载 Vite+ 统一能力;
- 配置原则: 优先使用静态 `defineConfig({...})`, 便于 CLI、lint、fmt、IDE 插件读取;
- 反模式: 为 Vitest、Oxlint、Oxfmt、tsdown、lint-staged 分别保留独立配置文件;

```typescript
import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {},
  build: {},
  preview: {},
  test: {},
  lint: {},
  fmt: {},
  run: {},
  pack: {},
  staged: {},
});
```

### 一套质量门禁

- `vp fmt`: 使用 Oxfmt 执行格式化;
- `vp lint`: 使用 Oxlint 执行静态检查;
- `vp check`: 聚合格式化、lint 和类型检查, 作为默认验证入口;
- Type-aware lint: 通过 `lint.options.typeAware` 开启依赖类型信息的规则;
- Type check: 通过 `lint.options.typeCheck` 把 TypeScript 类型检查纳入 `vp check`;

```typescript
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
```

### 一张任务图

- `vp run`: 把脚本、任务依赖、workspace package、缓存和并发统一为任务图;
- `dependsOn`: 显式描述任务之间的前置关系;
- Workspace 执行: 支持递归、传递依赖、过滤 package、指定 root 执行;
- 缓存模型: 任务成功后记录输出, 下次根据参数、环境变量和输入文件判断是否复用;
- 设计取向: 任务执行关注依赖图和输入输出, 而不是简单按脚本字符串顺序重复运行;

```typescript
import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "vp build",
        dependsOn: ["lint"],
        env: ["NODE_ENV"],
      },
    },
  },
});
```

## 功能地图

### 生命周期

| 阶段     | 命令                    | 作用                         |
| -------- | ----------------------- | ---------------------------- |
| 创建     | `vp create`             | 创建应用、库、生成器或模板项目 |
| 迁移     | `vp migrate`            | 把旧工具链迁移到 Vite+       |
| 安装     | `vp install`            | 按项目包管理器安装依赖       |
| 开发     | `vp dev`                | 启动 Vite dev server         |
| 检查     | `vp check`              | 格式化、lint、类型检查       |
| 测试     | `vp test`               | 运行 Vitest                  |
| 构建     | `vp build`              | 运行 Vite/Rolldown 应用构建  |
| 打包     | `vp pack`               | 使用 tsdown 构建库或可执行文件 |
| 预览     | `vp preview`            | 预览生产构建产物             |
| 执行任务 | `vp run` / `vpr`        | 执行 scripts 或配置任务      |
| 环境     | `vp env`                | 管理 Node.js 版本和 shim     |
| 升级     | `vp upgrade`            | 升级全局 `vp`                |
| 移除     | `vp implode`            | 移除 Vite+ 本机数据          |

### 底层工具集成

| 能力       | 底层工具             | Vite+ 入口       |
| ---------- | -------------------- | ---------------- |
| 开发服务器 | Vite                 | `vp dev`         |
| 应用构建   | Vite + Rolldown      | `vp build`       |
| 单元测试   | Vitest               | `vp test`        |
| Lint       | Oxlint               | `vp lint`        |
| Format     | Oxfmt                | `vp fmt`         |
| 综合检查   | Oxfmt + Oxlint + TS  | `vp check`       |
| 库打包     | tsdown               | `vp pack`        |
| 任务编排   | Vite Task            | `vp run` / `vpr` |
| Git hook   | Vite+ staged config  | `vp staged`      |

## 核心机制

### 包管理器检测

- 检测顺序: 优先读取 `packageManager`, 再看 workspace 文件、lockfile 和包管理器配置;
- 默认行为: 未发现明确线索时回退到 pnpm;
- 操作入口: `vp install`、`vp add`、`vp remove`、`vp update` 等命令代理到底层包管理器;
- 原生命令: 需要包管理器专属能力时, 使用 `vp pm <command>` 转发;

### Node.js 环境管理

- Managed mode: 默认由 Vite+ shim 管理 `node`、`npm` 等入口;
- 全局版本: `vp env default <version>` 设置默认 Node.js;
- 项目版本: `vp env pin <version>` 写入 `.node-version`;
- 临时版本: `vp env use <version>` 只影响当前 shell;
- 诊断入口: `vp env current`、`vp env which <tool>`、`vp env doctor`;

### 测试入口

- `vp test`: 运行内置 Vitest 命令, 默认不进入 watch;
- Watch 模式: 使用 `vp test watch`;
- 测试导入: 测试工具从 `vite-plus/test` 导入, 不直接从 `vitest` 导入;
- 浏览器测试上下文: 从 `vite-plus/test/browser/context` 导入;

```typescript
import { describe, expect, it, vi } from "vite-plus/test";
```

### Staged 检查

- `staged` 配置: 用 `vite.config.ts` 替代 `lint-staged` 配置;
- `vp config`: 为当前项目安装 Vite+ Git hooks;
- `vp staged`: 对暂存文件执行规则;
- 常见规则: 对 JS/TS/Vue/Svelte 文件执行 `vp check --fix`;

```typescript
import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,ts,tsx,vue,svelte}": "vp check --fix",
  },
});
```

### CI 集成

- GitHub Actions: 使用 `voidzero-dev/setup-vp`;
- CI 简化: 一个 step 同时处理 Vite+、Node.js、包管理器和依赖缓存;
- 常规流程: `vp install` → `vp check` → `vp test` → `vp build`;
- 设计收益: CI 和本地复用同一命令语义, 减少环境搭建脚本;

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    node-version: "22"
    cache: true
- run: vp install
- run: vp check
- run: vp test
- run: vp build
```

## 常用命令

```bash
vp help                      # 查看命令帮助;
vp create                    # 交互式创建项目;
vp migrate                   # 迁移当前项目到 Vite+;
vp install                   # 安装依赖;
vp dev                       # 启动开发服务器;
vp check --fix               # 格式化并自动修复可修复问题;
vp test                      # 运行测试;
vp test watch                # 测试 watch 模式;
vp build                     # 应用生产构建;
vp pack                      # 库或 CLI 打包;
vp run build                 # 执行 package.json 或 run.tasks 中的 build;
vp run -r build              # 在 workspace 中递归执行 build;
vp run --filter @my/app test # 筛选 package 执行任务;
vp env current               # 查看当前 Node.js 环境;
vp env pin lts               # 将项目 Node.js 固定为 LTS;
vp staged                    # 对暂存文件运行检查;
vp upgrade                   # 升级全局 vp;
```

## 使用边界

### Built-in vs Script

| 命令           | 含义                     |
| -------------- | ------------------------ |
| `vp build`     | Vite+ 内置应用构建       |
| `vp run build` | 项目 `build` 脚本或任务  |
| `vp test`      | Vite+ 内置 Vitest 测试   |
| `vp run test`  | 项目 `test` 脚本或任务   |

- 内置命令不可被覆盖;
- 自定义流程放到 `package.json` scripts 或 `run.tasks`;
- 需要执行自定义脚本时显式使用 `vp run`;

### 配置读取限制

- 推荐写法: 静态 `defineConfig({...})`;
- 风险写法: `defineConfig((env) => ({...}))`、async config、依赖复杂运行时加载的 config;
- 原因: `vp lint`、`vp fmt` 和 Oxc IDE 集成需要直接读取配置;
- 临时兜底: 极端情况下可短期保留独立 Oxlint/Oxfmt 配置, 但不应作为默认设计;

### 当前状态

- 版本阶段: Vite+ 仍处于 alpha, 命令和行为可能频繁变化;
- 迁移前提: 迁移旧项目时建议先升级到 Vite 8+ 和 Vitest 4.1+;
- 排障信息: 反馈问题时保留 `vp env current`、`vp --version`、包管理器、复现步骤和 `vite.config.ts`;

## 学习路径

### 第一层: 心智模型

- 先记住三句话: `vp` 是入口, `vite.config.ts` 是配置中心, `vp check` 是默认质量门禁;
- 再区分两类命令: 内置命令走 Vite+ 语义, `vp run` 走项目脚本和任务图;
- 最后理解两类状态: 全局环境状态由 `vp env` 管, 项目规则状态由仓库配置管;

### 第二层: 常用能力

- 开发闭环: `vp install` → `vp dev` → `vp check --fix` → `vp test` → `vp build`;
- 配置闭环: 把 test、lint、fmt、run、pack、staged 规则集中到 `vite.config.ts`;
- 协作闭环: 编辑器、git hook、CI 都调用 Vite+ 命令, 减少规则分叉;

### 第三层: 工程治理

- Monorepo: 学习 `vp run -r`、`vp run -t`、`--filter`、cross-package `dependsOn`;
- 缓存: 理解 task input、env、untrackedEnv 和缓存失效条件;
- 迁移: 用 `vp migrate` 自动收束配置, 再人工确认 imports、依赖和剩余脚本;
