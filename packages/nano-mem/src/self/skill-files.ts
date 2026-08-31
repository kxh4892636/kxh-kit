import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ManagedSkillFile } from "./skill-catalog";

/** 受管标记文件名（与 loopx 的 .loopx-managed.json 隔离，ADR-0003）。 */
export const managedMarkerName = ".nano-mem-managed.json";

/**
 * 读取目录下全部普通文件（跳过受管 marker，任意层级），返回相对路径 + utf8 内容。
 * 空文件以空字符串参与；二进制文件按 utf8 解码后参与（与 loopx skill-files 策略一致，
 * 不按内容过滤）。每层目录按 localeCompare 排序，保证读取顺序确定。
 */
export const readSkillFiles = async (
  directory: string,
  prefix = "",
): Promise<readonly ManagedSkillFile[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: ManagedSkillFile[] = [];
  for (const entry of entries.sort((left: Dirent, right: Dirent): number =>
    left.name.localeCompare(right.name),
  )) {
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await readSkillFiles(absolutePath, relativePath)));
    else if (entry.isFile() && entry.name !== managedMarkerName) {
      files.push({ path: relativePath, content: await readFile(absolutePath, "utf8") });
    }
  }
  return files;
};

/**
 * contentHash：sha256，每条目为 `path \0 content \0`；先按 path 排序再哈希，
 * 与调用方传入顺序无关（同文件树不同读取顺序/目录序得到同一哈希）。
 * \0 分隔保证 path/content 边界无歧义（换行/空文件不会造成碰撞）。
 */
export const hashSkillFiles = (files: readonly ManagedSkillFile[]): string => {
  const ordered = [...files].sort((left, right) => left.path.localeCompare(right.path));
  const hash = createHash("sha256");
  for (const file of ordered) hash.update(file.path).update("\0").update(file.content).update("\0");
  return hash.digest("hex");
};
