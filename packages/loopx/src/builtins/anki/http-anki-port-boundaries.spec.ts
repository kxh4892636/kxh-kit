import type { KyInstance } from "ky";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AnkiConfig } from "./config";
import { AnkiOperationError } from "./errors";
import { startFakeAnkiConnect, type FakeAnkiConnect } from "./testing/fake-anki-connect";
import { HttpAnkiPort, resetAnkiQueueForTests } from "./http-anki-port";
import type { Logger } from "./logger";

const servers: FakeAnkiConnect[] = [];
const logger = (): Logger => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() });
const config = (url = "http://127.0.0.1:1", timeout = 500): AnkiConfig => ({
  url,
  apiKey: undefined,
  apiVersion: 6,
  timeout,
  readOnly: false,
  logLevel: "debug",
});
const rejectingClient = (failure: unknown): KyInstance =>
  ({
    post: (): { json: () => Promise<never> } => ({
      json: async (): Promise<never> => Promise.reject(failure),
    }),
  }) as unknown as KyInstance;
const resolvingClient = (value: unknown): KyInstance =>
  ({
    post: (): { json: () => Promise<unknown> } => ({
      json: async (): Promise<unknown> => value,
    }),
  }) as unknown as KyInstance;

afterEach(async (): Promise<void> => {
  resetAnkiQueueForTests();
  await Promise.all(servers.splice(0).map((server: FakeAnkiConnect) => server.close()));
});

describe("HTTP Anki port boundaries", (): void => {
  test.each([
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
  ])("blocks shipped write action %s in read-only mode", async (action: string): Promise<void> => {
    const log = logger();
    const readOnly = { ...config(), readOnly: true };
    await expect(
      new HttpAnkiPort(
        readOnly,
        log,
        resolvingClient({ error: null, result: "unexpected" }),
      ).invoke(action),
    ).rejects.toMatchObject({
      action,
      message: `Action "${action}" is blocked: Anki is running in read-only mode. Remove --read-only to enable writes.`,
      name: "ReadOnlyModeError",
    });
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      `Blocked write action "${action}" in read-only mode`,
    );
  });

  test.each([
    ["invalid", "Invalid AnkiConnect response envelope"],
    [{ result: null }, "Invalid AnkiConnect response envelope"],
    [{ result: null, error: 42 }, "Invalid AnkiConnect error response"],
    [{ result: null, error: "upstream" }, "AnkiConnect error: upstream"],
  ])("rejects malformed envelope %j", async (body, message): Promise<void> => {
    const server = await startFakeAnkiConnect(() => ({ body }));
    servers.push(server);
    await expect(new HttpAnkiPort(config(server.url), logger()).invoke("test")).rejects.toThrow(
      message,
    );
  });

  test("rejects a null response envelope", async (): Promise<void> => {
    await expect(
      new HttpAnkiPort(config(), logger(), resolvingClient(null)).invoke("test"),
    ).rejects.toThrow("Invalid AnkiConnect response envelope");
  });

  test.each([
    [403, "Permission denied"],
    [418, "HTTP error 418"],
  ])("classifies HTTP status %s", async (status: number, message: string): Promise<void> => {
    const server = await startFakeAnkiConnect(() => ({ status }));
    servers.push(server);
    await expect(new HttpAnkiPort(config(server.url), logger()).invoke("test")).rejects.toThrow(
      message,
    );
  });

  test("classifies timeouts", async (): Promise<void> => {
    const server = await startFakeAnkiConnect(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { result: null };
    });
    servers.push(server);
    await expect(new HttpAnkiPort(config(server.url, 20), logger()).invoke("test")).rejects.toThrow(
      "timed out after 20ms",
    );
  });

  test.each([
    [new TypeError("bad fetch"), "Cannot connect to Anki"],
    [new Error("network error"), "Cannot connect to Anki"],
    [new Error("fetch failed"), "Cannot connect to Anki"],
    [new Error("other"), "Unexpected error: other"],
    ["primitive", "Unexpected error: primitive"],
  ])("normalizes client failure %s", async (failure, message): Promise<void> => {
    const log = logger();
    await expect(
      new HttpAnkiPort(config(), log, rejectingClient(failure)).invoke("test"),
    ).rejects.toThrow(message);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining(String(failure instanceof Error ? failure.message : failure)),
    );
  });

  test("preserves Anki operation failures from the client", async (): Promise<void> => {
    const error = new AnkiOperationError("structured", "custom");
    await expect(
      new HttpAnkiPort(config(), logger(), rejectingClient(error)).invoke("test"),
    ).rejects.toBe(error);
  });

  test("omits optional envelope fields when they are not configured", async (): Promise<void> => {
    const server = await startFakeAnkiConnect(() => ({ result: "ok" }));
    servers.push(server);
    const result = await new HttpAnkiPort(config(server.url), logger()).invoke("test");
    expect(result).toBe("ok");
    expect(server.requests[0]).toEqual({ action: "test", version: 6 });
  });
});

describe("HTTP Anki port boundaries", (): void => {
  test("permits writes outside read-only mode and records the exact successful exchange", async (): Promise<void> => {
    const log = logger();
    const post = vi.fn((): { json: () => Promise<unknown> } => ({
      json: async (): Promise<unknown> => ({ error: null, result: 7 }),
    }));
    const client = { post } as unknown as KyInstance;
    await expect(new HttpAnkiPort(config(), log, client).invoke("createDeck")).resolves.toBe(7);
    expect(post).toHaveBeenCalledExactlyOnceWith("", {
      json: {
        action: "createDeck",
        version: 6,
        params: undefined,
        key: undefined,
      },
    });
    expect(log.debug).toHaveBeenCalledExactlyOnceWith(
      "AnkiConnect request: POST http://127.0.0.1:1",
    );
    expect(log.info).toHaveBeenNthCalledWith(1, "Invoking AnkiConnect action: createDeck");
    expect(log.info).toHaveBeenNthCalledWith(2, "AnkiConnect action successful: createDeck");
    expect(log.warn).not.toHaveBeenCalled();
  });

  test("releases queue capacity after each completed request", async (): Promise<void> => {
    resetAnkiQueueForTests(1);
    const port = new HttpAnkiPort(config(), logger(), resolvingClient({ error: null, result: 1 }));
    await expect(port.invoke("first")).resolves.toBe(1);
    await expect(port.invoke("second")).resolves.toBe(1);
  });

  test("logs the exact rejected action when queue capacity is exhausted", async (): Promise<void> => {
    resetAnkiQueueForTests(1);
    const server = await startFakeAnkiConnect(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { result: null };
    });
    servers.push(server);
    const log = logger();
    const port = new HttpAnkiPort(config(server.url), log);
    const first = port.invoke("first");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(port.invoke("second")).rejects.toThrow(/Too many concurrent requests/u);
    expect(log.warn).toHaveBeenCalledWith(
      'Rejected action "second" because the AnkiConnect queue is full',
    );
    await first;
  });
});
