---
id: e1bc091f-f159-42b7-852e-b07d73274694
---

# 动画与 requestAnimationFrame

## 早期定时器动画有什么问题？

- 做法: 用 `setInterval` 按固定间隔更新画面;
- 问题: 无法保证时间间隔精度, 掉帧时动画与真实时间不同步, 后台标签页中仍会运行, 浪费资源;

## requestAnimationFrame 有什么优势？

- 语义: 请求在浏览器下一次重绘之前执行回调, 与屏幕刷新率同步;
- 接口: `requestAnimationFrame(callback)` 返回请求 ID, `cancelAnimationFrame(id)` 取消;

```js
const requestID = window.requestAnimationFrame(() => {
  console.log("Repaint!");
});
window.cancelAnimationFrame(requestID);
```

- 回调参数: 收到一个时间戳, 用于按真实时间推进动画;
- 自身调度: 需要连续动画时在回调内再次调用 `requestAnimationFrame`;

## 如何用 rAF 实现自动滚动？

- 思路: 每帧判断可滚动范围与当前位置, 逐步累加滚动偏移, 循环注册下一帧;

```js
const autoScroll = () => {
  const scroll = () => {
    if (tagRef.current.scrollWidth <= tagRef.current.clientWidth) return;
    if (tagRef.current.scrollLeft + tagRef.current.clientWidth === tagRef.current.scrollWidth) {
      tagRef.current.scrollLeft = 0; // 到底后回到起点
    } else {
      tagRef.current.scrollLeft += 1;
    }
    intervalRef.current = requestAnimationFrame(scroll);
  };
  intervalRef.current = requestAnimationFrame(scroll);
};

// 交互暂停与恢复
tagRef.current.onmouseenter = () => cancelAnimationFrame(intervalRef.current);
tagRef.current.onmouseleave = () => {
  intervalRef.current = requestAnimationFrame(scroll);
};
```

- 对照: 定时器的精度与替换写法见 [定时器](../010-浏览器对象模型/040-定时器.md);
