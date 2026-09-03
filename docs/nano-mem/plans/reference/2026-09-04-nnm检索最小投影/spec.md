---
status: completed
---

# NNM 检索最小投影

## 问题

`nnm search` 当前为每条活跃记忆返回完整维护 DTO，包括恒定的 `status: active`、`forgottenReason: null` 以及默认检索不需要的来源和时间字段。这增加 agent 读取稳定 JSON 时的上下文成本，也让 search 与其“找到内容并准确执行后续 `use`”的职责不匹配。

目标是让默认检索只返回采用闭环所需的信息，并允许调用方通过额外参数按需取得封闭集合内的来源与时间元数据；`get/list` 等维护读取保持完整 DTO。

## 方案

在 command handler 层建立 search 专用的检索投影，不改变 repository 返回的完整记忆、FTS 候选、排序、检索计数或生命周期。默认投影使用 `scope` 作为判别字段：project 记忆携带 `project`，global 记忆省略 `project`。可重复的 `--include` 只向默认投影追加经过校验的元数据。

```text
MemoryRecord
  ├── maintenance DTO -> add/get/list/update/use/forget/restore/delete
  └── search projection
        default: id, content, scope, project?
        include: source | createdAt | updatedAt
```

包内 skill 与仓库已安装的受管 skill 同步采用新契约：普通检索不请求元数据；任务需要来源追溯时显式传入 `--include source`。README、help 与真实 CLI 示例公开同一参数语法。

## 已排除的备选

- search 继续返回完整 DTO：保留无信息量字段，不能实现默认最小输出。
- `--metadata` 一次返回全部元数据：调用方不能只请求所需字段。
- `--fields` 自定义完整投影：允许移除采用闭环字段并扩大公共协议。
- global 返回 `project: null`：`scope: global` 已足以形成 selector，null 没有信息量。
- 同时支持逗号列表、大小写别名或忽略未知字段：增加解析分支，并会掩盖 agent 参数错误。

## 实施决策

- 默认成功 envelope 保持 `{ "ok": true, "data": { "memories": [...] } }`，只收窄 `memories` 单项投影。
- 默认字段为 `id`、`content`、`scope`；仅 `scope=project` 的结果包含 `project`。
- `--include <field>` 每次只接收一个大小写敏感字段，可重复；允许值封闭为 `source`、`createdAt`、`updatedAt`，不支持逗号列表。
- 重复 include 幂等去重；未知值以 `CliErrorKind.usage` 返回 `INVALID_INCLUDE`，沿用现有错误 envelope 和退出码 2。
- 指定 `--include source` 时，无来源的结果固定返回 `source: null`，不得省略字段或过滤记忆。
- CLI 按 `id, content, scope, project, source, createdAt, updatedAt` 的适用子序列确定性构造对象，可选字段顺序不受参数顺序影响；JSON 消费者仍须按字段名读取，不得把对象成员顺序当作语义。
- `status` 与 `forgottenReason` 不属于 search 的可选字段；search 只返回活跃记忆，两者没有信息增益。
- project 结果通过 `nnm use <id> --scope project --project "<project>"` 重放 selector；global 结果使用 `nnm use <id> --scope global`。project 作为单个 argv 传递，经过 shell 时使用正常引用。
- `get/list` 及写命令继续返回现有完整 DTO；数据库 schema、repository search 接口和检索事件语义不变。
- `.agents/skills/nano-mem/SKILL.md` 与 `packages/nano-mem/skills/nano-mem/SKILL.md` 必须同步，随后按现有构建流程刷新受管 skill manifest。

## 工作环境

- 工作区使用 pnpm `11.22.0`、Vite Plus 与 TypeScript；Node engine 为 `>=22.12.0`，当前包版本为 `@kxh4892636/nano-mem@0.0.1`。
- 主要实现位于 `packages/nano-mem/src/memory/memory-commands.ts`，现有 CLI 测试位于 `packages/nano-mem/src/memory/memory-commands.spec.ts`。
- 包级验证入口为 `pnpm --filter @kxh4892636/nano-mem check`、`test`、`build`；测试使用临时数据库和注入运行时，不接触用户真实记忆库。
- 实现在独立 worktree `C:/Users/kxh/kxh-awesome/projects/kxh-kit-nnm-search-projection` 的分支 `worktree/nnm-search-projection-20260904` 中进行，固定比较点为 `main@cff04d5bbdc30bae60ca6fef733dec6e82d8e6a2`。
- 主工作区当前存在其他 agent 的 Pi 文档变更；实施与验证不得修改、清理或纳入这些文件。

## 执行契约

- 将当前已确认的 Nano Mem 领域与 Plan 文件安全复制到独立 worktree；确认副本后，只清理主工作区中本轮产生的重复 Nano Mem 未提交文件，为最终合入保留干净路径。
- 在 worktree 中串行完成 Issue 01 的实现、测试、验证与双轴审查，并为完整交付创建 commit。
- 所有门禁通过后，以 fast-forward 方式将 feature branch 合入本地主分支；不 push 远端。
- 若主分支推进或 Nano Mem 相关路径出现基线漂移，则暂停合入、重新同步并复核受影响门禁，不覆盖任何其他 agent 的工作区变更。

## 范围

- 建立 search 专用类型与投影函数，解析、校验并应用可重复 `--include`。
- 覆盖 project/global 默认 shape、各可选字段、组合/重复 include、缺失 source、非法字段和确定性输出。
- 证明 maintenance DTO、搜索命中/排序/计数与生命周期行为不变。
- 同步两份 `nano-mem` skill、CLI help、README 与受管 skill manifest。

## 非范围

- 改变 `get/list` 或写命令的 DTO。
- 改变 SQLite schema、FTS tokenizer、候选、排序、limit、检索事件或 FSRS 生命周期。
- 新增任意 metadata、filter DSL、`--fields`、`--metadata`、逗号列表或大小写别名。
- 将 JSON 对象成员顺序定义为消费者可依赖的业务语义。

## 待定

无。默认字段、可选字段、参数语法、错误契约、selector 重放和兼容边界均已确认。

## 上下文

- [Nano Mem 领域语言](../../../CONTEXT.md)
- [ADR 0005：检索采用最小投影与按需元数据](../../../adr/0005-检索采用最小投影与按需元数据.md)
- [原 Agent 记忆架构](../../active/2026-09-01-agent记忆架构/spec.md)
- [Quest 审阅记录](../../../../../.flow/quest/2026-09-04-nnm检索最小投影.md)

## Issue

| #   | Issue                                                              | 状态      | 阻塞于 | 下一步         |
| --- | ------------------------------------------------------------------ | --------- | ------ | -------------- |
| 01  | [交付检索最小投影与按需元数据](01-交付检索最小投影与按需元数据.md) | completed | —      | /code-delivery |
