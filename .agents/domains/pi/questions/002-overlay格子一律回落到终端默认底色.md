---
name: '002-overlay格子一律回落到终端默认底色'
description: 'pi-tui 合成 overlay 时强制 SGR reset，overlay 的每个格子都拿不到底行背景：铺空格会抹出黑带，单格图标也是默认底色（当前 pi-tui 无透明合成）。'
---

# overlay 格子一律回落到终端默认底色

## 现象

Note 侧栏的 `▤` 图标放在边框之上的右上角，两次反馈都出在同一处：

1. 第一版用 `" ".repeat(38) + "▤"` 凑 40 列右对齐 → 边框上方出现一条**纯黑横带**。
2. 改成独立 1 列 overlay、只渲染字形 → 黑带消失，但**图标那一格仍是黑方块**，周围是工具块的橄榄色/头部块的紫色。

## 原因

- `pi-tui` 的 overlay 不透明：`compositeTuiLine(baseLine, overlayLine, startCol, overlayWidth, totalWidth)` 把底行切开，拼上 `overlayLine` 与补宽空格。
- 拼接时**强制**插入 `SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07"`（`pi-tui/dist/tui.js:155`，`layout.js:249` 调用），overlay 文本前后的 SGR 全被清掉。
- 于是 overlay 文本里没有显式 `bg` 的字符只能落在**终端默认底色**上，底行原本的背景色拿不回来 —— 无论那格是空格还是字形。
- `OverlayOptions` 没有透明/背景相关选项（只有尺寸、锚点、偏移、margin、visible、nonCapturing）；主题里也没有「基础背景」token（只有 `toolSuccessBg`、`userMessageBg` 这类块级底色），所以没法猜一个能通用的底色。

## 影响

- 放在边框外/正文上的任何 overlay 装饰（图标、角标、右对齐提示）都会带一块默认底色；底行是彩色块时尤其明显。
- 「用空格右对齐」在 overlay 里等于主动染色，长度越长越难看。
- 想做到真透明只能改上游（去掉强制 reset，或给 overlay 加透明合成选项），与「不改 pi 本体」的约定冲突。

## 解决

1. 装饰**不要用空格铺位**：需要右对齐就让装饰自己成为一个窄 overlay（图标 `width: 1`，行内零空格），主框体用 `margin.top` 让出那一行。
2. 让装饰的格子**落在卡片轮廓内**：把图标与上边框放同一行、右缘对齐，字形顶掉 `┐` 那一格。该格底色因此属于卡片本身，不再是悬空的方块；折叠态也还能只留这一格（2026-11-09 用户走查后按此定稿）。
3. 也可以接受那一格是默认底色（装饰留在边框外），视觉上是一只「独立小方块」。
4. 多个 overlay 务必共用同一个 `visible` 谓词，否则未绑定 Plan 时会剩一个孤零零的图标。

## 验证

- `packages/pi-toolkit/src/nano-flow/ui.test.ts`：图标 overlay `width === 1`、`render(1)` 恰为 `["▤"]`（无前导空格）、框体 `margin.top === 2`、折叠后框体渲染 0 行。
- 真机：边框上方不再有黑带；图标与上边框同行，`▤` 顶掉 `┐` 那一格。

## 来源

2026-11-09 用户两轮反馈（「为什么会有黑色背景，边框外我希望背景是透明的」「icon 本身的背景也是黑的」）；取证实现在 `packages/pi-toolkit/src/nano-flow/ui/sidebar.ts` 的 `mountOverlays` 与 `@earendil-works/pi-tui` 的 `compositeTuiLine`、`SEGMENT_RESET`。
