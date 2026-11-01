import { promises as fs } from "node:fs";
import path from "node:path";
import type { StoryBundle } from "./model.js";
import { LAYOUT, writeText } from "./store.js";

/** chapters/index.json 的一行。 */
export interface ChapterEntry {
  no?: number;
  title?: string;
  /** 卷：按章节顺序每 CHUNK_SIZE 章一卷。 */
  chunk?: string;
  /** 主导故事线（只用来统计，不参与目录分组）。 */
  group?: string;
  /** 这一章牵到的所有故事线。 */
  threads?: string[];
  file?: string;
  chars?: number;
  beats?: number;
  summary?: string;
  /** 这一章里发生的那几件事（故事节点概述），一条一行。 */
  nodes?: string[];
  storyTime?: string;
  timeFrom?: string;
  timeTo?: string;
}

export const CHUNK_SIZE = 10;

/** 章号 → 卷号。目录按顺序切，一章可以同时属于多条故事线，互不影响。 */
export function chunkOf(chapter: number): string {
  return `C${Math.floor(Math.max(0, chapter) / CHUNK_SIZE) + 1}`;
}

export async function readChapterIndex(root: string): Promise<ChapterEntry[]> {
  try {
    const raw = await fs.readFile(path.join(root, LAYOUT.chapters, "index.json"), "utf8");
    return JSON.parse(raw) as ChapterEntry[];
  } catch {
    return [];
  }
}

/**
 * 每卷一份 `chapters/<C>/index.md`：**概述 + 节点索引**。
 *
 * - 概述：这一卷讲到了哪儿（几百字，模型在章末给）。
 * - 索引：不是文件清单，而是每章「发生了哪几件事」，每条带一个指回原文的引用。
 *
 * 篇幅大约等于一章：读完它就知道这一卷的全部内容，要细节再按路径取原文。
 */
export async function renderChunkIndex(
  root: string,
  bundle: StoryBundle,
  chunkId: string,
): Promise<string> {
  const index = await readChapterIndex(root);
  const list = index
    .filter((e) => (e.chunk ?? chunkOf(e.no ?? 0)) === chunkId)
    .sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
  const meta = bundle.state.chunks?.find((c) => c.id === chunkId);
  const chars = list.reduce((n, e) => n + (e.chars ?? 0), 0);
  const beats = list.reduce((n, e) => n + (e.beats ?? 0), 0);
  const threadTitles = (ids: string[] | undefined): string =>
    (ids ?? [])
      .map((id) => {
        const t = bundle.world.threads.find((x) => x.id === id);
        return t ? `${t.id} ${t.title ?? ""}`.trim() : id;
      })
      .join(" / ");

  const lines: string[] = [];
  lines.push(`# ${chunkId}　${meta?.title ?? `第 ${chunkId.slice(1)} 卷`}`);
  lines.push("");
  lines.push(
    `> ${list.length} 章 / ${chars} 字 / ${beats} 拍${
      list.length > 0
        ? ` · 第 ${String(list[0]?.no ?? 0).padStart(2, "0")}–${String(list[list.length - 1]?.no ?? 0).padStart(2, "0")} 章`
        : ""
    }`,
  );
  lines.push("");
  if (meta?.overview) {
    lines.push("## 概述");
    lines.push("");
    lines.push(meta.overview);
    lines.push("");
  }
  lines.push("## 节点索引");
  lines.push("");
  for (const entry of list) {
    const no = String(entry.no ?? 0).padStart(2, "0");
    lines.push(`### ${no} 《${entry.title ?? "未命名"}》`);
    lines.push("");
    const span =
      entry.timeFrom && entry.timeTo
        ? `${entry.timeFrom} → ${entry.timeTo}`
        : (entry.storyTime ?? "");
    lines.push(
      [
        span,
        `${entry.chars ?? 0} 字`,
        `${entry.beats ?? 0} 拍`,
        entry.file ? `\`${entry.file}\`` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    const threads = threadTitles(entry.threads);
    if (threads) lines.push(`牵到：${threads}`);
    lines.push("");
    if (entry.summary) lines.push(`**这一章**：${entry.summary}`);
    if (entry.summary) lines.push("");
    for (const node of entry.nodes ?? []) lines.push(`- ${node}`);
    if ((entry.nodes ?? []).length > 0) lines.push("");
  }
  lines.push("## 怎么用");
  lines.push("");
  lines.push(
    "开新章之前先读这一卷的 index.md：概述给方向，节点索引给位置。要哪一段的原文，按章节路径去取那一章，别整卷读完。",
  );
  lines.push("");
  return lines.join("\n");
}

/** 重写某一卷的 index.md，返回相对路径。 */
export async function writeChunkIndex(
  root: string,
  bundle: StoryBundle,
  chunkId: string,
): Promise<string> {
  const body = await renderChunkIndex(root, bundle, chunkId);
  const rel = `${chunkId}/index.md`;
  await writeText(path.join(root, LAYOUT.chapters, chunkId, "index.md"), body);
  return rel;
}

/**
 * 全书目录 `chapters/index.md`：每卷一行。
 *
 * 三层递进：这一行（全书）→ 那一卷的 index.md（约正文的 5%）→ 那一章的原文。
 * 120 卷 × 约 5000 字索引 ≈ 60 万字，但上下文里一次只装一层。
 */
export async function renderBookIndex(root: string, bundle: StoryBundle): Promise<string> {
  const index = await readChapterIndex(root);
  const chunkIds = [...new Set(index.map((e) => e.chunk ?? chunkOf(e.no ?? 0)))].sort();
  const totalChars = index.reduce((n, e) => n + (e.chars ?? 0), 0);
  const totalBeats = index.reduce((n, e) => n + (e.beats ?? 0), 0);

  const lines: string[] = [];
  lines.push("# 全书目录");
  lines.push("");
  lines.push(
    `> ${index.length} 章 / ${totalChars} 字 / ${totalBeats} 拍 · 每卷一份 index.md（约正文的 5%），正文按章取`,
  );
  lines.push("");
  lines.push("| 卷 | 标题 | 章 | 字数 | 讲到了哪儿 |");
  lines.push("|---|---|---|---|---|");
  for (const id of chunkIds) {
    const list = index.filter((e) => (e.chunk ?? chunkOf(e.no ?? 0)) === id);
    const meta = bundle.state.chunks?.find((c) => c.id === id);
    const chars = list.reduce((n, e) => n + (e.chars ?? 0), 0);
    const first = String(list[0]?.no ?? 0).padStart(2, "0");
    const last = String(list[list.length - 1]?.no ?? 0).padStart(2, "0");
    const head = (meta?.overview ?? "").split(/[。\n]/)[0] ?? "";
    lines.push(
      `| [${id}](${id}/index.md) | ${meta?.title ?? `第 ${id.slice(1)} 卷`} | ${first}–${last}（${list.length}） | ${chars} | ${head.slice(0, 60)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeBookIndex(root: string, bundle: StoryBundle): Promise<string> {
  const body = await renderBookIndex(root, bundle);
  await writeText(path.join(root, LAYOUT.chapters, "index.md"), body);
  return "index.md";
}
