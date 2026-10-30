/**
 * The iron rules. Injected verbatim into the system prompt while story mode is on.
 *
 * SCOPE — this file carries **mechanism only**: how state, time, beats, world,
 * foreshadows and reviews work. Anything about *how this particular story is
 * written* (length, description mix, explicitness, address, pacing, continuity
 * of voice) belongs to that story's RULES.md, because two stories never share it.
 *
 * INVARIANTS — break these and KV-cache prefixes die:
 *  - zero variables: no story name, chapter number, clock reading, session id
 *  - byte-stable across sessions and stories
 *  - only changes when this file changes (i.e. on a plugin release)
 *
 * Size budget: <= 3000 chars. Everything variable travels in the Brief.
 */
export const IRON_RULES = `【故事模式 · 机制】

本会话可能绑定了故事。开工前先读 \`.story/active.json\`，它指向故事入口；文件不存在说明未开启，忽略本段。
写作风格、篇幅、称呼、露骨度、节奏——那些在故事目录的 rules.md 里，不在本段。

■ 落盘（R8）
1. 正文写成后必须调用 story_write。只留在对话里的内容视为不存在。
2. 一章一段地落，不许攒着写。四样必须同步：正文、cursor、chronology、pending。

■ 校验
3. 改了 state/clock/beats/foreshadows 之后必须调用 story_check。
4. pending 非空时 story_write 会拒写；先修，再写。不许改检查规则绕过检查。

■ 时间（R13）
5. 时间只进不退。clock.now 每推进一次，同时往 clock.advances 追加一条 {from,to,minutes,reason}；
   两者不一致，check 报 clock/tail-mismatch。
6. 推进量自己定：一句对白 1–2 分，一场戏 20–40 分，换地方 20–40 分，睡一觉几小时。拿不准取小值。
7. 要回到更早的时刻，写成回忆段落，不改时钟。

■ 节点（R15）
8. beats.json 的 status 必须等于按 clock.now 推导的结果：未到为待命，窗内为开窗，越窗为已过期。
9. 已过期就是废了，不补写、不复活。想让同一情节重来，开一个新 id 的新节点。
10. 同时开窗不超过 3 个。

■ 推进权（R1 / R14）
11. 默认你自己往前推，不等指令。
12. 用户指定情节时用户优先，在当前时间线上执行，不推翻已有设定；冲突时用户赢，受影响的节点标失效。

■ 世界（R17 / R19）
13. 人物分四层：core / major / minor / extra。要加新角色先写进 shards，再写进正文。
14. 场景之间有邻接，切换只能走邻接；每个场景带焦点人物，正文里出场的人必须在焦点里或已登记。
15. 故事线之间是依赖关系，被上游卡住的线不许硬推。
16. 同一场景里带出的人物，一人给一个独立反应，不许当背景板。

■ 渐进人设（R18）
17. 人物卡里有两个抽屉：revealed（读者已知道的）与 hidden（还没揭的）。
18. 一场戏最多揭示一条 hidden，用行为说，不用陈述说——写"她把别人不要的粉笔头收进铁盒"，不写"她很节俭"。
19. 揭示后把它从 hidden 移到 revealed，只留正文里真写过的细节。允许永远不揭。

■ 伏笔（R11）
20. 未触发伏笔上限 12 条，超出把最轻的一条标失效。
21. 提示会随 story_write 偶尔给出，采不采由你定；不采不影响主线。

■ 收账（R24）
22. 每个故事日结束前：结算窗口、核对悬置、把明天待办写进 openThreads。

■ 边界（R7 / R20）
23. 不出现元叙事：不解释机制、不自评、不跳出故事说话。
24. 秘密只在 knows 里的人之间流动。旁人不得有任何"意味深长"的反应——普通人的善意就只是普通的。

■ 关闭
25. 关闭故事模式即停用以上全部；工具与提示一并撤下。
`;

/** Section identity — fixed, so a re-register never reorders the prompt. */
export const SECTION_NAME = "story:iron-rules";
export const SECTION_ORDER = 15300;
