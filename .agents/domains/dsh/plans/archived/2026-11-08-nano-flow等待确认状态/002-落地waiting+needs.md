---
name: '002-落地waiting+needs'
description: '把 awaiting_verification 改成 waiting+needs：dag/check-domain/工具/契约/面板/prompt/README/测试，装 0.4.4 后重启验证。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 002-落地waiting+needs

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 执行检查点（2026-11-08）

- `dag.ts`：NOTE_STATUSES 含 `waiting`；NOTE_NEEDS、LEGACY_WAITING_STATUS、normalizeStatus、resolvedNeeds；NoteNode.needs；parse 要求 waiting 带 needs（旧值折 review）；serialize 与 STATUS_ORDER/STATUS_RANK 同步。
- `check-domain.mjs`：状态与 needs 校验，旧值归一化后参与 DAG 规则。
- `tools/write.ts`：status 支持 `waiting` + `needs`（`pending` 不能直接进；旧名报错提示改名）；`complete` 只接受 `waiting + needs=review`。
- `tools/read.ts`：resume 分「等待回答（needs=answer）/ 等待确认（needs=review）」两段；`shared.ts`：statusLine 计 `waiting`，formatNoteLine 带 `/needs`。
- `contract.ts`、`host/nano-flow-ready.ts`、`client/host-api.ts`、`client/ready-panel.ts`、`client/stylesheet.ts`：counts 改 `waiting`、透传 `needs`、面板文案「等待确认」与 glyph class。
- `prompt.md`、README、`.agents/domains/dsh/CONTEXT.md` 词条、`QUESTIONS.md` FAQ 同步。
- 测试：dag 旧值折映射 + waiting 必须 needs；runtime 门槛（in_progress 与 waiting/answer 都拒绝）；resume 两段；面板与 host payload。249 项通过；`vp check`、build 通过。
- 版本 0.4.3 → 0.4.4，打包安装到 desktop profile。

## 待验证

- 重启后：`status=waiting` + needs 被接受；旧归档 Plan 的 `awaiting_verification` 读入正常；`resume` / `ready` / 面板显示「等待回答 / 等待确认」。
- 验证后写 evidence 并 `complete`。

## 验收

- waiting 必须带 needs；complete 只接受 waiting/review；ready 不列 waiting；resume 分两段；面板计数与文案正确。

## 迁移前的证据
- 重启后真机确认：resume 状态行显示 waiting 2，单列「等待确认（2）」并带 [waiting/review]；旧 awaiting_verification 读入折映射生效
- 0.4.5 已装（安装目录与仓库 dist 同哈希）；挂载诊断 promptBytes 10,810（92 行指针版）、rotation 四服务 true
- 250 项测试、vp check、build 通过；提交 f3114043（实现）与 4e9f3cf3（后续）
