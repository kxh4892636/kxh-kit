# Skill mechanics

编写 skill 时使用；通用文档规则见 [SKILL.md](SKILL.md)。

## Invocation

选择调用方式是在 context load 与 cognitive load 之间取舍：

| 方式              | 可达性与成本                                             | Description                                                       |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| **Model-invoked** | agent 可自行到达，用户仍可点名；承担常驻 context load    | 面向 model，包含独立触发分支；也可承载其他 skill 共用的 reference |
| **User-invoked**  | 由用户点名进入，依赖人类索引；不自动加载到 model context | 面向人类的一行摘要，省去自动触发列表                              |

agent 或其他 skill 需要自主到达时选择 model-invoked；始终由人触发时选择 user-invoked。保留已有调用策略。

按宿主配置：支持该 frontmatter 的宿主使用 `disable-model-invocation: true` 关闭自主调用；本仓库的 Codex 配置同时在 `agents/openai.yaml` 使用 `policy.allow_implicit_invocation: false`。默认 model-invoked 时省略关闭项。具体发现与调用机制以目标宿主为准，普通文件 pointer 与 skill 自动调用须分开判断。

两个 user-invoked skills 共用的 reference 放在 skill system 外的普通文件中，不归属其中任一 skill；双方通过 pointer 读取，避免依赖彼此的自动调用入口。

## Splitting by invocation

出现值得独立触发的 leading word，或其他 skill 需要独立到达该能力时，才拆为 model-invoked skill；独立可达性的收益须抵偿新增 description 的常驻成本。

## Router skills

user-invoked skills 多到难以记住时，可用一个 user-invoked router 列出名称与选择条件，让用户只记一个入口。它提示用户选择；目标 skill 的显式调用策略仍然有效。
