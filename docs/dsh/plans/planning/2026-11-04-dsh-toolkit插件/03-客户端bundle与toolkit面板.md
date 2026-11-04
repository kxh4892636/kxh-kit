---
status: completed
blocked_by: ["01"]
---

# 客户端 bundle 与 toolkit 面板

## 交付

插件带上浏览器半：向 root 作用域 `sidebar.panellist` 注册 `toolkit` 图标行、向 `main` 注册同 key 面板；面板列出全部工具并提供独立开关，读写宿主 `api/toolkit/state`。对应 US-002。

## 范围

- `package.json` 的 `dsh.client`、`exports['./client']`。
- 客户端构建：`vp pack` 的第二份 pack 配置（CJS、browser、`deps.neverBundle`）+ `scripts/wrap-client.mjs`。
- `src/client/{index,panel,panel-icon,host-api,state,styles,contract}.ts` 与 `primitives.d.ts`。
- 测试：面板与撤回按钮用 happy-dom + @testing-library/react；`host-api` 用 stub fetch。

不做：撤回按钮的行为（note 04 的宿主部分在这里已接线）。

## 直接依赖

- 01：开关权威位置（宿主 JSON + HTTP 路由）。
- 02：路由形状与工具清单。

## 验收

- [x] bundle 只 require 平台模块表里的裸说明符（`react`、`@deepseek-ai/dsh-client-ui-primitives`），React 未被内联。
- [x] `wrap-client` 以假 `window` 执行一次包体，确认注册 id 与导出 `inject`/`apply`。
- [x] 面板单测覆盖加载、切换、宿主错误与目录读取失败。
- [x] `vp check` 通过。

## 上下文

- 注册范式：`<host>\@deepseek-ai\dsh-client-ui-schedule\lib\client.js:7481-7497`
- 第三方 bundle 契约：`~/.dsh/profiles/desktop/node_modules/dsh-notify-me/lib/client.js:198-215`
- 实现：`packages/dsh-toolkit/src/client/*`、`scripts/wrap-client.mjs`、`vite.config.ts` 第二份 pack 配置

## 决策与证据

- `vp pack` 的 `pack` 配置可以是数组（`vite-plus/dist/pack-bin.js`：`Array.isArray(viteConfig.pack)`），因此一次 `vp pack` 顺序构建宿主半（ESM/node）与客户端半（CJS/browser），客户端配置 `clean: false` 且 `deps.neverBundle` 列出平台模块。
- CLI 的 `--deps.never-bundle` 在 `--no-config` 下不生效（cac 把键名变成 `deps.never-bundle`），所以放弃 CLI 方案。
- `@deepseek-ai/dsh-client-ui-primitives` 只存在于宿主浏览器模块表：源码用 `src/client/primitives.d.ts` 声明成员，单测用 `test.alias` 指向 `src/client/test-primitives.ts`。
- 样式用内联 `CSSProperties`（React 19 不接受字符串 style），颜色走宿主主题 token。
- 面板与撤回按钮共享 `toolkitClientState`（`useSyncExternalStore`）：面板写、按钮读。

## 执行检查点

- 2026-11-04：客户端源码、别名、构建与单测完成；`dist/client.js` 19.2 kB，`require("react")` 保留为外部。

## 下一步

note 04 的宿主侧撤回与 note 05 安装验收。

## 交付记录

- 交付物：`src/client/*` + `dist/client.js`（`window.__ModuleLoader__.load({ id: "@kxh4892636/dsh-toolkit", factory })`）。
- 验证：`wrap-client` 装载校验通过；面板/按钮 9 项单测通过；构建日志显示客户端产物 20.78 kB（React 外置）。
- 证据：`dist/client.js` 内 `require("react")` 仍在、`react.production` 无命中；`wrap-client` 报告 `wrote dist/client.js (19181 bytes)`。
- 遗留：GUI 里入口与面板的可见性需宿主重启后验收（note 05）。
