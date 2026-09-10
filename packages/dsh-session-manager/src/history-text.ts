/**
 * 历史文本化: 把宿主的原始会话事件转成读取窗口的一行文本。
 *
 * 正文位置随事件类型不同(用户消息在 `data.content`、助手与工具结果在 `data.message`),
 * reasoning 不计入——这两条与上游 `@deepseek-ai/dsh-session-query` 的
 * `extractSessionEventText` 一致; 但本层是给模型读的窗口, 故对正文做有界化
 * (压平空白、工具事件只给首行/参数摘要、按码点截断), 不追求与上游逐字同形。
 */
import type { HistoryEntry, RuntimeHistoryRecordLike } from "./host.ts";

/** 结构化条件: 值类型收窄到字符串的任意 json 节点。 */
type IsKnown = { readonly [key: string]: unknown };

const asObject = (value: unknown): IsKnown | undefined =>
  typeof value === "object" && value !== null ? (value as IsKnown) : undefined;

/**
 * 汇总文本块: 逐块取 text, 递归进 tool-result 的内层 content
 * (`tool/result` 的正文位于 `message.content[0].content[0].text`), 其余块不计入。
 */
const blocksTextOf = (content: unknown): string => {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    const block = asObject(part);
    if (block === undefined) continue;
    if (block["type"] === "tool-result") {
      const nested = blocksTextOf(block["content"]);
      if (nested !== "") parts.push(nested);
      continue;
    }
    if (block["type"] !== "text" || typeof block["text"] !== "string") continue;
    const text = block["text"].trim();
    if (text !== "") parts.push(text);
  }
  return parts.join("\n");
};

/** 取事件正文: 顶层 content(用户消息) → message.content(助手/工具结果) → 裸 text 兜底。 */
export const eventTextOf = (data: unknown): string => {
  const block = asObject(data);
  if (block === undefined) return "";
  const fromContent = blocksTextOf(block["content"]);
  if (fromContent !== "") return fromContent;
  const nested = asObject(block["message"]);
  const fromMessage = blocksTextOf(nested?.["content"]);
  if (fromMessage !== "") return fromMessage;
  return typeof block["text"] === "string" ? block["text"] : "";
};

/** 工具参数摘要上限: 读取窗口是给模型读的, 参数全文不进窗口。 */
const TOOL_ARGS_SUMMARY_LIMIT = 80;
/** 工具结果首行上限。 */
const TOOL_RESULT_SUMMARY_LIMIT = 120;

/** 按码点截断, 避免切断代理对(正文可能含 emoji)。 */
const truncateText = (text: string, limit: number): string => {
  const codePoints = Array.from(text);
  return codePoints.length <= limit ? text : `${codePoints.slice(0, limit).join("")}…`;
};

const boundedText = (text: string, limit: number): string =>
  truncateText(text.replace(/\s+/g, " ").trim(), limit);

const firstLine = (text: string): string => {
  const line = text.split("\n").find((item) => item.trim() !== "") ?? "";
  return boundedText(line, TOOL_RESULT_SUMMARY_LIMIT);
};

/** 拼读窗口一行: 前缀 + 摘要(空摘要只留前缀)。 */
const joinedLine = (prefix: string, summary: string): string =>
  summary === "" ? prefix : `${prefix} ${summary}`;

/** 工具调用摘要: `<name>(<参数 JSON 摘要>)`; 名称缺失时退化为 `unknown`。 */
const toolCallOf = (data: unknown): string => {
  const block = asObject(data);
  const name = typeof block?.["name"] === "string" ? block["name"] : "unknown";
  const rawArgs = block?.["arguments"];
  const args = typeof rawArgs === "string" ? boundedText(rawArgs, TOOL_ARGS_SUMMARY_LIMIT) : "";
  return args === "" ? `${name}()` : `${name}(${args})`;
};

/** 工具结果摘要: 首行; 有 error 时附错误身份(失败结果靠它区分)。 */
const toolResultOf = (data: unknown): string => {
  const block = asObject(data);
  const error = asObject(block?.["error"]);
  const identity =
    error === undefined
      ? ""
      : ["error", error["name"], error["code"]]
          .filter((part): part is string => typeof part === "string" && part !== "")
          .join(" ");
  const text = firstLine(eventTextOf(block?.["message"]));
  return [text, identity].filter((part) => part !== "").join(" ");
};

/**
 * 文本化一条记录: 消息类给出正文, 工具类给出有界摘要, 其余事件给 `[event <type>]` 一行。
 * 返回 undefined 的两条规则: ① assistant 空正文(空 `assistant/message` 只为承载 usage);
 * ② 非 event 记录(已移除的 `chunks` 变体, 运行时防御)。
 */
const entryOf = (record: RuntimeHistoryRecordLike): HistoryEntry | undefined => {
  if (record.type !== "event") return undefined;
  const event = record.event;
  const base = { seq: event.seq, time: event.time };
  const type = event.type;
  if (type === "user/message") return { ...base, kind: "user", text: eventTextOf(event.data) };
  if (type === "assistant/message") {
    const text = eventTextOf(event.data);
    return text === "" ? undefined : { ...base, kind: "assistant", text };
  }
  if (type === "tool/call") {
    return { ...base, kind: "event", text: joinedLine("[tool/call]", toolCallOf(event.data)) };
  }
  if (type === "tool/result") {
    return { ...base, kind: "event", text: joinedLine("[tool/result]", toolResultOf(event.data)) };
  }
  return { ...base, kind: "event", text: `[event ${type}]` };
};

/** 记录文本: assistant 空正文不入窗口, 其余原样保留。 */
export const entriesOf = (records: readonly RuntimeHistoryRecordLike[]): HistoryEntry[] =>
  records.map(entryOf).filter((entry): entry is HistoryEntry => entry !== undefined);
