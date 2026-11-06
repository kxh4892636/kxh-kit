import type { NanoFlowSettings } from "../contract.js";

/** note 的四个状态；流转见 `nano-flow/prompt.md` 的 notes 一节。 */
export const NOTE_STATUSES = ["pending", "in_progress", "blocked", "completed"] as const;

/** note 状态类型。 */
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/** 一条实现记录（DAG 的节点）。 */
export interface NoteNode {
  readonly id: string;
  readonly title: string;
  /** 一句话摘要：列表、搜索与恢复只看它。 */
  readonly description: string;
  readonly status: NoteStatus;
  readonly blocked_by: readonly string[];
  /** 完成凭据；`completed` 时不能为空。 */
  readonly evidence: readonly string[];
  readonly blocked_reason?: string;
  readonly updated_at: string;
  readonly content: string;
}

/** `notes.json` 的完整内容。 */
export interface PlanDocument {
  readonly version: 1;
  /** 关键 note 的索引（有序），取代旧的 spec `## Notes` 表。 */
  readonly index: readonly string[];
  readonly notes: readonly NoteNode[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

/** UTF-8 字节数：上限一律按字节算。 */
export const byteLength = (value: string): number => Buffer.byteLength(value, "utf8");

/** 当前时间，带时区偏移的 ISO 字符串。 */
export const nowIso = (): string => new Date().toISOString();

/**
 * 解析并校验 notes.json。
 * @param raw - 已解析的 JSON 值。
 * @param limits - 生效上限。
 * @returns 归一化后的文档。
 * @throws 结构、DAG 或尺寸不合法时，错误信息逐条列出问题。
 */
export const parseDocument = (raw: unknown, limits: NanoFlowSettings): PlanDocument => {
  if (!isRecord(raw)) throw new Error("notes.json 根必须是对象");
  const problems: string[] = [];
  if (raw["version"] !== 1) {
    problems.push(`version 必须是 1，实际为 ${String(raw["version"])}`);
  }
  const rawNotes = raw["notes"];
  if (!Array.isArray(rawNotes)) throw new Error("notes.json 的 notes 必须是数组");
  const rawIndex = raw["index"];
  if (!isStringArray(rawIndex)) problems.push("index 必须是字符串数组");

  const notes: NoteNode[] = [];
  const ids = new Set<string>();
  for (const [position, item] of rawNotes.entries()) {
    const at = `notes[${position}]`;
    if (!isRecord(item)) {
      problems.push(`${at} 必须是对象`);
      continue;
    }
    const id = item["id"];
    if (typeof id !== "string" || !/^\d{2}$/.test(id)) {
      problems.push(`${at}.id 必须是两位数字字符串`);
      continue;
    }
    if (ids.has(id)) problems.push(`${at}.id 重复: ${id}`);
    ids.add(id);
    const title = item["title"];
    if (typeof title !== "string" || title.trim() === "")
      problems.push(`${at}.title 必须是非空字符串`);
    const description = item["description"];
    if (typeof description !== "string") {
      problems.push(`${at}.description 必须是字符串`);
    } else if (Array.from(description).length > limits.noteDescriptionMaxChars) {
      problems.push(
        `${at}.description 超过 ${limits.noteDescriptionMaxChars} 字，请压到一句话摘要`,
      );
    }
    const status = item["status"];
    if (typeof status !== "string" || !(NOTE_STATUSES as readonly string[]).includes(status)) {
      problems.push(`${at}.status 必须是 ${NOTE_STATUSES.join(" | ")}`);
    }
    const blockedBy = item["blocked_by"];
    if (!isStringArray(blockedBy)) problems.push(`${at}.blocked_by 必须是字符串数组`);
    const evidence = item["evidence"];
    if (evidence !== undefined && !isStringArray(evidence)) {
      problems.push(`${at}.evidence 必须是字符串数组`);
    }
    const blockedReason = item["blocked_reason"];
    if (
      blockedReason !== undefined &&
      blockedReason !== null &&
      typeof blockedReason !== "string"
    ) {
      problems.push(`${at}.blocked_reason 必须是字符串或 null`);
    }
    const content = item["content"];
    if (typeof content !== "string") {
      problems.push(`${at}.content 必须是字符串`);
    } else if (byteLength(content) > limits.noteMaxBytes) {
      problems.push(
        `${at}.content 共 ${byteLength(content)} 字节，超过 ${limits.noteMaxBytes}；请拆分为多条 note`,
      );
    }
    const updatedAt = item["updated_at"];
    notes.push({
      id,
      title: typeof title === "string" ? title : "",
      description: typeof description === "string" ? description : "",
      status: (typeof status === "string" && (NOTE_STATUSES as readonly string[]).includes(status)
        ? status
        : "pending") as NoteStatus,
      blocked_by: isStringArray(blockedBy) ? blockedBy : [],
      evidence: isStringArray(evidence) ? evidence : [],
      ...(typeof blockedReason === "string" ? { blocked_reason: blockedReason } : {}),
      updated_at: typeof updatedAt === "string" ? updatedAt : "",
      content: typeof content === "string" ? content : "",
    });
  }

  const byId = new Map(notes.map((note) => [note.id, note]));
  for (const note of notes) {
    for (const dependency of note.blocked_by) {
      if (dependency === note.id) {
        problems.push(`note ${note.id} 不能依赖自己`);
        continue;
      }
      if (!byId.has(dependency)) {
        problems.push(`note ${note.id} 依赖不存在的 note ${dependency}`);
        continue;
      }
      const target = byId.get(dependency);
      const requiresCompleted = note.status !== "pending";
      if (requiresCompleted && target?.status !== "completed") {
        problems.push(`${note.status} 的 note ${note.id} 的直接依赖 ${dependency} 尚未 completed`);
      }
    }
    if (note.status === "completed" && note.evidence.length === 0) {
      problems.push(`completed 的 note ${note.id} 缺少 evidence`);
    }
    if (note.status === "blocked" && (note.blocked_reason ?? "").trim() === "") {
      problems.push(`blocked 的 note ${note.id} 必须写 blocked_reason`);
    }
  }
  if (hasCycle(notes)) problems.push("note 依赖图存在环");

  const index = isStringArray(rawIndex) ? rawIndex : [];
  if (index.length > limits.indexMaxRows) {
    problems.push(`index 共 ${index.length} 项，超过 ${limits.indexMaxRows}`);
  }
  const seen = new Set<string>();
  for (const id of index) {
    if (seen.has(id)) problems.push(`index 重复: ${id}`);
    seen.add(id);
    if (!byId.has(id)) problems.push(`index 引用了不存在的 note ${id}`);
  }

  if (problems.length > 0) {
    throw new Error(`notes.json 无效：\n- ${problems.join("\n- ")}`);
  }
  return {
    version: 1,
    index,
    notes: [...notes].sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const hasCycle = (notes: readonly NoteNode[]): boolean => {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (note: NoteNode): boolean => {
    if (visiting.has(note.id)) return true;
    if (visited.has(note.id)) return false;
    visiting.add(note.id);
    const cyclic = note.blocked_by.some((dependency) => {
      const target = byId.get(dependency);
      return target === undefined ? false : visit(target);
    });
    visiting.delete(note.id);
    visited.add(note.id);
    return cyclic;
  };
  return notes.some((note) => visit(note));
};

/** 序列化：稳定字段顺序，2 空格缩进，结尾换行。 */
export const serializeDocument = (document: PlanDocument): string => {
  const notes = document.notes.map((note) => ({
    id: note.id,
    title: note.title,
    description: note.description,
    status: note.status,
    blocked_by: note.blocked_by,
    evidence: note.evidence,
    ...(note.blocked_reason === undefined ? {} : { blocked_reason: note.blocked_reason }),
    updated_at: note.updated_at,
    content: note.content,
  }));
  return `${JSON.stringify({ version: document.version, index: document.index, notes }, null, 2)}\n`;
};

/** 空文档：新建 Plan 时使用。 */
export const emptyDocument = (): PlanDocument => ({ version: 1, index: [], notes: [] });

/** 分配下一个 note id；允许断号，不重排既有 id。 */
export const nextNoteId = (notes: readonly NoteNode[]): string => {
  const max = notes.reduce((current, note) => Math.max(current, Number(note.id)), 0);
  const next = max + 1;
  if (next > 99) throw new Error("note id 已用满 99，请先合并或删除部分 note");
  return String(next).padStart(2, "0");
};

/** 由全部 note 派生的 Plan 状态。 */
export const planStatusOf = (
  notes: readonly NoteNode[],
): "pending" | "in_progress" | "completed" => {
  if (notes.every((note) => note.status === "pending")) return "pending";
  if (notes.every((note) => note.status === "completed")) return "completed";
  return "in_progress";
};

/** 可推进的 note：pending 且直接依赖全部 completed。 */
export const readyNotes = (notes: readonly NoteNode[]): readonly NoteNode[] => {
  const byId = new Map(notes.map((note) => [note.id, note]));
  return notes.filter(
    (note) =>
      note.status === "pending" &&
      note.blocked_by.every((dependency) => byId.get(dependency)?.status === "completed"),
  );
};

/** 一个 note 的直接与传递上下游。 */
export const graphOf = (
  notes: readonly NoteNode[],
  id: string,
): { upstream: readonly string[]; downstream: readonly string[] } => {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const collect = (start: string, next: (note: NoteNode) => readonly string[]): string[] => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      const note = byId.get(current);
      if (note === undefined) continue;
      for (const idOfNext of next(note)) {
        if (seen.has(idOfNext)) continue;
        seen.add(idOfNext);
        queue.push(idOfNext);
      }
    }
    seen.delete(start);
    return [...seen].sort();
  };
  return {
    upstream: collect(id, (note) => note.blocked_by),
    downstream: collect(id, (note) =>
      notes
        .filter((candidate) => candidate.blocked_by.includes(note.id))
        .map((candidate) => candidate.id),
    ),
  };
};

/** 在标题、摘要与正文里做包含匹配。 */
export const searchNotes = (notes: readonly NoteNode[], query: string): readonly NoteNode[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return notes.filter((note) => {
    return (
      note.title.toLowerCase().includes(needle) ||
      note.description.toLowerCase().includes(needle) ||
      note.content.toLowerCase().includes(needle)
    );
  });
};
