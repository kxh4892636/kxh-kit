---
id: d549cac1-258c-4b5d-a65a-8dd5842b63c2
---

# Fallow 分析与配置

## 死代码分析如何理解项目？

- 起点: 从 `package.json`、项目脚本、基础设施文件和框架插件推导入口;
- 过程: 发现文件 → 解析 AST → 解析 import → 构建模块图 → 从入口遍历可达性;
- 能追踪多级 `export *`、常见动态 import glob、命名空间成员、类继承和部分装饰器语义;
- 产出: 未使用文件、导出、类型、枚举/类成员、依赖，以及无法解析 import、未声明依赖、循环和边界违规;
- 生产模式: `--production` 排除测试、story、mock 和大部分开发脚本，并报告应移至 `devDependencies` 的纯类型依赖;

## 重复、相似与健康度有什么不同？

- `dupes`: 用 token 序列找 clone；支持 `strict` / `mild` / `weak` / `semantic`、near-miss、跨语言、最小 token/行数/出现次数和基准;
- `similar-code`: 用本地固定模型找“意图相似”函数；输出是候选，必须审查后单独记录 verdict;
- `health`: 结合函数复杂度、维护性指数、fan-in/fan-out、死代码比、Git churn、热点、测试覆盖与重构优先级;

## 默认支持哪些文件与框架？

- 文件: JS/TS 之外，自动读取 HTML、Vue、Svelte、Astro、MDX、GraphQL、CSS Modules、SCSS 和 React Native 相关约定;
- 样式: 追踪 SCSS `@use` / `@forward` / `@import`、CSS Module 类、Tailwind v3/v4 依赖与 `@theme` 令牌消费者;
- 框架: 内置插件依据依赖和配置自动激活；`fallow list --plugins` 查看实际激活项;
- React/Next.js: 检查 Server Components 指令、App Router 路由冲突、Server Action 可达性、组件 fan-in 与可选 props 规则;
- 内部框架: 可用 JSONC、JSON 或 TOML 自定义插件，声明检测条件、入口、配置文件、已使用导出/类成员和 manifest 入口;

## 如何配置项目策略？

- 文件: `.fallowrc.json` → `.fallowrc.jsonc` → `fallow.toml` → `.fallow.toml`，同目录按此优先级取首个;
- monorepo: 自动识别 npm/Yarn/pnpm/Deno workspace，解析跨包 import；用 `--workspace`、`--changed-workspaces` 或包内配置收窄范围;

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
  "entry": ["src/workers/*.ts"],
  "ignorePatterns": ["**/*.generated.ts"],
  "publicPackages": ["@myorg/sdk"],
  "rules": { "unresolved-imports": "error", "unused-exports": "warn" },
  "duplicates": { "mode": "mild", "threshold": 5 },
  "health": { "maxCyclomatic": 20, "maxCognitive": 15 },
  "audit": { "gate": "new-only" },
  "boundaries": { "preset": "bulletproof" },
}
```

## 架构边界如何生效？

- 预设: 用 `bulletproof`、`layered`、`hexagonal`、`feature-sliced` 快速建立分层;
- 自定义: zone 由 glob 匹配，首个命中者生效；同 zone import 永远允许；未命中 zone 的文件不受限;
- rule: `from` 声明某 zone 可以 import 的 zone；空 `allow` 表示隔离;
- 核对: `fallow list --boundaries` 先查看分区和规则，再打开边界违规门禁;
