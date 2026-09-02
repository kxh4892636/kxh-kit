---
name: to-story
description: 打磨模糊想法为有序、可验收的用户故事集；当角色、期望收益或用户结果尚不足以安全拆分为 issues 时使用。
argument-hint: "要把什么想法打磨成用户故事?"
---

# To Story

用户故事使用 **3C**：`story.md` 是 card，分轮访谈形成 conversation，可判定验收形成 confirmation。

## 1. 定位 Plan

完整读取 `<nano-flow-skill-root-dir>/references/DOMAIN.md`，从 `CONTEXT-MAP.md` 定位 owner 域并读取相关 `CONTEXT.md`、ADR 和已有 Plan。新 Plan 创建于：

```text
docs/{domain-name}/plans/active/YYYY-MM-DD-中文工作名/story.md
```

读取 [`TEMPLATE.md`](TEMPLATE.md) 后创建或载入 `story.md`。访谈中的候选决策只进入该文件；领域术语或 ADR 要到 `/quest-with-domain` 获得确认后才改变。

owner、Plan 路径、原始想法和所有相关现有产物已确定时，本步骤完成。

## 2. 拷问故事地图

持续访谈直到与用户达成共同理解。把角色、用户结果、收益、边界、验收与未知项映射为 **design tree**：每个待定决策是一个节点，依赖它的决策位于下游；**frontier** 是前置均已确定、当前无需猜测即可回答的全部节点。

按 **rounds** 推进 design tree。每轮询问整个 frontier：问题依次编号，提供 agent 的推荐答案与关键理由，然后等待用户回答。依赖本轮未决答案的问题留到下一轮。使用以下格式：

```markdown
❓ **Q1 - {问题标题}**：{问题；需要时列出互斥选择}

➡️ **建议**：{推荐答案与关键理由}

❓ **Q2 - {问题标题}**：{问题；需要时列出互斥选择}

➡️ **建议**：{推荐答案与关键理由}
```

用户的答案会重塑 design tree：用已确定决策推进 frontier，补入新暴露的下游节点，再重新计算下一轮。事实由 agent 通过工作区与工具查明，不把可检索问题交给用户；需要继续探索时委派 subagent，并把进行中的探索视为未决前置，只暂停其下游，当前 frontier 的其余问题照常询问。角色、收益、边界与验收等判断由用户决定并等待其回答。

用户确认共同理解前，工作限于取证、访谈与维护 `story.md`；确认后才闭合故事集。

每轮把已确认内容就地写入 `story.md`：

- 角色进入「角色」。
- 完整用户结果进入「故事」，属于同一较大结果时归入 epic，否则保持独立故事。
- 新空白进入「迷雾」，澄清后迁移到权威章节。
- 使用过的 PRD、spec、ADR、commit 或 diff 进入「上下文」。

design tree 的每个可达分支都已访问，frontier 为空且没有静默假设；agent 已复述最终故事地图，用户明确确认达成共同理解时，本步骤完成。

## 3. 闭合故事集

逐项核对原始想法与故事地图：每条故事有唯一且单调递增的 `US-NNN`、明确角色与收益、至少一项可判定验收；迷雾为空或每个保留项都获用户明确接受；每个原始意图都恰好映射到故事或已接受的非范围。

从工作区根执行 `node <nano-flow-skill-root-dir>/script/check-domain.mjs .`。校验通过且用户确认故事集覆盖原始想法后，本步骤完成。
