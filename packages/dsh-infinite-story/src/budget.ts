import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_BUDGET,
  type BudgetConfig,
  type GuardIssue,
  type Origin,
  type RateRule,
  type StoryBundle,
  type WorldChar,
  type WorldLocation,
  type WorldThread,
} from "./model.js";
import { LAYOUT, writeJson } from "./store.js";

/** 章末落一张快照：下一章拿它算「这一章新添了什么」。 */
export interface Snapshot {
  at: string;
  chapter: number;
  chars: string[];
  locations: string[];
  scenes: string[];
  threads: string[];
  /** 到这一章为止的累计字数（去空白）。 */
  totalChars: number;
  /** 第一次建账时的基数：总量预算从这儿算起。 */
  initial: { chars: number; locations: number; scenes: number; threads: number };
}

export interface ExpansionCounts {
  newChars: number;
  newLocations: number;
  newScenes: number;
  newThreads: number;
  /** 全场总量（相对 initial）新增了多少，用于总量预算。 */
  addedChars: number;
  addedLocations: number;
  addedScenes: number;
  addedThreads: number;
  quotients: { chars: number; locations: number; scenes: number; threads: number };
  totals: { chars: number; locations: number; scenes: number; threads: number };
}

export function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

/** reported / user 是「提一句」和「用户点名」，不花预算；其它（含未标）都要花。 */
export function isFreeOrigin(origin: Origin | undefined): boolean {
  return origin === "reported" || origin === "user";
}

export function quotaOf(rule: RateRule, chars: number): number {
  if (chars <= 0) return 0;
  return Math.min(rule.cap, Math.floor(chars / rule.rate));
}

export async function loadSnapshot(root: string): Promise<Snapshot | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, LAYOUT.snapshot), "utf8")) as Snapshot;
  } catch {
    return null;
  }
}

export function makeSnapshot(
  bundle: StoryBundle,
  chapter: number,
  totalChars: number,
  previous: Snapshot | null,
): Snapshot {
  const scenes = bundle.world.locations.flatMap((l) => l.scenes ?? []);
  const ids = {
    chars: bundle.world.chars.map((c) => c.id),
    locations: bundle.world.locations.map((l) => l.id),
    scenes: scenes.map((s) => s.id),
    threads: bundle.world.threads.map((t) => t.id),
  };
  return {
    at: bundle.clock.now,
    chapter,
    ...ids,
    totalChars,
    initial: previous?.initial ?? {
      chars: ids.chars.length,
      locations: ids.locations.length,
      scenes: ids.scenes.length,
      threads: ids.threads.length,
    },
  };
}

export async function saveSnapshot(root: string, snapshot: Snapshot): Promise<void> {
  await writeJson(path.join(root, LAYOUT.snapshot), snapshot);
}

/** 本章正文字数：直接数 WAL，跟 finalize 的统计口径一致。 */
export async function chapterChars(root: string, chapter: number): Promise<number> {
  try {
    const wal = await fs.readFile(path.join(root, LAYOUT.log, "beats.jsonl"), "utf8");
    let sum = 0;
    for (const line of wal.split("\n")) {
      if (!line.trim()) continue;
      try {
        const beat = JSON.parse(line) as { ch?: number; text?: string };
        if (beat.ch === chapter && typeof beat.text === "string") sum += countChars(beat.text);
      } catch {
        /* 坏行跳过 */
      }
    }
    return sum;
  } catch {
    return 0;
  }
}

/** 已生成章节的字数合计（不含正在写的这一章）。 */
export async function finishedChars(root: string): Promise<number> {
  try {
    const raw = await fs.readFile(path.join(root, LAYOUT.chapters, "index.json"), "utf8");
    const index = JSON.parse(raw) as Array<{ chars?: number }>;
    return index.reduce((n, e) => n + (typeof e.chars === "number" ? e.chars : 0), 0);
  } catch {
    return 0;
  }
}

function countNew<T extends { id: string; origin?: Origin | undefined }>(
  list: T[],
  before: string[],
): number {
  const seen = new Set(before);
  return list.filter((item) => !seen.has(item.id) && !isFreeOrigin(item.origin)).length;
}

export function countExpansion(
  chars: WorldChar[],
  locations: WorldLocation[],
  threads: WorldThread[],
  snapshot: Snapshot | null,
  chapterChars_: number,
  config: BudgetConfig = DEFAULT_BUDGET,
): { counts: ExpansionCounts; config: BudgetConfig } {
  const scenes = locations.flatMap((l) => l.scenes ?? []);
  const before = {
    chars: snapshot?.chars ?? chars.map((c) => c.id),
    locations: snapshot?.locations ?? locations.map((l) => l.id),
    scenes: snapshot?.scenes ?? scenes.map((s) => s.id),
    threads: snapshot?.threads ?? threads.map((t) => t.id),
  };
  const initial = snapshot?.initial ?? {
    chars: chars.length,
    locations: locations.length,
    scenes: scenes.length,
    threads: threads.length,
  };
  const counts: ExpansionCounts = {
    newChars: countNew(chars, before.chars),
    newLocations: countNew(locations, before.locations),
    newScenes: countNew(scenes, before.scenes),
    newThreads: countNew(threads, before.threads),
    addedChars: Math.max(0, chars.length - initial.chars),
    addedLocations: Math.max(0, locations.length - initial.locations),
    addedScenes: Math.max(0, scenes.length - initial.scenes),
    addedThreads: Math.max(0, threads.length - initial.threads),
    quotients: {
      chars: quotaOf(config.chars, chapterChars_),
      locations: quotaOf(config.locations, chapterChars_),
      scenes: quotaOf(config.scenes, chapterChars_),
      threads: quotaOf(config.threads, chapterChars_),
    },
    totals: {
      chars: quotaOf(config.chars, (snapshot?.totalChars ?? 0) + chapterChars_),
      locations: quotaOf(config.locations, (snapshot?.totalChars ?? 0) + chapterChars_),
      scenes: quotaOf(config.scenes, (snapshot?.totalChars ?? 0) + chapterChars_),
      threads: quotaOf(config.threads, (snapshot?.totalChars ?? 0) + chapterChars_),
    },
  };
  return { counts, config };
}

export interface ExpansionInput {
  snapshot: Snapshot | null;
  chapter: number;
  chapterChars: number;
}

const AMOUNT_NAME: Record<string, string> = {
  chars: "新人物",
  locations: "新地点",
  scenes: "新场景（子场景）",
  threads: "新故事线",
};

/**
 * 扩张预算：新内容随字数走。
 * - expand/over：这一章添的超了章内字数买得起的额度
 * - expand/total：总量超了全书累计字数买得起的额度
 * - expand/stagnant：写得够长却什么都没添，在同一个屋子里打转
 * - expand/short：章太短就添人添景，硬塞
 */
export function guardExpansion(bundle: StoryBundle, input: ExpansionInput): GuardIssue[] {
  const chapterKnown = input.chapterChars > 0;
  if (!chapterKnown && !input.snapshot) return [];
  const { counts, config } = countExpansion(
    bundle.world.chars,
    bundle.world.locations,
    bundle.world.threads,
    input.snapshot,
    input.chapterChars,
    bundle.state.budget ?? DEFAULT_BUDGET,
  );
  const issues: GuardIssue[] = [];
  const chapter = input.chapter;

  const pairs: Array<{
    key: "chars" | "locations" | "scenes" | "threads";
    used: number;
    allow: number;
    rate: number;
    cap: number;
    totalUsed: number;
    totalAllow: number;
  }> = [
    {
      key: "chars",
      used: counts.newChars,
      allow: counts.quotients.chars,
      rate: config.chars.rate,
      cap: config.chars.cap,
      totalUsed: counts.addedChars,
      totalAllow: counts.totals.chars,
    },
    {
      key: "locations",
      used: counts.newLocations,
      allow: counts.quotients.locations,
      rate: config.locations.rate,
      cap: config.locations.cap,
      totalUsed: counts.addedLocations,
      totalAllow: counts.totals.locations,
    },
    {
      key: "scenes",
      used: counts.newScenes,
      allow: counts.quotients.scenes,
      rate: config.scenes.rate,
      cap: config.scenes.cap,
      totalUsed: counts.addedScenes,
      totalAllow: counts.totals.scenes,
    },
    {
      key: "threads",
      used: counts.newThreads,
      allow: counts.quotients.threads,
      rate: config.threads.rate,
      cap: config.threads.cap,
      totalUsed: counts.addedThreads,
      totalAllow: counts.totals.threads,
    },
  ];

  for (const p of pairs) {
    if (chapterKnown && p.used > p.allow) {
      issues.push({
        level: "error",
        code: "expand/over",
        message: `第 ${chapter} 章${AMOUNT_NAME[p.key]}添了 ${p.used} 个，本章 ${input.chapterChars} 字只买得起 ${p.allow} 个（每 ${p.rate} 字 1 个，单章最多 ${p.cap} 个）`,
        fix: '把多出来的那个改成 origin:"reported"（只在台词里提一句），或挪到后面的章，或删掉',
      });
    }
    if (p.totalUsed > p.totalAllow) {
      issues.push({
        level: "error",
        code: "expand/total",
        message: `全书${AMOUNT_NAME[p.key]}共 ${p.totalUsed} 个，累计字数只买得起 ${p.totalAllow} 个`,
        fix: "停一停扩张，把已有的写深；或把不用的降级成 reported / 删掉",
      });
    }
  }

  const added = counts.newChars + counts.newLocations + counts.newScenes + counts.newThreads;
  if (chapterKnown && input.chapterChars >= config.stagnantAfter && added === 0) {
    issues.push({
      level: "warn",
      code: "expand/stagnant",
      message: `第 ${chapter} 章已有 ${input.chapterChars} 字，没添新人物、新场景、新故事线——在一个屋子里打转`,
      fix: "调一个人进来，或把线推到另一个场景；实在不需要，就承认这一章是过场，别撑这么长",
    });
  }
  if (chapterKnown && input.chapterChars < config.shortBelow && added > 0) {
    issues.push({
      level: "error",
      code: "expand/short",
      message: `第 ${chapter} 章只有 ${input.chapterChars} 字就添了 ${added} 个新东西，撑不住`,
      fix: "把这一章写够（至少 3000 字），或把新东西挪到下一章",
    });
  }

  return issues;
}
