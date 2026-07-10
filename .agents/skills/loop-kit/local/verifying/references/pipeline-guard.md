# BITS Pipeline Guard

用于守护 BITS 项目流水线，确认目标 PPE/BOE 部署完成，或定位部署前失败原因。

默认目标是 **PPE**。只有用户明确说 BOE，才切换为 BOE。

## 触发场景

- 本轮 agent 执行 `git push`，需要确认 push 触发的最新流水线。
- 用户提供 BITS `develop/detail` URL、`dev-id`、pipeline ID 或 pipeline run ID。
- 用户要求确认发布到 PPE/BOE、等待部署完成后验收，或流水线完成后验收。

## 完成标准

- 已确认守护范围：develop 任务、目标可部署单元、项目流水线和目标环境。
- 已确认守护 run 与目标 commit/branch 对齐；不能用旧 run 结论替代本次 push。
- 守护范围内需要部署的每条项目流水线都已完成 PPE/BOE 部署，或已定位失败节点和责任类型。
- 失败已按停止条件进入代码修复、平台安全重试、待确认或阻塞；没有为了制造新 push 做无意义改动。
- 已记录部署证据：pipeline ID、run ID/runSeq、关键 job、env、SCM 版本、Goofy deployment/channel、完成时间。

## 输入识别

### Develop URL / dev-id

先读取研发任务详情：

```bash
bytedcli --json bits develop get --url '<develop-url>'
bytedcli --json bits develop get --dev-id <dev-id>
```

从返回中提取：

- 主流水线和项目流水线：`pipeline_failures`、`project_list`、`pipeline_id`、`pipeline_run_id`。
- 环境信息：`lanes.ppe`、`ppe_env_name`、`ppe_cn_env_name`。
- 是否需要 PPE：`need_ppe`。

### Pipeline ID

用户直接提供 pipeline ID 时逐个查询：

```bash
bytedcli --json bits pipeline <pipeline-id>
```

提供多个 pipeline ID 时全部纳入守护范围。主流水线用于定位项目流水线和整体阻塞；项目流水线用于判断实际部署完成。

## Push 对齐

如果本轮需要 agent push：

1. 确认当前分支、工作区状态、HEAD commit 和远端同名分支状态。完成标准：知道哪些提交会进入流水线。
2. `git push` 只能推送已提交内容。工作区仍有本次要验证的改动时，先按用户意图提交或 amend。完成标准：目标 HEAD 包含本次要验证的内容。
3. 普通 push 被 non-fast-forward 拒绝时，先说明远端提交和本地 HEAD 差异，得到用户明确授权后才使用 `git push --force-with-lease`。完成标准：未覆盖用户或他人提交。
4. push 成功后，确认最新 run 与本次 push 对齐。完成标准：`runParams.branch` / `source_branch` 是当前分支；`runParams.sdlc_info[*].commit_hash` 或等价字段等于 HEAD；`triggeredAt` 晚于本次 push 时间。

若 pipeline 查询返回多个 runs，只守护与本次 commit 对齐的最新 run。

## 部署完成判定

PPE/BOE 完成以项目流水线中的部署链路成功为准，不要求整条流水线 completed。

每条需要部署的项目流水线满足以下证据时，判定为部署完成：

1. 部署 selector 成功，并命中目标环境分支；或等价证据表明该项目需要并进入目标环境链路。
2. test/PPE/BOE SCM 产物编译节点成功，例如 `SCM compile`，输出包含 SCM repo、版本、commit。
3. 初始化环境节点成功，并能看到目标 env 名。
4. Goofy 小流量部署节点成功。
5. Goofy 输出中尽量记录 `deploymentId`、`channelId`、env 名、SCM 版本、完成时间。

以下节点属于部署后置验证或人工门禁，不阻塞“已部署完成”的判断：

- `测试验收完成？`
- bycaps / 自动化测试平台节点
- QCSS / 质量门禁
- Code Review / Codebase CI
- 合入、发布单可合入性检查

部署完成后返回调用方门禁链的下一个适用运行态阶段，不等待后置人工确认节点。

## 多流水线规则

- 明确要求整个 develop 任务、多个项目或多个端型时，所有指定范围内需要目标环境部署的项目流水线都必须部署完成。
- 如果某条项目流水线没有部署节点，但 `need_ppe=false` 或项目明确不需要 PPE，记录为“不需要 PPE”，不要误判失败。
- 如果用户明确只要求某个端型或某条 pipeline，按用户指定范围守护。

## 轮询

每 30 秒轮询一次，直到命中停止条件。每轮给用户简短状态更新，包含：

- 当前时间。
- pipeline ID、run ID / runSeq。
- run 状态。
- 正在 running、waiting、failed 的关键 job。
- 目标环境相关 job 的最新状态。

停止条件：

1. 所有目标项目流水线部署完成，返回调用方继续版本确认、会话准备或 E2E 等适用阶段。
2. 部署或其之前节点失败，且判断为代码问题，进入修复代码、受影响单元的本地门禁、重新 push 和新流水线守护；部署完成后回到最早受影响的运行态路径。
3. 部署或其之前节点失败，但判断为平台、权限、资源、人工审批或外部服务问题；尝试允许的安全重试，重试成功后只重验受影响路径，不可重试或重试失败时标为待确认或阻塞。
4. 用户明确要求停止。

## 失败定位

失败时先定位原因：

```bash
bytedcli --json bits pipeline <pipeline-id>
bytedcli --json bits job-run <job-run-id> --pipeline-run-id <run-id> --outputs
bytedcli --json bits job-run list-operations --pipeline-run-id <run-id> --space-id <space-id>
```

判定失败类型：

- 代码问题：lint、build、test、类型检查、SCM 编译、产物构建等由代码导致的失败。本地修复代码后，重新 push 会自动触发流水线。
- 非代码问题：鉴权、平台超时、资源不足、权限缺失、Goofy / SCM 临时错误、外部服务异常、人工审批。先尝试安全重试；仍失败则标为待确认或阻塞。

重试前必须确认 job 已真正失败且支持重试。若 retry 接口返回 `status:"running"`、`job operation is not allow`、只允许 `custom/cancel/reschedule/force_skip/fail` 等提示，说明该 job 可能仍在运行或不支持普通 retry；继续轮询或按平台可用操作处理。

## 状态纠偏

不要硬编码 `jobStatus` 数字。不同原子或阶段下，同一个数字可能不是直觉含义。

判断 job 是否真的失败时，至少交叉检查：

- pipeline 是否仍在运行：`runStatus`、`runningCount`、`blockingCount`。
- job 是否已有 `completedAt`。
- job-run 详情里的 `failReason`、`atomErrType`、失败 step、`notification_data.ErrMessage`。
- job 当前允许的 operations，以及操作接口返回的真实提示。
- 用户或 BITS 页面明确展示的状态文本。

如果 `SCM compile` 已有版本号 / versionId、`failReason=null`、`ErrMessage` 为空、`completedAt` 为空，且 pipeline 仍在运行，按“仍在处理中”继续 30 秒轮询。

PPE/BOE 部署完成时间优先使用 Goofy 小流量部署节点的 `completedAt`，不是 SCM compile 完成时间或整条流水线完成时间。
