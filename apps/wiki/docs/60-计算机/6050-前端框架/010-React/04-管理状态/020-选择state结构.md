---
id: 662b4bd7-3a72-47c8-88a1-6b85b49a60b1
---

# 选择 state 结构

## 哪些值应该组成同一份 state？

- 同步变化: 总是一起更新的值可以组成对象，例如指针的 x 和 y，减少只更新其中一半的机会;
- 独立变化: 不相关数据可以分开存，避免每次更新都复制无关字段；分组依据是业务关系而非数据类型;

```jsx
const [position, setPosition] = useState({ x: 0, y: 0 });
```

## 如何让矛盾状态无法被表达？

- 枚举状态: 用 status 表达互斥阶段，不用多个可自由组合的布尔值分别表示 sending、sent 和 failed;
- 派生标记: `isSending = status === 'sending'` 可直接计算，不再存一份需要同步的布尔值;

```jsx
const [status, setStatus] = useState("editing");
const isSending = status === "sending";
```

## 哪些信息不应该再存一份？

- 冗余计算: fullName 可以由 firstName 和 lastName 计算，过滤结果可以由列表和条件计算;
- 重复对象: 选择某个条目时保存 selectedId，再从列表查找，不同时保存列表对象及其完整副本;
- Props 镜像: `useState(color)` 只把 color 用作初始值，后续 prop 不会自动同步；只有确实想忽略后续变化时才采用，并用 initialColor 等名称表达;

```jsx
const [selectedId, setSelectedId] = useState(null);
const selected = items.find((item) => item.id === selectedId) ?? null;
```

```jsx
function Selection({ items }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = items.find((item) => item.id === selectedId);
  return (
    <>
      {items.map((item) => (
        <button key={item.id} onClick={() => setSelectedId(item.id)}>
          {item.name}
        </button>
      ))}
      <p>已选：{selected?.name ?? "无"}</p>
    </>
  );
}
```

- 删除场景: 如果选中条目随后从 items 消失，查找结果自然为 undefined，界面显示“无”，无需再维护一份可能过期的选中对象;

## 如何减少深层状态带来的更新成本？

- 规范化: 把重复实体放进按 ID 索引的表，父子关系只存 ID，使实体只在一个位置保存完整数据;
- 删除关系: 更新父节点的 childIds，并按业务需要清理不再引用的实体；结构重组不等于只复制最外层对象;
- 复杂度权衡: 扁平化增加查找步骤，却减少重复与深层复制；简单的小对象不必强行规范化;

```js
const places = {
  root: { id: "root", childIds: ["sh"] },
  sh: { id: "sh", title: "上海", childIds: [] },
};
```
