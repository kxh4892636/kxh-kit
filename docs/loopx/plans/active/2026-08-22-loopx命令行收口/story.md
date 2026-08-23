# loopx 命令行收口

## 原始想法

> 创建 loopx cli, 用于收口多个 cli.
> mvp 支持 loopx self skill 子命令, 用于安装仓库中的 loop-x skill
> 将 anki-cli 迁移到 loopx 作为 loopx anki 子命令
> loopx self 支持自动更新
> loopx 使用 ts + npm 包
> loopx 使用选项参数
> loopx 考虑可拓展性, 后续子命令的接入要简单
> loopx 支持 --dry-run 参数, 默认行为是真实执行
> loopx 支持各级命令 --help 参数

## 角色

- **loopx 使用者**: 在终端中使用 Loop Kit 和 Anki 能力，希望通过单一 CLI 获得统一、可发现的入口。
- **loopx 子命令维护者**: 负责将新的独立 CLI 能力接入 `loopx`，希望尽量少修改共享装配代码。

## 故事

### 统一的 CLI 入口

用 TypeScript 实现并以 npm 包交付 `loopx`，首批收口 Loop Kit skill 安装和 Anki 命令。

#### US-001 以 npm 包获取 loopx

作为 loopx 使用者，我想要安装由 TypeScript 实现的 `loopx` npm 包，以便在终端使用单一 CLI 入口。

- [ ] `@kxh4892636/loopx` 本地打包生成可由 npm 安装的 `.tgz` 产物，安装后提供可执行的 `loopx` 命令。
- [ ] 发布产物由 TypeScript 源码构建而来。
- [ ] MVP 验收不依赖将包发布到 npm registry。

#### US-002 安装仓库中的 loop-x skill

作为 loopx 使用者，我想要通过 `loopx self skill` 下的安装命令安装本仓库中的 `loop-x` skill，以便使用 Loop Kit 工作流。

- [ ] skill 安装命令能将 npm 包内的完整 `loop-x` skill 树安装到当前工作区 `.agents/skills/loop-x/`。
- [ ] 可使用 `--target` 指定其他安装位置。
- [ ] 安装使用原子替换；发现无法识别的本地修改时默认拒绝覆盖，仅 `--force` 可继续。
- [ ] 安装成功和失败均通过可判定的退出状态呈现。

#### US-003 将 Anki CLI 并入 loopx

作为 loopx 使用者，我想要通过 `loopx anki` 使用现有 Anki CLI 能力，以便 Anki 成为 `loopx` 管理的子命令，而非独立业务域。

- [ ] 现有 `anki-cli` 能力可从 `loopx anki` 命令树达到。
- [ ] 安全校验、AnkiConnect action 语义与现有 JSON 输出契约不因入口迁移而丢失。
- [ ] 迁移完成后删除现有 `packages/anki-cli` 代码、`anki-cli` bin 与独立包装配，不提供兼容入口。
- [ ] `loopx` 成为 Anki CLI 概念、决策与后续工作的唯一业务域，不再保留独立 `anki-cli` 业务域。

### 可预见、可发现的执行

#### US-004 使用命名选项传参

作为 loopx 使用者，我想要用命名选项向命令传参，以便命令的含义清晰且适合脚本化。

- [ ] `loopx` MVP 的所有业务输入，包括迁入的 Anki 命令参数，都使用命名选项传入，不使用 positional argument。
- [ ] 缺少必填选项或选项值无效时，命令以非零状态退出并指出问题选项。

#### US-005 预览命令效果

作为 loopx 使用者，我想要在任意支持执行的命令上使用 `--dry-run`，以便在不产生真实变更前预览结果。

- [ ] 不传 `--dry-run` 时执行真实行为。
- [ ] `--dry-run` 是可放在任意命令层级的全局选项。
- [ ] 写命令传入 `--dry-run` 时不产生持久化副作用，只读命令则正常执行。
- [ ] dry-run 以 JSON 说明原本将执行的操作，并显式携带 dry-run 状态。

#### US-006 在命令树各级查看帮助

作为 loopx 使用者，我想要在命令树各级使用 `--help`，以便就地发现可用子命令和选项。

- [ ] `loopx --help`、`loopx self --help`、`loopx self skill --help` 和 `loopx anki` 下的各级命令 `--help` 均成功输出该级用法。
- [ ] 帮助列出当前层级的子命令、选项及必填性。

### 演进与更新

#### US-007 自动更新 loopx self 管理的内容

作为 loopx 使用者，我想要让 `loopx self` 支持自动更新，以便不必手工重复安装新版本。

- [ ] 仅显式执行 `loopx self update` 时从 npm registry 检测并更新 CLI，普通命令启动时不静默更新。
- [ ] `loopx self update` 默认选择 npm `latest` 且排除 prerelease，可用 `--version <semver-or-tag>` 指定版本或 tag。
- [ ] CLI 更新后，将所有已安装的受管 skill 同步到与 CLI 相同的版本。
- [ ] 更新失败时保留原可用版本。
- [ ] 无更新、更新成功和更新失败三种结果可区分。
- [ ] MVP 用可注入的 npm 执行器验证查询、安装、dry-run 和失败回滚，不要求对真实 registry 执行更新冒烟。

#### US-008 以低耦合方式接入新子命令

作为 loopx 子命令维护者，我想要通过稳定的接入契约添加新子命令，以便后续收口 CLI 时无需重复改造核心调度层。

- [ ] 存在一个明确的子命令注册契约，同时承载执行与 help 信息。
- [ ] 用一个最小示例子命令验证接入时无需修改已有业务子命令。
- [ ] MVP 的扩展契约只覆盖仓库内建子命令，不支持第三方运行时插件。

### Skill 生命周期管理

#### US-009 查看可用 skill 及版本

作为 loopx 使用者，我想要列出 loopx 管理的 skill 并检测版本，以便知道可安装内容和当前状态。

- [ ] `loopx self skill list [--target <path>]` 列出包内可用 skill 及目标位置的安装状态。
- [ ] `loopx self skill check --name <skill> [--target <path>]` 以 JSON 区分 `not_installed`、`current`、`outdated` 和 `modified`。
- [ ] skill 版本始终等于分发它的 CLI 版本；内容哈希只用于检测本地修改。

#### US-010 卸载受管 skill

作为 loopx 使用者，我想要卸载指定的受管 skill，以便移除不再需要的能力。

- [ ] `loopx self skill uninstall --name <skill> [--target <path>] [--force]` 卸载指定 skill。
- [ ] `loopx self skill uninstall --all [--target <path>] [--force]` 一次卸载目标位置的全部受管 skill。
- [ ] `--name` 与 `--all` 必须且只能提供一个。
- [ ] 卸载只删除明确选中的受管 skill，对非受管目录或含本地修改的目标默认拒绝。

#### US-011 更新受管 skill

作为 loopx 使用者，我想要更新指定的已安装 skill，以便获得 loopx 当前提供的新版本。

- [ ] `loopx self skill update --name <skill> [--target <path>] [--force]` 只从当前 CLI 包更新指定 skill，不下载或更新 CLI。
- [ ] 更新复用安装的原子替换与本地修改保护策略。

#### US-012 一键安装受管 skill

作为 loopx 使用者，我想要一次安装 loopx 提供的全部 skill，以便无需逐个选择。

- [ ] `loopx self skill install --name <skill> [--target <path>] [--force]` 安装指定 skill。
- [ ] `loopx self skill install --all [--target <path>] [--force]` 一次安装 CLI 包内的全部受管 skill。
- [ ] `--name` 与 `--all` 必须且只能提供一个。
- [ ] 批量安装对每个 skill 使用与单个安装相同的目标、版本和本地修改保护策略。

#### US-013 通过 loop-x-cli skill 路由 CLI 能力

作为使用 agent 的 loopx 使用者，我想要由 `loop-x-cli` skill 识别并路由 CLI 任务，以便 agent 始终调用正确的 `loopx` 子命令。

- [ ] CLI 包将 `loop-x-cli` 作为受管 skill 与 `loop-x` 一起分发。
- [ ] 现有 `anki-cli` skill 的意图识别和使用说明迁入 `loop-x-cli`，Anki 任务路由到 `loopx anki`。
- [ ] 迁移完成后删除 `.agents/skills/anki-cli`，不保留独立 Anki CLI skill。
- [ ] `loop-x-cli` 可为后续内建子命令增加路由，无需为每个子命令新建独立 CLI skill。

### 稳定的机器输出

#### US-014 使用统一 JSON 契约

作为通过脚本调用 loopx 的使用者，我想要获得统一的 JSON 结果，以便稳定地组合和解析所有子命令。

- [ ] 除 `--help` 和版本帮助类输出外，所有执行结果在 stdout 输出 JSON，错误在 stderr 输出 JSON。
- [ ] 退出码继续使用 0=成功、1=运行时错误、2=用法错误的现有契约。
- [ ] Anki 子命令保持现有 structuredContent 结果形状。

## 迷雾

无。

## 上下文

- 用户确认：`loopx` 是独立业务域，并合并现有 `anki-cli` 业务域；Anki 是 `loopx` 子命令。
- 用户确认：MVP 本地打包安装，不发布 registry；不保留 `anki-cli` 兼容入口或原包代码；扩展契约仅面向内建子命令。
- 用户确认：CLI 后续发布到 npm，skill 版本跟随 CLI；`self update` 与 skill 单独更新保持分工；新建 `loop-x-cli` skill 路由现有 Anki CLI 任务。
- [LoopX 领域术语](../../../CONTEXT.md)
- [Common 领域术语](../../../../common/CONTEXT.md)
- [CLI 的 JSON-only 输出决策](../../../adr/0001-cli-输出仅-json.md)
- [以单一 CLI 收口内建子命令](../../../adr/0002-以单一cli收口内建子命令.md)
- [CLI 与受管 skill 同版发布](../../../adr/0003-cli与受管skill同版发布.md)
- [Anki MCP 迁移为 CLI 的已完成 plan](../../reference/2026-08-20-mcp迁移为cli/spec.md)
- [`loop-x` skill](../../../../../.agents/skills/loop-x/SKILL.md)
- [`anki-cli` 当前 npm 包](../../../../../packages/anki-cli/package.json)
- [`anki-cli` 当前命令自动发现入口](../../../../../packages/anki-cli/src/cli/program.ts)
- [`loop-x` 当前包内分发源](../../../../../packages/loopx/skills/SKILL.md)
