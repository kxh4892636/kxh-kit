---
name: "009-dream扫描改为工具"
description: "新增 nano_flow_dream 工具（scan/mark）包住随包 dream-scan.mjs；dream.md 不再写死 profile 路径或把中文路径拼进 shell。"
status: completed
related_noted: ["008-dream输入扫描改为脚本"]
next_step: "无；下次 dream 任务创建时用新提示词"
---

# 009-dream扫描改为工具

## 目标

008 把 dream 输入扫描收进脚本后，用户提出：脚本换成 DSH 工具是不是更好。结论是工具更稳，理由：路径脆弱（dream.md 是静态文本，只能写死 profile 下的脚本绝对路径）、参数脆弱（`--mark` 把中文路径、`#`、`=` 拼进 shell）、与另外三个 `nano_flow_*` 工具不一致。

## 交付

- 新增 [tools/dream.ts](packages/dsh-toolkit/src/nano-flow/tools/dream.ts)：`nano_flow_dream`，动作 `scan` / `mark`，内部调用 008 的脚本函数；参数结构化（`marks[].planPath/sessionId/seq`），`statePath` 可选。
- 脚本保留为唯一实现与 CLI 调试入口；`formatReport` 导出给工具复用，不复制格式。
- 预设注册第 4 个工具；`dream.md` 改为「调 scan 拿清单」「commit 成功后调 mark」，不再出现脚本路径。
- 测试：`dream-tool.test.ts` 3 项（扫描、mark 后无新增、参数校验）；工具名断言同步。全包 369 项通过。

## 验收

- `vp check` 通过（112 文件）；369 项测试通过。
- 构建后 `dist/index.mjs` 含 `nano_flow_dream`；装包进 web profile。
- 工具行为：`scan` 输出与脚本 CLI 一致（按域分组、只看游标之后）；`mark` 只前进不后退。

## 影响

- 每个 nano-flow 会话的 PTC SDK 多一个工具（dream 之外也会看到）。
- 宿主需重启才会注册新工具；dream 定时任务需用新提示词重建（当前无任务）。
