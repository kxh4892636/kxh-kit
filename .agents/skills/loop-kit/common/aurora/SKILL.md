---
name: aurora
version: 0.1.3
description: Aurora Design 单入口 skill；当用户提到 @ecom/aurora、Aurora 组件库、@ecom/auxo 迁移、组件 API/props/demo/token/Semantic DOM、实验性 ECOP 物料召回、Aurora CLI/MCP、Trae/AgentBuddy 集成时使用。按需加载 references/component-expert.md、references/migration-assistant.md、references/material-recall.md。
---

# Aurora

这是 Aurora 官方单入口 skill。它负责识别用户意图，并在需要时读取对应 reference。

## 意图分流

先判断用户任务属于哪类，再只读取必要 reference：

| 用户意图 | 读取文件 | 常用工具 |
|---|---|---|
| 查询或使用 Aurora 组件 API、Props、Demo、Token、Semantic DOM、样式定制 | `references/component-expert.md` | `aurora info`、`aurora doc`、`aurora demo`、`aurora token`、`aurora semantic`，或 MCP `aurora_info` / `aurora_doc` |
| 旧项目从 `@ecom/auxo` 升级到 `@ecom/aurora` | `references/migration-assistant.md` | `aurora usage`、`aurora migrate auxo`、`aurora check` |
| 评估 Auxo 项目迁移成本 / 要一份项目级迁移报告 | `references/migration-assistant.md` | `aurora migrate auxo <dir> --format markdown --detail`（落盘完整报告）、`--format json`（结构化全量） |
| 明确要求查找或召回 ECOP 业务物料 | `references/material-recall.md` | `aurora material recall`、`aurora material show`、MCP `recall_materials_for_task` / `get_material_context` |

如果任务同时包含多类意图，按实际需要读取多个 reference。

## CLI 解析

不要要求用户必须先全局安装 Aurora CLI。需要调用 CLI 时按以下优先级解析：

```bash
aurora_cli() {
  if command -v aurora >/dev/null 2>&1; then
    aurora "$@"
  elif [ -n "${AURORA_CLI_REPO:-}" ] && [ -f "$AURORA_CLI_REPO/bin/aurora.js" ]; then
    node "$AURORA_CLI_REPO/bin/aurora.js" "$@"
  else
    npm_config_registry="${npm_config_registry:-https://bnpm.byted.org}" \
      npx -y @ecom/aurora-cli@latest "$@"
  fi
}
```

如果 `npx` 下载失败、网络不可用或用户要求离线使用，再提示安装全局 CLI：

```bash
npm install -g @ecom/aurora-cli --registry=https://bnpm.byted.org/
```

## 默认工作方式

- 查询类任务如果已配置 Aurora MCP tools，优先使用 MCP 获取结构化结果；否则使用 `aurora_cli`。
- 编码类任务先查询当前 knowledge pack，再写代码。knowledge pack 由 CLI 按项目实际 `@ecom/aurora` 版本解析（本地/缓存优先，缺失时从 `@ecom/aurora-knowledge@<version>` 远程拉取），因此回答前应确认项目已声明或安装对应的 `@ecom/aurora` 版本，确保知识与版本对齐；解析机制与相关环境变量见 `references/component-expert.md`。
- 迁移类任务先诊断和 dry-run，不要直接写入。
- 物料召回仍是实验能力，当前仅覆盖 ECOP 物料知识包；只有用户明确提出物料召回、ECOP 物料或业务物料复用时才启用，并在输出中说明覆盖范围。
- 如果工具输出缺失，明确说明缺失点，不凭 Ant Design、Auxo、旧版 Aurora 或记忆编造 API。

## 安全原则

- 迁移类任务先诊断和 dry-run，不要直接写代码。
- 只有用户明确要求迁移或接受 diff 后，才运行写入命令。
- 查询类任务优先使用 Aurora 知识包或 MCP 工具，不凭记忆编造 API。
- 物料召回需要说明复用价值、适配成本和可能风险。
- 遇到无稳定等价 API、内部类型泄漏、生态包替代、图标语义映射、Moment/Dayjs 行为差异时，列为 Prompt 或人工确认项。

## 输出要求

向用户汇报时保持简洁，重点说明：

- 已运行的关键命令或 MCP 工具。
- 是否发生写入；迁移类任务需明确 read-only、dry-run 或 write。
- 关键结论、剩余风险和下一步。
