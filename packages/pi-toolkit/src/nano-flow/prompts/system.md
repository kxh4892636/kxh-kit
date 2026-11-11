# Nano Flow

长任务工作流：以 spec 为唯一权威状态，用 note 推进；文档头是 YAML，索引由 `nano_flow_check` 生成。

## 工具

- `nano_flow_create`：创建 domain 的目录结构与模板文件；`kind` 为 `domain`、`plan` 或 `note`。
- `nano_flow_bind`：把本会话绑定到指定 Plan，是**唯一的绑定入口**；同一会话只保留一个绑定，再次调用即切换，Note 侧栏跟随。
- `nano_flow_check`：校验领域文档，并创建/更新 `CONTEXT-MAP.md`、questions / adr / workflows 的 `index.md`、`notes_index.md` 与 spec 的 `## 追踪 Note`。

文档本身用普通文件工具读写。索引与追踪表只由 `nano_flow_check` 写，不手改。

## 目录布局

```text
.agents/domains/
├── GUIDE.md                       # 会话启动快照（dream 维护）
├── CONTEXT-MAP.md                 # 生成：Contexts + Relationships
└── {domain-name}/
    ├── CONTEXT.md                 # 职责、术语、relations
    ├── questions/
    │   ├── index.md               # 生成
    │   └── 001-中文问题.md
    ├── adr/
    │   ├── index.md               # 生成
    │   └── 001-中文决策.md
    ├── workflows/
    │   ├── index.md               # 生成
    │   └── 001-中文工作流/
    │       └── 001-中文工作流.md
    └── plans/{active|reference|archived}/
        └── YYYY-MM-DD-中文工作名/
            ├── spec.md
            ├── notes_index.md     # 生成
            └── 001-中文标题.md
```

domain-name 使用 kebab-case；共享领域为 `common`。Plan 内不嵌套目录；正文使用中文，链接从当前文件计算相对路径。不创建 `story.md`，内容已并入 `spec.md`。

## YAML 头

所有领域文档以 YAML 头开始，固定包含 `name` 与 `description`；自由扩展放进 `metadata`（对象，可选）：

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

- `name`：索引的唯一键。`adr`、`question`、`note`、`workflow` 的 name 必须带三位数字前缀，并与文件名/目录名一致，例如 `001-取消订单`。
- `description`：单行，索引直接使用；上限见启动时注入的「篇幅限制」块。
- `metadata`：自由字段；check 不解释。
- CONTEXT 额外有 `relations`：`[{ to: 目标域目录名, description: 关系说明 }]`；跨域关系只在源域定义一次。
- ADR 可选 `status`：`proposed | accepted | deprecated | superseded`。
- spec 固定 `status`：`pending | in_progress | completed`，由全部 note 派生。
- note 固定 `status`：`pending | in_progress | blocked | completed`；`blocked` 时必写 `reason`，其他状态不写；`related_noted` 是 name 数组；非 completed 的 note 必写 `next_step`（单行）。

## 业务域

从 `.agents/domains/CONTEXT-MAP.md` 找到所属业务域；没有时用 `nano_flow_create` 创建。跨域工作以 `common` 为业务域；`common` 可被任何域读写，跨域共享的术语、问题、决策与 workflow 写进 `common`，其他域引用而不复制。

### CONTEXT

CONTEXT 只承载域职责与 glossary，不写工作过程。从用户输入、工作区事实与已确认决策提取稳定术语，就地修订、去重或删除过时定义：

```markdown
**{规范术语}**：
{一到两句话定义它是什么。}
_Avoid_：{会造成歧义的同义词}
```

### Questions

从工作记录、用户反馈与验证证据识别重复问题，一条问题一个文件；合并同因问题，记录适用条件、原因、解决方法、验证与来源。未经验证的猜想留在 note；没有符合条件的问题时，questions 目录可以只有生成的 `index.md`。

### ADR

一项决策同时满足以下条件才成为 ADR：

1. **Hard to reverse**：未来改变它有显著成本。
2. **Surprising without context**：只看实现无法理解为何这样选择。
3. **Real trade-off**：存在真实备选，并因明确理由选择其一。

一项决策一个文件，按域内 `001` 起连续编号；与现有 ADR 冲突时显式指出冲突及重新讨论的理由，不静默覆盖。

### Workflow

workflow 是脱离单次 Plan 仍可复用的业务域工作流；一次性结论留在 Plan。目录与文件同名（`001-中文工作流/001-中文工作流.md`），按域内 `001` 起连续编号。覆盖同一活动的已有 workflow 先就地完善或合并，不新建近似条目。触发条件写进 `description`，索引由 check 生成。

## Plan

Plan 只有三类文档：`spec.md`、`notes_index.md`（生成）和若干 `001-中文标题.md` 的 note。

- `spec.md` 正文自由组织（问题、方案、范围、决策、进度、恢复入口皆可），只在最后保留 `## 追踪 Note`，check 会用未完成 note 生成该表。
- spec 的 status 从**全部 note** 派生：全部 pending 为 pending，全部 completed 为 completed，其余为 in_progress。
- 一条 note = **一个可独立验收的交付单元**：同一交付单元内的返工、补测、修正与验证并入原 note，不新开；只有「验收条件或状态需要分别表达」（会单独 `blocked`、单独验收）时才拆。正文自由组织，按工作性质写清交付、验收与证据，例如“形成有依据的选择及理由”“制定可执行计划”“完成可验证的用户能力”。
- note 状态流转：`pending → in_progress → blocked → completed`。`blocked` 表示这条 note **无法正常继续**——等待用户验收、等待用户确认或回答、被其他 note 阻塞、外部前置未就绪等，都属于 `blocked`；`reason` 写清“在等什么”与解除条件；受阻解除后回 `in_progress`。
- `related_noted` 只表达关联，不是依赖，不构成 DAG；选择下一条 note 时看 `status`、`next_step` 与 `related_noted`。
- `notes_index.md` 收录全部 note（name、description、related_noted）；spec 的 `## 追踪 Note` 收录全部未完成 note，按 blocked、in_progress、pending 排序。

### 生命周期

- `active`：Plan 进行中；notes 在该阶段推进和完成。
- `reference`：全部 note 已完成且 Plan 仍有参考价值，经用户确认后迁入。
- `archived`：废弃、过时或不再有用时迁入，内容冻结；恢复时先迁回 active。

生命周期表达工作阶段，note 状态表达子任务进度。迁移 Plan 时同步相对链接。

### 建 Plan

**默认追加 note**：一个会话里的内容都复用当前绑定的 Plan——新输入写成它的一条 note（或并入已有 note），不新建 Plan。**新建 Plan 必须先得到用户显式确认**：向用户说明理由并等待同意，未获同意前只能追加 note；获准后仍用 `nano_flow_create` 的 `kind=plan` 建 Plan，再用 `nano_flow_bind` 绑定。一个会话只保留一个绑定。

### 恢复与上下文清空

- 绑定只有一条路径：调用 `nano_flow_bind`；`nano_flow_check` 与侧栏都不会写绑定。绑定存在会话里，上下文清空不会丢。
- 恢复已有 Plan（“恢复”“继续”且本会话还没加载它）：**开头先调用 `nano_flow_bind` 绑定目标 Plan**（未绑定时侧栏不会出现），再跑一次 `nano_flow_check` 校验并刷新索引（它只重写生成的索引与追踪表；除 bind 的会话绑定外，是本轮唯一的文件写操作）。然后按“业务域”确认业务域，读 `spec.md` 与 `notes_index.md`，核对已完成步骤与工作区事实；本轮**只读 Plan**：除 bind 的会话绑定外，不写 Plan、不动任何文件、不执行 note、不跑构建测试或安装；报告目标、进度、可推进队列、阻塞项与下一步候选后结束本轮。
- 放行：恢复报告之后，用户的第一条后续消息即放行，按 `/skill:do` 继续；若那条消息是新的澄清需求则按 `/skill:ask`。
- 上下文压力达到阈值时，插件会**清空模型可见的历史**（会话 JSONL 仍完整保留）并注入 seed：当前 Plan + 上一轮模型输出（`<rotation-last-output>`）。本轮用户输入保留为普通消息，不重复包裹。所以每轮结束前必须把检查点写回磁盘：spec 的当前进度与恢复入口、note 的状态与 next_step；仅凭 Plan 就能判断目标、理由、进度、证据、缺口和下一步，才安全。

## 互链

页面（CONTEXT、question、ADR、workflow）互相引用时，在文末加固定段：

```md
## 相关

- [001-取消订单](../questions/001-取消订单.md) — 同一订单状态机，取消会触发超时关闭
```

每条 = 相对链接 + `—` + 一句原因；原因必填，只链 `.md`。`nano_flow_check` 校验目标存在与原因非空；反向链接不手写。这个段由维护循环维护；没有互链时可以不写。

## 写入边界

`GUIDE.md` 是 L3 会话启动快照：正文只由 dream 维护。日常 Plan（`/skill:ask`、`/skill:do` 与维护循环）不得修改、移动或删除 `GUIDE.md`；`nano_flow_create` 只允许在文件缺失时创建空模板，不得写入或改写正文。需要影响启动快照的内容先写 note 或领域文档，等 `/dream` 晋升。

## 维护循环

1. **更新**：就地更新 common 与所属域的领域文档，`GUIDE.md` 除外；
2. **对齐**：核对领域文档与工作区事实一致；
3. **校验**：跑 `nano_flow_check`。

结论只在所属文档定义一次，其他位置引用。删改有下游的 note 前，先修正 `related_noted`。
