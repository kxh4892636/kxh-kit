import { Mutex } from "async-mutex";
import ky, { HTTPError, TimeoutError, type KyInstance } from "ky";
import type { Logger } from "../cli/logger";
import type { AnkiConnectRequest, AnkiConnectResponse } from "../types/anki.types";
import { AnkiConnectError, ReadOnlyModeError } from "./errors";

/**
 * AnkiConnect 是单线程的(请求在 Anki 的 Qt 主线程上执行, max_workers=1),
 * 并发 POST 会互相碰撞并超时。所有请求(含读)都经此互斥锁串行化(并发 1, FIFO)。
 *
 * 模块级共享: 一个进程只对应一个 Anki, 所有客户端实例共用同一把锁。
 */
const ankiRequestMutex = new Mutex();

// 队列深度上限: 超过即快速失败, 而不是无限排队。
let maxQueueDepth = 50;

/** 当前挂起请求数(在途 + 等待互斥锁)。 */
let pendingRequests = 0;

/** @internal 仅测试: 重置队列计数与深度上限。 */
export function __resetAnkiQueueForTests(depth = 50): void {
  pendingRequests = 0;
  maxQueueDepth = depth;
}

/**
 * 修改集合内容的 AnkiConnect action 集合, 只读模式下拦截。
 * 复习/调度操作(answerCards、sync 等)始终放行。
 */
const WRITE_ACTIONS = new Set([
  // Note operations
  "addNote",
  "updateNoteFields",
  "deleteNotes",
  // Deck operations
  "createDeck",
  "changeDeck",
  // Tag operations
  "addTags",
  "removeTags",
  "clearUnusedTags",
  "replaceTags",
  // Media operations
  "storeMediaFile",
  "deleteMediaFile",
  // Model operations
  "createModel",
  "updateModelStyling",
  "updateModelTemplates",
  "modelFieldAdd",
  "modelFieldRemove",
  "modelFieldRename",
  "modelFieldReposition",
]);

export interface AnkiConnectClientConfig {
  url: string;
  apiVersion: number;
  apiKey: string | undefined;
  timeout: number;
  readOnly: boolean;
  logger: Logger;
}

/**
 * AnkiConnect 客户端: 唯一向 Anki(经 AnkiConnect 插件)发请求的模块。
 * 行为与上游 anki-mcp-server 的 AnkiConnectClient 1:1 对齐:
 * 串行化互斥、重试(408/413/429/5xx 限 2 次, 超时不重试)、背压、只读守卫、错误分类。
 */
export class AnkiConnectClient {
  private readonly client: KyInstance;
  private readonly apiVersion: number;
  private readonly apiKey: string | undefined;
  private readonly readOnly: boolean;
  private readonly timeoutMs: number;
  private readonly logger: Logger;

  constructor(config: AnkiConnectClientConfig) {
    this.apiVersion = config.apiVersion;
    this.apiKey = config.apiKey;
    this.readOnly = config.readOnly;
    this.timeoutMs = config.timeout;
    this.logger = config.logger;

    this.client = ky.create({
      prefix: config.url,
      timeout: config.timeout,
      headers: {
        "Content-Type": "application/json",
      },
      // 超时故意不重试: 请求持有串行化互斥锁的时长保持有界。
      retry: {
        limit: 2,
        methods: ["POST"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 3000,
      },
      hooks: {
        beforeRequest: [
          ({ request }) => {
            this.logger.debug(`AnkiConnect request: ${request.method} ${request.url}`);
          },
        ],
        afterResponse: [
          ({ response }) => {
            this.logger.debug(`AnkiConnect response: ${response.status} ${response.statusText}`);
          },
        ],
      },
    });
  }

  /**
   * 发送一个 AnkiConnect action 请求。
   * @throws ReadOnlyModeError 只读模式下触发写操作
   * @throws AnkiConnectError 其余全部错误(连接、HTTP、AnkiConnect error、未知)
   */
  async invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    // 只读守卫
    if (this.readOnly && WRITE_ACTIONS.has(action)) {
      this.logger.warn(`Blocked write action "${action}" in read-only mode`);
      throw new ReadOnlyModeError(action);
    }

    const request: AnkiConnectRequest = {
      action,
      version: this.apiVersion,
      params,
      key: this.apiKey,
    };

    // 背压: 队列过深时快速失败。
    if (pendingRequests >= maxQueueDepth) {
      this.logger.warn(
        `Rejecting action "${action}": ${pendingRequests} requests already pending (max ${maxQueueDepth})`,
      );
      throw new AnkiConnectError(
        `Too many concurrent requests queued for AnkiConnect (max ${maxQueueDepth}). ` +
          `For bulk note creation, use the addNotes batch command instead of many parallel addNote calls.`,
        action,
      );
    }

    // 同步入队(此处与 runExclusive 之间无 await), 保持 FIFO 与提交顺序一致。
    pendingRequests++;

    try {
      // 先取锁再派发: ky 的超时只覆盖在途请求, 不覆盖排队等待时间。
      const result = await ankiRequestMutex.runExclusive(async () => {
        this.logger.info(`Invoking AnkiConnect action: ${action}`);

        const response = await this.client
          .post("", { json: request })
          .json<AnkiConnectResponse<T>>();

        if (response.error) {
          throw new AnkiConnectError(
            `AnkiConnect error: ${response.error}`,
            action,
            response.error,
          );
        }

        this.logger.info(`AnkiConnect action successful: ${action}`);
        return response.result;
      });

      return result;
    } catch (error) {
      // ReadOnlyModeError 直接上抛
      if (error instanceof ReadOnlyModeError) {
        throw error;
      }

      if (error instanceof HTTPError) {
        if (error.response.status === 403) {
          throw new AnkiConnectError(
            "Permission denied. Please check AnkiConnect configuration and API key.",
            action,
          );
        }
        throw new AnkiConnectError(`HTTP error ${error.response.status}: ${error.message}`, action);
      }

      if (error instanceof TimeoutError) {
        throw new AnkiConnectError(
          `Request to AnkiConnect timed out after ${this.timeoutMs}ms. Anki may be busy with a modal dialog.`,
          action,
        );
      }

      // 连接错误(ky v2 以 "Request failed due to a network error" 呈现)
      if (
        error instanceof TypeError ||
        (error instanceof Error && /network error|fetch/i.test(error.message))
      ) {
        throw new AnkiConnectError(
          "Cannot connect to Anki. Please ensure Anki is running and AnkiConnect plugin is installed.",
          action,
        );
      }

      if (error instanceof AnkiConnectError) {
        throw error;
      }

      throw new AnkiConnectError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        action,
      );
    } finally {
      pendingRequests--;
    }
  }
}
