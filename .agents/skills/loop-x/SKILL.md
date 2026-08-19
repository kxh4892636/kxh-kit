---
name: loop-x
description: Loop-X-Flow 提供的原子能力 skill, 在 Loop-X-Flow 或日常的工作过程中使用.
---

# Loop-X

Loop-X-Flow 提供的原子能力 skill 集合. 按需查阅下表中的 subskill.

| skill 名称 | 触发条件 |
| ---- | -------- |
| [code-review](subskills/code-review/README.md) | 沿两个轴审查自 fixed point(commit, branch, tag 或 merge-base)以来的变更 - Standards(代码是否遵循此仓库记录的编码规范?)和 Spec(代码是否符合原始 issue/spec 的要求?). 使用并行 sub-agents 运行两项审查, 并并列报告结果. 当用户想审查 branch, PR, work-in-progress 变更, 或要求 "review since X" 时使用. |
| [codebase-design](subskills/codebase-design/README.md) | 用于设计 deep modules 的共享 vocabulary. 当用户想要设计或改进 module 的 interface, 寻找 deepening 机会, 决定 seam 的位置, 提高代码的可测试性或 AI 可导航性, 或其他 skill 需要 deep-module vocabulary 时使用. |
| [grill-with-docs](subskills/grill-with-docs/SKILL.md) | 拷问设计, 并将确认的术语与决策就地写入领域文档(CONTEXT.md, ADR). 当用户想打磨设计或想法且需要留下文档记录, 确定 domain terminology 或 ubiquitous language, 记录 architectural decision, 或其他 skill 需要维护 domain model 时使用. |
| [grilling](subskills/grilling/SKILL.md) | 持续拷问用户的计划, 决策或想法. 当用户想要 stress-test 自己的思考, 或使用任何 'grill' 触发短语时使用. |
| [implement](subskills/implement/SKILL.md) | 根据 spec 或 issues 实现工作. |
| [tdd](subskills/tdd/README.md) | Test-driven development. 当用户想以 test-first 方式构建 features 或修复 bugs, 提到 "red-green-refactor", 或需要 integration tests 时使用. |
| [to-issues](subskills/to-issues/SKILL.md) | 把一次上下文无法安全完成的工作维护为领域 plan——一份 spec 加一张 tracer-bullet issue 图, 落在 docs/{domain-name}/plans/. |
| [to-workflow](subskills/to-workflow/SKILL.md) | 将一个反复出现的循环固化为可运行的工作流. |
| [verifying](subskills/verifying/README.md) | 交付验证:需要为变更执行本地或运行态门禁,最小重验,并给出证据化交付结论时使用. |
| [writing-for-agents](subskills/writing-for-agents/SKILL.md) | 为 agents 编写文档. 创建或编辑 skills, 或修改 AGENTS.md 或 CLAUDE.md 时使用. |
