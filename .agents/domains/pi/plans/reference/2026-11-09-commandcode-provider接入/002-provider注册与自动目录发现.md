---
name: '002-provider注册与自动目录发现'
description: '在 pi-toolkit 新增 provider 模块：注册 commandcode、拉全量模型目录并合并价格、按端点映射 api 与 baseUrl、持久化快照，附单测。'
status: 'completed'
related_noted: ['001-取证与方案定案', '003-登录凭据与真机验收']
next_step: '接 003：用户 /login 输入 key 后核条数与真实会话'
---

# 002-provider注册与自动目录发现

## 交付物

| 文件 | 职责 |
|---|---|
| `packages/pi-toolkit/src/provider/commandcode.ts` | 纯函数：`parseCatalog`、`normalizeKey`、`extractPrices`、`matchPrice`、`apiFor`、`toProviderModels`；常量与端点 |
| `packages/pi-toolkit/src/provider/fetch-catalog.ts` | 网络层：拉 `/models`（必须成功）、拉价格页（失败降级为空价格）、合并成模型列表 |
| `packages/pi-toolkit/src/provider/register.ts` | `pi.registerProvider("commandcode", …)`：不写 `apiKey`、`refreshModels` 拉目录、失败回退快照、成功 `publish({ persist })` |
| `packages/pi-toolkit/src/index.ts` | 装配处调用 `registerCommandCodeProvider(pi)` |
| `src/provider/*.test.ts` | 29 个单测，全部离线（注入 `fetchImpl`） |

实现要点与 note 001 的决定一致；两处与计划不同的地方在下方「实现偏差」。

## 验证证据

- **类型与格式**：`cd packages/pi-toolkit && vp check` → `Found no warnings, lint errors, or type errors in 68 files`。
- **单测**：`vp test --run src/provider src/index.test.ts` → 39 passed；含新增 `index.test.ts` 断言「provider 已注册且没有 apiKey」。
- **覆盖率**（`vp test --run src/provider --coverage`）：`src/provider` 语句 92.27%、分支 84.07%、函数 100%、行 96.64%。
- **真机目录**（`node --experimental-strip-types .tmp/probe-register.ts`，走 `piToolkit` 默认导出 → 注册 → `refreshModels` → 真实网络）：provider id `commandcode`、`apiKey` 为空、**96 个模型**、persist 落 96 条；抽样 `claude-sonnet-5-5` → `anthropic-messages` + `https://api.commandcode.ai/provider` + cost.input 2；`gpt-6-astra` → `openai-completions` + `.../provider/v1` + cost.input 10。
- **价格匹配**：96 条里 93 条拿到价格，3 条为 0 价——`stealth/glyph-cluster:free`、`stealth/crouton-alpha`、`reflection/beam:free`，与价格页「这三个是免费/预览」一致，不是匹配失败。

## 实现偏差（相对 note 001 的计划）

1. **`pi --list-models` 无法用于核对条数**：该命令只列已配置凭据的 provider，未登录时 `commandcode` 一条都不出现（实测 `grep -c` 为 0）。条数核对改到 note 003 登录后做，本轮用 `refreshModels` 的真实输出作证据。
2. **目录失败且无快照时改为抛错**：初版是静默返回空列表，会让 provider 变成「存在但没有任何模型」的哑状态；现在只有存在快照时才吞错。
3. **`reasoning` 默认 `false`**：上游不公布 thinking 支持，发错字段会 400；只对 id 里明写 `vision`/`-vl`/`omni` 的三条置 `image`+`reasoning`。这条是已知功能缺口，等 003 探测后扩覆盖表。

## 审查结论（ponytail-review 视角）

- **已修**：目录失败时静默空目录 → 改为无快照即抛错，并补一条会红的单测。
- **保留**：`maxTokens` 取 `min(窗口/8, 64000)` 是推导值，上游不公布真实上限；003 探测后再校正。
- **保留**：价格只取非高峰价，峰时成本会低估；pi 的 `cost` 是静态值，动态计费不在本 Plan 范围。
- **保留**：`matchPrice` 用「归一化后前缀包含、取最长」兜日期后缀与 `-Preview` 差异，跨家族误配风险靠「精确命中优先」压制。

## 相关

- [001-取证与方案定案](001-取证与方案定案.md) — 端点、baseUrl 与凭据链路的证据在这里。
- [003-登录凭据与真机验收](003-登录凭据与真机验收.md) — 登录后核条数并探测 reasoning/image/maxTokens。
