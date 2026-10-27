# dsh 插件适配 0.2.1-rc.2

## 原始想法

> /nano-flow repos/kxh-kit/packages/dsh-nested-skill 根据最新的 dsh 版本进行更新, 更新后安装到 dsh 中

（2026-10-26，用户原话；`/nano-flow` 为流程入口指令，实际目标即「按最新 dsh 更新 `packages/dsh-nested-skill` 并安装到 dsh」。）

## 角色

- **工作区维护者**：本机用 `dsh` 跑 Web GUI（3080）与嵌套 skill 流程；希望插件跟随宿主版本，安装后即可用，不需要手工排查声明漂移。
- **会话内的模型/agent**：通过 skill 目录发现并加载嵌套 skill（`questing`、`code-delivery` 等）；目录完整性与同名冲突的胜出规则必须是确定的。

## 故事

### 插件跟随宿主版本

这组故事让 `dsh-nested-skill` 与当前运行的 dsh 版本重新对齐，并能在 profile 里装上、跑起来。

#### US-001 声明与宿主版本对齐

作为工作区维护者，我希望插件的 DSH peer 声明等于本机已装并验证过的 dsh 版本，以便 `dsh plugin add` 的兼容性校验通过，而不是被要求逐版本豁免。

- [ ] 插件的 `@deepseek-ai/dsh*` peer 范围满足运行中 dsh 的版本（`0.2.1-rc.2`）。
- [ ] README 的兼容性段落写明 `0.2.1-rc.2` 与复核条件。

#### US-002 嵌套 skill 仍被发现，且顶层声明优先

作为会话内的模型，我希望在 0.2.1-rc.2 宿主上仍然能发现 `.agents` 树任意深度的 skill，并且同名的内建一层形态继续胜出，以便既有 skill 布局不受影响。

- [ ] 项目根 `.agents` 树任意深度的合法 `SKILL.md` 出现在候选里，内建一层形态与非法 frontmatter 不出现。
- [ ] 同来源下同名冲突由内建一层形态胜出；跨来源优先级仍按上游来源序排列。
- [ ] 目录变化（含宿主 `edit`/`write` 落盘）仍触发目录失效。

#### US-003 装进 web profile 并验证

作为工作区维护者，我希望插件以可复用的安装形态装进 `web` profile，并能用可复核的方式确认生效，以便 GUI 重启后新会话立刻看到嵌套 skill。

- [ ] `dsh plugin --profile web add <产物>` 成功，profile 清单出现该 package 与 bundle。
- [ ] 组合结果里出现 `nested-skill` 行；独立 dsh 进程内能发现嵌套 skill。
- [ ] 安装形态在源码重建后不需要手工同步（与 `file:` 硬链接/链接投影区分）。

## 约束与澄清

- 2026-10-26 用户指令：范围限定 `packages/dsh-nested-skill`；「最新 dsh」指本机运行中的宿主（`0.2.1-rc.2`，`latest` 通道），不是 npm 上的 `next`（`0.2.1-rc.3`）；口径沿用 ADR-0003「声明等于已在本机验证的通道版本」。
- 2026-10-26 前置事实：宿主进程由 `npm exec @deepseek-ai/dsh@latest web` 拉起（PID 226278/237090，14:14 启动），当前会话运行在该进程内；重启 3080 会中断本会话，是否重启由用户决定。
- 2026-10-26 前置事实：`~/.dsh/profiles/web` 目前只有 base / web-app / session-search 三个 bundle，本插件尚未安装。
- 不发布 npm、不改上游仓库、不动其他工作区包。

## 迷雾

- 安装后 GUI 是否需要重启才能看到嵌套 skill：bundle 层在 profile 组合时读入，用户层 `cordis.patch.yml` 才是热重载的；结论待安装后用 `--dump-config` 与独立进程实测确认，影响 US-003 的验收措辞而非实现。

## 上下文

- [spec](./spec.md)
- [领域语言](../../../CONTEXT.md)
- [ADR-0001 嵌套 skill 任意深度发现](../../../adr/0001-嵌套skill任意深度发现.md)
- [package.json](../../../../../packages/dsh-nested-skill/package.json)
