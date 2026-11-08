---
name: "026-dream并行化"
description: "dream.md 增加按业务域 subagent 并行：子 agent 只写本域，common/GUIDE/check/commit/游标由父会话收口；发布 0.5.32。"
status: completed
related_noted:
  - '019-dream机制设计'
  - '023-dream指令与自动化接入'
  - '024-访问信号与剪枝验收'
---

# 026-dream并行化

## 交付

- `prompts/dream.md` 新增「## 并行（多业务域）」：按所属域分组有新增 log 的 Plan；每个域 spawn 一个 `subagent`（一次最多 4 个域，其余按域名字母序分批）；子 agent 只写本域（CONTEXT/questions/adr/workflows），可读 `common` 与其他域但不得写；不碰 `GUIDE.md`、游标、生成物、`spec.md` 与 note；不 commit、不跑 `nano_flow_check`。
- 父会话收口：处理 `common` 候选、重写 `GUIDE.md`、跑一次 check、一次 `git commit`，成功后推进游标；失败的域不推进。
- 单域时父会话直接处理，不 spawn。
- `runtime.test.ts` 断言 dream.md 含 `[nano-flow:dream]` 与 `subagent`。
- 版本 0.5.32，已装入 desktop / web profile。

## 为什么父会话收口

- 游标是一个共享 JSON，并发写会互相覆盖；`GUIDE.md` 是整文件重写；check 会重写 `CONTEXT-MAP.md`、各 `index.md`、`notes_index.md` 与 spec 追踪表；`git` 索引也不能并发提交。这些只由父会话做一次。
- 域之间不跨域写、`common` 只读，所以子 agent 的文件写入互不重叠，并行安全。

## 验证

- `vp check`：122 文件格式、94 文件 lint/类型通过。
- `vp test src`：37 文件 / 301 例通过。
- `vp run build` 成功；desktop / web profile 均 0.5.32。

## 遗留

- 并行路径尚无 live 数据：当前只有 dsh 的 Plan 有 `log.jsonl`；等第二个域产生日志后，随 dream 实跑一起验收。
- 子 agent 的并发上限（4）是先验默认，可在 dream.md 里调整。
