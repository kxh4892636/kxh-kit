# E2E 验收文档

本 reference 对应 Markdown 形式的 agent-driven acceptance testing：为前端、后端及全栈项目创建和维护 Gherkin 场景、agent 执行步骤、外部断言、证据要求和执行记录。

## 工作流程

1. 定位项目根、受影响的可部署单元、项目既有 E2E 约定和文档路径。完成标准：已确定唯一的 `<e2e-dir>`；路径来源是用户指定、仓库既有约定或下文回退规则之一。
2. 读取既有 E2E 文档并增量更新；缺少文档时创建需求文档。完成标准：既有场景 ID、历史执行记录和结论保持可追溯，过期内容已明确替换关系。
3. 从需求、验收标准、设计、接口契约、现有系统和变更范围提取用户或系统消费者旅程。完成标准：每条旅程都有参与者、入口、前置条件、动作、外部可观察结果和不做范围。
4. 建立覆盖矩阵，选择本次受影响的客户端、服务、角色、平台、环境和数据分支。完成标准：每个纳入或排除的关键维度都有依据，没有用全量遍历替代影响分析。
5. 为每条旅程编写 Gherkin 场景并分配稳定 ID，格式为 `E2E-S1`、`E2E-S2`、`E2E-S3`。完成标准：一个场景只证明一个主要结果，新增场景不改变既有 ID。
6. 将场景展开成 agent 执行步骤。完成标准：步骤包含执行通道、目标版本、入口、身份/数据前置、操作、等待条件、边界断言和证据要求。
7. 准备执行记录；已执行的场景回写时间、环境、版本、执行工具、结果和证据。完成标准：每个场景状态是 draft / ready / passed / failed / blocked 之一；failed 与 blocked 均写明最小失败单元。

## 文档位置

按以下优先级确定 `<e2e-dir>`：

1. 用户指定路径。
2. 仓库规范或同类模块已有的验收目录与命名风格。
3. 单一可部署单元受影响时，使用该单元下的 `tests/e2e/`。
4. 多个可部署单元共同组成一条路径时，使用共同项目根下的 `tests/e2e/`，并在文档中列出参与单元。

验收资产使用 `<e2e-dir>/yyyy-mm-dd-xxx.md`，日期取创建当天本地日期，`xxx` 使用简短 kebab-case 名称。项目已有不同约定时沿用项目约定。

同一需求跨多个客户端或服务时，优先用一份文档表达端到端链路；只有入口、环境或操作路径相互独立时才拆分，并在各文档中互链依赖场景。

## 场景规则

- 使用标准 Gherkin 关键字：`Feature`、`Rule`、`Background`、`Scenario`、`Scenario Outline`、`Examples`、`Given`、`When`、`Then`、`And`、`But`。
- `Given` 写消费者可理解的状态、身份、测试数据和依赖；`When` 写外部动作；`Then` 写系统边界可观察结果。
- 预期值来自需求、契约、设计、业务规则、固定测试数据或用户确认；事实缺失时把场景保持为 draft 并列出待确认项。
- 数据断言明确标识符、时间窗、版本、租户/角色、过滤条件和口径来源；长期断言使用可重建的数据条件，不固化一次性样例值。
- UI 场景优先断言关键文本、状态、数值、交互能力与截图；API 场景断言状态码、协议字段与可查询副作用；异步场景声明轮询条件和超时边界。

## 文档模板

文档必须包含 `测试矩阵` 和 `场景`；其余章节按上下文添加。保留 `<!-- LOOP KIT E2E START -->` 与 `<!-- LOOP KIT E2E END -->` 标签。

<!-- LOOP KIT E2E START -->

# {{E2E_DOCUMENT_TITLE}}

## 测试矩阵

| 场景 ID | 消费者旅程 | 执行通道 | 入口 | 状态 | 最近结果 | 证据 |
| ------- | ---------- | -------- | ---- | ---- | -------- | ---- |
| E2E-S1 | | browser / api / cli | | draft / ready / passed / failed / blocked | | |

## 场景

### E2E-S1 - {{SCENARIO_NAME}}

- 状态：draft / ready / passed / failed / blocked
- 执行通道：browser / api / cli / combined
- 入口：{{URL_ENDPOINT_OR_COMMAND}}
- 环境与版本：{{ENVIRONMENT_AND_VERSION}}
- 身份与数据：{{IDENTITY_AND_DATA}}
- 不做范围：{{OUT_OF_SCOPE}}

```gherkin
Feature: {{FEATURE_NAME}}
  Background:
    Given {{PRECONDITION}}

  Scenario: {{SCENARIO_NAME}}
    Given {{GIVEN}}
    When {{WHEN}}
    Then {{THEN}}
    And {{AND}}
```

#### Agent 执行步骤

1. 确认 `{{ENVIRONMENT_AND_VERSION}}` 承载目标版本。
2. 通过 `{{CHANNEL}}` 进入 `{{ENTRY}}`。
3. 等待 `{{READY_CONDITION}}`。
4. 执行 `{{EXTERNAL_ACTION}}`。
5. 断言 `{{OBSERVABLE_RESULT}}`。
6. 记录 `{{EVIDENCE}}`。

#### 执行记录

| 时间 | 环境与版本 | 执行工具 | 结果 | 证据 | 备注 |
| ---- | ---------- | -------- | ---- | ---- | ---- |
| | | | | | |

<!-- LOOP KIT E2E END -->
