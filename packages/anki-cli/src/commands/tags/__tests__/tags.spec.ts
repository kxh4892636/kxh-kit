import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonError } from "../../../cli/json-error";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runAddTags } from "../add-command";
import { runClearUnusedTags } from "../clear-command";
import { runGetTags } from "../list-command";
import { runRemoveTags } from "../remove-command";
import { runReplaceTags } from "../replace-command";

const servers: FakeAnkiConnect[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  vi.restoreAllMocks();
  process.exitCode = 0;
});

const start = async (responder: FakeResponder): Promise<string> => {
  const server = await startFakeAnkiConnect(responder);
  servers.push(server);
  return server.url;
};

describe("runGetTags", () => {
  it("全部标签", async () => {
    const url = await start((req) => {
      if (req.action === "getTags") return { result: ["a", "b"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGetTags(makeClient(url), {});

    expect(result).toMatchObject({ success: true, tags: ["a", "b"], total: 2 });
    expect(result.filtered).toBeUndefined();
  });

  it("pattern 过滤并报总数", async () => {
    const url = await start((req) => {
      if (req.action === "getTags") return { result: ["foo", "FOO2", "bar"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGetTags(makeClient(url), { pattern: "foo" });

    expect(result).toMatchObject({
      tags: ["foo", "FOO2"],
      total: 2,
      filtered: true,
      totalUnfiltered: 3,
    });
  });
});

describe("runAddTags / runRemoveTags", () => {
  it("addTags 传修剪后的空格分隔串并返回 tagsAdded", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const url = await start((req) => {
      if (req.action === "addTags") {
        requests.push(req.params ?? {});
        return { result: null };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runAddTags(makeClient(url), {
      notes: [1, 2],
      tags: "  t1   t2 ",
    });

    // 上游语义: 只 trim 首尾, 内部空格保留(AnkiConnect 按空白切分)
    expect(requests[0]).toEqual({ notes: [1, 2], tags: "t1   t2" });
    expect(result).toMatchObject({ success: true, notesAffected: 2, tagsAdded: ["t1", "t2"] });
  });

  it("空标签拒绝", async () => {
    const url = await start(() => ({ result: null }));

    await expect(runAddTags(makeClient(url), { notes: [1], tags: "   " })).rejects.toMatchObject({
      name: "JsonError",
      action: "addTags",
    });
  });

  it("removeTags 返回 tagsRemoved", async () => {
    const url = await start((req) => {
      if (req.action === "removeTags") return { result: null };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runRemoveTags(makeClient(url), {
      notes: [1],
      tags: "t1 t2",
    });

    expect(result).toMatchObject({ success: true, tagsRemoved: ["t1", "t2"] });
  });
});

describe("runReplaceTags", () => {
  it("替换成功(参数 tag_to_replace/replace_with_tag)", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const url = await start((req) => {
      if (req.action === "replaceTags") {
        requests.push(req.params ?? {});
        return { result: null };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runReplaceTags(makeClient(url), {
      notes: [1],
      tagToReplace: "RomanEmpire",
      replaceWithTag: "roman-empire",
    });

    expect(requests[0]).toEqual({
      notes: [1],
      tag_to_replace: "RomanEmpire",
      replace_with_tag: "roman-empire",
    });
    expect(result).toMatchObject({ success: true, notesAffected: 1 });
  });

  it("含空格标签拒绝", async () => {
    const url = await start(() => ({ result: null }));

    await expect(
      runReplaceTags(makeClient(url), {
        notes: [1],
        tagToReplace: "a b",
        replaceWithTag: "c",
      }),
    ).rejects.toThrow(/cannot contain spaces/);
  });
});

describe("runClearUnusedTags", () => {
  it("未确认拒绝(--yes)", async () => {
    const url = await start(() => ({ result: null }));

    try {
      await runClearUnusedTags(makeClient(url), false);
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).action).toBe("clearUnusedTags");
      expect((error as JsonError).hint).toContain("--yes");
    }
  });

  it("确认后清理成功", async () => {
    const url = await start((req) => {
      if (req.action === "clearUnusedTags") return { result: null };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runClearUnusedTags(makeClient(url), true);

    expect(result).toMatchObject({ success: true });
    expect(result.message).toContain("cleared unused tags");
  });
});

describe("CLI 端到端(tags 组)", () => {
  it("tags list 输出 success JSON", async () => {
    const url = await start((req) => {
      if (req.action === "getTags") return { result: ["x"] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["tags", "list", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ success: true, tags: ["x"] });
  });

  it("tags clear-unused 未 --yes: 退出码 1 + 错误 JSON", async () => {
    const url = await start(() => ({ result: null }));
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    await runCli(["tags", "clear-unused", "--anki-connect", url]);

    expect(process.exitCode).toBe(1);
    const blocks = stderr.filter((b) => b.trim().startsWith("{"));
    expect(JSON.parse(blocks.at(-1) ?? "{}")).toMatchObject({
      success: false,
      action: "clearUnusedTags",
    });
  });
});
