/**
 * 超时诊断：代码组装证据包 → 只读诊断 temp worker 给结构化结论 → 解析成可执行建议。
 *
 * 为什么不让代码直接重试：超时的原因千种（等用户、写了半截、测试跑了 40 分钟、被外部阻塞），
 * 盲目重派只是把同一个坑再踩一次，还会把已经做完的工作重做一遍。这里让一个**只读**会话看
 * 证据包给出 `{cause, evidence, suggestion{adjust, retryMessage}, confidence}`，再由代码按建议
 * 决定重派 / 转人工。
 *
 * 本模块只有纯函数与两次 IO（读 jsonl 尾部、`git status`），不碰句柄表、不写账本 —— 起停与
 * 记账留在 `register.ts`，所以这里全部可以单测。
 *
 * 诊断 worker 的边界是**证据包**：它只该读包里给出的路径，禁止全盘扫描（见 `diagnosisPrompt`）。
 * @module @kxh4892636/pi-toolkit/orchestrator/diagnose
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { clipText, type LedgerEvent } from "./events.ts";
import type { WorkerReport } from "./types.ts";

/** 建议的形态：只保留能落到行动上的几类。 */
export const DIAGNOSIS_ADJUSTS = [
  "split-note",
  "narrow-scope",
  "longer-timeout",
  "change-strategy",
  "needs-human",
] as const;

/** 一条建议。 */
export type DiagnosisAdjust = (typeof DIAGNOSIS_ADJUSTS)[number];

/** 诊断结论（结构化的那部分）。 */
export interface Diagnosis {
  /** 一句话说清卡在哪里。 */
  readonly cause: string;
  /** 支撑依据（来自证据包，不要求新取证）。 */
  readonly evidence: readonly string[];
  readonly suggestion: {
    readonly adjust: readonly DiagnosisAdjust[];
    readonly retryMessage: string;
  };
  /** 0–1；解析失败时按 0 处理。 */
  readonly confidence: number;
}

/** 证据包里的一条账本事件（只留展示用的字段）。 */
export interface EvidenceEvent {
  readonly seq: number;
  readonly at: string;
  readonly type: string;
  readonly summary: string;
}

/** 超时诊断的证据包：**代码组装**，不靠模型自己去找。 */
export interface TimeoutEvidencePack {
  readonly worker: string;
  readonly planRef: string;
  readonly kind: "plan" | "temp";
  readonly note?: string;
  readonly notes?: readonly string[];
  /** 命中的判据（毫秒）。 */
  readonly threshold: number;
  readonly elapsedMs: number;
  readonly lastProgressAt: string;
  readonly lastReport?: {
    readonly note: string;
    readonly outcome: string;
    readonly summary: string;
  };
  /** 出事的 note：状态与正文摘要（Plan worker 才有）。 */
  readonly noteState?: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly needs?: string;
    readonly excerpt: string;
  };
  /** 该 worker 最近 N 条账本事件。 */
  readonly events: readonly EvidenceEvent[];
  /** 会话 jsonl 尾部 M 条的 `type/role: 首 60 字`。 */
  readonly sessionTail?: readonly string[];
  /** 工作区（worker 的 cwd）里的 `git status --short` 摘要。 */
  readonly gitStatus?: string;
  /** worktree 名字（有的话）。 */
  readonly worktree?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 账本事件的一句话摘要（证据包用；事件本身已经很小）。 */
export const summarizeEvent = (event: LedgerEvent): EvidenceEvent => {
  const payload = event.payload;
  const parts: string[] = [];
  for (const key of ["worker", "note", "outcome", "kind", "reason", "text", "summary", "cause"]) {
    const value = payload[key];
    if (typeof value === "string" && value !== "") parts.push(`${key}=${clipText(value, 60)}`);
  }
  return {
    seq: event.seq,
    at: event.at,
    type: event.type,
    summary: parts.join(" · "),
  };
};

/**
 * 从 jsonl 的任意一行里抠出一段可读文本：只取前 60 字，够判断“卡在哪一步”就行。
 * @param value - 待取文本的结构。
 * @param depth - 递归保护。
 * @returns 文本；找不到给空串。
 */
const textOf = (value: unknown, depth = 0): string => {
  if (depth > 4) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = textOf(item, depth + 1);
      if (found !== "") return found;
    }
    return "";
  }
  if (!isRecord(value)) return "";
  for (const key of ["text", "content", "summary", "message", "output"]) {
    const found = textOf(value[key], depth + 1);
    if (found !== "") return found;
  }
  return "";
};

/** jsonl 一行的摘要：`<type>[/<role>]: <首 60 字>`；坏行也留一条。 */
export const summarizeSessionLine = (line: string): string => {
  const trimmed = line.trim();
  if (trimmed === "") return "";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) return clipText(trimmed, 60);
    const type = typeof parsed["type"] === "string" ? parsed["type"] : "?";
    const message = isRecord(parsed["message"]) ? parsed["message"] : undefined;
    const role =
      message !== undefined && typeof message["role"] === "string"
        ? `/${message["role"]}`
        : typeof parsed["role"] === "string"
          ? `/${parsed["role"]}`
          : "";
    const text = clipText(textOf(message ?? parsed["content"] ?? parsed), 60);
    return `${type}${role}: ${text}`;
  } catch {
    return `坏行: ${clipText(trimmed, 60)}`;
  }
};

/**
 * 读会话文件尾部若干行并压成摘要。
 *
 * 读不到（文件还没落盘、被挪走）时返回 undefined：诊断不缺这一项也能做。
 * @param path - 会话 jsonl。
 * @param limit - 尾部条数。
 * @returns 摘要列表。
 */
export const readSessionTail = (path: string, limit: number): readonly string[] | undefined => {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];
  return lines
    .slice(-limit)
    .map(summarizeSessionLine)
    .filter((line) => line !== "");
};

/** `git status --short` 摘要（`--untracked-files=no`：不看未跟踪文件，避免噪音）。 */
export const readGitStatus = (cwd: string): string | undefined => {
  try {
    const result = spawnSync("git", ["status", "--short", "--untracked-files=no"], {
      cwd,
      encoding: "utf8",
      timeout: 5_000,
    });
    if (result.error !== undefined || result.status !== 0) return undefined;
    const text = result.stdout.trim();
    return text === "" ? "（工作区干净）" : clipText(text, 600);
  } catch {
    return undefined;
  }
};

/** 组装证据包的输入：全部由调用方从账本 / note 文档 / 句柄里取，诊断自己不再取证。 */
export interface BuildEvidenceInput {
  readonly worker: string;
  readonly planRef: string;
  readonly kind: "plan" | "temp";
  readonly note?: string;
  readonly notes?: readonly string[];
  readonly threshold: number;
  readonly elapsedMs: number;
  readonly lastProgressAt: string;
  readonly lastReport?: {
    readonly note: string;
    readonly outcome: string;
    readonly summary: string;
  };
  readonly noteDocument?:
    | {
        readonly id: string;
        readonly title: string;
        readonly status: string;
        readonly needs?: string;
        readonly content: string;
      }
    | undefined;
  readonly events: readonly LedgerEvent[];
  readonly sessionPath?: string;
  readonly cwd: string;
  readonly worktree?: string;
  /** 账本事件条数上限（默认 20）。 */
  readonly eventLimit?: number;
  /** jsonl 尾部条数上限（默认 20）。 */
  readonly tailLimit?: number;
  /** 测试接缝。 */
  readonly readTail?: (path: string, limit: number) => readonly string[] | undefined;
  readonly gitStatus?: (cwd: string) => string | undefined;
}

/**
 * 组装证据包：note 状态与正文摘要、该 worker 最近 N 条账本事件、最后一次 report、
 * jsonl 尾部 M 条、`git status` 摘要、命中判据与阈值。
 * @param input - 上面这些来源。
 * @returns 证据包。
 */
export const buildTimeoutEvidence = (input: BuildEvidenceInput): TimeoutEvidencePack => {
  const related = input.events
    .filter((event) => event.payload["worker"] === input.worker)
    .slice(-(input.eventLimit ?? 20))
    .map(summarizeEvent);
  const tail =
    input.sessionPath === undefined
      ? undefined
      : (input.readTail ?? readSessionTail)(input.sessionPath, input.tailLimit ?? 20);
  const gitStatus = (input.gitStatus ?? readGitStatus)(input.cwd);
  const doc = input.noteDocument;
  return {
    worker: input.worker,
    planRef: input.planRef,
    kind: input.kind,
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.notes === undefined || input.notes.length === 0 ? {} : { notes: input.notes }),
    threshold: input.threshold,
    elapsedMs: input.elapsedMs,
    lastProgressAt: input.lastProgressAt,
    ...(input.lastReport === undefined ? {} : { lastReport: input.lastReport }),
    ...(doc === undefined
      ? {}
      : {
          noteState: {
            id: doc.id,
            title: doc.title,
            status: doc.status,
            ...(doc.needs === undefined ? {} : { needs: doc.needs }),
            excerpt: clipText(doc.content, 400),
          },
        }),
    events: related,
    ...(tail === undefined ? {} : { sessionTail: tail }),
    ...(gitStatus === undefined ? {} : { gitStatus }),
    ...(input.worktree === undefined ? {} : { worktree: input.worktree }),
  };
};

/** 诊断 worker 的系统性边界与输出格式。 */
export const diagnosisPrompt = (pack: TimeoutEvidencePack): string =>
  [
    "你是「超时诊断 worker」：上一次派工因为长时间没有进展被代码中止了，你只负责给出可执行的诊断。",
    "",
    "边界（硬性）：",
    "- 只读：不改任何文件，不改 note 状态，不重派 worker，也不试图恢复被中止的会话。",
    "- 禁止全盘扫描：只准读下面证据包里出现的路径；需要看代码时限于该目录的两层以内。",
    "- 一次只诊断这一次超时。",
    "- 不要重复调查：证据包是代码组装的，里面的事件、report、jsonl 尾部与 git status 就是事实。",
    "",
    "证据包（JSON）：",
    "```json",
    JSON.stringify(pack, null, 2),
    "```",
    "",
    "输出（只调用一次 `orchestrator_report`）：",
    '- outcome: "done"，note: "diagnose"，summary: 一句话原因。',
    "- evidence: **只放一个元素**, 那个元素是下面这个 JSON 本身：",
    "```json",
    JSON.stringify(
      {
        cause: "一句话说清卡在哪一步",
        evidence: ["从证据包里看到的依据（2-4 条）"],
        suggestion: {
          adjust: ["split-note | narrow-scope | longer-timeout | change-strategy | needs-human"],
          retryMessage: "给下一次重试的具体指令：本次调整点 + 明确不要重复的已完成部分",
        },
        confidence: 0.7,
      },
      null,
      2,
    ),
    "```",
    "",
    "判断口径：",
    '- 证据不足、或只有人能决定（等回答、等授权、需求本身不清） → `adjust: ["needs-human"]`，此时不要写 retryMessage。',
    "- 任务太大做不完 → `split-note`；被无关文件/无关变更拖住 → `narrow-scope`；需要更长单轮时间 → `longer-timeout`；思路本身走不通 → `change-strategy`。",
    "- `retryMessage` 必须写明“不要重复已完成的 X”，重试的 worker 会拿它当唯一口径。",
  ].join("\n");

/** 从一段文本里抠出第一个 JSON 对象（允许 ```json 围栏与前后噪声）。 */
export const extractJsonObject = (text: string): unknown => {
  const direct = (() => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  })();
  if (direct !== undefined) return direct;
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1)) as unknown;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
};

const isAdjust = (value: unknown): value is DiagnosisAdjust =>
  typeof value === "string" && (DIAGNOSIS_ADJUSTS as readonly string[]).includes(value);

/**
 * 校验并规范化诊断结论；不合法返回 undefined（调用方按“没有可信诊断”处理，不重试）。
 * @param raw - 诊断 worker 给出的 JSON。
 * @returns 规范化后的结论。
 */
export const parseDiagnosis = (raw: unknown): Diagnosis | undefined => {
  if (!isRecord(raw)) return undefined;
  const cause = raw["cause"];
  if (typeof cause !== "string" || cause.trim() === "") return undefined;
  const suggestion = raw["suggestion"];
  if (!isRecord(suggestion)) return undefined;
  const adjustRaw = suggestion["adjust"];
  const adjust = Array.isArray(adjustRaw) ? [...new Set(adjustRaw.filter(isAdjust))] : [];
  if (adjust.length === 0) return undefined;
  const retryMessageRaw = suggestion["retryMessage"];
  const evidenceRaw = raw["evidence"];
  const confidenceRaw = raw["confidence"];
  return {
    cause: clipText(cause, 200),
    evidence: Array.isArray(evidenceRaw)
      ? evidenceRaw
          .filter((item): item is string => typeof item === "string")
          .slice(0, 4)
          .map((item) => clipText(item, 200))
      : [],
    suggestion: {
      adjust,
      retryMessage: typeof retryMessageRaw === "string" ? clipText(retryMessageRaw, 600) : "",
    },
    confidence:
      typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0.5,
  };
};

/**
 * 从诊断 worker 的 report 里取出结论。
 *
 * 先看 `evidence`（约定放 JSON），再看 `summary`（模型偷懒只写在摘要里也能救）。
 * @param reports - 诊断 worker 上报的条目（通常一条）。
 * @returns 结论；没有可解析的返回 undefined。
 */
export const diagnosisFromReports = (reports: readonly WorkerReport[]): Diagnosis | undefined => {
  for (const report of reports) {
    for (const candidate of [...(report.evidence ?? []), report.summary]) {
      const diagnosis = parseDiagnosis(extractJsonObject(candidate));
      if (diagnosis !== undefined) return diagnosis;
    }
  }
  return undefined;
};

/** 重试决策。 */
export type RetryDecision =
  | { readonly retry: true; readonly attempt: number }
  | { readonly retry: false; readonly reason: "needs-human" | "exhausted" | "no-diagnosis" };

/**
 * 按诊断建议与已重试次数决定要不要再派一代。
 *
 * 三条不重试的理由都必须落账（`retry.exhausted`），否则“为什么没自动重试”又要靠猜。
 * @param input - 诊断结论、已重试次数与上限。
 * @returns 决策。
 */
export const decideRetry = (input: {
  readonly diagnosis: Diagnosis | undefined;
  readonly attempts: number;
  readonly retryLimit: number;
}): RetryDecision => {
  if (input.diagnosis === undefined) return { retry: false, reason: "no-diagnosis" };
  if (input.diagnosis.suggestion.adjust.includes("needs-human")) {
    return { retry: false, reason: "needs-human" };
  }
  if (input.attempts >= input.retryLimit) return { retry: false, reason: "exhausted" };
  return { retry: true, attempt: input.attempts + 1 };
};

/** 重试消息的固定尾句：不复述已完成的活。 */
export const RETRY_TAIL =
  "先看 note 的「执行检查点」与 git status 核对工作区，**不要重复已经完成的部分**；不确定就 blocked 上报。";

/**
 * 拼出重试消息：上次原因 + 上次到哪一步 + 本次调整点 + “不要重复”。
 * @param input - 上一次的 report、诊断结论与本次是第几次重试。
 * @returns 给新一代 worker 的唯一口径。
 */
export const buildRetryMessage = (input: {
  readonly diagnosis: Diagnosis;
  readonly attempt: number;
  readonly retryLimit: number;
  readonly lastReport?: {
    readonly note: string;
    readonly outcome: string;
    readonly summary: string;
  };
  readonly elapsedMinutes?: number;
}): string => {
  const minutes = input.elapsedMinutes === undefined ? undefined : `${input.elapsedMinutes} 分钟`;
  return [
    `[重试 ${input.attempt}/${input.retryLimit}] ${
      minutes === undefined ? "上一代在这个任务上超时" : `上一代在这个任务上 ${minutes} 没有进展`
    }，已被代码中止。`,
    `上次原因：${input.diagnosis.cause}`,
    `上次到哪一步：${
      input.lastReport === undefined
        ? "没有 report，只有账本里的输入与 ack"
        : `${input.lastReport.outcome} · ${input.lastReport.summary}`
    }`,
    `本次调整：${input.diagnosis.suggestion.adjust.join(" + ")}`,
    ...(input.diagnosis.suggestion.retryMessage === ""
      ? []
      : [`诊断建议：${input.diagnosis.suggestion.retryMessage}`]),
    RETRY_TAIL,
  ].join("\n");
};
