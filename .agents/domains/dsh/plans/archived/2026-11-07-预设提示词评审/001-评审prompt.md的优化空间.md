---
name: '001-评审prompt.md的优化空间'
description: 'prompt.md 评审意见 29 条：9 项行为缺口、17 项重复与模糊、3 项结构格式，P0–P2 排序。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 001-评审prompt.md的优化空间

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

口径：`packages/dsh-toolkit/src/nano-flow/prompt.md`（210 行 / 12,956 B；dist 同名同大小；按字面量注入、无变量、跨会话字节稳定）。对照：三工具实现、`contract.ts` 默认上限、`check-domain.mjs`、随包 skill、README、`docs/dsh/CONTEXT.md`。结论：有空间，重点在触发条件与重复。

## P0 行为缺口

1. **L5–12 模式无优先级**：L12「缺省 ask」与 L124「接到继续→继续」冲突。→ 显式 `/ask` `/do`（或对应 skill 内容）> 延续当前 Plan 的「继续」→ do > 其余 → ask；删「用户可显式指定」。
2. **无「何时建 Plan」**：L76–82、L124、L133 假定 Plan 已存在；域在但无 active Plan 时无处落盘（本会话即此）。→ 无 active Plan 或新目标 → `init`。
3. **域根冲突按会话问**：L36 与本仓库 map（docs/）和工具根（.agents/domains）不一致。→ 一次性对齐方案记入 Plan，之后沿用；树根写 `{域根}`。
4. **story/spec 结构矛盾**：L82「结构自定」vs L125 四个锚点。→ 自定 + 固定 spec「当前进度」「恢复入口」、note「执行检查点」「下一步」。
5. **空节**：L92–93 的 `### story/spec`。→ 删。
6. **拷问记录无落点**：L138 第一轮还没有 note。→ 写进 spec 同名章节。
7. **ask 护栏位置**：L131–133 的硬护栏（先指出冲突、2–3 选项）只在 `skills/ask`；缺省 ask 时加载不到。→ 并进 ask 循环。
8. **读文档清单三处不一致**：L46、L120、L169（common / CONTEXT+adr / 缺 common）。→ 合并到「定位」，门禁只引用。
9. **工具节重复**：L206–210 与三工具 schema 近逐字重复；唯一增量「link 清空传 []」。→ 迁走后删整节。

## P1 重复与模糊

10. **L34 init 文案**：只提 CONTEXT/QUESTIONS；实际还建 story/spec/notes.json 并改 map。→ 拆「域脚手架」与「Plan 产物」。
11. **L98 index 1–下限**：校验只查上限。→ 改「最多 `indexMaxRows` 项」或补校验。
12. **L100 description**：写成「当前 notes 的概述」，实际是单条 note 摘要。→ 改。
13. **L171「已确认设计」**：可在 Plan 外，与 L3「Plan 是唯一权威状态」冲突。→ 先写进 spec 再当输入。
14. **未验证口径重复**：L162 与 L177。→ 留 177。
15. **reference 迁移重复**：L90 与 L203。→ 留 90。
16. **首段与 persona 重复**：L3 的「Plan 是唯一权威状态」在预设 persona 里已有。→ 首段只留两循环。
17. **do 5 步与分节重复**：L161–165 与门禁/执行/verifying/review/完成登记。→ 保留 5 步，各节只写契约。
18. **L174「固定比较点」**：无定义。→ 改「验收基线」。
19. **L66 ADR「必要时」**：无判据。→ 有被否决备选写 Considered Options，需长期跟踪补 Status。
20. **L196 Standards「基于已有知识」**：空转。→ 按 AGENTS.md、该域规范与命中的规范 skill。
21. **L70 Workflow 无沉淀执行者**：kaizen 触发已被删。→ 补 `/kaizen` 或明说会话内不建。
22. **L132「高置信」无门槛**：→ 有可回读证据且无互斥选项。
23. **L44/L48「同步」**：触发覆盖输入/取证/决策/执行/验证，等于每步；L48 讲的是引用与检查点。→ 定义「同步=定位/更新/同步/校验」，第三 bullet 改名「对齐」。
24. **L40 跨域漂移无规则**：→ 先指出，由用户决定新会话或 `common`。
25. **L193 review 固定两个 subagent**：文档型交付也强制。→ 按交付物类型决定。
26. **L113–116 与 L138 冲突**：只允许删可重查内容，拷问记录不可重查，note 超 13 KB 时无合法压缩路径。→ 允许把历史轮次折叠为结论指针。

## P2 结构与格式

27. **标点/大小写**：半角 `;` 与全角 `；` 混排；L133「plan」小写。
28. **拷问记录模板**：L140–157 每题 6 字段，长 frontier 下拉高 note 体量。→ 合并「修改意见/处理结论」。
29. **顺序**：把「定位/读什么」提到业务域开头，领域知识四步与 Plan 文档规则合并，约 -2 KB。

## 相邻

- `skills/ask/SKILL.md` 的「基本提示词」与本域术语「固定提示词」不一致。
- `README.md` 固定提示词描述含「三个工具的分工」，删节后需同步。
- `assets.lock.json` 只覆盖 to-skill / code-spec / learning / kaizen；prompt.md 与 ask skill 不在锁内。

## 优先级

P0：1–9；P1：10–26；P2：27–29。

## 迁移前的证据
- `packages/dsh-toolkit/src/nano-flow/prompt.md`：12,956 B / 210 行；`dist/nano-flow/prompt.md` 同为 12,956 B（Get-Item、Measure-Object）
- `nano_flow_read plans` 输出：「工作区 C:\\Users\\kxh\\kxh-awesome\\projects\\kxh-kit 里还没有 Plan（域根 .agents/domains）」——本会话无 Plan 可落盘，对应评审 A1
- `src/nano-flow/tools/write.ts` L305「link 清空依赖传 []」、L316「completed 只能由 complete 动作设置」、L383–384 工具描述已含本节内容
- `src/contract.ts` 默认上限：note 13 KB、story/spec 34 KB、index 13 行、ADR 55 个
- `scripts/check-domain.mjs` 只校验 `index.length > limits.indexMaxRows`，无 1 项下限；`checkPlanDocuments` 要求 story/spec 含中文
- 评审结论已在 2026-11-07 回复用户（P0/P1/P2 清单）
