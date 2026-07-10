# Router Template

Router 降低多个 user-invoked skills 带来的 cognitive load。它只描述选择条件和衔接关系，不复制下游 skill 的步骤；router 自身设置 `disable-model-invocation: true`。

```markdown
# <Router Title>

<一句话说明用户为什么需要这个入口。>

## 主流程

1. **当用户处于 `<状态 A>`**：推荐 `/<skill-a>`，因为它负责 `<一句话职责>`。
2. **如果出现 `<分支条件>`**：
   - `<条件 B>` → `/<skill-b>`
   - `<条件 C>` → `/<skill-c>`
3. **当 `<完成状态>` 达成**：进入 `/<skill-d>`。

## 入口分支

- **出现 `<故障或请求类型>`** → `/<skill-e>`。
- **出现 `<规模或不确定性条件>`** → `/<skill-f>`。

## 独立使用

- `/<skill-x>` — <独立解决的问题与选择条件>。
- `/<skill-y>` — <独立解决的问题与选择条件>。

## 前置条件

<必须先存在的配置、权限或上下文；没有则删除本节。>
```

每个 skill 只保留一个可区分的职责说明。Router 推荐 user-invoked skill，由用户决定是否启动；model-invoked skill 可以由 Agent 在其触发条件成立时直接使用。
