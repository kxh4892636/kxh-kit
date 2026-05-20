# GitNexus

基于知识图谱的代码智能引擎，将代码库索引为可查询图谱，通过 MCP 协议让 AI 智能体获得深度代码感知。

## 核心原理

6 阶段索引流水线：结构分析 → Tree-sitter 语法解析 → 跨文件关系解析 → 社区聚类 → 执行流追踪 → 搜索索引构建

索引结果存储在本地 `.gitnexus/`（LadybugDB 图数据库），不上传代码。

## 应用场景

| 场景 | 说明 |
|---|---|
| 架构理解 | 追踪执行流，识别功能模块 |
| 影响分析 | 改动前评估爆炸半径（深度 1/2/3 层依赖） |
| Bug 追踪 | 追踪调用链定位问题根源 |
| 安全重构 | 多文件协调重命名，不遗漏引用 |
| PR 审查 | 自动分析 git diff 影响的流程和风险 |

## 安装

前置：Node.js 18+（推荐 20 LTS）、Git

```bash
# 方式一：npx 直接用（推荐）
npx gitnexus analyze

# 方式二：全局安装
npm install -g gitnexus
gitnexus analyze
```

常用命令：

```bash
gitnexus analyze --force        # 强制全量重建
gitnexus analyze --embeddings   # 启用语义嵌入（更慢但搜索更智能）
gitnexus status                 # 查看索引状态
gitnexus list                   # 列出已索引仓库
gitnexus clean                  # 删除索引
gitnexus serve                  # 启动本地 HTTP 服务（供 Web UI 连接）
```

## 在 Trae IDE 中添加 MCP

设置 → MCP → + 添加 → 手动添加，粘贴：

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

其他编辑器配置：

| 编辑器 | 配置方式 |
|---|---|
| Claude Code | `claude mcp add gitnexus -- npx -y gitnexus@latest mcp` |
| Cursor | `~/.cursor/mcp.json`，同上 JSON 格式 |
| OpenCode | `~/.config/opencode/config.json`，同上 JSON 格式 |

## 在 Trae IDE 中添加 Skill

运行 `npx gitnexus analyze` 后自动生成到 `.trae/skills/` 目录，无需手动操作。

如需手动安装：将 Skill 文件夹（含 `SKILL.md`）放到 `.trae/skills/<skill-name>/` 下。

## MCP 工具一览

| 工具 | 功能 |
|---|---|
| `query` | 混合搜索（BM25 + 语义 + RRF） |
| `context` | 符号 360° 视图 |
| `impact` | 爆炸半径分析 |
| `detect_changes` | Git diff 影响分析 |
| `rename` | 多文件协调重命名 |
| `cypher` | 原生图查询 |
| `list_repos` | 列出已索引仓库 |

## 使用示例

```
# 架构理解
"认证模块是怎么工作的？"

# 影响分析
"修改 getUserInfo 函数会影响什么？"

# Bug 追踪
"/api/orders 为什么返回 500？"

# 安全重构
"把 formatDate 从 utils.ts 移到 date-helpers.ts"

# PR 审查
"分析当前 git 变更影响哪些流程"
```

## 常见问题

| 问题 | 方案 |
|---|---|
| 索引过期仍显示过期 | 重启 IDE 重新加载 MCP Server |
| 嵌入生成慢 | 省略 `--embeddings`（默认关闭） |
| Worker 解析超时 | `--worker-timeout 60` |
| Node 24+ 安装失败 | 切换到 Node 20 LTS |

## 参考

- GitHub: https://github.com/abhigyanpatwari/GitNexus
- Web UI: https://gitnexus.vercel.app
