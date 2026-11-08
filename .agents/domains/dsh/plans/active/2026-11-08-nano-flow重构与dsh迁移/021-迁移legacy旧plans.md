---
name: "021-迁移legacy旧plans"
description: "把 common/etf/music/nano-flow/video 的 10 个旧 Plan 从 story/spec/notes.json 迁成 spec + note，并重写内部链接。"
status: completed
related_noted:
  - '003-迁移dsh旧plans'
  - '020-迁移legacy领域文档'
---

# 021-迁移legacy旧plans

## 交付

把 common/etf/music/nano-flow/video 下 10 个旧 Plan 从 `story.md + spec.md + notes.json` 迁成 `spec.md + note`：

| 域 | Plan | notes |
| --- | --- | --- |
| common | archived/2026-11-08-删除pi-toolkit与其Plan | 1 |
| common | reference/2026-09-30-vite-plus升级到1.0 | 3 |
| etf | reference/2026-09-06-合并行情应用并迁移node后端 | 3 |
| etf | reference/2026-10-17-合并为单一etf应用 | 6 |
| music | reference/2026-10-28-古典音乐曲库与随机播放站点 | 9 |
| nano-flow | reference/2026-08-20-mcp迁移为cli | 10 |
| nano-flow | reference/2026-08-22-nano-flow命令行收口 | 12 |
| nano-flow | reference/2026-08-26-工作区命令重构 | 3 |
| nano-flow | reference/2026-09-09-anki牌组删除 | 1 |
| video | archived/2026-11-07-图片文字录音剪辑为视频 | 5 |

合计 53 条 note。

## 规则

- 旧 `story.md` 并入 `spec.md` 的「旧 story」段；旧 `spec.md` 进「旧 spec」段；`notes.json` 每条 note 转成一个 `NNN-中文标题.md`（状态映射：`completed` 保留，`in_progress` 保留，`waiting/blocked` → `blocked` + reason，`pending` 保留）。
- 旧 active Plan「删除 pi-toolkit 与其 Plan」已执行完、note 在 `waiting/needs=review`：迁到 `archived/` + note `blocked`（等待用户验收），避免工作区同时出现两个 active Plan（会让轮转后的自动绑定失效）。
- 超 13 KB 的 note 截断并留指针：etf「结构与运行决策（1-2）」「合并目录并回归验证（1-2）」；完整原文在 `.tmp/nano-flow-legacy/`。
- 迁移用的脚本保留在 `.tmp/migrate-legacy-plans.mjs` 与 `.tmp/fix-legacy-plan-links.mjs`（可回读、可重跑）。

## 链接重写

迁移后 117 条死链全部处理，现 0 死链：

- `story.md` / `../story.md` → `spec.md`（保留 `#us-…` 锚点）；
- `adr/0001-…` → `adr/001-…`（4 位 → 3 位）；
- 2 位 note 链接 → 3 位新文件名（含跨 Plan 引用）；
- 旧 `docs/{domain}` 布局比 `.agents` 少一层：`../../../../../packages/…` 等补一层 `../`；
- 迁移前就失效的链接（如 `anki冒烟检查清单.md`）降为纯文本。

## 验证

`nano_flow_check` 通过；10 个 Plan 的 `notes_index.md` 与 `## 追踪 Note` 由 check 生成；相对链接审计 0 死链。

## 遗留

- music 的 15 张设计截图（约 7.4 MB）按用户要求忽略，不迁、不引用；music 的领域文档与 Plan 保留为历史记录。
- `.tmp/nano-flow-legacy/` 原文保留，可回读。
