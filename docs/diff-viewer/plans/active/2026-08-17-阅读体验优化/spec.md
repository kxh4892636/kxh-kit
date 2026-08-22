---
status: in_progress
---

# 阅读体验优化

## 问题

三个互不依赖的阅读体验问题:

1. **切换 Ignore Whitespace 后仓库列表消失** (现存 bug): `ignoreWhitespace` 是 `fetchDiffData` 的依赖 (App.tsx:810), 变化经 `handleActivateRepository` (App.tsx:999) 以 `onActivateRepository` 传入 `useRepositoryScan`, 使 `activate → applyScanResult → startScan` 逐级重建, 启动扫描 effect 以 `[startScan]` 为依赖 (use-repository-scan.ts:133-162) 被重触发 —— 全量重扫、`activePath` 重置回启动目录、根仓库被重新激活; 扫描失败时列表清空 ("No repositories found"); SSH 远程视图下 `getWorkspace` 返回本地启动目录, 重扫以本地结果替换远程仓库列表。
2. **默认主题不符合期望**: 无用户偏好时默认 dark (SettingsModal.tsx:50 `theme: "dark"` + `syntaxTheme: "vsDark"`; appearanceTheme.ts:155 bootstrap 无存储偏好时跟随系统), 用户要求默认 light。
3. **加载大量 diff 页面卡死**: 两个场景均无防护——(a) 单个巨型文件: 新增/删除文件全行渲染 (useExpandedLines.ts:411), 每行挂载时同步 Prism tokenize (DiffCodeLine.tsx:76), 每个 token/word 一个 span; (b) 多文件长会话: 文件级懒加载 (useLazyDiffRendering) 只挂不卸, 滚动与文件树跳转持续累积 DOM。

## 方案

- **bug 修复**: 解耦启动扫描 effect 与回调链 —— hook 内以 ref 持有最新 `onActivateRepository` (既有 `fetchDiffDataRef` 同款模式), 启动扫描只在挂载时触发; `openFolder`/`openRemote` 仍是显式上下文切换入口。
- **默认浅色主题**: 无存储偏好时一律解析为 light; Settings 的 light/dark/auto 三选项保留, `auto` 语义不变 (跟随系统); 默认语法高亮主题联动切到 light 主题族。
- **虚拟列表**: 引入 `@tanstack/react-virtual`, 分两层实施——行级 windowing (单个巨型文件只挂载视口附近行) 先行, 文件级 windowing (远离视口的文件块卸载) 随后复用其集成; 导航依赖行 DOM id 的契约保留, 以"先确保目标挂载再滚动"编排维持可用。

## 已排除的备选

- 手写 IntersectionObserver windowing (沿用 useLazyDiffRendering 模式): 变高行、`<table>` 结构、sticky 文件头、DOM id 导航全部需自行处理, 滚动跳动风险高; 用户已选定 react-virtual。
- 仅用 CSS `content-visibility: auto` 止血: DOM id 保留是优点, 但不减少 React 挂载与每行 Prism tokenize 成本, 治标不治本。
- 主题默认继续跟随系统: 用户明确要求默认 light; 跟随系统的需求由保留的 `auto` 选项承载。

## 实施决策

- **重扫 bug 修复点**: `useRepositoryScan` 内部用 ref 持有最新 `onActivateRepository`, 使 `activate/applyScanResult/startScan` 身份稳定; 启动 effect 只在挂载时运行一次。修复后切换 whitespace 的唯一效果 = 以新 `ignoreWhitespace` 参数重取聚焦仓库 diff (既有 App.test.tsx:1028 覆盖的行为保持不变)。
- **主题默认**: `SettingsModal.tsx` DEFAULT_SETTINGS `theme: "dark"→"light"`、`syntaxTheme: "vsDark"→` light 族主题; `appearanceTheme.ts` bootstrap 无存储偏好时解析为 light; 色板与 `auto` 选项不动。
- **虚拟化集成**: 滚动容器为 `main.overflow-y-auto` (constants/navigation.ts:7); 行 DOM id 约定 `file-{fileIndex}-chunk-{chunkIndex}-line-{lineIndex}` (domHelpers.ts:8-9) 是键盘光标、评论跳转、文件树点击的共同契约, 虚拟化后以"先确保挂载再滚动"编排维持 (先例: useLazyDiffRendering 的 ensureFilesRenderedUpTo + rAF 重试); 评论行/展开按钮等变高行由虚拟器动态测量。
- **新增依赖**: `@tanstack/react-virtual` (用户已批准); 按 workspace 惯例管理版本。
- **交付门禁**: 每个 issue 的 `/verifying` 门禁 = `pnpm ready` (vp check + test + build) 全绿, 用户可感知信号以 e2e 用例为证据; 虚拟化 issue 另加组件测试断言"巨型 fixture 下挂载的 DOM 行数有界 (视口 + overscan 上限)"。

## 工作环境

- 本 monorepo: pnpm@11 workspace, node >= 22.12, vite-plus (`vp`, 统一工具链); 代码落 `apps/diff-viewer`。
- 测试三层: 单元/组件 (Vitest, 与实现同级目录), e2e (Playwright 驱动真实 Electron, `apps/diff-viewer/e2e/`); 实际运行验证仅在 Windows。

## 范围

- 修复切换 Ignore Whitespace 引发的意外重扫、聚焦重置、仓库列表消失 (含 SSH 远程视图)。
- 无用户偏好时默认 light 主题 (含首屏 bootstrap 与默认语法高亮主题联动)。
- 文本 diff 的行级虚拟列表 (unified 与 split 两种布局)。
- 多文件 diff 的文件级虚拟列表 (远离视口的文件块卸载)。

## 非范围

- Markdown/Notebook/Image 专用 viewer 的行级虚拟化 (如有需要后续单开 issue)。
- Quick Diffs 选项说明的落盘或应用内帮助 (访谈中已口头讲解, 用户确认不留文档)。
- 毫秒级性能预算指标 (本次以结构断言 = DOM 行数有界为验收信号)。

## 待定

(无)

## 上下文

- 上一 plan (completed): [../../reference/2026-08-16-diff-阅读工具/spec.md](../../reference/2026-08-16-diff-阅读工具/spec.md)
- [ADR-0001 裁剪 fork difit](../../adr/0001-裁剪-fork-difit.md)
- 域术语表: [../../CONTEXT.md](../../CONTEXT.md)

## Issue

| #   | Issue                                                         | 状态        | 阻塞于 | 下一步     |
| --- | ------------------------------------------------------------- | ----------- | ------ | ---------- |
| 01  | [ignore whitespace 重扫修复](01-ignore-whitespace重扫修复.md) | completed   | —      | /implement |
| 02  | [默认浅色主题](02-默认浅色主题.md)                            | completed   | —      | /implement |
| 03  | [行级虚拟列表](03-行级虚拟列表.md)                            | in_progress | —      | /implement |
| 04  | [文件级虚拟列表](04-文件级虚拟列表.md)                        | pending     | 03     | /implement |
