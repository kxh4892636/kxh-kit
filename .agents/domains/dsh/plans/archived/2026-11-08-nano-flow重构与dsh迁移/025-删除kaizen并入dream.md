---
name: "025-删除kaizen并入dream"
description: "删除 dsh-toolkit 的 kaizen skill，把知识归属与工作流规则并入 prompts/dream.md，更新引用与测试，发布 0.5.31。"
status: completed
related_noted:
  - '019-dream机制设计'
  - '023-dream指令与自动化接入'
---

# 025-删除kaizen并入dream

## 交付

- 删除 `packages/dsh-toolkit/src/nano-flow/skills/kaizen/`（`SKILL.md` + `agents/openai.yaml`）。
- `prompts/dream.md` 内嵌「## 知识归属」：术语→CONTEXT、问题→questions、决策→ADR、可复用活动→workflow，附准入（有证据 + 未来会再用 + 不重复）与「不制造知识」约束；pass 2 改为按该节上浮。
- `runtime.test.ts` 的 skill 列表去掉 kaizen；README 技能表同步。
- 版本 0.5.31，已打包并装入 desktop / web profile；`dist/nano-flow/skills/kaizen` 不存在。

## 验证

- `vp check`：122 文件格式、94 文件 lint/类型通过（少 2 个被删的 skill 文件）。
- `vp test src`：37 文件 / **301 例**通过。
- `vp run build` 成功；两个 profile 均 0.5.31、无 kaizen。

## 遗留

- `packages/nano-flow`（nnf CLI 产品）自己的受管 skill `kaizen` 未动：那是另一个产品分发的 skill（`generated-skill-manifest.ts` 内联），与 dsh-toolkit 无关；要删需单独改 CLI 的 skill 清单与测试。
