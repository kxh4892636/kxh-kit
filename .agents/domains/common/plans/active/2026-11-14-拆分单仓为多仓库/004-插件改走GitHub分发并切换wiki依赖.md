---
name: "004-插件改走GitHub分发并切换wiki依赖"
description: "实测结论：私有仓的 Release 资产与 raw 链接都需要鉴权，pnpm 无法匿名拉取；浏览器上传资产受 bsk 控制上下文限制未跑通，wiki 暂用 file: 同级依赖，切换条件写清。"
status: completed
related_noted: ["002-子仓提取与历史保留", "006-GitHub建仓并推送"]
---

# 004-插件改走GitHub分发并切换wiki依赖

## 目标

wiki 不依赖 workspace，也不依赖 npm registry 拿到两个 docusaurus 插件。

## 已完成的准备

- 两个插件都升到 `0.1.0`，`pnpm pack` 成功：
  - `repos/docusaurus-plugin-link/kxh4892636-docusaurus-plugin-link-0.1.0.tgz`
  - `repos/docusaurus-plugin-mindmap/kxh4892636-docusaurus-plugin-mindmap-0.1.0.tgz`
- 两个仓已推到 `kxh4892636/<name>`（private），`main` 有提交。

## 卡点（实测）

1. **私有仓的制品要鉴权**：`https://github.com/<owner>/<repo>/releases/download/...` 与 `https://github.com/<owner>/<repo>/raw/...` 对 private 仓都要求登录态。pnpm 安装时用的是匿名 HTTP，取不到文件，会 404。
2. **浏览器上传资产没跑通**：bsk 在本页反复报 `the control context no longer belongs to the current document or control state`，`bsk upload` 的 ref/selector/observation 三种传法都试过。Release 表单能填到「tag v0.1.0 已建」，但资产没上传成功。
3. **git 源码安装不划算**：pnpm 11 会为 git 依赖装 devDependencies 并跑 `prepare`，但消费方要写带 commit 的 `allowBuilds`，插件每次提交都要改配置。

## 制品已进仓库（2026-11-14 补）

- 两个插件仓各提交了 `release/<name>-0.1.0.tgz`，`.gitignore` 用 `!release/*.tgz` 放行。
- 公开后 wiki 可直接依赖：

  `https://raw.githubusercontent.com/kxh4892636/docusaurus-plugin-link/main/release/kxh4892636-docusaurus-plugin-link-0.1.0.tgz`

- 选这个而不是 Release 资产，是因为 bsk 在 Release 表单上上传资产反复被控制上下文拦下，而 raw 链接零交互。

## 最终结果（2026-11-14）

- 两个插件仓已 public，`release/*.tgz` 匿名可下载（HEAD 200）。
- wiki 依赖已换成 raw URL，`pnpm install` 装的是仓库里的 tgz（lockfile 里 specifier/version 都是该 URL），`pnpm build` 成功。
- 不再需要 GitHub Release 资产，也不再需要 `file:` 同级依赖；wiki 单独 clone 即可安装。

## 历史状态（切换前）

`repos/wiki/package.json` 用同级路径依赖：

```json
"@kxh4892636/docusaurus-plugin-link": "file:../docusaurus-plugin-link",
"@kxh4892636/docusaurus-plugin-mindmap": "file:../docusaurus-plugin-mindmap"
```

- 已在 `repos/wiki` 里 `pnpm install && pnpm build` 通过（`[SUCCESS] Generated static files in "build"`）。
- 前提：两个插件目录与 wiki 平级（都在 `repos/` 下），并且插件已 `pnpm build` 出 `dist`。工作区拓扑天然满足。

## 若用户选择公开插件仓

1. 两个仓 Settings → Danger Zone → Change visibility → Public。
2. 打 tag `v0.1.0`，上传上面两个 `.tgz` 作为 Release 资产。
3. wiki 依赖换成资产 URL：

   ```json
   "@kxh4892636/docusaurus-plugin-link": "https://github.com/kxh4892636/docusaurus-plugin-link/releases/download/v0.1.0/kxh4892636-docusaurus-plugin-link-0.1.0.tgz"
   ```

4. `repos/wiki` 里重新 `pnpm install && pnpm build`，确认 lockfile 里两个插件的解析结果是 URL。

## 验收（任一分支）

- wiki 的 `pnpm-lock.yaml` 里插件来源是 `file:` 或 Release URL，不是 `workspace:`、不是 registry。
- `repos/wiki` 独立 `pnpm install && pnpm build` 通过。

## 相关

- [spec.md](spec.md) — 分发决策与实测结论
- [006-GitHub建仓并推送](006-GitHub建仓并推送.md) — 建仓与推送已完成
