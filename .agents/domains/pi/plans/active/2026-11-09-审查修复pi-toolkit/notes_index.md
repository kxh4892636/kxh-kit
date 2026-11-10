# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-校验器自动修复不再写坏文件](001-校验器自动修复不再写坏文件.md) | nano_flow_check 的两条自动修复不收敛：spec 的追踪表在章节位置不合法时被反复追加，多行字段折叠遇到块标量里的空行时每跑一次再抄一遍。修完后重复校验不再改变文件。 | 002-命名规则只留一份 |
| [002-命名规则只留一份](002-命名规则只留一份.md) | nano_flow_create 与 nano_flow_check 各写一份 name 规则，create 能造出 check 必然拒绝且修不回来的 note。把判定收敛到 base.mjs 的 nameProblem，两边共用。 | 001-校验器自动修复不再写坏文件 |
| [003-搜索问题剥掉skill块](003-搜索问题剥掉skill块.md) | 有 skill 展开时用户消息以 <skill …> 块开头，web_search 的 ori_question 于是变成 skill 样板文字而不是问题。复用 naming/name.ts 的剥离逻辑。 | — |
| [004-配置与文档写入原子化](004-配置与文档写入原子化.md) | 配置文件、spec、note、索引都是 writeFileSync 原地覆盖，中断会留下空文件或半截文件。改成写同目录临时文件再 rename。 | — |
| [005-轨迹序号不再整文件解析](005-轨迹序号不再整文件解析.md) | plan 轨迹每轮整文件读取并逐行 JSON.parse 只为算 run 序号，实测 3.5MB/12ms 且文件无轮转。改为按写入前缀数行，不做解析。 | — |
| [006-rpc模式空回答对齐TUI](006-rpc模式空回答对齐TUI.md) | rpc/print 模式下空的自定义回答被记成有效答案（A1 为空但 skipped=false），TUI 则留在原题。让两种模式同一条空输入规则。 | — |
| [007-删除不可达CLI与重复渲染](007-删除不可达CLI与重复渲染.md) | check-domain.mjs 的命令行入口与 lib/report.mjs 没有任何调用方（无 bin、无子进程），同一段报错渲染还存在三份。删除不可达代码并只留一处渲染。 | 010-合并frontmatter解析器 |
| [008-模板与README对齐规则](008-模板与README对齐规则.md) | note 模板自带只有 blocked 才能写的 reason:，README 的随包 skill 清单少了 ponytail-audit 与 ponytail-review。两处按实际规则与目录改正。 | — |
| [009-侧栏关闭后不再读盘](009-侧栏关闭后不再读盘.md) | turn_end 无条件刷新侧栏，即使侧栏已拆掉或 nano-flow 关着，仍然每轮重读绑定 Plan 的 note 文件。refresh 加 mounted 守卫。 | — |
| [010-合并frontmatter解析器](010-合并frontmatter解析器.md) | 侧栏 notes.ts 与校验脚本 base.mjs 各有一个 YAML 头解析器，规则会各改各的。保留 base.mjs 的实现，notes.ts 改为复用。 | 007-删除不可达CLI与重复渲染 |
