---
id: fe97b896-426e-43c1-aa59-31568936a095
---

# 编辑器与 TypeScript

## 如何让编辑器及时发现 React 代码问题？

- 编辑器能力: 开启 JSX/TSX 语法识别、补全与错误提示;
- 边界: 编辑器品牌不是 React 的约束;
- 分工: TypeScript 查类型, ESLint 查代码规则, 格式化工具统一排版;
- 反例: 格式化成功不代表代码正确;
- 保存时检查: 让项目中的配置成为共同基线, 避免每个人只依赖自己的全局编辑器设置;

## 如何为现有项目开启 TypeScript？

- 含 JSX: 用 `.tsx`;
- 纯类型或普通逻辑: 可用 `.ts`;
- 类型包: 装 React 与 React DOM 的类型;
- tsconfig: 启用 DOM 类型库, 以及适合构建工具的 JSX 转换;

```bash
npm install -D typescript @types/react @types/react-dom
```

## 如何表达组件的输入类型？

- Props: 用对象类型或 interface 描述参数;
- 表达约束: 必填、可选与联合类型;
- 返回类型: 通常交给编译器推断;
- `ReactNode`: 表示可渲染内容;
- `ReactElement`: 只接受 React 元素, 不含字符串等全部节点;
- 样式: 内联样式使用 `CSSProperties`, 以获得属性名与值的类型提示;

```tsx
import type { CSSProperties, ReactNode } from "react";

type PanelProps = {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
};

function Panel({ title, children, style }: PanelProps) {
  return (
    <section style={style}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
```

## 如何为状态与事件添加类型？

- `useState(0)`: 可推断为 number;
- 需显式标注: 初始值为 null, 或状态有多个合法分支时;
- Reducer: 用带 `type` 字段的判别联合描述 action;
- 收益: 分支处理与载荷类型一一对应;
- Context: 用 `createContext<T>(defaultValue)` 声明共享值;
- 允许 null 时: 由消费 Hook 检查 Provider 是否存在;
- 内联处理函数: 通常能自动推断事件;
- 提取成函数时: 用 `ChangeEvent<HTMLInputElement>` 等类型;

```tsx
import { useState } from "react";
import type { ChangeEvent } from "react";

function NameField() {
  const [name, setName] = useState("");
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setName(event.target.value);
  }
  return <input value={name} onChange={handleChange} />;
}
```
