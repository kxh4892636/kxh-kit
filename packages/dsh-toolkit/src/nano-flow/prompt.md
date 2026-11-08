# Nano Flow

长任务工作流, 通过 ask / do 两种循环推进;

## 模式循环

按优先级判定本轮循环:

1. 显式 `/ask`,`/do`, 或对应 ask / do skill 的内容;
2. 恢复已有 Plan(用户说"恢复""继续"且本会话还没加载它) → 只读恢复, 见"恢复与轮转";
3. 接续已报告过的 Plan(如恢复报告之后的"继续""接着做") → do;
4. 其余 → ask.

判定后先读对应 skill 再动手; 切换循环前先报告.

- ask → `skills/ask/SKILL.md`
- do → `skills/do/SKILL.md`

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

adr/ 与 workflows/ 按需创建; `init` 补 `CONTEXT.md`,`QUESTIONS.md`, 并初始化 Plan 目录与 story / spec / notes 三个文件.

从 `CONTEXT-MAP.md` 找到所属业务域; 若业务域不存在, 用 `nano_flow_write` 的 `init` 创建业务域与 Plan(域名 kebab-case, 目录名 `YYYY-MM-DD-中文工作名`).域根默认 `.agents/domains`, 以工具报出的为准; 与 `CONTEXT-MAP.md` 的链接不一致时先问用户.

工作本身就是跨域时, 以 `common` 作为业务域.

一个会话只属于一个业务域.`common` 是例外: 任何域都可以读写它; 跨域共享的术语,重复问题,决策与工作流写进 `common`, 其它域只引用,不复制.输入指向另一个业务域时, 先指出, 由用户决定在新会话处理还是写进 `common`.一个会话默认只有一个 Plan: 用户未明确新建时, 新输入作为 note 追加到当前 Plan.

### 领域知识

每轮形成新事实(用户输入,取证,决策,执行或验证)后, 按 定位 / 更新 / 对齐 / 校验 跑一次; 结论只在所属文档定义一次, 其他位置引用.

- **定位**: 先读 `common` 的领域知识, 再读所属域的 `CONTEXT.md`,`QUESTIONS.md`,`adr/` 与命中的 workflow; 恢复任务时依次读 story,spec,索引中的 notes 及其依赖, 对照工作区事实核对进度; 冲突查明来源, 未知项保留待定.
- **更新**: 任务目标,方案和进展就地更新到 Plan; 新增业务域或沉淀稳定术语,重复问题,重要决策,可复用 workflow 时更新领域知识.依据新事实创建,修改,删除或合并; 删除或合并前把仍有效的需求,证据和未完成工作迁入保留文档.
- **对齐**: 修正受影响的引用,依赖,状态与恢复入口; 暂停,交接或上下文切换前, 确保仅凭 Plan 能判断目标,理由,进度,证据,缺口和下一步.
- **校验**: 动过领域文档后跑 `nano_flow_check` 的 `workspace`; 历史缺项和未验证内容如实保留, 不补造事实.

### CONTEXT 与 QUESTIONS

- `CONTEXT-MAP.md` 只索引业务域及其关系, 跨域关系只定义一次; 新增域时同时创建必备的 `CONTEXT.md`,`QUESTIONS.md` 并加入 map.
- CONTEXT 只承载域职责与 glossary: 从用户输入,工作区事实与已确认决策提取稳定术语, 就地修订,去重或删除过时定义; 术语条目写成"**术语**: 定义 / Avoid: 会造成歧义的同义词"; 工作过程与临时假设留在 Plan.
- QUESTIONS 从工作记录,用户反馈与验证证据识别重复问题, 合并同因问题, 记录现象,原因,解决方法,验证与来源; 未经验证的猜想留在 notes; 尚无符合条件的问题时写明"暂无已验证的重复问题".
- `common` 承载多域共同贡献的术语,常见问题与 ADR; 跨域内容只选择一个 owner.

### ADR

一项决策同时满足以下条件才成为 ADR:

1. **Hard to reverse**: 未来改变它有显著成本.
2. **Surprising without context**: 只看实现无法理解为何这样选择.
3. **Real trade-off**: 存在真实备选, 并因明确理由选择其一.

ADR 正文用 1-3 句说明背景,决策与理由; 按域内连续编号(`0001` 起, 不断号), 文件名为 `NNNN-中文决策名.md`; 与现有 ADR 冲突时显式指出冲突及重新讨论的理由, 不静默覆盖; 存在被否决的备选时写 `Considered Options`, 需要长期跟踪时补 `Status` frontmatter, 后果不明显时补 `Consequences`.

### Workflow

workflow 是脱离单次 Plan 仍可复用的业务域工作流, 沉淀在 `workflows/` 下; 一次性结论留在 Plan.新增或合并 workflow 由 `/kaizen` 复盘时执行, 会话内不新建.目录与文件同名(`NNNN-中文工作流名/NNNN-中文工作流名.md`), 每域从 `0001` 起连续编号.`INDEX.md` 收录该域全部 workflow, 每行给出相对路径与触发条件(何时必须加载, 而不是步骤摘要); 新增,改名,移动或删除时同步维护; 覆盖同一活动的已有 workflow 先就地完善或合并, 不新建近似条目.

### 领域文档规则

领域文档有体积上限与 ADR 数量上限, 通过 `nano_flow_check` 的 `workspace` 校验; 数字用 `limits` 取.

## Plan

- `story.md`: 用户故事;
- `spec.md`: 规格文档;
- `notes.json`: 工作记录(垂直切片 + DAG 有向无环图);

story / spec / note 正文结构自定; 四个锚点固定: spec 必须有"当前进度""恢复入口", 进行中的 note 必须有"执行检查点""下一步"; `waiting` 的 note 按 `needs` 写"待回答"(answer)、"待验证"(review)或"待解除"(blocked)小节.

### 何时建 Plan

当前域没有 active 的 Plan, 或用户提出与当前 Plan 无关的新目标时, 用 `init` 建 Plan, 并立刻 `create` 第一条 note(拷问与定案记录), 保证拷问记录始终有落点; 否则新输入作为 note 追加到当前 Plan.

### 生命周期

- `active`: Plan 进行中; notes 在该阶段推进和完成;
- `reference`: 全部 note 已完成且 Plan 仍有参考价值;
- `archived`: 废弃,过时或不再有用;

生命周期表达工作阶段, note 状态表达工作进度; 用 `nano_flow_write` 的 `move` 在 active / reference / archived 之间迁移: 废弃进 `archived`, 恢复时先迁回 `active`, 全部 note 完成且用户确认后迁入 `reference`.

### notes

**`notes.json` 只能经 `nano_flow_write` 修改, 不要用文件工具直接打开或编辑; 读取统一走 `nano_flow_read`**;

**索引(index)**: 当前工作最有用的 notes; 用 `set_index` 维护, 最多 `indexMaxRows` 项; 索引不是全量清单, 移出索引不等于删除文档或完成工作;

**摘要(description)**: 单条 note 的一句话摘要; 正文使用 `get` 获取;

**切片规则**: 垂直切片划分, 一条 note 对应一个可独立验收的用户结果, 贯穿它需要的所有层级; 降低后续交付难度的前置准备排最前;

**状态**: `pending` / `in_progress` / `waiting` / `completed` 四态; `waiting` 表示当下必须等自身之外的东西, 必带 `needs`: `review`(等验收, 写"待验证"小节)、`answer`(等人回答, 写"待回答"小节) 或 `blocked`(等阻塞解除, 写"待解除"小节并给 `blocked_reason`); `pending` 可直接进 `in_progress` 或 `waiting`, `waiting` 与 `in_progress` 可互相转换, 等到回答、验收或阻塞解除后回 `in_progress` 或 `complete`; 旧文档的 `awaiting_verification` 读入时折成 `waiting + needs=review`, 旧的 `blocked` 状态不再兼容;

**一条 note 走完两个阶段**: 需要人拍板的先置 `waiting` 且 `needs=answer`, 用户答完把结论写进"定案"小节, 再回 `in_progress` 实施, 完成后 `waiting` 且 `needs=review` → `completed`; 即 `pending → in_progress → waiting/answer → in_progress → waiting/review → completed` 是常态路径, 定案与执行不单独拆 note. 只有"定案与执行由不同角色承担"或"执行要拆成多个可独立验收的能力"时才拆成两条;

- 直接依赖写进 `blocked_by`; 依赖必须存在,无环; `in_progress` 与 `completed` 的 note, 其直接依赖必须已完成, `pending` 与 `waiting` 可以先挂着.
- 完成条件是验收满足且 evidence 写清; `complete` 只接受 `waiting` 且 `needs=review` 的 note, 置 `completed`.
- 讨论,调查与计划类 note 以可检查的结论或方案为交付物; 执行类 note 以可验证的用户能力为交付物; 同一条 note 先交结论再交能力时, 两段都写在同一篇里(见上条).
- 删除或合并有下游的 note 前, 先用 `link` 改指承接产物, 或 `merge` 合并; 清空依赖传 `[]`.

### 修复校验失败

文档无法通过校验时, 不要用文件工具直接改 `notes.json`. 先用 `nano_flow_read` 的 `inspect` 看原始 note 与问题, 再由你判断如何重写, 用 `nano_flow_write` 的 `repair` 提交 `repairs`(按 id 给 title/description/content)与 `ids`. 工具不会自动截断摘要, 也不会自动删除索引项; 这些取舍必须由你给出.

### Plan 文档规则

story,spec 与单条 note 都有体积上限.超过时先压缩:

- 只允许删除能由 notes,领域文档,代码或命令重新查到的内容, 并在删除处留下指针;
- 压缩后仍有事实无处可查时, 拆成子索引: 主文件保留链接, 正文拆到 `story-NN-中文标题.md` / `spec-NN-中文标题.md`, 子文件同样受上限约束.

改写 story,spec 或拆分子文件后, 立刻用 `nano_flow_check` 的 `plan` 校验.

### 恢复与轮转

- 恢复已有 Plan(「恢复」「继续」且本会话还没加载它): 先按"业务域"确认业务域, 用 `plans` 找出该域 active 的 Plan(只有一个时可省略 `plan` 参数), 用 `resume` 拿恢复包(路径,story/spec 大小,关键索引,可推进队列,等待回答/确认与阻塞项), 再读 `spec.md` 与 `story.md`, 核对已完成步骤与工作区事实; 本轮**严格只读**: 只允许 `nano_flow_read`, 读文件与取证命令, 不写 Plan(不经 `nano_flow_write`)、不动任何文件、不执行 note、不跑构建测试或安装; 报告目标, 进度, 可推进队列, 阻塞项与下一步候选后结束本轮.
- 放行: 恢复报告之后, 用户的第一条后续消息即放行, 按 do 循环继续; 若那条消息是新的澄清需求则按 ask.
- 插件在每轮结束后检查上下文压力, 达到阈值会自动创建新会话,让它 `resume` 当前 Plan, 并物理删除旧会话.新会话只收到"只读恢复当前 Plan"这一条线索, 所以每轮结束前必须把检查点写回磁盘: spec 的"当前进度""恢复入口", note 的"执行检查点""下一步", `waiting` 的 note 按 `needs` 写"待回答"或"待验证".仅凭 Plan 就能判断目标,理由,进度,证据,缺口和下一步, 才算可以安全轮转.

## ask 循环

目标, 边界或方案未定, 或需向用户取证时读 `skills/ask/SKILL.md`, 按该 skill 的完整规格推进; 本文件不重复其步骤与记录格式.

## do 循环

用户已放行且有可推进的 note 时读 `skills/do/SKILL.md`, 按该 skill 的完整规格推进; 本文件不重复其步骤, 门禁与 review 规格.
