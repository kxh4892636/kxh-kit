# Auxo 到 Aurora 迁移助手

当用户希望把使用 `@ecom/auxo` 的项目升级到 `@ecom/aurora` 时，读取本文件。

## 目标

用 Aurora CLI 驱动迁移流程，不手写或猜测替换规则。Auxo 到 Aurora 不是简单改包名，而是跨 antd 大版本、组件 API、样式机制、日期库和类型行为的系统迁移。

## 工作流

1. 确认目标项目目录。
   - 用户没有指定路径时，默认使用当前 workspace 根目录。
   - 如果用户只是要求解释、评估或制定计划，不要修改文件。

2. 建立迁移基线，并**落盘一份完整的项目级迁移报告**（不要只在对话里贴截断输出）：

   ```bash
   aurora_cli usage <projectDir>
   # 人读完整报告：--format markdown 出报告文档，--detail 取消默认截断（列全部命中文件）
   aurora_cli migrate auxo <projectDir> --format markdown --detail > aurora-migration-report.md
   # 结构化全量数据：供脚本 / 平台消费
   aurora_cli migrate auxo <projectDir> --format json > aurora-migration-report.json
   ```

   - **默认 `migrate auxo <projectDir>` 的终端输出是截断的**（每类只列前若干条，末尾提示"还有 N 个，使用 --detail 查看全部"），只适合快速浏览，**不能当成交付物**。完整报告必须加 `--detail` 并落盘。
   - 落盘后，在 `aurora-migration-report.md` **开头补一段简短「如何使用本报告」说明**（模板见下方「报告交付物」一节），让用户一眼看懂这份文件是什么、怎么读、下一步做什么。
   - 向用户汇报时给出这两个文件的**实际路径**，而不是只在对话里口头总结。

3. 在写入前预览确定性改动：

   ```bash
   aurora_cli migrate auxo --codemod <projectDir> --diff
   ```

   不要一上来运行 `--write`。先阅读 dry-run 或 diff，再决定是否进入写入阶段。

4. 只有在用户明确要求迁移，或接受预览结果后，才应用 codemod：

   ```bash
   aurora_cli migrate auxo --codemod <projectDir> --write
   ```

   写入后**重新生成一份报告**，与第 2 步的基线对比迁移进度（写前=基线、写后=剩余状态）：

   ```bash
   aurora_cli migrate auxo <projectDir> --format markdown --detail > aurora-migration-report.after.md
   ```

5. 对非确定性迁移项生成 Agent prompt：

   ```bash
   aurora_cli migrate auxo --prompt <projectDir> > aurora-migration-prompt.md
   ```

   - **注意参数顺序**：`--prompt` 自带目录值，必须写成 `--prompt <projectDir>`；写成 `<projectDir> --prompt` 会报 `option '--prompt <dir>' argument missing`，且配合重定向会清空已有的 prompt 文件。
   - **`aurora-migration-prompt.md` 不是给人读的迁移报告**，它是"喂给 AI 处理非确定性项的指令"。给人读的完整报告是第 2 步落盘的 `aurora-migration-report.md`，两者是不同交付物，不要混淆。

6. 每一批迁移后都要验证：

   ```bash
   aurora_cli check <projectDir> --only migration
   aurora_cli check <projectDir> --only deprecated
   ```

   如果项目提供了 typecheck、test、build 或关键页面回归方式，也要尽量运行并记录结果。

## 安全边界

以 Aurora CLI 输出为准，不自行编造迁移映射。

codemod 只适合处理确定性较强的改动，例如包名和 import 迁移、Auxo 样式入口移除、locale 路径、稳定类型导入、简单 JSX prop 重命名，以及简单的 `classNames` / `styles` 对象迁移。

除非 CLI 明确支持，否则以下内容应作为 Prompt 或 Manual 项继续处理：

- `Icon type="..."` to `@ecom/aurora-icons`
- `@ecom/auxo-pro-form`、`@ecom/auxo-data-card`、rich text editor packages
- `Cascader.Transfer`、`TransferRef` 和 Auxo private extensions
- Moment to Dayjs value、locale 和 plugin behavior
- upload、crop、preview 和 file type chains
- existing `classNames`、`styles`、`tooltip`、`size` 或其他 object merges
- internal or deep-path leaked types

## 报告交付物

迁移评估 / 出报告类任务，必须产出**两类交付物**，缺一不可：

1. **持久化的完整项目级报告文件**（给人读 + 给机器读）：
   - `aurora-migration-report.md`：`--format markdown --detail` 生成，含全部命中文件，不截断。
   - `aurora-migration-report.json`：`--format json` 生成，结构化全量数据。
   - 写后再出一份 `aurora-migration-report.after.md` 用于进度对比（见工作流第 4 步）。
2. **对话内精简摘要**（见下方「对话汇报要求」），并在摘要里给出上述文件的**实际路径**。

### 报告开头的「如何使用本报告」说明

落盘 `aurora-migration-report.md` 后，在其**最开头**补上下面这段说明（按实际情况替换占位符），让用户对文档用法一目了然：

```markdown
> **如何使用本报告**
>
> - **这是什么**：`<projectDir>` 的 Auxo→Aurora 项目级迁移报告，由 `aurora migrate auxo --format markdown --detail` 生成，已展开全部命中文件（未截断）。
> - **怎么读**：先看顶部的 usage 基线与迁移进度，再看「按规则命中」明细，最后看 codemod / prompt / manual 分组（manual 与高风险项优先处理）。
> - **配套文件**：`aurora-migration-report.json`（结构化全量，供脚本/平台消费）；`aurora-migration-prompt.md`（喂给 AI 处理非确定性项的指令，**不是**本报告）。
> - **下一步**：按 prompt / manual 分组逐项处理，处理完重新运行同一命令刷新本报告与进度。
```

## 对话汇报要求

在对话里向用户汇报时，需要包含：

- 落盘的报告文件路径（`aurora-migration-report.md` / `.json`），提示完整明细在文件里。
- 已运行的命令，并说明是只读、dry-run 还是 write 模式。
- Auxo/Aurora usage 基线和迁移进度。
- codemod 涉及的文件和变更类型。
- Prompt/manual 后续处理分组，尤其是高风险项。
- 已运行的验证命令，以及无法运行的命令和原因。
- 剩余 Prompt 或 Manual 迁移工作的下一步。
