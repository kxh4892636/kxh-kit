---
name: 'nano-flow命令行收口'
description: '交付 @kxh4892636/nano-flow 的 nf bin：self 做 CLI 与 skill 生命周期管理，现有 Anki 能力破坏性迁为 nf anki。'
status: completed
---

# nano-flow命令行收口

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。
## 旧 story

## 原始想法

> 创建 nf cli, 用于收口多个 cli.
> mvp 支持 nf self skill 子命令, 用于安装仓库中的 nano-flow skill
> 将 anki-cli 迁移到 nf 作为 nf anki 子命令
> nf self 支持自动更新
> nf 使用 ts + npm 包
> nf 使用选项参数
> nf 考虑可拓展性, 后续子命令的接入要简单
> nf 支持 --dry-run 参数, 默认行为是真实执行
> nf 支持各级命令 --help 参数

## 角色

- **nf 使用者**: 在终端中使用 Nano Flow 和 Anki 能力，希望通过单一 CLI 获得统一、可发现的入口。
- **nf 子命令维护者**: 负责将新的独立 CLI 能力接入 `nf`，希望尽量少修改共享装配代码。

## 故事

### 统一的 CLI 入口

用 TypeScript 实现并以 npm 包交付 `nf`，首批收口 Nano Flow skill 安装和 Anki 命令。

#### US-001 以 npm 包获取 nano-flow

作为 nf 使用者，我想要安装由 TypeScript 实现的 `nf` npm 包，以便在终端使用单一 CLI 入口。

- [ ] `@kxh4892636/nano-flow` 本地打包生成可由 npm 安装的 `.tgz` 产物，安装后提供可执行的 `nf` 命令。
- [ ] 发布产物由 TypeScript 源码构建而来。
- [ ] MVP 验收不依赖将包发布到 npm registry。

#### US-002 安装仓库中的 nano-flow skill

作为 nf 使用者，我想要通过 `nf self skill` 下的安装命令安装本仓库中的 `nano-flow` skill，以便使用 Nano Flow 工作流。

- [ ] skill 安装命令能将 npm 包内的完整 `nano-flow` skill 树安装到当前工作区 `.agents/skills/nano-flow/`。
- [ ] 可使用 `--target` 指定其他安装位置。
- [ ] 安装使用原子替换；发现无法识别的本地修改时默认拒绝覆盖，仅 `--force` 可继续。
- [ ] 安装成功和失败均通过可判定的退出状态呈现。

#### US-003 将 Anki CLI 并入 nano-flow

作为 nf 使用者，我想要通过 `nf anki` 使用现有 Anki CLI 能力，以便 Anki 成为 `nf` 管理的子命令，而非独立业务域。

- [ ] 现有 `anki-cli` 能力可从 `nf anki` 命令树达到。
- [ ] 安全校验、AnkiConnect action 语义与现有 JSON 输出契约不因入口迁移而丢失。
- [ ] 迁移完成后删除现有 `packages/anki-cli` 代码、`anki-cli` bin 与独立包装配，不提供兼容入口。
- [ ] `nf` 成为 Anki CLI 概念、决策与后续工作的唯一业务域，不再保留独立 `anki-cli` 业务域。

### 可预见、可发现的执行

#### US-004 使用命名选项传参

作为 nf 使用者，我想要用命名选项向命令传参，以便命令的含义清晰且适合脚本化。

- [ ] `nf` MVP 的所有业务输入，包括迁入的 Anki 命令参数，都使用命名选项传入，不使用 positional argument。
- [ ] 缺少必填选项或选项值无效时，命令以非零状态退出并指出问题选项。

#### US-005 预览命令效果

作为 nf 使用者，我想要在任意支持执行的命令上使用 `--dry-run`，以便在不产生真实变更前预览结果。

- [ ] 不传 `--dry-run` 时执行真实行为。
- [ ] `--dry-run` 是可放在任意命令层级的全局选项。
- [ ] 写命令传入 `--dry-run` 时不产生持久化副作用，只读命令则正常执行。
- [ ] dry-run 以 JSON 说明原本将执行的操作，并显式携带 dry-run 状态。

#### US-006 在命令树各级查看帮助

作为 nf 使用者，我想要在命令树各级使用 `--help`，以便就地发现可用子命令和选项。

- [ ] `nf --help`、`nf self --help`、`nf self skill --help` 和 `nf anki` 下的各级命令 `--help` 均成功输出该级用法。
- [ ] 帮助列出当前层级的子命令、选项及必填性。

### 演进与更新

#### US-007 自动更新 nf self 管理的内容

作为 nf 使用者，我想要让 `nf self` 支持自动更新，以便不必手工重复安装新版本。

- [ ] 仅显式执行 `nf self update` 时从 npm registry 检测并更新 CLI，普通命令启动时不静默更新。
- [ ] `nf self update` 默认选择 npm `latest` 且排除 prerelease，可用 `--version <semver-or-tag>` 指定版本或 tag。
- [ ] CLI 更新后，将所有已安装的受管 skill 同步到与 CLI 相同的版本。
- [ ] 更新失败时保留原可用版本。
- [ ] 无更新、更新成功和更新失败三种结果可区分。
- [ ] MVP 用可注入的 npm 执行器验证查询、安装、dry-run 和失败回滚，不要求对真实 registry 执行更新冒烟。

#### US-008 以低耦合方式接入新子命令

作为 nf 子命令维护者，我想要通过稳定的接入契约添加新子命令，以便后续收口 CLI 时无需重复改造核心调度层。

- [ ] 存在一个明确的子命令注册契约，同时承载执行与 help 信息。
- [ ] 用一个最小示例子命令验证接入时无需修改已有业务子命令。
- [ ] MVP 的扩展契约只覆盖仓库内建子命令，不支持第三方运行时插件。

### Skill 生命周期管理

#### US-009 查看可用 skill 及版本

作为 nf 使用者，我想要列出 nf 管理的 skill 并检测版本，以便知道可安装内容和当前状态。

- [ ] `nf self skill list [--target <path>]` 列出包内可用 skill 及目标位置的安装状态。
- [ ] `nf self skill check --name <skill> [--target <path>]` 以 JSON 区分 `not_installed`、`current`、`outdated` 和 `modified`。
- [ ] skill 版本始终等于分发它的 CLI 版本；内容哈希只用于检测本地修改。

#### US-010 卸载受管 skill

作为 nf 使用者，我想要卸载指定的受管 skill，以便移除不再需要的能力。

- [ ] `nf self skill uninstall --name <skill> [--target <path>] [--force]` 卸载指定 skill。
- [ ] `nf self skill uninstall --all [--target <path>] [--force]` 一次卸载目标位置的全部受管 skill。
- [ ] `--name` 与 `--all` 必须且只能提供一个。
- [ ] 卸载只删除明确选中的受管 skill，对非受管目录或含本地修改的目标默认拒绝。

#### US-011 更新受管 skill

作为 nf 使用者，我想要更新指定的已安装 skill，以便获得 nf 当前提供的新版本。

- [ ] `nf self skill update --name <skill> [--target <path>] [--force]` 只从当前 CLI 包更新指定 skill，不下载或更新 CLI。
- [ ] 更新复用安装的原子替换与本地修改保护策略。

#### US-012 一键安装受管 skill

作为 nf 使用者，我想要一次安装 nf 提供的全部 skill，以便无需逐个选择。

- [ ] `nf self skill install --name <skill> [--target <path>] [--force]` 安装指定 skill。
- [ ] `nf self skill install --all [--target <path>] [--force]` 一次安装 CLI 包内的全部受管 skill。
- [ ] `--name` 与 `--all` 必须且只能提供一个。
- [ ] 批量安装对每个 skill 使用与单个安装相同的目标、版本和本地修改保护策略。

#### US-013 通过 nano-flow-cli skill 路由 CLI 能力

作为使用 agent 的 nf 使用者，我想要由 `nano-flow-cli` skill 识别并路由 CLI 任务，以便 agent 始终调用正确的 `nf` 子命令。

- [ ] CLI 包将 `nano-flow-cli` 作为受管 skill 与 `nano-flow` 一起分发。
- [ ] 现有 `anki-cli` skill 的意图识别和使用说明迁入 `nano-flow-cli`，Anki 任务路由到 `nf anki`。
- [ ] 迁移完成后删除 `.agents/skills/anki-cli`，不保留独立 Anki CLI skill。
- [ ] `nano-flow-cli` 可为后续内建子命令增加路由，无需为每个子命令新建独立 CLI skill。

### 稳定的机器输出

#### US-014 使用统一 JSON 契约

作为通过脚本调用 nf 的使用者，我想要获得统一的 JSON 结果，以便稳定地组合和解析所有子命令。

- [ ] 除 `--help` 和版本帮助类输出外，所有执行结果在 stdout 输出 JSON，错误在 stderr 输出 JSON。
- [ ] 退出码继续使用 0=成功、1=运行时错误、2=用法错误的现有契约。
- [ ] Anki 子命令保持现有 structuredContent 结果形状。

## 迷雾

无。

## 上下文

- 用户确认：`nf` 是独立业务域，并合并现有 `anki-cli` 业务域；Anki 是 `nf` 子命令。
- 用户确认：MVP 本地打包安装，不发布 registry；不保留 `anki-cli` 兼容入口或原包代码；扩展契约仅面向内建子命令。
- 用户确认：CLI 后续发布到 npm，skill 版本跟随 CLI；`self update` 与 skill 单独更新保持分工；新建 `nano-flow-cli` skill 路由现有 Anki CLI 任务。
- [Nano Flow 领域术语](../../../CONTEXT.md)
- [Common 领域术语](../../../../common/CONTEXT.md)
- [CLI 的 JSON-only 输出决策](../../../adr/001-cli输出仅json.md)
- [以单一 CLI 收口内建子命令](../../../adr/002-以单一cli收口内建子命令.md)
- [CLI 与受管 skill 同版发布](../../../adr/003-cli与受管skill同版发布.md)
- [Anki MCP 迁移为 CLI 的已完成 plan](spec.md)
- [`nano-flow` skill
- [迁移前 Anki CLI 参考 plan](spec.md)
- [`nano-flow` 当前包内分发源


## 旧 spec


# nf 命令行收口

## 问题

仓库同时维护 Nano Flow skill 分发源和独立 `anki-cli`，使用者需要分别安装、记忆和更新多个入口。需要交付一个 TypeScript npm 包 `@kxh4892636/nano-flow`，以 `nf` bin 收口内建子命令：MVP 提供 `self` 的 CLI/skill 生命周期管理，并将现有 Anki 能力破坏性迁移为 `nf anki`。

命令树必须只使用命名选项，在各级支持 `--help`，全局支持默认真实执行的 `--dry-run`，并延续 JSON-only 执行契约。迁移结束后不保留 `anki-cli` 包、bin、agent skill 或独立业务域。

## 方案

在 `packages/nano-flow` 建立可本地打包安装的 ESM CLI。CLI kernel 是 deep module：它在一个小型 `BuiltinCommand` interface 后隐藏 Commander、typed option DSL、各级 help、全局选项、JSON 输出、错误/退出码和 dry-run 调度。内建子命令以 build-time 自动发现的独立 module 接入，各自持有外部依赖的 adapter，不共享持续膨胀的 dependency bag。

采用 expand-contract 迁移 Anki：先以牌组操作打通 `nf anki` 纵切，再按命令族迁移其余能力；在命令、测试和 CLI 路由 skill 均有替代形态后，最后删除旧包和旧入口。

## 已排除的备选

- **保留独立 CLI，由 `nf` 启动子进程**: 仍需维护多个 npm 包、bin 和兼容契约，没有完成收口。
- **第三方运行时插件**: MVP 只需简化仓库内建子命令接入，插件发现、信任和版本协议会扩大 interface。
- **直接暴露 Commander 注册器**: 会让 options、dry-run、help 和 JSON 契约分散到每个命令，降低 locality。
- **完整通用命令 AST**: interface 过宽，容易重新实现 Commander 并形成 shallow module。
- **skill 独立版本**: 会引入 CLI/skill 版本矩阵和额外发布流。
- **保留 positional argument**: 与已确认的全命名选项契约冲突。

## 实施决策

### 包与目录

- 包名 `@kxh4892636/nano-flow`，bin 为 `nf`，Node >=22.12，ESM，TypeScript strict，测试 vitest，构建使用 `vp pack`。
- MVP 产物为本地 `npm pack`/`vp pack` 生成的 `.tgz`；后续发布 npm，但本 plan 不以真实 registry 发布为验收前提。
- 预期形状：

```text
packages/nano-flow/
├── package.json
├── src/
│   ├── main.ts
│   ├── cli/
│   └── builtins/
│       ├── self/
│       └── anki/
└── skills/
    ├── nano-flow/
    └── nano-flow-cli/
```

### CLI kernel interface

kernel 只暴露运行入口、树状命令定义和 typed option/operation 构造器：

```ts
type BuiltinCommand = CommandGroup;
type CommandNode = CommandGroup | LeafCommand;
type Operation = QueryOperation | MutationOperation;

interface QueryOperation {
  readonly kind: "query";
  run(): Promise<JsonOutput>;
}

interface MutationOperation {
  readonly kind: "mutation";
  prepare(): Promise<{
    readonly preview: JsonValue;
    commit(): Promise<JsonOutput>;
  }>;
}

type JsonOutput = JsonValue | AsyncIterable<JsonValue>;
```

- `group` / `command` / typed `option` DSL 生成命令树、解析和 help，不提供 positional 或 raw Commander 逃生口。
- `src/builtins/{name}/index.ts` 默认导出一个 `BuiltinCommand`；目录名与顶层命令同名，build-time 自动发现，同级名称唯一。
- 内建 module factory 只接收自己需要的 dependencies。kernel 不知道文件系统、npm 或 AnkiConnect。
- `InvocationContext` 提供 `cwd`、`env`、`signal` 和可交互 stdin；`JsonOutput` 的事件流支持复习会话。业务 module 不直接写 stdout/stderr。

### 执行契约

- 保留全局 `--dry-run`、`--compact`、`--debug`；全局选项可放在命令树任意层级。Anki module 另有自身的 `--anki-connect`、`--read-only` 等 scoped options。
- query 在预演中正常执行；mutation 的 `prepare` 可读取状态但不得持久化，预演只输出 `preview`，真实执行才调用 `commit`。
- 除 help/version 外，成功结果在 stdout 输出 JSON，错误在 stderr 输出 JSON；退出码 0=成功、1=运行时错误、2=用法错误。
- 命令定义在执行前 fail fast 检测重复路径、保留选项、非法名称与缺失 mutation 阶段。help/version 不建立外部连接。

### 受管 skill

- `skills/*/SKILL.md` 是 build-time skill catalog；打包时根据 CLI 版本和文件内容生成 manifest。版本始终等于 CLI 版本，哈希只用于识别本地修改。
- 默认安装根为当前工作区 `.agents/skills`，`--target` 改写安装根；具体 skill 落在 `<target>/<name>`。
- 安装状态为 `not_installed | current | outdated | modified`；受管标记记录 skill 名、CLI 版本和内容哈希。
- `list`、`check --name`、`install --name|--all`、`update --name`、`uninstall --name|--all` 共用一个 deep SkillStore module。写操作先全量预检，再通过同目录临时树原子替换；任一项冲突时默认整批不变，`--force` 才可覆盖本地修改。
- 文件系统是 SkillStore 的 internal seam；production 使用 Node adapter，测试使用临时目录或 memory adapter。

### self update

- `nf self update` 默认查询 `@kxh4892636/nano-flow@latest` 且排除 prerelease，`--version <semver-or-tag>` 指定 selector。普通命令不静默检查或更新。
- PackageManagerPort 位于 self module 内部 seam；production 用 npm CLI adapter，测试用 scripted adapter。
- 更新成功后同步已安装受管 skill；任一阶段失败时恢复原 CLI 和 skill。MVP 不运行真实 registry 冒烟，但 scripted adapter 必须验证查询、安装、预演与回滚路径。

### Anki 迁移

- 从 `packages/anki-cli` 保真迁入现有 AnkiConnect client、config、action 逻辑、安全校验和 49 条命令能力；迁移期旧包保持不变，新实现验收完整后再删除。
- AnkiConnect 是 true external；Anki module 定义窄 `AnkiPort.invoke(action, params)` interface，production 用现有 HTTP adapter，测试用假 AnkiConnect。
- 所有旧 positional input 改为命名 option，具体映射在对应迁移 issue 中固定。原 structuredContent 结果、错误 hint、重试、背压、只读守卫和媒体安全语义不变。
- 复习会话使用 `InvocationContext` 读取评分，通过 JSON 事件流输出问题、评分结果与汇总，不在业务 module 内直接访问 `process`。

### CLI 路由 skill 与 contract

- 受管 `nano-flow-cli` skill 路由 `nf self` 和 `nf anki` 意图，吸收现 `.agents/skills/anki-cli` 的领域说明与操作约束。
- 只有在所有 Anki 命令、测试和路由均已迁移后，才删除 `packages/anki-cli`、`anki-cli` bin 和 `.agents/skills/anki-cli`。
- 更新 README、冒烟清单、workspace/lockfile 和全仓引用；不保留兼容别名。

## 工作环境

以下内容是立项时的环境快照，不描述交付完成后的仓库状态。

- Windows 10 / pwsh7，Node >=22.12，pnpm 11.22，Vite Plus 0.2.6，vitest 4.1，Commander 15，zod 4.4。
- workspace 已覆盖 `packages/*`；`packages/nano-flow` 当前只有 Nano Flow skill 分发副本，尚无 `package.json` 或 CLI 代码。
- `packages/anki-cli` 当前有 10 个命令组、17 个测试文件和 168 个测试声明；假 AnkiConnect HTTP 服务器可用于集成测试。
- 当前工作树位于 `main@caa75c0`，除本 plan 的领域/计划文档外无其他改动或未合并冲突。先在 `feature/nano-flow-cli` 分支固化 plan 基线，再于 `.claude/worktrees/nano-flow-cli` 独立 worktree 串行自动领取、实现、验证、审查和提交全部 issue。全部完成后将 `feature/nano-flow-cli` 合入 `main`，合入后的 `main` 提交是单一交付终点。
- npm registry 是真实外部依赖，MVP 使用 scripted adapter 验证 self-update；真实 Anki 与 AnkiConnect 只在最终手工冒烟使用。

## 范围

- `@kxh4892636/nano-flow` TypeScript/npm 包、`nf` bin 与内建命令 kernel。
- `self skill` 列表、检测、单个/全部安装、更新、卸载，以及 CLI `self update`。
- 受管 `nano-flow` 和 `nano-flow-cli` skill。
- 现有 49 条 Anki 能力迁入 `nf anki`，全命名 options、预演和各级 help。
- 删除旧 Anki 包、bin、agent skill 和领域入口。
- 本地 `.tgz` 打包/安装、自动化集成验收和真实 Anki 手工冒烟清单。

## 非范围

- 本 plan 内将 `@kxh4892636/nano-flow` 真实发布到 npm registry。
- 第三方运行时子命令插件。
- `anki-cli` 兼容 bin、兼容 npm 包或废弃期。
- AnkiConnect 插件本身、AnkiWeb 服务或上游 anki-mcp-server 后续版本跟踪。
- shell completion、人类可读表格和颜色渲染。

## 待定

无。

## 验收门禁

每个 issue 都执行 `vp run @kxh4892636/nano-flow#test`、`vp run @kxh4892636/nano-flow#build` 和 `vp check`，并执行该 issue 「验收」节列出的运行态门禁。Anki 迁移 issue 使用假 AnkiConnect 从 CLI interface 验收；skill 写操作使用临时工作区；self-update 使用 scripted PackageManagerPort。最后 issue 额外从 `.tgz` 安装到临时 npm prefix 并验证分发产物。

## 上下文

- [用户故事](spec.md)
- [Nano Flow 领域术语](../../../CONTEXT.md)
- [CLI 输出仅 JSON](../../../adr/001-cli输出仅json.md)
- [以单一 CLI 收口内建子命令](../../../adr/002-以单一cli收口内建子命令.md)
- [CLI 与受管 skill 同版发布](../../../adr/003-cli与受管skill同版发布.md)
- [Anki MCP 迁移为 CLI 的参考 plan](spec.md)
- [`packages/nano-flow` skill 分发源](../../../../../../packages/nano-flow/skills/nano-flow/SKILL.md)

## Issue

| #   | Issue                                                    | 状态      | 阻塞于                     | 下一步     |
| --- | -------------------------------------------------------- | --------- | -------------------------- | ---------- |
| 01  | note 01「CLI-kernel与本地npm包」  | completed | —                          | /implement |
| 02  | note 02「Skill目录与版本检测」        | completed | 01                         | /implement |
| 03  | note 03「Skill安装生命周期」            | completed | 02                         | /implement |
| 04  | note 04「从npm更新nano-flow」        | completed | 03                         | /implement |
| 05  | note 05「Anki纵切与牌组操作」          | completed | 01                         | /implement |
| 06  | note 06「Anki笔记与笔记类型操作」  | completed | 05                         | /implement |
| 07  | note 07「Anki卡片与复习操作」          | completed | 05                         | /implement |
| 08  | note 08「Anki标签媒体与统计操作」  | completed | 05                         | /implement |
| 09  | note 09「Anki-GUI操作」                      | completed | 05                         | /implement |
| 10  | note 10「nano-flow-cli路由skill」 | completed | 03, 04, 05, 06, 07, 08, 09 | /implement |
| 11  | note 11「删除旧Anki形态」                 | completed | 10                         | /implement |
| 12  | note 12「本地包全链路验收」               | completed | 04, 11                     | /implement |

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
