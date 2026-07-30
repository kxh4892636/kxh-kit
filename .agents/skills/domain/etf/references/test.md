# ETF Test Strategy

本文只持有 ETF 的测试分支和测试资产位置。后端测试写法由 `/tdd` 定义，命令和运行态由 [verification.md](verification.md) 持有。分层决策见 [0004-etf-前端测试代码化](../../../../../docs/adr/0004-etf-前端测试代码化.md)。

## 术语

- **单测**：Vitest node 环境的纯逻辑测试（`src/**/*.test.ts`），无 DOM、无浏览器。
- **组件测试**：Vitest browser mode 测试（`src/**/*.test.tsx`），在真实 Chrome 中渲染组件；canvas 渲染与 tooltip、缩放、拖拽交互的回归在本层；API 数据在 Connect transport seam 上 mock（`createRouterTransport`）。
- **E2E**：Playwright 测试（`apps/etf-dashboard/e2e/`），从真实消费者入口验证联通性；保持薄，细粒度交互断言下沉到组件测试。

## 后端 TDD

后端行为在约定 seam 上测试先行：

- `market.MarketService.GetDailyBars`：请求语义、缓存刷新、日期裁剪和成功空结果。
- `hongsehuojian.ParseKlineJSON`：外部 DTO、结构兼容和行情语义校验。
- `HongsehuojianClient` + `httptest.Server`：请求映射、状态码、超时和 8 MiB 响应上限。
- `config.Load` + 临时环境：严格 `.env`、默认值与非法配置。
- 真实 Connect handler + client：错误码和终端结构化日志。

存储行为通过 `MarketStore` seam 驱动；只有需要证明 GORM/数据库行为时才增加 adapter 集成测试。

## 前端测试分层

前端行为按层归位：

- 纯数据逻辑（K 线聚合、数字格式化、MA 计算）→ 单测。
- 组件渲染、canvas 交互、服务错误态 → 组件测试。
- 消费者旅程联通性 → E2E。现有四个场景保留：S1 默认行情、S2 核心交互联通、S3 窄屏、S4 服务不可用与恢复。除非需求新增消费者行为，不扩写场景数量。

## 资产位置

- 单测与组件测试：与源文件同目录的 `*.test.ts` / `*.test.tsx`。
- E2E：`apps/etf-dashboard/e2e/`，config 在应用根 `playwright.config.ts`。
- E2E 进程编排：Playwright webServer 起前端 dev server，global setup 构建并拉起 etf-service；S4 在测试内真实 kill/restart 后端，后端为外部管理时 S4 跳过。

ETF 前端不再使用 `/acceptance` 的 Markdown 验收资产；该形态对仓库其他领域继续有效。
