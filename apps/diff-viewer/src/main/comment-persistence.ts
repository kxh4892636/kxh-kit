// 评论落盘 (issue 05): 每个仓库一个 JSON 文件 (userData/comments/<repositoryId>.json),
// 文件内按 对比 (DiffSelection key) 组织会话快照 —— 锚点的"仓库"分量由文件归属承担,
// 文件只落在 userData, 不写入仓库目录。
// 写盘原子性: 临时文件 + rename (user-config.ts 先例), 连续写经队列串行化;
// 读盘容错: 文件缺失回退空集合, 损坏/形状非法记 error log 并隔离留证后回退空集合。
import { promises as fs } from "fs";
import { dirname } from "path";

import type { DiffCommentThread } from "../types/diff.js";

export interface CommentSessionSnapshot {
  version: number;
  updatedAt: string;
  threads: DiffCommentThread[];
}

interface PersistedCommentsFile {
  version: 1;
  repoPath: string;
  sessions: Record<string, CommentSessionSnapshot>;
}

export interface CommentPersisterOptions {
  filePath: string;
  // 仅用于落盘记录, 便于人对照 repositoryId (sha256) 排查来源仓库
  repoPath: string;
}

export interface CommentPersister {
  // 缺失/损坏均回退空集合, 不抛错
  load: () => Promise<Record<string, CommentSessionSnapshot>>;
  // 整文件原子写; 失败记 error log 后正常返回 (内存态已更新, 仅持久化降级)
  save: (sessions: Record<string, CommentSessionSnapshot>) => Promise<void>;
}

// 同一进程多个仓库的 persister 共享计数器, 保证临时文件名互不冲突
let tmpFileCounter = 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// 落盘文件属外部边界数据: 逐条目校验形状, 非法条目丢弃而不是拖垮整个文件
const isSessionSnapshot = (value: unknown): value is CommentSessionSnapshot =>
  isPlainObject(value) &&
  typeof value.version === "number" &&
  typeof value.updatedAt === "string" &&
  Array.isArray(value.threads);

export const createCommentPersister = (options: CommentPersisterOptions): CommentPersister => {
  const { filePath, repoPath } = options;
  let writeQueue: Promise<void> = Promise.resolve();

  // 损坏文件改名留证, 避免下一次 save 直接覆盖掉用户可能想抢救的数据
  const quarantineCorruptFile = async (): Promise<void> => {
    try {
      await fs.rename(filePath, `${filePath}.corrupt-${Date.now()}`);
    } catch (error) {
      console.error(`Failed to quarantine corrupt comments file ${filePath}:`, error);
    }
  };

  const load = async (): Promise<Record<string, CommentSessionSnapshot>> => {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      // 首次运行尚无文件属正常路径; 其余读取失败 (权限等) 需要留日志
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Failed to read persisted comments from ${filePath}:`, error);
      }
      return {};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error(`Failed to parse persisted comments at ${filePath}:`, error);
      await quarantineCorruptFile();
      return {};
    }

    if (!isPlainObject(parsed) || parsed.version !== 1 || !isPlainObject(parsed.sessions)) {
      console.error(`Unsupported persisted comments shape at ${filePath}`);
      await quarantineCorruptFile();
      return {};
    }

    const sessions: Record<string, CommentSessionSnapshot> = {};
    for (const [key, value] of Object.entries(parsed.sessions)) {
      if (isSessionSnapshot(value)) {
        sessions[key] = value;
      } else {
        console.error(`Dropping malformed comment session "${key}" in ${filePath}`);
      }
    }
    return sessions;
  };

  const save = (sessions: Record<string, CommentSessionSnapshot>): Promise<void> => {
    const file: PersistedCommentsFile = { version: 1, repoPath, sessions };
    const serialized = `${JSON.stringify(file, null, 2)}\n`;

    writeQueue = writeQueue.then(async () => {
      try {
        await fs.mkdir(dirname(filePath), { recursive: true });
        tmpFileCounter += 1;
        const tmpPath = `${filePath}.${process.pid}.${tmpFileCounter}.tmp`;
        await fs.writeFile(tmpPath, serialized, "utf-8");
        await fs.rename(tmpPath, filePath);
      } catch (error) {
        console.error(`Failed to persist comments to ${filePath}:`, error);
      }
    });
    return writeQueue;
  };

  return { load, save };
};
