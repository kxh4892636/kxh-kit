# ETF Delivery Verification

本文把 `/verifying` 的阶段映射到 ETF 命令和入口。验收资产与测试分支见 [test.md](test.md)。

## 本地门禁

| 影响面 | 工作目录 | 必跑命令 |
| --- | --- | --- |
| 前端源码 | `apps/etf-dashboard` | `vp run check`、`vp run build` |
| 后端源码 | `apps/etf-service` | `gofmt` 变更 Go 文件、`go vet ./...`、`go test ./...` |
| proto/生成链路 | 两端 | 先走 [development-flow.md](development-flow.md)，再跑前后端全部门禁 |
| skill/docs only | 仓库根 | 检查链接、路径、重复事实和过期名称 |

先跑与失败最接近的聚焦测试；交付前每个可部署单元只跑一次全量门禁。既有前端 chunk-size warning 可以记录，但新增错误或 warning 不得忽略。

## 运行态

1. 在 `apps/etf-service` 运行 `go run .`，默认监听 `http://localhost:8080`。
2. 确认 `GET /` 返回 `{"name":"etf-service","ok":true}`，`/doc/` 可访问。
3. 在 `apps/etf-dashboard` 运行 `vp run dev`，默认入口为 `http://localhost:5173`。
4. 记录 commit 或工作树标识、启动命令、端口和浏览器视口，证明进程承载待验版本。

## E2E 范围

前端或消费者可见后端行为变化时，使用真实浏览器执行 `market-dashboard/e2e/index.md` 中受影响场景。本模块结构重构需重跑全部四个现有场景：

- E2E-S1 默认行情和 K 线/MA 可见。
- E2E-S2 刷新、标的、周期、范围、均线、tooltip、缩放和拖拽。
- E2E-S3 `390 x 844` 无横向溢出且关键控件可用。
- E2E-S4 后端不可用时显示错误，恢复后看板可继续使用。

每个场景记录外部断言、截图或等价证据、浏览器控制台和目标版本。前端不验证 protobuf 响应或 base URL 配置对象本身；E2E 只验证用户可见结果。

## 诊断与重验

- 页面失败：确认 5173/8080 进程属于待验版本，再看 Connect 请求、CORS、页面错误和后端终端日志。
- Connect 失败：记录 procedure、Connect code、时间窗和目标版本；日志不得包含响应体、密钥或完整外部 payload。
- 行情刷新失败：区分请求校验、未知证券、红色火箭不可用和数据库错误。
- 修复后从最早受影响阶段开始重验；E2E-S4 的停服与恢复都必须重新成立。

最终报告列出命令、结果、运行入口、E2E 场景、证据路径、跳过项和遗留 warning。
