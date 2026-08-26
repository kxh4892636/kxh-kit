---
status: in_progress
---

# 工作区命令重构

## 问题

`loopx workspace` 当前把配置编辑、子仓物化与 worktree 生命周期混在扁平命令中，并以 `workspace.yaml.path` 表示默认 worktree、以 `workspace.local.yaml.clone_path` 或 `~/workspaces/<name>` 定位子仓克隆。需将命令树重构为三个领域资源层，每层具备完整 CRUD：工作区配置项、远程子仓的本地物化、额外 worktree。

`workspace.yaml.path` 改为子仓克隆相对工作区根的路径，完全移除 local 文件契约；每个额外 worktree 均从该克隆生成并显式指定目标路径。

## 方案

命令使用 Workspace/Git 领域术语，不使用机械的 `create/read/update/delete`：

```text
workspace config      init / add / list / update / remove
workspace repository  clone / status / pull / remove
workspace worktree    add / list / switch / remove / prune
```

- `config` 管理 `workspace.yaml` 中的子仓配置项；`init` 是容器初始化。
- `repository` 管理配置子仓在 `path` 上的克隆。`clone` 只物化，`pull` 只更新已物化克隆。
- `worktree` 管理基于该克隆的额外 worktree；`prune` 是失效注册维护。

## 已排除的备选

- 保留扁平 `workspace init/add/remove/list/status/pull`：资源边界不清，且 `pull` 混合 repository create/update 与 worktree create。
- 命名为 `create/read/update/delete`：丢失 Git 与 Workspace 领域语言。
- 保留 `workspace.local.yaml` 覆盖：仍存在双路径事实源。
- `repository pull` 在克隆缺失时隐式 clone：合并 Create 与 Update；缺失时应提示 `repository clone`。
- 由 pull 创建 worktree：跨越 repository 与 worktree 资源边界。
- 级联删除：可能产生无法审计的数据丢失；删除顺序固定为 worktree → repository → config。
- 自动迁移或删除遗留 local 文件：未经授权改动用户机器文件；新命令忽略它。
- 绝对 worktree 目标：破坏工作区边界与路径穿越防护。
- bare 或完整克隆：继续普通浅克隆，见 [ADR-0005](../../../adr/0005-子仓克隆由工作区配置定位.md)。

## 实施决策

### 配置与路径

```yaml
repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: repositories/kxh-kit # 子仓克隆相对工作区根的路径
    branch: main
```

- `workspace.yaml` 是唯一配置文件；不定义、读取、写入或删除 `workspace.local.yaml`。
- `path` 必须相对工作区根，不得为空或包含 `..`，规范化后不得重复；唯一解析为 `path.resolve(workspaceRoot, repository.path)`。
- 遗留 `workspace.local.yaml` 存在时静默忽略，不自动迁移、修改或删除。

### Config CRUD

- `config init`：在 cwd 创建空 `workspace.yaml`；已存在时拒绝。
- `config add --name --url --path --branch`：Create 配置项；name 已存在时拒绝，不再 upsert；path 冲突时拒绝。
- `config list [--name <name>...]`：Read 一个、多个或全部配置项，返回 `name/url/path/branch`。
- `config update --name <name> [--url <url>] [--path <path>] [--branch <branch>]`：Update 已存在项；至少一个可变字段必填，name 是稳定身份不可重命名。子仓已物化时拒绝更改 url/path/branch。
- `config remove --name <name>`：Delete 配置项；配置 path 上仍存在子仓克隆时拒绝，不级联删除。

### Repository CRUD

- `repository clone [--name <name>...]`：Create 子仓克隆；默认按配置顺序处理全部。在配置 path 执行 `git clone --depth 1 --branch <branch>`；目标已存在时该项拒绝，其他项继续。
- `repository status [--name <name>...]`：Read 克隆是否存在、解析路径、基准分支、dirty/分叉与注册 worktree；不隐式 fetch。
- `repository pull [--name <name>...]`：Update 已物化克隆；fetch 基准分支并 fast-forward-only。缺失时报 skipped 并提示 clone，dirty/不可快进时跳过，其他项继续；不操作额外 worktree。
- `repository remove --name <name> --yes [--force]`：Delete 单个克隆。存在额外注册 worktree 时始终拒绝；primary 克隆 dirty，或存在不可由任一 remote ref 达到的本地提交/分支时，只有同时指定 `--force` 才删除；不删除 config 项。

### Worktree CRUD

- `worktree add --name <repo> --path <path> [--branch <branch>] [--base <branch>]`：Create 额外 worktree；目标 path 必填且相对工作区根。branch 缺省为 `worktree/<仓库名>-<yyyymmddhhmmss>`，base 缺省为配置 branch。
- `worktree list [--name <name>...]`：Read Git 注册 worktree，以 `primary` 识别配置克隆。
- `worktree switch --name <repo> --path <path> --branch <branch> [--base <branch>]`：Update 指定额外 worktree 的工作分支；禁止操作 primary 克隆。
- `worktree remove --name <repo> --path <path> [--force] [--delete-branch]`：Delete 指定额外 worktree；dirty 时需 `--force`，禁止操作 primary 克隆。
- `worktree prune [--name <name>...]`：清理目录已消失的失效注册，不代替正常 Delete。

### 共享执行契约

- 删除顺序为 worktree → repository → config；每层只删除本层资源，不级联。
- 所有写命令支持 `--dry-run`；`repository remove` 额外要求 `--yes`。
- 所有命令继续遵循 CLI JSON-only 输出与退出码契约。
- 旧扁平 workspace 命令直接移除，不保留 alias。

## 工作环境

- 实现位于 `packages/loopx/src/builtins/workspace/`；Node.js >= 22.12，使用本机 `git` CLI，不引入新 git 库。
- 配置继续使用 `yaml` 解析/写回和 `zod` schema。
- 每个 issue 的 `/verifying` 门禁固定为 `pnpm --filter @kxh4892636/loopx check`、`pnpm --filter @kxh4892636/loopx test`、`pnpm --filter @kxh4892636/loopx build`；repository/worktree 副作用使用临时目录中的真实 git 仓库集成测试。Issue 03 完成后额外执行 `pnpm --filter @kxh4892636/loopx test:distribution`、`pnpm --filter @kxh4892636/loopx test:mutation` 和领域文档校验，验证分发包中的完整命令树与测试敏感度。

## 范围

- config/repository/worktree 三层领域子命令与每层完整 CRUD。
- `workspace.yaml.path` 子仓克隆语义与单一路径解析。
- 完整移除 local 文件、默认 `~/workspaces`、local orphan 和旧扁平命令依赖。
- 非级联的层级删除门禁、`--yes`/`--force`、预演、JSON 输出、CLI help 与集成测试。
- LoopX glossary 和取代 ADR 同步。

## 非范围

- 自动迁移或删除遗留 `workspace.local.yaml`。
- 级联删除、配置移除后的孤儿资源管理、repository 批量删除。
- 额外 worktree 的自动 pull/rebase/merge，以及子仓内提交或推送工作流。
- 绝对 worktree 目标、配置 include/继承、并发物化、进度渲染、`worktree lock/unlock`。
- 浅克隆的 unshallow 或完整历史管理。

## 待定

无。

## 上下文

- [LoopX 领域语言](../../../CONTEXT.md)
- [ADR-0001 CLI 输出仅 JSON](../../../adr/0001-cli-输出仅-json.md)
- [ADR-0002 以单一 CLI 收口内建子命令](../../../adr/0002-以单一cli收口内建子命令.md)
- [ADR-0005 子仓克隆由工作区配置定位](../../../adr/0005-子仓克隆由工作区配置定位.md)
- [已完成的工作区子命令 Plan](../../reference/2026-08-23-工作区子命令/spec.md)

## Issue

| #   | Issue                                       | 状态        | 阻塞于 | 下一步     |
| --- | ------------------------------------------- | ----------- | ------ | ---------- |
| 01  | [工作区配置 CRUD](01-工作区配置crud.md)     | completed   | —      | /implement |
| 02  | [子仓物化 CRUD](02-子仓物化crud.md)         | completed   | 01     | /implement |
| 03  | [Worktree CRUD](03-worktree生命周期crud.md) | in_progress | 02     | /implement |
