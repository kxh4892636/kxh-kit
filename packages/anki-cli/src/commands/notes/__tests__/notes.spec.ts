import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonError } from "../../../cli/json-error";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runAddNote } from "../add-note-command";
import { runAddNotes } from "../add-notes-command";
import { runDeleteNotes } from "../delete-notes-command";
import { runFindNotes } from "../find-notes-command";
import { runNotesInfo } from "../notes-info-command";
import { runUpdateNoteFields } from "../update-note-fields-command";

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

const basicFields = { Front: "Q", Back: "A" };

describe("runAddNote", () => {
  it("成功创建返回 noteId 与详情", async () => {
    const url = await start((req) => {
      if (req.action === "modelFieldNames") return { result: ["Front", "Back"] };
      if (req.action === "addNote") return { result: 123 };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runAddNote(makeClient(url), {
      deckName: "Default",
      modelName: "Basic",
      fields: basicFields,
      tags: ["t"],
    });

    expect(result).toMatchObject({
      success: true,
      noteId: 123,
      details: { fieldsAdded: 2, tagsAdded: 1, duplicateCheckScope: "default" },
    });
  });

  it("排序字段为空拒绝", async () => {
    const url = await start((req) => {
      if (req.action === "modelFieldNames") return { result: ["Front", "Back"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    try {
      await runAddNote(makeClient(url), {
        deckName: "Default",
        modelName: "Basic",
        fields: { Front: " ", Back: "A" },
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonError);
      expect((error as JsonError).action).toBe("addNote");
      expect((error as JsonError).message).toContain('"Front" cannot be empty');
    }
  });

  it("duplicate 错误分类提示", async () => {
    const url = await start((req) => {
      if (req.action === "modelFieldNames") return { result: ["Front", "Back"] };
      if (req.action === "addNote")
        return { error: "cannot create note because it is a duplicate" };
      throw new Error(`unexpected action ${req.action}`);
    });

    try {
      await runAddNote(makeClient(url), {
        deckName: "Default",
        modelName: "Basic",
        fields: basicFields,
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).hint).toContain("--allow-duplicate");
    }
  });

  it("模板不存在拒绝", async () => {
    const url = await start((req) => {
      if (req.action === "modelFieldNames") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });

    await expect(
      runAddNote(makeClient(url), {
        deckName: "Default",
        modelName: "Missing",
        fields: basicFields,
      }),
    ).rejects.toMatchObject({ name: "JsonError", action: "addNote" });
  });
});

describe("runAddNotes", () => {
  const batchResponder: FakeResponder = (req) => {
    if (req.action === "modelFieldNames") return { result: ["Front", "Back"] };
    if (req.action === "addNote") {
      const note = (req.params?.["note"] ?? {}) as Record<string, unknown>;
      const fields = (note["fields"] ?? {}) as Record<string, string>;
      const front = fields["Front"] ?? "";
      if (front === "dup") return { result: null };
      if (front === "boom") return { error: "some other failure" };
      return { result: 100 };
    }
    throw new Error(`unexpected action ${req.action}`);
  };

  it("部分成功: created/skipped/failed 计数与结果", async () => {
    const url = await start(batchResponder);

    const result = await runAddNotes(makeClient(url), {
      deckName: "Default",
      modelName: "Basic",
      notes: [
        { fields: { Front: "ok1", Back: "" } },
        { fields: { Front: "dup", Back: "" } },
        { fields: { Front: "boom", Back: "" } },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      totalRequested: 3,
      created: 1,
      skipped: 1,
      failed: 1,
    });
    expect(result.results.map((r) => r.status)).toEqual(["created", "skipped", "failed"]);
  });

  it("排序字段为空的笔记整体拒绝(全有全无)", async () => {
    const url = await start(batchResponder);

    try {
      await runAddNotes(makeClient(url), {
        deckName: "Default",
        modelName: "Basic",
        notes: [{ fields: { Front: "", Back: "" } }],
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).action).toBe("addNotes");
      expect((error as JsonError).details).toMatchObject({
        invalidNotes: [{ index: 0, error: expect.stringContaining("Front") as unknown }],
      });
    }
  });
});

describe("runFindNotes", () => {
  it("返回 noteIds", async () => {
    const url = await start((req) => {
      if (req.action === "findNotes") return { result: [1, 2] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runFindNotes(makeClient(url), { query: "deck:X" });

    expect(result).toMatchObject({ success: true, count: 2, noteIds: [1, 2] });
  });

  it("空结果带 hint", async () => {
    const url = await start((req) => {
      if (req.action === "findNotes") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runFindNotes(makeClient(url), { query: "deck:X" });

    expect(result).toMatchObject({ success: true, count: 0 });
    expect(result.hint).toContain("broader");
  });
});

describe("runNotesInfo", () => {
  it("过滤已删除项并计数", async () => {
    const url = await start((req) => {
      if (req.action === "notesInfo")
        return {
          result: [
            {
              noteId: 1,
              modelName: "Basic",
              tags: [],
              fields: {},
              cards: [10],
              mod: 1,
            },
            null,
          ],
        };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runNotesInfo(makeClient(url), { notes: [1, 999] });

    expect(result).toMatchObject({
      success: true,
      count: 1,
      notFound: 1,
      models: ["Basic"],
    });
    expect(result.hint).toContain("Do not view notes in Anki browser");
  });
});

describe("runUpdateNoteFields", () => {
  const okResponder: FakeResponder = (req) => {
    if (req.action === "notesInfo")
      return {
        result: [{ modelName: "Basic", fields: { Front: {}, Back: {} } }],
      };
    if (req.action === "updateNoteFields") return { result: null };
    throw new Error(`unexpected action ${req.action}`);
  };

  it("成功更新返回 warning(浏览器打开会静默失败)", async () => {
    const url = await start(okResponder);

    const result = await runUpdateNoteFields(makeClient(url), {
      note: { id: 1, fields: { Front: "<b>New</b>" } },
    });

    expect(result).toMatchObject({ success: true, noteId: 1, fieldCount: 1 });
    expect(result.warning).toContain("browser");
  });

  it("无字段拒绝", async () => {
    const url = await start(okResponder);

    await expect(
      runUpdateNoteFields(makeClient(url), { note: { id: 1, fields: {} } }),
    ).rejects.toMatchObject({ name: "JsonError", action: "updateNoteFields" });
  });

  it("无效字段报错并附有效字段清单", async () => {
    const url = await start(okResponder);

    try {
      await runUpdateNoteFields(makeClient(url), {
        note: { id: 1, fields: { Nope: "x" } },
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).details).toMatchObject({
        invalidFields: ["Nope"],
        validFields: ["Front", "Back"],
      });
    }
  });

  it("audio URL 经 SSRF 校验(本地地址被拒)", async () => {
    const url = await start(okResponder);

    await expect(
      runUpdateNoteFields(makeClient(url), {
        note: {
          id: 1,
          fields: { Front: "x" },
          audio: [{ url: "http://localhost:9999/a.mp3", filename: "a.mp3", fields: ["Front"] }],
        },
      }),
    ).rejects.toThrow(/URL blocked/);
  });
});

describe("runDeleteNotes", () => {
  const okResponder: FakeResponder = (req) => {
    if (req.action === "notesInfo")
      return {
        result: [{ noteId: 1, cards: [10, 11] }, { noteId: 2, cards: [] }, null],
      };
    if (req.action === "deleteNotes") return { result: null };
    throw new Error(`unexpected action ${req.action}`);
  };

  it("未确认拒绝(--yes)", async () => {
    const url = await start(okResponder);

    try {
      await runDeleteNotes(makeClient(url), {
        notes: [1],
        confirmDeletion: false,
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).action).toBe("deleteNotes");
      expect((error as JsonError).hint).toContain("--yes");
    }
  });

  it("确认后删除并统计 cardsDeleted 与 notFound", async () => {
    const url = await start(okResponder);

    const result = await runDeleteNotes(makeClient(url), {
      notes: [1, 2, 999],
      confirmDeletion: true,
    });

    expect(result).toMatchObject({
      success: true,
      deletedCount: 2,
      cardsDeleted: 2,
      notFoundCount: 1,
    });
    expect(result.warning).toContain("permanently deleted");
  });
});

describe("CLI 端到端(notes 组)", () => {
  it("notes find 输出 success JSON", async () => {
    const url = await start((req) => {
      if (req.action === "findNotes") return { result: [7] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["notes", "find", "deck:X", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      success: true,
      noteIds: [7],
    });
  });

  it("notes delete 未 --yes: 退出码 1 + 错误 JSON", async () => {
    const url = await start(() => ({ result: null }));
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    await runCli(["notes", "delete", "1", "--anki-connect", url]);

    expect(process.exitCode).toBe(1);
    const blocks = stderr.filter((b) => b.trim().startsWith("{"));
    expect(JSON.parse(blocks.at(-1) ?? "{}")).toMatchObject({
      success: false,
      action: "deleteNotes",
    });
  });
});
