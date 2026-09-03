---
name: simplify
description: 对整个工作区（增量+存量）做简化审查与清理：删减冗余、复用既有实现、收敛复杂度；判断前参考全部领域 ADR 与 Plan。
disable-model-invocation: true
---

# Simplify

Simplify 对整个工作区（或用户指定范围）的**增量与存量**代码做 cleanup pass：删减多于新增，每个候选都由证据支撑。正确性审查属于 `/code-review`；纯粹的性能优化不属于本 skill。

贯穿全程的两个词：

- **证据**：每条发现都给出 file:line、消费方证据与现状成本；说不出代价的「看起来复杂」是 nit，不是候选。
- **删减**：deletion over addition；成功的度量是代码变少，不是变多。

## 1. 确定范围

默认范围是整个工作区的 production 代码；用户可缩窄到业务域、目录或文件。存在未交付的增量（工作区或 branch diff）时，增量与存量纳入同一范围一并评判，不分开处理。记录范围边界与排除项（构建产物、依赖目录、自动生成物）；范围明确时，本步骤完成。

## 2. 读取全部领域约束

按 [`DOMAIN.md`](../../DOMAIN.md) 的定位规则读取范围内触及的**所有**业务域：`CONTEXT-MAP.md` → 每个域的 `docs/{domain}/CONTEXT.md` → 该域**全部** `adr/` → 该域**全部** `plans/`；再读取适用的 `AGENTS.md` 与 `/code-spec`。

- ADR 与 CONTEXT.md 是 **intentional design** 的权威记录：受保护的 seam、契约与术语不作为删减候选；简化主张与 ADR 冲突时，显式列出冲突与重议理由交给用户，不静默绕过。
- `active` 与 `reference` 的 Plan 是方向约束：候选不得砍掉尚未交付的 requirement，不恢复已确认路线明确排除的形态；`archived` 的 Plan 只作为「为何移除或废弃」的历史证据，不作为权威来源。

范围内每个业务域的约束已读取、受保护设计已列出时，本步骤完成。

## 3. 分区并行 survey

把范围按业务域或顶层目录划分分区，派遣并行 subagents：每个 subagent 拿一个分区、第 2 步的完整约束清单和下面三个角度。范围窄（单目录以内）时不分区，直接执行；无 subagent 能力时在本 context 按分区顺序执行同一流程，并在汇报中说明。

- **复用**：与既有实现重复；手写逻辑已有 stdlib、平台原生能力或已安装依赖的等价物。每条发现点名应复用的对象及其位置。
- **删减**：dead code、speculative generality、单一实现抽象、pass-through wrapper、冗余状态、复述代码的注释；同一逻辑的更短形态。
- **深度**：generic path 上为单一调用方打的 special case、叠在旧 workaround 上的 workaround、为绕过真实修复而加的 wrapper。深层修复只标记，不在本 pass 实施。

调查纪律（Chesterton's fence）：标记删除前用 `git blame`、消费方检索与第 2 步约束确认存在理由；理由不明标注 `confidence: low`，靠猜的发现直接丢弃。每个符号的消费方先分类：只有测试或文档消费且行为不承重的是强候选；存在 production 消费方的是 feature decision，不是 cleanup。第一个好候选不停止 survey。

每条发现按统一格式报告：`file:line → 问题 → 现状成本 → 建议 | confidence: high/medium/low | risk: SAFE/CAREFUL/RISKY`。

- **SAFE**：已证实不改变行为（无生产消费方的 dead code、未使用的 import）。
- **CAREFUL**：语义保持（extract、inline、局部重命名、拍平嵌套）。
- **RISKY**：触及公共契约、行为可能变化或命中受保护设计。

每个分区都被三个角度完整覆盖、每条发现具备可复核位置与成本时，本步骤完成。

## 4. 汇总与应用

合并去重；静默丢弃证据不足的发现；冲突按「正确性 > 用户指定 focus > 可读性与复用」裁决，互斥且均可行时选改动更小者并备注另一方案。按 risk tier 应用：

- **SAFE**：直接应用，完成后运行 targeted tests。
- **CAREFUL**：逐文件应用并运行该文件的 targeted tests，破坏即回退该条。
- **RISKY**：只呈现——风险、测试覆盖状态、建议跟进方式（新 issue 或 `/quest-with-domain`），不自动应用。

用户要求只报告时全部呈现、不修改。修改范围限于发现本身及修复所需的最小邻域。所有 SAFE 与 CAREFUL 项已应用或回退、RISKY 项已逐条呈现时，本步骤完成。

## 5. 验证与收口

运行触及文件的 targeted tests 与仓库 linter/typecheck；任一修复破坏验证则单独回退并报告。有意保留的已知上限（全局锁、O(n²) 扫描、naive heuristic）按 `/code-spec` 写说明性注释，点名上限与升级触发条件。

汇报按分区、角度与 tier 分组：已应用的修复、有意跳过及理由、净删除规模；inline 顺序执行时显式说明。验证通过、汇报完整时，本 skill 完成。

## 边界

- 不猎 correctness bug：survey 撞见的真实 bug 单独显著报告，不混入 cleanup 修复。
- 永不简化掉：`/code-spec` 风险边界要求的校验与错误处理、安全措施、用户明确要求的事物。
- 公共契约（导出名、API 路径、配置键）的改动一律 RISKY。
- Apply ≠ rewrite：本 pass 不重构范围之外的模块；深层修复经 RISKY 通道交给用户决定。
