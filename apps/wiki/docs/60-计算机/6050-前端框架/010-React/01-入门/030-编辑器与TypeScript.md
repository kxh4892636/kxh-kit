---
id: fe97b896-426e-43c1-aa59-31568936a095
---

# 编辑器与 TypeScript

推荐哪些编辑器？如何配置格式化与 Lint？TypeScript 如何与 React 配合？

## 编辑器

- 推荐: VS Code 生态最成熟;
- 必备特性: 语法高亮、自动补全、Lint、格式化;
- Lint: ESLint 在写代码时捕获问题;
- 格式化: Prettier, 可配置保存时自动格式化;

## TypeScript 安装

- React Web 类型: `@types/react`, `@types/react-dom`;
- 新项目: 模板自带 TS 支持;
- 现有项目: 安装类型包并配置 `tsconfig.json`;

```bash
npm install -D typescript @types/react @types/react-dom
```

## 组件类型

- 组件参数: 用 `interface` 描述 props;
- 返回值: JSX 元素;

```tsx
interface Props {
  name: string;
}

function Greeting({ name }: Props) {
  return <h1>Hello {name}</h1>;
}
```

## Hooks 类型示例

- `useState`: 可推断或显式泛型;
- `useReducer`: 定义 action 联合类型;
- `useContext`: `createContext<T>(defaultValue)`;
- `useMemo` / `useCallback`: 泛型自动推断;

```tsx
const [count, setCount] = useState<number>(0);
```

## 常用类型

- DOM 事件: `React.ChangeEvent<HTMLInputElement>`;
- children: `React.ReactNode`;
- style: `React.CSSProperties`;

```tsx
function Field({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return <input value={value} onChange={onChange} />;
}
```
