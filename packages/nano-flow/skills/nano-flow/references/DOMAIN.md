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
            ├── planning/
            │   └── YYYY-MM-DD-中文工作名/
            │       ├── story.md
            │       ├── spec.md
            │       └── 01-中文标题.md
            ├── implementing/
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

## Plan 生命周期

```text
新建 ──> planning ──开始实现──> implementing ──完成且仍有参考价值──> reference
             │                     │                                  │
             └─废弃或不再推进───────┴─废弃或不再有用──> archived <──失去参考价值─┘
```

- `planning/`：讨论需求、澄清设计、制定方案或等待实现，尚未开始实现；新 Plan 一律创建于此，已有 Issue 均为 `pending`。
- `implementing/`：已开始实现，正在推进开发、测试与验收；开始实现前将整个 Plan 从 `planning/` 迁入此处。
- `reference/`：全部 issue 已完成，且内容仍有参考价值。
- `archived/`：已废弃、已过时或不再有用；内容冻结，不再更新，也不再作为权威来源。
