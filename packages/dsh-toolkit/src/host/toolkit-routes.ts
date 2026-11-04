import {
  TOOLKIT_STATE_PATH,
  TOOLKIT_UNDO_PATH,
  type ToolkitErrorBody,
  type ToolkitStateRequest,
  type ToolkitStateResponse,
  type UndoAvailability,
  type UndoTurnResponse,
} from "../contract.js";
import { UnknownToolError, type ToolkitRegistry } from "./toolkit-registry.js";
import { UndoUnavailableError } from "./undo/undo-turn.js";

/** 宿主路由注册所需的能力。 */
export interface ToolkitRoutesOptions {
  readonly registry: ToolkitRegistry;
  /** 撤回能力；宿主缺 `sessionController` 时缺省，此时撤回路由返回不可用。 */
  readonly undo?: {
    readonly inspect: (sessionId: string) => UndoAvailability;
    readonly run: (sessionId: string) => Promise<UndoTurnResponse>;
  };
  readonly connection: ToolkitRouteRegistry;
  readonly logger: { warn(message: string): void };
}

/** `ctx.connection.fetch` 的最小形状（`dsh-api-session-controller/lib/index.js:2480-2490`）。 */
export interface ToolkitRouteRegistry {
  readonly fetch: {
    register(route: {
      path: string;
      methods: readonly string[];
      requestBody: "buffered" | "streaming";
      fetch: (request: Request) => Promise<Response>;
    }): () => void;
  };
}

/**
 * 注册工具目录与撤回路由。
 * @param options - 注册表、撤回能力与连接服务。
 * @returns 注销全部路由的 disposer。
 */
export const registerToolkitRoutes = (options: ToolkitRoutesOptions): (() => void) => {
  const state = options.connection.fetch.register({
    path: TOOLKIT_STATE_PATH,
    methods: ["GET", "POST"],
    requestBody: "buffered",
    fetch: (request) => handleState(options, request),
  });
  const undo = options.connection.fetch.register({
    path: TOOLKIT_UNDO_PATH,
    methods: ["GET", "POST"],
    requestBody: "buffered",
    fetch: (request) => handleUndo(options, request),
  });
  return () => {
    state();
    undo();
  };
};

const handleState = async (options: ToolkitRoutesOptions, request: Request): Promise<Response> => {
  if (request.method === "GET") return json<ToolkitStateResponse>(stateOf(options));
  const parsed = await readJson(request);
  if (parsed === undefined) return failure(400, "invalid-body", "request body is not JSON");
  const change = asStateRequest(parsed);
  if (change === undefined) {
    return failure(400, "invalid-body", 'expected {"id": string, "enabled": boolean}');
  }
  try {
    await options.registry.setEnabled(change.id, change.enabled);
    return json<ToolkitStateResponse>(stateOf(options));
  } catch (error) {
    if (error instanceof UnknownToolError) {
      return failure(400, "unknown-tool", error.message);
    }
    options.logger.warn(`toolkit: toggling "${change.id}" failed: ${describe(error)}`);
    return failure(500, "internal", "the tool could not be toggled");
  }
};

const handleUndo = async (options: ToolkitRoutesOptions, request: Request): Promise<Response> => {
  if (!options.registry.isEnabled("undo-turn")) {
    return failure(409, "tool-disabled", "the undo tool is disabled");
  }
  if (options.undo === undefined) {
    return failure(501, "unsupported-host", "this host does not expose session control");
  }
  if (request.method === "GET") return inspectUndo(options, request);
  const parsed = await readJson(request);
  if (parsed === undefined) return failure(400, "invalid-body", "request body is not JSON");
  const sessionId = asSessionId(parsed);
  if (sessionId === undefined)
    return failure(400, "invalid-body", 'expected {"sessionId": string}');
  try {
    const result = await options.undo.run(sessionId);
    return json<UndoTurnResponse>(result);
  } catch (error) {
    if (error instanceof UndoUnavailableError) {
      return failure(409, error.reason, error.message);
    }
    options.logger.warn(`toolkit: undo of "${sessionId}" failed: ${describe(error)}`);
    return failure(500, "internal", "the turn could not be undone");
  }
};

const inspectUndo = (options: ToolkitRoutesOptions, request: Request): Response => {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (sessionId === null || sessionId === "") {
    return failure(400, "invalid-body", "missing sessionId query parameter");
  }
  try {
    const availability = options.undo?.inspect(sessionId);
    return json<UndoAvailability>(availability ?? { available: false, reason: "unsupported-host" });
  } catch (error) {
    options.logger.warn(`toolkit: undo probe for "${sessionId}" failed: ${describe(error)}`);
    return json<UndoAvailability>({ available: false, reason: "unavailable" });
  }
};

const stateOf = (options: ToolkitRoutesOptions): ToolkitStateResponse => ({
  tools: options.registry.list(),
});

const json = <T>(body: T, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};

const failure = (status: number, error: string, message: string): Response => {
  const body: ToolkitErrorBody = { error, message };
  return json(body, status);
};

const readJson = async (request: Request): Promise<unknown> => {
  try {
    const text = await request.text();
    if (text.trim() === "") return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/** 外部输入按字段逐项校验：不接受多余形状的猜测。 */
const asStateRequest = (value: unknown): ToolkitStateRequest | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as { id?: unknown; enabled?: unknown };
  if (typeof record.id !== "string" || record.id === "") return undefined;
  if (typeof record.enabled !== "boolean") return undefined;
  return { id: record.id, enabled: record.enabled };
};

const asSessionId = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const sessionId = (value as { sessionId?: unknown }).sessionId;
  return typeof sessionId === "string" && sessionId !== "" ? sessionId : undefined;
};

const describe = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
