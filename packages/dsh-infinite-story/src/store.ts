import { promises as fs } from "node:fs";
import path from "node:path";
import type { Beat, Clock, Foreshadow, StoryBundle, StoryState } from "./model.js";

/** Directory layout of one story. */
export const LAYOUT = {
  dir: ".story",
  /** Fixed pointer read by the system prompt: `{ "storyId": "…" }`. */
  active: "active.json",
  sessions: "sessions",
  /** The story's own entry: progress + where every other file lives. */
  story: "story.json",
  rules: "rules.md",
  world: "world",
  chars: "world/chars.json",
  locations: "world/locations.json",
  threads: "world/threads.json",
  relations: "world/relations.json",
  chapters: "chapters",
  log: "log",
  clock: "clock.json",
  beats: "beats.json",
  foreshadows: "foreshadows.json",
  pending: "pending-issues.json",
} as const;

/** Per-session binding. One session binds exactly one story. */
export interface SessionBinding {
  enabled: boolean;
  storyId: string | null;
  updatedAt: string;
}

function sessionFile(workspace: string, key: string): string {
  const safe = key.replace(/[^\w.-]/g, "_").slice(0, 80);
  return path.join(workspace, LAYOUT.dir, LAYOUT.sessions, `${safe}.json`);
}

export async function readSession(workspace: string, key: string): Promise<SessionBinding> {
  return readJson<SessionBinding>(sessionFile(workspace, key), {
    enabled: false,
    storyId: null,
    updatedAt: "",
  });
}

export async function writeSession(
  workspace: string,
  key: string,
  binding: SessionBinding,
): Promise<void> {
  await writeJson(sessionFile(workspace, key), { ...binding, updatedAt: new Date().toISOString() });
}

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
    state = JSON.parse(await fs.readFile(path.join(root, LAYOUT.story), "utf8")) as StoryState;
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
    const raw = JSON.parse(await fs.readFile(activePath(workspace), "utf8")) as {
      storyId?: string;
    };
    return raw.storyId ?? null;
  } catch {
    return null;
  }
}

export async function writeActive(workspace: string, id: string): Promise<void> {
  await writeJson(activePath(workspace), {
    storyId: id,
    entry: `./${id}/${LAYOUT.story}`,
    rules: `./${id}/${LAYOUT.rules}`,
    updatedAt: new Date().toISOString(),
  });
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
