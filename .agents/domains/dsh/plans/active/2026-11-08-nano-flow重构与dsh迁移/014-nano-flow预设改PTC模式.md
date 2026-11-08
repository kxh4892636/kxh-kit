---
name: "014-nano-flow预设改PTC模式"
description: "nano-flow 预设从标准模式改为 PTC 模式基准：加 tool-presentation(ptc) 行，模型经 run_code 调用工具。"
status: completed
related_noted:
  - '012-rotate命令与轮转输入标注'
---

# 014-nano-flow预设改PTC模式

## 需求

nano-flow 预设此前与「标准模式」同构（native 工具表）。用户要求改为以 PTC 模式为基准，使用其 PTC 能力：模型只看到 `run_code` 与生成的工具 SDK，把多步操作写在一个 TypeScript 程序里。

## 取证

- 宿主 `@deepseek-ai/dsh-agent-tool-presentation`（0.2.2-rc.1，已随 app.asar 安装）的 `mode` 配置就是每个预设声明工具呈现方式的入口；它调用 `ctx.tools.presentAs('ptc')`，按挂载作用域生效，「预设的声明覆盖该预设下所有 agent」，同一进程里可并存 native / ptc 会话。
- PTC 模式需要宿主层 code runtime：web-app bundle 已挂 `@deepseek-ai/dsh-code-runtime-worker-thread`（`code-runtime` 行），预设无需重复挂载；缺少时该行在挂载期报错。
- 该包 `inject: ['tools']`，`codeRuntime` 按 mode 在 apply 内等待。

## 实现（0.5.25）

`preset.ts` 在 time-context 之后插入一行：

```yaml
- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config: { mode: 'ptc' }
```

预设描述改为「工具经 PTC 模式（run_code）呈现」。单测断言该行存在且为 ptc。

## 验收

- `preset.test.ts` 断言通过；全量测试与 `vp check` 通过。
- 重启宿主后新开 Nano Flow 会话：请求里的工具 schema 只有 `run_code`（PTC 呈现），模型可在程序里调用 read/write/pwsh 等工具；标准模式会话仍为 native。
## live 验收（2026-11-08，0.5.25 / 宿主 0.2.2-rc.1）

- 宿主主进程 17:34:16 启动，晚于 17:33:19 的安装；本会话即重启后的会话。
- 本会话预设为 `nano-flow`：注入的系统提示含预设 persona「本会话运行 Nano Flow」与 `nano-flow:system` 固定提示词段；`session_projcache` 的 `agentPreset` 现值为 `nano-flow`（会话日志头的 `agentPreset: ptc` 是恢复时的默认值，`rotate.ts` 已注明 header 不可靠）。
- 直接可调工具只有 `run_code`，read/write/pwsh 等经程序内 SDK 调用正常（本轮取证本身即由 `run_code` 完成）→ PTC 行已生效。
- web 形态（0.5.27，见 015 的验证环境）同样只有 `run_code`；`log.jsonl` 里该轮 `tools` 记录为 `run_code`，证明 PTC 外层调用被宿主正确捕获。
- 遗留：第三条「标准模式会话仍为 native」未另开会话复验，依赖宿主按预设作用域生效（0.2.2 的 `tool-presentation` 语义），不在本插件控制范围内。
