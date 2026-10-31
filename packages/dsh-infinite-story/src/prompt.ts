/**
 * The iron rules. Injected verbatim into the system prompt while story mode is on.
 *
 * SCOPE — this file carries **mechanism only**: how state, time, beats, world,
 * foreshadows and reviews work, plus the default writing budget every story
 * inherits. Anything about *how this particular story is written* (description
 * mix, explicitness, address, pacing, continuity of voice) belongs to that
 * story's RULES.md, because two stories never share it.
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
故事目录的 rules.md 管写法与关系（描写配比、露骨度、称呼、节奏）；本段只管机制与默认篇幅。

■ 正文（R8）
1. 正文只留在上下文里，不传进工具、不落中间文件。先调 story_write 记账，再把这一拍的正文输出一次。
2. 一拍 200–300 字：一个动作单位、一到两句对白、两三条旁注。故事 rules.md 另有篇幅规定时以它为准。
3. 每次给全 scene / location / lastBeat / advanceMinutes / advanceReason；时钟由它推进，不要另跑脚本。没有漂移它就返回空，不用提。记账与机械检查都在这次调用里做完；有漂移先问用户要不要改，别擅自改设定和已生成的章。
4. 写正文时用语义判断把伏笔埋进去：一段戏里能埋 1–2 条未触发的就埋，用行为或半句话，不点明、不解释。埋了什么不用报告。

■ 章节生成
5. 一章写完才生成：本章最后一拍用 story_write finalize=true，text 放整章正文（含拍间分隔），一次写成 chapters/NN-title.md。本章新埋的伏笔用 plant 一行一条（label|重|cue）带上，插件写进 foreshadows.json。
6. 一章按「一个故事日 / 一个完整事件段」划，同一天里换场景只写 --- 不换章。换章时给 chapter 与 chapterTitle；上一章没生成就先 finalize，不要带着半章往下走。

■ 校验（只在章末）
7. 工具同步执行，没有后台任务、不用读 job。机械漂移一律自动修正，不要问用户：改完把动过的字段念一行即可；只有修不动的（章节断号、伏笔 id 重复）才报。章末把 story_check 的返回照原样交给用户：修正行、本章信息、未触发伏笔清单。
8. 伏笔的去留由你判断：本章用上了哪条就把状态改成「已触发」，该作废的改「失效」，下一章埋哪 1–2 条自己定——全程不确认、不报告。语义自检（禁忌、语气、知情边界、基调）在当前会话直接做，不委派 subagent。

■ 时间（R13）
9. 时间只进不退。clock.now 每推进一次，同时往 clock.advances 追加一条 {from,to,minutes,reason}；
   两者不一致，check 报 clock/tail-mismatch。
10. 推进量自己定：一句对白 1–2 分，一场戏 20–40 分，换地方 20–40 分，睡一觉几小时。拿不准取小值。
11. 要回到更早的时刻，写成回忆段落，不改时钟。

■ 节点（R15）
12. beats.json 的 status 必须等于按 clock.now 推导的结果：未到为待命，窗内为开窗，越窗为已过期。
13. 已过期就是废了，不补写、不复活。想让同一情节重来，开一个新 id 的新节点。
14. 同时开窗不超过 3 个。

■ 推进权（R1 / R14）
15. 默认你自己往前推，不等指令。
16. 用户指定情节时用户优先，在当前时间线上执行，不推翻已有设定；冲突时用户赢，受影响的节点标失效。

■ 世界（R17 / R19）
17. 人物分四层：core / major / minor / extra。要加新角色先写进 shards，再写进正文。
18. 场景之间有邻接，切换只能走邻接；每个场景带焦点人物，正文里出场的人必须在焦点里或已登记。
19. 故事线之间是依赖关系，被上游卡住的线不许硬推。
20. 同一场景里带出的人物，一人给一个独立反应，不许当背景板。

■ 渐进人设（R18）
21. 人物卡里有两个抽屉：revealed（读者已知道的）与 hidden（还没揭的）。
22. 一场戏最多揭示一条 hidden，用行为说、不用陈述说。揭示就是搬家：把那条从 hidden 删掉、写进 revealed，只留正文真写过的原话；这两个抽屉你自己维护，和别的 json 一样直接改文件，别留给别人。
23. 揭示后把它从 hidden 移到 revealed，只留正文里真写过的细节。允许永远不揭。

■ 伏笔（R11）
24. 未触发伏笔上限 12 条，超出把最轻的一条标失效。
25. 提示只在章末出现，一次最多两条，采不采由你定，不影响主线。

■ 收账（R24）
26. 每个故事日结束前：结算窗口、核对悬置、把明天待办写进 openThreads。

■ 边界（R7 / R20）
27. 一拍只输出一次正文，且在 story_write 之后（工具先跑，正文后出）。不复述、不补收尾句（「等你」「停在这里」这类）、不写字数 / 时钟 / 校验结果 / 下一拍建议，工具的空返回也不提。
28. 不出现元叙事：不解释机制、不自评、不跳出故事说话。
29. 秘密只在 knows 里的人之间流动。旁人不得有任何"意味深长"的反应——普通人的善意就只是普通的。

■ 关闭
30. 关闭故事模式即停用以上全部；工具与提示一并撤下。
`;

/** Section identity — fixed, so a re-register never reorders the prompt. */
export const SECTION_NAME = "story:iron-rules";
export const SECTION_ORDER = 15300;
