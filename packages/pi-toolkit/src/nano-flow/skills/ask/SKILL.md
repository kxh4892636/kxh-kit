---
name: ask
description: 调研、规划或询问时使用；面对新需求、未定方案或需要澄清的任务，先取证事实，再逐轮提问收敛范围、依赖与取舍，并把结论写入 Plan；也用于复核已有方案与决策。
---

# Ask

持续拷问用户，直到双方达成共识。

## 逐轮拷问

**Design tree** 按决策依赖展开，每个决策分出挂在它下面的下游决策。按 **轮** 推进这棵树；**Frontier** 是前置决策均已定案、此刻就能提问的全部决策——不用猜测尚未听到的答案。

1. **取证**：事实是 agent 的职责，不向用户索取。查文件、跑命令、读工作区自己拿。取证不阻塞整轮：仍在查的事实算未定前置，只有它的下游问题等它，其余 frontier 本轮照常提问。
2. **拷问**：每轮用 `ask_questions` 覆盖整个 frontier；每题编号并给出推荐答案（推荐项放首位，用户答「是」即接受推荐项），每题 2–3 个互斥选项。答案依赖本轮其他未决问题的题，归下一轮。
3. **修订**：每轮回答重塑这棵树：定案把 frontier 向外推，解锁依赖它的问题。更新选择、被排除路径与假设，重算 frontier；上游改变时复核并修订失效的下游结论。
4. **收敛**：frontier 为空即完成——每个分支都已访问，没有静默假设。用户确认达成共识之前不动手实现；确认后同步进度与恢复入口，跑 `nano_flow_check`。

## 每轮记录

拷问记录写进相关 note 的正文，按轮保留仍影响当前决策的问答，随本轮批量写落盘。

```markdown
**Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>
➡️ <your recommended answer>

---

**Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>
<your recommended answer>
```

## 按交付单元聚合

方案收敛后，按 **可独立验收的交付单元** 划分 note。同一交付单元内的返工、补测、修正与验证并入原 note，不新开；只有验收条件或状态需要分别表达（会单独 `blocked` 或单独完成验收）时才拆成两条。降低后续交付难度的前置准备排最前。唯一例外是大范围机械重构：expand → 按影响面分批 migrate（每批一个 note）→ contract 删除旧形态。
