---
id: 10d415e2-0186-47ba-ad16-c946d8a23015
---

# 真实 Electron 路径验收

## Electron E2E 夹具

- driver: Playwright `_electron`;
- 源码模式: 使用项目入口启动;
- 打包模式: 使用 `LITHE_EXECUTABLE_PATH` 指向 `lithe.exe`;
- 窗口: `application.firstWindow()` 获取真实 BrowserWindow 页面;
- 用户数据: 每个测试创建独立 `LITHE_USER_DATA_DIR`;
- 清理: 关闭 ElectronApplication 后删除临时目录;

## E2E-LITHE-001

1. 启动应用并等待第一个窗口;
2. 确认中文首页标题可见;
3. 确认页面显示 Electron 43 运行信息;
4. 点击“设置”导航;
5. 选择“深色”;
6. 确认根元素包含 `dark` class;
7. 保存主题截图;
8. 关闭应用;
9. 使用同一临时用户目录重新启动;
10. 再次进入设置页;
11. 确认 dark class 与深色 radio 状态均恢复;

## 覆盖链路

```text
React click
  -> Zustand action
  -> window.lithe
  -> preload invoke
  -> main handler
  -> Drizzle + SQLite
  -> app close / restart
  -> DB read
  -> Zustand hydrate
  -> DOM assertion
```

- 不只是页面 smoke: 跨越 renderer、preload、main 和数据库;
- 重启是关键: 不重启只能证明内存状态;
- packaged path 是关键: 源码 E2E 不能证明 resources 中有 migration;

## 源码态与打包态

| 模式         | 启动入口                      | 主要风险                 |
| ------------ | ----------------------------- | ------------------------ |
| source E2E   | 项目根和 electron package     | IPC、窗口、业务链路      |
| packaged E2E | `dist/win-unpacked/lithe.exe` | asar、资源路径、生产依赖 |

- 同一测试场景支持两种入口，避免验收逻辑漂移;
- 打包态测试使用解压应用，可快速验证真实 runtime;
- NSIS 安装器交互仍需独立安装/卸载验收;

## 进程所有权

- 测试只清理由自身启动的 ElectronApplication;
- 不按进程名批量杀死其他 Electron 应用;
- afterEach 即使断言失败也执行关闭;
- 用户目录在进程关闭后删除，避免 SQLite 文件句柄冲突;
- 挂起时读取 PID、parent PID 和命令行确定准确进程树;

## 当前验收缺口

- Linux AppImage 运行态 E2E;
- macOS x64/arm64 DMG 运行态 E2E;
- 安装与卸载流程;
- migration 从旧版本数据库升级;
- IPC 非法 sender 和参数负向测试;
- 启动 migration 失败时的错误框;
