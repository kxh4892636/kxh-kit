---
id: 234eeb81-0bc8-4b1e-b775-f2d65546019b
---

# 用 state 响应输入

## 声明式与命令式有什么区别?

- 命令式: 直接操作 DOM 开关、显示、禁用;
- 声明式: 描述不同视觉状态, 根据 state 渲染;

## 用 state 响应输入的设计步骤有哪些?

1. 识别组件所有视觉状态;
2. 确定触发状态变化的条件（输入、请求等）;
3. 用 `useState` 表示状态;
4. 删除非必要 state;
5. 连接事件处理器与 setState;

## 状态变量示例中 status 有哪些取值?

```jsx
const [status, setStatus] = useState("typing"); // typing | submitting | success
```

## 事件处理器如何连接 setState 切换状态?

```jsx
function handleSubmit() {
  setStatus("submitting");
  try {
    // ...
    setStatus("success");
  } catch {
    setStatus("typing");
  }
}
```
