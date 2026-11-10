---
id: d549cac1-258c-4b5d-a65a-8dd5842b63c2
---

# Fallow 分析与配置

## 死代码分析如何理解项目？

- 起点: 从 `package.json`、项目脚本、基础设施文件和框架插件推导入口;
- 过程: 发现文件 → 解析 AST → 解析 import → 构建模块图;
- 遍历: 从入口沿模块图算可达性;
- 追踪能力: 多级 `export *`、动态 import glob、命名空间成员;
- 也覆盖: 类继承与部分装饰器语义;
- 产出: 未使用文件、导出、类型、枚举与类成员、依赖;
- 附带报告: 无法解析的 import、未声明依赖、循环与边界违规;
- 生产模式: `--production` 排除测试、story、mock 与开发脚本;
- 生产模式还报告: 应移到 `devDependencies` 的纯类型依赖;

## 重复、相似与健康度有什么不同？

- `dupes`: 用 token 序列找 clone;
- 模式: `strict`、`mild`、`weak`、`semantic`;
- 选项: near-miss、跨语言、最小 token/行数/出现次数与基准;
- `similar-code`: 用本地固定模型找意图相似的函数;
- 输出性质: 只是候选, 必须审查后单独记录 verdict;
- `health`: 综合复杂度、维护性指数、fan-in 与 fan-out;
- 还看: 死代码比、Git churn、热点、测试覆盖与重构优先级;

## 默认支持哪些文件与框架？

- 文件: JS/TS 之外自动读取 HTML、Vue、Svelte、Astro;
- 也读: MDX、GraphQL、CSS Modules、SCSS 与 React Native 约定;
- 样式: 追踪 SCSS `@use` / `@forward` / `@import` 与 CSS Module 类;
- Tailwind: 追踪 v3/v4 依赖与 `@theme` 令牌消费者;
- 框架: 内置插件依据依赖与配置自动激活;
- 查看: `fallow list --plugins` 列出实际激活项;
- React/Next.js: 查 Server Components 指令与 App Router 路由冲突;
- 还查: Server Action 可达性、组件 fan-in 与可选 props 规则;
- 内部框架: 用 JSONC、JSON 或 TOML 自定义插件;
- 声明内容: 检测条件、入口、配置文件、已使用导出与类成员;
- 还要声明: manifest 入口;

## 如何配置项目策略？

- 首选: `.fallowrc.json` → `.fallowrc.jsonc`;
- 其次: `fallow.toml` → `.fallow.toml`;
- 选取: 同目录按此优先级取首个;
- monorepo: 自动识别 npm/Yarn/pnpm/Deno workspace, 解析跨包 import;
- 收窄范围: `--workspace`、`--changed-workspaces` 或包内配置;

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

- 预设: `bulletproof`、`layered`、`hexagonal`、`feature-sliced`;
- 用途: 用预设快速建立分层;
- zone: 由 glob 匹配, 首个命中者生效;
- 豁免: 同 zone 之间的 import 永远允许;
- 例外: 未命中 zone 的文件不受限;
- rule: `from` 声明该 zone 允许 import 的 zone;
- 空 `allow`: 表示完全隔离;
- 核对: `fallow list --boundaries` 先看分区与规则;
- 之后: 再打开边界违规门禁;
