# Pi 最小 Subagent 插件

## 原始想法

参考 .temp/deepseek-harness 中 subagent 的实现, 创建一个 pi 插件, pi-nano-subagent, 实现最小化的 subagent 功能

## 角色

- **Pi 用户**：使用 Pi coding agent 完成软件工作的开发者，希望把聚焦且自包含的子任务从主会话卸载出去。

## 故事

### 一次性委派

父 agent 把独立工作交给 fresh context 中的子 agent，并只收回完成工作所需的结果。

#### US-001 委派自包含子任务

作为 Pi 用户，我想让父 agent 通过单一 `subagent` 工具委派一个自包含任务，以便节省主会话上下文并获得聚焦结果。

- [ ] 工具以必填 `task` 接受一次委派，并以前台 one-shot 方式等待该次运行结束。
- [ ] 子 agent 通过进程内 Pi SDK 在 fresh session 中运行，共享调用会话的工作目录，但不继承父会话对话历史。
- [ ] 子 agent 固定继承调用时的模型与 thinking level，调用方不能覆盖模型。
- [ ] 子 agent 固定拥有 `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`，不自动继承其他 extension 工具。
- [ ] fresh session 仍加载当前工作目录适用的 Pi context files，使子 agent 遵守 `AGENTS.md` 等项目指令；不自动加载 skills、prompt templates 或其他 extensions。
- [ ] 正常完成只向父 agent 返回最后一条非空 assistant 文本，并把子运行 usage 计入工具结果，不复制 reasoning 或中间工具输出。
- [ ] 模型可见输出遵守 Pi 的 50KB/2000 行工具输出上限；截断时给出明确提示，完整结果保留在 tool details。
- [ ] 父调用取消会中止并释放子 session；初始化、模型或工具失败会形成明确失败结果，不把 partial output 伪装成成功。

#### US-002 有界递归委派

作为 Pi 用户，我想让子 agent 继续把更小的独立任务委派给下一层子 agent，以便完成需要进一步分解的任务而不产生无界递归。

- [ ] 主 agent 深度为 0，允许 `main → sub → subsub`；深度 2 的 `subsub` 不暴露 `subagent` 工具，运行边界也拒绝启动第四层。
- [ ] 未达到深度上限的子 agent 除固定内建工具外还拥有 `subagent`，并沿用相同 one-shot、模型继承、context 与结果语义。

### 安装与维护

#### US-003 安装独立 Pi package

作为 Pi 用户，我想把能力作为独立 Pi package 安装，以便不修改 Pi core 即可在不同项目中使用。

- [ ] workspace package 位于 `packages/pi-nano-subagent/`，包名为 `@kxh4892636/pi-nano-subagent`，并通过 `pi` manifest 声明 extension。
- [ ] `pi install ./packages/pi-nano-subagent` 可安装该 package。
- [ ] package 包含 README、MIT License、自动化测试与构建检查。
- [ ] 自动化测试以 mock 模型覆盖正常完成、取消、失败、工具边界、递归上限、并发排队与资源释放，不要求 CI 调用真实模型。
- [ ] 首版不提供 agent profiles、chain 参数、插件内 parallel 数组、后台运行、续聊、消息控制、持久化、模型选择器或自定义 TUI。

#### US-004 限制并发资源

作为 Pi 用户，我想限制同时运行的子 agent 数量，以便使用并行委派时避免耗尽本机或模型服务资源。

- [ ] Pi 可以通过同轮多个 `subagent` 工具调用并行委派；插件不增加 parallel 数组协议。
- [ ] 每个父 agent 默认最多同时运行 5 个直接子 agent；main 与每个 sub 分别应用上限，避免递归调用占满全局 permit 后死锁。
- [ ] 超过同父上限的调用按 FIFO 排队；排队期间父调用被取消时立即移出队列，不创建子 session。
- [ ] 全局配置文件为 `<getAgentDir()>/pi-nano-subagent.json`，strict schema 只接受 `maxConcurrency`，其值必须是 `1..64` 的整数；文件不存在时使用默认值 `5`，未知字段或非法值明确报错。
- [ ] 每个 extension runtime 在启动时读取一次 immutable 配置 snapshot，整棵递归委派树共享该 snapshot；文件修改在下一次 Pi 启动或 `/reload` 后生效。
- [ ] 插件不提供文件事务或工作区隔离；调用者应把并行任务划分为互不冲突的写入范围。

## 迷雾

无。

## 上下文

- `../../../CONTEXT.md`
- `../../../adr/0004-以独立插件补充发现与原位展开.md`
- `../../../adr/0005-以进程内fresh-session运行one-shot-subagent.md`
- `../../../adr/0006-以delegation-depth和父级局部队列限制递归并发.md`
- `../../../../../.temp/deepseek-harness/docs/subsystems/subagent.md`
- `../../../../../.temp/deepseek-harness/packages/subagent/subagent-spawn-in-process/src/index.ts`
- `../../../../../.temp/deepseek-harness/packages/subagent/subagent-in-process-driver/src/index.ts`
- `../../../../../.temp/deepseek-harness/packages/subagent/tool-subagent/src/index.ts`
- Pi `docs/extensions.md`、`docs/sdk.md`、`docs/packages.md`
- Pi `examples/extensions/subagent/`
- `../../../../../packages/pi-nested-skill/package.json`
