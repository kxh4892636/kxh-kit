---
name: '005-nnf在bash里找不到'
description: 'vite-plus\bin 的 nnf 只有 .cmd 转发器、Git Bash 不吃 PATHEXT，而 npm 全局 prefix 又随 cwd 的 node 版本变；改用 pnpm 全局安装。'
---

# 005-nnf在bash里找不到

## 适用条件与现象

在 Windows 上把 `nnf` 装到本机后，cmd 与 PowerShell 里 `nnf --version` 正常，Git Bash 里 `nnf` 报 `command not found`，但 `nnf.cmd` 能跑。或换了个目录执行 `npm i -g` 之后，另一处又调不到。

## 原因

两层，都是 PATH 与转发器的问题，与包本身无关：

1. **转发器只有 `.cmd`**：`C:\Users\<user>\AppData\Local\vite-plus\bin\nnf.cmd` 是三行转发脚本，同目录的 `pi` / `dsh` 有无扩展名 sh 版，`nnf` 没有。cmd/PowerShell 靠 PATHEXT 命中 `.cmd`，Git Bash 不查 PATHEXT，所以 `nnf` 找不到。这个转发器也不是 vp 维护的：`vp env doctor` 的 shim 清单只含 `node/npm/pnpm/...` 与 `vp*`，所以它不会随 `vp` 更新。
2. **npm 全局 prefix 随 cwd 的 node 版本变**：vite+ 托管 node 时，`npm i -g` 落到 `data/js_runtime/node/<ver>/`，而 `<ver>` 取决于执行目录。`repos/nano-flow` 的 `engines.node: >=22.12.0` 让 vp 在该目录选 `node/26.13.0`，仓库根 `.node-version` 选 `24.21.0`，于是同一个包在不同目录装到不同 prefix，都是猜不到的路径。

## 解决方法

用 pnpm 全局安装，它会同时写 `nnf`、`nnf.CMD`、`nnf.ps1` 三件套到 `AppData\Local\pnpm\bin`（已在 PATH）：

```bash
pnpm add -g ./repos/nano-flow/kxh4892636-nano-flow-0.0.1.tgz
```

顺手清掉旧的两份：`npm uninstall --global @kxh4892636/nano-flow`，以及 `vite-plus\bin\nnf.cmd` 手写转发器——`vite-plus\bin` 在 PATH 上排在 `pnpm\bin` **之前**，留着会 shadow 掉 pnpm 的 shim。

## 验证

- 三种 shell 分别裸调：bash `nnf --version`、cmd `nnf --version`、PowerShell `(Get-Command nnf).Source`，都应返回 `0.0.1` 且来源在 `pnpm\bin`。
- `nnf self skill check --name nano-flow-cli` 返回 `current`。

## 来源

Plan `2026-11-09-nano-flow能力裁剪`，spec 的「遗留」段与 log.jsonl run 3（用户问「nnf 为什么没有加入 path?」）；实测结论已回写到 `repos/nano-flow/README.md` 的安装段。

## 相关

- [001-改了包内skill后安装的skill没更新](001-改了包内skill后安装的skill没更新.md) — 装完之后的下一步：受管 skill 的状态与重装。
- [001-cli输出仅json](../adr/001-cli输出仅json.md) — 排查时读输出依赖的契约（stdout 只放 JSON）。
