# Nano Flow 常见问题

## 改了包内 skill 后，安装的 skill 没更新？

- 适用条件与现象：修改 `packages/nano-flow/skills/nano-flow/` 后，`.agents/skills/nano-flow/` 内容不变；`nnf self skill check --name nano-flow` 返回 `modified` 或 `outdated`。
- 原因：包内 `skills/` 是发布源，`.agents/skills/` 是 `nnf self skill` 的安装产物；安装只从 CLI 包内清单写入，内容哈希只用于识别安装状态。CLI 与受管 skill 同版本发布。
- 解决方法：先构建 CLI 刷新 `generated-skill-manifest.ts`，再执行 `nnf self skill install --name nano-flow`；仓库内两份目录都受版本控制，需成对提交。
- 验证：`nnf self skill check --name nano-flow` 返回 `current`，且 `diff -r` 两份目录无差异。
- 来源：[self.md](../../packages/nano-flow/skills/nano-flow-cli/references/self.md)、[ADR 0003](adr/0003-cli与受管skill同版发布.md)。

## 为什么归档 Plan 的模板缺项不再报错？

- 适用条件与现象：Plan 迁入 `reference` 或 `archived` 后，`node <nano-flow-skill-root>/scripts/check-domain.mjs .` 不再报告其缺少「执行检查点」「决策与证据」或 story.md。
- 原因：`reference` 与 `archived` 是冻结内容，模板随 skill 演进；只校验仍在推进的 `planning` 与 `implementing`，避免历史缺项淹没本次新增问题。
- 解决方法：Plan 在迁入冻结生命周期前完成模板校验；归档后不补写历史文档，恢复工作时先迁回 `planning` 或 `implementing`。
- 验证：校验输出只包含 `planning` 与 `implementing` 下的 Plan。
- 来源：[domain/PLAN.md](../../packages/nano-flow/skills/nano-flow/references/skills/domain/PLAN.md)。

## `nnf anki notes update` 返回成功但字段没变？

- 适用条件与现象：笔记正在 Anki 浏览器中打开时执行更新，命令成功但字段未生效。
- 原因：Anki 浏览器占用该笔记时，上游写入可能静默失败。
- 解决方法：让用户关闭浏览器或切走后再更新；结果异常时先排除这一点。
- 验证：`nnf anki notes info --note-id <id>` 复核字段。
- 来源：[anki.md](../../packages/nano-flow/skills/nano-flow-cli/references/anki.md)。

## 删除牌组为什么会连带子牌组和卡片？

- 适用条件与现象：执行 `nnf anki decks delete --name <deck> --yes` 后，子牌组与卡片一并消失。
- 原因：上游 `deleteDecks` 强制 `cardsToo`，删除父牌组即删除整棵子树。
- 解决方法：删除前用 `nnf anki decks list` 确认子树范围并取得用户确认；目标不存在时命令报错而不是静默成功。
- 验证：命令返回的受影响子牌组与卡片数，与删除前的清单一致。
- 来源：[anki.md](../../packages/nano-flow/skills/nano-flow-cli/references/anki.md)。
