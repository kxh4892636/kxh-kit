# Spec

- spec 状态从**全部 notes** 派生：全部 pending 为 pending，全部 completed 为 completed，其余为 in_progress。
- spec 的 `## Notes` 索引保持 1–13 项，选择对当前工作最有用的 notes; 索引不是全量清单；移出索引不等于删除文档或完成工作。
- 索引优先当前工作、阻塞、下一步与关键决策；索引中的链接、状态、直接依赖和下一步与 note 同步。未索引的剩余工作在「当前进度」保留定位入口。

```markdown
---
status: pending
---

# {工作名}

## Related Notes

| #   | Notes                  | 状态    | 阻塞于 | 下一步                 |
| --- | ---------------------- | ------- | ------ | ---------------------- |
| 01  | [{标题}](01-{标题}.md) | pending | —      | {当前具体动作或 skill} |
```
