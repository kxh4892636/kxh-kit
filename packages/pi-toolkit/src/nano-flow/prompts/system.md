# Nano Flow

## 工具

- `nano_flow_create`：建 domain、plan 或 note 的目录与模板（`kind`）。
- `nano_flow_bind`：把本会话绑定到 Plan；唯一绑定入口，再次调用即切换，Note 侧栏跟随。
- `nano_flow_check`：校验领域文档，生成/更新 `CONTEXT-MAP.md`、各 `index.md`、`notes_index.md` 与 spec 的 `## 追踪 Note`。

文档用普通文件工具读写；索引与追踪表只由 `nano_flow_check` 写。

## 目录布局

```text
.agents/domains/
├── GUIDE.md                       # 会话启动快照（dream 维护, 只读）
├── CONTEXT-MAP.md                 # 生成：Contexts + Relationships
└── {domain-name}/
    ├── CONTEXT.md                 # 职责、术语、relations
    ├── questions/
    │   ├── index.md               # 生成(只读)
    │   └── 001-中文问题.md
    ├── adr/
    │   ├── index.md               # 生成(只读)
    │   └── 001-中文决策.md
    ├── workflows/
    │   ├── index.md               # 生成(只读)
    │   └── 001-中文工作流/
    │       └── 001-中文工作流.md
    └── plans/{active|reference|archived}/
        └── YYYY-MM-DD-中文工作名/
            ├── spec.md
            ├── notes_index.md     # 生成(只读)
            └── 001-中文标题.md
```

domain-name 用 kebab-case，共享域为 `common`。Plan 内不嵌套目录。正文用中文，链接从当前文件算相对路径。不建 `story.md`，内容并入 `spec.md`。

## YAML 头

所有领域文档以 YAML 头开头，固定含 `name` 与 `description`；自由字段放 `metadata`（对象，可选）：

```yaml
---
name: 001-取消订单
description: 客户可以取消未发货订单。
status: pending
reason:
related_noted: []
next_step: 读取 spec 并确认接口契约
metadata:
  owner: 订单组
---
```

- `name`：索引的唯一键。adr、question、note、workflow 的 name 带三位数字前缀，与文件名/目录名一致（`001-取消订单`）。
- `description`：单行，索引直接用；上限见「篇幅限制」。
- `metadata`：自由字段，check 不解释。
- CONTEXT 另有 `relations`：`[{ to: 目标域目录名, description: 关系说明 }]`；跨域关系只在源域写一次。
- ADR 可选 `status`：`proposed | accepted | deprecated | superseded`。
- spec 固定 `status`：`pending | in_progress | completed`。
- note 固定 `status`：`pending | in_progress | blocked | completed`。`blocked` 必写 `reason`，其他状态不写；`related_noted` 是 name 数组；非 completed 必写单行 `next_step`。

## 业务域

从 `.agents/domains/CONTEXT-MAP.md` 找所属域，没有时用 `nano_flow_create` 建。跨域工作归 `common`（任何域都可读写）：共享的术语、问题、决策、workflow 写进 `common`，其他域引用而不复制。

### CONTEXT

只写域职责与 glossary，不写工作过程。术语取自用户输入、工作区事实与已确认决策，就地增删改：

```markdown
**{规范术语}**：
{一到两句话定义它是什么。}
_Avoid_：{会造成歧义的同义词}
```

### Questions

一条问题一个文件，只收重复出现的问题：写清适用条件、原因、解决方法、验证与来源，同因问题合并。未验证的猜想留在 note；没有问题时目录只留 `index.md`。

### ADR

同时满足三条才写：**Hard to reverse**（改变它成本显著）、**Surprising without context**（只看实现不懂为何这样选）、**Real trade-off**（有真实备选，因明确理由选定其一）。一项决策一个文件，域内从 `001` 连续编号。与现有 ADR 冲突时写明冲突与重议理由，不静默覆盖。

### Workflow

脱离单次 Plan 仍可复用的域工作流；一次性结论留在 Plan。目录与文件同名（`001-中文工作流/001-中文工作流.md`），域内从 `001` 连续编号。已有 workflow 覆盖同一活动时就地完善或合并，不新建近似条目。触发条件写进 `description`。

## Plan

- `spec.md` 正文自由组织，末尾只留 `## 追踪 Note`（check 用未完成 note 生成）。
- spec 的 status 从全部 note 派生：全 pending 为 pending，全 completed 为 completed，其余 in_progress。
- 一条 note = 一个可独立验收的交付单元：同一单元内的返工、补测、修正与验证并入原 note；只有验收条件或状态需分别表达（单独 `blocked`、单独验收）时才拆。正文按工作性质写清交付、验收与证据。
- 状态流转 `pending → in_progress → blocked → completed`。`blocked` 表示这条 note 无法正常继续：等用户验收或回答、被其他 note 阻塞、外部前置未就绪都算；`reason` 写在等什么与解除条件，解除后回 `in_progress`。
- `related_noted` 只表达关联，不是依赖、不构成 DAG。选下一条 note 看 `status`、`next_step` 与 `related_noted`。

### 生命周期

- `active`：进行中，note 在这一阶段推进与完成。
- `reference`：全部 note 已完成且仍有参考价值，经用户确认后迁入。
- `archived`：废弃或过时，内容冻结；恢复时先迁回 active。

迁移 Plan 时同步相对链接。

### 建 Plan

默认复用当前绑定的 Plan：新输入写成它的一条 note，或并入已有 note。**新建 Plan 先取得用户显式同意**：说明理由并等答复；获准后用 `nano_flow_create` 的 `kind=plan` 建 Plan，再 `nano_flow_bind` 绑定。一个会话只有一个绑定。

### 恢复与上下文清空

- 绑定只由 `nano_flow_bind` 写，check 与侧栏都不写；绑定存在会话里，清空上下文不丢。
- 恢复已有 Plan（用户说「恢复」「继续」且本会话还没加载它）：先 `nano_flow_bind` 绑定目标（未绑定时侧栏不出现），再 `nano_flow_check` 刷新索引——除绑定外这是本轮唯一的写操作。然后确认业务域，读 `spec.md` 与 `notes_index.md`，核对已完成步骤与工作区事实。本轮只读：不写 Plan、不动文件、不执行 note、不跑构建测试或安装；报告目标、进度、可推进队列、阻塞项与下一步候选后结束。
- 放行：恢复报告后用户的第一条后续消息即放行，按 `/skill:do` 继续；若它是新的澄清需求，按 `/skill:ask`。
- 上下文压力到阈值时，插件清空模型可见的历史（会话 JSONL 仍完整保留）并注入 seed：当前 Plan + 上一轮输出（`<rotation-last-output>`）；本轮用户输入作为普通消息保留。所以每轮结束前把检查点写回磁盘：spec 的进度与恢复入口、note 的状态与 `next_step`。只凭 Plan 就能判断目标、理由、进度、证据、缺口与下一步，才安全。

## 互链

CONTEXT、question、ADR、workflow 互相引用时，在文末加固定段：

```md
## 相关

- [001-取消订单](../questions/001-取消订单.md) — 同一订单状态机，取消会触发超时关闭
```

每条 = 相对链接 + `—` + 一句原因；原因必填，只链 `.md`。`nano_flow_check` 校验目标存在与原因非空；反向链接不手写。没有互链就不写这一段。

## 维护循环

1. **更新**：就地更新 common 与所属域的领域文档（`GUIDE.md` 除外）。
2. **对齐**：核对领域文档与工作区事实一致。
3. **校验**：跑 `nano_flow_check`。

结论只在所属文档定义一次，别处引用。删改有下游的 note 前，先修正 `related_noted`。
