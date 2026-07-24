---
name: argos
description: "Argos 服务端一站式可观测&诊断平台技能（argos run / argos tool log）— 报警分析、故障诊断与根因定位、调用链路追踪(Trace)、服务可用性监控、日志搜索、配置读取。可观测相关问题的默认入口。结构化日志查询详细参数见 argos-tools skill。"
---

# Argos 服务端可观测&诊断平台技能

**允许工具**: `Bash`

## 适用场景

- 查日志（关键词搜索、错误日志聚合、LogID 追踪）
- 监控服务可用性 / 延迟 / 错误率等指标
- 分析报警（链接、group_id）
- 调用链路追踪（Trace / TraceID）
- 故障诊断与根因分析
- 读取服务配置（TCC、ByteConf）
- 回放 / 分析历史 session

**结构化日志查询**（关键词搜索、错误概览、LogID 追踪、本地文件搜索）优先使用 `argos-tools` skill，其参数文档更详细。

## 不适用

- 非可观测性问题（代码审查、部署等）
- 交互式终端会话（`argos chat` 不支持）

---

## 前置依赖

### 安装

| 环境 | 命令 |
|------|------|
| 默认 (Linux/macOS) | `sh -c "$(curl -L https://argos.byted.org/cli/install.sh)" && export PATH=~/.local/bin:$PATH` |
| devbox / npm | `npm install -g @byted/argos@latest --registry https://bnpm.byted.org` |
| 手动 fallback | `npm install -g @byted/bits-cli@latest --registry https://bnpm.byted.org && bitscli plugin install argos` |

二进制位于 `~/.local/bin/argos`。升级：`argos update`。

### 预检查（每个会话一次）

```bash
ARGOS_BIN="$(command -v argos 2>/dev/null || true)"
[ -z "$ARGOS_BIN" ] && [ -x "$HOME/.local/bin/argos" ] && ARGOS_BIN="$HOME/.local/bin/argos"
[ -z "$ARGOS_BIN" ] && echo "NOT_INSTALLED" || echo "INSTALLED: $ARGOS_BIN"
```

若 `NOT_INSTALLED`：引导用户安装（不要自动执行 `curl | sh`），安装后 `argos` 扫码登录。

### 认证

| 方式 | 场景 |
|------|------|
| 飞书扫码 | 默认 — 普通终端执行 `argos` |
| `export ARGOS_JWT_TOKEN="<token>"` | CI/CD 或 headless（token 敏感，不要回显） |
| `npx -y agentbuddy@latest get-jwt` | 无法扫码时获取 JWT |

默认环境为 `cn`。切换环境：`argos config set env <env>`（可选值：`cn` / `i18n` / `i18n-bd` / `boe` / `sandbox`）。

### 沙盒 / Trae Solo 适配

| 问题 | 处理方式 |
|------|----------|
| PATH 不完整 | 使用绝对路径 `~/.local/bin/argos` |
| SSL 证书验证失败 | 命令前添加 `NODE_TLS_REJECT_UNAUTHORIZED=0` |

---

## 快速开始

```bash
# 自然语言查询（始终使用这些标志）
argos run "分析这个报警: <alarm_link>" --output-format text -y --timeout 300000 --show-session

# 日志工具（完整参数文档见 argos-tools skill）
argos tool log search.keywords '{"psm":"my.service","region":"China-North","keywords":["error"],"start":"2026-06-30T00:00:00Z","end":"2026-06-30T01:00:00Z"}'
```

---

## 命令路由

| 用户意图 | 命令 |
|----------|------|
| 分析报警链接 / group_id | `argos run "分析这个报警: <链接>"` |
| 服务可用性 / 延迟 / 错误率 | `argos run "查看 psm=<psm> 最近<时间>的可用性和延迟"` |
| 错误日志概览（聚合） | `argos tool log error_log`（见 argos-tools） |
| 关键词日志搜索 | `argos tool log search.keywords`（见 argos-tools） |
| LogID 追踪 | `argos tool log logid_prune`（见 argos-tools） |
| TraceID 追踪（32位 hex / UUID） | `argos run "追踪 traceID <id>"`（不要用 logid_prune） |
| 读取配置 | `argos run "帮我读配置 <路径或描述>"` |
| Session 回放 | `argos run "分析 session <session_id> 的执行过程"` |

**优先级**：LogID → `logid_prune`；错误概览 → `error_log`；关键词 → `search.keywords`；其他 → `argos run`。

---

## 强制规则

### 命令执行
- 始终使用 `run` 子命令（禁止 `chat`）
- 始终带 `-y`（自动确认）
- 始终带 `--show-session` 并向用户展示 session ID
- 始终带 `--timeout 300000`（5 分钟）；复杂查询用 `600000`
- 查询文本用中文（针对 CN 查询优化）
- 除非用户明确指定环境，不要设 `-e`

### 查询策略
- 多次查询必须串行执行（禁止并发）
- 时间范围 >3h：拆分为 ≤3h 的串行请求
- 优先通过关键词收窄结果，再扩大时间范围

### 重试策略
- 失败后不自动重试 — 展示原因，询问用户
- 用户确认后最多重试 3 次
- 参数校验错误：提示用户修正，不进入重试

### Shell 安全
- 禁止 `set -u` 或 `set -euo pipefail`（zsh 报错）；如需严格模式用 `set -eo pipefail`
- 禁止读取 `~/.sre-agent/sessions/` 文件；session 分析通过 `argos run` 处理

---

## `run` 子命令参数

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `-e, --env <env>` | 环境（cn / i18n / i18n-bd / boe / sandbox） | `cn` |
| `-a, --agent <name>` | Agent 名称 | `Common` |
| `-m, --model <model>` | 模型覆盖 | - |
| `-y, --yes` | 自动确认工具执行 | `false` |
| `-o, --output-format <format>` | 输出格式（text / json / stream-json） | `text` |
| `--max-turns <n>` | 最大 Agent 轮次 | - |
| `--timeout <ms>` | 超时时间（毫秒） | - |
| `--session <id>` | 恢复已有 session | - |
| `--show-session` | 执行后打印 session ID | `false` |
| `--verbose` | 显示思考过程和工具调用详情 | `false` |

---

## References

| 场景 | 文件 |
|------|------|
| Region 名称与 `-e` 环境参数映射 | [references/regions.md](./references/regions.md) |
| 日志工具完整参数文档 | 见 `argos-tools` skill |

---

## 故障排除

| 症状 | 原因 | 处理 |
|------|------|------|
| `TOKEN_EXPIRED` / `token has expired` | JWT 过期 | 重新登录：`argos` 扫码；或刷新 `ARGOS_JWT_TOKEN` |
| `TOKEN_INVALID` / `verification error` | JWT 签名无效 | 确认 token 来源；`argos logout` 后重新登录 |
| `WebSocket upgrade failed` / `Unexpected server response` | 网关认证拒绝 | 同上 — 先检查 JWT |
| `Query timed out` | 执行超时 | 增加 `--timeout`；拆分为更小的问题 |
| `connection refused` / `ECONNREFUSED` | 服务不可达 | 检查网络；i18n：`argos config set env i18n` |
| 空结果 / 数据不对 | `-e` 与 region 所属分区不匹配 | 见 [references/regions.md](./references/regions.md) |

> 用户文档：<https://bytedance.larkoffice.com/docx/Ov8LdUalKowm63xWNxyckgkUn1e>
