---
id: 3af69fe4-ceab-4731-a7a4-b976cee9eced
---

# Activity

## 如何隐藏 UI 同时保留内部状态？

- Activity: 用 mode="hidden" 隐藏子树，切回 visible 时恢复之前的 state，适合可能很快再次打开的面板;
- 默认值: 不传 mode 时默认为 visible；隐藏 DOM 通常通过 display:none 实现，而非删除组件身份;
- 与卸载区别: 条件渲染移除子树会丢弃局部状态，Activity 保留状态但调整外部副作用生命周期;

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

- Effect 清理: 隐藏时销毁 Effects，显示时重新建立，订阅与连接应能正确停止并恢复;
- 后台更新: 隐藏子树仍可响应新 props 重新渲染，只是优先级低于可见内容，不等于完全冻结;
- 外部状态: state 保留不意味着音视频等外部副作用可以不清理，应通过 Effect 反映真实生命周期;

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

- 隐藏动作: 如果该组件处于 Activity 内，隐藏时的 Effect 清理可以暂停播放；保留 DOM 本身不意味着浏览器会自动暂停媒体;

## 如何利用 Activity 准备即将显示的内容？

- 后台准备: 提前以隐藏模式渲染可能访问的区域，使代码、数据与 UI 工作有机会准备好，再切换可见性;
- 资源权衡: 保留子树会占用内存与 DOM，适合有较高复用概率的内容，不把所有页面永久隐藏缓存;
- 加载限制: 只有与 React 渲染配合的加载才能从后台准备中获益，普通 Effect 数据获取在隐藏状态不会照常运行;

## 哪些内容不能简单依赖隐藏样式？

- 纯文本: 只返回文本没有可设置 display 的 DOM 元素，隐藏 Activity 会不输出该文本，不能假设存在隐藏文本节点;
- 布局测量: 隐藏状态没有正常可见布局，依赖尺寸或焦点的操作应在合适的可见生命周期进行;
- 动画衔接: 在 Transition 中改变 Activity 的可见性可触发外层 ViewTransition 的进入或退出动画;
