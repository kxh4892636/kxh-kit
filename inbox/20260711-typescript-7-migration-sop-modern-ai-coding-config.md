---
id: 27763c86-fcaa-46c7-9849-d667c00b1061
---

# TypeScript 7 迁移 SOP、现代化配置与 AI Coding 配置

## 目标与边界

### 迁移目标

- 所有 TypeScript 项目的正常 `tsc` 命令统一解析到 TypeScript 7；
- 根配置只描述项目依赖图，不把整个 monorepo 当成一个程序；
- 公共配置只承载跨项目安全约束，运行时语义留在叶项目；
- 通过严格、显式、低歧义的配置缩短 AI coding 的“修改—诊断—修正”反馈环；
- 保留 Vite、Docusaurus、Node ESM、发布包各自真实的构建边界；

### 不做范围

- 不顺带升级 Vite+、Vite、Vitest、Docusaurus、React 等无关依赖；
- 不为通过类型检查而改变业务行为、接口契约或 UI；
- 不把文档示例、生成物、构建产物纳入应用项目；
- 不手工修改 lockfile；
- 不因第三方声明文件错误而降低仓库源码的严格度；

## TypeScript 7 迁移要点

### 关键变化

| 变化                                          | 迁移影响                                         | 配置策略                                                            |
| --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| 编译器改为原生实现                            | `tsc` 更快，但工具链兼容性需要重新验证           | 每个 workspace 实测 `tsc --version`、typecheck、build、pack         |
| 7.0 不提供旧版 JavaScript Compiler API        | 直接 `import "typescript"` 的打包工具可能失败    | 默认只用 TS7；仅在真实失败后并行保留 TS6 API 包                     |
| 多个 compiler option 默认值改变               | 依赖隐式默认值会让升级改变语义                   | 显式设置 `target`、`module`、`moduleResolution`、`types`、`rootDir` |
| 旧 module resolution 模式和部分遗留选项被移除 | `node`、`node10`、`classic` 等旧配置不能直接沿用 | bundler 应用使用 `Bundler`；Node ESM 包使用 `NodeNext`              |
| `baseUrl` 被移除                              | 旧式别名配置会失败                               | 使用不依赖 `baseUrl` 的 `paths`，路径相对项目配置文件               |
| `types` 默认行为收紧                          | 隐式全局类型不再可靠                             | 每个项目显式 allowlist ambient types                                |

### 版本与兼容层

本仓库采用双别名策略：TypeScript 7 提供编译器二进制，TypeScript 6 仅保留旧 Compiler API。所有项目仍由 TypeScript 7 编译。

```yaml
catalog:
  # TypeScript 7 提供 tsc；
  "@typescript/native": npm:typescript@~7.0.2

  # 仅供仍然 import "typescript" 的旧工具读取 Compiler API；
  typescript: npm:@typescript/typescript6@~6.0.2
```

兼容层的启用条件必须同时满足：

- 正常安装、打包或框架命令已经复现 Compiler API 兼容错误；
- 同一个失败命令在加入兼容层后恢复；
- 根目录与所有 TypeScript workspace 的 `tsc --version` 仍然输出 7.x；
- 依赖声明旁记录兼容原因，便于后续删除；

本次迁移的触发证据是插件 `prepare → vp pack` 在首次 `vp install` 中报错：`Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`。加入官方并行别名后，重跑同一个 `vp install` 成功，5/5 个编译器入口仍输出 `Version 7.0.2`。

## 配置架构

### 三层模型

| 层级            | 责任                                               | 禁止承载                            |
| --------------- | -------------------------------------------------- | ----------------------------------- |
| 根 solution     | 声明 project references，提供全仓静态检查入口      | 运行时、源码 include、路径别名      |
| shared baseline | 跨项目通用安全规则和 AI coding 反馈规则            | target、module、lib、types、rootDir |
| leaf project    | 声明实际 runtime、bundler、ambient types、源码边界 | 与项目无关的全仓约定                |

### 根 solution

`files: []` 防止根项目扫描仓库；`references` 是唯一项目图入口。

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "files": [],
  "references": [
    { "path": "./apps/wiki" },
    { "path": "./apps/etf-dashboard" },
    { "path": "./templates/react-go-template" },
    { "path": "./packages/docusaurus-plugin-link" }
  ]
}
```

### Shared baseline

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "kxh-awesome shared strict baseline",
  "compilerOptions": {
    "composite": true,
    "noEmit": true,
    "strict": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "moduleDetection": "force",
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true
  }
}
```

### 叶项目矩阵

| 项目类型                    | target / lib                           | module / resolution     | types                               | source boundary              |
| --------------------------- | -------------------------------------- | ----------------------- | ----------------------------------- | ---------------------------- |
| Vite browser app            | `ES2023` / `ES2023, DOM, DOM.Iterable` | `ESNext` / `Bundler`    | `vite/client`                       | `src`、自身 `vite.config.ts` |
| Docusaurus Wiki             | `ES2022` / `ES2022, DOM`               | `ESNext` / `Bundler`    | `node`、`react`、Docusaurus aliases | site configs、`src`          |
| Node ESM publishable plugin | `ES2022` / `ES2022, DOM`               | `NodeNext` / `NodeNext` | `node`、`react`、Docusaurus aliases | `src`、`tests`、pack config  |

### Vite browser app 模板

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "rootDir": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
```

### Docusaurus Wiki 配置原则

- `target` 固定为框架支持边界内的 `ES2022`，不追随编译器默认值；
- `moduleResolution: "Bundler"` 与 Docusaurus bundler 行为一致；
- `types` 只开放 Node、React 和 Docusaurus 模块别名；
- `include` 只包含 `docusaurus.config.ts`、`sidebars.ts`、`src`；
- executable page 全部使用 TSX 后关闭 `allowJs`；
- 文档文章和示例程序不进入 Wiki 应用 TypeScript project；
- `tsBuildInfoFile` 写入 `.docusaurus` 等已忽略缓存目录；

### Node ESM 发布包配置原则

- `module` 与 `moduleResolution` 同时设为 `NodeNext`，使开发期 import 检查贴近消费者；
- `declaration: true` 表达发布声明意图，最终声明正确性由真实 pack/build 验证；
- 保留 `isolatedModules: true`，不为满足 `isolatedDeclarations` 引入低收益注解；
- `tsBuildInfoFile` 写入 `node_modules/.cache`，避免工作树产生缓存文件；
- 测试 API 必须显式 import，不依赖 Vitest globals；

## AI Coding 优化配置

### 编译器规则与收益

| 配置                                    | 拦截的问题                          | 对 AI coding 的价值                          |
| --------------------------------------- | ----------------------------------- | -------------------------------------------- |
| `strict`                                | 隐式 `any`、不安全 null 等          | 建立最低安全基线，减少“看似可编译”的幻觉代码 |
| `exactOptionalPropertyTypes`            | 把“缺失”和显式 `undefined` 混为一谈 | 强迫 agent 尊重 API 的真实对象形状           |
| `noUncheckedIndexedAccess`              | 数组、map、索引访问默认存在         | 暴露越界和缺 key 假设                        |
| `noPropertyAccessFromIndexSignature`    | 把动态 key 伪装成已声明字段         | 让配置、env、字典访问意图显式                |
| `noImplicitReturns`                     | 分支遗漏 return                     | 快速定位 agent 新增的未覆盖路径              |
| `noFallthroughCasesInSwitch`            | switch 意外贯穿                     | 防止新增 case 改变控制流                     |
| `noImplicitOverride`                    | 子类方法误拼写或意外遮蔽            | 明确继承契约                                 |
| `noUnusedLocals` / `noUnusedParameters` | 残留 import、变量和死代码           | 防止重构残片持续污染上下文                   |
| `noUncheckedSideEffectImports`          | 拼错的 side-effect import           | 让样式、polyfill、注册器导入可验证           |
| `useUnknownInCatchVariables`            | 未校验 error 形状                   | 阻止 agent 假设所有异常都有 `message`        |
| `erasableSyntaxOnly`                    | 需要 TS runtime transform 的语法    | 保持 Vite、Docusaurus、tsdown 的解释一致     |
| `verbatimModuleSyntax`                  | type/value import 边界含糊          | 使 import 意图稳定且便于自动修改             |
| `moduleDetection: "force"`              | script/global 与 module 边界漂移    | 避免新增文件意外污染全局空间                 |
| 显式 `types`                            | 依赖安装后偷偷注入 globals          | 防止 agent 使用项目实际不可用的全局 API      |
| 显式 `rootDir` / `include`              | 类型检查扫描到无关文件              | 缩小诊断噪声和 agent 检索范围                |
| project references                      | 根配置与项目边界混杂                | 提供一个稳定的全仓检查入口和清晰依赖图       |

### `skipLibCheck` 的边界

`skipLibCheck: true` 只跳过第三方 `.d.ts` 内部一致性检查，不跳过仓库代码对第三方 API 的使用检查。本仓库关闭它会暴露 React/MDX、Ant Design、Vite+ 等上游声明问题，因此保留为明确的 ownership boundary；不得用它解释或忽略仓库源码错误。

### Agent 修改规则

- 先识别目标项目的 runtime 和构建工具，再选择配置；
- 只在叶配置声明 runtime 相关选项，不把 browser 或 Node 假设上移到 shared baseline；
- 新依赖需要 ambient globals 时，显式更新该项目的 `types`；
- 新源码目录必须同时核对 `rootDir`、`include` 和 project reference；
- 严格错误优先做行为不变的机械修正，不通过关闭规则消除诊断；
- 若错误需要领域或行为决策，停止实现并请求确认；
- 生成物、第三方声明、文档示例和用户已有改动保持只读；
- 每次修复先重跑最小失败命令，再跑所属项目和根集成门禁；

## 迁移 SOP

### 阶段 0：盘点与基线

1. 记录当前 commit、Node、Vite+、TypeScript 版本和工作树状态；
2. 枚举所有 `tsconfig.json`、TypeScript dependency、typecheck/build/test/pack 脚本；
3. 为每个项目标记 runtime、module system、bundler、ambient types、source boundary；
4. 运行现有门禁，区分迁移前失败与迁移新增失败；
5. 标记生成物、用户未提交改动和范围外内容为只读；

### 阶段 1：无侵入兼容探测

在修改依赖前，用临时 TypeScript 7 编译器探测每个叶项目。命令应显式传入 project，避免误扫根目录。

```powershell
vp dlx -s typescript@7.0.2 --pretty false -p apps/etf-dashboard/tsconfig.json
vp dlx -s typescript@7.0.2 --pretty false -p apps/wiki/tsconfig.json
vp dlx -s typescript@7.0.2 --pretty false -p templates/react-go-template/tsconfig.json
vp dlx -s typescript@7.0.2 --pretty false -p packages/docusaurus-plugin-link/tsconfig.json
```

输出按以下类型归因：

- TypeScript 7 removed/default change；
- 既存源码或 React 类型问题；
- 第三方 `.d.ts` 问题；
- source boundary 误包含；
- 工具直接依赖旧 Compiler API；

### 阶段 2：建立配置骨架

1. 新建 `tsconfig.base.json`，只加入跨项目 safety options；
2. 把根 `tsconfig.json` 改为 `files: []` + `references`；
3. 让每个叶项目 `extends` shared baseline；
4. 在叶项目显式定义 target、lib、module、moduleResolution、types、rootDir、include；
5. 确保 composite build cache 写入已忽略目录；

### 阶段 3：升级依赖

1. 先让正常 TypeScript dependency 指向 7.0 patch line；
2. 通过仓库约定命令执行安装，不直接调用 pnpm；
3. 保存首次真实失败的完整入口、退出码和关键错误；
4. 只有确认旧 Compiler API 消费者后才加入 TS6 alias；
5. 重跑完全相同的失败命令，证明兼容层有效；
6. 验证根与每个 workspace 的 `tsc --version`；

```powershell
vp install
vp exec tsc --version
vp exec -r -- tsc --version
```

### 阶段 4：按依赖纵向迁移

推荐顺序：基础配置 → Vite apps/templates → Wiki → publishable plugin → root integration。

每个项目形成一个完整 tracer bullet：

1. 应用项目专属 tsconfig；
2. 运行该项目 TypeScript 检查；
3. 只修复新严格规则暴露的最小源码范围；
4. 运行该项目 test/build/pack；
5. 记录通过证据后再进入下一个项目；

### 阶段 5：机械源码修正模式

#### Index signature

```typescript
// noPropertyAccessFromIndexSignature；
const apiUrl = import.meta.env["VITE_API_URL"];
```

#### Exact optional property

```typescript
const options = {
  required,
  ...(description === undefined ? {} : { description }),
};
```

#### Null 与 undefined 边界

```typescript
const selectedId = value ?? undefined;
```

#### React 19 JSX type

```typescript
export const Page = (): React.JSX.Element => <main />;
```

#### JavaScript executable page

- 把实际参与构建的 `.js/.jsx` 页面转换为 `.tsx`；
- 删除 React automatic JSX runtime 下无用的默认 React import；
- 不把文章中的 JavaScript 示例批量迁移为 TypeScript；

### 阶段 6：集成验证

```powershell
# lockfile 可重现性；
vp install --frozen-lockfile --ignore-scripts

# 根 solution 覆盖所有 referenced projects；
vp exec tsc -b --pretty false

# 全 workspace 行为门禁；
vp run -r test
vp run -r build

# 仅检查本次修改路径；
vp check --fix <changed-paths>
```

注意命令语义：Wiki 等项目必须运行 package script `vp run build`，不能用含义不同的 `vp build` 替代。仓库已有范围外格式问题时，使用 focused check，不为了“全绿”修改无关文件。

### 阶段 7：审查、提交与回滚

#### 审查

- Standards：配置是否符合仓库约定、runtime 和 package 边界；
- Spec：是否所有项目使用 TS7，是否严格规则、构建和兼容层满足目标；
- Diff：是否包含无关依赖升级、生成物、换行归一化或用户改动；
- Evidence：失败—修复—重跑链路是否完整；

#### 提交

- 使用单一、可回退的迁移 commit；
- lockfile 只由安装命令生成；
- 提交前执行 UTF-8、LF、trailing whitespace 和 focused diff 检查；

#### 回滚

优先使用非破坏性的 `git revert <migration-commit>`，不要使用 `git reset --hard`。若只回滚兼容层，先确认所有工具都不再导入旧 `typescript` Compiler API，再移除 TS6 alias，执行冻结安装、版本检查、typecheck、test 和 build。

## 验收矩阵

### 必须通过

| 验收项           | 命令或入口                                      | 成功标准                                       |
| ---------------- | ----------------------------------------------- | ---------------------------------------------- |
| Compiler version | 根与 4 个 workspace 的 `tsc --version`          | 5/5 输出 7.0.2                                 |
| Root solution    | `vp exec tsc -b --pretty false`                 | 四个 references 全部通过                       |
| Vite projects    | 各自 `vp run build`                             | TS check 与 Vite production build 通过         |
| Wiki             | `vp run typecheck`、`vp run build`              | site source 通过，docs examples 不进入 project |
| Plugin           | `vp run test`、`vp run build`                   | 测试通过并生成声明                             |
| Workspace        | `vp run -r test`、`vp run -r build`             | 所有项目通过                                   |
| Reproducibility  | `vp install --frozen-lockfile --ignore-scripts` | lockfile 无漂移                                |

### 本次已验证结果

- TypeScript：根与 4 个 workspace 共 5/5 输出 `Version 7.0.2`；
- 静态检查：根 `tsc -b` 通过；
- 测试：全 workspace 7/7 通过；
- 构建：ETF Dashboard、React/Go template、Wiki、Docusaurus plugin 全部通过；
- 插件：`.d.mts` 声明打包成功；
- 安装：冻结 lockfile 安装通过；
- 既存非阻塞警告：大 chunk、Docusaurus blog 目录缺失、重复路由；

## 故障定位表

### 常见失败

| 症状                                                 | 优先判断                           | 最小处理                                                 |
| ---------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `useCaseSensitiveFileNames` 等 Compiler API 属性缺失 | 工具直接导入 TS7 不存在的旧 API    | 证据触发 TS6 canonical-package alias，TS7 继续提供 `tsc` |
| `baseUrl` 不支持                                     | 沿用遗留 alias 配置                | 删除 `baseUrl`，让 `paths` 相对 tsconfig                 |
| 找不到 `process`、`Buffer`                           | `types` allowlist 缺 Node          | 只在确需 Node 的项目加入 `node`                          |
| browser code 意外可用 Node globals                   | `types` 过宽                       | browser app 仅保留 `vite/client`                         |
| Wiki 出现文章示例依赖错误                            | `include` 扫描 docs                | 收窄到 site config 与 `src`                              |
| React JSX namespace 错误                             | 旧 `JSX.Element` 写法              | 使用 `React.JSX.Element` 或依赖推断                      |
| 第三方 `.d.ts` 大量失败                              | 检查越过 ownership boundary        | 保持 `skipLibCheck: true`，继续检查仓库调用代码          |
| 根 typecheck 扫描全仓                                | 根项目含 runtime/include           | 改为 solution-only 的 `files: []` + references           |
| build 命令表现异常                                   | CLI builtin 与 package script 混淆 | 使用 `vp run build` 执行 package script                  |

## 完成清单

### Configuration

- [ ] 根配置为 solution-only；
- [ ] 所有叶项目继承 shared baseline；
- [ ] runtime 选项只存在于叶项目；
- [ ] 每个项目显式声明 `types`、`rootDir`、`include`；
- [ ] browser、Docusaurus、Node ESM 分别使用正确 module resolution；
- [ ] build info 写入已忽略缓存目录；

### Compatibility

- [ ] 根与所有 workspace 的 `tsc` 都是 TypeScript 7；
- [ ] TS6 alias 有真实失败证据，不是预防性安装；
- [ ] 兼容层旁有删除条件和原因；
- [ ] 无无关依赖升级；

### Verification

- [ ] 冻结安装通过；
- [ ] 根 `tsc -b` 通过；
- [ ] 所有 workspace test/build 通过；
- [ ] 发布包声明生成通过；
- [ ] focused format/lint 通过；
- [ ] 无生成物、范围外内容或用户改动进入 diff；

## 参考资料

### 官方文档

- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)；
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references)；
- [Choosing Compiler Options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options)；

### 仓库证据

- `.scratch/typescript-7-modern-tsconfig/PRD.md`；
- `.scratch/typescript-7-modern-tsconfig/tickets.md`；
- `.scratch/typescript-7-modern-tsconfig/e2e/2026-07-11-typescript-7-toolchain.md`；
