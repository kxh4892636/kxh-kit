import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonError } from "../../../cli/json-error";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runGuiBrowse, runGuiSelectCard, runGuiSelectedNotes } from "../browse-commands";
import { runGuiAddCards, runGuiDeckOverview, runGuiEditNote } from "../dialog-commands";
import { runGuiCurrentCard, runGuiUndo } from "../view-commands";

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

describe("browse 类", () => {
  it("guiBrowse 返回卡片 ID 与 reorderCards 组装", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const url = await start((req) => {
      if (req.action === "guiBrowse") {
        requests.push(req.params ?? {});
        return { result: [1, 2] };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGuiBrowse(makeClient(url), {
      query: "deck:X",
      reorderCards: { order: "descending", columnId: "cardDue" },
    });

    expect(requests[0]).toEqual({
      query: "deck:X",
      reorderCards: { order: "descending", columnId: "cardDue" },
    });
    expect(result).toMatchObject({ success: true, cardCount: 2 });
  });

  it("guiSelectCard 浏览器未打开报错", async () => {
    const url = await start((req) => {
      if (req.action === "guiSelectCard") return { result: false };
      throw new Error(`unexpected action ${req.action}`);
    });

    try {
      await runGuiSelectCard(makeClient(url), 5);
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).action).toBe("guiSelectCard");
      expect((error as JsonError).hint).toContain("gui browse");
    }
  });

  it("guiSelectedNotes 空选择返回空数组", async () => {
    const url = await start((req) => {
      if (req.action === "guiSelectedNotes") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGuiSelectedNotes(makeClient(url));

    expect(result).toMatchObject({ success: true, noteCount: 0 });
  });
});

describe("dialog 类", () => {
  it("guiAddCards 预填并返回潜在 noteId", async () => {
    const url = await start((req) => {
      if (req.action === "guiAddCards") return { result: 42 };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGuiAddCards(makeClient(url), {
      note: { deckName: "D", modelName: "Basic", fields: { Front: "q" } },
    });

    expect(result).toMatchObject({ success: true, noteId: 42 });
  });

  it("guiAddCards 空字段拒绝", async () => {
    const url = await start(() => ({ result: null }));

    try {
      await runGuiAddCards(makeClient(url), {
        note: { deckName: "D", modelName: "Basic", fields: { Front: "" } },
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).details).toMatchObject({
        emptyFields: ["Front"],
      });
    }
  });

  it("guiEditNote 成功", async () => {
    const url = await start((req) => {
      if (req.action === "guiEditNote") return { result: null };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGuiEditNote(makeClient(url), 7);

    expect(result).toMatchObject({ success: true, noteId: 7 });
  });

  it("guiDeckOverview 失败报错", async () => {
    const url = await start((req) => {
      if (req.action === "guiDeckOverview") return { result: false };
      throw new Error(`unexpected action ${req.action}`);
    });

    await expect(runGuiDeckOverview(makeClient(url), "Missing")).rejects.toMatchObject({
      name: "JsonError",
      action: "guiDeckOverview",
    });
  });
});

describe("view/工具类", () => {
  it("guiCurrentCard 不在复习返回 cardInfo=null", async () => {
    const url = await start((req) => {
      if (req.action === "guiCurrentCard") return { result: null };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGuiCurrentCard(makeClient(url));

    expect(result).toMatchObject({ success: true, inReview: false, cardInfo: null });
  });

  it("guiUndo 无可撤销返回 undone=false", async () => {
    const url = await start((req) => {
      if (req.action === "guiUndo") return { result: false };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGuiUndo(makeClient(url));

    expect(result).toMatchObject({ success: true, undone: false });
  });
});

describe("CLI 端到端(gui 组)", () => {
  it("gui selected-notes 输出 success JSON", async () => {
    const url = await start((req) => {
      if (req.action === "guiSelectedNotes") return { result: [9] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["gui", "selected-notes", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      success: true,
      noteIds: [9],
    });
  });
});
