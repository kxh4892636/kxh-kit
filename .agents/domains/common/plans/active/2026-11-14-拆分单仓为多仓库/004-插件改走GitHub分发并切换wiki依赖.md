---
name: "004-插件改走GitHub分发并切换wiki依赖"
description: "两个 docusaurus 插件不打 npm：在各自 GitHub 仓里用 pnpm pack 出 tgz 挂 Release，wiki 依赖改成 tarball URL 并删掉 prebuild 的 --filter，站点独立 build 通过。"
status: pending
related_noted: ["002-子仓提取与历史保留", "006-GitHub建仓并推送"]
next_step: "006 建好插件仓后，先打 Release 再改 wiki 依赖"
---

# 004-插件改走GitHub分发并切换wiki依赖

## 目标

wiki 能独立 `pnpm install && pnpm build`，插件从 GitHub 来的制品安装，不经 npm registry。

## 为什么不用 git 源码安装

实测（pnpm 11.22.0，本地 `git+file:` 仓）：

- pnpm **会**给 git 依赖装 devDependencies 并跑 `prepare`——构建本身可行。
- 但消费方必须在自己的 `pnpm-workspace.yaml` 里写 `allowBuilds`，键是**带 commit 的完整 spec**（`dep-from-git@git+file:///...#52b65c1`）。插件每次提交都变 commit，wiki 就得改一次配置。
- 两个插件现在没有任何 `devDependencies`（构建工具 `vp` 来自根），源码安装在拆仓前后都跑不起来。

结论：走 **Release 里的 `.tgz`**——装的是构建产物，无构建、无 allowlist。

## 步骤

1. 在 `repos/docusaurus-plugin-link` 与 `repos/docusaurus-plugin-mindmap` 各自 `pnpm install && pnpm build && pnpm pack`，确认产出的 `.tgz` 里 `dist/` 完整。
2. 打包前把两个包的 `version` 从 `0.0.0` 提到 `0.1.0`（URL 依赖不认版本号，但 tag 与资产名要可读）。
3. 在插件仓打 `v0.1.0` tag，把 `.tgz` 作为 Release 资产上传（浏览器操作，与 006 同一套 bsk 流程）。
4. wiki 里改依赖：

   ```json
   "@kxh4892636/docusaurus-plugin-link": "https://github.com/kxh4892636/docusaurus-plugin-link/releases/download/v0.1.0/kxh4892636-docusaurus-plugin-link-0.1.0.tgz",
   "@kxh4892636/docusaurus-plugin-mindmap": "https://github.com/kxh4892636/docusaurus-plugin-mindmap/releases/download/v0.1.0/kxh4892636-docusaurus-plugin-mindmap-0.1.0.tgz"
   ```

5. 删掉 wiki `package.json` 的 `prebuild` 里两段 `pnpm --filter … build`（插件不再从源码构建）；`build` 直接 `docusaurus build`。
6. `repos/wiki` 里 `pnpm install && pnpm build`，站点能起来；改一行 wiki 文档复跑一次 build，确认插件仍生效。

## 本地联调（不进依赖）

要边改插件边看 wiki：把 wiki 的两个插件依赖临时换成 `file:../docusaurus-plugin-link` / `file:../docusaurus-plugin-mindmap`，改完在插件目录 `pnpm build`（wiki 读的是 `dist`）。联调结束改回 URL 依赖再提交。

## 验收

- wiki 的 `pnpm-lock.yaml` 里两个插件的解析结果指向 `github.com/.../releases/download/...`，不是 `workspace:` 也不是 registry。
- `repos/wiki` 在**不安装**插件源码的情况下 `pnpm install && pnpm build` 通过。
- 站点 serve 起来后：`doc:` 短链、`<Mindmap>` 渲染块、搜索都正常。
- 两个插件仓的 Release 页各有一个 `.tgz` 资产，且资产内 `dist/` 非空。

## 相关

- [spec.md](spec.md) — 分发决策与实测结论
- [006-GitHub建仓并推送](006-GitHub建仓并推送.md) — 建仓与 Release 上传共用浏览器流程
