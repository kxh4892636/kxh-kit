# ETF Test Strategy

本文只持有 ETF 的测试分支和验收资产位置。测试写法由 `/tdd` 与 `/e2e` 定义，命令和运行态由 [verification.md](verification.md) 持有。

## 后端 TDD

后端行为在约定 seam 上测试先行：

- `market.MarketService.GetDailyBars`：请求语义、缓存刷新、日期裁剪和成功空结果。
- `hongsehuojian.ParseKlineJSON`：外部 DTO、结构兼容和行情语义校验。
- `HongsehuojianClient` + `httptest.Server`：请求映射、状态码、超时和 8 MiB 响应上限。
- `config.Load` + 临时环境：严格 `.env`、默认值与非法配置。
- 真实 Connect handler + client：错误码和终端结构化日志。

存储行为通过 `MarketStore` seam 驱动；只有需要证明 GORM/数据库行为时才增加 adapter 集成测试。

## 前端 E2E

前端不要求 TDD 或组件单元测试，以真实浏览器 E2E 验证消费者行为。稳定回归资产是：

`apps/etf-dashboard/src/features/market-dashboard/e2e/index.md`

现有四个场景均需保留：默认行情、核心交互、窄屏、服务不可用与恢复。除非需求新增消费者行为，不扩写场景数量。

## 资产链

1. 单次需求资产写入 `.scratch/<feature-slug>/e2e/yyyy-mm-dd-xxx.md`。
2. ready 场景通过 `/e2e` 执行真实路径并记录版本、断言与证据。
3. 只有长期可复验且 passed 的场景才合并到 feature 的 `e2e/index.md`。

ETF 的上述位置覆盖 `/e2e` 通用目录回退；Gherkin、状态和证据格式仍以 `/e2e` 为准。
