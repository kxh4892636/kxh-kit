# nano-mem 记忆框架

## 原始想法

> /to-story 阅读 .temp/mem0 了解 agent 记忆的原理的架构, 仿照 mem0 实现我的以下诉求
> 1. 实现 skill + cli 驱动的一级框架, cli api 设计简单直接
> 2. 记忆信息的存储+检索, 使用 sqlite + 全文搜索, 不需要向量模型 + 向量搜索
> 3. 参考 .temp/ts-fsrs 的 FSRS 机制, 每段记忆使用频率越高, 越不容易忘记, 被检索的频率和优先级更高; 长时间不用的记忆会被遗忘.
>
> skill 命名为 nano-mem, cli 命名为 nm

## 角色

## 故事

## 迷雾

## 上下文

- `.temp/mem0/` — agent 记忆参考实现（架构正由 subagent 研究中）
- `.temp/ts-fsrs/` — FSRS 间隔重复调度器参考（机制正由 subagent 研究中）
- `.agents/skills/loop-x/references/skills/to-story/TEMPLATE.md` — 故事模板
