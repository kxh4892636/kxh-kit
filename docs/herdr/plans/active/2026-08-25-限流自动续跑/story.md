# 限流自动续跑

## 原始想法

> 阅读 https://herdr.dev/docs/plugins/, 创建 herdr 插件, 功能如下, 每个 30s, 读取 blocked 或 done 状态的 agent, 如果当前最新的消息中同时包含 429 和 limit, 自动发送一条消息, go on. 这个插件功能能否实现?

## 角色

- **Herdr 多智能体操作者**：同时运行多个 coding agent，希望在上游限流解除后自动续跑，避免逐个检查并手工发送继续指令。

## 故事

### 发现限流停顿

插件在状态变化时立即检查，并以 30 秒补偿扫描覆盖漏失事件；它只把当前终端底部确实呈现限流错误的 agent 识别为续跑候选。

#### US-001 检查候选 agent

作为 Herdr 多智能体操作者，我想要插件及时检查状态为 `idle`、`blocked` 或 `done` 的 agent，以便发现可能因上游限流而停顿的工作。

- [ ] 插件订阅 `pane.agent_status_changed`，当 agent 进入 `idle`、`blocked` 或 `done` 时立即触发检查。
- [ ] 插件另以自管 worker 每 30 秒取得当前 Herdr session 中所有 workspace 的存活 agent 列表，作为 best-effort 补偿扫描；Herdr 不承诺监督或自动重启崩溃的 worker。
- [ ] 只有检查时状态恰为 `idle`、`blocked` 或 `done` 的 agent 进入消息检查。
- [ ] 单个 agent 的读取失败不阻止同轮其他 agent 被检查。

#### US-002 识别 429 限流消息

作为 Herdr 多智能体操作者，我想要插件只在 agent 当前最新输出同时包含 `429` 和 `limit` 时判定为限流，以便不续跑其他正常完成或等待人工决策的工作。

- [ ] 插件使用 `agent.read` 的 `detection` 快照，先把换行及连续空白规范化为单个空格并去除首尾空白，再把末尾 55 个 Unicode 字符定义为“当前最新消息区域”。
- [ ] 只有该区域同时命中 `429` 与 `limit` 才进入续跑；`limit` 按大小写不敏感匹配。
- [ ] 未同时命中、输出为空或无法可靠读取时不发送任何输入。

### 安全续跑

插件向已确认的限流停顿发送最小继续指令，并避免针对同一停顿反复发送。

#### US-003 自动发送继续消息

作为 Herdr 多智能体操作者，我想要插件向符合条件的 agent 自动发送 `go on`，以便 agent 在无需人工切换窗格的情况下继续原任务。

- [ ] 对 `idle` 或 `done` agent 使用 `agent.prompt` 发送并提交严格内容 `go on`。
- [ ] 对 `blocked` agent 使用 pane 级 `pane.send_input` 单请求注入文本 `go on` 和 `enter`；验收明确承认这会绕过 `agent.prompt` 的 blocked 保护，且 Herdr 不保证目标 UI 会把它解释为 agent 消息。
- [ ] `blocked` 的 pane 级输入适用于 Herdr 当前识别到的所有 agent 类型，不设置 agent kind allowlist。
- [ ] 发送前使用 `agent.get` 再次确认目标仍是同一 `terminal_id` 对应的存活 agent，状态仍为 `idle`、`blocked` 或 `done`，且待处理的 `state_change_seq` 与输出修订未被新状态取代。
- [ ] 插件不会把 `go on` 误输入到已被 shell、其他进程或新 agent 占用的 pane。

#### US-004 防止重复续跑

作为 Herdr 多智能体操作者，我想要每次限流停顿最多触发一次自动续跑，以便 30 秒轮询不会重复注入 `go on`。

- [ ] 插件按 Herdr session 分片，并以 agent 的 `terminal_id`、状态周期及规范化匹配区域指纹构成去重标识。
- [ ] 相同停顿在后续轮询中不再发送；agent 产生新的限流停顿后可再次发送。
- [ ] 最后一次成功发送的去重标识原子持久化到 `HERDR_PLUGIN_STATE_DIR`；插件或 Herdr 重启后，agent 与输出指纹未变化时不得重复发送。
- [ ] 事件 handler 与补偿扫描并发命中同一 agent 时，通过逐目标锁保证最多一个发送者成功。

### 可运行的插件生命周期

#### US-005 安装后持续运行并可诊断

作为 Herdr 多智能体操作者，我想要插件在 Herdr 会话中持续工作并留下诊断信息，以便无需手工启动每一轮检查，且能查明未续跑或误判原因。

- [ ] 插件声明有效的 `herdr-plugin.toml`，且 `min_herdr_version` 与所用 API 一致。
- [ ] `[[events]]` 声明状态变化 handler，`[[startup]]` 在 Herdr restore 或 live handoff 后恢复插件状态并启动一个按 session 分片的补偿扫描 worker。
- [ ] 启用插件并重启 Herdr 后，自动检查能力可恢复，无需重新安装；若未重启 Herdr，仅 link 或 enable 插件不会自动执行 `[[startup]]`，安装说明必须明确这一点。
- [ ] 每次命中、跳过、发送成功和发送失败均留下不含完整敏感终端内容的结构化诊断记录。
- [ ] 禁用或卸载插件后不再产生新的检查和输入。

## 迷雾

无待决产品问题。已接受以下平台限制与风险：

- Herdr 没有语义消息边界，“当前最新消息”固定近似为规范化 `detection` 快照末尾 55 个 Unicode 字符。
- `blocked` 自动续跑必须绕过 `agent.prompt` 的保护并向 pane 注入底层输入，可能被审批或提问 UI 误解。
- 30 秒 worker 由插件自管且不受 Herdr 监督；状态事件是主触发，扫描只作 best-effort 补偿。
- 现有 Context Map 尚未登记 Herdr 域；本阶段按 `/to-story` 只维护本 `story.md`，进入实现前需经后续领域流程补齐登记。

## 上下文

- [Herdr Plugins](https://herdr.dev/docs/plugins/)
- [Herdr Agent automation](https://herdr.dev/docs/agent-automation/)
- [Herdr Socket API](https://herdr.dev/docs/socket-api/)
- 本机 Herdr `0.8.2` / socket protocol `20` 的 `herdr api schema --json` 输出。
- [`CONTEXT-MAP.md`](../../../../../CONTEXT-MAP.md)
- [`docs/loopx/CONTEXT.md`](../../../../loopx/CONTEXT.md)
- [`docs/loopx/adr/0002-以单一cli收口内建子命令.md`](../../../../loopx/adr/0002-以单一cli收口内建子命令.md)
