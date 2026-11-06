# 预设提示词评审

## 目标

评审固定提示词的优化空间，交付按优先级排好的修订清单；本轮不改文件。

## 取证口径

- 目标：`packages/dsh-toolkit/src/nano-flow/prompt.md`（210 行 / 12,956 B；`dist/nano-flow/prompt.md` 同名同大小；作为固定系统提示按字面量注入，无变量）。
- 对照：`src/nano-flow/tools/read.ts`、`write.ts`、`check.ts`、`src/contract.ts` 默认上限、`src/nano-flow/scripts/check-domain.mjs`、随包 `skills/ask`、`do`、`kaizen`、`README.md`、`docs/dsh/CONTEXT.md`。
- 结论：有优化空间，重点在「触发条件缺失」与「重复」，不是细节密度。

## 结论摘要

详见 note 01。P0 是 Plan 初始化触发、模式优先级、story/spec 契约、域根对齐、ask 护栏位置，以及删除工具清单与空节；P1 是其余重复与模糊表述；P2 是结构与体量。

## 当前进度

- 评审完成（note 01 completed）。
- note 03 实施中：`prompt.md` 已按定案改写，ask / do skill、README、`runtime.test` 与 `assets.lock.json` 同步；插件 markdown 全部改为 ASCII 标点。
- 本地验证：209 个测试通过、`vp check` 通过、`pnpm build` 成功、dist 与 src 同哈希、`nano_flow_check workspace` 通过。
- 未验证：打包安装、重启宿主、新会话行为。
- 域根：dsh 已切到 `.agents/domains`，其 `CONTEXT.md` 与 `QUESTIONS.md` 目前是指向 `docs/dsh` 的迁移指针；旧 Plan 与 ADR 仍在原位，迁移见 note 02。

## 恢复入口

1. 读本 spec 与 note 01 的修订清单。
2. 要落地修订：按 note 03 改 `prompt.md` 并同步 README 与 ask skill，再构建、安装、真机验证。
3. 要清账：按 note 02 把域文档与旧 Plan 迁到新布局。

## 开放问题

- `docs/dsh` 的旧 Plan 保留为 Markdown 历史，还是迁到新布局（需处理相对链接）？
- `index` 的「1–」下限补校验，还是只改文案？
