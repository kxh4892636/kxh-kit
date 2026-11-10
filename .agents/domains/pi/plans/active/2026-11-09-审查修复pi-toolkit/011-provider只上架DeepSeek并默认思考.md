---
name: "011-provider只上架DeepSeek并默认思考"
description: "Command Code provider 只上架 DeepSeek 模型，思考默认开启、强度按 DeepSeek 官方映射发 reasoning_effort（off 也走该字段）；离线快照从代码重推导能力。已用真实网关请求验证。"
status: completed
related_noted: []
---

# 011-provider只上架DeepSeek并默认思考

## 需求

1. provider 只获取 DeepSeek 的模型。
2. 默认 DeepSeek 都是思考模型，支持文本和图像，思考强度按 https://api-docs.deepseek.com/zh-cn/guides/thinking_mode 配置。

## 交付

- **只上架 DeepSeek**：`parseCatalog` 在入口按厂商过滤（`isDeepSeekModel`：`deepseek/<model>` 或裸 `deepseek-*`）；离线快照 `restoreStored` 同样丢弃他厂条目。目录 97 → 7。
- **思考默认开启、档位可调**：删掉"按 id 猜能力"的 `CAPABILITY_RULES`，改为常量 `deepSeekCapability()`：`reasoning: true`、`thinkingLevelMap`（off→off、minimal/low→low、medium/high/xhigh→high、max→max）、`compat.supportsReasoningEffort`、`compat.requiresReasoningContentOnAssistantMessages`。
- **只发标准 OpenAI 字段**：不设 `thinkingFormat`，因此不发 DeepSeek 原生的 `thinking.type`（实测被网关忽略）。关闭思考走 `reasoning_effort: "off"`，是网关枚举里的合法值。
- **协议收窄**：删掉不可达的 Anthropic 分支，7 个模型全部走 `openai-completions`。
- **能力是派生值，不落盘**：`fromStored` 用同一份常量重新推导，旧快照离线恢复后也获得思考。
- **按 review 逐条收口**：`no DeepSeek models` 报错文案；补回退与形状丢弃测试；合并 `narrowApi`/`isChatApi`；删掉无用的 `Array.isArray(candidate.input)`；更新模块头注释与 README。

## 验收（含真实网关实测）

用 `commandcode` 凭据对 `deepseek/deepseek-v4.1-flash` 发了 16 个极小请求（约 4.7k 输入 / 3k 输出 token，≈ $0.0025）：

| 请求形状 | 结果 |
| --- | --- |
| `reasoning_effort: "high"` + tools | 200，流里出现 `reasoning_content`（122 字）+ content |
| `reasoning_effort: "max"` + tools | 200，reasoning 599 字（撞 256 输出上限：finish=length） |
| `reasoning_effort: "banana"` / `"ultra"` | **400** `param: reasoning_effort`，报错列出枚举 `off/low/medium/high/xhigh/max` |
| `reasoning_effort: "off"`（两次） | 200，**reasoning 0 字**，content 正常 |
| `reasoning_effort: "high"`（同题对照） | 200，reasoning 288 字 |
| `thinking: {"type":"disabled"}` + tools | 200，但 reasoning 仍有 441 字 → **字段被忽略** |
| 带 tools 回放 assistant 缺 `reasoning_content` | 200（DeepSeek 文档说会 400，本网关不强制） |
| 带 tools 回放空 `reasoning_content: ""` | 200 |

结论：`reasoning_effort` 被网关校验并生效，`off` 能真正关闭思考；`thinking.type` 发了也没用，所以不发。

- 目录 97 → 7；每个模型 `api=openai-completions`、`reasoning=true`、`input=text+image`、`thinkingLevelMap` 含 `off:"off"`、`compat` 不含 `thinkingFormat`。
- 旧快照离线恢复后同样得到上述能力；他厂快照条目被丢弃且不抛错。
- 门禁：`vp check` 通过；`vp test` 298 个用例全绿；全局覆盖率 91.33/81.9/92.83/93.63。

## 证据

- 实测命令与输出见上表（临时脚本打真实网关，未记录凭据）。
- 用 jiti 加载真实代码 + 网关 `/provider/v1/models` 实测响应：`目录 97 个 → 通过过滤: 7`。
- 厂商模型表（`commandcode.ai/docs/reference/cli/models`）：7 个 DeepSeek 模型描述都含 reasoning；只有 `deepseek-v4-flash-vision-exp` 与 `deepseek-v4.1-flash` 写作 "reasoning with vision"。

## 已知限制（均已记录）

- **7 个模型都标了 image**：按用户明确决定执行；厂商表只对 2 个声称 vision，其余 5 个贴图可能被上游拒绝。
- **`reasoning_effort` 的效果量不可精确度量**：同一 prompt 下 low 两轮 36/235 字、high 322/215 字、max 336/342 字，噪声大于档位差异；但字段被网关 400 校验过，属于"接受并生效"而非"静默丢弃"。
- **升级后需重选模型**：以前选过 Claude/GPT/Qwen 的会话，刷新后该模型不再存在，需在 `/model` 里改选 DeepSeek（写在 README 迁移提示里）。
