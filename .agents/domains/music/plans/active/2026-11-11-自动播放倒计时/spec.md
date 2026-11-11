---
name: "自动播放倒计时"
description: "用「倒计时」替换自动播放开关：设置分钟数后倒计时期间连续播放，到期后本轮曲目播完切到下一首但不自动播放；不限时等于原先的常开；状态为会话状态，不可暂停或取消。"
status: completed
---

# 自动播放倒计时

## 目标

1. 删除「下一首」右侧的自动播放开关（`AutoPlaySwitch`，2026-11-08 上线）。
2. 默认行为不变：没设倒计时时，一首播完切到下一首并停在 0:00（等同现在开关关闭）。
3. 新增倒计时（睡眠定时）：用户填任意分钟数并开始，倒计时期间一首播完就自动播下一首；到期后（当前曲目照常播完）切到下一首但不自动播放，界面回到默认态。
4. 倒计时支持「不限时」，等价于现在开关常开。
5. 为倒计时设计匹配现有 Bloom 视觉的 UI：控制条上一个按钮，点开小面板填时间。
6. 联动：开始计时（含「不限时」）时，若音乐在暂停则直接开播；已在播则续播，不从头开始。

## 现状

- 播放行为由 `client/app/playback/use-playback.ts` 的 `onEnded` + `shouldPlayRef` 决定：`shouldPlayRef` 为真则换曲后 `play()`。
- 状态在 `client/app/store/player.ts`：`autoPlay: boolean` 存 localStorage（键 `musopen.listen.v1`，只持久化 `history` 与 `autoPlay`）；`AutoPlaySwitch` 在 `client/app/components/console-row.tsx` 的 `.transport` 行（播放 / 下一首 / 开关）。
- 样式 `.switch*` 在 `client/app/styles.css`；e2e 第二条用例与 `player.test.ts` 一条用例覆盖开关。
- 已上线：`123.57.92.26/music/`，构建需带 `MUSIC_BASE=/music/`。

## 决策（2026-11-11，用户确认）

- **默认**：倒计时未设置即关闭（播完停在下一首）。倒计时控制的是「自动播放生效的时长」。
- **到期语义**：到期不打断当前曲目；本轮播完后切下一首、不自动播放，界面回到默认态。
- **无法撤销**：倒计时一旦开始不可暂停、不可取消、不可改时长；只有刷新页面（会话状态，不持久化）才重置。「不限时」同样不可取消。
- **计时口径**：按墙钟走（不做「仅播放时计时」）；用户接受暂停听也在消耗。
- **刷新**：倒计时是会话状态，刷新即清空（开关现在的 localStorage 持久化取消）。
- **UI 形态**：控制条上一个按钮，未生效时显示「定时」，生效后同一位置显示剩余时间或「不限时」；点开小面板：快捷 5/10/15/30 分钟 + 自定义分钟输入 + 「不限时」。
- **到点提示**：不做「本轮结束后停止」提示与「续 10 分钟」；生效期间只显示倒计时本身。

## 状态与行为

```ts
type SleepTimer =
  | { kind: "off" }                        // 默认：播完停
  | { kind: "endless" }                    // 不限时：等同原开关开
  | { kind: "until"; endsAt: number; totalMs: number };  // 有限：到期后回到 off
```

- `isAutoPlayActive(timer, now = Date.now())`：`endless` 恒真；`until` 为 `now < endsAt`；`off` 为假。
- `onEnded`：`isAutoPlayActive(timer)` 为真才置 `shouldPlayRef`，然后 `advance(ids)`。到期后当前曲目播完时按墙钟判假，于是停在下一首。
- 有限倒计时由控件按秒重算剩余；剩余 ≤ 0 时把状态置回 `off`（按钮回到「定时」）。

## 方案与切片

1. **[001-倒计时状态与播完行为](001-倒计时状态与播完行为.md)**：新增定时器状态与纯函数，改 `onEnded`，移除 `autoPlay` 与 localStorage 持久化，补单测。
2. **[002-倒计时控件与面板](002-倒计时控件与面板.md)**：用 `SleepTimerControl` 替换 `AutoPlaySwitch`，含面板交互、剩余时间显示、样式与 390 适配；删 `.switch*` 样式。
3. **[003-本地验收与测试](003-本地验收与测试.md)**：单测与 e2e 覆盖三条路径（未设/倒计时内/到期后与不限时），1440 与 390 截图交用户确认。
4. **[004-上线部署与线上复验](004-上线部署与线上复验.md)**：按 music workflow 001 重建部署并线上复验。
5. **[005-计时开始时开始播放](005-计时开始时开始播放.md)**：开始计时的联动开播。

## 非范围

- 不做暂停/取消/改时长、不支持暂停时冻结计时、不做跨设备或跨刷新同步。
- 不做到点提示音、淡出、「续 10 分钟」、「本轮结束后停止」提示。
- 不动洗牌袋、历史、波形与快捷键说明。
- 不改 `TransportCap` 的播放/暂停按钮语义（用户仍可手动暂停音频，只是定时器不受影响）。

## 风险与假设

- **误设无法撤销**：填 1440 分钟只能等或刷新。用「开始」二次确认动作 + 输入校验（正整数分钟，1–1440）降低误操作；用户已明确接受该取舍。
- **旧 localStorage 残留 `autoPlay`**：改后该字段被忽略，键 `musopen.listen.v1` 只保留 `history`；不做版本迁移，读旧值不影响行为。
- **e2e 时间推进**：`Date.now()` 决定到期判断，用 `page.addInitScript` 注入可控时钟优先；`page.clock`（Playwright 1.62）会一起冻结音频相关计时，仅在方案一不可行时备用。
- 线上复验必须走 `MUSIC_BASE=/music/` 构建，否则公网白屏（workflow 001 已知坑）。

## 恢复入口

1. 按 [notes_index.md](notes_index.md) 顺序推进；001 完成前 002 只能写样式草稿。
2. 代码入口：`apps/music/client/app/store/player.ts`、`apps/music/client/app/playback/use-playback.ts`、`apps/music/client/app/components/console-row.tsx`、`apps/music/client/app/components/auto-play-switch.tsx`（将被替换）、`apps/music/client/app/styles.css`、`apps/music/e2e/smoke.spec.ts`。
3. 交互口径若与本文件「决策」冲突，先改本文件再改代码。

## 进度

- 2026-11-11：Plan 建立，四条 note 已写。002 的 UI 设计定稿：`sleep-timer-control.css` + 八态预览页（sloplint 0 FAIL）；预览页与截图属过程产物，采纳后已删。
- 2026-11-11：001 002 003 完成并本地真机验收：单测 63/63、e2e 7/7、`vp check` 通过、1440/390 实测。
- 2026-11-11：005 联动开播完成（单测 63/63、e2e 8/8、真机 1440/390 验证）。
- 2026-11-11 23:02：004 部署上线并线上复验通过（`dist.bak-20261111` 可回滚）。四条 + 联动共 5 条 note 全部 completed。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
