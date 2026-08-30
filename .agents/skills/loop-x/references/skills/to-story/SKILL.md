---
name: to-story
description: 打磨模糊想法为有序、可验收的用户故事集；当角色、期望收益或用户结果尚不足以安全拆分为 issues 时使用。
argument-hint: "要把什么想法打磨成用户故事?"
---

# To Story

用户故事使用 **3C**：`story.md` 是 card，`/questing` 产生 conversation，可判定验收形成 confirmation。

## 1. 定位 Plan

完整读取 [`DOMAIN.md`](../../DOMAIN.md)，从 `CONTEXT-MAP.md` 定位 owner 域并读取相关 `CONTEXT.md`、ADR 和已有 Plan。新 Plan 创建于：

```text
docs/{domain-name}/plans/active/YYYY-MM-DD-中文工作名/story.md
```

读取 [`TEMPLATE.md`](TEMPLATE.md) 后创建或载入 `story.md`。访谈中的候选决策只进入该文件；领域术语或 ADR 要到 `/quest-with-domain` 获得确认后才改变。

owner、Plan 路径、原始想法和所有相关现有产物已确定时，本步骤完成。

## 2. 进入 Flow 并清空迷雾

完整读取 [`FLOW.md`](../../FLOW.md)。顶层直接调用时从 `/to-story` 进入主流程；收到 `/loop-x` context 时直接复用。

以故事地图为 design tree 运行 `/questing`：角色、故事和未知项都是 branch；无依赖的决策进入同一 frontier，有依赖的决策留到后续 round。环境事实由 agent 检索，用户决定角色、收益、边界与验收。

每轮把已确认内容就地写入 `story.md`：

- 角色进入「角色」。
- 完整用户结果进入「故事」，属于同一较大结果时归入 epic，否则保持独立故事。
- 新空白进入「迷雾」，澄清后迁移到权威章节。
- 使用过的 PRD、spec、ADR、commit 或 diff 进入「上下文」。

`/questing` frontier 为空并登记完成、脚本返回 `/to-story` 时，本步骤完成。

## 3. 闭合故事集

逐项核对原始想法与故事地图：每条故事有唯一且单调递增的 `US-NNN`、明确角色与收益、至少一项可判定验收；迷雾为空或每个保留项都获用户明确接受；每个原始意图都恰好映射到故事或已接受的非范围。

从工作区根执行 `node <loop-x-skill-dir>/script/check-domain.mjs .`。校验通过且用户确认故事集覆盖原始想法后，本步骤完成。
