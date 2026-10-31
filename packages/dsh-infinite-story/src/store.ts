import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Beat,
  Clock,
  Foreshadow,
  StoryBundle,
  StoryState,
  World,
  WorldChar,
  WorldLocation,
  WorldRelation,
  WorldThread,
} from "./model.js";

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
  brief: "brief.md",
  pending: "pending-issues.json",
  /** 章末落的扩张基线快照：下一章拿它算新添了什么。 */
  snapshot: "world/snapshot.json",
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
  const world = await readWorld(root);
  return { id, root, state, clock, beats, foreshadows, world };
}

/** chars.json 允许两种写法：扁平数组，或按 tier 分层的对象。都摊平成数组。 */
function flattenChars(raw: unknown): WorldChar[] {
  if (Array.isArray(raw)) return raw as WorldChar[];
  if (raw && typeof raw === "object") {
    const buckets = raw as Record<string, unknown>;
    const out: WorldChar[] = [];
    for (const tier of ["core", "major", "minor", "extra"]) {
      const list = buckets[tier];
      if (Array.isArray(list)) out.push(...(list as WorldChar[]));
    }
    return out;
  }
  return [];
}

const toList = <T>(value: T | T[] | undefined): T[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

/** Load the four world tables and precompute the id sets the guard needs. */
export async function readWorld(root: string): Promise<World> {
  const chars = flattenChars(await readJson<unknown>(path.join(root, LAYOUT.chars), []));
  const rawLocations = await readJson<WorldLocation[]>(path.join(root, LAYOUT.locations), []);
  // focus / links 可能被写成字符串，统一成数组，免得被逐字符遍历
  // 场景只能挂在地点下面：一个地点可以有几间屋子/几个角落
  const locations = rawLocations.map((l) => ({
    ...l,
    links: toList(l.links),
    focus: toList(l.focus),
    scenes: Array.isArray(l.scenes) ? l.scenes : [],
  }));
  const threads = await readJson<WorldThread[]>(path.join(root, LAYOUT.threads), []);
  const relations = await readJson<WorldRelation[]>(path.join(root, LAYOUT.relations), []);

  const ids = new Set<string>(chars.map((c) => c.id));
  ids.add("you");
  ids.add("筱聿");
  const sceneIds = new Set<string>();
  for (const loc of locations) for (const s of loc.scenes ?? []) sceneIds.add(s.id);
  return {
    ids,
    chars,
    locations,
    threads,
    relations,
    threadIds: new Set(threads.map((t) => t.id)),
    locationIds: new Set(locations.map((l) => l.id)),
    sceneIds,
  };
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
