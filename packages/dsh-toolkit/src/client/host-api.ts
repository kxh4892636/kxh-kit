import {
  TOOLKIT_HIDDEN_PATH,
  TOOLKIT_NANO_FLOW_PATH,
  TOOLKIT_NANO_FLOW_READY_PATH,
  TOOLKIT_STATE_PATH,
  TOOLKIT_UNDO_PATH,
  type NanoFlowNoteNeeds,
  type NanoFlowNoteStatus,
  type NanoFlowReadyGroup,
  type NanoFlowReadyNote,
  type NanoFlowReadyReason,
  type NanoFlowReadyResponse,
  type NanoFlowSettings,
  type NanoFlowSettingsRequest,
  type NanoFlowSettingsResponse,
  type ToolkitErrorBody,
  type ToolkitStateRequest,
  type ToolkitStateResponse,
  type ToolkitToolInfo,
  type UndoAvailability,
  type UndoTurnResponse,
} from "../contract.js";

/** 宿主路由按文档相对地址挂载，绝对路径要被去掉（同 `api/file` 的用法）。 */
const relative = (path: string): string => path.replace(/^\/+/u, "");

/** 一次宿主调用失败：带 `error` 码与可展示文案。 */
export class HostApiError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "HostApiError";
    this.code = code;
    this.status = status;
  }
}

/** 一次宿主调用的入参；`body` 以 JSON 发送，缺省即 GET。 */
interface SendOptions {
  readonly method?: "GET" | "POST";
  readonly signal?: AbortSignal;
  readonly body?: unknown;
}

/** 读取工具目录与开关。 */
export const fetchToolkitState = async (
  signal?: AbortSignal,
): Promise<readonly ToolkitToolInfo[]> => {
  const response = await send(relative(TOOLKIT_STATE_PATH), optionalSignal(signal));
  const body = (await readJson(response)) as unknown;
  const tools = parseState(body);
  if (tools === undefined) throw new HostApiError("invalid-response", "unexpected state payload");
  return tools;
};

/** 读取「已撤回、需要隐藏」的会话 id（宿主会合并存活会话，日志删了也仍被列出）。 */
export const fetchHiddenSessions = async (signal?: AbortSignal): Promise<readonly string[]> => {
  try {
    const response = await send(relative(TOOLKIT_HIDDEN_PATH), optionalSignal(signal));
    const body = (await readJson(response)) as unknown;
    const ids = (body as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids)) return [];
    return ids.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // 宿主未升级或路由不可达：当作没有隐藏项。
    return [];
  }
};

/** 写入一个工具的开关，返回新目录。 */
export const setToolEnabled = async (
  id: string,
  enabled: boolean,
  signal?: AbortSignal,
): Promise<readonly ToolkitToolInfo[]> => {
  const payload: ToolkitStateRequest = { id, enabled };
  const response = await send(relative(TOOLKIT_STATE_PATH), {
    ...optionalSignal(signal),
    method: "POST",
    body: payload,
  });
  const body = (await readJson(response)) as unknown;
  const tools = parseState(body);
  if (tools === undefined) throw new HostApiError("invalid-response", "unexpected state payload");
  return tools;
};

const SETTING_KEYS = [
  "storyMaxBytes",
  "specMaxBytes",
  "noteMaxBytes",
  "noteDescriptionMaxChars",
  "indexMaxRows",
  "contextMaxBytes",
  "questionsMaxBytes",
  "adrMaxBytes",
  "adrMaxCount",
  "rotateAt",
] as const;

const parseSettings = (body: unknown): NanoFlowSettings => {
  const settings = (body as NanoFlowSettingsResponse | null)?.settings;
  if (typeof settings !== "object" || settings === null) {
    throw new HostApiError("invalid-response", "unexpected nano-flow settings payload");
  }
  const record = settings as unknown as Record<string, unknown>;
  for (const key of SETTING_KEYS) {
    if (typeof record[key] !== "number") {
      throw new HostApiError("invalid-response", `nano-flow settings missing ${key}`);
    }
  }
  return record as unknown as NanoFlowSettings;
};

const NOTE_STATUSES: readonly NanoFlowNoteStatus[] = [
  "pending",
  "in_progress",
  "waiting",
  "completed",
];

const NOTE_NEEDS: readonly NanoFlowNoteNeeds[] = ["answer", "review", "blocked"];

const isNoteStatus = (value: unknown): value is NanoFlowNoteStatus =>
  typeof value === "string" && (NOTE_STATUSES as readonly string[]).includes(value);

const isNoteNeeds = (value: unknown): value is NanoFlowNoteNeeds =>
  typeof value === "string" && (NOTE_NEEDS as readonly string[]).includes(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const READY_LIFECYCLES = ["active", "reference", "archived"] as const;

const isReadyLifecycle = (value: unknown): value is "active" | "reference" | "archived" =>
  typeof value === "string" && (READY_LIFECYCLES as readonly string[]).includes(value);

const parseReadyNote = (value: unknown): NanoFlowReadyNote | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const note = value as Partial<NanoFlowReadyNote>;
  if (
    typeof note.id !== "string" ||
    typeof note.title !== "string" ||
    typeof note.description !== "string" ||
    !isNoteStatus(note.status) ||
    !isStringArray(note.blocked_by)
  ) {
    return undefined;
  }
  return {
    id: note.id,
    title: note.title,
    description: note.description,
    status: note.status,
    ...(isNoteNeeds(note.needs) ? { needs: note.needs } : {}),
    blocked_by: note.blocked_by,
    ...(typeof note.blocked_reason === "string" ? { blocked_reason: note.blocked_reason } : {}),
  };
};

const parseReadyGroup = (value: unknown): NanoFlowReadyGroup | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const notes = (value as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) return undefined;
  const parsed: NanoFlowReadyNote[] = [];
  for (const item of notes) {
    const note = parseReadyNote(item);
    if (note === undefined) return undefined;
    parsed.push(note);
  }
  return { notes: parsed };
};

const parseReady = (body: unknown): NanoFlowReadyResponse | undefined => {
  if (typeof body !== "object" || body === null) return undefined;
  const candidate = body as Partial<NanoFlowReadyResponse>;
  if (typeof candidate.available !== "boolean") return undefined;
  if (candidate.available !== true) {
    return {
      available: false,
      ...(typeof candidate.reason === "string"
        ? { reason: candidate.reason as NanoFlowReadyReason }
        : {}),
    };
  }
  const plan = candidate.plan;
  const counts = candidate.counts;
  const groups = candidate.groups;
  if (plan === undefined || counts === undefined || groups === undefined) return undefined;
  if (
    typeof plan.domain !== "string" ||
    !isReadyLifecycle(plan.lifecycle) ||
    typeof plan.name !== "string"
  ) {
    return undefined;
  }
  for (const key of [
    "total",
    "pending",
    "in_progress",
    "waiting",
    "needsBlocked",
    "completed",
  ] as const) {
    if (typeof counts[key] !== "number") return undefined;
  }
  if (!Array.isArray(groups)) return undefined;
  const parsedGroups: NanoFlowReadyGroup[] = [];
  for (const item of groups) {
    const group = parseReadyGroup(item);
    if (group === undefined) return undefined;
    parsedGroups.push(group);
  }
  return {
    available: true,
    plan: { domain: plan.domain, lifecycle: plan.lifecycle, name: plan.name },
    counts,
    groups: parsedGroups,
  };
};

/** 读取 Nano Flow 上限设置。 */
export const fetchNanoFlowSettings = async (signal?: AbortSignal): Promise<NanoFlowSettings> => {
  const response = await send(relative(TOOLKIT_NANO_FLOW_PATH), optionalSignal(signal));
  const body = (await readJson(response)) as unknown;
  return parseSettings(body);
};

/** 读取 Nano Flow ready 面板数据。 */
export const fetchNanoFlowReady = async (
  sessionId: string,
  signal?: AbortSignal,
): Promise<NanoFlowReadyResponse> => {
  const query = `?sessionId=${encodeURIComponent(sessionId)}`;
  const response = await send(
    `${relative(TOOLKIT_NANO_FLOW_READY_PATH)}${query}`,
    optionalSignal(signal),
  );
  const body = (await readJson(response)) as unknown;
  const ready = parseReady(body);
  if (ready === undefined) {
    throw new HostApiError("invalid-response", "unexpected nano-flow ready payload");
  }
  return ready;
};

/** 保存 Nano Flow 上限设置，返回保存后的完整设置。 */
export const saveNanoFlowSettings = async (
  patch: Partial<NanoFlowSettings>,
  signal?: AbortSignal,
): Promise<NanoFlowSettings> => {
  const payload: NanoFlowSettingsRequest = { patch };
  const response = await send(relative(TOOLKIT_NANO_FLOW_PATH), {
    ...optionalSignal(signal),
    method: "POST",
    body: payload,
  });
  const body = (await readJson(response)) as unknown;
  return parseSettings(body);
};

/** 探测某会话能否撤回。 */
export const fetchUndoAvailability = async (
  sessionId: string,
  signal?: AbortSignal,
): Promise<UndoAvailability> => {
  const query = `?sessionId=${encodeURIComponent(sessionId)}`;
  const response = await send(`${relative(TOOLKIT_UNDO_PATH)}${query}`, optionalSignal(signal));
  const body = (await readJson(response)) as unknown;
  return parseAvailability(body);
};

/** 执行撤回。 */
export const runUndoTurn = async (
  sessionId: string,
  signal?: AbortSignal,
): Promise<UndoTurnResponse> => {
  const response = await send(relative(TOOLKIT_UNDO_PATH), {
    ...optionalSignal(signal),
    method: "POST",
    body: { sessionId },
  });
  const body = (await readJson(response)) as unknown;
  const result = parseUndoResult(body);
  if (result === undefined) throw new HostApiError("invalid-response", "unexpected undo payload");
  return result;
};

/** `exactOptionalPropertyTypes` 下不能把 undefined 显式塞进可选属性。 */
const optionalSignal = (signal: AbortSignal | undefined): { signal?: AbortSignal } => {
  return signal === undefined ? {} : { signal };
};

const send = async (target: string, options: SendOptions): Promise<Response> => {
  const init: RequestInit = { method: options.method ?? "GET" };
  if (options.signal !== undefined) init.signal = options.signal;
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "content-type": "application/json" };
  }
  const response = await fetch(target, init);
  if (response.ok) return response;
  throw await toHostError(response);
};

const toHostError = async (response: Response): Promise<HostApiError> => {
  const body = (await readJson(response)) as unknown;
  if (typeof body === "object" && body !== null) {
    const candidate = body as Partial<ToolkitErrorBody>;
    if (typeof candidate.error === "string") {
      return new HostApiError(
        candidate.error,
        candidate.message ?? candidate.error,
        response.status,
      );
    }
  }
  return new HostApiError("http", `request failed with ${response.status}`, response.status);
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/** 外部响应逐层判空，避免宿主版本漂移时把 undefined 当结构用。 */
const parseState = (body: unknown): readonly ToolkitToolInfo[] | undefined => {
  if (typeof body !== "object" || body === null) return undefined;
  const tools = (body as Partial<ToolkitStateResponse>).tools;
  if (!Array.isArray(tools)) return undefined;
  return tools.filter(isToolInfo);
};

const isToolInfo = (value: unknown): value is ToolkitToolInfo => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ToolkitToolInfo>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.enabled === "boolean"
  );
};

const parseAvailability = (body: unknown): UndoAvailability => {
  if (typeof body !== "object" || body === null)
    return { available: false, reason: "invalid-response" };
  const candidate = body as Partial<UndoAvailability>;
  const prompt = typeof candidate.prompt === "string" ? candidate.prompt : undefined;
  return {
    available: candidate.available === true,
    ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
    ...(prompt === undefined ? {} : { prompt }),
  };
};

const parseUndoResult = (body: unknown): UndoTurnResponse | undefined => {
  if (typeof body !== "object" || body === null) return undefined;
  const candidate = body as Partial<UndoTurnResponse>;
  if (typeof candidate.childSessionId !== "string" || candidate.childSessionId === "") {
    return undefined;
  }
  return {
    childSessionId: candidate.childSessionId,
    prompt: typeof candidate.prompt === "string" ? candidate.prompt : "",
  };
};
