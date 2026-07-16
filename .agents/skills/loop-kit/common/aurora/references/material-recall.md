# Aurora 物料召回

状态：实验能力。当前仅 ECOP 物料提供了知识包，不能代表 Aurora 业务物料生态的完整覆盖。

只有用户明确提出物料召回、ECOP 物料、运营业务物料复用，或希望查找已有业务组件/物料时，才读取本文件。典型场景包括运营页面、查询表单、数据看板、表格列表、指标区、实体信息展示，以及可能复用 ECOP 业务物料的其他 UI。

## 目标

在写代码前召回候选物料并获取 coding context，优先复用维护中的 Aurora/ECOP 物料，避免重复手写业务 UI。

输出时必须提醒用户：物料召回仍处于早期实验阶段，当前结果只覆盖已接入知识包的 ECOP 物料。

## 优先 MCP 工作流

如果 Aurora material MCP tools 可用，优先使用 MCP，因为它能给 Agent 结构化上下文：

1. 调用 `recall_materials_for_task`。
   - `task` 传入用户原始任务。
   - 页面级任务 `maxCandidates` 设为 `20`，窄组件任务设为 `12`。
   - 已知当前项目路径时传 `projectPath`。
2. 把返回结果当作候选，不要当作最终推荐。
   - 不要把本地候选顺序当作最终排序。
   - 结合用户任务、category/kind、whenToUse、avoidWhen、evidence、demos、项目依赖自行 rerank。
3. 对 rerank 后的高价值候选调用 `get_material_context`。
   - `query` 使用当前任务。
   - 根据任务大小请求 1-3 个 demos。
4. 物料适配任务时，优先用选中的物料实现。
5. 编辑代码后，对使用到的每个物料调用 `validate_material_usage`。
6. 项目有 build/typecheck 命令时尽量运行。

## CLI fallback

如果 MCP tools 不可用，使用本地 CLI 命令：

```bash
aurora_cli material recall "<task>" --project <projectPath> --max-candidates 20 --format json
aurora_cli material show <materialId> --query "<task>" --max-demos 2
aurora_cli material search "<query>" --limit 20 --format json
```

## 候选选择规则

- 用 `@ecop/operation-layout` 处理页面框架、headers、tabs、cards、anchors 和 page-level layout。
- 用 `@ecop/operation-query-form` 处理列表查询和筛选区域，尤其是 remote search、quick filters、merchant/product/author 字段和 responsive filter layout。
- 用 `@ecop/operation-common-indicator-card` 处理 KPI cards、dashboard metrics、selectable indicators、trends，以及 GMV/order/UV 汇总。
- 用 `@ecop/operation-info-card` 处理 table/entity cells，展示 shop、product、author、brand、video、image、IDs、tags 和 levels。
- 用 `@ecop/operation-value-display` 处理 money、percent、compare、progress、time、count 等格式化展示。
- 只有任务明确需要 CRM business line、team、owner 或 scene-code hierarchy selection 时，才使用 `@ecop/vbline-cascader`。

## 输出要求

向用户汇报时包含：

- 使用了哪些 MCP tools 或 CLI commands。
- 考虑过哪些候选物料，以及 LLM rerank 后最终选择哪些物料。
- 每个选中物料适合哪个页面区域。
- 需要安装的 packages，并匹配项目 package manager。
- 约束和风险，尤其是不可直接复制的 demos、缺失 props、peer dependencies、React 版本风险或内部 registry 要求。

不要编造物料 props、imports 或 package names。不要把 debugScore 或 CLI 顺序当作最终推荐置信度。如果上下文不完整，说明必须通过 build/typecheck 或 package docs 验证。
