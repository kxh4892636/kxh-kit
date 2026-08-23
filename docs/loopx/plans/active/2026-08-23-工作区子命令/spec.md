---
status: in_progress
---

# 工作区子命令

## 问题

loopx 需要 `workspace` 内建子命令管理多仓库工作区：用一份可版本控制的 `workspace.yaml` 声明子仓集合（name/url/path/branch），把远程仓库浅克隆到本机克隆存储（默认 `~/workspaces`），再通过 git worktree 检出到工作区目录；`workspace.local.yaml` 记录每个子仓克隆在本机的实际路径，不进版本控制。

## 方案

新增 `src/builtins/workspace/` 内建命令组（经 `import.meta.glob` 自动发现），提供 `init` / `add` / `remove` / `list` / `status` / `pull` 与 `worktree list` / `worktree switch` / `worktree remove` / `worktree prune` 十个命令。`init`、`remove` 只改配置，`add` 以 upsert 语义写配置；`pull` 兼任物化与更新（克隆缺失则浅克隆、目标 worktree 缺失则创建，再 fetch 并 fast-forward）；`worktree` 子命令组管理子仓的 worktree 生命周期；`list`、`status` 为只读视图。全部命令遵守 JSON-only 契约，写命令支持 `--dry-run`。

## 已排除的备选

- 手写受限 YAML 解析器：边界情况（引号、转义、嵌套）易出错，且无法可靠写回；引入 `yaml` 依赖。
- bare 克隆存入克隆存储：克隆自身无工作树，不便直接查看与手动操作；采用普通浅克隆（`--depth 1` + 基准分支，见 [ADR-0004](../../adr/0004-子仓克隆存储使用浅克隆.md)）。
- worktree 直接检出基准分支：同一分支不能在多个 worktree 同时检出，且污染基准分支；从基准创建工作分支 `worktree/<仓库名>-<yyyymmddhhmmss>`。
- 独立 `sync` 命令物化：多一条命令且与 pull 职责重叠；pull 兼任物化。
- 独立 `worktree add` 命令：与 `pull --path --worktree-branch` 职责重叠；额外 worktree 的创建统一由 pull 物化，切换已注册 worktree 的分支由 `worktree switch` 承担。
- `add`/`remove` 级联操作仓库：数据丢失风险不可逆；二者只改 `workspace.yaml`。
- pull 后 rebase 工作分支到基准分支：自动改写用户本地提交历史；只 fetch + fast-forward，不可快进时报告跳过。

## 实施决策

### workspace.yaml schema

```yaml
repositories:
  - name: kxh-kit # 唯一标识
    url: git@github.com:kxh4892636/kxh-kit.git # ssh 或 http(s)
    path: apps/kxh-kit # worktree 相对工作区根的路径
    branch: main # 拉取远程的基准分支
```

- 从 cwd 逐级向上查找第一个 `workspace.yaml`，其所在目录即工作区根；找不到时报错并提示先运行 `init`。
- `name` 全局唯一；`path` 不可重复。校验失败输出 JSON 错误（退出码 1/2 按契约）。

### workspace.local.yaml schema

```yaml
repositories:
  - name: kxh-kit
    clone_path: C:/Users/kxh/workspaces/kxh-kit # 克隆存储在本机的实际绝对路径
```

- 位于工作区根，不提交版本控制；由 `pull` 物化后自动创建或更新；已有记录的 `clone_path` 优先于默认 `~/workspaces/<name>`。

### 命令契约

- `init`：在 cwd 创建含空 `repositories` 的 `workspace.yaml`；已存在则报错。
- `add --name --url --path --branch`：向 `workspace.yaml` 追加条目；name 已存在时更新该条目的 url/path/branch（upsert）；path 被其他子仓占用时报错；不触碰仓库。
- `remove --name`：从 `workspace.yaml` 移除条目；不删除 worktree 与本机克隆；输出中报告该子仓残留的 clone_path 记录与清理提示（先 `worktree remove` 再手动清理克隆），残留记录由 `pull` 忽略未知 name 处理。
- `list`：配置视图——每个子仓的 name/url/path/branch 与本机 clone_path（若已记录）。
- `status`：运行态视图——克隆是否存在、每个已注册 worktree（路径、当前分支、是否 dirty、能否 fast-forward 到基准分支、是否主 worktree）；fast-forward 判断基于本地已有 refs，不隐式 fetch。
- `pull [--name <name>...] [--path <path>] [--worktree-branch <branch>]`：对每个目标子仓依次执行——克隆缺失则 `git clone --depth 1 --branch <branch>` 到克隆存储并记录 `clone_path`；目标 worktree（`--path` 指定，相对工作区根，默认配置 path）缺失则以工作分支（`--worktree-branch` 指定，默认 `worktree/<name>-<yyyymmddhhmmss>`）从基准分支创建检出，已存在时忽略 `--worktree-branch`；然后 fetch 基准分支（`--depth 1`）并对 worktree 当前分支 `merge --ff-only <branch>`。脏 worktree 或不可快进时该项报告 skipped，其余子仓继续。未指定 `--name` 时处理全部子仓；`--path` 与 `--worktree-branch` 仅在指定单个 `--name` 时可用。`workspace.local.yaml` 中记录的 `clone_path` 已失效（目录不存在）时报错并提示修正或删除记录，不自动换路径重克隆。
- `worktree list [--name <name>...]`：聚合各子仓 `git worktree list --porcelain`——路径、分支、HEAD commit、是否主 worktree、是否 locked；未物化子仓标注。
- `worktree switch --name <repo> --path <path> --branch <branch> [--base <branch>]`：将指定 worktree 切换到目标分支；目标分支不存在时从 `--base`（默认配置 branch）创建；worktree 不存在、目标分支已被其他 worktree 检出、dirty 导致切换冲突时透传 git 报错。
- `worktree remove --name <repo> --path <path> [--force] [--delete-branch]`：移除指定 worktree（删目录 + 清注册）；主 worktree 允许移除，下次 `pull` 按配置重建；dirty 时必须 `--force`；默认保留工作分支，`--delete-branch` 时以 `git branch -d` 删除（未合并的分支由 git 拒绝并报错）。
- `worktree prune [--name <name>...]`：对克隆存储执行 `git worktree prune`，清理目录已被手动删除的失效注册，报告清理条目。

## 工作环境

- Node.js >= 22.12；本机可用的 `git` CLI（shell 调用，不引入 git 库）；`~/workspaces` 可写或 `clone_path` 指向可写位置。
- 新增依赖：`yaml`（解析与写回）；schema 校验复用 `zod`。
- 门禁：`pnpm --filter @kxh4892636/loopx check`、`pnpm --filter @kxh4892636/loopx test`、`pnpm --filter @kxh4892636/loopx build`；git 副作用用临时目录下的真实 git 仓库做集成测试。
- 执行在 git worktree 隔离分支中进行；全部 issue 完成后合入 main，loopx 升级 patch 版本并本地安装，最后 push。

## 范围

- `workspace` 命令组十个命令及其配置模型、定位、物化与更新逻辑、worktree 生命周期管理。
- JSON 输出契约、`--dry-run`、命令级测试。
- 领域文档同步：CONTEXT.md 新术语与 ADR-0004。

## 非范围

- 本机克隆存储的删除命令。
- 子仓内提交、推送等开发工作流。
- 多工作区嵌套、`workspace.yaml` 的 include/继承。
- 并发物化与进度渲染。
- `worktree lock` / `unlock`。

## 待定

无。

## 上下文

- [CONTEXT.md](../../CONTEXT.md)
- [ADR-0001 CLI 输出仅 JSON](../../adr/0001-cli-输出仅-json.md)
- [ADR-0002 以单一 CLI 收口内建子命令](../../adr/0002-以单一cli收口内建子命令.md)
- [ADR-0004 子仓克隆存储使用浅克隆](../../adr/0004-子仓克隆存储使用浅克隆.md)

## Issue

| #   | Issue                                   | 状态        | 阻塞于 | 下一步     |
| --- | --------------------------------------- | ----------- | ------ | ---------- |
| 01  | [配置模型与定位](01-配置模型与定位.md)  | completed   | —      | /implement |
| 02  | [添加与移除仓库](02-添加与移除仓库.md)  | in_progress | 01     | /implement |
| 03  | [拉取与物化](03-拉取与物化.md)          | pending     | 01     | /implement |
| 04  | [列表与状态](04-列表与状态.md)          | pending     | 03     | /implement |
| 05  | [Worktree 子命令](05-worktree子命令.md) | pending     | 03     | /implement |
