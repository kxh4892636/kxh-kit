---
name: code-review
description: 审查 PR、branch、commit range 或 WIP diff 时使用；分别检查 Standards 与 Spec。
---

# Code Review

**Standards** 与 **Spec** 独立：符合规范不保证需求正确，实现需求也不保证符合仓库规则。用并行 sub-agents 隔离 context，保留双轴报告。

## 1. 固定范围

解析用户指定的 commit、branch、tag 或 merge-base；未指定时从执行契约或 PR/branch 推断，仍有多个合理基准才询问。

- 已提交 branch：`git diff <fixed-point>...HEAD`。
- staged/unstaged WIP：`git diff <fixed-point>`，包含基准后的提交与工作区变更。

记录 diff 命令及 `git log <fixed-point>..HEAD --oneline`。fixed point 可解析、diff 非空、工作区是否纳入明确时完成。

## 2. 定位来源

- **Spec**：依次采用用户指定路径、匹配 branch/feature 的 `docs/{domain-name}/plans/`、用户确认的其他来源。用户确认不存在时记为 `not available`。
- **Standards**：适用的 `AGENTS.md`、`CONTRIBUTING.md`、编码规范与 `/code-spec`；完整读取 [SMELL-BASELINE.md](SMELL-BASELINE.md) 的判断型 heuristics。

每个变更文件映射到适用 standards，每项可用 spec 要求有引用位置时完成。

## 3. 并行审查

给两个 agent 相同的 diff 命令、commit 列表与范围：

| Agent         | 来源与输出                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Standards** | 读取全部 standards 与 smell baseline；按文件、hunk 报告规则违反，另标 baseline smell，区分硬规则与 judgement；引用代码与规则 |
| **Spec**      | 读取全部 spec；报告缺失/部分实现、scope creep、行为存在但实现不符的要求；引用代码与 spec。Spec 不可用时不派遣                |

每个已派遣 agent 均覆盖完整 diff，每项发现包含可复核位置、规则或 requirement、影响和理由时完成。

## 4. 汇总

在 `## Standards` 与 `## Spec` 分别呈现发现，保留各 agent 的严重度和顺序，各报发现数及最高严重度；不跨轴总排名。

双轴均有明确结论、findings 可追溯时完成；已审查且无发现的轴报告 pass，Spec 不可用时明确说明。
