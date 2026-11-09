---
name: '003-收窄nano-flow-cli路由'
description: 'nano-flow-cli 去掉流程 skill 与已删命令的路由，只覆盖 anki、self、fixture 的真实命令面。'
status: completed
---

# 收窄 nano-flow-cli 路由

## 交付

- `skills/nano-flow-cli/SKILL.md`：删除「需求、计划与交付由 `nano-flow` 工作流路由」；路由表只保留 `self`（CLI 与受管 skill 管理）与 `Anki`（AnkiConnect 操作）两条。
- `references/self.md`：命令导航与 `--target` 说明按删掉流程 skill 后的事实改写。
- `references/anki.md`：核对是否引用 `learning` 等已删子 skill，删除或改指现存命令。
- 重装到本工作区：`nnf self skill install --name nano-flow-cli --target .agents/skills`（先 `--dry-run` 核对 target），使已提交的 `.agents/skills/nano-flow-cli/` 与新内容一致。

## 验收

- `grep -rn "questing\|to-issues\|code-spec\|to-skill\|kaizen\|learning\|nano-flow 工作流" packages/nano-flow/skills/nano-flow-cli .agents/skills/nano-flow-cli` 无命中。
- `nnf self skill check --name nano-flow-cli` 返回 `current`。
- skill 内出现的每条命令都能在 `nnf --help` / `nnf self --help` / `nnf anki --help` 中找到。

## 验收证据（2026-11-09）

- `SKILL.md` 路由只剩 self 与 Anki 两条，原「需求、计划与交付由 `nano-flow` 工作流路由」改为「不由 `nnf` 承担，也不在本 skill 范围内」。
- `references/self.md` 改为「当前仅管理其下的 `nano-flow-cli`」；`references/anki.md` 原本未引用已删子 skill，无需改动。
- `nnf self skill install --name nano-flow-cli` 重装到 `.agents/skills/nano-flow-cli`，`check` 返回 `current`；受管的提交目录也随之变更（`.nano-flow-managed.json`、`SKILL.md`、`references/self.md`）。
- grep `questing|to-issues|code-spec|to-skill|kaizen|learning|nano-flow 工作流` 在两份目录均无命中。
