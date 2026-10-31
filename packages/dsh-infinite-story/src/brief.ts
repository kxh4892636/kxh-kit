import { promises as fs } from "node:fs";
import path from "node:path";
import { countExpansion, type Snapshot } from "./budget.js";
import { DEFAULT_BUDGET, type GuardIssue, type StoryBundle } from "./model.js";
import { LAYOUT, writeText } from "./store.js";

/**
 * Brief —— 世界的全量快照，落盘在 `.story/<id>/brief.md`。
 *
 * 分工：`story_check` 只回一章的信息；**全量信息在这里**。开新章之前必须读它，
 * 否则 `story_write` 带 chapter 时会拒写（brief 比上一章旧）。
 */

const pad = (n: number) => String(n).padStart(2, "0");

function fmt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return `${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(
    t.getHours(),
  ).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

export interface ReviewResult {
  pass: boolean;
  violations: Array<{ rule?: string; evidence?: string; fix?: string }>;
  suggestion?: string;
}

export interface BriefInput {
  bundle: StoryBundle;
  pending: GuardIssue[];
  /** 章末语义审的结论（模型判的，不是代码判的）。 */
  review?: ReviewResult | null;
  chapterChars?: number;
  chapterBeats?: number;
  /** 上一章末的扩张基线；不给就按当前存量当基线（新增显示 0）。 */
  snapshot?: Snapshot | null;
}

function upcoming(input: BriefInput): string[] {
  const { bundle } = input;
  const now = Date.parse(bundle.clock.now);
  return bundle.beats
    .filter((b) => b.status === "待命" || b.status === "开窗")
    .filter((b) => Date.parse(b.expiresAt) > now)
    .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt))
    .slice(0, 6)
    .map((b) => {
      const mark = b.status === "开窗" ? "▶ 可写" : "· 待开";
      return `${mark} ${b.id} ${b.title}  ${fmt(b.opensAt)} – ${fmt(b.expiresAt)}`;
    });
}

interface IndexEntry {
  no: number;
  title: string;
  file: string;
  chars?: number;
  summary?: string;
}

/** 近几章的索引摘要——给上下文一个「我们写到哪儿了」的锚点。 */
async function recentChapters(root: string, limit = 5): Promise<string[]> {
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(root, LAYOUT.chapters, "index.json"), "utf8"),
    ) as IndexEntry[];
    const tail = raw
      .filter((e) => typeof e.no === "number")
      .sort((a, b) => a.no - b.no)
      .slice(-limit);
    return tail.map(
      (e) =>
        `  第 ${pad(e.no)} 章《${e.title}》${e.chars ? ` · ${e.chars} 字` : ""}${e.summary ? ` · ${e.summary}` : ""}`,
    );
  } catch {
    return [];
  }
}
function worldLines(input: BriefInput): string[] {
  const { bundle } = input;
  const lines: string[] = [];

  const here = bundle.world.locations.find((l) => l.id === bundle.state.cursor.locationId);
  const focus = here?.focus ?? [];
  const focusNames = focus
    .map((id) => bundle.world.chars.find((c) => c.id === id)?.name ?? id)
    .filter(Boolean);
  if (focusNames.length > 0) lines.push(`【在场】${focusNames.join("、")}（场景焦点）`);

  const cast = bundle.world.chars.filter((c) => (c.hidden ?? []).length > 0);
  if (cast.length > 0) {
    lines.push(
      `【人设】${cast.map((c) => `${c.name} 待揭 ${(c.hidden ?? []).length}`).join(" · ")}（一章至多揭一条，揭了搬进 revealed）`,
    );
  }

  const active = bundle.world.threads.filter((t) => t.status !== "已完成");
  for (const thread of active) {
    const blocked = (thread.dependsOn ?? []).filter((id) => {
      const up = bundle.world.threads.find((t) => t.id === id);
      return up && up.status !== "已完成";
    });
    const tag = blocked.length > 0 ? `⛔ 等 ${blocked.join(",")}` : "○ 可推";
    const who = (thread.participants ?? [])
      .map((id) => bundle.world.chars.find((c) => c.id === id)?.name ?? id)
      .join("、");
    lines.push(
      `${tag} ${thread.id} ${thread.title ?? ""}（${thread.weight ?? "支线"}）${who ? ` · ${who}` : ""}${thread.nextMoves?.length ? ` · 下一步：${thread.nextMoves.join(" / ")}` : ""}`,
    );
  }

  const open = bundle.foreshadows.filter((f) => f.status === "未触发");
  if (open.length > 0) {
    const byWeight = [...open].sort(
      (a, b) => "重中轻".indexOf(a.weight) - "重中轻".indexOf(b.weight),
    );
    lines.push(
      `【伏笔】未触发 ${open.length} 条（重：${
        byWeight
          .filter((f) => f.weight === "重")
          .map((f) => `${f.id} ${f.label}`)
          .join(" / ") || "无"
      }）`,
    );
  }

  const aff = Object.entries(bundle.state.affinity);
  if (aff.length > 0) {
    lines.push(`【好感】${aff.map(([n, a]) => `${n} ${a.value}（${a.level}）`).join(" · ")}`);
  }

  // 扩张预算：新内容随字数走，不随心情走
  const cfg = bundle.state.budget ?? DEFAULT_BUDGET;
  const chars = input.chapterChars ?? 0;
  const { counts } = countExpansion(
    bundle.world.chars,
    bundle.world.locations,
    bundle.world.threads,
    input.snapshot ?? null,
    chars,
    cfg,
  );
  const scenes = bundle.world.locations.flatMap((l) => l.scenes ?? []);
  lines.push(
    `【扩张】本章 ${chars} 字 · 已添 人物 ${counts.newChars}/${counts.quotients.chars} · 地点 ${counts.newLocations}/${counts.quotients.locations} · 子场景 ${counts.newScenes}/${counts.quotients.scenes} · 线 ${counts.newThreads}/${counts.quotients.threads}`,
  );
  lines.push(
    `【世界存量】人物 ${bundle.world.chars.length} · 地点 ${bundle.world.locations.length} · 子场景 ${scenes.length} · 线 ${bundle.world.threads.length}（主线 ${
      bundle.world.threads
        .filter((t) => t.weight === "主线")
        .map((t) => t.id)
        .join(",") || "无"
    }）`,
  );
  return lines;
}

/** 拼 brief.md 全文；`## 全量` 之外还有一段机器可读的 JSON 字段。 */
export async function renderBriefFile(input: BriefInput): Promise<string> {
  const { bundle } = input;
  const cursor = bundle.state.cursor;
  const snapshot = {
    generatedAt: new Date().toISOString(),
    chapter: cursor.chapter,
    chapterFile: cursor.chapterFile,
    storyTime: bundle.clock.now,
    location: cursor.location,
    scene: cursor.scene,
    lastBeat: cursor.lastBeat,
    openThreads: bundle.state.openThreads,
    world: {
      chars: bundle.world.chars.map((c) => ({
        id: c.id,
        name: c.name,
        tier: c.tier ?? null,
        affinity: c.affinity ?? null,
        hidden: (c.hidden ?? []).length,
      })),
      locations: bundle.world.locations.map((l) => ({
        id: l.id,
        name: l.name,
        links: l.links ?? [],
        focus: l.focus ?? [],
      })),
      threads: bundle.world.threads,
      relations: bundle.world.relations,
    },
    beats: bundle.beats,
    foreshadows: bundle.foreshadows,
    pending: input.pending,
  };

  const head = [
    "# 世界快照 · brief",
    "",
    "> 开新章之前读这份。正文里只写章节信息，世界全量在这里。",
    "",
    `【此刻】${fmt(bundle.clock.now)} · ${cursor.location} · ${cursor.scene}`,
    `【上一拍】${cursor.lastBeat}`,
    `【本章】第 ${pad(cursor.chapter)} 章 · ${cursor.chapterFile}${
      input.chapterChars ? ` · ${input.chapterChars} 字 · ${input.chapterBeats} 拍` : "（尚未生成）"
    }`,
    "",
  ];

  const body: string[] = [];
  const recent = await recentChapters(bundle.root);
  if (recent.length > 0) body.push("【近章】", ...recent);
  body.push(...worldLines(input));
  const soon = upcoming(input);
  if (soon.length > 0) body.push("【节点】", ...soon.map((l) => `  ${l}`));
  const threads = bundle.state.openThreads.filter(Boolean);
  if (threads.length > 0) body.push("【悬置】", ...threads.map((t) => `  · ${t}`));
  if (input.review) {
    const r = input.review;
    body.push(`【语义审】${r.pass ? "通过" : `${r.violations.length} 条`}`);
    for (const v of r.violations.slice(0, 6)) {
      body.push(
        `  ✖ ${v.rule ?? ""}${v.evidence ? `：${v.evidence}` : ""}${v.fix ? `（修：${v.fix}）` : ""}`,
      );
    }
    if (r.suggestion) body.push(`  → ${r.suggestion}`);
  }
  if (input.pending.length > 0) {
    body.push("【待修】", ...input.pending.slice(0, 6).map((i) => `  ✖ [${i.code}] ${i.message}`));
  }

  return `${head.join("\n")}${body.join("\n")}\n\n## 全量（机器可读）\n\n\`\`\`json\n${JSON.stringify(
    snapshot,
    null,
    2,
  )}\n\`\`\`\n`;
}

export async function writeBrief(root: string, input: BriefInput): Promise<string> {
  const file = path.join(root, LAYOUT.brief);
  await writeText(file, await renderBriefFile(input));
  return file;
}

/** brief 是否比当前章更新——开新章的门槛。 */
export async function briefIsFresh(root: string): Promise<boolean> {
  try {
    const brief = await fs.stat(path.join(root, LAYOUT.brief));
    return Date.now() - brief.mtimeMs < 1000 * 60 * 60 * 12;
  } catch {
    return false;
  }
}
