---
name: "032-轮转seed携带上一轮输出"
description: "seed 末尾先写恢复要求与校验结论、再放上一轮 assistant 最终文本的 XML 块；用户原文用 `<rotation-prior-input>` 包裹放在消息最末。"
status: completed
related_noted:
  - '012-rotate命令与轮转输入标注'
  - '030-轮转时机与种子内容调整'
  - '031-删除手动rotate并自动切视图'
---

# 032-轮转seed携带上一轮输出

## 背景

用户决定：触发时机不变（仍是 queue 消息进入时判断压力）；新会话要拿到"上一轮最后一条含文本的 assistant 消息的 text 块"与"本次用户原文"。上一轮输出用 XML 包住放在**整个 seed 最末**；用户原文不再包 `<rotation-prior-input>`，作为同一条 user 消息的独立文本块跟随。

## 交付

- `rotate.ts` 新增 `lastAssistantText(session)`：读 `snapshotEvents()`，取最后一个 `turn/end` 所属轮，扫描该轮 `assistant/message` 的 `data.message.content`，取**最后一条含 text 块**的消息文本（不含 reasoning / tool-call）。
- seed 末尾追加：

  ```text
  以下 XML 块是轮转前会话最后一轮的模型输出：
  <rotation-last-output>
  …文本…
  </rotation-last-output>
  ```

  位置在自动校验结论之后（seed 最末）；无可用输出时整块省略。
- 截断：上限 8192 B，**保尾部**并加"前 N 字节已截断"标记。现有 `truncateText` 保头（`plan-log.ts:66-74`），需新增保尾实现或包一层。
- `redirect` 的 content 改为 `[{type:"text",text: seed}, ...request.content]`；删除 `wrapPriorInput`、`PRIOR_INPUT_TAG` 与其单测。

## 验收

- 单测：seed 含 `<rotation-last-output>` 与说明行、内容是上一轮最终文本；用户原文出现在 content 里且不在任何 XML 标签内；超长文本保尾并标注；无输出时无空块。
- `vp check` / `vp test src` 通过。
- live：自动轮转后新会话首条 user 消息 = seed（含输出块）+ 用户原文。

## 交付（2026-11-09）

- `rotate.ts` 新增 `LAST_OUTPUT_TAG = "rotation-last-output"`、`truncateTail`（保尾，超限标注被截字节数）、`lastAssistantText`（用 `groupByTurn` 取最后一个含 `turn/end` 的轮，再取该轮最后一条含 text 块的 `assistant/message`）。
- `buildSeed(workspace, domainRoot, lastOutput?)` 在 seed 最末追加：

  ```text
  以下 XML 块是轮转前会话最后一轮的模型输出：
  <rotation-last-output>…</rotation-last-output>
  ```

  上限 `ASSISTANT_LIMIT`（8192 B）；无已结束轮时整块省略。
- `redirect` 的 content 改为 `[{type:"text",text: seed}, ...request.content]`；删除 `wrapPriorInput`、`PRIOR_INPUT_TAG` 与旧测试。

## 验证

- `rotate.test.ts` 现为 22 例：用户原文包在 `<rotation-prior-input>` 里作为消息最末、图片块留在标签内；seed 含输出块并以其结尾、校验结论在输出块之前；继承到的 Plan 写进 seed 恢复入口；旧会话无已结束轮时无块；`lastAssistantText` 3 例（取最后一轮最后一条、无文本/无已结束轮为 undefined、超长保尾且无替换字符）；`truncateTail` 3 例。
- `vp test src` 全绿（309 例）；`vp check` 通过；0.5.36 已装入两个 profile。

## 局限

- 只携带文本块：reasoning 与工具调用不进 seed（要追溯走 `log.jsonl`）。
- 输出块 8192 B 上限，超长时保尾部，开头结论可能被截。

## 依赖

- `turn/end` 事件与 `assistant/message` 的 `data.message.content` 结构已由本会话日志实测（见 030 取证）；手动路径删除后该能力只服务自动轮转。

## 2026-11-09 修订（原文重新包装）

用户要求「上一轮输出和用户原文都放最下方，原文也用 XML 包裹」，覆盖 030 的「不再包装」：

- `rotate.ts` 恢复 `PRIOR_INPUT_TAG` 与 `wrapPriorInput`（说明行 + 开标签 + 原文内容块 + 闭标签），`redirect` 的 content 改为 `[seed, ...wrapPriorInput(request.content)]`。
- `buildSeed` 增加 `checked` 参数：校验结论成为 seed 的一部分，顺序为「恢复三段 → 校验结论 → `<rotation-last-output>` 块」，`redirect` 不再在 seed 后另贴结论。
- 单测：`rotate.test.ts` 20 例（包装在 seed 之后、原文是最后一块、图片块留在标签内、校验结论在输出块之前）。
- 局限不变：输出块 8192 B 保尾；reasoning 与工具调用不进 seed。

## 2026-11-09 真机验收（0.5.37）

- 00:28:36 自动轮转生成的新会话 `session-6e0c0d4b` 首条 user 消息实测，顺序为：恢复三段 → 「轮转后自动执行 `nano_flow_check`」结论 → `<rotation-last-output>` 块（内容即 0.5.37 交付说明）→ 说明行 + `<rotation-prior-input>`（原文 `rotate 测试` 在最末并闭合）。
- 输出块未截断（远小于 8192 B），校验结论在输出块之前、原文块在消息最末，均与 030 的修订一致，验收通过。
