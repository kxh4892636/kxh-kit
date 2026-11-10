---
name: "011-provider只上架DeepSeek并默认思考"
description: "Command Code provider 只上架 DeepSeek 模型，并把思考当成默认能力：全部 reasoning=true、text+image 输入、thinkingLevelMap 按 DeepSeek 官方映射，离线快照也从代码重新推导能力。"
status: completed
related_noted: []
---

# 011-provider只上架DeepSeek并默认思考

## 需求

1. provider 只获取 DeepSeek 的模型。
2. 默认 DeepSeek 都是思考模型，支持文本和图像，思考强度按 https://api-docs.deepseek.com/zh-cn/guides/thinking_mode 配置。

## 交付

- `provider/commandcode.ts`：`parseCatalog` 在入口过滤厂商，新增 `isDeepSeekModel`（`deepseek/<model>` 或裸 `deepseek-*`）；删掉“按 id 猜能力”的 `CAPABILITY_RULES`/`capabilitiesFor`，改为常量 `deepSeekCapability(api)`：`reasoning: true`、`input: ["text","image"]`、`thinkingLevelMap`（minimal/low→low、medium/high/xhigh→high、max→max）、OpenAI 协议下的 `compat`（`thinkingFormat: "deepseek"`、`supportsReasoningEffort`、`requiresReasoningContentOnAssistantMessages`）。
- `provider/register.ts`：离线快照 `restoreStored` 丢弃非 DeepSeek 条目；`fromStored` 用同一份 `deepSeekCapability` 重新推导能力（能力是派生值，不落盘），旧快照因此无需重新联网就能获得思考。
- 测试：`commandcode.test.ts` 加 `isDeepSeekModel` 与能力/映射断言；`fetch-catalog.test.ts` 覆盖“目录里只有别的厂商时抛 no models”；`register.test.ts` 覆盖丢弃他厂快照与旧快照重推导。

## 验收

- 真实网关目录 97 个模型，只上架 7 个 DeepSeek。
- 每个上架模型都是思考模型、接受文本与图像、能映射到 DeepSeek 的 low/high/max。
- 旧快照（`reasoning: false`、`input: ["text"]`）离线恢复后也变成思考模型。

## 证据

- 用 jiti 加载真实代码 + `/tmp/cc-models.json`（网关 `/provider/v1/models` 的实测响应）：`目录 97 个 → 通过过滤: 7`，7 条全部 `reasoning=true`、`input=text+image`、`compat=deepseek`、同一份 effort 映射。
- `pnpm --filter @kxh4892636/pi-toolkit check` 通过；`test` 25 个文件 / 296 个用例全绿（原 290）。
- 官方文档核对：`thinking` 开关 + `reasoning_effort`（low/high/max）与 minimal→low、medium→high、xhigh→high、max→max 的映射；带 tools 时 `reasoning_content` 必须回传，否则 400 → 对应 `requiresReasoningContentOnAssistantMessages: true`。

## 已知风险（用户已确认取舍）

- 6 个非视觉模型也标了 `image`：若上游拒绝图像输入，贴图会直接报错。按用户要求“默认支持文本和图像”执行。
- 网关是否接受 `thinking.type` / `reasoning_effort` 尚未真机验证；验证方式是一次真实请求，失败则回退到只发 `reasoning_effort` 或关掉能力常量。
