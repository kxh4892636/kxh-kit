---
status: completed
blocked_by: []
---

# ignore whitespace 重扫修复

## 交付

切换 Ignore Whitespace 的唯一效果 = 以新参数重取当前聚焦仓库的 diff; 仓库列表、勾选状态、聚焦仓库全程不变, 不触发重扫。SSH 远程视图下远程仓库列表不再被本地扫描结果替换。

## 范围

做:

- 解耦 `useRepositoryScan` 启动扫描 effect 与 `onActivateRepository` 回调链: hook 内以 ref 持有最新回调 (既有 `fetchDiffDataRef` 同款模式), 使 `activate/applyScanResult/startScan` 身份稳定, 启动 effect 仅挂载时运行一次。
- 保持既有行为不变: 挂载时启动扫描; `openFolder`/`openRemote` 显式切换上下文时重扫; 勾选切换的 diff 重取 (App.test.tsx:1028 已覆盖)。

不做: 虚拟化、主题相关改动; 扫描器本身的行为调整。

## 直接依赖

(无)

## 验收

- [x] 组件测试: `onActivateRepository` 身份变化后不再发起新扫描 (`scanRepositories` 调用次数不变), 仓库列表与勾选状态保持。
- [x] e2e: 勾选仓库后切换 Ignore Whitespace, 断言仓库列表/勾选状态/聚焦高亮不变、无 scan-progress 出现; diff 以新 ignoreWhitespace 参数重取 (whitespace-only 改动的 c.txt 随勾选出现/消失)。

## 交付物与证据

- 交付物: `apps/diff-viewer/src/client/repo-tree/use-repository-scan.ts` (ref 消费宿主回调, `activate` 身份稳定, 启动 effect 仅挂载运行); `use-repository-scan.test.tsx` 新增身份变化回归测试; `e2e/repo-scan.spec.ts` 新增验收用例。
- 合回: merge `945e7b1` (`ab1a23b` feat + `0d607d4` test 补齐, 3 文件 +120/-15)。
- 验证证据: 组件测试 red (getWorkspace 被调 2 次) → green (11/11); 相关测试 46 过; worktree 门禁 `vp check` ✓ + 全包单测 ✓ + diff-viewer 构建 ✓; e2e repo-scan 3/3; 合回后 main 全量门禁: 853 测试通过 (1 skipped) + 全量构建 ✓ + e2e 11/11。
- code review 结论: Standards 无硬性违规 (3 个判断项均与既有惯例一致, 接受); Spec 发现 e2e 缺勾选状态断言, 已补齐并复验通过。
- 接受偏差/未验证范围: worktree 内 wiki 构建失败为存量现象 (836 个未跟踪本地 wiki 内容文件不进 worktree, main 构建通过); SSH 远程场景未对真实主机走查——修复经同一根因覆盖 (启动 effect 不再重触发), 由本地场景的组件测试与 e2e 证明。

## 上下文

- 根因链: `apps/diff-viewer/src/client/App.tsx:810` (fetchDiffData deps) → `App.tsx:999` (handleActivateRepository deps) → `apps/diff-viewer/src/client/repo-tree/use-repository-scan.ts:133-162` (启动 effect 依赖 startScan)
- [spec.md](spec.md)

## 下一步

已完成
