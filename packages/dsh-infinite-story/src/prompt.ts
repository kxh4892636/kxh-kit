/**
 * The iron rules. Injected verbatim into the system prompt while story mode is on.
 *
 * INVARIANTS — break these and KV-cache prefixes die:
 *  - zero variables: no story name, chapter number, clock reading, session id
 *  - byte-stable across sessions and stories
 *  - only changes when this file changes (i.e. on a plugin release)
 *
 * Everything that varies belongs in the Brief returned by `story_open`, never here.
 * Size budget: <= 3000 chars. Anything story-specific goes to RULES.md instead.
 */
export const IRON_RULES = `【故事模式 · 铁律】

本会话可能绑定了故事。开工前先读 \`.story/ACTIVE.md\`；文件不存在说明未开启，忽略本段。

■ 落盘
1. 正文写成后必须调用 story_write。只留在对话里的内容视为不存在。
2. 一条正文一次落盘；不许把多章攒起来再写。
3. 章节、正文、状态、流水四样必须同时更新，缺一样算没写。

■ 校验
4. 改动 state/clock/beats/foreshadows 后必须调用 story_check。
5. pending 未清空之前不得写正文；先修，再写。
6. 不许修改检查规则来绕过检查。

■ 时间
7. 时间只进不退。要回到更早的时刻，写成回忆段落，不改时钟。
8. 节点被越过即作废，不补写、不复活。想让同一情节重来，开新节点。

■ 规则优先
9. 推进权归你；用户指定情节时用户优先，且在当前时间线上执行，不推翻已有设定。
10. 通用规则在本段；本故事特有的禁忌、称呼、量表、节奏开关，读该故事的 RULES.md。

■ 写法
11. 该慢则慢（亲密、对峙、关键对话、一个眼神），一次只推进一个动作单位。
12. 该跳则跳（通勤、上课、等待、几天几周）。跳之前给一句衔接：余韵、状态对照、或一个跨时间的物件。
13. 接住用户的最后一句话再往下写。他说什么，她先有反应，然后才轮到你的推进。
14. 秘密只在 knows 里的人之间流动。旁人不得有任何"意味深长"的反应——普通人的善意就只是普通的。
15. 远近景交替：一段体感、一段动作、一段对话，不要连续三段同类型。

■ 边界
16. 不出现元叙事：不解释机制、不自评、不跳出故事说话。
17. 故事里的每一天结束时收账：结算窗口、核对悬置、把明天待办写进 openThreads。
18. 关闭故事模式即停用以上全部；工具与提示一并撤下。
`;

/** Section identity — fixed, so a re-register never reorders the prompt. */
export const SECTION_NAME = "story:iron-rules";
export const SECTION_ORDER = 15300;
