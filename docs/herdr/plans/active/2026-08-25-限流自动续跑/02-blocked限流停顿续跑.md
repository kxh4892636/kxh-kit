---
status: pending
blocked_by: ["01"]
---

# `blocked` 限流停顿续跑

## 交付

手工 `scan-now` 也能为所有 Herdr 已识别 agent 类型的 matching `blocked` 停顿提交一次 `go on + Enter`，且 occupant、状态或输出已变化时不会把输入送入错误 pane。

## 范围

- 在 Herdr socket 端口加入 raw `pane.send_input`。
- 让单次扫描处理 `blocked` 候选，复用 01 的 55 字符匹配、二次确认、成功指纹和诊断契约。
- 对所有 Herdr 已识别 agent 类型使用同一单请求 `{ pane_id, text: "go on", keys: ["enter"] }`，不设 kind allowlist。
- 失败不得落成功去重；不退化为两次 `send-text`/`send-keys`。
- 不接入自动状态事件、跨进程 handler 锁或 30 秒 worker。

## 直接依赖

- 01：消费其 Herdr socket 端口、`idle`/`done` 候选匹配、发送前二次确认、成功指纹与诊断契约。

## 验收

- [ ] fake socket 精确收到单个 `pane.send_input` 请求，参数为 matching pane、`text: "go on"`、`keys: ["enter"]`。
- [ ] agent label/kind 参数化测试证明所有已识别类型使用相同路径，且不存在隐式 allowlist。
- [ ] terminal、状态、`state_change_seq` 或 read revision 任一变化均零输入；缺 token 与非 `blocked` 候选不进入该路径。
- [ ] Herdr error、断连与超时只记录失败，不落成功指纹；后续手工扫描仍可重试。
- [ ] `corepack pnpm --filter @kxh4892636/herdr-limit-resume check`、`test`、`build` 通过。
- [ ] `node .agents/skills/loop-x/script/check-domain.mjs .` 通过。

## 上下文

- [spec](spec.md)
- [01 `idle`/`done` 限流停顿续跑纵切](01-idle-done限流停顿续跑纵切.md)
- [Herdr Socket API](https://herdr.dev/docs/socket-api/)

## 下一步

/implement

## 阻塞记录

无。

## 交付记录

待交付。
