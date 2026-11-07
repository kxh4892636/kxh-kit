import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseDocument, serializeDocument, type PlanDocument } from "./dag.js";
import type { OrchestratorSettings } from "./config.ts";

/** notes 文件的固定文件名。 */
export const NOTES_FILE = "notes.json";

/** 写回锁的键：一个 Plan 的 `notes.json` 绝对路径。 */
export const documentLockKey = (planDirectory: string): string => join(planDirectory, NOTES_FILE);

/**
 * 每个 `notes.json` 一条串行链：后来的写操作挂在前一个的尾巴上。
 *
 * 锁是**进程内**的：多个 worker 与编排方共存于同一个 pi 进程（`createAgentSession`
 * in-process），共享模块缓存，所以这个表就是共享的。跨 pi 实例不在本次范围 ——
 * 那时需要真正的文件锁（例如 `*.lock` + 原子创建）。
 */
const writeChains = new Map<string, Promise<void>>();

/**
 * 在同一份 `notes.json` 上串行执行一次读-改-写。
 *
 * 锁必须盖住「读 → 改 → 写」整段，而不只是最后的 rename：否则两个 worker 并行推进
 * 同一 Plan 的不同组时，后写的会把先写的改动整个盖掉。
 * @param key - 锁键，用 `documentLockKey` 生成。
 * @param action - 持锁期间的操作。
 * @returns `action` 的结果。
 */
export const withDocumentLock = <T>(key: string, action: () => Promise<T>): Promise<T> => {
  const previous = writeChains.get(key) ?? Promise.resolve();
  // 前一个失败不影响下一个：成功与失败都往下接。
  const next = previous.then(action, action);
  writeChains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
};

const describe = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * 读取一个 Plan 的 notes 文档。
 * @param planDirectory - Plan 目录。
 * @param limits - 生效上限。
 * @returns 校验通过的文档。
 */
export const loadDocument = async (
  planDirectory: string,
  limits: OrchestratorSettings,
): Promise<PlanDocument> => {
  let text: string;
  try {
    text = await readFile(join(planDirectory, NOTES_FILE), "utf8");
  } catch (error) {
    throw new Error(`读取 ${NOTES_FILE} 失败: ${describe(error)}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${NOTES_FILE} 不是合法 JSON: ${describe(error)}`);
  }
  return parseDocument(raw, limits);
};

/**
 * 校验并写回 notes 文档；先写临时文件再 rename，避免半截文件。
 * @param planDirectory - Plan 目录。
 * @param document - 待写入文档。
 * @param limits - 生效上限。
 * @returns 归一化后的文档。
 */
export const commitDocument = async (
  planDirectory: string,
  document: PlanDocument,
  limits: OrchestratorSettings,
): Promise<PlanDocument> => {
  const validated = parseDocument(JSON.parse(serializeDocument(document)), limits);
  const file = join(planDirectory, NOTES_FILE);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, serializeDocument(validated), "utf8");
  await rename(temporary, file);
  return validated;
};
