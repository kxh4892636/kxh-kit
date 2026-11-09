---
name: 'commandcode-provider接入'
description: '参照 pi 现有网关 provider 的接入形态，为 pi-toolkit 增加 Command Code provider：/login 存 API key、自动拉全量模型目录、按端点映射 api 与 baseUrl。'
status: 'completed'
---

# commandcode-provider接入

## 问题

用户要让本机 pi 能直接用 [Command Code Provider API](https://commandcode.ai/docs/provider) 的模型。pi 内置目录里没有这个 provider（`pi.dev/api/models/providers/commandcode` 返回 404，`docs/providers.md` 的环境变量表无此项），因此必须自己接一条链路。

用户的要求有两条硬约束：凭据走 `/login` 的 API key 链路（不放环境变量、不写明文进配置文件），模型清单全量自动生成（96 条，不手工维护静态列表）。

## 方案

**形态**：在 `packages/pi-toolkit` 内新增 provider 模块，用 pi 的扩展接缝 `pi.registerProvider("commandcode", ProviderConfig)` 注册，**不设开关**——provider 注册不激活任何工具，未登录时在 `/model` 中只表现为不可用，注册本身无副作用；开关是给工具用的（`tools.*`），不扩大到 provider。

**凭据**：注册时不写 `apiKey`。pi 的 `provider-composer` 对没有 `apiKey` 的 provider 会生成默认的 API key 登录方式，provider 因此出现在 `/login` 的 API key 列表，凭据存 `~/.pi/agent/auth.json`。这正是用户要的「`/login` 中的 api 链路」。

**目录发现**：用 `ProviderConfig.refreshModels` 在每次模型刷新时拉 `GET https://api.commandcode.ai/provider/v1/models`（实测无需鉴权，200），并合并 `https://commandcode.ai/docs/resources/pricing-limits` 页面内嵌的价格 JSON 补 `cost`；失败时退回上次持久化的快照（`context.publish({ persist })`），保证离线可用。

**端点映射**（按每条模型的 `supported_endpoints` 与 id）：

| 模型 | `api` | 模型级 `baseUrl` |
|---|---|---|
| `claude-*`（仅 `/messages`） | `anthropic-messages` | `https://api.commandcode.ai/provider` |
| 其余 85 条 | `openai-completions`（全部支持 `/chat/completions`） | `https://api.commandcode.ai/provider/v1` |

baseUrl 的不对称来自 SDK 语义：Anthropic SDK 在 baseURL 后追加 `/v1/messages`，OpenAI SDK 追加 `/chat/completions`——pi 内置的 `opencode-go` 就是同一写法（`.../go/anthropic` vs `.../go/openai/v1`）。`/responses` 先不接，作为后续可选（72 条支持），起步只留一套最少兼容差异的路径。

**元数据缺口**：`/models` 只给 id、name、`context_length`、`supported_endpoints`；`cost` 从价格页取（含峰谷价，pi 的 cost 是静态值，取非高峰价）；`reasoning`、`image` 输入能力、`maxTokens` 上游都不给，先按「`reasoning: false`、`input: ["text"]`、`maxTokens` 用上下文窗口的保守比例」起步，再用真机探测覆盖（见 note 003）。

## 已排除的备选

- **只在 `~/.pi/agent/models.json` 写静态 96 条清单**：也能走 `/login`（无 `apiKey` 时同样生成登录方式），但清单会随上游漂移、体积约数千行，与用户「全量自动生成」直接冲突；仅在扩展路径被证明不可行时作为退路。
- **注册时写 `apiKey: "$CMD_API_KEY"`**：与用户选择的 `/login` 凭据链路冲突，且要求环境变量在启动进程里存在。
- **两个 provider（`commandcode` + `commandcode-anthropic`）**：pi 的模型定义支持模型级 `api`/`baseUrl` 覆盖，拆两个 provider 只会让 `/login` 与 `/model` 里出现两份同名网关。
- **改 pi 本体、把 commandcode 加进内置目录**：违反本域「不改 pi 本体」的既有约定。

## 约束与澄清

- 2026-11-09（原始要求）：参考 pi 当前 provider 的接入方式，接 Command Code，文档见 `https://commandcode.ai/docs/provider`。
- 2026-11-09（已确认，Q1）：凭据用 `/login` 中的 API key 链路（自定义），不走环境变量明文。
- 2026-11-09（已确认，Q2）：模型清单全量 96 条自动生成，不手工挑子集。
- 2026-11-09（跳过，Q3）：API key 本轮不提供，验收时再登录。
- 2026-11-09（决策变更）：本域上一个 Plan（`2026-11-09-pi-toolkit插件`）把「引入自定义 provider seam」列为非范围；本次用户明确要求接入，该非范围条款对本 Plan 失效，理由与取舍见 note 001。

## 范围

- `packages/pi-toolkit/src/provider/`：注册、目录拉取与合并、映射规则、快照持久化、单测与 fixture。
- 本机真机验收：`/login` 登录、`/model` 列全量、一次真实对话与工具调用、成本显示、错误路径表现。
- 本域文档：CONTEXT 的 provider 术语、必要的 question/ADR。

## 非范围

- 改 pi 上游或内置目录；`/responses` 端点；`typesafe/jev` 决策模型（`/v1/systemone`，不属于 chat provider）。
- 峰谷价按时间动态计费（pi 的 cost 为静态值，只取一档）。
- 向他人分发该 provider 配置或密钥。

## 进度

三条 note 全部 completed，Plan 迁 `reference`。

- **002**：`packages/pi-toolkit/src/provider/` 三文件 + 29 个离线单测；`vp check` 零告警；`src/provider` 覆盖率语句 92.27% / 分支 84.07%；真实网络验到 96 条模型与 96 条快照。证据见 [002](002-provider注册与自动目录发现.md)。
- **003**：`/login` 后 `auth.json` 出现 `commandcode`，`pi --list-models` 列 96 条；`deepseek/deepseek-v4-flash` 跑通流式对话与 read 工具调用；Claude 全系与 `gpt-6-astra` 因套餐返回 403 `MODEL_NOT_IN_PLAN`（端点映射正确，Anthropic 信封为证）。证据见 [003](003-登录凭据与真机验收.md)。
- **遗留限制**：`reasoning` 默认关、`image` 只对 3 条按 id 开启、`maxTokens` 是推导值——都因为当前账号可跑的模型只有开源那批，记在 [002](002-provider注册与自动目录发现.md) 的「实现偏差」。

## 恢复入口

- 代码现状：`packages/pi-toolkit/src/provider/`（`commandcode.ts` 纯函数、`fetch-catalog.ts` 网络、`register.ts` 注册），装配在 `src/index.ts`。
- 要加能力（如 `/responses`、修正 `maxTokens`）：先读 [001](001-取证与方案定案.md) 的端点表与 [002](002-provider注册与自动目录发现.md) 的「实现偏差」，改 `CAPABILITY_RULES` / `maxTokensFor` 并补 fixture 单测。
- 要复验：`pi --list-models | grep -c '^commandcode'` 应为 96；`pi -p --model commandcode/deepseek/deepseek-v4-flash "回复两个字"` 应正常返回。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
