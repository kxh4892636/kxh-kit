---
id: 3af69fe4-ceab-4731-a7a4-b976cee9eced
---

# Activity

## 如何隐藏 UI 同时保留内部状态？

- Activity: 用 `mode="hidden"` 隐藏子树, 切回 `visible` 时恢复之前的 state;
- 适用: 可能很快再次打开的面板;
- 默认值: 不传 `mode` 时是 `visible`;

## 隐藏时 DOM 与状态怎么处理？

- 隐藏方式: 通常用 `display:none`, 而不是删掉组件身份;
- 与卸载区别: 条件渲染移除子树会丢掉局部状态;
- Activity: 保留状态, 但调整外部副作用的生命周期;

```jsx
import { Activity, useState } from "react";

function Page() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen((value) => !value)}>切换编辑器</button>
      <Activity mode={open ? "visible" : "hidden"}>
        <Editor />
      </Activity>
    </>
  );
}
```

## 隐藏时 Effects 与 props 更新会怎样？

- Effect 清理: 隐藏时销毁, 显示时重建;
- 要求: 订阅与连接能正确停止并恢复;
- 后台更新: 隐藏子树仍会响应新 props 重新渲染;
- 差别: 优先级低于可见内容, 不等于完全冻结;
- 外部状态: state 保留不代表音视频等外部副作用可以不清理;
- 做法: 用 Effect 反映真实生命周期;

```jsx
function Video({ src }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      video.pause();
    };
  }, []);
  return <video ref={videoRef} src={src} controls />;
}
```

- 隐藏动作: 组件处于 Activity 内时, 隐藏时的 Effect 清理可以暂停播放;
- 注意: 保留 DOM 不代表浏览器会自动暂停媒体;

## 如何利用 Activity 准备即将显示的内容？

- 后台准备: 提前以隐藏模式渲染可能访问的区域;
- 收益: 代码、数据与 UI 工作有机会提前做好, 再切可见;
- 资源权衡: 保留子树会占内存与 DOM;

## Activity 适合缓存哪些内容？

- 适用: 复用概率高的内容, 不要把所有页面永久隐藏缓存;
- 加载限制: 只有与 React 渲染配合的加载才能从后台准备中获益;
- 注意: 普通 Effect 数据获取在隐藏状态不会照常运行;
