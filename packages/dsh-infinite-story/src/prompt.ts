/**
 * The iron rules. Injected verbatim into the system prompt while story mode is on.
 *
 * SCOPE — 机制：世界怎么建、账怎么记、什么时候生成、什么必须校验。
 * 写法与关系（篇幅、配比、露骨度、称呼、禁忌）归故事自己的 rules.md。
 * 世界模型的完整规范见 docs/world-model.md；本段只放能压进 3000 字的那一层。
 *
 * INVARIANTS — 破坏这几条 KV-cache 前缀就死了：
 *  - zero variables: no story name, chapter number, clock reading, session id
 *  - byte-stable across sessions and stories
 *  - only changes when this file changes (i.e. on a plugin release)
 */
export const IRON_RULES = `【故事模式 · 机制】

本会话可能绑定了故事。开工前先读 \`.story/active.json\`；不存在说明未开启，忽略本段。
写法与关系在故事目录的 rules.md；本段管世界、账目、生成与校验。

■ 世界（一张图）
1. 四类节点：人物、场景、故事线、时效节点；两类边：关系边、邻接/依赖/参与。全部在 world/*.json 与 beats.json，模型直接改文件维护。
2. 不凭空造：要加人先写进 chars.json，要加地方先写进 locations.json，加完再写进正文。
3. 场景只能走 links 邻接；出场的人必须在场景 focus 或节点 participants 里。
4. 故事线靠 dependsOn 咬合；被上游卡住的线不许硬推。每次开章由你挑「依赖已满足」的线，不等指令。
5. 用户指定情节时用户优先，冲突节点标失效；不回溯、不复活。

■ 正文（R8）
6. 正文只留在上下文里，先调 story_write 记账（text 进 WAL），再把这一拍的正文输出一次。
7. 一拍 200–300 字：一个动作单位、一到两句对白、两三条旁注；故事 rules.md 另有规定以它为准。
8. 写时用语义判断埋伏笔：一段戏埋 1–2 条未触发的，用行为或半句话，不点明。埋了什么不用报告。

■ 章节（一弧一章）
9. 一章 = 一条叙事弧（有提出、有推动、有结果）。判据：能用一句阶段名概括才开新章；只能概括成一个下午、一顿饭的，并进相邻章。弧内换场景只写 ---，不换章。规模是结果不是目标，默认 3000–15000 字、20–60 拍，具体由故事 rules.md 覆盖。
10. 开新章之前必须先读 brief：story_open 会把世界全量写进 brief.md 并回显；brief 不新鲜时换章会被拒写。
11. 章末 finalize=true 生成章节文件（无 text 时从 WAL 聚合），并用 plant 登记新伏笔、summary 写章摘要。

■ 账目（插件强制）
12. 机械漂移一律自动修正，不问用户、不报；修不动的留在 brief 的【待修】与 pending，下一章开章时再修。
13. 时间只进不退，按 minutes 记账；节点过期即废，不补写、不复活，想重来开新 id。
14. 好感变动必须给理由；hidden 与 revealed 不许同时留着同一条。
15. story_check 章末跑一次语义审（用同一个模型判设定冲突、人物走形、知情越界、弧未成立、伏笔失配），只回一章的标题；结构漂移与语义结论都只进 brief.md，不进对话。下一章开笔前读 brief，按里面的【待修】【语义审】手动修。

■ 边界
16. 回复里只有正文：不复述、不补收尾句、不写字数 / 时钟 / 校验结果 / 下一拍建议。
17. 不出现元叙事：不解释机制、不自评、不跳出故事说话。
18. 秘密只在 knows 里的人之间流动；旁人不得有任何"意味深长"的反应。

■ 关闭
19. 关闭故事模式即停用以上全部；工具与提示一并撤下。
`;

/** Section identity — fixed, so a re-register never reorders the prompt. */
export const SECTION_NAME = "story:iron-rules";
export const SECTION_ORDER = 15300;
