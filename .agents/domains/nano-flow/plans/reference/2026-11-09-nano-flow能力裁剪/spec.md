---
name: '2026-11-09-nano-flow能力裁剪'
description: '裁剪 packages/nano-flow：删除 workspace 命令组与流程 skill，只留 anki、self、fixture 与 nano-flow-cli。'
status: completed
---

# Nano Flow 能力裁剪

## 目标

把 `packages/nano-flow`（`nnf`）从「Nano Flow 全套 CLI + 流程 skill」裁剪成「Anki 通道 + 自身 skill 管理」，删掉与本工作区现状重复或没有使用证据的能力。

## 现场事实（2026-11-09，build 后跑 `--help` 取得）

顶层命令组：`anki`、`self`、`workspace`、`fixture`；全局 flag `--dry-run/--compact/--debug/--version`。

| 组 | 规模（源码 / 测试 LOC） | 使用证据 |
| --- | --- | --- |
| `anki` | 6862 / 6593 | `.tmp/anki-*`（10-28）在用 |
| `workspace` | 1828 / 2409 | 全仓无 `workspace.yaml`，无使用痕迹 |
| `self` | 739 / 1276 | `nano-flow-cli` 已装在 `.agents/skills/`，是它唯一的安装通道 |
| `fixture` | 68 / 0 | `main.spec.ts` 与 distribution 测试用的契约夹具 |

包内受管 skill 两个：`skills/nano-flow`（178 KB，含 `questing`/`to-issues`/`delivery`/`domain`/`code-spec`/`to-skill`/`kaizen`/`learning` 八个子 skill 与 `check-domain.mjs`、`plan-document.mjs`）、`skills/nano-flow-cli`（16 KB）。

## 范围

删除：

1. `nnf workspace` 整组（`src/builtins/workspace`、其测试与 testing fixture）。
2. `packages/nano-flow/skills/nano-flow` 整个受管 skill，不再经 `nnf self skill` 下发。

保留：`nnf anki`、`nnf self`（含 `skill` 与 `update`）、`nnf fixture`（测试夹具仍有用，不删）。

## 决策与依据

- **流程 skill 删除而非存档**：pi-toolkit 与 dsh-toolkit 的 nano-flow 已用 `.agents/domains` + `nano_flow_*` 工具取代这套 story/spec/notes 流程，本工作区不再经 `nnf` 驱动流程；按用户要求直接删除，不搬进 reference Plan。
- **`self` 不动**：`nano-flow-cli` 仍由 `nnf self skill` 作为受管 skill 安装与校验，删掉就断了它唯一的安装通道。
- **`fixture` 不删**：它是 CLI 契约测试的注入点，仍有测试价值；「随包发布到用户命令树」是遗留缺陷，不在本轮处理（见下方遗留）。
- **`workspace` 删除依据**：用户首轮答复指定裁剪对象为 `self skill` 与 `workspace`，随后澄清只在 `self` 上不动；`workspace` 无任何使用证据。该项改动可用 git 回滚，如需保留请直接否掉 001 这条 note。

## 遗留

- `fixture` 经 `import.meta.glob("./*/index.ts")` 自动挂载，会随 dist 发布给最终用户；正确形态是只在测试运行时经 `runtime.modules` 注入。本轮不动，等后续单独处理。
- **`nnf` 的 PATH 入口**：本机改用 pnpm 全局安装（`pnpm add -g <tarball>`），`nnf` / `nnf.CMD` / `nnf.ps1` 由 pnpm 写在 `AppData\Local\pnpm\bin`，bash / cmd / PowerShell 三种 shell 都能裸调。之前那份 npm 全局安装，以及 `vite-plus\bin\nnf.cmd` 这个手写转发器（硬编码 `node\24.21.0`，且缺无扩展名 sh 版）已一并删除：`vite-plus\bin` 在 PATH 上排在 pnpm 前面，会 shadow 掉 pnpm 的 shim；而 `vp env doctor` 的 shim 清单本来就不包含它（只维护 node/npm/pnpm/yarn/bun 与 vp*）。
- **全局 prefix 随 cwd 的 node 版本变**：`packages/nano-flow/package.json` 的 `engines.node: >=22.12.0` 让 vp 在该目录选 `node/26.13.0`，而仓库根的 `.node-version` 选 `24.21.0`。所以 `npm i -g` 的落地目录取决于在哪个目录执行（本轮误装到 26.13.0 的副本已删）；pnpm 全局不依赖这个 prefix，没这个问题。

## 导出与结果（2026-11-09）

四条 note 全部 completed。裁剪后：顶层命令 `anki`/`fixture`/`self`，包内受管 skill 只有 `nano-flow-cli`，`dist/main.mjs` 258.88 kB → 197.82 kB；删除了 workspace（1828 + 2409 行）与 `skills/nano-flow`（178 KB）。`vp run @kxh4892636/nano-flow#test` 850 条全绿、`vp check` 通过。

本地安装：`npm pack` 后 `pnpm add -g ./packages/nano-flow/kxh4892636-nano-flow-0.0.1.tgz`（pnpm 的全局 bin 已在 PATH，写全 `nnf`/`nnf.CMD`/`nnf.ps1` 三件套，bash 与 Windows 原生 shell 都可裸调），受管 skill 用 `nnf self skill install --name nano-flow-cli` 同步到 `.agents/skills`（`check` 返回 `current`）。

## 待晋升 GUIDE

`GUIDE.md` 由 dream 维护，本轮未改。建议的领域行：「nano-flow：`nnf` 只剩 `anki`/`self`/`fixture`；workspace 命令组与文档流程 skill 已下线（2026-11-09），流程由 pi / dsh 的 nano-flow 实现提供」。

## 恢复入口

（已完成，无需恢复。）

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
