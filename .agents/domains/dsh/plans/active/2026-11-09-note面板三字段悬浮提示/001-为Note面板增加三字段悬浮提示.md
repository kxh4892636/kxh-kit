---
name: "001-为Note面板增加三字段悬浮提示"
description: "悬浮某条 note 时显示 description、reason（有才显示）与 next_step；宿主 Tooltip 按 pre-line 渲染多行。"
status: blocked
reason: "等待真机验收：0.5.40 已装进 web profile，重启宿主后悬浮检查三字段气泡"
related_noted: []
next_step: "重启宿主 → 新建 nano-flow 会话 → 展开 Note 面板，悬浮阻塞行与普通行各一次，确认三行/两行文本。"
---

# 001-为Note面板增加三字段悬浮提示

交付：悬浮面板里的某条 note 时，气泡显示 `description`，有 `reason` 时追加一行「原因：…」，有 `next_step` 时追加一行「下一步：…」。验收：三条字段都能端到端出现；缺字段时对应行不出现；面板与路由的既有行为不变。

## 事实

- 宿主 `Tooltip` 的 `label` 是字符串，气泡 CSS 为 `white-space: pre-line`、`position: fixed`、`max-width: min(50vw, calc(100vw - 24px))`（宿主 `index-*.css`）。所以多行用 `\n` 分隔即可，既不会被 `.dshtk-notes` 的 `overflow: hidden` 裁掉，也不需要 portal。
- 现有实现：[notes-dock.ts](../../../../../../packages/dsh-toolkit/src/client/notes-dock.ts) 的 `NotesTooltip` 只把 `note.description` 当标签；宿主组件不可用时退回原生 `title`。
- `PanelNote` 只带 `name/status/description`（[contract.ts](../../../../../../packages/dsh-toolkit/src/contract.ts)），快照解析在 [host-api.ts](../../../../../../packages/dsh-toolkit/src/client/host-api.ts) 的 `parseNotesSnapshot`。

## 做法

1. 契约：`PanelNote` 增可选 `reason` 与 `nextStep`。
2. 宿主：`readPanelNotes` 读 YAML 头的 `reason` 与 `next_step`，trim 后为空就不带。
3. 客户端解析：`parseNotesSnapshot` 透传这两个可选字符串（非字符串按缺省处理，不改既有校验强度）。
4. 提示：`NotesDock` 拼多行标签 —— 描述、`原因：…`、`下一步：…`，只在有值时追加。

## 交付

| 层 | 改动 |
| --- | --- |
| 契约 | [contract.ts](../../../../../../packages/dsh-toolkit/src/contract.ts) 的 `PanelNote` 增可选 `reason` / `nextStep` |
| 宿主快照 | [notes.ts](../../../../../../packages/dsh-toolkit/src/nano-flow/notes.ts) 读 YAML 头的 `reason` 与 `next_step`，trim 后为空就不带字段 |
| 客户端解析 | [host-api.ts](../../../../../../packages/dsh-toolkit/src/client/host-api.ts) 透传两个可选字符串；类型不对按缺省处理，不因此判整包非法 |
| 提示 | [notes-dock.ts](../../../../../../packages/dsh-toolkit/src/client/notes-dock.ts) 的 `tooltipLabel` 拼多行：描述、`原因：…`、`下一步：…`，只在有值时追加 |

## 验证

- `pnpm -C packages/dsh-toolkit test`：38 个文件、**337 项全部通过**（较改动前 +3）。
- `pnpm -C packages/dsh-toolkit check`：格式 124 文件、lint/类型 96 文件，无告警。
- 新增用例：`notes.test.ts` 两条（带 `reason`/`next_step` 全量透传；空串与空白视为没有）、`host-api.test.ts` 两条（可选字段透传；非字符串被丢弃且不报错）、`notes-dock.test.ts` 一条（两行 note 的 `title` 分别是「描述 + 下一步」「描述 + 原因 + 下一步」）。
- 断言方式：`getByTitle` 会归一化空白，改用取 `[title]` 的原始属性值比较换行。

## 安装记录

2026-11-09 14:29：版本升到 `0.5.40`，`pnpm pack` 出 `~/.dsh/pkgs/kxh4892636-dsh-toolkit-0.5.40.tgz`（102 615 字节），用 `dsh plugin --profile web add` 装进 web profile。

核对安装副本：

- 版本 `0.5.40`；
- `dist/client.js` 含「原因：」与「下一步：」各 1 处；
- `dist/index.mjs` 含 `nextStep` 2 处、`nano_flow_bind` 7 处；
- `dist/nano-flow/templates/guide.md` 仍为 0 字节。

宿主尚未重启，当前会话仍是旧挂载。

## 遗留

- 真机未验：等重启宿主后看气泡。
- 宿主 `Tooltip` 不可用时退回原生 `title`，同样保留换行。
- `reason` 目前只在 `blocked` 时存在，因此「原因：」实际只在阻塞行出现。

## 相关

- [spec.md](spec.md) — 本 Plan 的目标与结论。
