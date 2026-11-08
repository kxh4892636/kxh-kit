---
name: '迁移 dsh 旧 plans'
description: '把 .tmp 中 17 个 dsh 旧 Plan 适配为 spec + note 新格式。'
status: completed
---

# 迁移 dsh 旧 plans

## 目标

把 `.tmp/nano-flow-legacy/domains/dsh/plans/` 下的 17 个旧 Plan（active / archived / reference）迁移到当前 `spec.md + notes_index.md + NNN-note.md` 格式。旧 `story.md` 并入 spec，旧 `notes.json` 的每条 note 转成一个 markdown 文件；正文保留历史记录，并在开头标注旧工具/状态名已不适用。

## 映射规则

- `notes.json` 的 `01` / `02` → `001-标题.md` / `002-标题.md`；`name` 与文件名一致。
- 旧 `waiting + needs` 与 `blocked` → 新 `blocked`，`reason` 分别写“等待用户验收 / 等待用户回答 / 等待阻塞解除”。
- 旧 `blocked_by` → `related_noted`，只保留仍存在的 note；不再构成 DAG。
- 旧 `## 下一步` 提取为 `next_step`；没有时给默认推进提示。
- 旧 `story.md` 作为 spec 的“旧 story”段落并入；旧 spec 作为“旧 spec”段落。
- 旧证据追加到 note 的“迁移前的证据”。

## 迁移结果

- 17 个 Plan 全部生成；`nano_flow_check` 通过。
- 旧 active Plan `2026-11-08-note状态机合并waiting与blocked` 保留原生命周期，其 `waiting` 映射为 `blocked`；是否归档由用户决定。
- `reference/2026-10-31-无限故事插件` 没有 `notes.json`，补一条迁移记录 note，使 spec 派生状态为 `completed`。
- 三处原文超过当前篇幅上限，已截断并在文件末尾留 `.tmp` 指针：`archived/2026-09-10-dsh-alive全平台/002`、`reference/2026-10-27-dsh插件装进desktop宿主/001`、`reference/2026-10-31-无限故事插件/spec.md`。
- 旧 plans 目录原样保留在 `.tmp/nano-flow-legacy/domains/dsh/plans/`，作为迁移源与完整内容指针。

## 当前进度

迁移完成并校验通过；旧 plans 不删除，等待用户验收后决定是否清理 `.tmp`。

## 恢复入口

先读 `notes_index.md`；迁移细节在 note 001。原文从 `.tmp/nano-flow-legacy/domains/dsh/plans/` 取。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
