# 领域文档

本文件是工作区领域文档布局、定位、命名和 Plan 生命周期的单一事实源。

## 探索前先定位领域

1. 阅读工作区根目录 `CONTEXT-MAP.md`，确定即将处理的业务域及其关系。
2. 阅读对应业务域的 `docs/{domain-name}/CONTEXT.md`。
3. 阅读该业务域中与当前工作相关的 `adr/`。

跨业务域工作覆盖所有相关业务域，并读取 `CONTEXT-MAP.md` 中的关系。任一文件不存在时静默继续；术语或决策得到确认后，由 `/questing`按需创建或维护。

## 布局

领域内容只创建在工作区根目录的 multi-context 布局中：

```text
/
├── CONTEXT-MAP.md
└── docs/
    ├── common/
    │   └── CONTEXT.md
    └── {domain-name}/
        ├── CONTEXT.md
        ├── adr/
        │   └── 0001-中文决策名.md
        └── plans/
            ├── active/
            │   └── YYYY-MM-DD-中文工作名/
            │       ├── story.md
            │       ├── spec.md
            │       └── 01-中文标题.md
            ├── reference/
            └── archived/
```

- `CONTEXT-MAP.md` 只索引业务域及其关系；跨域关系只定义一次。
- `docs/common/` 承载多个业务域共同贡献的领域术语和 ADR。
- `docs/{domain-name}/CONTEXT.md` 只承载该业务域的 glossary，不承载 spec 或实现细节。
- `docs/{domain-name}/adr/` 承载该业务域拥有的 ADR；跨域决策只选择一个 owner，其他域使用链接引用。
- `docs/{domain-name}/plans/` 承载 `/questing`和 `/to-issues` 维护的 Plan。
- `domain-name` 使用稳定、简短的 kebab-case；新增业务域时同步创建 `CONTEXT.md` 并加入 `CONTEXT-MAP.md`。

## 文档约束

- `docs/` 下的 ADR、Plan 文件名与正文使用中文；约定名 `CONTEXT.md`、`spec.md`、`story.md`、稳定 ID、代码标识符和 `domain-name` 除外。
- `CONTEXT.md` 行数、`adr/*.md` 数量与单个 ADR 行数的上限由 `check-domain` 脚本强制，以其输出为准。
- ADR 使用域内连续编号 `0001-中文决策名.md`、`0002-中文决策名.md`。
- 超过任一上限时，按领域边界合并、拆分或移除沉积内容，使文档重新满足上限。

## Plan 生命周期

Plan 目录位置表达活性和参考价值：

```text
新建 ──> active ──完成且仍有参考价值──> reference ──失去参考价值──> archived
                  └─废弃、过时或不再有用──────────────────────> archived
```

- `active/`：当前正在推进；新 Plan 一律创建于此。
- `reference/`：全部 issue 已完成，且内容仍有参考价值。
- `archived/`：已废弃、已过时或不再有用；内容冻结，不再更新，也不再作为权威来源。

Plan 生命周期与 Plan 内的执行状态正交：目录位置表达活性与价值，`spec.md` 和 issue frontmatter 的 `status:` 表达执行进度。移动 Plan 目录不修改 `status:`；未完成但被废弃的 Plan 可以保留原状态进入 `archived/`。

## 领域语言与决策

- 命名 Issue、测试、假设和重构提案时，使用对应 `CONTEXT.md` 中的 canonical term，不使用 glossary 明确排除的同义词。
- 所需概念尚未收录时，先判断它是否只是项目未使用的语言；确认存在领域缺口后，由 `/questing`维护 glossary。
- 输出与现有 ADR 冲突时显式指出冲突及重新讨论的理由，不静默覆盖。
