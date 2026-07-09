# 体验分 E2E 文档撰写

本 reference 负责创建和维护体验分功能模块的 Markdown 验收资产：Gherkin 场景、agent 浏览器步骤、断言和执行记录位置。

## 工作流程

1. 定位当前项目根目录、受影响端型、功能模块、文档标识和 E2E 文档绝对路径。完成标准：路径落在受影响的 `apps/experience-score-*/src/v10/features/<feature>/test/` 目录，或沿用用户指定路径。
2. 读取既有 E2E 文档并增量更新；没有文档时创建新文档。完成标准：既有场景 ID、执行记录和结论未被重排或覆盖。
3. 从用户目标、验收文档、设计稿、现有页面和可访问路由提取用户旅程。完成标准：每条旅程都有目标用户、入口、前置条件、用户动作、可观察结果和不做范围。
4. 为每条旅程编写 Gherkin 场景并分配稳定 ID，格式为 `E2E-S1`、`E2E-S2`、`E2E-S3`。完成标准：每个场景只验证一个用户可观察结果，插入新场景不改变既有 ID。
5. 将每个 Gherkin 场景展开成 agent 浏览器步骤。完成标准：步骤包含 URL、账号/数据前置、操作、等待条件、UI 断言、接口断言和证据要求。
6. 准备执行记录区域；如果已执行场景，回写浏览器、环境、时间、结果和证据。完成标准：每个场景状态都是 draft / ready / passed / failed / blocked 之一；blocked 场景记录缺失输入。

## 路径与范围

- 体验分 E2E 文档保存到 `apps/experience-score-*/src/v10/features/<feature>/test/`。
- 根据修改文件、需求描述、路由和页面区域定位 `<feature>`；H5 文件落到 `apps/experience-score-h5`，PC 文件落到 `apps/experience-score-pc`。
- 每个模块的 `test/index.md` 维护该模块最新稳定回归流程。
- 每个需求单独创建 `test/yyyy-mm-dd-xxx.md`，日期使用创建文档当天本地日期，`xxx` 使用简短可读的 kebab-case 需求名。
- 同一需求横跨 H5、PC 或共享 Kit 逻辑时，在受影响的 H5/PC `features/<feature>/test/` 下维护需求文档，并在文档中列出共享 Kit 影响范围；只有各端验收路径明显不同，才分别创建对应端的需求文档。
- PC 需求默认同时覆盖抖店和罗盘；H5 需求只覆盖抖店。按需求选择命中的页面路由，不要求每次全量遍历。
- 如果用户指定路径或项目已有 E2E 文档目录，优先沿用该路径和命名风格。
- 如果无法确定对应功能模块，先从变更文件和体验分路由定位；仍无法确定时询问用户。

## 场景规则

- 使用官方标准 Gherkin 关键字：`Feature`、`Rule`、`Background`、`Scenario`、`Scenario Outline`、`Examples`、`Given`、`When`、`Then`、`And`、`But`。
- `Given` 只写用户可理解的前置状态、测试数据和权限；`When` 只写用户动作；`Then` 只写页面可观察结果。
- 一个场景只验证一个行为结果；独立结果拆成多个场景。
- 预期值来自需求、验收文档、设计稿、业务规则、固定测试数据或用户确认；缺少事实时写入待确认项。
- 体验分数据类断言必须明确数据口径，例如 `shopId`、score type、`doneDate`、TCC、接口返回样例或固定测试商家。
- 图表、权益、分层说明、诊断建议等复杂 UI，优先断言关键文本、状态、数值、可点击能力和截图证据。

## 验收路由

### PC

代码路由位置：`repos/govern-public-fe-mono/apps/experience-score-pc/src/routes.tsx`。

| 平台 | URL                                                                   |
| ---- | --------------------------------------------------------------------- |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-score`                 |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-category`              |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-score/detail`          |
| 抖店 | `https://fxg.jinritemai.com/ffa/eco/experience-score/rights`          |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-score`        |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-category`     |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-score/detail` |
| 罗盘 | `https://compass.jinritemai.com/shop/ecology/experience-score/rights` |

### H5

代码页面位置：`repos/govern-public-fe-mono/apps/experience-score-h5/pia.config.ts`；路由 base：`/govern/h5/ecology`。

| 平台 | URL                                                                            |
| ---- | ------------------------------------------------------------------------------ |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score`                |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-rules`          |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-rights`         |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-detail`         |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-grow-detail`    |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-grow-stage`     |
| 抖店 | `https://fxg.jinritemai.com/govern/h5/ecology/experience-score-content-center` |

## `index.md` 合入规则

`test/index.md` 只维护模块最新稳定回归流程，不承载需求过程记录。

- 合入前先在需求文档中完成真实浏览器验收。完成标准：场景状态为 passed，执行记录包含环境、浏览器、时间、关键 UI/接口断言和证据。
- 只合入可长期复验的用户路径。完成标准：步骤不依赖一次性调试动作、临时账号状态、偶发数据或历史样例 ID。
- 合入时保留稳定场景 ID、入口、前置数据口径、用户动作、等待条件、UI 断言、接口断言和证据要求。完成标准：执行者只读 `index.md` 就能复现该回归路径。
- draft / failed / blocked / 待确认 / 一次性排障步骤留在需求文档，不写入 `index.md`。
- 如果需求替换旧流程，同步删除或改写 `index.md` 中过期回归步骤。完成标准：同一模块不存在互相冲突的入口、前置条件或验收口径。
- H5、PC 或共享 Kit 都受影响时，`index.md` 只合入对应端真实页面证明过的路径；共享 Kit 影响通过受影响的 H5/PC 回归路径表达。

## 文档模板

- 必须包含 `测试矩阵`、`场景`。
- 其余章节基于上下文按需添加，不限定具体格式和内容。
- 保留 `<!-- LOOP KIT E2E START -->` 和 `<!-- LOOP KIT E2E END -->` Tag。

<!-- LOOP KIT E2E START -->

# {{E2E_DOCUMENT_TITLE}}

## 测试矩阵

| 场景 ID | 用户旅程 | 入口 | 状态                                      | 最近结果 | 证据 |
| ------- | -------- | ---- | ----------------------------------------- | -------- | ---- |
| E2E-S1  |          |      | draft / ready / passed / failed / blocked |          |      |

## 场景

### E2E-S1 - {{SCENARIO_NAME}}

- 状态：draft / ready / passed / failed / blocked
- 入口：{{URL_OR_ROUTE}}
- 前置数据：{{DATA_OR_ACCOUNT}}
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

#### Agent 浏览器步骤

1. 打开 `{{URL}}`。
2. 等待 `{{VISIBLE_READY_STATE}}`。
3. {{USER_ACTION}}
4. 断言 `{{OBSERVABLE_RESULT}}`。
5. 记录证据：{{EVIDENCE}}。

#### 执行记录

| 时间 | 环境 | 浏览器 | 结果 | 证据 | 备注 |
| ---- | ---- | ------ | ---- | ---- | ---- |
|      |      |        |      |      |      |

<!-- LOOP KIT E2E END -->
