/**
 * worker 会话的落盘与按工作键恢复。
 *
 * 两种 worker（Plan worker 与临时 worker）都有 jsonl 会话文件：Plan worker 由编排方按
 * `plan 目录::组` 维护，临时 worker 就是一个普通 pi 会话、按 `temp:<id>` 寻址。会话 id
 * 由**工作键**哈希得到，所以"哪个键对应哪个会话文件"不依赖内存：重启后同一个键算出的
 * id 相同，`SessionManager.findById` 就能把文件找回来。
 *
 * 状态目录里还留一份小索引（`workers.json`）：它记下已知的键与最近的会话路径。索引可以
 * 丢 —— 丢了只是路径要靠 `findById` 重扫、临时 id 计数从头开始；会话文件本身不受影响。
 *
 * **没有作废登记**：dispatch 只认进程内的 live 句柄，被 abort 的键再派就是新一代会话
 * （会话键带 `#N`），旧 jsonl 只当历史。续跑落盘会话的唯一入口是 `orchestrator_state` 的
 * `op=resume`。
 *
 * 子 worker 不走这里：它不续、不落盘，仍在内存会话里跑（见 `spawn.ts`）。
 * @module @kxh4892636/pi-toolkit/orchestrator/worker-sessions
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

/** 索引文件名（状态目录下）。 */
export const WORKERS_FILE = "workers.json";

/** 索引里的一条会话：键 → 最近一次用到的会话文件。 */
export interface WorkerSessionRecord {
  /** SessionManager 的会话 id，也是文件名的一部分。 */
  readonly id: string;
  /** 会话文件绝对路径。 */
  readonly path: string;
  /** 最近一次投递时刻（ISO）。 */
  readonly at: string;
}

/** `workers.json` 的内容。 */
export interface WorkerSessionIndex {
  readonly sessions: Record<string, WorkerSessionRecord>;
}

/** 打开或新建出来的会话。 */
export interface OpenedWorkerSession {
  readonly manager: SessionManager;
  /** 会话文件路径；新建时文件可能还没落盘（pi 只在第一条消息后才创建文件）。 */
  readonly path: string;
  /** 是不是从磁盘上的旧会话续上的。 */
  readonly resumed: boolean;
}

/**
 * 由工作键算会话 id。
 *
 * 键里含绝对路径与中文，而 pi 的会话 id 只允许 `[A-Za-z0-9._-]`，所以取哈希前 16 位十六
 * 进制；同一个键永远算出同一个 id，这就是"重启后能找回会话"的依据。
 * @param key - 工作键（`<plan 目录>::<组>` 或 `temp:<id>`）。
 * @returns 会话 id。
 */
export const workerSessionId = (key: string): string => {
  return `worker-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
};

/**
 * 读索引；文件缺失或损坏时返回空索引（不抛错：索引只是加速与登记，不是真相）。
 * @param stateDir - 状态目录。
 * @returns 索引。
 */
export const readWorkerSessionIndex = (stateDir: string): WorkerSessionIndex => {
  const file = join(stateDir, WORKERS_FILE);
  if (!existsSync(file)) return { sessions: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<WorkerSessionIndex>;
    // 只取 `sessions`：多余的字段（旧版本留下的）读入时忽略，不迁移、不重写。
    return { sessions: parsed.sessions ?? {} };
  } catch {
    return { sessions: {} };
  }
};

/** 写索引（覆盖）。 */
export const writeWorkerSessionIndex = (stateDir: string, index: WorkerSessionIndex): void => {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, WORKERS_FILE), `${JSON.stringify(index, null, 2)}\n`, "utf8");
};

/**
 * 登记一条键 → 会话文件的映射。写失败不抛错：索引丢了还能靠 `findById` 重建。
 *
 * `path` 可省略（会话还没落盘，或由外部 spawn 提供）：此时只登记“这个键被用过”，
 * 临时 id 计数才不会每次都从 1 重新发。
 * @param stateDir - 状态目录。
 * @param key - 工作键。
 * @param path - 会话文件路径；未知时省略。
 */
export const rememberWorkerSession = (stateDir: string, key: string, path?: string): void => {
  const index = readWorkerSessionIndex(stateDir);
  const record: WorkerSessionRecord = {
    id: workerSessionId(key),
    path: path ?? index.sessions[key]?.path ?? "",
    at: new Date().toISOString(),
  };
  try {
    writeWorkerSessionIndex(stateDir, { ...index, sessions: { ...index.sessions, [key]: record } });
  } catch {
    // 状态目录不可写时只影响"重启后能否秒找回"，不阻断派工。
  }
};

/**
 * 下一个可用的临时 worker 序号。
 *
 * 临时 id 从盘上已知的 `temp:<n>` 里取最大值 +1，而不是进程内计数器：不然重启后
 * `temp:1` 会撞上上一轮留下的会话，一开跑就"续上"了别人的历史。
 * @param stateDir - 状态目录。
 * @returns 序号（>= 1）。
 */
export const nextTempSeq = (stateDir: string): number => {
  const index = readWorkerSessionIndex(stateDir);
  let max = 0;
  for (const key of Object.keys(index.sessions)) {
    const matched = /^temp:(\d+)$/.exec(key);
    if (matched === null) continue;
    const seq = Number(matched[1]);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max + 1;
};

/**
 * 按工作键打开既有会话，或新建一个。
 *
 * 顺序：索引里的路径（文件还在）→ `findById(cwd, 会话 id)` 重扫 → 新建。索引丢失、文件
 * 被手动挪走、甚至整个状态目录被删，都不会让同一个键"假装是新会话"。
 * @param options - 工作键、cwd、状态目录与可选的会话目录（测试用）。
 * @returns 会话、文件路径与是否续上。
 */
export const openWorkerSession = (options: {
  readonly key: string;
  readonly cwd: string;
  readonly stateDir: string;
  /** 覆盖会话目录（测试用）；省略即 pi 的默认 sessions 目录。 */
  readonly sessionDir?: string;
}): OpenedWorkerSession => {
  const { key, cwd, stateDir, sessionDir } = options;
  const id = workerSessionId(key);
  const known = readWorkerSessionIndex(stateDir).sessions[key]?.path;
  const recovered =
    known !== undefined && known !== "" && existsSync(known)
      ? known
      : SessionManager.findById(cwd, id, sessionDir);
  if (recovered !== undefined && existsSync(recovered)) {
    rememberWorkerSession(stateDir, key, recovered);
    return {
      manager: SessionManager.open(recovered, sessionDir, cwd),
      path: recovered,
      resumed: true,
    };
  }
  const manager = SessionManager.create(cwd, sessionDir, { id });
  const path = manager.getSessionFile() ?? known ?? "";
  if (path !== "") rememberWorkerSession(stateDir, key, path);
  return { manager, path, resumed: false };
};
