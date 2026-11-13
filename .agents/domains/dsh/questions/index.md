# Questions

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description |
| --- | --- |
| [001-desktop-dump-config报错](001-desktop-dump-config报错.md) | 在 desktop profile 上执行 --dump-config 等 boot 类命令时报独占托管错误。 |
| [002-PATH上的dsh不能装desktop插件](002-PATH上的dsh不能装desktop插件.md) | PATH 上的 dsh 与 desktop 宿主版本不一致，装 desktop 插件会写错 profile。 |
| [003-desktop-profile报缺少peer](003-desktop-profile报缺少peer.md) | desktop profile 执行 pnpm peers check 时报缺少 @deepseek-ai/* peer。 |
| [004-插件被判定incompatible](004-插件被判定incompatible.md) | dsh plugin add 输出插件与当前 DSH 版本不兼容时如何对齐声明。 |
| [005-DSH出站流量走本机代理](005-DSH出站流量走本机代理.md) | 系统代理已开启但 DSH 的 LLM / web 搜索 / web fetch / MCP 仍直连。 |
| [006-宿主不能原地删除或截断会话](006-宿主不能原地删除或截断会话.md) | 想让同一 session id 回到上一轮结束状态时，宿主没有原地截断能力。 |
| [007-恢复Plan为什么只读](007-恢复Plan为什么只读.md) | 恢复已有 Plan 时模型直接开工，未经确认就改文件或跑构建。 |
| [008-预设出现但提示词或工具缺失](008-预设出现但提示词或工具缺失.md) | Nano Flow 预设可选，但会话里没有提示词、nano_flow_* 工具或随包 skill。 |
| [009-第三方插件自定义会话事件导致历史加载失败](009-第三方插件自定义会话事件导致历史加载失败.md) | 插件用 session.append 写自定义事件后，宿主重启冷读会话日志会拒绝整条历史。 |
| [010-宿主悬浮提示的锚点与宽度](010-宿主悬浮提示的锚点与宽度.md) | 宿主 Tooltip 事件绑在子元素上、气泡只能整块深色或用 HoverCard preview；悬浮提示不触发或内容留白时的定位规则。 |
| [011-dream找不到游标路径](011-dream找不到游标路径.md) | 在 PTC 会话里调 nano_flow_dream 报找不到游标路径：默认走 $DSH_HOME，工具进程没有该变量时改传 statePath。 |
| [012-dream扫描提示跳过的记录](012-dream扫描提示跳过的记录.md) | scan 报告的「需要留意」大多来自 pi 的 run 轨迹：dsh 只解析 type:turn，pi 记录整份被跳过，不算损坏。 |
| [013-随包skill缺description被静默丢弃](013-随包skill缺description被静默丢弃.md) | SKILL.md 的 frontmatter 缺 description 或写成空值，包内 provider 直接跳过该目录，没有任何报错，斜杠菜单和 skill 列表都不会出现它。 |
