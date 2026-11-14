# kxh-kit 工作区

这里只做工作区与 git 仓库管理：不装依赖、不放代码，也不共享 `node_modules`。

## 子仓（`repos/`，各自独立 git 仓）

| 目录 | 用途 | 远端 |
| --- | --- | --- |
| `repos/etf` | ETF 行情看板（client / server / shared） | 待定（GitHub 上 `etf` 已被占用） |
| `repos/music` | 本地古典曲库随机播放站点 | `kxh4892636/music`（private） |
| `repos/wiki` | Docusaurus 个人知识站 | `kxh4892636/wiki`（private） |
| `repos/docusaurus-plugin-link` | wiki 的 `doc:` 短链插件 | `kxh4892636/docusaurus-plugin-link`（private） |
| `repos/docusaurus-plugin-mindmap` | wiki 的 `<Mindmap>` 渲染块插件 | `kxh4892636/docusaurus-plugin-mindmap`（private） |
| `repos/dsh-infinite-story` | DSH 无限故事插件 | `kxh4892636/dsh-infinite-story`（private） |
| `repos/dsh-toolkit` | DSH 工具集与 Nano Flow 预设 | `kxh4892636/dsh-toolkit`（private） |
| `repos/nano-flow` | `nnf` CLI（Anki / 受管 skill） | `kxh4892636/nano-flow`（private） |
| `repos/pi-toolkit` | pi 扩展（nested skills / 会话名 / 搜索 / ask / Nano Flow） | `kxh4892636/pi-toolkit`（private） |

`repos/` 整体被忽略，容器仓不跟踪子仓内容。

## 约定

- 每个子仓自带 `package.json`、`pnpm-lock.yaml`、`tsconfig.base.json`、`pnpm-workspace.yaml`，进对应目录 `pnpm install` 即可，互不影响。
- 依赖版本各自维护，不再有共享 catalog；跨仓依赖走制品（GitHub Release 的 `.tgz`），不走 workspace 协议。
- `.agents/` 是 Nano Flow 领域文档，随工作区走，不拆。
- 私有内容（如 `repos/wiki/docs/010-记录`）只存在本机磁盘，被该仓 `.gitignore` 排除，永远不进 git。
- git worktree 统一建在各子仓自己的 `.worktrees/`。

## 日常

```bash
cd repos/wiki && pnpm install && pnpm build
cd repos/etf && pnpm dev
```

容器仓自身的提交只包含文档与脚本。
