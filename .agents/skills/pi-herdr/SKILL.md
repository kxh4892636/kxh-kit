---
name: pi-herdr
description: 通过 Herdr 创建、列出、读取、继续和关闭 coding subagent session，并在创建时选择 agent kind 与 model；当 Pi 需要委派任务、并行探索或管理既有 subagent session 时使用。
compatibility: Requires HERDR_ENV=1, the herdr CLI, and the selected coding-agent CLI.
---

# Pi Herdr

把一个 **subagent session** 定义为：Herdr 中占据一个 pane、已被识别且具有唯一 live name 的 coding agent。Herdr pane 是运行边界，agent name 是 CRUD 主键，agent 自身的 session 参数决定对话是否持久化。

`herdr session` 管理的是承载 workspace 的 Herdr host session，不是本 skill 的 subagent session；只有用户明确要求管理 host session 时才使用它。关闭 pane 只删除 live subagent session，不删除 Pi JSONL 等 agent 原生对话记录。

| CRUD   | Herdr 操作                                      |
| ------ | ----------------------------------------------- |
| Create | 分配 pane，启动并命名 agent                    |
| Read   | `agent list/get/read`                          |
| Update | `agent prompt/wait/send-keys/rename`           |
| Delete | 复核所有权后关闭承载该 agent 的 pane           |

## 1. 建立执行基线

先验证当前 Pi 位于 Herdr 管理的 pane：

```bash
test "${HERDR_ENV:-}" = 1
```

失败时说明当前不在 Herdr 中并停止。成功后运行 `herdr --help`，再运行任务涉及的命令组（如 `herdr agent`、`herdr pane`）；创建前额外运行 `herdr agent start --help` 取得 supported kind。以当前二进制输出为语法事实源，不通过省略必需参数探测 mutating command。

读取调用方上下文和 live session：

```bash
herdr pane current --current
herdr agent list
```

从用户请求确定 operation、唯一 agent name、kind、model、cwd 与持久化方式。默认 kind 为 `pi`，默认 cwd 为 `$PWD`；model 未指定时保留 agent CLI 的默认值。agent name 必须匹配 `[a-z][a-z0-9_-]{0,31}` 且在 live agent 中唯一。每个字段均已确定或明确采用默认值时，本步骤完成。

## 2. 创建 session

### 选择 agent 与 model

`kind` 必须来自当前 `herdr agent` 输出的 supported kind list，并且对应 CLI 在目标 pane 的 `PATH` 中可执行。agent name 与 kind 是两个字段：name 用于后续寻址，kind 选择实际 CLI。

model 是 agent CLI 的原生参数。先读取该 CLI 的 `--help` 并确认它支持所请求的 model；再把已验证参数放到 `herdr agent start` 的 `--` 之后。不要猜测不同 agent 的参数名。Pi 使用：

```text
--model <provider/model[:thinking]>
```

也可把 thinking 独立传为 `--thinking <level>`。验证 Pi model 时，先从末尾剥离一个已知 thinking level（`off|minimal|low|medium|high|xhigh|max`），再用 `pi --list-models <provider/model>` 要求精确命中；thinking 单独按枚举验证。Pi 对话持久化按需求选择且三者互斥：

- 新持久 session：为需要恢复或切换 model 的受管 session 生成并保留 UUID，传 `--session-id <uuid>`；无需后续寻址时可省略 session option。
- 恢复既有 session：传 `--session <path-or-id>`。
- 临时 session：传 `--no-session`。

非 Pi kind 的 model 与持久化参数完全以其现场 `--help` 为准；无法确认时将该组合报告为 blocked，而不是静默忽略 model。

### 分配 pane

默认在当前 tab 创建 sibling pane，并保持用户焦点和 cwd。先检查几何：

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
```

宽 pane 向右分割，窄或高 pane 向下分割；避免形成不可用的小 pane：

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
# 或 --direction down
```

从 JSON 的 `.result.pane.pane_id` 读取新 pane ID，不预测 ID。只有用户明确要求独立 tab、workspace 或其他 cwd 时才改变默认拓扑。记录本次创建的 pane ID；它是后续 Delete 的所有权证据。

### 启动并命名

确认新 pane 是 shell prompt 后启动。下例为 Pi；`<native-args>` 必须是上一节已验证的参数：

```bash
herdr agent start <name> --kind pi --pane <pane-id> -- <native-args>
```

成功响应已经表示 Herdr 在同一 pane 识别到预期 agent 且可交互。随后复核：

```bash
herdr agent get <name>
```

Windows PowerShell pane 中，npm 的 extensionless shim 可能导致 `Start-Process` 报 `%1 不是有效的 Win32 应用程序`。命中该环境或错误时，改走 [Windows shim 启动](references/windows-shim.md)，并在 fallback 成功后用 pane ID 命名 agent。

返回的 pane、agent kind、name 与请求一致，且状态为 `idle` 或可继续输入的 `done` 时，Create 完成。状态为 `blocked` 时先读取 UI 并请用户处理；`unknown` 不代表 ready。

## 3. Read 与 Update

### Read

列出集合或读取一个 session：

```bash
herdr agent list
herdr agent get <name>
herdr agent read <name> --source recent-unwrapped --lines 120
```

日志和 transcript 优先使用 `recent-unwrapped`；视觉布局使用 `visible`；需要颜色证据时添加 `--format ansi`。读取不会把 `done` 标记为 seen。

若增加 `--lines` 仍无法取得 alternate-screen 中滚出的完整回答，要求 subagent 把完整结果写入临时目录的 Markdown 文件并只回复路径，然后直接读取该文件。仅在终端读取失败后使用此 fallback。

### Update

在 agent 已 settled 时提交新工作并等待首个 `idle`、`done` 或 `blocked`：

```bash
herdr agent prompt <name> "<prompt>" --wait --timeout 120000
```

调用 shell 工具时，把 prompt 和所有用户控制值作为单个 argv 进行适合当前 shell 的 quoting；不把示例中的占位符直接拼接为可解释的命令文本。需要连续上下文时始终复用同一个 name。若 agent 已在工作，先根据任务选择等待当前工作完成，或明确把消息作为 agent UI 输入；不要把一次 wait 的完成误认为新 prompt 已完成。超时或返回 `blocked` 后先执行 `agent get` 与 `agent read`。blocked 表示审批或问题 UI；展示现场并询问用户，不替用户决定。交互控制使用逻辑键：

```bash
herdr agent send-keys <name> esc
herdr agent send-keys <name> ctrl+c
```

模型切换属于目标 agent 的原生 UI/CLI 能力。若要求“后续消息改用另一个 model”，只在该 kind 的现场帮助提供可验证切换路径时执行；否则必须先取得已保留的原生 session ID（或在关闭前通过 agent 自身的 session 信息取得），再关闭 live session 并用目标 model 恢复同一对话。无法唯一寻址时停止，不能用“最近 session”猜测。

目标 session 的状态与输出已经复核，并且本次 prompt 的 settled/blocked 结果可归因于本次操作时，Read 或 Update 完成。

## 4. Delete

Delete 关闭 live subagent 所在 pane。只有以下任一条件成立时执行：

- pane 由本次调用创建且已记录；
- 用户明确指定并确认关闭一个既有 session。

先读取调用方 pane，解析 name 当前对应的 pane，并在最后一刻复核 occupant：

```bash
herdr pane current --current
herdr agent get <name>
herdr agent get <resolved-pane-id>
herdr pane close <resolved-pane-id>
herdr agent list
```

`<resolved-pane-id>` 必须与记录的 owned pane ID 相同、当前 occupant 的 name/kind 必须仍匹配，并且不得等于调用方 `$HERDR_PANE_ID`。任一检查失败都停止。关闭 pane 会终止其中进程；它不会删除 agent 原生持久记录。若用户要求删除 Pi JSONL 或其他原生记录，转交该 agent CLI 的受支持 session 管理能力，并单独取得不可逆删除确认；Herdr live Delete 不能伪装成持久记录 Delete。

目标 agent 已不在 `agent list` 中，且未关闭任何非本 skill 所创建或用户未确认的资源时，Delete 完成。

## 5. 返回结果

报告 operation、agent name、kind、model、pane ID、最终状态，以及持久记录是 retained、ephemeral 还是未确认。只把 Herdr 返回的真实 ID 和状态作为证据；失败时保留已创建资源的 ID，并说明恢复或清理命令。
