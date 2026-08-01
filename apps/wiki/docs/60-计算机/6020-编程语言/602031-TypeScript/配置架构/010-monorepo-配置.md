---
id: 44bdff8b-4ce7-4a93-a071-b25646d5b2b7
---

# Monorepo 配置

## 本质

- 三层模型: TypeScript monorepo 按「根 solution—shared baseline—叶项目」分层;
- 根 solution: 汇总 project references，提供全仓统一入口;
- shared baseline: 承载跨项目都成立的安全约束;
- 叶项目: 定义真实的 runtime、module resolution、ambient types 与源码边界;
- 分层原则: 公共层只上移与运行环境无关的规则，避免 browser、Node 和 bundler 语义互相污染;

## 分层责任

| 层级            | 负责                                          | 不负责                             |
| --------------- | --------------------------------------------- | ---------------------------------- |
| 根 solution     | 汇总 project references，给工具提供项目图入口 | runtime 语义、源码集合、路径别名   |
| shared baseline | 共享严格性、一致性与诊断规则                  | `target`、`module`、`lib`、`types` |
| 叶项目          | 声明 runtime、bundler、源码和缓存边界         | 与项目无关的全仓约定               |

## `references`、`composite` 与 `noEmit`

| 配置         | 作用                                                                   | 不会做什么                                            |
| ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `references` | 在 `tsconfig` 顶层声明项目依赖边，供 `tsc -b` 发现、排序与增量处理项目 | 不继承被引用项目的 `compilerOptions` 或自动纳入其源码 |
| `composite`  | 使项目可被 reference，并要求源文件完整列入 `files` 或 `include`        | 不声明项目之间的依赖，也不决定是否输出文件            |
| `noEmit`     | 保留完整类型检查，禁止输出 JavaScript、`.d.ts` 和 source map           | 不禁用 project references，也不等于跳过项目检查       |

- 协作关系: `references` 定义图，`composite` 使图中节点可被引用，`noEmit` 独立决定该节点是否写出产物;
- 纯检查模式: 根 solution 引用多个独立叶项目，叶项目继承 `composite: true` 与 `noEmit: true`；`tsc -b` 可统一编排检查并更新 `.tsbuildinfo`，但不产出 JS 或声明文件;
- 跨项目依赖: 引用方按标准 project reference 模式消费被引用项目的 `.d.ts`；若被引用项目设置 `noEmit`，必须另有构建工具生成声明，或将类型检查图与发布构建图分开;
- 命令边界: `tsc -p` 只编译当前项目，`tsc -b` 才会沿 `references` 遍历并编排项目;

## 叶项目

### 选择 Module 体系

| 项目类别     | `module` / `moduleResolution` | 适用边界                                     |
| ------------ | ----------------------------- | -------------------------------------------- |
| bundler 应用 | `ESNext` / `Bundler`          | 由 Vite、Docusaurus 等工具解析并打包模块     |
| Node ESM 包  | `NodeNext` / `NodeNext`       | 需要按 Node.js ESM/CJS 与 `exports` 规则校验 |

### 显式配置边界

- `target` / `lib`: 按运行环境支持范围锁定，不依赖编译器默认值;
- `types`: 仅列出项目允许的 ambient type packages，防止依赖偶然注入 globals;
- `rootDir` / `include`: 同时定义源码根与项目输入，排除文档示例、生成物与构建产物;
- `paths`: 不设 `baseUrl` 时，相对路径以当前 `tsconfig` 所在目录为基准;
- `tsBuildInfoFile`: 指向已忽略的缓存目录，避免污染工作树;
- `allowJs`: 源码已全部 TypeScript 化时显式关闭;
- `isolatedModules`: 使每个文件都能被外部 transpiler 独立处理;
- `isolatedDeclarations`: 仅在声明生成链路确有需求时启用，不为满足规则引入低收益注解;
- 发布包: 类型检查与产物生成分离；`noEmit: true` 时，即使设置 `declaration` 也不会由 `tsc` 写出 `.d.ts`;
- 声明验证: 发布包的 `.d.ts` 正确性由真实 pack/build 命令验证;
- 测试 API: 显式 import，不依赖测试框架 globals;
