---
name: '006-notes.json的访问收口'
description: '评估插件层强制 notes.json 只经 nano_flow_* 读写的可行性、旁路与保证级别。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 006-notes.json的访问收口

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 结论

- **工具层可以做强策略收口，但不能在插件层保证“任何方式”**：DSH 的 fs 工具、搜索、shell、jobs、subagent 与第三方插件并不是同一条文件访问通道。
- 可稳定挡住：`read` / `write` / `edit` / `read_image` 对 Plan 下 `notes.json` 的访问（包装 `ctx.fs`，按已解析 target 判断）；`nano_flow_*` 走 `node:fs`，不受包装影响。
- 只能弱挡：`grep` / `glob` / `pwsh` / `bash` / `jobs` / `subagent` 里对 `notes.json` 的**字面引用**（`tools.guard` 的 name+args 字符串匹配）；编码路径、泛搜（如搜所有 json）、`Get-ChildItem -Recurse`、子进程都能绕过。
- 真正的“任何方式”需要 OS ACL、独立写入身份、或把 notes 移出明文文件（加密/宿主存储）；这些要么与同一用户的 nano_flow 写入冲突，要么要另设特权写入通道，成本高。

## 现有事实

- `src/nano-flow/store.ts` 用 `node:fs/promises` 读写 `notes.json`，不经过 `ctx.fs`；包一层 fs 不会影响 `nano_flow_*`。
- `tool-fs` 的读写走 `ctx.fs`；`fs-sandbox` 只在写时按 mode/workspace 围栏，读全部放行，没有 per-file deny。
- `tool-fs-search` 注入 `tools` / `systemPrompt` / `subprocess`，spawn ripgrep，**不走 `ctx.fs`**。
- `tools.guard(guard)` 存在（app.asar 与 dsh-tools 均含 `tools.guard()`），guard 看 `name` + 解析后的 args，返回原因即拒绝；全局 guard 对所有 agent（含 subagent）生效。
- 预设还挂了 `pwsh`/`bash`、`jobs`、`subagent`、`web`；shell 与子进程不受 `ctx.fs` 约束。
- 现有 `skill-mask.ts` 已有“就地包装服务方法”的先例（包装 `ctx.skills` 的 list/snapshot/get）。

## 方案

- **A 策略级（推荐）**：根插件注册全局 `tools.guard` + 包装 `ctx.fs` 的读/写/编辑方法；允许 `nano_flow_*`，拒绝其余工具对 Plan 下 `notes.json` 的显式访问。保留 shell 等能力，绕过仍可能，但能挡住 agent 的常规直读/直写。
- **B 工具层强制**：在 A 之上从 Nano Flow 预设移除 `pwsh`/`bash`/`jobs`/`subagent`/`fs-search`，只留 `nano_flow_*` 与受控 fs/read。接近工具层强制，但无法构建、测试、委派，Nano Flow 基本不可用。
- **C 真边界**：OS ACL + 独立写入身份、或加密/宿主存储 + 特权写入。能挡进程，成本最高，且要改存储形态与恢复路径。

## 第 1 轮

### Q1 - 保证级别

- 问题：要“插件层策略”还是“任何方式都挡住”？前者保留 shell，后者要移除旁路或上 OS 级隔离。
- 前置问题：无。
- 下游边界：决定是否保留 shell/jobs/subagent/fs-search；决定实现范围与验收方式。
- 推荐答案及理由：A。能挡住 `read`/`write`/`edit`/`read_image` 与显式引用，成本低、不影响编码；把“不是安全边界”写进文档。
- 修改意见：用户选择 A。
- 处理结论：已确认 A（2026-11-07）。

### 补充说明

保护范围默认仅 `.agents/domains/*/plans/*/notes.json`，不波及工作区其它同名文件。

## 定案（2026-11-07）

用户选 **A 策略级**：

- 全局 `tools.guard`：允许 `nano_flow_*`；其余工具对 Plan 下 `notes.json` 的显式引用拒绝。
- 包装 `ctx.fs` 的 `readText` / `readBytes` / `writeText` / `editText`，按已解析 target 拒绝 `notes.json`。
- 保留 shell / jobs / subagent / fs-search；文档写明它们仍可绕过，不是安全边界。
- 保护范围：`.agents/domains/*/plans/*/notes.json`；不波及其它同名文件。

下一步：note 07 实施与验证。

## 迁移前的证据
- 2026-11-07 用户选择 A（策略级）：tools.guard + 包装 ctx.fs，保留 shell 等旁路并写明不是安全边界
