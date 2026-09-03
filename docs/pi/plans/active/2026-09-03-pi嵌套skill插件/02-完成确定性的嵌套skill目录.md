---
status: completed
blocked_by: ["01"]
---

# 完成确定性的嵌套 skill 目录

## 交付

用户在 Pi 已接纳的任意 skill 来源中都能稳定发现父 skill 内任意深度的嵌套 skill；显式原生 skill 始终优先，忽略规则和链接不会导致意外目录或无限扫描。

## 范围

- 完成多父 skill、多深度、canonical path 去重与确定排序。
- 对齐隐藏目录、`node_modules` 和三类 ignore 文件语义。
- 不跟随目录 symlink/junction，并处理消失、无权限或非目录路径。
- 证明 grouping folder 已发现的 skill 不被重复贡献，原生同名 skill first-wins，nested 同名结果确定。
- 证明 startup 与 `/reload` 重新发现资源。
- 不实现 input 原位展开。

## 直接依赖

- 01：需要可加载 package、discovery 接口和资源事件闭环；消费其 extension entry、test double 与最小发现契约。

## 验收

- [x] discovery 测试覆盖任意深度、排除规则、目录链接、去重、稳定排序、声明优先和 reload，且同一 fixture 多次运行得到相同补充路径顺序。

## 上下文

- [Plan](spec.md)
- [Pi 领域语言](../../../CONTEXT.md)
- [独立插件 ADR](../../../adr/0004-以独立插件补充发现与原位展开.md)
- `.temp/pi/packages/coding-agent/src/core/skills.ts`
- `.temp/pi/packages/coding-agent/src/core/package-manager.ts`
- `packages/dsh-nested-skill/src/provider.ts`

## 下一步

/code-delivery

## 交付记录

- 交付物：确定性嵌套扫描、三类 ignore 规则、隐藏/依赖目录和目录链接边界、canonical 去重、原生及 nested 同名 first-wins，以及真实 reload 刷新测试。
- Commit：`aa0452a8c`（`feat(coding-agent): complete nested skill discovery`）。
- 验证证据：`src/discovery.test.ts` 与 `src/index.test.ts` 6/6 passed；coverage statements 92.92%、branches 81.13%、functions 100%、lines 93.97%；根 `npm run check` passed；Standards 与 Spec 双轴 review passed。
