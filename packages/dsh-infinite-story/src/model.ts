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
  links?: string[];
  focus?: string[];
  privacy?: number;
}

export interface WorldThread {
  id: string;
  title?: string;
  status?: string;
  weight?: string;
  dependsOn?: string[];
  participants?: string[];
  /** 这条线接下来可写的东西（软提示）。 */
  nextMoves?: string[];
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
  relations: WorldRelation[];
  threadIds: Set<string>;
  locationIds: Set<string>;
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
