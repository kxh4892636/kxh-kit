/**
 * 撤回目标的纯计算：在会话事件序列上定位「最后一轮」并从上一轮结束处切出 fork 点。
 * 只读事件数组，不依赖宿主对象，便于单测覆盖边界（首轮、运行中一轮、多段输入）。
 */

/** 会话事件的最小形状；`seq` 与数组下标一致（日志从 0 连续）。 */
export interface UndoSessionEvent {
  readonly type: string;
  readonly seq: number;
  readonly data?: unknown;
}

/** 撤回目标：被撤销的一轮、fork 切点与被撤销的用户原文。 */
export interface UndoTarget {
  /** 被撤销那一轮的编号。 */
  readonly turn: number;
  /** 该轮 `turn/start` 的 seq。 */
  readonly turnStartSeq: number;
  /** fork 的闭区间切点：上一轮的最后一个事件 seq。 */
  readonly cutSeq: number;
  /** 该轮用户输入原文，多段以空行连接；没有任何用户文本时为空串。 */
  readonly prompt: string;
}

/**
 * 找出「撤销最后一轮」所需的切点与原文。
 * @param events - 完整或尾部已加载的事件序列。
 * @returns 切点信息；会话没有任何轮次、或最后一轮是首轮（前面没有可回到的状态）时为 undefined。
 */
export const findUndoTarget = (events: readonly UndoSessionEvent[]): UndoTarget | undefined => {
  const lastIndex = lastTurnStartIndex(events);
  const start = lastIndex < 0 ? undefined : events[lastIndex];
  if (start === undefined) return undefined;
  const cutSeq = boundaryBefore(events, start.seq);
  if (cutSeq < 0) return undefined;
  return {
    turn: countTurns(events, lastIndex),
    turnStartSeq: start.seq,
    cutSeq,
    prompt: promptOfTurn(events, start.seq),
  };
};

/**
 * 切点：`turn/start` 之前最近的「真事件」。
 *
 * 排队输入会先写入 `agent/inbox/spliced`（把提示词插进 inbox），`turn/start` 才随后出现；
 * 若直接取 `start - 1`，fork 出来的子会话会**继承那条尚在排队的用户输入**，打开后表现为
 * 又把这条消息发了一遍。因此切点向前跳过 inbox 记账事件，落在上一轮的最后一个真实事件上。
 * @param events - 事件序列。
 * @param startSeq - 目标轮 `turn/start` 的 seq。
 * @returns 切点 seq；没有可回退的真事件时为 -1。
 */
const boundaryBefore = (events: readonly UndoSessionEvent[], startSeq: number): number => {
  let cutSeq = startSeq - 1;
  while (cutSeq >= 0 && isInboxBookkeeping(events[cutSeq])) cutSeq -= 1;
  if (cutSeq < 0) return -1;
  return events[cutSeq]?.seq === cutSeq ? cutSeq : -1;
};

/** inbox 记账事件（排队提示词的插入/领取/撤销）不属于任何一轮的可回退状态。 */
const isInboxBookkeeping = (event: UndoSessionEvent | undefined): boolean => {
  return event !== undefined && event.type.startsWith("agent/inbox/");
};

const lastTurnStartIndex = (events: readonly UndoSessionEvent[]): number => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === "turn/start") return index;
  }
  return -1;
};

/** 轮次编号：到该 `turn/start` 为止出现的轮次数量。 */
const countTurns = (events: readonly UndoSessionEvent[], tillIndex: number): number => {
  let count = 0;
  for (let index = 0; index <= tillIndex; index += 1) {
    if (events[index]?.type === "turn/start") count += 1;
  }
  return count;
};

/** 收集一轮内用户实际输入的文本片段；运行时上下文等注入消息被排除。 */
const promptOfTurn = (events: readonly UndoSessionEvent[], startSeq: number): string => {
  const parts: string[] = [];
  for (const event of events) {
    if (event.seq <= startSeq) continue;
    if (event.type === "turn/start" || event.type === "turn/end") break;
    if (event.type !== "user/message") continue;
    if (!isUserAuthored(event.data)) continue;
    const text = textOf(event.data);
    if (text !== "") parts.push(text);
  }
  return parts.join("\n\n");
};

const isUserAuthored = (data: unknown): boolean => {
  if (typeof data !== "object" || data === null) return false;
  const source = (data as { source?: unknown }).source;
  if (typeof source !== "object" || source === null) return true;
  const kind = (source as { kind?: unknown }).kind;
  return kind === undefined || kind === "user";
};

const textOf = (data: unknown): string => {
  if (typeof data !== "object" || data === null) return "";
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const texts: string[] = [];
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const candidate = part as { type?: unknown; text?: unknown };
    if (candidate.type === "text" && typeof candidate.text === "string") texts.push(candidate.text);
  }
  return texts.join("\n");
};
