---
name: "006-固定提示词改名为system"
description: "把固定提示词 prompts/agents.md 改名为 system.md，同步读取路径、段名与文档引用。"
status: completed
reason:
related_noted:
  - '007-会话内未完成note面板'
next_step: '等待用户重启宿主验收；插件已装 0.5.13'
---

# 006-固定提示词改名为system

## 背景

固定提示词文件现在叫 `packages/dsh-toolkit/src/nano-flow/prompts/agents.md`（用户要求改名 `system.md`）。这个文件名还有副作用：它位于工作区里，DSH 会把 `AGENTS.md` 当作项目指令文件自动注入（大小写不敏感），所以本仓库的每个会话都会额外收到一份 Nano Flow 提示词——改名后该误注入消失。

## 交付

- `git mv prompts/agents.md prompts/system.md`。
- `assets.ts`：`ASSET_MARKER` 与 `readPromptText` 的路径、相关注释改 `system.md`。
- 段名 `PROMPT_SECTION` 从 `nano-flow:agents` 改为 `nano-flow:system`（名实一致；只影响提示词段标识，无外部契约）。
- 引用同步：`README.md` 两处（固定提示词表、篇幅限制段）、`skills/ask/SKILL.md`、`skills/kaizen/SKILL.md` 两处、`check-domain.mjs` 注释。
- 测试：`runtime.test.ts` 里读提示词的断言按需改成 `system.md`。

## 验收

- `rg agents.md packages/dsh-toolkit` 只应剩下与本改动无关的 `AGENTS.md`（如 `skills/do/SKILL.md` 提到仓库规范的 `AGENTS.md`）。
- 构建、测试、`vp check` 通过；重装插件后预设注入内容不变（段落名变为 `nano-flow:system`）。

## 验证证据

- `git mv` 完成；`assets.ts` 的 `ASSET_MARKER`、`readPromptText` 与注释，`plugin.ts` 的 `PROMPT_SECTION`（→ `nano-flow:system`），`README.md` 两处，`skills/ask` 与 `skills/kaizen` 三处，`check-domain.mjs` 注释全部改为 `system.md`。
- 改名副作用已验证：该文件不再被 DSH 当成项目级 `AGENTS.md` 注入（本会话收到 “Instructions removed: …prompts/AGENTS.md”）。
- `vp check` 通过；测试 255 项通过；`dist/nano-flow/prompts/` 只剩 `limit.md` / `system.md` / `user.md`。
- 安装包 0.5.13 含 `system.md`，`dist/index.mjs` 里 `PROMPT_SECTION = "nano-flow:system"`。
