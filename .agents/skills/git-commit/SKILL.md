---
name: git-commit
description: "根据当前仓库变更文件，总结生成规范化 commit message，并按改动内容创建 0 个、1 个或多个 commit。当用户要求提交 git 变更、生成 git message、拆分提交或提交当前改动时，使用该 skill."
---

# git-commit

该 skill 用于自动分析当前仓库的变更文件，结合最近的 commit 历史，将改动按语义分组，生成符合规范的 commit message，并执行提交操作。

一次 skill 调用代表一次提交会话，不等于只能创建一个 commit。提交数量由当前改动决定：

- 没有可提交改动：创建 0 个 commit，并说明原因。
- 所有改动属于同一个明确主题：创建 1 个 commit。
- 改动包含多个相互独立的主题：创建多个 commit，每个 commit 只包含一个清晰主题。

不要为了满足“一次调用”而强行合并无关改动，也不要为了制造多个 commit 而拆分同一主题。

## 执行步骤

1. 查看仓库状态、最近提交风格和详细变更（用于理解改动范围）：

   ```bash
   git status --short
   git log --oneline -n 10
   git diff
   git diff --cached
   ```

2. 判断提交分组：

   - 按功能、修复、文档、测试、配置、重构等语义边界分组。
   - 同一文件内若包含多个独立主题，优先使用交互式 staging 或更小路径范围拆分。
   - 如果拆分同一文件会带来高风险或上下文不可分，保持在同一个 commit 中，并在最终说明中指出原因。
   - 遇到不确定是否属于用户意图的改动，先不要提交该部分；必要时向用户确认。

3. 对每个分组分别生成 commit message：

   - 基于该分组的具体变更内容生成。
   - 遵循 commitlint 规范。
   - 每个 commit message 只描述该 commit 包含的主题。

4. 按分组逐个 stage 和 commit：

   ```bash
   git add <本次分组的文件>
   git add -p <需要按 hunk 拆分的文件>
   git commit -m "生成的 commit message" -n
   ```

   不要直接使用 `git add .` 覆盖所有改动，除非已经确认所有当前改动都属于同一个 commit。

5. 每个 commit 完成后重新查看状态，继续处理剩余分组：

   ```bash
   git status --short
   ```

6. 最终汇报：

   - 创建了几个 commit。
   - 每个 commit 的 hash 和 message。
   - 是否还有未提交改动，以及为什么保留。

## Commit Message 规范

生成的 commit message 应遵循 commitlint 规范：

```text
type: subject
```

### Type 类型（必选其一）

| 类型     | 说明                                   |
| -------- | -------------------------------------- |
| feat     | 新功能                                 |
| fix      | 修复 bug                               |
| docs     | 文档变更                               |
| style    | 代码格式（不影响代码运行的变动）       |
| refactor | 重构（既不是新增功能，也不是修改 bug） |
| perf     | 性能优化                               |
| test     | 增加测试                               |
| chore    | 构建过程或辅助工具的变动               |
| ci       | CI 相关变更                            |
| build    | 构建系统或外部依赖变更                 |
| revert   | 回滚 commit                            |

### 规则

- **type**: 必须为小写
- **subject**:
  - 简短描述，不超过 13 个字符
  - 中文描述

### 示例

```text
feat: 新增登录验证功能
fix: 修复用户数据获取错误
docs: 更新安装指南
refactor: 优化日期格式逻辑
```
