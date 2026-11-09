import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { parse as parseYaml } from "yaml";

import { PANEL_STATUSES, type NotesSnapshot, type PanelNote } from "../contract.js";

const isPanelStatus = (value: unknown): value is PanelNote["status"] =>
  typeof value === "string" && (PANEL_STATUSES as readonly string[]).includes(value);

const readFrontmatter = (file: string): Record<string, unknown> | null => {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return null;
  try {
    const data: unknown = parseYaml(normalized.slice(4, end));
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * 读取一个 Plan 目录里未完成的 note（跳过 spec / notes_index 与已完成项）。
 * @param planDirectory - Plan 目录的绝对路径。
 * @returns 按文件名排序的面板条目；读不了的项跳过，不抛错。
 */
export const readPanelNotes = (planDirectory: string): PanelNote[] => {
  let entries: string[];
  try {
    entries = readdirSync(planDirectory).filter((name) => /^\d{3}-.+\.md$/u.test(name));
  } catch {
    return [];
  }
  entries.sort((left, right) => left.localeCompare(right));
  const notes: PanelNote[] = [];
  for (const file of entries) {
    const header = readFrontmatter(join(planDirectory, file));
    if (header === null) continue;
    const status = header["status"];
    if (!isPanelStatus(status)) continue;
    const name = typeof header["name"] === "string" ? header["name"] : file.replace(/\.md$/u, "");
    const description = typeof header["description"] === "string" ? header["description"] : "";
    notes.push({ name, status, description });
  }
  return notes;
};

/**
 * 组装面板快照。
 * @param workspace - 工作区根。
 * @param planDirectory - Plan 目录。
 * @returns 快照；没有未完成 note 时返回 `null`（面板不渲染）。
 */
export const buildNotesSnapshot = (
  workspace: string,
  planDirectory: string,
): NotesSnapshot | null => {
  const notes = readPanelNotes(planDirectory);
  if (notes.length === 0) return null;
  const planPath = relative(workspace, planDirectory).replaceAll("\\", "/");
  const segments = planPath.split("/");
  const planName = segments[segments.length - 1] ?? planPath;
  return { planName, planPath, notes };
};
