// SSH 历史连接落盘 (issue 06): userData/ssh-connections.json, 连接表单的历史列表数据源。
// 写盘原子性 (临时文件 + rename) 与连续写队列串行化沿用 comment-persistence.ts 先例;
// 读盘容错: 缺失回退空列表, 损坏/形状非法记 error log 并隔离留证后回退空列表。
import { promises as fs } from "fs";
import { dirname } from "path";

import type { SshConnectionEntry } from "../../types/ssh.js";

// 传输形状的唯一来源在 src/types/ssh.ts; 此处 re-export 保持既有引用兼容
export type SshConnectionRecord = SshConnectionEntry;

interface PersistedHistoryFile {
  version: 1;
  connections: SshConnectionRecord[];
}

export interface SshConnectionHistoryOptions {
  filePath: string;
  maxEntries?: number;
  // 测试注入时钟
  now?: () => Date;
}

export interface SshConnectionHistory {
  load: () => Promise<SshConnectionRecord[]>;
  // 记录一次成功连接: 同 target+path 去重并提升为最近; 返回更新后的列表
  record: (target: string, path: string) => Promise<SshConnectionRecord[]>;
}

const DEFAULT_MAX_ENTRIES = 10;

let tmpFileCounter = 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// 落盘文件属外部边界数据: 逐条目校验形状, 非法条目丢弃而不是拖垮整个文件
const isConnectionRecord = (value: unknown): value is SshConnectionRecord =>
  isPlainObject(value) &&
  typeof value.target === "string" &&
  typeof value.path === "string" &&
  typeof value.lastUsedAt === "string";

export const createSshConnectionHistory = (
  options: SshConnectionHistoryOptions,
): SshConnectionHistory => {
  const { filePath } = options;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? (() => new Date());
  let writeQueue: Promise<void> = Promise.resolve();

  // 损坏文件改名留证, 避免下一次写盘直接覆盖掉用户可能想抢救的数据
  const quarantineCorruptFile = async (): Promise<void> => {
    try {
      await fs.rename(filePath, `${filePath}.corrupt-${Date.now()}`);
    } catch (error) {
      console.error(`Failed to quarantine corrupt ssh history file ${filePath}:`, error);
    }
  };

  const load = async (): Promise<SshConnectionRecord[]> => {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      // 首次运行尚无文件属正常路径; 其余读取失败 (权限等) 需要留日志
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Failed to read ssh connection history from ${filePath}:`, error);
      }
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error(`Failed to parse ssh connection history at ${filePath}:`, error);
      await quarantineCorruptFile();
      return [];
    }

    if (!isPlainObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.connections)) {
      console.error(`Unsupported ssh connection history shape at ${filePath}`);
      await quarantineCorruptFile();
      return [];
    }

    const connections: SshConnectionRecord[] = [];
    for (const entry of parsed.connections) {
      if (isConnectionRecord(entry)) {
        connections.push(entry);
      } else {
        console.error(`Dropping malformed ssh connection entry in ${filePath}`);
      }
    }
    return connections;
  };

  const save = (connections: SshConnectionRecord[]): Promise<void> => {
    const file: PersistedHistoryFile = { version: 1, connections };
    const serialized = `${JSON.stringify(file, null, 2)}\n`;

    writeQueue = writeQueue.then(async () => {
      try {
        await fs.mkdir(dirname(filePath), { recursive: true });
        tmpFileCounter += 1;
        const tmpPath = `${filePath}.${process.pid}.${tmpFileCounter}.tmp`;
        await fs.writeFile(tmpPath, serialized, "utf-8");
        await fs.rename(tmpPath, filePath);
      } catch (error) {
        console.error(`Failed to persist ssh connection history to ${filePath}:`, error);
      }
    });
    return writeQueue;
  };

  const record = async (target: string, path: string): Promise<SshConnectionRecord[]> => {
    const current = await load();
    const next: SshConnectionRecord[] = [
      { target, path, lastUsedAt: now().toISOString() },
      ...current.filter((entry) => !(entry.target === target && entry.path === path)),
    ].slice(0, maxEntries);

    await save(next);
    return next;
  };

  return { load, record };
};
