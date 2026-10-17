---
status: completed
blocked_by: ["02"]
---

# 按 ETF 持久化看板状态

## 交付

看板的周期、范围、均线、虚拟均线按 ETF 独立保存到 localStorage；切换标的时恢复对应 ETF 的状态，新标的回退默认值，刷新页面后首个标的仍恢复其状态。

## 范围

- 新增 `client/features/market-dashboard/use-dashboard-view.ts`：**唯一外部存储 hook**，封装 localStorage 的读取、校验、按 symbol 更新与写入（异常安全）；`MarketDashboard` 与工具栏不直接访问 localStorage。
- 同模块保留纯函数形式的 key/版本/默认值/解析校验，便于单元测试；不额外引入通用 storage 抽象。
- `MarketDashboard` 调用 `useDashboardView(selectedSymbol)`，用返回的 `view` 替换共享的四个 `useState`；四个工具栏回调调用 `updateView`。
- 单元测试覆盖解析/校验/存储异常；新增第六组 E2E 验证切换与刷新后的状态恢复；更新 README 与 ADR 0003 的 E2E 数量。
- 工具栏新增「重置」按钮：将当前 ETF 四项恢复默认；不影响其他 ETF。
- 不改图表缩放/拖拽、均线图例显隐、数据查询与后端。

## 直接依赖

- 02：消费已交付的 `MarketDashboard`、`DashboardToolbar` 与五组 E2E 基线；不改合并结构。

## 验收

- [x] localStorage 使用版本化 key（如 `etf:dashboard:views:v1`），按 symbol 存 `{ period, range, maText, virtualMaText }`。
- [x] 切换 930955.CSI ↔ 932315.CSI 时各自恢复周期/范围/均线/虚拟均线；未保存的标的显示默认值。
- [x] 刷新页面后首个标的恢复其已保存状态；localStorage 缺失、损坏、不可写时不崩溃并回退默认。
- [x] 新增 E2E 第六组：保存 A 的状态 → 切换 B 使用默认 → 保存 B → 切回 A 恢复 → 刷新后 A 恢复。
- [x] 工具栏「重置」将当前 ETF 四项恢复默认，且不影响其他 ETF。
- [x] 单元/浏览器测试覆盖 hook 的存储读写/校验/异常回退与重置；`test:coverage`、build、六组 E2E、`check-domain` 通过；按用户指令 commit。

## 上下文

- [执行规格](spec.md)
- [用户故事](story.md)
- `apps/etf/client/features/market-dashboard/index.tsx`
- `apps/etf/client/features/market-dashboard/dashboard-toolbar.tsx`
- `apps/etf/client/features/market-dashboard/chart/chart-data.ts`
- `apps/etf/e2e/`

## 决策与证据

- 当前四个字段在 `MarketDashboard` 中是跨标的共享 `useState`，切换标的不会重置，但也不会按标的区分/持久化；需求是按 ETF 独立保存。
- 存储只覆盖四个筛选项；图表 zoom/tooltip、均线图例显隐仍按现有行为重置，不在本次范围。
- 采用单 key + `bySymbol` 映射，便于原子读写与版本迁移；读取时按 `PERIOD_OPTIONS`/`RANGE_OPTIONS` 校验，非法回退默认。
- 不持久化 selectedSymbol，保持现有「刷新后选择列表第一项」行为；E2E 刷新断言基于首个标的。
- localStorage 是外部不可信输入且可能抛异常；hook 内部解析/写入都做容错，不阻断看板。
- hook 对外只暴露 `{ view, updateView }`；读写、版本校验、fallback 都封装在 hook 内，组件保持纯展示/编排。

## 执行检查点

2026-10-17：已实现并验证；用户确认 dev gate 并要求完成后 commit。

- 新增 `use-dashboard-view.ts`：localStorage 读写/校验/按 symbol 更新/重置全部封装在 hook；页面与工具栏不直接访问 localStorage。
- `MarketDashboard` 用 `useDashboardView(selectedSymbol)` 替换四个共享 `useState`；工具栏新增「重置」。
- 新增单元测试（解析/校验/异常/读写）、浏览器 hook 测试、E2E 第六组（切换/刷新/重置）。
- 已执行：`vp check --fix apps/etf docs/etf` 通过；`test:coverage` 156 项通过（statements 92.85%、branches 89.04%、functions 90.04%、lines 93.63%）；`build` 通过；`test:e2e` 6/6 通过；`check-domain` 通过。

## 下一步

按用户指令 commit（不推送）。

## 交付记录

交付物：`client/features/market-dashboard/use-dashboard-view.ts`、`MarketDashboard` 接线、工具栏重置按钮、`use-dashboard-view.test.ts/.tsx`、`e2e/s6-persist-state.spec.ts`、README/ADR 0003 更新。

证据：

- 存储 key `etf:dashboard:views:v1`，版本 1，按 symbol 存 `{ period, range, maText, virtualMaText }`；读取校验白名单，损坏/不可写回退默认。
- E2E-S6 通过：A 自定义 → 切 B 默认 → B 自定义 → 切回 A 恢复 → 刷新 A 恢复 → 重置 A 默认 → B 保持自定义。
- 覆盖率与六组 E2E 数据见上；工作区按用户指令 commit，不推送。
