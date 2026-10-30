import { promises as fs } from "node:fs";
import path from "node:path";
import type { Beat, Clock, Foreshadow, StoryBundle, StoryState } from "./model.js";

/** Directory layout of one story. */
export const LAYOUT = {
  dir: ".story",
  active: "ACTIVE.md",
  entry: "STORY.md",
  rules: "RULES.md",
  world: "WORLD.md",
  shards: "shards",
  chapters: "chapters",
  log: "log",
  state: "state.json",
  clock: "clock.json",
  beats: "beats.json",
  foreshadows: "foreshadows.json",
  pending: "pending-issues.json",
} as const;

export function storyRoot(workspace: string, id: string): string {
  return path.join(workspace, LAYOUT.dir, id);
}

export function activePath(workspace: string): string {
  return path.join(workspace, LAYOUT.dir, LAYOUT.active);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Atomic-ish write: temp file then rename, so a crash never leaves half a JSON. */
export async function writeText(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, file);
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readStory(workspace: string, id: string): Promise<StoryBundle | null> {
  const root = storyRoot(workspace, id);
  let state: StoryState;
  try {
    state = JSON.parse(await fs.readFile(path.join(root, LAYOUT.state), "utf8")) as StoryState;
  } catch {
    return null;
  }
  const clock = await readJson<Clock>(path.join(root, LAYOUT.clock), {
    now: state.cursor.storyTime,
    advances: [],
  });
  const beats = await readJson<Beat[]>(path.join(root, LAYOUT.beats), []);
  const foreshadows = await readJson<Foreshadow[]>(path.join(root, LAYOUT.foreshadows), []);
  return { id, root, state, clock, beats, foreshadows };
}

export async function listStories(workspace: string): Promise<string[]> {
  const dir = path.join(workspace, LAYOUT.dir);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Which story this session is bound to; the pointer file is the single source. */
export async function readActive(workspace: string): Promise<string | null> {
  try {
    const text = await fs.readFile(activePath(workspace), "utf8");
    const hit = /\.\/([^\s/]+)\/STORY\.md/.exec(text);
    return hit?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function writeActive(workspace: string, id: string): Promise<void> {
  const body = [
    "# 当前故事",
    "",
    `- 入口：./${id}/${LAYOUT.entry}`,
    `- 规则：./${id}/${LAYOUT.rules}`,
    `- 分片：./${id}/${LAYOUT.shards}/`,
    "",
  ].join("\n");
  await writeText(activePath(workspace), body);
}

export async function nextChapterFile(
  workspace: string,
  id: string,
  chapter: number,
): Promise<string> {
  const dir = path.join(storyRoot(workspace, id), LAYOUT.chapters);
  const prefix = String(chapter).padStart(2, "0");
  try {
    const entries = await fs.readdir(dir);
    const hit = entries.find((name) => name.startsWith(`${prefix}-`) && name.endsWith(".md"));
    if (hit) return path.join(dir, hit);
  } catch {
    /* dir may not exist yet */
  }
  return path.join(dir, `${prefix}-未命名.md`);
}
