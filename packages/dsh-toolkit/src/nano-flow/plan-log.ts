import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

/** Plan 轨迹文件名：与 spec.md 同级。 */
export const PLAN_LOG_FILE = "log.jsonl";

/** 工具参数截断上限（字节）。 */
export const ARG_LIMIT = 4096;

/** 工具结果截断上限（字节）。 */
export const RESULT_LIMIT = 4096;

/** 单轮 assistant 文本上限（字节）。 */
export const ASSISTANT_LIMIT = 8192;

/** 绑定表文件名。 */
export const BINDINGS_FILE = "nano-flow-plan-bindings.json";

/** 会话里的一条工具调用摘要。 */
export interface CompactTool {
  readonly name: string;
  readonly args: string;
  readonly ok: boolean;
  readonly result: string;
  readonly truncated: { readonly args: boolean; readonly result: boolean };
  readonly resultBytes: number;
}

/** 一轮对话的摘要记录（log.jsonl 的一行）。 */
export interface CompactTurn {
  readonly type: "turn";
  readonly v: 1;
  readonly sessionId: string;
  readonly turn: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly user: string;
  readonly assistant: string;
  readonly tools: readonly CompactTool[];
  readonly usage: Record<string, number>;
  readonly seq: readonly [number, number];
}

/** log.jsonl 的会话段头。 */
export interface SessionHeader {
  readonly type: "session";
  readonly v: 1;
  readonly sessionId: string;
  readonly cwd: string;
  readonly planPath: string;
  readonly boundAt: string;
}

/** 一条绑定。 */
export interface PlanBinding {
  readonly planPath: string;
  readonly cwd: string;
  readonly boundAt: string;
}

/** 绑定表：sessionId → 绑定。 */
export type BindingTable = Record<string, PlanBinding>;

/** 截断文本；`bytes` 是原文 UTF-8 字节数。 */
export const truncateText = (
  text: string,
  limit: number,
): { readonly text: string; readonly truncated: boolean; readonly bytes: number } => {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= limit) return { text, truncated: false, bytes };
  const buffer = Buffer.from(text, "utf8").subarray(0, limit);
  return { text: buffer.toString("utf8").replace(/\uFFFD$/u, ""), truncated: true, bytes };
};

/** 只声明构建记录用到的事件字段（宿主事件按需取用）。 */
export interface SessionEventLike {
  readonly type?: string;
  readonly seq?: number;
  readonly time?: number;
  readonly data?: unknown;
}

interface ContentBlock {
  readonly type?: string;
  readonly text?: string;
  readonly name?: string;
}

const blocksOf = (content: unknown): readonly ContentBlock[] =>
  Array.isArray(content) ? (content as readonly ContentBlock[]) : [];

/** 取内容块里的全部文本（按块顺序、换行连接）。 */
export const textOf = (content: unknown): string =>
  blocksOf(content)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");

/** 把未知值收窄成对象；非对象返回空对象。 */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/**
 * 把一轮里的事件压成一条 compact 记录。
 * @param sessionId - 会话 id。
 * @param turn - 轮次号。
 * @param events - 该轮的已提交事件（含 turn/start 与 turn/end）。
 * @returns 记录；没有可识别内容时返回 `null`。
 */
export const buildTurnRecord = (options: {
  readonly sessionId: string;
  readonly turn: number;
  readonly events: readonly SessionEventLike[];
}): CompactTurn | null => {
  const { sessionId, turn } = options;
  const users: string[] = [];
  const assistants: string[] = [];
  const calls = new Map<string, { name: string; arguments: string }>();
  const results = new Map<string, { text: string; isError: boolean }>();
  let usage: Record<string, number> = {};
  let first = Number.POSITIVE_INFINITY;
  let last = -1;
  let startedAt: number | undefined;
  let endedAt: number | undefined;
  for (const event of options.events) {
    if (typeof event.seq === "number") {
      first = Math.min(first, event.seq);
      last = Math.max(last, event.seq);
    }
    if (event.type === "turn/start") startedAt = event.time;
    if (event.type === "turn/end") endedAt = event.time;
    const data = asRecord(event.data);
    if (event.type === "user/message") {
      const text = textOf(data["content"]);
      if (text !== "") users.push(text);
      continue;
    }
    if (event.type === "assistant/message") {
      const message = asRecord(data["message"]);
      const text = textOf(message["content"]);
      if (text !== "") assistants.push(text);
      const rawUsage = data["usage"];
      if (typeof rawUsage === "object" && rawUsage !== null) {
        usage = Object.fromEntries(
          Object.entries(rawUsage as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        );
      }
      continue;
    }
    if (event.type === "tool/call") {
      const callId = typeof data["callId"] === "string" ? data["callId"] : undefined;
      if (callId !== undefined) {
        calls.set(callId, {
          name: typeof data["name"] === "string" ? data["name"] : "unknown",
          arguments: typeof data["arguments"] === "string" ? data["arguments"] : "",
        });
      }
      continue;
    }
    if (event.type === "tool/result") {
      const message = asRecord(data["message"]);
      const source = asRecord(message["source"]);
      const callId =
        typeof source["callId"] === "string"
          ? source["callId"]
          : typeof message["toolCallId"] === "string"
            ? message["toolCallId"]
            : undefined;
      if (callId !== undefined) {
        results.set(callId, {
          text: textOf(message["content"]),
          isError: message["isError"] === true,
        });
      }
    }
  }
  if (users.length === 0 && assistants.length === 0 && calls.size === 0) return null;
  const tools: CompactTool[] = [];
  for (const [callId, call] of calls) {
    const result = results.get(callId);
    const args = truncateText(call.arguments, ARG_LIMIT);
    const output = truncateText(result?.text ?? "", RESULT_LIMIT);
    tools.push({
      name: call.name,
      args: args.text,
      ok: result === undefined ? false : !result.isError,
      result: output.text,
      truncated: { args: args.truncated, result: output.truncated },
      resultBytes: output.bytes,
    });
  }
  const assistant = truncateText(assistants.join("\n\n"), ASSISTANT_LIMIT);
  const startMs = startedAt ?? (Number.isFinite(first) ? options.events[0]?.time : undefined);
  const endMs = endedAt ?? options.events[options.events.length - 1]?.time;
  return {
    type: "turn",
    v: 1,
    sessionId,
    turn,
    startedAt: new Date(startMs ?? 0).toISOString(),
    endedAt: new Date(endMs ?? startMs ?? 0).toISOString(),
    user: users.join("\n\n"),
    assistant: assistant.text,
    tools,
    usage,
    seq: [Number.isFinite(first) ? first : 0, Math.max(last, 0)],
  };
};

/**
 * 把事件按轮分组。
 *
 * 事件大多带 `data.turn`，但 `user/message` 不带；这类事件按 seq 落在哪个
 * `turn/start` → `turn/end` 窗口内归属。
 * @param events - 一段已提交事件。
 * @param startTurn - 该段事件之前仍在进行的轮号（分段读取时用于归属无 `turn` 的事件）。
 * @returns turn → 事件列表。
 */
export const groupByTurn = (
  events: readonly SessionEventLike[],
  startTurn?: number,
): Map<number, SessionEventLike[]> => {
  const ordered = [...events].sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0));
  const turns = new Map<number, SessionEventLike[]>();
  let current: number | undefined = startTurn;
  for (const event of ordered) {
    const explicit = asRecord(event.data)["turn"];
    const own = typeof explicit === "number" ? explicit : undefined;
    if (event.type === "turn/start" && own !== undefined) current = own;
    const turn = own ?? current;
    if (turn !== undefined) {
      const list = turns.get(turn);
      if (list === undefined) turns.set(turn, [event]);
      else list.push(event);
    }
    if (event.type === "turn/end" && own !== undefined) current = undefined;
  }
  return turns;
};

/** 判断一段事件里是否出现过 nano-flow 预设选择。 */
export const isNanoFlowPreset = (events: readonly SessionEventLike[]): boolean => {
  for (const event of events) {
    if (event.type !== "agent-preset/selected") continue;
    if (asRecord(event.data)["agentPreset"] === "nano-flow") return true;
  }
  return false;
};

/** 追加写入一行 JSON。 */
export const appendJsonLine = async (file: string, value: unknown): Promise<void> => {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
};

/** 读取绑定表；文件缺失或损坏时返回空表。 */
export const readBindings = async (file: string): Promise<BindingTable> => {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as BindingTable) : {};
  } catch {
    return {};
  }
};

/** 同步读取绑定表；文件缺失或损坏时返回空表（宿主路由是同步返回快照的）。 */
export const readBindingsSync = (file: string): BindingTable => {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as BindingTable) : {};
  } catch {
    return {};
  }
};

/** 写回绑定表（先建目录）。 */
export const writeBindings = async (file: string, table: BindingTable): Promise<void> => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(table, null, 2)}\n`, "utf8");
};

/**
 * 轮转时继承旧会话的 Plan：查绑定表里旧会话的 planPath，返回仍存在的 Plan 目录。
 * 与工作区有几个 active Plan 无关；旧会话无绑定或目录已不存在时返回 undefined。
 * @param table - 绑定表。
 * @param previousSessionId - 被轮转的旧会话 id。
 * @param workspace - 工作区根。
 * @param exists - 目录存在性判断（测试可注入）。
 * @returns 绝对 Plan 目录，或 undefined。
 */
export const inheritedPlanDirectory = (
  table: BindingTable,
  previousSessionId: string,
  workspace: string,
  exists: (directory: string) => boolean = () => true,
): string | undefined => {
  const binding = table[previousSessionId];
  if (binding === undefined) return undefined;
  const directory = join(workspace, binding.planPath);
  return exists(directory) ? directory : undefined;
};

/** 解析 Plan 目录的相对路径（相对工作区，正斜杠）。 */
export const planRelativePath = (workspace: string, planDirectory: string): string =>
  relative(workspace, planDirectory).replaceAll("\\", "/");

/** 定位绑定对应的 log.jsonl。 */
export const planLogPath = (binding: PlanBinding): string =>
  join(binding.cwd, binding.planPath, PLAN_LOG_FILE);
