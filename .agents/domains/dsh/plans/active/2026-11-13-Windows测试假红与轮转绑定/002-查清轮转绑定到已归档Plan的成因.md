---
name: "002-查清轮转绑定到已归档Plan的成因"
description: "查清轮转继承旧绑定、Plan 迁 reference 后绑定不失效，导致新会话把已归档的 music Plan 当成 active 并重建幽灵目录的原因与修法。"
status: completed
related_noted:
  - 001-修掉Windows上假红的单测
next_step: "已完成；修法建议待用户决定是否实施"
---

# 002-查清轮转绑定到已归档Plan的成因

## 结论

这次绑定错位是**运行中的 0.5.37**（安装 0.5.50 后没重启宿主）的自动绑定 + 重建目录，被 0.5.50 的轮转过继「只认目录存在」接了过去。四步链条，每步都有代码或磁盘证据：

1. **残留目录有了 Plan 的形状** —— 用户 pull 带入了 music Plan 从 `active` 迁 `reference` 的提交；`log.jsonl` 被 `.gitignore` 忽略，所以 `plans/active/2026-11-11-自动播放倒计时/` 作为只含日志的空壳留了下来。
2. **0.5.37 自动绑定把它当成唯一的 active Plan** —— `plan-log-service.ts` 的 `ensureBound`（0.5.37 第 158-182 行）在会话没有绑定且 `plansFor(cwd).length === 1` 时直接写入绑定；`plansFor` 来自 `notes.ts` 的 `listActivePlans`，**只列 `plans/active/` 下的目录，不检查 `spec.md`**。当时工作区没有其它 active Plan，于是残留目录被选中，`session-364ac2aa` 在 19:23:39 被绑到它。
3. **写轨迹把目录重建** —— 上一会话在 19:23 前后删过这个残留目录，但 19:24:35 该轮结束时轨迹追加又 `mkdir -p` 建了回来（`plan-log.ts` 的追加写先建父目录）。0.5.37 没有 `da346fdc`（2026-11-09 14:22）加的「目录不存在就跳过写轨迹」防护，该防护最早随 0.5.40 发布；宿主进程仍加载 0.5.37，所以防护不生效。
4. **轮转过继 + 自动校验把它继承下来** —— 19:27:45 轮转时 `inheritPlanBinding`（`src/index.ts`）调 `adoptBinding`，而 `inheritedPlanDirectory`（`plan-log.ts:332-342`）只用 `exists(directory)` 判断可用性：目录刚被重建，于是过继成功，seed 写「恢复当前 Plan：music/active/…」。新会话的自动校验随后在一个只有 `log.jsonl` 的目录上跑，报 `spec.md` 缺失。

## 证据

- 绑定表 `~/.dsh/toolkit/nano-flow-plan-bindings.json`：`session-364ac2aa`（`boundAt 2026-11-13T11:23:39Z`）与本会话 `session-0ee8c408`（`11:27:45Z`）都指向该 active 路径。
- 幽灵目录 `plans/active/2026-11-11-自动播放倒计时/` 的创建时间 = 19:24:35，正是上一会话第一轮结束、首次追加轨迹的时刻；内容只有 `log.jsonl` 与校验生成的 `notes_index.md`。
- 该 `log.jsonl` 的 header 记录 `planPath` 就是这条 active 路径，`boundAt` 与绑定表一致。
- 0.5.37 `listActivePlans`（`notes.ts:62-85`）逐目录列举、无 `spec.md` 判断；0.5.50 的 `ensureBound` 已不再自动绑定（无 stored binding 直接 return）。

## 修法候选

1. **过继校验「是 Plan」而不是「目录存在」**（推荐，最小）：`inheritedPlanDirectory` 增加 `exists(join(directory, "spec.md"))`，不合格就不过继，seed 退回「先 bind」。代价：多一次 `stat`，语义与 `listPlans` 的「spec 即存在」一致。
2. **迁移 Plan 时同步绑定表**：迁 `active → reference` 时改写所有指向旧路径的条目。代价：迁移发生在 git/手工，插件没有钩子，靠人记着不现实。
3. **校验器对「目录里没有 spec.md」报得更直白**：现在只说 spec 缺失，看不出是 Plan 被迁走了。属于体验改进，不解决根因。

## 遗留风险

- 若旧版本留下的幽灵目录还在，0.5.50 的过继仍会认它（本次就是），所以候选 1 值得做。
- 运行中的 0.5.37 已经造成过破坏面（自动绑定 + 重建目录），重启宿主后才能用上 0.5.50 的防护。
