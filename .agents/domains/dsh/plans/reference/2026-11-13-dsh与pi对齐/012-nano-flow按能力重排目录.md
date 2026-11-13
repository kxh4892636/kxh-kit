---
name: "012-nano-flow按能力重排目录"
description: "把 nano-flow 从按类型分（tools/prompts/templates/scripts）改成按能力分：assembly / session / documents / planning / dream / skills。"
status: completed
related_noted: ["008-dream输入扫描改为脚本", "009-dream扫描改为工具"]
next_step: "无；发布布局未变，无需额外迁移"
---

# 012-nano-flow按能力重排目录

## 目标

原结构把代码按通用类型摊平：`tools/`、`prompts/`、`templates/`、`scripts/` 与散落的模块混在一起。改为按领域功能分组，一个能力目录装它的模型工具、提示词、模板与实现。

## 新结构

`@text
src/nano-flow/
├── assembly/      组合根：plugin、preset 与组装/集成测试
├── session/       会话装配与生命周期：assets、config、services、workspace、
│                  mount-report、rotate、limits、prompts/{system,user,limit}.md、
│                  tool-runtime（各工具共享依赖）
├── documents/     领域文档：check-domain(+lib)、check-runner、check 工具、templates
├── planning/      Plan：plan、plan-log、plan-log-service、notes、create/bind 工具
├── dream/         记忆维护：prompt.md、scan.mjs、dream 工具
└── skills/        随包 skill 资产（保留）
`@

## 关键决定

- **发布布局不变**：`dist/nano-flow/{prompts,templates,skills,scripts}` 仍是运行时契约。`session/assets.ts` 同时认发布布局与源码布局（`pickAsset` 先试发布路径、再试源码路径）；`copy-nano-flow-assets.mjs` 改成显式源→目标映射。
- **测试随模块**：能力测试跟实现同目录；组装与跨能力集成测试（plugin/preset/runtime/prompt-rules/unit/tools）进 `assembly/`。
- **命名规则仍单点**：`planning/create.ts` 继续从 `documents/check-domain.mjs` 引名字规则。
- **资产读取集中**：`templatesRoot` 改由 `assetsTemplatesRoot()` 解析，不再手拼 `assetsRoot/templates`。

## 验证

- 导入重写：97 处相对 specifier 自动改写；`vp check` 通过（112 文件）。
- 370 项测试通过；`pnpm build` 通过。
- `dist/nano-flow` 布局与重构前一致：`prompts/{system,user,limit,dream}.md`、`templates/`、`skills/`、`scripts/{check-domain,dream-scan}.mjs` + `scripts/lib/`。
- 安装 0.5.47 后由 007 的工作流复用，宿主重启即可。
