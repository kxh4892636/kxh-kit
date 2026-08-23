import type {
  InvocationContext,
  JsonOutput,
  JsonValue,
  OptionValues,
  PreparedMutation,
} from "../../cli/types";
import { loadAnkiConfig, type AnkiConfig } from "./config";
import { AnkiOperationError, ReadOnlyModeError } from "./errors";
import { createLogger, type Logger } from "./logger";
import type { AnkiPort } from "./port";

const readOnlyAllowedActions = new Set(["answerCards", "review", "sync"]);

export interface AnkiDependencies {
  connect(config: AnkiConfig, logger: Logger): AnkiPort;
  now?(): Date;
  readText?(source: string, context: InvocationContext): Promise<string>;
}

export const loggerFor = (options: OptionValues, context: InvocationContext): Logger =>
  createLogger(loadAnkiConfig(options, context).logLevel);

export const connection = (
  dependencies: AnkiDependencies,
  options: OptionValues,
  context: InvocationContext,
): { config: AnkiConfig; logger: Logger; port: AnkiPort } => {
  const config = loadAnkiConfig(options, context);
  const logger = createLogger(config.logLevel);
  return {
    config,
    logger,
    port: dependencies.connect(config, logger),
  };
};

export const mutation = (
  action: string,
  options: OptionValues,
  context: InvocationContext,
  dependencies: AnkiDependencies,
  params: Readonly<Record<string, JsonValue>>,
  run: (port: AnkiPort, logger: Logger) => Promise<JsonOutput>,
): PreparedMutation => {
  const config = loadAnkiConfig(options, context);
  return {
    preview: { success: true, actions: [{ action, params }] },
    commit: async (): Promise<JsonOutput> => {
      if (config.readOnly && !readOnlyAllowedActions.has(action))
        throw new ReadOnlyModeError(action);
      const logger = createLogger(config.logLevel);
      const port = dependencies.connect(config, logger);
      return run(port, logger);
    },
  };
};

export const toJson = async (result: Promise<unknown>): Promise<JsonValue> => {
  const serialized = JSON.stringify(await result);
  if (serialized === undefined) {
    throw new AnkiOperationError("Operation returned a non-JSON result", "serializeResult");
  }
  return JSON.parse(serialized) as JsonValue;
};
