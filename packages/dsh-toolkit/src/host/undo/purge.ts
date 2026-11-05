import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { isSessionId, type ToolkitStateStore } from "../toolkit-state.js";

/** 会话日志根下的最小 I/O 边界：列出一层子目录名、递归删除一个目录。 */
export interface SessionLogIo {
  listDirs(path: string): Promise<string[]>;
  removeDir(path: string): Promise<void>;
}

/** node fs 实现；列目录失败按「没有内容」处理，删除失败应抛出。 */
export const nodeSessionLogIo: SessionLogIo = {
  async listDirs(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true, encoding: "utf8" });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  },
  async removeDir(path) {
    await rm(path, { recursive: true, force: true });
  },
};

/** 一次删除尝试的结果：已删掉的与仍留待下次启动处理的。 */
export interface PurgeResult {
  readonly deleted: readonly string[];
  readonly retained: readonly string[];
}

/**
 * 删除会话的持久化目录：`<root>/<workspace-slug>/<sessionId>`。
 * 会话 id 先按目录名规则校验，避免把状态文件里的值当成路径片段。
 * @param root - 会话日志根（`$DSH_HOME/sessions`）。
 * @param ids - 待删除的会话 id。
 * @param io - 目录操作边界。
 * @returns 删除成功与失败（失败项留给下次启动重试）。
 */
export const deleteSessionLogs = async (
  root: string,
  ids: readonly string[],
  io: SessionLogIo = nodeSessionLogIo,
): Promise<PurgeResult> => {
  const deleted: string[] = [];
  const retained: string[] = [];
  const slugs = await io.listDirs(root);
  for (const id of ids) {
    if (!isSessionId(id)) {
      retained.push(id);
      continue;
    }
    try {
      // 会话目录挂在某个 workspace slug 之下；逐个 slug 尝试，缺失即空操作。
      for (const slug of slugs) {
        if (!isSessionId(slug)) continue;
        await io.removeDir(join(root, slug, id));
      }
      deleted.push(id);
    } catch {
      retained.push(id);
    }
  }
  return { deleted, retained };
};

/**
 * 启动时清理待删除清单：删除成功的从清单里去掉，失败的保留；
 * 删除成功但还没从归档集合摘掉的 id 进入待撤销归档清单。
 * @param store - 状态存储，两份清单都在这里持久化。
 * @param root - 会话日志根。
 * @param logger - 只记录失败的 warn。
 * @param io - 目录操作边界。
 * @param unarchive - 可选的「从归档集合摘掉」回调；缺席时全部留在待撤销队列。
 */
export const runPendingPurge = async (
  store: ToolkitStateStore,
  root: string,
  logger: { warn(message: string): void },
  io: SessionLogIo = nodeSessionLogIo,
  unarchive?: (sessionId: string) => Promise<void>,
): Promise<PurgeResult> => {
  const pending = store.snapshot().pendingDeletes;
  if (pending.length === 0) return { deleted: [], retained: [] };
  let result: PurgeResult;
  try {
    result = await deleteSessionLogs(root, pending, io);
  } catch (error) {
    logger.warn(`toolkit: pending session purge failed: ${describe(error)}`);
    return { deleted: [], retained: [...pending] };
  }
  if (result.retained.length !== pending.length) {
    await store.setPendingDeletes(result.retained);
  }
  for (const id of result.deleted) {
    if (unarchive === undefined) {
      await store.addPendingUnarchive(id);
      continue;
    }
    try {
      await unarchive(id);
    } catch (error) {
      logger.warn(`toolkit: unarchive of "${id}" failed: ${describe(error)}`);
      await store.addPendingUnarchive(id);
    }
  }
  if (result.retained.length > 0) {
    logger.warn(`toolkit: ${result.retained.length} session log(s) kept for the next start`);
  }
  return result;
};

/**
 * 处理待撤销归档清单：把已删干净的会话 id 从归档集合里去掉，失败项留到下次启动。
 * @param store - 状态存储。
 * @param unarchive - 注册表上的 `unarchiveSession`。
 * @param logger - 只记录失败的 warn。
 * @returns 成功摘掉的 id。
 */
export const runPendingUnarchive = async (
  store: ToolkitStateStore,
  unarchive: (sessionId: string) => Promise<void>,
  logger: { warn(message: string): void },
): Promise<readonly string[]> => {
  const pending = store.snapshot().pendingUnarchives;
  if (pending.length === 0) return [];
  const retained: string[] = [];
  const done: string[] = [];
  for (const id of pending) {
    try {
      await unarchive(id);
      done.push(id);
    } catch (error) {
      logger.warn(`toolkit: unarchive of "${id}" failed: ${describe(error)}`);
      retained.push(id);
    }
  }
  if (done.length > 0) await store.setPendingUnarchives(retained);
  return done;
};

const isMissing = (error: unknown): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
};

const describe = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
