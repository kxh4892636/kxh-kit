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
- 来源：pi `docs/extensions.md`「Respect the runtime lifecycle」；`pi-toolkit` 的 `input` 用法。

## 为什么 pi-toolkit 的 web 工具改走 DeepSeek 官方 Search/Fetch API

- 适用条件与现象：需要 `web_search` / `web_fetch` 的实时网页能力，又不希望搜索依赖一次模型轮次或直连抓取的转换链路。
- 原因：原搜索经 Anthropic 兼容 Messages 的 `web_search_20250305` 服务端工具，每次多一次模型轮次且依赖模型触发；原抓取直连 HTTP + turndown，维护 content-type、字节限额与 HTML 转换。DeepSeek 官方 Search 直接返回结构化结果，Fetch 直接返回 Markdown。
- 解决方法：两个工具都调用 `POST {baseURL}/v1/tools/{search|fetch}`，共用 Bearer 鉴权、超时与错误解析；删除 turndown 依赖；`baseURL` 默认 `https://api.deepseek.com`，旧 `/anthropic/v1` 显式报错。
- 验证：单测覆盖请求/响应/错误/超时；本机 `pi -p` 实测 Search 返回 `Sources:`、Fetch 返回 `URL:`/`Title:`/正文；见 Plan `2026-10-17-DeepSeek官方搜索接口`。
- 来源：官方 [Search & Fetch 指南](https://api-docs.deepseek.com/zh-cn/guides/search)、[Search API](https://api-docs.deepseek.com/zh-cn/api/search)、[Fetch API](https://api-docs.deepseek.com/zh-cn/api/fetch)；本域 ADR-0003。

## web_search 如何暴露搜索语法与来源

- 适用条件与现象：模型需要按官方能力使用搜索语法，并读取每条来源的摘要、日期与链接。
- 原因：工具 schema 只暴露 `queries`，把条数上限、摘要长度、超时等部署策略留在 JSON；若把 `count`、`need_content`、`ori_question` 暴露给模型，模型可越过部署策略，也增加参数选择成本。
- 解决方法：模型参数只有 `queries: string[]`（至少一条、至多 `searchMaxQueries`、去重）；每次请求发送 `count = min(searchCount, searchMaxResults)`、`need_content: false`，并把当前会话最新的用户消息折叠为 `ori_question`（≤128 字）；`details` 为 `{ content?, sources[], truncated }`，来源投影为 `{ url, title?, snippet?, summary?, publishedAt? }`；文本用 `summary`（退化到 `snippet`）加发布日期。
- 验证：`packages/pi-toolkit/src/web/register.test.ts` 断言 schema 只有 `queries` 且请求携带 `count`/`need_content`/`ori_question`；`search.test.ts` 覆盖合并、去重、封顶与摘要截断；`format.test.ts` 覆盖文本投影。
- 来源：官方 [Search & Fetch 指南](https://api-docs.deepseek.com/zh-cn/guides/search)；本域 ADR-0003；`packages/pi-toolkit/src/web/{register,search,format}.ts`。

## pi-toolkit 怎么启停能力，开关什么时候生效

- 适用条件与现象：安装后 `web_search` 不存在、`$` 不补全、嵌套 skill 不出现、会话不自动命名；或在 `/toolkit` 打开开关后行为没有完全变化。
- 原因：四个开关默认全关；`session_start` 才加载 `pi-toolkit.json`；嵌套发现与 Orchestrator skill 走 `resources_discover`（启动与 `/reload` 才扫描），其余能力在 `input`、工具调用或补全请求时读取开关。
- 解决方法：`/toolkit` 提供 `Web tools`、`Nested skills`、`Session naming`、`Orchestrator` 四行开关；`Web tools` 切换即增删活动工具，命名与 `$` 补全/展开下一次输入生效，嵌套发现与 Orchestrator skill 需再执行 `/reload`。
- 验证：`panel.test.ts` 断言 4 行与非 TUI 提示；`index.test.ts` 断言默认关闭、开启后激活与写回；真机 `pi install` + 启动。
- 来源：本域 ADR-0004；Plan `2026-11-07-pi-toolkit插件合并`；`packages/pi-toolkit/src/{panel,index,settings}.ts`。

## orchestrator 在 pi-toolkit 里怎么启停与清空上下文

- 适用条件与现象：需要在 pi 里运行 Plan/story/spec/notes DAG 交付流程；或达到上下文阈值后期望继续同一 Plan 而不是新建会话。
- 原因：pi 没有 agent preset 注册表，`ctx.newSession` 只在命令上下文可用，也没有删除会话的扩展 API；因此不能用 DSH 的预设与自动轮转。
- 解决方法：`/toolkit` 打开 `Orchestrator` 开关，再执行 `/orchestrator` 选择 `开` / `关`（Enter 只改当前会话，`Ctrl+S` 同时写 `orchestrator.always` 作为新会话默认）。模式生效时注入固定提示词、激活 `orchestrator_*` 与 `ask_questions`、取消 pi 压缩；`getContextUsage()` 达到 `rotateAt` 时追加 `orchestrator-reset`，`context` 只保留标记后的消息并前置恢复种子。查询用 `/orchestrator status` 与 `orchestrator_read`。
- 验证：`register.test.ts` 覆盖开关、模式、flag、收口与清空；真实 pi 会话 JSONL 含 `orchestrator_*`、`ask_questions`、`orchestrator` section 与 `orchestrator-reset` entry。
- 来源：本域 ADR-0005；Plan `2026-11-07-NanoFlow迁移到pi-toolkit`；`packages/pi-toolkit/src/orchestrator/`。

## orchestrator_read 报 `notes.json` 无效怎么办

- 适用条件与现象：`orchestrator_read plans` 或 `notes` 报「`notes.json` 无效：notes[0].description 超过 N 字」等错误，文档读不出来。
- 原因：校验会拒绝整个文档，而 `orchestrator_write` 需要先加载文档；插件不应替模型做摘要压缩或索引增删，所以不能脚本化自动修。
- 解决方法：先用 `orchestrator_read` 的 `inspect` 拿到原始 note 与错误，由模型判断如何重写；再用 `orchestrator_write` 的 `repair` 提交 `notes`（按 id 给 title/description/content）与 `index`，工具重新校验后写回。`repair` 只应用显式传入的值，不自动截断或删除。
- 验证：`tools.test.ts` 覆盖 inspect 原始视图、repair 应用模型值、无改动/未知 note 报错；`mode.test.ts` 覆盖无 active Plan 时的恢复种子。
- 来源：本域 ADR-0006；`packages/pi-toolkit/src/orchestrator/tools/{read,write}.ts`。

## orchestrator 怎么起 worker，worker 能做与不能做什么

- 适用条件与现象：需要让一个 TUI 会话同时推进多个 Plan，又不希望 worker 占掉自己的上下文或擅自扩范围。
- 原因：pi 会话之间没有共享上下文；把编排与执行放在同一会话里会让上下文爆炸，把授权放在 worker 里则会出现"自己给自己加活"。
- 解决方法：编排方用 `orchestrator_dispatch` 起 in-process worker session（SDK `createAgentSession`，`noExtensions: true` + 只注入 worker 扩展工厂）。worker 只有 `orchestrator_read` / `orchestrator_write` / `orchestrator_check` / `orchestrator_report`：不能 `init`、不能 `move`、未收到 `pass` 不能写 `completed`，也没有 `ask_questions`——要人回答只能 `orchestrator_report(needs_answer)`。
- 验证：`worker.test.ts` 覆盖工具集与三类拒绝；`bridge.test.ts` 覆盖幂等派工与 report 注入；真机冒烟确认调用序列为 `orchestrator_read → orchestrator_write → orchestrator_report`。
- 来源：本域 ADR-0007；Plan `2026-11-07-pi多plan编排`；`packages/pi-toolkit/src/orchestrator/{worker,spawn,handles}.ts`。

## 关掉 pi 再打开，怎么知道哪些 Plan 被打断

- 适用条件与现象：worker 跑到一半关掉终端，下次启动不知道从哪接。
- 原因：句柄表在进程内，退出即丢；notes 与 `interrupted.json` 留在磁盘上。
- 解决方法：`session_start` 在模式生效时跑启动对账，按 `in_progress`（被打断）、`waiting`（等人回答/验收）、全 `completed`（可归档）、其它（未知）四类列出 Plan 并注入一条 `orchestrator-reconcile` 消息；只提示，不重派、不归档。进程崩溃时 `installCrashGuard` 先写 `interrupted.json` 再以 1 退出，凭据参与下次对账。
- 验证：`reconcile.test.ts` 覆盖四类分流与凭据补充；`errors.test.ts` 覆盖凭据读写与崩溃落盘；真机在含 `in_progress` note 的工作区启动，session JSONL 出现 `customType: orchestrator-reconcile`。
- 来源：本域 ADR-0007；Plan `2026-11-07-pi多plan编排`；`packages/pi-toolkit/src/orchestrator/{reconcile,errors,register}.ts`。
