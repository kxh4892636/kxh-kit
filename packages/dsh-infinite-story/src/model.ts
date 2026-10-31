/** Story state model. Everything here is plain JSON — no classes, no dates. */

export type ISO = string;

export interface Cursor {
  chapter: number;
  chapterFile: string;
  scene: string;
  storyTime: ISO;
  location: string;
  lastBeat: string;
  /** 场景 id（world/locations.json 里的 id）。 */
  locationId?: string;
  /** 这一章主导的故事线 id（world/groups.json）。贯穿全文那条永远在场，不必标。 */
  group?: string;
}

export interface Affinity {
  value: number;
  level: string;
}

export interface StoryState {
  version: 1;
  story: string;
  updatedAt: ISO;
  cursor: Cursor;
  openThreads: string[];
  affinity: Record<string, Affinity>;
  meters: Record<string, number>;
  /** 扩张预算：新内容随字数走，不随心情走。缺省用 DEFAULT_BUDGET。 */
  budget?: BudgetConfig;
  /** 卷：按章节顺序每 10 章一卷，每卷一份 chapters/<C>/index.md（概述 + 节点索引）。 */
  chunks?: Array<{ id: string; title?: string; overview?: string }>;
}

/** 一个新条目是怎么来的。reported / user 不占预算，只上场的才算。 */
export type Origin = "user" | "met" | "reported" | "unknown";

export interface RateRule {
  /** 多少字换一个额度。 */
  rate: number;
  /** 单章封顶。 */
  cap: number;
}

export interface BudgetConfig {
  chars: RateRule;
  locations: RateRule;
  /** 子场景：一个地点下面的房间/角落。比开新地点便宜，所以配额宽一些。 */
  scenes: RateRule;
  threads: RateRule;
  /** 本章超过这个字数却一个新东西都没添，算原地打转。 */
  stagnantAfter: number;
  /** 不足这个字数就添人添景，算硬塞。 */
  shortBelow: number;
}

/**
 * 比例取自长篇的实测密度：有名角色约 1 万–2.6 万字一个，主要活动场所
 * 约 2 万–5 万字一个（红楼梦 73 万字 30 个场所，金瓶梅 100 万字 20 个）。
 * 配额随章内字数涨，但一封顶就顶死，靠写长来换人换景换不通。
 */
export const DEFAULT_BUDGET: BudgetConfig = {
  chars: { rate: 10000, cap: 2 },
  locations: { rate: 30000, cap: 1 },
  scenes: { rate: 8000, cap: 3 },
  threads: { rate: 40000, cap: 1 },
  stagnantAfter: 8000,
  shortBelow: 3000,
};

/** 地点下面的一间屋子、一个角落。正文的 `scene` 就是它。 */
export interface WorldScene {
  id: string;
  name: string;
  origin?: Origin;
  note?: string;
}

export interface Advance {
  from: ISO;
  to: ISO;
  minutes: number;
  reason: string;
}

export interface Clock {
  now: ISO;
  advances: Advance[];
}

export type BeatStatus = "待命" | "开窗" | "已完成" | "已过期";

export interface Beat {
  id: string;
  title: string;
  opensAt: ISO;
  expiresAt: ISO;
  status: BeatStatus;
  payload?: string;
}

export type ForeshadowStatus = "未触发" | "已触发" | "失效";

export interface Foreshadow {
  id: string;
  label: string;
  weight: "轻" | "中" | "重";
  status: ForeshadowStatus;
  cue: string;
}

export interface GuardIssue {
  level: "error" | "warn";
  code: string;
  message: string;
  fix?: string;
}

/** World data. Structural only — semantics stay with the writer and the reviewer. */
export interface WorldChar {
  id: string;
  name: string;
  /** 这个角色怎么来的；reported / user 不占扩张预算。 */
  origin?: Origin;
  tier?: string;
  knows?: string[];
  affinity?: { value: number; level: string } | null;
  /** 读者已经看见的那些细节。 */
  revealed?: string[];
  /** 还没揭的那些——一次只搬一条。 */
  hidden?: string[];
}

export interface WorldLocation {
  id: string;
  name: string;
  /** 这个地点怎么来的；reported / user 不占扩张预算。 */
  origin?: Origin;
  /** 这个地点下面的子场景。正文的 `scene` 必须是其中之一。 */
  scenes?: WorldScene[];
  links?: string[];
  focus?: string[];
  privacy?: number;
}

/** 一条线下面的一个故事节点：这段戏要落到的那件事。 */
export interface ThreadNode {
  id: string;
  title: string;
  status?: "待" | "进行" | "完成";
  note?: string;
}

export interface WorldThread {
  id: string;
  title?: string;
  /** 这条线怎么来的；reported / user 不占扩张预算。 */
  origin?: Origin;
  /** 归属哪条故事线（groups.json 里的 id）。 */
  group?: string;
  /** 这条线下面挂着的故事节点，按顺序走。 */
  nodes?: ThreadNode[];
  status?: string;
  weight?: string;
  dependsOn?: string[];
  participants?: string[];
  /** 这条线接下来可写的东西（软提示）。 */
  nextMoves?: string[];
}

/**
 * 故事线（storyline）：一条故事线 = 一条主线 + 若干支线。
 * 一个故事有几条故事线，其中恰好一条是贯穿全文的（throughline）。
 */
export interface ThreadGroup {
  id: string;
  title: string;
  /** 贯穿全文的那条故事线；全篇恰好一条。 */
  throughline?: boolean;
  /** 这条线到目前为止讲到哪儿了（写进 chapters/<GROUP>/index.md 的开头）。 */
  overview?: string;
  origin?: Origin;
  note?: string;
}

export interface WorldRelation {
  a: string;
  b: string;
  type?: string;
}

export interface World {
  /** Every entity id that may be referenced: characters plus the protagonist. */
  ids: Set<string>;
  chars: WorldChar[];
  locations: WorldLocation[];
  threads: WorldThread[];
  /** 故事线（一组主+支）。 */
  groups: ThreadGroup[];
  relations: WorldRelation[];
  threadIds: Set<string>;
  locationIds: Set<string>;
  /** 所有地点下的子场景 id。 */
  sceneIds: Set<string>;
}

/** Everything `story_open` needs, loaded in one shot. */
export interface StoryBundle {
  id: string;
  root: string;
  state: StoryState;
  clock: Clock;
  beats: Beat[];
  foreshadows: Foreshadow[];
  world: World;
}

export const LEVELS: ReadonlyArray<readonly [number, string]> = [
  [85, "亲密"],
  [60, "亲近"],
  [30, "熟络"],
  [0, "中立"],
  [-49, "冷淡"],
  [-Infinity, "敌意"],
];

export function levelOf(value: number): string {
  for (const [floor, name] of LEVELS) if (value >= floor) return name;
  return "敌意";
}
