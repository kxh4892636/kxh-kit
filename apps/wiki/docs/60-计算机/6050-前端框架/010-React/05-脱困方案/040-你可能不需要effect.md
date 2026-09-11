---
id: c1d63508-ec4f-4f3b-b248-2555d14770f5
---

# 你可能不需要 Effect

## 由现有数据推导 UI 时为什么不需要 Effect？

- 渲染计算: fullName、过滤列表和选择结果直接由 props/state 计算，避免先渲染旧结果再用 Effect 设置新 state;
- 昂贵计算: 确认成本后再考虑缓存，useMemo 的选择规则归属性能 Hooks；缓存不是修复数据建模错误的方法;

```jsx
const fullName = firstName + " " + lastName;
const selected = items.find((item) => item.id === selectedId) ?? null;
```

## 切换业务对象时怎样清空整段状态？

- 身份重置: 给子组件适当 key，让 React 按新业务实体重新创建状态，而不是在 Effect 中逐个清空字段;
- 规则来源: key 与位置的完整行为见保留与重置 state，本节只用于判断是否需要同步外部系统;

## 只有部分状态需要随输入变化调整时怎么办？

- 优先推导: 先检查是否能只存 ID 等最小信息，避免重置；确实需要比较前一次输入时，才考虑渲染中有条件调整当前组件的 state;
- 严格限制: 只更新当前正在渲染的组件，条件必须在更新后变为假；无条件 setter 会形成无限重渲染，不能推广为通用同步写法;

```jsx
const [previousItems, setPreviousItems] = useState(items);
const [selection, setSelection] = useState(null);
if (items !== previousItems) {
  setPreviousItems(items);
  setSelection(null);
}
```

## 用户操作引起的一连串变化应该放在哪里？

- 同一事件: 在事件中计算并提交相关更新，不用多个 Effect 以“某 state 变了”互相触发;
- 共享逻辑: 多个处理器需要同一操作时提取普通函数，在相关事件中调用;
- 通知父组件: 在造成变化的事件中同步调用回调，或把状态提升，避免通过 Effect 再向上传递重复状态;

```jsx
function Toggle({ onChange }) {
  const [enabled, setEnabled] = useState(false);
  function handleClick() {
    const next = !enabled;
    setEnabled(next);
    onChange(next);
  }
  return <button onClick={handleClick}>{enabled ? "已开启" : "已关闭"}</button>;
}
```

## 初始化应用时怎样判断是否需要 Effect？

- 应用初始化: 真正只属于一次应用启动的逻辑可放在入口或模块初始化处，但要考虑服务端执行环境，不能把组件挂载当作应用生命周期;
- 显示同步: 与组件出现相关的外部连接仍使用 Effect，允许挂载与卸载重来;
- 外部订阅: 外部 store 的一致快照订阅优先用 useSyncExternalStore，完整契约见外部 Store 笔记;
