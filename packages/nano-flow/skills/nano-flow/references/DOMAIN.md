# 领域文档

## 布局

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
- `docs/{domain-name}/CONTEXT.md` 只承载该业务域的 glossary;
- `docs/{domain-name}/adr/` 承载该业务域拥有的 ADR；跨域决策只选择一个 owner，其他域使用链接引用。
- `docs/{domain-name}/plans/` 承载业务域的 story, spec 和 issues;

## 文档约束

- 新增业务域时同步创建 `CONTEXT.md` 并加入 `CONTEXT-MAP.md`。
- `docs/` 下的所有文件内容正文使用中文;
- ADR 使用域内连续编号 `0001-中文决策名.md`、`0002-中文决策名.md`。

## Plan 生命周期

```text
新建 ──> active ──完成且仍有参考价值──> reference ──失去参考价值──> archived
                  └─废弃、过时或不再有用──────────────────────> archived
```

- `active/`：当前正在推进；新 Plan 一律创建于此。
- `reference/`：全部 issue 已完成，且内容仍有参考价值。
- `archived/`：已废弃、已过时或不再有用；内容冻结，不再更新，也不再作为权威来源。
