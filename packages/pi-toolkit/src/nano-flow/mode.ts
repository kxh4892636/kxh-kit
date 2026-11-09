/**
 * Nano Flow 的会话状态：模式、Plan 绑定、上下文清空标记与恢复 seed。
 * 三者都落在 session 自定义条目里：随会话文件走，不需要全局表、清理与跨进程同步。
 * @module @kxh4892636/pi-toolkit/nano-flow/mode
 */

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { planRefFromDirectory } from "./plan.ts";

/** 会话模式条目：`{ enabled }`。 */
export const MODE_ENTRY = "nano-flow-mode";
/** Plan 绑定条目：`{ planPath, cwd, boundAt }`；最后一条生效。 */
export const BINDING_ENTRY = "nano-flow-binding";
/** 上下文清空条目：`{ at, seed }`。 */
export const RESET_ENTRY = "nano-flow-reset";

/** 分支里本模块读到的最小 entry 形状。 */
export interface BranchEntryLike {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
}

/** 一条 Plan 绑定。 */
export interface NanoBinding {
  /** 相对 `cwd` 的 Plan 目录；迁移后目录不在时回退到当前工作区。 */
  readonly planPath: string;
  readonly cwd: string;
  readonly boundAt: string;
}

/** 一条上下文清空记录。 */
export interface NanoReset {
  readonly at: number;
  readonly seed: string;
}

const dataOf = (entry: BranchEntryLike): Record<string, unknown> | undefined => {
  const data = entry.data;
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
};

/** 当前会话的模式覆盖；没有记录时 undefined。 */
export const sessionModeOf = (entries: readonly BranchEntryLike[]): boolean | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== MODE_ENTRY) continue;
    const enabled = dataOf(entry)?.["enabled"];
    if (typeof enabled === "boolean") return enabled;
  }
  return undefined;
};

/** 当前会话的 Plan 绑定；没有记录时 undefined。 */
export const bindingOf = (entries: readonly BranchEntryLike[]): NanoBinding | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== BINDING_ENTRY) continue;
    const data = dataOf(entry);
    const planPath = data?.["planPath"];
    const cwd = data?.["cwd"];
    const boundAt = data?.["boundAt"];
    if (typeof planPath !== "string" || typeof cwd !== "string") continue;
    return { planPath, cwd, boundAt: typeof boundAt === "string" ? boundAt : "" };
  }
  return undefined;
};

/** 最近一次上下文清空记录；没有时 undefined。 */
export const latestResetOf = (entries: readonly BranchEntryLike[]): NanoReset | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== RESET_ENTRY) continue;
    const data = dataOf(entry);
    const at = data?.["at"];
    const seed = data?.["seed"];
    if (typeof at === "number" && Number.isFinite(at) && typeof seed === "string") {
      return { at, seed };
    }
  }
  return undefined;
};

/**
 * 当前会话是否运行 Nano Flow：工具开关 ∧（会话条目 ?? 新会话默认）。
 * @param entries - 当前分支。
 * @param options - 开关与默认值。
 * @returns 是否生效。
 */
export const isNanoFlowActive = (
  entries: readonly BranchEntryLike[],
  options: { readonly switchOn: boolean; readonly always: boolean },
): boolean => {
  if (!options.switchOn) return false;
  return sessionModeOf(entries) ?? options.always;
};

/** 把绑定解析成 Plan 目录：相对路径先试绑定时的 cwd，目录不在再回退当前工作区。 */
export const resolveBindingDirectory = (binding: NanoBinding, workspace: string): string => {
  const relative = binding.planPath;
  if (isAbsolute(relative)) return relative;
  const bound = binding.cwd === "" ? undefined : join(binding.cwd, relative);
  if (bound !== undefined && existsSync(bound)) return bound;
  return join(workspace, relative);
};

/** 上一轮进入 seed 的字节上限。 */
const LAST_OUTPUT_LIMIT = 8 * 1024;

/** 保尾截断；按字节切会劈开 UTF-8 字符，这里剥掉切口处的替换字符。 */
export const truncateTail = (text: string, limit: number = LAST_OUTPUT_LIMIT): string => {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= limit) return text;
  const tail = Buffer.from(text, "utf8")
    .subarray(bytes - limit)
    .toString("utf8")
    .replace(/^\uFFFD+/u, "");
  const dropped = bytes - Buffer.byteLength(tail, "utf8");
  return `…（前 ${dropped} 字节已截断）\n${tail}`;
};

const textOf = (content: unknown): string => {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n");
};

/** 分支里最后一条含文本的 assistant 消息的时间戳。 */
export const lastAssistantAt = (entries: readonly BranchEntryLike[]): number | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as unknown as {
      type?: string;
      timestamp?: string;
      message?: { role?: string; content?: unknown };
    };
    if (entry?.type !== "message" || entry.message?.role !== "assistant") continue;
    if (textOf(entry.message.content).trim() === "") continue;
    const at = entry.timestamp === undefined ? Number.NaN : Date.parse(entry.timestamp);
    return Number.isFinite(at) ? at : undefined;
  }
  return undefined;
};

/** 分支里最后一条含文本的 assistant 消息；尾部截断到 8 KB。 */
export const lastAssistantText = (entries: readonly BranchEntryLike[]): string | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as unknown as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (message?.role !== "assistant") continue;
    const text = textOf(message.content).trim();
    if (text !== "") return truncateTail(text);
  }
  return undefined;
};

/**
 * 构造上下文清空后的恢复 seed：当前 Plan + 上一轮模型输出。
 * 本轮用户输入不写进 seed，它作为普通 user 消息保留在过滤后的上下文里。
 * @param binding - 当前绑定，可为空。
 * @param workspace - 工作区根。
 * @param lastOutput - 清空前最后一条 assistant 文本。
 * @returns 恢复 seed 文本。
 */
export const buildSeed = (
  binding: NanoBinding | undefined,
  workspace: string,
  lastOutput: string | undefined,
): string => {
  const resolved = binding === undefined ? undefined : resolveBindingDirectory(binding, workspace);
  const directory = resolved !== undefined && existsSync(resolved) ? resolved : undefined;
  const ref = directory === undefined ? undefined : planRefFromDirectory(directory);
  const head =
    directory === undefined
      ? "先按 `.agents/domains/CONTEXT-MAP.md` 定位业务域；确认 Plan 后调用 `nano_flow_bind` 绑定，再读 `spec.md` 与 `notes_index.md`。"
      : `恢复当前 Plan：${ref ?? directory}（目录 ${directory}）。先读 \`spec.md\` 与 \`notes_index.md\`，只读报告进度与可推进队列，等用户放行后再执行。`;
  const parts = ["（上下文达到阈值已清空；Plan 在磁盘上，状态不丢。）", head];
  if (lastOutput !== undefined && lastOutput.trim() !== "") {
    parts.push(
      `以下 XML 块是清空前最后一轮的模型输出：\n<rotation-last-output>\n${lastOutput}\n</rotation-last-output>`,
    );
  }
  return parts.join("\n\n");
};
