---
name: to-skill
description: 编写或优化供 agent 使用的 skill 时使用；围绕单一循环组织工作流程，设计上下文引用与渐进披露层级，使用紧凑概念引导行为并删减无关或无效指令。
---

编写供 agent 消费的 skill, 抽象通用的工作流程(过程类似, 但输出各异);

## 工作流程

循环是 agent 执行过程中反复出现的模式, 工作流程用于循环的规格化, 一份工作流只规格化一个循环，结构由循环决定。

**loop(循环)** 是反复出现且有可辨认起止边界的活动。
**workflow(工作流程)** 是指导循环每次运行的规格；可规定固定步骤、提供现场派生步骤的上下文，或混合两者。

## Context pointers

**Context pointer**: 针对其他参考文档的引用; 同一 skill 引用以 `SKILL.md` 为根目录的相对路径. 跨 skill 使用占位符形式的相对路径 `<others-skill-root-dir>/references/DOMAIN.md`;
**Branch**: 工作流程的不同 case, 使用 **Leading word** 和 **pointer** 触发;

## 信息层级

skill 可由顺序执行的 **steps**、按需查阅的 **reference** 或两者混合组成。

1. **In-file step**：顺序执行的工作流程。
2. **In-file reference**：文件内引用, 同级规则的扁平集合;
3. **Disclosed reference**: 文件外引用, 即使用 **pointer**;

**Sprawl** skill 保持极简克制, 按 branch 或 step 下沉 in-file 或 disclosed reference，只携带最小必要内容, 以实现 **Progressive disclosure**; 滥用 in-file 会导致 skill 顶层臃肿, 滥用 disclosed 会遮蔽必要的参考文档;
**Co-location** 相同语义的内容放置在一起, 保持良好的时间局部性和空间局部性；
**Single source of truth**：每个语义只有一个权威位置，使行为变更成为单点编辑。

## Leading words

**Leading word** 用紧凑概念锚定行为。优先选择已有概念调用 model 的priors；自造词需自行承担定义成本。
**Prompt positive**：直接陈述目标的正向行为。否定句会激活被禁止的行为；无法正向表达的 hard guardrail 可允许使用负向论述。

## Pruning

- **Relevance**：逐行检查 skill 内容的相关性。持续清理无关说明、应下沉的分支和过时规则。
- **No-ops**：逐行检查 skill 内容和 leading words 的有效性, 若相较 model 默认行为没有发生明显改变, 进行整段内容删除或更强论述改写。
