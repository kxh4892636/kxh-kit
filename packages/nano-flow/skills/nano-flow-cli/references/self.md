# Self 路由

## 命令导航

| 任务                           | 路由                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 检查 CLI 版本                  | `nnf --version`                                                              |
| 更新 CLI 与已安装的受管 skills | `nnf self update`                                                            |
| 查看包内 skills 及安装状态     | `nnf self skill list`                                                        |
| 检查一个 skill                 | `nnf self skill check --name <skill>`                                        |
| 安装一个或全部 skills          | `nnf self skill install --name <skill>` / `nnf self skill install --all`     |
| 更新一个 skill                 | `nnf self skill update --name <skill>`                                       |
| 卸载一个或全部 skills          | `nnf self skill uninstall --name <skill>` / `nnf self skill uninstall --all` |

`nnf self update --version <semver-or-tag>` 可选择 npm 版本或 tag；未指定时选择最新稳定版。

## 目标目录与变更边界

- 默认 skill 根目录是当前工作区的 `.agents/skills`，命令在其下管理 `nano-flow` 或 `nano-flow-cli` 文件夹。
- 使用 `--target <root>` 指定其他 skill 根目录；传入的是根目录，不是具体 skill 文件夹。
- 安装会先移除同名目标再写入包内版本，即使内容没有变化。先运行同参数的 `--dry-run`，核对计划中的 `target`。
- 更新与卸载遇到本地修改时保留现场并报错；只有明确要覆盖或删除这些修改时才使用 `--force`。
- `nnf self update` 同步 npm 包和已经安装的受管 skills；失败会回滚。可先运行 `nnf self update --dry-run` 查看 CLI 与 skill 的完整计划。

完成标准：写操作返回成功后，用 `nnf self skill check --name <skill>` 验证状态；批量操作用 `nnf self skill list` 验证所有目标。
