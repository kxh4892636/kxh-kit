import { guardExpansion, type ExpansionInput } from "./budget.js";
import { levelOf, type Beat, type BeatStatus, type GuardIssue, type StoryBundle } from "./model.js";

const MINUTE = 60_000;

function time(value: string): number {
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new Error(`无法解析时间：${value}`);
  return t;
}

/** What a beat's status must be, given the story clock. */
export function deriveBeatStatus(beat: Beat, now: number): BeatStatus {
  if (beat.status === "已完成") return "已完成";
  if (now >= time(beat.expiresAt)) return "已过期";
  if (now >= time(beat.opensAt)) return "开窗";
  return "待命";
}

export function minutesBetween(from: string, to: string): number {
  return Math.round((time(to) - time(from)) / MINUTE);
}

/** Beats opening within `hours` of now, soonest first. */
export function upcoming(beats: Beat[], now: number, hours = 48): Beat[] {
  return beats
    .filter(
      (b) =>
        (b.status === "待命" || b.status === "开窗") &&
        time(b.expiresAt) > now &&
        time(b.opensAt) < now + hours * 60 * MINUTE,
    )
    .sort((a, b) => time(a.opensAt) - time(b.opensAt));
}

export interface GuardInput {
  bundle: StoryBundle;
  /** Chapter file names, e.g. "00-夜里.md". Sorted or not, we sort. */
  chapters: string[];
  /** Chapter being written right now — its file appears only at finalize, so its absence is not an error. */
  unwrittenChapter?: number;

  /** Files referenced by WORLD.md; used to detect dangling links. */
  shardFiles?: string[];

  /** 扩张预算的输入：章末快照 + 本章字数。不给就不查扩张。 */
  expansion?: ExpansionInput;
}

/**
 * L0 structural + L1 consistency. Pure: everything it needs is passed in.
 * Returns [] when the story is coherent.
 */
export function guard(input: GuardInput): GuardIssue[] {
  const { bundle, chapters } = input;
  const issues: GuardIssue[] = [];
  const now = time(bundle.clock.now);

  // ---- clock ----
  if (bundle.state.cursor.storyTime !== bundle.clock.now) {
    issues.push({
      level: "error",
      code: "clock/cursor-drift",
      message: `cursor.storyTime(${bundle.state.cursor.storyTime}) 与 clock.now(${bundle.clock.now}) 不一致`,
      fix: "把 state.cursor.storyTime 改成 clock.now 的值",
    });
  }

  let prev = -Infinity;
  for (const [i, a] of bundle.clock.advances.entries()) {
    const to = time(a.to);
    const from = time(a.from);
    if (to < from) {
      issues.push({
        level: "error",
        code: "clock/backwards",
        message: `advances[${i}] 时间倒退：${a.from} → ${a.to}`,
        fix: "时间只能往前推进；要回到更早时刻请写成回忆段落，不改时钟",
      });
    }
    if (to < prev) {
      issues.push({
        level: "error",
        code: "clock/out-of-order",
        message: `advances[${i}] 与上一条推进顺序颠倒`,
        fix: "按时间顺序重排 advances，或删除错乱的那条",
      });
    }
    prev = to;
  }
  const last = bundle.clock.advances.at(-1);
  if (last && time(last.to) !== now) {
    issues.push({
      level: "error",
      code: "clock/tail-mismatch",
      message: `clock.now(${bundle.clock.now}) 与最后一条推进的终值(${last.to}) 不一致`,
      fix: "追加一条 advances 记录，或把 clock.now 改回最后一条的 to",
    });
  }

  // ---- beats ----
  for (const b of bundle.beats) {
    const want = deriveBeatStatus(b, now);
    if (b.status !== want) {
      const fix =
        want === "已过期"
          ? `${b.id} 的时间窗已过，状态应为「已过期」；不要复活它`
          : `把 ${b.id}.status 改成「${want}」`;
      issues.push({
        level: "error",
        code: "beat/status",
        message: `${b.id}（${b.title}）状态为「${b.status}」，按故事时间应为「${want}」`,
        fix,
      });
    }
    if (time(b.expiresAt) <= time(b.opensAt)) {
      issues.push({
        level: "error",
        code: "beat/window",
        message: `${b.id} 的窗口为空或倒置`,
        fix: "expiresAt 必须晚于 opensAt",
      });
    }
  }

  const open = bundle.beats.filter((b) => b.status === "开窗").length;
  if (open > 3) {
    issues.push({
      level: "warn",
      code: "beat/too-many-open",
      message: `同时开窗 ${open} 个，超过 3`,
      fix: "关掉或删掉多余的节点",
    });
  }

  // ---- foreshadows ----
  const ids = new Set<string>();
  for (const f of bundle.foreshadows) {
    if (ids.has(f.id)) {
      issues.push({
        level: "error",
        code: "fs/duplicate-id",
        message: `伏笔 id 重复：${f.id}`,
        fix: "换一个未占用的 id",
      });
    }
    ids.add(f.id);
  }
  const openFs = bundle.foreshadows.filter((f) => f.status === "未触发").length;
  if (openFs > 12) {
    issues.push({
      level: "warn",
      code: "fs/too-many-open",
      message: `未触发伏笔 ${openFs} 条，超过 12`,
      fix: "把最轻的一条标为「失效」",
    });
  }

  // ---- affinity / meters ----
  for (const [name, a] of Object.entries(bundle.state.affinity)) {
    const want = levelOf(a.value);
    if (a.level !== want) {
      issues.push({
        level: "error",
        code: "affinity/level",
        message: `${name} 的 level(${a.level}) 与 value(${a.value}) 不匹配`,
        fix: `把 level 改成「${want}」`,
      });
    }
  }

  // ---- chapters ----
  const numbers = chapters
    .map((n) => /^(\d{2})-/.exec(n)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => a - b);
  for (const [i, n] of numbers.entries()) {
    if (n !== i) {
      issues.push({
        level: "error",
        code: "chapter/gap",
        message: `章节编号不连续：第 ${i} 位应为 ${String(i).padStart(2, "0")}，实际 ${String(n).padStart(2, "0")}`,
        fix: "补齐缺失的章，或把后续章节重命名",
      });
      break;
    }
  }

  const cursorFile = chapters.find((n) =>
    n.startsWith(String(bundle.state.cursor.chapter).padStart(2, "0") + "-"),
  );
  const pendingChapter = input.unwrittenChapter === bundle.state.cursor.chapter;
  // 正在写的这一章还没有文件：章末才生成，不算错。
  const highest = numbers.length > 0 ? Math.max(...numbers) : -1;
  const chapterInProgress = bundle.state.cursor.chapter === highest + 1;
  if (chapters.length > 0 && !cursorFile && !pendingChapter && !chapterInProgress) {
    issues.push({
      level: "error",
      code: "cursor/chapter",
      message: `cursor 指向第 ${bundle.state.cursor.chapter} 章，但目录里没有对应文件`,
      fix: "修正 cursor.chapter 与 chapterFile",
    });
  } else if (cursorFile && !pendingChapter && cursorFile !== bundle.state.cursor.chapterFile) {
    issues.push({
      level: "error",
      code: "cursor/chapter-file",
      message: `cursor.chapterFile(${bundle.state.cursor.chapterFile}) 与实际文件(${cursorFile}) 不一致`,
      fix: `把 chapterFile 改成「${cursorFile}」`,
    });
  }

  // ---- 渐进人设（R18）----
  for (const char of bundle.world.chars) {
    const revealed = char.revealed ?? [];
    const hidden = char.hidden ?? [];
    for (const item of revealed) {
      const hit = hidden.find((h) => h && (item.includes(h) || h.includes(item)));
      if (hit) {
        issues.push({
          level: "error",
          code: "npc/revealed-hidden",
          message: `${char.name}：「${hit}」同时留在 revealed 和 hidden`,
          fix: "从 hidden 里删掉这一条——揭过的东西不再算没揭",
        });
      }
    }
    const seen = new Set<string>();
    for (const item of revealed) {
      if (seen.has(item)) {
        issues.push({
          level: "warn",
          code: "npc/duplicate-revealed",
          message: `${char.name}：revealed 里重复了「${item}」`,
          fix: "删掉重复的那条",
        });
      }
      seen.add(item);
    }
  }
  // ---- 世界图：闭合、可达、依赖无环 ----
  const locationIds = new Set(bundle.world.locations.map((l) => l.id));
  for (const loc of bundle.world.locations) {
    for (const link of loc.links ?? []) {
      const back = bundle.world.locations.find((l) => l.id === link);
      if (!back) {
        issues.push({
          level: "error",
          code: "world/link-missing",
          message: `${loc.id} 连到不存在的场景 ${link}`,
          fix: "补场景，或删掉这条 link",
        });
        continue;
      }
      if (!(back.links ?? []).includes(loc.id)) {
        issues.push({
          level: "error",
          code: "world/link-oneway",
          message: `${loc.id} → ${link} 是单向的（${link} 没有回指）`,
          fix: `在 ${link}.links 里补 ${loc.id}`,
        });
      }
    }
    for (const id of loc.focus ?? []) {
      if (!bundle.world.ids.has(id)) {
        issues.push({
          level: "error",
          code: "world/focus-unknown",
          message: `${loc.id} 的焦点人物 ${id} 没有登记`,
          fix: "先在 chars.json 里登记，再放进 focus",
        });
      }
    }
  }

  // ---- 场景必须挂在地点下面 ----
  const cursorScene = bundle.state.cursor.scene;
  if (cursorScene) {
    const wantedLoc = bundle.state.cursor.locationId;
    const fallbackName = (bundle.state.cursor.location ?? "").split(" · ")[0] ?? "";
    const loc = wantedLoc
      ? bundle.world.locations.find((l) => l.id === wantedLoc)
      : bundle.world.locations.find((l) => l.name.startsWith(fallbackName));
    const known = new Set<string>();
    for (const s of loc?.scenes ?? []) {
      known.add(s.id);
      known.add(s.name);
    }
    if (loc && known.size > 0 && !known.has(cursorScene)) {
      issues.push({
        level: "warn",
        code: "scene/unknown",
        message: `cursor.scene「${cursorScene}」不在 ${loc.id} 的子场景里（${[...known].join(" / ")}）`,
        fix: "改 scene，或在 locations.json 里把这个子场景登记到该地点下",
      });
    }
  }

  const threadIds = new Set(bundle.world.threads.map((t) => t.id));
  // 一条故事线 = 一条贯穿全篇的主线 + 若干支线。主线只能有一条，且是根。
  const mains = bundle.world.threads.filter((t) => t.weight === "主线");
  if (mains.length === 0) {
    issues.push({
      level: "error",
      code: "thread/no-main",
      message: "没有任何一条线标为「主线」",
      fix: '全篇贯穿到底的那条（主角之间的关系）标 weight:"主线"，其余标「支线」',
    });
  }
  if (mains.length > 1) {
    issues.push({
      level: "error",
      code: "thread/multiple-main",
      message: `标为主线的有 ${mains.length} 条：${mains.map((t) => `${t.id}${t.title ? `（${t.title}）` : ""}`).join("、")}`,
      fix: "全篇只有一条主线；把其余改成「支线」",
    });
  }
  for (const main of mains) {
    if ((main.dependsOn ?? []).length > 0) {
      issues.push({
        level: "error",
        code: "thread/main-root",
        message: `主线 ${main.id} 挂了 dependsOn（${(main.dependsOn ?? []).join("、")}）`,
        fix: "主线是根，不依赖任何线；依赖关系放在支线上",
      });
    }
  }
  for (const thread of bundle.world.threads) {
    for (const dep of thread.dependsOn ?? []) {
      if (!threadIds.has(dep)) {
        issues.push({
          level: "error",
          code: "thread/dep-missing",
          message: `${thread.id} 依赖不存在的线 ${dep}`,
          fix: "补线，或删掉这条依赖",
        });
      }
      if (dep === thread.id) {
        issues.push({
          level: "error",
          code: "thread/self-dep",
          message: `${thread.id} 依赖它自己`,
          fix: "删掉自依赖",
        });
      }
    }
    for (const id of thread.participants ?? []) {
      if (!bundle.world.ids.has(id)) {
        issues.push({
          level: "error",
          code: "thread/participant-unknown",
          message: `${thread.id} 的参与者 ${id} 没有登记`,
          fix: "先在 chars.json 里登记",
        });
      }
    }
  }
  // 依赖成环
  const visit = (id: string, trail: string[]): void => {
    if (trail.includes(id)) {
      issues.push({
        level: "error",
        code: "thread/cycle",
        message: `故事线依赖成环：${[...trail, id].join(" → ")}`,
        fix: "打断环上的一条 dependsOn",
      });
      return;
    }
    const thread = bundle.world.threads.find((t) => t.id === id);
    for (const dep of thread?.dependsOn ?? []) visit(dep, [...trail, id]);
  };
  for (const thread of bundle.world.threads) visit(thread.id, []);

  for (const beat of bundle.beats) {
    const scene = (beat as { scene?: string }).scene;
    if (scene && !locationIds.has(scene)) {
      issues.push({
        level: "error",
        code: "world/beat-scene",
        message: `${beat.id} 挂在未登记的场景 ${scene}`,
        fix: "先在 locations.json 里登记该场景",
      });
    }
  }
  // ---- shards ----
  if (input.shardFiles) {
    const missing = input.shardFiles.filter((f) => !chapters.includes(f) && !f.endsWith(".md"));
    if (missing.length > 0) {
      issues.push({
        level: "warn",
        code: "shard/link",
        message: `WORLD.md 里的链接看起来有问题：${missing.join(", ")}`,
      });
    }
  }

  // ---- 扩张预算（新内容随字数走）----
  if (input.expansion) issues.push(...guardExpansion(bundle, input.expansion));

  return issues;
}

export function hasErrors(issues: GuardIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

export function renderIssues(issues: GuardIssue[], limit = 12): string {
  if (issues.length === 0) return "检查通过，无问题。";
  const shown = issues.slice(0, limit);
  const lines = shown.map(
    (i) =>
      `${i.level === "error" ? "ERROR" : "WARN"}  [${i.code}] ${i.message}${i.fix ? `\n        修：${i.fix}` : ""}`,
  );
  if (issues.length > shown.length) lines.push(`……另有 ${issues.length - shown.length} 条未显示`);
  return lines.join("\n");
}
