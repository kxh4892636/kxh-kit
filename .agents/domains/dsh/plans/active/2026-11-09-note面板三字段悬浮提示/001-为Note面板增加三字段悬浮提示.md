---
name: "001-为Note面板增加三字段悬浮提示"
description: "悬浮某条 note 时显示 description、reason（有才显示）与 next_step；宿主 Tooltip 按 pre-line 渲染多行。"
status: blocked
reason: "等待真机验收：0.5.41 已装进 web profile，硬刷新页面后悬浮整行检查三字段气泡"
related_noted: []
next_step: "硬刷新页面（缓存未换就重启宿主）→ 悬浮 Note 行任意位置，确认两行/三行文本。"
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

## 首次真机反馈：悬浮无气泡

2026-11-09 14:39 用户截图反馈 0.5.40 上面板展开后悬浮没有任何气泡。查宿主实现（`dist/assets/index-*.js` 的 `Mn`）：

- 宿主 `Tooltip` 把 `onPointerEnter/Leave/Down`、`onClick/Focus/Blur` 与 `ref` `cloneElement` 到**子元素**上，气泡锚点就是该子元素的 `getBoundingClientRect()`；`portal` 默认 `false`，气泡作为兄弟节点就近渲染。
- 我们的子元素只是标题文字那个 `span`，所以**只有把指针挪到文字上**才会触发；悬浮在行的其它位置必然没反应。

因此改为：

1. 悬浮锚点换成整行的 `.dshtk-notes-row`（状态名 + 标题都算「对应项」），并加 `.dshtk-notes-item:hover` 提亮标题作为可交互线索；
2. 给 `Tooltip` 开 `portal`，气泡投到 `document.body` —— 原位渲染时 composer dock 祖先的 `transform`/`overflow` 可能把 `position: fixed` 的气泡裁掉或压在下面。

## UI 调整：改浅色卡片（0.5.42）

用户回执：气泡已出现、三字段都在，但深色底白字与界面不协调，要求改白底黑字并复用 DSH 原生组件/样式。

查宿主 `primitives` 导出表：`Tooltip`（`Mn`）气泡固定用 `--dsw-alias-tooltip-bg` + `--dsw-static-neutral-bluish-00`，没有浅色变体，也没法局部覆盖（哈希类名 + 全局选择器会误伤其它提示）。`HoverCard`（`z4`）的 `variant: "preview"` 才是原生浅色卡片：`background: var(--dsw-alias-bg-layer-1)`、`color: var(--dsw-alias-label-primary)`、`box-shadow: var(--dsw-elevation-panel)`，并且卡片本身 portal 到 `document.body`。

因此：

- `NotesDock` 用 `HoverCard`（`anchor` = 整行、`content` = 三字段、`openDelayMs: 150`、`variant: "preview"`、`fitContent: true`）；
- 卡片只提供底色/阴影/定位，排版用 `.dshtk-note-tip` 按 token 定义（13px/20px、键名 tertiary、正文 secondary、描述 primary）；
- `primitives.d.ts` 增补 `HoverCard` 声明；`test-primitives.ts` 加替身（锚点与内容都渲染，便于断言）；宿主没有 `HoverCard` 时退回 `title`。

## 安装记录（0.5.41）

2026-11-09 14:42：升 `0.5.41` → build（`dist/client.js` 57 004 字节）→ `pnpm pack` 出 `~/.dsh/pkgs/kxh4892636-dsh-toolkit-0.5.41.tgz` → 装进 web profile。核对：安装版本 `0.5.41`，`dist/client.js` 含 `dshtk-notes-row` 2 处。

## 安装记录（0.5.42）

2026-11-09 14:52：升 `0.5.42` → build（`dist/client.js` 58 168 字节，含 `dshtk-note-tip` 6 处、`HoverCard` 3 处）→ pack 出 `~/.dsh/pkgs/kxh4892636-dsh-toolkit-0.5.42.tgz` → 装进 web profile。核对安装版本 `0.5.42`。

## 遗留

- 真机未验（0.5.42）：硬刷新页面后看浅色卡片。
- 宿主 `Tooltip` 不可用时退回原生 `title`，同样保留换行。
- `reason` 目前只在 `blocked` 时存在，因此「原因：」实际只在阻塞行出现。

## 相关

- [spec.md](spec.md) — 本 Plan 的目标与结论。
