---
id: 137ec6fc-c2a1-4ce9-9fd8-667a3e1e90ca
---

# history、navigator 与 screen

## history 如何管理浏览历史？

| 成员                                       | 作用                                  |
| ------------------------------------------ | ------------------------------------- |
| `history.length`                           | 历史条目数量                          |
| `history.state`                            | 当前历史条目的状态对象                |
| `history.scrollRestoration`                | `"auto"`/`"manual"`, 是否恢复滚动位置 |
| `history.back()` / `forward()`             | 前进 / 后退一个条目                   |
| `history.go(delta?)`                       | 跳到相对位置, 不传参表示刷新          |
| `history.pushState(state, title, url?)`    | 新增历史条目                          |
| `history.replaceState(state, title, url?)` | 替换当前条目                          |

- 典型用途: 单页应用用 `pushState` 改变地址而不刷新页面, 并在 `popstate` 时恢复视图;

## navigator 与 screen 分别描述什么？

- `navigator`: 记录浏览器信息, 如用户代理与能力探测;
- `screen`: 记录客户端显示器信息, 如分辨率与可用区域;
