---
name: "006-GitHub建仓并推送"
description: "浏览器操作在 kxh4892636 下建了 8 个 private 仓库并推完 main；etf 因 GitHub 上已有同名 public 仓库（内容是别的项目）未推，等用户定名。"
status: in_progress
related_noted: ["002-子仓提取与历史保留", "004-插件改走GitHub分发并切换wiki依赖"]
next_step: "把 kxh4892636/etf 从 public 改成 private（自动化浏览器打不开 settings 页）"
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
| etf | `kxh4892636/etf` | 已复用并 force push（旧 main `3a7fcd6` 已镜像备份到 `.tmp/etf-backup.git`）；仍是 public，待改 private |

## etf 复用

- 旧仓只有一个分支 `main`（`3a7fcd6`，163 个文件的 loop-kit skills 项目），无 tag、无其他分支。
- 先 `git clone --mirror` 备份到 `.tmp/etf-backup.git`，再 `git push --force` 推新历史（`b253647`）。旧内容只在这份备份里。
- 建仓用的是同一个仓名，所以 `workspace.yaml` 里 etf 的 URL 不用改。

## 过程要点

- 浏览器用 `bsk`：必须先用宿主后台任务跑 `bsk daemon start --foreground`，客户端再带 `BSK_AUTO_START=0`；每个动作前 `bsk cooperate sync` 取 `context_id`，导航还要它返回的顶层 `observation_id`。
- 建仓表单：填 `Repository name` → `Choose visibility` → 选 `Private` → `Create repository`。表单校验若报 “already exists in this account”，说明名字被占用。
- 推送用既有 SSH 密钥（`git@github.com`），不需要 `gh`。

## 相关

- [002-子仓提取与历史保留](002-子仓提取与历史保留.md)
