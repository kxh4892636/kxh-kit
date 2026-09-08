---
status: in_progress
blocked_by: []
---

# 版本准备按 tag 参数化

## 交付

版本准备接受发布标签参数，并按 `@deepseek-ai/dsh@<tag>` 解析精确版本；现有自动更新行为保持不变。

## 范围

`src/runtime/versions.ts` 的 `installLatest` 改为 `installTag(directory, launch, tag, npm)`；`src/runtime/instance.ts` 与 `src/testing/virtual-processes.ts` 的 `InstanceIo.latest` 改为 `prepare(directory, launch, tag)`，当前固定传 `latest`。不改用户可见行为，不动调度与状态字段。

## 直接依赖

- 无。

## 验收

- [x] `installTag` 的 npm 请求为 `view @deepseek-ai/dsh@<tag> version --json`，测试断言实际参数含 `@alpha` 等标签。
- [x] 已安装目录命中时直接复用，不重复下载（既有断言保持）。
- [x] `instance.ts` 仍按 13 小时周期自动更新（行为不变），既有测试全部通过。
- [x] `pnpm --filter dsh-keep-alive check`、`test`、`test:coverage` 通过，四指标 ≥80%。

## 上下文

- [执行契约](spec.md)。
- 现有实现：[versions.ts](../../../../../packages/dsh-keep-alive/src/runtime/versions.ts)、[instance.ts](../../../../../packages/dsh-keep-alive/src/runtime/instance.ts)、[virtual-processes.ts](../../../../../packages/dsh-keep-alive/src/testing/virtual-processes.ts)。

## 下一步

/code-delivery。

## 交付记录

交付物：`src/runtime/versions.ts` 的 `installLatest` 改为 `installTag(directory, launch, tag, npm)` 并导出 `DEFAULT_TAG`；`src/runtime/instance.ts` 的 `InstanceIo.latest` 改为 `prepare(directory, launch, tag)`，两处调用固定传 `DEFAULT_TAG`；`src/testing/virtual-processes.ts` 替身同步签名并记录 `preparedTags`；`src/runtime/versions.test.ts` 断言完整 npm 实参（`view`、`@deepseek-ai/dsh@<tag>`、`version`、`--json`）与缓存复用；`src/runtime/update.test.ts` 断言实例层仍跟随默认通道。

验证证据：`pnpm --filter dsh-keep-alive check` 通过（24 文件格式、21 文件无 lint/类型问题）；`test` 9 文件 34 项全通过；`test:coverage` statements 89.36%、branches 84.33%、functions 85.71%、lines 90.75%，四指标 ≥80%；真实 `npm view @deepseek-ai/dsh@alpha version --json` → `"0.1.5-alpha.1"`、`@next` → `"0.1.2-rc.1"`、未知 tag → `E404 No match found for version`。双轴审查无阻塞项，两轴独立指出的建议项（`preparedTags` 未被任何测试消费、`version --json` 实参未断言）已在本 Issue 内修复并重跑受影响测试与全部门禁。提交见 Flow receipt。
