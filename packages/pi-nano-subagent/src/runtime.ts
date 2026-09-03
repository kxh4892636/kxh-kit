import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  InMemoryCredentialStore,
  type Api,
  type AuthResult,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import { collectSubagentOutcome, type SubagentOutcome } from "./outcome.js";

const WORKING_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

export interface SubagentSession {
  readonly messages: readonly AgentMessage[];
  readonly prompt: (task: string) => Promise<void>;
  readonly abort: () => Promise<void>;
  readonly dispose: () => void;
}

export interface SubagentParentSnapshot {
  readonly cwd: ExtensionContext["cwd"];
  readonly model: ExtensionContext["model"];
  readonly modelRegistry: ExtensionContext["modelRegistry"];
  readonly thinkingLevel: ExtensionContext["thinkingLevel"];
}

export interface SubagentSessionRequest {
  readonly parent: SubagentParentSnapshot;
  readonly childTools: ToolDefinition[];
  readonly signal: AbortSignal | undefined;
}

export type SubagentSessionFactory = (request: SubagentSessionRequest) => Promise<SubagentSession>;

export interface PiSubagentRunRequest extends SubagentSessionRequest {
  readonly task: string;
}

const createInheritedProvider = (
  source: Provider,
  model: Model<Api>,
  auth: AuthResult,
): Provider => ({
  id: source.id,
  name: source.name,
  ...(source.baseUrl === undefined ? {} : { baseUrl: source.baseUrl }),
  ...(source.headers === undefined ? {} : { headers: source.headers }),
  auth: {
    apiKey: {
      name: `Inherited ${source.name} authentication`,
      check: async (): Promise<{ source: string; type: "api_key" }> => ({
        source: auth.source ?? "parent session",
        type: "api_key",
      }),
      resolve: async (): Promise<AuthResult> => auth,
    },
  },
  getModels: (): readonly Model<Api>[] => [model],
  stream: source.stream.bind(source),
  streamSimple: source.streamSimple.bind(source),
  ...(source.fetchDeferred === undefined
    ? {}
    : { fetchDeferred: source.fetchDeferred.bind(source) }),
  ...(source.cancelDeferred === undefined
    ? {}
    : { cancelDeferred: source.cancelDeferred.bind(source) }),
});

const createModelRuntime = async (
  parent: SubagentParentSnapshot,
  signal: AbortSignal | undefined,
): Promise<{ readonly model: Model<Api>; readonly runtime: ModelRuntime }> => {
  const model = parent.model;
  if (model === undefined) throw new Error("subagent requires an active parent model");
  const source = parent.modelRegistry.getProvider(model.provider);
  if (source === undefined) {
    throw new Error(`subagent cannot resolve parent provider ${model.provider}`);
  }
  const auth = await parent.modelRegistry.getProviderAuth(model.provider);
  if (auth === undefined) {
    throw new Error(`subagent cannot resolve authentication for ${model.provider}`);
  }
  signal?.throwIfAborted();
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    ...(signal === undefined ? {} : { signal }),
  });
  runtime.registerNativeProvider(createInheritedProvider(source, model, auth));
  return { model, runtime };
};

export const createPiSubagentSession: SubagentSessionFactory = async (
  request: SubagentSessionRequest,
): Promise<SubagentSession> => {
  const { parent, childTools, signal } = request;
  signal?.throwIfAborted();
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
  });
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: parent.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await resourceLoader.reload();
  signal?.throwIfAborted();
  const { model, runtime } = await createModelRuntime(parent, signal);
  const activeTools = [
    ...WORKING_TOOLS,
    ...childTools.map((tool: ToolDefinition): string => tool.name),
  ];
  const { session } = await createAgentSession({
    cwd: parent.cwd,
    agentDir,
    model,
    modelRuntime: runtime,
    ...(parent.thinkingLevel === undefined ? {} : { thinkingLevel: parent.thinkingLevel }),
    tools: activeTools,
    customTools: childTools,
    resourceLoader,
    sessionManager: SessionManager.inMemory(parent.cwd),
    settingsManager,
  });
  return session;
};

const cleanupSession = async (
  session: SubagentSession,
  abortPromise: Promise<void> | undefined,
): Promise<unknown[]> => {
  const errors: unknown[] = [];
  if (abortPromise !== undefined) {
    try {
      await abortPromise;
    } catch (error: unknown) {
      errors.push(error);
    }
  }
  try {
    session.dispose();
  } catch (error: unknown) {
    errors.push(error);
  }
  return errors;
};

const createFreshSession = async (
  request: PiSubagentRunRequest,
  createSession: SubagentSessionFactory,
): Promise<SubagentSession> => {
  try {
    return await createSession(request);
  } catch (cause: unknown) {
    throw new Error("subagent session initialization failed", { cause });
  }
};

const isCancelled = (signal: AbortSignal | undefined): boolean => signal?.aborted ?? false;

export const runPiSubagent = async (
  request: PiSubagentRunRequest,
  createSession: SubagentSessionFactory = createPiSubagentSession,
): Promise<SubagentOutcome> => {
  request.signal?.throwIfAborted();
  const session = await createFreshSession(request, createSession);
  let abortPromise: Promise<void> | undefined;
  const abort = (): void => {
    abortPromise ??= session.abort();
  };
  request.signal?.addEventListener("abort", abort, { once: true });

  let outcome: SubagentOutcome | undefined;
  let executionError: unknown;
  try {
    if (isCancelled(request.signal)) {
      abort();
      throw new Error("subagent run was cancelled during initialization");
    }
    await session.prompt(request.task);
    if (isCancelled(request.signal)) {
      throw new Error("subagent run was cancelled");
    }
    outcome = collectSubagentOutcome(session.messages);
  } catch (error: unknown) {
    executionError = error;
    abort();
  } finally {
    request.signal?.removeEventListener("abort", abort);
  }

  const cleanupErrors = await cleanupSession(session, abortPromise);
  if (executionError !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [executionError, ...cleanupErrors],
        "subagent run and cleanup both failed",
      );
    }
    throw executionError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "subagent cleanup failed");
  }
  if (outcome === undefined) throw new Error("subagent run settled without an outcome");
  return outcome;
};
