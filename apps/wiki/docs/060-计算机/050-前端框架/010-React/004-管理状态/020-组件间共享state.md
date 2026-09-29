---
id: d853f23e-3fc6-4304-8c2e-e3d2bcf6aac2
---

# 组件间共享 state

## 两个组件需要同步变化时怎样提升状态？

- 提升流程: 从子组件移除独立 state，由最近共同父组件持有，再把值与更新回调分别传给子组件;
- 单一来源: 每份独立状态都应有明确所有者，并非应用全部 state 都必须放在根组件;
- 行为核对: 子组件通过事件表达希望发生的变化，最终结果由父组件决定;

```jsx
import { useState } from "react";

function Panel({ title, active, onShow }) {
  return (
    <section>
      <button onClick={onShow}>{title}</button>
      {active && <p>{title}的内容</p>}
    </section>
  );
}

export default function Accordion() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <>
      <Panel title="简介" active={activeIndex === 0} onShow={() => setActiveIndex(0)} />
      <Panel title="详情" active={activeIndex === 1} onShow={() => setActiveIndex(1)} />
    </>
  );
}
```

## 受控组件在设计上意味着什么？

- 受控设计: 重要行为由父组件传入的 props 决定，父组件能够协调多个实例；子组件需要通过回调提出变更;
- 非受控设计: 重要行为主要由组件自身 state 决定，调用简单，但外部难以强制协调;
- 程度差异: 同一组件可同时拥有受控输入和局部状态，这两个词不是对所有组件的绝对分类;

## 怎样选择状态应当留在本地还是向上提升？

- 留在本地: 只有自己需要的短暂交互状态放在组件内部，减少不必要的数据通道;
- 向上提升: 兄弟组件必须一致或父组件需要决定行为时提升，不要靠多个 Effect 同步副本;
- 表单区别: 原生 input 的 value/defaultValue 等具体控制契约统一见 DOM 表单笔记，组件设计概念不等同于某一个属性;
