import type { Foreshadow } from "./model.js";

/**
 * Foreshadow bookkeeping — storage helpers only.
 *
 * 认不认得出伏笔、要不要埋、哪条该揭，全是语义判断，交给会话里的模型；
 * 这里只负责“写进去”这一步该做的事：算下一个 id、查重、守上限。
 */

export const MAX_OPEN_FORESHADOWS = 12;

export interface Seed {
  label: string;
  cue: string;
  weight: Foreshadow["weight"];
}

/** 下一条 id：F + 现有最大号 + 1。 */
export function nextId(existing: Foreshadow[]): string {
  let max = 0;
  for (const item of existing) {
    const n = Number.parseInt(item.id.replace(/^F/, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `F${String(max + 1).padStart(2, "0")}`;
}

/** 同一条伏笔：label 完全相同就算重复（语义上的近似由模型判断，不再用词表猜）。 */
export function isDuplicate(seed: Seed, existing: Foreshadow[]): boolean {
  const label = seed.label.trim();
  return existing.some((f) => f.label.trim() === label);
}

/** `label|cue` 或 `label|重|cue`，一行一条。 */
export function parseSeeds(declared: string | undefined): Seed[] {
  const seeds: Seed[] = [];
  for (const line of (declared ?? "").split("\n")) {
    const parts = line
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const weight = (["重", "中", "轻"] as const).find((w) => parts.includes(w)) ?? "中";
    const [label, cue] = parts.filter((p) => !["重", "中", "轻"].includes(p));
    if (label && cue) seeds.push({ label, cue, weight });
  }
  return seeds;
}
