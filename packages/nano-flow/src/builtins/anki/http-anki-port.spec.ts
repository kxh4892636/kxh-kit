import { channel } from "node:diagnostics_channel";
import { afterEach, describe, expect, test } from "vitest";
import type { AnkiConfig } from "./config";
import { ReadOnlyModeError } from "./errors";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeRequest,
  type FakeResponse,
} from "./testing/fake-anki-connect";
import { HttpAnkiPort, resetAnkiQueueForTests } from "./http-anki-port";
import { createLogger } from "./logger";
const servers: FakeAnkiConnect[] = [];
const logger = createLogger("error");
const config = (url: string, readOnly = false): AnkiConfig => ({
  url,
  apiKey: "secret",
  apiVersion: 6,
  timeout: 2000,
  readOnly,
  logLevel: "error",
});

afterEach(async (): Promise<void> => {
  await Promise.all(
    servers.splice(0).map((server: FakeAnkiConnect): Promise<void> => server.close()),
  );
  resetAnkiQueueForTests();
});

describe("HttpAnkiPort", (): void => {
  test("routes filtered logger events through diagnostics without CLI output", (): void => {
    const events: unknown[] = [];
    const diagnostics = channel("nnf.anki");
    const receive = (message: unknown): void => void events.push(message);
    diagnostics.subscribe(receive);
    try {
      const filtered = createLogger("warn");
      filtered.info("hidden");
      filtered.warn("visible");
    } finally {
      diagnostics.unsubscribe(receive);
    }
    expect(events).toEqual([{ level: "warn", message: "visible" }]);
  });

  test("sends the AnkiConnect envelope and retries retryable HTTP failures", async (): Promise<void> => {
    const server = await startFakeAnkiConnect(
      (_request: FakeRequest, attempt: number): FakeResponse =>
        attempt < 3 ? { status: 500 } : { result: ["Deck"] },
    );
    servers.push(server);
    const result = await new HttpAnkiPort(config(server.url), logger).invoke("deckNames", {
      scope: "all",
    });
    expect(result).toEqual(["Deck"]);
    expect(server.requests).toHaveLength(3);
    expect(server.requests[0]).toEqual({
      action: "deckNames",
      version: 6,
      params: { scope: "all" },
      key: "secret",
    });
  });

  test("serializes concurrent requests in submission order", async (): Promise<void> => {
    const server = await startFakeAnkiConnect(
      async (request: FakeRequest): Promise<FakeResponse> => {
        await new Promise<void>((resolve: () => void): void => void setTimeout(resolve, 10));
        return { result: request.action };
      },
    );
    servers.push(server);
    const port = new HttpAnkiPort(config(server.url), logger);
    expect(
      await Promise.all([port.invoke("sync"), port.invoke("deckNames"), port.invoke("findCards")]),
    ).toEqual(["sync", "deckNames", "findCards"]);
    expect(server.requests.map((request: FakeRequest): string => request.action)).toEqual([
      "sync",
      "deckNames",
      "findCards",
    ]);
  });

  test("applies backpressure and the read-only guard", async (): Promise<void> => {
    resetAnkiQueueForTests(1);
    const server = await startFakeAnkiConnect(async (): Promise<FakeResponse> => {
      await new Promise<void>((resolve: () => void): void => void setTimeout(resolve, 100));
      return { result: null };
    });
    servers.push(server);
    const port = new HttpAnkiPort(config(server.url), logger);
    const first = port.invoke("sync");
    await new Promise<void>((resolve: () => void): void => void setTimeout(resolve, 10));
    await expect(port.invoke("deckNames")).rejects.toThrow(/Too many concurrent requests/u);
    await first;
    await expect(
      new HttpAnkiPort(config(server.url, true), logger).invoke("createDeck"),
    ).rejects.toBeInstanceOf(ReadOnlyModeError);
  });

  test("rejects an invalid external response envelope", async (): Promise<void> => {
    const server = await startFakeAnkiConnect((): FakeResponse => ({ body: { result: null } }));
    servers.push(server);
    await expect(new HttpAnkiPort(config(server.url), logger).invoke("deckNames")).rejects.toThrow(
      /Invalid AnkiConnect response envelope/u,
    );
  });
});
