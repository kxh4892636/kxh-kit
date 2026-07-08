---
name: to-acceptance
description: 使用 Gherkin 创建或更新验收文档；用户要求 to-acceptance、验收文档、验收场景、BDD、Gherkin，或需要为后续前端 E2E 与后端 TDD 建立验收规格时使用。
---

# To Acceptance

基于会话上下文，编写中文验收文档，并使用官方标准 Gherkin 语法作为后续前端 E2E 测试和后端 TDD 测试的规格来源。

验收文档路径为 `docs/spec/{yyyy-mm-dd}-acceptance-{sessionName}.md`，日期使用创建验收文档当天的本地日期。

## 工作流程

1. 确定当前项目根目录、sessionName 和验收文档绝对路径；如果当前目录在 Git 仓库内，以 Git 根目录作为项目根目录。
2. 如果验收文档已存在，先读取现有内容，基于最新会话上下文增量更新；反之则创建验收文档。
3. 将用户目标拆成可独立验收的垂直场景，每个场景使用 Gherkin 描述一个用户或系统可观察行为。
4. 为每个场景分配稳定 ID，格式为 `S1`、`S2`、`S3`；后续更新不得因为插入新场景而重排既有 ID。
5. 对每个场景标注验证归属：`前端 E2E`、`后端 TDD`、`联调验收` 或其组合。
6. 检查每个场景都具备可执行前置条件、动作和断言；如果缺少必要事实，记录为待确认项，而不是臆造测试数据或接口语义。

## sessionName 规则

- 优先使用会话上下文中的 `SESSION_NAME` 环境变量。
- 如果上下文没有 `SESSION_NAME`，根据当前会话目标生成简短、稳定、可作为文件名的 kebab-case `sessionName`，并将其设置为 `SESSION_NAME`。
- `sessionName` 一旦生成并用于验收文档路径，就不能因为后续目标细化、compact/resume、标题变化或重命名偏好而改动。
- 验收文件名前缀日期一旦生成也不能改动；后续跨日期继续同一验收文档时，继续使用原验收文档。

## Gherkin 规则

- 使用官方标准 Gherkin 关键字：`Feature`、`Rule`、`Background`、`Scenario`、`Scenario Outline`、`Examples`、`Given`、`When`、`Then`、`And`、`But`。
- 一个场景只验证一个行为结果；如果需要多个独立断言，拆成多个场景。
- `Given` 只写前置状态和测试数据，`When` 只写触发动作，`Then` 只写可观察结果。
- 前端场景断言用户可观察结果，例如页面文本、控件状态、URL、请求结果、图表状态、错误提示或截图证据。
- 后端场景断言公开接口、命令、事件或持久化契约的可观察结果，不断言私有函数或内部实现细节。
- 跨端场景先写契约语义，再分别标注前端 E2E、后端 TDD 和联调验收的覆盖关系。

## 内容约束

- 验收文档只记录规格、场景和待确认项；实现计划写入 `to-plan` 的计划文档。
- 每个场景必须有稳定 ID，供后续计划文档和测试实现引用。
- 验收场景可以先处于待确认状态，但必须明确缺少什么事实以及由谁确认。
- 禁止把“打开页面不报错”“接口返回成功”作为唯一断言；断言必须指向用户价值或业务契约。

## 验收文档模板

- 必须包含`环境变量`、`验收场景`、`待确认项`。
- 其余章节基于上下文按需添加，不限定具体格式和内容。
- 保留 `<!--  -->` Tag。

<!-- LOOP KIT ACCEPTANCE START -->

# {{ACCEPTANCE_DOCUMENT_TITLE}}

## 环境变量

sessionName、工作目录、Git 仓库、日期、验收文档路径。

## 验收场景

### S1 - {{SCENARIO_NAME}}

- 验证归属：前端 E2E / 后端 TDD / 联调验收
- 状态：draft / confirmed / passed / failed / blocked

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

## 待确认项

| ID  | 问题 | 影响场景 | 状态 |
| --- | ---- | -------- | ---- |
| Q1  |      | S1       | open |

<!-- LOOP KIT ACCEPTANCE END -->
