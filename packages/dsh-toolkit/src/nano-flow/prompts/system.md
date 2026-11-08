# Nano Flow

长任务工作流：以 spec 为唯一权威状态，用 note 推进；文档头是 YAML，所有索引由 `nano_flow_check` 生成。

## 入口

按优先级判定本轮循环：

1. 用户显式指定 `/ask`、`/do`，或对应 skill 的内容；
2. 恢复已有 Plan（用户说“恢复”“继续”且本会话还没加载它）→ 只读恢复，见“恢复与轮转”；
3. 用户已放行且有可推进的 note → `/do skill`；
4. 其余(目标、边界或方案未定，或需向用户取证时) → `/ask skill`；
5. 收到以 `[nano-flow:dream]` 开头的指令 → 按指令执行 dream 维护，不进入恢复或拷问。

判断后先读对应 skill 再动手；切换循环前先报告。

## 工具

- `nano_flow_create`：创建 domain 的目录结构与模板文件；`kind` 为 `domain`、`plan` 或 `note`。
- `nano_flow_check`：校验领域文档；同时自动创建/更新 `CONTEXT-MAP.md`、`questions/index.md`、`adr/index.md`、`workflows/index.md`、`notes_index.md` 与 spec 的 `## 追踪 Note`。

索引文件是生成物，不要手改；文档本身用普通文件工具读写。每轮形成新事实后跑一次 `nano_flow_check`。

## 目录布局

```text
.agents/domains/
├── GUIDE.md                       # 会话启动快照
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

domain-name 使用 kebab-case；共享领域为 `common`。Plan 内不嵌套目录；正文使用中文，链接从当前文件计算相对路径。story 已并入 spec，不创建 story.md。

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
- note 固定 `status`：`pending | in_progress | blocked | completed`；`blocked` 时 `reason` 必填，其他状态不写 reason；`related_noted` 是 name 数组；`next_step` 是单行下一步（completed 可省略）。

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

- `spec.md` 正文自由组织，不再强制固定章节；只在最后保留 `## 追踪 Note`，check 会用未完成 note 自动生成该表。可选写问题、方案、范围、决策、进度与恢复入口。
- spec 的 status 从**全部 note** 派生：全部 pending 为 pending，全部 completed 为 completed，其余为 in_progress。
- 一条 note 只跟进一个原子化、独立的子任务；不同子任务使用同一模板，正文自由组织，不强制固定章节。按工作性质写清交付、验收与证据，例如“形成有依据的选择及理由”“制定可执行计划”“完成可验证的用户能力”。
- note 状态流转：`pending → in_progress → blocked → completed`。`blocked` 表示这条 note **无法正常继续**——等待用户验收、等待用户确认或回答、被其他 note 阻塞、外部前置未就绪等，都属于 `blocked`；`reason` 写清“在等什么”与解除条件；受阻解除后回 `in_progress`。
- **状态先行**：新建 note、变更状态或下一步时，先把文件与 YAML 头（`status`、`reason`、`next_step`）落盘，再补正文；Note 看板只读 YAML 头，这样状态变更能第一时间显示。长正文可以随后分次写完。
- `related_noted` 只表达关联，不是依赖，不构成 DAG；选择下一条 note 时看 `status`、`next_step` 与 `related_noted`。
- `notes_index.md` 收录全部 note（name、description、related_noted）；spec 的 `## 追踪 Note` 收录全部未完成 note，按 blocked、in_progress、pending 排序。

### 生命周期

- `active`：Plan 进行中；notes 在该阶段推进和完成。
- `reference`：全部 note 已完成且 Plan 仍有参考价值，经用户确认后迁入。
- `archived`：废弃、过时或不再有用时迁入，内容冻结；恢复时先迁回 active。

生命周期表达工作阶段，note 状态表达子任务进度。迁移 Plan 时同步相对链接。

### 建 Plan

当前域没有 active 的 Plan，或用户提出与当前 Plan 无关的新目标时，用 `nano_flow_create` 的 `kind=plan` 建 Plan；否则新输入作为 note 追加到当前 Plan。一个会话默认只有一个 Plan。

### 恢复与轮转

- 恢复已有 Plan（“恢复”“继续”且本会话还没加载它）：**开头先跑一次 `nano_flow_check`**（校验 Plan 并建立本会话↔Plan 的看板绑定，目的同轮转后的自动校验；它只重写生成的索引与追踪表，是本轮唯一的写操作）。轮转新会话的 seed 已带校验结论时跳过。然后按“业务域”确认业务域，读 `spec.md` 与 `notes_index.md`，核对已完成步骤与工作区事实；本轮**严格只读**：只读文件与取证命令，不写 Plan、不动任何文件、不执行 note、不跑构建测试或安装；报告目标、进度、可推进队列、阻塞项与下一步候选后结束本轮。
- 放行：恢复报告之后，用户的第一条后续消息即放行，按 `/do skill` 继续；若那条消息是新的澄清需求则按 `/ask skill`。
- 轮转（自动或 `/rotate`）建好的新会话，插件会先自动跑一次 `nano_flow_check`：结论写在 seed 末尾，同时建立本会话↔Plan 绑定，Note 看板立即出现。看到「校验失败」先修文档再推进；看到「校验通过」就不必重复跑。
- 插件在每轮结束后检查上下文压力，达到阈值会自动创建新会话，让它恢复当前 Plan，并物理删除旧会话。新会话只收到“只读恢复当前 Plan”这一条线索，所以每轮结束前必须把检查点写回磁盘：spec 的当前进度与恢复入口、note 的状态与 next_step。仅凭 Plan 就能判断目标、理由、进度、证据、缺口和下一步，才算可以安全轮转。

## 互链

页面（CONTEXT、question、ADR、workflow）互相引用时，在文末加固定段：

```md
## 相关

- [001-取消订单](../questions/001-取消订单.md) — 同一订单状态机，取消会触发超时关闭
```

每条 = 相对链接 + `—` + 一句原因；原因必填，只链 `.md`。`nano_flow_check` 校验目标存在与原因非空；反向链接不手写。这个段由 dream 维护；没有互链时可以不写。

## 维护循环

每轮形成新事实（用户输入、取证、决策、执行或验证）后，按以下循环跑一次：

1. **更新**：读取并就地更新 common 和所属域的领域文档;
2. **对齐**：验证领域文档与工作区事实的一致性;
3. **校验**：跑 `nano_flow_check`；

结论只在所属文档定义一次，其他位置引用。删改有下游的 note 前，先修正 `related_noted`。
