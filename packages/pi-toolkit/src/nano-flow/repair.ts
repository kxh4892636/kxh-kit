/**
 * `notes.json` 的机械问题自动修复。
 *
 * 只修能无歧义判定的问题：摘要超长、`updated_at` 缺失、索引重复/越界/引用不存在的
 * note。内容超限、缺 evidence、依赖错误、环等语义问题不在自动修复范围内，仍由校验
 * 与模型处理。
 * @module @kxh4892636/pi-toolkit/nano-flow/repair
 */

import type { NanoFlowSettings } from "./config.ts";

/** 一次自动修复的结果。 */
export interface RepairResult {
  /** 修复后的原始 JSON 值（可能未变化）。 */
  readonly raw: unknown;
  /** 人类可读的修复项；空数组表示没有可自动修复的问题。 */
  readonly changes: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/** 按 Unicode 码点截断，超限时用省略号占最后一位。 */
export const truncateDescription = (text: string, maxChars: number): string => {
  const points = Array.from(text);
  if (points.length <= maxChars) return text;
  if (maxChars <= 0) return "";
  return `${points.slice(0, maxChars - 1).join("")}…`;
};

/**
 * 修复 `notes.json` 的机械问题。
 * @param raw - 已解析的 JSON 值。
 * @param limits - 生效上限。
 * @returns 修复后的值与修复项；无法判定的结构原样返回。
 */
export const repairDocument = (raw: unknown, limits: NanoFlowSettings): RepairResult => {
  if (!isRecord(raw) || !Array.isArray(raw["notes"])) {
    return { raw, changes: [] };
  }
  const changes: string[] = [];
  const notes = raw["notes"].map((note, index) => {
    if (!isRecord(note)) return note;
    const at = `notes[${index}]`;
    let next: Record<string, unknown> = note;
    const description = note["description"];
    if (typeof description === "string") {
      const truncated = truncateDescription(description, limits.noteDescriptionMaxChars);
      if (truncated !== description) {
        next = { ...next, description: truncated };
        changes.push(`${at}.description 截断到 ${limits.noteDescriptionMaxChars} 字`);
      }
    }
    const updatedAt = next["updated_at"];
    if (typeof updatedAt !== "string" || updatedAt.trim() === "") {
      next = { ...next, updated_at: new Date().toISOString() };
      changes.push(`${at}.updated_at 补为当前时间`);
    }
    return next;
  });

  const knownIds = new Set(
    notes
      .filter((note): note is Record<string, unknown> => isRecord(note))
      .map((note) => note["id"])
      .filter((id): id is string => typeof id === "string"),
  );

  let index = raw["index"];
  if (Array.isArray(index)) {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const item of index) {
      if (typeof item !== "string") continue;
      if (!seen.has(item) && knownIds.has(item)) kept.push(item);
      seen.add(item);
    }
    const capped = kept.slice(0, limits.indexMaxRows);
    if (capped.length !== index.length) {
      changes.push(`index 规范化（去重/丢弃不存在/裁剪到 ${limits.indexMaxRows} 行）`);
    }
    index = capped;
  }

  if (changes.length === 0) return { raw, changes: [] };
  return { raw: { ...raw, index, notes }, changes };
};
