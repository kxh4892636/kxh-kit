---
status: pending
---

# pi-nested-skill

## 问题

pi 现有两处能力缺口：

1. **单输入单 skill**：宿主 `_expandSkillCommand` 仅当整段输入以 `/skill:` 开头时展开，且只取首个 token；`/` 补全也只在行首触发。用户无法在一次输入里于任意位置插入并展开多个 skill。
2. **嵌套 skill 不可见**：pi 的 skill 发现是「命中即停」——目录一旦含 `SKILL.md` 即不再下钻。Nano Flow 等技能把主流程 skill 放在 `.agents/skills/nano-flow/references/skills/*/SKILL.md`，被上层 `nano-flow/SKILL.md` 截断而完全不可见。

用户要求：任意位置插入多个 skill、自动发现嵌套文件夹中的 skill、以 `$skill-name` 触发发现/搜索并显示选择 UI，且实现复用 pi 内部 `/xxx-name` 的逻辑。

## 方案

工作区包 `@kxh4892636/pi-nested-skill`（`packages/pi-nested-skill`），以 pi 扩展形态提供三项能力：

- **发现**：在 `resources_discover` 中扫描 skill 根与已知 skill 目录，把「其祖先目录已含 `SKILL.md`」的隐藏 skill 目录作为 `skillPaths` 返回；宿主立即 `extendResources` + 重建系统提示，嵌套 skill 与顶层 skill 同权。
- **选择 UI**：`ctx.ui.addAutocompleteProvider` 以 `triggerCharacters: ["$"]` 在光标位触发，候选来自 `pi.getCommands()` 的 skill，打分复用 `@earendil-works/pi-tui` 的 `fuzzyFilter`（内置 `/xxx-name` 的实现）。
- **多 skill 展开**：`input` 事件把文本中所有命中的 `$<name>` 替换为与宿主 `/skill:` 相同的 `<skill name location>` 块，未知名原样保留。

## 已排除的备选

- **自定义 skill provider**：pi 没有对外注册 skill provider 的接缝；被拒绝。
- **覆盖内置 skill loader**：loader 不对外暴露，属私有实现；被拒绝。
- **同时展开中段 `/skill:name`**：`/` 同时承载内置/扩展命令语义，中段劫持与命令分派重叠；被拒绝。
- **专用 `@skill:<name>` 记法**：偏离用户要求的 `$skill-name` 形态；被拒绝。
- **提供插件配置文件**：诉求未提，默认根已覆盖工作区场景；被拒绝。

## 实施决策

### 包布局与形态

- `package.json`：`pi.extensions: ["./src/index.ts"]`；`type: module`；无 build 脚本（jiti 直载 TS）；无运行时依赖。
- 模块划分：`src/index.ts`（扩展工厂）、`src/discover.ts`（根解析、递归遍历、隐藏判定）、`src/reference.ts`（`$` token 解析与展开）、`src/suggest.ts`（候选构造 + fuzzy 打分）。纯逻辑与 pi API 解耦，便于单测。
- 依赖：peer `@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`（`*`）；dev 同名 `^0.85.1` + 仓库 catalog 工具链。

### 发现（`resources_discover`）

- **根集合**：`getAgentDir()/skills`、`~/.agents/skills`、cwd 上溯至 git 根（或文件系统根）的 `<dir>/.pi/skills` 与 `<dir>/.agents/skills`（项目根仅当 `ctx.isProjectTrusted()`），再加 `pi.getCommands()` 中 `source === "skill"` 的 `sourceInfo.path` 所在目录（覆盖 package/settings/`--skill` 来源）。
- **隐藏判定**：在某个根内，`SKILL.md` 所在目录 D 为隐藏，当且仅当 D 的某个严格祖先目录（该根之内）已含 `SKILL.md`；已知 skill 目录之下的所有 `SKILL.md` 恒为隐藏（其祖先即该 skill）。只返回目录 D，由宿主按目录加载。
- **遍历**：剪除隐藏目录、`node_modules`、以及 `dist`/`build`/`coverage`/`out`；符号链接目录不跟随，避免环。
- **去重**：按解析后的真实路径去重；结果按路径排序。
- **同名师冲突**：宿主先加载顶层声明，后加载本插件的 `skillPaths`，故顶层胜出（声明优先）。

### `$` 补全

- 触发：`addAutocompleteProvider` 的 `triggerCharacters` 为 `["$"]`；在 `getSuggestions` 中取光标前文本，匹配 `(?:^|\s)\$([^\s$]*)$`。
- 命中本插件语法时返回 `{prefix, items}`；未命中时委托 `current.getSuggestions(...)`；`shouldTriggerFileCompletion` 委托 `current`。
- 候选：`pi.getCommands()` 中 `source === "skill"` 的项，去掉 `skill:` 前缀，按 name 去重（首个胜出，含 `disable-model-invocation` 的 skill），`label` 为名称、`description` 为 skill 描述；空查询返回全部。
- 打分排序：复用 `fuzzyFilter(items, query, (item) => item.name)`。
- `applyCompletion`：把光标前的 `$<partial>` 替换为 `$<name> `（尾随空格便于继续输入），保留前后文本与光标位置。

### `$` 展开（`input`）

- 匹配：`/\$(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)(?![\w:-])/g`，且要求 `$` 位于文本开头或空白之后。
- 命中即在 skill 表中查 name；命中则替换为与宿主一致的块：
  `<skill name="${name}" location="${filePath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`，其中 `body` 由 `stripFrontmatter(readFileSync(filePath))` 得到。
- 未命中（如 `$HOME`）原样保留；多个命中各自展开；返回 `{action: "transform", text}`。
- 只处理 `$`，不触碰 `/skill:`。

## 工作环境

- pi 0.85.1；`pi` CLI 在 PATH；扩展文档与示例在 `C:\Users\kxh\AppData\Local\vite-plus\data\js_runtime\node\24.21.0\node_modules\@earendil-works\pi-coding-agent`。
- pi 内部参考：`dist/core/package-manager.js` 的 `collectSkillEntries`、`dist/core/skills.js` 的 `loadSkillsFromDirInternal`、`dist/modes/interactive/...` 的补全实现、`@earendil-works/pi-tui` 的 `dist/fuzzy.js`。
- 工作区：kxh-kit pnpm workspace（`packages/*`）；样例嵌套 skill 在 `.agents/skills/nano-flow/references/skills/*/SKILL.md`。
- 安装：`pi install <abs path>/packages/pi-nested-skill`；真机验证用 `pi -p` 与会话 jsonl。

## 范围

- 插件包实现、vitest 单测、README。
- 安装到本机 pi。
- 嵌套发现与多 skill 展开的真机 e2e 证据。

## 非范围

- 修改 pi 上游或引入自定义 skill provider。
- 中段 `/skill:name` 展开、`$` 之外的引用记法、插件配置文件。
- npm 发布。
- `.agents/skills` 下非 `SKILL.md` 的嵌套 `.md`（宿主既有行为，不在本插件职责内）。

## 待定

无。全部决策已收敛（见 quest 记录与 ADR-0001）。

## 上下文

- [quest 设计记录](../../../../.flow/quest/2026-09-18-pi插件.md)
- [ADR-0001](../../adr/0001-嵌套skill以扩展接缝交付.md)
- [CONTEXT](../../CONTEXT.md)
- [ADR-0002](../../adr/0002-搜索密钥落用户配置与直连抓取.md)
- pi skill 发现：`.../pi-coding-agent/docs/skills.md`；扩展面：`.../pi-coding-agent/docs/extensions.md`（`resources_discover`、`input`、`addAutocompleteProvider`）
- DSH 同类实现参考：`packages/dsh-nested-skill/src/provider.ts`（本地）

## Issue

| #   | Issue                                                  | 状态    | 阻塞于 | 下一步         |
| --- | ------------------------------------------------------ | ------- | ------ | -------------- |
| 01  | [嵌套 skill 发现实现](01-嵌套skill发现实现.md)         | pending | —      | /code-delivery |
| 02  | [引用补全与多 skill 展开](02-引用补全与多skill展开.md) | pending | 01     | /code-delivery |
| 03  | [安装与真机验证](03-安装与真机验证.md)                 | pending | 01, 02 | /code-delivery |
