---
name: "nano-flow优化迭代"
description: "nano-flow 迭代主线：绑定机制收口、Note 面板提示、单会话 Plan 复用与写入节奏改惰性。"
status: in_progress
---

# nano-flow优化迭代

本 Plan 是 nano-flow 的迭代主线，由三个同日 Plan 合并而成（绑定机制与 GUIDE 写入约束、Note 面板三字段悬浮提示、Plan 写入节奏改惰性）。用户规则：**一个会话里的内容默认都复用当前绑定的 Plan，新建 Plan 必须先经用户确认**，所以迭代主线收敛在这里，不再分叉。

## 范围

- [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md)：绑定表、写入路径、消费方与缺陷清单。
- [002-为GUIDE增加仅dream可写约束](002-为GUIDE增加仅dream可写约束.md)：GUIDE 正文写入边界与空模板初始化。
- [003-提供Plan绑定工具](003-提供Plan绑定工具.md)：`nano_flow_bind` 与切换语义。
- [004-移除全部隐式绑定路径](004-移除全部隐式绑定路径.md)：check/plan-log/轮转不再写绑定，已真机验收。
- [005-收敛绑定表生命周期与遗留缺陷](005-收敛绑定表生命周期与遗留缺陷.md)：R3/R4/R6/R7 修复与删除。
- [006-清理超长Plan描述](006-清理超长Plan描述.md)：21 条超限 description 压到 144 字内。
- [007-为Note面板增加三字段悬浮提示](007-为Note面板增加三字段悬浮提示.md)：description + reason + next_step。
- [008-改回深色Tooltip气泡](008-改回深色Tooltip气泡.md)：气泡换回宿主深色 Tooltip，保留整行锚点。
- [009-调研Plan写入现状与惰性化取舍](009-调研Plan写入现状与惰性化取舍.md)：把「及时写」改成「惰性写」的取舍。
- [010-单会话复用绑定Plan的规则](010-单会话复用绑定Plan的规则.md)：默认追加 note，新建 Plan 需用户确认。

## 当前结论

### 绑定（001–005）

绑定表在 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`，键是会话 id，值为 `{planPath, cwd, boundAt}`。**只有 `nano_flow_bind` 写它**，同一会话只保留一个绑定，再次调用即切换。

- `nano_flow_check` 只校验与生成索引，不写绑定；
- plan-log 只读绑定：未绑定时跟踪事件但不落盘，绑定后写当前轮与后续轮次，绑定前完成轮次不回填；
- 轮转不继承绑定，seed 只带轮转前会话绑定的只读线索，首轮先 bind；
- 看板与 `log.jsonl` 都以绑定为前提；
- 目录解析统一走 `resolvePlanDirectory`（绝对路径直通、相对路径先试绑定 cwd 再退回工作区）；目录不在时 plan-log 跳过写入并只 warn 一次，不重建旧路径；
- `nano_flow_bind` 收尾回收宿主已不存在的会话条目，存活集合取「持久化列表 ∪ 仍存活的会话」，拿不到列表就不动表。

### GUIDE（002）

GUIDE 正文只由 dream 父会话整体重写；日常 Plan 不得修改、移动或删除。`nano_flow_create` 只在文件缺失时创建空模板。

### Note 面板提示（007–008）

面板条目透传 `reason` 与 `nextStep`，悬浮整行时由宿主 `Tooltip` 显示三行：描述、`原因：…`、`下一步：…`（缺字段不出现）。锚点是整行 `.dshtk-notes-row`，否则只有标题文字能触发。宿主气泡是深色（`--dsw-alias-tooltip-bg`）且 `white-space: pre-line`，换行有效、`position: fixed` 不受面板 `overflow` 影响。浅色 `HoverCard preview` 方案试过并回退：它的宽度恒等于锚点宽减 48px，靠内容自适应改不动。

### 单会话与新建 Plan（010）

默认把新输入写成当前绑定 Plan 的 note；新建 Plan 必须先向用户说明理由并取得显式同意。`GUIDE.md` 里的旧口径由 dream 晋升时同步。

### 写入节奏（009，已定案）

旧的五处「及时写」（状态先行、每轮跑 check、每轮末写检查点、do 的「实时更新」、ask 的「就地写入」）收口为：

- **每轮最多两次批量写**：轮首一次（本轮目标与方向）、轮末一次（进度、状态、证据、spec）；同一批里一次程序写完所有受影响文件，不逐条 edit；
- **每批写完后跑一次 `nano_flow_check`**，同一批不重复跑，本批没写文件就不跑；
- **面板与索引允许一轮内滞后**，随批量写刷新；取消「状态先行」的即时更新，`blocked` 也在批量写里落盘；
- **轮末批量写是硬要求**：轮转随时可能触发，spec 进度/恢复入口与 note 的 `status`/`reason`/`next_step` 必须在轮末落盘；
- 例外：用户要求当场落盘、或要交接给别的会话/子 agent 时立即写。

## 遗留

- 测试覆盖率：全局分支约 79%，低于仓库 80% 门槛（基线同样不达标），主要在 undo/archive 与 `rotate.ts`，需单独一轮补测。
- 绑定表回收只在 `nano_flow_bind` 时触发；从不 bind 的 `$DSH_HOME` 不会自发清理死条目。
- 宿主 `HoverCard preview` 的宽度口径（锚点宽 − 48px）已记在 007，将来若要窄卡片得换锚点。

## 恢复入口

先 `nano_flow_bind` 绑定本 Plan，再读 `notes_index.md`：优先推进 009（写入节奏，等价于本 Plan 的收口条件）与 010（新规则落进提示词），008 只等真机确认。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
