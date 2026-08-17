---
status: completed
blocked_by: ["03"]
---

# 多仓库文件树与同视图 diff

## 交付

勾选多个仓库后，单一文件树顶层按仓库分组展示各仓库激活对比的全部变更文件，点击文件渲染对应 diff——多仓库在同一视图一起 diff。

## 范围

做：

- 每仓库独立激活对比的状态管理。
- fork 的 FileList 改造为多仓库文件树：顶层按仓库分组，聚合各仓库激活对比的变更文件。
- diff 数据请求按仓库路由到对应 GitDiffParser 实例。

不做：跨仓库同名文件对比。

## 直接依赖

- 03：消费其仓库列表数据结构与扫描产物，文件树以其为数据源。

## 验收

- [x] 勾选 ≥2 个仓库并各自设置对比，文件树顶层按仓库分组展示全部变更文件，点击任一文件渲染其 diff。

## 交付物与证据

- 交付物：`src/main/repo-sessions.ts` 按仓库 keyed 会话管理（GitDiffParser + 激活对比 + 评论基线 + generated 缓存，activate 幂等）；`api-router.ts` 全端点 `?repo=` 路由 + `withSession` 守卫收拢；fork FileList 改造为 `groups` 多仓库分组文件树（拆出 `FileTreeGroup.tsx`，fork 改动 #5）；`use-repository-scan` 状态机上提 App + `use-multi-repo-diff` hook 收拢多仓库状态；评论 store 按仓库隔离。
- 合回 commit：`02e7931`（主体）、`9dc04d4`（审查修复），merge commit `e8adf4b`。
- 验证证据：单测/组件测试 60 文件 698 passed + 1 skipped；e2e 6/6 passed（`multi-repo-view.spec.ts` 即验收的自动化等价证据：勾选 2 仓各自设对比、分组展示、点击跨仓文件渲染其 diff 且对比恢复）；`pnpm ready` worktree 复跑 exit 0、合回后 main 复验 exit 0。
- code review：Standards 轴 1 项硬性违规（FileList 组件 409>389 行）+ 5 项判断项全部在 `9dc04d4` 修复；Spec 轴无缺失，4 项声称取舍核实属实可接受。
- 接受偏差（内容冻结前记录）：
  - 取消勾选最后一个仓库 → 保持当前 diff 视图、文件树平铺回退展示聚焦仓库文件（不清空）；
  - 启动双取（boot fetch + 根仓库激活再取，多一次 git diff 开销）；
  - 非聚焦分组不渲染 reviewed/评论徽标、非聚焦仓库不做实时刷新（聚焦切换时重取）；
  - `FileTreeGroup` 组件函数约 230 行超「单函数 ≤144 行」——fork 存量组件普遍不满足该规则，再拆会撞「props ≤8」规则，接受；
  - `useRepositoryScan` mount effect 依赖 `startScan` 的存量小坑（切换 ignoreWhitespace 触发重扫）未修，留待后续。

## 上下文

- [spec.md](spec.md)

## 下一步

/implement
