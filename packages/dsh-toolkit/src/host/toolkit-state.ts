import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** 状态文件格式版本；读取到其它版本只保留可识别字段。 */
export const TOOLKIT_STATE_VERSION = 1;

/** 状态文件内容：逐工具开关 + 待删除的原会话 id。 */
export interface ToolkitStateDoc {
  version: number;
  tools: Record<string, boolean>;
  pendingDeletes: string[];
}

/** 状态文件的最小 I/O 边界；测试注入内存实现，生产用 node fs。 */
export interface ToolkitStateIo {
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
}

/** 空状态：没有开关记录，也没有待删除项。 */
export const emptyToolkitState = (): ToolkitStateDoc => ({
  version: TOOLKIT_STATE_VERSION,
  tools: {},
  pendingDeletes: [],
});

/** node fs 实现：写入先落临时文件再 rename，避免半截文件。 */
export const nodeToolkitStateIo = (path: string): ToolkitStateIo => {
  const temporary = `${path}.tmp`;
  return {
    async read() {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },
    async write(text) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(temporary, text, "utf8");
      await rename(temporary, path);
    },
  };
};

/**
 * 解析状态文件文本；损坏或缺失一律回落空状态，不让配置问题阻断插件加载。
 * @param text - 文件内容；缺失时为 undefined。
 * @returns 只含已知字段值的状态文档。
 */
export const parseToolkitState = (text: string | undefined): ToolkitStateDoc => {
  if (text === undefined || text.trim() === "") return emptyToolkitState();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyToolkitState();
  }
  if (typeof raw !== "object" || raw === null) return emptyToolkitState();
  const record = raw as { tools?: unknown; pendingDeletes?: unknown };
  return {
    version: TOOLKIT_STATE_VERSION,
    tools: parseTools(record.tools),
    pendingDeletes: parsePendingDeletes(record.pendingDeletes),
  };
};

/** 序列化状态；带换行以便人工查看。 */
export const serializeToolkitState = (doc: ToolkitStateDoc): string => {
  return `${JSON.stringify(
    {
      version: TOOLKIT_STATE_VERSION,
      tools: doc.tools,
      pendingDeletes: doc.pendingDeletes,
    },
    null,
    2,
  )}\n`;
};

const parseTools = (value: unknown): Record<string, boolean> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const tools: Record<string, boolean> = {};
  for (const [id, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (typeof enabled === "boolean") tools[id] = enabled;
  }
  return tools;
};

const parsePendingDeletes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && isSessionId(entry));
};

/** 会话 id 同时用作目录名，解析阶段就拒绝任何路径分隔符。 */
export const isSessionId = (value: string): boolean => {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
};

const isMissing = (error: unknown): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
};

/** 串行化的状态读写：并发开关请求不会互相覆盖。 */
export class ToolkitStateStore {
  private doc: ToolkitStateDoc = emptyToolkitState();
  private chain: Promise<void> = Promise.resolve();
  private readonly io: ToolkitStateIo;

  constructor(io: ToolkitStateIo) {
    this.io = io;
  }

  /** 读取磁盘状态到内存；读取失败时保留空状态。 */
  async load(): Promise<ToolkitStateDoc> {
    await this.enqueue(async () => {
      this.doc = parseToolkitState(await this.io.read());
    });
    return this.snapshot();
  }

  /** 当前内存状态（只读副本）。 */
  snapshot(): ToolkitStateDoc {
    return {
      version: this.doc.version,
      tools: { ...this.doc.tools },
      pendingDeletes: [...this.doc.pendingDeletes],
    };
  }

  /** 写入一个工具的开关并落盘。 */
  async setTool(id: string, enabled: boolean): Promise<ToolkitStateDoc> {
    await this.enqueue(async () => {
      this.doc = { ...this.doc, tools: { ...this.doc.tools, [id]: enabled } };
      await this.io.write(serializeToolkitState(this.doc));
    });
    return this.snapshot();
  }

  /** 追加待删除的原会话 id（去重）并落盘。 */
  async addPendingDelete(sessionId: string): Promise<ToolkitStateDoc> {
    await this.enqueue(async () => {
      if (this.doc.pendingDeletes.includes(sessionId)) return;
      this.doc = { ...this.doc, pendingDeletes: [...this.doc.pendingDeletes, sessionId] };
      await this.io.write(serializeToolkitState(this.doc));
    });
    return this.snapshot();
  }

  /** 用处理后的结果替换待删除清单并落盘。 */
  async setPendingDeletes(ids: readonly string[]): Promise<ToolkitStateDoc> {
    await this.enqueue(async () => {
      this.doc = { ...this.doc, pendingDeletes: [...ids] };
      await this.io.write(serializeToolkitState(this.doc));
    });
    return this.snapshot();
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.chain.then(operation, operation);
    this.chain = next.catch(() => {});
    await next;
  }
}
