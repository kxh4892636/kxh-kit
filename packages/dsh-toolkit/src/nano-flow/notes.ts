import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** 面板读取的会话投影键；客户端用它 `useProjection`。 */
export const NOTES_PROJECTION_KEY = "nanoFlowNotes";

/** 快照写进会话日志的事件名；投影取最近一条。 */
export const NOTES_EVENT = "nano-flow/notes";

/** 宿主轮询节奏：5s 重算，只有快照变化才写事件。 */
export const NOTES_REFRESH_MS = 5_000;

/** 面板展示的 note 状态：完成的 note 不进面板。 */
export const PANEL_STATUSES = ["pending", "in_progress", "blocked"] as const;

/** 面板里的一条 note。 */
export interface PanelNote {
  readonly name: string;
  readonly status: (typeof PANEL_STATUSES)[number];
  readonly description: string;
}

/** 面板快照；`planPath` 相对工作区，便于日志回放后重新定位。 */
export interface NotesSnapshot {
  readonly planName: string;
  readonly planPath: string;
  readonly notes: readonly PanelNote[];
}

/** 宿主侧投影状态：快照或「未绑定 / 无未完成 note」。 */
export type NotesState = NotesSnapshot | null;

const panelNoteSchema = z.object({
  name: z.string(),
  status: z.enum(PANEL_STATUSES),
  description: z.string(),
});

export const notesSnapshotSchema = z.object({
  planName: z.string(),
  planPath: z.string(),
  notes: z.array(panelNoteSchema),
});

export const notesStateSchema = z.union([notesSnapshotSchema, z.null()]);

/** 会话作用域；只声明本模块用到的成员。 */
export interface SessionLike {
  readonly header?: { readonly cwd?: string };
  append(type: string, data: unknown): unknown;
}

/** agent 的最小形状（宿主 Agent）。 */
export interface AgentLike {
  readonly session?: SessionLike;
}

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
 * @param planDirectory - 绑定的 Plan 目录。
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
 * 解析当前会话要绑定的 Plan 目录。
 *
 * 优先复用会话日志里已绑定的 `planPath`；没有绑定时，只有领域根下**恰好一个** active
 * Plan 才绑定，多个 Plan 并存时保持未绑定（面板不显示，等用户指定）。
 * @param options - 工作区、领域根与会话日志里的既有绑定。
 * @returns Plan 目录绝对路径；无法唯一确定时为 `undefined`。
 */
export const resolveBoundPlan = (options: {
  readonly workspace: string;
  readonly domainsDirectory: string;
  readonly boundPlanPath?: string | undefined;
}): string | undefined => {
  const { workspace, domainsDirectory, boundPlanPath } = options;
  if (boundPlanPath !== undefined && boundPlanPath !== "") {
    const directory = isAbsolute(boundPlanPath) ? boundPlanPath : join(workspace, boundPlanPath);
    try {
      readdirSync(directory);
      return directory;
    } catch {
      // 绑定的 Plan 已被移走（reference / archived）：不再回退到别的 Plan。
      return undefined;
    }
  }
  const plans = listActivePlans(domainsDirectory);
  return plans.length === 1 ? plans[0] : undefined;
};
