---
id: 44bdff8b-4ce7-4a93-a071-b25646d5b2b7
---

# Monorepo 配置

## 为什么 TypeScript monorepo 需要分层配置？

- 用根入口组织项目，用共享基线复用环境无关规则;
- 叶项目声明运行环境，避免不同环境的类型相互污染;

## 每项配置应放在根入口、共享基线还是叶项目？

- solution 配置: 不直接检查源码，通常用 `files: []` 加 `references` 汇总下级项目;
- shared baseline: 通过 `extends` 被继承的共享基线，仅保存跨项目成立的严格性与一致性规则;
- 叶项目: 真正包含源码的配置，决定运行环境、源码范围与缓存位置;

| 层级            | 负责                                          | 不负责                             |
| --------------- | --------------------------------------------- | ---------------------------------- |
| 根 solution     | 汇总 project references, 给工具提供项目图入口 | runtime 语义, 源码集合, 路径别名   |
| shared baseline | 共享严格性, 一致性与诊断规则                  | `target`, `module`, `lib`, `types` |
| 叶项目          | 声明 runtime, bundler, 源码和缓存边界         | 与项目无关的全仓约定               |

## project references 如何组织跨项目检查与构建？

| 配置         | 作用                                                                   | 不会做什么                                            |
| ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `references` | 在 `tsconfig` 顶层声明项目依赖边, 供 `tsc -b` 发现, 排序与增量处理项目 | 不继承被引用项目的 `compilerOptions` 或自动纳入其源码 |
| `composite`  | 使项目可被 reference, 并要求源文件完整列入 `files` 或 `include`        | 不声明项目之间的依赖, 也不决定是否输出文件            |

## 如何根据最终运行方式选择模块解析体系？

- runtime: JavaScript 最终运行的环境，例如浏览器或 Node.js;
- module resolution: 编译器根据 `import` 路径寻找目标文件或代码包的规则;

| 项目类别     | `module` / `moduleResolution` | 适用边界                                     |
| ------------ | ----------------------------- | -------------------------------------------- |
| bundler 应用 | `ESNext` / `Bundler`          | 由 Vite, Docusaurus 等工具解析并打包模块     |
| Node ESM 包  | `NodeNext` / `NodeNext`       | 需要按 Node.js ESM/CJS 与 `exports` 规则校验 |

## 叶项目如何明确源码、全局类型和缓存边界？

- `target` / `lib`: 按运行环境支持范围锁定, 不依赖编译器默认值;
- `types`: 仅列出项目允许的 ambient type packages, 防止依赖偶然注入 globals;
  - ambient types: 不需要在当前文件中 `import` 就会进入全局作用域的类型声明，例如某些测试框架提供的全局 API;
- 源码边界: `include` 或 `files` 选择根输入，`exclude` 调整 include 匹配；`rootDir` 约束输出目录布局，不负责过滤输入，已被 import 的文件仍可能进入项目;
- `paths`: 不设 `baseUrl` 时, 相对路径以当前 `tsconfig` 所在目录为基准;
- `allowJs`: 源码已全部 TypeScript 化时显式关闭;

## 类型检查与发布声明生成如何分工？

- `isolatedModules`: 使每个文件都能被外部 transpiler 独立处理;
- `isolatedDeclarations`: 仅在声明生成链路确有需求时启用, 不为满足规则引入低收益注解;
- `noEmit`: 保留完整类型检查, 禁止输出 JavaScript, `.d.ts` 和 source map
- `declaration`: 生成类型声明文件, `noEmit: true` 时, 该选项无效;
