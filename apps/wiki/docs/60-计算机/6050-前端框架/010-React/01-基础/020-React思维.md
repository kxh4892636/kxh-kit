---
id: 1ab87f1d-2c09-4288-8796-47d3fb94f352
---

# React 思维

## 如何从设计稿得到组件层级？

- 分解依据: 按职责、视觉分组与数据结构划分组件，让每个组件解释一个清晰的 UI 责任，而不是机械地为每个标签建组件;
- 调整边界: 一个组件需要处理多个互不相关的问题时再拆分，组件层级可以随着需求澄清而调整;

```text
ProductPage：组织数据与交互
├── SearchBar：输入查询条件
│   ├── SearchInput：查询文本
│   └── StockFilter：库存筛选
└── ProductTable：展示派生结果
    ├── CategoryRow：类别标题
    └── ProductRow：单个商品
```

## 为什么先实现静态版本？

- 静态版本: 用 props 把数据传到叶子组件，先验证展示结构，暂不引入交互状态;
- 实现顺序: 简单页面适合自上而下搭建，复杂页面也可先完成底层组件；两种方式都应得到同一份可核对的 UI;

## 如何识别最小且完整的状态？

- 筛选流程: 列出页面使用的数据，排除父组件传来的值、始终不变的值和能从已有数据计算的值，剩余部分才是 state 候选;
- 例子: 搜索框文本和“只看库存”开关需要记忆，过滤后的商品列表可以计算；具体组织规则见[选择 state 结构](../04-%E7%AE%A1%E7%90%86%E7%8A%B6%E6%80%81/020-%E9%80%89%E6%8B%A9state%E7%BB%93%E6%9E%84.md);

## 如何确定状态由哪个组件持有？

- 定位流程: 找出使用该状态的组件，再找共同祖先；由能够表达这份业务状态的最近共同祖先持有，必要时新增容器组件;
- 验证标准: 读状态和改状态的组件都能经 props 接入同一份来源，避免各自保存副本后再同步;

## 如何把子组件交互接回状态所有者？

- 回调通道: 父组件把值和事件回调传下去，子组件调用回调描述交互，父组件更新 state 后重新传值;
- 单向数据流: 回调可以向上报告事件，但数据仍由状态所有者向下传递，不代表子组件可以直接修改父组件的数据;

```jsx
import { useState } from "react";

function SearchInput({ query, onQueryChange }) {
  return <input value={query} onChange={(event) => onQueryChange(event.target.value)} />;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  return <SearchInput query={query} onQueryChange={setQuery} />;
}
```
