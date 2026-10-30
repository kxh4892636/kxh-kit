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
  /** Files referenced by WORLD.md; used to detect dangling links. */
  shardFiles?: string[];
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
  if (chapters.length > 0 && !cursorFile) {
    issues.push({
      level: "error",
      code: "cursor/chapter",
      message: `cursor 指向第 ${bundle.state.cursor.chapter} 章，但目录里没有对应文件`,
      fix: "修正 cursor.chapter 与 chapterFile",
    });
  } else if (cursorFile && cursorFile !== bundle.state.cursor.chapterFile) {
    issues.push({
      level: "error",
      code: "cursor/chapter-file",
      message: `cursor.chapterFile(${bundle.state.cursor.chapterFile}) 与实际文件(${cursorFile}) 不一致`,
      fix: `把 chapterFile 改成「${cursorFile}」`,
    });
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
