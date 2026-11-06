# Nano Flow

长任务工作流, Plan 是唯一权威状态, 通过两种不同模式循环推动工作流程;

## 模式循环

判定用户输入属于哪个循环：

- `/ask`（拷问、澄清、取证、定案）;
- `/do`（执行、验证、交付）;

缺省为 ask。用户可显式指定。判定后按对应循环执行工作;

## 业务域

```text
CONTEXT-MAP.md
.agents/domains/{domain-name}/
├── CONTEXT.md
├── QUESTIONS.md
├── adr/
│   └── 0001-中文决策名.md
├── workflows/
│   ├── INDEX.md
│   └── 0001-中文工作流名/
│       └── 0001-中文工作流名.md
└── plans/{lifecycle}/
    └── YYYY-MM-DD-中文工作名/
        ├── story.md
        ├── spec.md
        └── notes.json
```

adr/ 与 workflows/ 按需创建；`init` 只补 `CONTEXT.md` 与 `QUESTIONS.md`。

从 `CONTEXT-MAP.md` 找到所属业务域；若业务域不存在，用 `nano_flow_write` 的 `init` 创建业务域与 Plan（域名 kebab-case，目录名 `YYYY-MM-DD-中文工作名`）。域根默认 `.agents/domains`，以工具报出的为准；与 `CONTEXT-MAP.md` 的链接不一致时先问用户。

工作本身就是跨域时，以 `common` 作为业务域。

一个会话只属于一个业务域。`common` 是例外：任何域都可以读写它；跨域共享的术语、重复问题、决策与工作流写进 `common`，其它域只引用、不复制。一个会话默认只有一个 Plan：用户未明确新建时，新输入作为 note 追加到当前 Plan。

### 领域知识

每轮用户输入、取证、决策、执行或验证形成新事实后，执行一次同步；结论只在所属文档定义一次，其他位置引用。

- **定位**：从 `CONTEXT-MAP.md` 找到所属域，读取相关 CONTEXT、QUESTIONS、ADR 及命中的 workflow；恢复任务时依次读取 story、spec、索引中的 notes 及其依赖，对照工作区事实核对当前进度；冲突查明来源，未知项保留待定。
- **更新**：任务目标、方案和进展就地更新到 Plan；新增业务域或沉淀稳定术语、重复问题、重要决策、可复用 workflow 时更新领域知识。依据新事实创建、修改、删除或合并；删除或合并前把仍有效的需求、证据和未完成工作迁入保留文档。
- **同步**：修正受影响的引用、依赖、状态与恢复入口；暂停、交接或上下文切换前，确保仅凭 Plan 能判断目标、理由、进度、证据、缺口和下一步。
- **校验**：动过领域文档后跑 `nano_flow_check` 的 `workspace`；历史缺项和未验证内容如实保留，不补造事实。

### CONTEXT 与 QUESTIONS

- `CONTEXT-MAP.md` 只索引业务域及其关系，跨域关系只定义一次；新增域时同时创建必备的 `CONTEXT.md`、`QUESTIONS.md` 并加入 map。
- CONTEXT 只承载域职责与 glossary：从用户输入、工作区事实与已确认决策提取稳定术语，就地修订、去重或删除过时定义；术语条目写成「**术语**：定义 / Avoid：会造成歧义的同义词」；工作过程与临时假设留在 Plan。
- QUESTIONS 从工作记录、用户反馈与验证证据识别重复问题，合并同因问题，记录现象、原因、解决方法、验证与来源；未经验证的猜想留在 notes；尚无符合条件的问题时写明「暂无已验证的重复问题」。
- `common` 承载多域共同贡献的术语、常见问题与 ADR；跨域内容只选择一个 owner。

### ADR

一项决策同时满足以下条件才成为 ADR：

1. **Hard to reverse**：未来改变它有显著成本。
2. **Surprising without context**：只看实现无法理解为何这样选择。
3. **Real trade-off**：存在真实备选，并因明确理由选择其一。

ADR 正文用 1–3 句说明背景、决策与理由；按域内连续编号（`0001` 起，不断号），文件名为 `NNNN-中文决策名.md`；与现有 ADR 冲突时显式指出冲突及重新讨论的理由，不静默覆盖；必要时补 `Status` frontmatter、`Considered Options`、`Consequences`。

### Workflow

workflow 是脱离单次 Plan 仍可复用的业务域工作流，沉淀在 `workflows/` 下；一次性结论留在 Plan。目录与文件同名（`NNNN-中文工作流名/NNNN-中文工作流名.md`），每域从 `0001` 起连续编号。`INDEX.md` 收录该域全部 workflow，每行给出相对路径与触发条件（何时必须加载，而不是步骤摘要）；新增、改名、移动或删除时同步维护；覆盖同一活动的已有 workflow 先就地完善或合并，不新建近似条目。

### 领域文档规则

领域文档有体积上限与 ADR 数量上限，通过 `nano_flow_check` 的 `workspace` 校验；数字用 `limits` 取。

## Plan

- `story.md`：用户故事;
- `spec.md`：规格文档;
- `notes.json`：工作记录(垂直切片 + DAG有向无环图);

story/spec/note正文的内容结构由你按任务自行决定;

### 生命周期

- `active`：Plan 进行中; notes 在该阶段推进和完成;
- `reference`：全部 note 已完成且 Plan 仍有参考价值;
- `archived`：废弃、过时或不再有用;

生命周期表达工作阶段，note 状态表达工作进度；用 `nano_flow_write` 的 `move` 在 active / reference / archived 之间迁移：废弃进 `archived`，恢复时先迁回 `active`，全部 note 完成且用户确认后迁入 `reference`。

### story/spec

### notes

**`notes.json` 只能经 `nano_flow_write` 修改，不要用文件工具直接打开或编辑；读取统一走 `nano_flow_read`**;

**索引(index)**: 当前工作最有用的 notes；用 `set_index` 维护，保持 1–`indexMaxRows` 项；索引不是全量清单，移出索引不等于删除文档或完成工作;

**摘要(description)**: 当前 notes 的概述, 正文使用 `get` 获取;

**切片规则**: 垂直切片划分, 一条 note 对应一个可独立验收的用户结果，贯穿它需要的所有层级; 降低后续交付难度的前置准备排最前;

**状态**：`pending → in_progress → completed`，受阻进 `blocked` 并写 `blocked_reason`；解除后回 `in_progress`;

- 直接依赖写进 `blocked_by`；依赖必须存在、无环；非 `pending` 的 note，其直接依赖必须已完成。
- 完成条件是验收满足且 evidence 写清，由 `complete` 置 `completed`。
- 讨论、调查与计划类 note 以可检查的结论或方案为交付物；执行类 note 以可验证的用户能力为交付物。
- 删除或合并有下游的 note 前，先用 `link` 改指承接产物，或 `merge` 合并；

### Plan 文档规则

story、spec 与单条 note 都有体积上限。超过时先压缩：

- 只允许删除能由 notes、领域文档、代码或命令重新查到的内容，并在删除处留下指针；
- 压缩后仍有事实无处可查时，拆成子索引：主文件保留链接，正文拆到 `story-NN-中文标题.md` / `spec-NN-中文标题.md`，子文件同样受上限约束。

改写 story、spec 或拆分子文件后，立刻用 `nano_flow_check` 的 `plan` 校验。

动笔前先读该域已有的 `CONTEXT.md`、`QUESTIONS.md`、`adr/` 与命中的 workflow。

### 恢复与轮转

- 接到「继续」或重新进入一个已有 Plan：先按「业务域」确认业务域，用 `plans` 找出该域 active 的 Plan（只有一个时可省略 `plan` 参数），用 `resume` 拿恢复包（路径、story/spec 大小、关键索引、可推进队列与阻塞项），再读 `spec.md` 与 `story.md`，核对已完成步骤，从首个未完成步骤或可推进队列继续；需要澄清时进入 ask。
- 插件在每轮结束后检查上下文压力，达到阈值会自动创建新会话、让它 `resume` 当前 Plan，并物理删除旧会话。新会话只收到「继续执行当前 Plan」这一条线索，所以每轮结束前必须把检查点写回磁盘：spec 的「当前进度」「恢复入口」，note 的「执行检查点」「下一步」。仅凭 Plan 就能判断目标、理由、进度、证据、缺口和下一步，才算可以安全轮转。

## ask 循环

**Design tree** 按决策依赖展开，答案决定下游问题；**frontier** 是前置已有答案、当前可回答的全部问题。

1. **取证**：直接搜索或委派 subagent 从工作区获取事实;
2. **提问**：每轮覆盖整个 frontier，高置信问题直接回答, 低置信问题使用 `ask_user_question` 询问用户;
3. **修订**：使用 `nano_flow_write` 把结论就地写入 plan；更新选择、被排除路径与假设，重算 frontier；上游改变时复核并修订失效的下游结论。
4. **收敛**：可达问题均已处理、frontier 为空、无静默假设、用户反馈有结论后结束;

#### 每轮记录

在相关 note 中增加「拷问记录」，按轮保留仍影响当前决策的问答；合并重复问答时保留来源、反馈与结论。

```markdown
### 第 {round} 轮

#### Q{question} — {标题}

- 问题：{问题及必要的互斥选择}
- 前置问题：{Q 编号或无}
- 下游边界：{该答案会改变什么}
- 推荐答案及理由：{选择与证据}
- 修改意见：{用户反馈或待评价}
- 处理结论：{已确认/暂定/待取证，以及受影响的文档位置}

### 补充说明

{尚未被问题覆盖的用户输入及处理结论；没有则写无}
```

每题重复以上结构，编号递增，按轮追加；补充说明始终位于末尾。

## do 循环

1. **选 note**：用 `ready` 从可推进队列选一条（pending 且直接依赖已完成）；没有可推进的就先报告队列与阻塞项。
2. **门禁**：确认工作环境、执行契约与质量门禁；未确认的点记为未验证，不得当作已完成。
3. **执行**：按交付物适用的规范完成全部产出;
4. **验证**：进行最小集合验收。
5. **收尾**：写 evidence 并 `complete`，同步 spec 与相关领域文档，然后回到可推进队列报告下一条。

### 门禁

执行本 gate 前，先读 `common` 与该域 `QUESTIONS.md` 与命中的 workflow。

以 spec、note 或已确认设计作为权威来源，根据工作区事实和用户输入明确三项交付基线：

- **工作环境**：执行、运行与验证所需的环境、服务和入口。
- **执行契约**：范围、固定比较点、步骤、停止点、交付物和状态变更授权。
- **质量门禁**：该交付物适用的验证门禁与 verifying 的最小集合。

复用用户已确认的基线与授权；未确认的项等待用户手动确认并记为未验证，不得当作已完成。执行、取证、验证与验收后实时更新 story、spec、notes 的受影响内容与检查点；基线实质漂移时，更新受影响的权威输入并重新执行本 gate。

### 执行

- 交付中遇到阻塞时，优先查阅 `common` 与该域的领域知识；仍无解时把 note 置 `blocked` 并写清障碍与解除条件。

### verifying

1. **选择门禁**：从工作区声明的规范、格式与静态检查、测试、构建、评审、运行态和消费者路径中，选取验收门禁的最小集合；选中评审时执行下方 review。
2. **执行门禁**：按依赖顺序依次执行最小集合中的门禁。
3. **最小循环**：从最早失败门禁取证，做最小修复，再从最早受影响门禁重验。

基线内所有适用门禁通过且审查发现已处理时完成验收；未执行或未通过项明确记录，保持待验收。

### review

启动两个 subagent，并行审查：

- **Spec**：读取交付产物对应的 story、spec、notes、adr、context 和其他来源，验证是否符合工作需求。
- **Standards**：基于已有知识，额外遵循 `AGENTS.md` 和适用的规范 skill，判断交付产物是否符合工作规范。

汇总去重后逐项修复或说明不采纳的依据；修复后复验受影响门禁并复查原发现，所有项均有结论且无未解决的阻断项时结束审查。

### 完成与登记

- 交付物可用且证据可回读后，把交付物与验证证据写进 evidence（命令与输出、文件、commit），再 `complete`。
- 完成后同步受影响的 spec 章节与领域文档；全部 note 完成且用户确认后，把 Plan `move` 到 `reference`。
- 暂停或切换上下文前更新检查点，恢复时按 spec 的「恢复入口」继续。

## 工具

- `nano_flow_read`：`plans` / `notes` / `get` / `ready` / `graph` / `index` / `search` / `resume`；`get` 取正文，`ready` 取可推进队列，`resume` 取恢复包。
- `nano_flow_write`：`init` / `create` / `update` / `link` / `status` / `complete` / `set_index` / `merge` / `delete` / `move`；`completed` 只能由 `complete` 设置，`link` 清空依赖传 `[]`。
- `nano_flow_check`：`plan` 校验单个 Plan，`workspace` 校验领域文档与全部 active 的 Plan，`limits` 回显当前上限。
