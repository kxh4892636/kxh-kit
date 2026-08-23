---
status: in_progress
---

# loopx 命令行收口

## 问题

仓库同时维护 Loop Kit skill 分发源和独立 `anki-cli`，使用者需要分别安装、记忆和更新多个入口。需要交付一个 TypeScript npm 包 `@kxh4892636/loopx`，以 `loopx` bin 收口内建子命令：MVP 提供 `self` 的 CLI/skill 生命周期管理，并将现有 Anki 能力破坏性迁移为 `loopx anki`。

命令树必须只使用命名选项，在各级支持 `--help`，全局支持默认真实执行的 `--dry-run`，并延续 JSON-only 执行契约。迁移结束后不保留 `anki-cli` 包、bin、agent skill 或独立业务域。

## 方案

在 `packages/loopx` 建立可本地打包安装的 ESM CLI。CLI kernel 是 deep module：它在一个小型 `BuiltinCommand` interface 后隐藏 Commander、typed option DSL、各级 help、全局选项、JSON 输出、错误/退出码和 dry-run 调度。内建子命令以 build-time 自动发现的独立 module 接入，各自持有外部依赖的 adapter，不共享持续膨胀的 dependency bag。

采用 expand-contract 迁移 Anki：先以牌组操作打通 `loopx anki` 纵切，再按命令族迁移其余能力；在命令、测试和 CLI 路由 skill 均有替代形态后，最后删除旧包和旧入口。

## 已排除的备选

- **保留独立 CLI，由 `loopx` 启动子进程**: 仍需维护多个 npm 包、bin 和兼容契约，没有完成收口。
- **第三方运行时插件**: MVP 只需简化仓库内建子命令接入，插件发现、信任和版本协议会扩大 interface。
- **直接暴露 Commander 注册器**: 会让 options、dry-run、help 和 JSON 契约分散到每个命令，降低 locality。
- **完整通用命令 AST**: interface 过宽，容易重新实现 Commander 并形成 shallow module。
- **skill 独立版本**: 会引入 CLI/skill 版本矩阵和额外发布流。
- **保留 positional argument**: 与已确认的全命名选项契约冲突。

## 实施决策

### 包与目录

- 包名 `@kxh4892636/loopx`，bin 为 `loopx`，Node >=22.12，ESM，TypeScript strict，测试 vitest，构建使用 `vp pack`。
- MVP 产物为本地 `npm pack`/`vp pack` 生成的 `.tgz`；后续发布 npm，但本 plan 不以真实 registry 发布为验收前提。
- 预期形状：

```text
packages/loopx/
├── package.json
├── src/
│   ├── main.ts
│   ├── cli/
│   └── builtins/
│       ├── self/
│       └── anki/
└── skills/
    ├── loop-x/
    └── loop-x-cli/
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

- `loopx self update` 默认查询 `@kxh4892636/loopx@latest` 且排除 prerelease，`--version <semver-or-tag>` 指定 selector。普通命令不静默检查或更新。
- PackageManagerPort 位于 self module 内部 seam；production 用 npm CLI adapter，测试用 scripted adapter。
- 更新成功后同步已安装受管 skill；任一阶段失败时恢复原 CLI 和 skill。MVP 不运行真实 registry 冒烟，但 scripted adapter 必须验证查询、安装、预演与回滚路径。

### Anki 迁移

- 从 `packages/anki-cli` 保真迁入现有 AnkiConnect client、config、action 逻辑、安全校验和 49 条命令能力；迁移期旧包保持不变，新实现验收完整后再删除。
- AnkiConnect 是 true external；Anki module 定义窄 `AnkiPort.invoke(action, params)` interface，production 用现有 HTTP adapter，测试用假 AnkiConnect。
- 所有旧 positional input 改为命名 option，具体映射在对应迁移 issue 中固定。原 structuredContent 结果、错误 hint、重试、背压、只读守卫和媒体安全语义不变。
- 复习会话使用 `InvocationContext` 读取评分，通过 JSON 事件流输出问题、评分结果与汇总，不在业务 module 内直接访问 `process`。

### CLI 路由 skill 与 contract

- 受管 `loop-x-cli` skill 路由 `loopx self` 和 `loopx anki` 意图，吸收现 `.agents/skills/anki-cli` 的领域说明与操作约束。
- 只有在所有 Anki 命令、测试和路由均已迁移后，才删除 `packages/anki-cli`、`anki-cli` bin 和 `.agents/skills/anki-cli`。
- 更新 README、冒烟清单、workspace/lockfile 和全仓引用；不保留兼容别名。

## 立项时工作环境

- Windows 10 / pwsh7，Node >=22.12，pnpm 11.22，Vite Plus 0.2.6，vitest 4.1，Commander 15，zod 4.4。
- workspace 已覆盖 `packages/*`；`packages/loopx` 当前只有 Loop Kit skill 分发副本，尚无 `package.json` 或 CLI 代码。
- `packages/anki-cli` 当前有 10 个命令组、17 个测试文件和 168 个测试声明；假 AnkiConnect HTTP 服务器可用于集成测试。
- 当前工作树位于 `main@caa75c0`，除本 plan 的领域/计划文档外无其他改动或未合并冲突。先在 `feature/loopx-cli` 分支固化 plan 基线，再于 `.claude/worktrees/loopx-cli` 独立 worktree 串行自动领取、实现、验证、审查和提交全部 issue。全部完成后将 `feature/loopx-cli` 合入 `main`，合入后的 `main` 提交是单一交付终点。
- npm registry 是真实外部依赖，MVP 使用 scripted adapter 验证 self-update；真实 Anki 与 AnkiConnect 只在最终手工冒烟使用。

## 范围

- `@kxh4892636/loopx` TypeScript/npm 包、`loopx` bin 与内建命令 kernel。
- `self skill` 列表、检测、单个/全部安装、更新、卸载，以及 CLI `self update`。
- 受管 `loop-x` 和 `loop-x-cli` skill。
- 现有 49 条 Anki 能力迁入 `loopx anki`，全命名 options、预演和各级 help。
- 删除旧 Anki 包、bin、agent skill 和领域入口。
- 本地 `.tgz` 打包/安装、自动化集成验收和真实 Anki 手工冒烟清单。

## 非范围

- 本 plan 内将 `@kxh4892636/loopx` 真实发布到 npm registry。
- 第三方运行时子命令插件。
- `anki-cli` 兼容 bin、兼容 npm 包或废弃期。
- AnkiConnect 插件本身、AnkiWeb 服务或上游 anki-mcp-server 后续版本跟踪。
- shell completion、人类可读表格和颜色渲染。

## 待定

无。

## 验收门禁

每个 issue 都执行 `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check`，并执行该 issue 「验收」节列出的运行态门禁。Anki 迁移 issue 使用假 AnkiConnect 从 CLI interface 验收；skill 写操作使用临时工作区；self-update 使用 scripted PackageManagerPort。最后 issue 额外从 `.tgz` 安装到临时 npm prefix 并验证分发产物。

## 上下文

- [用户故事](story.md)
- [LoopX 领域术语](../../../CONTEXT.md)
- [CLI 输出仅 JSON](../../../adr/0001-cli-输出仅-json.md)
- [以单一 CLI 收口内建子命令](../../../adr/0002-以单一cli收口内建子命令.md)
- [CLI 与受管 skill 同版发布](../../../adr/0003-cli与受管skill同版发布.md)
- [Anki MCP 迁移为 CLI 的参考 plan](../../reference/2026-08-20-mcp迁移为cli/spec.md)
- [`packages/loopx` skill 分发源](../../../../../packages/loopx/skills/loop-x/SKILL.md)

## Issue

| #   | Issue                                                   | 状态      | 阻塞于                     | 下一步     |
| --- | ------------------------------------------------------- | --------- | -------------------------- | ---------- |
| 01  | [CLI kernel 与本地 npm 包](01-CLI-kernel与本地npm包.md) | completed | —                          | /implement |
| 02  | [Skill 目录与版本检测](02-Skill目录与版本检测.md)       | completed | 01                         | /implement |
| 03  | [Skill 安装生命周期](03-Skill安装生命周期.md)           | completed | 02                         | /implement |
| 04  | [从 npm 更新 loopx](04-从npm更新loopx.md)               | completed | 03                         | /implement |
| 05  | [Anki 纵切与牌组操作](05-Anki纵切与牌组操作.md)         | completed | 01                         | /implement |
| 06  | [Anki 笔记与笔记类型操作](06-Anki笔记与笔记类型操作.md) | completed | 05                         | /implement |
| 07  | [Anki 卡片与复习操作](07-Anki卡片与复习操作.md)         | completed | 05                         | /implement |
| 08  | [Anki 标签媒体与统计操作](08-Anki标签媒体与统计操作.md) | completed | 05                         | /implement |
| 09  | [Anki GUI 操作](09-Anki-GUI操作.md)                     | completed | 05                         | /implement |
| 10  | [loop-x-cli 路由 skill](10-loop-x-cli路由skill.md)      | completed | 03, 04, 05, 06, 07, 08, 09 | /implement |
| 11  | [删除旧 Anki 形态](11-删除旧Anki形态.md)                | completed | 10                         | /implement |
| 12  | [本地包全链路验收](12-本地包全链路验收.md)              | pending   | 04, 11                     | /implement |
