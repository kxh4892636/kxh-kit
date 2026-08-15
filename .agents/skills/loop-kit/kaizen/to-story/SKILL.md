---
name: to-story
description: 把模糊想法打磨为 plan 目录下的 story.md——按 epic 组织、各带验收的用户故事集; plan 的可选成员, 不存在则忽略.
argument-hint: "要把什么想法打磨成用户故事?"
disable-model-invocation: true
---

# To Story

用户故事的 **3C**: 卡片(story.md), 对话(`/grilling`), 确认(验收). 本 skill 运行 `/grilling`, 把一个模糊想法打磨为 story.md, 落在 plan 目录:

```text
docs/{domain-name}/plans/{lifecycle}/YYYY-MM-DD-中文工作名/
├── story.md
├── spec.md
└── 01-中文标题.md
```

story.md 与 spec.md 同级, 是 plan 的**可选**成员: plan 可以只有 story.md(故事刚清晰, 尚未拆分), 也可以没有 story.md(直接拆分的工作); 消费方找不到它时静默忽略. 目录命名与 lifecycle 规则同 `/to-issues`; 新 plan 一律落在 `active/`.

从 `CONTEXT-MAP.md` 定位业务域, 读取该域 `CONTEXT.md` 借用词汇. 访谈确认的内容只落 story.md, 不写 `CONTEXT.md` 或 ADR——此阶段的决策尚未明确, 不进领域文档.

## 行动地图

打磨不是固定工序, 而是一张**迷雾中的行动地图**: 有多少角色, 多少故事, 多少未知, 开始前都不可见; 只有路径不停向前推进, 迷雾才逐渐散开, 新路径随之显现.

每轮从地图边缘选择可推进的路径——互不依赖的并行, 有依赖的串行:

- **与用户讨论**——按 `/grilling` 的 rounds 询问 frontier: 为谁做, 想要什么, 为什么;
- **后台调研**——派遣 sub-agent 查明环境事实(代码库现状, 领域文档, 既有 plan).

每轮确认的内容**就地**落入 story.md, 不攒批:

- 明确的角色 → 「角色」节;
- 明确的故事 → 「故事」节对应 epic 之下; 不足以成 epic 的精简故事直接独立列出;
- 新发现的空白 → 「迷雾」节, 澄清后 graduate 为故事.

**完成标准:** frontier 为空; 每条故事都有验收; 迷雾节清空, 或条目经用户确认接受; 用户确认故事集覆盖原始想法. 需要拆分为实现工作时, 带着 story.md 进入 `/to-issues`.

## story.md 模板

```markdown
# {工作名}

## 原始想法

{用户的最初表述, 保留原话}

## 角色

- **{角色名}**: {是谁, 处境与工作方式}

## 故事

### {Epic 标题}

{一句话: 这组故事共同完成什么}

#### {故事标题}

作为 {角色}, 我 {想要}, 以便 {收益}.

- [ ] {可判定的验收结果}

## 迷雾

{尚未探索清楚的空白; 澄清后 graduate 为故事}
```

模板章节是最小集合; 扩展规则同 `/to-issues` 的「模板扩展」.
