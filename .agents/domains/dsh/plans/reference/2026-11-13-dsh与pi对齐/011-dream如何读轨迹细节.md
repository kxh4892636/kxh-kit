---
name: "011-dream如何读轨迹细节"
description: "dream.md 补「怎么读轨迹」：说明 log 行格式，给 bash+python3 切片片段，按 turn/session 过滤，避免 read 撞上限。"
status: completed
related_noted: ["008-dream输入扫描改为脚本", "010-dream扫描提示跳过的记录"]
next_step: "无；下次 dream 任务创建时用新提示词"
---

# 011-dream如何读轨迹细节

## 问题

scan 只返回摘要（user 截 80 字 + 工具名），assistant 与工具参数/结果都不打印；dream.md 又写「不要自己扫 `log.jsonl`」，等于模型没有读细节的路。五个 pass 里「纠错 / 提炼 / 晋升」需要「验证过什么」「读过哪些文件」。

## 交付

- `prompts/dream.md` 新增「## 怎么读轨迹」：
  - 说明行格式：`type: "session"` 是段头，`type: "turn"` 才有 `user` / `assistant` / `tools[].args/result` / `seq`。
  - 给 `bash` + `python3` 切片片段：按 turn / session 过滤，单条输出 User 2000 字、Assistant 4000 字、每个工具 args/result 各 400 字。
  - 约定：摘要够就不下钻；输出太大先过滤；pi 的 `type: "run"` 不按本格式解析。
- 输入段第 2 步指向该节。
- `runtime.test.ts` 的 dream 断言加 `python3`，防止片段被静默删掉。

## 验收

- 370 项测试通过；`vp check` 通过。
- 构建并重装 0.5.47 后，`dist/nano-flow/prompts/dream.md` 含「怎么读轨迹」与 python3 片段。
- 新建 dream 任务时用新文本（当前无任务）。
