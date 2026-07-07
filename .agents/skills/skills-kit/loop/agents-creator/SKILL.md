---
name: agents-creator
description: 创建或更新 AGENTS.md 的推荐技能区块。用户要求生成、刷新、同步、维护 AGENTS.md，或要求根据仓库结构推荐 skills 时使用；覆盖单仓、monorepo 和多仓仓库，只更新推荐技能标记区间。
---

# Agents Creator

创建或更新 `AGENTS.md`，让后续 Agent 在正确仓库范围内看到最相关的 skill 推荐。

## 完成标准

- 已识别当前工作范围内需要维护的所有 `AGENTS.md`。
- 每个目标文件只创建或更新 `<!-- RECOMMEND SKILLS START-->` 到 `<!-- RECOMMEND SKILLS END -->` 区间。
- 每个推荐区块最多包含 5 个当前可访问的 skill。
- 既有标记区块外的内容逐字保留。
- 未处理的目标、跳过原因和无法确认的仓库边界已报告。

## 目标文件

从当前工作目录开始，先确定仓库拓扑，再决定目标 `AGENTS.md`：

1. **单仓仓库**：只维护仓库根目录的 `AGENTS.md`。
2. **monorepo**：维护仓库根目录和各子项目根目录的 `AGENTS.md`。
3. **多仓仓库**：维护当前根目录和各子仓根目录的 `AGENTS.md`；每个子仓继续按单仓、monorepo 或多仓规则递归判断。

使用真实仓库证据判断拓扑，例如 Git 根、嵌套 Git 仓库、workspace 清单、包清单、服务目录、应用目录和已有 `AGENTS.md` 分布。不要把 `node_modules`、构建产物、缓存、vendor、下载目录或插件安装缓存当成子项目。

## Skill 推荐

遍历当前能访问到的所有 skill 候选，包括会话已暴露的 skills、仓库内 `.agents/skills`、已安装插件 skills，以及当前插件可读的 skills。使用 skill 名称、description、正文标题和目标目录上下文判断相关性。

选择规则：

1. 先选与目标目录最直接相关的领域或仓库 skill。
2. 再选该目录常见工作流需要的流程 skill，例如计划、验证、测试、文档、代码规范或插件维护。
3. 只推荐后续 Agent 应主动使用的 skill；不要为了凑满数量添加弱相关 skill。
4. 同一职责只保留一个最具体的 skill。
5. 每个 `AGENTS.md` 最多推荐 5 个 skill。

推荐区块格式为每行一个 skill 名称，不写项目符号、不写理由：

```markdown
<!-- RECOMMEND SKILLS START-->

kxh-awesome
verifying

<!-- RECOMMEND SKILLS END -->
```

可在最终回复中说明推荐理由，但不要把理由写进推荐区块。

## 更新规则

标记区块的创建和替换必须使用本 skill 自带脚本，避免手工替换误伤非标记内容：

```bash
node scripts/update-recommend-skills.mjs <path-to-AGENTS.md> <skill-name> [skill-name...]
```

脚本负责：

1. 如果目标 `AGENTS.md` 不存在，创建只包含推荐区块的最小文件。
2. 如果目标文件已有一个推荐区块，只替换两个标记之间的内容。
3. 如果目标文件没有推荐区块，在文件末尾追加一个推荐区块；保留原文。
4. 如果同一文件存在多个推荐区块，停止处理该文件并报告歧义。
5. 保持目标文件原有换行风格；新文件使用 UTF-8 无 BOM 和 LF。
6. 拒绝处理非 `AGENTS.md` 文件、超过 5 个 skill、重复 skill 和非法 skill 名称。

不要手工修改推荐区块，不要修改 `<!-- GENERALLY RULES START/END -->` 或任何其他非推荐区块。

## 验证

更新后检查每个目标文件：

- 只有推荐区块内容发生变化，或新建文件只包含推荐区块。
- 每个推荐区块的 skill 数量不超过 5。
- 推荐的 skill 都来自当前可访问的 skill 候选。
