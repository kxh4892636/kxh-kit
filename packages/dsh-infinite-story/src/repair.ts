import path from "node:path";
import { promises as fs } from "node:fs";
import { deriveBeatStatus, guard } from "./guard.js";
import { levelOf, type GuardIssue, type StoryBundle } from "./model.js";
import { LAYOUT, writeJson } from "./store.js";

/**
 * 机械漂移的自我修复。凡是「按现有数据能唯一算出来」的字段，直接改，
 * 不问人；改完把动过哪些地方列出来。算不出来的（章节断号、伏笔 id 重复）
 * 仍然只报。
 */
export interface RepairResult {
  fixed: string[];
  remaining: GuardIssue[];
}

export async function autoRepair(bundle: StoryBundle, chapters: string[]): Promise<RepairResult> {
  const fixed: string[] = [];
  const { state, clock } = bundle;

  // 1. 节点状态：按 clock.now 重新推导
  let beatsChanged = false;
  for (const beat of bundle.beats) {
    const want = deriveBeatStatus(beat, Date.parse(clock.now));
    if (beat.status !== want) {
      beat.status = want;
      beatsChanged = true;
      fixed.push(`${beat.id} → ${want}`);
    }
  }
  if (beatsChanged) await writeJson(path.join(bundle.root, LAYOUT.beats), bundle.beats);

  // 2. 时间账：丢掉倒退与乱序的条目，尾部对不齐就补一条
  let advancesChanged = false;
  const cleaned = [];
  let prev = Number.NEGATIVE_INFINITY;
  for (const advance of clock.advances) {
    const from = Date.parse(advance.from);
    const to = Date.parse(advance.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to < prev) {
      advancesChanged = true;
      fixed.push(`删除错乱的时间账：${advance.reason}`);
      continue;
    }
    prev = to;
    cleaned.push(advance);
  }
  clock.advances = cleaned;
  const now = Date.parse(clock.now);
  const tail = clock.advances.at(-1);
  if (Number.isFinite(now)) {
    if (tail && Date.parse(tail.to) !== now && Date.parse(tail.to) < now) {
      clock.advances.push({
        from: tail.to,
        to: clock.now,
        minutes: Math.round((now - Date.parse(tail.to)) / 60_000),
        reason: "自动对齐",
      });
      advancesChanged = true;
      fixed.push("补齐尾部时间账");
    } else if (tail && Date.parse(tail.to) > now) {
      clock.now = tail.to;
      advancesChanged = true;
      fixed.push(`clock.now 回不到过去，改到 ${tail.to}`);
    }
  }
  if (advancesChanged) await writeJson(path.join(bundle.root, LAYOUT.clock), bundle.clock);

  // 3. cursor：时间、章文件、好感度等级
  let stateChanged = false;
  if (state.cursor.storyTime !== clock.now) {
    state.cursor.storyTime = clock.now;
    stateChanged = true;
    fixed.push("cursor.storyTime 对齐 clock.now");
  }
  const actual = chapters.find((name) =>
    name.startsWith(String(state.cursor.chapter).padStart(2, "0") + "-"),
  );
  if (actual && actual !== state.cursor.chapterFile) {
    state.cursor.chapterFile = actual;
    stateChanged = true;
    fixed.push(`cursor.chapterFile → ${actual}`);
  }
  for (const [name, item] of Object.entries(state.affinity)) {
    const level = levelOf(item.value);
    if (item.level !== level) {
      item.level = level;
      stateChanged = true;
      fixed.push(`${name} 好感等级 → ${level}`);
    }
  }
  if (stateChanged) await writeJson(path.join(bundle.root, LAYOUT.story), state);

  // 4. 伏笔超限：最轻的一条标失效
  const open = bundle.foreshadows.filter((f) => f.status === "未触发");
  if (open.length > 12) {
    const weightOrder = { 轻: 0, 中: 1, 重: 2 } as const;
    const victim = [...open].sort((a, b) => weightOrder[a.weight] - weightOrder[b.weight])[0];
    if (victim) {
      victim.status = "失效";
      await writeJson(path.join(bundle.root, LAYOUT.foreshadows), bundle.foreshadows);
      fixed.push(`${victim.id} 标为失效（未触发上限 12）`);
    }
  }

  // 4.5 世界图：单向 link 补成双向
  let linksChanged = false;
  for (const loc of bundle.world.locations) {
    for (const link of loc.links ?? []) {
      const back = bundle.world.locations.find((l) => l.id === link);
      if (back && !(back.links ?? []).includes(loc.id)) {
        back.links = [...(back.links ?? []), loc.id];
        linksChanged = true;
        fixed.push(`${back.id}.links 补回 ${loc.id}`);
      }
    }
  }
  if (linksChanged) {
    const file = path.join(bundle.root, LAYOUT.locations);
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as any;
    if (Array.isArray(raw)) {
      for (const loc of bundle.world.locations) {
        const hit = raw.find((l: any) => l?.id === loc.id);
        if (hit) hit.links = loc.links;
      }
      await writeJson(file, raw);
    }
  }

  // 5. 渐进人设：同一句同时留在 revealed 与 hidden —— 从 hidden 删掉
  let charsChanged = false;
  for (const char of bundle.world.chars) {
    const revealed = char.revealed ?? [];
    const hidden = char.hidden ?? [];
    const keep = hidden.filter(
      (item) => !revealed.some((r) => item && (r.includes(item) || item.includes(r))),
    );
    if (keep.length !== hidden.length) {
      char.hidden = keep;
      charsChanged = true;
      fixed.push(`${char.name} 的 hidden 清掉 ${hidden.length - keep.length} 条已揭示项`);
    }
  }
  if (charsChanged) {
    const file = path.join(bundle.root, LAYOUT.chars);
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
    const flat = Array.isArray(raw) ? (raw as any[]) : null;
    if (flat) {
      for (const char of bundle.world.chars) {
        const hit = flat.find((c) => c?.id === char.id);
        if (hit) hit.hidden = char.hidden;
      }
      await writeJson(file, flat);
    } else {
      for (const tier of ["core", "major", "minor", "extra"]) {
        const list = (raw as any)?.[tier];
        if (!Array.isArray(list)) continue;
        for (const char of bundle.world.chars) {
          const hit = list.find((c: any) => c?.id === char.id);
          if (hit) hit.hidden = char.hidden;
        }
      }
      await writeJson(file, raw);
    }
  }

  const remaining = guard({ bundle, chapters });
  return { fixed, remaining };
}
