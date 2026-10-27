---
status: completed
---

# dsh 插件装进 desktop 宿主

## 问题

用户要把 `packages/dsh-nested-skill` 装进本机 desktop 版 DSH，让桌面宿主会话能看到 `.agents` 树任意深度的嵌套 skill。与 rc.2 那轮相比，宿主换成了 desktop 应用，事实如下：

1. **宿主版本变了**：`DeepSeek Harness.exe` 文件版本为 `0.2.1-rc.3`，其内置 dsh 运行时 `dsh/package.json` 也是 `0.2.1-rc.3`（cordis 4.0.5、schemastery 见 devDeps）。而本包 peer 钉在 `0.2.1-rc.2`。
2. **安装必然被拒（阻断项）**：0.2.x 在 `pnpm add` 之后按 manifest 评估兼容性——有 `engines.dsh` 只看它，否则要求每个 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer 范围满足运行版本（desktop 内置 `dsh-app-boot/lib/index.js` 的 `unmetRequirements`/`evaluatePluginCompatibility`，抽取自 `resources\app.asar`，见 [01](01-取证与兼容性比对.md)）。`semver.satisfies("0.2.1-rc.3", "0.2.1-rc.2", { includePrerelease: true })` 为假，安装会以 `incompatible` 失败并要求逐版本豁免。
3. **profile 换了**：`~/.dsh` 下只剩 `profiles\desktop`（旧的 `web` profile 已随 desktop 应用重建），`dsh.profile.bundles` 基线为 `dsh-base`、`dsh-web-app`、`dsh-experimental-session-search`，本包尚未安装。
4. **PATH 上的 dsh 不能用**：`C:\Users\kxh\AppData\Local\vite-plus\bin\dsh.cmd` 指向 `0.1.6-alpha.1`；desktop 自带入口是 `C:\Users\kxh\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`（ELECTRON_RUN_AS_NODE 拉起 `dsh-desktop-host/lib/cli.js`，`--version` 报 `0.2.1-rc.3`）。

约束：只承诺 desktop 宿主当前版本；沿用 ADR-0003 的声明口径；不重启桌面应用（会中断本会话），重启时机由用户决定。

## 方案

- **声明对齐 `0.2.1-rc.3`**：`dsh-fs`、`dsh-home-paths`、`dsh-skill` 三个 peer 由 `0.2.1-rc.2` 精确钉到 `0.2.1-rc.3`；`cordis` 保持 `^4.0.5`、`schemastery` 保持 `^3.18.5`（desktop 实装同为 4.0.5 / 3.18.5）。
- **同步安装上游类型**：在包内重装依赖，使 `vp check` 用的 `.d.ts` 与声明同版；类型不通过就按契约补代码，不降级声明。
- **交付形态沿用 tarball**：`pnpm pack` → `dsh plugin --profile desktop add <绝对路径>.tgz`（desktop 自带 CLI）；与工作区解耦，重建 dist 不需要再同步。
- **验证分两层**：`dsh --profile desktop --dump-config` 证明组合层含 `nested-skill`；运行中宿主的 skill 目录证明运行时确实发现了嵌套 skill（模型侧每步重取目录）。界面侧是否刷新只记录，不作为验收阻断。
- **文档同步**：README 的兼容性/安装/卸载段落按 desktop profile 改写；本 Plan 记录证据与回滚方式。

## 已排除的备选

- **用 `dsh plugin allow-version` 豁免 rc.2 的 peer**：豁免把「声明漂移」变成隐藏状态，与 ADR-0003「声明等于已在本机验证的通道版本」冲突；且宿主下次换版本还要再来一次。
- **加 `engines.dsh: ^0.2.1-rc.3` 而不改 peer**：校验只走 `engines.dsh` 能过，但 peer 仍是谎报；同一语义只能有一处权威，改 peer 即可。
- **`file:` 目录安装**：profile 对 `file:` 依赖做链接投影，`vp pack` 重建 dist 后要手工同步（前序 Plan 已踩过）。
- **走 GUI 插件管理器安装**：desktop 确实带 `dsh-plugin-manager` 与 `dsh-host-plugin-inventory`，但那是交互路径、无法在脚本里复核；CLI 安装是文档化契约且可重复。
- **用 PATH 上的 `dsh`（0.1.6-alpha.1）安装**：跨代 CLI 会按旧代规则写 profile，且不认 `dsh-experimental-session-search` 之类 bundle。
- **重启用 desktop 应用来完成验收**：会中断当前会话，收益只是「同一进程内看到 skill」；`--dump-config` 与运行中宿主已能给证据，重启时机交给用户。

## 实施决策

- **peer 矩阵**：`@deepseek-ai/dsh-fs`、`@deepseek-ai/dsh-home-paths`、`@deepseek-ai/dsh-skill` → `0.2.1-rc.3`（精确，不带 caret，理由同 ADR-0003：范围会放过 rc.4）；`@deepseek-ai/cordis` → `^4.0.5`；`@deepseek-ai/schemastery` → `^3.18.5`。
- **版本号**：`0.1.2` → `0.1.3`（最小升级；插件未发布、无外部消费者）。
- **契约复核点**（rc.3 抽取自 `app.asar` 的运行时实现）：`SkillRegistry.registerProvider`、`list()` 返回 `SkillCandidate[] | { candidates, complete }`、`BUNDLED_SKILL_RANK = 600`、`isSkillName` 均未变；`dsh-home-paths` 仍导出 `resolveAgentsHome`；`dsh-skill-filesystem` 来源 rank 仍是 100/200/300/400/500 + bundled 600，本包的 201/301/501 派生规则仍成立。
- **安装命令**：`& '<app>\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add '<绝对路径>.tgz'`；`pnpm pack` 会触发 `prepublishOnly: vp run build`，等于再验一次构建。
- **验收判定**：`~/.dsh/profiles/desktop/package.json` 的 `dependencies` 与 `dsh.profile.bundles` 出现本包；安装产物 `dist/main.mjs` 的 sha256 与工作区一致；运行中宿主 skill 目录出现嵌套 skill 且原有顶层 skill 仍在。`--dump-config` 不适用：desktop profile 被 Electron 托管，CLI 拒绝 boot/dump（`profile "desktop" is managed exclusively by the Electron application`）。

## 工作环境

- 宿主：desktop 版 DSH `0.2.1-rc.3`（`C:\Users\kxh\AppData\Local\Programs\DeepSeek Harness\`），GUI `http://127.0.0.1:50261`（当前会话就跑在它里面）。
- CLI 入口：`...\resources\runtime\cli\bin\dsh.cmd`（`--version` = `0.2.1-rc.3`）；bundled pnpm 11.28.5、node 24.21.0（`resources\runtime\primary-runtime\dependencies\`）。
- profile：`~/.dsh/profiles/desktop`（`nodeLinker: hoisted`、`autoInstallPeers: false`、用户层补丁里有本机模型与权限配置）；共享依赖目录 `~/.dsh/profiles/node_modules` 是旧代（0.1.x 时代）投影，本轮不动。
- 工具链：仓库根 Node v24.21.0、pnpm 11.22.0；包内 `vp check` / `vp test src` / `vp pack`；覆盖率门槛 80（`packages/dsh-nested-skill/vite.config.ts`）。
- 基线（安装前实测）：`pnpm --filter @kxh4892636/dsh-nested-skill test` 39/39 全绿；工作区已装 peer 为 `0.2.1-rc.2`，安装后已同步到 `0.2.1-rc.3`。
- 领域文档校验：`node .agents/skills/nano-flow/scripts/check-domain.mjs .`（存量违例属历史债务，只修本轮引入的不一致）。

## 范围

- `packages/dsh-nested-skill`：peer/版本声明、依赖重装、README 兼容性与安装/卸载段落、按需的 rc.3 契约修正、重建 dist。
- 打 tarball 并装入 `desktop` profile；`--dump-config` 与运行中宿主双重验证。
- 领域文档：本 Plan（story/spec/notes）。

## 非范围

- desktop 应用本身、dsh 上游仓库、`node`/`pnpm` 运行时、其他工作区包（`pi-*`、`nano-flow`、`docusaurus-plugin-link`）。
- npm 发布、CI 改造、GUI 侧插件管理界面、重启桌面应用。
- `~/.dsh/profiles/node_modules` 旧代共享依赖的清理。

## 执行约束

- **模式**：auto（改动集中在单包、判定依据可由抽取的运行时实现与实测给出）；仍按 `/code-delivery` 的 dev gate 停下来等用户确认基线。
- **授权**：用户本轮指令授权「对齐 + 安装」；仓库写操作限于本包、本 Plan（必要时 README）；commit 按仓库钩子约定执行。
- **质量门禁最小集**：`vp check` → `vp test src`（全绿，覆盖率按包内 80 门槛）→ `vp pack`（构建成功）→ 安装后 profile 清单含本包与 bundle → 运行中宿主 skill 目录出现嵌套 skill（`--dump-config` 因 Electron 托管不可用，不纳入门禁）。
- **停止点**：dev gate 确认；若安装被兼容性拒绝或宿主发现不到嵌套 skill，回到取证，不绕过校验。
- **不做**：不为过关使用 `allow-version`；不改 profile 的其他配置；不重启桌面应用。

## 待定

- ~~运行中宿主是否热加载新 bundle~~：2026-10-27 已澄清——安装完成后本会话 skill 目录立即含嵌套 skill，宿主未重启；bundle 列表变化在 desktop 宿主上即时生效。
- **GUI `/` 菜单是否随宿主刷新**：模型侧目录已刷新（本会话 skill 列表被替换），GUI 视觉未确认；rc.2 的「客户端按 `sessionId` 缓存」结论在本场景未复现，保留待观察。恢复条件：出现「模型能看到、界面看不到」时记录现象并刷新页面核对。
- **rc.4 已发布**（registry `next` 通道为 `0.2.1-rc.4`）：desktop 宿主仍是 rc.3，声明跟随宿主；升级 desktop 后另起 Plan。

## 上下文

- [故事](story.md)、[取证与兼容性比对](01-取证与兼容性比对.md)
- [领域语言](../../../CONTEXT.md)、[ADR-0001](../../../adr/0001-嵌套skill任意深度发现.md)、[ADR-0003](../../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)
- 前序 Plan：[dsh 插件适配 0.2.1-rc.2](../../reference/2026-10-26-dsh插件适配0.2.1-rc.2/spec.md)（安装链路与兼容性校验的第一手结论）
- 上游证据：`resources\app.asar` 内 `dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`（252–336 行）、`dsh-skill/lib/index.js`、`dsh-skill-filesystem/lib/index.js`、`dsh-home-paths/lib/index.js`

## 当前进度

2026-10-27 22:31，全部 notes 完成；基线 `main@bfff5afe` + 本轮改动。已完成：取证（note 01）、声明对齐到 rc.3（note 02：peer 钉版、版本 0.1.3、依赖重装、README 三处、`vp check`/`vp test` 39/39/覆盖率/`vp pack` 全绿）、tarball 装进 desktop profile（note 03：`0.1.3`、profile bundles 含本包、`dist` sha256 与工作区一致）、运行中宿主出现 6 个嵌套 skill 且顶层 skill 保留、`skill(code-delivery)` 取正文成功。阻塞：无。未验证：GUI 视觉确认、真实宿主内 watcher 失效。代码与文档提交为 `da668e3e`、`e34682e2`；2026-10-27 经用户确认由 `implementing` 迁入 `reference`。

## 恢复入口

1. 读 [story.md](story.md) 与「实施决策」，再读 [03](03-打包安装与宿主验证.md) 的安装与宿主证据；需要复现取证时读 [01](01-取证与兼容性比对.md)。
2. 核对现场：`& '<app>\resources\runtime\cli\bin\dsh.cmd' --version` 应为 `0.2.1-rc.3`；`~/.dsh/profiles/desktop/package.json` 的 bundles 末项应为 `@kxh4892636/dsh-nested-skill`；`git log --oneline -1` 应在本 Plan 的归档提交之后。
3. 下一动作：本 Plan 已归档为参考（生命周期 `reference`），无待办；宿主换版本时另建 Plan，从 [01](01-取证与兼容性比对.md) 的兼容性校验说明与 [02](02-声明对齐到rc.3.md) 的 peer 矩阵起步。
4. 停止条件：出现「装好但宿主 skill 目录没有嵌套 skill」时，先看 profile 清单是否含 bundle、再确认宿主是否重组（desktop 无 `--dump-config`，只能靠目录与日志），不要用 `allow-version` 绕过。回滚：`plugin --profile desktop remove @kxh4892636/dsh-nested-skill`。

## Notes

| #   | Notes                                          | 状态      | 阻塞于 | 下一步 |
| --- | ---------------------------------------------- | --------- | ------ | ------ |
| 01  | [取证与兼容性比对](01-取证与兼容性比对.md)     | completed | —      | —      |
| 02  | [声明对齐到 rc.3](02-声明对齐到rc.3.md)        | completed | 01     | —      |
| 03  | [打包安装与宿主验证](03-打包安装与宿主验证.md) | completed | 02     | —      |
