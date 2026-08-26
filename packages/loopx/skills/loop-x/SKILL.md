---
name: loop-x
description: 把想法沿 Loop Kit 路由为领域设计、用户故事、tracer-bullet issues 和经门禁验证的交付；当需要从想法推进到实现、拆分大型工作、判断下一步 skill 或检查流程状态时使用。
---

# /loop-x

`/loop-x` 是从想法到交付的路由图。选择路径后，完整读取并执行该路径指向的 skill；各子 skill 是具体行为的单一事实源。

工作依附于当前 workspace 时，先读取 [`DOMAIN.md`](references/DOMAIN.md)，再按其中的定位顺序读取工作区根 `CONTEXT-MAP.md`、相关业务域的 `CONTEXT.md` 和 ADR。路径只在当前卡点的完成标准成立后向前推进。

创建或修改领域文档、spec 或 issue 后，在工作区根目录执行：

```powershell
node .agents/skills/loop-x/script/check-domain.mjs .
```

`/loop-x` 安装在其他位置时，将命令中的 `.agents/skills/loop-x` 替换为当前 `SKILL.md` 所在目录。脚本只依赖 Node.js 标准库，不依赖工作区的 package scripts 或第三方包。

## 路由并进入 Flow

完整读取 [`FLOW.md`](references/FLOW.md)，它是四个触发 skill 共用的 `flow.mjs` 调用协议。

1. 根据用户输入只推荐一条入口路径，并说明选择理由：设计或领域理解仍需打磨时选择 `/grill-with-docs`；角色、需求或收益仍模糊时选择 `/to-story`；目标明确但工作大到一次上下文无法安全完成时选择 `/to-issues`。
2. 等待用户明确确认推荐路径。未确认时继续澄清或调整推荐，不进入 Flow。
3. 确认后由 `/loop-x` 按共享协议以自身为 Flow 发起者、确认结果为入口执行 `enter-plan`，保留返回的 flow context，再只调用返回的入口 skill。

入口 skill 接收 `/loop-x` 传递的 context 后直接执行自身工作；直接调用入口 skill 时，则由入口 skill 按共享协议自动进入其固定路径。

## 主路径：想法到交付

```text
/grill-with-docs
  └─ 设计卡点通过 ─> /dev-gate
                         └─ ready ─> /implement
                                       ├─ /tdd
                                       ├─ /verifying
                                       ├─ /code-review
                                       └─ commit
```

1. 使用 [`/grill-with-docs`](references/subskills/grill-with-docs/SKILL.md) 打磨设计，并就地维护已确认的领域术语与 ADR。
2. 使用 [`/dev-gate`](references/subskills/dev-gate/SKILL.md) 检查准入条件，确认工作环境、执行契约和验收门禁。结论为 `ready` 后进入实现。
3. 使用 [`/implement`](references/subskills/implement/SKILL.md) 在确认的边界内交付。实现默认在合适 seam 上运行 [`/tdd`](references/subskills/tdd/SKILL.md)，随后由 [`/verifying`](references/subskills/verifying/SKILL.md) 建立证据链，再由 [`/code-review`](references/subskills/code-review/SKILL.md) 分别审查 Standards 与 Spec，最后提交。

实现中的范围、环境、执行契约或验收门禁发生实质漂移时，返回 `/dev-gate` 重新确认。

## 接入路径

### 模糊想法：先形成用户故事

```text
/to-story ──故事卡点通过──> /to-issues ──Issue 图卡点通过──> /dev-gate
```

当角色、需求或收益仍不清楚时，使用 [`/to-story`](references/subskills/to-story/SKILL.md)。它通过 `/grilling` 推进讨论与后台调研，把已确认内容就地写入 `story.md`。故事集完成后进入 `/to-issues`，再汇入主路径的 `/dev-gate`。

### 超大工作：直接拆为 tracer bullets

```text
/to-issues ──Issue 图卡点通过──> /dev-gate
```

当工作大到单次上下文无法安全完成，但问题、用户和目标已足够明确时，使用 [`/to-issues`](references/subskills/to-issues/SKILL.md)。它通过 `/grill-with-docs` 将确认内容维护为一份 spec 和一张可独立实现、交付、验收的 tracer-bullet issue 图，再汇入主路径。

## 工作流索引

可复用工作流的触发条件只在本节维护。命中后完整读取对应工作流文件；工作流正文不重复触发条件。目录概览见 [`workflows/README.md`](references/workflows/README.md)。

## 路径卡点

| 卡点         | 通过条件                                                                                                                                                  | 未通过时                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 设计卡点     | `/grilling` 的 frontier 为空；领域术语与符合条件的 ADR 已同步；用户确认共同理解                                                                           | 继续 `/grill-with-docs`                            |
| 故事卡点     | 每条故事有唯一有序编号和可判定验收；迷雾已清空或经用户接受；用户确认覆盖原始想法                                                                          | 继续 `/to-story`                                   |
| Issue 图卡点 | 范围无遗漏且责任单一归属；直接依赖说明消费契约；图有根、无自环、无环；全部决策已澄清；下一步均为 `/implement`；issue 均为 `pending`；用户确认边界与依赖图 | 继续 `/to-issues`，语义决策回到 `/grill-with-docs` |
| 执行准入卡点 | `/dev-gate` 的路径准入和三项基线均获用户确认，结论为 `ready`                                                                                              | 修正文档或基线，重新执行 `/dev-gate`               |
| 交付卡点     | `/verifying` 对约定门禁给出 `passed`；Standards 与 Spec 两轴的阻断发现已处理或明确接受；交付已提交至当前分支                                              | 门禁失败进入最小修复循环；基线漂移返回 `/dev-gate` |

## To Issues 的文档形状

新 Plan 创建在 `active/`。精确模板、tracer-bullet 规则与维护步骤以 [`/to-issues`](references/subskills/to-issues/SKILL.md) 为准。

```text
docs/{domain-name}/plans/active/YYYY-MM-DD-中文工作名/
├── story.md              可选，由 /to-story 维护
├── spec.md               聚合状态、问题、方案、边界、环境与 Issue 表
├── 01-中文标题.md         status + blocked_by + 交付/范围/依赖/验收/上下文/下一步
└── 02-中文标题.md
```

- `blocked_by` 只列直接依赖的稳定 ID。
- 编号从 `01` 开始，按依赖顺序连续递增；至少一个根 issue 的 `blocked_by` 为空。

## 独立能力

- 不依附工作区的思考打磨使用 [`/grilling`](references/subskills/grilling/SKILL.md)。
- 模块边界与 deep-module vocabulary 使用 [`/codebase-design`](references/subskills/codebase-design/SKILL.md)。
- 编写、修改或审查代码使用 [`/code-spec`](references/subskills/code-spec/SKILL.md)。
- 编写 skill、`AGENTS.md` 或 agent context pointer 使用 [`/writing-for-agents`](references/subskills/writing-for-agents/SKILL.md)。
