---
status: completed
---

# Git Diff 卡顿

## 问题

用户选择项目并打开仓库的激活对比后，整个应用持续卡顿。现有行级、chunk 级和文件级虚拟列表虽然让 DOM 数量保持有界，但没有证明渲染器主线程在加载后能够收敛，也没有覆盖按钮响应、滚动帧、long task 或空闲 CPU。

近期虚拟化实现是高优先级回归边界，但当前只有静态风险链，没有实际失败会话的性能 trace，不能把时间相关性直接当成根因。交付需要同时满足：恢复全应用响应性，并保留大对比下的 DOM 有界、文件/行导航与评论契约。

## 方案

先建立健康小对比与真实失败会话的同机基线；原仓库不便复用时，根据 numstat、文件类型及行/chunk 分布构造等形 fixture。使用真实 Electron 和真实 `ResizeObserver` 观测首次稳定、静止期收敛、代表性交互响应、滚动与 long task。

对文件、chunk、行虚拟层分别做开关对照，并在 `65c0deb` 前与 `b6fc7a2` 后的关键边界做 commit 对照，以 profile 识别 causal hotspot。根因成立后只修改被证据命中的管线；优先减少重复滚动观察、同步 commit、每次 commit 的强制布局和不必要的 App 级状态更新。只有证据证明嵌套层级或依赖本身无法满足预算时，才合并、关闭虚拟层或重新评估依赖。

## 已排除的备选

- 整体回滚行级和文件级虚拟化：会重新引入数万行或数百文件对比的已知卡死，且当前没有证据证明所有虚拟层都有问题。
- 直接替换 `@tanstack/react-virtual`：当前只确认存在可疑集成链，没有证明依赖本身是根因。
- 继续以 DOM 数量作为唯一性能信号：现有测试已全部通过，却没有阻止本次全应用响应性回归。
- 仅凭人工感受验收：不能形成可复核的 failing-before/passing-after 证据。

## 实施决策

- 权威入口是本 Plan；固定比较点为 `41855c6ce31e13045ae4112ec0e63de806d02d85`。实现只修改 `apps/diff-viewer` 与本 Plan 的交付记录，保留工作区内其他既有变更；固定点或范围发生实质漂移时重新执行 `/code-delivery` 的准入检查。
- 严格按 Issue 01 → Issue 02 推进。Issue 01 只交付诊断 harness、基线与 causal hotspot，无法形成稳定失败证据时进入 blocked；Issue 02 只实施 Issue 01 证实的最小修复。
- 公共验证 seam 是真实 Electron UI：项目/仓库对比加载完成、页面静止、代表性工具栏交互与主滚动容器；React DOM 组件 seam 只证明 DOM 有界和导航 observable behavior，不以私有 virtualizer 状态作为交付断言。
- 性能预算不预设跨机器绝对值；由同机健康小对比和失败 fixture 在修复前共同锁定，至少覆盖首次稳定、静止期收敛、代表性按钮响应、滚动响应和 long task。
- 诊断开关和详细埋点只存在于测试或开发工具，不进入生产 UI 或长期产品遥测。
- 真实 Electron 性能用例使用真实布局与 `ResizeObserver`；组件测试继续负责 DOM 有界和导航结构，不替代响应性证据。
- 覆盖矩阵包含多小文件、单巨型 chunk、多 hunk 大文件；文本路径覆盖 split 与 unified。Markdown、Notebook、Image 仅在失败输入证明相关时纳入。
- 无法取得原仓库时，失败会话元数据与 trace 必须足以构造等形 fixture；等形 fixture 仍不能复现且 trace 没有稳定热点时，诊断 issue 进入 blocked，不提交猜测性生产修复。
- 修复后的证据链必须包含当前 fixed point 可失败、修复后通过的真实 Electron 响应性用例，以及既有虚拟化、文件/键盘/评论导航和构建回归结果。
- Issue 01 的诊断命令可以报告“当前超预算”并作为成功取证结果，但默认全量 test suite 不得保持红灯；Issue 02 使用同一 harness 证明修复后进入预算。
- 每个 issue 通过实现、测试、验证和审查后独立提交；`/code-delivery` 在实际创建 commit 前再次取得用户授权。

## 工作环境

- Windows 本地 Electron 应用；`apps/diff-viewer` 使用 Electron 43、React 和 `@tanstack/react-virtual@3.14.10`。
- 单元与组件测试使用 Vitest/happy-dom；真实应用验收使用 Playwright 驱动 Electron。
- 已有基线：行/文件虚拟化定向 Vitest `10/10` 通过；100 个一行改动文件的 Electron e2e 通过，但没有性能预算。
- Flow 证据与 quest 审阅记录保存在工作区；生产实现只允许在诊断 issue 给出稳定失败证据和 causal hotspot 后开始。

## 质量门禁

- 格式与静态检查：对本 issue 改动文件执行 `vp check`，并执行 `pnpm --filter @kxh4892636/diff-viewer typecheck`；两者均为零错误。
- 测试：先运行受影响的定向 Vitest/Playwright 用例，再运行 `pnpm --filter @kxh4892636/diff-viewer test`；本 package 完整 suite 全绿。
- 覆盖率：Diff Viewer 未配置固定 coverage scope；对本 issue 修改的全部生产代码使用 Vitest V8 coverage，statements、branches、functions、lines 各自不低于 80%。缺少可复现报告则 blocked。
- 运行态：Issue 01 的真实 Electron 诊断 harness 能稳定区分健康与失败 fixture，并输出可复核测量；Issue 02 在同一 harness 及 split/unified 覆盖矩阵中进入已锁定预算。
- 构建与消费者路径：`pnpm --filter @kxh4892636/diff-viewer build` 和适用的 Electron e2e 通过；Plan 完成前执行完整 `pnpm --filter @kxh4892636/diff-viewer test:e2e` 与根级 `pnpm ready`。
- 领域与 Plan：`node .agents/skills/nano-flow/script/check-domain.mjs .` 通过，issue 状态、交付记录与 spec 派生表一致。
- 审查与结论：`/code-review` 从固定点复查 Spec 与 Standards 两轴；`/verifying` 只在上述适用门禁均有当前 diff 的通过证据时给出 `passed`。

## 范围

- 复现 diff 加载后的全应用响应性回归并记录输入形态。
- 建立可重复的真实 Electron 性能基线与诊断对照。
- 定位 renderer causal hotspot，并做最小的证据驱动修复。
- 补齐三类文本对比形态、split/unified 与既有导航契约的回归证据。

## 非范围

- Diff Viewer 的通用性能重写。
- 未被失败证据命中的主进程 Git、SSH 或其他模块优化。
- 长期生产遥测或面向用户的性能设置。
- 在证据不足时整体回滚或替换虚拟化依赖。
- 默认扩展 Markdown、Notebook、Image 专用 viewer 的虚拟化。

## 待定

- 环境事实：实际失败会话的打开目录、激活仓库、本地/远程、base/target/base mode、文件与行规模、chunk/文件类型分布、split/unified、dev/packaged、卡顿阶段和 renderer profile。由 Issue 01 获取；缺失时以可判定解除条件形成 blocked 结果。
- 具体修复模块：由 Issue 01 的 layer/commit 对照和 profile 决定；在此之前不预设为 virtualizer、Prism、generated-status 或其他管线。

## 上下文

- [quest 审阅记录](../../../../../.flow/quest/2026-08-31-git-diff-卡顿.md)
- [领域语言](../../../CONTEXT.md)
- [ADR-0001 裁剪 fork difit](../../../adr/0001-裁剪-fork-difit.md)
- [上一轮阅读体验优化](../../reference/2026-08-17-阅读体验优化/spec.md)

## Issue

| #   | Issue                                                  | 状态      | 阻塞于 | 下一步         |
| --- | ------------------------------------------------------ | --------- | ------ | -------------- |
| 01  | [锁定响应性基线与致因](01-锁定响应性基线与致因.md)     | completed | —      | /code-delivery |
| 02  | [修复对比视图响应性回归](02-修复对比视图响应性回归.md) | completed | 01     | /code-delivery |
