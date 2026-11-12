---
id: 8ab3ae09-612b-4fd0-985a-179c450331ed
---

# Vite+

## Vite+ 为什么要统一 Web 工具链？

- Web 工具链: 开发 Web 项目时用到的一组工具;
- 覆盖范围: 运行 Node.js、安装依赖、起开发服务器、检查、测试、构建;
- 统一理由: 开发者围绕任务选命令, 不必先判断该调哪个底层工具;

## 工具链统一后入口与配置怎么落？

- 统一入口: 日常操作使用 `vp <action>`, 例如 `vp test`;
- 统一配置: Vite 与 Vite+ 的主要配置集中在 `vite.config.ts`;

| 职责           | Vite+ 使用的工具 | 通俗理解                         |
| -------------- | ---------------- | -------------------------------- |
| 开发与应用构建 | Vite、Rolldown   | 启动开发服务器并生成可部署文件   |
| 测试           | Vitest           | 自动运行测试用例并比较结果       |
| 代码检查       | Oxlint           | 找出可疑、错误或不符合规则的代码 |
| 格式化         | Oxfmt            | 统一缩进、换行等代码外观         |
| 类型检查       | tsgo、tsgolint   | 检查 TypeScript 类型是否互相匹配 |
| 库打包         | tsdown           | 把库源码转换成可发布的文件       |
| 任务编排       | Vite Task        | 按依赖关系执行并缓存多个任务     |

## 全局 vp 与项目内 vite-plus 如何分工？

- `vp`: 装在电脑上的全局命令行入口;
- `vp` 职责: 创建或迁移项目、选择 Node.js 与包管理器;
- `vp` 执行: 把命令交给项目内的工具;
- `vite-plus`: 装在项目里的本地依赖;

## 两者分工带来什么收益？

- `vite-plus` 作用: 锁定本项目实际使用的 Vite+ 版本;
- `vite-plus` 还提供: 配置类型与工具实现;
- 分工原因: 全局 `vp` 负责找到并启动工具;
- 分工收益: 项目内依赖让团队与 CI 用同一套项目能力;

## 如何让项目选择包管理器与 Node.js 版本？

- 包管理器: `vp install` 按项目声明或锁文件选 pnpm、npm、Yarn、Bun;
- 好处: 不需要开发者手动切换安装命令;
- 全局默认: `vp env default <版本>` 设置全局默认 Node.js 版本;

## Node.js 版本的作用域怎么分？

- 项目固定: `vp env pin <版本>` 固定项目版本;
- 临时会话: `vp env use <版本>` 只切换当前终端会话;

## 面对开发任务时应该选择哪个命令？

| 任务           | 命令                            | 实际作用                                  |
| -------------- | ------------------------------- | ----------------------------------------- |
| 创建项目       | `vp create`                     | 选择模板并生成新项目                      |
| 迁移旧项目     | `vp migrate`                    | 把分散的 Vite、测试、检查等配置迁入 Vite+ |
| 安装依赖       | `vp install`                    | 检测并调用项目使用的包管理器              |
| 启动开发       | `vp dev`                        | 启动 Vite 开发服务器                      |
| 构建应用       | `vp build`                      | 使用 Vite 与 Rolldown 生成生产产物        |
| 预览产物       | `vp preview`                    | 在本地启动服务器查看生产构建              |
| 运行测试       | `vp test`                       | 使用 Vitest 执行测试, 默认执行一次后退出  |
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

- 配置中心: `vite.config.ts` 同时保存 Vite 原生配置与 Vite+ 扩展;
- 收益: 顶层配置文件数量变少;

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

- 内置命令: `vp build` 与 `vp test` 的含义由 Vite+ 固定;
- 优先级: `package.json` 中的同名脚本无法覆盖它;
- 自定义任务: `vp run <任务>` 表示执行项目脚本或 `run.tasks` 任务;

| 命令           | 执行对象                    |
| -------------- | --------------------------- |
| `vp build`     | Vite+ 内置的 Vite 应用构建  |
| `vp run build` | 项目中的 `build` 脚本或任务 |
| `vp test`      | Vite+ 内置的 Vitest 测试    |
| `vp run test`  | 项目中的 `test` 脚本或任务  |
