# 嵌套 skill 任意深度发现

DSH 内建 provider 只发现 `.agents/skills/<skill>/SKILL.md` 的一层形态，LoopX 等技能把主流程 skill 嵌套在 `references/skills/` 下因而不可见。本域以独立 DSH 插件在项目与用户 `.agents` 树中任意深度发现携带合法 frontmatter 的 `SKILL.md`，注册名取 frontmatter `name` 原样，并让嵌套 candidate 的 rank（250）高于内建一层形态（200），使顶层显式声明在同名师冲突时胜出。

## Considered Options

- **约定子目录（references/skills）递归**：只覆盖单一容器名，新布局需再次改插件；被拒绝。
- **父级前缀命名空间（loop-x-to-story）**：改变稳定标识与用户感知名，与 frontmatter 文档不一致；被拒绝。
- **嵌套优先或按注册顺序定胜负**：显式顶层声明应胜出，注册顺序依赖启动次序；被拒绝。

## Consequences

- 目录可能包含资源目录中的 `SKILL.md`；以「frontmatter 必含 name+description」与排除清单（隐藏目录、`node_modules`、`.git` 等）过滤。
- 跨父级同名师可能共存；同一 provider 内按路径排序后的发现次序胜出，结果确定。
- 插件经 `dsh plugin` 安装，不受 DSH 上游版本发布节奏约束；运行时需与 DSH peer 包版本兼容。
