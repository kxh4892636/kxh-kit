import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { DEFAULT_NANO_FLOW_SETTINGS, type NanoFlowSettings } from "../contract.js";

export { DEFAULT_NANO_FLOW_SETTINGS };
export type { NanoFlowSettings };

const INTEGER_KEYS = [
  "specMaxBytes",
  "noteMaxBytes",
  "noteDescriptionMaxChars",
  "indexMaxRows",
  "contextMaxBytes",
  "questionMaxBytes",
  "adrMaxBytes",
  "adrMaxCount",
  "workflowMaxBytes",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * 校验并合并一份设置：未知键忽略，已知键必须是正整数，`rotateAt` 必须在 (0, 1]。
 * @param raw - 待校验的值（可为已有设置的部分字段）。
 * @param base - 缺省字段的来源。
 * @returns 完整设置。
 * @throws 任一已知字段非法时。
 */
export const parseNanoFlowSettings = (
  raw: unknown,
  base: NanoFlowSettings = DEFAULT_NANO_FLOW_SETTINGS,
): NanoFlowSettings => {
  if (!isRecord(raw)) throw new Error("设置必须是对象");
  const result: Record<string, number> = { ...base };
  for (const key of INTEGER_KEYS) {
    if (raw[key] === undefined) continue;
    const value = raw[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new Error(`${key} 必须是正整数，实际为 ${describe(value)}`);
    }
    result[key] = value;
  }
  if (raw["rotateAt"] !== undefined) {
    const value = raw["rotateAt"];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1) {
      throw new Error(`rotateAt 必须落在 (0, 1]，实际为 ${describe(value)}`);
    }
    result["rotateAt"] = value;
  }
  return result as unknown as NanoFlowSettings;
};

/** 设置文件的最小 I/O 边界。 */
export interface NanoFlowSettingsIo {
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
}

/** node fs 实现：临时文件 + rename，避免半截写入。 */
export const nodeNanoFlowSettingsIo = (path: string): NanoFlowSettingsIo => ({
  async read() {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  },
  async write(text) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, text, "utf8");
    await rename(temporary, path);
  },
});

const serialize = (settings: NanoFlowSettings): string => {
  return `${JSON.stringify({ version: 1, ...settings }, null, 2)}\n`;
};

/** 设置存储：内存快照 + 串行落盘。 */
export interface NanoFlowSettingsStore {
  /** 当前生效值（加载完成前是默认值）。 */
  current(): NanoFlowSettings;
  /** 从磁盘加载；损坏时回落默认值。 */
  load(): Promise<NanoFlowSettings>;
  /** 合并并落盘，返回新值。 */
  update(patch: unknown): Promise<NanoFlowSettings>;
}

/**
 * 创建设置存储。
 * @param io - 文件 I/O 边界。
 * @param logger - 损坏文件的告警出口。
 * @returns 设置存储。
 */
export const createNanoFlowSettingsStore = (
  io: NanoFlowSettingsIo,
  logger: { warn(message: string): void },
): NanoFlowSettingsStore => {
  let value = DEFAULT_NANO_FLOW_SETTINGS;
  let chain: Promise<unknown> = Promise.resolve();
  const serializeCall = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = chain.then(operation, operation);
    chain = next.catch(() => {});
    return next;
  };
  return {
    current: () => value,
    load: () =>
      serializeCall(async () => {
        let text: string | undefined;
        try {
          text = await io.read();
        } catch (error) {
          logger.warn(`nano-flow: 读取设置失败，使用默认值: ${describe(error)}`);
          return value;
        }
        if (text === undefined || text.trim() === "") return value;
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          logger.warn("nano-flow: 设置文件不是合法 JSON，使用默认值");
          return value;
        }
        try {
          value = parseNanoFlowSettings(isRecord(raw) && raw["version"] === 1 ? raw : {}, value);
        } catch (error) {
          logger.warn(`nano-flow: 设置无效，使用默认值: ${describe(error)}`);
        }
        return value;
      }),
    update: (patch) =>
      serializeCall(async () => {
        const next = parseNanoFlowSettings(patch, value);
        await io.write(serialize(next));
        value = next;
        return value;
      }),
  };
};

const describe = (value: unknown): string => {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? typeof value;
};
