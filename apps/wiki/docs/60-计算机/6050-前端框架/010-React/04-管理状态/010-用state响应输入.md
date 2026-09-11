---
id: 20f8bc5b-be18-441e-bd18-eb8b2f69d1ff
---

# 用 state 响应输入

## 如何从界面行为识别需要表达的状态？

- 视觉状态: 先列出空白、可编辑、提交中、成功、失败等用户能看到的状态，而不是先操作按钮的 disabled 或元素的 display;
- 静态验证: 分别渲染这些状态检查 UI，再接入事件，能提早发现漏掉的反馈或互相冲突的显示;

## 如何找出状态之间的触发关系？

- 人为触发: 输入、点击和提交导致状态变化;
- 系统触发: 请求成功或失败等异步结果也会改变状态，应和交互一起进入状态图;
- 迁移限制: 提交中不再接受重复提交，失败后允许修正重试，成功后显示结果;

```text
编辑中 ──提交──> 提交中 ──成功──> 成功
  ↑                 │
  └────修改重试──── 失败
```

## 如何用最少的 state 表达这些状态？

- 最小表示: 保存输入、请求状态和必要的错误信息；`disabled`、`isEmpty` 等能推导的结果直接计算;
- 合法组合: 单个 status 比多个互不约束的布尔值更容易避免“成功且提交中”，结构细节见选择 state 结构;

## 如何把事件与异步结果接入声明式 UI？

- 处理流程: 事件中设置提交状态，等待请求结果，再进入成功或失败分支；JSX 根据当前状态描述应显示的内容;
- 错误处理: 可恢复的提交失败进入业务状态，让用户看到原因并重试，不把所有失败都变成页面级异常;

```jsx
import { useState } from "react";

export default function AnswerForm({ submit }) {
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("editing");
  const [error, setError] = useState(null);
  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      await submit(answer);
      setStatus("success");
    } catch (error) {
      setError(String(error));
      setStatus("editing");
    }
  }
  if (status === "success") return <p>提交成功</p>;
  return (
    <form onSubmit={handleSubmit}>
      <input
        value={answer}
        disabled={status === "submitting"}
        onChange={(event) => setAnswer(event.target.value)}
      />
      <button disabled={!answer || status === "submitting"}>提交</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```
