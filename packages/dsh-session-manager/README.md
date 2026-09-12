# @kxh4892636/dsh-session-manager

DSH 插件: 以模型工具面提供会话与模型管理 CRUD(ADR-0002)。

## 能力

9 个模型工具(注册于 `ctx.tools`),进程内直调 DSH Host 服务:

| 工具                   | 作用                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| `session_list`         | 列出全部 workspace 的会话摘要(含 workspace 归属、归档标记、subagent 归属)     |
| `session_read`         | 分页读取会话消息文本历史(冷读,不激活目标 Agent;子会话用 parentSessionId 寻址) |
| `session_spawn`        | 创建新会话并可选指定模型(预置指令即新会话默认携带的系统消息)                  |
| `session_prompt`       | 向会话投递消息(`mode: queue`(默认) / `steer`)                                 |
| `session_model_list`   | 列出可路由模型目录(provider 分组、默认、失败隔离)                             |
| `session_model_select` | 为会话选择模型                                                                |
| `session_rename`       | 重命名会话                                                                    |
| `session_archive`      | 归档(隐藏)会话;无硬删除(DSH 日志 append-only)                                 |
| `session_wait`         | 轮询等待会话结束当前任务                                                      |

内容搜索由上游 `@deepseek-ai/dsh-tool-session-query` 提供(见 `cordis.patch.yml` 与 ADR-0003)。

## 兼容版本

对齐 DSH `0.1.5-rc.1`(`latest` 发布通道):DSH 相关 peer 取 `^0.1.5-rc.1`;上游 opt-in 工具包
`@deepseek-ai/dsh-tool-session-query` **精确钉在 `0.1.5-rc.1`**——npm 上 `next` 通道已发布
`0.1.5-rc.2`,而 `^0.1.5-rc.1` 这类范围会解析到 rc.2,其 peer 要求 `^0.1.5-rc.2`,与宿主 rc.1 混装。
(`@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 保持各自范围。)peer 范围同样会接受后续
`0.1.x` 稳定版,通道跳版后需人工复核并对齐。

安装形态:`dsh plugin --profile web add <tarball|本包路径>`;tarball 安装与工作区解耦,
`file:` 目录安装是硬链接(重建 `dist` 会换 inode, 需重装或显式同步快照)。

## 安装

```powershell
dsh plugin --profile web add file:<本包路径>
```

重启 web 进程后生效(工具出现在会话工具目录)。

## 组合前提

工具的数据面是 `ctx.sessionController`,由 web-app 层的 `@deepseek-ai/dsh-api-session-controller`
行拥有(`workspaceRegistry`/`agents` 是它的伴生面)。因此插件只在含 `@deepseek-ai/dsh-web-app`
的组合(即 `web` profile)里产出工具;不含该层的组合(如 `dsh-tui` = `dsh-base` + `dsh-tui`,
`dsh --profile dsh-tui --dump-config` 里没有 `session-controller` 行)装得上,但注册 0 个工具。

入口 `inject` 只声明组合无关的服务(`tools`/`systemPrompt`),能力服务放在嵌套作用域
(`capabilityInject`)里按需挂载。原因是 cordis 4 的 `inject` 没有可选语义:把
`sessionController` 写进入口会让条目永远 pending,而 app-boot 的 `assertEntriesActivated`
把 pending 当作致命错误(`1 entry did not activate`,退出码 7),整棵插件树都起不来。

要在这类组合里拿到同类能力,需要另做一个以该组合自有服务为数据面的 Host 适配层(未交付)。

## 开发

```powershell
pnpm --filter @kxh4892636/dsh-session-manager test   # vitest(覆盖阈值 80%)
pnpm --filter @kxh4892636/dsh-session-manager check  # 类型/lint/格式
pnpm --filter @kxh4892636/dsh-session-manager build  # vp pack → dist/main.mjs
```

## 设计约束

- 仅模型工具面交付(ADR-0002);无 CLI/HTTP 面。
- Host 边界经 `SessionManagerHost` 结构子集访问,`RemoteError` 归一化为带 code 的可读文本;非预期失败落到 `SESSION_MANAGER_TOOL_FAILED`(完整链留在 Host 日志)。
- 预置指令 = 新会话默认携带的系统消息,插件不提供注入/选择参数(领域术语见 `docs/dsh/CONTEXT.md`)。
