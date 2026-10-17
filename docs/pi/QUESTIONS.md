# pi 常见问题

## pi 插件的能力边界

- 适用条件与现象：需要让 pi 做内建能力之外的事（自动改名、拦截输入、注册工具/命令、发现嵌套 skill 等）。
- 原因：pi 以扩展接缝（事件 + 方法面）开放能力，不能改动 pi 本体。
- 解决方法：以工作区独立包开发，`package.json` 的 `pi.extensions` 指向入口 TS，经 `pi install` 安装；用 `pi.on()` 挂事件、`pi.registerTool()` / `pi.registerCommand()` 扩展能力。
- 验证：`pi --extension <path>` 本地加载可直接调试；安装后经真机会话验证。
- 来源：pi `docs/extensions.md`、`docs/packages.md`；本域 ADR-0001、ADR-0002。

## 扩展 handler 会不会阻塞首轮对话

- 适用条件与现象：在 `input` 等前置事件里做网络调用（如再调一次模型）时，担心拖慢用户提交。
- 原因：`input` 处理器会被 `await` 后才启动 run，同步等待会串行阻塞。
- 解决方法：处理器内以 fire-and-forget 方式发起耗时逻辑，立即返回 `{ action: "continue" }`；仅把必须在提交前完成的文本变换放进 `transform`。
- 验证：真机观察提交到模型首响的时间未因附加逻辑增加。
- 来源：pi `docs/extensions.md`「Respect the runtime lifecycle」；`pi-nested-skill` 的 `input` 用法。

## 为什么 pi-deepseek-web 改走 DeepSeek 官方 Search/Fetch API

- 适用条件与现象：需要 `web_search` / `web_fetch` 的实时网页能力，又不希望搜索依赖一次模型轮次或直连抓取的转换链路。
- 原因：原搜索经 Anthropic 兼容 Messages 的 `web_search_20250305` 服务端工具，每次多一次模型轮次且依赖模型触发；原抓取直连 HTTP + turndown，维护 content-type、字节限额与 HTML 转换。DeepSeek 官方 Search 直接返回结构化结果，Fetch 直接返回 Markdown。
- 解决方法：两个工具都调用 `POST {baseURL}/v1/tools/{search|fetch}`，共用 Bearer 鉴权、超时与错误解析；删除 turndown 依赖；`baseURL` 默认 `https://api.deepseek.com`，旧 `/anthropic/v1` 显式报错。
- 验证：单测覆盖请求/响应/错误/超时；本机 `pi -p` 实测 Search 返回 `Sources:`、Fetch 返回 `URL:`/`Title:`/正文；见 Plan `2026-10-17-DeepSeek官方搜索接口`。
- 来源：官方 [Search & Fetch 指南](https://api-docs.deepseek.com/zh-cn/guides/search)、[Search API](https://api-docs.deepseek.com/zh-cn/api/search)、[Fetch API](https://api-docs.deepseek.com/zh-cn/api/fetch)；本域 ADR-0003。

## web_search 如何暴露官方请求体、搜索语法与响应

- 适用条件与现象：模型需要按官方能力使用搜索语法，或需要读取除标题/链接外的摘要、正文、评分、权威性等字段。
- 原因：`web_search` 的工具 schema 与 `details` 若不覆盖官方字段，模型只能使用被裁剪的子集，无法表达 `need_content`、`ori_question` 等意图。
- 解决方法：参数暴露 `query`、`count`、`ori_question`、`localization`、`need_content`；`query` 描述列出 `site:`、`-site:`、`-`、`-"..."`、`"..."`、`lang:`、`after:`、`before:`；`details` 返回 `{ count, results }`，保留官方全部字段；文本投影展示摘要/片段、评分、权威性、站点、日期，`need_content: true` 时追加 `Content:`。
- 验证：`src/index.test.ts` 断言 schema 与字段透传；真机会话 jsonl 中 toolCall 含 `ori_question`/`need_content`，toolResult 含评分与 `Content:`。
- 来源：官方 Search 请求/响应字段与搜索语法；`packages/pi-deepseek-web/src/index.ts`、`src/search.ts`、`src/format.ts`。
