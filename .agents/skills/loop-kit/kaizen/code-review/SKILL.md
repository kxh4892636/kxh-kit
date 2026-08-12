---
name: code-review
description: 沿两个轴审查自 fixed point(commit, branch, tag 或 merge-base)以来的变更 - Standards(代码是否遵循此仓库记录的编码规范?)和 Spec(代码是否符合原始 issue/spec 的要求?). 使用并行 sub-agents 运行两项审查, 并并列报告结果. 当用户想审查 branch, PR, work-in-progress 变更, 或要求 "review since X" 时使用.
---

沿两个轴审查 `HEAD` 与用户提供的 fixed point 之间的 diff:

- **Standards** - 代码是否符合此仓库记录的编码规范?
- **Spec** - 代码是否忠实实现了原始 issue / spec?

两个轴均由 **parallel sub-agents** 运行, 避免彼此污染 context, 然后由本 skill 汇总它们的发现.

## 流程

### 1. 固定 fixed point

用户所说的任何基准都是 fixed point, 例如 commit SHA, branch 名称, tag, `main`, `HEAD~5` 等. 如果用户没有指定, 询问用户.

一次性记录 diff 命令: `git diff <fixed-point>...HEAD`(three-dot, 因此以 merge-base 为比较基准). 同时通过 `git log <fixed-point>..HEAD --oneline` 记录 commit 列表.

继续之前, 确认 fixed point 可以解析(`git rev-parse <fixed-point>`), 且 diff 非空. 无效 ref 或空 diff 应在此处失败, 而不是在两个 parallel sub-agents 内部失败.

### 2. 确定 Spec 来源

按以下顺序查找原始 spec:

1. 用户作为参数传入的路径.
2. `docs/` 下与 branch 名称或 feature 匹配的 spec 文件.
3. 如果没有找到, 询问用户 spec 在哪里. 如果用户表示没有 spec, 跳过 **Spec** sub-agent, 并报告 "没有可用的 spec".

### 3. 确定 Standards 来源

repo 中任何说明代码应如何编写的内容, 例如 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`.

除仓库记录的内容外, Standards 轴始终带有以下 **smell baseline** - 一组固定的 Fowler code smells(_Refactoring_, 第 3 章), 即使仓库没有记录任何规范也适用. 它受两条规则约束:

- **The repo overrides.** 仓库中记录的 standard 始终优先. 如果它认可 smell baseline 会标记的内容, 则抑制该 smell.
- **Always a judgement call.** 每个 smell 都是带标签的 heuristic("可能存在 Feature Envy"), 绝不是硬性违规. 与这里的任何 standard 一样, 跳过工具已经强制执行的内容.

每个 smell 都按_它是什么_ → _如何修复_来描述. 将其与 diff 对照:

- **Mysterious Name** - function, variable 或 type 的名称没有揭示它执行或承载的内容. → 重命名. 如果想不出诚实的名称, 说明设计含混不清.
- **Duplicated Code** - 同一种逻辑形态出现在本次变更的多个 hunk 或文件中. → 提取共享形态, 并从两处调用它.
- **Feature Envy** - method 访问另一个 object 的数据多于自身数据. → 将 method 移到它所依恋的数据上.
- **Data Clumps** - 相同的几个 fields 或 params 总是一起传递(一个等待诞生的 type). → 将它们组合为一个 type, 并传递该 type.
- **Primitive Obsession** - 使用 primitive 或 string 代替一个值得拥有自身 type 的 domain concept. → 为该概念提供独立的小型 type.
- **Repeated Switches** - 针对相同 type 的同一种 `switch`/`if` cascade 在变更中反复出现. → 使用 polymorphism 替代, 或让两处共享同一个 map.
- **Shotgun Surgery** - 一项逻辑变更迫使 diff 跨多个文件进行分散编辑. → 将共同变化的内容收拢到一个 module 中.
- **Divergent Change** - 一个文件或 module 因多个不相关的原因被编辑. → 拆分它, 让每个 module 只因一个原因而变化.
- **Speculative Generality** - 为 spec 中不存在的需求添加 abstraction, parameters 或 hooks. → 删除它, 持续 inline, 直到真实需求出现.
- **Message Chains** - 调用方不应依赖的长 `a.b().c().d()` navigation. → 将这段 traversal 隐藏在第一个 object 的一个 method 后面.
- **Middle Man** - 主要只是继续 delegate 的 class 或 function. → 删除它, 直接调用真正的目标.
- **Refused Bequest** - subclass 或 implementer 忽略或覆盖了所继承内容中的大部分. → 放弃 inheritance, 使用 composition.

### 4. 并行派遣两个 sub-agents

**Standards sub-agent prompt** - 包含:

- 完整的 diff 命令和 commit 列表.
- 第 3 步找到的 standards 来源文件列表, **以及完整粘贴第 3 步的 smell baseline**. sub-agent 无法通过其他方式访问它.
- brief: "按相关文件/hunk 报告: (a) diff 中每一处违反已记录 standard 的位置, 引用该 standard(文件 + 规则). (b) 发现的任何 baseline smell, 给出名称并引用对应 hunk. 区分硬性违规与判断项. 违反已记录 standard 可以是硬性违规, 但 baseline smells 始终是判断项, 且仓库中记录的 standard 优先于 baseline. 跳过工具已强制执行的内容. 不超过 400 字."

**Spec sub-agent prompt** - 包含:

- diff 命令和 commit 列表.
- spec 的路径或已取得的内容.
- brief: "报告: (a) spec 要求但缺失或只完成一部分的 requirements. (b) diff 中未被要求的 behavior(scope creep). (c) 看似已实现, 但实现方式似乎有误的 requirements. 每项发现都引用对应 spec 行. 不超过 400 字."

如果缺少 spec, 跳过 Spec sub-agent, 并在最终报告中注明.

### 5. 汇总

在 `## Standards` 和 `## Spec` 标题下逐字呈现或轻度整理两份报告. **不要**合并发现或重新排序. 两个轴是刻意分开的(参见_为什么使用两个轴_).

最后用一行总结: 每个轴的发现总数, 以及_每个轴内部_最严重的问题(如果有). 不要跨轴选出唯一最严重的问题, 因为这种重新排序正是两个轴的分离所要避免的.

## 为什么使用两个轴

一项变更可能通过一个轴, 却未通过另一个轴:

- 代码遵循每一条 standard, 却实现了错误的内容 → **Standards pass, Spec fail.**
- 代码准确实现了 issue 的要求, 却违反项目约定 → **Spec pass, Standards fail.**

分开报告可以防止一个轴掩盖另一个轴.
