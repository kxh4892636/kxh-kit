# pi 嵌套 skill 发现与 `$` 引用以扩展接缝交付

pi 的 skill 发现规则是「命中即停」：某目录一旦含 `SKILL.md` 即不再下钻，因此位于另一个 skill 目录内部的 `SKILL.md`（如 `.agents/skills/nano-flow/references/skills/questing/SKILL.md`）不可见。同时，pi 仅在整段输入以 `/skill:` 开头时展开首个 skill，无法在任意位置插入并展开多个 skill。本域需要这三项能力，且不改动 pi 本体。

## Decision

以 pi 官方扩展接缝交付 `@kxh4892636/pi-nested-skill`：

- **发现**：在 `resources_discover` 返回隐藏 skill 目录作为 `skillPaths`；宿主随即 `extendResources` 并重建系统提示，嵌套 skill 与顶层 skill 同权（进入系统提示、`pi.getCommands()`、`/skill:name` 与 `read` 加载）。
- **选择 UI**：用 `ctx.ui.addAutocompleteProvider`，以 `triggerCharacters: ["$"]` 在光标位触发，候选与打分复用 `@earendil-works/pi-tui` 的 `fuzzyFilter`（即内置 `/xxx-name` 补全的评分实现）。
- **多 skill 展开**：用 `input` 事件的 `{ action: "transform" }`，把文本中所有命中的 `$<name>` 替换为与宿主 `/skill:` 相同的 `<skill name location>` 块。

## Considered Options

- **自定义 skill provider**：pi 没有对外注册 provider 的接缝，无法实现。
- **覆盖内置 skill loader**：loader 不对外暴露，属于私有实现。
- **中段 `/skill:name` 展开**：`/` 同时承载内置/扩展命令语义，中段劫持会与命令分派重叠；`$` 与 `/` 分工更清晰。
- **专用 `@skill:<name>` 记法**：改动用户可见 token，偏离诉求的 `$skill-name` 形态。

## Consequences

- 依赖 pi 扩展事件面与版本；`resources_discover` 返回的 skill 其 `sourceInfo.scope` 变为 `temporary`，名称仍取 frontmatter `name` 原样。
- 同名冲突沿用宿主「先到先得」：顶层声明先加载而胜出，符合「声明优先」。
- 嵌套 skill 的改名、删除仅在下一次 `resources_discover`（启动或 `/reload`）时反映。
- `$` 语义只在本插件生效；未安装插件时 `$name` 是普通文本。
