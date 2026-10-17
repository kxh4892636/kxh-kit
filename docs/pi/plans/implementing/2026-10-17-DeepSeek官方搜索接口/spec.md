---
status: completed
---

# DeepSeek 官方搜索接口迁移

## 问题

`packages/pi-deepseek-web` 的 `web_search` 仍经 DeepSeek Anthropic 兼容 Messages 端点、以 `web_search_20250305` 服务端工具触发搜索：每次搜索先消耗一次模型轮次，结果依赖模型是否触发工具，且来源与摘要要从 `web_search_tool_result` 与 citations 二次拼装。`web_fetch` 则直连 HTTP 并用 turndown 转 Markdown。DeepSeek 已上线官方 Search/Fetch API，直接返回结构化搜索结果与 Markdown 正文，适合替换这两条链路。用户已确认两个 API 全部切换，并要求以官方指南为重构依据，把对应的请求体、搜索语法与响应结构暴露到工具契约中。关联 US-001、US-002。

## 方案

把两个工具统一迁移到 DeepSeek 官方 Search/Fetch API，保留配置优先级与凭据回退：

- 新增 `src/http.ts`：共享 `POST` JSON、Bearer 鉴权、超时/取消、错误解析与端点拼接。
- `src/search.ts`：调用 `POST {baseURL}/v1/tools/search`，请求体覆盖官方字段 `query`、`count`、`ori_question`、`localization`、`need_content`；响应保留官方 `results[]` 全部字段，按 URL 去重。
- `src/fetch.ts`：改为调用 `POST {baseURL}/v1/tools/fetch`，请求 `{ url }`；返回标题与 Markdown 正文，按 `fetchMaxContentChars` 截断。
- `src/config.ts`：`baseURL` 默认 `https://api.deepseek.com`；新增 `searchCount`、`fetchMaxContentChars`、`timeoutMs`；移除 `model`、`apiVersion`、`maxTokens`、`maxUses`、`fetchMaxResponseBytes`、`fetchMaxBodyChars`、`fetchTimeoutMs`。
- `src/format.ts` 去掉搜索 answer/truncated 分支；`src/index.ts` 的 `web_search` 参数覆盖官方请求体，`web_fetch` 改用官方响应 details。
- 删除 turndown 依赖与 `src/turndown-plugin-gfm.d.ts`；包版本升至 `0.2.0`，更新 README、示例配置与本机用户配置；新增 ADR-0003。
- 真机验证 Search 与 Fetch 各一次。

## 已排除的备选

- **继续使用 Anthropic Messages + `web_search_20250305`**：多做一次模型轮次，依赖模型触发工具，结果需要 citations 二次拼装；官方 Search API 已直接提供结构化结果，拒绝。
- **`web_fetch` 保持直连 + turndown**：官方 Fetch API 已提供 Markdown 正文，保留直连会多维护一套抓取/解码/转换链路与两个运行时依赖；用户已确认全部切换，拒绝。
- **官方 Fetch 失败时回退直连 HTTP**：保留两套 transport、两套限额与两套错误面，复杂度与测试成本翻倍；错误可由模型重试或换 URL，拒绝。
- **默认 `need_content: true` 或总是返回正文**：10 条结果正文可能远大于摘要，放大上下文成本；保留官方默认 false，仅在模型显式请求时返回正文，拒绝。
- **只暴露 `query` / `count`、隐藏其余官方请求字段**：用户要求工具契约包含官方请求体、搜索语法与响应；隐藏 `ori_question` / `localization` / `need_content` 会使工具无法表达官方能力，拒绝。
- **对 429/5xx 自动重试**：隐藏延迟且与 pi 的取消语义叠加；错误带上状态与官方 message，由模型决定是否重试，拒绝。
- **新增 `searchBaseURL` 并让旧 `baseURL` 静默失效**：多一个近义配置项，旧配置会无声 404；改为在加载时识别旧 Anthropic 端点并报可操作错误，拒绝。
- **把 `baseURL` 固定为根地址、拒绝带 `/v1` 的输入**：代理或版本化地址会多一层 `/v1`；`toolEndpoint` 同时接受根地址与已带 `/v1` 的地址，拒绝隐式猜测。

## 实施决策

### 配置（`src/config.ts`）

保留既有路径优先级：`getAgentDir()/pi-deepseek-web.json` < `<cwd>/.pi/pi-deepseek-web.json`（仅项目受信时）< `$PI_DEEPSEEK_WEB_CONFIG`。

| 字段                   | 默认                       | 说明                                                      |
| ---------------------- | -------------------------- | --------------------------------------------------------- |
| `apiKey`               | —                          | 字面 DeepSeek API key。                                   |
| `apiKeyEnv`            | `DEEPSEEK_API_KEY`         | `apiKey` 缺失时读取的环境变量名。                         |
| `baseURL`              | `https://api.deepseek.com` | 官方 API 根地址；可带 `/v1`，端点由 `toolEndpoint` 拼接。 |
| `searchCount`          | `10`                       | `web_search` 未传 `count` 时的默认条数，1–50。            |
| `fetchMaxContentChars` | `100000`                   | `web_fetch` 返回正文的字符上限。                          |
| `timeoutMs`            | `30000`                    | Search/Fetch 单次请求超时。                               |

- 移除 `model`、`apiVersion`、`maxTokens`、`maxUses`、`fetchMaxResponseBytes`、`fetchMaxBodyChars`、`fetchTimeoutMs`；配置文件中的未知字段继续忽略，旧字段不报错。
- `baseURL` 校验：必须是绝对 `http(s)` URL，不含 query/hash；去掉末尾 `/`；若路径包含 `/anthropic`，抛出「旧 Anthropic 端点不再支持，请设为 `https://api.deepseek.com`」类错误。
- `searchCount` 用 1–50 的整数校验；`fetchMaxContentChars`、`timeoutMs` 用正整数校验；非法值报错并列出配置路径。
- `requireApiKey` 同时服务 `web_search` 与 `web_fetch`，错误信息改为「DeepSeek web tools have no API key」并列出配置路径与 `apiKeyEnv`。

### 共享 HTTP（`src/http.ts`）

- `toolEndpoint(baseURL, tool)`：`baseURL` 已以 `/v1` 结尾时返回 `${base}/tools/${tool}`，否则返回 `${base}/v1/tools/${tool}`；`tool` 为 `search` / `fetch`。
- `postJson<T>({ endpoint, apiKey, body, timeoutMs, signal, fetchImpl, label })`：
  - `POST`，`redirect: "error"`；请求头 `authorization: Bearer <key>`、`content-type: application/json`、`accept: application/json`、`user-agent: pi-deepseek-web/0.2.0`。
  - 超时用 `AbortSignal.timeout(timeoutMs)`；有调用方 signal 时用 `AbortSignal.any` 合并。
  - 网络失败、超时、取消、非 2xx、JSON 不可读均抛错；错误包含 `label`、HTTP 状态、官方 `error.message`（若有）与 endpoint。
  - 取消错误为 `${label} was aborted`；超时为 `${label} timed out after ${timeoutMs}ms`。

### 搜索（`src/search.ts`）

- 端点：`toolEndpoint(config.baseURL, "search")`。
- 请求体：`{ query, count }` 始终发送；`ori_question`、`localization`、`need_content` 仅在工具提供时发送，未提供时交给官方默认值。
- 参数校验：`query` 为 1–128 个 Unicode 字符且不能全为空白；`ori_question` 为 1–128 字符；`count` 为 1–50 整数；`need_content` 为布尔值。
- 响应类型：`SearchApiResponse { results?: SearchApiResult[] }`，`SearchApiResult` 保留官方全部字段：`rerank_score`、`title`、`url`、`snippet`、`summary`、`content`、`site_name`、`site_icon`、`date`、`authority`。`results` 缺失或非数组视为不可读响应并报错，空数组视为无结果。
- 映射：跳过空 URL；按 URL 去重；字符串字段去首尾空白；`site_name`/`date` 为 null 时保留为 null；不丢 `snippet`、`summary`、`content`、`site_icon`、`authority`、`rerank_score`。
- 返回 `{ count, results }`；`count` 为实际请求条数，`results` 为完整官方结果数组。

### 抓取（`src/fetch.ts`）

- 端点：`toolEndpoint(config.baseURL, "fetch")`。
- URL 校验：非空、长度 ≤ 8192、绝对 `http(s)`、含 host、不含用户名/密码；校验后以 `URL.toString()` 发送。
- body：`{ url }`；响应 `{ title?: string, content?: string }`。
- `content` 必须为字符串；按 `fetchMaxContentChars` 截断并标记 `truncated`；`title` 去空白，空串视为缺失。
- 返回 `{ url, title?, content, truncated }`；不再返回 HTTP 状态与 content-type。

### 投影（`src/format.ts` 与 `src/index.ts`）

- `formatSearchOutput(result)`：untrusted 提示 + `Sources:` 列表；每条包含标题/URL、`summary`（缺失时回退 `snippet`）、站点、日期、`rerank_score` 与 `authority`；`content` 非空时追加正文；空结果输出 `No results found.`；末尾保留引用提示。
- `formatFetchOutput(page)`：untrusted 提示 + `URL:` + 可选 `Title:` + 正文（空则 `(empty body)`）+ 截断提示。
- `web_search` schema：`query`（含官方搜索语法说明）、`count?`、`ori_question?`、`localization?`、`need_content?`；描述列出端点、请求体与响应字段；`promptGuidelines` 说明搜索语法、`need_content` 的上下文代价与 `ori_question` 的用途。
- `web_fetch` schema 不变；描述改为官方 Fetch API（请求 `{ url }`、响应 `{ title, content }`）；`details` 为 `{ url, title?, content, truncated }`。
- 两个工具都调用 `requireApiKey`。

### 包与文档

- `package.json`：版本 `0.2.0`；描述改为官方 Search/Fetch API；删除 `turndown`、`@joplin/turndown-plugin-gfm`、`@types/turndown`，更新 lock。
- 删除 `src/turndown-plugin-gfm.d.ts`。
- README：更新端点、字段表、计费/QPS 提示、旧配置迁移、示例；说明 `web_fetch` 也走官方 Fetch API，原始文本文件可能返回 404。
- `pi-deepseek-web.example.json`：`baseURL` 改为官方根地址，去掉 `model`，补 `searchCount`、`fetchMaxContentChars`、`timeoutMs`。
- 本机 `~/.pi/agent/pi-deepseek-web.json`：保留 `apiKey`，`baseURL` 改为 `https://api.deepseek.com`，删除 `model`；不在任何输出或提交中出现 key。
- 新增 `docs/pi/adr/0003-搜索与抓取改用DeepSeek官方API.md`；更新 `docs/pi/CONTEXT.md` 的搜索/抓取术语与配置说明、`docs/pi/QUESTIONS.md` 的问答（为何迁移、为何不保留直连 fetch）。

## 工作环境

- 仓库：`C:/Users/kxh/kxh-awesome/projects/kxh-kit`，pnpm workspace；Node `>=22.12.0`（本机 v24）。
- 包：`packages/pi-deepseek-web`，jiti 直载 TS；本机 `~/.pi/agent/settings.json` 的 `packages` 已指向该目录。
- 凭据：`~/.pi/agent/pi-deepseek-web.json` 已有用户提供的 `apiKey`；文档与提交只写路径，不写值。
- 官方 API：`https://api.deepseek.com/v1/tools/search`、`/v1/tools/fetch`；Search/Fetch 各 5 QPS，按成功请求计费。
- 门禁命令（工作目录 `packages/pi-deepseek-web` 或仓库根）：
  - `pnpm --filter @kxh4892636/pi-deepseek-web test`
  - `pnpm --filter @kxh4892636/pi-deepseek-web run test:coverage`（阈值 80）
  - `pnpm --filter @kxh4892636/pi-deepseek-web run check`
- 真机：`pi -p` 驱动 `web_search` 与 `web_fetch`，检查会话 jsonl；配置改动对下次 pi 启动生效。

## 范围

- `packages/pi-deepseek-web` 的 `src/{config,http,search,fetch,format,index}.ts`、对应测试、`README.md`、`pi-deepseek-web.example.json`、`package.json` 版本与描述、依赖/lock。
- 删除 `src/fetch.ts` 的直连实现与 `src/turndown-plugin-gfm.d.ts`。
- 本机用户配置文件迁移（仅字段调整，不提交）。
- 本 Plan、ADR-0003、`docs/pi/CONTEXT.md`、`docs/pi/QUESTIONS.md` 的同步更新。
- 真机 Search/Fetch 冒烟、code review、commit。

## 非范围

- 修改 pi 上游、`pi-nested-skill`、DSH 插件或其他包。
- 自动重试/退避、代理、`ori_question`/`localization`/`need_content` 的额外配置默认值、结果分页。
- npm 发布、跨平台打包、图片/PDF 抓取。
- 直连 HTTP 作为官方 Fetch 失败时的 fallback。

## 执行约束

- 模式：`auto`；dev gate 已于 2026-10-17 确认「两个 api 全部切换, 然后允许更新, go」。
- 固定比较点：`main @ d1de674c`；基线 `pnpm --filter @kxh4892636/pi-deepseek-web test` 43/43 通过、`check` 通过（2026-10-17）。
- 质量门禁（最小集合）：`test` 全绿、增量覆盖率 ≥ 80%、`check` 通过、code review（Spec + Standards 两路 subagent）、真机 Search + Fetch 各一次、`check-domain` 新增 Plan 无错误。
- 交付物：代码、测试、文档、本机配置迁移、commit；是否 push 由用户确认。
- 停止点：真机验证前不删除/覆盖用户配置文件中的 key；门禁未全绿不标记完成。

## 待定

无。Q1（两个 API 全部切换）与 Q2（允许更新本机配置）已于 2026-10-17 dev gate 确认。

## 上下文

- [story](story.md)
- [pi 业务域 CONTEXT](../../../CONTEXT.md)、[QUESTIONS](../../../QUESTIONS.md)
- [ADR-0002](../../../adr/0002-搜索密钥落用户配置与直连抓取.md)（配置文件边界的既有决策）
- [上一 Plan：pi-deepseek-web 插件](../../reference/2026-09-18-pi-deepseek-web插件/spec.md)
- 官方指南：https://api-docs.deepseek.com/zh-cn/guides/search
- 官方 Search 参考：https://api-docs.deepseek.com/zh-cn/api/search
- 官方 Fetch 参考：https://api-docs.deepseek.com/zh-cn/api/fetch
- 代码：`packages/pi-deepseek-web/src/{config,http,search,fetch,format,index}.ts`
- 本机安装：`~/.pi/agent/settings.json`；配置：`~/.pi/agent/pi-deepseek-web.json`

## 当前进度

截至 2026-10-17，交付完成；Plan 位于 `implementing`，归档 `reference` 待用户确认。

- 已完成：官方 Search/Fetch 实测与 dev gate；代码与测试迁移；README/example/ADR-0003/CONTEXT/QUESTIONS 同步；本机配置迁移；`test` 59/59、覆盖率 statements 99 / branches 93.18 / functions 100 / lines 98.88、`check` 通过；真机 Search（含 `need_content`）与 Fetch；Spec/Standards 两路 code review 及修复；lock 仅清理 turndown 依赖。
- 未开始：无。
- 未验证：无（真机会话路径与证据见 [01 note](01-搜索接口迁移与真机验证.md)「交付记录」）。
- 待确认：push；Plan 归档 `reference`。

## 恢复入口

1. 交付已完成；如需变更，读 [01 note](01-搜索接口迁移与真机验证.md) 的「决策与证据」「交付记录」。
2. 核对现场：`git -C C:/Users/kxh/kxh-awesome/projects/kxh-kit log -1 --stat`；`packages/pi-deepseek-web/src/{search,fetch,http}.ts` 是否仍调用官方 `/v1/tools/*`；本机配置是否为 `baseURL = https://api.deepseek.com`。
3. 变更时从 `src/config.ts`、`src/http.ts` 入手，同步 `search.ts`/`fetch.ts`、`format.ts`、`index.ts` 与测试；完成后重跑门禁。
4. 前置：workspace 依赖已安装；`~/.pi/agent/pi-deepseek-web.json` 含有效 key；官方 API 可访问。
5. 预期结果：`test`/覆盖率/`check` 通过，真机 Search 返回 `Sources:`、Fetch 返回 `URL:`/`Title:`/正文；停止条件为门禁全绿且文档同步。

## Notes

| #   | Notes                                                  | 状态      | 阻塞于 | 下一步        |
| --- | ------------------------------------------------------ | --------- | ------ | ------------- |
| 01  | [搜索接口迁移与真机验证](01-搜索接口迁移与真机验证.md) | completed | —      | 用户确认 push |
