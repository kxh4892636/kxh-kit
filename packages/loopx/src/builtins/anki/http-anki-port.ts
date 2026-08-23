import { Mutex } from "async-mutex";
import ky, { HTTPError, TimeoutError, type KyInstance } from "ky";
import type { JsonValue } from "../../cli/types";
import type { AnkiConfig } from "./config";
import { AnkiOperationError, ReadOnlyModeError } from "./errors";
import type { Logger } from "./logger";
import type { AnkiPort } from "./port";

const requestMutex = new Mutex();
let maxQueueDepth = 50;
let pendingRequests = 0;

export const resetAnkiQueueForTests = (depth = 50): void => {
  pendingRequests = 0;
  maxQueueDepth = depth;
};

const writeActions = new Set([
  "addNote",
  "updateNoteFields",
  "deleteNotes",
  "createDeck",
  "changeDeck",
  "addTags",
  "removeTags",
  "clearUnusedTags",
  "replaceTags",
  "storeMediaFile",
  "deleteMediaFile",
  "createModel",
  "updateModelStyling",
  "updateModelTemplates",
  "modelFieldAdd",
  "modelFieldRemove",
  "modelFieldRename",
  "modelFieldReposition",
]);

const parseEnvelope = <Result>(value: unknown, action: string): Result => {
  if (typeof value !== "object" || value === null || !("error" in value) || !("result" in value)) {
    throw new AnkiOperationError("Invalid AnkiConnect response envelope", action);
  }
  const error = value.error;
  if (error !== null && typeof error !== "string") {
    throw new AnkiOperationError("Invalid AnkiConnect error response", action);
  }
  if (error !== null) throw new AnkiOperationError(`AnkiConnect error: ${error}`, action);
  return value.result as Result;
};

export class HttpAnkiPort implements AnkiPort {
  private readonly client: KyInstance;
  private readonly config: AnkiConfig;
  private readonly logger: Logger;

  constructor(config: AnkiConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.client = ky.create({
      prefix: config.url,
      timeout: config.timeout,
      headers: { "Content-Type": "application/json" },
      retry: {
        limit: 2,
        methods: ["POST"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 3000,
      },
    });
  }

  readonly invoke = async <Result>(
    action: string,
    params?: Readonly<Record<string, JsonValue>>,
  ): Promise<Result> => {
    if (this.config.readOnly && writeActions.has(action)) {
      this.logger.warn(`Blocked write action "${action}" in read-only mode`);
      throw new ReadOnlyModeError(action);
    }
    if (pendingRequests >= maxQueueDepth) {
      this.logger.warn(`Rejected action "${action}" because the AnkiConnect queue is full`);
      throw new AnkiOperationError(
        `Too many concurrent requests queued for AnkiConnect (max ${maxQueueDepth})`,
        action,
      );
    }
    pendingRequests += 1;
    try {
      return await requestMutex.runExclusive(async (): Promise<Result> => {
        this.logger.debug(`AnkiConnect request: POST ${this.config.url}`);
        this.logger.info(`Invoking AnkiConnect action: ${action}`);
        const response: unknown = await this.client
          .post("", {
            json: {
              action,
              version: this.config.apiVersion,
              params,
              key: this.config.apiKey,
            },
          })
          .json<unknown>();
        const result = parseEnvelope<Result>(response, action);
        this.logger.info(`AnkiConnect action successful: ${action}`);
        return result;
      });
    } catch (error) {
      this.logger.warn(
        `AnkiConnect action failed: ${action}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof AnkiOperationError) throw error;
      if (error instanceof HTTPError) {
        const message =
          error.response.status === 403
            ? "Permission denied. Check the AnkiConnect API key."
            : `HTTP error ${error.response.status}: ${error.message}`;
        throw new AnkiOperationError(message, action);
      }
      if (error instanceof TimeoutError) {
        throw new AnkiOperationError(
          `Request to AnkiConnect timed out after ${this.config.timeout}ms. Anki may be busy with a modal dialog.`,
          action,
        );
      }
      if (
        error instanceof TypeError ||
        (error instanceof Error && /network error|fetch/iu.test(error.message))
      ) {
        throw new AnkiOperationError(
          "Cannot connect to Anki. Ensure Anki is running and AnkiConnect is installed.",
          action,
        );
      }
      throw new AnkiOperationError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        action,
      );
    } finally {
      pendingRequests -= 1;
    }
  };
}
