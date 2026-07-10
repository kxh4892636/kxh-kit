# Huatuo Coverage

本 reference 只处理 Huatuo 前端增量覆盖率。口径限定为 `jsCoverage`：读取分支或 MR 的整体覆盖率、文件覆盖率、覆盖插桩行和未覆盖插桩行。

不处理后端覆盖率、影响面分析、调用链分析或页面验收；这些由调用方流程负责。

## 触发场景

- 用户要求查看前端当前分支、MR、未覆盖行、覆盖行或 Huatuo 证据。
- 用户提供 Huatuo `coverage-list` URL。
- 用户提供 `projectId`、`repo`、`branch`、`fromBranch`、`mrId` 或 `filePath`。

## 输入识别

接受任意一种输入：

- Huatuo `coverage-list` URL。
- 当前前端仓库分支。
- `projectId + branch`。
- `repo + fromBranch + branch`。
- `projectId + mrId`。
- `repo + mrId`。
- `repo + mrId + filePath`。
- 当前已打开的 Huatuo 覆盖率页面。

URL query 中直接解析这些字段：

- `projectId`
- `repo`
- `mrId`
- `toBranch` 或 `branch`
- `fromBranch`
- `filePath`
- `devicePlatform`
- `deviceModel`
- `appId`
- `appVersion`

缺少 device/app filter 时使用空字符串。

## 执行方式

优先使用当前 skill 自带脚本。若从仓库根目录执行，路径为：

```bash
node .agents/skills/loop-kit/local/verifying/scripts/huatuo_coverage_report.mjs
```

常用参数：

```bash
node .agents/skills/loop-kit/local/verifying/scripts/huatuo_coverage_report.mjs --project-id <id> --branch feature/example
node .agents/skills/loop-kit/local/verifying/scripts/huatuo_coverage_report.mjs --repo <repo-path> --mr-id <id>
node .agents/skills/loop-kit/local/verifying/scripts/huatuo_coverage_report.mjs --repo <repo-path> --mr-id <id> --json
```

Branch mode 必须通过 `--project-id`、URL query 或 `HUATUO_PROJECT_ID` 提供项目 ID；通用脚本不内置仓库默认值。

单文件：

```bash
node .agents/skills/loop-kit/local/verifying/scripts/huatuo_coverage_report.mjs \
  --repo <repo-path> \
  --mr-id <id> \
  --file-path src/example.ts
```

如果脚本输出不足以判断 endpoint、字段或认证问题，读取 [huatuo-coverage-api.md](huatuo-coverage-api.md)。

## 工作流

1. 解析 `repo`、`mrId`、`branch`、`fromBranch`、`projectId`、`filePath` 和可选 device/app filters。完成标准：已选择 MR mode 或 branch mode，缺失字段已补齐或标为待确认。
2. MR mode：读取 MR 文件覆盖率；需要行级证据时读取目标文件 code。完成标准：整体覆盖率、文件覆盖率和目标文件行级分类已得到。
3. Branch mode：读取 branch list 解析 `fromBranch`；再读取 branch files；需要行级证据时读取目标文件 code。完成标准：比较基线、整体覆盖率、文件覆盖率和目标文件行级分类已得到。
4. 若用户指定 `filePath`，只处理该文件；否则优先报告 `insertLines > coverLines` 的文件。完成标准：未覆盖项按影响范围排序，不输出无关文件堆栈。
5. 使用 API boolean 字段分类行，不使用页面颜色或 DOM class。完成标准：覆盖率口径可复现。

## 行级口径

```js
covered = line.isInsertLine && line.isCoverageLine && !line.isIgnoreLine;
uncovered = line.isInsertLine && !line.isCoverageLine && !line.isIgnoreLine;
addedOnly =
  line.isAddLine &&
  !line.isInsertLine &&
  !line.isCoverageLine &&
  !line.isIgnoreLine;
ignored = line.isIgnoreLine;
```

只有 `isInsertLine` 计入覆盖率分母；不要把每个 added line 都当成需要覆盖。

## 输出

结论前置，至少包含：

- 查询模式：MR 或 branch。
- 查询参数：`repo`、`mrId` 或 `branch/fromBranch`、可选 filters、可选 `filePath`。
- 整体覆盖率：`insertLines`、`coverLines`、`coverRatio`。
- 文件覆盖率：路径、`insertLines`、`coverLines`、`coverRatio`。
- 行级证据：覆盖插桩行、未覆盖插桩行、ignored 行。
- 不确定项：认证失败、API 无记录、字段缺失或用户输入不足。
