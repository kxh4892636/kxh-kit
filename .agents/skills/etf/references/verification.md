# Verification

测试资产维护原则见 `test.md`；本文件只描述具体命令、联调和验收路径。

## 前端

适用范围：只改前端展示、交互、图表、样式、路由、Provider、hooks 或前端生成客户端消费方式。

验收方式在 `apps/etf-dashboard` 下执行：

- 普通前端改动运行 `vp run build`。
- 涉及格式、lint 或较宽影响面时运行 `vp run check` 或仓库级最小相关 `vp check`。
- 涉及交互、图表行为、响应式或错误态时，启动后端和前端后按 `e2e/*.md` 验收核心页面。
- 功能迁入 `features/*` 后，新增需求优先按对应 `features/*/test/*.md` 验收；`test/index.md` 只在需求明确通过后更新为模块回归入口。
- 后端服务不可用场景参考 `e2e/04-service-unavailable.md`。

## 后端

适用范围：只改后端业务、配置、数据源、SQLite 读写、日期逻辑、行情源解析、服务装配或后端生成链路。

验收方式在 `apps/etf-service` 下执行：

- 改 `internal/**`、`main.go`、配置、SQLite repository、行情源解析或日期工具后运行 `go test ./...`。
- 改初始支持证券时，重点关注 `internal/shared/config/securities_test.go`，并运行 `go test ./...`。
- 改红色火箭解析时，重点关注 `internal/integrations/hongsehuojian/parser_test.go`，并运行 `go test ./...`。
- 改行情缓存、日期裁剪或休市标记时，重点关注 `internal/modules/market/service_test.go`，并运行 `go test ./...`。

跨端契约顺序见 `development-flow.md`。

## 联调

本地联调先启动后端，再启动前端。

1. 在 `apps/etf-service` 运行 `go run .`。
2. 确认服务监听 `http://localhost:8080`，`GET /` 返回 `{"name":"etf-service","ok":true}`。
3. 在 `apps/etf-dashboard` 运行 `vp run dev`。
4. 打开 `http://localhost:5173`，确认默认后端地址或 `VITE_API_BASE_URL` 指向正在运行的 `etf-service`。
5. 验收默认标的加载、日线 K 线展示、刷新、缓存状态、错误提示和页面响应式。
6. 需要浏览器场景时，按 `apps/etf-dashboard/e2e/*.md` 选择最小相关场景。

服务不可用场景参考 `apps/etf-dashboard/e2e/04-service-unavailable.md`。如果页面显示加载失败，先确认 `8080` 端口监听进程确实是 `apps/etf-service`，再检查浏览器请求的 base URL、CORS 预检和 ConnectRPC 响应。

改 CORS、h2c、`VITE_API_BASE_URL`、Connect transport、错误态或 E2E 场景时，必须走一次真实浏览器路径，不能只依赖构建或单元测试。
