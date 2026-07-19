# E2E 验收文档

本 reference 仅在创建或更新 Markdown 形式的 agent-driven 验收资产时读取。验收场景使用 Gherkin 语言；文档结构与承载字段由用户输入、仓库既有约定和任务上下文决定。

## 文档位置

按以下优先级确定 `<e2e-dir>`：

1. 用户指定路径。
2. 仓库规范或同类模块已有的验收目录与命名风格。
3. 仓库根目录下的 `tests/e2e/`。

没有用户或仓库既有命名时，验收资产使用 `<e2e-dir>/yyyy-mm-dd-xxx.md`，日期取创建当天本地日期，`xxx` 使用简短 kebab-case 名称。

## 文档模板

使用 `<!-- LOOP KIT E2E START -->` 与 `<!-- LOOP KIT E2E END -->` 标签。
Gherkin 验收场景分配稳定 ID，格式为 `S1`

<!-- LOOP KIT E2E START -->

Gherkin 编写的验收文档

<!-- LOOP KIT E2E END -->
