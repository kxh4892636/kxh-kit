---
name: git-commit
description: "根据当前仓库变更文件, 总结生成规范化的 commit message，并执行提交操作。当用户要求提交 git 变更时，生成 git message 消息时, 使用该 skill."
---

# git-commit

该 skill 用于自动分析当前仓库的变更文件，结合最近的 commit 历史，生成符合规范的 commit message，并执行提交操作。

## 执行步骤

1. 查看详细的代码变更内容（用于理解变更）：
   ```bash
   git diff
   ```

2. 根据以下信息生成 commit message：
   - 代码变更的具体内容
   - 遵循 commitlint 规范

3. 执行提交操作：
   ```bash
   git add .
   git commit -m "生成的 commit message" -n
   ```

## Commit Message 规范

生成的 commit message 应遵循 commitlint 规范：

```
type: subject
```

### Type 类型（必选其一）

| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档变更 |
| style | 代码格式（不影响代码运行的变动）|
| refactor | 重构（既不是新增功能，也不是修改 bug）|
| perf | 性能优化 |
| test | 增加测试 |
| chore | 构建过程或辅助工具的变动 |
| ci | CI 相关变更 |
| build | 构建系统或外部依赖变更 |
| revert | 回滚 commit |

### 规则

- **type**: 必须为小写
- **subject**: 
  - 简短描述，不超过 13 个字符
  - 描述**变化概述**（做了什么、改了什么），不写具体实现细节（如函数名、文件名、算法等）
  - 中文描述

### 示例

```
feat: 新增登录验证功能
fix: 修复用户数据获取错误
docs: 更新安装指南
refactor: 优化日期格式逻辑逻辑
```
