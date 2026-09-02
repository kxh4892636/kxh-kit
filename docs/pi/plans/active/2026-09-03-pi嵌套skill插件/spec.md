---
status: completed
---

# Pi 嵌套 skill 插件

## 问题

Pi 当前能递归发现 grouping folder 中的 skill，但一旦目录自身含 `SKILL.md` 就把它视为 skill 根并停止向下扫描，因此 Nano Flow 等父 skill 内的后代 `SKILL.md` 不会进入目录。Pi 的 `/skill:<name>` 也只在整条输入以该命令开头时展开一次，无法在自然语言任意位置组合多个 skill。

用户需要独立插件 `pi-nested-skill`：不修改 Pi core，自动补充父 skill 内任意深度的嵌套 skill，并允许 interactive 与 RPC 输入在任意位置插入任意数量的 `/skill:<name>`。

## 方案

在 `.temp/pi/packages/pi-nested-skill` 建立独立 Pi package，通过 `package.json#pi.extensions` 暴露 extension factory：

1. `resources_discover` 从 Pi 当前 skill command 的 `sourceInfo.path` 取得原生 skill 根，递归发现其后代 `SKILL.md`，把确定排序且去重后的补充路径交回 Pi。
2. Pi 继续负责所有 skill frontmatter 解析、校验、目录注册、同名冲突诊断与 system prompt；插件不维护第二套 catalog。
3. `input` 在 Pi 内建 skill/template expansion 前读取当前 skill command 目录，把每个未转义且精确命名已载入 skill 的 marker 原位替换为 Pi 原生 `<skill>` block。

## 已排除的备选

- 修改 Pi core：不满足独立插件交付，并绑定上游发布节奏。
- 插件自建 parser 与 catalog：会与 Pi 的 skill 规范和诊断漂移。
- 扫描硬编码默认根：会复制 Pi 的来源、trust 和 precedence 逻辑。
- 新 marker 或隐式逐 skill 参数：形成第二套语言，且自然语言没有可靠参数边界。
- watcher 或每次输入重扫：Pi extension 没有资源失效 seam，或会增加每次输入延迟。

## 实施决策

- package 名为 `pi-nested-skill`，位于 `.temp/pi/packages/pi-nested-skill`，版本遵循 Pi workspace lockstep；`@earendil-works/pi-coding-agent` 作为 peer dependency。
- extension entry 只编排两个 deep module：`discovery` 接受原生 skill 文件路径并返回补充路径；`expansion` 接受输入、skill 名到文件路径的只读目录与 warning sink，返回变换结果。
- discovery 仅扫描每个原生 skill 的目录后代，不回传父 `SKILL.md`；父 skill 既有顺序优先，同一父级内按规范化相对路径排序，canonical path 去重。
- discovery 对齐 Pi 的隐藏目录、`node_modules`、`.gitignore`、`.ignore`、`.fdignore` 语义，不跟随目录 symlink/junction；运行时使用固定版本 `ignore` dependency。
- Pi 已有 paths 先于 `resources_discover` 的补充 paths，利用 first-wins 保证声明优先并保留宿主 collision diagnostics。
- marker 语法为 `/skill:<catalog-name>`；匹配必须满足独立边界。按原输入从左到右、逐 occurrence、原位、非递归展开，重复 marker 重复展开。
- marker 不消费逐 skill 参数；除 marker 外的所有文本保持原序，作为共享用户输入。
- `\/skill:name` 保留为字面量；未转义 marker 即使在 Markdown code span/fence 中也展开。
- 未知 marker 原样保留；已知 skill 读取失败时保留该 occurrence、由插件报告仅含名称和路径的 warning，并继续展开其他 occurrence。若失败 marker 位于输入开头，Pi core 仍可能追加原生读取 diagnostic；不采用会改变 source、RPC 确认或错误传播的 fire-and-forget 重投规避。
- skill block 镜像 Pi 原生格式，使用 Pi 公开导出的 `stripFrontmatter`，relative references 基于该 `SKILL.md` 自身目录。
- 处理 `interactive` 与 `rpc` 输入并保留 images；跳过 `extension` source。经 input hook 的 steer/followUp 同样处理，绕过 hook 的直接 SDK 调用不在保证范围。
- 目录在 startup 与 `/reload` 的 `resources_discover` 生命周期刷新，不增加 watcher。
- 保持独立 Pi package、不修改 core；接受现有 input seam 对“开头已知读取失败”的上述窄化限制，不改写用户文本。

## 工作环境

- 实现仓库：`.temp/pi`，当前基线 `e266507b606b9552fa277252644054afd4384b11`，Node `>=22.19.0`，npm workspace。
- 执行隔离：从上述基线创建 `.temp/pi-nested-skill-worktree` 与功能分支 `feat/pi-nested-skill`，所有实现和验证只在该 worktree 中进行。
- 仓库规则：代码修改后运行 `npm run check`；修改测试文件后从 package 根运行对应 Vitest 文件；不运行 `npm run build` 或完整 `npm test`。
- 参考实现：工作区 `packages/dsh-nested-skill`；只复用任意深度扫描、确定排序和声明优先的设计，不照搬 DSH provider、watcher 或 parser。
- Pi 宿主 seam：`resources_discover`、`input`、`pi.getCommands()`、skill command `sourceInfo.path` 和公开的 `stripFrontmatter`。

## 范围

- 创建可独立安装的 `pi-nested-skill` workspace package、README、类型配置、实现和测试。
- 补充所有已载入原生 skill 根下任意深度的嵌套 `SKILL.md`。
- 实现任意位置、任意数量 skill marker 的确定性原位展开。
- 覆盖发现、冲突顺序、忽略规则、链接边界、刷新生命周期、marker 边界、重复、转义、失败隔离、输入来源与 images 的测试。

## 非范围

- 修改 Pi core 或现有 skill command 行为。
- 自建 frontmatter parser、skill catalog 或 collision diagnostics。
- 发现无效且未进入 Pi catalog 的父 skill 后代。
- per-skill args、递归展开 skill 正文或 Markdown-aware code exclusion。
- 实时文件监听、可配置额外扫描根或直接 SDK `steer()`/`followUp()` 支持。
- 发布 npm package 或改动 Pi release 流程。

## 执行契约

- 自动串行交付 Issue `01 → 02 → 03`，无需逐 Issue 等待用户确认；每个 Issue 仍须满足自身测试与 Flow 证据门禁后才能领取下一个。
- 所有 Issue 完成后运行定向测试、`npm run check`、`npm pack --dry-run` 与领域校验；任一失败都先修复，不带失败结果合入。
- 验证通过后只提交本任务文件，将 `feat/pi-nested-skill` 合入 `.temp/pi` 当前 `main`，再 push `origin/main`；若 main 漂移导致非本任务冲突或 push 被拒绝，停止并报告，不 force push。

## 待定

无。实现中若发现 Pi 公开 extension seam 无法保持上述契约，返回 `/quest-with-domain`，不得通过修改 core 静默绕过。

## 上下文

- [Pi 领域语言](../../../CONTEXT.md)
- [独立插件 ADR](../../../adr/0004-以独立插件补充发现与原位展开.md)
- [Quest 审阅记录](../../../../../.flow/quest/2026-09-03-pi嵌套技能插件.md)
- `.temp/pi/AGENTS.md`
- `.temp/pi/packages/coding-agent/src/core/skills.ts`
- `.temp/pi/packages/coding-agent/src/core/agent-session.ts`
- `.temp/pi/packages/coding-agent/src/core/extensions/types.ts`
- `packages/dsh-nested-skill`

## Issue

| #   | Issue                                                              | 状态      | 阻塞于 | 下一步         |
| --- | ------------------------------------------------------------------ | --------- | ------ | -------------- |
| 01  | [贯通可安装插件与最小嵌套发现](01-贯通可安装插件与最小嵌套发现.md) | completed | —      | /code-delivery |
| 02  | [完成确定性的嵌套skill目录](02-完成确定性的嵌套skill目录.md)       | completed | 01     | /code-delivery |
| 03  | [交付任意位置多skill原位展开](03-交付任意位置多skill原位展开.md)   | completed | 02     | /code-delivery |
