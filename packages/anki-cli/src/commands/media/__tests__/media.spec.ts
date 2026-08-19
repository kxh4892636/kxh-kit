import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonError } from "../../../cli/json-error";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runDeleteMediaFile } from "../delete-command";
import { runGetMediaFilesNames } from "../list-command";
import { runRetrieveMediaFile } from "../retrieve-command";
import { runStoreMediaFile } from "../store-command";

const servers: FakeAnkiConnect[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = 0;
});

const start = async (responder: FakeResponder): Promise<string> => {
  const server = await startFakeAnkiConnect(responder);
  servers.push(server);
  return server.url;
};

describe("runGetMediaFilesNames", () => {
  it("全部文件", async () => {
    const url = await start((req) => {
      if (req.action === "getMediaFilesNames") return { result: ["a.mp3"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGetMediaFilesNames(makeClient(url), {});

    expect(result).toMatchObject({ success: true, files: ["a.mp3"], count: 1 });
  });

  it("pattern 过滤", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const url = await start((req) => {
      if (req.action === "getMediaFilesNames") {
        requests.push(req.params ?? {});
        return { result: [] };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    await runGetMediaFilesNames(makeClient(url), { pattern: "*.mp3" });

    expect(requests[0]).toEqual({ pattern: "*.mp3" });
  });
});

describe("runRetrieveMediaFile", () => {
  it("成功返回 base64", async () => {
    const url = await start((req) => {
      if (req.action === "retrieveMediaFile") return { result: "aGVsbG8=" };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runRetrieveMediaFile(makeClient(url), { filename: "a.mp3" });

    expect(result).toMatchObject({ success: true, data: "aGVsbG8=", found: true });
  });

  it("不存在返回 found=false(data=null)", async () => {
    const url = await start((req) => {
      if (req.action === "retrieveMediaFile") return { result: false };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runRetrieveMediaFile(makeClient(url), { filename: "x.mp3" });

    expect(result).toMatchObject({ success: true, found: false, data: null });
  });

  it("文件名路径穿越被净化", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const url = await start((req) => {
      if (req.action === "retrieveMediaFile") {
        requests.push(req.params ?? {});
        return { result: "x" };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    await runRetrieveMediaFile(makeClient(url), { filename: "../secret.png" });

    expect(requests[0]).toEqual({ filename: "secret.png" });
  });
});

describe("runStoreMediaFile", () => {
  it("多来源同时给出时拒绝", async () => {
    const url = await start(() => ({ result: null }));

    await expect(
      runStoreMediaFile(makeClient(url), {
        filename: "a.png",
        data: "x",
        path: "C:\\a.png",
      }),
    ).rejects.toThrow(/multiple sources/);
  });

  it("url 经 SSRF 校验(本地地址被拒)", async () => {
    const url = await start(() => ({ result: null }));

    await expect(
      runStoreMediaFile(makeClient(url), {
        filename: "a.png",
        url: "http://localhost:9999/a.png",
      }),
    ).rejects.toThrow(/URL blocked/);
  });

  it("本地文件按 MIME 校验(非媒体拒绝)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anki-cli-media-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "secret.txt");
    writeFileSync(filePath, "x");

    const url = await start(() => ({ result: null }));

    await expect(
      runStoreMediaFile(makeClient(url), { filename: "a.txt", path: filePath }),
    ).rejects.toThrow(/File type not allowed/);
  });

  it("本地媒体文件成功(传净化后的 resolvedPath)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anki-cli-media-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "pic.png");
    writeFileSync(filePath, "x");

    const requests: Array<Record<string, unknown>> = [];
    const url = await start((req) => {
      if (req.action === "storeMediaFile") {
        requests.push(req.params ?? {});
        return { result: "pic.png" };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runStoreMediaFile(makeClient(url), {
      filename: "../pic.png",
      path: filePath,
    });

    expect(requests[0]).toMatchObject({
      filename: "pic.png",
      path: path.resolve(filePath),
      deleteExisting: true,
    });
    expect(result).toMatchObject({ success: true, prefixedWithUnderscore: false });
  });
});

describe("runDeleteMediaFile", () => {
  it("未确认拒绝(--yes)", async () => {
    const url = await start(() => ({ result: null }));

    try {
      await runDeleteMediaFile(makeClient(url), { filename: "a.mp3", confirmed: false });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).action).toBe("deleteMediaFile");
      expect((error as JsonError).hint).toContain("--yes");
    }
  });

  it("确认后删除(文件名净化)", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const url = await start((req) => {
      if (req.action === "deleteMediaFile") {
        requests.push(req.params ?? {});
        return { result: null };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runDeleteMediaFile(makeClient(url), {
      filename: "../a.mp3",
      confirmed: true,
    });

    expect(requests[0]).toEqual({ filename: "a.mp3" });
    expect(result.success).toBe(true);
  });
});

describe("CLI 端到端(media 组)", () => {
  it("media list 输出 success JSON", async () => {
    const url = await start((req) => {
      if (req.action === "getMediaFilesNames") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["media", "list", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ success: true, count: 0 });
  });

  it("media delete 未 --yes: 退出码 1", async () => {
    const url = await start(() => ({ result: null }));
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    await runCli(["media", "delete", "a.mp3", "--anki-connect", url]);

    expect(process.exitCode).toBe(1);
    const blocks = stderr.filter((b) => b.trim().startsWith("{"));
    expect(JSON.parse(blocks.at(-1) ?? "{}")).toMatchObject({
      success: false,
      action: "deleteMediaFile",
    });
  });
});
