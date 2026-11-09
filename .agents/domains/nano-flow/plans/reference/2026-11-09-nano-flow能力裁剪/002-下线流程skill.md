---
name: '002-下线流程skill'
description: '删除 packages/nano-flow/skills/nano-flow 受管 skill，self skill 只下发 nano-flow-cli。'
status: completed
---

# 下线流程 skill

## 交付

- 删除 `packages/nano-flow/skills/nano-flow/` 整个目录（`SKILL.md`、八个 `references/skills/*` 子 skill、`scripts/check-domain.mjs`、`scripts/plan-document.mjs` 及其 `*.test.mjs` 与 `scripts/testing/`）。
- `script/generate-skill-manifest.mjs` 按目录生成，无需改逻辑，但要重新生成 `src/builtins/self/generated-skill-manifest.ts`（`vp run build` 会做）。
- 修正 `src/builtins/self/self-command.spec.ts`：`list` 期望只剩 `nano-flow-cli`；删除断言 `nano-flow` 打包内容的那条测试（`packages the document workflow and domain validation tools`）。
- `skills/nano-flow-cli/references/self.md` 的「管理其下 `nano-flow` 和 `nano-flow-cli`」改为只描述现存 skill。
- `README.md` 的 skill 管理章节改为单 skill，示例命令不再出现 `--name nano-flow`。
- `package.json` 的 `files` 保持 `skills`；确认打包产物不含已删目录。

## 验收

- `nnf self skill list --dry-run` 只返回 `nano-flow-cli` 一项。
- `nnf self skill install --all --dry-run` 只列 `nano-flow-cli` 一个目标。
- `vp run @kxh4892636/nano-flow#test`、`vp check`、`test/distribution.spec.ts` 全绿。
- `dist/main.mjs` 中 grep 不到 `check-domain.mjs` 与 `references/skills/`。

## 验收证据（2026-11-09）

- 删除了 `skills/nano-flow/`（178 KB，含八个子 skill 与 `check-domain.mjs`/`plan-document.mjs`）。
- `script/generate-skill-manifest.mjs` 无需改动，`vp run build` 重新生成后 `generatedSkills` 只有 `nano-flow-cli`。
- `nnf self skill list --dry-run` 只返回 `nano-flow-cli`；`nnf self skill install --all --dry-run` 只列一个目标。
- `dist/main.mjs` grep `check-domain.mjs|references/skills/` 命中 0。
- 同步修正 `self-command.spec.ts`（清单断言、打包断言改成 `nano-flow-cli`）与 `test/distribution.spec.ts`（assets、skill 生命周期）。
- 顺带修了一个既有失败：`self-command.spec.ts` 一直断言 `references/skills/code-delivery/SKILL.md`，而该目录在 0fb027f7 已改名为 `delivery`，测试从未跟上。
- `vp run @kxh4892636/nano-flow#test` 850 条全绿（含 distribution）。
