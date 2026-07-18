# kxh-awesome 仓库地图

实际文件系统、最近的 `AGENTS.md` 和目标配置是最终事实源；下列表内路径均相对仓库根。

## Workspace

`pnpm-workspace.yaml` 当前覆盖 `apps/*`、`templates/*` 和 `packages/*`。

| 路径 | 职责 | 源头与生成边界 |
| --- | --- | --- |
| `apps/etf-dashboard` | React ETF 行情看板 | 应用源位于 `src/`；RPC 客户端生成到 `src/libs/api/gen/etf-service/`；`dist/` 是构建产物 |
| `apps/etf-service` | Go ConnectRPC、SQLite 与行情缓存服务 | `proto/` 与 `internal/` 是源；`generate.sh` 刷新 `gen/` 和 `docs/index.html`；`data/` 是运行数据 |
| `apps/wiki` | Docusaurus 知识库和 Markdown 内容 | `docs/`、`src/` 与站点配置是源；`.docusaurus/` 和 `build/` 是生成物 |
| `templates/react-go-template` | React SPA 与 ConnectRPC 客户端模板 | 应用源位于 `src/`；RPC 客户端生成到 `src/libs/api/gen/go-template/`；`dist/` 是构建产物 |
| `templates/go-template` | Go ConnectRPC 与 SQLite 后端模板 | `proto/` 与 `internal/` 是源；`generate.sh` 刷新 `gen/` 和 `docs/index.html` |
| `packages/docusaurus-plugin-link` | Docusaurus 短链接 TypeScript 包 | `src/` 与 `tests/` 是源；`dist/` 是 `vp pack` 产物 |
| `packages/url-network-guard-extension` | Chrome Manifest V3 扩展 | `manifest.json`、`background.js` 与 `popup.*` 直接组成扩展；当前不是 Node package |

## 仓库级上下文

| 路径 | 职责 |
| --- | --- |
| `.agents/skills` | 本仓库维护的本地 skills |
| `docs/agents` | issue tracker、triage labels 与 domain docs 的约定 |
| `.scratch` | 本地 issue / PRD 数据；按 [issue tracker 约定](../../../../docs/agents/issue-tracker.md) 操作 |
| `scripts` | 仓库维护脚本 |
| `package.json`、`pnpm-workspace.yaml`、`vite.config.ts`、`tsconfig.json`、`.node-version` | Node/workspace 的当前配置与版本事实源 |
