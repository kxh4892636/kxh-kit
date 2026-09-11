---
id: 8ab3ae09-612b-4fd0-985a-179c450331ed
---

# Vite+

## Vite+ 为什么要统一 Web 工具链？

- Web 工具链: 开发 Web 项目时使用的一组工具，例如运行 Node.js、安装依赖、启动开发服务器、检查代码、测试和构建;
- 传统问题: 每项工作可能由不同工具负责，命令和配置散落在多个文件中，新成员必须先学会如何拼装整套流程;
- Vite+: 把常用工具放到同一个入口后面，让开发者围绕任务选择命令，而不是先判断应该调用哪个底层工具;
- 统一入口: 日常操作使用 `vp <action>`，例如 `vp test`;
- 统一配置: Vite 与 Vite+ 的主要配置集中在 `vite.config.ts`;
- 工具职责: 下表用于定位底层工具，具体命令选择与项目任务边界见后文;

| 职责           | Vite+ 使用的工具 | 通俗理解                         |
| -------------- | ---------------- | -------------------------------- |
| 开发与应用构建 | Vite、Rolldown   | 启动开发服务器并生成可部署文件   |
| 测试           | Vitest           | 自动运行测试用例并比较结果       |
| 代码检查       | Oxlint           | 找出可疑、错误或不符合规则的代码 |
| 格式化         | Oxfmt            | 统一缩进、换行等代码外观         |
| 类型检查       | tsgo、tsgolint   | 检查 TypeScript 类型是否互相匹配 |
| 库打包         | tsdown           | 把库源码转换成可发布的文件       |
| 任务编排       | Vite Task        | 按依赖关系执行并缓存多个任务     |

- 实践入口: 新建与迁移、测试、提交检查和 CI 的执行步骤见[Vite+ 工作流](./020-vite-plus-工作流.md);

## 全局 vp 与项目内 vite-plus 如何分工？

- `vp`: 安装在电脑上的全局命令行入口，负责创建或迁移项目、选择 Node.js 与包管理器，并把命令交给项目工具执行;
- `vite-plus`: 安装在项目中的本地依赖，保存该项目实际使用的 Vite+ 版本，并提供配置类型与工具实现;
- 分工原因: 全局 `vp` 负责找到并启动工具，项目内 `vite-plus` 让团队和 CI 使用同一套项目能力;

## 如何让项目选择包管理器与 Node.js 版本？

- 包管理器: `vp install` 会根据项目声明或锁文件选择 pnpm、npm、Yarn 或 Bun，不需要开发者手动切换安装命令;
- Node.js 作用域: `vp env default <版本>` 设置全局默认版本，`vp env pin <版本>` 固定项目版本，`vp env use <版本>` 只切换当前终端会话;

## 面对开发任务时应该选择哪个命令？

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

## 如何在 vite.config.ts 中声明各工具配置？

- 配置中心: `vite.config.ts` 同时保存 Vite 原生配置和 Vite+ 扩展配置，减少顶层配置文件数量;
- Vite 原生配置: `server`、`build`、`preview` 继续控制开发、构建与预览;
- Vite+ 扩展配置: `create`、`run`、`fmt`、`lint`、`check`、`test`、`pack`、`staged` 分别控制对应命令;
- 检查开关: 下例同时启用类型感知与类型检查；这两个开关如何影响门禁见后文质量检查边界;
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

## 为什么内置命令与 `vp run` 不能混用？

- 内置命令: `vp build` 和 `vp test` 的含义由 Vite+ 固定，不能被 `package.json` 中的同名脚本覆盖;
- 自定义任务: `vp run <任务>` 明确表示执行项目脚本或 `run.tasks` 中的任务;

| 命令           | 执行对象                    |
| -------------- | --------------------------- |
| `vp build`     | Vite+ 内置的 Vite 应用构建  |
| `vp run build` | 项目中的 `build` 脚本或任务 |
| `vp test`      | Vite+ 内置的 Vitest 测试    |
| `vp run test`  | 项目中的 `test` 脚本或任务  |

## 采用 Vite+ 时如何确认检查与版本边界？

- 适用对象: Vite+ 适合希望统一现代 Web 工具链的项目，不等于每个项目都必须启用全部能力;
- 类型感知: `lint.options.typeAware` 让 lint 使用类型信息，`typeCheck` 额外报告 TypeScript 类型错误；按项目所用版本要求一起配置后，类型检查才进入 `vp check`;
- 任务入口: 内置命令与项目脚本的分工见本篇 `vp run` 小节；Docusaurus 等自有构建流程应执行实际项目脚本;
- 版本边界: 原笔记记录的 beta 状态属于历史信息；使用时以项目锁定版本和[官方文档](https://viteplus.dev/guide/)为准，升级后阅读变更并重新执行门禁;

- 检查依据: [Vite+ Check](https://viteplus.dev/guide/check)，最终检查范围还受项目配置与命令行开关控制;
