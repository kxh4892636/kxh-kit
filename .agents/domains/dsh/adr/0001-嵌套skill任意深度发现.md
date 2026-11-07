# 嵌套 skill 任意深度发现

DSH 内建 provider 只发现 `.agents/skills/<skill>/SKILL.md` 的一层形态，Nano Flow 等技能把主流程 skill 嵌套在 `references/skills/` 下因而不可见。本域以独立 DSH 插件在项目与用户 `.agents` 树中任意深度发现携带合法 frontmatter 的 `SKILL.md`，注册名取 frontmatter `name` 原样，并让每个来源的嵌套 candidate 取该来源一层形态的 rank 加一（project-agents 201 / custom 301 / user-agents 501，对应上游 200 / 300 / 500），使同来源内顶层显式声明在同名师冲突时胜出，跨来源仍按上游来源序（project 200 > custom 300 > user 500 > bundled 600）。

## Considered Options

- **约定子目录（references/skills）递归**：只覆盖单一容器名，新布局需再次改插件；被拒绝。
- **父级前缀命名空间（nano-flow-to-story）**：改变稳定标识与用户感知名，与 frontmatter 文档不一致；被拒绝。
- **嵌套优先或按注册顺序定胜负**：显式顶层声明应胜出，注册顺序依赖启动次序；被拒绝。

## Consequences

- 目录可能包含资源目录中的 `SKILL.md`；以「frontmatter 必含 name+description」与排除清单（隐藏目录、`node_modules`、`.git` 等）过滤。
- 跨父级同名师可能共存；同一 provider 内按路径排序后的发现次序胜出，结果确定。
- 插件经 `dsh plugin` 安装，不受 DSH 上游版本发布节奏约束；运行时需与 DSH peer 包版本兼容。
- 0.2.x 起宿主在激活插件前按 manifest 校验 `@deepseek-ai/dsh*` peer 范围，DSH peer 因此精确钉到已验证的通道版本；通道跳版后安装会被拒绝，需人工复核并重新对齐。嵌套 rank 依赖上游各来源的一层形态 rank，上游调整来源序时本插件的 rank 表同步复核。
