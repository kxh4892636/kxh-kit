# dsh 插件装进 desktop 宿主

## 原始想法

> dsh desktop 安装插件 packages/dsh-nested-skill

（2026-10-27，用户原话；诉求即「把工作区的 `dsh-nested-skill` 插件装进 desktop 版 DSH，会话里就能看到嵌套 skill」。）

## 角色

- **工作区维护者**：日常在 desktop 版 DSH GUI（`http://127.0.0.1:50261`）里工作；希望 `.agents` 树里的嵌套 skill 随手可加载，不接受每次手工排查声明漂移。
- **会话内的模型/agent**：通过 skill 目录发现并加载嵌套 skill（`questing`、`code-delivery`、`domain` 等）；目录完整性与同名冲突的胜出规则必须确定。

## 故事

### 插件在 desktop 宿主上可用

这组故事把插件与 desktop 宿主版本重新对齐，装进 `desktop` profile，并在运行中的宿主里验证。

#### US-001 声明与 desktop 宿主版本对齐

作为工作区维护者，我希望插件的 DSH peer 声明等于本机 desktop 宿主实际运行的 dsh 版本，以便 `dsh plugin add` 的兼容性校验直接通过，而不是被要求逐版本豁免。

- [ ] 插件的 `@deepseek-ai/dsh*` peer 钉到 `0.2.1-rc.3`（desktop 宿主版本），构建使用的上游类型与声明同版。
- [x] README 兼容性段落写明 `0.2.1-rc.3` 与复核条件。

#### US-002 装进 desktop profile 并在运行中宿主里生效

作为工作区维护者，我希望插件以 tarball 形态装进 `desktop` profile，且不需要改插件代码就能在宿主里看到嵌套 skill。

- [x] `dsh plugin --profile desktop add <tgz>`（desktop 自带 CLI）成功，profile 清单出现该 package 与 bundle。
- [x] 组合层可复核：运行中宿主实际加载了插件（`--dump-config` 被 Electron 托管规则拒绝，改用 profile 清单 + 宿主目录，见 [03](03-打包安装与宿主验证.md)）。
- [x] 运行中的宿主 skill 目录出现嵌套 skill（`questing`、`code-delivery` 等 6 个），原有顶层 skill 仍在。

#### US-003 安装可复核、可回滚

作为工作区维护者，我希望安装与回滚都有明确命令与判定点，以便换版本或出错时能自洽收场。

- [x] README 的安装/卸载段落改为 desktop profile 的可执行命令。
- [x] 记录卸载命令与回滚判定（`dsh plugin --profile desktop remove @kxh4892636/dsh-nested-skill`）。

## 约束与澄清

- 2026-10-27 用户指令：范围就是「装进 dsh desktop」，实现落在 `packages/dsh-nested-skill` 与本 Plan。
- 2026-10-27 前置事实：desktop 宿主为 `0.2.1-rc.3`（`DeepSeek Harness.exe` 文件版本同值），profile 为 `~/.dsh/profiles/desktop`，`dsh.profile.bundles` 现为 `dsh-base` / `dsh-web-app` / `dsh-experimental-session-search`。
- 2026-10-27 前置事实：PATH 上的 `dsh` 是 `0.1.6-alpha.1`（vite-plus 安装），不能用于 desktop profile；desktop 自带入口是 `resources\runtime\cli\bin\dsh.cmd`。
- 口径沿用 ADR-0003「声明等于已在本机验证的通道版本」；不发布 npm、不改上游仓库、不动其他工作区包。
- 不为过关使用 `dsh plugin allow-version` 豁免。

## 迷雾

- ~~安装后运行中的 desktop 宿主是否无需重启即重新组合 bundle 层~~：2026-10-27 已澄清——安装后本会话 skill 目录立即出现嵌套 skill，宿主未重启（见 [03](03-打包安装与宿主验证.md)）。
- GUI 侧 `/` 菜单是否随宿主刷新：本会话收到的 skill 目录已刷新（模型侧），GUI 视觉未确认；rc.2 的「客户端按 `sessionId` 缓存」结论不适用于本场景，保留待观察。

## 上下文

- [spec](spec.md)
- [取证与兼容性比对](01-取证与兼容性比对.md)
- 前序 Plan：[dsh 插件适配 0.2.1-rc.2](../../reference/2026-10-26-dsh插件适配0.2.1-rc.2/spec.md)
- [领域语言](../../../CONTEXT.md)、[ADR-0001 嵌套 skill 任意深度发现](../../../adr/0001-嵌套skill任意深度发现.md)、[ADR-0003 内容搜索交付口径](../../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)
- [package.json](../../../../../packages/dsh-nested-skill/package.json)
