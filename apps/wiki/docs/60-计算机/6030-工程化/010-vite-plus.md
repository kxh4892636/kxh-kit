---
id: 8ab3ae09-612b-4fd0-985a-179c450331ed
---

# Vite+

Vite+ 解决了什么问题？全局命令 `vp` 与项目依赖 `vite-plus` 如何配合？面对常见开发任务时应该选择哪个命令？新项目和已有项目分别如何开始使用 Vite+？`vite.config.ts` 如何统一配置工具？为什么 `vp build` 与 `vp run build` 不是一回事？测试、提交检查与 CI 如何组成一条质量门禁？采用 Vite+ 前需要理解哪些边界？

## Vite+ 为什么要统一 Web 工具链

- Web 工具链: 开发 Web 项目时使用的一组工具，例如运行 Node.js、安装依赖、启动开发服务器、检查代码、测试和构建;
- 传统问题: 每项工作可能由不同工具负责，命令和配置散落在多个文件中，新成员必须先学会如何拼装整套流程;
- Vite+: 把常用工具放到同一个入口后面，让开发者围绕任务选择命令，而不是先判断应该调用哪个底层工具;
- 统一入口: 日常操作使用 `vp <action>`，例如 `vp test`;
- 统一配置: Vite 与 Vite+ 的主要配置集中在 `vite.config.ts`;
- 统一门禁: `vp check` 组合格式检查、代码检查和可选的 TypeScript 类型检查;
- 统一任务: `vp run` 执行 `package.json` 脚本或 Vite Task 定义的任务，并支持工作区调度与缓存;

| 职责           | Vite+ 使用的工具 | 通俗理解                         |
| -------------- | ---------------- | -------------------------------- |
| 开发与应用构建 | Vite、Rolldown   | 启动开发服务器并生成可部署文件   |
| 测试           | Vitest           | 自动运行测试用例并比较结果       |
| 代码检查       | Oxlint           | 找出可疑、错误或不符合规则的代码 |
| 格式化         | Oxfmt            | 统一缩进、换行等代码外观         |
| 类型检查       | tsgo、tsgolint   | 检查 TypeScript 类型是否互相匹配 |
| 库打包         | tsdown           | 把库源码转换成可发布的文件       |
| 任务编排       | Vite Task        | 按依赖关系执行并缓存多个任务     |

## `vp` 与 `vite-plus` 如何配合

- `vp`: 安装在电脑上的全局命令行入口，负责创建或迁移项目、选择 Node.js 与包管理器，并把命令交给项目工具执行;
- `vite-plus`: 安装在项目中的本地依赖，保存该项目实际使用的 Vite+ 版本，并提供配置类型与工具实现;
- 分工原因: 全局 `vp` 负责找到并启动工具，项目内 `vite-plus` 让团队和 CI 使用同一套项目能力;
- 包管理器: `vp install` 会根据项目声明或锁文件选择 pnpm、npm、Yarn 或 Bun，不需要开发者手动切换安装命令;
- Node.js 作用域: `vp env default <版本>` 设置全局默认版本，`vp env pin <版本>` 固定项目版本，`vp env use <版本>` 只切换当前终端会话;

## 面对开发任务时应该选择哪个命令

| 任务           | 命令                            | 实际作用                                  |
| -------------- | ------------------------------- | ----------------------------------------- |
| 创建项目       | `vp create`                     | 选择模板并生成新项目                      |
| 迁移旧项目     | `vp migrate`                    | 把分散的 Vite、测试、检查等配置迁入 Vite+ |
| 安装依赖       | `vp install`                    | 检测并调用项目使用的包管理器              |
| 启动开发       | `vp dev`                        | 启动 Vite 开发服务器                      |
| 构建应用       | `vp build`                      | 使用 Vite 与 Rolldown 生成生产产物        |
| 预览产物       | `vp preview`                    | 在本地启动服务器查看生产构建              |
| 运行测试       | `vp test`                       | 使用 Vitest 执行测试，默认执行一次后退出  |
| 检查代码       | `vp lint`                       | 使用 Oxlint 查找代码问题                  |
| 格式化代码     | `vp fmt`                        | 使用 Oxfmt 检查或修改代码格式             |
| 综合检查       | `vp check`                      | 一次执行格式、代码和已启用的类型检查      |
| 打包代码库     | `vp pack`                       | 使用 tsdown 生成库或独立程序的发布产物    |
| 执行自定义任务 | `vp run <任务>` 或 `vpr <任务>` | 执行项目脚本或 Vite Task 任务             |
| 检查暂存文件   | `vp staged`                     | 只对准备提交的文件执行配置好的检查        |
| 管理 Node.js   | `vp env`                        | 选择、安装、固定并诊断 Node.js 版本       |
| 升级 Vite+     | `vp upgrade`                    | 升级电脑上的全局 `vp`                     |
| 删除 Vite+     | `vp implode`                    | 删除全局 `vp` 及其管理的数据              |

## 新项目如何跑通最小开发流程

- 创建流程: `vp create` 负责生成项目，随后进入生成的目录执行其余命令;
- 迁移流程: 已有 Vite 项目从项目根目录执行 `vp migrate`，不需要重新创建项目;
- 最小门禁: 安装依赖后依次执行检查、测试和构建，分别证明静态质量、行为与生产产物;

```bash
vp create
cd <生成的项目目录>
vp install
vp dev

vp check
vp test
vp build
vp preview
```

## `vite.config.ts` 如何统一配置工具

- 配置中心: `vite.config.ts` 同时保存 Vite 原生配置和 Vite+ 扩展配置，减少顶层配置文件数量;
- Vite 原生配置: `server`、`build`、`preview` 继续控制开发、构建与预览;
- Vite+ 扩展配置: `create`、`run`、`fmt`、`lint`、`check`、`test`、`pack`、`staged` 分别控制对应命令;
- 类型感知: `lint.options.typeAware` 让 Oxlint 理解 TypeScript 类型，而不只检查代码表面;
- 类型检查: `lint.options.typeCheck` 开启类型错误检查；它需要与 `typeAware` 一起启用，才会进入 `vp check`;
- 延迟插件: 重型 Vite 插件可用 `lazyPlugins` 延迟加载，避免 `vp lint`、`vp fmt` 等只读取元数据的命令也启动插件;

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  run: {
    tasks: {
      verify: ["vp check", "vp test"],
    },
  },
  staged: {
    "*.{js,ts,tsx}": "vp check --fix",
  },
});
```

## 为什么内置命令与 `vp run` 不能混用

- 内置命令: `vp build` 和 `vp test` 的含义由 Vite+ 固定，不能被 `package.json` 中的同名脚本覆盖;
- 自定义任务: `vp run <任务>` 明确表示执行项目脚本或 `run.tasks` 中的任务;

| 命令           | 执行对象                    |
| -------------- | --------------------------- |
| `vp build`     | Vite+ 内置的 Vite 应用构建  |
| `vp run build` | 项目中的 `build` 脚本或任务 |
| `vp test`      | Vite+ 内置的 Vitest 测试    |
| `vp run test`  | 项目中的 `test` 脚本或任务  |

## 测试、提交检查与 CI 如何组成质量门禁

- 测试导入: 普通测试从 `vite-plus/test` 导入 `describe`、`it`、`expect` 等 API，由 Vite+ 转出项目配套的 Vitest;
- 测试模式: `vp test` 默认运行一次；需要持续监听文件变化时使用 `vp test watch`;
- 提交检查: 在 `staged` 中配置暂存文件规则，再用 `vp config` 安装 Git hook，提交时由 `vp staged` 执行规则;
- CI 安装: GitHub Actions 使用 `voidzero-dev/setup-vp@v1` 安装 Vite+，并可同时准备 Node.js、包管理器与依赖缓存;
- CI 顺序: 先安装依赖，再执行检查、测试和构建；前一步失败就停止交付;

```yaml
- uses: voidzero-dev/setup-vp@v1
- run: vp install
- run: vp check
- run: vp test
- run: vp build
```

## 采用 Vite+ 前需要理解哪些边界

- 适用对象: Vite+ 适合希望统一现代 Web 工具链的项目，不等于每个项目都必须启用全部能力;
- 配置边界: `vp check` 是否包含类型检查取决于 `typeAware` 与 `typeCheck` 配置，不能只凭命令名称推断;
- 任务边界: 内置命令用于稳定的标准动作，项目特有流程使用 `vp run` 表达;
- 当前状态: Vite+ 处于 beta，已可用于实际项目，但能力仍在补全，升级后应阅读变更并重新执行项目门禁;
