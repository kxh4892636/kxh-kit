# ETF 交付验证

ETF 验证把 `/verifying` 的证据门禁链实例化为项目命令、运行态入口和故障边界：**影响面 → 本地门禁 → 运行态 → E2E → 诊断 → 最小重验**。从最早缺少可信证据的阶段进入；验收资产位置与晋升规则见 [test.md](test.md)。

## 门禁链

1. **影响面**：判断改动属于前端、后端还是跨端契约，并映射到下文的本地门禁、运行态和 E2E 分支。完成标准：每个受影响单元都有适用命令和场景；跳过的阶段有来自变更面的理由。
2. **本地门禁**：按“本地门禁分支”执行覆盖影响面的最小命令集合。完成标准：所有适用命令通过；失败保留命令、退出码和最小错误摘要并进入诊断。
3. **运行态**：消费者可见行为、接口契约或浏览器边界受影响时，按“运行态配置”启动或确认前后端。完成标准：目标入口可访问，并有 commit、工作树或等价证据证明进程承载待验版本。
4. **E2E**：调用 `/e2e` 的“跑真实路径”分支，按“E2E 范围”选择需求流程与模块回归流程中的 ready 场景。完成标准：所有受影响场景都有外部断言、证据和 passed / failed / blocked 结论。
5. **诊断**：把失败归到前端、后端、契约、环境、数据或验收资产，并按“诊断入口”定位最小失败单元。完成标准：每个失败都有责任边界、处置结果和最早受影响阶段。
6. **最小重验**：修复或前置变化后，从最早受影响阶段重走门禁链。完成标准：所有适用阶段通过，或剩余项具有 blocked 证据、缺失条件和恢复入口。

## 本地门禁分支

1. **前端**：展示、交互、图表、样式、路由、Provider、hooks 或生成客户端消费方式受影响时，在 `apps/etf-dashboard` 运行 `vp run build`；涉及格式、lint 或较宽影响面时增加 `vp run check` 或仓库级最小相关 `vp check`。完成标准：适用命令全部通过；剩余 warning 均有既有证据且与本次影响面无关。
2. **后端**：业务、配置、数据源、SQLite、日期逻辑、行情源解析、服务装配或生成链路受影响时，在 `apps/etf-service` 运行 `go test ./...`。初始证券聚焦 `internal/shared/config/securities_test.go`，红色火箭解析聚焦 `internal/integrations/hongsehuojian/parser_test.go`，行情缓存、日期裁剪或休市标记聚焦 `internal/modules/market/service_test.go`。完成标准：全量 Go 测试通过，相关聚焦测试覆盖本次行为。
3. **跨端契约**：proto、生成客户端或消费者语义受影响时，先按 [development-flow.md](development-flow.md) 完成契约同步，再执行前端和后端门禁。完成标准：前后端消费同一份 proto 语义，两个可部署单元的适用门禁均通过。

## 运行态配置

1. 在 `apps/etf-service` 运行 `go run .`。
2. 确认服务监听 `http://localhost:8080`，`GET /` 返回 `{"name":"etf-service","ok":true}`。
3. 在 `apps/etf-dashboard` 运行 `vp run dev`。
4. 打开 `http://localhost:5173`，确认默认后端地址或 `VITE_API_BASE_URL` 指向当前 `etf-service`。

完成标准：前后端入口均可访问，启动方式、base URL 和待验版本已记录；编译、健康检查和初始数据达到场景声明的 ready 状态。

## E2E 范围

1. **需求验收**：执行当前 `.scratch/<feature-slug>/e2e/yyyy-mm-dd-xxx.md` 中受影响的 ready 场景。完成标准：本次需求的消费者结果均有结论和证据。
2. **稳定回归**：执行受影响模块 `apps/etf-dashboard/src/features/<feature-name>/e2e/index.md` 中与改动直接相关的稳定场景。`market-dashboard` 改动按影响覆盖默认标的加载、日线 K 线、刷新、缓存状态、错误提示和响应式。完成标准：直接受影响的稳定场景均为 passed。
3. **浏览器强制分支**：改 CORS、h2c、`VITE_API_BASE_URL`、Connect transport、错误态或 E2E 场景时执行真实浏览器路径。完成标准：浏览器入口、相关请求、页面结果和控制台证据形成同一条可追溯路径。

## 诊断入口

- 页面加载失败时，先确认 `8080` 端口进程承载当前 `apps/etf-service`，再检查浏览器请求的 base URL、CORS 预检和 ConnectRPC 响应。
- 服务不可用路径使用 `apps/etf-dashboard/src/features/market-dashboard/e2e/index.md` 的对应场景；恢复服务后从错误触发动作开始最小重验。
- 接口失败保留 method、endpoint、状态、业务字段与 trace/request ID；缺少关联标识时记录请求时间窗和目标版本。

## 共同契约

- `/verifying` 定义通用阶段、证据和报告格式；本 reference 只提供 ETF 的命令、入口、场景范围和故障边界。
- `/e2e` 定义真实路径的执行与证据标准；本 reference 不复制 Gherkin 模板或浏览器操作方法。
- 验证命令保持源码只读；任务授权修复时，把改动与失败证据对应后执行最小重验。
