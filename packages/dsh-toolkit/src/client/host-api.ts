import {
  PANEL_STATUSES,
  TOOLKIT_HIDDEN_PATH,
  TOOLKIT_NANO_FLOW_NOTES_PATH,
  TOOLKIT_NANO_FLOW_PATH,
  TOOLKIT_NANO_FLOW_ROTATION_PATH,
  TOOLKIT_STATE_PATH,
  TOOLKIT_UNDO_PATH,
  type NanoFlowRotation,
  type NanoFlowSettings,
  type NanoFlowSettingsRequest,
  type NanoFlowSettingsResponse,
  type NotesSnapshot,
  type PanelNote,
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
  "specMaxBytes",
  "noteMaxBytes",
  "noteDescriptionMaxChars",
  "contextMaxBytes",
  "questionMaxBytes",
  "adrMaxBytes",
  "workflowMaxBytes",
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

/** 读取 Nano Flow 上限设置。 */
export const fetchNanoFlowSettings = async (signal?: AbortSignal): Promise<NanoFlowSettings> => {
  const response = await send(relative(TOOLKIT_NANO_FLOW_PATH), optionalSignal(signal));
  const body = (await readJson(response)) as unknown;
  return parseSettings(body);
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

/** 探测某会话的未完成 note 快照；无绑定 Plan 或无未完成 note 时为 `null`。 */
export const fetchNanoFlowNotes = async (
  sessionId: string,
  signal?: AbortSignal,
): Promise<NotesSnapshot | null> => {
  const query = `?sessionId=${encodeURIComponent(sessionId)}`;
  const response = await send(
    `${relative(TOOLKIT_NANO_FLOW_NOTES_PATH)}${query}`,
    optionalSignal(signal),
  );
  const body = (await readJson(response)) as unknown;
  return parseNotesSnapshot(body);
};

/** 读取最近一次轮转（from → to）；本次运行还没轮转过时为 `null`。 */
export const fetchNanoFlowRotation = async (
  signal?: AbortSignal,
): Promise<NanoFlowRotation | null> => {
  const response = await send(relative(TOOLKIT_NANO_FLOW_ROTATION_PATH), optionalSignal(signal));
  const body = (await readJson(response)) as unknown;
  const rotation = (body as { rotation?: unknown } | null)?.rotation;
  if (rotation === null || rotation === undefined) return null;
  if (typeof rotation !== "object") {
    throw new HostApiError("invalid-response", "unexpected rotation payload");
  }
  const record = rotation as Record<string, unknown>;
  if (
    typeof record["from"] !== "string" ||
    typeof record["to"] !== "string" ||
    typeof record["at"] !== "string"
  ) {
    throw new HostApiError("invalid-response", "unexpected rotation payload");
  }
  return { from: record["from"], to: record["to"], at: record["at"] };
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
const parseNotesSnapshot = (body: unknown): NotesSnapshot | null => {
  const snapshot = (body as { snapshot?: unknown } | null)?.snapshot;
  if (snapshot === null || snapshot === undefined) return null;
  if (typeof snapshot !== "object") return null;
  const record = snapshot as unknown as Record<string, unknown>;
  if (typeof record["planName"] !== "string" || typeof record["planPath"] !== "string") {
    throw new HostApiError("invalid-response", "unexpected notes payload");
  }
  if (!Array.isArray(record["notes"])) {
    throw new HostApiError("invalid-response", "unexpected notes payload");
  }
  const notes: PanelNote[] = [];
  for (const item of record["notes"]) {
    if (typeof item !== "object" || item === null) {
      throw new HostApiError("invalid-response", "unexpected notes payload");
    }
    const note = item as Record<string, unknown>;
    const status = note["status"];
    if (
      typeof note["name"] !== "string" ||
      typeof note["description"] !== "string" ||
      typeof status !== "string" ||
      !(PANEL_STATUSES as readonly string[]).includes(status)
    ) {
      throw new HostApiError("invalid-response", "unexpected notes payload");
    }
    // 两个新字段都是可选的：宿主老版本不带，类型不对时按缺省处理，不因此整包失败。
    const reason = typeof note["reason"] === "string" ? note["reason"] : undefined;
    const nextStep = typeof note["nextStep"] === "string" ? note["nextStep"] : undefined;
    notes.push({
      name: note["name"],
      status: status as PanelNote["status"],
      description: note["description"],
      ...(reason === undefined ? {} : { reason }),
      ...(nextStep === undefined ? {} : { nextStep }),
    });
  }
  return { planName: record["planName"], planPath: record["planPath"], notes };
};

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
