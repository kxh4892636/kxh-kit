# ADR 格式

ADR 位于唯一 owner 的 `docs/{domain-name}/adr/`，文件名按域内顺序使用 `0001-中文决策名.md`。目录在首份 ADR 出现时创建；跨域决策由其他域链接引用。

## 资格门槛

一项决策同时满足以下条件才成为 ADR：

1. **Hard to reverse**：未来改变它有显著成本。
2. **Surprising without context**：只看实现无法理解为何这样选择。
3. **Real trade-off**：存在真实备选，并因明确理由选择其一。

常见候选包括架构形态、跨域集成、带 lock-in 的技术选择、owner 与 scope 边界、刻意偏离常规路径的方案，以及代码不可见的外部约束。库的普通选用、易逆转偏好和没有备选的显然选择不形成 ADR。

## 最小模板

```md
# {决策的简短标题}

{1-3 句话说明 context、决策与理由。}
```

ADR 可以只包含这个段落。下列内容仅在增加长期解释价值时添加：

- `Status` frontmatter：`proposed | accepted | deprecated | superseded by ADR-NNNN`。
- `Considered Options`：被拒绝的备选值得未来读者记住。
- `Consequences`：存在不明显且重要的下游影响。

创建前扫描 owner 域现有 ADR 的最大编号并递增 1。文件名、编号、owner、决策理由和引用均一致时完成。
