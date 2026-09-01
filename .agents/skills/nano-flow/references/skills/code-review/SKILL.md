---
name: code-review
description: 双轴审查 fixed point 以来的 branch 或工作区 diff；当用户要求 review PR、branch、commit range 或 WIP 变更时使用。
---

# Code Review

**Standards** 与 **Spec** 是独立轴：代码可以忠实实现错误规范，也可以正确实现需求却违反仓库规则。使用两个并行 sub-agents 隔离 context，最后保持双轴报告。

## 1. 固定审查范围

解析用户给出的 commit、branch、tag 或 merge-base。用户未指定时，从执行契约或 PR/branch 上下文推断；仍有多个合理基准才询问。

- 只审查已提交 branch：使用 `git diff <fixed-point>...HEAD`。
- 审查 staged 或 unstaged WIP：使用 `git diff <fixed-point>`，使 HEAD 后提交和当前工作区都进入范围。

记录可复现的 diff 命令与 `git log <fixed-point>..HEAD --oneline`。fixed point 可解析、diff 非空、工作区变更是否纳入已明确时，本步骤完成。

## 2. 定位两轴来源

Spec 按顺序取自：用户指定路径；与 branch/feature 匹配的 `docs/{domain-name}/plans/`；用户确认的其他来源。用户确认不存在 spec 时，Spec 轴记为 `not available`。

Standards 包括仓库中实际适用于 diff 的 `AGENTS.md`、`CONTRIBUTING.md`、编码规范与 `/code-spec`。完整读取 [`SMELL-BASELINE.md`](SMELL-BASELINE.md)；它只提供判断型 heuristics。

每个变更文件都映射到适用 standards，每项 spec 要求都有可引用位置时，本步骤完成。

## 3. 并行审查

同时派遣两个 sub-agents，并给每个 agent 相同的 diff 命令、commit 列表和审查范围：

- **Standards agent**：读取全部 standards 来源与 `SMELL-BASELINE.md`。按文件和 hunk 报告违反的仓库规则，并分别标注 baseline smell；每项引用代码位置与规则来源，区分硬规则和 judgement，不超过 400 字。
- **Spec agent**：读取全部 spec 来源。报告缺失或部分实现的 requirement、scope creep、以及行为存在但实现不符合要求的项；每项同时引用代码与 spec 位置，不超过 400 字。没有 spec 时不派遣该 agent。

两个 agent 都覆盖完整 diff，且每项发现具备可复核位置、违反的规则或 requirement、影响与理由时，本步骤完成。

## 4. 汇总

在 `## Standards` 与 `## Spec` 下分别呈现发现，保持各 agent 的严重度与顺序；Spec 不可用时明确说明。最后分别给出每轴发现数量与该轴最高严重度问题，不跨轴生成总排名。

双轴均有明确结论、每项 finding 可追溯、无发现的轴显式报告 pass 时，本 review 完成。
