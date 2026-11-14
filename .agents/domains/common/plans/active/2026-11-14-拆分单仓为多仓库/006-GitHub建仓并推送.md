---
name: "006-GitHub建仓并推送"
description: "浏览器操作在 kxh4892636 下建了 8 个 private 仓库并推完 main；etf 因 GitHub 上已有同名 public 仓库（内容是别的项目）未推，等用户定名。"
status: blocked
reason: "GitHub 已有 kxh4892636/etf（public，163 个文件，内容是 loop-kit skills 项目），与本仓 etf 无关；需要用户决定复用它并改 private、还是换名新建。"
related_noted: ["002-子仓提取与历史保留", "004-插件改走GitHub分发并切换wiki依赖"]
next_step: "用户给出 etf 的仓名后，建仓并推送 repos/etf"
---

# 006-GitHub建仓并推送

## 结果

| 子仓 | GitHub | 状态 |
| --- | --- | --- |
| docusaurus-plugin-link | `kxh4892636/docusaurus-plugin-link` | private，已推 main |
| docusaurus-plugin-mindmap | `kxh4892636/docusaurus-plugin-mindmap` | private，已推 main |
| dsh-infinite-story | `kxh4892636/dsh-infinite-story` | private，已推 main |
| dsh-toolkit | `kxh4892636/dsh-toolkit` | private，已推 main |
| music | `kxh4892636/music` | private，已推 main |
| nano-flow | `kxh4892636/nano-flow` | private，已推 main |
| pi-toolkit | `kxh4892636/pi-toolkit` | private，已推 main |
| wiki | `kxh4892636/wiki` | private，已推 main |
| etf | — | **未推**：`kxh4892636/etf` 已被别的项目占用（public，163 文件） |

## 过程要点

- 浏览器用 `bsk`：必须先用宿主后台任务跑 `bsk daemon start --foreground`，客户端再带 `BSK_AUTO_START=0`；每个动作前 `bsk cooperate sync` 取 `context_id`，导航还要它返回的顶层 `observation_id`。
- 建仓表单：填 `Repository name` → `Choose visibility` → 选 `Private` → `Create repository`。表单校验若报 “already exists in this account”，说明名字被占用。
- 推送用既有 SSH 密钥（`git@github.com`），不需要 `gh`。

## 相关

- [002-子仓提取与历史保留](002-子仓提取与历史保留.md)
