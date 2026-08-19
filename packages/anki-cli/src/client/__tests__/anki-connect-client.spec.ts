import { afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../../cli/logger";
import { startFakeAnkiConnect, type FakeAnkiConnect } from "../../test-fixtures/fake-anki-connect";
import {
  AnkiConnectClient,
  __resetAnkiQueueForTests,
  type AnkiConnectClientConfig,
} from "../anki-connect-client";
import { AnkiConnectError, ReadOnlyModeError } from "../errors";

const silentLogger = createLogger("error");

const makeClient = (
  url: string,
  overrides: Partial<AnkiConnectClientConfig> = {},
): AnkiConnectClient =>
  new AnkiConnectClient({
    url,
    apiVersion: 6,
    apiKey: undefined,
    timeout: 2000,
    readOnly: false,
    logger: silentLogger,
    ...overrides,
  });

const servers: FakeAnkiConnect[] = [];

const track = (server: FakeAnkiConnect): FakeAnkiConnect => {
  servers.push(server);
  return server;
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  __resetAnkiQueueForTests();
});

describe("AnkiConnectClient", () => {
  it("发送 {action, version, params} 并注入 apiKey", async () => {
    const server = track(await startFakeAnkiConnect(() => ({ result: ["Deck"] })));
    const client = makeClient(server.url, { apiKey: "secret-key" });

    const result = await client.invoke<string[]>("deckNames", { foo: "bar" });

    expect(result).toEqual(["Deck"]);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toEqual({
      action: "deckNames",
      version: 6,
      params: { foo: "bar" },
      key: "secret-key",
    });
  });

  it("AnkiConnect error 字符串包装为 AnkiConnectError", async () => {
    const server = track(await startFakeAnkiConnect(() => ({ error: "deck not found" })));
    const client = makeClient(server.url);

    await expect(client.invoke("deckNames")).rejects.toThrow(AnkiConnectError);
    await expect(client.invoke("deckNames")).rejects.toMatchObject({
      name: "AnkiConnectError",
      message: "AnkiConnect error: deck not found",
      action: "deckNames",
    });
  });

  it("HTTP 403 报权限错误", async () => {
    const server = track(await startFakeAnkiConnect(() => ({ status: 403 })));
    const client = makeClient(server.url);

    await expect(client.invoke("addNote")).rejects.toMatchObject({
      name: "AnkiConnectError",
      action: "addNote",
    });
    await expect(client.invoke("addNote")).rejects.toThrow(/Permission denied/);
  });

  it("HTTP 500 重试两次后成功(共 3 次请求)", async () => {
    const server = track(
      await startFakeAnkiConnect((_request, attempt) =>
        attempt < 3 ? { status: 500 } : { result: "ok" },
      ),
    );
    const client = makeClient(server.url);

    const result = await client.invoke<string>("sync");

    expect(result).toBe("ok");
    expect(server.requests).toHaveLength(3);
  });

  it("连接失败(服务已关闭)报 Cannot connect", async () => {
    const server = track(await startFakeAnkiConnect(() => ({ result: null })));
    const url = server.url;
    await server.close();

    const client = makeClient(url);

    await expect(client.invoke("sync")).rejects.toMatchObject({
      name: "AnkiConnectError",
      action: "sync",
    });
    await expect(client.invoke("sync")).rejects.toThrow(/Cannot connect to Anki/);
  });

  it("只读模式拦截写 action, 放行 sync", async () => {
    const server = track(await startFakeAnkiConnect(() => ({ result: null })));
    const client = makeClient(server.url, { readOnly: true });

    await expect(client.invoke("addNote")).rejects.toThrow(ReadOnlyModeError);
    await expect(client.invoke("sync")).resolves.toBeNull();
  });

  it("请求经互斥锁串行化, 按提交顺序到达", async () => {
    const server = track(
      await startFakeAnkiConnect(async (request) => {
        await new Promise((res) => setTimeout(res, 20));
        return { result: request.action };
      }),
    );
    const client = makeClient(server.url);

    const [a, b, c] = await Promise.all([
      client.invoke("sync"),
      client.invoke("deckNames"),
      client.invoke("findCards"),
    ]);

    expect([a, b, c]).toEqual(["sync", "deckNames", "findCards"]);
    expect(server.requests.map((r) => r.action)).toEqual(["sync", "deckNames", "findCards"]);
  });

  it("队列过深时快速失败(背压)", async () => {
    __resetAnkiQueueForTests(1);
    const server = track(
      await startFakeAnkiConnect(async () => {
        await new Promise((res) => setTimeout(res, 400));
        return { result: null };
      }),
    );
    const client = makeClient(server.url);

    const first = client.invoke("sync");
    await new Promise((res) => setTimeout(res, 50));

    await expect(client.invoke("deckNames")).rejects.toThrow(/Too many concurrent requests/);

    await first;
  });
});
