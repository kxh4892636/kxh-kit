---
name: "029-恢复时显式Plan绑定"
description: "非轮转恢复也能绑定：nano_flow_check 带 plan 时跨 active/reference/archived 定位并绑定本会话；system.md 恢复条款改为已知 Plan 时带 plan。"
status: completed
related_noted:
  - '018-恢复Plan开头自动校验'
  - '028-轮转绑定继承旧会话的Plan'
---

# 029-恢复时显式Plan绑定

## 取证

- `nano_flow_check` 工具的绑定原逻辑：`plan` 参数只在 **active** Plan 里按目录名查找；不带参数时只在「唯一 active Plan」时绑定。
- 后果：工作区有多个 active Plan（如 dsh + music）时，非轮转的恢复会话裸跑 check 不会绑定，Note 看板不出现。
- 轮转路径已由 028 改为继承旧会话绑定；非轮转路径仍缺。

## 决策

- `plan` 显式给出时，用 `listPlans` 跨 `active / reference / archived` 按目录名定位并绑定（不再只看 active）。
- 不带 `plan` 时保持原启发式：恰好一个 active Plan 才绑；多个时留给用户/模型确认。
- `system.md` 的恢复条款：已知 Plan 时带 `plan: '<Plan 目录名>'`（seed 里的 `dsh/active/<name>` 末段就是目录名）。

## 交付

- `tools/check.ts`：显式 `plan` 用 `listPlans(...).find(item => item.name === plan)` 定位并绑定；工具描述补充「plan 时绑定本会话」。
- `system.md`：恢复条款写明 `plan` 参数与多 active Plan 场景。
- `tools.test.ts`：新增用例——2 个 active + 1 个 reference 时，裸 check 不绑、显式 `plan` 绑到 reference。
- 版本 0.5.35，已装入 desktop / web profile。

## 验证

- `vp check`：122 文件格式、94 文件 lint/类型通过。
- `vp test src`：37 文件 / **306 例**通过。
- 轮转路径（028）与非轮转恢复现在都按「会话自己的 Plan」绑定，不再依赖工作区 Plan 数量。

## 残留

- 不带 `plan` 且多个 active Plan 时仍不绑定——这是有意的：避免猜错 Plan；模型在恢复时应从 seed/用户输入取 Plan 名带上。
- 需重启宿主后新提示词与新工具逻辑才生效（当前进程载 0.5.34）。
