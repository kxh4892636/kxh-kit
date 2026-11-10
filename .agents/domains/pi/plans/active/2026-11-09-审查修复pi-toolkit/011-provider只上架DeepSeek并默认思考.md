---
name: "011-provider只上架DeepSeek并默认思考"
description: "Command Code provider 只上架 DeepSeek 模型，思考默认开启并按 DeepSeek 官方映射发 reasoning_effort；离线快照从代码重新推导能力。已按 ponytail-review 的 10 条发现收口。"
status: completed
related_noted: []
---

# 011-provider只上架DeepSeek并默认思考

## 需求

1. provider 只获取 DeepSeek 的模型。
2. 默认 DeepSeek 都是思考模型，支持文本和图像，思考强度按 https://api-docs.deepseek.com/zh-cn/guides/thinking_mode 配置。

## 交付

- **只上架 DeepSeek**：`parseCatalog` 在入口按厂商过滤（`isDeepSeekModel`：`deepseek/<model>` 或裸 `deepseek-*`）；离线快照 `restoreStored` 同样丢弃他厂条目。目录 97 → 7。
- **思考默认开启**：删掉"按 id 猜能力"的 `CAPABILITY_RULES`，改为常量 `deepSeekCapability()`：`reasoning: true`、`thinkingLevelMap`（minimal/low→low、medium/high/xhigh→high、max→max）、`compat.supportsReasoningEffort`、`compat.requiresReasoningContentOnAssistantMessages`。
- **只发标准 OpenAI 字段**：不设 `thinkingFormat`，因此不发 DeepSeek 原生的 `thinking.type`（网关没有公布该字段的请求契约，发错会让每个请求都失败）。代价是 `off` 无法关闭思考 —— 所以 `thinkingLevelMap.off = null`，pi 的等级列表里不出现 `off`，最低可选 `minimal`。
- **协议收窄**：删掉不可达的 Anthropic 分支（`ANTHROPIC_BASE_URL`、`apiFor`、`baseUrlFor`），7 个模型全部走 `openai-completions`。
- **能力是派生值，不落盘**：`fromStored` 用同一份常量重新推导，旧快照（`reasoning: false`、`input: ["text"]`）离线恢复后也获得思考。
- **按 review 逐条收口**：`no DeepSeek models` 报错文案；补回退测试（目录全是他厂 + 有快照）；合并 `narrowApi`/`isChatApi` 为一个 `isOpenAIChatApi`；删掉 `fromStored` 里已无用的 `Array.isArray(candidate.input)` 形状校验；更新模块头注释；README 补 `## Command Code provider` 段（含升级后需重选模型的迁移提示）。

## 验收

- 真实网关目录 97 个模型 → 只上架 7 个 DeepSeek。
- 每个上架模型：`reasoning: true`、`input: text+image`、`thinkingLevelMap` 含 off:null、`compat` 不含 `thinkingFormat`、`api: openai-completions`。
- 旧快照离线恢复后同样得到上述能力；他厂快照条目被丢弃且不抛错。
- 门禁：`vp check` 通过；`vp test` 298 个用例全绿；全局覆盖率 91.33/81.9/92.83/93.63；**增量覆盖率 9/9 = 100%**（门槛 80%）。

## 证据

- 用 jiti 加载真实代码 + 网关 `/provider/v1/models` 实测响应：`目录 97 个 → 通过过滤: 7`，7 条全部 `api=openai-completions`、`reasoning=true`、`input=text+image`、`compat` 无 `thinkingFormat`、`off:null`。
- 按 pi 的 `getSupportedThinkingLevels` 逻辑复算：可选等级 = `minimal / low / medium / high / xhigh / max`（`off` 已隐藏）。
- 官方文档核对：`reasoning_effort` 取值 low/high/max，映射表 minimal→low、medium→high、xhigh→high、max→max；带 tools 时必须回传 `reasoning_content`，否则 400 → 对应 `requiresReasoningContentOnAssistantMessages: true`。
- 厂商模型表（`commandcode.ai/docs/reference/cli/models`）：只有 `deepseek-v4-flash-vision-exp` 与 `deepseek-v4.1-flash` 写作 "reasoning with vision"。

## 已知限制（均已记录）

- **7 个模型都标了 image**：按用户明确决定执行；厂商表只对 2 个声称 vision，其余 5 个贴图可能被上游拒绝。
- **无法关闭思考**：只发 `reasoning_effort`、不发 `thinking.type`，所以 `off` 不提供；换成原生 `thinking` 字段需要先验证网关接受它。
- **`reasoning_effort` 未真机验证**：它是标准 OpenAI 字段，网关文档对外宣称支持 effort 控制，但没有公开 `/provider/v1` 的字段契约；一次带 tools 的真实请求即可确认。
- **升级后需重选模型**：以前选过 Claude/GPT/Qwen 的会话，刷新后该模型不再存在，需在 `/model` 里改选 DeepSeek（写在 README 迁移提示里）。
