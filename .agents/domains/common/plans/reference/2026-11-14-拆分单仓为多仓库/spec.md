---
name: "拆分单仓为多仓库"
description: "把 apps/* 与 packages/* 九个目录拆成各自带历史的独立 git 仓库，统一放 repos/；kxh-kit 只做工作区与 git 仓库管理，不含任何代码依赖；子仓在 GitHub 私有创建并推送。"
status: completed
---

# 拆分单仓为多仓库

## 目标

1. `apps/*` 与 `packages/*` 下 9 个目录各拆成一个独立 git 仓库，保留各自在这个仓库里的提交历史，统一放到 `repos/<目录名>`。
2. **kxh-kit 只做工作区管理**（2026-11-14 用户定）：根上不保留任何代码依赖——没有 `package.json`、没有 pnpm 工作区、没有共享 `node_modules` / 锁文件 / catalog / tsconfig 基线。每个子仓自带依赖、锁文件与工具链，能单独 `pnpm install` 与构建。
3. `.agents` 不拆，留在根上随容器仓走（2026-11-14 用户定）。
4. 9 个仓库在 GitHub 账号 `kxh4892636` 下全部建成 **private**，仓库名等于目录名，用已登录的浏览器操作创建，然后各自推送历史。
5. 子仓在 `repos/` 下彼此平级，容器仓 `.gitignore` 忽略 `repos/`，不跟踪子仓内容。
6. **私有内容一个字都不上传**（2026-11-14 用户定）：`apps/wiki/docs/010-记录`、`000-中转`、`070-工作` 等被 wiki `.gitignore` 排除的目录，拆分后仍然是本地 ignored 文件，既不进新仓、也不进 GitHub。

## 现状（2026-11-14 核实）

| 项 | 事实 |
| --- | --- |
| 待拆目录 | `apps/{etf,music,wiki}`、`packages/{docusaurus-plugin-link,docusaurus-plugin-mindmap,dsh-infinite-story,dsh-toolkit,nano-flow,pi-toolkit}`；tracked 文件数 92 / 416 / 1760 / 9 / 13 / 19 / 145 / 127 / 97 |
| 包身份 | 3 个 app 都 `private: true`；6 个包可发布，版本 `dsh-toolkit 0.5.52`、`dsh-infinite-story 0.2.4`、`pi-toolkit 1.0.0`、`nano-flow 0.0.1`、两个 docusaurus 插件 `0.0.0` |
| 目录深度 | 现有 `apps|packages/<名>` 与将来的 `repos/<名>` 同为根下两层，所以 `extends: "../../tsconfig.base.json"` 的写法在迁移后仍能解析——但按目标 2 每个子仓改用自己的基线，不再指向根 |
| 依赖协议 | 各包依赖大量使用 `catalog:`（根 `pnpm-workspace.yaml` 的 catalog 表）；`apps/wiki` 用 `workspace:*` 依赖两个 docusaurus 插件，且 `prebuild` 用 `pnpm --filter` 先构建它们 |
| 跨包源码引用 | `git grep` 查 `../../../` 形式的 import：0 处——目录之间没有源码级耦合，拆分不会断代码 |
| 根工具链 | `pnpm-workspace.yaml`（catalog / overrides / peerDependencyRules / minimumReleaseAgeExclude）、`tsconfig.base.json`、`tsconfig.json`（4 个 project references）、根 `vite.config.ts`（fmt/lint/test 的 ignore 与 exclude）、`.node-version`、`packageManager: pnpm@11.22.0`、`engines: node >=22.12.0` |
| 根 `node_modules` | 0.8 GB，一次 hoist 供 9 个包使用；改成一包一仓后每个仓各自 install |
| 子仓已有配置 | 每个包都有 `tsconfig.json`（extends 根基线）、`vite.config.ts` 或 `vitest.config.ts`；三个 app 各有自己的 `.gitignore` |
| 历史工具 | `git 2.55.0`，**未安装 git filter-repo**；`git subtree split` 内置可用 |
| 浏览器工具 | `bsk` 在 `C:\Users\kxh\.local\bin\bsk.exe`，浏览器扩展已由用户登录 GitHub；本机**没有 `gh` CLI** |
| npm | **未登录**（`npm whoami` → ENEEDAUTH），`@kxh4892636/*` 在 registry 上全部 404（含两个 docusaurus 插件） |
| 遗留引用 | `apps/wiki/docusaurus.config.ts` 的 `projectName`/`editUrl`、首页链接、`packages/nano-flow/package.json` 的 `repository.url` 都写着 `kxh-kit` 仓库 |
| 被忽略的私有内容 | wiki 19703 个 ignored 文件，其中 `docs/010-记录` 86 个、`docs/000-中转` 2 个、`docs/070-工作` 6 个，全部 0 tracked；etf 15854 个（含 `data/` SQLite）、music 3663 个（含 `.env`）。这些只存在于磁盘，**搬目录时不能丢，也不能被新仓跟踪** |
| 运行目录 | 根上 `.worktrees`、`.temp`、`.tmp`、`.cache`、`.story`、`.hallmark`、`inbox`、`scripts`；`scripts/` 是工作区运维脚本（只 import Node 内置模块） |

## 决策

- **容器仓零代码依赖**：根只留 `.agents/`、`scripts/`、`AGENTS.md`、`README.md`、`.gitignore`、`.gitattributes`、`inbox/` 与运行目录。`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`node_modules`、`tsconfig.base.json`、`tsconfig.json`、根 `vite.config.ts`、`.node-version`、`.vite-hooks` 全部下放到各子仓或删除。
- **一仓一锁文件**：每个子仓自带 `pnpm-lock.yaml` 与自己的 `node_modules`，根不再 install。代价是磁盘占用上升与依赖版本不再天然对齐，这正是用户明确要的形态（各仓独立演进）。
- **catalog 固化为真实版本**：`catalog:` 一次性替换成根 catalog 表里的真实版本号（如 `react` → `^19.2.5`、`vite` → `npm:@voidzero-dev/vite-plus-core@1.0.0`、`vitest` → `5.0.1`）；子仓的 `pnpm-workspace.yaml` 只保留需要的 `overrides` / `peerDependencyRules` / `minimumReleaseAgeExclude`，不再有 catalog。
- **不发 npm，插件走 GitHub 分发**（2026-11-14 用户改定，替代原「发 npm」决策）：`pnpm pack` 出 `.tgz` 挂到插件仓的 GitHub Release，wiki 用 tarball URL 依赖，`prebuild` 里的 `pnpm --filter` 删除。理由：本机 npm 未登录、`@kxh4892636/*` 从未发布，而现有安装方式本来也不走 registry（dsh 用 `dsh plugin add <tgz>`、nano-flow 用 `pnpm add -g <tgz>`、pi 用 `pi install <路径>`）。
- **不选「git 源码安装」**：已实测 pnpm 11 会为 git 依赖装 devDependencies 并跑 `prepare`，但要求消费方在 `pnpm-workspace.yaml` 的 `allowBuilds` 里写**带 commit 的完整 spec**（每次插件提交都要改），且两个插件当前没有任何 devDependencies（`vp` 来自根），源码装在拆仓前根本装不起来。Release tarball 无构建、无 allowlist。
- **历史用内置 `git subtree split` 抽取**：`git subtree split --prefix=<目录> -b split/<名>` 得到只含该目录的重写历史，再在新仓里 `fetch` + `reset --hard`。不引入 `git filter-repo` 之类额外工具。
- **仓库名 = 目录名，全 private**：`etf`、`music`、`wiki`、`docusaurus-plugin-link`、`docusaurus-plugin-mindmap`、`dsh-infinite-story`、`dsh-toolkit`、`nano-flow`、`pi-toolkit`；不建 org、不加前缀。
- **容器仓不留子仓指针**：`repos/` 整体进 `.gitignore`。子仓清单写在根 `README.md`（路径 + 一句用途），不引入 submodule 或 workspace 清单文件——容器仓只认目录本身。
- **GitHub 建仓走浏览器**：用户要求浏览器操作，本机也没有 `gh`；用 `bsk` 在已登录的浏览器里逐个建 private 仓库，推送用既有 SSH 密钥（`origin` 已是 `git@github.com`）。

## 切片

1. **[001-筛分清单与工作区约定](001-筛分清单与工作区约定.md)**：定稿 9 个目录的映射、根保留/移除清单、每个子仓的骨架与容器仓规则；产出就是这一份可核对的目录结构。
2. **[002-子仓提取与历史保留](002-子仓提取与历史保留.md)**：按目录 `subtree split` 抽历史 → `repos/<名>` 建仓 → 校验提交数与内容一致 → 删原目录、根 `.gitignore` 加 `repos/`、容器仓提交。
3. **[003-子仓独立化改造](003-子仓独立化改造.md)**：每个子仓固化 catalog 版本、自带 `pnpm-workspace.yaml` / 锁文件 / tsconfig 基线 / 工具链脚本、修 `repository` 与 `editUrl` 等 kxh-kit 字样，各自 `pnpm install` 与 check/test/build 通过。
4. **[004-插件改走GitHub分发并切换wiki依赖](004-插件改走GitHub分发并切换wiki依赖.md)**：插件 `pnpm pack` 出 `.tgz` 挂 GitHub Release，wiki 依赖改成 tarball URL 并删 `prebuild` 的 `--filter`，站点独立 build 通过。前置：006 先建好插件仓。
5. **[005-领域文档路径修正](005-领域文档路径修正.md)**：`.agents` 里活文档（CONTEXT / workflows / adr / questions / 当前 Plan）与 `scripts/` 中 `apps/`、`packages/` 路径改成 `repos/`；历史 Plan 与 `GUIDE.md` 不动。
6. **[006-GitHub建仓并推送](006-GitHub建仓并推送.md)**：浏览器建 9 个 private 仓库，逐个加 `origin`、推 `main`，核对远端分支与本地一致。
7. **[007-工作区真机验收](007-工作区真机验收.md)**：容器仓无代码依赖、无 `node_modules`；9 个子仓各自 install + check/test/build 通过、工作树干净；wiki 站点点开验证。

## 非范围

- 不改任何子仓的业务逻辑、不重构目录内部结构；只搬位置、换依赖协议、补自带的工具链配置。
- 不拆 `.agents`，不动历史 Plan（`reference` / `archived`）里的旧路径描述。
- 不引入 submodule、不引入 monorepo 工具（turbo / nx）、不建 GitHub org。
- 不配 CI（`.github/workflows`）、不配 npm provenance；建仓只做仓库本身。
- 不改各包版本号策略（除两个插件发布必须的 `0.0.0 → 0.1.0`）。

## 风险与假设

- **插件先出 Release 才能装 wiki**：wiki 的 tarball URL 指向插件仓的 Release 资产，所以 004 的顺序是「先给两个插件仓打 Release → 再改 wiki 依赖 → 再 build」。Release 之前 wiki 独立 build 会失败，属预期。
- **本地联调要换回 `file:`**：想改插件即刻在 wiki 生效，就把依赖临时换成 `file:../docusaurus-plugin-link` 并重建插件 `dist`；release URL 依赖锁的是构建产物，改了源码不重打包不生效。
- **磁盘**：根现在 0.8 GB `node_modules`；拆成 9 份后总量上升（每个仓各自 hoist），无法靠共享省空间，这是目标 2 的既定代价。
- **历史重写不可逆**：`subtree split` 生成新提交号，原仓库里的分支不能直接沿用；迁移前保留 `split/<名>` 分支作为回滚点。
- **删目录前必须确认子仓内容完整**：以 tracked 文件数与 `git ls-tree` 校验，再删 `apps/`、`packages/`。
- **ignored 私有内容会随目录搬走，必须仍被忽略**：`010-记录` / `000-中转` / `070-工作` / `etf/data` / `music/.env` 都不在 git 里，只活在磁盘上。迁移手法必须是「整目录搬走 + 把 split 历史挂上去」，不能 `checkout` 覆盖工作区，否则这些文件要么丢失、要么被误提交。验收以 `git ls-files repos/wiki/docs/010-记录` 为 0 且 `git status --ignored` 仍显示 ignored 为准。
- **各仓依赖版本漂移**：固化后各仓独立升级，`vite` / `vitest` / `react` 可能逐渐不同版本；这是用户选择的独立性，不是缺陷。
- **`repos/` 被忽略**：容器仓的 `git status` 不会显示子仓改动，日常要进对应子仓操作；`.worktrees` 规则改由各子仓自己执行。

## 恢复入口

1. 按 [notes_index.md](notes_index.md) 顺序推进；001 的目录结构是后面所有 note 的输入，先确认再动手。
2. 拆分脚本以 `git subtree split -P <dir> -b split/<名>` 为核心；每个子仓的分支名统一 `main`。
3. 容器仓只保留 `.agents/` + 运维脚本 + 根说明文件；任何 `package.json` 出现在根上都说明改造没做完。
4. 浏览器建仓用 `bsk`（[browser-skill](.agents/skills/browser-skill/SKILL.md)）；推送用 `git@github.com:kxh4892636/<名>.git`。

## 进度

- 2026-11-14 执行：九条 `subtree split` 全部完成并挂到 `repos/`；容器仓清空代码依赖并提交两次；八个仓推到 GitHub private；wiki 全站 build 通过（靠锁 `style-to-js 1.1.21`）。
- 2026-11-14：全部 note 完成并经用户确认，Plan 从 `active` 迁到 `reference`；容器仓改名为 `kxh4892636/awesome`。
- 2026-11-14 收尾：用户改定九仓全部 public；etf 复用同名仓 force push；插件 0.1.0 制品以小写 `release/` 目录随仓发布，wiki 依赖走 raw URL，装与 build 均通过。
- 2026-11-14 卡点（已解）：`kxh4892636/etf` 被别的项目占用；插件仓 private 导致 Release 资产无法被 pnpm 匿名拉取，浏览器上传资产也没跑通，wiki 暂用 `file:` 同级依赖。
- 2026-11-14：Plan 建立。已核实待拆目录、包身份、依赖协议、跨包引用、根工具链、历史工具、npm 状态与浏览器工具；用户确定：保留各目录历史、9 个仓库全 private、`.agents` 不拆、根不做代码依赖、catalog 固化为真实版本。
- 2026-11-14：用户决定不发 npm，插件改走 GitHub（Release tarball）分发。实测 pnpm 11 的 git 依赖：会装 devDependencies + 跑 `prepare`，但需消费方 `allowBuilds` 写带 commit 的完整 spec；两个插件自身无 devDependencies，源码安装不可行。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
