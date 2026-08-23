# Loop Kit

Loop Kit 将想法路由为可验收的设计、Plan 和交付 Flow。

## Language

**Flow 发起者**：
请求进入一次 Flow 路径的 skill；`/loop-x` 动态选择入口 skill，固定入口 skill 则选择自身。
_避免使用_：当前 skill

**入口 skill**：
经用户确认后开始一条 Flow 路径的 skill，限于 `/grill-with-docs`、`/to-story` 或 `/to-issues`。
_避免使用_：next skill

**Flow 路径**：
与入口 skill 一一对应的有序卡点与交付 receipt 链，分为 `main`、`story` 和 `issues`。
_避免使用_：模式
