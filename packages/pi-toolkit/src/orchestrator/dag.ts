import type { OrchestratorSettings } from "./config.ts";

/**
 * note 的五个状态；流转见 `orchestrator/prompt.md` 的 notes 一节。
 *
 * `waiting` 表示交付物已完成但等一个人：仍是未完成，`needs` 说明等的是回答
 * 还是验收。只允许由 `status` 进入，`complete` 只接受 `waiting` + `needs=review`。
 */
export const NOTE_STATUSES = ["pending", "in_progress", "waiting", "blocked", "completed"] as const;

/**
 * `waiting` 时在等什么：`answer` 等人回答问题，`review` 等人验收。
 * 两个值直接对齐编排侧的 stage（`person/answer` 与 `person/review`）。
 */
export const NOTE_NEEDS = ["answer", "review"] as const;

/** note 状态类型。 */
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/** `waiting` 的等待目标。 */
export type NoteNeeds = (typeof NOTE_NEEDS)[number];

/** 重命名前的状态名；读到即当作 `waiting` + `needs: review`。 */
export const LEGACY_WAITING_STATUS = "awaiting_verification";

/** 一条实现记录（DAG 的节点）。 */
export interface NoteNode {
  readonly id: string;
  readonly title: string;
  /** 一句话摘要：列表、搜索与恢复只看它。 */
  readonly description: string;
  readonly status: NoteStatus;
  /** `status === "waiting"` 时必填。 */
  readonly needs?: NoteNeeds;
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
 * 把重命名前的状态名折到当前枚举。
 * @param value - 配置里的 status 原值。
 * @returns 归一化后的值；未知值原样返回，由调用方报错。
 */
export const normalizeStatus = (value: unknown): unknown => {
  return value === LEGACY_WAITING_STATUS ? "waiting" : value;
};

/**
 * 决定一条 note 最终的 `needs`。
 *
 * 旧文档的 `awaiting_verification` 没有 `needs`，按「等验收」补齐；新文档里
 * `waiting` 缺 `needs` 已被 parseDocument 记为问题，这里只是不丢字段。
 * @param status - 归一化后的状态。
 * @param needs - 原始 `needs`。
 * @param rawStatus - 原始状态值，用于识别旧文档。
 * @returns 待展开进 NoteNode 的字段。
 */
export const resolvedNeeds = (
  status: unknown,
  needs: unknown,
  rawStatus: unknown,
): { needs?: NoteNeeds } => {
  if (typeof needs === "string" && (NOTE_NEEDS as readonly string[]).includes(needs)) {
    return { needs: needs as NoteNeeds };
  }
  if (status === "waiting" && rawStatus === LEGACY_WAITING_STATUS) return { needs: "review" };
  return {};
};

/**
 * 解析并校验 notes.json。
 * @param raw - 已解析的 JSON 值。
 * @param limits - 生效上限。
 * @returns 归一化后的文档。
 * @throws 结构、DAG 或尺寸不合法时，错误信息逐条列出问题。
 */
export const parseDocument = (raw: unknown, limits: OrchestratorSettings): PlanDocument => {
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
    const status = normalizeStatus(item["status"]);
    if (typeof status !== "string" || !(NOTE_STATUSES as readonly string[]).includes(status)) {
      problems.push(`${at}.status 必须是 ${NOTE_STATUSES.join(" | ")}`);
    }
    const needs = item["needs"];
    if (status === "waiting" && needs === undefined) {
      if (item["status"] !== LEGACY_WAITING_STATUS) {
        problems.push(`${at}.status 是 waiting 时必须给 needs（${NOTE_NEEDS.join(" | ")}）`);
      }
    } else if (
      needs !== undefined &&
      (typeof needs !== "string" || !(NOTE_NEEDS as readonly string[]).includes(needs))
    ) {
      problems.push(`${at}.needs 必须是 ${NOTE_NEEDS.join(" | ")}`);
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
      ...resolvedNeeds(status, needs, item["status"]),
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
    ...(note.needs === undefined ? {} : { needs: note.needs }),
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

/** 依赖组：组内通过 blocked_by 边连通，按拓扑顺序排列。 */
export interface TodoGroup {
  readonly notes: readonly NoteNode[];
}

const STATUS_ORDER: Record<NoteStatus, number> = {
  in_progress: 0,
  pending: 1,
  waiting: 2,
  blocked: 3,
  completed: 4,
};

/**
 * 同层排序档位：可执行项在前，等待验证次之，blocked 最后。
 * 档位先于影响面比较，保证等待验证不会插到同层可执行项之前。
 */
const STATUS_RANK: Record<NoteStatus, number> = {
  in_progress: 0,
  pending: 0,
  waiting: 1,
  blocked: 2,
  completed: 2,
};

/**
 * 把未完成的 note 按依赖关系分组，供 `ready` 输出 todo 式列表。
 *
 * 有依赖关系的 note 落在同一组（弱连通分量），组内按拓扑顺序排列：前置在前，
 * 同层可执行项优先（解锁的未完成下游数降序、状态、id），等待验证排在其后、blocked 之前；
 * 已完成的依赖不参与连边。组间按组内最小 id 排序。
 * @param notes - 全部 note。
 * @returns 按组排列的 note；全部完成时为空数组。
 */
export const todoGroups = (notes: readonly NoteNode[]): readonly TodoGroup[] => {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const unfinished = notes.filter((note) => note.status !== "completed");
  if (unfinished.length === 0) return [];

  const unfinishedIds = new Set(unfinished.map((note) => note.id));
  const upstream = new Map<string, readonly string[]>();
  const downstream = new Map<string, string[]>();
  for (const note of unfinished) {
    const dependencies = note.blocked_by.filter((id) => unfinishedIds.has(id));
    upstream.set(note.id, dependencies);
    for (const dependency of dependencies) {
      const dependents = downstream.get(dependency) ?? [];
      dependents.push(note.id);
      downstream.set(dependency, dependents);
    }
  }

  const impact = new Map<string, number>();
  for (const note of unfinished) {
    const seen = new Set<string>();
    const queue = [...(downstream.get(note.id) ?? [])];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined || seen.has(current)) continue;
      seen.add(current);
      queue.push(...(downstream.get(current) ?? []));
    }
    impact.set(note.id, seen.size);
  }

  const compare = (left: NoteNode, right: NoteNode): number => {
    const byRank = STATUS_RANK[left.status] - STATUS_RANK[right.status];
    if (byRank !== 0) return byRank;
    const byImpact = (impact.get(right.id) ?? 0) - (impact.get(left.id) ?? 0);
    if (byImpact !== 0) return byImpact;
    const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (byStatus !== 0) return byStatus;
    return left.id.localeCompare(right.id);
  };

  const visited = new Set<string>();
  const components: NoteNode[][] = [];
  for (const note of unfinished) {
    if (visited.has(note.id)) continue;
    const component: NoteNode[] = [];
    const queue = [note.id];
    visited.add(note.id);
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) continue;
      const node = byId.get(current);
      if (node !== undefined) component.push(node);
      for (const next of [...(upstream.get(current) ?? []), ...(downstream.get(current) ?? [])]) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }

  const ordered = components.map((component) => {
    const indegree = new Map<string, number>();
    for (const note of component) {
      indegree.set(note.id, (upstream.get(note.id) ?? []).length);
    }
    const available = component.filter((note) => indegree.get(note.id) === 0);
    const result: NoteNode[] = [];
    while (available.length > 0) {
      available.sort(compare);
      const next = available.shift();
      if (next === undefined) break;
      result.push(next);
      for (const dependentId of downstream.get(next.id) ?? []) {
        const remaining = (indegree.get(dependentId) ?? 0) - 1;
        indegree.set(dependentId, remaining);
        if (remaining === 0) {
          const dependent = byId.get(dependentId);
          if (dependent !== undefined) available.push(dependent);
        }
      }
    }
    // 环或异常数据：把未排序的 note 按比较器补在末尾，保持列表完整。
    if (result.length < component.length) {
      const placed = new Set(result.map((note) => note.id));
      result.push(...component.filter((note) => !placed.has(note.id)).sort(compare));
    }
    return result;
  });

  const firstIdOf = (group: readonly NoteNode[]): string =>
    group.reduce((min, note) => (note.id < min ? note.id : min), "\uffff");
  ordered.sort((left, right) => firstIdOf(left).localeCompare(firstIdOf(right)));
  return ordered.map((group) => ({ notes: group }));
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
