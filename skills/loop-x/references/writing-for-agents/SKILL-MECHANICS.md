# Skill mechanics

[`writing-for-agents`](SKILL.md) 中 skill 特有的 branch: 当文档是 skill 时会发生哪些变化, 包括 frontmatter, invocation choice 和 router skills. 其他所有写法都使用 `SKILL.md` 中的通用 reference.

## Invocation

两种选择, 在 two loads 之间进行权衡:

- **model-invoked** skill 保留 `description`, 因此 agent 可以自主触发它, 其他 skills 也能到达它. 你仍然可以输入它的名称: model-invocation 始终_包含_ user reach. description 只会增加 agent discovery, 从不移除人类入口. description 是 skill 的 top-level context pointer, 被迫始终保持加载. 以永久 context load 换取 discoverability. 内容全是 reference 的 model-invoked skill 也可以作为 shared reference 的一个归属地: 其他 skill 可以调用它, 因此多个 skills 所需的 reference 可以放在一处. 机制: 省略 `disable-model-invocation`, 并编写面向 model, 携带 trigger branches 的 description(`SKILL.md` 中的 pointer-writing rules 完全适用).
- **user-invoked** skill 从 agent 的可达范围中移除 description: 只有输入其名称的人类可以调用它, 其他 skill 都无法调用. context load 为零, 但会消耗 cognitive load. 你就是必须记住它存在的索引. 机制: 设置 `disable-model-invocation: true`. `description` 变为面向人类的一行摘要, 移除 trigger lists.

只有当 agent 必须自行到达该 skill, 或另一个 skill 必须到达它时, 才选择 model-invocation. 如果它始终只能由人手动触发, 将其设为 user-invoked, 不付出 context load.

两个 user-invoked skills 都需要的 shared reference 不能位于其中任何一个内部. 没有 descriptions, 二者都无法触发对方. 将它推到 skill system 外部的普通文件中, 成为任何 skill 都能指向的 external reference.

## Splitting by invocation

splitting 的 invocation cut(sequence cut 位于 `SKILL.md` 中): 如果存在应该独立触发 skill 的 distinct leading word, 即你确实会在 prompts 中使用的 trigger word, 或者另一个 skill 必须到达它, 则拆出 model-invoked skill. 你会为新的 always-loaded description 付出 context load, 因此这种独立可达性必须物有所值.

## Router skills

当 user-invoked skills 增长到超出你的记忆能力时, 使用 **router skill** 治疗堆积的 cognitive load: 一个 user-invoked skill 为其他 skills 命名, 并说明何时到达每一个 skill, 让人类只需记住一个 skill, 而不是多个. 它只能提示, 绝不能触发它们: user-invoked skills 没有 description, 因此除人类外, 没有任何事物能到达它们.
