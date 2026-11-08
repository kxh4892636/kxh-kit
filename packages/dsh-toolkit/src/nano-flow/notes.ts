import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

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
 * 列出领域根下所有 active Plan 目录。
 * @param domainsDirectory - `.agents/domains` 的绝对路径。
 * @returns Plan 目录绝对路径，按字典序。
 */
export const listActivePlans = (domainsDirectory: string): string[] => {
  let domains: string[];
  try {
    domains = readdirSync(domainsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  domains.sort((left, right) => left.localeCompare(right));
  const plans: string[] = [];
  for (const domain of domains) {
    const active = join(domainsDirectory, domain, "plans", "active");
    try {
      const entries = readdirSync(active, { withFileTypes: true }).filter((entry) =>
        entry.isDirectory(),
      );
      for (const entry of entries) plans.push(join(active, entry.name));
    } catch {
      continue;
    }
  }
  return plans;
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

/**
 * 按工作区与领域根现算面板快照。
 *
 * 只有领域根下**恰好一个** active Plan 时才显示；多个 Plan 并存时返回 `null`，
 * 等用户明确指定。快照不写会话日志，每次请求都是当前文件系统状态。
 * @param options - 工作区、领域根（可为相对工作区的路径）。
 * @returns 面板快照或 `null`。
 */
export const notesForWorkspace = (options: {
  readonly workspace: string;
  readonly domainRoot: string;
}): NotesSnapshot | null => {
  const domainsDirectory = isAbsolute(options.domainRoot)
    ? options.domainRoot
    : join(options.workspace, options.domainRoot);
  const plans = listActivePlans(domainsDirectory);
  if (plans.length !== 1) return null;
  const plan = plans[0];
  if (plan === undefined) return null;
  return buildNotesSnapshot(options.workspace, plan);
};
