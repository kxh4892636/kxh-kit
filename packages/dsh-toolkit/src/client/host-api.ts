import {
  TOOLKIT_STATE_PATH,
  TOOLKIT_UNDO_PATH,
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
