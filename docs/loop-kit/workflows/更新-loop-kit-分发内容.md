# 更新 Loop Kit 分发内容

## 触发条件

当 `@kxh4892636/loop-kit` 分发包中的 `DOMAIN.md`、`AGENTS.md` 受管标记块或 `.agents/skills/loop-kit` 发生变化，并需要把新版本安装到目标根目录时，执行本工作流。

## 输入

- 包含当前 `AGENTS.md`、`DOMAIN.md` 和 `.agents/skills/loop-kit` 的发布快照。
- 通过 `--target <path>` 指定的已存在目标根目录。

## 前置条件

- 发布快照完整包含三类受管内容。
- 源 `AGENTS.md` 中的 `GENERAL RULES` 和 `LOOP KIT` 标记各自完整、唯一且互不重叠。
- `.agents/skills/loop-kit` 是分发包独占目录；目标项目的自有 skill 位于该目录之外。

## 更新循环

1. 在写入前读取并校验发布快照、目标 `AGENTS.md` 标记结构和所有目标路径；任一校验失败时保持目标根目录不变。
2. 计算下一状态：使用发布版本替换 `DOMAIN.md`；只替换或追加 `AGENTS.md` 的两个受管标记块；完整准备新的 `.agents/skills/loop-kit`。
3. 以每个 `SKILL.md` 所在目录为一个 skill，计算目标旧目录中不存在于新版本的已删除 skill 数；其他陈旧内容随目录替换删除，但不进入该计数。
4. 在同一事务中写入 `DOMAIN.md`、`AGENTS.md` 并整体替换 `.agents/skills/loop-kit`。成功后目标 skill 目录与发布快照一致；任一步骤失败时恢复三类内容的原始状态。
5. 输出 `created`、`updated`、`unchanged` 文件数和已删除 skill 数。重复执行同一版本时不改写内容，已删除 skill 数为 0。

## 实现边界

- `/implement` 使用 `/tdd`，通过公开 CLI seam 逐项锁定本工作流的行为。
- 实现不得扩大 `AGENTS.md` 的受管范围，也不得保留 `.agents/skills/loop-kit` 中仅存在于目标的内容。

## 完成条件

以下门禁全部通过后，本次更新才算完成：

1. Loop Kit package 的检查、测试和构建通过。
2. 在临时目标根目录执行真实 CLI 更新，证明陈旧 skill 被删除且按 skill 计数、非 skill 陈旧内容被删除但不计数、`DOMAIN.md` 被替换、`AGENTS.md` 只更新两个受管标记块，并保留目标项目的其他内容。
3. 人为制造更新失败，证明旧 skills、`DOMAIN.md` 和 `AGENTS.md` 全部恢复。
4. 源文件与生成 payload 的 SHA-256 一致。
5. `git diff --check` 通过；仓库既有的无关失败单独报告。

## 输出

- 与发布快照一致的目标 `.agents/skills/loop-kit`。
- 使用发布版本的目标 `DOMAIN.md`。
- 仅两个受管标记块更新后的目标 `AGENTS.md`。
- 包含已删除 skill 数的 CLI 汇总和对应验收证据。
