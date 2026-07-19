---
id: 634297f4-c085-4fde-8236-1dc79490718c
---

# Lithe Electron 桌面应用学习地图

## 学习对象

- `Lithe`: 位于 `D:\projects\lithe` 的 Electron 桌面应用底座;
- 任务产物: Electron 43、React 19、TypeScript 7、electron-vite 5、Tailwind CSS 4、shadcn、TanStack、Zustand、i18n、SQLite 与 Drizzle 的可运行组合;
- 初始提交: `0d3ca64 feat: scaffold Lithe desktop app`;
- 首版能力: 展示运行环境、代码路由、主题切换、SQLite 持久化、窗口状态恢复、跨平台打包配置与真实 Electron E2E;
- 学习目标: 能判断一段能力应该放在哪个进程、如何安全跨进程调用、如何保存本地数据、如何构建和验证桌面产物;

## 概念树

```text
Electron 桌面应用
├─ 架构与安全
├─ 运行时
├─ 界面
├─ 本地数据
├─ 工程交付
└─ 质量保障
```

## 笔记导航

- [进程模型与职责边界](./架构与安全/010-进程模型与职责边界.md): 解释 main、preload、renderer 分别是什么;
- [IPC 调用链与契约](./架构与安全/020-IPC调用链与契约.md): 解释 renderer 请求如何到达 main;
- [IPC 安全与能力扩展](./架构与安全/030-IPC安全与能力扩展.md): 解释信任校验和 API 扩展方法;
- [应用生命周期与窗口](./运行时/010-应用生命周期与窗口.md): 解释启动、退出、窗口恢复与资源路径;
- [文件、命令与终端能力边界](./运行时/020-文件命令与终端能力边界.md): 解释未来本地能力为什么不能直接交给页面;
- [Renderer 应用架构与状态](./界面/010-Renderer应用架构与状态.md): 解释 React、Query、Zustand 与 i18n;
- [代码路由与导航模式](./界面/020-代码路由与导航模式.md): 对比 hash、browser 与 memory history;
- [node:sqlite 运行时](./本地数据/010-node-sqlite运行时.md): 解释无需额外原生扩展的 SQLite driver;
- [Drizzle 模式与迁移](./本地数据/020-Drizzle模式与迁移.md): 解释 schema、repository 和 migration;
- [electron-vite 构建模型](./工程交付/010-electron-vite构建模型.md): 解释三个执行环境如何分别构建;
- [构建命令、依赖与版本](./工程交付/020-构建命令依赖与版本.md): 解释依赖处理和兼容版本选择;
- [跨平台打包](./工程交付/030-跨平台打包.md): 解释 Windows、Linux、macOS 产物;
- [CI 跨平台矩阵](./工程交付/040-CI跨平台矩阵.md): 解释 quality、package 与 E2E jobs;
- [测试分层](./质量保障/010-测试分层.md): 解释模块测试和集成证据的差异;
- [真实 Electron 路径验收](./质量保障/020-真实Electron路径验收.md): 解释源码态与打包态 E2E;
- [故障与兼容性经验](./质量保障/030-故障与兼容性经验.md): 记录 RC、打包器与安装内容检查问题;

## 建议学习顺序

1. 先学进程模型，建立“页面不等于桌面权限”的基本心智模型;
2. 再学 IPC，理解 renderer 如何请求 main 执行受控能力;
3. 接着学生命周期，理解桌面应用不是一次性的网页请求;
4. 再看 renderer 和本地数据，串起“用户操作 → IPC → SQLite → 重启恢复”;
5. 最后学构建、打包和测试，理解“源码能跑”与“安装包可交付”的差别;

## 已实现与未实现

| 状态   | 能力                             | 证据                                                        |
| ------ | -------------------------------- | ----------------------------------------------------------- |
| 已实现 | 主题读写与恢复                   | `app_preferences`、`window.lithe.preferences`、E2E 重启断言 |
| 已实现 | 窗口位置与最大化状态恢复         | `window_state`、`resolveWindowOptions()`                    |
| 已实现 | 运行环境读取                     | `runtime:get-info` IPC channel                              |
| 已实现 | Windows x64 安装包               | `dist/lithe-1.0.0-setup.exe`                                |
| 已配置 | Linux x64、macOS x64/arm64 打包  | `electron-builder.yml` 与 CI matrix                         |
| 未实现 | 任意文件读取、命令执行、终端 PTY | 仅确认放置原则与部分架构，不存在对应 IPC 和依赖             |
| 未实现 | 签名、公证、自动发布、更新器     | 首版明确关闭                                                |

## 核心判断

- Electron 不是“React 加一个壳”，而是浏览器进程模型与 Node.js 本地能力的组合;
- main 是权限与生命周期的所有者，preload 是窄桥，renderer 是不可信程度更高的 UI;
- electron-vite 解决构建，electron-builder 解决分发，两者不能互相替代;
- SQLite 文件属于用户数据，migration 属于只读安装资源，两者路径不同;
- 交付证据必须覆盖源码态和打包态，不能只证明 React 页面能渲染;

## 官方资料

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model): 多进程与 preload 的官方说明;
- [electron-vite Getting Started](https://electron-vite.org/guide/): 三入口构建与默认输出目录;
- [Node.js SQLite](https://nodejs.org/api/sqlite.html): `node:sqlite` 与 `DatabaseSync`;
- [Drizzle Node SQLite](https://orm.drizzle.team/docs/sqlite/connect-node-sqlite): Drizzle 的 `node:sqlite` driver;
