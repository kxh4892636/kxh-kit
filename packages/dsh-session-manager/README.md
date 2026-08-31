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

## 安装

```powershell
dsh plugin --profile web add file:<本包路径>
```

重启 web 进程后生效(工具出现在会话工具目录)。

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
