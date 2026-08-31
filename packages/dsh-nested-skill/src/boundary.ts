import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import type { FileSystemLike } from "./contract.js";

export type FsKind = "file" | "directory";

/** 目录项的模型可见路径，供后续读取复用。 */
export interface FsEntry {
  name: string;
  path: string;
  kind: FsKind;
}

/** node 适配器与 ctx.fs 适配器共用的最小文件系统视图。 */
export interface HostFs {
  listDir(path: string): Promise<FsEntry[]>;
  readText(path: string): Promise<string | undefined>;
  /** 路径是否以任意实体存在（文件、目录或链接）。 */
  exists(path: string): Promise<boolean>;
}

/** 有 ctx.fs 服务时使用服务适配器，否则回退 node fs。 */
export const defaultHostFs = (ctx: { get<K extends "fs">(key: K): unknown }): HostFs => {
  const service = ctx.get("fs");
  return isFileSystem(service) ? fsServiceHostFs(service) : nodeHostFs;
};

const isFileSystem = (service: unknown): service is FileSystemLike => {
  return (
    service !== undefined &&
    typeof service === "object" &&
    service !== null &&
    "resolve" in service &&
    typeof (service as { resolve: unknown }).resolve === "function"
  );
};

/** 无 ctx.fs 服务时的宿主文件系统适配器。 */
export const nodeHostFs: HostFs = {
  async listDir(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true, encoding: "utf8" });
      const result: FsEntry[] = [];
      for (const entry of entries) {
        const kind = await nodeEntryKind(join(path, entry.name), entry);
        if (kind !== undefined)
          result.push({ name: entry.name, path: join(path, entry.name), kind });
      }
      return result;
    } catch (error) {
      if (isMissingPathError(error)) return [];
      throw error;
    }
  },
  async readText(path) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isMissingPathError(error)) return undefined;
      throw error;
    }
  },
  async exists(path) {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if (isMissingPathError(error)) return false;
      throw error;
    }
  },
};

/** ctx.fs 支持的适配器，使 skill 读取尊重宿主文件系统策略。 */
export const fsServiceHostFs = (fs: FileSystemLike): HostFs => {
  return {
    async listDir(path) {
      const target = await resolveTarget(fs, path);
      if (target === undefined) return [];
      try {
        return (await fs.listDir(target))
          .filter((entry) => entry.type === "file" || entry.type === "directory")
          .map((entry) => ({
            name: entry.name,
            path: entry.target.displayPath,
            kind: entry.type as FsKind,
          }));
      } catch (error) {
        if (isMissingPathError(error)) return [];
        throw error;
      }
    },
    async readText(path) {
      const target = await resolveTarget(fs, path);
      if (target === undefined) return undefined;
      try {
        const info = await fs.stat(target);
        if (info === undefined || info.type !== "file") return undefined;
        return await fs.readText(target);
      } catch (error) {
        if (isMissingPathError(error)) return undefined;
        throw error;
      }
    },
    async exists(path) {
      const target = await resolveTarget(fs, path);
      return target !== undefined;
    },
  };
};

export const isMissingPathError = (error: unknown): boolean => {
  return (
    hasErrorCode(error, "ENOENT") ||
    hasErrorCode(error, "ENOTDIR") ||
    hasErrorCode(error, "FS_NOT_FOUND") ||
    hasErrorCode(error, "FS_NOT_DIRECTORY")
  );
};

const hasErrorCode = (error: unknown, code: string): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
};

const resolveTarget = async (
  fs: FileSystemLike,
  path: string,
): Promise<Awaited<ReturnType<FileSystemLike["resolve"]>> | undefined> => {
  try {
    return await fs.resolve(path);
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
};

const nodeEntryKind = async (fullPath: string, entry: Dirent): Promise<FsKind | undefined> => {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  if (!entry.isSymbolicLink()) return undefined;
  try {
    const info = await stat(fullPath);
    // 递归遍历不跟随目录链接：链接环会让任意深度扫描挂起。
    if (info.isFile()) return "file";
    return undefined;
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
};
