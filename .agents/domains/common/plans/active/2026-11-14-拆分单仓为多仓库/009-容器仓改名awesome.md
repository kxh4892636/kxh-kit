---
name: "009-容器仓改名awesome"
description: "GitHub 上的容器仓 kxh4892636/kxh-kit 改名为 kxh4892636/awesome，本地 origin 同步改址并推送，工作区目录名保持不变。"
status: completed
related_noted: ["006-GitHub建仓并推送"]
---

# 009-容器仓改名awesome

## 做了什么

- GitHub：`kxh4892636/kxh-kit` → `kxh4892636/awesome`（Settings 的 Repository name 填 `awesome` 后点 Rename，无二次确认弹窗）。
- 本地：`git remote set-url origin git@github.com:kxh4892636/awesome.git`，`git push --set-upstream origin main`，远端 main 到 `f8231f94`；另外两个旧分支随之保留。
- 容器 README 标题改为「awesome 工作区」。
- **本地目录仍是 `C:\Users\kxh\kxh-awesome\projects\kxh-kit`**：不动目录，避免 `repos/` 里各仓的绝对路径、`scripts/backup-kxh.js`、`.worktrees`/`.temp` 现场失效。GitHub 对旧名字保留跳转，旧链接照常可用。

## 没改的地方

- `.agents/domains/GUIDE.md`（只由 dream 重写）里的旧名字。
- `reference/`、`archived/` 历史 Plan 里的旧 URL 与旧路径（当时的现场记录）。
- `scripts/backup-kxh.js` 里的本机绝对路径。

## 验收

- `git remote -v` 显示 `git@github.com:kxh4892636/awesome.git`。
- `git ls-remote --heads origin` 能看到 `main` 指向 `f8231f94`。
- 浏览器打开 `https://github.com/kxh4892636/awesome` 是 public，旧的 `/kxh-kit` 跳转到新地址。

## 相关

- [006-GitHub建仓并推送](006-GitHub建仓并推送.md)
