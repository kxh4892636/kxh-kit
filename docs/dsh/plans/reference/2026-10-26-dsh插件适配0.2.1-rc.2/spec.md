---
status: completed
---

# dsh 插件适配 0.2.1-rc.2

## 问题

`packages/dsh-nested-skill` 的声明与代码按 dsh `0.1.5-rc.1` 写成，而本机运行的宿主已是 `0.2.1-rc.2`（`npm exec @deepseek-ai/dsh@latest web`，`latest` 通道）。逐包比对 `0.1.5-rc.1` tarball 与运行中 `0.2.1-rc.2` 安装树的 `lib/types/*.d.ts` 与 `lib/index.js` 后确认：**provider 契约没有破坏性变更，真正的阻断点是 0.2.x 新增的插件兼容性校验**。

1. **安装被兼容性校验挡住（阻断项）**：0.2.x 的插件管理在 `pnpm add` 之后按 manifest 评估兼容性——有 `engines.dsh` 时只看它，否则要求每个 `@deepseek-ai/dsh*` peer 范围满足运行版本（`unmetRequirements`/`evaluatePluginCompatibility`，`dsh-app-boot` 279–326 行）。本包 peer 是 `^0.1.5-rc.1`，按 semver 预发布规则不满足 `0.2.1-rc.2`，安装会以 `incompatible` 失败，并要求 `dsh plugin allow-version` 逐版本豁免。
2. **rank 口径与上游来源序脱节**：0.2.1 的内建 provider 新增 `.dsh/skills` 项目根（rank 100）与 `bundled` 根（rank 600），来源序为 project-dsh 100 / project-agents 200 / custom 300 / user-dsh 400 / user-agents 500 / bundled 600。本包对所有来源一律用 250，只在 project-agents 上实现「声明优先」；custom 与 user-agents 根的嵌套 skill 反而压过同名的一层形态（ADR-0001 与 CONTEXT 的「声明优先」在此不成立）。
3. **home 解析与上游分叉**：0.2.1 的 filesystem provider 改用 `@deepseek-ai/dsh-home-paths` 的 `resolveAgentsHome`（展开 `~`、处理空白 env），本包仍是 `$DSH_AGENTS_HOME ?? ~/.agents` 的手写式。
4. **发现不完整时仍报「完整」**：上游在 watcher 启动失败时返回 `{candidates, complete: false}`，让消费方保留上一份目录并重试；本包吞掉 watcher 错误并返回普通数组，异常目录会被当作权威结果缓存。
5. **单测基线在 POSIX 上本已红**：`vp test src` 33/37 通过，4 项失败源于 fixture 用 `C:/project` 这类 Windows 绝对路径，被 `resolve()` 在 POSIX 上重定位到 cwd，导致 `memoryFs` 全部落空。

约束：只承诺 `latest` 通道当前版本；沿用 ADR-0003 的声明口径；不重启 3080 会中断本会话，重启时机由用户决定。

## 方案

- **声明对齐 `^0.2.1-rc.2`**：`dsh-fs`、`dsh-skill` peer 改到该范围以满足 0.2.x 兼容性校验；`@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 抬到本机已验证的 `^4.0.5` / `^3.18.5`；新增 `@deepseek-ai/dsh-home-paths` peer 用于 home 解析。
- **rank 按来源派生**：嵌套候选的 rank = 同来源一层形态的 rank + 1（project-agents 201 / custom 301 / user-agents 501），使「同来源内显式一层形态胜出、跨来源仍按上游来源序」同时成立。
- **home 解析交给上游 helper**：`resolveAgentsHome(options.agentsHome)`，保留 `agentsHome` 配置项语义。
- **对齐不完整发现**：watcher 启动失败时返回 `SkillProviderObservation { candidates, complete: false }`。
- **fixture 平台中立**：测试用 `resolve("/project")` 派生根，路径断言经与 `memoryFs` 一致的 POSIX 归一化。
- **交付形态沿用 tarball**：`vp pack` 重建 → 打 tarball → `dsh plugin --profile web add <tarball>`，与工作区解耦；文档与 ADR-0001 的 rank 表述同步。
- **验证不重启宿主**：`dsh --profile web --dump-config` 证明组合层包含 `nested-skill`；再用带 `--patch` 覆盖的独立 `headless` 进程证明运行时能发现嵌套 skill；3080 重启交由用户决定。

## 已排除的备选

- **只加 `engines.dsh: ^0.2.1-rc.2` 而不改 peer**：校验只走 `engines.dsh` 能过，但 peer 仍是「未验证版本」的谎报，且与 ADR-0003「声明等于已验证」冲突；两者只需一处权威，改 peer 即可。
- **维持 250 单一 rank**：user/custom 下的嵌套 skill 会压过同名一层形态，等于在文档承诺「声明优先」的同时破坏它；0.2.1 新增两个来源根后差异更明显。
- **`file:` 路径安装**：profile 对 `file:` 依赖做链接投影（`linkedRoots`），重建 dist 后需要手工同步；tarball 安装与源码解耦（前序 Plan 已踩过该坑）。
- **重启 3080 完成验收**：会中断当前会话，收益只是「同一进程内看到 skill」，独立进程已能证明发现能力；时机交给用户。
- **跟随 `next`（`0.2.1-rc.3`）**：运行中的宿主是 `latest`（`0.2.1-rc.2`），声明必须等于实际运行的版本；升级宿主要另起 Plan。
- **把 `path` 改成 realpath/`fs.processPath`（与上游 `readSkillText` 对齐）**：本包的 `list`/`get` 用同一 display path 自洽，受益仅是符号链接场景下的路径形态一致；本轮不做，列入待定。
- **用 `@deepseek-ai/dsh-home-paths` 之外的本地实现展开 `~`**：与上游同语义的代码重复，且未来再次漂移。

## 实施决策

- **peer 矩阵（本机已验证）**：`@deepseek-ai/dsh-fs`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-home-paths` → `^0.2.1-rc.2`；`@deepseek-ai/cordis` → `^4.0.5`（实装 4.0.5，`effect`/`on`/`get`/`logger` 语义未变）；`@deepseek-ai/schemastery` → `^3.18.5`（实装 3.18.5）。
- **rank 常量形状**：以 `NESTED_SKILL_RANKS: Record<来源, number>` 暴露 `{ "project-agents": 201, custom: 301, "user-agents": 501 }`，并由 `nestedRank(source)` 取值；移除单一 `NESTED_SKILL_RANK`（无外部消费者，`main.ts` 的再导出同步）。
- **`list()` 返回形状**：`SkillCandidate[] | SkillProviderObservation`；watcher 启动失败（且未在关闭中）→ `{ candidates, complete: false }`；正常路径返回数组（与上游一致）。
- **`agentsHome` 解析**：`resolveAgentsHome(this.options.agentsHome)`；不再直接读 `$DSH_AGENTS_HOME`，也不需要 `node:os` 的 `homedir`。
- **fixture 契约**：`const ROOT = resolve("/project")`；`FILES` 的键用 `join(ROOT, …)`，`memoryFs` 已把 `\` 归一为 `/`；断言侧的期望路径用同一 `join` 结果再归一，从而 POSIX 与 Windows 都能通过。
- **版本号**：`0.1.1` → `0.1.2`（最小升级口径：插件未发布、无外部消费者，rank 与返回形状变化由 README 与 ADR-0001 记录，版本号只做占据位的最小标记）。
- **安装命令**：`pnpm pack`（`prepublishOnly` 会再跑一次 `vp run build`）→ `dsh plugin --profile web add <绝对路径>.tgz`；`file:`→tarball 属安装形态变更，profile 清单会新增 `dependencies["@kxh4892636/dsh-nested-skill"]` 与 `dsh.profile.bundles` 条目。

## 工作环境

- 宿主：`npm exec @deepseek-ai/dsh@latest web`（`0.2.1-rc.2`，`latest` 通道），入口 `/data00/home/kongxiaohan.xiaoyu/.npm/_npx/b86ed90107c62dab/node_modules/.bin/dsh`；GUI `http://127.0.0.1:3080`（无授权头直接访问返回 401）。
- profile：`~/.dsh/profiles/web`（bundles: `dsh-base`、`dsh-web-app`、`dsh-experimental-session-search`；`patchReload: live`；`pnpm-workspace.yaml` 为 `nodeLinker: hoisted`、`autoInstallPeers: false`）；安装锚点即运行中的 npx 安装树。
- 共享依赖：`~/.dsh/profiles/node_modules` 仍是 `0.1.5-rc.1` 时代（cordis 4.0.2、dsh-skill 0.1.5-rc.1），与运行中 npx 树不同代；安装后以独立进程实测其是否干扰解析。
- 工具链：Node v24.19.0、pnpm 11.22.0、`vp check` / `vp test src` / `vp pack`；包 `engines.node >= 22.12`。
- 基线（本轮实测）：`vp check` 全绿；`vp pack` 成功；`vp test src` 33/37，失败 4 项（`finds nested skills at any depth…`、`tags candidates with provider, rank, source…`、`loads full definitions through get()`、`honors extraRoots as custom source`）。
- 领域文档校验：`node .agents/skills/nano-flow/scripts/check-domain.mjs .`（存量 248 项违例，含 `docs/dsh/QUESTIONS.md` 缺失，均为历史债务）。
- 取证材料：`.temp/dsh-0.1.5/`（`0.1.5-rc.1` tarball 解包 + cordis 4.0.2 / schemastery 3.18.2）。

## 范围

- `packages/dsh-nested-skill`：peer/版本声明、`resolveAgentsHome` 接入、按来源派生的 rank、不完整发现返回形状、单测 fixture 平台中立化、README 兼容性与 rank 段落、版本号。
- 重建 dist 并打 tarball，安装进 `web` profile；`--dump-config` 与独立进程验证。
- 领域文档：本 Plan；ADR-0001 的 rank 表述按新口径修订（决策本身不变）；补齐 `docs/dsh/QUESTIONS.md`（域布局必备文件，当前缺失）。

## 非范围

- dsh 宿主升级、`next` 通道、其他工作区包（`pi-nested-skill`、`nano-flow`、`herdr-limit-resume`、`docusaurus-plugin-link` 等）。
- 嵌套发现范围扩展（`.dsh/skills` 深扫、`bundled` 根、用户 `~/.dsh`）、skill 正文渲染、`skill` 工具面。
- npm 发布、CI 改造、3080 重启、GUI 侧插件管理界面。
- `docs/dsh` 的存量文档债务（248 项校验违例、缺失的 `QUESTIONS.md`）清理。

## 执行约束

- **模式**：auto（改动集中在单包，判定依据可全部由上游类型与实测给出）；仍按 `/code-delivery` 的 dev gate 停下来等用户确认基线。
- **授权**：用户本轮指令授权「更新 + 安装」；仓库写操作限于本包、本 Plan 与 ADR-0001；commit/push 需在交付时按仓库约定执行，推送属于本轮用户可见交付，不额外索取授权。
- **质量门禁最小集**：`vp check`（格式/静态/类型）→ `vp test src`（全绿，且覆盖阈值沿用 vite.config 的 80%）→ `vp pack`（构建成功）→ 安装后 `--dump-config` 含 `nested-skill` → 独立 headless 进程能列出嵌套 skill。
- **停止点**：dev gate 确认；若安装触发兼容性拒绝或独立进程发现不到 skill，回到取证而不是绕过校验。
- **不做**：不为过关使用 `dsh plugin allow-version` 豁免（那会掩盖声明漂移）。

## 待定

- **`~/.dsh/profiles/node_modules` 是 0.1.5-rc.1 代**：运行中宿主的安装锚点是 npx 树（0.2.1-rc.2），插件按锚点解析，本轮未观察到跨代混装症状。恢复条件：出现模块解析异常或行为不一致时，决定是否清理该目录（属宿主机环境，非本包代码）。
- **`path` 用 display path 而非 realpath**：与上游 `readSkillText`（`realpath` / `fs.processPath`）不同；影响符号链接根下的路径形态与去重。恢复条件：出现「同一 skill 经不同链接路径重复登记」的实际问题时另起 Plan。
- **bundle 变更的实际生效时机**（本轮已回答，保留记录）：profile 的 `patchReload: live` 仍在 manifest 中（0.2.1 的 `dsh` 树不再引用该字段），但实测新增 bundle 在运行中宿主内即时生效（PID 未变、skill 目录随即更新）。若后续出现「装了但没生效」的现场，先查宿主是否重新组合（`--dump-config` 对照），再决定是否需要重启。
- **CLI 安装后界面不刷新（本轮定位，非本插件缺陷）**：Web 客户端按 sessionId 缓存 skill 目录，`skills/change` 不在 `API_REMOTE_FORWARDED_EVENTS` 白名单里，CLI `dsh plugin add` 也不发 `plugin-manager/changed`，因此当前会话的 `/` 菜单保留旧目录，刷新页面或新开会话即可；模型侧每步重取目录、不受影响。恢复条件：上游把 `skills/change` 转发给客户端、或 CLI 安装走插件管理器通道时，复核本条并删除。

## 上下文

- [取证与兼容性比对](01-版本取证与兼容性比对.md)
- [故事](story.md)
- [领域语言](../../../CONTEXT.md)
- [ADR-0001 嵌套 skill 任意深度发现](../../../adr/0001-嵌套skill任意深度发现.md)
- [ADR-0003 内容搜索经上游 opt-in 工具与索引启用交付](../../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)（声明口径：等于已在本机验证的通道版本）
- [前序 Plan：dsh 插件适配 0.1.5-rc.1](../../reference/2026-09-10-dsh插件适配0.1.5-rc.1/spec.md)（tarball 交付与真机冒烟经验）
- 上游契约：运行中安装树 `@deepseek-ai/dsh-app-boot/lib/index.js` 的 `unmetRequirements`/`evaluatePluginCompatibility`、`@deepseek-ai/dsh-skill/lib/types/index.d.ts`、`@deepseek-ai/dsh-skill-filesystem/lib/index.js`

## 当前进度

2026-10-26 14:42，全部 notes 完成，基线 `main@44bc49c` + 本轮未提交改动。已完成：逐包取证、插件声明与代码对齐（peer 钉 `0.2.1-rc.2`、按来源 rank、`resolveAgentsHome`、不完整发现、fixture 平台中立化）、`vp check`/`vp test`（39/39）/覆盖率/`vp pack` 全绿、tarball 安装进 `web` profile、`--dump-config` 与运行中宿主双重验证。阻塞：无。未验证：独立 headless 进程（缺 API key）、GUI 页面视觉确认、真实宿主内的 watcher 失效。已提交并推送（`26e147a`、`d503f25` 及归档提交），Plan 经用户确认由 `implementing` 迁入 `reference`。

## 恢复入口

1. 读 [story.md](story.md) 与「实施决策」，再读 [01](01-版本取证与兼容性比对.md) 的取证表与拷问记录；需要复现安装时读 [03](03-打包安装与真机验证.md)。
2. 核对现场：`dsh --version` 应为 `0.2.1-rc.2`；`grep -n '"@deepseek-ai/dsh-skill"' packages/dsh-nested-skill/package.json` 应为 `"0.2.1-rc.2"`；`dsh --profile web --dump-config | grep nested-skill` 应有命中；`git log --oneline -1` 应在本 Plan 的提交之后。
3. 下一动作：本 Plan 已归档为参考（生命周期 `reference`），无待办；新一轮版本适配另建 Plan，从 [01](01-版本取证与兼容性比对.md) 的比对方法与安装链路事实起步。宿主已被安装改变，回滚用 `dsh plugin --profile web remove @kxh4892636/dsh-nested-skill`。
4. 停止条件：出现「装好但 skill 目录没有嵌套 skill」时，先 `--dump-config` 与 `~/.dsh/profiles/web/package.json` 对照，再回到 01 的安装链路事实排查。

## Notes

| #   | Notes                                              | 状态      | 阻塞于 | 下一步 |
| --- | -------------------------------------------------- | --------- | ------ | ------ |
| 01  | [版本取证与兼容性比对](01-版本取证与兼容性比对.md) | completed | —      | —      |
| 02  | [插件声明与代码对齐](02-插件声明与代码对齐.md)     | completed | 01     | —      |
| 03  | [打包安装与真机验证](03-打包安装与真机验证.md)     | completed | 02     | —      |
