import { promises as fs } from "node:fs";
import path from "node:path";
import type { GuardIssue, StoryBundle } from "./model.js";
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

export interface BriefInput {
  bundle: StoryBundle;
  pending: GuardIssue[];
  chapterChars?: number;
  chapterBeats?: number;
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
  return lines;
}

/** 拼 brief.md 全文；`## 全量` 之外还有一段机器可读的 JSON 字段。 */
export function renderBriefFile(input: BriefInput): string {
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
  body.push(...worldLines(input));
  const soon = upcoming(input);
  if (soon.length > 0) body.push("【节点】", ...soon.map((l) => `  ${l}`));
  const threads = bundle.state.openThreads.filter(Boolean);
  if (threads.length > 0) body.push("【悬置】", ...threads.map((t) => `  · ${t}`));
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
  await writeText(file, renderBriefFile(input));
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
