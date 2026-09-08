---
status: in_progress
---

# anki 牌组删除

## 问题

`nnf anki decks` 目前只有 `list` / `stats` / `create` / `move`，桌面端能做的牌组清理在 CLI 上没有出口。需要让 CLI 能删除牌组（连同其卡片与子牌组），并保持既有安全基线：不可逆操作需显式确认、JSON-only 输出、只读模式拦截、`--dry-run` 可预演。

已知约束：

- AnkiConnect `deleteDecks(decks, cardsToo)` 强制 `cardsToo=true`，否则报错 `Since Anki 2.1.28 it's not possible to delete decks without deleting cards as well`；成功返回 `null`；对不存在的牌组名静默忽略。
- 删除牌组会级联删除其全部子牌组（本机 Anki 26.8.1 + AnkiConnect 实测）。
- 本机 `nnf` 是 `packages/nano-flow` 的本地打包全局安装（README「本地打包与安装」），包未发布到 registry。

## 方案

在 `packages/nano-flow/src/builtins/anki/decks/decks.ts` 新增 `deleteDeck(port, deckName)`，在 `packages/nano-flow/src/builtins/anki/decks/index.ts` 的 `createDecksGroup` 注册叶子命令（`decks` 组从 `anki-command.ts` 迁入该工厂，使 `createAnkiCommand` 回到函数行数上限内）：

```text
nnf anki decks delete --name <deck> --yes [--dry-run]
```

执行序列（一次删除只做必要调用）：

```text
deckNames                     → 目标是否存在；计算子牌组集合
findCards "deck:<escaped>"    → 将随牌组删除的卡片数（含子牌组）
deleteDecks { decks:[name], cardsToo:true }
deckNames                     → 复核目标与子牌组已消失
```

## 已排除的备选

- 暴露 `--cards-too` 开关：上游只接受 `true`，暴露只能为真的开关是假选择。
- 拒绝删除含子牌组的牌组：与桌面端行为冲突，且阻止删除整棵子树这一合法诉求；改为预检报告影响面。
- 目标不存在时静默成功：拼写或层级错误会被报告成「已删除」。
- `--name` 可重复批量删除：放大不可逆影响面，且与同组 `create`/`stats`/`move` 的单一目标形态不一致。
- 以 `deleteDecks` 返回 `null` 作为成功依据：无法区分「删掉了」与「什么都没发生」。

## 实施决策

- 命令注册：`command("delete", "Permanently delete a deck", deleteOptions, { kind: "mutation", prepare })`，`deleteOptions = [option.string("name", "Deck name", { required: true }), option.boolean("yes", "Confirm permanent deletion", { required: true })]`。
- 参数校验：复用 `validateDeckName`（`::` 分段非空），空名或空段以 `CliUsageError` 拒绝。
- 预检：`deckNames` 取全量名；目标不在其中即抛结构化错误（`AnkiOperationError`，与 `decks.ts` 既有风格一致；CLI 对它与 `JsonError` 一视同仁），`hint` 指向 `nnf anki decks list`，且不再调用 `deleteDecks`；子牌组集合为名称等于目标或以 `${name}::` 开头的全部牌组；卡片数用 `findCards` + `deckScopeQuery(name)`（转义 Anki 检索元字符）。
- 执行：`port.invoke("deleteDecks", { decks: [name], cardsToo: true })`，响应按 `null` 校验。
- 复核：再次 `deckNames`；目标或任一子牌组仍存在时报错并列出仍存在的名字。
- 只读：`mutation()` 的 `readOnlyAllowedActions` 不含 `deleteDecks`，同时把 `deleteDecks` 登记进 `http-anki-port.ts` 的 `isWriteAction` 与 `http-anki-port-boundaries.spec.ts` 的写操作清单，使端口层与 CLI 层都拦截 `--read-only`。
- 输出：`{ success, deckName, deletedDecks, deletedChildDecks, cardsDeleted, message, warning, hint }`；`deletedChildDecks` 为子牌组名数组，`cardsDeleted` 为 `findCards` 计数，`warning` 复述不可逆与卡片/子牌组被删，`hint` 提示需要时运行 `nnf anki sync`。
- 预演：`mutation()` 返回 `{ actions: [{ action: "deleteDecks", params: { decks: [name], cardsToo: true } }] }`，零调用。
- 文档：两份 `nano-flow-cli/references/anki.md` 的牌组路由行加入删除，并在「安全与语义」补充「删除牌组会级联删除其子牌组与卡片」。
- 测试：`deck-operation-boundaries.spec.ts` 覆盖操作边界（存在性、级联范围、复核失败、响应异常、错误归一化）；`anki-command.spec.ts` 覆盖 CLI 层（缺 `--yes`、空名、只读、`--dry-run`）；`parser-contracts.spec.ts` 增加契约条目；`test/distribution.spec.ts` 的 `decks` help 列表加入 `delete` 并增加一次真实 HTTP 通道冒烟。

## 工作环境

- 源码：`packages/nano-flow/src/builtins/anki/`；Node.js >= 22.12；pnpm workspace + vite-plus（`vp`）。
- 真实通道：本机 Anki 26.8.1 + AnkiConnect（`http://127.0.0.1:8765`，实测 `version` 返回 6），当前运行中。
- 全局 `nnf` 来自 `packages/nano-flow` 的本地打包安装（README「本地打包与安装」），包未发布 registry。
- 用户可能同时在使用 Anki：真实冒烟只用专用探针牌组（`nnf-probe-delete`），并在同一步骤内清理。
- 基线修复：`packages/nano-flow/skills/nano-flow/extensions/hooks.json` 在 HEAD 未通过当前 formatter，导致 `check` 门禁失败；用 `vp check --fix` 修复后作为本 Plan 的前置。
- 并发工作：另一 session 正在 `docs/dsh` 与 `packages/dsh-keep-alive` 上推进 dsh-alive issue 03；本 Plan 只写 `packages/nano-flow/**`、`docs/nano-flow/**` 与 `.flow/quest/**`，提交按显式路径挑选。

## 范围

- `nnf anki decks delete --name <deck> --yes` 的实现、参数校验、预检、复核与 JSON 输出。
- `decks` 命令组迁入 `decks/index.ts` 工厂，并登记 `deleteDecks` 写操作白名单（由函数行数上限与既有写操作契约触发）。
- 只读模式拦截与 `--dry-run` 预演。
- 单元测试、parser 契约、分发 help 契约与真实 HTTP 通道冒烟。
- 两份 `nano-flow-cli` 路由文档与两份受管 skill 安装副本/marker 同步。
- 本地打包并全局重装，使 `nnf` 具备该命令，并对真实 Anki 冒烟一次。

## 非范围

- 发布到 npm registry（MVP 仍为本地打包安装）。
- `--cards-too` 开关、批量删除多个牌组、删除前的卡片导出或备份、撤销。
- 其他 `decks` 子命令（rename、config 等）与其他资源组的删除能力。
- 默认牌组（id=1）是否可删的行为验证：本机 id=1 是用户在用的「待用」牌组，不做破坏性验证；实现按上游返回与删除后复核处理。

## 待定

无。

## 上下文

- [Nano Flow 领域语言](../../../CONTEXT.md)
- [ADR-0001 CLI 输出仅 JSON](../../../adr/0001-cli-输出仅-json.md)
- [ADR-0002 以单一 CLI 收口内建子命令](../../../adr/0002-以单一cli收口内建子命令.md)
- 设计记录：工作区 `.flow/quest/2026-09-09-anki牌组删除.md`
- AnkiConnect `deleteDecks`：上游 README「Deck Actions」；本机实现 `%APPDATA%\Anki2\addons21\2055492159\__init__.py:591-606`
- 现有先例：`packages/nano-flow/src/builtins/anki/notes/delete-notes-command.ts`、`media/index.ts`、`decks/deck-stats.ts`

## Issue

| #   | Issue                              | 状态        | 阻塞于 | 下一步         |
| --- | ---------------------------------- | ----------- | ------ | -------------- |
| 01  | [牌组删除命令](01-牌组删除命令.md) | in_progress | —      | /code-delivery |
