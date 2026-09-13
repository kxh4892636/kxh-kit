---
status: completed
blocked_by: ["04"]
---

# 闭合 Nano Mem agent skill

## 交付

agent 可以通过一个 `nano-mem` skill 完成 recall → use → remember/resolve → forget 的记忆闭环，而无需理解 SQLite、FSRS 或 CLI 内部结构。

## 范围

- 创建包内 `skills/nano-mem` 完整 skill，使用已确认领域语言和稳定 `nnm` JSON/错误契约。
- 定义任务前的少量查询、结果裁剪、实际采用后的 use、原子记忆提炼和新增前冲突搜索流程。
- 定义显式 remember/update/forget/restore/delete 的安全边界；永久删除必须保留用户确认要求。
- 不添加 hooks、自动全会话捕获、后台维护或第二个 CLI 路由 skill。

## 直接依赖

- 04：需要完整且稳定的记忆命令与生命周期语义；消费其 JSON DTO、领域错误、search/use/forget/restore 契约。

## 验收

- [x] skill 的最小场景可复核演练：无结果静默、检索并采用后 use、精确重复幂等、语义冲突显式 update、长期记忆 restore 后再 use。
- [x] skill 只注入任务相关的精炼内容，不把 CLI envelope、内部计数或 FSRS 参数原样放入 agent 上下文。
- [x] 新增前明确 search，CLI 不承担语义合并；delete 只有在人类明确永久删除目标后才调用 `--force`。
- [x] skill 目录符合 skill 校验与包分发要求，所有引用文件随 skill 自包含且不存在工作区绝对路径。

## 交付记录

- 交付物：包内单一 model-invoked `skills/nano-mem/SKILL.md`，闭合 recall → use → remember/resolve → forget/restore/delete 策略面。
- skill 只选择相关 `content` 和必要 `source` 进入工作上下文，明确排除 envelope、生命周期内部量、原始会话与临时任务状态。
- 每次 add 前先 search；精确重复使用 CLI 幂等结果，语义修正显式 update，永久 delete 必须由人类明确目标与不可逆意图后才使用 `--force`。
- ID 与 DTO-derived selector 一起保留并重放；真实 CLI walkthrough 证明 current project、global 和显式其他 project 的 recall/use/maintenance 闭环。
- 验证证据：包级 `check` 通过；最小场景与 selector replay 均使用临时 `NANO_MEM_HOME` 完成真实 built CLI walkthrough。
- 本机缺少 Python launcher，因而读取 `quick_validate.py` 并逐项执行其 frontmatter、name、description 和 TODO 等价检查，全部通过。
- 以 `748d6ef14882fba3de30fe933c0577580d4c619a` 为 fixed point 的 Instruction-quality 与 Spec 双轴复审均为 0 findings。

## 上下文

- [spec.md](spec.md)
- [story.md](story.md)
- [Nano Mem 领域语言](../../../CONTEXT.md)
- [ADR 0001](../../../adr/0001-分离skill策略面与cli机制面.md)

## 下一步

/code-delivery
