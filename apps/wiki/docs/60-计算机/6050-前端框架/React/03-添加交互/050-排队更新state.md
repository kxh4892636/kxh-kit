---
id: dd30424e-b26e-470d-afa4-db3680131cf1
---

# 排队更新 state

React 如何批量处理 state 更新？如何连续多次更新同一 state？

## 批处理

- React 将同一事件中的多个 setState 合并为一次渲染;
- 减少不必要的重渲染;

```jsx
setNumber(0 + 1);
setNumber(0 + 1); // 两次都基于 0, 最终 1
```

## 更新函数

- 传入函数 `setNumber(n => n + 1)` 可基于队列中的前一个值;

```jsx
setNumber((n) => n + 1);
setNumber((n) => n + 1); // 最终 2
```

## 替换 vs 更新

- 直接传值: 替换当前 state;
- 传更新函数: 追加到队列, 依次计算;

```jsx
setNumber(0 + 1); // 替换为 1
setNumber((n) => n + 1); // 基于 1, 得到 2
```

## 命名约定

- 更新函数参数常用 state 首字母: `setAge(a => a + 1)`;
- 或更明确: `setAge(age => age + 1)`;

## 注意

- 更新函数必须纯净, 只返回新值;
- React 开发模式下会双调用更新函数以检测不纯;
