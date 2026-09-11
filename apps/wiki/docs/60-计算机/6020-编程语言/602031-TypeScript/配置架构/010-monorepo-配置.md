---
id: 44bdff8b-4ce7-4a93-a071-b25646d5b2b7
---

# Monorepo 配置

## 为什么 TypeScript monorepo 需要分层配置？

- Monorepo: 在一个仓库中维护多个应用或代码包，共享开发流程，但各自可能运行在浏览器、Node.js 或打包器环境;
- tsconfig.json: 决定 TypeScript 检查哪些源码、使用哪些语言和模块规则的配置文件;
- 分层目的: 用根入口组织项目，用共享基线复用环境无关规则，用实际包含源码的叶项目声明运行环境，避免不同环境的类型相互污染;

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
| `noEmit`     | 保留完整类型检查, 禁止输出 JavaScript, `.d.ts` 和 source map           | 不禁用 project references, 也不等于跳过项目检查       |

- 项目引用: `references` 显式声明项目依赖边，不能替代 `extends` 的配置继承；`composite` 施加项目可引用所需的完整输入与声明输出约束;
- 独立项目检查: 没有互相消费声明的叶项目可由根 solution 聚合检查，配合 `composite`、`noEmit` 管理增量信息；不要据此推断任意跨项目依赖都允许禁用输出;
- 跨项目依赖: 标准 project reference 模式依赖被引用项目的声明输出；被其他源码项目引用的构建配置不能简单设为 `noEmit`，应提供可输出声明的构建配置，或另行设计独立检查图;
- 命令边界: `tsc -p` 只编译当前项目, `tsc -b` 才会沿 `references` 遍历并编排项目;

- 依据: [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html);

## 如何根据最终运行方式选择模块解析体系？

- runtime: JavaScript 最终运行的环境，例如浏览器或 Node.js;
- module resolution: 编译器根据 `import` 路径寻找目标文件或代码包的规则;

| 项目类别     | `module` / `moduleResolution` | 适用边界                                     |
| ------------ | ----------------------------- | -------------------------------------------- |
| bundler 应用 | `ESNext` / `Bundler`          | 由 Vite, Docusaurus 等工具解析并打包模块     |
| Node ESM 包  | `NodeNext` / `NodeNext`       | 需要按 Node.js ESM/CJS 与 `exports` 规则校验 |

## 叶项目如何明确源码、全局类型和缓存边界？

- ambient types: 不需要在当前文件中 `import` 就会进入全局作用域的类型声明，例如某些测试框架提供的全局 API;
- `target` / `lib`: 按运行环境支持范围锁定, 不依赖编译器默认值;
- `types`: 仅列出项目允许的 ambient type packages, 防止依赖偶然注入 globals;
- 源码边界: `include` 或 `files` 选择根输入，`exclude` 调整 include 匹配；`rootDir` 约束输出目录布局，不负责过滤输入，已被 import 的文件仍可能进入项目;
- `paths`: 不设 `baseUrl` 时, 相对路径以当前 `tsconfig` 所在目录为基准;
- `tsBuildInfoFile`: 指向已忽略的缓存目录, 避免污染工作树;
- `allowJs`: 源码已全部 TypeScript 化时显式关闭;

- 测试 API: 显式 import 测试函数，让调用来源局部可见，不依赖测试框架偷偷注入 globals;

## 类型检查与发布声明生成如何分工？

- `isolatedModules`: 使每个文件都能被外部 transpiler 独立处理;
- `isolatedDeclarations`: 仅在声明生成链路确有需求时启用, 不为满足规则引入低收益注解;
- 发布包: 类型检查与产物生成分离; `noEmit: true` 时, 即使设置 `declaration` 也不会由 `tsc` 写出 `.d.ts`;
- 声明验证: 发布包的 `.d.ts` 正确性由真实 pack/build 命令验证;

- 配置依据: [TSConfig Reference](https://www.typescriptlang.org/tsconfig/)，发布验证应检查真实打包产物，而不只看源码检查是否通过;
