# Nano Flow CLI

`nf` 是 TypeScript/npm 命令行包，统一管理 Nano Flow 自身、受管 skills 与 AnkiConnect 自动化。MVP 从本地包安装；后续发布到 npm 时，CLI 与包内 skills 使用同一版本。

## 本地打包与安装

在仓库根目录使用 PowerShell：

```powershell
vp run @kxh4892636/nano-flow#build
Push-Location packages/nano-flow
$packResult = npm pack --json | ConvertFrom-Json
$nfArchive = Join-Path (Get-Location) $packResult[0].filename
Pop-Location
npm install --global $nfArchive
nf --version
nf --help
```

重新打包后对同一路径执行 `npm install --global $nfArchive` 即可替换本地安装。卸载使用 `npm uninstall --global @kxh4892636/nano-flow`。

## 命令发现与执行契约

以运行时 help 为命令和 option 的事实来源：

```powershell
nf --help
nf self --help
nf self skill --help
nf anki --help
nf anki notes --help
nf anki notes add --help
```

- 所有输入使用命名 options，不接受旧 positional 写法。
- 默认真实执行。写命令添加 `--dry-run` 时只返回计划；确认后移除该 option 执行。
- `--compact` 输出单行 JSON，`--debug` 增加调试信息；二者与 `--dry-run` 可放在命令路径的任意位置。
- stdout 只输出成功 JSON，stderr 只输出错误 JSON；退出码 0=成功、1=运行时错误、2=用法错误。

## 管理 Nano Flow 与 skills

包内分发 `nano-flow` 和 `nano-flow-cli` 两个受管 skills。默认根目录是当前工作区 `.agents/skills`，也可用 `--target <root>` 指定其他根目录：

```powershell
nf self skill list
nf self skill check --name nano-flow
nf self skill install --all --dry-run
nf self skill install --all
nf self skill update --name nano-flow-cli
nf self skill uninstall --all
```

安装会先移除同名目标再写入包内版本，即使文件未变化。更新和卸载会保护本地修改，只有明确接受覆盖时才加 `--force`。

发布到 npm 后，`nf self update` 默认更新到最新稳定版并同步已安装的受管 skills；`--version <semver-or-tag>` 选择指定版本，`--target <root>` 指定 skill 根目录，`--dry-run` 查看完整计划。MVP 尚未发布，因此真实 self-update 留待首次发布后验收。

## AnkiConnect

启动桌面端 Anki 并安装 AnkiConnect 后，使用 `nf anki`。默认地址为 `http://localhost:8765`：

```powershell
nf anki decks list
nf anki --anki-connect http://localhost:8765 cards due --limit 10
nf anki notes add --deck Default --model Basic --field Front=hello --field Back=world --dry-run
```

`--read-only` 阻止集合写入；也可设置 `READ_ONLY=true`。连接配置支持 `ANKI_CONNECT_URL`、`ANKI_CONNECT_API_KEY`、`ANKI_CONNECT_API_VERSION`、`ANKI_CONNECT_TIMEOUT` 和 `LOG_LEVEL`。媒体安全例外由 `MEDIA_ALLOWED_TYPES`、`MEDIA_IMPORT_DIR`、`MEDIA_ALLOWED_HOSTS` 控制。

真实 Anki 验收见仓库中的 [Anki 冒烟检查清单](https://github.com/kxh4892636/kxh-kit/blob/main/docs/nano-flow/anki%E5%86%92%E7%83%9F%E6%A3%80%E6%9F%A5%E6%B8%85%E5%8D%95.md)。自动化只连接临时假 AnkiConnect，不改动用户集合。

## 迁移

旧 `@kxh4892636/anki-cli` 包、`anki-cli` bin 与独立 agent skill 已删除，不提供兼容入口。原命令能力位于 `nf anki`，agent 路由位于受管 `nano-flow-cli` skill。
