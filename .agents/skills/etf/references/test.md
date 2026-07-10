# ETF 验收资产

ETF 前端验收使用一条资产链：**需求流程 → 真实路径 → 回归流程**。`/e2e` 定义 Markdown/Gherkin 结构、场景状态、执行方法与证据标准；本 reference 只实例化 ETF 的文档位置和晋升门槛。项目命令与运行态入口见 [verification.md](verification.md)。

## 资产链

1. **需求流程**：编写或更新单次需求的验收资产时，调用 `/e2e` 的“写验收资产”分支，文档保存到仓库根目录 `.scratch/<feature-slug>/e2e/yyyy-mm-dd-xxx.md`。完成标准：本次需求的场景状态、执行记录和临时排障步骤统一维护在该目录，尚未 passed 的内容没有进入模块回归流程。
2. **真实路径**：需求场景达到 ready 后，调用 `/e2e` 的“跑真实路径”分支；运行态、入口和项目命令读取 [verification.md](verification.md)。完成标准：范围内每个 ready 场景都有目标版本上的 passed / failed / blocked 结论与证据，失败重验范围已记录。
3. **回归流程**：场景达到 passed 且可长期复验后，将稳定 ID、入口、前置、动作、断言和证据要求合并到 `apps/etf-dashboard/src/features/<feature-name>/e2e/index.md`。完成标准：模块入口只包含已通过的稳定场景；新流程替换旧流程时，同一能力不存在冲突的验收口径。

## 共同契约

- ETF 的需求流程和回归流程位置覆盖 `/e2e` 的通用目录回退规则；场景结构、状态与证据契约仍以 `/e2e` 为准。
- 同一需求影响多个前端模块时，需求流程使用一份端到端文档；通过后按模块职责把稳定场景合入各自回归流程。
- 跨端需求先按 [development-flow.md](development-flow.md) 确认 proto/API 语义，再执行真实路径并晋升稳定场景。
