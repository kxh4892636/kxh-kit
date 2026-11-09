/**
 * 侧栏读取：只返回当前 Plan 里未完成的 note（pending / in_progress / blocked）。
 * 读不了的条目跳过，不抛错；侧栏是只读视图，不参与业务判断。
 * @module @kxh4892636/pi-toolkit/nano-flow/notes
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

/** 侧栏展示的 note 状态；完成的 note 不进侧栏。 */
export const PANEL_STATUSES = ["pending", "in_progress", "blocked"] as const;

export type PanelStatus = (typeof PANEL_STATUSES)[number];

/** 侧栏里的一条 note。 */
export interface NanoNote {
  readonly name: string;
  readonly status: PanelStatus;
  readonly description: string;
  /** `blocked` 时写清在等什么；其他状态没有。 */
  readonly reason?: string;
  /** 单行下一步；缺省表示没有。 */
  readonly nextStep?: string;
}

const isPanelStatus = (value: unknown): value is PanelStatus =>
  typeof value === "string" && (PANEL_STATUSES as readonly string[]).includes(value);

const optionalLine = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text === "" ? undefined : text;
};

const readFrontmatter = (file: string): Record<string, unknown> | null => {
  let text: string;
  try {
    text = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  } catch {
    return null;
  }
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end < 0) return null;
  try {
    const data: unknown = parseYaml(text.slice(4, end));
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/**
 * 读取一个 Plan 目录里未完成的 note。
 * @param planDirectory - Plan 目录的绝对路径。
 * @returns 按文件名排序的条目；目录不存在或没有未完成项时返回空数组。
 */
export const readUnfinishedNotes = (planDirectory: string): NanoNote[] => {
  let entries: string[];
  try {
    entries = readdirSync(planDirectory).filter((name) => /^\d{3}-.+\.md$/u.test(name));
  } catch {
    return [];
  }
  entries.sort((left, right) => left.localeCompare(right));
  const notes: NanoNote[] = [];
  for (const file of entries) {
    const header = readFrontmatter(join(planDirectory, file));
    if (header === null || !isPanelStatus(header["status"])) continue;
    const name = typeof header["name"] === "string" ? header["name"] : file.slice(0, -3);
    const description = typeof header["description"] === "string" ? header["description"] : "";
    const reason = optionalLine(header["reason"]);
    const nextStep = optionalLine(header["next_step"]);
    notes.push({
      name,
      status: header["status"],
      description,
      ...(reason === undefined ? {} : { reason }),
      ...(nextStep === undefined ? {} : { nextStep }),
    });
  }
  return notes;
};
