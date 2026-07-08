# Lark Chart

飞书画板能力已并入 `lark-doc-quality`。当用户要在飞书文档中补图、画图或更新画板时，先使用本入口，再按需读取更细的 chart reference；不要一次性加载全部画板资料。

## 使用边界

使用本入口：

- 用户要求画架构图、流程图、泳道图、时序图、组织架构图、状态机、ER 图、思维导图、漏斗、甘特、里程碑、矩阵象限、链路架构、手绘风格架构、复杂业务泳道图。
- 用户要求产品原型、路线图、桑基图、插画式图解或其他自由视觉表达，并明确要写入飞书画板或作为飞书文档配图。
- 用户给出飞书 docx/wiki URL，要求“配图”“画出来”“同步到飞书”“写到画板”。

不要使用本入口：

- 一两句话就能说清的概念，不需要视觉结构。
- 用户只要 Markdown 表格、流程清单、代码片段或普通文档排版。
- 用户明确要内联 SVG 写入 Markdown，而不是飞书画板。

## 核心流程

每次生成飞书画板都遵循：

```text
Normalize -> Select -> Plan -> Layout -> Render -> StaticCheck -> VQA -> Deliver
```

硬约束：

- 不硬编码模板：结构从用户输入和引用文档抽取，不套固定业务文案。
- 不硬编码坐标：几何由布局引擎或 Layout 阶段函数计算。
- 不硬编码样式：颜色、字号、圆角、线宽来自 `assets/style-tokens/`；代码原生图除外。
- 不补造内容：不得补充用户或引用文档中不存在的层级、模块、角色或节点；技术性 start/end 等哨兵节点必须标注 `auto-added`。
- 不跳过质量门：按路由执行脚本和飞书端回读；Gate B 必须基于真实飞书导出图。

## 渐进式读取

| 阶段或场景                                                                                           | 读取                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 每次画板生成的主流程、产物、失败回退                                                                 | `references/01-pipeline.md`                |
| 选择图型、判断固定图型或自由图解                                                                     | `references/02-chart-taxonomy.md`          |
| 结算样式 token、使用 preview 视觉锚                                                                  | `references/03-style-system.md`            |
| 生成 `plan.json`、校验 Planner schema                                                                | `references/04-planner-contract.md`        |
| 选择 DSL / SVG / Mermaid / PlantUML 路由，或写 DSL                                                   | `references/05-render-dsl.md`              |
| 执行 Gate A/B、VQA、熔断与回退                                                                       | `references/06-quality-gates.md`           |
| `system-architecture` / `matrix-quadrant` / `sketch-architecture`，或用户要求“更高级 / 飞书画板风格” | `references/07-premium-style-contracts.md` |
| 固定图型覆盖不到的产品原型、路线图、桑基、插画、自定义信息图                                         | `references/08-freeform-svg-mode.md`       |
| 对外能力口径、发布判定、覆盖范围                                                                     | `references/COVERAGE_REPORT.md`            |

最常见路径：

- 标准流程图、时序图、状态机、ER、思维导图：读 `01`、`02`、`05`、`06`，优先 Mermaid / PlantUML。
- 架构图、泳道图、组织架构、甘特、里程碑、漏斗、链路图：读 `01`、`02`、`03`、`04`、`05`、`06`。
- 高级系统架构、矩阵象限、手绘风格架构：额外读 `07`。
- 自由图解、产品原型、路线图、桑基、插画：额外读 `08`。

## 资源位置

- 样式和视觉锚：`assets/previews/`、`assets/raw/`、`assets/style-tokens/`
- 画板脚本：`scripts/check_board.sh`、`scripts/render_preview.sh`、`scripts/render_freeform.sh`、`scripts/lint_*.py`
- 可运行样例：`references/examples/`
- 会话产物：默认落到 `data/design-lark-chart/<session>/`，不入 git

`assets/raw/` 只用于审查和抽取风格，禁止直接传给 Planner。Planner 只能使用 `assets/style-tokens/` 和 preview 的视觉描述。

## 交付检查

交付前至少确认：

- 选图型和渲染路由与 `02-chart-taxonomy.md`、`05-render-dsl.md` 一致。
- DSL 路径通过 `scripts/check_board.sh <session>/board.json`，且 `errors=0, warnings=0, issues=[]`。
- SVG 路径通过 `whiteboard-cli -f svg --check`、对应 lint 和 OpenAPI 转换；自由图解必须使用 `scripts/render_freeform.sh <session>`。
- 代码图路径可回读源码，`syntax_type` 与预期一致。
- 飞书写入后基于真实导出图完成 VQA；任一 reviewer 低于 9 或出现 blocker，停止交付并回退修复。
